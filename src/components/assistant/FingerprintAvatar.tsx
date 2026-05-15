import connectaFavicon from "@/assets/connecta-favicon-icon.png";

interface FingerprintAvatarProps {
  size?: "sm" | "md";
  // Default "light" = white-tinted for dark surfaces (drawer, /ai).
  // "dark" = ink-tinted for editorial light surfaces (canvas AI panel).
  tone?: "light" | "dark";
}

export function FingerprintAvatar({ size = "sm", tone = "light" }: FingerprintAvatarProps) {
  const dim = size === "md" ? 28 : 16;
  return (
    <img
      src={connectaFavicon}
      alt=""
      style={{
        width: dim,
        height: dim,
        objectFit: "contain",
        opacity: tone === "dark" ? 0.85 : 0.65,
        filter: tone === "dark" ? "brightness(0)" : "brightness(0) invert(1)",
        flexShrink: 0,
        marginTop: size === "sm" ? 3 : 0,
      }}
    />
  );
}
