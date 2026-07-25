import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface LogEntry {
  id: string;
  time: string;
  code: string;
  message: string;
}

function stamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export default function TelemetryLog() {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const countRef = useRef(0);

  useEffect(() => {
    const channel = supabase
      .channel("command-deck-telemetry")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "scripts" },
        (payload) => {
          countRef.current += 1;
          setEntries((prev) =>
            [
              { id: `script-${payload.new.id}`, time: stamp(), code: "script.create", message: String(payload.new.title ?? "untitled") },
              ...prev,
            ].slice(0, 6),
          );
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "video_edits" },
        (payload) => {
          countRef.current += 1;
          setEntries((prev) =>
            [
              { id: `edit-${payload.new.id}-${Date.now()}`, time: stamp(), code: "edit.update", message: String(payload.new.reel_title ?? "untitled") },
              ...prev,
            ].slice(0, 6),
          );
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

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
        Telemetry
        <span className="ml-auto normal-case font-normal" style={{ letterSpacing: "0.08em", fontSize: 8, color: "hsl(var(--bone) / 0.3)" }}>
          live
        </span>
      </div>
      <div className="flex flex-col font-mono text-[9.5px] max-h-[150px] overflow-hidden">
        {entries.length === 0 ? (
          <div style={{ color: "hsl(var(--bone) / 0.3)" }}>Waiting for activity…</div>
        ) : (
          entries.map((e) => (
            <div key={e.id} className="flex gap-2 py-[2.5px]" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
              <span style={{ color: "rgba(234,230,220,0.4)" }}>{e.time}</span>
              <span style={{ color: "hsl(var(--aqua) / 0.5)" }}>{e.code}</span>
              <span className="truncate" style={{ color: "hsl(var(--bone) / 0.32)" }}>{e.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
