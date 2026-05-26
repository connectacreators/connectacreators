// src/components/dashboard/ClientCard.tsx
//
// Medium-density client roster card. Pure presentational.
// Renders only when pendingItems.length > 0 (filter at the parent).

import type { PendingItem } from "@/hooks/useDashboardPendingItems";

interface ClientCardProps {
  clientId: string;
  name: string;
  avatarColor?: string;
  pendingItems: PendingItem[];
  onClick: (clientId: string) => void;
}

function monogramOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "·";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

const PILL_STYLES: Record<PendingItem["variant"], React.CSSProperties> = {
  honey: { background: "hsl(var(--honey) / 0.18)", color: "#6B4D26", border: "1px solid hsl(var(--honey) / 0.50)" },
  aqua:  { background: "hsl(var(--aqua) / 0.18)", color: "#2E5E61", border: "1px solid hsl(var(--aqua) / 0.50)" },
  ink:   { background: "hsl(var(--ink-on-cream) / 0.06)",    color: "hsl(var(--ink-on-cream) / 0.65)", border: "1px solid hsl(var(--ink-on-cream) / 0.18)" },
};

export function ClientCard({ clientId, name, avatarColor = "hsl(var(--aqua))", pendingItems, onClick }: ClientCardProps) {
  return (
    <button
      type="button"
      onClick={() => onClick(clientId)}
      className="text-left transition-transform duration-150"
      style={{
        background: "#ffffff",
        border: "1px solid hsl(var(--ink-on-cream))",
        boxShadow: "2px 2px 0 hsl(var(--ink-on-cream))",
        borderRadius: 12,
        padding: "12px 14px",
        width: "100%",
        cursor: "pointer",
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLButtonElement;
        el.style.boxShadow = "3px 3px 0 hsl(var(--ink-on-cream))";
        el.style.transform = "translate(-1px, -1px)";
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLButtonElement;
        el.style.boxShadow = "2px 2px 0 hsl(var(--ink-on-cream))";
        el.style.transform = "translate(0, 0)";
      }}
    >
      <div className="flex items-center gap-2.5 mb-2">
        <div
          className="flex items-center justify-center font-semibold"
          style={{
            width: 32, height: 32, borderRadius: "50%",
            background: avatarColor, color: "hsl(var(--ink-on-cream))",
            fontSize: 12, flexShrink: 0,
          }}
        >
          {monogramOf(name)}
        </div>
        <span
          style={{ fontSize: 14, fontWeight: 500, color: "hsl(var(--ink-on-cream))", letterSpacing: "-0.005em", fontFamily: "var(--font-display, 'EB Garamond'), Georgia, serif" }}
        >
          {name}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {pendingItems.map((item, i) => (
          <span
            key={i}
            style={{
              ...PILL_STYLES[item.variant],
              fontSize: 10,
              padding: "2px 8px",
              borderRadius: 999,
              fontWeight: 500,
              fontFamily: "var(--font-body, Figtree), sans-serif",
            }}
          >
            {item.label}
          </span>
        ))}
      </div>
    </button>
  );
}
