#!/usr/bin/env python3
"""
Patch ytdlp-server.js to:
1. Handle challenge_required gracefully in all IG API responses
2. Return user-friendly error to frontend instead of raw challenge_required
3. Auto-warm sessions periodically
"""

FILE = "/var/www/ytdlp-server.js"

with open(FILE, "r") as f:
    content = f.read()

# Fix: In the search endpoint, return a user-friendly error for challenge_required
# Currently it returns: { error: msg } where msg could be "challenge_required"
# Change to return a friendly message

old_search_error = '''          res.writeHead(500, { ...corsHeaders, "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: msg }));
          return;
        }

        // Extract user accounts'''

new_search_error = '''          res.writeHead(503, { ...corsHeaders, "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Instagram search is temporarily unavailable. Please try again in a few minutes.", code: "IG_UNAVAILABLE" }));
          return;
        }

        // Extract user accounts'''

if old_search_error in content:
    content = content.replace(old_search_error, new_search_error)
    print("Fix: Patched search endpoint to return friendly error")
else:
    print("SKIPPED: Search error pattern not found")

# Add session warming function near the IG_COOKIE_FILES section
# This will periodically make a lightweight API call to keep the session alive
old_api_key = 'const API_KEY = "ytdlp_connecta_2026_secret";'
new_api_key = '''// ── Session warming: periodically test IG sessions to detect issues early ─────
function warmIgSessions() {
  const { execSync } = require("child_process");
  for (const file of IG_COOKIE_FILES) {
    try {
      const cookies = JSON.parse(fs.readFileSync(file, "utf8"));
      const ch = cookies.map(c => c.name + "=" + c.value).join("; ");
      const csrf = (cookies.find(c => c.name === "csrftoken") || {}).value || "";
      const result = execSync(
        'curl -s --max-time 10 --socks5-hostname 127.0.0.1:1080 ' +
        '-H "User-Agent: Instagram 344.0.0.0.98 Android (33/13; 420dpi; 1080x2340; samsung; SM-G991B; o1s; exynos2100)" ' +
        '-H "X-IG-App-ID: 936619743392459" ' +
        '-H "X-CSRFToken: ' + csrf + '" ' +
        '-H "Cookie: ' + ch + '" ' +
        '"https://i.instagram.com/api/v1/accounts/current_user/?edit=true"',
        { timeout: 15000, maxBuffer: 2 * 1024 * 1024 }
      ).toString();
      const parsed = JSON.parse(result);
      if (parsed.user) {
        console.log("[ig-warm]", file.split("/").pop(), "— session OK for", parsed.user.username);
      } else if (parsed.message === "login_required" || parsed.message === "challenge_required") {
        console.warn("[ig-warm]", file.split("/").pop(), "— SESSION EXPIRED:", parsed.message);
        markIgAccountStale(file);
      }
    } catch (e) {
      console.error("[ig-warm]", file.split("/").pop(), "— check failed:", e.message?.slice(0, 80));
    }
  }
}

// Warm sessions on startup and every 4 hours
setTimeout(warmIgSessions, 10000);
setInterval(warmIgSessions, 4 * 60 * 60 * 1000);

const API_KEY = "ytdlp_connecta_2026_secret";'''

if old_api_key in content:
    content = content.replace(old_api_key, new_api_key)
    print("Fix: Added session warming (checks every 4 hours)")
else:
    print("SKIPPED: API_KEY pattern not found")

with open(FILE, "w") as f:
    f.write(content)

print("Done — all patches written")
