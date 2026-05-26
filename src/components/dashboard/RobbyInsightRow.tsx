// src/components/dashboard/RobbyInsightRow.tsx
//
// AI-narrated insight row on the client-scoped dashboard view.
// Renders a small ink icon in an Aqua-tinted circle + plain-English
// insight text + an action link. Click → handed off to the AI drawer.

import type { LucideIcon } from "lucide-react";

interface RobbyInsightRowProps {
  icon: LucideIcon;
  text: React.ReactNode;
  actionLabel: string;
  onClick: () => void;
}

export function RobbyInsightRow({ icon: Icon, text, actionLabel, onClick }: RobbyInsightRowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left transition-transform duration-150"
      style={{
        background: "#ffffff",
        border: "1px solid hsl(var(--ink-on-cream))",
        boxShadow: "2px 2px 0 hsl(var(--ink-on-cream))",
        borderRadius: 10,
        padding: "11px 12px",
        marginBottom: 7,
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
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
      <div
        className="flex items-center justify-center flex-shrink-0"
        style={{
          width: 22, height: 22, borderRadius: "50%",
          background: "hsl(var(--aqua) / 0.20)",
          border: "1px solid hsl(var(--ink-on-cream))",
        }}
      >
        <Icon size={12} strokeWidth={1.5} color="hsl(var(--ink-on-cream))" />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12, color: "hsl(var(--ink-on-cream))", lineHeight: 1.45 }}>{text}</div>
        <div style={{ fontSize: 10, color: "#2E5E61", marginTop: 3, fontWeight: 500 }}>
          {actionLabel}
        </div>
      </div>
    </button>
  );
}
