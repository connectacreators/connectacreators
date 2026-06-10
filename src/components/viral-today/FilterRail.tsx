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

  // Feed mode — global (all channels) vs one of the user's named watchlists.
  feedMode: "global" | "watchlist";
  onFeedModeChange: (m: "global" | "watchlist") => void;
  watchlistCount: number; // channels in the active list selection
  watchlists: { id: string; name: string; count: number }[];
  activeWatchlistId: string; // "all" | listId
  onActiveWatchlistChange: (id: string) => void;
  onCreateList: (name: string) => Promise<string | null>;
  onManageChannels?: () => void;

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
  const [newListName, setNewListName] = useState("");
  const [creatingList, setCreatingList] = useState(false);
  useEffect(() => { setDraft(props.value); }, [props.value]);

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
  const nicheValue = draft.niches[0] ?? "";

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-5">

        {/* ── Feed mode: Global vs Your Watchlist ── */}
        <div>
          <div className="flex items-center gap-1 p-0.5 rounded-lg bg-muted/60 border border-border">
            {(["global", "watchlist"] as const).map((m) => (
              <button
                key={m}
                onClick={() => props.onFeedModeChange(m)}
                className={
                  "flex-1 h-7 rounded-md text-[11px] font-medium transition-colors " +
                  (props.feedMode === m
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground")
                }
              >
                {m === "global" ? "Global" : `Watchlist${props.watchlistCount > 0 ? ` (${props.watchlistCount})` : ""}`}
              </button>
            ))}
          </div>
          {/* List selector — only in watchlist mode */}
          {props.feedMode === "watchlist" && (
            <div className="mt-1.5 space-y-1.5">
              <select
                value={props.activeWatchlistId}
                onChange={(e) => props.onActiveWatchlistChange(e.target.value)}
                className="w-full h-7 px-2 bg-input border border-border rounded-md text-[11px] font-medium text-foreground focus:outline-none focus:border-primary/50"
              >
                <option value="all">All watchlists{props.watchlistCount > 0 ? ` (${props.watchlistCount})` : ""}</option>
                {props.watchlists.map((w) => (
                  <option key={w.id} value={w.id}>{w.name} ({w.count})</option>
                ))}
              </select>
              {creatingList ? (
                <div className="flex items-center gap-1">
                  <input
                    autoFocus
                    value={newListName}
                    onChange={(e) => setNewListName(e.target.value)}
                    onKeyDown={async (e) => {
                      if (e.key === "Enter" && newListName.trim()) {
                        const id = await props.onCreateList(newListName);
                        if (id) { props.onActiveWatchlistChange(id); setNewListName(""); setCreatingList(false); }
                      }
                      if (e.key === "Escape") { setCreatingList(false); setNewListName(""); }
                    }}
                    placeholder="List name…"
                    className="flex-1 h-7 px-2 bg-input border border-border rounded-md text-[11px] text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/50"
                  />
                  <button
                    onClick={async () => {
                      if (!newListName.trim()) return;
                      const id = await props.onCreateList(newListName);
                      if (id) { props.onActiveWatchlistChange(id); setNewListName(""); setCreatingList(false); }
                    }}
                    className="text-[10px] px-2 h-7 rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    Add
                  </button>
                </div>
              ) : (
                <button onClick={() => setCreatingList(true)} className="text-[10px] text-primary hover:underline px-1">＋ New list</button>
              )}
            </div>
          )}
          {props.feedMode === "watchlist" && props.watchlists.length === 0 && !creatingList && (
            <p className="text-[10px] text-muted-foreground mt-1.5 px-1 leading-snug">
              No watchlists yet — create one above, then star channels{" "}
              {props.onManageChannels && (
                <button onClick={props.onManageChannels} className="text-primary hover:underline">in Channels</button>
              )}
              .
            </p>
          )}
          {props.onManageChannels && (props.feedMode === "global" || props.watchlistCount > 0) && (
            <button onClick={props.onManageChannels} className="text-[10px] text-muted-foreground hover:text-foreground mt-1.5 px-1 underline">
              Manage channels
            </button>
          )}
        </div>

        <div className="h-px bg-border" />

        {/* ── Category ── */}
        <Field label="Category">
          <select
            value={props.activeFormat}
            onChange={(e) => props.onFormatChange(e.target.value as ContentFormat | "all")}
            className={selectClass}
          >
            {categories.map(({ slug, label }) => {
              const count = props.formatCounts[slug];
              return (
                <option key={slug} value={slug}>
                  {label}{typeof count === "number" && count > 0 ? ` (${count})` : ""}
                </option>
              );
            })}
          </select>
        </Field>

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

        {/* ── Niche (single-select dropdown) ── */}
        <Field label="Niche">
          <select
            value={nicheValue}
            onChange={(e) => setDraft({ ...draft, niches: e.target.value ? [e.target.value] : [] })}
            className={selectClass}
          >
            <option value="">All niches</option>
            {sortedNiches.map((n) => (
              <option key={n.slug} value={n.slug}>
                {nicheLabel(n.slug)}{isCanonicalNiche(n.slug) ? "" : " (auto)"} ({n.count})
              </option>
            ))}
          </select>
        </Field>
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
