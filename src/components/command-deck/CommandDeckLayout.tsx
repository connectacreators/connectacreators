import type { ReactNode } from "react";
import CommandHeader from "./CommandHeader";
import SystemVitals from "./SystemVitals";
import TelemetryLog from "./TelemetryLog";
import AttentionRadar from "./AttentionRadar";
import DiagnosticsTicker from "./DiagnosticsTicker";
import OutboundGauge from "./OutboundGauge";
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
  focusMode = false,
}: {
  children: ReactNode;
  credits: number | null;
  autonomyLabel: string;
  displayName: string;
  companionName: string;
  listening: boolean;
  /** True while an Action Surface (e.g. the revision review panel) is open —
   *  pulls focus by dimming everything except the middle column, so the
   *  surface reads as something that came OUT of the orb rather than an
   *  unrelated window that happened to appear. */
  focusMode?: boolean;
}) {
  return (
    <div className="flex-1 flex flex-col min-h-0 px-3 py-2 sm:px-4 sm:py-3 gap-2.5">
      <div className="cd-atmos" />
      <div className="cd-vignette" />
      <div className="cd-grain" />
      <div className="cd-scan" />
      <div className={`cd-fade-down${focusMode ? " cd-defocused" : ""}`}>
        <CommandHeader credits={credits} autonomyLabel={autonomyLabel} />
      </div>

      {/* Below lg, the side telemetry columns hide entirely — voice + the
          orb are the primary mobile surface, a dense metrics dashboard
          squeezed into a phone width isn't usable. They reappear at the
          same 1024px breakpoint the rest of the app treats as "desktop"
          (MobileBottomNav, DashboardSidebar). */}
      <div className="flex-1 grid gap-5 min-h-0 pt-2 grid-cols-1 lg:grid-cols-[236px_minmax(360px,1fr)_236px]">
        <div className={`hidden lg:flex cd-fade-left flex-col gap-[26px] pt-1.5 overflow-y-auto min-h-0${focusMode ? " cd-defocused" : ""}`}>
          <SystemVitals />
          <TelemetryLog />
        </div>

        <div className="flex flex-col min-h-0 relative">{children}</div>

        <div className={`hidden lg:flex cd-fade-right flex-col gap-[26px] pt-1.5 overflow-y-auto min-h-0${focusMode ? " cd-defocused" : ""}`}>
          <VoiceWaveform listening={listening} />
          <AttentionRadar />
          <OutboundGauge />
          <DiagnosticsTicker />
        </div>
      </div>

      <div className={focusMode ? "cd-defocused" : ""}>
        <RollCallBar displayName={displayName} companionName={companionName} listening={listening} />
      </div>
    </div>
  );
}
