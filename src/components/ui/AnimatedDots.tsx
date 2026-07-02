export default function AnimatedDots() {
  return (
    <>
      <style>{`
        /* Animate transform (compositor-only) — animating background-position
           forces a full-viewport repaint every frame. */
        @keyframes dotDrift {
          from { transform: translate(0, 0); }
          to { transform: translate(30px, 30px); }
        }
        @media (prefers-reduced-motion: reduce) {
          .animated-dots-layer { animation: none !important; }
        }
      `}</style>
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden" style={{ opacity: 0.04 }}>
        <div
          className="animated-dots-layer"
          style={{
            position: "absolute",
            top: -30,
            left: -30,
            right: 0,
            bottom: 0,
            backgroundImage:
              "radial-gradient(circle at 1px 1px, hsl(var(--foreground) / 0.12) 1px, transparent 0)",
            backgroundSize: "30px 30px",
            animation: "dotDrift 25s linear infinite",
            willChange: "transform",
          }}
        />
      </div>
    </>
  );
}
