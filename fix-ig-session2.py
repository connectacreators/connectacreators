#!/usr/bin/env python3
"""Fix the broken igApiFetch auth check in ytdlp-server.js"""

FILE = "/var/www/ytdlp-server.js"

with open(FILE, "r") as f:
    lines = f.readlines()

# Find the broken pattern: "// Auto-refresh cookies on login_required" without an if-condition
patched = False
new_lines = []
i = 0
while i < len(lines):
    line = lines[i]
    # Detect the broken block
    if '// Auto-refresh cookies on login_required' in line and not patched:
        # Check next line - if it's console.warn without an if, it's the broken pattern
        if i + 1 < len(lines) and 'console.warn("[ig] login_required' in lines[i + 1]:
            # Replace with fixed version
            indent = '      '
            new_lines.append(indent + '// Auto-detect auth errors (login_required, challenge_required)\n')
            new_lines.append(indent + 'if (parsed.message === "login_required" || parsed.message === "challenge_required" || parsed.require_login) {\n')
            new_lines.append(indent + '  console.warn("[ig] Auth error:", parsed.message, "on", igCookieFile?.split("/").pop());\n')
            new_lines.append(indent + '  if (typeof markIgAccountStale === "function" && igCookieFile) markIgAccountStale(igCookieFile);\n')
            new_lines.append(indent + '  // Auto-refresh cookies\n')
            new_lines.append(indent + '  try {\n')
            new_lines.append(indent + '    const { execSync } = require("child_process");\n')
            new_lines.append(indent + '    console.log("[ig] Auto-refreshing cookies via ig-login-burner.js");\n')
            new_lines.append(indent + '    execSync("cd /var/www && node ig-login-burner.js", { timeout: 60000 });\n')
            new_lines.append(indent + '    console.log("[ig] Cookie refresh completed");\n')
            new_lines.append(indent + '  } catch (refreshErr) {\n')
            new_lines.append(indent + '    console.error("[ig] Cookie refresh failed:", refreshErr.message?.slice(0, 100));\n')
            new_lines.append(indent + '  }\n')
            new_lines.append(indent + '  return null;\n')
            new_lines.append(indent + '}\n')
            # Skip old broken lines (comment + warn + markStale + return null + closing brace)
            i += 1  # skip comment line (already replaced)
            while i < len(lines):
                if 'return null;' in lines[i]:
                    i += 1  # skip return null
                    # skip the closing brace
                    if i < len(lines) and lines[i].strip() == '}':
                        i += 1
                    break
                i += 1
            patched = True
            continue
    new_lines.append(line)
    i += 1

if patched:
    with open(FILE, "w") as f:
        f.writelines(new_lines)
    print("Fix 1: Successfully patched igApiFetch auth check")
else:
    print("Fix 1: SKIPPED — pattern not found")
