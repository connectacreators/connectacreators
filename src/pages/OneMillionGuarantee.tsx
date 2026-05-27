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
} from "lucide-react";

const CALVIN_FB = "https://www.facebook.com/drcalvinsclinics";
const ZIGUFIT_TIKTOK = "https://www.tiktok.com/@zigufit";

function ApplyBtn({ small, inverted }: { small?: boolean; inverted?: boolean }) {
  return (
    <a
      href="#apply"
      onClick={(e) => {
        e.preventDefault();
        document.getElementById("apply")?.scrollIntoView({ behavior: "smooth" });
      }}
      style={{
        display: "inline-block",
        background: inverted ? "#fff" : "#8FD0D5",
        color: inverted ? "#8FD0D5" : "#fff",
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
      APPLY TO WORK WITH US
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
    title: "PERSONAL BRAND",
    body: "20 scripts/month, professional shoot day, editing and posting on Instagram and TikTok.",
  },
  {
    icon: Target,
    title: "TARGETED ADS",
    body: "Meta Ads in English and Spanish, bilingual audience targeting, weekly optimization.",
  },
  {
    icon: MessageCircle,
    title: "CONVERSION",
    body: "ManyChat replies in under 5 min, qualifies leads and books appointments by DM.",
  },
  {
    icon: BarChart3,
    title: "REPORTS",
    body: "Monthly dashboard: leads, cost per lead, conversion to appointment and growth.",
  },
];

const INDUSTRIES = [
  { icon: HeartPulse, name: "Chiropractors" },
  { icon: Smile, name: "Dentists" },
  { icon: Sparkles, name: "Med Spas" },
  { icon: Stethoscope, name: "Doctors / Clinics" },
  { icon: Scale, name: "Immigration Attorneys" },
  { icon: Dumbbell, name: "Fitness / Wellness" },
];

const NOT_FOR = [
  "Businesses with no available local Hispanic market",
  "Owners who don't want to appear on camera",
  "People looking only for editing or ads without the full system",
  "Anyone expecting results without filming content",
  "Businesses outside the niches listed above",
];

const PROCESS = [
  { n: "01", title: "APPLY", body: "Fill out the application with your business info. We review your profile." },
  { n: "02", title: "QUALIFY", body: "30-min call. We explain exactly what the system would look like in your business." },
  { n: "03", title: "INSTALL", body: "2 to 3 weeks: research, scripts, first shoot day, ads and ManyChat setup." },
  { n: "04", title: "OPERATE", body: "Every month: 20 scripts, filming, editing, posting, ads and results report." },
];

export default function OneMillionGuarantee() {
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;700;900&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { background: #fff; font-family: 'Montserrat', sans-serif; }

        .ba-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; align-items: start; }
        .ba-card { background: #fff; overflow: hidden; border-radius: 8px; border: 1px solid #ececec; transition: transform 0.2s, box-shadow 0.2s; }
        a.ba-card:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0,0,0,0.08); }
        .ba-img-portrait { width: 100%; height: auto; max-height: 520px; object-fit: contain; display: block; background: #fff; }
        .ba-img-landscape { width: 100%; height: auto; display: block; background: #fff; }
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
          background: #8FD0D5;
          border-radius: 6px;
          padding: 28px 22px;
          text-align: center;
        }
        .agency-stat-num {
          font-family: 'Montserrat', sans-serif;
          font-weight: 900;
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

        .work-link-label {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          margin-top: 12px;
          font-family: 'Montserrat', sans-serif;
          font-weight: 700;
          font-size: 11px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: #8FD0D5;
          text-decoration: none;
          border-bottom: 2px solid #8FD0D5;
          padding-bottom: 2px;
        }

        @media (max-width: 780px) {
          .grid-4 { grid-template-columns: 1fr 1fr; gap: 12px; }
          .grid-3 { grid-template-columns: 1fr 1fr; gap: 12px; }
          .roberto-row { grid-template-columns: 1fr; gap: 20px; text-align: center; }
          .roberto-photo-wrap { width: 200px; height: 240px; margin: 0 auto; }
        }
        @media (max-width: 480px) {
          .sec-inner { padding: 48px 16px !important; }
          .hero-inner { padding: 56px 16px !important; }
          .ba-grid { grid-template-columns: 1fr !important; gap: 12px; }
          .ba-grid img { height: auto !important; max-height: 520px; object-fit: contain !important; }
          .ba-card-square { aspect-ratio: auto !important; padding: 8px !important; }
          .agency-stats { grid-template-columns: 1fr !important; gap: 12px; }
          .grid-4 { grid-template-columns: 1fr; gap: 10px; }
          .grid-3 { grid-template-columns: 1fr 1fr; gap: 10px; }
          .grid-2 { grid-template-columns: 1fr; gap: 10px; }
          .hero-headline { font-size: 26px !important; letter-spacing: -0.01em !important; }
          .hero-sub { font-size: 14px !important; margin-bottom: 28px !important; }
          .section-title { font-size: 20px !important; }
          .sys-card { padding: 22px 16px !important; text-align: center !important; }
          .step-card { padding: 22px 16px !important; text-align: center !important; }
          .industry-card { padding: 20px 12px !important; }
          .ba-img-portrait { max-height: 520px !important; }
          .ba-caption { text-align: center !important; }
          .not-for-list { text-align: center !important; }
          .not-for-item { justify-content: center !important; text-align: left; }
          .roberto-row, .roberto-row p, .roberto-row div { text-align: center !important; }
        }
      `}</style>

      {/* ① HERO */}
      <div style={{ background: "#8FD0D5" }}>
        <div
          className="hero-inner"
          style={{
            maxWidth: 1080,
            margin: "0 auto",
            padding: "96px 24px",
            textAlign: "center",
          }}
        >
          <div
            style={{
              display: "inline-block",
              background: "rgba(255,255,255,0.18)",
              border: "1px solid rgba(255,255,255,0.35)",
              color: "#fff",
              fontFamily: "'Montserrat', sans-serif",
              fontWeight: 700,
              fontSize: 11,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              padding: "8px 14px",
              borderRadius: 999,
              marginBottom: 24,
            }}
          >
            For Utah Bilingual Business Owners
          </div>

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
              maxWidth: 880,
              margin: "0 auto 20px",
            }}
          >
            1 MILLION VIEWS — OR YOU DON'T PAY.
          </div>

          <div
            className="hero-sub"
            style={{
              fontFamily: "'Montserrat', sans-serif",
              fontWeight: 500,
              fontSize: 17,
              color: "rgba(255,255,255,0.92)",
              lineHeight: 1.55,
              maxWidth: 680,
              margin: "0 auto 36px",
            }}
          >
            We script, film, edit, and post your social media in English <strong>and</strong> Spanish — and guarantee at least 1M views, or you don't pay.
          </div>
          <ApplyBtn inverted />
        </div>
      </div>

      {/* ② LEAD FORM */}
      <LeadFormEN />

      {/* ③ THE PROBLEM */}
      <Sec>
        <SectionTitle text="UTAH IS BILINGUAL. YOUR COMPETITION ONLY SPEAKS ONE LANGUAGE." />

        <div
          style={{
            fontFamily: "'Montserrat', sans-serif",
            fontWeight: 900,
            fontSize: "clamp(72px, 14vw, 160px)",
            color: "#8FD0D5",
            lineHeight: 1,
            letterSpacing: "-0.04em",
            margin: "32px 0 12px",
          }}
        >
          1 in 5
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
          UTAHNS SPEAK SPANISH AT HOME
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
          Your competition only reaches half the market. You can reach all of it — in both languages — through your personal brand.
        </div>
      </Sec>

      {/* ④ THE SOLUTION, THE SYSTEM */}
      <Sec bg="#f5f5f5">
        <SectionTitle text="A COMPLETE DONE-FOR-YOU SYSTEM" />
        <SectionSub text="4 components. You show up on camera, we run everything else." />

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
                    background: "#8FD0D5",
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

      {/* ⑤ CASE STUDIES */}
      <Sec>
        <SectionTitle text="REAL RESULTS FROM REAL CLIENTS" />
        <SectionSub text="See our work — tap a case to view their live account" />

        {/* Calvin */}
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
            DR. CALVIN — CHIROPRACTOR
          </div>

          <div className="ba-grid ba-grid-square" style={{ marginBottom: 20, maxWidth: 560, margin: "0 auto 20px" }}>
            <a
              href={CALVIN_FB}
              target="_blank"
              rel="noopener noreferrer"
              className="ba-card ba-card-square"
              style={{ cursor: "pointer", textDecoration: "none" }}
              aria-label="View Dr. Calvin's Facebook"
            >
              <img src={drCalvinAfter} alt="Dr. Calvin Facebook" />
            </a>
            <a
              href={CALVIN_FB}
              target="_blank"
              rel="noopener noreferrer"
              className="ba-card ba-card-square"
              style={{ cursor: "pointer", textDecoration: "none" }}
              aria-label="View Dr. Calvin's TikTok"
            >
              <img src={drCalvinTiktok} alt="Dr. Calvin TikTok" />
            </a>
          </div>

          <div className="agency-stats">
            <div className="agency-stat">
              <div className="agency-stat-num">100K+</div>
              <div className="agency-stat-label">FOLLOWERS GENERATED</div>
            </div>
            <div className="agency-stat">
              <div className="agency-stat-num">$50K+</div>
              <div className="agency-stat-label">REVENUE GENERATED</div>
            </div>
          </div>

          <a
            href={CALVIN_FB}
            target="_blank"
            rel="noopener noreferrer"
            className="work-link-label"
          >
            See Dr. Calvin on Facebook →
          </a>
        </div>

        {/* Zigufit */}
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
            ZIGUFIT — FITNESS
          </div>

          <div className="ba-grid" style={{ marginBottom: 0, maxWidth: 560, margin: "0 auto" }}>
            <a
              href={ZIGUFIT_TIKTOK}
              target="_blank"
              rel="noopener noreferrer"
              className="ba-card"
              style={{ textDecoration: "none" }}
              aria-label="View Zigufit's TikTok (Before)"
            >
              <img src={zigufitBefore} alt="Zigufit before" className="ba-img-portrait" />
              <div className="ba-caption">
                <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "#999", marginBottom: 4 }}>
                  BEFORE
                </div>
                <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 900, fontSize: 24, color: "#0a0a0a" }}>
                  500 followers
                </div>
              </div>
            </a>
            <a
              href={ZIGUFIT_TIKTOK}
              target="_blank"
              rel="noopener noreferrer"
              className="ba-card"
              style={{ textDecoration: "none" }}
              aria-label="View Zigufit's TikTok (After)"
            >
              <img src={zigufitAfter} alt="Zigufit after" className="ba-img-portrait" />
              <div className="ba-caption">
                <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "#8FD0D5", marginBottom: 4 }}>
                  AFTER
                </div>
                <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 900, fontSize: 24, color: "#8FD0D5" }}>
                  17.6K followers
                </div>
              </div>
            </a>
          </div>

          <a
            href={ZIGUFIT_TIKTOK}
            target="_blank"
            rel="noopener noreferrer"
            className="work-link-label"
          >
            See Zigufit on TikTok →
          </a>
        </div>

        <ApplyBtn />
      </Sec>

      {/* ⑥ WHO IT'S FOR */}
      <Sec bg="#f5f5f5">
        <SectionTitle text="WHO IT'S BUILT FOR" />
        <SectionSub text="Service businesses with a Utah Hispanic + English market to reach" />

        <div className="grid-3" style={{ marginBottom: 36, maxWidth: 880, margin: "0 auto 36px" }}>
          {INDUSTRIES.map((i) => {
            const Icon = i.icon;
            return (
              <div className="industry-card" key={i.name}>
                <Icon size={32} color="#8FD0D5" strokeWidth={2} />
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
          You're the owner. You speak both languages (or have someone who does). You're ready to show up on camera.
        </div>
      </Sec>

      {/* ⑦ WHO IT'S NOT FOR */}
      <Sec>
        <SectionTitle text="WHO IT'S NOT FOR" />
        <SectionSub text="If you see yourself in this list, this isn't for you" />

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

      {/* ⑧ HOW WE WORK */}
      <Sec bg="#f5f5f5">
        <SectionTitle text="HOW WE WORK" />
        <SectionSub text="A 4-step process to launch the system in your business" />

        <div className="grid-4" style={{ marginBottom: 52 }}>
          {PROCESS.map((s) => (
            <div className="step-card" key={s.n}>
              <div
                style={{
                  fontFamily: "'Montserrat', sans-serif",
                  fontWeight: 900,
                  fontSize: 36,
                  color: "#8FD0D5",
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

      {/* ⑨ ABOUT ROBERTO */}
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
                fontWeight: 900,
                fontSize: 18,
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                color: "#0a0a0a",
                marginBottom: 12,
              }}
            >
              ROBERTO GAUNA, FOUNDER
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
              Roberto led content strategy for Intermountain Immigration — attorney Jonathan Shaw's firm — scaling the account past 650K followers across Instagram and TikTok. Today he applies that same system at Connecta Creators for clients like Dr. Calvin and Zigufit, helping Utah's bilingual business owners build personal brands that bring in real revenue.
            </div>
            <a
              href="/about"
              style={{
                fontFamily: "'Montserrat', sans-serif",
                fontWeight: 700,
                fontSize: 12,
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                color: "#8FD0D5",
                textDecoration: "none",
                borderBottom: "2px solid #8FD0D5",
                paddingBottom: 2,
              }}
            >
              MORE ABOUT ROBERTO →
            </a>
          </div>
        </div>
      </Sec>

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
          CONTACT US
        </div>
        <div
          style={{
            fontFamily: "'Montserrat', sans-serif",
            fontSize: 13,
            color: "#555",
            marginBottom: 12,
          }}
        >
          Questions? Email us at:{" "}
          <a
            href="mailto:admin@connectacreators.com"
            style={{ color: "#8FD0D5", fontWeight: 700 }}
          >
            admin@connectacreators.com
          </a>
        </div>
        <div
          style={{
            fontFamily: "'Montserrat', sans-serif",
            fontSize: 11,
            color: "#888",
          }}
        >
          *results may vary*
        </div>
      </div>
    </>
  );
}
