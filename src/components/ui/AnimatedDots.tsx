export default function AnimatedDots() {
  return (
    <>
      <style>{`
        @keyframes dotDrift {
          from { background-position: 0 0; }
          to { background-position: 30px 30px; }
        }
        .animated-dots-light {
          background-image: radial-gradient(circle, #000 1px, transparent 1px);
        }
        .dark .animated-dots-light {
          background-image: radial-gradient(circle, #fff 1px, transparent 1px);
        }
      `}</style>
      <div
        className="animated-dots-light"
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          pointerEvents: "none",
          zIndex: 1,
          backgroundSize: "30px 30px",
          animation: "dotDrift 25s linear infinite",
          opacity: 0.12,
        }}
      />
    </>
  );
}
