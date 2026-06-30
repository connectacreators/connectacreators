import { supabase } from '@/integrations/supabase/client';
import * as tus from 'tus-js-client';
import { videoService, type UpdateVideoInput } from './videoService';

const BUCKET = 'footage';
const FIVE_GB = 5 * 1024 * 1024 * 1024;
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
const ONE_EIGHTY_DAYS_MS = 180 * 24 * 60 * 60 * 1000;
const PROJECT_ID = 'hxojqrilwhhrvloiwmfo';
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

function sanitizeFilename(filename: string): string {
  const lastDot = filename.lastIndexOf('.');
  const ext = lastDot > 0 ? filename.slice(lastDot) : '';
  const name = lastDot > 0 ? filename.slice(0, lastDot) : filename;
  const sanitized = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
  return (sanitized || 'video') + ext.toLowerCase();
}

function buildStoragePath(clientId: string, videoEditId: string, filename: string, subfolder?: string): string {
  const base = subfolder ? `${clientId}/${videoEditId}/${subfolder}/` : `${clientId}/${videoEditId}/`;
  return `${base}${sanitizeFilename(filename)}`;
}

function buildExpiryDates() {
  const now = new Date();
  return {
    file_expires_at: new Date(now.getTime() + NINETY_DAYS_MS).toISOString(),
    record_expires_at: new Date(now.getTime() + ONE_EIGHTY_DAYS_MS).toISOString(),
  };
}

async function standardUpload(
  file: File,
  storagePath: string,
  onProgress: (percent: number) => void,
  onAbortReady?: (abort: () => void) => void
): Promise<string> {
  // Use TUS for all sizes so progress is reported in real-time via chunks
  return tusUpload(file, storagePath, onProgress, Math.min(5 * 1024 * 1024, file.size), onAbortReady);
}

// Storage rejects an upload whose Authorization is `Bearer undefined`/garbage
// with the cryptic 400 "Invalid Compact JWS". The previous guard only checked
// that `session.access_token` was *truthy* — but in a multi-tab session the
// in-memory client can hand back a present-but-malformed token while the
// persisted session in localStorage is still perfectly valid (a direct REST
// upload with that stored token returns 201). So only accept a token that is
// actually a well-formed, unexpired JWT; otherwise force a refresh, and as a
// last resort read the persisted session straight from storage. This is what
// stops `Bearer undefined`/garbage from ever reaching Storage.
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const part = token.split('.')[1];
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

function isUsableJwt(token: string | null | undefined): token is string {
  if (!token || typeof token !== 'string' || token.split('.').length !== 3) return false;
  const payload = decodeJwtPayload(token);
  if (!payload) return false;
  const exp = payload.exp;
  // Reject already-expired tokens (10s skew); a real, current JWT passes.
  if (typeof exp === 'number' && exp * 1000 <= Date.now() + 10_000) return false;
  return true;
}

// The persisted session supabase-js writes to localStorage (`sb-<ref>-auth-token`).
// Reading it directly recovers a valid token even when the in-memory client has
// drifted across tabs — the exact case that produced the "Invalid Compact JWS".
function readStoredAccessToken(): string | null {
  try {
    for (const key of Object.keys(localStorage)) {
      if (!key.startsWith('sb-') || !key.endsWith('-auth-token')) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      const token = parsed?.access_token ?? parsed?.currentSession?.access_token;
      if (isUsableJwt(token)) return token;
    }
  } catch {
    // Storage unavailable / unparseable — fall through.
  }
  return null;
}

async function getValidAccessToken(): Promise<string> {
  // 1) In-memory session, but only if it's a real, unexpired JWT.
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (isUsableJwt(session?.access_token)) return session!.access_token;
  } catch {
    // ignore and try a refresh
  }
  // 2) Force a network refresh.
  try {
    const { data, error } = await supabase.auth.refreshSession();
    if (!error && isUsableJwt(data.session?.access_token)) return data.session!.access_token;
  } catch {
    // ignore and try storage
  }
  // 3) Last resort: the persisted session is frequently valid when the
  //    in-memory one has gone bad. Same source a direct REST upload uses.
  const stored = readStoredAccessToken();
  if (stored) return stored;
  throw new Error(
    'Your login session expired and could not be refreshed. Sign out and back in, then retry the upload.'
  );
}

// Detects Storage auth rejections so we can self-heal with a refresh + retry.
function isAuthError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  return /Invalid Compact JWS|AccessDenied|Unauthorized|response code: 40[0-3]/i.test(msg);
}

async function tusUpload(
  file: File,
  storagePath: string,
  onProgress: (percent: number) => void,
  chunkSize = 6 * 1024 * 1024,
  onAbortReady?: (abort: () => void) => void,
  attempt = 0
): Promise<string> {
  const accessToken = await getValidAccessToken();

  return new Promise((resolve, reject) => {
    const upload = new tus.Upload(file, {
      endpoint: `https://${PROJECT_ID}.supabase.co/storage/v1/upload/resumable`,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      headers: {
        // IMPORTANT: do NOT set `authorization` here. tus-js-client writes
        // static `headers` onto the request via XHR setRequestHeader, then
        // calls onBeforeRequest which setRequestHeaders AGAIN. Per the XHR
        // spec a repeated header is *appended* ("Bearer a, Bearer b"), and
        // Supabase Storage rejects that combined value as a 400
        // "Invalid Compact JWS". So the bearer is set exactly once, in
        // onBeforeRequest below. (This regressed the day onBeforeRequest was
        // introduced; the token itself was never the problem.)
        apikey: SUPABASE_PUBLISHABLE_KEY,
        'x-upsert': 'true',
      },
      // Set the bearer exactly once per request. Re-fetch a *validated* token
      // each time so large 4K uploads survive the JWT outliving its lifetime;
      // fall back to the validated start-of-upload token if a mid-upload
      // refresh fails — never blank, never duplicated.
      onBeforeRequest: async (req) => {
        let token = accessToken;
        try {
          token = await getValidAccessToken();
        } catch {
          // keep the validated start-of-upload token
        }
        req.setHeader('authorization', `Bearer ${token}`);
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      metadata: {
        bucketName: BUCKET,
        objectName: storagePath,
        contentType: file.type,
        cacheControl: '3600',
      },
      chunkSize,
      onError: async (err) => {
        // Self-heal a stale/garbage token: force a refresh and retry once from
        // scratch with a freshly-validated token before surfacing the error.
        if (attempt === 0 && isAuthError(err)) {
          try {
            await supabase.auth.refreshSession();
          } catch {
            // ignore — the retry's getValidAccessToken falls back to storage
          }
          try {
            resolve(await tusUpload(file, storagePath, onProgress, chunkSize, onAbortReady, attempt + 1));
          } catch (retryErr) {
            reject(retryErr as Error);
          }
          return;
        }
        reject(err);
      },
      onProgress: (bytesUploaded, bytesTotal) => {
        const pct = Math.round((bytesUploaded / bytesTotal) * 100);
        onProgress(pct);
      },
      onSuccess: () => resolve(storagePath),
    });

    // Check for previous uploads to resume
    upload.findPreviousUploads().then((previousUploads) => {
      if (previousUploads.length > 0) {
        upload.resumeFromPreviousUpload(previousUploads[0]);
      }
      upload.start();
      onAbortReady?.(() => upload.abort(true));
    });
  });
}

export const videoUploadService = {
  async uploadVideoFile(
    file: File,
    clientId: string,
    videoEditId: string,
    onProgress: (percent: number) => void,
    subfolder?: string,
    onAbortReady?: (abort: () => void) => void
  ): Promise<{ storagePath: string; storageUrl: string }> {
    const storagePath = buildStoragePath(clientId, videoEditId, file.name, subfolder);

    // Route by file size
    if (file.size <= FIVE_GB) {
      await standardUpload(file, storagePath, onProgress, onAbortReady);
    } else {
      await tusUpload(file, storagePath, onProgress, 6 * 1024 * 1024, onAbortReady);
    }

    if (subfolder) {
      // Submission upload: only write file_submission — never overwrite main footage metadata
      await videoService.updateVideo(videoEditId, {
        file_submission: storagePath,
      });
      return { storagePath, storageUrl: '' };
    }

    // Main footage upload: get signed URL and update all metadata fields
    const storageUrl = await this.getSignedVideoUrl(storagePath);
    const expiry = buildExpiryDates();
    await videoService.updateVideo(videoEditId, {
      storage_path: storagePath,
      storage_url: storageUrl,
      upload_source: 'supabase',
      file_size_bytes: file.size,
      file_expires_at: expiry.file_expires_at,
      record_expires_at: expiry.record_expires_at,
    });

    return { storagePath, storageUrl };
  },

  // Signs the ORIGINAL full-resolution file in the `footage` bucket.
  // Use this for downloads — the user always gets the high-quality original.
  async getSignedVideoUrl(storagePath: string): Promise<string> {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(storagePath, 3600); // 1 hour

    if (error) throw error;
    return data.signedUrl;
  },

  // Signed URL that forces a browser download (Content-Disposition: attachment)
  // so the file streams straight to disk. Use this for the Download button —
  // never fetch()+blob() the original, which buffers the WHOLE file in memory
  // and OOMs on large footage (600MB+ originals are common).
  async getDownloadVideoUrl(storagePath: string, filename?: string): Promise<string> {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(storagePath, 3600, { download: filename || true });

    if (error) throw error;
    return data.signedUrl;
  },

  // Proxy-aware resolver for PLAYBACK only. Returns the fast 720p web proxy
  // from `footage-proxies` when one is ready, otherwise the original. Never use
  // this for downloads — they must pull the full-res original via
  // getSignedVideoUrl. Mirrors the proxy lookup in FootagePanel.
  async getPlaybackVideoUrl(storagePath: string): Promise<string> {
    try {
      // `footage_proxies` is not in the generated DB types yet — cast to query it.
      const { data: proxy } = await (supabase as any)
        .from('footage_proxies')
        .select('proxy_bucket, proxy_path, status')
        .eq('source_path', storagePath)
        .eq('status', 'done')
        .limit(1)
        .maybeSingle();
      if (proxy?.proxy_path) {
        const { data } = await supabase.storage
          .from(proxy.proxy_bucket || 'footage-proxies')
          .createSignedUrl(proxy.proxy_path, 3600);
        if (data?.signedUrl) return data.signedUrl;
      }
    } catch {
      // Table missing / proxy not ready / query error — fall back to original.
    }
    return this.getSignedVideoUrl(storagePath);
  },
};
