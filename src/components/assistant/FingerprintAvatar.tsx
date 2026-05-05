import connectaFavicon from "@/assets/connecta-favicon-icon.png";

export function FingerprintAvatar({ size = "sm" }: { size?: "sm" | "md" }) {
  const dim = size === "md" ? 32 : 22;
  const imgDim = size === "md" ? 18 : 12;
  return (
    <div
      style={{
        width: dim,
        height: dim,
        borderRadius: "50%",
        background: "rgba(201,169,110,0.10)",
        border: "1px solid rgba(201,169,110,0.22)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <img
        src={connectaFavicon}
        alt=""
        style={{ width: imgDim, height: imgDim, objectFit: "contain", opacity: 0.85 }}
      />
    </div>
  );
}
