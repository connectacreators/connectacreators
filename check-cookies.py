#!/usr/bin/env python3
import json

for f in ["/var/www/ig-cookies-2.json", "/var/www/ig-session-cookies.json"]:
    try:
        cookies = json.load(open(f))
        ds = next((c["value"] for c in cookies if c["name"] == "ds_user_id"), "N/A")
        sid = next((c["value"][:20] for c in cookies if c["name"] == "sessionid"), "N/A")
        exp = next((c.get("expires", "N/A") for c in cookies if c["name"] == "sessionid"), "N/A")
        print(f"{f}: ds_user_id={ds}, sessionid={sid}..., expires={exp}, total={len(cookies)} cookies")
    except Exception as e:
        print(f"{f}: ERROR - {e}")
