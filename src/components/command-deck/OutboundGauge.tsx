import { useAgencyGoals } from "@/hooks/useAgencyGoals";
import { useOutboundDailyLog } from "@/hooks/useOutboundDailyLog";
import { outboundPct, outboundPaceState } from "@/lib/commandDeck/outboundPace";

const PLATFORMS = ["IG", "TikTok", "FB", "LI", "X"];
const PACE_LABEL: Record<string, string> = { ahead: "On pace", "on-pace": "On pace", behind: "Behind pace" };
const PACE_COLOR: Record<string, string> = {
  ahead: "hsl(var(--good, 141 33% 61%))",
  "on-pace": "hsl(var(--good, 141 33% 61%))",
  behind: "hsl(var(--honey))",
};

export default function OutboundGauge() {
  const { outboundDailyTarget } = useAgencyGoals();
  const { loading, sentToday, engagedToday, byPlatform, logOutbound } = useOutboundDailyLog();
  const pct = outboundPct(sentToday, outboundDailyTarget);
  const paceState = outboundPaceState(sentToday, outboundDailyTarget);

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
        Outbound Pace
      </div>

      {loading ? (
        <div className="text-[10.5px]" style={{ color: "hsl(var(--bone) / 0.3)" }}>Loading…</div>
      ) : (
        <>
          <div className="flex items-baseline justify-between">
            <span className="font-mono" style={{ fontSize: 15, color: "hsl(var(--bone))" }}>
              {sentToday}
              <small style={{ fontSize: 9.5, color: "hsl(var(--bone) / 0.3)" }}> / {outboundDailyTarget} sent today</small>
            </span>
            <span
              className="font-mono uppercase"
              style={{ fontSize: 9, letterSpacing: "0.1em", color: PACE_COLOR[paceState] }}
            >
              {PACE_LABEL[paceState]}
            </span>
          </div>
          <div className="h-[5px] rounded-[3px] overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
            <div
              className="h-full rounded-[3px] transition-[width] duration-1000"
              style={{
                width: `${pct}%`,
                background: "linear-gradient(90deg, hsl(var(--aqua)), hsl(var(--honey)))",
                boxShadow: "0 0 8px hsl(var(--aqua) / 0.3)",
              }}
            />
          </div>
          <div className="flex items-baseline gap-1.5 font-mono" style={{ fontSize: 9, letterSpacing: "0.06em" }}>
            <span style={{ color: "hsl(var(--bone) / 0.56)" }}>{engagedToday}</span>
            <span style={{ color: "hsl(var(--bone) / 0.3)" }}>engaged today</span>
          </div>
          <div className="flex gap-[9px] flex-wrap mt-0.5">
            {PLATFORMS.map((p) => (
              <button
                key={p}
                onClick={() => logOutbound(p)}
                className="font-mono transition-colors"
                style={{ fontSize: 8.5, letterSpacing: "0.06em", color: "hsl(var(--aqua) / 0.5)", background: "none", border: 0, cursor: "pointer" }}
                onMouseEnter={(e) => { e.currentTarget.style.color = "hsl(var(--aqua))"; e.currentTarget.style.textShadow = "0 0 8px hsl(var(--aqua) / 0.5)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = "hsl(var(--aqua) / 0.5)"; e.currentTarget.style.textShadow = "none"; }}
                title={`Log one ${p} send${byPlatform[p] ? ` (${byPlatform[p]} today)` : ""}`}
              >
                +1 {p}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
