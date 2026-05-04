#!/bin/bash
# Fix 1: Replace the broken igApiFetch auth check (lines 44-48)
# The old code was missing the if-condition entirely
sed -i '/\/\/ Auto-refresh cookies on login_required/{
N;N;N;N
c\      // Auto-detect auth errors (login_required, challenge_required)\
      if (parsed.message === "login_required" || parsed.message === "challenge_required" || parsed.require_login) {\
        console.warn("[ig] Auth error:", parsed.message, "on", igCookieFile?.split("/").pop());\
        if (typeof markIgAccountStale === "function" && igCookieFile) markIgAccountStale(igCookieFile);\
        // Try auto-refresh cookies\
        try {\
          const { execSync } = require("child_process");\
          const loginScript = igCookieFile.includes("burner") || igCookieFile.includes("cookies-2") ? "ig-login-burner.js" : "ig-login.js";\
          console.log("[ig] Auto-refreshing cookies via", loginScript);\
          execSync("cd /var/www && node " + loginScript, { timeout: 60000 });\
          console.log("[ig] Cookie refresh completed");\
        } catch (refreshErr) {\
          console.error("[ig] Cookie refresh failed:", refreshErr.message?.slice(0, 100));\
        }\
        return null;\
      }
}' /var/www/ytdlp-server.js

# Fix 2: In scrape-reels-search, also handle challenge_required (not just login_required)
sed -i 's/if (msg === "login_required") {/if (msg === "login_required" || msg === "challenge_required") {/g' /var/www/ytdlp-server.js

# Fix 3: Also run ig-login-burner.js for the second account when refreshing in search endpoint
sed -i '/execSync("cd \/var\/www && node ig-login.js", { timeout: 60000 });/a\              execSync("cd /var/www && node ig-login-burner.js", { timeout: 60000 }).toString();' /var/www/ytdlp-server.js

# Fix 4: In markIgAccountStale, reduce stale timeout from 30 min to 5 min (so retry happens faster)
sed -i 's/}, 30 \* 60 \* 1000);/}, 5 * 60 * 1000);/' /var/www/ytdlp-server.js

echo "All patches applied successfully"
