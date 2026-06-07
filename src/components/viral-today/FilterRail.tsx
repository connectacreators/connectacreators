// src/components/viral-today/FilterRail.tsx
//
// Persistent left filter rail for the Viral Today "Videos" view (redesign,
// Option A). Owns ALL navigation/filtering for the grid:
//   • Category list (content format) at the top — applies INSTANTLY.
//   • Measurement filters below — edited as a draft, committed on "Apply",
//     so heavy filters (which trigger a re-fetch upstream) don't fire on
//     every keystroke. Mirrors the model the old FiltersPanel popover used.
//
// Rendered docked on desktop and inside a slide-over drawer on mobile; the
// component itself is layout-agnostic and just fills its container's height.

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { isCanonicalNiche, nicheLabel, CONTENT_FORMATS, type ContentFormat } from "@/lib/video-taxonomy";
import type { FiltersPanelValue } from "@/components/viral-today/FiltersPanel";

interface NicheOption { slug: string; count: number }
interface ChannelOption { id: string; username: string; video_count: number }
interface Opt { value: string; label: string }

interface FilterRailProps {
  // Category (content format) — instant, not part of the draft.
  activeFormat: ContentFormat | "all";
  formatCounts: Partial<Record<ContentFormat | "all", number>>;
  onFormatChange: (f: ContentFormat | "all") => void;

  // Measurement filters — draft + apply.
  value: FiltersPanelValue;
  defaults: FiltersPanelValue;
  onChange: (next: FiltersPanelValue) => void;
  availableNiches: NicheOption[];

  channels?: ChannelOption[];
  selectedChannelIds?: string[];
  onChannelsChange?: (ids: string[]) => void;

  dateOptions: Opt[];
  platformOptions: Opt[];
  outlierOptions: Opt[];
  viewsOptions: Opt[];
  engagementOptions: Opt[];
  sourceOptions: Opt[];

  /** Called after Apply/Reset — lets the mobile drawer close itself. */
  onApplied?: () => void;
}

const NICHES_VISIBLE_BY_DEFAULT = 8;
const CHANNELS_VISIBLE_BY_DEFAULT = 8;
const selectClass =
  "w-full h-8 rounded-md border border-border bg-background text-xs px-2 text-foreground";

export function FilterRail(props: FilterRailProps) {
  const [draft, setDraft] = useState<FiltersPanelValue>(props.value);
  const [showAllNiches, setShowAllNiches] = useState(false);
  const [showAllChannels, setShowAllChannels] = useState(false);
  useEffect(() => { setDraft(props.value); }, [props.value]);

  const channelList = props.channels ?? [];
  const selectedChannels = props.selectedChannelIds ?? [];

  const activeCount = (() => {
    let n = 0;
    const v = props.value, d = props.defaults;
    if (v.date !== d.date) n++;
    if (v.platform !== d.platform) n++;
    if (v.outlier !== d.outlier) n++;
    if (v.views !== d.views) n++;
    if (v.engagement !== d.engagement) n++;
    if (v.source !== d.source) n++;
    if (v.featuredOnly !== d.featuredOnly) n++;
    if (v.niches.length > 0) n++;
    if (selectedChannels.length > 0) n++;
    return n;
  })();
  const dirty = JSON.stringify(draft) !== JSON.stringify(props.value);

  const apply = () => { props.onChange(draft); props.onApplied?.(); };
  const reset = () => { setDraft(props.defaults); props.onChange(props.defaults); props.onApplied?.(); };

  const categories: Array<{ slug: ContentFormat | "all"; label: string }> = [
    { slug: "all", label: "All" },
    ...CONTENT_FORMATS.map((f) => ({ slug: f.slug, label: f.label })),
  ];

  const sortedNiches = [...props.availableNiches].sort((a, b) => {
    const ac = isCanonicalNiche(a.slug) ? 1 : 0;
    const bc = isCanonicalNiche(b.slug) ? 1 : 0;
    if (ac !== bc) return bc - ac;
    if (b.count !== a.count) return b.count - a.count;
    return a.slug.localeCompare(b.slug);
  });
  const visibleNiches = showAllNiches ? sortedNiches : sortedNiches.slice(0, NICHES_VISIBLE_BY_DEFAULT);
  const visibleChannels = showAllChannels ? channelList : channelList.slice(0, CHANNELS_VISIBLE_BY_DEFAULT);

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-5">

        {/* ── Category ── */}
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 px-1">Category</p>
          <div className="flex flex-col gap-0.5">
            {categories.map(({ slug, label }) => {
              const count = props.formatCounts[slug];
              const on = props.activeFormat === slug;
              return (
                <button
                  key={slug}
                  onClick={() => props.onFormatChange(slug)}
                  className={cn(
                    "flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md text-xs text-left transition-colors",
                    on ? "bg-primary/15 text-primary font-medium" : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                  )}
                >
                  <span className="truncate">{label}</span>
                  {typeof count === "number" && count > 0 && (
                    <span className={cn("text-[10px] tabular-nums", on ? "text-primary/70" : "text-muted-foreground/60")}>{count}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="h-px bg-border" />

        {/* ── Filters ── */}
        <div className="space-y-3">
          <Field label="Date">
            <select value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} className={selectClass}>
              {props.dateOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Field>
          <Field label="Platform">
            <select value={draft.platform} onChange={(e) => setDraft({ ...draft, platform: e.target.value })} className={selectClass}>
              {props.platformOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Field>
          <Field label="Outlier score">
            <select value={draft.outlier} onChange={(e) => setDraft({ ...draft, outlier: e.target.value })} className={selectClass}>
              {props.outlierOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Field>
          <Field label="Views">
            <select value={draft.views} onChange={(e) => setDraft({ ...draft, views: e.target.value })} className={selectClass}>
              {props.viewsOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Field>
          <Field label="Engagement">
            <select value={draft.engagement} onChange={(e) => setDraft({ ...draft, engagement: e.target.value })} className={selectClass}>
              {props.engagementOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Field>
          <Field label="Source">
            <select value={draft.source} onChange={(e) => setDraft({ ...draft, source: e.target.value })} className={selectClass}>
              {props.sourceOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Field>
          <label className="flex items-center justify-between gap-2 text-xs text-foreground px-1 cursor-pointer">
            <span className="text-muted-foreground">Featured only</span>
            <input
              type="checkbox"
              checked={draft.featuredOnly}
              onChange={(e) => setDraft({ ...draft, featuredOnly: e.target.checked })}
              className="w-4 h-4 accent-foreground"
            />
          </label>
        </div>

        {/* ── Channels ── */}
        {props.channels && props.onChannelsChange && (
          <div>
            <div className="flex items-center justify-between mb-1.5 px-1">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Channels{" "}
                <span className="normal-case text-muted-foreground/60">
                  {selectedChannels.length > 0 ? `${selectedChannels.length}/${channelList.length}` : `all ${channelList.length}`}
                </span>
              </p>
              {selectedChannels.length > 0 && (
                <button onClick={() => props.onChannelsChange?.([])} className="text-[11px] text-muted-foreground hover:text-foreground">Clear</button>
              )}
            </div>
            <div className="space-y-0.5 max-h-56 overflow-y-auto pr-1">
              {channelList.length === 0 ? (
                <div className="text-xs text-muted-foreground italic px-1">No channels yet</div>
              ) : (
                visibleChannels.map((ch) => (
                  <label key={ch.id} className="flex items-center justify-between gap-2 text-xs py-0.5 px-1 cursor-pointer">
                    <span className="flex items-center gap-2 min-w-0">
                      <input
                        type="checkbox"
                        checked={selectedChannels.includes(ch.id)}
                        onChange={(e) => {
                          const next = e.target.checked
                            ? [...selectedChannels, ch.id]
                            : selectedChannels.filter((s) => s !== ch.id);
                          props.onChannelsChange?.(next);
                        }}
                        className="w-3.5 h-3.5 accent-foreground flex-shrink-0"
                      />
                      <span className="text-foreground truncate">@{ch.username}</span>
                    </span>
                    <span className="text-[11px] text-muted-foreground tabular-nums flex-shrink-0">{ch.video_count}</span>
                  </label>
                ))
              )}
            </div>
            {channelList.length > CHANNELS_VISIBLE_BY_DEFAULT && (
              <button onClick={() => setShowAllChannels((s) => !s)} className="mt-1.5 text-[11px] text-muted-foreground hover:text-foreground underline px-1">
                {showAllChannels ? "Show fewer" : `Show all ${channelList.length}`}
              </button>
            )}
          </div>
        )}

        {/* ── Niche ── */}
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 px-1">Niche</p>
          <div className="space-y-0.5 max-h-56 overflow-y-auto pr-1">
            {visibleNiches.length === 0 ? (
              <div className="text-xs text-muted-foreground italic px-1">No niches yet</div>
            ) : (
              visibleNiches.map((n) => (
                <label key={n.slug} className="flex items-center justify-between gap-2 text-xs py-0.5 px-1 cursor-pointer">
                  <span className="flex items-center gap-2 min-w-0">
                    <input
                      type="checkbox"
                      checked={draft.niches.includes(n.slug)}
                      onChange={(e) => {
                        const next = e.target.checked
                          ? [...draft.niches, n.slug]
                          : draft.niches.filter((s) => s !== n.slug);
                        setDraft({ ...draft, niches: next });
                      }}
                      className="w-3.5 h-3.5 accent-foreground flex-shrink-0"
                    />
                    <span className="text-foreground truncate">{nicheLabel(n.slug)}</span>
                    {!isCanonicalNiche(n.slug) && <span className="text-[10px] text-muted-foreground/60 italic">auto</span>}
                  </span>
                  <span className="text-[11px] text-muted-foreground tabular-nums flex-shrink-0">{n.count}</span>
                </label>
              ))
            )}
          </div>
          {sortedNiches.length > NICHES_VISIBLE_BY_DEFAULT && (
            <button onClick={() => setShowAllNiches((s) => !s)} className="mt-1.5 text-[11px] text-muted-foreground hover:text-foreground underline px-1">
              {showAllNiches ? "Show fewer" : `Show all ${sortedNiches.length}`}
            </button>
          )}
        </div>
      </div>

      {/* ── Apply bar ── */}
      <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2.5 bg-card/60">
        <button
          onClick={reset}
          disabled={activeCount === 0 && !dirty}
          className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"
        >
          Reset{activeCount > 0 ? ` (${activeCount})` : ""}
        </button>
        <Button onClick={apply} size="sm" disabled={!dirty} className="h-7 text-xs">Apply</Button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 px-1">{label}</p>
      {children}
    </div>
  );
}
