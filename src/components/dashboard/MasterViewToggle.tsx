// src/components/dashboard/MasterViewToggle.tsx
//
// Segmented Clients/Tasks control for the admin master dashboard, plus a small
// hook that persists the choice to localStorage (default: clients).

import { useCallback, useState } from "react";
import { LayoutGrid, ListChecks } from "lucide-react";

export type MasterView = "clients" | "tasks";
const STORAGE_KEY = "dashboard.masterView";

export function useMasterView(): [MasterView, (v: MasterView) => void] {
  const [view, setView] = useState<MasterView>(() => {
    if (typeof window === "undefined") return "clients";
    return window.localStorage.getItem(STORAGE_KEY) === "tasks" ? "tasks" : "clients";
  });
  const set = useCallback((v: MasterView) => {
    setView(v);
    try { window.localStorage.setItem(STORAGE_KEY, v); } catch { /* ignore */ }
  }, []);
  return [view, set];
}

const OPTIONS: Array<{ value: MasterView; label: string; Icon: typeof LayoutGrid }> = [
  { value: "clients", label: "Clients", Icon: LayoutGrid },
  { value: "tasks",   label: "Tasks",   Icon: ListChecks },
];

export function MasterViewToggle({ view, onChange }: { view: MasterView; onChange: (v: MasterView) => void }) {
  return (
    <div
      role="tablist"
      aria-label="Dashboard view"
      style={{ display: 'inline-flex', background: 'hsl(var(--ink-on-cream) / 0.06)', borderRadius: 999, padding: 3 }}
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        const on = view === value;
        return (
          <button
            key={value}
            role="tab"
            aria-selected={on}
            onClick={() => onChange(value)}
            style={{
              border: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 14px', borderRadius: 999,
              font: "600 12px/1 var(--font-body, Figtree), sans-serif",
              background: on ? 'hsl(var(--ink-on-cream))' : 'transparent',
              color: on ? 'hsl(var(--cream))' : 'hsl(var(--ink-on-cream) / 0.55)',
              boxShadow: on ? '0 1px 3px hsl(var(--ink-on-cream) / 0.18)' : 'none',
              transition: 'background .15s, color .15s',
            }}
          >
            <Icon size={14} strokeWidth={2} />
            {label}
          </button>
        );
      })}
    </div>
  );
}
