import drCalvinAfter from "@/assets/dr-calvin-78k.png";
import drCalvinTiktok from "@/assets/dr-calvin-tiktok.png";
import zigufitBefore from "@/assets/zigufit-before.png";
import zigufitAfter from "@/assets/zigufit-after-new.png";
import robertoFounder from "@/assets/roberto-founder.png";
import LeadFormEN from "@/components/LeadFormEN";
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
const GOLD_DEEP = "#B88829";
const INK = "#0A1419";
const PAPER = "#F7F4EE";

function ApplyBtn({ label = "APPLY NOW", inverted, glow }: { label?: string; inverted?: boolean; glow?: boolean }) {
  return (
    <a
      href="#apply"
      onClick={(e) => {
        e.preventDefault();
        document.getElementById("apply")?.scrollIntoView({ behavior: "smooth" });
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
  { icon: Sparkle, label: "SCRIPT" },
  { icon: Camera, label: "FILM" },
  { icon: Scissors, label: "EDIT" },
  { icon: Send, label: "POST" },
];

const SYSTEM_COMPONENTS = [
  {
    icon: Video,
    no: "01",
    title: "Personal Brand Engine",
    body: "20 custom scripts a month, one professional shoot day, daily posting on Instagram & TikTok in English and Spanish.",
  },
  {
    icon: Target,
    no: "02",
    title: "Bilingual Paid Amplification",
    body: "Meta Ads targeting Utah's English + Spanish-speaking audiences. Optimized weekly until views compound.",
  },
  {
    icon: MessageCircle,
    no: "03",
    title: "Lead Capture Automation",
    body: "ManyChat replies in under 5 minutes, qualifies the lead, and books the appointment straight in your calendar.",
  },
  {
    icon: BarChart3,
    no: "04",
    title: "Monthly Performance Report",
    body: "Views, follower growth, cost-per-lead, and booked appointments — sent to you every 30 days, plainly.",
  },
];

const INDUSTRIES = [
  { icon: HeartPulse, name: "Chiropractors" },
  { icon: Smile, name: "Dentists" },
  { icon: Sparkles, name: "Med Spas" },
  { icon: Stethoscope, name: "Clinics & Doctors" },
  { icon: Scale, name: "Immigration Attorneys" },
  { icon: Dumbbell, name: "Fitness & Wellness" },
];

const PROCESS = [
  {
    n: "01",
    title: "Apply",
    body: "Tell us about your business and your market. Takes ~2 minutes.",
  },
  {
    n: "02",
    title: "Strategy Call",
    body: "30-minute call. We show exactly what the system looks like in your business.",
  },
  {
    n: "03",
    title: "Install",
    body: "Within 2–3 weeks: research, scripts, first shoot day, ads, and ManyChat live.",
  },
  {
    n: "04",
    title: "Scale",
    body: "We run the engine monthly. You show up on camera. Views and leads compound.",
  },
];

const NOT_FOR = [
  "Businesses with no Utah local market to serve",
  "Owners who refuse to appear on camera",
  "People shopping for just editing or just ads — we run the whole system",
  "Anyone expecting results without committing to a shoot day",
];

const FAQS = [
  {
    q: "What does the 1 million view guarantee actually mean?",
    a: "If your content (organic + boosted) doesn't accumulate at least 1,000,000 views across Instagram, TikTok, and Facebook within 90 days of your first post going live, we keep working for free until you do. No refunds-fine-print games — just continued service.",
  },
  {
    q: "Do I need to speak Spanish too?",
    a: "Helpful but not required. Many of our clients shoot in English and we localize captions, B-roll text, and ad copy so the same content reaches both audiences in Utah.",
  },
  {
    q: "How fast until I see results?",
    a: "First posts go live within 2–3 weeks of signing. View velocity typically picks up in week 3–4 once the algorithm has enough signal. Booked appointments usually start in month 2.",
  },
  {
    q: "How much time do I have to put in?",
    a: "One shoot day per month (4–6 hours). We script everything, set up lighting, direct on set, then handle editing and posting. Your time investment is essentially the shoot day plus a 15-minute monthly review call.",
  },
];

export default function OneMillionGuarantee() {
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
          padding: 112px 32px 96px;
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
          font-size: clamp(40px, 6.4vw, 84px);
          line-height: 0.95;
          letter-spacing: -0.035em;
          margin: 24px 0 20px;
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
        .case-section .section-eyebrow::before { background: ${GOLD}; }
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
        .founder-section .section-eyebrow::before { background: ${GOLD}; }
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
          .hero-inner { padding: 80px 24px 72px; }
          .proof-grid { grid-template-columns: 1fr 1fr; gap: 24px; }
          .system-grid { grid-template-columns: 1fr; }
          .industries { grid-template-columns: repeat(3, 1fr); }
          .case-grid { grid-template-columns: 1fr; }
          .case-content { padding: 32px; }
          .founder-photo-wrap { width: 240px; }
          .guarantee-card { padding: 40px 28px; }
          .guarantee-pillars { grid-template-columns: 1fr; gap: 18px; }
          .section { padding: 72px 24px; }
        }
        @media (max-width: 560px) {
          .proof-grid { grid-template-columns: 1fr 1fr; gap: 20px; }
          .industries { grid-template-columns: 1fr 1fr; }
          .hero-cta-row { flex-direction: column; gap: 16px; }
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
          <span className="hero-chip">
            <span className="hero-chip-dot" />
            For Utah Bilingual Business Owners
          </span>
          <h1>
            <span className="underline">1 Million Views</span>
            <br />
            <span className="gold">or you don't pay.</span>
          </h1>
          <p className="hero-sub">
            We script, film, edit, and post your social media in English <em>and</em> Spanish — and guarantee at least 1,000,000 views in your first 90 days. Or we give you 100% of your money back.
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
            <ApplyBtn label="APPLY NOW" inverted glow />
            <span className="hero-cta-meta">
              <CheckCircle2 size={16} color={GOLD} />
              Only 5 client slots a month
            </span>
          </div>
        </div>
      </section>

      {/* ② PROOF BAR */}
      <div className="proof-bar">
        <div className="proof-grid">
          <div className="proof-stat">
            <div className="num">650K+</div>
            <div className="label">Followers managed across client accounts</div>
          </div>
          <div className="proof-stat">
            <div className="num">100K+</div>
            <div className="label">Dr. Calvin — followers in under 12 months</div>
          </div>
          <div className="proof-stat">
            <div className="num">$50K+</div>
            <div className="label">Revenue generated for client clinic</div>
          </div>
          <div className="proof-stat">
            <div className="num">17.6K</div>
            <div className="label">Zigufit — from 500 to 17.6K followers</div>
          </div>
        </div>
      </div>

      {/* ③ LEAD FORM */}
      <LeadFormEN />

      {/* ④ THE GUARANTEE */}
      <section className="section">
        <div className="guarantee-card">
          <span className="guarantee-stamp">
            <ShieldCheck size={14} strokeWidth={2.5} />
            The Guarantee
          </span>
          <h2 className="guarantee-headline">
            1,000,000 views in 90 days — or we work for free until you get them.
          </h2>
          <p className="guarantee-body">
            No fine print. If your content (organic + boosted) doesn't accumulate at least one million views across Instagram, TikTok, and Facebook within 90 days of your first post going live, we keep producing, posting, and running ads at no additional cost until you do.
          </p>
          <div className="guarantee-pillars">
            <div className="guarantee-pillar">
              <div className="guarantee-pillar-icon">
                <Sparkle size={18} strokeWidth={2.2} />
              </div>
              <div className="guarantee-pillar-text">
                <strong>Custom-written hooks</strong>
                <span>20 scripts/month engineered for retention in both languages.</span>
              </div>
            </div>
            <div className="guarantee-pillar">
              <div className="guarantee-pillar-icon">
                <TrendingUp size={18} strokeWidth={2.2} />
              </div>
              <div className="guarantee-pillar-text">
                <strong>Daily posting</strong>
                <span>Volume + consistency is how the algorithm decides you're worth boosting.</span>
              </div>
            </div>
            <div className="guarantee-pillar">
              <div className="guarantee-pillar-icon">
                <Target size={18} strokeWidth={2.2} />
              </div>
              <div className="guarantee-pillar-text">
                <strong>Paid amplification</strong>
                <span>Top-performing posts get boosted to bilingual Utah audiences.</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ⑤ THE SYSTEM */}
      <section className="section">
        <div className="section-eyebrow">What you actually get</div>
        <h2 className="section-title">A complete done-for-you growth engine.</h2>
        <p className="section-sub">
          Four systems running in parallel every month. You show up on camera for a single shoot day. We do everything else.
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

      {/* ⑥ CASE STUDIES */}
      <section className="case-section">
        <div className="case-inner">
          <div className="section-eyebrow">Real Utah results</div>
          <h2 className="section-title">See the system on live accounts.</h2>
          <p className="section-sub">
            Two of our current clients. Tap a case to view their live profile.
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
                  Case Study · Chiropractor
                </div>
                <div className="case-name">Dr. Calvin's Clinic</div>
                <div className="case-stats">
                  <div className="case-stat">
                    <div className="n">100K+</div>
                    <div className="l">Followers Generated</div>
                  </div>
                  <div className="case-stat">
                    <div className="n">$50K+</div>
                    <div className="l">Revenue Generated</div>
                  </div>
                </div>
                <span className="case-link">
                  View Dr. Calvin on Facebook <ArrowRight size={14} strokeWidth={2.5} />
                </span>
              </div>
            </div>
          </a>

          {/* Zigufit */}
          <a href={ZIGUFIT_TIKTOK} target="_blank" rel="noopener noreferrer" className="case-card case-card-zigufit" style={{ textDecoration: "none", display: "block" }}>
            <div className="case-grid">
              <div className="case-imgs">
                <img src={zigufitBefore} alt="Zigufit before" />
                <img src={zigufitAfter} alt="Zigufit after" />
              </div>
              <div className="case-content">
                <div className="case-label">
                  <Star size={12} strokeWidth={2.5} fill={GOLD} />
                  Case Study · Fitness
                </div>
                <div className="case-name">Zigufit</div>
                <div className="case-stats">
                  <div className="case-stat">
                    <div className="n">500</div>
                    <div className="l">Followers Before</div>
                  </div>
                  <div className="case-stat">
                    <div className="n">17.6K</div>
                    <div className="l">Followers After</div>
                  </div>
                </div>
                <span className="case-link">
                  View Zigufit on TikTok <ArrowRight size={14} strokeWidth={2.5} />
                </span>
              </div>
            </div>
          </a>
        </div>
      </section>

      {/* ⑦ WHO IT'S FOR */}
      <section className="industry-section">
        <div className="section section-center" style={{ paddingTop: 96, paddingBottom: 96 }}>
          <div className="section-eyebrow">Who it's built for</div>
          <h2 className="section-title" style={{ marginLeft: "auto", marginRight: "auto" }}>
            Utah service businesses with a bilingual market.
          </h2>
          <p className="section-sub">
            If your customers could come from either an English speaker or a Spanish speaker in Utah, the system applies.
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

      {/* ⑧ PROCESS */}
      <section className="process-section">
        <div className="section section-center">
          <div className="section-eyebrow">How it works</div>
          <h2 className="section-title" style={{ marginLeft: "auto", marginRight: "auto" }}>
            From application to live system in under 3 weeks.
          </h2>
          <p className="section-sub">
            Four steps. We move fast — we accept five new clients per month.
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
            <ApplyBtn label="START WITH STEP 1" />
          </div>
        </div>
      </section>

      {/* ⑨ FOUNDER */}
      <section className="founder-section">
        <div className="founder-inner">
          <div className="founder-photo-wrap">
            <div className="founder-photo">
              <img src={robertoFounder} alt="Roberto Gauna" />
            </div>
            <div className="founder-photo-tag">Built 650K+ Followers</div>
          </div>
          <div>
            <div className="section-eyebrow">About the founder</div>
            <p className="founder-quote">
              I built the same system that took an immigration firm to <span className="accent">650K+ followers</span>. Now I'm running it for Utah business owners — and putting a 1M-view guarantee on every word of it.
            </p>
            <p className="founder-bio">
              Roberto Gauna led content strategy for Intermountain Immigration — attorney Jonathan Shaw's firm — scaling the account past 650K followers across Instagram and TikTok. Today he runs Connecta Creators, applying that same engine for clients like Dr. Calvin's Clinic and Zigufit. The mission: turn Utah's bilingual business owners into the most-watched personal brands in their industry.
            </p>
            <div className="founder-name">Roberto Gauna</div>
            <div className="founder-title">Founder · Connecta Creators</div>
          </div>
        </div>
      </section>

      {/* ⑩ WHO IT'S NOT FOR */}
      <section className="notfor-section">
        <div className="section section-center">
          <div className="section-eyebrow">Honest disclaimer</div>
          <h2 className="section-title" style={{ marginLeft: "auto", marginRight: "auto" }}>
            Don't apply if any of these are true.
          </h2>
          <p className="section-sub">
            Saves us both a call.
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
          <div className="section-eyebrow">Common questions</div>
          <h2 className="section-title" style={{ marginLeft: "auto", marginRight: "auto" }}>
            The stuff people ask on every call.
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

      {/* ⑫ FINAL CTA */}
      <section className="final-cta">
        <h2>
          Your Utah audience is waiting in <span className="gold">two languages</span>.
        </h2>
        <p>
          We've got space for 5 new businesses this month. Application takes ~2 minutes — strategy call is free.
        </p>
        <ApplyBtn label="APPLY TO WORK WITH US" inverted glow />
        <div className="scarcity">★ Only 5 client slots per month</div>
      </section>

      {/* FOOTER */}
      <div className="footer">
        <div className="footer-brand">CONNECTA CREATORS</div>
        <div>
          Questions? Email{" "}
          <a href="mailto:admin@connectacreators.com">admin@connectacreators.com</a>
        </div>
        <div className="footer-disclaimer">
          *results may vary · © {new Date().getFullYear()} Connecta Creators
        </div>
      </div>
    </>
  );
}
