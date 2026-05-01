import { useRef, useState } from "react";
import drCalvinAfter from "@/assets/dr-calvin-after.png";
import drCalvinTiktok from "@/assets/dr-calvin-tiktok.png";
import zigufitBefore from "@/assets/zigufit-before.png";
import zigufitAfter from "@/assets/zigufit-after.png";
import robertoFounder from "@/assets/roberto-founder.png";
import LeadForm from "@/components/LeadForm";
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
} from "lucide-react";

function ApplyBtn({ small, inverted }: { small?: boolean; inverted?: boolean }) {
  return (
    <a
      href="#aplicar"
      onClick={(e) => {
        e.preventDefault();
        document.getElementById("aplicar")?.scrollIntoView({ behavior: "smooth" });
      }}
      style={{
        display: "inline-block",
        background: inverted ? "#fff" : "#0891B2",
        color: inverted ? "#0891B2" : "#fff",
        fontFamily: "'Montserrat', sans-serif",
        fontWeight: 700,
        fontSize: small ? 11 : 13,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        textDecoration: "none",
        padding: small ? "11px 22px" : "17px 40px",
        cursor: "pointer",
        whiteSpace: "nowrap",
        borderRadius: 2,
      }}
    >
      APLICA PARA TRABAJAR CON NOSOTROS
    </a>
  );
}

function Sec({
  children,
  bg = "#fff",
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
        fontWeight: 900,
        fontSize: "clamp(22px, 4vw, 38px)",
        textTransform: "uppercase",
        letterSpacing: "-0.01em",
        lineHeight: 1.1,
        color: "#0a0a0a",
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
        color: "#666",
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
  const [muted, setMuted] = useState(true);

  const handleUnmute = () => {
    if (videoRef.current) {
      videoRef.current.muted = false;
      videoRef.current.volume = 1;
      setMuted(false);
    }
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;700;900&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { background: #fff; font-family: 'Montserrat', sans-serif; }

        .ba-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        .ba-card { background: #f5f5f5; overflow: hidden; border-radius: 4px; }
        .ba-img-portrait { width: 100%; height: 420px; object-fit: cover; object-position: top center; display: block; }
        .ba-caption { padding: 14px 16px; }

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
          background: #f5f5f5;
          padding: 32px 22px;
          border-radius: 4px;
          text-align: left;
        }

        .industry-card {
          background: #f5f5f5;
          padding: 28px 18px;
          border-radius: 4px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 14px;
        }

        .step-card {
          background: #f5f5f5;
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
          border-bottom: 1px solid #eee;
        }
        .not-for-item:last-child { border-bottom: none; }

        .roberto-row {
          display: grid;
          grid-template-columns: 280px 1fr;
          gap: 40px;
          align-items: center;
          max-width: 880px;
          margin: 0 auto;
          text-align: left;
        }
        .roberto-photo {
          width: 280px;
          height: auto;
          border-radius: 4px;
          display: block;
        }

        @media (max-width: 780px) {
          .grid-4 { grid-template-columns: 1fr 1fr; gap: 12px; }
          .grid-3 { grid-template-columns: 1fr 1fr; gap: 12px; }
          .hero-stat-row { grid-template-columns: 1fr 1fr 1fr; gap: 8px; max-width: 100%; }
          .roberto-row { grid-template-columns: 1fr; gap: 20px; text-align: center; }
          .roberto-photo { width: 200px; height: auto; margin: 0 auto; }
        }
        @media (max-width: 480px) {
          .sec-inner { padding: 48px 16px !important; }
          .hero-inner { padding: 56px 16px !important; }
          .ba-grid { grid-template-columns: 1fr !important; gap: 12px; }
          .ba-grid img { height: auto !important; max-height: 260px; object-fit: cover !important; object-position: top center !important; }
          .grid-4 { grid-template-columns: 1fr; gap: 10px; }
          .grid-3 { grid-template-columns: 1fr 1fr; gap: 10px; }
          .grid-2 { grid-template-columns: 1fr; gap: 10px; }
          .hero-stat-row { grid-template-columns: 1fr; gap: 8px; margin-top: 36px; }
          .hero-headline { font-size: 26px !important; letter-spacing: -0.01em !important; }
          .hero-sub { font-size: 14px !important; margin-bottom: 28px !important; }
          .section-title { font-size: 20px !important; }
          .sys-card { padding: 22px 16px !important; }
          .step-card { padding: 22px 16px !important; }
          .industry-card { padding: 20px 12px !important; }
          .ba-img-portrait { height: auto !important; max-height: 480px; }
          .body-left { text-align: center !important; }
          .body-left p, .body-left div { text-align: center !important; }
        }
      `}</style>

      {/* ① HERO */}
      <div style={{ background: "#0891B2" }}>
        <div
          className="hero-inner"
          style={{
            maxWidth: 1080,
            margin: "0 auto",
            padding: "88px 24px",
            textAlign: "center",
          }}
        >
          <div
            className="hero-headline"
            style={{
              fontFamily: "'Montserrat', sans-serif",
              fontWeight: 900,
              fontSize: "clamp(30px, 6vw, 58px)",
              textTransform: "uppercase",
              color: "#fff",
              lineHeight: 1.05,
              letterSpacing: "-0.02em",
              maxWidth: 820,
              margin: "0 auto 20px",
            }}
          >
            1.000.000 DE VISTAS O NO PAGAS.
          </div>

          {/* VSL Video */}
          <div style={{ maxWidth: 760, margin: "0 auto 36px", borderRadius: 12, overflow: "hidden", boxShadow: "0 8px 40px rgba(0,0,0,0.35)", position: "relative" }}>
            <video
              ref={videoRef}
              controls
              autoPlay
              muted
              playsInline
              preload="auto"
              style={{ width: "100%", display: "block" }}
            >
              <source src="/VSL_ESPANOL_ROBERTO.mp4" type="video/mp4" />
            </video>
            {muted && (
              <button
                onClick={handleUnmute}
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
                🔊 Activar sonido
              </button>
            )}
          </div>

          <div
            className="hero-sub"
            style={{
              fontFamily: "'Montserrat', sans-serif",
              fontWeight: 500,
              fontSize: 17,
              color: "rgba(255,255,255,0.88)",
              marginBottom: 44,
            }}
          >
            Contenido viral para negocios hispanos. Sin resultados, no pagas.
          </div>
          <ApplyBtn inverted />

          <div className="hero-stat-row">
            <HeroStat number="45K" label="SEGUIDORES" sub="DR. CALVIN" />
            <HeroStat number="42" label="LEADS / MES" sub="PACIENTES HISPANOS" />
            <HeroStat number="17.4K" label="SEGUIDORES" sub="ZIGUFIT" />
          </div>
        </div>
      </div>

      {/* ② EL PROBLEMA */}
      <Sec>
        <SectionTitle text="EL MERCADO HISPANO ESTÁ AHÍ. TU COMPETENCIA NO LO ATIENDE." />

        <div
          style={{
            fontFamily: "'Montserrat', sans-serif",
            fontWeight: 900,
            fontSize: "clamp(72px, 14vw, 160px)",
            color: "#0891B2",
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
            color: "#666",
            marginBottom: 36,
          }}
        >
          HISPANOS EN ESTADOS UNIDOS
        </div>
        <div
          style={{
            fontFamily: "'Montserrat', sans-serif",
            fontSize: 17,
            color: "#222",
            lineHeight: 1.6,
            maxWidth: 640,
            margin: "0 auto",
          }}
        >
          Tu competencia les habla en inglés. Vas a hablarles en español.
        </div>
      </Sec>

      {/* ③ LA SOLUCIÓN, EL SISTEMA */}
      <Sec bg="#f5f5f5">
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
                    background: "#0891B2",
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
                    fontWeight: 900,
                    fontSize: 13,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    color: "#0a0a0a",
                    marginBottom: 10,
                  }}
                >
                  {c.title}
                </div>
                <div
                  style={{
                    fontFamily: "'Montserrat', sans-serif",
                    fontSize: 13,
                    color: "#555",
                    lineHeight: 1.6,
                  }}
                >
                  {c.body}
                </div>
              </div>
            );
          })}
        </div>

        <ApplyBtn />
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
              color: "#0a0a0a",
              marginBottom: 16,
            }}
          >
            DR. CALVIN, QUIROPRÁCTICO
          </div>

          <div className="ba-grid" style={{ marginBottom: 20, maxWidth: 560, margin: "0 auto 20px" }}>
            <div className="ba-card">
              <img
                src={drCalvinAfter}
                alt="Dr. Calvin Facebook"
                style={{ width: "100%", height: 220, objectFit: "cover", objectPosition: "top left", display: "block" }}
              />
              <BeforeAfterCaption platform="FACEBOOK" before="7K" after="45K" />
            </div>
            <div className="ba-card">
              <img
                src={drCalvinTiktok}
                alt="Dr. Calvin TikTok"
                style={{ width: "100%", height: 220, objectFit: "cover", objectPosition: "top left", display: "block" }}
              />
              <BeforeAfterCaption platform="TIKTOK" before="400" after="8,900" />
            </div>
          </div>

          <div
            style={{
              background: "#0891B2",
              borderRadius: 4,
              padding: "24px 20px",
              maxWidth: 560,
              margin: "0 auto",
            }}
          >
            <div
              style={{
                fontFamily: "'Montserrat', sans-serif",
                fontWeight: 900,
                fontSize: "clamp(36px, 6vw, 56px)",
                color: "#fff",
                lineHeight: 1,
                letterSpacing: "-0.02em",
                marginBottom: 8,
              }}
            >
              42
            </div>
            <div
              style={{
                fontFamily: "'Montserrat', sans-serif",
                fontWeight: 700,
                fontSize: 12,
                textTransform: "uppercase",
                letterSpacing: "0.12em",
                color: "rgba(255,255,255,0.92)",
              }}
            >
              LEADS DE PACIENTES HISPANOS / MES
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
              color: "#0a0a0a",
              marginBottom: 16,
            }}
          >
            ZIGUFIT, FITNESS
          </div>

          <div className="ba-grid" style={{ marginBottom: 0, maxWidth: 560, margin: "0 auto" }}>
            <div className="ba-card">
              <img src={zigufitBefore} alt="ZiguFit antes" className="ba-img-portrait" />
              <div className="ba-caption">
                <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "#999", marginBottom: 4 }}>
                  ANTES
                </div>
                <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 900, fontSize: 24, color: "#0a0a0a" }}>
                  500 seguidores
                </div>
              </div>
            </div>
            <div className="ba-card">
              <img src={zigufitAfter} alt="ZiguFit después" className="ba-img-portrait" />
              <div className="ba-caption">
                <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "#0891B2", marginBottom: 4 }}>
                  DESPUÉS
                </div>
                <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 900, fontSize: 24, color: "#0891B2" }}>
                  17.4K seguidores
                </div>
              </div>
            </div>
          </div>
        </div>

        <ApplyBtn />
      </Sec>

      {/* ⑤ PARA QUIÉN ES */}
      <Sec bg="#f5f5f5">
        <SectionTitle text="PARA QUIÉN ESTÁ HECHO" />
        <SectionSub text="Negocios de servicios con mercado hispano disponible" />

        <div className="grid-3" style={{ marginBottom: 36, maxWidth: 880, margin: "0 auto 36px" }}>
          {INDUSTRIES.map((i) => {
            const Icon = i.icon;
            return (
              <div className="industry-card" key={i.name}>
                <Icon size={32} color="#0891B2" strokeWidth={2} />
                <div
                  style={{
                    fontFamily: "'Montserrat', sans-serif",
                    fontWeight: 700,
                    fontSize: 13,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    color: "#0a0a0a",
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
            color: "#444",
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
                  background: "#fee",
                  color: "#c33",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: "'Montserrat', sans-serif",
                  fontWeight: 900,
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
                  color: "#333",
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
      <Sec bg="#f5f5f5">
        <SectionTitle text="CÓMO TRABAJAMOS" />
        <SectionSub text="Un proceso de 4 pasos para activar el sistema en tu negocio" />

        <div className="grid-4" style={{ marginBottom: 52 }}>
          {PROCESS.map((s) => (
            <div className="step-card" key={s.n}>
              <div
                style={{
                  fontFamily: "'Montserrat', sans-serif",
                  fontWeight: 900,
                  fontSize: 36,
                  color: "#0891B2",
                  marginBottom: 12,
                  lineHeight: 1,
                }}
              >
                {s.n}
              </div>
              <div
                style={{
                  fontFamily: "'Montserrat', sans-serif",
                  fontWeight: 900,
                  fontSize: 13,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  color: "#0a0a0a",
                  marginBottom: 10,
                }}
              >
                {s.title}
              </div>
              <div
                style={{
                  fontFamily: "'Montserrat', sans-serif",
                  fontSize: 13,
                  color: "#555",
                  lineHeight: 1.6,
                }}
              >
                {s.body}
              </div>
            </div>
          ))}
        </div>

        <ApplyBtn />
      </Sec>

      {/* ⑧ SOBRE ROBERTO */}
      <Sec>
        <SectionTitle text="SOBRE ROBERTO" />

        <div className="roberto-row">
          <img src={robertoFounder} alt="Roberto Gauna" className="roberto-photo" />
          <div>
            <div
              style={{
                fontFamily: "'Montserrat', sans-serif",
                fontWeight: 900,
                fontSize: 18,
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                color: "#0a0a0a",
                marginBottom: 12,
              }}
            >
              ROBERTO GAUNA, FUNDADOR
            </div>
            <div
              style={{
                fontFamily: "'Montserrat', sans-serif",
                fontSize: 15,
                color: "#333",
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
                color: "#0891B2",
                textDecoration: "none",
                borderBottom: "2px solid #0891B2",
                paddingBottom: 2,
              }}
            >
              MÁS SOBRE ROBERTO →
            </a>
          </div>
        </div>
      </Sec>

      {/* ⑨ LEAD FORM */}
      <LeadForm />

      {/* FOOTER */}
      <div
        style={{
          background: "#f0f0f0",
          padding: "32px 24px",
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontFamily: "'Montserrat', sans-serif",
            fontWeight: 700,
            fontSize: 12,
            color: "#0a0a0a",
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
            color: "#555",
          }}
        >
          ¿Tienes preguntas? Escríbenos a:{" "}
          <a
            href="mailto:admin@connectacreators.com"
            style={{ color: "#0891B2", fontWeight: 700 }}
          >
            admin@connectacreators.com
          </a>
        </div>
      </div>
    </>
  );
}

function HeroStat({ number, label, sub }: { number: string; label: string; sub: string }) {
  return (
    <div className="hero-stat">
      <div
        style={{
          fontFamily: "'Montserrat', sans-serif",
          fontWeight: 900,
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

function BeforeAfterCaption({ platform, before, after }: { platform: string; before: string; after: string }) {
  return (
    <div className="ba-caption">
      <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 700, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: "#999", marginBottom: 6, textAlign: "center" }}>
        {platform}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center" }}>
        <div>
          <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 700, fontSize: 9, textTransform: "uppercase", color: "#aaa", letterSpacing: "0.08em" }}>ANTES</div>
          <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 900, fontSize: 18, color: "#0a0a0a", lineHeight: 1 }}>{before}</div>
        </div>
        <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 900, fontSize: 14, color: "#ccc" }}>→</div>
        <div>
          <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 700, fontSize: 9, textTransform: "uppercase", color: "#0891B2", letterSpacing: "0.08em" }}>AHORA</div>
          <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 900, fontSize: 18, color: "#0891B2", lineHeight: 1 }}>{after}</div>
        </div>
      </div>
    </div>
  );
}
