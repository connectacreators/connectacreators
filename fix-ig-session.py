#!/usr/bin/env python3
"""Patch ytdlp-server.js to handle challenge_required + auto-refresh cookies"""
import re, shutil

FILE = "/var/www/ytdlp-server.js"

# Backup
shutil.copy2(FILE, FILE + ".bak-challenge-fix")

with open(FILE, "r") as f:
    code = f.read()

# ── Fix 1: igApiFetch broken conditional ──
# Replace the broken auth check that's missing its if-condition
old_auth = '''      // Auto-refresh cookies on login_required
        console.warn("[ig] login_required on", igCookieFile?.split("/").pop());
        if (typeof markIgAccountStale === "function" && igCookieFile) markIgAccountStale(igCookieFile);
        return null;
      }'''

new_auth = '''      // Auto-detect auth errors (login_required, challenge_required)
      if (parsed.message === "login_required" || parsed.message === "challenge_required" || parsed.require_login) {
        console.warn("[ig] Auth error:", parsed.message, "on", igCookieFile?.split("/").pop());
        if (typeof markIgAccountStale === "function" && igCookieFile) markIgAccountStale(igCookieFile);
        // Auto-refresh cookies in background
        try {
          const { execSync } = require("child_process");
          console.log("[ig] Auto-refreshing cookies via ig-login-burner.js");
          execSync("cd /var/www && node ig-login-burner.js", { timeout: 60000 });
          console.log("[ig] Cookie refresh completed");
        } catch (refreshErr) {
          console.error("[ig] Cookie refresh failed:", refreshErr.message?.slice(0, 100));
        }
        return null;
      }'''

if old_auth in code:
    code = code.replace(old_auth, new_auth)
    print("Fix 1: Patched igApiFetch auth check")
else:
    print("Fix 1: SKIPPED — pattern not found (may already be patched)")

# ── Fix 2: scrape-reels-search handle challenge_required ──
old_search = 'if (msg === "login_required") {'
new_search = 'if (msg === "login_required" || msg === "challenge_required") {'
count = code.count(old_search)
if count > 0:
    code = code.replace(old_search, new_search)
    print(f"Fix 2: Patched {count} occurrence(s) of login_required check to include challenge_required")
else:
    print("Fix 2: SKIPPED — already patched or not found")

# ── Fix 3: Also refresh both accounts in search endpoint ──
old_refresh = '''              execSync("cd /var/www && node ig-login.js", { timeout: 60000 });'''
new_refresh = '''              execSync("cd /var/www && node ig-login-burner.js", { timeout: 60000 });
              console.log("[reels-search] Cookie refresh completed");'''
if old_refresh in code:
    code = code.replace(old_refresh, new_refresh)
    print("Fix 3: Updated search endpoint to use ig-login-burner.js (connectabroski)")
else:
    print("Fix 3: SKIPPED — already patched")

# ── Fix 4: Reduce stale timeout from 30 min to 5 min ──
old_stale = '}, 30 * 60 * 1000);'
new_stale = '}, 5 * 60 * 1000);'
if old_stale in code:
    code = code.replace(old_stale, new_stale)
    print("Fix 4: Reduced stale timeout from 30 min to 5 min")
else:
    print("Fix 4: SKIPPED — already patched")

with open(FILE, "w") as f:
    f.write(code)

print("Done — all patches written to", FILE)
