import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Sparkles,
  Calendar,
  Film,
  Flame,
  Menu,
  X,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
} from "lucide-react";
import "../landing.css";
import logoHandBone from "@/assets/connecta-logo-hand-bone.png";
import logoHandInk from "@/assets/connecta-logo-hand-ink.png";
import miroodlesLaptopEye from "@/assets/miroodles-laptop-eye.png";
import brainDoodle from "@/assets/brain-doodle.png";
import drCalvinPortrait from "@/assets/dr-calvin-portrait.jpg";
import drCalvinFollowers from "@/assets/dr-calvin-followers.png";
import spencerImpressions from "@/assets/spencer-impressions.png";
import spencerProfile from "@/assets/spencer-profile.png";
import djR3Stats from "@/assets/dj-r3-stats.png";
import pecanHealthyPortrait from "@/assets/pecan-healthy-portrait.jpg";
import pecanMsgFollowers from "@/assets/pecan-msg-followers.png";
import pecanMsgViews from "@/assets/pecan-msg-views.png";
import drCalvin78k from "@/assets/dr-calvin-78k.png";
import drCalvinTiktok from "@/assets/dr-calvin-tiktok.png";
import zigufitBefore from "@/assets/zigufit-before.png";
import zigufitAfterNew from "@/assets/zigufit-after-new.png";
import ScrollFloat from "@/components/landing/ScrollFloat";
import ViralWall from "@/components/landing/ViralWall";
import { useIsMobile } from "@/hooks/use-mobile";

/* =============================================================================
   The tech-modern system — Ink + Aqua + Honey + Inter Tight + Inter
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
  const isMobile = useIsMobile();
  if (isMobile) {
    return <>{text}</>;
  }
  return (
    <>
      {Array.from(text).map((ch, i) => (
        <span
          key={i}
          className="letter-rise prox-letter"
          style={{ animationDelay: `${delay + i * step}s` }}
        >
          {ch === " " ? " " : ch}
        </span>
      ))}
    </>
  );
}

/* ─────────────────────────────────────────────────────────────
   ProxText — splits text into word spans tagged for proximity weight.
   The global mouse tracker in LandingPageNew sets --prox-wght on each
   word based on cursor distance, fattening only what's directly under
   the cursor. Width is locked on mount so no layout shift.
   ───────────────────────────────────────────────────────────── */
function ProxText({ children }: { children: string }) {
  const parts = children.split(" ");
  const out: React.ReactNode[] = [];
  parts.forEach((word, i) => {
    out.push(
      <span key={`w-${i}`} className="prox-word">
        {word}
      </span>
    );
    if (i < parts.length - 1) out.push(" ");
  });
  return <>{out}</>;
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
   InteractiveSticker — drifts toward the cursor when within range.
   Uses transform translate, scale, plus a base rotation. Pure motion,
   no opacity changes. Cursor must be within `radius` to activate.
   ───────────────────────────────────────────────────────────── */
function InteractiveSticker({
  src,
  alt = "",
  baseRotation = 0,
  maxOffset = 18,
  radius = 260,
  className,
  style,
}: {
  src: string;
  alt?: string;
  baseRotation?: number;
  maxOffset?: number;
  radius?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const isMobile = useIsMobile();
  const ref = useRef<HTMLImageElement>(null);
  const rafRef = useRef<number | null>(null);
  const targetRef = useRef({ x: 0, y: 0, scale: 1, tilt: 0 });
  const currentRef = useRef({ x: 0, y: 0, scale: 1, tilt: 0 });

  useEffect(() => {
    if (isMobile) return;
    const EPSILON = 0.05;

    const animate = () => {
      const c = currentRef.current;
      const t = targetRef.current;
      // Lerp toward target for a lazy "follow" feel
      c.x += (t.x - c.x) * 0.12;
      c.y += (t.y - c.y) * 0.12;
      c.scale += (t.scale - c.scale) * 0.12;
      c.tilt += (t.tilt - c.tilt) * 0.12;
      if (ref.current) {
        ref.current.style.transform =
          `translate(${c.x.toFixed(2)}px, ${c.y.toFixed(2)}px) ` +
          `rotate(${(baseRotation + c.tilt).toFixed(2)}deg) ` +
          `scale(${c.scale.toFixed(3)})`;
      }

      // Stop the RAF loop once we've converged on the target. Saves ~60
      // animation frames per second per idle sticker — with 5 stickers
      // that's a real perf win during scroll.
      const settled =
        Math.abs(c.x - t.x) < EPSILON &&
        Math.abs(c.y - t.y) < EPSILON &&
        Math.abs(c.scale - t.scale) < EPSILON / 100 &&
        Math.abs(c.tilt - t.tilt) < EPSILON;
      if (settled) {
        rafRef.current = null;
        return;
      }
      rafRef.current = requestAnimationFrame(animate);
    };

    const kick = () => {
      if (rafRef.current === null) {
        rafRef.current = requestAnimationFrame(animate);
      }
    };

    // Cache the sticker's center instead of calling getBoundingClientRect on
    // every mousemove — the prox effect dirties layout each frame, so a sync
    // read here forced a full-document reflow per pointer frame.
    let center: { x: number; y: number } | null = null;
    const invalidateCenter = () => {
      center = null;
    };
    window.addEventListener("scroll", invalidateCenter, { passive: true });
    window.addEventListener("resize", invalidateCenter);

    const onMove = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!center) {
        const rect = ref.current.getBoundingClientRect();
        center = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      }
      const cx = center.x;
      const cy = center.y;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const dist = Math.hypot(dx, dy);
      if (dist < radius && dist > 0) {
        const strength = (radius - dist) / radius; // 0..1
        const unit = { x: dx / dist, y: dy / dist };
        targetRef.current.x = unit.x * maxOffset * strength;
        targetRef.current.y = unit.y * maxOffset * strength;
        targetRef.current.scale = 1 + strength * 0.05;
        targetRef.current.tilt = unit.x * 4 * strength; // small lean toward cursor
      } else {
        targetRef.current.x = 0;
        targetRef.current.y = 0;
        targetRef.current.scale = 1;
        targetRef.current.tilt = 0;
      }
      kick();
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    const onLeave = () => {
      targetRef.current = { x: 0, y: 0, scale: 1, tilt: 0 };
      kick();
    };
    document.addEventListener("mouseleave", onLeave);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("scroll", invalidateCenter);
      window.removeEventListener("resize", invalidateCenter);
      document.removeEventListener("mouseleave", onLeave);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [baseRotation, maxOffset, radius, isMobile]);

  if (isMobile) return null;

  return (
    <img
      ref={ref}
      src={src}
      alt={alt}
      aria-hidden={!alt}
      className={className}
      style={{
        ...style,
        willChange: "transform",
        transform: `rotate(${baseRotation}deg)`, // initial transform before RAF runs
      }}
    />
  );
}


/* =============================================================================
   The page
   ============================================================================= */

export default function LandingPageNew() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const scrollRoot = useRef<HTMLDivElement | null>(null);
  const isMobile = useIsMobile();

  // Global proximity-weight tracker. Locks word/letter widths after fonts
  // load, then updates --prox-wght for spans near the cursor — but ONLY
  // for spans currently in the viewport (tracked via IntersectionObserver)
  // and only when the mouse has moved. This avoids forced reflow from
  // calling getBoundingClientRect on hundreds of spans every frame.
  // Skipped entirely on touch devices (no cursor + saves CPU).
  useEffect(() => {
    if (isMobile) return;
    const root = scrollRoot.current;
    if (!root) return;

    type ProxRect = { el: HTMLElement; cx: number; cy: number };
    const visibleRects = new Map<HTMLElement, ProxRect>();
    let rectsDirty = false;

    const measureRect = (el: HTMLElement): ProxRect => {
      const r = el.getBoundingClientRect();
      return { el, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
    };

    const lockWidths = (force = false) => {
      const targets = root.querySelectorAll<HTMLElement>(".prox-word, .prox-letter");
      const toLock: HTMLElement[] = [];
      targets.forEach((el) => {
        if (!force && el.dataset.proxLocked) return;
        toLock.push(el);
      });
      // Batched passes (all writes, all reads, all writes) — interleaving a
      // read after each write forces one reflow per span.
      // getComputedStyle().width (not getBoundingClientRect) because the
      // entrance animations scale the letters: the bounding rect includes the
      // transform, so locking from it froze mid-animation shrunken widths and
      // the title visibly re-sized when the lock was corrected.
      if (force) toLock.forEach((el) => { el.style.width = ""; });
      const widths = toLock.map((el) => parseFloat(getComputedStyle(el).width) || 0);
      toLock.forEach((el, i) => {
        if (widths[i] === 0) return;
        // Body words (.prox-word) get a 1.5px buffer so heavier glyphs don't
        // push the last word to a new line on hover. Title characters
        // (.prox-letter) get NO buffer — that 1.5px × ~30 letters per H2
        // added up to noticeable letter-spacing. Without the buffer, bolder
        // glyphs overflow their slot by ~1px (compositor-only, no layout).
        const buffer = el.classList.contains("prox-letter") ? 0 : 1.5;
        el.style.width = `${widths[i] + buffer}px`;
        el.dataset.proxLocked = "true";
      });
      rectsDirty = true;
    };
    if ((document as Document & { fonts?: FontFaceSet }).fonts) {
      // Force a re-lock once fonts are actually loaded: the early opportunistic
      // locks below measure fallback-font widths, and a span locked at the
      // wrong width stays wrong forever (glyphs squeeze/overflow on swap).
      (document as Document & { fonts: FontFaceSet }).fonts.ready.then(() => lockWidths(true));
      setTimeout(() => lockWidths(), 50);
      setTimeout(() => lockWidths(), 500);
    } else {
      setTimeout(() => lockWidths(), 100);
    }

    // Track which spans are currently in the viewport. Only those get
    // distance-checked on mousemove.
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const el = entry.target as HTMLElement;
          if (entry.isIntersecting) {
            visibleRects.set(el, measureRect(el));
          } else {
            visibleRects.delete(el);
            if (el.style.getPropertyValue("--prox-wght")) {
              el.style.removeProperty("--prox-wght");
            }
          }
        }
      },
      { rootMargin: "100px" }
    );

    // Initial observe pass + a deferred sweep for spans that mount after
    // the initial paint (ScrollFloat's GSAP creates spans too).
    const observeAll = () => {
      root.querySelectorAll<HTMLElement>(".prox-word, .prox-letter").forEach((el) => {
        io.observe(el);
      });
    };
    observeAll();
    setTimeout(observeAll, 500);
    setTimeout(observeAll, 1500);

    // Mark rects as dirty when scroll happens — we'll re-measure on next
    // mousemove (cheap path) instead of iterating every scroll frame.
    const onScroll = () => {
      rectsDirty = true;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });

    const RADIUS = 70;
    const DELTA = 200; // base 600 → 800 (Inter Tight's max weight) at cursor
    const MAX_OFFSET = 1.8; // peak translate in px — small enough that
                             // composition stays put, big enough to feel
    let raf: number | null = null;
    let posX = -9999;
    let posY = -9999;

    const onMove = (e: MouseEvent) => {
      posX = e.clientX;
      posY = e.clientY;
      if (raf !== null) return;
      raf = requestAnimationFrame(() => {
        raf = null;
        // If scroll happened since last frame, refresh cached centers.
        if (rectsDirty) {
          visibleRects.forEach((_, el) => {
            visibleRects.set(el, measureRect(el));
          });
          rectsDirty = false;
        }
        visibleRects.forEach(({ el, cx, cy }) => {
          const dx = posX - cx;
          const dy = posY - cy;
          const dist = Math.hypot(dx, dy);
          if (dist < RADIUS) {
            const t = 1 - dist / RADIUS;
            const w = Math.round(600 + DELTA * t);
            const safeDist = Math.max(dist, 0.01);
            const ox = (dx / safeDist) * MAX_OFFSET * t;
            const oy = (dy / safeDist) * MAX_OFFSET * t;
            el.style.setProperty("--prox-wght", String(w));
            el.style.setProperty("--prox-x", `${ox.toFixed(2)}px`);
            el.style.setProperty("--prox-y", `${oy.toFixed(2)}px`);
          } else if (el.style.getPropertyValue("--prox-wght")) {
            el.style.removeProperty("--prox-wght");
            el.style.removeProperty("--prox-x");
            el.style.removeProperty("--prox-y");
          }
        });
      });
    };

    window.addEventListener("mousemove", onMove, { passive: true });
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      io.disconnect();
      if (raf !== null) cancelAnimationFrame(raf);
    };
  }, [isMobile]);

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
      {/* ===== Glass banner strip on top of the page ===== */}
      <div
        style={{
          background:
            "linear-gradient(90deg, rgba(143,208,213,0.10), rgba(234,230,220,0.05) 45%, rgba(224,165,96,0.10))",
          color: "var(--bone)",
          padding: "10px 24px",
          textAlign: "center",
          fontSize: 13,
          fontFamily: "'Inter', 'Inter Fallback', sans-serif",
          fontWeight: 500,
          margin: "12px 18px 0",
          borderRadius: 999,
        }}
      >
        <span style={{ marginRight: 6 }}>
          <Flame size={11} style={{ display: "inline-block", color: "var(--honey)", marginRight: 6, marginBottom: -1 }} />
          <strong style={{ fontWeight: 700 }}>1 million views, guaranteed in 90 days.</strong>
        </span>
        We build the brands people can&apos;t stop watching.{" "}
        <Link to="/1million" style={{ color: "var(--bone)", fontWeight: 700, marginLeft: 4, textDecoration: "underline" }}>
          See how →
        </Link>
      </div>

      {/* ===== Floating nav — frosted-glass bone pill, centered, compact width ===== */}
      <nav
        style={{
          position: "sticky",
          top: 12,
          zIndex: 50,
          maxWidth: 760,
          width: "calc(100% - 36px)",
          margin: "12px auto 0",
          background: "rgba(234,230,220,0.88)",
          backdropFilter: "blur(16px) saturate(1.4)",
          WebkitBackdropFilter: "blur(16px) saturate(1.4)",
          color: "var(--ink)",
          borderRadius: 999,
          boxShadow:
            "0 16px 48px -16px rgba(0,0,0,0.55), 0 0 36px -10px rgba(143,208,213,0.20)",
        }}
      >
        <div
          style={{
            padding: "12px 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
          }}
        >
          <Link
            to="/"
            style={{ display: "inline-flex", alignItems: "center", gap: 10, color: "var(--ink)" }}
            aria-label="Connecta"
          >
            <img
              src={logoHandInk}
              alt=""
              style={{ height: 30, width: "auto", display: "block" }}
            />
            <span
              className="serif"
              style={{
                fontSize: 20,
                color: "var(--ink)",
                letterSpacing: "0.04em",
                fontWeight: 700,
                textTransform: "uppercase",
              }}
            >
              CONNECTA
            </span>
          </Link>

          <div className="hidden-mobile" style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Link
              to="/login"
              style={{
                fontSize: 14,
                color: "rgba(10,14,18,0.72)",
                fontFamily: "'Inter', 'Inter Fallback', sans-serif",
                fontWeight: 500,
              }}
            >
              Client login
            </Link>
            <Link to="/1million" className="btn btn-aqua" style={{ padding: "9px 18px", fontSize: 13.5 }}>
              Work with us
            </Link>
          </div>

          <button
            className="hidden-desktop"
            onClick={() => setMobileOpen((x) => !x)}
            aria-label="Menu"
            style={{
              background: "transparent",
              border: "none",
              color: "var(--ink)",
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
              padding: "16px 24px 22px",
              background: "rgba(234,230,220,0.96)",
              color: "var(--ink)",
              display: "flex",
              flexDirection: "column",
              gap: 14,
              fontSize: 15,
              borderBottomLeftRadius: 28,
              borderBottomRightRadius: 28,
            }}
          >
            <Link to="/login" onClick={() => setMobileOpen(false)} style={{ alignSelf: "flex-start" }}>
              Client login
            </Link>
            <Link to="/1million" className="btn btn-aqua" style={{ marginTop: 4, alignSelf: "flex-start" }}>
              Work with us
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
        {/* Ambient thumbnail wall behind the hero — the same real viral covers
            from the band below, dimmed to a very low opacity so the headline
            and promise stay legible. Replaces the old marginalia stickers and
            the demo video player. */}
        <div style={{ position: "absolute", inset: 0, zIndex: 0, opacity: 0.14, pointerEvents: "none" }}>
          {/* Fewer rows on mobile — less decode + compositing work on the
              devices that struggle most; the hero is shorter there anyway. */}
          <ViralWall variant="background" rows={isMobile ? 3 : 4} />
        </div>
        <div className="viral-wall-veil" />

        {/* Aurora — soft brand-tinted glow fields drifting behind the headline.
            The section clips overflow, so each orb sits deep enough that its
            radial falloff (62% of radius) reaches transparent before the top
            edge — a clipped orb paints a hard line against the ink above. */}
        <div
          className="glow-orb"
          style={{
            top: 80,
            left: "-10%",
            width: 520,
            height: 520,
            "--orb-color": "rgba(143,208,213,0.28)",
          } as React.CSSProperties}
        />
        <div
          className="glow-orb"
          style={{
            top: 140,
            right: "-12%",
            width: 600,
            height: 600,
            "--orb-color": "rgba(224,165,96,0.24)",
            animationDelay: "-8s",
          } as React.CSSProperties}
        />

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
          <h1
            className="serif"
            style={{
              fontSize: "clamp(30px, 5.4vw, 64px)",
              lineHeight: 1.14,
              // Each letter is its own .prox-letter inline-block (for the
              // rise animation), which breaks natural kerning; grotesks
              // need only light compensation for a tight display read.
              letterSpacing: "-0.03em",
              fontWeight: 600,
              margin: 0,
              marginBottom: 26,
              // No nowrap: on phones the line wraps (centered) rather than
              // overflowing the viewport.
              paddingBottom: "0.2em",
              paddingTop: "0.1em",
            }}
          >
            <LetterRise text="Stop " delay={0.25} step={0.04} />
            <span
              className="serif-italic scribble-hover"
              style={{
                display: "inline-block",
                color: "var(--honey)",
                fontWeight: 400,
                textShadow: "0 0 32px rgba(224,165,96,0.45)",
              }}
            >
              <LetterRise text="Guessing," delay={0.48} step={0.04} />
              {/* sparkles — appear on hover with spring scale; pure glowing fills */}
              <svg className="spark s1" viewBox="0 0 24 24" aria-hidden>
                <path
                  d="M12 1 L14.2 9.8 L23 12 L14.2 14.2 L12 23 L9.8 14.2 L1 12 L9.8 9.8 Z"
                  fill="var(--honey)"
                />
              </svg>
              <svg className="spark s2" viewBox="0 0 24 24" aria-hidden>
                <path
                  d="M12 3 L13.5 10.5 L21 12 L13.5 13.5 L12 21 L10.5 13.5 L3 12 L10.5 10.5 Z"
                  fill="var(--aqua)"
                />
              </svg>
              <svg className="spark s3" viewBox="0 0 24 24" aria-hidden>
                <circle cx="12" cy="12" r="5" fill="var(--bone)" />
              </svg>
            </span>
            {/* On mobile the headline wraps to two balanced lines ("Stop Guessing," / "Start Growing.")
                instead of letting the long single line clip at the viewport edge. */}
            {isMobile && <br />}
            <LetterRise text=" Start " delay={0.86} step={0.04} />
            <span
              className="serif-italic"
              style={{
                display: "inline-block",
                color: "var(--aqua)",
                fontWeight: 400,
                textShadow: "0 0 32px rgba(143,208,213,0.45)",
              }}
            >
              <LetterRise text="Growing." delay={1.10} step={0.04} />
            </span>
          </h1>

          <div
            data-reveal="2"
            className="serif"
            style={{
              maxWidth: 760,
              margin: "0 auto 36px",
              fontSize: "clamp(22px, 3.2vw, 38px)",
              lineHeight: 1.22,
              letterSpacing: "-0.02em",
              fontWeight: 500,
              color: "var(--bone)",
            }}
          >
            We help professional service experts become the{" "}
            <span className="serif-italic" style={{ color: "var(--honey)", fontWeight: 400 }}>
              biggest name
            </span>{" "}
            in their city.
          </div>

          <div
            data-reveal="3"
            style={{
              fontSize: "clamp(15px, 1.6vw, 19px)",
              color: "var(--bone-2)",
              maxWidth: 580,
              margin: "0 auto 40px",
              lineHeight: 1.55,
              position: "relative",
            }}
          >
            Imagine millions of people watching what you do. What would that mean for your business? We build personal brands for experts and business owners: scripting, filming, editing, and posting, all done for you.
          </div>

          <div
            data-reveal="4"
            style={{
              display: "flex",
              gap: 12,
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            <Link to="/1million" className="btn btn-aqua btn-large">
              Work with us <ArrowRight size={16} />
            </Link>
            <Link to="/login" className="btn btn-ghost btn-large">
              Client login
            </Link>
          </div>
        </div>

        {/* PromptStream (text → soundwave → output banner) removed 2026-06-07.
            Component preserved at src/components/landing/PromptStream.tsx;
            restore steps in docs/superpowers/archived-promptstream-hero.md. */}
      </section>

      {/* Viral-wall band removed 2026-06-19 — the same thumbnails now run as
         the low-opacity hero backdrop, so the full-colour band below was a
         duplicate. ViralWall (background variant) still lives in the hero. */}

      {/* ===== Real track record — bone panel ===== */}
      <section className="panel-bone" style={{ padding: "80px 0 90px", marginTop: 24, position: "relative", overflow: "visible" }}>
        {/* Sticker — peeks from the top-right of the bone panel into the ink page above */}
        <InteractiveSticker
          src={miroodlesLaptopEye}
          baseRotation={-6}
          style={{
            position: "absolute",
            top: -100,
            right: "5%",
            width: 170,
            height: "auto",
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
                num: "250K+",
                kicker: "followers grown",
                body: "Real audiences, built on the back of strategy, not hacks, not bots, not luck.",
                accent: "aqua" as const,
              },
            ].map((s, i) => (
              <div
                key={i}
                data-card
                style={{
                  textAlign: "center",
                  padding: "36px 28px",
                  background: "rgba(255,255,255,0.55)",
                  borderRadius: 24,
                  boxShadow: "0 28px 56px -28px rgba(20,20,20,0.32)",
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
                  <ProxText>{s.num}</ProxText>
                </div>
                <div
                  style={{
                    fontFamily: "'Inter', 'Inter Fallback', sans-serif",
                    fontSize: 12,
                    letterSpacing: "0.18em",
                    textTransform: "uppercase",
                    color: "rgba(10,14,18,0.65)",
                    fontWeight: 600,
                    marginTop: 12,
                  }}
                >
                  <ProxText>{s.kicker}</ProxText>
                </div>
                <div
                  style={{
                    margin: "12px auto 0",
                    fontSize: 14,
                    color: "rgba(10,14,18,0.55)",
                    maxWidth: 380,
                    lineHeight: 1.55,
                  }}
                >
                  <ProxText>{s.body}</ProxText>
                </div>
              </div>
            ))}
          </div>

          <div
            className="scroll-rise"
            style={{
              textAlign: "center",
              marginTop: 32,
              fontFamily: "'Inter Tight', 'Inter Tight Fallback', sans-serif",
              fontStyle: "italic",
              fontSize: 16,
              color: "rgba(10,14,18,0.50)",
              letterSpacing: "0.005em",
            }}
          >
            And we're just getting started.
          </div>
        </div>
      </section>

      {/* ===== Case studies — real client before/afters ===== */}
      <section id="work" style={{ padding: "90px 0 40px", position: "relative" }}>
        <div style={{ maxWidth: 1080, margin: "0 auto", padding: "0 32px" }}>
          <div style={{ textAlign: "center", marginBottom: 44 }}>
            <span className="eyebrow">Proof, not promises</span>
            <h2
              className="serif"
              style={{ fontSize: "clamp(28px, 4vw, 44px)", color: "var(--bone)", margin: "14px 0 0", letterSpacing: "-0.02em", fontWeight: 500 }}
            >
              Brands we&apos;ve built
            </h2>
            <p style={{ fontSize: 16, color: "var(--bone-2)", maxWidth: 540, margin: "14px auto 0", lineHeight: 1.55 }}>
              Real accounts, real numbers: what the Connecta engine did for clients who handed us the keys.
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 22, maxWidth: 1080, margin: "0 auto", alignItems: "start" }}>
            {[
              {
                label: "Case study · Chiropractor",
                name: "Dr. Calvin's Clinic",
                imgs: [drCalvin78k, drCalvinTiktok],
                stats: [
                  { n: "1,200", l: "followers before", c: "var(--bone-2)" },
                  { n: "200K+", l: "followers now", c: "var(--aqua)" },
                ],
              },
              {
                label: "Case study · Fitness",
                name: "Zigufit",
                imgs: [zigufitBefore, zigufitAfterNew],
                stats: [
                  { n: "500", l: "followers before", c: "var(--bone-2)" },
                  { n: "17.6K", l: "followers after", c: "var(--aqua)" },
                ],
              },
              {
                label: "Case study · Nurse Practitioner",
                name: "Pecan Health",
                imgs: [spencerProfile],
                stats: [
                  { n: "11K", l: "followers", c: "var(--aqua)" },
                  { n: "4.26M", l: "impressions", c: "var(--honey)" },
                ],
              },
              {
                label: "Our founder's own channel",
                name: "DJ R3",
                imgs: [djR3Stats],
                stats: [
                  { n: "11.1M", l: "views generated", c: "var(--honey)" },
                  { n: "5.15K", l: "subscribers", c: "var(--aqua)" },
                ],
              },
            ].map((cs) => (
              <div
                key={cs.name}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  textAlign: "center",
                  gap: 20,
                  width: "100%",
                  padding: 24,
                  borderRadius: 22,
                  background:
                    "linear-gradient(160deg, rgba(234,230,220,0.07), rgba(234,230,220,0.025))",
                  boxShadow: "0 28px 64px -32px rgba(0,0,0,0.65)",
                }}
              >
                <div>
                  <span className="eyebrow">{cs.label}</span>
                  <h3 className="serif" style={{ fontSize: 26, color: "var(--bone)", margin: "10px 0 0", fontWeight: 600 }}>
                    {cs.name}
                  </h3>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: cs.imgs.length === 1 ? "1fr" : "1fr 1fr", gap: 12, width: "100%" }}>
                  {cs.imgs.map((src, i) => (
                    <img
                      key={i}
                      src={src}
                      alt={cs.imgs.length === 1 ? cs.name : `${cs.name} ${i === 0 ? "before" : "after"}`}
                      loading="lazy"
                      style={{ width: "100%", borderRadius: 12, boxShadow: "0 12px 32px -14px rgba(0,0,0,0.55)", display: "block" }}
                    />
                  ))}
                </div>
                <div style={{ display: "flex", gap: 40, justifyContent: "center" }}>
                  {cs.stats.map((s) => (
                    <div key={s.l}>
                      <div className="serif" style={{ fontSize: 32, color: s.c, fontWeight: 600, lineHeight: 1 }}>{s.n}</div>
                      <div style={{ fontSize: 12.5, color: "var(--bone-3)", marginTop: 6 }}>{s.l}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <p style={{ textAlign: "center", marginTop: 32, fontSize: 14, color: "var(--bone-3)" }}>
            Where it all started: before Connecta, our founder grew his own account{" "}
            <a
              href="https://www.tiktok.com/@elabogadojonathan"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "var(--aqua)", fontWeight: 600, textDecoration: "none" }}
            >
              @elabogadojonathan
            </a>{" "}
            to <strong style={{ color: "var(--bone-2)" }}>650K+ followers</strong>. The same playbook now runs for our clients.
          </p>
        </div>
      </section>


      {/* ===== Section 5 — TESTIMONIAL ===== */}
      <section className="bg-ink" style={{ padding: "56px 0 120px", textAlign: "center", position: "relative", overflow: "visible" }}>
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
            I had <em className="soft">7K followers for 16 years</em> … now <em className="honey">62K in 6 months.</em>
            <span style={{ color: "var(--aqua)", fontStyle: "italic" }}>"</span>
          </div>
          <div
            className="serif-italic"
            style={{
              fontSize: 19,
              color: "var(--bone-2)",
              marginTop: -16,
              marginBottom: 36,
            }}
          >
            Thank you guys.
          </div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 16, position: "relative", flexWrap: "wrap", justifyContent: "center" }}>
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: "50%",
                overflow: "hidden",
                boxShadow:
                  "0 0 0 4px rgba(224,165,96,0.25), 0 10px 32px -8px rgba(224,165,96,0.55)",
                flexShrink: 0,
              }}
            >
              <img
                src={drCalvinPortrait}
                alt="Dr. Calvin"
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  objectPosition: "center top",
                  display: "block",
                }}
              />
            </div>
            <div style={{ textAlign: "left" }}>
              <div className="serif" style={{ fontSize: 17, color: "var(--bone)" }}>
                <ProxText>Dr Calvin</ProxText>
              </div>
              <div style={{ fontSize: 12.5, color: "var(--bone-3)", marginTop: 2 }}>
                Chiropractor · Gained over <strong style={{ fontWeight: 700, color: "var(--bone)" }}>200k followers</strong> with Connecta
              </div>
            </div>
            <a
              href="https://www.facebook.com/drcalvinsclinics/reels/"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "10px 16px",
                borderRadius: 999,
                background: "var(--bone)",
                color: "var(--ink)",
                boxShadow: "0 10px 30px -10px rgba(224,165,96,0.60)",
                fontFamily: "'Inter', sans-serif",
                fontWeight: 600,
                fontSize: 13,
                letterSpacing: "0.02em",
                textDecoration: "none",
                whiteSpace: "nowrap",
                transition: "transform 0.15s ease, box-shadow 0.15s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-2px)";
                e.currentTarget.style.boxShadow = "0 16px 40px -10px rgba(224,165,96,0.80)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = "0 10px 30px -10px rgba(224,165,96,0.60)";
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M22 12a10 10 0 1 0-11.56 9.88v-6.99h-2.54V12h2.54V9.8c0-2.51 1.49-3.9 3.78-3.9 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56V12h2.77l-.44 2.89h-2.33v6.99A10 10 0 0 0 22 12Z" />
              </svg>
              See his Facebook
            </a>
          </div>

          {/* Follower-count receipts — real proof of the growth */}
          <div
            style={{
              maxWidth: 720,
              margin: "40px auto 0",
              padding: 12,
              borderRadius: 16,
              background: "var(--bone)",
              boxShadow:
                "0 30px 70px -30px rgba(0,0,0,0.60), 0 0 56px -18px rgba(224,165,96,0.35)",
            }}
          >
            <img
              src={drCalvinFollowers}
              alt="Dr. Calvin's follower counts — 206.34K total across Facebook, TikTok, Instagram and YouTube"
              loading="lazy"
              style={{ width: "100%", height: "auto", display: "block", borderRadius: 8 }}
            />
          </div>
        </div>

        {/* ----- Second testimonial — Pecan Healthy (hybrid: pull-quote + the real DM receipts) ----- */}
        <div
          className="scroll-rise"
          style={{ maxWidth: 920, margin: "112px auto 0", padding: "0 32px", position: "relative" }}
        >
          {/* glowing divider so the two testimonials read as separate voices */}
          <div
            style={{
              width: 120,
              height: 2,
              borderRadius: 999,
              background: "linear-gradient(90deg, transparent, var(--honey), transparent)",
              boxShadow: "0 0 18px rgba(224,165,96,0.55)",
              opacity: 0.8,
              margin: "0 auto 56px",
            }}
          />
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
            That one video got me to <em className="honey">10K followers</em> … and the cancer post hit <em className="soft">1.9M views.</em>
            <span style={{ color: "var(--aqua)", fontStyle: "italic" }}>"</span>
          </div>
          <div
            className="serif-italic"
            style={{
              fontSize: 19,
              color: "var(--bone-2)",
              marginTop: -16,
              marginBottom: 40,
            }}
          >
            Bonkers!
          </div>

          {/* The receipts — the actual DM screenshots, stacked as a short thread */}
          <div style={{ maxWidth: 640, margin: "0 auto 44px", display: "flex", flexDirection: "column", gap: 12 }}>
            {[
              { src: pecanMsgFollowers, alt: "Client message: that one video on Facebook got me to 10k followers" },
              { src: pecanMsgViews, alt: "Client message: that cancer post is crazy, 1.9 mil views" },
            ].map((r, i) => (
              <img
                key={i}
                src={r.src}
                alt={r.alt}
                loading="lazy"
                style={{
                  width: "100%",
                  height: "auto",
                  display: "block",
                  borderRadius: 14,
                  boxShadow: "0 16px 40px -12px rgba(0,0,0,0.55)",
                }}
              />
            ))}
          </div>

          <div style={{ display: "inline-flex", alignItems: "center", gap: 16, position: "relative", flexWrap: "wrap", justifyContent: "center" }}>
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: "50%",
                overflow: "hidden",
                boxShadow:
                  "0 0 0 4px rgba(224,165,96,0.25), 0 10px 32px -8px rgba(224,165,96,0.55)",
                flexShrink: 0,
              }}
            >
              <img
                src={pecanHealthyPortrait}
                alt="Pecan Healthy"
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  objectPosition: "center",
                  display: "block",
                }}
              />
            </div>
            <div style={{ textAlign: "left" }}>
              <div className="serif" style={{ fontSize: 17, color: "var(--bone)" }}>
                <ProxText>Pecan Healthy</ProxText>
              </div>
              <div style={{ fontSize: 12.5, color: "var(--bone-3)", marginTop: 2 }}>
                <ProxText>10K followers in 3 weeks · 3M+ views with Connecta</ProxText>
              </div>
            </div>
            <a
              href="https://www.facebook.com/pecanhealthy"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "10px 16px",
                borderRadius: 999,
                background: "var(--bone)",
                color: "var(--ink)",
                boxShadow: "0 10px 30px -10px rgba(224,165,96,0.60)",
                fontFamily: "'Inter', sans-serif",
                fontWeight: 600,
                fontSize: 13,
                letterSpacing: "0.02em",
                textDecoration: "none",
                whiteSpace: "nowrap",
                transition: "transform 0.15s ease, box-shadow 0.15s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-2px)";
                e.currentTarget.style.boxShadow = "0 16px 40px -10px rgba(224,165,96,0.80)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = "0 10px 30px -10px rgba(224,165,96,0.60)";
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M22 12a10 10 0 1 0-11.56 9.88v-6.99h-2.54V12h2.54V9.8c0-2.51 1.49-3.9 3.78-3.9 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56V12h2.77l-.44 2.89h-2.33v6.99A10 10 0 0 0 22 12Z" />
              </svg>
              See their Facebook
            </a>
          </div>
        </div>

        {/* ----- Third testimonial — Spencer (impressions proof) ----- */}
        <div
          className="scroll-rise"
          style={{ maxWidth: 720, margin: "112px auto 0", padding: "0 32px", textAlign: "center" }}
        >
          {/* glowing divider so it reads as a separate voice */}
          <div
            style={{
              width: 120,
              height: 2,
              borderRadius: 999,
              background: "linear-gradient(90deg, transparent, var(--honey), transparent)",
              boxShadow: "0 0 18px rgba(224,165,96,0.55)",
              opacity: 0.8,
              margin: "0 auto 56px",
            }}
          />

          {/* profile screenshot + name */}
          <div
            style={{
              padding: 12,
              borderRadius: 16,
              background: "var(--bone)",
              boxShadow:
                "0 30px 70px -30px rgba(0,0,0,0.60), 0 0 56px -18px rgba(224,165,96,0.35)",
            }}
          >
            <img
              src={spencerProfile}
              alt="Spencer Barton — Pecan Health profile, 11K followers"
              loading="lazy"
              style={{ width: "100%", height: "auto", display: "block", borderRadius: 8 }}
            />
          </div>
          <div style={{ marginTop: 16, marginBottom: 40 }}>
            <div className="serif" style={{ fontSize: 20, color: "var(--bone)" }}>Spencer Barton</div>
            <div style={{ fontSize: 13, color: "var(--bone-3)", marginTop: 2 }}>Nurse Practitioner · Pecan Health</div>
          </div>

          {/* impressions receipts */}
          <div
            style={{
              padding: 12,
              borderRadius: 16,
              background: "var(--bone)",
              boxShadow:
                "0 30px 70px -30px rgba(0,0,0,0.60), 0 0 56px -18px rgba(224,165,96,0.35)",
            }}
          >
            <img
              src={spencerImpressions}
              alt="Spencer Barton — 4.26M impressions across Facebook, TikTok and Instagram"
              loading="lazy"
              style={{ width: "100%", height: "auto", display: "block", borderRadius: 8 }}
            />
          </div>
          <div className="serif-italic" style={{ fontSize: 15, color: "var(--bone-3)", marginTop: 16 }}>
            (2 weeks after working together)
          </div>
        </div>
      </section>

      {/* ===== Pricing section removed — no pricing on the landing page ===== */}

      {/* ===== FINAL CTA — bone panel with rounded corners ===== */}
      <section
        className="panel-bone"
        style={{
          padding: "140px 0",
          marginTop: 24,
          textAlign: "center",
          position: "relative",
        }}
      >
        {/* Warm aurora inside the bone panel */}
        <div
          className="glow-orb"
          style={{
            top: -60,
            right: "8%",
            width: 440,
            height: 440,
            "--orb-color": "rgba(224,165,96,0.22)",
          } as React.CSSProperties}
        />
        <div
          className="glow-orb"
          style={{
            bottom: -80,
            left: "4%",
            width: 380,
            height: 380,
            "--orb-color": "rgba(143,208,213,0.18)",
            animationDelay: "-6s",
          } as React.CSSProperties}
        />
        <div
          className="curl curl-hide-mobile scroll-rise"
          style={{ bottom: 60, left: "12%", color: "rgba(10,14,18,0.30)" }}
        >
          a calmer creator economy starts here
        </div>
        <div
          className="curl curl-hide-mobile scroll-rise"
          style={{ top: 80, right: "8%", color: "rgba(10,14,18,0.30)" }}
        >
          your strategy team in a screen
        </div>

        <div style={{ maxWidth: 880, margin: "0 auto", padding: "0 32px", position: "relative" }}>
          {/* ScrollFloat — characters rise as you scroll to this section.
              Both lines live in ONE ScrollFloat so they share font-size +
              animate as a single statement. */}
          <ScrollFloat
            animationDuration={1.1}
            ease="power3.out"
            scrollStart="center bottom+=30%"
            scrollEnd="bottom bottom-=30%"
            stagger={0.02}
            containerClassName="final-cta-h2"
          >
            Stop guessing.
            <br />
            <span
              className="scribble-under honey"
              style={{ display: "inline-block", color: "#A85B1F", fontStyle: "italic", fontWeight: 500 }}
            >
              Start directing.
            </span>
          </ScrollFloat>

          <div
            style={{
              fontSize: 18,
              color: "rgba(10,14,18,0.65)",
              maxWidth: 560,
              margin: "0 auto 36px",
              lineHeight: 1.55,
              position: "relative",
            }}
          >
            <ProxText>Hand us your account and we build the brand: scripted, filmed, edited, and posted in English and Spanish. You show up; we handle the rest.</ProxText>
          </div>
          <Link to="/1million" className="btn btn-honey btn-large">
            Work with us <ArrowRight size={16} />
          </Link>
          <div style={{ marginTop: 18, fontSize: 12.5, color: "rgba(10,14,18,0.45)" }}>
            1,000,000 views in 90 days, or your money back.
          </div>
        </div>
      </section>

      {/* ===== FOOTER ===== */}
      <footer className="bg-ink" style={{ padding: "60px 0 40px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 32px" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "2fr 1fr 1fr",
              gap: 40,
              marginBottom: 48,
            }}
          >
            <div>
              <Link
                to="/"
                style={{ display: "inline-flex", alignItems: "center", gap: 12, marginBottom: 14 }}
                aria-label="Connecta"
              >
                <img
                  src={logoHandBone}
                  alt=""
                  style={{ height: 42, width: "auto", display: "block" }}
                />
                <span
                  className="serif"
                  style={{
                    fontSize: 26,
                    color: "var(--bone)",
                    letterSpacing: "0.04em",
                    fontWeight: 700,
                    textTransform: "uppercase",
                  }}
                >
                  CONNECTA
                </span>
              </Link>
              <div style={{ fontSize: 13.5, color: "var(--bone-3)", maxWidth: 280, margin: 0, lineHeight: 1.6, position: "relative" }}>
                <ProxText>Personal branding experts. We build bilingual brands in English and Spanish.</ProxText>
              </div>
            </div>
            {[
              {
                title: "Start here",
                items: [
                  { label: "Work with us", href: "/1million" },
                  { label: "Client login", href: "/login" },
                ],
              },
              {
                title: "Company",
                items: [
                  { label: "About", href: "/about" },
                  { label: "Contact", href: "/1mguarantee" },
                ],
              },
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
                      {item.href.startsWith("/") ? (
                        <Link to={item.href} className="scribble-link">
                          {item.label}
                        </Link>
                      ) : (
                        <a href={item.href} className="scribble-link">
                          {item.label}
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div
            style={{
              height: 1,
              background:
                "linear-gradient(90deg, transparent, rgba(234,230,220,0.25), transparent)",
              marginBottom: 22,
            }}
          />
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontSize: 12.5,
              color: "var(--bone-3)",
              flexWrap: "wrap",
              gap: 10,
            }}
          >
            <div>© 2026 Connecta. All rights reserved.</div>
            <div style={{ display: "flex", gap: 18 }}>
              <Link to="/privacy-policy" className="scribble-link">Privacy</Link>
              <Link to="/terms-and-conditions" className="scribble-link">Terms</Link>
            </div>
          </div>
        </div>
      </footer>

      <style>{`
        @keyframes le-fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
