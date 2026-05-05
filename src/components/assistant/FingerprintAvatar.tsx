import connectaFavicon from "@/assets/connecta-favicon-icon.png";

export function FingerprintAvatar({ size = "sm" }: { size?: "sm" | "md" }) {
  const dim = size === "md" ? 28 : 16;
  return (
    <img
      src={connectaFavicon}
      alt=""
      style={{ width: dim, height: dim, objectFit: "contain", opacity: 0.75, flexShrink: 0 }}
    />
  );
}
