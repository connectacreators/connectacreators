import { useRef, useState, useEffect } from "react";
import calvinFb from "@/assets/calvin-fb-118k.png";
import calvinTiktok from "@/assets/calvin-tiktok-24k.png";
import calvinIg from "@/assets/calvin-ig-9k.png";
import zigufitBefore from "@/assets/zigufit-before.png";
import zigufitAfter from "@/assets/zigufit-after-new.png";
import robertoFounder from "@/assets/roberto-founder.png";
import calvin100kText from "@/assets/calvin-100k-text.png";
import calvinFollowers from "@/assets/dr-calvin-followers.png";
import calvinClinicProfile from "@/assets/dr-calvin-clinic-profile.png";
import spencerImpressions from "@/assets/spencer-impressions.png";
import spencerProfile from "@/assets/spencer-profile.png";
import djR3Stats from "@/assets/dj-r3-stats.png";
import {
  Target,
  Clapperboard,
  TrendingUp,
  MessageCircle,
  Play,
  Pause,
} from "lucide-react";

function ApplyBtn({ small, inverted, onApply }: { small?: boolean; inverted?: boolean; onApply?: () => void }) {
  return (
    <a
      href="#aplicar"
      onClick={(e) => {
        e.preventDefault();
        onApply?.();
      }}
      style={{
        display: "inline-block",
        background: inverted ? "#fff" : "#E8852B",
        color: inverted ? "#E8852B" : "#0a0a0a",
        fontFamily: "'Montserrat', sans-serif",
        fontWeight: 700,
        fontSize: small ? 12 : 15,
        letterSpacing: "0.02em",
        textDecoration: "none",
        padding: small ? "12px 26px" : "16px 40px",
        cursor: "pointer",
        whiteSpace: "nowrap",
        borderRadius: 999,
        boxShadow: "0 12px 32px rgba(232,133,43,0.35)",
      }}
    >
      Book your advisory call →
    </a>
  );
}

function Sec({
  children,
  bg = "#0a0a0a",
  style,
}: {
  children: React.ReactNode;
  bg?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div style={{ background: bg, ...style }}>
      <div className="sec-inner" style={{ maxWidth: 1080, margin: "0 auto", padding: "72px 24px", textAlign: "center" }}>
        {children}
      </div>
    </div>
  );
}

function SectionTitle({ text }: { text: string }) {
  return (
    <div
      className="section-title"
      style={{
        fontFamily: "'Montserrat', sans-serif",
        fontWeight: 700,
        fontSize: "clamp(22px, 4vw, 38px)",
        textTransform: "uppercase",
        letterSpacing: "-0.01em",
        lineHeight: 1.1,
        color: "#fff",
        marginBottom: 8,
      }}
    >
      {text}
    </div>
  );
}

function SectionSub({ text }: { text: string }) {
  return (
    <div
      style={{
        fontFamily: "'Montserrat', sans-serif",
        fontWeight: 500,
        fontSize: 15,
        color: "rgba(255,255,255,0.5)",
        marginBottom: 40,
      }}
    >
      {text}
    </div>
  );
}

const PROCESS_STEPS = [
  { icon: Target, phase: "Step 1", title: "We rebuild your offer", body: "We start by sharpening your offer and positioning, so everything we film and publish is built to attract the right clients." },
  { icon: Clapperboard, phase: "Step 2", title: "You film ~4 hrs a month", body: "We write your scripts, prep the entire shoot and coach you on camera. You're busy running your business — so all we need is about 4 hours of filming a month. We handle everything else." },
  { icon: TrendingUp, phase: "Step 3", title: "We edit, publish & optimize", body: "We edit and publish your content for you, then optimize the strategy month over month based on the data and your ideal client profile." },
  { icon: MessageCircle, phase: "Step 4", title: "Organic DM acquisition funnel", body: "We install an organic DM acquisition funnel that captures and nurtures every lead that comes in — turning conversations into booked appointments." },
];

const FOR_QUALITIES = [
  "You own the business and you're the expert your clients trust",
  "You're ready to show up on camera",
  "You want to delegate your content and client acquisition",
  "You have the capacity to take on more clients",
];

const NOT_FOR = [
  "Businesses without a clear offer or service",
  "Owners who don't want to appear on camera",
  "Anyone looking for just ads or just content, without the full system",
  "Anyone expecting results without filming the content",
  "Anyone without the capacity to take on more clients",
];

const PROCESS = [
  { n: "01", title: "APPLY", body: "You fill out the application with your business information. We review your profile." },
  { n: "02", title: "QUALIFY", body: "30-minute call. We show you what the Hybrid System would look like in your business." },
  { n: "03", title: "INSTALL", body: "2 to 3 weeks: offer, research, scripts, first filming day, ads and follow-up system." },
  { n: "04", title: "OPERATE", body: "Every month: scripts, filming, editing, posting, ads, lead follow-up and a report on appointments and sales." },
];

export default function Index() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const SPEEDS = [1, 1.15, 1.25, 1.5, 2];
  const [videoStarted, setVideoStarted] = useState(false);
  const [videoPlaying, setVideoPlaying] = useState(false);
  const [videoProgress, setVideoProgress] = useState(0);
  const [speed, setSpeed] = useState(1.15);
  const scrollToBook = () =>
    document.getElementById("book")?.scrollIntoView({ behavior: "smooth" });

  useEffect(() => {
    const id = "calendly-widget-script";
    if (!document.getElementById(id)) {
      const s = document.createElement("script");
      s.id = id;
      s.src = "https://assets.calendly.com/assets/external/widget.js";
      s.async = true;
      document.body.appendChild(s);
    }
  }, []);

  const startVideo = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = false;
    v.volume = 1;
    v.currentTime = 0;
    v.playbackRate = speed;
    setVideoStarted(true);
    v.play().then(() => setVideoPlaying(true)).catch(() => {});
  };

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play().then(() => setVideoPlaying(true)).catch(() => {});
    } else {
      v.pause();
      setVideoPlaying(false);
    }
  };

  const cycleSpeed = () => {
    const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
    setSpeed(next);
    if (videoRef.current) videoRef.current.playbackRate = next;
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;900&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { background: #0a0a0a; font-family: 'Montserrat', sans-serif; }

        @keyframes vslPulse {
          0% { box-shadow: 0 0 0 0 rgba(232,133,43,0.55); }
          70% { box-shadow: 0 0 0 22px rgba(232,133,43,0); }
          100% { box-shadow: 0 0 0 0 rgba(232,133,43,0); }
        }

        .qqc-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 16px;
          max-width: 920px;
          margin: 0 auto;
        }
        .qqc-card {
          background: #161616;
          border: 1px solid rgba(255,255,255,0.08);
          border-left: 3px solid #E8852B;
          border-radius: 8px;
          padding: 22px 22px;
          text-align: left;
        }
        .qqc-k {
          font-family: 'Montserrat', sans-serif;
          font-weight: 700;
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: #E8852B;
          margin-bottom: 8px;
        }
        .qqc-v {
          font-family: 'Montserrat', sans-serif;
          font-size: 15px;
          color: rgba(255,255,255,0.82);
          line-height: 1.5;
        }
        @media (max-width: 780px) { .qqc-grid { grid-template-columns: 1fr; gap: 12px; max-width: 460px; } }

        .calvin-text-shot {
          display: block;
          width: 100%;
          max-width: 620px;
          margin: 0 auto;
          border-radius: 12px;
          border: 1px solid rgba(255,255,255,0.08);
        }

        .calvin-socials {
          display: flex;
          flex-direction: column;
          gap: 12px;
          max-width: 560px;
          margin: 0 auto 20px;
        }
        .calvin-socials img {
          width: 100%;
          height: auto;
          display: block;
          border-radius: 10px;
          border: 1px solid rgba(255,255,255,0.08);
        }

        .ba-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; align-items: start; }
        .ba-card { background: #161616; overflow: hidden; border-radius: 8px; border: 1px solid rgba(255,255,255,0.08); }
        .ba-img-portrait { width: 100%; height: auto; max-height: 520px; object-fit: contain; display: block; background: #161616; }
        .ba-img-landscape { width: 100%; height: auto; display: block; background: #161616; }
        .ba-caption { padding: 14px 16px; }

        .ba-grid-square { align-items: stretch; }
        .ba-card-square { aspect-ratio: 1 / 1; display: flex; align-items: center; justify-content: center; padding: 12px; }
        .ba-card-square img { max-width: 100%; max-height: 100%; object-fit: contain; display: block; }

        .agency-stats {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
          max-width: 560px;
          margin: 0 auto;
        }
        .agency-stat {
          background: #E8852B;
          border-radius: 6px;
          padding: 28px 22px;
          text-align: center;
        }
        .agency-stat-num {
          font-family: 'Montserrat', sans-serif;
          font-weight: 700;
          font-size: clamp(38px, 6vw, 56px);
          color: #fff;
          line-height: 1;
          letter-spacing: -0.02em;
          margin-bottom: 10px;
        }
        .agency-stat-label {
          font-family: 'Montserrat', sans-serif;
          font-weight: 700;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: rgba(255,255,255,0.95);
          line-height: 1.4;
        }

        .hero-stat-row {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
          max-width: 720px;
          margin: 56px auto 0;
        }
        .hero-stat {
          background: rgba(255,255,255,0.1);
          border: 1px solid rgba(255,255,255,0.2);
          border-radius: 4px;
          padding: 22px 12px;
        }

        .grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
        .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        .grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }

        .sys-card {
          background: #161616; border: 1px solid rgba(255,255,255,0.08);
          padding: 32px 22px;
          border-radius: 4px;
          text-align: left;
        }

        .industry-card {
          background: #161616; border: 1px solid rgba(255,255,255,0.08);
          padding: 28px 18px;
          border-radius: 4px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 14px;
        }

        .step-card {
          background: #161616; border: 1px solid rgba(255,255,255,0.08);
          padding: 28px 22px;
          border-radius: 4px;
          text-align: left;
        }

        .not-for-list {
          max-width: 640px;
          margin: 0 auto;
          text-align: left;
        }
        .not-for-item {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          padding: 14px 0;
          border-bottom: 1px solid rgba(255,255,255,0.1);
        }
        .not-for-item:last-child { border-bottom: none !important; }

        .roberto-row {
          display: grid;
          grid-template-columns: 280px 1fr;
          gap: 40px;
          align-items: center;
          max-width: 880px;
          margin: 0 auto;
          text-align: left;
        }
        .roberto-photo-wrap {
          width: 280px;
          height: 340px;
          border-radius: 4px;
          overflow: hidden;
          flex-shrink: 0;
        }
        .roberto-photo {
          width: 100%;
          height: 100%;
          object-fit: cover;
          object-position: center top;
          display: block;
        }

        /* ── PROCESS TIMELINE ── */
        .ptl { position: relative; max-width: 920px; margin: 0 auto; padding: 12px 0; }
        .ptl-spine {
          position: absolute; top: 0; bottom: 0; left: 50%;
          transform: translateX(-50%); width: 2px;
        }
        .ptl-spine::before {
          content: ""; position: absolute; inset: 0;
          background: repeating-linear-gradient(to bottom, rgba(232,133,43,0.35) 0 6px, transparent 6px 14px);
        }
        .ptl-spine-fill {
          position: absolute; top: 0; left: 0; width: 100%; height: 0;
          background: #E8852B; transition: height 1.6s ease;
        }
        .ptl-in .ptl-spine-fill { height: 100%; }
        .ptl-row {
          position: relative; display: grid;
          grid-template-columns: 1fr 96px 1fr; align-items: center;
          min-height: 190px;
          opacity: 0; transform: translateY(26px);
          transition: opacity 0.6s ease, transform 0.6s ease;
        }
        .ptl-in .ptl-row { opacity: 1; transform: translateY(0); }
        .ptl-node {
          grid-column: 2; grid-row: 1; justify-self: center;
          width: 60px; height: 60px; border-radius: 50%;
          background: #E8852B; color: #fff;
          display: flex; align-items: center; justify-content: center;
          font-family: 'Montserrat', sans-serif; font-weight: 700; font-size: 24px;
          z-index: 2;
          box-shadow: 0 0 0 8px #0a0a0a, 0 8px 26px rgba(232,133,43,0.4);
        }
        .ptl-content { max-width: 440px; }
        .ptl-right .ptl-content { grid-column: 3; grid-row: 1; text-align: left; justify-self: start; }
        .ptl-left .ptl-content { grid-column: 1; grid-row: 1; text-align: right; justify-self: end; }
        .ptl-eyebrow {
          display: inline-flex; align-items: center; gap: 8px;
          font-family: 'Montserrat', sans-serif; font-weight: 700; font-size: 12px;
          text-transform: uppercase; letter-spacing: 0.1em; color: #E8852B; margin-bottom: 12px;
        }
        .ptl-left .ptl-eyebrow { flex-direction: row-reverse; }
        .ptl-title {
          font-family: 'Montserrat', sans-serif; font-weight: 700;
          font-size: clamp(22px, 3vw, 32px); color: #fff;
          line-height: 1.15; letter-spacing: -0.01em; margin-bottom: 14px;
        }
        .ptl-body {
          font-family: 'Montserrat', sans-serif; font-size: 15px;
          color: rgba(255,255,255,0.6); line-height: 1.65;
        }

        /* ── FOR / NOT-FOR COMPARISON ── */
        .cmp-grid {
          display: grid; grid-template-columns: 1fr 1fr; gap: 20px;
          max-width: 900px; margin: 0 auto; text-align: left;
        }
        .cmp-col {
          background: #161616; border: 1px solid rgba(255,255,255,0.08);
          border-radius: 10px; padding: 28px 26px;
        }
        .cmp-head {
          font-family: 'Montserrat', sans-serif; font-weight: 700; font-size: 13px;
          text-transform: uppercase; letter-spacing: 0.08em;
          padding-bottom: 16px; margin-bottom: 6px; border-bottom: 1px solid rgba(255,255,255,0.08);
        }
        .cmp-head-for { color: #7FB58A; }
        .cmp-head-not { color: #ff6b6b; }
        .cmp-item { display: flex; align-items: flex-start; gap: 12px; padding: 12px 0; }
        .cmp-mark {
          flex-shrink: 0; width: 22px; height: 22px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          font-family: 'Montserrat', sans-serif; font-weight: 700; font-size: 13px; margin-top: 1px;
        }
        .cmp-mark-for { background: rgba(127,181,138,0.18); color: #7FB58A; }
        .cmp-mark-not { background: rgba(229,72,77,0.18); color: #ff6b6b; }
        .cmp-text {
          font-family: 'Montserrat', sans-serif; font-size: 14px;
          color: rgba(255,255,255,0.75); line-height: 1.5;
        }
        .cmp-text strong { color: #fff; font-weight: 700; }

        @media (max-width: 640px) {
          .ptl-spine { left: 30px; }
          .ptl-row { grid-template-columns: 60px 1fr; min-height: 0; margin-bottom: 36px; align-items: start; }
          .ptl-node { grid-column: 1; width: 52px; height: 52px; font-size: 20px; }
          .ptl-right .ptl-content, .ptl-left .ptl-content {
            grid-column: 2; grid-row: 1; text-align: left; justify-self: start; padding-top: 2px;
          }
          .ptl-left .ptl-eyebrow { flex-direction: row; }
          .cmp-grid { grid-template-columns: 1fr; gap: 16px; }
        }
        @media (prefers-reduced-motion: reduce) {
          .ptl-row { opacity: 1; transform: none; transition: none; }
          .ptl-spine-fill { height: 100%; transition: none; }
        }

        @media (max-width: 780px) {
          .grid-4 { grid-template-columns: 1fr 1fr; gap: 12px; }
          .grid-3 { grid-template-columns: 1fr 1fr; gap: 12px; }
          .hero-stat-row { grid-template-columns: 1fr 1fr 1fr; gap: 8px; max-width: 100%; }
          .roberto-row { grid-template-columns: 1fr; gap: 20px; text-align: center; }
          .roberto-photo-wrap { width: 200px; height: 240px; margin: 0 auto; }
        }
        @media (max-width: 480px) {
          .sec-inner { padding: 48px 16px !important; }
          .hero-inner { padding: 56px 16px 24px !important; }
          .ba-grid { grid-template-columns: 1fr !important; gap: 12px; }
          .ba-grid img { height: auto !important; max-height: 520px; object-fit: contain !important; }
          .ba-card-square { aspect-ratio: auto !important; padding: 8px !important; }
          .agency-stats { grid-template-columns: 1fr !important; gap: 12px; }
          .grid-4 { grid-template-columns: 1fr; gap: 10px; }
          .grid-3 { grid-template-columns: 1fr 1fr; gap: 10px; }
          .grid-2 { grid-template-columns: 1fr; gap: 10px; }
          .hero-stat-row { grid-template-columns: 1fr; gap: 8px; margin-top: 36px; }
          .hero-headline { font-size: 26px !important; letter-spacing: -0.01em !important; }
          .hero-sub { font-size: 14px !important; margin-bottom: 28px !important; }
          .section-title { font-size: 20px !important; }
          .sys-card { padding: 22px 16px !important; text-align: center !important; }
          .sys-card > div:first-child { margin-left: auto !important; margin-right: auto !important; }
          .step-card { padding: 22px 16px !important; text-align: center !important; }
          .industry-card { padding: 20px 12px !important; }
          .ba-img-portrait { max-height: 520px !important; }
          .ba-caption { text-align: center !important; }
          .not-for-list { text-align: center !important; }
          .not-for-item { justify-content: center !important; text-align: center !important; }
          .not-for-item > div:last-child { text-align: center !important; }
          .roberto-row, .roberto-row p, .roberto-row div { text-align: center !important; }
          .body-left { text-align: center !important; }
          .body-left p, .body-left div { text-align: center !important; }
        }
      `}</style>

      {/* ① HERO */}
      <div style={{ background: "#0a0a0a", position: "relative", overflow: "hidden" }}>
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
          className="hero-inner"
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
              color: "#E8852B",
              borderRadius: 999,
              padding: "7px 16px",
              fontFamily: "'Montserrat', sans-serif",
              fontWeight: 600,
              fontSize: 13,
              marginBottom: 26,
            }}
          >
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#E8852B", display: "inline-block" }} />
            Organic Acquisition Funnel
          </div>

          <div
            className="hero-headline"
            style={{
              fontFamily: "'Montserrat', sans-serif",
              fontWeight: 700,
              fontSize: "clamp(26px, 3.3vw, 40px)",
              color: "#fff",
              lineHeight: 1.14,
              letterSpacing: "-0.02em",
              maxWidth: 1240,
              margin: "0 auto 22px",
            }}
          >
            We help professional-service experts generate <span style={{ color: "#E8852B" }}>1 million guaranteed views</span> in 90 days with our Organic Acquisition Funnel.
          </div>

          <div
            className="hero-sub"
            style={{
              fontFamily: "'Montserrat', sans-serif",
              fontWeight: 400,
              fontSize: "clamp(14px, 1.8vw, 17px)",
              color: "rgba(255,255,255,0.6)",
              lineHeight: 1.55,
              maxWidth: 640,
              margin: "28px auto 36px",
            }}
          >
            All it takes is about 4 hours of filming a month — and no thousands spent on ads to get traffic to your page. We handle everything else.
          </div>

          {/* VSL Video — custom player with click-to-start gate */}
          <div
            style={{
              maxWidth: 760,
              margin: "0 auto",
              borderRadius: 16,
              overflow: "hidden",
              border: "1px solid rgba(255,255,255,0.08)",
              boxShadow: "0 24px 70px rgba(0,0,0,0.55)",
              position: "relative",
              background: "#000",
            }}
          >
            <video
              ref={videoRef}
              playsInline
              preload="auto"
              poster="/vsl-espanol-poster.jpg"
              onClick={videoStarted ? togglePlay : undefined}
              onPlay={(e) => {
                setVideoPlaying(true);
                e.currentTarget.playbackRate = speed;
              }}
              onPause={() => setVideoPlaying(false)}
              onEnded={() => setVideoPlaying(false)}
              onTimeUpdate={(e) => {
                const v = e.currentTarget;
                if (v.duration) setVideoProgress(v.currentTime / v.duration);
              }}
              style={{
                width: "100%",
                display: "block",
                aspectRatio: "16 / 9",
                background: "#000",
                cursor: videoStarted ? "pointer" : "default",
                filter: videoStarted ? "none" : "blur(16px)",
                transform: videoStarted ? "none" : "scale(1.1)",
                transition: "filter 0.4s ease",
              }}
            >
              <source src="/VSL_ESPANOL_ROBERTO.mp4" type="video/mp4" />
            </video>

            {/* Click-to-start gate */}
            {!videoStarted && (
              <button
                onClick={startVideo}
                aria-label="Turn on sound and play"
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 18,
                  border: "none",
                  cursor: "pointer",
                  background: "rgba(10,10,10,0.45)",
                  zIndex: 5,
                }}
              >
                <span
                  style={{
                    width: 76,
                    height: 76,
                    borderRadius: "50%",
                    background: "#E8852B",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    animation: "vslPulse 2s infinite",
                  }}
                >
                  <Play size={32} color="#0a0a0a" fill="#0a0a0a" style={{ marginLeft: 4 }} />
                </span>
                <span
                  style={{
                    fontFamily: "'Montserrat', sans-serif",
                    fontWeight: 600,
                    fontSize: "clamp(14px, 2.2vw, 18px)",
                    color: "#fff",
                    letterSpacing: "0.01em",
                    textShadow: "0 2px 12px rgba(0,0,0,0.6)",
                  }}
                >
                  Click to turn on sound
                </span>
              </button>
            )}

            {/* Minimal controls (play/pause + non-seekable progress) */}
            {videoStarted && (
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  position: "absolute",
                  bottom: 0,
                  left: 0,
                  right: 0,
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  padding: "28px 18px 14px",
                  background: "linear-gradient(transparent, rgba(0,0,0,0.72))",
                  zIndex: 6,
                }}
              >
                <button
                  onClick={togglePlay}
                  aria-label={videoPlaying ? "Pause" : "Play"}
                  style={{
                    flexShrink: 0,
                    width: 42,
                    height: 42,
                    borderRadius: "50%",
                    background: "#E8852B",
                    border: "none",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {videoPlaying ? (
                    <Pause size={20} color="#0a0a0a" fill="#0a0a0a" />
                  ) : (
                    <Play size={20} color="#0a0a0a" fill="#0a0a0a" style={{ marginLeft: 2 }} />
                  )}
                </button>
                <div
                  style={{
                    flex: 1,
                    height: 5,
                    borderRadius: 999,
                    background: "rgba(255,255,255,0.25)",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${Math.round(videoProgress * 100)}%`,
                      height: "100%",
                      background: "#E8852B",
                      borderRadius: 999,
                      transition: "width 0.2s linear",
                    }}
                  />
                </div>
                <button
                  onClick={cycleSpeed}
                  aria-label="Playback speed"
                  style={{
                    flexShrink: 0,
                    minWidth: 52,
                    height: 32,
                    padding: "0 10px",
                    borderRadius: 999,
                    background: "rgba(255,255,255,0.12)",
                    border: "1px solid rgba(255,255,255,0.2)",
                    color: "#fff",
                    cursor: "pointer",
                    fontFamily: "'Montserrat', sans-serif",
                    fontWeight: 700,
                    fontSize: 13,
                  }}
                >
                  {speed}×
                </button>
              </div>
            )}
          </div>

          {/* CTA below video */}
          <button
            onClick={scrollToBook}
            style={{
              marginTop: 28,
              display: "inline-block",
              background: "#E8852B",
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
            Book your advisory call →
          </button>
          <div
            style={{
              fontFamily: "'Montserrat', sans-serif",
              fontSize: 13,
              color: "rgba(255,255,255,0.45)",
              marginTop: 14,
            }}
          >
            To maintain quality, we accept a maximum of 5 new clients per month.
          </div>
        </div>
      </div>

      {/* ② WHAT / WHO / HOW */}
      <div style={{ background: "#0d0d0d", borderTop: "1px solid rgba(255,255,255,0.06)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="sec-inner" style={{ maxWidth: 1080, margin: "0 auto", padding: "48px 24px" }}>
          <div className="qqc-grid">
            {[
              { k: "What we do", v: "1 million guaranteed views with ads and organic content." },
              { k: "Who it's for", v: "Any professional-service expert: doctors, lawyers, coaches and consultants." },
              { k: "How", v: "A follow-up system that turns your leads into appointments." },
            ].map((b) => (
              <div className="qqc-card" key={b.k}>
                <div className="qqc-k">{b.k}</div>
                <div className="qqc-v">{b.v}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ③.5 THE PROCESS — how I build the complete system */}
      <Sec>
        <SectionTitle text="THE PROCESS" />
        <SectionSub text="How I build the complete system" />

        <ProcessTimeline />
      </Sec>

      {/* ④ SUCCESS STORIES */}
      <Sec>
        <SectionTitle text="REAL CLIENT RESULTS" />
        <SectionSub text="We work with new and established accounts" />

        {/* Calvin case */}
        <div style={{ marginBottom: 56 }}>
          <div
            style={{
              fontFamily: "'Montserrat', sans-serif",
              fontWeight: 700,
              fontSize: 14,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "#fff",
              marginBottom: 16,
            }}
          >
            DR. CALVIN, CHIROPRACTOR
          </div>

          <img
            className="calvin-text-shot"
            src={calvinClinicProfile}
            alt="Dr. Calvin's Clinic — 158K followers"
            loading="lazy"
            style={{ maxWidth: 620, background: "#fff", padding: 14, boxSizing: "border-box" }}
          />
        </div>

        {/* Zigufit case */}
        <div style={{ marginBottom: 44 }}>
          <div
            style={{
              fontFamily: "'Montserrat', sans-serif",
              fontWeight: 700,
              fontSize: 14,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "#fff",
              marginBottom: 16,
            }}
          >
            ZIGUFIT, FITNESS
          </div>

          <div className="ba-grid" style={{ marginBottom: 0, maxWidth: 560, margin: "0 auto" }}>
            <div className="ba-card">
              <img src={zigufitBefore} alt="ZiguFit before" className="ba-img-portrait" />
              <div className="ba-caption">
                <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(255,255,255,0.45)", marginBottom: 4 }}>
                  BEFORE
                </div>
                <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 700, fontSize: 24, color: "#fff" }}>
                  500 followers
                </div>
              </div>
            </div>
            <div className="ba-card">
              <img src={zigufitAfter} alt="ZiguFit after" className="ba-img-portrait" />
              <div className="ba-caption">
                <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "#E8852B", marginBottom: 4 }}>
                  AFTER
                </div>
                <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 700, fontSize: 24, color: "#E8852B" }}>
                  17.6K followers
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Spencer Barton case — Pecan Health */}
        <div style={{ marginBottom: 44 }}>
          <div
            style={{
              fontFamily: "'Montserrat', sans-serif",
              fontWeight: 700,
              fontSize: 14,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "#fff",
              marginBottom: 16,
            }}
          >
            SPENCER BARTON, NURSE PRACTITIONER
          </div>

          <img
            className="calvin-text-shot"
            src={spencerProfile}
            alt="Spencer Barton — Pecan Health profile, 11K followers"
            loading="lazy"
            style={{ maxWidth: 620, background: "#fff", padding: 14, boxSizing: "border-box", marginBottom: 20 }}
          />

          <img
            className="calvin-text-shot"
            src={spencerImpressions}
            alt="Spencer Barton — 4.26M impressions"
            loading="lazy"
            style={{ maxWidth: 760, background: "#fff", padding: 14, boxSizing: "border-box" }}
          />
          <div
            style={{
              fontFamily: "'Montserrat', sans-serif",
              fontSize: 13,
              fontStyle: "italic",
              color: "rgba(255,255,255,0.5)",
              marginTop: 14,
              textAlign: "center",
            }}
          >
            (2 weeks after working together)
          </div>
        </div>

        {/* DJ R3 case — our founder's own channel */}
        <div style={{ marginBottom: 44 }}>
          <div
            style={{
              fontFamily: "'Montserrat', sans-serif",
              fontWeight: 700,
              fontSize: 14,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "#fff",
              marginBottom: 16,
            }}
          >
            DJ R3 — OUR FOUNDER'S OWN CHANNEL
          </div>

          <img
            className="calvin-text-shot"
            src={djR3Stats}
            alt="DJ R3 — 11,102,238 views generated"
            loading="lazy"
            style={{ maxWidth: 620, background: "#161616", padding: 14, boxSizing: "border-box" }}
          />
          <div
            style={{
              fontFamily: "'Montserrat', sans-serif",
              fontSize: 13,
              fontStyle: "italic",
              color: "rgba(255,255,255,0.5)",
              marginTop: 14,
              textAlign: "center",
            }}
          >
            Over 11M views generated.
          </div>
        </div>

        <ApplyBtn onApply={scrollToBook} />
      </Sec>

      {/* ⑤ IS THIS FOR YOU? — side-by-side comparison */}
      <Sec bg="#121212">
        <SectionTitle text="IS THIS FOR YOU?" />
        <SectionSub text="An honest look at who we can — and can't — help" />

        <div className="cmp-grid">
          {/* WHO IT'S FOR */}
          <div className="cmp-col">
            <div className="cmp-head cmp-head-for">WHO IT'S FOR</div>
            {FOR_QUALITIES.map((item, i) => (
              <div className="cmp-item" key={i}>
                <div className="cmp-mark cmp-mark-for">✓</div>
                <div className="cmp-text">{item}</div>
              </div>
            ))}
            <div className="cmp-item">
              <div className="cmp-mark cmp-mark-for">✓</div>
              <div className="cmp-text">
                <strong>Doctors, lawyers, coaches, consultants &amp; other professional-service experts.</strong>
              </div>
            </div>
          </div>

          {/* WHO IT'S NOT FOR */}
          <div className="cmp-col">
            <div className="cmp-head cmp-head-not">WHO IT'S NOT FOR</div>
            {NOT_FOR.map((item, i) => (
              <div className="cmp-item" key={i}>
                <div className="cmp-mark cmp-mark-not">×</div>
                <div className="cmp-text">{item}</div>
              </div>
            ))}
          </div>
        </div>
      </Sec>

      {/* ⑧ ABOUT ROBERTO */}
      <Sec>
        <SectionTitle text="ABOUT ROBERTO" />

        <div className="roberto-row">
          <div className="roberto-photo-wrap">
            <img src={robertoFounder} alt="Roberto Gauna" className="roberto-photo" />
          </div>
          <div>
            <div
              style={{
                fontFamily: "'Montserrat', sans-serif",
                fontWeight: 700,
                fontSize: 18,
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                color: "#fff",
                marginBottom: 12,
              }}
            >
              ROBERTO GAUNA, FOUNDER
            </div>
            <div
              style={{
                fontFamily: "'Montserrat', sans-serif",
                fontSize: 15,
                color: "rgba(255,255,255,0.72)",
                lineHeight: 1.7,
                marginBottom: 20,
              }}
            >
              He led content and acquisition strategy for Intermountain Immigration, attorney Jonathan Shaw's firm, scaling the account past 650K followers and a steady flow of clients. Today he applies that same Organic Acquisition Funnel at Connecta for cases like Dr. Calvin and Zigufit.
            </div>
            <a
              href="/about"
              style={{
                fontFamily: "'Montserrat', sans-serif",
                fontWeight: 700,
                fontSize: 12,
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                color: "#E8852B",
                textDecoration: "none",
                borderBottom: "2px solid #E8852B",
                paddingBottom: 2,
              }}
            >
              MORE ABOUT ROBERTO →
            </a>
          </div>
        </div>
      </Sec>

      {/* ⑨ BOOK — Calendly embed */}
      <div id="book" style={{ background: "#0a0a0a" }}>
        <div className="sec-inner" style={{ maxWidth: 1080, margin: "0 auto", padding: "72px 24px 96px", textAlign: "center" }}>
          <SectionTitle text="BOOK YOUR ADVISORY CALL" />
          <SectionSub text="30 minutes to map out exactly what this looks like for your business." />
          <div
            className="calendly-inline-widget"
            data-url="https://calendly.com/robertogaunaj/demo-presentation"
            style={{ minWidth: 320, height: 700, maxWidth: 1000, margin: "0 auto", borderRadius: 16, overflow: "hidden" }}
          />
        </div>
      </div>

      {/* FOOTER */}
      <div
        style={{
          background: "#0a0a0a",
          borderTop: "1px solid rgba(255,255,255,0.08)",
          padding: "32px 24px",
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontFamily: "'Montserrat', sans-serif",
            fontWeight: 700,
            fontSize: 12,
            color: "#fff",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            marginBottom: 6,
          }}
        >
          CONTACT US
        </div>
        <div
          style={{
            fontFamily: "'Montserrat', sans-serif",
            fontSize: 13,
            color: "rgba(255,255,255,0.6)",
          }}
        >
          Have questions? Email us at:{" "}
          <a
            href="mailto:admin@connectacreators.com"
            style={{ color: "#E8852B", fontWeight: 700 }}
          >
            admin@connectacreators.com
          </a>
        </div>
      </div>

    </>
  );
}

function ProcessTimeline() {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            setInView(true);
            io.disconnect();
          }
        });
      },
      { threshold: 0.15 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div className={inView ? "ptl ptl-in" : "ptl"} ref={ref}>
      <div className="ptl-spine">
        <div className="ptl-spine-fill" />
      </div>
      {PROCESS_STEPS.map((s, i) => {
        const Icon = s.icon;
        return (
          <div
            className={i % 2 === 0 ? "ptl-row ptl-right" : "ptl-row ptl-left"}
            key={s.phase}
            style={{ transitionDelay: `${i * 0.18}s` }}
          >
            <div className="ptl-node">{i + 1}</div>
            <div className="ptl-content">
              <div className="ptl-eyebrow">
                <Icon size={15} strokeWidth={2.5} />
                {s.phase}
              </div>
              <div className="ptl-title">{s.title}</div>
              <div className="ptl-body">{s.body}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function HeroStat({ number, label, sub }: { number: string; label: string; sub: string }) {
  return (
    <div className="hero-stat">
      <div
        style={{
          fontFamily: "'Montserrat', sans-serif",
          fontWeight: 700,
          fontSize: "clamp(28px, 5vw, 44px)",
          color: "#fff",
          lineHeight: 1,
          letterSpacing: "-0.02em",
          marginBottom: 8,
        }}
      >
        {number}
      </div>
      <div
        style={{
          fontFamily: "'Montserrat', sans-serif",
          fontWeight: 700,
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: "0.12em",
          color: "rgba(255,255,255,0.9)",
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: "'Montserrat', sans-serif",
          fontWeight: 500,
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "rgba(255,255,255,0.65)",
        }}
      >
        {sub}
      </div>
    </div>
  );
}

function BeforeAfterCaption({ platform, before, after }: { platform?: string; before: string; after: string }) {
  return (
    <div className="ba-caption">
      {platform ? (
        <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 700, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(255,255,255,0.45)", marginBottom: 6, textAlign: "center" }}>
          {platform}
        </div>
      ) : null}
      <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center" }}>
        <div>
          <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 700, fontSize: 9, textTransform: "uppercase", color: "#aaa", letterSpacing: "0.08em" }}>BEFORE</div>
          <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 700, fontSize: 18, color: "#fff", lineHeight: 1 }}>{before}</div>
        </div>
        <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 700, fontSize: 14, color: "#ccc" }}>→</div>
        <div>
          <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 700, fontSize: 9, textTransform: "uppercase", color: "#E8852B", letterSpacing: "0.08em" }}>NOW</div>
          <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 700, fontSize: 18, color: "#E8852B", lineHeight: 1 }}>{after}</div>
        </div>
      </div>
    </div>
  );
}
