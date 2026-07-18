import { useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import {
  ChevronLeft, ChevronRight, Loader2, Minus, Plus, Send,
  Instagram, Facebook, Linkedin, Crosshair, CheckCheck,
  MessagesSquare, CalendarClock, CalendarCheck2, UserPlus, UserCheck,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  STAGE_FIELDS, computeRates, pct,
  useOutboundMonth, useOutboundYear, EMPTY_COUNTS,
} from "@/hooks/useOutboundMetrics";
import { TikTokIcon } from "@/lib/viral-card-utils";

// Admin-only outbound DM funnel tracker, modeled on the "2026 INSTAGRAM DM
// Metrics Tracker" spreadsheet, generalized per platform. Mobile-first:
// counts are big tap-steppers behind a live funnel readout; platform tabs
// carry the real brand glyphs.

// TikTok comes from the shared viral-card icon set; lucide has no X logo,
// so that one stays a local inline SVG.
function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.451-6.231zm-1.161 17.52h1.833L7.084 4.126H5.117l11.966 15.644z" />
    </svg>
  );
}

const PLATFORMS: { key: string; label: string; icon: React.ElementType }[] = [
  { key: "instagram", label: "Instagram", icon: Instagram },
  { key: "tiktok", label: "TikTok", icon: TikTokIcon },
  { key: "facebook", label: "Facebook", icon: Facebook },
  { key: "linkedin", label: "LinkedIn", icon: Linkedin },
  { key: "x", label: "X", icon: XIcon },
];

// DM-native stage icons: crosshair = prospect targeted, double-check =
// read receipt, paper plane = DM sent, speech = conversation, calendar
// clock = link sent, calendar check = call on the books.
const STAGE_ICON: Record<string, React.ElementType> = {
  pre_initiated: Crosshair,
  message_seen: CheckCheck,
  initiated: Send,
  engaged: MessagesSquare,
  calendly_sent: CalendarClock,
  booked: CalendarCheck2,
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

        {/* Platform tabs — brand glyphs, horizontal scroll on phones */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
          {PLATFORMS.map((p) => {
            const Icon = p.icon;
            const active = platform === p.key;
            return (
              <button
                key={p.key}
                onClick={() => setPlatform(p.key)}
                className={`shrink-0 h-10 pl-3 pr-4 rounded-full text-xs font-semibold transition-colors border inline-flex items-center gap-2 ${
                  active
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card/60 text-muted-foreground border-border/60 hover:text-foreground"
                }`}
              >
                <Icon className="w-4 h-4" />
                {p.label}
              </button>
            );
          })}
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

// ── Monthly entry: live funnel + steppers + rate blocks ───────────────────────

function MonthView({ platform, month, onShift }: { platform: string; month: string; onShift: (d: -1 | 1) => void }) {
  const { counts, update, loading, saving } = useOutboundMonth(platform, month);
  const rates = useMemo(() => computeRates(counts), [counts]);
  const funnelBase = Math.max(counts.pre_initiated, 1);

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
          {/* Funnel counters — each row carries its share-of-A1 bar, so the
              narrowing funnel is visible while you log. */}
          <div className="rounded-2xl border border-border bg-card/60 divide-y divide-border/40">
            {STAGE_FIELDS.map((f, i) => {
              const Icon = STAGE_ICON[f.key];
              const share = counts.pre_initiated > 0 ? Math.min(100, (counts[f.key] / funnelBase) * 100) : 0;
              return (
                <div key={f.key} className="px-4 pt-2 pb-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Icon className="w-4 h-4 shrink-0 text-primary/80" />
                      <span className="text-sm text-foreground truncate">{f.label}</span>
                      <span className="shrink-0 text-[9px] font-bold uppercase tracking-wide text-muted-foreground/60">{f.code}</span>
                    </div>
                    <Stepper value={counts[f.key]} onChange={(v) => update(f.key, v)} />
                  </div>
                  <div className="mt-1.5 h-1 rounded-full bg-muted/40 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary transition-[width] duration-300"
                      style={{ width: `${share}%`, opacity: 0.35 + 0.65 * ((STAGE_FIELDS.length - i) / STAGE_FIELDS.length) }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Follows */}
          <div className="rounded-2xl border border-border bg-card/60 divide-y divide-border/40">
            <div className="flex items-center justify-between gap-2 px-4 py-2">
              <div className="flex items-center gap-2.5"><UserPlus className="w-4 h-4 text-primary/80" /><span className="text-sm text-foreground">Follows</span></div>
              <Stepper value={counts.follows} onChange={(v) => update("follows", v)} />
            </div>
            <div className="flex items-center justify-between gap-2 px-4 py-2">
              <div className="flex items-center gap-2.5"><UserCheck className="w-4 h-4 text-primary/80" /><span className="text-sm text-foreground">Follow-backs</span></div>
              <Stepper value={counts.follow_backs} onChange={(v) => update("follow_backs", v)} />
            </div>
            <div className="flex items-center justify-between px-4 py-2.5">
              <span className="text-xs text-muted-foreground">FBR% (follow-back rate)</span>
              <span className="text-sm font-semibold tabular-nums text-foreground">{rates.fbr}</span>
            </div>
          </div>

          {/* Conversion blocks — mirrors the sheet's Overall / Stage split */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <RateCard title="Overall Conversion %" rows={rates.overall.map((r) => ({ label: r.label, value: r.value, hint: r.hint }))} />
            <RateCard title="Stage Conversion %" rows={rates.steps.map((r) => ({ label: r.label, value: r.value }))} />
          </div>
        </>
      )}
    </div>
  );
}

function Stepper({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
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
  const platformDef = PLATFORMS.find((p) => p.key === platform);

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
                  {STAGE_FIELDS.map((f) => {
                    const Icon = STAGE_ICON[f.key];
                    return (
                      <tr key={f.key} className="border-b border-border/30 last:border-0">
                        <td className="px-3 py-2 text-foreground whitespace-nowrap sticky left-0 bg-card">
                          <span className="inline-flex items-center gap-1.5">
                            <Icon className="w-3.5 h-3.5 text-primary/70" />
                            {f.label} <span className="text-muted-foreground/60">({f.code})</span>
                          </span>
                        </td>
                        {byMonth.map(({ month, data }) => (
                          <td key={month} className={`px-2.5 py-2 text-right tabular-nums ${data ? "text-foreground/90" : "text-muted-foreground/40"}`}>
                            {data ? data[f.key] : "—"}
                          </td>
                        ))}
                        <td className="px-3 py-2 text-right tabular-nums font-semibold text-foreground">{totals[f.key]}</td>
                      </tr>
                    );
                  })}
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
            {STAGE_FIELDS.map((f) => {
              const Icon = STAGE_ICON[f.key];
              return (
                <div key={f.key} className="rounded-xl border border-border/60 bg-card/60 px-3 py-2">
                  <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <Icon className="w-3 h-3 text-primary/70" />{f.code}
                  </div>
                  <div className="text-base font-semibold tabular-nums text-foreground">{totals[f.key]}</div>
                </div>
              );
            })}
          </div>
          <p className="text-[11px] text-muted-foreground/70">
            Booked rate for {year}: <span className="text-foreground font-medium">{totalRates.overall[4].value}</span> of
            pre-initiated prospects on {platformDef?.label ?? platform}.
          </p>
        </>
      )}
    </div>
  );
}
