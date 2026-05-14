import { useState } from "react";
import {
  Facebook,
  Instagram,
  Music2,
  Youtube,
  Smartphone,
  Monitor,
  Heart,
  MessageCircle,
  Send,
  Bookmark,
  Share2,
  ThumbsUp,
  ThumbsDown,
  MoreHorizontal,
  Music,
  Shuffle,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

export type ComposerPreviewPlatform =
  | "facebook"
  | "instagram"
  | "tiktok"
  | "youtube";

interface Props {
  videoUrl: string | null;
  caption: string;
  activePlatform: ComposerPreviewPlatform;
  /** Optional account label shown in the mockup ("@r3.productions", "DJ R3.") */
  accountLabel?: string | null;
  /** Optional account avatar URL */
  accountAvatarUrl?: string | null;
  /** Optional callback when a brand-icon in the toolbar is clicked */
  onPlatformChange?: (platform: ComposerPreviewPlatform) => void;
}

const PLATFORMS: Array<{
  key: ComposerPreviewPlatform;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
}> = [
  { key: "facebook", label: "Facebook", Icon: Facebook },
  { key: "instagram", label: "Instagram", Icon: Instagram },
  { key: "tiktok", label: "TikTok", Icon: Music2 },
  { key: "youtube", label: "YouTube", Icon: Youtube },
];

function truncate(s: string, n: number): string {
  if (!s) return "";
  if (s.length <= n) return s;
  return s.slice(0, n).trimEnd() + "...";
}

function defaultHandle(platform: ComposerPreviewPlatform): string {
  switch (platform) {
    case "tiktok":
      return "@your.handle";
    case "instagram":
      return "your.handle";
    case "facebook":
      return "Your Page";
    case "youtube":
      return "@yourchannel";
  }
}

/** Small circular icon button used inside platform overlays. */
function OverlayIconButton({
  Icon,
  label,
  tone = "light",
}: {
  Icon: React.ComponentType<{ className?: string }>;
  label?: string;
  tone?: "light" | "dark" | "red";
}) {
  const bg =
    tone === "red"
      ? "bg-red-500/90"
      : tone === "dark"
      ? "bg-black/55"
      : "bg-white/15 backdrop-blur-sm";
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-full border border-white/15 shadow-sm",
          bg,
        )}
      >
        <Icon className="h-4 w-4 text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.6)]" />
      </div>
      {label ? (
        <span className="text-[10px] font-medium leading-none text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.7)]">
          {label}
        </span>
      ) : null}
    </div>
  );
}

function AccountAvatar({
  src,
  size = "sm",
}: {
  src?: string | null;
  size?: "sm" | "xs";
}) {
  const dims = size === "xs" ? "h-6 w-6" : "h-8 w-8";
  return (
    <Avatar className={cn(dims, "ring-1 ring-white/40")}>
      {src ? <AvatarImage src={src} /> : null}
      <AvatarFallback className="bg-white/20 text-white">
        <User className="h-3.5 w-3.5" />
      </AvatarFallback>
    </Avatar>
  );
}

/** The video element (or placeholder) that fills the mockup frame. */
function VideoFill({ videoUrl }: { videoUrl: string | null }) {
  if (!videoUrl) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-zinc-800 to-zinc-900">
        <span className="text-xs text-white/70">Loading preview...</span>
      </div>
    );
  }
  return (
    <video
      src={videoUrl}
      className="absolute inset-0 h-full w-full object-cover"
      muted
      playsInline
      loop
      autoPlay
    />
  );
}

/* -------------------------------------------------------------------------- */
/*  Platform overlays — mobile                                                 */
/* -------------------------------------------------------------------------- */

function TikTokOverlay({
  caption,
  accountLabel,
  accountAvatarUrl,
}: {
  caption: string;
  accountLabel: string;
  accountAvatarUrl?: string | null;
}) {
  return (
    <div className="pointer-events-none absolute inset-0">
      {/* darken edges so overlay is legible */}
      <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

      {/* right action column */}
      <div className="absolute bottom-16 right-2 flex flex-col items-center gap-3">
        <AccountAvatar src={accountAvatarUrl} />
        <OverlayIconButton Icon={Heart} label="1.2K" />
        <OverlayIconButton Icon={MessageCircle} label="284" />
        <OverlayIconButton Icon={Share2} label="Share" />
        <OverlayIconButton Icon={MoreHorizontal} />
      </div>

      {/* bottom-left caption */}
      <div className="absolute bottom-3 left-3 right-16">
        <div className="text-sm font-semibold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
          {accountLabel}
        </div>
        <div className="mt-1 text-xs text-white/95 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
          {truncate(caption, 80)}
        </div>
        <div className="mt-1 flex items-center gap-1.5 text-[11px] text-white/85 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
          <Music className="h-3 w-3" />
          <span>original sound</span>
        </div>
      </div>
    </div>
  );
}

function InstagramOverlay({
  caption,
  accountLabel,
  accountAvatarUrl,
}: {
  caption: string;
  accountLabel: string;
  accountAvatarUrl?: string | null;
}) {
  return (
    <div className="pointer-events-none absolute inset-0">
      {/* top thin gradient for "Reels" label */}
      <div className="absolute inset-x-0 top-0 h-12 bg-gradient-to-b from-black/55 to-transparent" />
      <div className="absolute left-3 top-2 text-xs font-semibold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
        Reels
      </div>

      <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

      <div className="absolute bottom-16 right-2 flex flex-col items-center gap-3">
        <AccountAvatar src={accountAvatarUrl} />
        <OverlayIconButton Icon={Heart} label="3.4K" />
        <OverlayIconButton Icon={MessageCircle} label="129" />
        <OverlayIconButton Icon={Send} label="Send" />
        <OverlayIconButton Icon={Bookmark} />
        <OverlayIconButton Icon={MoreHorizontal} />
      </div>

      <div className="absolute bottom-3 left-3 right-16">
        <div className="text-sm font-semibold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
          {accountLabel}
        </div>
        <div className="mt-1 text-xs text-white/95 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
          {truncate(caption, 80)}
        </div>
        <div className="mt-1 flex items-center gap-1.5 text-[11px] text-white/85 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
          <Music className="h-3 w-3" />
          <span>Original audio</span>
        </div>
      </div>
    </div>
  );
}

function FacebookOverlay({
  caption,
  accountLabel,
  accountAvatarUrl,
}: {
  caption: string;
  accountLabel: string;
  accountAvatarUrl?: string | null;
}) {
  return (
    <div className="pointer-events-none absolute inset-0">
      {/* top header */}
      <div className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black/60 to-transparent" />
      <div className="absolute left-3 right-3 top-2 flex items-center gap-2">
        <AccountAvatar src={accountAvatarUrl} size="xs" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-semibold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
            {accountLabel}
          </div>
          <div className="text-[10px] text-white/80 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
            Reel
          </div>
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

      <div className="absolute bottom-16 right-2 flex flex-col items-center gap-3">
        <OverlayIconButton Icon={ThumbsUp} label="2.1K" />
        <OverlayIconButton Icon={MessageCircle} label="312" />
        <OverlayIconButton Icon={Share2} label="Share" />
        <OverlayIconButton Icon={MoreHorizontal} />
      </div>

      <div className="absolute bottom-3 left-3 right-16">
        <div className="text-xs text-white/95 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
          {truncate(caption, 80)}
        </div>
      </div>
    </div>
  );
}

function YoutubeOverlay({
  caption,
  accountLabel,
  accountAvatarUrl,
}: {
  caption: string;
  accountLabel: string;
  accountAvatarUrl?: string | null;
}) {
  return (
    <div className="pointer-events-none absolute inset-0">
      {/* top "Shorts" label */}
      <div className="absolute inset-x-0 top-0 h-12 bg-gradient-to-b from-black/55 to-transparent" />
      <div className="absolute left-3 top-2 text-xs font-semibold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
        Shorts
      </div>

      <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

      <div className="absolute bottom-16 right-2 flex flex-col items-center gap-3">
        <OverlayIconButton Icon={ThumbsUp} label="1.8K" />
        <OverlayIconButton Icon={ThumbsDown} label="Dislike" />
        <OverlayIconButton Icon={MessageCircle} label="92" />
        <OverlayIconButton Icon={Share2} label="Share" />
        <OverlayIconButton Icon={Shuffle} label="Remix" />
        <AccountAvatar src={accountAvatarUrl} />
      </div>

      <div className="absolute bottom-3 left-3 right-16">
        <div className="text-sm font-semibold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
          {accountLabel}
        </div>
        <div className="mt-1 text-xs text-white/95 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
          {truncate(caption, 80)}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Desktop overlay — minimal, one row of chrome at the bottom                 */
/* -------------------------------------------------------------------------- */

function DesktopOverlay({
  platform,
  caption,
  accountLabel,
  accountAvatarUrl,
}: {
  platform: ComposerPreviewPlatform;
  caption: string;
  accountLabel: string;
  accountAvatarUrl?: string | null;
}) {
  const accent =
    platform === "youtube"
      ? "text-red-500"
      : platform === "facebook"
      ? "text-blue-500"
      : platform === "instagram"
      ? "text-pink-500"
      : "text-white";
  const PlatformIcon =
    PLATFORMS.find((p) => p.key === platform)?.Icon ?? Music2;

  return (
    <div className="pointer-events-none absolute inset-0">
      {/* top corner badge */}
      <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-black/55 px-2 py-1 backdrop-blur-sm">
        <PlatformIcon className={cn("h-3.5 w-3.5", accent)} />
        <span className="text-[10px] font-medium text-white">
          {platform === "youtube"
            ? "Shorts"
            : platform === "tiktok"
            ? "TikTok"
            : "Reels"}
        </span>
      </div>

      {/* bottom row */}
      <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/75 via-black/30 to-transparent" />
      <div className="absolute inset-x-3 bottom-3 flex items-end gap-3">
        <AccountAvatar src={accountAvatarUrl} size="xs" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-semibold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
            {accountLabel}
          </div>
          <div className="mt-0.5 line-clamp-2 text-[11px] text-white/95 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
            {truncate(caption, 140)}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <OverlayIconButton
            Icon={platform === "facebook" ? ThumbsUp : Heart}
          />
          <OverlayIconButton Icon={MessageCircle} />
          <OverlayIconButton
            Icon={platform === "instagram" ? Send : Share2}
          />
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Mobile mockup wrapper                                                      */
/* -------------------------------------------------------------------------- */

function MobileFrame({
  videoUrl,
  platform,
  caption,
  accountLabel,
  accountAvatarUrl,
}: {
  videoUrl: string | null;
  platform: ComposerPreviewPlatform;
  caption: string;
  accountLabel: string;
  accountAvatarUrl?: string | null;
}) {
  return (
    <div
      className="relative mx-auto overflow-hidden rounded-[2rem] border-4 border-zinc-800 bg-zinc-950 shadow-2xl"
      style={{ width: 280, aspectRatio: "9 / 16" }}
    >
      {/* notch */}
      <div className="absolute left-1/2 top-1.5 z-20 h-4 w-20 -translate-x-1/2 rounded-full bg-zinc-900" />
      <VideoFill videoUrl={videoUrl} />
      {platform === "tiktok" ? (
        <TikTokOverlay
          caption={caption}
          accountLabel={accountLabel}
          accountAvatarUrl={accountAvatarUrl}
        />
      ) : null}
      {platform === "instagram" ? (
        <InstagramOverlay
          caption={caption}
          accountLabel={accountLabel}
          accountAvatarUrl={accountAvatarUrl}
        />
      ) : null}
      {platform === "facebook" ? (
        <FacebookOverlay
          caption={caption}
          accountLabel={accountLabel}
          accountAvatarUrl={accountAvatarUrl}
        />
      ) : null}
      {platform === "youtube" ? (
        <YoutubeOverlay
          caption={caption}
          accountLabel={accountLabel}
          accountAvatarUrl={accountAvatarUrl}
        />
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Desktop mockup wrapper                                                     */
/* -------------------------------------------------------------------------- */

function DesktopFrame({
  videoUrl,
  platform,
  caption,
  accountLabel,
  accountAvatarUrl,
}: {
  videoUrl: string | null;
  platform: ComposerPreviewPlatform;
  caption: string;
  accountLabel: string;
  accountAvatarUrl?: string | null;
}) {
  return (
    <div
      className="relative mx-auto w-full max-w-[520px] overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 shadow-2xl"
      style={{ aspectRatio: "16 / 9" }}
    >
      <VideoFill videoUrl={videoUrl} />
      <DesktopOverlay
        platform={platform}
        caption={caption}
        accountLabel={accountLabel}
        accountAvatarUrl={accountAvatarUrl}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Public component                                                           */
/* -------------------------------------------------------------------------- */

export function ComposerPreview({
  videoUrl,
  caption,
  activePlatform,
  accountLabel,
  accountAvatarUrl,
  onPlatformChange,
}: Props) {
  const [viewMode, setViewMode] = useState<"mobile" | "desktop">("mobile");
  const label =
    accountLabel && accountLabel.trim().length > 0
      ? accountLabel
      : defaultHandle(activePlatform);

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4 p-4 text-foreground">
      {/* Platform toolbar */}
      <div className="flex items-center gap-1 rounded-full border border-border bg-card px-1 py-1">
        {PLATFORMS.map(({ key, Icon, label: pLabel }) => {
          const active = key === activePlatform;
          return (
            <button
              key={key}
              type="button"
              aria-label={pLabel}
              aria-pressed={active}
              onClick={() => onPlatformChange?.(key)}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
            </button>
          );
        })}
      </div>

      {/* View mode toggle */}
      <div className="flex items-center gap-1 rounded-full border border-border bg-card px-1 py-1">
        <button
          type="button"
          aria-label="Mobile preview"
          aria-pressed={viewMode === "mobile"}
          onClick={() => setViewMode("mobile")}
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-full transition-colors",
            viewMode === "mobile"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          <Smartphone className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          aria-label="Desktop preview"
          aria-pressed={viewMode === "desktop"}
          onClick={() => setViewMode("desktop")}
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-full transition-colors",
            viewMode === "desktop"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          <Monitor className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Mockup */}
      <div className="flex w-full flex-1 items-center justify-center">
        {viewMode === "mobile" ? (
          <MobileFrame
            videoUrl={videoUrl}
            platform={activePlatform}
            caption={caption}
            accountLabel={label}
            accountAvatarUrl={accountAvatarUrl}
          />
        ) : (
          <DesktopFrame
            videoUrl={videoUrl}
            platform={activePlatform}
            caption={caption}
            accountLabel={label}
            accountAvatarUrl={accountAvatarUrl}
          />
        )}
      </div>
    </div>
  );
}

export default ComposerPreview;
