import { ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { STAGE_FIELDS } from "@/hooks/useOutboundMetrics";
import { STAGE_ICON } from "@/pages/Outbound";
import { classifyLink, LINK_BADGE_LABEL } from "@/lib/prospects/linkBadge";
import type { IgProspect } from "@/hooks/useProspects";

const compact = (n: number | null) =>
  n == null ? "—" : n >= 1000 ? `${Math.round(n / 100) / 10}K` : String(n);

export function ProspectRow({
  prospect: p,
  onStage,
  onFollow,
}: {
  prospect: IgProspect;
  onStage: (p: IgProspect, next: number) => void;
  onFollow: (p: IgProspect, field: "followed" | "followed_back") => void;
}) {
  const pending = p.enrichment_status === "pending";
  const badge = classifyLink(p.external_url);

  return (
    <div className={`px-4 py-3 space-y-2 ${pending ? "opacity-55" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <a
            href={`https://instagram.com/${p.username}`}
            target="_blank"
            rel="noreferrer"
            className="text-sm font-semibold text-foreground hover:text-primary inline-flex items-center gap-1"
          >
            @{p.username}
            <ExternalLink className="w-3 h-3 shrink-0" />
          </a>
          <div className="text-xs text-muted-foreground truncate">
            {p.full_name || "—"}
            {p.category ? ` · ${p.category}` : ""}
            {p.city_name ? ` · ${p.city_name}` : ""}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-sm font-semibold tabular-nums text-foreground">
            {compact(p.follower_count)}
          </div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">followers</div>
        </div>
      </div>

      {pending ? (
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Loader2 className="w-3 h-3 animate-spin" /> enriching…
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className={`px-2 py-0.5 rounded-full border ${
            badge === "none"
              ? "border-border/60 text-muted-foreground"
              : "border-primary/40 text-primary"
          }`}>
            {LINK_BADGE_LABEL[badge]}
          </span>
          <span className="text-muted-foreground">{compact(p.media_count)} posts</span>
          {p.is_business && <span className="text-muted-foreground">· business</span>}
          {p.biography && (
            <span className="text-muted-foreground/80 truncate max-w-full">· {p.biography.slice(0, 80)}</span>
          )}
        </div>
      )}

      {/* Stage progression — same icons, labels and sheet codes as the funnel
          this feeds, so advancing a prospect reads as the funnel moving. */}
      <div className="flex flex-wrap items-center gap-1">
        {STAGE_FIELDS.map((f, i) => {
          const Icon = STAGE_ICON[f.key];
          const stage = i + 1;
          const reached = p.stage_reached >= stage;
          return (
            <button
              key={f.key}
              title={`${f.label} (${f.code})`}
              onClick={() => onStage(p, reached && p.stage_reached === stage ? stage - 1 : stage)}
              className={`h-8 px-2 rounded-lg border text-[10px] font-semibold inline-flex items-center gap-1 transition-colors ${
                reached
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card/60 text-muted-foreground border-border/60 hover:text-foreground"
              }`}
            >
              <Icon className="w-3 h-3" />
              {f.code}
            </button>
          );
        })}
        <div className="ml-auto flex items-center gap-1">
          <Button
            variant={p.followed ? "cta" : "ghost"}
            size="sm"
            className="h-8 px-2 text-[10px]"
            onClick={() => onFollow(p, "followed")}
          >
            Followed
          </Button>
          <Button
            variant={p.followed_back ? "cta" : "ghost"}
            size="sm"
            className="h-8 px-2 text-[10px]"
            onClick={() => onFollow(p, "followed_back")}
          >
            Back
          </Button>
        </div>
      </div>
    </div>
  );
}
