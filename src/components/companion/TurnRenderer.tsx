// src/components/companion/TurnRenderer.tsx
import ScanningScene from "./scenes/ScanningScene";
import DraftingScene from "./scenes/DraftingScene";
import StatsScene from "./scenes/StatsScene";
import VideoAnalysisScene from "./scenes/VideoAnalysisScene";
import ThinkingScene from "./scenes/ThinkingScene";

import VideoCardEmbed from "./embeds/VideoCardEmbed";
import VideoPlayerEmbed from "./embeds/VideoPlayerEmbed";
import MetricStripEmbed from "./embeds/MetricStripEmbed";
import FrameworkDeckEmbed from "./embeds/FrameworkDeckEmbed";
import ChannelGridEmbed from "./embeds/ChannelGridEmbed";
import ScriptCardEmbed from "./embeds/ScriptCardEmbed";
import ProfileAnalysisEmbed from "./embeds/ProfileAnalysisEmbed";

import type { BroadcastTurn, SceneEvent, EmbedRef } from "@/lib/companion/turn-script";

interface Props {
  turn: BroadcastTurn;
  onEmbedClick?: (embed: EmbedRef) => void;
}

function renderScene(s: SceneEvent) {
  switch (s.type) {
    case "scanning":        return <ScanningScene scene={s} />;
    case "drafting":        return <DraftingScene scene={s} />;
    case "stats":           return <StatsScene scene={s} />;
    case "video-analysis":  return <VideoAnalysisScene scene={s} />;
    case "thinking":        return <ThinkingScene scene={s} />;
  }
}

function renderEmbed(e: EmbedRef, onClick?: (e: EmbedRef) => void) {
  switch (e.type) {
    case "video-card":      return <VideoCardEmbed data={e.data} onClick={() => onClick?.(e)} />;
    case "video-player":    return <VideoPlayerEmbed data={e.data} />;
    case "metric-strip":    return <MetricStripEmbed data={e.data} />;
    case "framework-deck":  return <FrameworkDeckEmbed data={e.data} />;
    case "channel-grid":    return <ChannelGridEmbed data={e.data} />;
    case "script-card":     return <ScriptCardEmbed data={e.data} />;
    case "profile-analysis": return <ProfileAnalysisEmbed data={e.data} />;
  }
}

/**
 * Renders a single assistant turn:
 *   1. Each scene in order (full-width inside the chat column).
 *   2. The italic narrative line.
 *   3. Embeds (multiple video cards = grid; everything else stacks).
 */
export default function TurnRenderer({ turn, onEmbedClick }: Props) {
  const videoCards = turn.embeds.filter((e) => e.type === "video-card");
  const otherEmbeds = turn.embeds.filter((e) => e.type !== "video-card");

  return (
    <div className="flex flex-col gap-3">
      {turn.scenes.map((s, i) => (
        <div key={`scene-${i}`}>{renderScene(s)}</div>
      ))}
      {turn.narrative && (
        <div
          className="px-1"
          style={{
            fontFamily: "var(--font-display, 'EB Garamond'), Georgia, serif",
            fontSize: 16,
            lineHeight: 1.5,
            color: "hsl(var(--cream))",
            letterSpacing: "-0.005em",
            fontStyle: turn.scenes.length > 0 ? "normal" : "italic",
          }}
        >
          {turn.narrative}
        </div>
      )}
      {videoCards.length > 0 && (
        // Horizontal video-card variant — stack vertically as a list. Each card
        // is its own full-width row (thumbnail left, info right). The grid
        // layout was for the old big 9:16 poster style.
        <div className="flex flex-col gap-2">
          {videoCards.map((e, i) => (
            <div key={`vc-${i}`}>{renderEmbed(e, onEmbedClick)}</div>
          ))}
        </div>
      )}
      {otherEmbeds.map((e, i) => (
        <div key={`em-${i}`}>{renderEmbed(e, onEmbedClick)}</div>
      ))}
    </div>
  );
}
