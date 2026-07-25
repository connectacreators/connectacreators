// src/components/command-deck/SystemVitals.tsx
import { useDeckMetrics } from "@/hooks/useDeckMetrics";

function Bar({ label, value, denom, pct, tone }: { label: string; value: string; denom: string; pct: number; tone: "aqua" | "warn" | "good" }) {
  const fillColor =
    tone === "good" ? "hsl(var(--good, 141 33% 61%))" : tone === "warn" ? "hsl(var(--honey))" : "hsl(var(--aqua))";
  const fillGlow =
    tone === "good"
      ? "0 0 6px hsl(var(--good, 141 33% 61%) / 0.3)"
      : tone === "warn"
        ? "0 0 6px hsl(var(--honey) / 0.3)"
        : "0 0 6px hsl(var(--aqua) / 0.14)";
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[10.5px]" style={{ color: "hsl(var(--bone) / 0.56)" }}>{label}</span>
        <span className="font-mono text-[10.5px] tabular-nums" style={{ color: "hsl(var(--bone))" }}>
          {value}
          <small style={{ color: "hsl(var(--bone) / 0.3)" }}> {denom}</small>
        </span>
      </div>
      <div className="h-[2.5px] rounded-[2px] overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
        <div
          className="h-full rounded-[2px] transition-[width] duration-1000"
          style={{ width: `${Math.min(100, Math.max(0, pct))}%`, background: fillColor, boxShadow: fillGlow }}
        />
      </div>
    </div>
  );
}

export default function SystemVitals() {
  const { loading, scripts, editingQueueOpen, calendar } = useDeckMetrics();

  return (
    <div className="flex flex-col gap-2">
      <div
        className="flex items-center gap-2 font-mono text-[9.5px] uppercase"
        style={{ letterSpacing: "0.22em", color: "hsl(var(--aqua) / 0.5)" }}
      >
        <span
          className="inline-block w-1 h-1 rounded-full"
          style={{ background: "hsl(var(--aqua))", boxShadow: "0 0 6px hsl(var(--aqua) / 0.14)" }}
        />
        System Vitals
      </div>

      {loading ? (
        <div className="text-[10.5px]" style={{ color: "hsl(var(--bone) / 0.3)" }}>Loading…</div>
      ) : (
        <>
          {scripts && (
            <Bar
              label="Scripts this month"
              value={String(scripts.count)}
              denom={`/ ${scripts.target}`}
              pct={scripts.pct}
              tone={scripts.pct >= 80 ? "good" : scripts.pct >= 40 ? "warn" : "warn"}
            />
          )}
          {editingQueueOpen !== null && (
            <Bar
              label="Editing queue load"
              value={String(editingQueueOpen)}
              denom="open"
              pct={Math.min(100, editingQueueOpen * 4)}
              tone="aqua"
            />
          )}
          {calendar && (
            <Bar
              label="Calendar · next 7d"
              value={String(calendar.daysCovered)}
              denom={`/ ${calendar.daysTotal} days`}
              pct={(calendar.daysCovered / calendar.daysTotal) * 100}
              tone={calendar.daysCovered >= 5 ? "good" : "warn"}
            />
          )}
        </>
      )}
    </div>
  );
}
