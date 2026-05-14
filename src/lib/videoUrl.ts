import { supabase } from "@/integrations/supabase/client";

const FOOTAGE_BUCKET = "footage";

/**
 * Editing-queue items store video locations as either:
 *  - A full URL (http/https) — typically a Google Drive link from Notion items
 *  - A Supabase Storage path inside the `footage` private bucket
 *    (e.g. `<clientId>/<editId>/submission/<filename>.mp4`)
 *
 * This resolver returns something a <video> tag can play.
 * For Google Drive URLs, we convert /file/d/{id}/view to /uc?id={id} which is
 * directly streamable. For storage paths, we sign a short-lived URL.
 */
export async function resolveVideoUrl(pathOrUrl: string | null | undefined): Promise<string | null> {
  if (!pathOrUrl) return null;

  // Full URL — handle Google Drive specially, return others as-is
  if (/^https?:\/\//.test(pathOrUrl)) {
    const driveMatch = pathOrUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || pathOrUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (driveMatch) {
      return `https://drive.google.com/uc?export=download&id=${driveMatch[1]}`;
    }
    return pathOrUrl;
  }

  // Treat as a Supabase Storage path in the footage bucket
  const { data, error } = await supabase.storage.from(FOOTAGE_BUCKET).createSignedUrl(pathOrUrl, 3600);
  if (error || !data?.signedUrl) {
    console.warn("Failed to sign video URL:", error, pathOrUrl);
    return null;
  }
  return data.signedUrl;
}
