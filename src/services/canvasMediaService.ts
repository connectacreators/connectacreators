import { supabase } from '@/integrations/supabase/client';
import * as tus from 'tus-js-client';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BUCKET = 'canvas-media';
const MAX_SESSION_BYTES = 5 * 1024 * 1024 * 1024; // 5 GB per session
const MAX_FILE_BYTES = 500 * 1024 * 1024; // 500 MB single file
const TUS_THRESHOLD = 50 * 1024 * 1024; // 50 MB – use TUS above this
const SIGNED_URL_EXPIRY = 3600; // 1 hour

const ACCEPTED_TYPES: Record<string, string[]> = {
  image: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  video: ['video/mp4', 'video/quicktime', 'video/webm'],
  voice: ['audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/webm', 'audio/ogg'],
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CanvasMediaRecord {
  id: string;
  session_id: string;
  user_id: string;
  client_id: string;
  node_id: string;
  file_name: string;
  file_type: string; // 'image' | 'video' | 'voice'
  mime_type: string;
  file_size_bytes: number;
  storage_path: string;
  audio_transcription: string | null;
  visual_transcription: Record<string, unknown> | null;
  transcription_status: string; // 'none' | 'processing' | 'done' | 'error'
  created_at: string;
  updated_at: string;
}

export interface SessionUsage {
  used: number;
  limit: number;
  remaining: number;
}

export class CanvasMediaCapError extends Error {
  overLimit = true;
  used: number;
  limit: number;
  fileSize: number;

  constructor(used: number, limit: number, fileSize: number) {
    super(
      `Session storage limit exceeded. Used ${(used / 1024 / 1024).toFixed(0)} MB of ${(limit / 1024 / 1024).toFixed(0)} MB; file is ${(fileSize / 1024 / 1024).toFixed(1)} MB.`,
    );
    this.name = 'CanvasMediaCapError';
    this.used = used;
    this.limit = limit;
    this.fileSize = fileSize;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
  return (sanitized || 'file') + ext.toLowerCase();
}

function resolveFileType(mimeType: string): string {
  for (const [type, mimes] of Object.entries(ACCEPTED_TYPES)) {
    if (mimes.includes(mimeType)) return type;
  }
  throw new Error(`Unsupported file type: ${mimeType}`);
}

function buildStoragePath(
  userId: string,
  sessionId: string,
  nodeId: string,
  filename: string,
): string {
  return `${userId}/${sessionId}/${nodeId}/${sanitizeFilename(filename)}`;
}

// ---------------------------------------------------------------------------
// Upload helpers (mirrored from videoUploadService.ts)
// ---------------------------------------------------------------------------

async function standardUpload(
  file: File,
  storagePath: string,
  onProgress: (percent: number) => void,
): Promise<string> {
  onProgress(0);
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, file, {
      cacheControl: '3600',
      upsert: true,
    });

  if (error) throw error;
  onProgress(100);
  return data.path;
}

async function tusUpload(
  file: File,
  storagePath: string,
  onProgress: (percent: number) => void,
): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const projectId = 'hxojqrilwhhrvloiwmfo';

  return new Promise((resolve, reject) => {
    const upload = new tus.Upload(file, {
      endpoint: `https://${projectId}.supabase.co/storage/v1/upload/resumable`,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      headers: {
        authorization: `Bearer ${session.access_token}`,
        'x-upsert': 'true',
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      metadata: {
        bucketName: BUCKET,
        objectName: storagePath,
        contentType: file.type,
        cacheControl: '3600',
      },
      chunkSize: 6 * 1024 * 1024, // 6 MB chunks
      onError: (err) => reject(err),
      onProgress: (bytesUploaded, bytesTotal) => {
        const pct = Math.round((bytesUploaded / bytesTotal) * 100);
        onProgress(pct);
      },
      onSuccess: () => resolve(storagePath),
    });

    // Resume previous upload if available
    upload.findPreviousUploads().then((previousUploads) => {
      if (previousUploads.length > 0) {
        upload.resumeFromPreviousUpload(previousUploads[0]);
      }
      upload.start();
    });
  });
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const canvasMediaService = {
  /**
   * Return how much storage a session has consumed and how much remains.
   */
  async getSessionUsage(sessionId: string): Promise<SessionUsage> {
    const { data, error } = await supabase
      .from('canvas_media')
      .select('file_size_bytes')
      .eq('session_id', sessionId);

    if (error) throw error;

    const used = (data ?? []).reduce(
      (sum, row) => sum + (Number(row.file_size_bytes) || 0),
      0,
    );

    return {
      used,
      limit: MAX_SESSION_BYTES,
      remaining: Math.max(0, MAX_SESSION_BYTES - used),
    };
  },

  /**
   * Upload a media file to the canvas-media bucket, track it in the DB,
   * and return the full record with a signed URL baked into storage_path
   * for immediate display.
   */
  async uploadMedia(
    file: File,
    sessionId: string,
    clientId: string,
    nodeId: string,
    onProgress: (pct: number) => void,
  ): Promise<CanvasMediaRecord> {
    // 1. Validate MIME type
    const fileType = resolveFileType(file.type); // throws if unsupported

    // 2. Validate individual file size
    if (file.size > MAX_FILE_BYTES) {
      throw new Error(
        `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is ${MAX_FILE_BYTES / 1024 / 1024} MB.`,
      );
    }

    // 3. Check session storage cap
    const usage = await this.getSessionUsage(sessionId);
    if (usage.used + file.size > MAX_SESSION_BYTES) {
      throw new CanvasMediaCapError(usage.used, MAX_SESSION_BYTES, file.size);
    }

    // 4. Resolve current user
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // 5. Build storage path
    const storagePath = buildStoragePath(user.id, sessionId, nodeId, file.name);

    // 6. Upload — standard for <= 50 MB, TUS for larger
    if (file.size <= TUS_THRESHOLD) {
      await standardUpload(file, storagePath, onProgress);
    } else {
      await tusUpload(file, storagePath, onProgress);
    }

    // 7. Insert tracking row
    const { data: record, error: insertError } = await supabase
      .from('canvas_media')
      .insert({
        session_id: sessionId,
        user_id: user.id,
        client_id: clientId,
        node_id: nodeId,
        file_name: sanitizeFilename(file.name),
        file_type: fileType,
        mime_type: file.type,
        file_size_bytes: file.size,
        storage_path: storagePath,
      })
      .select()
      .single();

    if (insertError) throw insertError;

    return record as unknown as CanvasMediaRecord;
  },

  /**
   * Create a signed URL (1-hour expiry) for the given storage path.
   */
  async getSignedUrl(storagePath: string): Promise<string> {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(storagePath, SIGNED_URL_EXPIRY);

    if (error) throw error;
    return data.signedUrl;
  },

  /**
   * Delete a media file from storage and its tracking row in the DB.
   */
  async deleteMedia(mediaId: string, storagePath: string): Promise<void> {
    // Delete from storage first
    const { error: storageError } = await supabase.storage
      .from(BUCKET)
      .remove([storagePath]);

    if (storageError) throw storageError;

    // Then delete the DB record
    const { error: dbError } = await supabase
      .from('canvas_media')
      .delete()
      .eq('id', mediaId);

    if (dbError) throw dbError;
  },

  /**
   * Fetch all media records for a given session (useful for AI context building).
   */
  async getSessionMedia(sessionId: string): Promise<CanvasMediaRecord[]> {
    const { data, error } = await supabase
      .from('canvas_media')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return (data ?? []) as unknown as CanvasMediaRecord[];
  },
};
