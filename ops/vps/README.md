# VPS scraper source

Code that runs on the standalone scraper VPS (`72.62.200.145`), not on
Supabase and not in the frontend build.

## `ytdlp-server.js`

The Instagram / TikTok / YouTube / Facebook scraper behind Viral Today and
lead prospecting. PM2-managed, listens on `:3099`.

**This file was VPS-only until 2026-07-29.** It lived at `/var/www/ytdlp-server.js`
with no copy in git, so the only way to know what was running was to `scp` it
down — and repo/live drift had already caused a real incident. The copy here is
the live file as of that date, vendored so changes are reviewable and have
history.

### It does not deploy itself

Nothing about committing this file ships it. The live process only changes when
you copy it up:

```bash
scp ops/vps/ytdlp-server.js root@72.62.200.145:/var/www/ytdlp-server.js
ssh root@72.62.200.145 'pm2 restart ytdlp-server'
```

No `sshpass` on the dev machine; drive the password prompt with `expect`. The
password is in `deploy-to-vps.sh`.

### Keep the two in sync

Before editing, `scp` the live copy down and diff it against this one. Another
session — or a hotfix applied directly on the box — may have moved it. Editing a
stale copy and deploying silently reverts whatever landed in between.

After deploying, commit the same bytes you pushed.

### Health

```bash
curl -s http://72.62.200.145:3099/health
```

Returns `{"status":"ok","activeHeavy":N,"maxHeavy":8,...}`. Routes in
`HEAVY_PATHS` count against `maxHeavy`; everything else runs unthrottled.

Instagram routes depend on real account sessions in `/var/www/ig-account-*.json`,
which periodically 2FA-lock and need a manual browser login plus cookie
transplant to recover. A `SESSION_EXPIRED` response means that has happened
again — it is not a bug in the calling code.

## Triaging "Instagram returns 0 posts"

Dead cookies are the usual cause but not the only one. Check egress **before**
touching sessions — on 2026-07-29 a throttled WARP exit IP produced a total
Instagram outage while the cookies were perfectly valid.

`igApiFetch` sends IG traffic through the WARP SOCKS proxy at
`127.0.0.1:1080` and now falls back to the VPS's own IP when WARP answers
with a rate-limit. Two helpers make the distinction visible:

```bash
# Do these cookies authenticate at all, and can they read someone else's media?
ssh root@72.62.200.145 'cd /var/www && node ig-verify.js /var/www/ig-account-1.json'

# WARP vs direct, and which headers matter, for one account
ssh root@72.62.200.145 'cd /var/www && node ig-headermatrix.js /var/www/ig-account-1.json nasa'
```

Three traps worth knowing, all hit during that incident:

- **`require_login: true` also rides along on the rate-limit reply.** Reading it
  alone as "logged out" sends you chasing cookies when the IP is the problem.
  The tell is `"Please wait a few minutes before you try again."` — transient,
  and it must never mark an account stale.
- **`warp-cli disconnect && connect` does not change the exit IP.** It came back
  as the same address. Falling back to the direct IP is the working escape.
- **Authenticating is not the same as being able to read.** Of three freshly
  exported accounts, all three returned their own follower counts while only one
  could read another profile's media. Validate a candidate with a real profile
  read before counting it as rotation capacity.

Headless re-login is not a recovery path: it accepts the emailed code and then
dead-ends at `/auth_platform/recaptcha/`. The session cookie minted at that point
looks valid and returns **empty bodies instead of `login_required`**, so it
silently poisons the rotation pool. Never treat "has a `sessionid`" as logged in
— reject any URL still under `/auth_platform/`.
