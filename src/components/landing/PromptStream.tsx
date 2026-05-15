import "./PromptStream.css";
import CurvedLoop from "./CurvedLoop";

/* ─────────────────────────────────────────────────────────────
   PromptStreamMobile — phone-friendly hero composition.
   Replaces the left/right CurvedLoop SVG marquees (which need
   viewport width to land at the literal page margins) with a
   centered vertical trio: italic prompt → animated waveform
   pill → tilted output band. Static, no GSAP, no SVG paths.
   ───────────────────────────────────────────────────────────── */
export function PromptStreamMobile({
  promptText,
  outputText,
}: {
  promptText?: string;
  outputText?: string;
}) {
  const prompt = promptText ?? "I need a hook for my next reel…";
  const output = (outputText ?? DEFAULT_OUTPUT).replace(/✦/g, "·").trim().replace(/·\s*$/, "");

  return (
    <div className="prompt-stream-mobile" aria-hidden>
      <p className="psm-prompt">{prompt}</p>
      <div className="psm-pill">
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
        <span className="psm-pill-label">AI</span>
      </div>
      <div className="psm-output">{output}</div>
    </div>
  );
}

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

const LEFT_PATH =
  "M 0 240 C 60 -20 280 -40 420 40 C 520 90 500 200 620 200 C 740 200 840 100 900 150";
const RIGHT_PATH =
  "M 0 150 C 200 90 480 100 660 200 C 780 260 860 250 900 230";

export default function PromptStream({
  promptText = DEFAULT_PROMPT,
  outputText = DEFAULT_OUTPUT,
  className,
}: PromptStreamProps) {
  // Triple the output text so the marquee can loop seamlessly.
  const trackText = outputText + outputText + outputText;

  return (
    <div className={`prompt-stream ${className || ""}`} aria-hidden>
      {/* LEFT: the prompt — long undulating curve from the left margin
          into the mic. preserveAspectRatio="none" so x=0 always hits the
          literal left margin regardless of viewport size. */}
      <div className="prompt-stream-left">
        <CurvedLoop
          marqueeText={promptText}
          speed={0.5}
          direction="right"
          interactive={false}
          pathD={LEFT_PATH}
          viewBox="0 0 900 300"
          preserveAspectRatio="none"
          className="thin-italic"
        />
      </div>

      {/* RIGHT: the output — a curved dark band rendered as SVG strokes,
          with the marquee text rendered on top following the same curve.
          Starts at the mic (left:50%) and ends at the right margin
          (right:0). preserveAspectRatio="none" so x=900 always hits the
          literal right margin. */}
      <div className="prompt-stream-right">
        {/* Dark band: bone outline + ink fill stacked on the same curve.
            The band is shifted UP ~6 viewBox units so the band is centered on
            the text's visual center (the text baseline sits on the path, but
            the text visual center is ~5px above the baseline because ascenders
            are taller than descenders). */}
        <svg
          className="prompt-stream-right-band"
          viewBox="0 0 900 300"
          preserveAspectRatio="none"
        >
          <g transform="translate(0, -6)">
            <path
              d={RIGHT_PATH}
              stroke="rgba(234, 230, 220, 0.22)"
              strokeWidth="40"
              fill="none"
              strokeLinecap="round"
            />
            <path
              d={RIGHT_PATH}
              stroke="var(--ink, #141414)"
              strokeWidth="36"
              fill="none"
              strokeLinecap="round"
            />
          </g>
        </svg>
        {/* Animated marquee text following the same curve.
            direction="right" makes startOffset increase → characters shift
            forward along the path → new text enters at the mic and exits
            at the right margin. Text appears to flow OUT of the bubble. */}
        <CurvedLoop
          marqueeText={trackText}
          speed={0.65}
          direction="right"
          interactive={false}
          pathD={RIGHT_PATH}
          viewBox="0 0 900 300"
          preserveAspectRatio="none"
          className="output-band"
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
