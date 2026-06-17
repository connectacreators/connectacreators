import { useState, useRef } from "react";

const ORANGE = "#E8852B";

const HeroVProjectEN = ({ onApply }: { onApply?: () => void }) => {
  const [isMuted, setIsMuted] = useState(true);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const toggleMute = () => {
    if (iframeRef.current) {
      const message = isMuted ? '{"method":"setVolume","value":1}' : '{"method":"setVolume","value":0}';
      iframeRef.current.contentWindow?.postMessage(message, "*");
      setIsMuted(!isMuted);
    }
  };

  return (
    <div style={{ background: "#0a0a0a", position: "relative", overflow: "hidden" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;900&display=swap');`}</style>
      {/* warm glow */}
      <div
        style={{
          position: "absolute",
          top: -140,
          left: "50%",
          transform: "translateX(-50%)",
          width: 760,
          height: 420,
          background: "radial-gradient(ellipse at center, rgba(232,133,43,0.20), transparent 70%)",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "relative",
          maxWidth: 1240,
          margin: "0 auto",
          padding: "56px 24px 64px",
          textAlign: "center",
        }}
      >
        {/* pill */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            border: "1px solid rgba(232,133,43,0.35)",
            background: "rgba(232,133,43,0.08)",
            color: ORANGE,
            borderRadius: 999,
            padding: "7px 16px",
            fontFamily: "'Montserrat', sans-serif",
            fontWeight: 600,
            fontSize: 13,
            marginBottom: 26,
          }}
        >
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: ORANGE, display: "inline-block" }} />
          No agencies · No wasted time
        </div>

        <h1
          style={{
            fontFamily: "'Montserrat', sans-serif",
            fontWeight: 700,
            fontSize: "clamp(26px, 3.3vw, 40px)",
            color: "#fff",
            lineHeight: 1.14,
            letterSpacing: "-0.02em",
            maxWidth: 1240,
            margin: "0 auto 18px",
          }}
        >
          Build your personal brand and <span style={{ color: ORANGE }}>land real clients</span>
          <br />
          in under 90 days, no agencies, no wasted time.
        </h1>

        <div
          style={{
            fontFamily: "'Montserrat', sans-serif",
            fontWeight: 600,
            fontSize: "clamp(16px, 2.2vw, 20px)",
            color: "#fff",
            marginBottom: 8,
          }}
        >
          150M+ views and 100K+ followers generated for our clients.
        </div>
        <div
          style={{
            fontFamily: "'Montserrat', sans-serif",
            fontWeight: 400,
            fontSize: "clamp(14px, 1.8vw, 17px)",
            color: "rgba(255,255,255,0.6)",
            lineHeight: 1.55,
            maxWidth: 640,
            margin: "0 auto 36px",
          }}
        >
          The system that puts your brand to work for you while you run your business.
        </div>

        {/* VSL Video */}
        <div
          style={{
            maxWidth: 760,
            margin: "0 auto",
            borderRadius: 16,
            overflow: "hidden",
            border: "1px solid rgba(255,255,255,0.08)",
            boxShadow: "0 24px 70px rgba(0,0,0,0.55)",
            position: "relative",
          }}
        >
          <div style={{ position: "relative", paddingTop: "56.25%" }}>
            <iframe
              ref={iframeRef}
              src="https://player.vimeo.com/video/1151104978?autoplay=1&muted=1&loop=1&badge=0&autopause=0&player_id=0&app_id=58479&title=0&byline=0&portrait=0"
              frameBorder="0"
              allow="autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media"
              referrerPolicy="strict-origin-when-cross-origin"
              style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }}
              title="Connecta VSL"
            />
          </div>
          <button
            onClick={toggleMute}
            style={{
              position: "absolute",
              bottom: 16,
              right: 16,
              background: "rgba(0,0,0,0.75)",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              padding: "8px 14px",
              cursor: "pointer",
              fontFamily: "'Montserrat', sans-serif",
              fontWeight: 700,
              fontSize: 13,
              display: "flex",
              alignItems: "center",
              gap: 6,
              zIndex: 10,
            }}
          >
            {isMuted ? "🔊 Unmute" : "🔇 Mute"}
          </button>
        </div>

        {/* CTA below video */}
        <button
          onClick={onApply}
          style={{
            marginTop: 28,
            display: "inline-block",
            background: ORANGE,
            color: "#0a0a0a",
            fontFamily: "'Montserrat', sans-serif",
            fontWeight: 700,
            fontSize: 16,
            letterSpacing: "0.02em",
            border: "none",
            borderRadius: 999,
            padding: "16px 42px",
            cursor: "pointer",
            boxShadow: "0 12px 32px rgba(232,133,43,0.35)",
          }}
        >
          Book your consultation →
        </button>
        <div
          style={{
            fontFamily: "'Montserrat', sans-serif",
            fontSize: 13,
            color: "rgba(255,255,255,0.45)",
            marginTop: 14,
          }}
        >
          We accept a maximum of 5 new clients per month.
        </div>
      </div>
    </div>
  );
};

export default HeroVProjectEN;
