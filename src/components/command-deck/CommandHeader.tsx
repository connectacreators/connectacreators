import { useEffect, useState } from "react";

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
          </div>
          <div className="font-mono text-[12.5px] font-semibold uppercase" style={{ letterSpacing: "0.36em" }}>
            CONNECTA <b style={{ color: "hsl(var(--aqua))" }}>·</b> COMMAND
          </div>
        </div>
        <div className="flex gap-[6px] flex-wrap pl-[37px]">
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

      <div className="flex flex-col items-end gap-[3px] text-right">
        <div className="font-mono text-[24px] tabular-nums" style={{ letterSpacing: "0.03em", color: "hsl(var(--aqua))" }}>
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
        </div>
      </div>
    </div>
  );
}
