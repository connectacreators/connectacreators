# Render worker — VPS setup

This service polls Supabase for queued render jobs and runs FFmpeg.

## One-time setup on the VPS (root@72.62.200.145)

1. Install Node 20 if missing:
   ```
   curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
   apt-get install -y nodejs
   ```
2. Clone the repo into a sibling dir of the existing site:
   ```
   git clone <repo-url> /var/www/connectacreators-render-worker
   cd /var/www/connectacreators-render-worker
   git checkout main  # or whatever branch ships this
   ```
3. Install + build:
   ```
   cd render-worker
   npm ci --omit=dev
   npx tsc -p tsconfig.json
   ```
4. Write the env file at `/etc/connecta-render-worker.env`:
   ```
   SUPABASE_URL=https://<project>.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=<service role key>
   SUPABASE_STORAGE_BUCKET=footage
   SUPABASE_OUTPUT_BUCKET=footage
   POLL_INTERVAL_MS=4000
   WORK_DIR=/tmp/connecta-renders
   ```
   `chmod 600 /etc/connecta-render-worker.env` and `chown root:root`.
5. Install the systemd unit:
   ```
   cp /var/www/connectacreators-render-worker/render-worker/systemd/connecta-render-worker.service /etc/systemd/system/
   systemctl daemon-reload
   systemctl enable connecta-render-worker
   systemctl start connecta-render-worker
   ```
6. Verify it's running and ingesting:
   ```
   systemctl status connecta-render-worker
   journalctl -u connecta-render-worker -f
   ```

## Updates

After the first install, run `./deploy-render-worker.sh` from your laptop.

## Storage bucket

Confirm a Supabase Storage bucket named `footage` exists (it does — the existing app uses it for footage uploads). If you use a different name, update `SUPABASE_STORAGE_BUCKET` and `SUPABASE_OUTPUT_BUCKET` in `/etc/connecta-render-worker.env`.

Outputs land at `renders/<editor_project_id>/<job_id>.mp4` inside the bucket.
