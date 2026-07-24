import { supabase } from '@/integrations/supabase/client';

// One photo attached to a revision note. `path` is the storage key (used for
// deletion), `url` the public URL for <img>, `w`/`h` the (post-compression)
// pixel dimensions so thumbnails render at the right aspect ratio.
export interface NoteAttachment {
  path: string;
  url: string;
  w: number;
  h: number;
}

const BUCKET = 'revision-attachments';
const MAX_EDGE = 1600;              // longest side after downscale
const MAX_INPUT_BYTES = 15 * 1024 * 1024; // reject huge originals pre-compress

export function isImageFile(file: File): boolean {
  return file.type.startsWith('image/');
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read image')); };
    img.src = url;
  });
}

// Downscale to <= MAX_EDGE on the long side and re-encode as WebP. The
// re-encode also strips EXIF/orientation/location metadata for free.
async function compressImage(file: File): Promise<{ blob: Blob; w: number; h: number }> {
  let srcW: number, srcH: number, source: CanvasImageSource, bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file);
    srcW = bitmap.width; srcH = bitmap.height; source = bitmap;
  } catch {
    // Some formats (occasionally HEIC/SVG) fail createImageBitmap — fall back
    // to an <img> decode, which the browser can usually handle.
    const img = await loadImage(file);
    srcW = img.naturalWidth; srcH = img.naturalHeight; source = img;
  }
  const scale = Math.min(1, MAX_EDGE / Math.max(srcW, srcH));
  const w = Math.max(1, Math.round(srcW * scale));
  const h = Math.max(1, Math.round(srcH * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) { bitmap?.close(); throw new Error('Canvas unavailable'); }
  ctx.drawImage(source, 0, 0, w, h);
  bitmap?.close();
  // Prefer WebP, but some browsers (older Safari) ignore the type and hand back
  // PNG bytes — trust blob.type below rather than assuming webp.
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/webp', 0.82));
  if (!blob) throw new Error('Could not encode image');
  return { blob, w, h };
}

function extFor(mime: string): string {
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/jpeg') return 'jpg';
  return 'png';
}

export const noteAttachmentService = {
  // Compress + upload one image; returns the record to store on the note.
  async upload(file: File, clientId: string, videoEditId: string): Promise<NoteAttachment> {
    if (!isImageFile(file)) throw new Error('Only image files can be attached');
    if (file.size > MAX_INPUT_BYTES) throw new Error('Image is too large (max 15MB)');
    const { blob, w, h } = await compressImage(file);
    const contentType = blob.type || 'image/png';
    const path = `${clientId}/${videoEditId}/${crypto.randomUUID()}.${extFor(contentType)}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
      contentType,
      upsert: false,
    });
    if (error) throw error;
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return { path, url: data.publicUrl, w, h };
  },

  // Best-effort delete of the actual storage objects (S3). Row-level cleanup is
  // also guaranteed by the trg_cleanup_revision_attachments DB trigger, so a
  // failure here never leaves a dangling DB reference — only an S3 orphan.
  async remove(paths: string[]): Promise<void> {
    if (!paths.length) return;
    await supabase.storage.from(BUCKET).remove(paths).catch(() => {});
  },
};
