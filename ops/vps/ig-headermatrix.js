// Which header set makes the Chrome-minted cookies work from the VPS/WARP IP?
// Tests the current production UA vs. a UA matching the browser that minted them.
const fs = require("fs");
const { execFileSync } = require("child_process");

const ANDROID_UA = "Instagram 344.0.0.0.98 Android (33/13; 420dpi; 1080x2340; samsung; SM-G991B; o1s; exynos2100)";
const CHROME_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const TARGET = process.argv[3] || "nasa";
const file = process.argv[2] || "/var/www/ig-account-1.json";

const cookies = JSON.parse(fs.readFileSync(file, "utf8"));
const jar = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
const csrf = (cookies.find((c) => c.name === "csrftoken") || {}).value || "";

function probe(label, ua, extra) {
  const args = ["-s", "--max-time", "30", "--socks5-hostname", "127.0.0.1:1080",
    "-H", `User-Agent: ${ua}`, "-H", "X-IG-App-ID: 936619743392459",
    "-H", `X-CSRFToken: ${csrf}`, "-H", `Cookie: ${jar}`];
  for (const [k, v] of Object.entries(extra || {})) args.push("-H", `${k}: ${v}`);
  args.push(`https://www.instagram.com/api/v1/users/web_profile_info/?username=${TARGET}`);
  let out;
  try { out = execFileSync("curl", args, { maxBuffer: 20e6, timeout: 35000 }).toString(); }
  catch (e) { console.log(`${label}: curl error ${e.message.slice(0, 80)}`); return; }
  let d;
  try { d = JSON.parse(out); } catch { console.log(`${label}: non-JSON (${out.length}b) ${out.slice(0, 90)}`); return; }
  const u = d.data && d.data.user;
  if (u) {
    const n = ((u.edge_owner_to_timeline_media || {}).edges || []).length;
    console.log(`${label}: OK followers=${u.edge_followed_by.count} posts=${n}`);
  } else {
    console.log(`${label}: FAIL ${JSON.stringify(d).slice(0, 130)}`);
  }
}

console.log("cookie file:", file, "| target:", TARGET);
probe("android-ua (current prod)      ", ANDROID_UA, {});
probe("chrome-ua (matches export)     ", CHROME_UA, {});
probe("chrome-ua + Referer            ", CHROME_UA, { Referer: "https://www.instagram.com/" });
probe("chrome-ua + Referer + XRW      ", CHROME_UA, { Referer: "https://www.instagram.com/", "X-Requested-With": "XMLHttpRequest" });
