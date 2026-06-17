import { useRef, useState } from "react";
import drCalvinAfter from "@/assets/dr-calvin-78k.png";
import drCalvinTiktok from "@/assets/dr-calvin-tiktok.png";
import zigufitBefore from "@/assets/zigufit-before.png";
import zigufitAfter from "@/assets/zigufit-after-new.png";
import robertoFounder from "@/assets/roberto-founder.png";
import LeadForm from "@/components/LeadForm";
import ApplyModal from "@/components/ApplyModal";
import {
  Video,
  Target,
  MessageCircle,
  BarChart3,
  Stethoscope,
  Smile,
  Sparkles,
  HeartPulse,
  Scale,
  Dumbbell,
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
      Agenda tu consulta →
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

const SYSTEM_COMPONENTS = [
  {
    icon: Video,
    title: "MARCA PERSONAL",
    body: "20 scripts/mes, día de filmación profesional, edición y posting en Instagram y TikTok.",
  },
  {
    icon: Target,
    title: "ADS DIRIGIDOS",
    body: "Meta Ads en español, audiencia hispana segmentada, optimización semanal.",
  },
  {
    icon: MessageCircle,
    title: "CONVERSIÓN",
    body: "ManyChat responde en menos de 5 min, califica y agenda la cita por DM.",
  },
  {
    icon: BarChart3,
    title: "REPORTES",
    body: "Dashboard mensual: leads, costo por lead, conversión a cita y crecimiento.",
  },
];

const INDUSTRIES = [
  { icon: HeartPulse, name: "Quiroprácticos" },
  { icon: Smile, name: "Dentistas" },
  { icon: Sparkles, name: "Med Spas" },
  { icon: Stethoscope, name: "Médicos / Clínicas" },
  { icon: Scale, name: "Abogados" },
  { icon: Dumbbell, name: "Fitness / Wellness" },
];

const NOT_FOR = [
  "Negocios sin mercado hispano local relevante",
  "Dueños que no quieren aparecer en cámara",
  "Quien busca solo edición o solo ads sin el sistema completo",
  "Quien espera resultados sin filmar el contenido",
  "Negocios fuera de los nichos listados",
];

const PROCESS = [
  { n: "01", title: "APLICAS", body: "Llenas la aplicación con la información de tu negocio. Revisamos perfil." },
  { n: "02", title: "CALIFICAMOS", body: "Llamada de 30 min. Te explicamos cómo se vería el sistema en tu negocio." },
  { n: "03", title: "INSTALAMOS", body: "2 a 3 semanas: investigación, scripts, primer día de filmación, ads y ManyChat." },
  { n: "04", title: "OPERAMOS", body: "Cada mes: 20 scripts, filmación, edición, posting, ads y reporte de resultados." },
];

export default function Index() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const SPEEDS = [1, 1.15, 1.25, 1.5, 2];
  const [videoStarted, setVideoStarted] = useState(false);
  const [videoPlaying, setVideoPlaying] = useState(false);
  const [videoProgress, setVideoProgress] = useState(0);
  const [speed, setSpeed] = useState(1.15);
  const [applyOpen, setApplyOpen] = useState(false);
  const openApply = () => setApplyOpen(true);

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
            Sin agencias · Sin perder tiempo
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
              margin: "0 auto 18px",
            }}
          >
            Construye tu marca personal y <span style={{ color: "#E8852B" }}>consigue clientes reales</span>
            <br />
            en menos de 90 días, sin agencias, sin perder tiempo.
          </div>

          <div
            style={{
              fontFamily: "'Montserrat', sans-serif",
              fontWeight: 400,
              fontSize: "clamp(16px, 2.2vw, 20px)",
              color: "rgba(255,255,255,0.92)",
              marginBottom: 8,
            }}
          >
            +150M de vistas y +100K seguidores generados para nuestros clientes.
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
              margin: "0 auto 36px",
            }}
          >
            El sistema que pone tu marca a trabajar por ti mientras tú atiendes tu negocio.
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
                aria-label="Activar sonido y reproducir"
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
                  Haz click para activar el sonido
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
                  aria-label={videoPlaying ? "Pausar" : "Reproducir"}
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
                  aria-label="Velocidad de reproducción"
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
            onClick={openApply}
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
            Agenda tu consulta →
          </button>
          <div
            style={{
              fontFamily: "'Montserrat', sans-serif",
              fontSize: 13,
              color: "rgba(255,255,255,0.45)",
              marginTop: 14,
            }}
          >
            Aceptamos un máximo de 5 clientes nuevos al mes.
          </div>
        </div>
      </div>

      {/* ③ EL PROBLEMA */}
      <Sec>
        <SectionTitle text="EL MERCADO HISPANO ESTÁ AHÍ. TU COMPETENCIA NO LO ATIENDE." />

        <div
          style={{
            fontFamily: "'Montserrat', sans-serif",
            fontWeight: 700,
            fontSize: "clamp(72px, 14vw, 160px)",
            color: "#E8852B",
            lineHeight: 1,
            letterSpacing: "-0.04em",
            margin: "32px 0 12px",
          }}
        >
          63M
        </div>
        <div
          style={{
            fontFamily: "'Montserrat', sans-serif",
            fontWeight: 700,
            fontSize: 13,
            textTransform: "uppercase",
            letterSpacing: "0.12em",
            color: "rgba(255,255,255,0.5)",
            marginBottom: 36,
          }}
        >
          HISPANOS EN ESTADOS UNIDOS
        </div>
        <div
          style={{
            fontFamily: "'Montserrat', sans-serif",
            fontSize: 17,
            color: "rgba(255,255,255,0.78)",
            lineHeight: 1.6,
            maxWidth: 640,
            margin: "0 auto",
          }}
        >
          Tu competencia les habla en inglés. Vas a hablarles en español.
        </div>
      </Sec>

      {/* ③ LA SOLUCIÓN, EL SISTEMA */}
      <Sec bg="#121212">
        <SectionTitle text="UN SISTEMA COMPLETO DONE-FOR-YOU" />
        <SectionSub text="4 componentes. Tú apareces en cámara, nosotros operamos todo lo demás." />

        <div className="grid-4" style={{ marginBottom: 52 }}>
          {SYSTEM_COMPONENTS.map((c) => {
            const Icon = c.icon;
            return (
              <div className="sys-card" key={c.title}>
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 4,
                    background: "#E8852B",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: 18,
                  }}
                >
                  <Icon size={24} color="#fff" strokeWidth={2.2} />
                </div>
                <div
                  style={{
                    fontFamily: "'Montserrat', sans-serif",
                    fontWeight: 700,
                    fontSize: 13,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    color: "#fff",
                    marginBottom: 10,
                  }}
                >
                  {c.title}
                </div>
                <div
                  style={{
                    fontFamily: "'Montserrat', sans-serif",
                    fontSize: 13,
                    color: "rgba(255,255,255,0.6)",
                    lineHeight: 1.6,
                  }}
                >
                  {c.body}
                </div>
              </div>
            );
          })}
        </div>

        <ApplyBtn onApply={openApply} />
      </Sec>

      {/* ③.5 EL PROCESO — cómo construyo el sistema completo */}
      <Sec>
        <SectionTitle text="EL PROCESO" />
        <SectionSub text="Cómo construyo el sistema completo" />

        <div className="grid-4">
          {[
            {
              phase: "Fase 1",
              icon: "🎯",
              title: "Estrategia y Posicionamiento",
              body: "Definimos tu identidad, cliente ideal, promesa principal y diferenciador. Aquí nace tu marca personal real —no la que tu mamá cree que tienes.",
            },
            {
              phase: "Fase 2",
              icon: "📱",
              title: "Sistema de Contenido",
              body: "Diseñamos la parrilla de contenido viral con estructura psicológica: hooks, narrativa, llamados a la acción. Empezamos a grabar y editar.",
            },
            {
              phase: "Fase 3",
              icon: "🌐",
              title: "Activos de Conversión",
              body: "Construyo tu landing page, funnel de ventas y automatizaciones en ManyChat/CRM. Convertimos visitas en conversaciones reales.",
            },
            {
              phase: "Fase 4",
              icon: "🚀",
              title: "Escalamiento",
              body: "Optimizamos lo que funciona, escalamos los videos virales y armamos un VSL para captar clientes high-ticket de forma consistente.",
            },
          ].map((p) => (
            <div className="sys-card" key={p.phase} style={{ textAlign: "left" }}>
              <div style={{ fontSize: 30, marginBottom: 14, lineHeight: 1 }}>{p.icon}</div>
              <div
                style={{
                  fontFamily: "'Montserrat', sans-serif",
                  fontWeight: 700,
                  fontSize: 11,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "#E8852B",
                  marginBottom: 8,
                }}
              >
                {p.phase}
              </div>
              <div
                style={{
                  fontFamily: "'Montserrat', sans-serif",
                  fontWeight: 700,
                  fontSize: 14,
                  color: "#fff",
                  marginBottom: 10,
                  lineHeight: 1.25,
                }}
              >
                {p.title}
              </div>
              <div
                style={{
                  fontFamily: "'Montserrat', sans-serif",
                  fontSize: 13,
                  color: "rgba(255,255,255,0.6)",
                  lineHeight: 1.6,
                }}
              >
                {p.body}
              </div>
            </div>
          ))}
        </div>
      </Sec>

      {/* ④ CASOS DE ÉXITO */}
      <Sec>
        <SectionTitle text="RESULTADOS REALES DE CLIENTES" />
        <SectionSub text="Trabajamos con cuentas nuevas y establecidas" />

        {/* Caso Calvin */}
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
            DR. CALVIN, QUIROPRÁCTICO
          </div>

          <div className="ba-grid ba-grid-square" style={{ marginBottom: 20, maxWidth: 560, margin: "0 auto 20px" }}>
            <div className="ba-card ba-card-square">
              <img src={drCalvinAfter} alt="Dr. Calvin Facebook" />
            </div>
            <div className="ba-card ba-card-square">
              <img src={drCalvinTiktok} alt="Dr. Calvin TikTok" />
            </div>
          </div>

          <div className="agency-stats">
            <div className="agency-stat">
              <div className="agency-stat-num">100K+</div>
              <div className="agency-stat-label">SEGUIDORES GENERADOS</div>
            </div>
            <div className="agency-stat">
              <div className="agency-stat-num">$50K+</div>
              <div className="agency-stat-label">DÓLARES FACTURADOS</div>
            </div>
          </div>
        </div>

        {/* Caso Zigufit */}
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
              <img src={zigufitBefore} alt="ZiguFit antes" className="ba-img-portrait" />
              <div className="ba-caption">
                <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(255,255,255,0.45)", marginBottom: 4 }}>
                  ANTES
                </div>
                <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 700, fontSize: 24, color: "#fff" }}>
                  500 seguidores
                </div>
              </div>
            </div>
            <div className="ba-card">
              <img src={zigufitAfter} alt="ZiguFit después" className="ba-img-portrait" />
              <div className="ba-caption">
                <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "#E8852B", marginBottom: 4 }}>
                  DESPUÉS
                </div>
                <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 700, fontSize: 24, color: "#E8852B" }}>
                  17.6K seguidores
                </div>
              </div>
            </div>
          </div>
        </div>

        <ApplyBtn onApply={openApply} />
      </Sec>

      {/* ⑤ PARA QUIÉN ES */}
      <Sec bg="#121212">
        <SectionTitle text="PARA QUIÉN ESTÁ HECHO" />
        <SectionSub text="Negocios de servicios con mercado hispano disponible" />

        <div className="grid-3" style={{ marginBottom: 36, maxWidth: 880, margin: "0 auto 36px" }}>
          {INDUSTRIES.map((i) => {
            const Icon = i.icon;
            return (
              <div className="industry-card" key={i.name}>
                <Icon size={32} color="#E8852B" strokeWidth={2} />
                <div
                  style={{
                    fontFamily: "'Montserrat', sans-serif",
                    fontWeight: 700,
                    fontSize: 13,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    color: "#fff",
                    textAlign: "center",
                  }}
                >
                  {i.name}
                </div>
              </div>
            );
          })}
        </div>

        <div
          style={{
            fontFamily: "'Montserrat', sans-serif",
            fontSize: 15,
            color: "rgba(255,255,255,0.65)",
            lineHeight: 1.65,
            maxWidth: 580,
            margin: "0 auto",
          }}
        >
          Eres dueño del negocio. Tienes mercado hispano local disponible. Estás listo para aparecer en cámara.
        </div>
      </Sec>

      {/* ⑥ PARA QUIÉN NO ES */}
      <Sec>
        <SectionTitle text="PARA QUIÉN NO ESTÁ HECHO" />
        <SectionSub text="Si te ves en esta lista, este sistema no es para ti" />

        <div className="not-for-list">
          {NOT_FOR.map((item, i) => (
            <div className="not-for-item" key={i}>
              <div
                style={{
                  flexShrink: 0,
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  background: "rgba(229,72,77,0.18)",
                  color: "#ff6b6b",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: "'Montserrat', sans-serif",
                  fontWeight: 700,
                  fontSize: 14,
                  marginTop: 2,
                }}
              >
                ×
              </div>
              <div
                style={{
                  fontFamily: "'Montserrat', sans-serif",
                  fontSize: 14,
                  color: "rgba(255,255,255,0.72)",
                  lineHeight: 1.55,
                }}
              >
                {item}
              </div>
            </div>
          ))}
        </div>
      </Sec>

      {/* ⑦ CÓMO TRABAJAMOS */}
      <Sec bg="#121212">
        <SectionTitle text="CÓMO TRABAJAMOS" />
        <SectionSub text="Un proceso de 4 pasos para activar el sistema en tu negocio" />

        <div className="grid-4" style={{ marginBottom: 52 }}>
          {PROCESS.map((s) => (
            <div className="step-card" key={s.n}>
              <div
                style={{
                  fontFamily: "'Montserrat', sans-serif",
                  fontWeight: 700,
                  fontSize: 36,
                  color: "#E8852B",
                  marginBottom: 12,
                  lineHeight: 1,
                }}
              >
                {s.n}
              </div>
              <div
                style={{
                  fontFamily: "'Montserrat', sans-serif",
                  fontWeight: 700,
                  fontSize: 13,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  color: "#fff",
                  marginBottom: 10,
                }}
              >
                {s.title}
              </div>
              <div
                style={{
                  fontFamily: "'Montserrat', sans-serif",
                  fontSize: 13,
                  color: "rgba(255,255,255,0.6)",
                  lineHeight: 1.6,
                }}
              >
                {s.body}
              </div>
            </div>
          ))}
        </div>

        <ApplyBtn onApply={openApply} />
      </Sec>

      {/* ⑧ SOBRE ROBERTO */}
      <Sec>
        <SectionTitle text="SOBRE ROBERTO" />

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
              ROBERTO GAUNA, FUNDADOR
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
              Lideró la estrategia de contenido para Intermountain Immigration, la firma del Abogado Jonathan Shaw, escalando la cuenta a más de 650K seguidores entre Instagram y TikTok. Hoy aplica ese mismo sistema en Connecta para los casos de Dr. Calvin y Zigufit.
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
              MÁS SOBRE ROBERTO →
            </a>
          </div>
        </div>
      </Sec>

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
          CONTÁCTANOS
        </div>
        <div
          style={{
            fontFamily: "'Montserrat', sans-serif",
            fontSize: 13,
            color: "rgba(255,255,255,0.6)",
          }}
        >
          ¿Tienes preguntas? Escríbenos a:{" "}
          <a
            href="mailto:admin@connectacreators.com"
            style={{ color: "#E8852B", fontWeight: 700 }}
          >
            admin@connectacreators.com
          </a>
        </div>
      </div>

      <ApplyModal open={applyOpen} onClose={() => setApplyOpen(false)}>
        <LeadForm variant="modal" />
      </ApplyModal>
    </>
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
          <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 700, fontSize: 9, textTransform: "uppercase", color: "#aaa", letterSpacing: "0.08em" }}>ANTES</div>
          <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 700, fontSize: 18, color: "#fff", lineHeight: 1 }}>{before}</div>
        </div>
        <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 700, fontSize: 14, color: "#ccc" }}>→</div>
        <div>
          <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 700, fontSize: 9, textTransform: "uppercase", color: "#E8852B", letterSpacing: "0.08em" }}>AHORA</div>
          <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 700, fontSize: 18, color: "#E8852B", lineHeight: 1 }}>{after}</div>
        </div>
      </div>
    </div>
  );
}
