// src/components/viral-today/FormatTabs.tsx
import { useState, useRef, useEffect } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { CONTENT_FORMATS, type ContentFormat } from "@/lib/video-taxonomy";

interface FormatTabsProps {
  active: ContentFormat | "all";
  onChange: (format: ContentFormat | "all") => void;
  counts: Partial<Record<ContentFormat | "all", number>>;
}

const VISIBLE_TABS_DESKTOP = 7;  // All + 6 most common; rest collapse to "More" on narrow screens

export function FormatTabs({ active, onChange, counts }: FormatTabsProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement | null>(null);

  // Close "More" dropdown on outside click.
  useEffect(() => {
    if (!moreOpen) return;
    const handler = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [moreOpen]);

  const tabs: Array<{ slug: ContentFormat | "all"; label: string }> = [
    { slug: "all", label: "All" },
    ...CONTENT_FORMATS.map((f) => ({ slug: f.slug, label: f.label })),
  ];

  // Promote the active tab into the visible row if it's currently in "More".
  let visible = tabs.slice(0, VISIBLE_TABS_DESKTOP);
  let overflow = tabs.slice(VISIBLE_TABS_DESKTOP);
  if (overflow.some((t) => t.slug === active)) {
    const promoted = overflow.find((t) => t.slug === active)!;
    const demoted = visible[VISIBLE_TABS_DESKTOP - 1];
    overflow = overflow.filter((t) => t.slug !== active);
    visible = [...visible.slice(0, VISIBLE_TABS_DESKTOP - 1), promoted];
    overflow = [...overflow, demoted];
  }

  const renderTab = (slug: ContentFormat | "all", label: string) => {
    const count = counts[slug];
    const isActive = active === slug;
    return (
      <button
        key={slug}
        onClick={() => { onChange(slug); setMoreOpen(false); }}
        className={cn(
          "flex items-center gap-1.5 px-3 py-2 text-sm whitespace-nowrap transition-colors",
          isActive
            ? "text-foreground border-b-2 border-foreground font-medium"
            : "text-muted-foreground hover:text-foreground border-b-2 border-transparent",
        )}
      >
        <span>{label}</span>
        {typeof count === "number" && count > 0 && (
          <span className="text-xs text-muted-foreground/70 tabular-nums">{count}</span>
        )}
      </button>
    );
  };

  // The visible tab row needs overflow-x-auto so narrow viewports can scroll
  // through tabs. But that would also clip the absolutely-positioned "More"
  // dropdown, so the More button + popup live OUTSIDE the scrolling container.
  return (
    <div className="flex items-stretch border-b border-border">
      <div className="flex items-center gap-1 overflow-x-auto flex-1 min-w-0">
        {visible.map((t) => renderTab(t.slug, t.label))}
      </div>

      {overflow.length > 0 && (
        <div ref={moreRef} className="relative flex-shrink-0">
          <button
            onClick={() => setMoreOpen((o) => !o)}
            className={cn(
              "flex items-center gap-1 px-3 py-2 text-sm whitespace-nowrap border-b-2 border-transparent transition-colors h-full",
              moreOpen || overflow.some((t) => t.slug === active)
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            More
            <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", moreOpen && "rotate-180")} />
          </button>
          {moreOpen && (
            <div className="absolute right-0 mt-1 w-48 rounded-lg border border-border bg-popover shadow-lg z-30 py-1">
              {overflow.map((t) => {
                const count = counts[t.slug];
                return (
                  <button
                    key={t.slug}
                    onClick={() => { onChange(t.slug); setMoreOpen(false); }}
                    className={cn(
                      "w-full flex items-center justify-between px-3 py-1.5 text-sm transition-colors",
                      active === t.slug ? "text-foreground bg-muted/50 font-medium" : "text-muted-foreground hover:bg-muted/50",
                    )}
                  >
                    <span>{t.label}</span>
                    {typeof count === "number" && count > 0 && (
                      <span className="text-xs text-muted-foreground/70 tabular-nums">{count}</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
