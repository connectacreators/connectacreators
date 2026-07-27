#!/usr/bin/env node
/**
 * Instagram session refresh — connectabroski + gaunamedia
 * Tests both accounts, refreshes valid sessions, re-logs in if expired.
 */
const fs = require("fs");
const crypto = require("crypto");
const { execSync } = require("child_process");

// cookieFile MUST match ytdlp-server.js's auto-discovery pattern
// (/var/www/ig-account-<digits>.json) — connectabroski previously pointed at
// ig-cookies-2.json, which the scraper's account-rotation pool never reads,
// so a successful refresh silently never reached the live scraper.
const ACCOUNTS = [
  { username: "connectabroski", password: "Rjg290802*", cookieFile: "/var/www/ig-account-1.json" },
  { username: "gaunamedia",     password: "Rjg290802*", cookieFile: "/var/www/ig-account-2.json" },
];
const YTDLP_COOKIE_FILE = "/root/instagram_cookies.txt"; // primary yt-dlp cookie (connectabroski)

const WARP_PROXY = "127.0.0.1:1080";
const USER_AGENT = "Instagram 344.0.0.0.98 Android (33/13; 420dpi; 1080x2340; samsung; SM-G991B; o1s; exynos2100)";
const IG_APP_ID  = "936619743392459";

function loadCookies(file) {
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    // Handle both array format and dict-with-cookies format
    if (Array.isArray(raw)) return raw;
    if (raw && raw.cookies && Array.isArray(raw.cookies)) return raw.cookies;
    return null;
  } catch { return null; }
}

function cookieHeader(cookies) {
  return cookies.map(c => `${c.name}=${c.value}`).join("; ");
}
function getCsrf(cookies) {
  return (cookies.find(c => c.name === "csrftoken") || {}).value || "";
}
function getSessionId(cookies) {
  return (cookies.find(c => c.name === "sessionid") || {}).value || "";
}

function curlIgApi(path, cookies) {
  const csrf = getCsrf(cookies);
  const args = [
    "curl", "-s", "--max-time", "20",
    "--socks5-hostname", WARP_PROXY,
    "-H", `User-Agent: ${USER_AGENT}`,
    "-H", `X-IG-App-ID: ${IG_APP_ID}`,
    "-H", `X-CSRFToken: ${csrf}`,
    "-H", `Cookie: ${cookieHeader(cookies)}`,
  ];
  args.push(`https://i.instagram.com${path}`);
  try {
    const out = execSync(args.map(a => `'${a.replace(/'/g, "'\\''")}'`).join(" "), {
      maxBuffer: 5 * 1024 * 1024, timeout: 25000, encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return JSON.parse(out);
  } catch(e) {
    if (e.stdout) { try { return JSON.parse(e.stdout); } catch {} }
    return null;
  }
}

function writeNetscapeCookies(cookies, file) {
  const lines = ["# Netscape HTTP Cookie File"];
  for (const c of cookies) {
    if (c.domain && c.domain.includes("instagram")) {
      lines.push([c.domain, c.httpOnly ? "TRUE" : "FALSE", c.path || "/",
        c.secure ? "TRUE" : "FALSE", c.expires ? Math.floor(c.expires) : 0,
        c.name, c.value].join("\t"));
    }
  }
  fs.writeFileSync(file, lines.join("\n") + "\n");
}

function extendExpiry(cookies) {
  const now = Date.now() / 1000;
  return cookies.map(c => ({
    ...c,
    expires: c.expires ? Math.max(c.expires, now + 86400 * 30) : now + 86400 * 30,
  }));
}

async function refreshAccount(account) {
  const { username, password, cookieFile } = account;
  console.log(`\n[ig-refresh] === ${username} ===`);

  const cookies = loadCookies(cookieFile);
  if (!cookies || !cookies.length) {
    console.log(`[ig-refresh] ${username}: No cookies — need manual login`);
    return false;
  }

  const sessionId = getSessionId(cookies);
  console.log(`[ig-refresh] ${username}: ${cookies.length} cookies, sessionid: ${sessionId.slice(0, 10)}...`);

  // Test session
  const test = curlIgApi("/api/v1/accounts/current_user/?edit=true", cookies);
  if (test && test.user) {
    console.log(`[ig-refresh] ${username}: Session VALID (${test.user.username})`);
    const refreshed = extendExpiry(cookies);
    fs.writeFileSync(cookieFile, JSON.stringify(refreshed, null, 2));
    if (cookieFile === ACCOUNTS[0].cookieFile) writeNetscapeCookies(refreshed, YTDLP_COOKIE_FILE);
    console.log(`[ig-refresh] ${username}: Cookies extended 30 days`);
    return true;
  }

  const msg = test?.message || "unknown";
  console.log(`[ig-refresh] ${username}: Session failed — ${msg}`);

  if (msg === "challenge_required") {
    console.log(`[ig-refresh] ${username}: CHALLENGE REQUIRED — manual browser login needed`);
    return false;
  }

  // Attempt password re-login
  console.log(`[ig-refresh] ${username}: Attempting API password login...`);
  const uuid = crypto.randomUUID();
  const loginData = `username=${username}&password=${encodeURIComponent(password)}&device_id=${uuid}&login_attempt_count=0`;
  const tmpCookieJar = `/tmp/ig-login-${username}.txt`;

  const loginArgs = [
    "curl", "-s", "--max-time", "25",
    "--socks5-hostname", WARP_PROXY,
    "-X", "POST",
    "-H", `User-Agent: ${USER_AGENT}`,
    "-H", `X-IG-App-ID: ${IG_APP_ID}`,
    "-H", "Content-Type: application/x-www-form-urlencoded",
    "-c", tmpCookieJar,
    "-d", loginData,
    "https://i.instagram.com/api/v1/accounts/login/",
  ];

  try {
    const result = execSync(loginArgs.map(a => `'${a.replace(/'/g, "'\\''")}'`).join(" "), {
      maxBuffer: 5 * 1024 * 1024, timeout: 30000, encoding: "utf8",
    });
    const parsed = JSON.parse(result);

    if (parsed.logged_in_user) {
      console.log(`[ig-refresh] ${username}: Login SUCCESS`);
      const jarText = fs.readFileSync(tmpCookieJar, "utf8");
      const newCookies = [];
      for (const line of jarText.split("\n")) {
        if (line.startsWith("#") || !line.trim()) continue;
        const parts = line.split("\t");
        if (parts.length >= 7) {
          newCookies.push({
            domain: parts[0], httpOnly: parts[1] === "TRUE", path: parts[2],
            secure: parts[3] === "TRUE",
            expires: parseInt(parts[4]) || Date.now() / 1000 + 86400 * 90,
            name: parts[5], value: parts[6],
          });
        }
      }
      if (newCookies.length > 0) {
        fs.writeFileSync(cookieFile, JSON.stringify(newCookies, null, 2));
        if (cookieFile === ACCOUNTS[0].cookieFile) writeNetscapeCookies(newCookies, YTDLP_COOKIE_FILE);
        console.log(`[ig-refresh] ${username}: Saved ${newCookies.length} new cookies`);
        return true;
      }
    } else if (parsed.message === "challenge_required") {
      console.log(`[ig-refresh] ${username}: Login challenge — manual intervention needed`);
    } else {
      console.log(`[ig-refresh] ${username}: Login failed — ${parsed.message || JSON.stringify(parsed).slice(0, 100)}`);
    }
  } catch(e) {
    console.log(`[ig-refresh] ${username}: Login error — ${e.message?.slice(0, 100)}`);
  }
  return false;
}

async function main() {
  let anySuccess = false;
  for (const account of ACCOUNTS) {
    const ok = await refreshAccount(account);
    if (ok) anySuccess = true;
  }
  if (!anySuccess) {
    console.log("\n[ig-refresh] ALL ACCOUNTS FAILED — manual intervention needed");
    process.exit(1);
  }
  console.log("\n[ig-refresh] Done");
}

main().catch(e => { console.error("[ig-refresh] Fatal:", e.message); process.exit(1); });
