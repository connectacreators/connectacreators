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
}

// Shipped from /Users/admin/Downloads/FINGER ANIMATION thinking.mp4 — 2160×2160,
// 1.3s loop, fingerprint over solid black. mix-blend-mode: screen makes the
// black bg invisible on dark surfaces.
const ANIMATED_SRC = "/assets/fingerprint-thinking.mp4";

export function FingerprintAvatar({ size = "sm", tone = "light" }: FingerprintAvatarProps) {
  const dim = size === "md" ? 28 : 16;

  if (tone === "light") {
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

  return (
    <img
      src={connectaFavicon}
      alt=""
      style={{
        width: dim,
        height: dim,
        objectFit: "contain",
        opacity: 0.85,
        filter: "brightness(0)",
        flexShrink: 0,
        marginTop: size === "sm" ? 3 : 0,
      }}
    />
  );
}
