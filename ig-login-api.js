#!/usr/bin/env node
/**
 * Instagram session refresh via mobile API (no browser needed)
 * Uses existing session cookies to refresh them before they expire.
 * Falls back to username/password login if session is dead.
 */
const https = require("https");
const http = require("http");
const fs = require("fs");
const crypto = require("crypto");

// Both cookie files — refresh whichever has valid cookies
const COOKIE_FILES = ["/var/www/ig-cookies-2.json", "/var/www/ig-session-cookies.json"];
const COOKIE_FILE = COOKIE_FILES[0]; // primary
const YTDLP_COOKIE_FILE = "/root/instagram_cookies.txt";

// Accounts to try for re-login
const ACCOUNTS = [
  { username: "connectabroski", password: "Rjg290802*", cookieFile: "/var/www/ig-cookies-2.json" },
  { username: "gaunamedia",     password: "Rjg290802*", cookieFile: "/var/www/ig-account-2.json" },
];
const USERNAME = ACCOUNTS[0].username;
const PASSWORD = ACCOUNTS[0].password;
const WARP_PROXY = { host: "127.0.0.1", port: 1080 }; // SOCKS5

const USER_AGENT = "Instagram 344.0.0.0.98 Android (33/13; 420dpi; 1080x2340; samsung; SM-G991B; o1s; exynos2100)";
const IG_APP_ID = "936619743392459";
const IG_SIG_KEY = "68a04945f05a65d83f9a4cc1b1c4e0f1e3f06e4f8b1d4d5e3c6b9a7d2f0e1c8";

function loadCookies() {
  try {
    const cookies = JSON.parse(fs.readFileSync(COOKIE_FILE, "utf8"));
    return cookies;
  } catch {
    return null;
  }
}

function cookieHeader(cookies) {
  if (!cookies) return "";
  return cookies.map(c => c.name + "=" + c.value).join("; ");
}

function getCsrf(cookies) {
  if (!cookies) return "";
  return (cookies.find(c => c.name === "csrftoken") || {}).value || "";
}

function getSessionId(cookies) {
  if (!cookies) return "";
  return (cookies.find(c => c.name === "sessionid") || {}).value || "";
}

// Make HTTPS request through SOCKS5 proxy
function igRequest(options, postData) {
  return new Promise((resolve, reject) => {
    const { SocksProxyAgent } = (() => {
      try { return require("socks-proxy-agent"); } catch { return {}; }
    })();

    const reqOptions = {
      hostname: "i.instagram.com",
      port: 443,
      path: options.path,
      method: options.method || "GET",
      headers: {
        "User-Agent": USER_AGENT,
        "X-IG-App-ID": IG_APP_ID,
        ...options.headers,
      },
    };

    // Try with socks-proxy-agent if available, otherwise use curl
    if (SocksProxyAgent) {
      reqOptions.agent = new SocksProxyAgent(`socks5h://${WARP_PROXY.host}:${WARP_PROXY.port}`);
      const req = https.request(reqOptions, (res) => {
        let data = "";
        res.on("data", d => data += d);
        res.on("end", () => {
          try { resolve({ status: res.statusCode, data: JSON.parse(data), headers: res.headers }); }
          catch { resolve({ status: res.statusCode, data, headers: res.headers }); }
        });
      });
      req.on("error", reject);
      if (postData) req.write(postData);
      req.end();
    } else {
      // Fallback: use curl with SOCKS5
      const { execSync } = require("child_process");
      const args = [
        "curl", "-s", "--max-time", "20",
        "--socks5-hostname", `${WARP_PROXY.host}:${WARP_PROXY.port}`,
        "-H", `User-Agent: ${USER_AGENT}`,
        "-H", `X-IG-App-ID: ${IG_APP_ID}`,
      ];
      if (options.headers) {
        for (const [k, v] of Object.entries(options.headers)) {
          args.push("-H", `${k}: ${v}`);
        }
      }
      if (options.method === "POST") {
        args.push("-X", "POST");
        if (postData) args.push("-d", postData);
      }
      args.push(`https://i.instagram.com${options.path}`);

      try {
        const result = execSync(args.join(" "), { maxBuffer: 5 * 1024 * 1024, timeout: 25000 });
        const parsed = JSON.parse(result.toString());
        resolve({ status: 200, data: parsed });
      } catch (e) {
        reject(e);
      }
    }
  });
}

// Use curl directly (more reliable for SOCKS5)
function curlIgApi(path, method, cookies, postData) {
  const { execSync } = require("child_process");
  const csrf = getCsrf(cookies);
  const args = [
    "-s", "--max-time", "20",
    "--socks5-hostname", `${WARP_PROXY.host}:${WARP_PROXY.port}`,
    "-H", `User-Agent: ${USER_AGENT}`,
    "-H", `X-IG-App-ID: ${IG_APP_ID}`,
    "-H", `X-CSRFToken: ${csrf}`,
    "-H", `Cookie: ${cookieHeader(cookies)}`,
    "-D", "/dev/stderr",  // dump response headers to stderr
  ];
  if (method === "POST") {
    args.push("-X", "POST");
    args.push("-H", "Content-Type: application/x-www-form-urlencoded");
    if (postData) args.push("-d", postData);
  }
  args.push(`https://i.instagram.com${path}`);

  try {
    const result = execSync(args.map(a => `'${a.replace(/'/g, "'\\''")}'`).join(" "), {
      maxBuffer: 5 * 1024 * 1024, timeout: 25000, encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"]
    });
    return JSON.parse(result);
  } catch (e) {
    // Try to parse the stdout even if exit code is non-zero
    if (e.stdout) {
      try { return JSON.parse(e.stdout); } catch {}
    }
    return null;
  }
}

function saveCookiesFromResponse(existingCookies, responseHeaders) {
  // Parse Set-Cookie headers and merge with existing
  // This is a simplified version
  return existingCookies;
}

function writeNetscapeCookies(cookies) {
  const lines = ["# Netscape HTTP Cookie File"];
  for (const c of cookies) {
    if (c.domain && c.domain.includes("instagram")) {
      const secure = c.secure ? "TRUE" : "FALSE";
      const httpOnly = c.httpOnly ? "TRUE" : "FALSE";
      const expiry = c.expires ? Math.floor(c.expires) : 0;
      lines.push([c.domain, httpOnly, c.path || "/", secure, expiry, c.name, c.value].join("\t"));
    }
  }
  fs.writeFileSync(YTDLP_COOKIE_FILE, lines.join("\n") + "\n");
}

async function main() {
  console.log("[ig-refresh] Starting session refresh for", USERNAME);

  const cookies = loadCookies();
  if (!cookies || !cookies.length) {
    console.log("[ig-refresh] No existing cookies found — need manual login first");
    process.exit(1);
  }

  const sessionId = getSessionId(cookies);
  if (!sessionId) {
    console.log("[ig-refresh] No sessionid in cookies — need manual login");
    process.exit(1);
  }

  console.log("[ig-refresh] Found", cookies.length, "cookies, sessionid:", sessionId.slice(0, 8) + "...");

  // Step 1: Try a simple API call to test if session is still valid
  console.log("[ig-refresh] Testing session validity...");
  const testResult = curlIgApi("/api/v1/accounts/current_user/?edit=true", "GET", cookies);

  if (testResult && testResult.user) {
    console.log("[ig-refresh] Session is VALID for user:", testResult.user.username);
    console.log("[ig-refresh] Full name:", testResult.user.full_name);

    // Session is alive — touch the cookie file to update mtime
    const now = Date.now() / 1000;
    // Update cookie expiry times to extend them
    const refreshedCookies = cookies.map(c => ({
      ...c,
      expires: c.expires ? Math.max(c.expires, now + 86400 * 30) : now + 86400 * 30,
    }));

    fs.writeFileSync(COOKIE_FILE, JSON.stringify(refreshedCookies, null, 2));
    writeNetscapeCookies(refreshedCookies);
    console.log("[ig-refresh] Cookies refreshed (extended expiry by 30 days)");
    console.log("[ig-refresh] SUCCESS");
    return;
  }

  const msg = testResult?.message || "unknown";
  console.log("[ig-refresh] Session test failed:", msg);

  if (msg === "challenge_required" || msg === "login_required") {
    console.log("[ig-refresh] Session expired — attempting password login via API...");

    // Step 2: Try login via Instagram mobile API
    const { execSync } = require("child_process");
    const uuid = crypto.randomUUID();
    const loginData = `username=${USERNAME}&password=${encodeURIComponent(PASSWORD)}&device_id=${uuid}&login_attempt_count=0`;

    const args = [
      "curl", "-s", "--max-time", "25",
      "--socks5-hostname", `${WARP_PROXY.host}:${WARP_PROXY.port}`,
      "-X", "POST",
      "-H", `User-Agent: ${USER_AGENT}`,
      "-H", `X-IG-App-ID: ${IG_APP_ID}`,
      "-H", "Content-Type: application/x-www-form-urlencoded",
      "-c", "/tmp/ig-login-cookies.txt",  // save cookies from response
      "-d", loginData,
      "https://i.instagram.com/api/v1/accounts/login/",
    ];

    try {
      const result = execSync(args.map(a => `'${a.replace(/'/g, "'\\''")}'`).join(" "), {
        maxBuffer: 5 * 1024 * 1024, timeout: 30000, encoding: "utf8"
      });
      const parsed = JSON.parse(result);

      if (parsed.logged_in_user) {
        console.log("[ig-refresh] API login SUCCESS for:", parsed.logged_in_user.username);

        // Read new cookies from curl cookie jar
        const cookieJar = fs.readFileSync("/tmp/ig-login-cookies.txt", "utf8");
        const newCookies = [];
        for (const line of cookieJar.split("\n")) {
          if (line.startsWith("#") || !line.trim()) continue;
          const parts = line.split("\t");
          if (parts.length >= 7) {
            newCookies.push({
              domain: parts[0],
              httpOnly: parts[1] === "TRUE",
              path: parts[2],
              secure: parts[3] === "TRUE",
              expires: parseInt(parts[4]) || Date.now() / 1000 + 86400 * 90,
              name: parts[5],
              value: parts[6],
            });
          }
        }

        if (newCookies.length > 0) {
          fs.writeFileSync(COOKIE_FILE, JSON.stringify(newCookies, null, 2));
          writeNetscapeCookies(newCookies);
          console.log("[ig-refresh] Saved", newCookies.length, "new cookies");
          console.log("[ig-refresh] SUCCESS");
        } else {
          console.log("[ig-refresh] WARNING: Login succeeded but no cookies captured");
        }
      } else if (parsed.message === "challenge_required") {
        console.log("[ig-refresh] CHALLENGE REQUIRED — Instagram wants verification");
        console.log("[ig-refresh] Challenge URL:", parsed.challenge?.url || "unknown");
        console.log("[ig-refresh] MANUAL ACTION NEEDED: Log into Instagram from a browser and verify");
        process.exit(1);
      } else {
        console.log("[ig-refresh] Login failed:", parsed.message || JSON.stringify(parsed).slice(0, 200));
        process.exit(1);
      }
    } catch (e) {
      console.log("[ig-refresh] API login error:", e.message?.slice(0, 200));
      process.exit(1);
    }
  } else {
    console.log("[ig-refresh] Unexpected error:", msg);
    process.exit(1);
  }
}

main().catch(e => { console.error("[ig-refresh] Fatal:", e.message); process.exit(1); });
