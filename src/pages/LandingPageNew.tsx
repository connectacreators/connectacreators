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
   Super Canvas mockup — the screenshot moment.
   Node-based strategy visualization. One node "live" pulsing.
   ───────────────────────────────────────────────────────────── */
function SuperCanvasMock() {
  return (
    <div
      className="relative w-full overflow-hidden"
      style={{
        height: 460,
        background:
          "linear-gradient(135deg, #1A1F26 0%, #0F1318 100%)",
        border: "1px solid rgba(234, 230, 220, 0.10)",
        borderRadius: 22,
        boxShadow:
          "0 60px 120px -30px rgba(0,0,0,0.6), 0 0 80px -20px rgba(143,208,213,0.10)",
      }}
    >
      {/* Window chrome */}
      <div
        className="flex items-center justify-between"
        style={{
          padding: "14px 20px",
          borderBottom: "1px solid rgba(234, 230, 220, 0.07)",
          background: "rgba(10, 14, 18, 0.40)",
        }}
      >
        <div className="flex items-center gap-2">
          <span style={{ width: 11, height: 11, borderRadius: "50%", background: "rgba(232,138,138,0.65)" }} />
          <span style={{ width: 11, height: 11, borderRadius: "50%", background: "rgba(224,200,120,0.65)" }} />
          <span style={{ width: 11, height: 11, borderRadius: "50%", background: "rgba(143,197,163,0.65)" }} />
          <span
            style={{
              marginLeft: 14,
              fontFamily: "'EB Garamond', serif",
              fontStyle: "italic",
              fontSize: 14,
              color: "rgba(234,230,220,0.55)",
            }}
          >
            Super Canvas — Luna Reyes / Spring 2026 strategy
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="pill pill-aqua">
            <span className="pill-dot" /> Companion AI · live
          </span>
        </div>
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

        {/* Central Brand node */}
        <div
          className="sc-node active"
          style={{
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            minWidth: 180,
          }}
        >
          <span className="sc-node-sub" style={{ color: "var(--aqua)" }}>Brand</span>
          <span className="sc-node-title serif" style={{ fontSize: 18, lineHeight: 1.1 }}>
            Luna Reyes
          </span>
          <span style={{ fontSize: 11, color: "var(--bone-3)", marginTop: 2 }}>
            2.4M · fashion + lifestyle
          </span>
          <span className="sc-node-pill">● Strategist on</span>
        </div>

        {/* Satellite nodes */}
        <div className="sc-node" style={{ top: "12%", left: "4%" }}>
          <span className="sc-node-sub">Audience</span>
          <span className="sc-node-title">22–34 · F · LA/NYC</span>
          <span style={{ fontSize: 10.5, color: "var(--bone-3)" }}>Peak: Tue/Thu 8pm</span>
        </div>

        <div className="sc-node" style={{ top: "46%", left: "4%" }}>
          <span className="sc-node-sub">Voice</span>
          <span className="sc-node-title">Confident · dry-funny</span>
          <span style={{ fontSize: 10.5, color: "var(--bone-3)" }}>Trained on last 50 posts</span>
        </div>

        <div className="sc-node" style={{ top: "80%", left: "4%" }}>
          <span className="sc-node-sub">Top hook</span>
          <span className="sc-node-title">"3 things I wish I knew…"</span>
          <span className="sc-node-pill">9.2/10 score</span>
        </div>

        <div className="sc-node" style={{ top: "12%", right: "4%" }}>
          <span className="sc-node-sub" style={{ color: "var(--honey)" }}>Hot trend</span>
          <span className="sc-node-title">"Soft launch the chaos"</span>
          <span className="sc-node-pill honey">▲ 340% w/w</span>
        </div>

        <div className="sc-node" style={{ top: "46%", right: "4%" }}>
          <span className="sc-node-sub">This week</span>
          <span className="sc-node-title">5 posts drafted</span>
          <span style={{ fontSize: 10.5, color: "var(--bone-3)" }}>Mon 9am · Wed 7pm · …</span>
        </div>

        <div className="sc-node" style={{ top: "80%", right: "4%" }}>
          <span className="sc-node-sub">Next move</span>
          <span className="sc-node-title">Skincare partner draft</span>
          <span className="sc-node-pill">Auto-saved 2m</span>
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
      className="card"
      style={{
        padding: 22,
        background:
          "linear-gradient(180deg, var(--graphite) 0%, #15191F 100%)",
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
          background: "linear-gradient(90deg, rgba(224,165,96,0.10) 0%, rgba(143,208,213,0.10) 100%)",
          borderBottom: "1px solid var(--line)",
          padding: "10px 24px",
          textAlign: "center",
          fontSize: 13,
          color: "var(--bone-2)",
          fontFamily: "'Figtree', sans-serif",
        }}
      >
        <span style={{ marginRight: 6 }}>
          <Flame size={11} style={{ display: "inline-block", color: "var(--honey)", marginRight: 6, marginBottom: -1 }} />
          <strong style={{ color: "var(--bone)", fontWeight: 600 }}>Viral Today is live.</strong>
        </span>
        Spot trends before your feed catches on.{" "}
        <Link to="/scripts" className="scribble-link" style={{ color: "var(--aqua)", fontWeight: 500, marginLeft: 4 }}>
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
      <section style={{ position: "relative", paddingTop: 80, paddingBottom: 60, overflow: "hidden" }}>
        <div className="ribbon-glow" />
        <div className="grain" />

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
            <span className="eyebrow">Studio + Strategy</span>
          </div>

          <h1
            className="serif"
            data-reveal="2"
            style={{
              fontSize: "clamp(48px, 9vw, 124px)",
              lineHeight: 1.0,
              letterSpacing: "-0.025em",
              fontWeight: 500,
              margin: 0,
              marginBottom: 24,
            }}
          >
            <span
              className="serif-italic"
              style={{ display: "block", color: "var(--bone-2)", fontWeight: 400 }}
            >
              Your AI strategist
            </span>
            <span style={{ display: "block" }}>
              for viral <em className="honey">growth.</em>
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
            Connecta plans your next 30 days of content before you open the app. Strategy,
            scripts, schedule — generated, refined, ready to ship.
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

      {/* ===== Logo strip ===== */}
      <section style={{ padding: "60px 0", borderTop: "1px solid var(--line)", borderBottom: "1px solid var(--line)" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 32px" }}>
          <div
            className="scroll-rise"
            style={{
              textAlign: "center",
              fontSize: 11,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: "var(--bone-3)",
              fontWeight: 600,
              marginBottom: 28,
            }}
          >
            Trusted by creators and the brands they work with
          </div>
          <div className="marquee-mask scroll-rise" style={{ overflow: "hidden" }}>
            <div className="marquee">
              {[
                { name: "Aerie", italic: true },
                { name: "PATAGONIA", italic: false },
                { name: "Glossier", italic: true },
                { name: "RHODE", italic: false },
                { name: "Sezane", italic: true },
                { name: "DJERF AVENUE", italic: false },
              ].concat([
                { name: "Aerie", italic: true },
                { name: "PATAGONIA", italic: false },
                { name: "Glossier", italic: true },
                { name: "RHODE", italic: false },
                { name: "Sezane", italic: true },
                { name: "DJERF AVENUE", italic: false },
              ]).map((logo, i) => (
                <div
                  key={i}
                  style={{
                    fontFamily: logo.italic ? "'EB Garamond', serif" : "'Figtree', sans-serif",
                    fontStyle: logo.italic ? "italic" : "normal",
                    fontWeight: logo.italic ? 500 : 700,
                    fontSize: logo.italic ? 26 : 16,
                    letterSpacing: logo.italic ? "-0.01em" : "0.06em",
                    color: "var(--bone-2)",
                    opacity: 0.6,
                    whiteSpace: "nowrap",
                  }}
                >
                  {logo.name}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ===== Section 1 — THE BRAIN (Super Canvas) ===== */}
      <section id="brain" style={{ padding: "140px 0", position: "relative", overflow: "hidden" }}>
        <div
          aria-hidden
          className="glow-aqua"
          style={{ position: "absolute", top: "-10%", left: "-10%", width: 480, height: 480, opacity: 0.4 }}
        />
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
                It plans before <em className="aqua">you post.</em>
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
                  background: "linear-gradient(135deg, var(--graphite) 0%, #15191F 100%)",
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

      {/* ===== Section 2 — VIRAL TODAY ===== */}
      <section id="viral" style={{ padding: "120px 0", borderTop: "1px solid var(--line)", position: "relative", overflow: "hidden" }}>
        <div
          aria-hidden
          className="glow-honey"
          style={{ position: "absolute", top: "30%", right: "-15%", width: 600, height: 400, opacity: 0.35 }}
        />
        <div
          className="curl curl-hide-mobile scroll-rise"
          style={{ top: 80, left: "8%", transform: "rotate(-5deg)" }}
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
              <h2 className="section-h2" style={{ margin: "16px 0 22px" }}>
                What's working <em className="soft">right now,</em>
                <br />
                <em className="honey">sorted for you.</em>
              </h2>
              <p className="section-lede" style={{ marginBottom: 28 }}>
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
                    className="card"
                    style={{ padding: "20px 18px", display: "flex", flexDirection: "column", gap: 6 }}
                  >
                    <span style={{ fontFamily: "'Figtree', monospace", fontSize: 11, color: "var(--honey)", letterSpacing: "0.1em", fontWeight: 700 }}>
                      {s.num}
                    </span>
                    <div className="serif" style={{ fontSize: 17, color: "var(--bone)", letterSpacing: "-0.005em" }}>
                      {s.title}
                    </div>
                    <div style={{ fontSize: 12.5, color: "var(--bone-3)", lineHeight: 1.5 }}>
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
      <section id="pipeline" style={{ padding: "120px 0", borderTop: "1px solid var(--line)", position: "relative" }}>
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
      <section style={{ padding: "100px 0", borderTop: "1px solid var(--line)", position: "relative", overflow: "hidden" }}>
        <div
          aria-hidden
          className="glow-honey"
          style={{ position: "absolute", top: "20%", left: "-10%", width: 500, height: 300, opacity: 0.25 }}
        />
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
      <section style={{ padding: "120px 0", borderTop: "1px solid var(--line)", textAlign: "center" }}>
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
      <section id="pricing" style={{ padding: "120px 0", borderTop: "1px solid var(--line)", background: "rgba(234,230,220,0.015)" }}>
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
                    style={{
                      position: "absolute",
                      top: 22,
                      right: 22,
                      background: "var(--honey)",
                      color: "var(--ink)",
                      padding: "4px 10px",
                      borderRadius: 999,
                      fontSize: 10.5,
                      fontWeight: 700,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                    }}
                  >
                    Most loved
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
      <section style={{ padding: "140px 0", borderTop: "1px solid var(--line)", textAlign: "center", position: "relative", overflow: "hidden" }}>
        <div
          aria-hidden
          className="glow-aqua"
          style={{ position: "absolute", top: "20%", left: "50%", transform: "translateX(-50%)", width: 700, height: 400, opacity: 0.5 }}
        />
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
            <em className="aqua">Start directing.</em>
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
      <footer style={{ padding: "60px 0 40px", borderTop: "1px solid var(--line)" }}>
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
