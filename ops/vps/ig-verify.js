// Ground-truth check: do the cookies in ig-account-1.json actually authenticate?
const fs = require("fs");
const { execFileSync } = require("child_process");

const FILE = process.argv[2] || "/var/www/ig-account-1.json";
const cookies = JSON.parse(fs.readFileSync(FILE, "utf8"));
console.log("cookie names:", cookies.map((c) => c.name).join(", "));

const jar = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
const sid = cookies.find((c) => c.name === "sessionid");
console.log("has sessionid:", !!sid, sid ? `(len ${sid.value.length})` : "");

function ig(url) {
  return execFileSync("curl", [
    "-s", "--socks5-hostname", "127.0.0.1:1080", "--max-time", "45",
    "-H", `Cookie: ${jar}`,
    "-H", "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "-H", "X-IG-App-ID: 936619743392459",
    url,
  ], { encoding: "utf8", maxBuffer: 20e6 });
}

// 1. Who am I?
const me = ig("https://i.instagram.com/api/v1/accounts/current_user/");
let p;
try { p = JSON.parse(me); } catch { console.log("current_user NON-JSON:", me.slice(0, 200)); }
if (p) {
  if (p.user) console.log("AUTH OK — logged in as:", p.user.username, "(pk", p.user.pk + ")");
  else console.log("AUTH FAIL — status:", p.status, "message:", p.message, JSON.stringify(p).slice(0, 200));
}

// 2. Can it actually read a profile?
const prof = ig("https://i.instagram.com/api/v1/users/web_profile_info/?username=nasa");
try {
  const d = JSON.parse(prof);
  const u = d.data && d.data.user;
  if (u) {
    const edges = (u.edge_owner_to_timeline_media && u.edge_owner_to_timeline_media.edges) || [];
    console.log(`PROFILE OK — nasa followers=${u.edge_followed_by.count} posts_returned=${edges.length}`);
  } else {
    console.log("PROFILE FAIL —", JSON.stringify(d).slice(0, 250));
  }
} catch { console.log("PROFILE NON-JSON:", prof.slice(0, 200)); }
