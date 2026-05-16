// src/components/viral-today/FiltersPanel.tsx
import { useEffect, useRef, useState } from "react";
import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { isCanonicalNiche, nicheLabel } from "@/lib/video-taxonomy";

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

interface NicheOption {
  slug: string;
  count: number;
}

interface FiltersPanelProps {
  value: FiltersPanelValue;
  defaults: FiltersPanelValue;
  onChange: (next: FiltersPanelValue) => void;
  availableNiches: NicheOption[];

  dateOptions: Array<{ value: string; label: string }>;
  platformOptions: Array<{ value: string; label: string }>;
  outlierOptions: Array<{ value: string; label: string }>;
  viewsOptions: Array<{ value: string; label: string }>;
  engagementOptions: Array<{ value: string; label: string }>;
  sourceOptions: Array<{ value: string; label: string }>;
}

const NICHES_VISIBLE_BY_DEFAULT = 8;

export function FiltersPanel(props: FiltersPanelProps) {
  const [open, setOpen] = useState(false);
  const [showAllNiches, setShowAllNiches] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);

  // Local draft state — only commit on Apply.
  const [draft, setDraft] = useState<FiltersPanelValue>(props.value);
  useEffect(() => { setDraft(props.value); }, [props.value]);

  // Outside-click closes the panel WITHOUT applying.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
        setDraft(props.value);  // revert draft
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, props.value]);

  // Active filter count (excluding format — that's separate nav).
  const activeCount = (() => {
    let n = 0;
    const v = props.value;
    const d = props.defaults;
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

  const reset = () => setDraft(props.defaults);
  const apply = () => {
    props.onChange(draft);
    setOpen(false);
  };

  // Sort niches: canonical first, then by count desc, then alphabetic.
  const sortedNiches = [...props.availableNiches].sort((a, b) => {
    const aCanon = isCanonicalNiche(a.slug) ? 1 : 0;
    const bCanon = isCanonicalNiche(b.slug) ? 1 : 0;
    if (aCanon !== bCanon) return bCanon - aCanon;
    if (b.count !== a.count) return b.count - a.count;
    return a.slug.localeCompare(b.slug);
  });
  const visibleNiches = showAllNiches ? sortedNiches : sortedNiches.slice(0, NICHES_VISIBLE_BY_DEFAULT);

  return (
    <div ref={panelRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex items-center gap-2 px-3 py-1.5 text-sm rounded-md border transition-colors",
          activeCount > 0
            ? "border-foreground text-foreground bg-muted/40"
            : "border-border text-muted-foreground hover:text-foreground",
        )}
      >
        <SlidersHorizontal className="w-3.5 h-3.5" />
        Filters
        {activeCount > 0 && (
          <span className="ml-1 px-1.5 py-0.5 rounded-full bg-foreground text-background text-[10px] tabular-nums">
            {activeCount}
          </span>
        )}
        <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-[360px] max-h-[70vh] overflow-y-auto rounded-xl border border-border bg-popover shadow-lg z-30 p-4 space-y-3">

          <FilterRow label="Date">
            <select value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} className={selectClass}>
              {props.dateOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </FilterRow>

          <FilterRow label="Platform">
            <select value={draft.platform} onChange={(e) => setDraft({ ...draft, platform: e.target.value })} className={selectClass}>
              {props.platformOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </FilterRow>

          <FilterRow label="Outlier">
            <select value={draft.outlier} onChange={(e) => setDraft({ ...draft, outlier: e.target.value })} className={selectClass}>
              {props.outlierOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </FilterRow>

          <FilterRow label="Views">
            <select value={draft.views} onChange={(e) => setDraft({ ...draft, views: e.target.value })} className={selectClass}>
              {props.viewsOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </FilterRow>

          <FilterRow label="Engagement">
            <select value={draft.engagement} onChange={(e) => setDraft({ ...draft, engagement: e.target.value })} className={selectClass}>
              {props.engagementOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </FilterRow>

          <FilterRow label="Source">
            <select value={draft.source} onChange={(e) => setDraft({ ...draft, source: e.target.value })} className={selectClass}>
              {props.sourceOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </FilterRow>

          <FilterRow label="Featured only">
            <input
              type="checkbox"
              checked={draft.featuredOnly}
              onChange={(e) => setDraft({ ...draft, featuredOnly: e.target.checked })}
              className="w-4 h-4 accent-foreground"
            />
          </FilterRow>

          <div className="border-t border-border pt-3">
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Niche</div>
            <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
              {visibleNiches.length === 0 ? (
                <div className="text-xs text-muted-foreground italic">No niches yet — analyze some videos first</div>
              ) : (
                visibleNiches.map((n) => (
                  <label key={n.slug} className="flex items-center justify-between gap-2 text-sm py-0.5 cursor-pointer">
                    <span className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={draft.niches.includes(n.slug)}
                        onChange={(e) => {
                          const next = e.target.checked
                            ? [...draft.niches, n.slug]
                            : draft.niches.filter((s) => s !== n.slug);
                          setDraft({ ...draft, niches: next });
                        }}
                        className="w-3.5 h-3.5 accent-foreground"
                      />
                      <span className="text-foreground">{nicheLabel(n.slug)}</span>
                      {!isCanonicalNiche(n.slug) && (
                        <span className="text-[10px] text-muted-foreground/60 italic">auto</span>
                      )}
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums">{n.count}</span>
                  </label>
                ))
              )}
            </div>
            {sortedNiches.length > NICHES_VISIBLE_BY_DEFAULT && (
              <button
                onClick={() => setShowAllNiches((s) => !s)}
                className="mt-2 text-xs text-muted-foreground hover:text-foreground underline"
              >
                {showAllNiches ? "Show fewer" : `Show all ${sortedNiches.length} niches`}
              </button>
            )}
          </div>

          <div className="border-t border-border pt-3 flex items-center justify-between">
            <button onClick={reset} className="text-xs text-muted-foreground hover:text-foreground">
              Reset
            </button>
            <Button onClick={apply} size="sm">Apply</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

const selectClass = "h-8 rounded-md border border-border bg-background text-sm px-2 text-foreground min-w-[160px]";
