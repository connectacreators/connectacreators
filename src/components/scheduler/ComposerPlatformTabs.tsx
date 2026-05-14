import { Facebook, Instagram, Music2, Plus, StickyNote, Youtube } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type Plat = "facebook" | "instagram" | "tiktok" | "youtube";

interface Conn {
  platform: Plat;
  /** e.g. "DJ R3.", "@r3.productions" */
  account_label: string;
}

interface Props {
  /** All connections available (already filtered to status='active') */
  connections: Conn[];
  /** Currently selected platforms (checkboxes equivalent) */
  selected: Plat[];
  /** Toggle a platform's selection */
  onToggle: (platform: Plat) => void;
  /** Which platform's preview is currently active (the active tab) */
  active: Plat;
  /** Switch the active preview platform */
  onActiveChange: (platform: Plat) => void;
}

const PLATFORMS: Plat[] = ["facebook", "instagram", "tiktok", "youtube"];

const PLATFORM_NAME: Record<Plat, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
};

const CONTENT_LABEL: Record<Plat, string | null> = {
  facebook: "REEL",
  instagram: "REEL",
  tiktok: null,
  youtube: "SHORT",
};

const BADGE_CLASS: Record<Plat, string> = {
  facebook: "bg-blue-600",
  instagram: "bg-gradient-to-tr from-yellow-500 via-pink-500 to-purple-600",
  tiktok: "bg-black",
  youtube: "bg-red-600",
};

function PlatformIcon({ platform }: { platform: Plat }) {
  const cls = "h-4 w-4 text-white";
  switch (platform) {
    case "facebook":
      return <Facebook className={cls} />;
    case "instagram":
      return <Instagram className={cls} />;
    case "tiktok":
      return <Music2 className={cls} />;
    case "youtube":
      return <Youtube className={cls} />;
  }
}

interface PlatformTabProps {
  platform: Plat;
  connected: boolean;
  selected: boolean;
  active: boolean;
  onClick: () => void;
}

function PlatformTab({
  platform,
  connected,
  selected,
  active,
  onClick,
}: PlatformTabProps) {
  const label = CONTENT_LABEL[platform];

  const pill = (
    <button
      type="button"
      disabled={!connected}
      onClick={connected ? onClick : undefined}
      aria-pressed={selected}
      aria-label={`${PLATFORM_NAME[platform]}${label ? ` ${label}` : ""}`}
      className={cn(
        "inline-flex items-center gap-2 rounded-full pl-1 pr-3 py-1 transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active && connected && "bg-accent/30",
        !connected && "opacity-40 cursor-not-allowed",
        connected && "hover:bg-accent/20",
      )}
    >
      <span
        className={cn(
          "flex h-7 w-7 items-center justify-center rounded-full",
          BADGE_CLASS[platform],
          selected && connected && "ring-2 ring-primary ring-offset-2 ring-offset-background",
        )}
      >
        <PlatformIcon platform={platform} />
      </span>
      {label && (
        <span className="text-xs font-semibold tracking-wide text-foreground/80">
          {label}
        </span>
      )}
    </button>
  );

  if (connected) return pill;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* span so disabled button still triggers hover */}
        <span className="inline-flex">{pill}</span>
      </TooltipTrigger>
      <TooltipContent>
        Connect {PLATFORM_NAME[platform]} in client settings
      </TooltipContent>
    </Tooltip>
  );
}

export function ComposerPlatformTabs({
  connections,
  selected,
  onToggle,
  active,
  onActiveChange,
}: Props) {
  const connectedSet = new Set(connections.map((c) => c.platform));

  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex w-full items-center gap-2">
        <div className="flex flex-1 items-center gap-2">
          {PLATFORMS.map((p) => {
            const isConnected = connectedSet.has(p);
            return (
              <PlatformTab
                key={p}
                platform={p}
                connected={isConnected}
                selected={selected.includes(p)}
                active={active === p}
                onClick={() => {
                  onToggle(p);
                  onActiveChange(p);
                }}
              />
            );
          })}

          <button
            type="button"
            disabled
            aria-label="Add platform"
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-full border border-dashed border-border/60 text-muted-foreground",
              "opacity-50 cursor-not-allowed",
            )}
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            /* placeholder: Notes panel */
          }}
          className="gap-2"
        >
          <StickyNote className="h-4 w-4" />
          Notes
        </Button>
      </div>
    </TooltipProvider>
  );
}

export default ComposerPlatformTabs;
