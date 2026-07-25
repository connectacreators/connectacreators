// Rotates between three real fleet-wide readouts in one HUD slot instead of
// three permanent panels — matches the approved mockup's "Diagnostics"
// channel-cycling pattern (5.6s per channel, crossfade).
import { useEffect, useRef, useState } from "react";
import { useClientViewsLeaderboard } from "@/hooks/useClientViewsLeaderboard";
import { useFleetStrategyHealth } from "@/hooks/useFleetStrategyHealth";
import { useAgencyGoals } from "@/hooks/useAgencyGoals";
import { useOutboundDailyLog } from "@/hooks/useOutboundDailyLog";
import { formatViews } from "@/lib/commandDeck/clientViews";
import { outboundPct, outboundPaceState } from "@/lib/commandDeck/outboundPace";

const STRATEGY_LABEL: Record<"hi" | "mid" | "lo", string> = {
  hi: "On track",
  mid: "Needs attention",
  lo: "Action required",
};
const STRATEGY_COLOR: Record<"hi" | "mid" | "lo", string> = {
  hi: "hsl(var(--good, 141 33% 61%))",
  mid: "hsl(var(--honey))",
  lo: "hsl(4 68% 63%)",
};

function GoalLine({ label, valueLabel, pct, tone }: { label: string; valueLabel: string; pct: number; tone: "good" | "warn" }) {
  return (
    <div className="flex flex-col gap-1 mb-2.5 last:mb-0">
      <div className="flex justify-between font-mono" style={{ fontSize: 9.5 }}>
        <span style={{ color: "hsl(var(--bone) / 0.3)", letterSpacing: "0.06em", textTransform: "uppercase" }}>{label}</span>
        <span style={{ color: tone === "good" ? "hsl(var(--good, 141 33% 61%))" : "hsl(var(--honey))" }}>
          {tone === "good" ? "On pace" : "Behind pace"}
        </span>
      </div>
      <div className="h-[4px] rounded-[3px] overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
        <div
          className="h-full rounded-[3px]"
          style={{ width: `${pct}%`, background: tone === "good" ? "hsl(var(--aqua))" : "hsl(var(--honey))" }}
        />
      </div>
      <div className="flex justify-between font-mono" style={{ fontSize: 9.5, color: "hsl(var(--bone) / 0.56)" }}>
        {valueLabel}
      </div>
    </div>
  );
}

export default function DiagnosticsTicker() {
  const { loading: viewsLoading, ranked: views } = useClientViewsLeaderboard();
  const { loading: healthLoading, ranked: health } = useFleetStrategyHealth();
  const { loading: goalsLoading, revenueGoal, revenueActual, outboundDailyTarget } = useAgencyGoals();
  const { loading: outboundLoading, sentToday } = useOutboundDailyLog();
  const [channel, setChannel] = useState(0);
  const [visible, setVisible] = useState(true);
  const channels = [
    { label: "Client Intel · Views", loading: viewsLoading, empty: views.length === 0 },
    { label: "Strategy Health", loading: healthLoading, empty: health.length === 0 },
    { label: "Agency Goals", loading: goalsLoading || outboundLoading, empty: false },
  ];

  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) return;
    const id = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setChannel((c) => (c + 1) % channels.length);
        setVisible(true);
      }, 440);
    }, 5600);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const active = channels[channel];
  const revenuePct = revenueGoal > 0 ? Math.round(Math.min(100, (revenueActual / revenueGoal) * 100)) : 0;
  const revenueTone: "good" | "warn" = revenuePct >= 90 ? "good" : "warn";
  const outboundPctVal = outboundPct(sentToday, outboundDailyTarget);
  const outboundTone: "good" | "warn" = outboundPaceState(sentToday, outboundDailyTarget) === "behind" ? "warn" : "good";

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
        Diagnostics
        <span className="ml-auto normal-case font-normal" style={{ letterSpacing: "0.08em", fontSize: 8, color: "hsl(var(--bone) / 0.3)" }}>
          {active.label}
        </span>
      </div>

      <div style={{ opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(6px)", transition: "opacity 0.44s ease, transform 0.44s ease", minHeight: 110 }}>
        {active.loading ? (
          <div className="text-[10.5px]" style={{ color: "hsl(var(--bone) / 0.3)" }}>Loading…</div>
        ) : active.empty ? (
          <div className="text-[10.5px]" style={{ color: "hsl(var(--bone) / 0.3)" }}>
            {channel === 0 ? "No tracked channels with recent views yet." : "No client strategies configured yet."}
          </div>
        ) : channel === 0 ? (
          <div className="flex flex-col">
            {views.slice(0, 5).map((r, i) => (
              <div key={r.clientId} className="grid items-center gap-1.5 py-[3px]" style={{ gridTemplateColumns: "12px 1fr 46px 40px" }}>
                <span className="font-mono text-[9px]" style={{ color: "hsl(var(--bone) / 0.3)" }}>{i + 1}</span>
                <span className="text-[10.5px] truncate" style={{ color: "hsl(var(--bone) / 0.56)" }}>{r.clientName}</span>
                <span className="font-mono text-[10.5px] text-right tabular-nums" style={{ color: "hsl(var(--bone))" }}>{formatViews(r.views)}</span>
                <span className="font-mono text-[9.5px] text-right" style={{ color: r.deltaPct === null ? "hsl(var(--bone) / 0.3)" : r.up ? "hsl(var(--good, 141 33% 61%))" : "hsl(4 68% 63%)" }}>
                  {r.deltaPct === null ? "—" : `${r.up ? "▲" : "▼"} ${Math.abs(r.deltaPct)}%`}
                </span>
              </div>
            ))}
          </div>
        ) : channel === 1 ? (
          <div className="flex flex-col">
            {health.slice(0, 5).map((r) => (
              <div key={r.clientId} className="grid items-center gap-2 py-[3px]" style={{ gridTemplateColumns: "1fr 26px 1fr" }}>
                <span className="text-[10.5px] truncate" style={{ color: "hsl(var(--bone) / 0.56)" }}>{r.clientName}</span>
                <span className="font-mono text-[10.5px] text-center" style={{ color: STRATEGY_COLOR[r.band] }}>{r.score}</span>
                <span className="font-mono text-[8.5px] uppercase text-right" style={{ letterSpacing: "0.05em", color: STRATEGY_COLOR[r.band] }}>
                  {STRATEGY_LABEL[r.band]}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div>
            <GoalLine
              label="Revenue · /finances"
              valueLabel={`$${Math.round(revenueActual).toLocaleString()} of $${Math.round(revenueGoal).toLocaleString()}`}
              pct={revenuePct}
              tone={revenueTone}
            />
            <GoalLine
              label="Outbound · /outbound"
              valueLabel={`${sentToday} sent of ${outboundDailyTarget} today`}
              pct={outboundPctVal}
              tone={outboundTone}
            />
          </div>
        )}
      </div>

      <div className="flex gap-[5px] mt-1">
        {channels.map((_, i) => (
          <i
            key={i}
            className="block w-1 h-1 rounded-full"
            style={
              i === channel
                ? { background: "hsl(var(--aqua))", boxShadow: "0 0 6px hsl(var(--aqua) / 0.14)" }
                : { background: "rgba(255,255,255,0.12)" }
            }
          />
        ))}
      </div>
    </div>
  );
}
