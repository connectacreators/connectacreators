// src/components/dashboard/ActiveClientBreadcrumb.tsx
//
// Top breadcrumb shown when the dashboard is scoped to a specific client.
// Clicking the × or the "Agency" link removes the ?client= query param.

import { Link, useNavigate } from "react-router-dom";
import { X } from "lucide-react";

interface ActiveClientBreadcrumbProps {
  clientName: string;
  avatarColor?: string;
}

function monogramOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "·";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function ActiveClientBreadcrumb({ clientName, avatarColor = "hsl(var(--aqua))" }: ActiveClientBreadcrumbProps) {
  const navigate = useNavigate();
  const unscope = () => navigate("/dashboard");

  return (
    <div className="flex items-center gap-2 mb-3" style={{ fontSize: 11, color: "hsl(var(--ink-on-cream) / 0.55)" }}>
      <Link to="/dashboard" style={{ color: "hsl(var(--ink-on-cream) / 0.55)" }} className="hover:underline">
        Agency
      </Link>
      <span>/</span>
      <button
        type="button"
        onClick={unscope}
        className="inline-flex items-center gap-1.5"
        style={{
          background: "#ffffff",
          border: "1px solid hsl(var(--ink-on-cream))",
          boxShadow: "1px 1px 0 hsl(var(--ink-on-cream))",
          padding: "3px 10px",
          borderRadius: 999,
          fontSize: 11,
          color: "hsl(var(--ink-on-cream))",
          cursor: "pointer",
        }}
        title="Back to agency view"
      >
        <span
          className="flex items-center justify-center"
          style={{
            width: 16, height: 16, borderRadius: "50%",
            background: avatarColor, color: "hsl(var(--ink-on-cream))",
            fontSize: 8, fontWeight: 600,
          }}
        >
          {monogramOf(clientName)}
        </span>
        <span>{clientName}</span>
        <X size={11} style={{ color: "hsl(var(--ink-on-cream) / 0.45)" }} />
      </button>
    </div>
  );
}
