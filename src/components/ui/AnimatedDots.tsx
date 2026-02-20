export default function AnimatedDots() {
  return (
    <>
      <style>{`
        @keyframes dotDrift {
          from { background-position: 0 0; }
          to { background-position: 30px 30px; }
        }
      `}</style>
      <div
        className="fixed inset-0 pointer-events-none z-0"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, hsl(var(--foreground) / 0.12) 1px, transparent 0)",
          backgroundSize: "30px 30px",
          animation: "dotDrift 25s linear infinite",
          opacity: 0.04,
        }}
      />
    </>
  );
}
