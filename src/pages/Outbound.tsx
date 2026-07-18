import { useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, Loader2, Minus, Plus, Send, UserPlus } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  OUTBOUND_PLATFORMS, STAGE_FIELDS, computeRates, pct,
  useOutboundMonth, useOutboundYear, EMPTY_COUNTS,
} from "@/hooks/useOutboundMetrics";

// Admin-only outbound DM funnel tracker, modeled on the "2026 INSTAGRAM DM
// Metrics Tracker" spreadsheet, generalized per platform. Mobile-first:
// counts are big tap-steppers, rates are chips, the annual grid scrolls.

const PLATFORM_LABEL: Record<string, string> = {
  instagram: "Instagram", tiktok: "TikTok", facebook: "Facebook", linkedin: "LinkedIn", x: "X",
};

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function shiftMonth(month: string, delta: -1 | 1): string {
  const [y, m] = month.split("-").map(Number);
  const next = new Date(y, m - 1 + delta, 1);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
}
const monthLabel = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
};

export default function Outbound() {
  const { isAdmin, loading: authLoading } = useAuth();
  const [platform, setPlatform] = useState<string>("instagram");
  const [view, setView] = useState<"month" | "annual">("month");
  const [month, setMonth] = useState(currentMonth());
  const [year, setYear] = useState(new Date().getFullYear());

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  return (
    <div className="min-h-screen">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Send className="w-5 h-5 text-primary" />
            <h1 className="text-2xl font-bold text-foreground">Outbound</h1>
          </div>
          <div className="flex items-center gap-0 rounded-xl border border-border/60 bg-card/60 p-1">
            <Button variant={view === "month" ? "cta" : "ghost"} size="sm" className="h-8 px-3 text-xs" onClick={() => setView("month")}>
              Monthly
            </Button>
            <Button variant={view === "annual" ? "cta" : "ghost"} size="sm" className="h-8 px-3 text-xs" onClick={() => setView("annual")}>
              Annual
            </Button>
          </div>
        </div>

        {/* Platform tabs — horizontal scroll on phones */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
          {OUTBOUND_PLATFORMS.map((p) => (
            <button
              key={p}
              onClick={() => setPlatform(p)}
              className={`shrink-0 h-9 px-4 rounded-full text-xs font-semibold transition-colors border ${
                platform === p
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card/60 text-muted-foreground border-border/60 hover:text-foreground"
              }`}
            >
              {PLATFORM_LABEL[p]}
            </button>
          ))}
        </div>

        {view === "month" ? (
          <MonthView platform={platform} month={month} onShift={(d) => setMonth((m) => shiftMonth(m, d))} />
        ) : (
          <AnnualView platform={platform} year={year} onShift={(d) => setYear((y) => y + d)} />
        )}
      </div>
    </div>
  );
}

// ── Monthly entry + rates ──────────────────────────────────────────────────────

function MonthView({ platform, month, onShift }: { platform: string; month: string; onShift: (d: -1 | 1) => void }) {
  const { counts, update, loading, saving } = useOutboundMonth(platform, month);
  const rates = useMemo(() => computeRates(counts), [counts]);

  return (
    <div className="space-y-4">
      {/* Month nav */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 rounded-xl border border-border/60 bg-card/60 p-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onShift(-1)}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="px-2 text-sm font-medium text-foreground min-w-32 text-center">{monthLabel(month)}</span>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onShift(1)}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
        <span className="text-[10px] text-muted-foreground">{saving ? "Saving…" : "Saved"}</span>
      </div>

      {loading ? (
        <div className="py-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          {/* Funnel counters */}
          <div className="rounded-2xl border border-border bg-card/60 divide-y divide-border/40">
            {STAGE_FIELDS.map((f) => (
              <CounterRow
                key={f.key}
                label={f.label}
                code={f.code}
                value={counts[f.key]}
                onChange={(v) => update(f.key, v)}
              />
            ))}
          </div>

          {/* Follows */}
          <div className="rounded-2xl border border-border bg-card/60 divide-y divide-border/40">
            <CounterRow label="Follows" code={<UserPlus className="w-3.5 h-3.5" />} value={counts.follows} onChange={(v) => update("follows", v)} />
            <CounterRow label="Follow-backs" code="FB" value={counts.follow_backs} onChange={(v) => update("follow_backs", v)} />
            <div className="flex items-center justify-between px-4 py-2.5">
              <span className="text-xs text-muted-foreground">FBR% (follow-back rate)</span>
              <span className="text-sm font-semibold tabular-nums text-foreground">{rates.fbr}</span>
            </div>
          </div>

          {/* Rates */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <RateCard title="Overall Conversion (from A1)" rows={rates.overall.map((r) => ({ label: r.label, value: r.value, hint: r.hint }))} />
            <RateCard title="Stage → Stage" rows={rates.steps.map((r) => ({ label: r.label, value: r.value }))} />
          </div>
        </>
      )}
    </div>
  );
}

function CounterRow({ label, code, value, onChange }: {
  label: string; code: React.ReactNode; value: number; onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 px-4 py-2">
      <div className="flex items-center gap-2 min-w-0">
        <span className="shrink-0 w-9 text-center text-[10px] font-bold uppercase tracking-wide text-muted-foreground/70 bg-muted/40 rounded-md py-1">
          {code}
        </span>
        <span className="text-sm text-foreground truncate">{label}</span>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <Button variant="ghost" size="icon" className="h-10 w-10 rounded-xl border border-border/50" onClick={() => onChange(value - 1)}>
          <Minus className="w-4 h-4" />
        </Button>
        <input
          type="number"
          inputMode="numeric"
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-14 h-10 rounded-xl border border-border/50 bg-background text-center text-sm font-semibold tabular-nums text-foreground focus:outline-none focus:border-primary/50"
        />
        <Button variant="ghost" size="icon" className="h-10 w-10 rounded-xl border border-border/50" onClick={() => onChange(value + 1)}>
          <Plus className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

function RateCard({ title, rows }: { title: string; rows: { label: string; value: string; hint?: string }[] }) {
  return (
    <div className="rounded-2xl border border-border bg-card/60 p-4">
      <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2.5">{title}</h3>
      <dl className="space-y-1.5">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between gap-2" title={r.hint}>
            <dt className="text-xs text-muted-foreground">{r.label}</dt>
            <dd className="text-sm font-semibold tabular-nums text-foreground">{r.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

// ── Annual dashboard (months × metrics, like the spreadsheet) ─────────────────

function AnnualView({ platform, year, onShift }: { platform: string; year: number; onShift: (d: -1 | 1) => void }) {
  const { rows, loading } = useOutboundYear(platform, year);

  const byMonth = useMemo(() => {
    const map = new Map(rows.map((r) => [r.month, r]));
    return Array.from({ length: 12 }, (_, i) => {
      const m = `${year}-${String(i + 1).padStart(2, "0")}`;
      return { month: m, data: map.get(m) ?? null };
    });
  }, [rows, year]);

  const totals = useMemo(() => {
    const t = { ...EMPTY_COUNTS };
    for (const r of rows) for (const k of Object.keys(t) as (keyof typeof EMPTY_COUNTS)[]) t[k] += r[k];
    return t;
  }, [rows]);
  const totalRates = useMemo(() => computeRates(totals), [totals]);

  const short = (m: string) => new Date(year, Number(m.slice(5)) - 1, 1).toLocaleDateString("en-US", { month: "short" });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1 rounded-xl border border-border/60 bg-card/60 p-1 w-fit">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onShift(-1)}>
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <span className="px-2 text-sm font-medium text-foreground">{year}</span>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onShift(1)}>
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>

      {loading ? (
        <div className="py-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          <div className="rounded-2xl border border-border bg-card/60 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border/60 text-muted-foreground">
                    <th className="px-3 py-2.5 text-left font-medium sticky left-0 bg-card">Stage</th>
                    {byMonth.map(({ month }) => (
                      <th key={month} className="px-2.5 py-2.5 text-right font-medium">{short(month)}</th>
                    ))}
                    <th className="px-3 py-2.5 text-right font-semibold text-foreground/80">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {STAGE_FIELDS.map((f) => (
                    <tr key={f.key} className="border-b border-border/30 last:border-0">
                      <td className="px-3 py-2 text-foreground whitespace-nowrap sticky left-0 bg-card">
                        {f.label} <span className="text-muted-foreground/60">({f.code})</span>
                      </td>
                      {byMonth.map(({ month, data }) => (
                        <td key={month} className={`px-2.5 py-2 text-right tabular-nums ${data ? "text-foreground/90" : "text-muted-foreground/40"}`}>
                          {data ? data[f.key] : "—"}
                        </td>
                      ))}
                      <td className="px-3 py-2 text-right tabular-nums font-semibold text-foreground">{totals[f.key]}</td>
                    </tr>
                  ))}
                  {/* Rate rows across the year */}
                  {([
                    ["IMSR", (c: typeof EMPTY_COUNTS) => pct(c.message_seen, c.pre_initiated)],
                    ["IR", (c: typeof EMPTY_COUNTS) => pct(c.initiated, c.pre_initiated)],
                    ["PRR", (c: typeof EMPTY_COUNTS) => pct(c.engaged, c.pre_initiated)],
                    ["CSR", (c: typeof EMPTY_COUNTS) => pct(c.calendly_sent, c.pre_initiated)],
                    ["ABR", (c: typeof EMPTY_COUNTS) => pct(c.booked, c.pre_initiated)],
                    ["FBR%", (c: typeof EMPTY_COUNTS) => pct(c.follow_backs, c.follows)],
                  ] as [string, (c: typeof EMPTY_COUNTS) => string][]).map(([label, fn]) => (
                    <tr key={label} className="border-b border-border/30 last:border-0 bg-muted/20">
                      <td className="px-3 py-2 text-muted-foreground whitespace-nowrap sticky left-0 bg-card">{label}</td>
                      {byMonth.map(({ month, data }) => (
                        <td key={month} className="px-2.5 py-2 text-right tabular-nums text-muted-foreground">
                          {data ? fn(data) : "—"}
                        </td>
                      ))}
                      <td className="px-3 py-2 text-right tabular-nums font-semibold text-foreground/80">{fn(totals)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Year headline chips */}
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {STAGE_FIELDS.map((f) => (
              <div key={f.key} className="rounded-xl border border-border/60 bg-card/60 px-3 py-2">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{f.code}</div>
                <div className="text-base font-semibold tabular-nums text-foreground">{totals[f.key]}</div>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground/70">
            Booked rate for {year}: <span className="text-foreground font-medium">{totalRates.overall[4].value}</span> of pre-initiated prospects on {PLATFORM_LABEL_FALLBACK(platform)}.
          </p>
        </>
      )}
    </div>
  );
}

function PLATFORM_LABEL_FALLBACK(p: string) {
  return { instagram: "Instagram", tiktok: "TikTok", facebook: "Facebook", linkedin: "LinkedIn", x: "X" }[p] ?? p;
}
