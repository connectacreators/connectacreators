import { useEffect, useState } from "react";
import "./command-deck.css";

function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export default function CommandHeader({ credits, autonomyLabel }: { credits: number | null; autonomyLabel: string }) {
  const now = useClock();
  const p = (n: number) => String(n).padStart(2, "0");
  const days = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  const tzOffset = -now.getTimezoneOffset() / 60;

  return (
    <div
      className="flex items-start justify-between gap-5 flex-wrap pb-[11px]"
      style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}
    >
      <div className="flex flex-col gap-[7px]">
        <div className="flex items-center gap-3">
          <div className="relative w-[26px] h-[26px] shrink-0">
            <span
              className="absolute inset-0 rounded-full"
              style={{ border: "1px solid hsl(var(--aqua) / 0.5)" }}
            />
            <span
              className="absolute inset-[6px] rounded-full"
              style={{ border: "1px solid hsl(var(--aqua))", boxShadow: "0 0 12px hsl(var(--aqua) / 0.14)" }}
            />
            <span className="cd-sigil-dot" />
          </div>
          <div className="font-mono text-[10px] sm:text-[12.5px] font-semibold uppercase" style={{ letterSpacing: "0.22em" }}>
            CONNECTA <b style={{ color: "hsl(var(--aqua))", textShadow: "0 0 12px hsl(var(--aqua) / 0.55)" }}>·</b> COMMAND
          </div>
        </div>
        {/* Status badges: mobile keeps things clean (the orb IS the
            interface there); the full HUD detail is a desktop thing,
            alongside the side telemetry columns that are also lg-only. */}
        <div className="hidden lg:flex gap-[6px] flex-wrap pl-[37px]">
          <span
            className="font-mono text-[8px] uppercase rounded-[5px] px-[7px] py-[2.5px]"
            style={{ letterSpacing: "0.13em", color: "hsl(var(--bone) / 0.56)", border: "1px solid rgba(255,255,255,0.12)" }}
          >
            Online
          </span>
          <span
            className="font-mono text-[8px] uppercase rounded-[5px] px-[7px] py-[2.5px]"
            style={{ letterSpacing: "0.13em", color: "hsl(var(--honey))", border: "1px solid hsl(var(--honey) / 0.4)" }}
          >
            Admin Clearance
          </span>
          <span
            className="font-mono text-[8px] uppercase rounded-[5px] px-[7px] py-[2.5px]"
            style={{ letterSpacing: "0.13em", color: "hsl(var(--bone) / 0.56)", border: "1px solid rgba(255,255,255,0.12)" }}
          >
            Autonomy: {autonomyLabel}
          </span>
        </div>
      </div>

      <div className="hidden lg:flex flex-col items-end gap-[3px] text-right">
        <div
          className="font-mono text-[24px] tabular-nums"
          style={{
            letterSpacing: "0.03em",
            color: "hsl(var(--aqua))",
            textShadow: "0 0 18px hsl(var(--aqua) / 0.42), 0 0 44px hsl(var(--aqua) / 0.16)",
          }}
        >
          {p(now.getHours())}:{p(now.getMinutes())}:{p(now.getSeconds())}
        </div>
        <div className="font-mono text-[9.5px] uppercase" style={{ letterSpacing: "0.14em", color: "hsl(var(--bone) / 0.3)" }}>
          {days[now.getDay()]} {p(now.getDate())} {months[now.getMonth()]} · UTC{tzOffset >= 0 ? "+" : ""}
          {tzOffset}
        </div>
        <div className="flex gap-3.5 mt-1">
          <span className="font-mono text-[9px] uppercase" style={{ letterSpacing: "0.1em", color: "hsl(var(--bone) / 0.3)" }}>
            Credits <b style={{ color: "hsl(var(--bone) / 0.56)" }}>{credits === null ? "—" : credits.toLocaleString()}</b>
          </span>
          <span
            className="font-mono text-[9px] uppercase flex items-center gap-1.5"
            style={{ letterSpacing: "0.1em", color: "hsl(var(--bone) / 0.3)" }}
          >
            <span
              className="cd-live-dot inline-block w-1.5 h-1.5 rounded-full"
              style={{ background: "hsl(var(--good, 141 33% 61%))", boxShadow: "0 0 8px hsl(var(--good, 141 33% 61%))" }}
            />
            <b style={{ color: "hsl(var(--bone) / 0.56)" }}>Online</b>
          </span>
        </div>
      </div>
    </div>
  );
}
