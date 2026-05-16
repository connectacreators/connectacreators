import connectaFavicon from "@/assets/connecta-favicon-icon.png";

interface FingerprintAvatarProps {
  size?: "sm" | "md";
  // "light" = white-tinted for dark surfaces (drawer, /ai). Plays the
  // animated fingerprint mp4 with mix-blend-mode so the black background
  // drops out cleanly.
  // "dark" = ink-tinted for editorial light surfaces (canvas AI panel).
  // Uses the static png with a brightness-0 filter — the mp4 was rendered
  // on black so it doesn't survive a multiply blend.
  tone?: "light" | "dark";
  /**
   * When `true`, plays the looping mp4 fingerprint animation (only valid on
   * `tone="light"` — dark uses the static png either way). Used by the
   * ThinkingAnimation indicator and by in-flight streaming bubbles. When
   * `false` (the default), renders a single static frame so historical
   * assistant messages don't pulse forever.
   */
  animated?: boolean;
}

// Shipped from /Users/admin/Downloads/FINGER ANIMATION thinking.mp4 — 2160×2160,
// 1.3s loop, fingerprint over solid black. mix-blend-mode: screen makes the
// black bg invisible on dark surfaces.
const ANIMATED_SRC = "/assets/fingerprint-thinking.mp4";

export function FingerprintAvatar({ size = "sm", tone = "light", animated = false }: FingerprintAvatarProps) {
  const dim = size === "md" ? 28 : 16;

  // Animated: only valid on light tone (dark uses the same static png anyway).
  if (animated && tone === "light") {
    return (
      <video
        src={ANIMATED_SRC}
        poster={connectaFavicon}
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        aria-hidden
        style={{
          width: dim,
          height: dim,
          objectFit: "contain",
          mixBlendMode: "screen",
          flexShrink: 0,
          marginTop: size === "sm" ? 3 : 0,
          pointerEvents: "none",
        }}
      />
    );
  }

  // Static png. On dark surface (tone=light), invert to white via the
  // brightness/invert filter combo so the silhouette reads on the dark bg.
  // On light surface (tone=dark), brightness-0 already produces pure black.
  return (
    <img
      src={connectaFavicon}
      alt=""
      aria-hidden
      style={{
        width: dim,
        height: dim,
        objectFit: "contain",
        opacity: 0.85,
        filter: tone === "dark" ? "brightness(0)" : "brightness(0) invert(1)",
        flexShrink: 0,
        marginTop: size === "sm" ? 3 : 0,
        pointerEvents: "none",
      }}
    />
  );
}
