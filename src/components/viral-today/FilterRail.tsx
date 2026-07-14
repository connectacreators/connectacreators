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

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { isCanonicalNiche, nicheLabel, CONTENT_FORMATS, type ContentFormat } from "@/lib/video-taxonomy";
// Filter value model (moved here from the retired FiltersPanel popover).
export interface FiltersPanelValue {
  date: string;
  platform: string;
  outlier: string;
  views: string;
  engagement: string;
  source: string;
  featuredOnly: boolean;
  niches: string[];
}

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
  allChannelCount?: number; // union of channels across EVERY list (for the "All watchlists" label)
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

// In-page themed dropdown — replaces native <select> so the menu matches the
// dark UI and never renders as an OS overlay. Expands inline (pushes content
// down) so it can't be clipped by the rail's overflow-y-auto scroll container.
function RailDropdown({ value, onChange, options, footer, ariaLabel }: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  footer?: React.ReactNode;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [open]);
  const selected = options.find((o) => o.value === value);
  return (
    <div ref={ref}>
      <button
        type="button"
        aria-label={ariaLabel}
        onClick={() => setOpen((o) => !o)}
        className={cn(selectClass, "flex items-center justify-between gap-2 text-left", open && "border-primary/50")}
      >
        <span className="truncate">{selected?.label ?? "—"}</span>
        <ChevronDown className={cn("w-3.5 h-3.5 text-muted-foreground transition-transform flex-shrink-0", open && "rotate-180")} />
      </button>
      {open && (
        <div className="mt-1 rounded-md border border-border bg-popover shadow-lg overflow-hidden">
          <div className="max-h-56 overflow-y-auto py-1">
            {options.map((o) => {
              const active = o.value === value;
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => { onChange(o.value); setOpen(false); }}
                  className={cn(
                    "w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-left transition-colors hover:bg-muted",
                    active ? "text-primary bg-primary/10 font-medium" : "text-foreground",
                  )}
                >
                  <Check className={cn("w-3 h-3 flex-shrink-0", active ? "opacity-100" : "opacity-0")} />
                  <span className="truncate">{o.label}</span>
                </button>
              );
            })}
          </div>
          {footer && <div className="border-t border-border p-1.5">{footer}</div>}
        </div>
      )}
    </div>
  );
}

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

        {/* ── Feed mode: Global vs Watchlist ── */}
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
          {props.onManageChannels && (
            <button onClick={props.onManageChannels} className="text-[10px] text-muted-foreground hover:text-foreground mt-1.5 px-1 underline">
              Manage channels
            </button>
          )}
        </div>

        <div className="h-px bg-border" />

        {/* ── Category ── */}
        <Field label="Category">
          <RailDropdown
            ariaLabel="Category"
            value={props.activeFormat}
            onChange={(v) => props.onFormatChange(v as ContentFormat | "all")}
            options={categories.map(({ slug, label }) => {
              const count = props.formatCounts[slug];
              return { value: slug, label: `${label}${typeof count === "number" && count > 0 ? ` (${count})` : ""}` };
            })}
          />
        </Field>

        {/* ── Watchlist (only in watchlist feed mode) ── */}
        {props.feedMode === "watchlist" && (
          <Field label="Watchlist">
            <RailDropdown
              ariaLabel="Watchlist"
              value={props.activeWatchlistId}
              onChange={props.onActiveWatchlistChange}
              options={[
                { value: "all", label: `All watchlists${(props.allChannelCount ?? 0) > 0 ? ` (${props.allChannelCount})` : ""}` },
                ...props.watchlists.map((w) => ({ value: w.id, label: `${w.name} (${w.count})` })),
              ]}
              footer={
                creatingList ? (
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
                  <button onClick={() => setCreatingList(true)} className="w-full text-[11px] text-primary hover:bg-muted rounded px-2 py-1.5 text-left flex items-center gap-1.5">
                    ＋ New list
                  </button>
                )
              }
            />
            {props.watchlists.length === 0 && (
              <p className="text-[10px] text-muted-foreground mt-1.5 px-1 leading-snug">
                No watchlists yet — create one above, then star channels{" "}
                {props.onManageChannels && (
                  <button onClick={props.onManageChannels} className="text-primary hover:underline">in Channels</button>
                )}
                .
              </p>
            )}
          </Field>
        )}

        <div className="h-px bg-border" />

        {/* ── Filters ── */}
        <div className="space-y-3">
          <Field label="Date">
            <RailDropdown ariaLabel="Date" value={draft.date} onChange={(v) => setDraft({ ...draft, date: v })} options={props.dateOptions} />
          </Field>
          <Field label="Platform">
            <RailDropdown ariaLabel="Platform" value={draft.platform} onChange={(v) => setDraft({ ...draft, platform: v })} options={props.platformOptions} />
          </Field>
          <Field label="Outlier score">
            <div className="relative">
              <input
                type="number"
                min="0"
                step="0.5"
                inputMode="decimal"
                aria-label="Minimum outlier score"
                value={draft.outlier === "0" ? "" : draft.outlier}
                onChange={(e) => setDraft({ ...draft, outlier: e.target.value === "" ? "0" : e.target.value })}
                placeholder="Any — e.g. 5"
                className={cn(selectClass, "pr-6")}
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground pointer-events-none">×</span>
            </div>
          </Field>
          <Field label="Views (minimum)">
            <input
              type="number"
              min="0"
              step="1000"
              inputMode="numeric"
              aria-label="Minimum views"
              value={draft.views === "0" ? "" : draft.views}
              onChange={(e) => setDraft({ ...draft, views: e.target.value === "" ? "0" : e.target.value })}
              placeholder="Any — e.g. 100000"
              className={selectClass}
            />
          </Field>
          <Field label="Engagement">
            <RailDropdown ariaLabel="Engagement" value={draft.engagement} onChange={(v) => setDraft({ ...draft, engagement: v })} options={props.engagementOptions} />
          </Field>
          <Field label="Source">
            <RailDropdown ariaLabel="Source" value={draft.source} onChange={(v) => setDraft({ ...draft, source: v })} options={props.sourceOptions} />
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
          <RailDropdown
            ariaLabel="Niche"
            value={nicheValue}
            onChange={(v) => setDraft({ ...draft, niches: v ? [v] : [] })}
            options={[
              { value: "", label: "All niches" },
              ...sortedNiches.map((n) => ({
                value: n.slug,
                label: `${nicheLabel(n.slug)}${isCanonicalNiche(n.slug) ? "" : " (auto)"} (${n.count})`,
              })),
            ]}
          />
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
