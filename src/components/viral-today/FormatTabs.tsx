// src/components/viral-today/FormatTabs.tsx
import { cn } from "@/lib/utils";
import { CONTENT_FORMATS, type ContentFormat } from "@/lib/video-taxonomy";

interface FormatTabsProps {
  active: ContentFormat | "all";
  onChange: (format: ContentFormat | "all") => void;
  counts: Partial<Record<ContentFormat | "all", number>>;
}

export function FormatTabs({ active, onChange, counts }: FormatTabsProps) {
  const tabs: Array<{ slug: ContentFormat | "all"; label: string }> = [
    { slug: "all", label: "All" },
    ...CONTENT_FORMATS.map((f) => ({ slug: f.slug, label: f.label })),
  ];

  return (
    <div className="flex items-center gap-1 border-b border-border overflow-x-auto">
      {tabs.map(({ slug, label }) => {
        const count = counts[slug];
        const isActive = active === slug;
        return (
          <button
            key={slug}
            onClick={() => onChange(slug)}
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
      })}
    </div>
  );
}
