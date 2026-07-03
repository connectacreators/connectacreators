// src/lib/ensureViralVideo.ts
//
// Register a video URL in the Viral Today library (viral_videos) via the
// viral-video-resolve edge fn — the same path canvas drops use. Returns the
// existing row when the URL is already known (matched by canonical URL), or
// a freshly created stub row enriched with best-effort VPS metadata.
//
// Used when a URL is attached to a script so the video shows up in Viral
// Today and the script editor can offer the full breakdown + Analyze flow.

import { supabase } from "@/integrations/supabase/client";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

export interface ResolvedViralVideo {
  id: string;
  video_url: string | null;
  platform: string | null;
  caption: string | null;
  channel_username: string | null;
  thumbnail_url: string | null;
  views_count: number | null;
  outlier_score: number | null;
  transcript: string | null;
  hook_text: string | null;
  cta_text: string | null;
  framework_meta: Record<string, unknown> | null;
  analysis_status: "pending" | "analyzing" | "analyzed" | "failed" | null;
  analysis_error: string | null;
  content_format: string | null;
  primary_niche: string | null;
  video_file_url: string | null;
  video_file_expires_at: string | null;
}

export async function ensureViralVideo(url: string): Promise<ResolvedViralVideo | null> {
  const clean = url.trim();
  if (!clean) return null;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return null;
    const res = await fetch(`${SUPABASE_URL}/functions/v1/viral-video-resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ url: clean }),
    });
    if (!res.ok) return null; // unsupported URL (e.g. Drive link) — not an error
    const { row } = await res.json();
    return (row as ResolvedViralVideo) ?? null;
  } catch {
    return null;
  }
}

/** Fire-and-forget variant for attach-time registration. */
export function registerViralVideo(url: string): void {
  void ensureViralVideo(url);
}
