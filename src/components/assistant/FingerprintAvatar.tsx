import connectaFavicon from "@/assets/connecta-favicon-icon.png";

export function FingerprintAvatar({ size = "sm" }: { size?: "sm" | "md" }) {
  const dim = size === "md" ? 28 : 16;
  return (
    <img
      src={connectaFavicon}
      alt=""
      style={{
        width: dim,
        height: dim,
        objectFit: "contain",
        opacity: 0.65,
        filter: "brightness(0) invert(1)",
        flexShrink: 0,
        // Vertically center the small variant with the first line of text-base
        // (line-height ~26px). Without this, the 16px icon sits at the top.
        marginTop: size === "sm" ? 5 : 0,
      }}
    />
  );
}
