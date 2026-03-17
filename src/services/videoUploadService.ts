import { supabase } from '@/integrations/supabase/client';
import * as tus from 'tus-js-client';
import { videoService } from './videoService';

const BUCKET = 'video-uploads';
const FIVE_GB = 5 * 1024 * 1024 * 1024;
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
const ONE_EIGHTY_DAYS_MS = 180 * 24 * 60 * 60 * 1000;

function buildStoragePath(clientId: string, videoEditId: string, filename: string): string {
  return `${clientId}/${videoEditId}/${filename}`;
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
  onProgress: (percent: number) => void
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
  onProgress: (percent: number) => void
): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
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
      chunkSize: 6 * 1024 * 1024, // 6MB chunks
      onError: (err) => reject(err),
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
    });
  });
}

export const videoUploadService = {
  async uploadVideoFile(
    file: File,
    clientId: string,
    videoEditId: string,
    onProgress: (percent: number) => void
  ): Promise<{ storagePath: string; storageUrl: string }> {
    const storagePath = buildStoragePath(clientId, videoEditId, file.name);

    // Route by file size
    if (file.size <= FIVE_GB) {
      await standardUpload(file, storagePath, onProgress);
    } else {
      await tusUpload(file, storagePath, onProgress);
    }

    // Get signed URL
    const storageUrl = await this.getSignedVideoUrl(storagePath);

    // Update video_edits row
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

  async getSignedVideoUrl(storagePath: string): Promise<string> {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(storagePath, 3600); // 1 hour

    if (error) throw error;
    return data.signedUrl;
  },
};
