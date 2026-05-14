import "./PromptStream.css";
import CurvedLoop from "./CurvedLoop";

interface PromptStreamProps {
  /**
   * Chaotic prompt text that curves in from the left. Should read like a creator's
   * stream-of-thought to their AI strategist — lowercase, casual, run-on.
   */
  promptText?: string;
  /**
   * Polished output keywords that scroll across the dark banner on the right.
   * Will be uppercase by CSS.
   */
  outputText?: string;
  className?: string;
}

const DEFAULT_PROMPT =
  "i was thinking maybe a quick reel today about the new launch but also can you check the fyp for what's blowing up so we don't drop into a trend that's already past peak and the editing queue from last week is still kind of a mess so maybe we should";

const DEFAULT_OUTPUT =
  "1M VIEWS ✦ VIRAL SCRIPTS ✦ VIRAL IDEAS ✦ SCHEDULE ✦ EDITING QUEUE ✦ GET CLIENTS ✦ AI COMPANION ✦ ";

const WAVEFORM_BARS = [
  { x: 2, y: 9, h: 4 },
  { x: 9, y: 5, h: 12 },
  { x: 16, y: 2, h: 18 },
  { x: 23, y: 7, h: 8 },
  { x: 30, y: 4, h: 14 },
  { x: 37, y: 9, h: 4 },
  { x: 44, y: 3, h: 16 },
  { x: 51, y: 6, h: 10 },
  { x: 58, y: 8, h: 6 },
  { x: 64, y: 9, h: 4 },
];

export default function PromptStream({
  promptText = DEFAULT_PROMPT,
  outputText = DEFAULT_OUTPUT,
  className,
}: PromptStreamProps) {
  // Triple the output text so the marquee can loop seamlessly.
  const trackText = outputText + outputText + outputText;

  return (
    <div className={`prompt-stream ${className || ""}`} aria-hidden>
      {/* RIGHT: tilted dark banner with scrolling polished output */}
      <div className="prompt-stream-banner">
        <div className="prompt-stream-track">{trackText}</div>
      </div>

      {/* LEFT: animated curling italic prompt text on a flowing swoop path
          (single direction — no loop-back so text never goes upside-down). */}
      <div className="prompt-stream-left">
        <CurvedLoop
          marqueeText={promptText}
          speed={0.5}
          direction="right"
          interactive={false}
          pathD="M 720 30 C 420 -40 120 60 80 180 C 50 280 240 320 520 290"
          viewBox="0 0 760 320"
          className="thin-italic"
        />
      </div>

      {/* CENTER: animated waveform pill — the AI assistant indicator */}
      <div className="prompt-stream-pill">
        <svg width="68" height="22" viewBox="0 0 68 22">
          {WAVEFORM_BARS.map((b, i) => (
            <rect
              key={i}
              x={b.x}
              y={b.y}
              width="3"
              height={b.h}
              rx="1.5"
              style={{ animationDelay: `${i * 0.08}s` }}
            />
          ))}
        </svg>
      </div>
    </div>
  );
}
