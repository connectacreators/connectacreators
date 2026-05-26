// src/components/dashboard/PromptCard.tsx
//
// AI prompt sticker card for the dashboard. Pure presentational.
// Lucide icons are placeholders — swap for hand-drawn doodle SVGs later.

import type { LucideIcon } from "lucide-react";

interface PromptCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
  onClick: () => void;
}

export function PromptCard({ icon: Icon, title, description, onClick }: PromptCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left transition-transform duration-150"
      style={{
        background: "#ffffff",
        border: "1px solid hsl(var(--ink-on-cream))",
        boxShadow: "3px 3px 0 hsl(var(--ink-on-cream))",
        borderRadius: 12,
        padding: 14,
        width: "100%",
        cursor: "pointer",
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLButtonElement;
        el.style.boxShadow = "4px 4px 0 hsl(var(--ink-on-cream))";
        el.style.transform = "translate(-1px, -1px)";
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLButtonElement;
        el.style.boxShadow = "3px 3px 0 hsl(var(--ink-on-cream))";
        el.style.transform = "translate(0, 0)";
      }}
    >
      <div style={{ height: 28, marginBottom: 8, display: "flex", alignItems: "center" }}>
        <Icon size={22} strokeWidth={1.5} color="hsl(var(--ink-on-cream))" />
      </div>
      <div
        style={{ fontSize: 15, fontWeight: 500, color: "hsl(var(--ink-on-cream))", letterSpacing: "-0.005em", marginBottom: 3, fontFamily: "var(--font-display, 'EB Garamond'), Georgia, serif" }}
      >
        {title}
      </div>
      <div
        style={{
          fontSize: 11,
          color: "hsl(var(--ink-on-cream) / 0.55)",
          lineHeight: 1.4,
          fontFamily: "var(--font-body, Figtree), sans-serif",
        }}
      >
        {description}
      </div>
    </button>
  );
}
