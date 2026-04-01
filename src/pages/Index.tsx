import { useEffect, useRef, useState } from "react";
import { motion, useInView } from "framer-motion";
import { Brain, Smartphone, Compass, Rocket, Briefcase, Hospital, Scale, Lightbulb, BarChart2 } from "lucide-react";
import robertoImage from "@/assets/roberto-founder.png";
import signatureImage from "@/assets/roberto-signature.png";
import jonathanInstagram from "@/assets/jonathan-instagram.png";
import jonathanTiktok from "@/assets/jonathan-tiktok.png";
import zigufitBefore from "@/assets/zigufit-before.png";
import zigufitAfter from "@/assets/zigufit-after.png";
import abogadoJonathan from "@/assets/abogado-jonathan.webp";
import drCalvin from "@/assets/dr-calvin-new.webp";
import zigufit from "@/assets/zigufit-profile.jpg";

const CALENDLY = "https://calendly.com/robertogaunaj/demo-presentation";
const VIMEO = "https://player.vimeo.com/video/1172266100?badge=0&autopause=0&player_id=0&app_id=58479";

const fadeUp = {
  hidden: { opacity: 0, y: 36 },
  visible: (d = 0) => ({
    opacity: 1, y: 0,
    transition: { duration: 0.9, delay: d, ease: [0.22, 0.9, 0.36, 1] },
  }),
};

function useCountUp(target: number, active: boolean, duration = 2200) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!active) return;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - start) / duration, 1);
      const e = 1 - Math.pow(1 - p, 4);
      setVal(Math.round(e * target));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [active, target, duration]);
  return val;
}

function AnimNum({ n, suffix = "", prefix = "" }: { n: number; suffix?: string; prefix?: string }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  const v = useCountUp(n, inView);
  return <span ref={ref}>{prefix}{v.toLocaleString()}{suffix}</span>;
}

// ── Section wrapper ──────────────────────────────────────────────────────────
function Sec({ id, ch, children }: { id: string; ch: string; children: React.ReactNode }) {
  return (
    <section id={id} style={{ position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: 0, right: "-2rem", lineHeight: 1, userSelect: "none", pointerEvents: "none", fontFamily: "'Cormorant Garamond', serif", fontSize: "clamp(8rem, 22vw, 20rem)", fontWeight: 700, color: "transparent", WebkitTextStroke: "1px rgba(8,145,178,0.07)", zIndex: 0 }}>
        {ch}
      </div>
      <div className="sec-inner">
        {children}
      </div>
    </section>
  );
}

// ── Gold line ────────────────────────────────────────────────────────────────
function Line() {
  return <div style={{ height: "1px", background: "linear-gradient(90deg, transparent 0%, rgba(8,145,178,0.2) 30%, rgba(8,145,178,0.2) 70%, transparent 100%)" }} />;
}

// ── Label ────────────────────────────────────────────────────────────────────
function Label({ t }: { t: string }) {
  return (
    <p style={{ fontFamily: "'Syne', sans-serif", fontSize: "0.65rem", letterSpacing: "0.3em", textTransform: "uppercase", color: "#0891B2", marginBottom: "1.25rem" }}>
      {t}
    </p>
  );
}

// ── Heading ──────────────────────────────────────────────────────────────────
function H2({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "clamp(2rem, 5.5vw, 4.5rem)", fontWeight: 600, color: "#F0EAD8", lineHeight: 1.08, ...style }}>
      {children}
    </h2>
  );
}

// ── CTA Button ───────────────────────────────────────────────────────────────
function CTABtn({ label = "Empezar Ahora", size = "md" }: { label?: string; size?: "md" | "lg" }) {
  const p = size === "lg" ? "1.25rem 4rem" : "1rem 2.75rem";
  return (
    <motion.a
      href={CALENDLY} target="_blank" rel="noopener noreferrer"
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.97 }}
      className="btn-primary-glass"
      style={{ display: "inline-block", padding: p, fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: "0.72rem", letterSpacing: "0.12em", textTransform: "uppercase", textDecoration: "none", borderRadius: "2px" }}
    >
      {label}
    </motion.a>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════════
export default function Index() {
  return (
    <div className="ambient-glow" style={{ background: "#080604", color: "#F0EAD8", fontFamily: "'Syne', sans-serif", overflowX: "hidden" }}>

      {/* ── Fonts + global styles ── */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400;1,600&family=Syne:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; }
        ::selection { background: rgba(6,182,212,0.25); color: #F0EAD8; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: #080604; }
        ::-webkit-scrollbar-thumb { background: rgba(8,145,178,0.3); border-radius: 2px; }

        .resp-2col {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 5rem;
          align-items: center;
        }
        .resp-3col {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 2rem;
        }
        .resp-6col {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(290px, 1fr));
          gap: 1.5rem;
        }
        .resp-platforms {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 1px;
          background: rgba(8,145,178,0.12);
          border: 1px solid rgba(8,145,178,0.12);
        }
        .resp-before-after {
          display: grid;
          grid-template-columns: 1fr auto 1fr;
          gap: 2rem;
          align-items: center;
        }
        .sec-inner {
          position: relative;
          z-index: 1;
          max-width: 1200px;
          margin: 0 auto;
          padding: 7rem 1.5rem;
        }
        .s-card {
          border: 1px solid rgba(8,145,178,0.12);
          border-radius: 2px;
          background: rgba(255,255,255,0.018);
          transition: border-color 0.35s ease, background 0.35s ease;
        }
        .s-card:hover {
          border-color: rgba(8,145,178,0.32);
          background: rgba(8,145,178,0.03);
        }
        .for-row {
          display: flex;
          align-items: center;
          gap: 2rem;
          padding: 1.75rem 0;
          border-bottom: 1px solid rgba(8,145,178,0.08);
          transition: padding-left 0.25s ease;
        }
        .for-row:hover { padding-left: 0.5rem; }
        .cta-btn-wrap { display: inline-block; }
        @media (max-width: 600px) {
          .cta-btn-wrap { display: block; width: 100%; }
          .cta-btn-wrap a { display: block !important; text-align: center !important; padding: 1.1rem 2rem !important; width: 100% !important; }
        }

        @media (max-width: 900px) {
          .resp-2col { grid-template-columns: 1fr !important; gap: 3rem !important; }
          .resp-3col { grid-template-columns: 1fr 1fr !important; gap: 1.25rem !important; }
          .resp-platforms { grid-template-columns: 1fr !important; }
          .resp-before-after { grid-template-columns: 1fr auto 1fr !important; gap: 1rem !important; }
          .resp-before-after .ba-mid { display: flex !important; flex-direction: column; align-items: center; }
          .deco-frame { display: none !important; }
        }
        @media (max-width: 600px) {
          .sec-inner { padding: 3.5rem 1.25rem !important; }
          .resp-3col { grid-template-columns: 1fr !important; gap: 1rem !important; }
          .resp-6col { grid-template-columns: 1fr !important; gap: 1rem !important; }
          .resp-before-after { grid-template-columns: 1fr !important; gap: 1.5rem !important; }
          .resp-before-after .ba-mid {
            flex-direction: row !important;
            justify-content: center !important;
            padding: 0.5rem 0 !important;
          }
          .resp-before-after .ba-mid .ba-line { display: none !important; }
          .resp-2col { gap: 2.5rem !important; }
          .stat-badge {
            position: static !important;
            margin-top: 1rem !important;
            display: inline-block !important;
            left: auto !important;
            bottom: auto !important;
          }
          .stat-badge-wrap { position: static !important; }
          .for-row { gap: 1rem !important; padding: 1.25rem 0 !important; }
          .for-row:hover { padding-left: 0 !important; }
          .cta-checks { gap: 1rem !important; flex-direction: column !important; align-items: center !important; }
          .method-steps { padding-left: 0 !important; }
          .method-step { gap: 1.25rem !important; }
          .hero-content { padding: 0 1.25rem !important; }
        }
      `}</style>

      {/* ══════════════════════════════════════════════
          HERO — VSL
      ══════════════════════════════════════════════ */}
      <section style={{ position: "relative", background: "#080604", paddingTop: "6rem", paddingBottom: "0", overflow: "hidden" }}>
        {/* Subtle radial glow */}
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 80% 40% at 50% 0%, rgba(6,182,212,0.06) 0%, transparent 70%)", pointerEvents: "none" }} />
        {/* Grain */}
        <div style={{ position: "absolute", inset: 0, backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E\")", pointerEvents: "none" }} />

        <div className="hero-content" style={{ position: "relative", zIndex: 1, textAlign: "center", padding: "0 1.5rem", maxWidth: "860px", margin: "0 auto" }}>
          <motion.p
            initial={{ opacity: 0, letterSpacing: "0.6em" }}
            animate={{ opacity: 1, letterSpacing: "0.28em" }}
            transition={{ duration: 1.2, delay: 0.3 }}
            style={{ fontFamily: "'Syne',sans-serif", fontSize: "0.62rem", fontWeight: 600, textTransform: "uppercase", color: "#0891B2", marginBottom: "2rem" }}
          >
            Connecta Creators &nbsp;·&nbsp; Sistema de Crecimiento
          </motion.p>

          <motion.h1
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1.1, delay: 0.5, ease: [0.22, 0.9, 0.36, 1] }}
            style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "clamp(1.8rem, 4.5vw, 3.5rem)", fontWeight: 600, lineHeight: 1.1, marginBottom: "1.25rem", color: "#F0EAD8" }}
          >
            El sistema paso a paso<br />
            para ganar{" "}
            <em style={{ fontStyle: "italic" }}><span className="text-gradient-brand">+$10,000/mes</span></em>
            <br />con tu marca en{" "}
            <em style={{ fontStyle: "italic" }}>90 días</em>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 0.8 }}
            style={{ fontSize: "clamp(0.95rem, 2vw, 1.1rem)", color: "#8A7E6A", marginBottom: "2.5rem", letterSpacing: "0.01em" }}
          >
            con tu cuenta de Instagram grabando videos con tu teléfono
          </motion.p>
        </div>

        {/* ── VSL Video Player ── */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 1 }}
          style={{ position: "relative", zIndex: 1, maxWidth: "860px", margin: "0 auto", padding: "0 1.5rem 0" }}
        >
          <div style={{ borderRadius: "4px", overflow: "hidden", border: "1px solid rgba(8,145,178,0.2)", boxShadow: "0 0 80px rgba(6,182,212,0.1), 0 30px 60px rgba(0,0,0,0.6)" }}>
            <video
              src="/reto-vsl.mp4"
              controls
              playsInline
              preload="metadata"
              style={{ width: "100%", display: "block", background: "#000" }}
            />
          </div>
        </motion.div>

        {/* CTA below video */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 1.4 }}
          style={{ textAlign: "center", padding: "3rem 1.5rem 5rem", position: "relative", zIndex: 1 }}
        >
          <div className="cta-btn-wrap" style={{ display: "inline-block" }}><CTABtn label="Empezar Ahora" size="lg" /></div>
          <p style={{ marginTop: "1.25rem", fontSize: "0.7rem", color: "#6A6254", letterSpacing: "0.07em" }}>
            Agenda tu llamada de 15 minutos &nbsp;→
          </p>
        </motion.div>
      </section>

      <Line />

      {/* ══════════════════════════════════════════════
          FOUNDER
      ══════════════════════════════════════════════ */}
      <Sec id="founder" ch="01">
        <div className="resp-2col">
          <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }}>
            <Label t="Conoce al Fundador" />
            <H2 style={{ marginBottom: "2rem" }}>
              Roberto<br />
              <em style={{ color: "#E8B458" }}>Gauna</em>
            </H2>
            <div style={{ height: "1px", background: "rgba(180,130,40,0.18)", marginBottom: "2rem" }} />
            <p style={{ color: "#8A7E6A", lineHeight: 1.85, fontSize: "0.975rem", marginBottom: "1.5rem" }}>
              Empecé como editor de video y me convertí en estratega de contenido al obsesionarme con lo que realmente hace que el contenido funcione.
            </p>
            <p style={{ color: "#8A7E6A", lineHeight: 1.85, fontSize: "0.975rem", marginBottom: "2.75rem" }}>
              En el camino, he ayudado a generar más de{" "}
              <strong style={{ color: "#F0EAD8" }}>215M+ vistas</strong>{" "}
              en Instagram, TikTok y YouTube construyendo sistemas que convierten la atención en resultados reales. Hoy,{" "}
              <strong style={{ color: "#F0EAD8" }}>dirección, consistencia y estrategia</strong>{" "}
              son lo que separa el crecimiento del ruido.
            </p>
            <img src={signatureImage} alt="firma Roberto Gauna" style={{ height: "52px", opacity: 0.65, filter: "brightness(2) sepia(0.4) hue-rotate(-10deg)" }} />
          </motion.div>

          <motion.div className="stat-badge-wrap" variants={fadeUp} custom={0.2} initial="hidden" whileInView="visible" viewport={{ once: true }} style={{ position: "relative" }}>
            <div style={{ aspectRatio: "4/5", maxHeight: "420px", overflow: "hidden", borderRadius: "2px", position: "relative" }}>
              <img src={robertoImage} alt="Roberto Gauna" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center top" }} />
              <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(8,6,4,0.55) 0%, transparent 50%)" }} />
            </div>
            {/* Decorative frame */}
            <div className="deco-frame" style={{ position: "absolute", top: "-1.25rem", right: "-1.25rem", width: "55%", height: "50%", border: "1px solid rgba(180,130,40,0.18)", borderRadius: "2px", zIndex: -1 }} />
            {/* Stat badge */}
            <div className="stat-badge" style={{ position: "absolute", bottom: "2rem", left: "-2.5rem", background: "#0C0A07", border: "1px solid rgba(180,130,40,0.25)", padding: "1.5rem 2rem", borderRadius: "2px" }}>
              <p style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "2.75rem", fontWeight: 700, color: "#E8B458", lineHeight: 1 }}>215M+</p>
              <p style={{ fontFamily: "'Syne',sans-serif", fontSize: "0.62rem", letterSpacing: "0.2em", textTransform: "uppercase", color: "#6A6254", marginTop: "0.35rem" }}>Vistas generadas</p>
            </div>
          </motion.div>
        </div>
      </Sec>

      <Line />

      {/* ══════════════════════════════════════════════
          PROOF — ZIGUFIT
      ══════════════════════════════════════════════ */}
      <Sec id="zigufit" ch="03">
        <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }} style={{ marginBottom: "4rem" }}>
          <Label t="Transformación Real" />
          <H2>
            <em>@zigufit</em><br />
            <span style={{ color: "#8A7E6A", fontSize: "75%" }}>Creadora de Fitness</span>
          </H2>
        </motion.div>

        <div className="resp-before-after" style={{ marginBottom: "4rem" }}>
          <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }}>
            <p style={{ fontFamily: "'Syne',sans-serif", fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", color: "#6A6254", marginBottom: "1rem" }}>Antes</p>
            <img src={zigufitBefore} alt="ZiguFit antes" style={{ width: "100%", maxHeight: "280px", objectFit: "cover", objectPosition: "top", borderRadius: "2px", border: "1px solid rgba(8,145,178,0.12)" }} />
            <p style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "2.6rem", fontWeight: 700, color: "#6A6254", marginTop: "1rem", lineHeight: 1 }}>1,280</p>
            <p style={{ fontFamily: "'Syne',sans-serif", fontSize: "0.7rem", color: "#6A6254" }}>seguidores</p>
          </motion.div>

          <motion.div className="ba-mid" variants={fadeUp} custom={0.2} initial="hidden" whileInView="visible" viewport={{ once: true }}
            style={{ textAlign: "center", padding: "0 1rem" }}>
            <div className="btn-primary-glass" style={{ display: "inline-block", padding: "0.6rem 1rem", borderRadius: "2px", fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: "1rem", marginBottom: "1rem" }}>
              +1,275%
            </div>
            <div className="ba-line" style={{ width: "1px", height: "80px", background: "linear-gradient(to bottom, #0891B2, transparent)", margin: "0 auto" }} />
          </motion.div>

          <motion.div variants={fadeUp} custom={0.35} initial="hidden" whileInView="visible" viewport={{ once: true }}>
            <p style={{ fontFamily: "'Syne',sans-serif", fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", color: "#0891B2", marginBottom: "1rem" }}>Después</p>
            <img src={zigufitAfter} alt="ZiguFit después" style={{ width: "100%", maxHeight: "280px", objectFit: "cover", objectPosition: "top", borderRadius: "2px", border: "1px solid rgba(8,145,178,0.3)" }} />
            <p className="text-gradient-brand" style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "2.6rem", fontWeight: 700, marginTop: "1rem", lineHeight: 1 }}>17,600+</p>
            <p style={{ fontFamily: "'Syne',sans-serif", fontSize: "0.7rem", color: "#8A7E6A" }}>seguidores</p>
          </motion.div>
        </div>

        <div className="resp-3col">
          {[
            { n: "5", suf: " meses", label: "Para lograrlo" },
            { n: "2.6M+", label: "Vistas · mejor video" },
            { n: "442K", label: "Likes totales" },
          ].map((s, i) => (
            <motion.div key={i} variants={fadeUp} custom={i * 0.1} initial="hidden" whileInView="visible" viewport={{ once: true }}
              className="s-card glass-card rounded-xl" style={{ padding: "2.25rem", textAlign: "center" }}>
              <p className="text-gradient-brand" style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "clamp(2.2rem, 4vw, 3.2rem)", fontWeight: 700, lineHeight: 1 }}>{s.n}{s.suf}</p>
              <p style={{ fontFamily: "'Syne',sans-serif", fontSize: "0.62rem", letterSpacing: "0.18em", textTransform: "uppercase", color: "#6A6254", marginTop: "0.6rem" }}>{s.label}</p>
            </motion.div>
          ))}
        </div>
      </Sec>

      <Line />

      {/* ══════════════════════════════════════════════
          SERVICES
      ══════════════════════════════════════════════ */}
      <Sec id="services" ch="04">
        <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }} style={{ marginBottom: "4rem" }}>
          <Label t="Todo incluido" />
          <H2>
            Lo que obtienes<br />
            <em>con Connecta</em>
          </H2>
        </motion.div>

        <div className="resp-6col">
          {[
            { n: "01", title: "20 Videos Virales cada 4 Semanas", desc: "Guiones diseñados para captar atención, retención y autoridad en Instagram, TikTok y YouTube Shorts." },
            { n: "02", title: "Edición de Video de Alto Rendimiento", desc: "Ediciones dinámicas que detienen el scroll, diseñadas para maximizar el tiempo de visualización y los compartidos." },
            { n: "03", title: "Coaching y Dirección Creativa", desc: "Guía clara sobre qué grabar, cómo grabarlo y cómo comunicar en cámara como marca personal." },
            { n: "04", title: "Amplificación con Meta Ads", desc: "Promoción estratégica del contenido ganador para acelerar el crecimiento y llegar a la audiencia correcta más rápido." },
            { n: "05", title: "Funnel para Lead Generation", desc: "Landing page optimizada después de los ads para convertir visitantes en clientes potenciales." },
            { n: "06", title: "Integración de Sistemas AI", desc: "Automatización inteligente para que los clientes compren o agenden una cita contigo de forma automática." },
          ].map((s, i) => (
            <motion.div key={i} variants={fadeUp} custom={i * 0.08} initial="hidden" whileInView="visible" viewport={{ once: true }}
              className="s-card glass-card rounded-xl" style={{ padding: "2rem" }}>
              <p style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "3.5rem", fontWeight: 700, color: "rgba(8,145,178,0.14)", lineHeight: 1, marginBottom: "1.25rem" }}>{s.n}</p>
              <h3 style={{ fontFamily: "'Syne',sans-serif", fontSize: "0.9rem", fontWeight: 600, color: "#F0EAD8", marginBottom: "0.75rem", lineHeight: 1.45 }}>{s.title}</h3>
              <p style={{ fontFamily: "'Syne',sans-serif", fontSize: "0.82rem", color: "#6A6254", lineHeight: 1.75 }}>{s.desc}</p>
            </motion.div>
          ))}
        </div>
      </Sec>

      <Line />

      {/* ══════════════════════════════════════════════
          METHOD
      ══════════════════════════════════════════════ */}
      <Sec id="method" ch="05">
        <div className="resp-2col" style={{ gap: "6rem" }}>
          <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }}>
            <Label t="El proceso" />
            <H2>
              El Método<br />
              <em>Connecta</em>
            </H2>
            <div style={{ height: "1px", background: "rgba(8,145,178,0.18)", margin: "2rem 0" }} />
            <p style={{ color: "#6A6254", lineHeight: 1.8, fontSize: "0.9rem" }}>
              Cinco pasos diseñados para convertir tu expertise en una marca que atrae, convierte y escala de forma sistemática.
            </p>
          </motion.div>

          <div className="method-steps" style={{ position: "relative" }}>
            <div style={{ position: "absolute", left: "1.2rem", top: "2.2rem", bottom: "2.2rem", width: "1px", background: "linear-gradient(to bottom, #0891B2, rgba(8,145,178,0.08))" }} />
            {[
              "Creamos guiones virales adaptados a tu nicho y personalidad",
              "Tú grabas con confianza usando nuestra guía",
              "Editamos y optimizamos para máxima retención",
              "Amplificamos el contenido ganador con ads",
              "Tu marca gana visibilidad, autoridad y momentum",
            ].map((step, i) => (
              <motion.div key={i} variants={fadeUp} custom={i * 0.11} initial="hidden" whileInView="visible" viewport={{ once: true }}
                className="method-step"
                style={{ display: "flex", gap: "2.25rem", alignItems: "flex-start", padding: "1.75rem 0", borderBottom: i < 4 ? "1px solid rgba(8,145,178,0.07)" : "none" }}>
                <div style={{ width: "2.4rem", height: "2.4rem", borderRadius: "50%", background: "#080604", border: "1px solid #0891B2", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, zIndex: 1 }}>
                  <span style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "1rem", fontWeight: 700, color: "#0891B2" }}>{i + 1}</span>
                </div>
                <p style={{ fontFamily: "'Syne',sans-serif", fontSize: "0.925rem", color: "#C8C0AE", lineHeight: 1.65, paddingTop: "0.45rem" }}>{step}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </Sec>

      <Line />

      {/* ══════════════════════════════════════════════
          BIG STATS
      ══════════════════════════════════════════════ */}
      <Sec id="stats" ch="06">
        <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }} style={{ marginBottom: "5rem", textAlign: "center" }}>
          <Label t="Historial de Connecta" />
          <H2 style={{ textAlign: "center" }}>
            Crecimiento real.<br />
            <em>Números reales.</em>
          </H2>
        </motion.div>

        {/* Platform counters */}
        <div className="resp-platforms" style={{ marginBottom: "5rem" }}>
          {[
            { plat: "Instagram", n: 50, suf: "M+" },
            { plat: "TikTok", n: 200, suf: "M+" },
            { plat: "YouTube", n: 20, suf: "M+" },
          ].map((s, i) => (
            <motion.div key={i} variants={fadeUp} custom={i * 0.15} initial="hidden" whileInView="visible" viewport={{ once: true }}
              style={{ background: "#080604", padding: "3.5rem 2rem", textAlign: "center" }}>
              <p style={{ fontFamily: "'Syne',sans-serif", fontSize: "0.6rem", letterSpacing: "0.28em", textTransform: "uppercase", color: "#0891B2", marginBottom: "1.25rem" }}>{s.plat}</p>
              <p className="text-gradient-brand" style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "clamp(3.5rem, 7vw, 5.5rem)", fontWeight: 700, lineHeight: 1 }}>
                <AnimNum n={s.n} suffix={s.suf} />
              </p>
              <p style={{ fontFamily: "'Syne',sans-serif", fontSize: "0.65rem", color: "#6A6254", marginTop: "0.6rem", letterSpacing: "0.1em" }}>Vistas totales</p>
            </motion.div>
          ))}
        </div>

        {/* Case study profiles */}
        <div className="resp-3col">
          {[
            { img: abogadoJonathan, name: "Abogado Jonathan", before: "378K", after: "1.28M" },
            { img: drCalvin, name: "Clínica Dr. Calvin", before: "0", after: "10,000" },
            { img: zigufit, name: "ZiguFit", before: "1,000", after: "17,700" },
          ].map((c, i) => (
            <motion.div key={i} variants={fadeUp} custom={i * 0.15} initial="hidden" whileInView="visible" viewport={{ once: true }}
              style={{ border: "1px solid rgba(8,145,178,0.15)", borderRadius: "2px", overflow: "hidden" }}>
              <div style={{ aspectRatio: "1/1", maxHeight: "220px", overflow: "hidden" }}>
                <img src={c.img} alt={c.name} style={{ width: "100%", height: "100%", objectFit: "cover", transition: "transform 0.6s ease" }}
                  onMouseEnter={e => (e.currentTarget.style.transform = "scale(1.04)")}
                  onMouseLeave={e => (e.currentTarget.style.transform = "scale(1)")} />
              </div>
              <div style={{ padding: "1.5rem" }}>
                <p style={{ fontFamily: "'Syne',sans-serif", fontSize: "0.6rem", color: "#0891B2", letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: "0.75rem" }}>{c.name}</p>
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                  <span style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "1.6rem", color: "#6A6254" }}>{c.before}</span>
                  <span style={{ color: "#0891B2", fontSize: "1.1rem" }}>→</span>
                  <span className="text-gradient-brand" style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "1.6rem", fontWeight: 700 }}>{c.after}</span>
                </div>
                <p style={{ fontFamily: "'Syne',sans-serif", fontSize: "0.65rem", color: "#6A6254" }}>seguidores</p>
              </div>
            </motion.div>
          ))}
        </div>
      </Sec>

      <Line />

      {/* ══════════════════════════════════════════════
          WHY
      ══════════════════════════════════════════════ */}
      <Sec id="why" ch="07">
        <div className="resp-2col" style={{ gap: "6rem" }}>
          <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }}>
            <Label t="La diferencia" />
            <H2 style={{ marginBottom: "2rem" }}>
              Por qué<br />
              <em>esto funciona</em>
            </H2>
            <div style={{ height: "1px", background: "rgba(8,145,178,0.18)", marginBottom: "2rem" }} />
            <p style={{ color: "#8A7E6A", lineHeight: 1.85, fontSize: "0.975rem", marginBottom: "1.5rem" }}>
              La mayoría de agencias publican contenido y esperan que funcione.
            </p>
            <p style={{ color: "#F0EAD8", lineHeight: 1.75, fontSize: "1.05rem", fontWeight: 500, marginBottom: "2.5rem" }}>
              Connecta se enfoca en el <strong className="text-gradient-brand">mensaje</strong>, la <strong className="text-gradient-brand">retención</strong> y la <strong className="text-gradient-brand">consistencia</strong>.
            </p>
            <p style={{ color: "#8A7E6A", lineHeight: 1.75, fontSize: "0.975rem" }}>
              Para que tu contenido no solo{" "}
              <em style={{ color: "#F0EAD8" }}>exista</em>.
            </p>
            <p className="text-gradient-brand" style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "2rem", fontWeight: 600, marginTop: "0.5rem" }}>
              Que rinda.
            </p>
          </motion.div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.25rem" }}>
            {[
              { icon: <Brain className="w-8 h-8 text-[#22d3ee] mx-auto" />, label: "Psicología" },
              { icon: <Smartphone className="w-8 h-8 text-[#0891B2] mx-auto" />, label: "Plataformas" },
              { icon: <Compass className="w-8 h-8 text-[#22d3ee] mx-auto" />, label: "Dirección Clara" },
              { icon: <Rocket className="w-8 h-8 text-[#84CC16] mx-auto" />, label: "Ejecución" },
            ].map((p, i) => (
              <motion.div key={i} variants={fadeUp} custom={0.1 + i * 0.1} initial="hidden" whileInView="visible" viewport={{ once: true }}
                className="s-card glass-card rounded-xl" style={{ padding: "2rem", textAlign: "center" }}>
                <div style={{ marginBottom: "0.9rem" }}>{p.icon}</div>
                <p style={{ fontFamily: "'Syne',sans-serif", fontSize: "0.78rem", fontWeight: 600, color: "#C8C0AE", letterSpacing: "0.06em" }}>{p.label}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </Sec>

      <Line />

      {/* ══════════════════════════════════════════════
          FOR WHO
      ══════════════════════════════════════════════ */}
      <Sec id="forwho" ch="08">
        <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }} style={{ marginBottom: "4rem", maxWidth: "600px" }}>
          <Label t="Ideal para" />
          <H2>
            Para quién es<br />
            <em>Connecta</em>
          </H2>
        </motion.div>

        <div style={{ maxWidth: "700px" }}>
          {[
            { icon: <Briefcase className="w-5 h-5 text-[#0891B2]" />, label: "Profesionales con servicios probados" },
            { icon: <Hospital className="w-5 h-5 text-[#22d3ee]" />, label: "Clínicas y consultorios médicos" },
            { icon: <Scale className="w-5 h-5 text-[#0891B2]" />, label: "Abogados y marcas legales" },
            { icon: <Lightbulb className="w-5 h-5 text-[#22d3ee]" />, label: "Coaches y consultores" },
            { icon: <BarChart2 className="w-5 h-5 text-[#84CC16]" />, label: "Líderes de ventas y emprendedores" },
          ].map((item, i) => (
            <motion.div key={i} variants={fadeUp} custom={i * 0.09} initial="hidden" whileInView="visible" viewport={{ once: true }}
              className="for-row">
              <span style={{ width: "2rem", flexShrink: 0 }}>{item.icon}</span>
              <p style={{ fontFamily: "'Syne',sans-serif", fontSize: "1.05rem", color: "#C8C0AE" }}>{item.label}</p>
              <span style={{ marginLeft: "auto", color: "#0891B2", opacity: 0.4, fontSize: "1.1rem" }}>→</span>
            </motion.div>
          ))}
        </div>

        <motion.p variants={fadeUp} custom={0.5} initial="hidden" whileInView="visible" viewport={{ once: true }}
          style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "clamp(1.6rem, 3.5vw, 2.4rem)", fontWeight: 500, color: "#8A7E6A", marginTop: "3.5rem", lineHeight: 1.5, maxWidth: "700px" }}>
          Si quieres ser{" "}
          <em style={{ color: "#F0EAD8" }}>visible</em>,{" "}
          <em style={{ color: "#F0EAD8" }}>confiable</em>{" "}
          y{" "}
          <em style={{ color: "#F0EAD8" }}>tomado en serio</em>{" "}
          online, esto es para ti.
        </motion.p>
      </Sec>

      <Line />

      {/* ══════════════════════════════════════════════
          CTA FINAL
      ══════════════════════════════════════════════ */}
      <section style={{ position: "relative", padding: "10rem 1.5rem", textAlign: "center", overflow: "hidden" }}>
        {/* Radial glow */}
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 60% 50% at 50% 50%, rgba(6,182,212,0.07) 0%, transparent 70%)", pointerEvents: "none" }} />

        <div style={{ position: "relative", zIndex: 1, maxWidth: "760px", margin: "0 auto" }}>
          <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
            style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "1.5rem", marginBottom: "2.5rem" }}>
            <div style={{ height: "1px", width: "50px", background: "#0891B2" }} />
            <p style={{ fontFamily: "'Syne',sans-serif", fontSize: "0.62rem", letterSpacing: "0.3em", textTransform: "uppercase", color: "#0891B2" }}>
              Cupos limitados disponibles
            </p>
            <div style={{ height: "1px", width: "50px", background: "#0891B2" }} />
          </motion.div>

          <motion.h2 variants={fadeUp} custom={0.1} initial="hidden" whileInView="visible" viewport={{ once: true }}
            style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "clamp(3.5rem, 8vw, 7rem)", fontWeight: 600, color: "#F0EAD8", lineHeight: 1.05, marginBottom: "2rem" }}>
            ¿Listo para<br />construir{" "}
            <em><span className="text-gradient-brand">momentum?</span></em>
          </motion.h2>

          <motion.p variants={fadeUp} custom={0.2} initial="hidden" whileInView="visible" viewport={{ once: true }}
            style={{ fontFamily: "'Syne',sans-serif", fontSize: "1.05rem", color: "#8A7E6A", marginBottom: "3.5rem", lineHeight: 1.85 }}>
            Si tu servicio ya funciona, tu marca debería reflejarlo.<br />
            <strong style={{ color: "#F0EAD8" }}>Construyamos algo que crezca.</strong>
          </motion.p>

          <motion.div variants={fadeUp} custom={0.3} initial="hidden" whileInView="visible" viewport={{ once: true }}>
            <div className="cta-btn-wrap"><CTABtn label="Agenda una Llamada Estratégica" size="lg" /></div>
            <div className="cta-checks" style={{ display: "flex", justifyContent: "center", gap: "2.5rem", flexWrap: "wrap", marginTop: "2rem" }}>
              {["✓ Llamada de 15 minutos", "✓ Sin compromiso", "✓ Estrategia personalizada"].map((t, i) => (
                <p key={i} style={{ fontFamily: "'Syne',sans-serif", fontSize: "0.72rem", color: "#6A6254", letterSpacing: "0.05em" }}>{t}</p>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* Footer disclaimer */}
      <div style={{ borderTop: "1px solid rgba(8,145,178,0.1)", padding: "2rem", textAlign: "center" }}>
        <p style={{ fontFamily: "'Syne',sans-serif", fontSize: "0.65rem", color: "#4A4438", letterSpacing: "0.1em" }}>
          *resultados pueden variar*
        </p>
      </div>

    </div>
  );
}
