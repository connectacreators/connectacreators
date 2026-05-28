import drCalvinAfter from "@/assets/dr-calvin-78k.png";
import drCalvinTiktok from "@/assets/dr-calvin-tiktok.png";
import zigufitBefore from "@/assets/zigufit-before.png";
import zigufitAfter from "@/assets/zigufit-after-new.png";
import robertoFounder from "@/assets/roberto-founder.png";
import LeadForm from "@/components/LeadForm";
import VSLPlayer from "@/components/VSLPlayer";
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
  CheckCircle2,
  ShieldCheck,
  Sparkle,
  Camera,
  Scissors,
  Send,
  ArrowRight,
  Star,
  TrendingUp,
} from "lucide-react";

const CALVIN_FB = "https://www.facebook.com/drcalvinsclinics";
const ZIGUFIT_TIKTOK = "https://www.tiktok.com/@zigufit";

const TEAL = "#8FD0D5";
const TEAL_DARK = "#1A4A4F";
const TEAL_DEEP = "#0E2F33";
const GOLD = "#F5C265";
const INK = "#0A1419";
const PAPER = "#F7F4EE";

function ApplyBtn({ label = "APLICAR AHORA", inverted, glow }: { label?: string; inverted?: boolean; glow?: boolean }) {
  return (
    <a
      href="#aplicar"
      onClick={(e) => {
        e.preventDefault();
        document.getElementById("aplicar")?.scrollIntoView({ behavior: "smooth" });
      }}
      className="apply-btn"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        background: inverted ? "#fff" : INK,
        color: inverted ? INK : "#fff",
        fontFamily: "'Montserrat', sans-serif",
        fontWeight: 800,
        fontSize: 13,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        textDecoration: "none",
        padding: "18px 32px",
        cursor: "pointer",
        whiteSpace: "nowrap",
        borderRadius: 999,
        border: inverted ? `2px solid ${INK}` : "2px solid #fff",
        boxShadow: glow ? `0 0 0 4px rgba(245,194,101,0.25), 0 16px 40px rgba(0,0,0,0.25)` : `0 8px 24px rgba(0,0,0,0.18)`,
        transition: "transform 0.15s ease, box-shadow 0.15s ease",
      }}
    >
      {label}
      <ArrowRight size={16} strokeWidth={2.4} />
    </a>
  );
}

const PILLARS = [
  { icon: Sparkle, label: "GUIÓN" },
  { icon: Camera, label: "FILMAR" },
  { icon: Scissors, label: "EDITAR" },
  { icon: Send, label: "PUBLICAR" },
];

const SYSTEM_COMPONENTS = [
  {
    icon: Video,
    no: "01",
    title: "Motor de Marca Personal",
    body: "20 scripts personalizados al mes, un día profesional de filmación, publicación diaria en Instagram y TikTok.",
  },
  {
    icon: Target,
    no: "02",
    title: "Ads Dirigidos en Español",
    body: "Meta Ads enfocados en audiencia hispana de tu mercado local. Optimización semanal hasta que las vistas se compongan.",
  },
  {
    icon: MessageCircle,
    no: "03",
    title: "Automatización de Leads",
    body: "ManyChat responde en menos de 5 minutos, califica al lead y agenda la cita directo en tu calendario.",
  },
  {
    icon: BarChart3,
    no: "04",
    title: "Reporte Mensual de Resultados",
    body: "Vistas, crecimiento de seguidores, costo por lead y citas agendadas — enviado cada 30 días, sin jerga.",
  },
];

const INDUSTRIES = [
  { icon: HeartPulse, name: "Quiroprácticos" },
  { icon: Smile, name: "Dentistas" },
  { icon: Sparkles, name: "Med Spas" },
  { icon: Stethoscope, name: "Médicos y Clínicas" },
  { icon: Scale, name: "Abogados" },
  { icon: Dumbbell, name: "Fitness y Wellness" },
];

const PROCESS = [
  {
    n: "01",
    title: "Aplicas",
    body: "Cuéntanos sobre tu negocio y tu mercado. Toma 2 minutos.",
  },
  {
    n: "02",
    title: "Llamada de Estrategia",
    body: "30 minutos. Te mostramos exactamente cómo se vería el sistema en tu negocio.",
  },
  {
    n: "03",
    title: "Instalación",
    body: "En 2 a 3 semanas: investigación, scripts, primer día de filmación, ads y ManyChat al aire.",
  },
  {
    n: "04",
    title: "Escalamos",
    body: "Operamos el motor cada mes. Tú apareces en cámara. Las vistas y leads se componen.",
  },
];

const NOT_FOR = [
  "Negocios sin mercado hispano local relevante",
  "Dueños que no quieren aparecer en cámara",
  "Quien busca solo edición o solo ads sin el sistema completo",
  "Quien espera resultados sin comprometerse al día de filmación",
];

const FAQS = [
  {
    q: "¿Qué significa exactamente la garantía de 1 millón de vistas?",
    a: "Si tu contenido (orgánico + pagado) no acumula al menos 1.000.000 de vistas en Instagram, TikTok y Facebook dentro de los primeros 90 días desde tu primera publicación, te devolvemos el 100% de tu dinero. Sin letras chicas — devolución completa.",
  },
  {
    q: "¿Tengo que hablar inglés también?",
    a: "No. La estrategia está enfocada 100% en mercado hispano. Filmas en español, escribimos los guiones en español y los ads están segmentados para la audiencia hispana de tu ciudad.",
  },
  {
    q: "¿Qué tan rápido veo resultados?",
    a: "La mayoría de clientes empieza a ver resultados al mes de firmar. Las primeras publicaciones salen al aire en 2 a 3 semanas, y una vez que el algoritmo tiene suficiente señal, la velocidad de vistas y los leads entrantes suelen activarse alrededor del día 30.",
  },
  {
    q: "¿Cuánto tiempo tengo que invertir yo?",
    a: "Un día de filmación al mes (4 a 6 horas). Nosotros escribimos todo, montamos la iluminación, dirigimos en set y nos encargamos de edición y posting. Tu inversión de tiempo es el día de filmación más una llamada mensual de 15 minutos.",
  },
];

export default function Index() {
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800;900&family=Inter:wght@400;500;600&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html { scroll-behavior: smooth; }
        html, body { background: ${PAPER}; font-family: 'Inter', 'Montserrat', sans-serif; color: ${INK}; }

        .apply-btn:hover { transform: translateY(-2px); box-shadow: 0 0 0 5px rgba(245,194,101,0.3), 0 20px 48px rgba(0,0,0,0.28) !important; }

        /* ── HERO ── */
        .hero {
          position: relative;
          background:
            radial-gradient(1200px 600px at 80% -10%, rgba(245,194,101,0.18), transparent 60%),
            radial-gradient(900px 500px at 0% 100%, rgba(143,208,213,0.45), transparent 60%),
            linear-gradient(180deg, ${TEAL_DEEP} 0%, ${TEAL_DARK} 100%);
          color: #fff;
          overflow: hidden;
        }
        .hero-noise {
          position: absolute; inset: 0; pointer-events: none; opacity: 0.04;
          background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence baseFrequency='0.85'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>");
        }
        .hero-inner {
          position: relative;
          max-width: 880px;
          margin: 0 auto;
          padding: 56px 32px 80px;
          text-align: center;
        }
        .hero-chip {
          display: inline-flex; align-items: center; gap: 8px;
          background: rgba(255,255,255,0.1);
          border: 1px solid rgba(255,255,255,0.25);
          color: #fff;
          font-family: 'Montserrat', sans-serif; font-weight: 700;
          font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase;
          padding: 8px 14px; border-radius: 999px;
          backdrop-filter: blur(6px);
        }
        .hero-chip-dot {
          width: 6px; height: 6px; border-radius: 50%; background: ${GOLD};
          box-shadow: 0 0 12px ${GOLD};
        }
        .hero h1 {
          font-family: 'Montserrat', sans-serif;
          font-weight: 900;
          font-size: clamp(34px, 6.4vw, 84px);
          line-height: 0.98;
          letter-spacing: -0.035em;
          margin: 0 0 20px;
          color: #fff;
        }
        .hero h1 .gold {
          color: ${GOLD};
          font-style: italic;
          font-weight: 800;
        }
        .hero h1 .underline {
          position: relative;
          display: inline-block;
        }
        .hero h1 .nowrap { white-space: nowrap; }
        .hero h1 .underline::after {
          content: '';
          position: absolute; left: 0; right: 0; bottom: -4px; height: 6px;
          background: ${GOLD}; opacity: 0.7;
          border-radius: 2px;
        }
        .hero-sub {
          font-family: 'Inter', sans-serif;
          font-size: 18px;
          line-height: 1.55;
          color: rgba(255,255,255,0.85);
          max-width: 620px;
          margin: 0 auto 32px;
        }
        .hero-video-wrap {
          max-width: 720px;
          margin: 28px auto 32px;
        }
        .pillar-row {
          display: flex; flex-wrap: wrap; gap: 10px;
          margin: 0 0 36px;
          justify-content: center;
        }
        .pillar {
          display: inline-flex; align-items: center; gap: 8px;
          background: rgba(255,255,255,0.08);
          border: 1px solid rgba(255,255,255,0.2);
          padding: 10px 16px; border-radius: 8px;
          font-family: 'Montserrat', sans-serif; font-weight: 700;
          font-size: 11px; letter-spacing: 0.16em; text-transform: uppercase;
          color: #fff;
        }
        .hero-cta-row {
          display: flex; align-items: center; gap: 20px; flex-wrap: wrap;
          justify-content: center;
        }
        .hero-cta-meta {
          font-family: 'Inter', sans-serif; font-size: 13px;
          color: rgba(255,255,255,0.7);
          display: flex; align-items: center; gap: 8px;
        }

        /* ── PROOF BAR ── */
        .proof-bar {
          background: ${INK};
          color: #fff;
          padding: 28px 24px;
          border-bottom: 1px solid rgba(255,255,255,0.08);
        }
        .proof-grid {
          max-width: 1180px; margin: 0 auto;
          display: grid; grid-template-columns: repeat(4, 1fr); gap: 32px;
          align-items: center;
        }
        .proof-stat { text-align: center; }
        .proof-stat .num {
          font-family: 'Montserrat', sans-serif;
          font-weight: 900;
          font-size: clamp(28px, 4vw, 40px);
          letter-spacing: -0.03em;
          color: ${GOLD};
          line-height: 1;
        }
        .proof-stat .label {
          font-family: 'Inter', sans-serif;
          font-size: 12px;
          color: rgba(255,255,255,0.7);
          margin-top: 6px;
          line-height: 1.4;
          max-width: 220px;
          margin-left: auto;
          margin-right: auto;
        }

        /* ── SECTIONS ── */
        .section {
          padding: 96px 32px;
          max-width: 1180px;
          margin: 0 auto;
          text-align: center;
        }
        .section-eyebrow {
          font-family: 'Montserrat', sans-serif;
          font-weight: 700;
          font-size: 11px;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          color: ${TEAL_DARK};
          margin-bottom: 16px;
          display: inline-flex; align-items: center; gap: 8px;
          justify-content: center;
        }
        .section-title {
          font-family: 'Montserrat', sans-serif;
          font-weight: 900;
          font-size: clamp(28px, 4.4vw, 52px);
          letter-spacing: -0.025em;
          line-height: 1.05;
          color: ${INK};
          margin: 0 auto 20px;
          max-width: 760px;
        }
        .section-sub {
          font-family: 'Inter', sans-serif;
          font-size: 17px;
          line-height: 1.55;
          color: #4A5658;
          max-width: 640px;
          margin: 0 auto 56px;
        }
        .section-center { text-align: center; }

        /* ── GUARANTEE SECTION ── */
        .guarantee-card {
          background: linear-gradient(180deg, #fff 0%, #FCF8EE 100%);
          border: 1px solid #EADFC6;
          border-radius: 20px;
          padding: 56px 48px;
          position: relative;
          overflow: hidden;
          box-shadow: 0 24px 64px rgba(20,30,35,0.08);
          text-align: center;
        }
        .guarantee-card::before {
          content: ''; position: absolute; top: 0; right: 0; width: 280px; height: 280px;
          background: radial-gradient(circle, rgba(245,194,101,0.25), transparent 70%);
          pointer-events: none;
        }
        .guarantee-stamp {
          display: inline-flex; align-items: center; gap: 10px;
          background: ${GOLD};
          color: ${TEAL_DEEP};
          padding: 8px 16px; border-radius: 999px;
          font-family: 'Montserrat', sans-serif; font-weight: 900;
          font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase;
          margin-bottom: 24px;
        }
        .guarantee-headline {
          font-family: 'Montserrat', sans-serif;
          font-weight: 900;
          font-size: clamp(28px, 4vw, 44px);
          line-height: 1.1;
          letter-spacing: -0.02em;
          color: ${INK};
          margin: 0 auto 20px;
          max-width: 720px;
        }
        .guarantee-body {
          font-family: 'Inter', sans-serif; font-size: 17px;
          color: #3A464A; line-height: 1.65; max-width: 640px;
          margin: 0 auto 32px;
        }
        .guarantee-pillars {
          display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px;
          margin-top: 32px; position: relative; z-index: 1;
          text-align: center;
        }
        .guarantee-pillar {
          display: flex; flex-direction: column; gap: 12px; align-items: center;
        }
        .guarantee-pillar-icon {
          width: 44px; height: 44px; border-radius: 10px;
          background: ${TEAL_DARK}; color: #fff;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }
        .guarantee-pillar-text strong {
          display: block; font-family: 'Montserrat', sans-serif;
          font-weight: 800; font-size: 13px; letter-spacing: 0.04em;
          color: ${INK}; margin-bottom: 4px;
        }
        .guarantee-pillar-text span {
          font-family: 'Inter', sans-serif; font-size: 13px; line-height: 1.5;
          color: #4A5658;
        }

        /* ── SYSTEM CARDS ── */
        .system-grid {
          display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px;
        }
        .system-card {
          background: #fff;
          border: 1px solid #E8E2D6;
          border-radius: 16px;
          padding: 36px 32px;
          transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
          position: relative;
          overflow: hidden;
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        .system-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 24px 48px rgba(20,30,35,0.08);
          border-color: ${TEAL};
        }
        .system-card-no {
          font-family: 'Montserrat', sans-serif;
          font-weight: 900;
          font-size: 13px;
          letter-spacing: 0.14em;
          color: ${TEAL_DARK};
          opacity: 0.5;
          margin-bottom: 24px;
        }
        .system-card-icon {
          width: 56px; height: 56px; border-radius: 12px;
          background: linear-gradient(135deg, ${TEAL} 0%, ${TEAL_DARK} 100%);
          color: #fff;
          display: flex; align-items: center; justify-content: center;
          margin-bottom: 24px;
          box-shadow: 0 12px 24px rgba(26,74,79,0.3);
        }
        .system-card h3 {
          font-family: 'Montserrat', sans-serif;
          font-weight: 800;
          font-size: 20px;
          letter-spacing: -0.01em;
          color: ${INK};
          margin-bottom: 12px;
        }
        .system-card p {
          font-family: 'Inter', sans-serif;
          font-size: 15px;
          line-height: 1.6;
          color: #4A5658;
        }

        /* ── CASE STUDIES ── */
        .case-section {
          background: ${INK};
          color: #fff;
          padding: 96px 32px;
          text-align: center;
        }
        .case-section .section-eyebrow { color: ${GOLD}; }
        .case-section .section-title { color: #fff; }
        .case-section .section-sub { color: rgba(255,255,255,0.7); }
        .case-inner { max-width: 1180px; margin: 0 auto; }
        .case-card {
          background: linear-gradient(180deg, #15252A 0%, #0E1D21 100%);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 20px;
          padding: 0;
          overflow: hidden;
          margin-bottom: 32px;
          transition: transform 0.2s ease, border-color 0.2s ease;
        }
        .case-card:hover {
          transform: translateY(-4px);
          border-color: ${GOLD};
        }
        .case-grid {
          display: grid;
          grid-template-columns: 1fr 1.2fr;
          gap: 0;
        }
        .case-imgs {
          background: linear-gradient(135deg, ${TEAL_DARK}, ${TEAL_DEEP});
          padding: 32px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
          align-items: center;
        }
        .case-imgs img {
          width: 100%; height: 100%;
          object-fit: contain;
          border-radius: 8px;
          background: #fff;
          padding: 8px;
          aspect-ratio: 1 / 1;
        }
        .case-content {
          padding: 48px;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          text-align: center;
        }
        .case-label {
          display: inline-flex; align-items: center; gap: 8px;
          font-family: 'Montserrat', sans-serif;
          font-weight: 700; font-size: 11px;
          letter-spacing: 0.18em; text-transform: uppercase;
          color: ${GOLD};
          margin-bottom: 12px;
        }
        .case-name {
          font-family: 'Montserrat', sans-serif;
          font-weight: 900;
          font-size: clamp(24px, 3vw, 32px);
          letter-spacing: -0.02em;
          color: #fff;
          margin-bottom: 24px;
        }
        .case-stats {
          display: grid; grid-template-columns: 1fr 1fr; gap: 16px;
          margin-bottom: 24px;
        }
        .case-stat {
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 10px;
          padding: 16px 18px;
        }
        .case-stat .n {
          font-family: 'Montserrat', sans-serif;
          font-weight: 900;
          font-size: 28px;
          letter-spacing: -0.02em;
          color: ${GOLD};
          line-height: 1;
        }
        .case-stat .l {
          font-family: 'Inter', sans-serif;
          font-size: 11px;
          color: rgba(255,255,255,0.6);
          letter-spacing: 0.06em;
          text-transform: uppercase;
          margin-top: 8px;
        }
        .case-link {
          display: inline-flex; align-items: center; gap: 8px;
          font-family: 'Montserrat', sans-serif;
          font-weight: 800;
          font-size: 12px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: ${GOLD};
          text-decoration: none;
          padding-bottom: 4px;
          border-bottom: 2px solid ${GOLD};
          transition: gap 0.15s ease;
        }
        .case-link:hover { gap: 14px; }
        .case-card-zigufit .case-imgs img {
          aspect-ratio: 9 / 16;
          padding: 0;
          object-fit: cover;
        }

        /* ── INDUSTRIES ── */
        .industry-section {
          background: ${PAPER};
        }
        .industries {
          display: grid;
          grid-template-columns: repeat(6, 1fr);
          gap: 16px;
          margin-bottom: 32px;
        }
        .industry {
          background: #fff;
          border: 1px solid #E8E2D6;
          border-radius: 14px;
          padding: 28px 16px;
          text-align: center;
          transition: transform 0.18s ease, border-color 0.18s ease, background 0.18s ease;
        }
        .industry:hover {
          transform: translateY(-3px);
          border-color: ${TEAL};
          background: linear-gradient(180deg, #fff 0%, #F0FAFB 100%);
        }
        .industry-icon {
          width: 44px; height: 44px; border-radius: 10px;
          background: linear-gradient(135deg, ${TEAL}33, ${TEAL_DARK}22);
          color: ${TEAL_DARK};
          display: inline-flex; align-items: center; justify-content: center;
          margin-bottom: 14px;
        }
        .industry-name {
          font-family: 'Montserrat', sans-serif;
          font-weight: 700;
          font-size: 12px;
          letter-spacing: 0.04em;
          color: ${INK};
          line-height: 1.3;
        }

        /* ── PROCESS TIMELINE ── */
        .process-section { background: #fff; }
        .timeline {
          position: relative;
          max-width: 720px;
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
        }
        .timeline::before {
          content: ''; position: absolute; left: 50%; top: 0; bottom: 0;
          width: 2px; transform: translateX(-50%);
          background: linear-gradient(180deg, ${TEAL}, ${TEAL_DARK});
        }
        .timeline-step {
          position: relative;
          z-index: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 20px 0;
          text-align: center;
          max-width: 520px;
        }
        .timeline-no {
          width: 64px; height: 64px;
          border-radius: 50%;
          background: #fff;
          border: 2px solid ${TEAL_DARK};
          color: ${TEAL_DARK};
          display: flex; align-items: center; justify-content: center;
          font-family: 'Montserrat', sans-serif;
          font-weight: 900;
          font-size: 18px;
          letter-spacing: -0.01em;
          margin-bottom: 16px;
          box-shadow: 0 8px 20px rgba(26,74,79,0.15);
        }
        .timeline-content h3 {
          font-family: 'Montserrat', sans-serif;
          font-weight: 800;
          font-size: 22px;
          color: ${INK};
          margin-bottom: 8px;
          letter-spacing: -0.01em;
        }
        .timeline-content p {
          font-family: 'Inter', sans-serif;
          font-size: 15px;
          line-height: 1.6;
          color: #4A5658;
          max-width: 480px;
          margin: 0 auto;
        }

        /* ── FOUNDER ── */
        .founder-section {
          background:
            radial-gradient(800px 400px at 90% 30%, rgba(245,194,101,0.18), transparent 60%),
            ${TEAL_DEEP};
          color: #fff;
          padding: 112px 32px;
        }
        .founder-section .section-eyebrow { color: ${GOLD}; }
        .founder-inner {
          max-width: 720px; margin: 0 auto;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 40px;
          text-align: center;
        }
        .founder-photo-wrap {
          position: relative;
          width: 280px;
        }
        .founder-photo {
          width: 100%;
          aspect-ratio: 4 / 5;
          border-radius: 16px;
          overflow: hidden;
          box-shadow: 0 40px 80px rgba(0,0,0,0.4);
        }
        .founder-photo img {
          width: 100%; height: 100%; object-fit: cover; object-position: center top;
          display: block;
        }
        .founder-photo-tag {
          position: absolute; bottom: -16px; left: 50%; transform: translateX(-50%);
          background: ${GOLD};
          color: ${TEAL_DEEP};
          padding: 12px 18px;
          border-radius: 10px;
          font-family: 'Montserrat', sans-serif;
          font-weight: 900;
          font-size: 11px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          box-shadow: 0 16px 32px rgba(0,0,0,0.3);
          white-space: nowrap;
        }
        .founder-quote {
          font-family: 'Montserrat', sans-serif;
          font-weight: 700;
          font-size: clamp(22px, 2.6vw, 32px);
          line-height: 1.3;
          letter-spacing: -0.015em;
          color: #fff;
          margin: 20px auto 28px;
          max-width: 640px;
        }
        .founder-quote .accent { color: ${GOLD}; }
        .founder-bio {
          font-family: 'Inter', sans-serif;
          font-size: 16px;
          line-height: 1.7;
          color: rgba(255,255,255,0.78);
          max-width: 600px;
          margin: 0 auto 24px;
        }
        .founder-name {
          font-family: 'Montserrat', sans-serif;
          font-weight: 800;
          font-size: 16px;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          color: #fff;
          margin-bottom: 4px;
        }
        .founder-title {
          font-family: 'Inter', sans-serif;
          font-size: 14px;
          color: rgba(255,255,255,0.6);
          letter-spacing: 0.06em;
        }

        /* ── NOT FOR ── */
        .notfor-section {
          background: ${PAPER};
        }
        .notfor-list {
          max-width: 720px;
          margin: 0 auto;
        }
        .notfor-item {
          display: flex; gap: 14px; align-items: center;
          padding: 18px 0;
          border-bottom: 1px solid rgba(20,30,35,0.08);
          justify-content: center;
          text-align: center;
        }
        .notfor-item:last-child { border-bottom: none; }
        .notfor-x {
          flex-shrink: 0; width: 26px; height: 26px;
          border-radius: 50%;
          background: rgba(255,87,87,0.1);
          color: #C44545;
          display: flex; align-items: center; justify-content: center;
          font-family: 'Montserrat', sans-serif; font-weight: 900; font-size: 14px;
          margin-top: 2px;
        }
        .notfor-text {
          font-family: 'Inter', sans-serif;
          font-size: 16px;
          color: #2C383C;
          line-height: 1.55;
        }

        /* ── FAQ ── */
        .faq-section { background: #fff; }
        .faq-list {
          max-width: 820px; margin: 0 auto;
        }
        .faq-item {
          border-top: 1px solid #E8E2D6;
          padding: 28px 0;
        }
        .faq-item:last-child { border-bottom: 1px solid #E8E2D6; }
        .faq-q {
          font-family: 'Montserrat', sans-serif;
          font-weight: 800;
          font-size: 19px;
          letter-spacing: -0.01em;
          color: ${INK};
          margin-bottom: 12px;
          text-align: center;
        }
        .faq-a {
          font-family: 'Inter', sans-serif;
          font-size: 15px;
          line-height: 1.65;
          color: #4A5658;
          text-align: center;
          max-width: 640px;
          margin: 0 auto;
        }

        /* ── FINAL CTA ── */
        .final-cta {
          background: linear-gradient(135deg, ${TEAL_DARK} 0%, ${TEAL_DEEP} 100%);
          padding: 112px 32px;
          text-align: center;
          color: #fff;
          position: relative;
          overflow: hidden;
        }
        .final-cta::before {
          content: ''; position: absolute; top: -200px; left: 50%; transform: translateX(-50%);
          width: 800px; height: 800px;
          background: radial-gradient(circle, rgba(245,194,101,0.18), transparent 60%);
          pointer-events: none;
        }
        .final-cta h2 {
          font-family: 'Montserrat', sans-serif;
          font-weight: 900;
          font-size: clamp(32px, 5vw, 60px);
          letter-spacing: -0.025em;
          line-height: 1.05;
          margin-bottom: 20px;
          max-width: 820px;
          margin-left: auto; margin-right: auto;
          position: relative;
        }
        .final-cta h2 .gold { color: ${GOLD}; font-style: italic; }
        .final-cta p {
          font-family: 'Inter', sans-serif;
          font-size: 17px;
          color: rgba(255,255,255,0.8);
          max-width: 580px;
          margin: 0 auto 40px;
          position: relative;
        }
        .final-cta .scarcity {
          margin-top: 24px;
          font-family: 'Inter', sans-serif;
          font-size: 13px;
          color: ${GOLD};
          letter-spacing: 0.08em;
          text-transform: uppercase;
          font-weight: 600;
          position: relative;
        }

        /* ── FOOTER ── */
        .footer {
          background: ${INK};
          color: rgba(255,255,255,0.6);
          padding: 48px 32px 32px;
          text-align: center;
        }
        .footer-brand {
          font-family: 'Montserrat', sans-serif;
          font-weight: 900;
          font-size: 16px;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: #fff;
          margin-bottom: 16px;
        }
        .footer a { color: ${TEAL}; font-weight: 600; text-decoration: none; }
        .footer-disclaimer {
          font-size: 11px; color: rgba(255,255,255,0.35); margin-top: 24px;
        }

        /* ── RESPONSIVE ── */
        @media (max-width: 900px) {
          .hero-inner { padding: 40px 24px 64px; }
          .proof-grid { grid-template-columns: 1fr 1fr; gap: 24px; }
          .system-grid { grid-template-columns: 1fr; }
          .industries { grid-template-columns: repeat(3, 1fr); }
          .case-grid { grid-template-columns: 1fr; }
          .case-content { padding: 32px; }
          .case-imgs { padding: 24px; }
          .founder-photo-wrap { width: 240px; }
          .guarantee-card { padding: 40px 28px; }
          .guarantee-pillars { grid-template-columns: 1fr; gap: 18px; }
          .section { padding: 72px 24px; }
        }
        @media (max-width: 560px) {
          .hero-inner { padding: 32px 20px 56px; }
          .hero h1 { font-size: clamp(28px, 8vw, 44px); letter-spacing: -0.03em; }
          .hero h1 .nowrap { font-size: 0.92em; }
          .proof-grid { grid-template-columns: 1fr 1fr; gap: 20px; }
          .industries { grid-template-columns: 1fr 1fr; }
          .hero-cta-row { flex-direction: column; gap: 16px; }
          .case-imgs { grid-template-columns: 1fr; padding: 20px; gap: 12px; }
          .case-imgs img { aspect-ratio: auto; height: auto; max-height: 360px; }
          .case-card-zigufit .case-imgs { grid-template-columns: 1fr 1fr; }
          .case-stats { grid-template-columns: 1fr 1fr; }
          .case-content { padding: 28px 24px; }
          .timeline-no { width: 56px; height: 56px; font-size: 16px; }
          .timeline-step { padding: 16px 0; }
          .founder-section { padding: 80px 24px; }
          .final-cta { padding: 80px 24px; }
        }
      `}</style>

      {/* ① HERO */}
      <section className="hero">
        <div className="hero-noise" />
        <div className="hero-inner">
          <h1>
            <span className="underline nowrap">1 Millón de Vistas</span>
            <br />
            <span className="gold">o te devolvemos tu dinero.</span>
          </h1>
          <div className="hero-video-wrap">
            <VSLPlayer src="/VSL_ESPANOL_ROBERTO.mp4" poster="/vsl-poster.jpg" accent={GOLD} />
          </div>
          <p className="hero-sub">
            Escribimos, filmamos, editamos y publicamos tu contenido en español — y garantizamos al menos 1.000.000 de vistas en los primeros 90 días. O te devolvemos el 100% de tu dinero.
          </p>
          <div className="pillar-row">
            {PILLARS.map(({ icon: Icon, label }) => (
              <span className="pillar" key={label}>
                <Icon size={14} strokeWidth={2.4} />
                {label}
              </span>
            ))}
          </div>
          <div className="hero-cta-row">
            <ApplyBtn label="APLICAR AHORA" inverted glow />
            <span className="hero-cta-meta">
              <CheckCircle2 size={16} color={GOLD} />
              Solo 5 cupos al mes
            </span>
          </div>
        </div>
      </section>

      {/* ② PROOF BAR */}
      <div className="proof-bar">
        <div className="proof-grid">
          <div className="proof-stat">
            <div className="num">650K+</div>
            <div className="label">Seguidores gestionados en cuentas cliente</div>
          </div>
          <div className="proof-stat">
            <div className="num">100K+</div>
            <div className="label">Dr. Calvin — seguidores en menos de 12 meses</div>
          </div>
          <div className="proof-stat">
            <div className="num">$50K+</div>
            <div className="label">Dólares facturados para clínica cliente</div>
          </div>
          <div className="proof-stat">
            <div className="num">17.6K</div>
            <div className="label">Zigufit — de 500 a 17.6K seguidores</div>
          </div>
        </div>
      </div>

      {/* ③ LEAD FORM */}
      <LeadForm />

      {/* ④ LA GARANTÍA */}
      <section className="section">
        <div className="guarantee-card">
          <span className="guarantee-stamp">
            <ShieldCheck size={14} strokeWidth={2.5} />
            La Garantía
          </span>
          <h2 className="guarantee-headline">
            1.000.000 de vistas en 90 días — o te devolvemos el 100% de tu dinero.
          </h2>
          <p className="guarantee-body">
            Sin letras chicas. Si tu contenido (orgánico + pagado) no acumula al menos un millón de vistas entre Instagram, TikTok y Facebook dentro de los 90 días desde tu primera publicación, te devolvemos cada dólar que pagaste. Sin excusas.
          </p>
          <div className="guarantee-pillars">
            <div className="guarantee-pillar">
              <div className="guarantee-pillar-icon">
                <Sparkle size={18} strokeWidth={2.2} />
              </div>
              <div className="guarantee-pillar-text">
                <strong>Hooks personalizados</strong>
                <span>20 scripts/mes diseñados para retención en español.</span>
              </div>
            </div>
            <div className="guarantee-pillar">
              <div className="guarantee-pillar-icon">
                <TrendingUp size={18} strokeWidth={2.2} />
              </div>
              <div className="guarantee-pillar-text">
                <strong>Publicación diaria</strong>
                <span>Volumen + consistencia es como el algoritmo decide impulsarte.</span>
              </div>
            </div>
            <div className="guarantee-pillar">
              <div className="guarantee-pillar-icon">
                <Target size={18} strokeWidth={2.2} />
              </div>
              <div className="guarantee-pillar-text">
                <strong>Amplificación pagada</strong>
                <span>Los posts ganadores reciben ads para audiencia hispana local.</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ⑤ EL SISTEMA */}
      <section className="section">
        <div className="section-eyebrow">Qué recibes exactamente</div>
        <h2 className="section-title">Un motor de crecimiento done-for-you completo.</h2>
        <p className="section-sub">
          Cuatro sistemas operando en paralelo cada mes. Tú apareces en cámara un solo día de filmación. Nosotros hacemos todo lo demás.
        </p>
        <div className="system-grid">
          {SYSTEM_COMPONENTS.map((c) => {
            const Icon = c.icon;
            return (
              <div className="system-card" key={c.title}>
                <div className="system-card-no">{c.no} / 04</div>
                <div className="system-card-icon">
                  <Icon size={24} strokeWidth={2.2} />
                </div>
                <h3>{c.title}</h3>
                <p>{c.body}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* ⑥ CASOS DE ÉXITO */}
      <section className="case-section">
        <div className="case-inner">
          <div className="section-eyebrow">Resultados reales</div>
          <h2 className="section-title">El sistema funcionando en cuentas vivas.</h2>
          <p className="section-sub">
            Dos de nuestros clientes actuales. Toca un caso para ver su perfil en vivo.
          </p>

          {/* Calvin */}
          <a href={CALVIN_FB} target="_blank" rel="noopener noreferrer" className="case-card" style={{ textDecoration: "none", display: "block" }}>
            <div className="case-grid">
              <div className="case-imgs">
                <img src={drCalvinAfter} alt="Dr. Calvin Facebook" />
                <img src={drCalvinTiktok} alt="Dr. Calvin TikTok" />
              </div>
              <div className="case-content">
                <div className="case-label">
                  <Star size={12} strokeWidth={2.5} fill={GOLD} />
                  Caso de Éxito · Quiropráctico
                </div>
                <div className="case-name">Dr. Calvin's Clinic</div>
                <div className="case-stats">
                  <div className="case-stat">
                    <div className="n">100K+</div>
                    <div className="l">Seguidores Generados</div>
                  </div>
                  <div className="case-stat">
                    <div className="n">$50K+</div>
                    <div className="l">Dólares Facturados</div>
                  </div>
                </div>
                <span className="case-link">
                  Ver Dr. Calvin en Facebook <ArrowRight size={14} strokeWidth={2.5} />
                </span>
              </div>
            </div>
          </a>

          {/* Zigufit */}
          <a href={ZIGUFIT_TIKTOK} target="_blank" rel="noopener noreferrer" className="case-card case-card-zigufit" style={{ textDecoration: "none", display: "block" }}>
            <div className="case-grid">
              <div className="case-imgs">
                <img src={zigufitBefore} alt="Zigufit antes" />
                <img src={zigufitAfter} alt="Zigufit después" />
              </div>
              <div className="case-content">
                <div className="case-label">
                  <Star size={12} strokeWidth={2.5} fill={GOLD} />
                  Caso de Éxito · Fitness
                </div>
                <div className="case-name">Zigufit</div>
                <div className="case-stats">
                  <div className="case-stat">
                    <div className="n">500</div>
                    <div className="l">Seguidores Antes</div>
                  </div>
                  <div className="case-stat">
                    <div className="n">17.6K</div>
                    <div className="l">Seguidores Ahora</div>
                  </div>
                </div>
                <span className="case-link">
                  Ver Zigufit en TikTok <ArrowRight size={14} strokeWidth={2.5} />
                </span>
              </div>
            </div>
          </a>
        </div>
      </section>

      {/* ⑦ PARA QUIÉN ES */}
      <section className="industry-section">
        <div className="section section-center" style={{ paddingTop: 96, paddingBottom: 96 }}>
          <div className="section-eyebrow">Para quién está hecho</div>
          <h2 className="section-title" style={{ marginLeft: "auto", marginRight: "auto" }}>
            Negocios de servicios con mercado hispano disponible.
          </h2>
          <p className="section-sub">
            Si tus clientes pueden venir del mercado hispano local de tu ciudad, el sistema aplica.
          </p>
          <div className="industries">
            {INDUSTRIES.map((i) => {
              const Icon = i.icon;
              return (
                <div className="industry" key={i.name}>
                  <div className="industry-icon">
                    <Icon size={20} strokeWidth={2} />
                  </div>
                  <div className="industry-name">{i.name}</div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ⑧ PROCESO */}
      <section className="process-section">
        <div className="section section-center">
          <div className="section-eyebrow">Cómo funciona</div>
          <h2 className="section-title" style={{ marginLeft: "auto", marginRight: "auto" }}>
            De la aplicación al sistema en vivo en menos de 3 semanas.
          </h2>
          <p className="section-sub">
            Cuatro pasos. Nos movemos rápido — aceptamos cinco clientes nuevos al mes.
          </p>
          <div className="timeline">
            {PROCESS.map((s) => (
              <div className="timeline-step" key={s.n}>
                <div className="timeline-no">{s.n}</div>
                <div className="timeline-content">
                  <h3>{s.title}</h3>
                  <p>{s.body}</p>
                </div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 56 }}>
            <ApplyBtn label="EMPEZAR POR EL PASO 1" />
          </div>
        </div>
      </section>

      {/* ⑨ FUNDADOR */}
      <section className="founder-section">
        <div className="founder-inner">
          <div className="founder-photo-wrap">
            <div className="founder-photo">
              <img src={robertoFounder} alt="Roberto Gauna" />
            </div>
            <div className="founder-photo-tag">650K+ Seguidores Construidos</div>
          </div>
          <div>
            <div className="section-eyebrow">Sobre el fundador</div>
            <p className="founder-quote">
              Construí el mismo sistema que llevó a una firma de inmigración a <span className="accent">650K+ seguidores</span>. Ahora lo opero para dueños de negocios hispanos — y pongo una garantía de 1M de vistas detrás de cada palabra.
            </p>
            <p className="founder-bio">
              Roberto Gauna lideró la estrategia de contenido de Intermountain Immigration — la firma del abogado Jonathan Shaw — escalando la cuenta a más de 650K seguidores entre Instagram y TikTok. Hoy opera Connecta Creators, aplicando ese mismo motor para clientes como Dr. Calvin's Clinic y Zigufit. La misión: convertir a los dueños hispanos en las marcas personales más vistas de su industria.
            </p>
            <div className="founder-name">Roberto Gauna</div>
            <div className="founder-title">Fundador · Connecta Creators</div>
          </div>
        </div>
      </section>

      {/* ⑩ PARA QUIÉN NO ES */}
      <section className="notfor-section">
        <div className="section section-center">
          <div className="section-eyebrow">Honestidad por delante</div>
          <h2 className="section-title" style={{ marginLeft: "auto", marginRight: "auto" }}>
            No apliques si algo de esto es cierto.
          </h2>
          <p className="section-sub">
            Nos ahorra a los dos una llamada.
          </p>
          <div className="notfor-list">
            {NOT_FOR.map((item, i) => (
              <div className="notfor-item" key={i}>
                <div className="notfor-x">×</div>
                <div className="notfor-text">{item}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ⑪ FAQ */}
      <section className="faq-section">
        <div className="section section-center">
          <div className="section-eyebrow">Preguntas comunes</div>
          <h2 className="section-title" style={{ marginLeft: "auto", marginRight: "auto" }}>
            Lo que la gente pregunta en cada llamada.
          </h2>
          <div className="faq-list" style={{ marginTop: 32 }}>
            {FAQS.map((f) => (
              <div className="faq-item" key={f.q}>
                <div className="faq-q">{f.q}</div>
                <div className="faq-a">{f.a}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ⑫ CTA FINAL */}
      <section className="final-cta">
        <h2>
          Tu audiencia hispana ya está <span className="gold">esperando</span>.
        </h2>
        <p>
          Tenemos cupo para 5 negocios nuevos este mes. La aplicación toma 2 minutos — la llamada de estrategia es gratis.
        </p>
        <ApplyBtn label="APLICA PARA TRABAJAR CON NOSOTROS" inverted glow />
        <div className="scarcity">★ Solo 5 cupos al mes</div>
      </section>

      {/* FOOTER */}
      <div className="footer">
        <div className="footer-brand">CONNECTA CREATORS</div>
        <div>
          ¿Preguntas? Escríbenos a{" "}
          <a href="mailto:admin@connectacreators.com">admin@connectacreators.com</a>
        </div>
        <div className="footer-disclaimer">
          *los resultados pueden variar · © {new Date().getFullYear()} Connecta Creators
        </div>
      </div>
    </>
  );
}
