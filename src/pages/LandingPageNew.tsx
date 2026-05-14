import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Sparkles,
  Calendar,
  Film,
  Flame,
  Send,
  Menu,
  X,
} from "lucide-react";
import "../landing.css";

/* =============================================================================
   The locked editorial system — Ink + Aqua + Honey + EB Garamond + Figtree
   Scoped to the .landing-editorial wrapper class. No global tokens touched.
   ============================================================================= */

/* ─────────────────────────────────────────────────────────────
   Letter-by-letter rise — motion only, no opacity.
   Each character translates up + rotates with a stagger.
   Spaces become non-breaking inside a phrase so words stay together.
   ───────────────────────────────────────────────────────────── */
function LetterRise({
  text,
  delay = 0,
  step = 0.035,
}: {
  text: string;
  delay?: number;
  step?: number;
}) {
  return (
    <>
      {Array.from(text).map((ch, i) => (
        <span
          key={i}
          className="letter-rise"
          style={{ animationDelay: `${delay + i * step}s` }}
        >
          {ch === " " ? " " : ch}
        </span>
      ))}
    </>
  );
}

function WordRise({
  text,
  delay = 0,
  step = 0.08,
}: {
  text: string;
  delay?: number;
  step?: number;
}) {
  const words = text.split(" ");
  return (
    <>
      {words.map((word, i) => (
        <span key={i}>
          <span
            className="word-rise"
            style={{ animationDelay: `${delay + i * step}s` }}
          >
            {word}
          </span>
          {i < words.length - 1 ? " " : ""}
        </span>
      ))}
    </>
  );
}

/* ─────────────────────────────────────────────────────────────
   Peeking editorial character — a creator with a phone showing
   a rising chart. Inline SVG, ink stroke + bone/aqua/honey fills.
   ───────────────────────────────────────────────────────────── */
function PeekingCreator({ style }: { style?: React.CSSProperties }) {
  return (
    <svg
      viewBox="0 0 200 240"
      xmlns="http://www.w3.org/2000/svg"
      style={style}
      aria-hidden
    >
      {/* Hair squiggles */}
      <path
        d="M 70 32 Q 76 22, 86 28 Q 96 20, 104 28 Q 113 22, 122 30 Q 130 28, 132 38"
        stroke="#0A0E12"
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
      />
      {/* Head */}
      <circle cx="100" cy="52" r="22" fill="#FBF8EE" stroke="#0A0E12" strokeWidth="2.5" />
      {/* Glasses */}
      <circle cx="92" cy="50" r="5" fill="none" stroke="#0A0E12" strokeWidth="1.8" />
      <circle cx="108" cy="50" r="5" fill="none" stroke="#0A0E12" strokeWidth="1.8" />
      <line x1="97" y1="50" x2="103" y2="50" stroke="#0A0E12" strokeWidth="1.8" strokeLinecap="round" />
      {/* Smile */}
      <path d="M 93 60 Q 100 64, 107 60" stroke="#0A0E12" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      {/* Neck */}
      <line x1="100" y1="74" x2="100" y2="86" stroke="#0A0E12" strokeWidth="2.5" />
      {/* Body / sweater */}
      <path
        d="M 64 116 Q 72 86, 100 86 Q 128 86, 136 116 L 138 200 L 62 200 Z"
        fill="#E0A560"
        stroke="#0A0E12"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      {/* Collar stripe */}
      <path
        d="M 80 96 Q 100 100, 120 96"
        stroke="#0A0E12"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
      />
      {/* Arm raised holding phone */}
      <path
        d="M 138 116 Q 154 100, 168 82"
        stroke="#0A0E12"
        strokeWidth="2.5"
        fill="none"
        strokeLinecap="round"
      />
      {/* Phone body */}
      <rect
        x="150"
        y="48"
        width="26"
        height="42"
        rx="5"
        fill="#0A0E12"
        stroke="#0A0E12"
        strokeWidth="2.5"
      />
      {/* Phone screen */}
      <rect x="153" y="53" width="20" height="32" rx="2" fill="#8FD0D5" />
      {/* Rising chart inside screen */}
      <path
        d="M 155 76 L 159 71 L 163 73 L 167 67 L 171 62"
        stroke="#0A0E12"
        strokeWidth="1.8"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Tiny arrowhead */}
      <path
        d="M 171 62 L 168 63 M 171 62 L 170 65"
        stroke="#0A0E12"
        strokeWidth="1.6"
        fill="none"
        strokeLinecap="round"
      />
      {/* Sparkle viral indicators */}
      <path
        d="M 180 38 L 184 34 L 180 30 L 176 34 Z"
        fill="#E0A560"
        stroke="#0A0E12"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <circle cx="186" cy="68" r="3" fill="#8FD0D5" stroke="#0A0E12" strokeWidth="1.6" />
      <g stroke="#0A0E12" strokeWidth="2" strokeLinecap="round">
        <line x1="186" y1="22" x2="190" y2="22" />
        <line x1="188" y1="20" x2="188" y2="24" />
      </g>
      {/* Hands at waist */}
      <circle cx="64" cy="120" r="6" fill="#FBF8EE" stroke="#0A0E12" strokeWidth="2" />
    </svg>
  );
}

/* ─────────────────────────────────────────────────────────────
   Super Canvas mockup — the screenshot moment.
   Node-based strategy visualization. One node "live" pulsing.
   ───────────────────────────────────────────────────────────── */
function SuperCanvasMock() {
  return (
    <div
      className="relative w-full overflow-hidden"
      style={{
        height: 460,
        background: "#15181E",
        border: "1.5px solid #0A0E12",
        borderRadius: 22,
        boxShadow: "6px 6px 0 #0A0E12",
      }}
    >
      {/* Title strip — editorial, not code-editor */}
      <div
        className="flex items-center justify-between"
        style={{
          padding: "18px 24px",
          borderBottom: "1px solid rgba(234, 230, 220, 0.07)",
          background: "rgba(10, 14, 18, 0.40)",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
          <span
            style={{
              fontFamily: "'EB Garamond', serif",
              fontSize: 19,
              fontWeight: 500,
              letterSpacing: "-0.01em",
              color: "var(--bone)",
            }}
          >
            Super Canvas
          </span>
          <span
            style={{
              fontFamily: "'EB Garamond', serif",
              fontStyle: "italic",
              fontSize: 15,
              color: "var(--bone-3)",
            }}
          >
            — Luna's spring strategy
          </span>
        </div>
        <span className="pill pill-honey">
          <span className="pill-dot" /> Companion · drafting
        </span>
      </div>

      {/* Canvas */}
      <div className="relative" style={{ height: "calc(100% - 49px)", padding: 24 }}>
        {/* Connection lines */}
        <svg
          width="100%"
          height="100%"
          viewBox="0 0 800 400"
          preserveAspectRatio="none"
          style={{ position: "absolute", inset: 24, pointerEvents: "none" }}
        >
          {/* Central brand node lines */}
          <path d="M 400 200 Q 250 130, 130 90" className="sc-canvas-line" />
          <path d="M 400 200 Q 270 200, 130 200" className="sc-canvas-line" />
          <path d="M 400 200 Q 250 270, 130 320" className="sc-canvas-line" />
          <path d="M 400 200 Q 550 130, 680 90" className="sc-canvas-line honey" />
          <path d="M 400 200 Q 540 200, 680 200" className="sc-canvas-line" />
          <path d="M 400 200 Q 550 270, 680 320" className="sc-canvas-line" />
        </svg>

        {/* Central Brand node — editorial / magazine-clipping feel */}
        <div
          className="sc-node active"
          style={{
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            minWidth: 200,
            padding: "16px 18px",
          }}
        >
          <span
            style={{
              fontFamily: "'EB Garamond', serif",
              fontStyle: "italic",
              fontSize: 12,
              color: "var(--honey)",
              letterSpacing: "0.01em",
            }}
          >
            — the brand
          </span>
          <span
            className="serif"
            style={{ fontSize: 22, lineHeight: 1.0, marginTop: 2, fontWeight: 500 }}
          >
            Luna Reyes
          </span>
          <span
            style={{
              fontFamily: "'EB Garamond', serif",
              fontStyle: "italic",
              fontSize: 12.5,
              color: "var(--bone-2)",
              marginTop: 4,
            }}
          >
            2.4M followers · fashion + lifestyle
          </span>
          <span className="sc-node-pill honey" style={{ marginTop: 8 }}>● strategy live</span>
        </div>

        {/* Satellite nodes — softer, more editorial labels */}
        <div className="sc-node" style={{ top: "10%", left: "3%", padding: "14px 16px" }}>
          <span style={{ fontFamily: "'EB Garamond', serif", fontStyle: "italic", fontSize: 11.5, color: "var(--aqua)" }}>
            — her audience
          </span>
          <span className="serif" style={{ fontSize: 15, marginTop: 4 }}>
            Listens at <em className="serif-italic">8pm Tuesday.</em>
          </span>
          <span style={{ fontSize: 11, color: "var(--bone-3)", marginTop: 4 }}>22–34 · LA + NYC</span>
        </div>

        <div className="sc-node" style={{ top: "45%", left: "3%", padding: "14px 16px" }}>
          <span style={{ fontFamily: "'EB Garamond', serif", fontStyle: "italic", fontSize: 11.5, color: "var(--aqua)" }}>
            — her voice
          </span>
          <span className="serif" style={{ fontSize: 15, marginTop: 4 }}>
            Dry, <em className="serif-italic">slightly funny.</em>
          </span>
          <span style={{ fontSize: 11, color: "var(--bone-3)", marginTop: 4 }}>trained · last 50 posts</span>
        </div>

        <div className="sc-node" style={{ top: "80%", left: "3%", padding: "14px 16px" }}>
          <span style={{ fontFamily: "'EB Garamond', serif", fontStyle: "italic", fontSize: 11.5, color: "var(--aqua)" }}>
            — her best hook
          </span>
          <span className="serif" style={{ fontSize: 14, marginTop: 4, fontStyle: "italic" }}>
            "Three things I wish I knew…"
          </span>
          <span className="sc-node-pill" style={{ marginTop: 6 }}>9.2 / 10</span>
        </div>

        <div className="sc-node" style={{ top: "10%", right: "3%", padding: "14px 16px" }}>
          <span style={{ fontFamily: "'EB Garamond', serif", fontStyle: "italic", fontSize: 11.5, color: "var(--honey)" }}>
            — hot this week
          </span>
          <span className="serif" style={{ fontSize: 14, marginTop: 4, fontStyle: "italic" }}>
            "Soft launch the chaos"
          </span>
          <span className="sc-node-pill honey" style={{ marginTop: 6 }}>▲ 340% w/w</span>
        </div>

        <div className="sc-node" style={{ top: "45%", right: "3%", padding: "14px 16px" }}>
          <span style={{ fontFamily: "'EB Garamond', serif", fontStyle: "italic", fontSize: 11.5, color: "var(--honey)" }}>
            — the calendar
          </span>
          <span className="serif" style={{ fontSize: 15, marginTop: 4 }}>
            5 posts <em className="serif-italic">drafted.</em>
          </span>
          <span style={{ fontSize: 11, color: "var(--bone-3)", marginTop: 4 }}>Mon 9am · Wed 7pm · …</span>
        </div>

        <div className="sc-node" style={{ top: "80%", right: "3%", padding: "14px 16px" }}>
          <span style={{ fontFamily: "'EB Garamond', serif", fontStyle: "italic", fontSize: 11.5, color: "var(--honey)" }}>
            — next ask
          </span>
          <span className="serif" style={{ fontSize: 14, marginTop: 4 }}>
            Skincare partner <em className="serif-italic">draft.</em>
          </span>
          <span className="sc-node-pill" style={{ marginTop: 6 }}>auto-saved</span>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Viral Today mockup — trending feed.
   ───────────────────────────────────────────────────────────── */
function ViralTodayMock() {
  const rows = [
    {
      letter: "S",
      meta: "@softlife · TikTok · 2h",
      title: "Soft launch your year, not your relationship",
      score: "12× outlier",
      pill: "Hook stolen",
      tone: "aqua" as const,
    },
    {
      letter: "M",
      meta: "@morningclub · Reels · 4h",
      title: "Why I stopped journaling at 5am",
      score: "8× outlier",
      pill: "Remix ready",
      tone: "honey" as const,
    },
    {
      letter: "C",
      meta: "@creatorlab · Shorts · 7h",
      title: "The hook formula that never fails",
      score: "9× outlier",
      pill: "Saved",
      tone: "aqua" as const,
    },
    {
      letter: "D",
      meta: "@drjuno · TikTok · today",
      title: "Three foods cardiologists never eat",
      score: "14× outlier",
      pill: "Hot",
      tone: "honey" as const,
    },
  ];
  return (
    <div
      style={{
        padding: 22,
        background: "#FBF8EE",
        border: "1.5px solid var(--ink)",
        boxShadow: "5px 5px 0 var(--ink)",
        borderRadius: 20,
        color: "var(--ink)",
      }}
    >
      <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
        <div className="flex items-center gap-2">
          <Flame size={14} style={{ color: "var(--honey)" }} />
          <span
            style={{
              fontFamily: "'Figtree', sans-serif",
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "var(--honey)",
            }}
          >
            Viral Today · Wed, May 14
          </span>
        </div>
        <span className="pill pill-muted">12,847 scanned</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {rows.map((r, i) => (
          <div key={i} className="vt-card">
            <div className={`vt-thumb ${r.tone === "honey" ? "honey" : ""}`}>{r.letter}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="vt-meta">{r.meta}</div>
              <div className="vt-title">{r.title}</div>
              <div className="flex items-center gap-2" style={{ flexWrap: "wrap" }}>
                <span className={`vt-score ${r.tone === "aqua" ? "aqua" : ""}`}>
                  {r.score}
                </span>
                <span
                  className={`pill ${r.tone === "aqua" ? "pill-aqua" : "pill-honey"}`}
                  style={{ fontSize: 10 }}
                >
                  {r.pill}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Pipeline trio — editing queue / calendar / companion.
   ───────────────────────────────────────────────────────────── */
function PipelineCard({
  eyebrow,
  title,
  body,
  icon: Icon,
  children,
}: {
  eyebrow: string;
  title: string;
  body: string;
  icon: typeof Calendar;
  children?: React.ReactNode;
}) {
  return (
    <div className="card card-lift" style={{ padding: "32px 28px 28px", display: "flex", flexDirection: "column", gap: 16, height: "100%" }}>
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 12,
          background: "rgba(143, 208, 213, 0.10)",
          display: "grid",
          placeItems: "center",
          color: "var(--aqua)",
        }}
      >
        <Icon size={20} strokeWidth={1.6} />
      </div>
      <div>
        <span className="eyebrow">{eyebrow}</span>
      </div>
      <h3 className="serif" style={{ fontSize: 24, lineHeight: 1.1, margin: 0, letterSpacing: "-0.01em" }}>
        {title}
      </h3>
      <p style={{ fontSize: 14, color: "var(--bone-2)", margin: 0, lineHeight: 1.6 }}>{body}</p>
      {children && (
        <div
          style={{
            marginTop: 4,
            borderTop: "1px solid var(--line)",
            paddingTop: 16,
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

/* =============================================================================
   The page
   ============================================================================= */

export default function LandingPageNew() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const scrollRoot = useRef<HTMLDivElement | null>(null);

  // sticky nav state
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 30);
    onScroll();
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // scroll-fade-in
  useEffect(() => {
    if (!scrollRoot.current) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("is-in");
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
    );
    const targets = scrollRoot.current.querySelectorAll(".scroll-rise");
    targets.forEach((t) => io.observe(t));
    return () => io.disconnect();
  }, []);

  return (
    <div className="landing-editorial" ref={scrollRoot}>
      {/* ===== Announcement banner ===== */}
      <div
        style={{
          background: "var(--bone)",
          color: "var(--ink)",
          padding: "10px 24px",
          textAlign: "center",
          fontSize: 13,
          fontFamily: "'Figtree', sans-serif",
          fontWeight: 500,
          margin: "12px 18px 0",
          borderRadius: 999,
        }}
      >
        <span style={{ marginRight: 6 }}>
          <Flame size={11} style={{ display: "inline-block", color: "var(--ink)", marginRight: 6, marginBottom: -1 }} />
          <strong style={{ fontWeight: 700 }}>Viral Today is live.</strong>
        </span>
        Spot trends before your feed catches on.{" "}
        <Link to="/scripts" style={{ color: "var(--ink)", fontWeight: 700, marginLeft: 4, textDecoration: "underline" }}>
          Try it →
        </Link>
      </div>

      {/* ===== Nav ===== */}
      <nav
        style={{
          position: "sticky",
          top: 0,
          zIndex: 50,
          backdropFilter: scrolled ? "blur(18px)" : "none",
          background: scrolled ? "rgba(10,14,18,0.78)" : "transparent",
          borderBottom: scrolled ? "1px solid var(--line)" : "1px solid transparent",
          transition: "all 220ms ease",
        }}
      >
        <div
          style={{
            maxWidth: 1200,
            margin: "0 auto",
            padding: "18px 32px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Link to="/" style={{ display: "inline-flex", alignItems: "baseline", gap: 0 }}>
            <span
              className="serif"
              style={{ fontSize: 26, color: "var(--bone)", letterSpacing: "-0.01em", fontWeight: 500 }}
            >
              Connect
            </span>
            <span
              className="serif-italic"
              style={{ fontSize: 26, color: "var(--honey)", letterSpacing: "-0.01em" }}
            >
              a
            </span>
          </Link>

          <div
            className="hidden-mobile"
            style={{
              display: "flex",
              gap: 30,
              fontSize: 14,
              color: "var(--bone-2)",
              fontFamily: "'Figtree', sans-serif",
            }}
          >
            <a href="#brain" className="scribble-link">The Brain</a>
            <a href="#viral" className="scribble-link">Viral Today</a>
            <a href="#pipeline" className="scribble-link">Pipeline</a>
            <a href="#pricing" className="scribble-link">Pricing</a>
          </div>

          <div className="hidden-mobile" style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Link
              to="/scripts"
              style={{
                fontSize: 14,
                color: "var(--bone-2)",
                fontFamily: "'Figtree', sans-serif",
              }}
            >
              Sign in
            </Link>
            <Link to="/scripts" className="btn btn-aqua">
              Get started
            </Link>
          </div>

          <button
            className="hidden-desktop"
            onClick={() => setMobileOpen((x) => !x)}
            aria-label="Menu"
            style={{
              background: "transparent",
              border: "none",
              color: "var(--bone)",
              cursor: "pointer",
              padding: 8,
              display: "none",
            }}
          >
            {mobileOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>

        {mobileOpen && (
          <div
            style={{
              borderTop: "1px solid var(--line)",
              padding: "16px 32px 22px",
              background: "rgba(10,14,18,0.95)",
              display: "flex",
              flexDirection: "column",
              gap: 14,
              fontSize: 15,
            }}
          >
            <a href="#brain" onClick={() => setMobileOpen(false)}>The Brain</a>
            <a href="#viral" onClick={() => setMobileOpen(false)}>Viral Today</a>
            <a href="#pipeline" onClick={() => setMobileOpen(false)}>Pipeline</a>
            <a href="#pricing" onClick={() => setMobileOpen(false)}>Pricing</a>
            <Link to="/scripts" className="btn btn-aqua" style={{ marginTop: 8, alignSelf: "flex-start" }}>
              Get started
            </Link>
          </div>
        )}
      </nav>

      <style>{`
        @media (max-width: 768px) {
          .landing-editorial .hidden-mobile { display: none !important; }
          .landing-editorial .hidden-desktop { display: inline-flex !important; }
        }
      `}</style>

      {/* ===== HERO ===== */}
      <section className="bg-ink" style={{ position: "relative", paddingTop: 80, paddingBottom: 60, overflow: "hidden" }}>
        {/* Curved marginalia */}
        <div
          className="curl curl-hide-mobile"
          data-reveal="7"
          style={{ top: 120, left: "4%", "--curl-rot": "rotate(-9deg)", transform: "rotate(-9deg)" } as React.CSSProperties}
        >
          — for creators who'd rather create
        </div>
        <div
          className="curl curl-hide-mobile"
          data-reveal="7"
          style={{ top: 220, right: "3%", "--curl-rot": "rotate(7deg)", transform: "rotate(7deg)" } as React.CSSProperties}
        >
          no more 14 tabs, no more notion graveyard, just the next move
        </div>

        <div
          style={{
            position: "relative",
            zIndex: 1,
            maxWidth: 1080,
            margin: "0 auto",
            padding: "0 32px",
            textAlign: "center",
          }}
        >
          <div data-reveal="1" style={{ marginBottom: 26 }}>
            <span className="eyebrow">The AI strategist for creators</span>
          </div>

          <h1
            className="serif"
            style={{
              fontSize: "clamp(52px, 10vw, 144px)",
              lineHeight: 0.98,
              letterSpacing: "-0.03em",
              fontWeight: 500,
              margin: 0,
              marginBottom: 26,
            }}
          >
            <span style={{ display: "block", overflow: "hidden", paddingBottom: "0.06em" }}>
              <LetterRise text="Go " delay={0.25} step={0.04} />
              <span
                className="serif-italic scribble-hover honey"
                style={{
                  display: "inline-block",
                  color: "var(--honey)",
                  fontWeight: 400,
                }}
              >
                <LetterRise text="Viral," delay={0.40} step={0.04} />
                {/* sparkles — appear on hover with spring scale */}
                <svg className="spark s1" viewBox="0 0 24 24" aria-hidden>
                  <path
                    d="M12 1 L14.2 9.8 L23 12 L14.2 14.2 L12 23 L9.8 14.2 L1 12 L9.8 9.8 Z"
                    fill="var(--honey)"
                    stroke="var(--ink)"
                    strokeWidth="1.6"
                    strokeLinejoin="round"
                  />
                </svg>
                <svg className="spark s2" viewBox="0 0 24 24" aria-hidden>
                  <path
                    d="M12 3 L13.5 10.5 L21 12 L13.5 13.5 L12 21 L10.5 13.5 L3 12 L10.5 10.5 Z"
                    fill="var(--aqua)"
                    stroke="var(--ink)"
                    strokeWidth="1.6"
                    strokeLinejoin="round"
                  />
                </svg>
                <svg className="spark s3" viewBox="0 0 24 24" aria-hidden>
                  <circle cx="12" cy="12" r="5" fill="var(--bone)" stroke="var(--ink)" strokeWidth="2" />
                </svg>
              </span>
            </span>
            <span style={{ display: "block", overflow: "hidden", paddingBottom: "0.06em" }}>
              <LetterRise text="Get " delay={0.68} step={0.04} />
              <span
                className="serif-italic scribble-hover aqua"
                style={{
                  display: "inline-block",
                  color: "var(--aqua)",
                  fontWeight: 400,
                }}
              >
                <LetterRise text="Clients." delay={0.85} step={0.04} />
              </span>
            </span>
          </h1>

          <p
            data-reveal="3"
            style={{
              fontSize: "clamp(15px, 1.6vw, 19px)",
              color: "var(--bone-2)",
              maxWidth: 580,
              margin: "0 auto 40px",
              lineHeight: 1.55,
            }}
          >
            Connecta plans your next 30 days of content before you open the app. Hooks that
            land, posts that book — strategy, scripts, and schedule done for you.
          </p>

          <div
            data-reveal="4"
            style={{
              display: "flex",
              gap: 12,
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            <Link to="/scripts" className="btn btn-aqua btn-large">
              Start free for 14 days <ArrowRight size={16} />
            </Link>
            <a
              href="#brain"
              className="btn btn-ghost btn-large"
            >
              ▶ Watch the 90-sec tour
            </a>
          </div>

          <div
            data-reveal="5"
            style={{
              marginTop: 18,
              fontSize: 12.5,
              color: "var(--bone-3)",
              letterSpacing: "0.02em",
            }}
          >
            No credit card · Cancel anytime · Made in Los Angeles
          </div>
        </div>

        {/* Hero mockup */}
        <div
          data-reveal="6"
          style={{
            position: "relative",
            zIndex: 1,
            maxWidth: 1080,
            margin: "60px auto 0",
            padding: "0 32px",
          }}
        >
          <SuperCanvasMock />
        </div>
      </section>

      {/* ===== Real track record — bone panel ===== */}
      <section className="panel-bone" style={{ padding: "80px 0 90px", marginTop: 24, position: "relative", overflow: "visible" }}>
        {/* Peeking creator — pokes up from the top-right of the bone panel into the ink page above */}
        <PeekingCreator
          style={{
            position: "absolute",
            top: -110,
            right: "6%",
            width: 110,
            height: 168,
            zIndex: 5,
            pointerEvents: "none",
          }}
        />
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 32px", position: "relative" }}>
          <div
            className="scroll-rise"
            style={{
              textAlign: "center",
              fontSize: 11,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: "rgba(10,14,18,0.45)",
              fontWeight: 600,
              marginBottom: 36,
            }}
          >
            What Connecta has built <span className="scribble-under ink" style={{ display: "inline-block" }}>for creators</span>
          </div>

          <div
            className="scroll-rise"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, 1fr)",
              gap: 24,
              alignItems: "stretch",
            }}
          >
            {[
              {
                num: "100M+",
                kicker: "views generated",
                body: "Across reels, shorts, and TikToks for the creators using our scripts and strategy.",
                accent: "honey" as const,
              },
              {
                num: "100K+",
                kicker: "followers grown",
                body: "Real audiences, built on the back of strategy — not hacks, not bots, not luck.",
                accent: "aqua" as const,
              },
            ].map((s, i) => (
              <div
                key={i}
                data-card
                style={{
                  textAlign: "center",
                  padding: "36px 28px",
                  background: "#FBF8EE",
                  border: "1.5px solid var(--ink)",
                  borderRadius: 24,
                  boxShadow: "4px 4px 0 var(--ink)",
                }}
              >
                <div
                  className="serif scroll-rise"
                  style={{
                    fontSize: "clamp(56px, 8vw, 96px)",
                    lineHeight: 1.0,
                    letterSpacing: "-0.03em",
                    fontWeight: 500,
                    color: s.accent === "honey" ? "#A85B1F" : "#2A6F77",
                    fontStyle: "italic",
                  }}
                >
                  <span
                    className={`scribble-under ${s.accent === "honey" ? "honey" : "aqua"}`}
                    style={{ display: "inline-block" }}
                  >
                    {s.num}
                  </span>
                </div>
                <div
                  style={{
                    fontFamily: "'Figtree', sans-serif",
                    fontSize: 12,
                    letterSpacing: "0.18em",
                    textTransform: "uppercase",
                    color: "rgba(10,14,18,0.65)",
                    fontWeight: 600,
                    marginTop: 12,
                  }}
                >
                  {s.kicker}
                </div>
                <p
                  style={{
                    margin: "12px auto 0",
                    fontSize: 14,
                    color: "rgba(10,14,18,0.55)",
                    maxWidth: 380,
                    lineHeight: 1.55,
                  }}
                >
                  {s.body}
                </p>
              </div>
            ))}
          </div>

          <div
            className="scroll-rise"
            style={{
              textAlign: "center",
              marginTop: 32,
              fontFamily: "'EB Garamond', serif",
              fontStyle: "italic",
              fontSize: 16,
              color: "rgba(10,14,18,0.50)",
              letterSpacing: "0.005em",
            }}
          >
            — and we're just getting started.
          </div>
        </div>
      </section>

      {/* ===== Section 1 — THE BRAIN (Super Canvas) ===== */}
      <section id="brain" className="bg-ink" style={{ padding: "140px 0", position: "relative" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 32px", position: "relative" }}>
          <div
            className="scroll-rise"
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1.2fr",
              gap: 80,
              alignItems: "center",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <span className="eyebrow">The Jarvis</span>
              <h2 className="section-h2" style={{ margin: "16px 0 22px" }}>
                <em className="soft">The brain.</em>
                <br />
                It plans before{" "}
                <span
                  className="scribble-under aqua"
                  style={{ display: "inline-block", fontStyle: "italic", color: "var(--aqua)", fontWeight: 500 }}
                >
                  you post.
                </span>
              </h2>
              <p className="section-lede" style={{ marginBottom: 28 }}>
                Super Canvas studies your brand voice, your audience, what's spiking on the
                feed, and what your last 50 posts taught it. Then it lays out the next 30
                days — visually, editably, in one place.
              </p>

              <ul style={{ listStyle: "none", padding: 0, margin: "0 0 36px", display: "flex", flexDirection: "column", gap: 14 }}>
                {[
                  ["Brand voice trained on your last 50 posts", "Captions in your tone"],
                  ["30-day strategy generated in a single click", "Strategy mode"],
                  ["Live trend overlays from Viral Today", "Trend layer"],
                  ["Drag, rewrite, regenerate — every node is editable", "Always interactive"],
                ].map(([line, tag], i) => (
                  <li key={i} style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        background: "var(--aqua)",
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ flex: 1, fontSize: 15, color: "var(--bone)" }}>{line}</span>
                    <span className="pill pill-aqua" style={{ fontSize: 10 }}>
                      {tag}
                    </span>
                  </li>
                ))}
              </ul>

              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <Link to="/scripts" className="btn btn-aqua">
                  Open Super Canvas <ArrowRight size={15} />
                </Link>
                <a href="#viral" className="btn btn-ghost">See trends</a>
              </div>
            </div>

            {/* Canvas mini-perspective (different from hero) */}
            <div style={{ minWidth: 0 }}>
              <div
                className="card"
                style={{
                  padding: 24,
                  background: "var(--graphite)",
                  border: "1.5px solid var(--ink)",
                  boxShadow: "5px 5px 0 var(--ink)",
                  position: "relative",
                }}
              >
                <div className="flex items-center justify-between" style={{ marginBottom: 18 }}>
                  <span className="eyebrow">Today's plan · auto-drafted</span>
                  <span className="pill pill-aqua"><span className="pill-dot" />live</span>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {[
                    { time: "MON 9:00 AM", title: "Spring lookbook · Reel", platform: "IG", status: "Scheduled", pill: "aqua" as const },
                    { time: "MON 7:00 PM", title: "Behind the shoot — day 1", platform: "TikTok", status: "Drafting", pill: "honey" as const },
                    { time: "TUE 12:00 PM", title: "Skincare partner ask", platform: "Shorts", status: "In review", pill: "honey" as const },
                    { time: "WED 8:00 PM", title: "\"3 things I wish I knew…\"", platform: "Reel", status: "Hook ready", pill: "aqua" as const },
                    { time: "THU 6:00 PM", title: "Recurring · weekly recap", platform: "IG", status: "Auto", pill: "aqua" as const },
                  ].map((row, i) => (
                    <div
                      key={i}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "76px 1fr auto",
                        gap: 14,
                        alignItems: "center",
                        padding: "10px 12px",
                        borderRadius: 10,
                        background: "rgba(234,230,220,0.02)",
                        border: "1px solid var(--line)",
                        fontSize: 12.5,
                      }}
                    >
                      <span
                        style={{
                          fontFamily: "'Figtree', monospace",
                          fontSize: 10.5,
                          color: "var(--bone-3)",
                          letterSpacing: "0.06em",
                          fontWeight: 600,
                        }}
                      >
                        {row.time}
                      </span>
                      <div>
                        <div className="serif" style={{ fontSize: 14, color: "var(--bone)" }}>
                          {row.title}
                        </div>
                        <div style={{ fontSize: 11, color: "var(--bone-3)", marginTop: 1 }}>
                          {row.platform}
                        </div>
                      </div>
                      <span className={`pill pill-${row.pill}`} style={{ fontSize: 10 }}>
                        {row.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== Section 2 — VIRAL TODAY (Bone panel) ===== */}
      <section id="viral" className="panel-bone" style={{ padding: "120px 0", position: "relative", marginTop: 24 }}>
        <div
          className="curl curl-hide-mobile scroll-rise"
          style={{ top: 80, left: "8%", transform: "rotate(-5deg)", color: "rgba(10,14,18,0.32)" }}
        >
          before the algorithm catches on
        </div>

        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 32px", position: "relative" }}>
          <div
            className="scroll-rise"
            style={{
              display: "grid",
              gridTemplateColumns: "1.1fr 1fr",
              gap: 80,
              alignItems: "center",
            }}
          >
            <div>
              <ViralTodayMock />
            </div>

            <div>
              <span className="eyebrow eyebrow-honey">Viral Today</span>
              <h2 className="section-h2" style={{ margin: "16px 0 22px", color: "var(--ink)" }}>
                What's working <em style={{ color: "rgba(10,14,18,0.55)", fontStyle: "italic", fontWeight: 400 }}>right now,</em>
                <br />
                <span
                  className="scribble-under honey"
                  style={{ display: "inline-block", color: "#A85B1F", fontStyle: "italic", fontWeight: 500 }}
                >
                  sorted for you.
                </span>
              </h2>
              <p className="section-lede" style={{ marginBottom: 28, color: "rgba(10,14,18,0.65)" }}>
                Connecta scans the feeds your audience is on, flags outlier videos that beat
                their channel's average by 8× or more, and shows you the hooks before everyone
                else copies them.
              </p>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 32 }}>
                {[
                  { num: "01", title: "Spot the trend", body: "Sorted by outlier score, not view count." },
                  { num: "02", title: "Borrow the hook", body: "One-click remix into your voice." },
                  { num: "03", title: "Ship it", body: "Push to Super Canvas. Done by Tuesday." },
                ].map((s, i) => (
                  <div
                    key={i}
                    style={{
                      padding: "20px 18px",
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                      background: "#FBF8EE",
                      border: "1.5px solid var(--ink)",
                      borderRadius: 14,
                      boxShadow: "3px 3px 0 var(--ink)",
                    }}
                  >
                    <span style={{ fontFamily: "'Figtree', sans-serif", fontSize: 11, color: "#A85B1F", letterSpacing: "0.1em", fontWeight: 700 }}>
                      {s.num}
                    </span>
                    <div className="serif" style={{ fontSize: 17, color: "var(--ink)", letterSpacing: "-0.005em" }}>
                      {s.title}
                    </div>
                    <div style={{ fontSize: 12.5, color: "rgba(10,14,18,0.55)", lineHeight: 1.5 }}>
                      {s.body}
                    </div>
                  </div>
                ))}
              </div>

              <Link to="/scripts" className="btn btn-honey">
                Open Viral Today <ArrowRight size={15} />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ===== Section 3 — PIPELINE (Editing / Calendar / Companion) ===== */}
      <section id="pipeline" className="bg-ink" style={{ padding: "120px 0", marginTop: 24, position: "relative" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 32px", textAlign: "center" }}>
          <div className="scroll-rise">
            <span className="eyebrow">The pipeline</span>
            <h2 className="section-h2" style={{ margin: "16px auto 22px", maxWidth: 760 }}>
              The production layer
              <br />
              <em className="soft">underneath the strategy.</em>
            </h2>
            <p className="section-lede" style={{ margin: "0 auto 56px", textAlign: "center" }}>
              Plans only matter if they ship. The pipeline tracks every video from idea to
              edit to approval — so nothing dies in a Slack thread.
            </p>
          </div>

          <div
            className="scroll-rise"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 18,
              textAlign: "left",
            }}
          >
            <PipelineCard
              eyebrow="Editing Queue"
              icon={Film}
              title="Every cut, every revision, in one place."
              body="Editors and clients see the same screen. No more Slack archaeology to find the latest version."
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {[
                  { title: "Spring lookbook reel", state: "Cut 3 · review", pill: "honey" as const },
                  { title: "Skincare routine v3", state: "Approved", pill: "aqua" as const },
                  { title: "Behind the shoot", state: "Drafting", pill: "muted" as const },
                ].map((r, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, fontSize: 12 }}>
                    <span className="serif" style={{ color: "var(--bone-2)", fontSize: 13 }}>{r.title}</span>
                    <span className={`pill pill-${r.pill}`}>{r.state}</span>
                  </div>
                ))}
              </div>
            </PipelineCard>

            <PipelineCard
              eyebrow="Content Calendar"
              icon={Calendar}
              title="A calendar that thinks ahead."
              body="Drag posts across platforms. Companion AI suggests the best slot based on your audience and past performance."
            >
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
                {Array.from({ length: 21 }).map((_, i) => {
                  const has = [3, 4, 7, 10, 11, 14, 17].includes(i);
                  const hot = [4, 11].includes(i);
                  return (
                    <div
                      key={i}
                      style={{
                        aspectRatio: "1",
                        borderRadius: 6,
                        background: has
                          ? hot
                            ? "var(--honey-soft)"
                            : "var(--aqua-soft)"
                          : "rgba(234,230,220,0.04)",
                        border: "1px solid var(--line)",
                      }}
                    />
                  );
                })}
              </div>
            </PipelineCard>

            <PipelineCard
              eyebrow="Companion AI"
              icon={Sparkles}
              title="Drafts in your voice, before you ask."
              body="Hooks, captions, scripts, follow-ups — all generated in your tone, ready to tweak. You stay in the director's chair."
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ fontSize: 12.5, color: "var(--bone-2)", fontStyle: "italic" }} className="serif-italic">
                  "Caption that feels like Luna — 9 words, low-key, no exclamation marks."
                </div>
                <div style={{ height: 1, background: "var(--line)" }} />
                <div style={{ fontSize: 13, color: "var(--bone)", lineHeight: 1.5 }}>
                  morning chaos, golden hour, same routine. spring is just <em className="honey">showing off.</em>
                </div>
              </div>
            </PipelineCard>
          </div>
        </div>
      </section>

      {/* ===== Section 4 — PUBLISHING teaser ===== */}
      <section className="panel-bone" style={{ padding: "100px 0", marginTop: 24, position: "relative" }}>
        <div className="scroll-rise" style={{ maxWidth: 1080, margin: "0 auto", padding: "0 32px" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 60,
              alignItems: "center",
            }}
          >
            <div>
              <span className="pill pill-honey" style={{ marginBottom: 18 }}>
                <span className="pill-dot" /> Coming late 2026
              </span>
              <h2 className="section-h2" style={{ margin: "12px 0 18px", fontSize: "clamp(36px, 4.6vw, 52px)" }}>
                Soon, <em className="honey">the last mile.</em>
              </h2>
              <p className="section-lede" style={{ marginBottom: 24 }}>
                Strategy → production → publish. We're closing the loop. Hit one button and your week ships
                to Instagram, TikTok, YouTube Shorts, and Reels — at the slots Companion suggested.
              </p>
              <a
                href="#"
                className="btn btn-ghost"
                style={{ fontSize: 13 }}
              >
                Get notified at launch
              </a>
            </div>

            <div
              className="card"
              style={{
                padding: 24,
                position: "relative",
                overflow: "hidden",
              }}
            >
              <div
                aria-hidden
                style={{
                  position: "absolute",
                  inset: 0,
                  backdropFilter: "blur(6px)",
                  background: "rgba(10,14,18,0.45)",
                  zIndex: 2,
                  pointerEvents: "none",
                }}
              />
              <div style={{ position: "absolute", top: 20, right: 24, zIndex: 3 }}>
                <span className="pill pill-honey" style={{ fontSize: 10 }}>
                  <Send size={10} /> Preview
                </span>
              </div>

              <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", gap: 12 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    paddingBottom: 12,
                    borderBottom: "1px solid var(--line)",
                  }}
                >
                  <span className="eyebrow">Publish queue · Wed</span>
                  <span className="pill pill-aqua">5 of 5 ready</span>
                </div>
                {["IG · Spring lookbook reel", "TikTok · Soft launch chaos", "Shorts · Skincare routine v3", "Reels · Behind the shoot", "IG Story · Friday recap"].map((row, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 13 }}>
                    <span className="serif" style={{ color: "var(--bone-2)" }}>{row}</span>
                    <span className="pill pill-aqua" style={{ fontSize: 10 }}>
                      <span className="pill-dot" /> queued
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== Section 5 — TESTIMONIAL ===== */}
      <section className="bg-ink" style={{ padding: "120px 0", marginTop: 24, textAlign: "center" }}>
        <div className="scroll-rise" style={{ maxWidth: 920, margin: "0 auto", padding: "0 32px" }}>
          <div
            className="serif"
            style={{
              fontSize: "clamp(28px, 4.2vw, 48px)",
              lineHeight: 1.2,
              letterSpacing: "-0.015em",
              fontWeight: 500,
              marginBottom: 36,
              color: "var(--bone)",
            }}
          >
            <span style={{ color: "var(--aqua)", fontStyle: "italic" }}>"</span>
            I went from <em className="soft">16 spreadsheets and a panic attack every Sunday</em> to one clean Monday morning.
            My editor finally knows what's next, and my strategy isn't a vibe anymore — it's a screen.
            <span style={{ color: "var(--aqua)", fontStyle: "italic" }}>"</span>
          </div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 14 }}>
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: "50%",
                background: "var(--honey)",
                color: "var(--ink)",
                display: "grid",
                placeItems: "center",
                fontFamily: "'EB Garamond', serif",
                fontStyle: "italic",
                fontWeight: 500,
                fontSize: 22,
              }}
            >
              A
            </div>
            <div style={{ textAlign: "left" }}>
              <div style={{ fontWeight: 600, fontSize: 15, color: "var(--bone)" }}>Aria Wells</div>
              <div style={{ fontSize: 12.5, color: "var(--bone-3)" }}>Creator · 2.4M followers · runs her own brand</div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== Section 6 — PRICING ===== */}
      <section id="pricing" className="panel-bone" style={{ padding: "120px 0", marginTop: 24 }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 32px" }}>
          <div className="scroll-rise" style={{ textAlign: "center", marginBottom: 56 }}>
            <span className="eyebrow">Pricing</span>
            <h2 className="section-h2" style={{ margin: "16px auto 18px", maxWidth: 640 }}>
              Pick a plan, <em className="soft">change it any time.</em>
            </h2>
            <p className="section-lede" style={{ margin: "0 auto" }}>
              Start free for 14 days. Upgrade when your editor begs you to.
            </p>
          </div>

          <div
            className="scroll-rise"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 18,
              alignItems: "stretch",
            }}
          >
            {[
              {
                name: "Solo",
                blurb: "For creators flying solo.",
                price: "$19",
                period: "/mo",
                features: [
                  "Super Canvas · 1 brand",
                  "Viral Today · 1 niche",
                  "Companion AI · 50 drafts/mo",
                  "Calendar + Queue",
                ],
                cta: "Start free",
                featured: false,
              },
              {
                name: "Studio",
                blurb: "For creators with a team.",
                price: "$49",
                period: "/mo",
                features: [
                  "Everything in Solo",
                  "Unlimited brands + editors",
                  "Companion AI · unlimited",
                  "Contracts + invoicing",
                  "Priority support",
                ],
                cta: "Start 14-day trial",
                featured: true,
              },
              {
                name: "Agency",
                blurb: "For agencies running 10+ creators.",
                price: "$199",
                period: "/mo",
                features: [
                  "Everything in Studio",
                  "Master queue across clients",
                  "White-label client portal",
                  "Dedicated success manager",
                ],
                cta: "Book a demo",
                featured: false,
              },
            ].map((plan, i) => (
              <div
                key={i}
                className={`card ${plan.featured ? "" : "card-lift"}`}
                style={{
                  padding: "32px 28px",
                  position: "relative",
                  background: plan.featured ? "var(--bone)" : undefined,
                  color: plan.featured ? "var(--ink)" : undefined,
                  borderColor: plan.featured ? "var(--bone)" : undefined,
                  transform: plan.featured ? "scale(1.02)" : undefined,
                  display: "flex",
                  flexDirection: "column",
                  gap: 20,
                }}
              >
                {plan.featured && (
                  <span
                    className="scribble-circle"
                    style={{
                      position: "absolute",
                      top: 18,
                      right: 18,
                      color: "#A85B1F",
                      fontFamily: "'EB Garamond', serif",
                      fontStyle: "italic",
                      fontSize: 16,
                      fontWeight: 500,
                      letterSpacing: "0.01em",
                      transform: "rotate(4deg)",
                    }}
                  >
                    most loved
                  </span>
                )}
                <div>
                  <h3 className="serif" style={{ fontSize: 24, margin: 0, fontWeight: 500, color: plan.featured ? "var(--ink)" : "var(--bone)" }}>
                    {plan.name}
                  </h3>
                  <div style={{ fontSize: 13, color: plan.featured ? "rgba(10,14,18,0.65)" : "var(--bone-3)", marginTop: 4 }}>
                    {plan.blurb}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                  <span className="serif" style={{ fontSize: 60, fontWeight: 500, letterSpacing: "-0.02em", color: plan.featured ? "var(--ink)" : "var(--bone)", lineHeight: 1 }}>
                    {plan.price}
                  </span>
                  <span style={{ fontSize: 16, color: plan.featured ? "rgba(10,14,18,0.55)" : "var(--bone-3)", fontStyle: "italic" }}>
                    {plan.period}
                  </span>
                </div>
                <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
                  {plan.features.map((f, j) => (
                    <li
                      key={j}
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 10,
                        fontSize: 14,
                        color: plan.featured ? "rgba(10,14,18,0.75)" : "var(--bone-2)",
                      }}
                    >
                      <span
                        style={{
                          marginTop: 6,
                          width: 5,
                          height: 5,
                          borderRadius: "50%",
                          background: plan.featured ? "var(--ink)" : "var(--aqua)",
                          flexShrink: 0,
                        }}
                      />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  to="/scripts"
                  className={`btn ${plan.featured ? "btn-honey" : "btn-ghost"}`}
                  style={{ justifyContent: "center", width: "100%" }}
                >
                  {plan.cta} {!plan.featured && <ArrowRight size={14} />}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== FINAL CTA ===== */}
      <section className="bg-ink" style={{ padding: "140px 0", marginTop: 24, textAlign: "center", position: "relative" }}>
        <div
          className="curl curl-hide-mobile scroll-rise"
          style={{ bottom: 60, left: "12%", transform: "rotate(-4deg)" }}
        >
          a calmer creator economy starts here
        </div>
        <div
          className="curl curl-hide-mobile scroll-rise"
          style={{ top: 80, right: "8%", transform: "rotate(6deg)" }}
        >
          — your strategy team in a screen
        </div>

        <div className="scroll-rise" style={{ maxWidth: 880, margin: "0 auto", padding: "0 32px", position: "relative" }}>
          <h2
            className="serif"
            style={{
              fontSize: "clamp(48px, 8vw, 96px)",
              lineHeight: 1.0,
              letterSpacing: "-0.025em",
              fontWeight: 500,
              margin: "0 0 24px",
            }}
          >
            Stop guessing.
            <br />
            <span
              className="scribble-under aqua"
              style={{ display: "inline-block", color: "var(--aqua)", fontStyle: "italic", fontWeight: 500 }}
            >
              Start directing.
            </span>
          </h2>
          <p style={{ fontSize: 18, color: "var(--bone-2)", maxWidth: 560, margin: "0 auto 36px", lineHeight: 1.55 }}>
            14 days free. No credit card. Bring your existing chaos — Connecta will fold it
            neatly into a 30-day plan within five minutes.
          </p>
          <Link to="/scripts" className="btn btn-aqua btn-large">
            Get started <ArrowRight size={16} />
          </Link>
          <div style={{ marginTop: 18, fontSize: 12.5, color: "var(--bone-3)" }}>
            Free trial · cancel anytime · made in LA
          </div>
        </div>
      </section>

      {/* ===== FOOTER ===== */}
      <footer className="bg-ink" style={{ padding: "60px 0 40px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 32px" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "2fr 1fr 1fr 1fr",
              gap: 40,
              marginBottom: 48,
            }}
          >
            <div>
              <Link to="/" style={{ display: "inline-flex", alignItems: "baseline", marginBottom: 14 }}>
                <span className="serif" style={{ fontSize: 24, color: "var(--bone)" }}>Connect</span>
                <span className="serif-italic" style={{ fontSize: 24, color: "var(--honey)" }}>a</span>
              </Link>
              <p style={{ fontSize: 13.5, color: "var(--bone-3)", maxWidth: 280, margin: 0, lineHeight: 1.6 }}>
                The AI strategist for creators and the brands they work with.
              </p>
            </div>
            {[
              { title: "Product", items: ["Super Canvas", "Viral Today", "Editing Queue", "Calendar", "Companion AI", "Publishing (soon)"] },
              { title: "Resources", items: ["Guides", "Templates", "Changelog", "API"] },
              { title: "Company", items: ["About", "Careers", "Press", "Contact"] },
            ].map((col, i) => (
              <div key={i}>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: "0.16em",
                    textTransform: "uppercase",
                    color: "var(--bone-3)",
                    marginBottom: 14,
                  }}
                >
                  {col.title}
                </div>
                <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                  {col.items.map((item, j) => (
                    <li key={j} style={{ padding: "4px 0", fontSize: 14, color: "var(--bone-2)" }}>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div
            style={{
              borderTop: "1px solid var(--line)",
              paddingTop: 22,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontSize: 12.5,
              color: "var(--bone-3)",
              flexWrap: "wrap",
              gap: 10,
            }}
          >
            <div>© 2026 Connecta. Made in Los Angeles.</div>
            <div style={{ display: "flex", gap: 18 }}>
              <a href="#" className="scribble-link">Privacy</a>
              <a href="#" className="scribble-link">Terms</a>
              <a href="#" className="scribble-link">Status</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
