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
