import type { ReactNode } from "react";
import CommandHeader from "./CommandHeader";
import SystemVitals from "./SystemVitals";
import TelemetryLog from "./TelemetryLog";
import AttentionRadar from "./AttentionRadar";
import VoiceWaveform from "./VoiceWaveform";
import RollCallBar from "./RollCallBar";
import "./command-deck.css";

export default function CommandDeckLayout({
  children,
  credits,
  autonomyLabel,
  displayName,
  companionName,
  listening,
}: {
  children: ReactNode;
  credits: number | null;
  autonomyLabel: string;
  displayName: string;
  companionName: string;
  listening: boolean;
}) {
  return (
    <div className="flex-1 flex flex-col min-h-0 px-4 py-3 gap-2.5">
      <div className="cd-atmos" />
      <div className="cd-vignette" />
      <div className="cd-grain" />
      <div className="cd-scan" />
      <div className="cd-fade-down">
        <CommandHeader credits={credits} autonomyLabel={autonomyLabel} />
      </div>

      <div className="flex-1 grid gap-5 min-h-0 pt-2" style={{ gridTemplateColumns: "236px minmax(360px,1fr) 236px" }}>
        <div className="cd-fade-left flex flex-col gap-[26px] pt-1.5 overflow-y-auto">
          <SystemVitals />
          <TelemetryLog />
        </div>

        <div className="flex flex-col min-h-0 relative">{children}</div>

        <div className="cd-fade-right flex flex-col gap-[26px] pt-1.5 overflow-y-auto">
          <VoiceWaveform listening={listening} />
          <AttentionRadar />
        </div>
      </div>

      <RollCallBar displayName={displayName} companionName={companionName} listening={listening} />
    </div>
  );
}
