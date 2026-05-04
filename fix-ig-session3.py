#!/usr/bin/env python3
import shutil

FILE = "/var/www/ytdlp-server.js"
shutil.copy2(FILE, FILE + ".bak-challenge-fix")

with open(FILE, "r") as f:
    content = f.read()

# Debug: show what's around the target
idx = content.find("Auto-refresh cookies on login_required")
if idx < 0:
    print("ERROR: Target string not found at all!")
    exit(1)

# Show surrounding context
start = max(0, idx - 50)
end = min(len(content), idx + 300)
print("FOUND at char", idx)
print("CONTEXT:")
print(repr(content[start:end]))
print()

# The broken block looks like:
# "      // Auto-refresh cookies on login_required\n        console.warn(..."
# We need to find this exact text and replace it

# Find the block boundaries
block_start = content.rfind("\n", 0, idx) + 1  # start of the comment line
# Find "return null;" after the comment
return_null_idx = content.find("return null;", idx)
if return_null_idx < 0:
    print("ERROR: Could not find 'return null;' after the comment")
    exit(1)
# Find the closing brace after return null
close_brace_idx = content.find("}", return_null_idx)
if close_brace_idx < 0:
    print("ERROR: Could not find closing brace")
    exit(1)
block_end = close_brace_idx + 2  # include } and newline

old_block = content[block_start:block_end]
print("OLD BLOCK:")
print(repr(old_block))
print()

new_block = """      // Auto-detect auth errors (login_required, challenge_required)
      if (parsed.message === "login_required" || parsed.message === "challenge_required" || parsed.require_login) {
        console.warn("[ig] Auth error:", parsed.message, "on", igCookieFile?.split("/").pop());
        if (typeof markIgAccountStale === "function" && igCookieFile) markIgAccountStale(igCookieFile);
        // Auto-refresh cookies
        try {
          const { execSync } = require("child_process");
          console.log("[ig] Auto-refreshing cookies via ig-login-burner.js");
          execSync("cd /var/www && node ig-login-burner.js", { timeout: 60000 });
          console.log("[ig] Cookie refresh completed");
        } catch (refreshErr) {
          console.error("[ig] Cookie refresh failed:", refreshErr.message?.slice(0, 100));
        }
        return null;
      }
"""

content = content[:block_start] + new_block + content[block_end:]

with open(FILE, "w") as f:
    f.write(content)

print("SUCCESS: igApiFetch auth check patched")
