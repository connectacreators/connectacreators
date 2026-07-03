import { useEffect, useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { canonicalizeVideoUrl } from "@/lib/canonicalize-video-url";
import { ViralVideoPlayer } from "@/components/video/ViralVideoPlayer";
import { useLanguage } from "@/hooks/useLanguage";
import { tr } from "@/i18n/translations";

interface InspirationVideoEmbedProps {
  url: string;
  /** Already-resolved cached file URL (e.g. from VideoBreakdownDialog) —
   *  skips the viral_videos lookup so playback starts immediately. */
  cachedFileUrl?: string | null;
}

const VPS_API = "https://connectacreators.com/api";

/** Cobalt-backed VPS proxy that streams the raw reel bytes (no permanent
 *  download) — the same path Viral Today uses for un-cached videos. The VPS
 *  caches resolved reels; forcing nocache=1 here made EVERY playback re-run
 *  yt-dlp from scratch (5-15s of spinner instead of instant cache hits). */
const streamReelUrl = (originalUrl: string) =>
  `${VPS_API}/stream-reel?url=${encodeURIComponent(originalUrl)}`;

type LookupState =
  | { status: "loading" }
  | { status: "playable"; videoFileUrl: string }
  | { status: "fallback" };

export function InspirationVideoEmbed({ url, cachedFileUrl }: InspirationVideoEmbedProps) {
  const { language } = useLanguage();
  const [state, setState] = useState<LookupState>(
    cachedFileUrl ? { status: "playable", videoFileUrl: cachedFileUrl } : { status: "loading" },
  );

  useEffect(() => {
    if (cachedFileUrl) {
      setState({ status: "playable", videoFileUrl: cachedFileUrl });
      return;
    }
    let cancelled = false;
    setState({ status: "loading" });

    const canonical = canonicalizeVideoUrl(url);
    if (!canonical) {
      setState({ status: "fallback" });
      return;
    }

    (async () => {
      const { data } = await supabase
        .from("viral_videos")
        .select("video_file_url, video_file_expires_at")
        .eq("video_url", canonical.normalizedUrl)
        .limit(1)
        .maybeSingle();
      if (cancelled) return;

      const row = data as unknown as { video_file_url: string | null; video_file_expires_at: string | null } | null;
      const live =
        row?.video_file_url &&
        (!row.video_file_expires_at || new Date(row.video_file_expires_at) > new Date());

      if (live && row?.video_file_url) {
        setState({ status: "playable", videoFileUrl: row.video_file_url });
      } else {
        setState({ status: "fallback" });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [url, cachedFileUrl]);

  if (state.status === "loading") {
    return (
      <div className="flex items-center justify-center py-10 text-muted-foreground text-sm gap-2">
        <Loader2 className="w-4 h-4 animate-spin" />
        {tr({ en: "Loading inspiration…", es: "Cargando inspiración…" }, language)}
      </div>
    );
  }

  if (state.status === "playable") {
    return (
      <div className="flex flex-col items-center gap-3">
        <div style={{ width: "100%", maxWidth: 380 }}>
          <ViralVideoPlayer src={state.videoFileUrl} aspectRatio="auto" />
        </div>
        <button
          onClick={() => window.open(url, "_blank", "noopener,noreferrer")}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors"
        >
          <ExternalLink className="w-3 h-3" />
          {tr({ en: "Open original", es: "Abrir original" }, language)}
        </button>
      </div>
    );
  }

  return <InspirationIframeFallback url={url} language={language} />;
}

function InspirationIframeFallback({ url, language }: { url: string; language: "en" | "es" }) {
  const ytMatch = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([\w-]+)/);
  if (ytMatch) {
    return (
      <div className="relative rounded-xl overflow-hidden" style={{ padding: "56.25% 0 0 0", position: "relative" }}>
        <iframe
          src={`https://www.youtube.com/embed/${ytMatch[1]}?autoplay=1`}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }}
          title="Inspiration video"
        />
      </div>
    );
  }
  const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
  if (vimeoMatch) {
    return (
      <div className="relative rounded-xl overflow-hidden" style={{ padding: "56.25% 0 0 0", position: "relative" }}>
        <iframe
          src={`https://player.vimeo.com/video/${vimeoMatch[1]}?autoplay=1`}
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
          style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }}
          title="Inspiration video"
        />
      </div>
    );
  }
  // TikTok / Instagram / Facebook: their embeds only render a dead preview
  // whose play button deep-links out to the platform. Stream the real video
  // inline through the VPS proxy instead — same UX as Viral Today, no download.
  const isProxyable = /tiktok\.com\/@[^/]+\/video\/\d+|instagram\.com\/(?:reel|p)\/[\w-]+|(?:fb\.watch|facebook\.com)\//.test(url);
  if (isProxyable) {
    return <InspirationProxyPlayer url={url} language={language} />;
  }
  return (
    <div className="text-center py-8">
      <p className="text-muted-foreground text-sm mb-3">
        {tr(
          { en: "This video can't be embedded. Open it externally:", es: "Este video no se puede embeber. Ábrelo externamente:" },
          language
        )}
      </p>
      <Button
        variant="outline"
        onClick={() => window.open(url, "_blank", "noopener,noreferrer")}
        className="gap-2"
      >
        <ExternalLink className="w-4 h-4" /> {tr({ en: "Open video", es: "Abrir video" }, language)}
      </Button>
    </div>
  );
}

/** Streams an un-cached reel through the VPS Cobalt proxy into the native
 *  player. Shows an "Open original" escape hatch below for the rare case the
 *  proxy can't resolve the source (private / age-gated). */
function InspirationProxyPlayer({ url, language }: { url: string; language: "en" | "es" }) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div style={{ width: "100%", maxWidth: 380 }}>
        <ViralVideoPlayer src={null} fallbackProxyUrl={streamReelUrl(url)} aspectRatio="auto" />
      </div>
      <button
        onClick={() => window.open(url, "_blank", "noopener,noreferrer")}
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors"
      >
        <ExternalLink className="w-3 h-3" />
        {tr({ en: "Open original", es: "Abrir original" }, language)}
      </button>
    </div>
  );
}
