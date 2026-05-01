import drCalvinAfter from "@/assets/dr-calvin-after.png";
import drCalvinTiktok from "@/assets/dr-calvin-tiktok.png";
import zigufitBefore from "@/assets/zigufit-before.png";
import zigufitAfter from "@/assets/zigufit-after.png";
import jonathanInstagram from "@/assets/jonathan-instagram.png";
import jonathanTiktok from "@/assets/jonathan-tiktok.png";
import robertoFounder from "@/assets/roberto-founder.png";

const CALENDLY = "https://calendly.com/robertogaunaj/demo-presentation";

function ApplyBtn({ inverted }: { inverted?: boolean }) {
  return (
    <a
      href={CALENDLY}
      target="_blank"
      rel="noreferrer"
      style={{
        display: "inline-block",
        background: inverted ? "#fff" : "#0891B2",
        color: inverted ? "#0891B2" : "#fff",
        fontFamily: "'Montserrat', sans-serif",
        fontWeight: 700,
        fontSize: 13,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        textDecoration: "none",
        padding: "17px 40px",
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
}: {
  children: React.ReactNode;
  bg?: string;
}) {
  return (
    <div style={{ background: bg }}>
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

function BeforeAfterCaption({ platform, before, after }: { platform: string; before: string; after: string }) {
  return (
    <div style={{ padding: "14px 16px" }}>
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

export default function About() {
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;700;900&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { background: #fff; font-family: 'Montserrat', sans-serif; }

        .about-hero {
          display: grid;
          grid-template-columns: 360px 1fr;
          gap: 56px;
          align-items: center;
          max-width: 980px;
          margin: 0 auto;
          text-align: left;
        }
        .about-hero-photo {
          width: 360px;
          height: 460px;
          object-fit: cover;
          border-radius: 4px;
          background: #f5f5f5;
        }

        .ba-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        .ba-card { background: #f5f5f5; overflow: hidden; border-radius: 4px; }
        .ba-img-portrait { width: 100%; height: 420px; object-fit: cover; object-position: top center; display: block; }

        .jonathan-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; max-width: 560px; margin: 32px auto 0; }
        .jonathan-card { background: #f5f5f5; overflow: hidden; border-radius: 4px; }
        .jonathan-card img { width: 100%; height: 320px; object-fit: cover; object-position: top center; display: block; }

        @media (max-width: 780px) {
          .about-hero { grid-template-columns: 1fr; gap: 28px; text-align: center; }
          .about-hero-photo { width: 240px; height: 320px; margin: 0 auto; }
        }
        @media (max-width: 480px) {
          .sec-inner { padding: 48px 16px !important; }
          .ba-grid { grid-template-columns: 1fr !important; gap: 12px; }
          .ba-grid img { height: auto !important; max-height: 480px; object-fit: cover !important; object-position: top center !important; }
          .jonathan-grid { grid-template-columns: 1fr !important; }
          .section-title { font-size: 20px !important; }
          .about-hero-photo { width: 200px; height: 260px; }
        }
      `}</style>

      {/* HERO */}
      <Sec>
        <div className="about-hero">
          <img src={robertoFounder} alt="Roberto Gauna" className="about-hero-photo" />
          <div>
            <div
              style={{
                fontFamily: "'Montserrat', sans-serif",
                fontWeight: 700,
                fontSize: 11,
                textTransform: "uppercase",
                letterSpacing: "0.18em",
                color: "#0891B2",
                marginBottom: 14,
              }}
            >
              FUNDADOR DE CONNECTA
            </div>
            <div
              style={{
                fontFamily: "'Montserrat', sans-serif",
                fontWeight: 900,
                fontSize: "clamp(36px, 6vw, 56px)",
                textTransform: "uppercase",
                letterSpacing: "-0.02em",
                lineHeight: 1.05,
                color: "#0a0a0a",
                marginBottom: 18,
              }}
            >
              ROBERTO GAUNA
            </div>
            <div
              style={{
                fontFamily: "'Montserrat', sans-serif",
                fontSize: 17,
                color: "#444",
                lineHeight: 1.6,
              }}
            >
              Construyo marcas personales en español para dueños de negocios de servicios en Estados Unidos.
            </div>
          </div>
        </div>
      </Sec>

      {/* INTERMOUNTAIN IMMIGRATION */}
      <Sec bg="#f5f5f5">
        <SectionTitle text="INTERMOUNTAIN IMMIGRATION" />

        <div
          style={{
            fontFamily: "'Montserrat', sans-serif",
            fontSize: 16,
            color: "#333",
            lineHeight: 1.7,
            maxWidth: 720,
            margin: "16px auto 36px",
          }}
        >
          Antes de Connecta, lideré la estrategia de contenido para Intermountain Immigration, la firma del Abogado Jonathan Shaw. Posicionamos la firma como una de las más reconocidas en redes sociales en español de Estados Unidos.
        </div>

        <div
          style={{
            fontFamily: "'Montserrat', sans-serif",
            fontWeight: 900,
            fontSize: "clamp(64px, 12vw, 120px)",
            color: "#0891B2",
            lineHeight: 1,
            letterSpacing: "-0.04em",
            marginBottom: 8,
          }}
        >
          650K
        </div>
        <div
          style={{
            fontFamily: "'Montserrat', sans-serif",
            fontWeight: 700,
            fontSize: 12,
            textTransform: "uppercase",
            letterSpacing: "0.12em",
            color: "#666",
          }}
        >
          SEGUIDORES TOTALES, INSTAGRAM + TIKTOK
        </div>

        <div className="jonathan-grid">
          <div className="jonathan-card">
            <img src={jonathanInstagram} alt="Jonathan Shaw Instagram" />
            <div
              style={{
                padding: "10px 14px",
                fontFamily: "'Montserrat', sans-serif",
                fontWeight: 700,
                fontSize: 11,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "#555",
                textAlign: "center",
              }}
            >
              INSTAGRAM
            </div>
          </div>
          <div className="jonathan-card">
            <img src={jonathanTiktok} alt="Jonathan Shaw TikTok" />
            <div
              style={{
                padding: "10px 14px",
                fontFamily: "'Montserrat', sans-serif",
                fontWeight: 700,
                fontSize: 11,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "#555",
                textAlign: "center",
              }}
            >
              TIKTOK
            </div>
          </div>
        </div>
      </Sec>

      {/* CONNECTA CASES */}
      <Sec>
        <SectionTitle text="LOS CASOS DE CONNECTA" />
        <div
          style={{
            fontFamily: "'Montserrat', sans-serif",
            fontSize: 16,
            color: "#333",
            lineHeight: 1.7,
            maxWidth: 720,
            margin: "16px auto 44px",
          }}
        >
          Después fundé Connecta. Estos son nuestros primeros casos completos como agencia.
        </div>

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

        {/* Zigufit */}
        <div>
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

          <div className="ba-grid" style={{ maxWidth: 560, margin: "0 auto" }}>
            <div className="ba-card">
              <img src={zigufitBefore} alt="ZiguFit antes" className="ba-img-portrait" />
              <div style={{ padding: "14px 16px" }}>
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
              <div style={{ padding: "14px 16px" }}>
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
      </Sec>

      {/* CTA FINAL */}
      <div style={{ background: "#0891B2" }}>
        <div
          style={{
            maxWidth: 1080,
            margin: "0 auto",
            padding: "88px 24px",
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontFamily: "'Montserrat', sans-serif",
              fontWeight: 900,
              fontSize: "clamp(26px, 5vw, 46px)",
              textTransform: "uppercase",
              color: "#fff",
              lineHeight: 1.08,
              letterSpacing: "-0.02em",
              maxWidth: 700,
              margin: "0 auto 16px",
            }}
          >
            ¿QUIERES ESTO PARA TU NEGOCIO?
          </div>
          <div
            style={{
              fontFamily: "'Montserrat', sans-serif",
              fontWeight: 500,
              fontSize: 15,
              color: "rgba(255,255,255,0.85)",
              marginBottom: 36,
            }}
          >
            Aplica abajo. Aceptamos un máximo de 5 nuevos clientes al mes.
          </div>
          <ApplyBtn inverted />
        </div>
      </div>

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
