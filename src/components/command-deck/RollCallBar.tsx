import "./command-deck.css";

export default function RollCallBar({
  displayName,
  companionName,
  listening,
}: {
  displayName: string;
  companionName: string;
  listening: boolean;
}) {
  return (
    <div
      className="flex items-center justify-between gap-4 flex-wrap pt-2.5"
      style={{ borderTop: "1px solid rgba(255,255,255,0.07)", marginTop: 10 }}
    >
      <span
        className="flex items-center gap-2 font-mono text-[9px] uppercase"
        style={{ letterSpacing: "0.18em", color: "hsl(var(--aqua) / 0.5)" }}
      >
        <span
          className="cd-live-dot inline-block w-1.5 h-1.5 rounded-full"
          style={{ background: "hsl(141 33% 61%)", boxShadow: "0 0 8px hsl(141 33% 61% / 0.6)" }}
        />
        Roll call
      </span>
      <div className="flex gap-2">
        <span className="flex items-center gap-1 font-mono text-[8.5px]" style={{ color: "hsl(var(--bone) / 0.3)" }}>
          <span className="w-1 h-1 rounded-full" style={{ background: "hsl(141 33% 61%)" }} />
          {displayName}
        </span>
        <span className="flex items-center gap-1 font-mono text-[8.5px]" style={{ color: "hsl(var(--bone) / 0.3)" }}>
          <span className="w-1 h-1 rounded-full" style={{ background: "hsl(var(--aqua))" }} />
          {companionName}
        </span>
      </div>
      <div className="flex gap-4">
        <span className="font-mono text-[8.5px] uppercase" style={{ letterSpacing: "0.1em", color: "hsl(var(--bone) / 0.3)" }}>
          {listening ? <b style={{ color: "hsl(var(--bone) / 0.56)" }}>Listening</b> : "Standby"}
        </span>
      </div>
    </div>
  );
}
