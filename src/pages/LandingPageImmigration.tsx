import { useEffect } from "react";
import { Link } from "react-router-dom";

/* =============================================================================
   Immigration-attorney landing — "Atelier".
   Aesthetic: dark luxe glassmorphism. Frosted glass panels, aurora glows,
   backdrop-blur depth, elegant Playfair Display + Manrope, champagne-gold +
   soft-blue. Bilingual EN/ES. Guarantee: 30 qualified leads / month or no pay.
   Self-contained — scoped to .imm, fonts injected at runtime.
   ============================================================================= */

const FONT_LINK_ID = "imm-fonts";
const FONT_HREF =
  "https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500;1,600&family=Manrope:wght@400;500;600;700;800&display=swap";

const AREAS = [
  ["Asilo", "y refugio"],
  ["Residencia", "permanente"],
  ["Visas de trabajo", "y de inversión"],
  ["Ciudadanía", "y naturalización"],
  ["Defensa", "de deportación"],
  ["Familia", "peticiones familiares"],
];

const STEPS = [
  ["01", "Aprendemos tu voz", "Tu forma de explicar la ley", "En inglés claro y español natural. Entrenado contigo, nunca traducido."],
  ["02", "Guion, grabación y edición", "Producción completa", "Ganchos que viajan y textos que convierten, en ambos idiomas. Tú solo apareces."],
  ["03", "Publicamos y crecemos", "Cada día, cada plataforma", "Diario, bilingüe, en todas las plataformas — hasta que la próxima familia te encuentre primero."],
];

const FEATURES = [
  ["Bilingüe por defecto", "Inglés + Español", "Cada pieza grabada en inglés y en español — nativo, nunca traducido por máquina. Ninguna familia se queda fuera."],
  ["Hecho por completo para ti", "De principio a fin", "Guiones, grabación, edición y publicación — todo gestionado. Tú te quedas con tus clientes."],
  ["Seguimos la tendencia", "Siempre al día", "Vemos qué funciona en contenido de inmigración cada día y le ponemos tu sello antes de que explote."],
];

export default function LandingPageImmigration() {
  useEffect(() => {
    if (document.getElementById(FONT_LINK_ID)) return;
    const link = document.createElement("link");
    link.id = FONT_LINK_ID;
    link.rel = "stylesheet";
    link.href = FONT_HREF;
    document.head.appendChild(link);
  }, []);

  return (
    <div className="imm">
      <style>{CSS}</style>

      {/* aurora background */}
      <div className="imm-aura" aria-hidden />
      <div className="imm-grain" aria-hidden />

      {/* glass nav */}
      <nav className="imm-nav">
        <Link to="/" className="imm-brand" aria-label="Brand & Order">
          <span className="imm-brand-dot" aria-hidden />Brand <span className="imm-amp">&amp;</span> Order
        </Link>
        <div className="imm-nav-links">
          <a href="#promise">La garantía</a>
          <a href="#method">El método</a>
          <a href="#proof">Resultados</a>
        </div>
        <Link to="/1mguarantee" className="imm-btn imm-btn-gold imm-btn-sm">Trabaja con nosotros</Link>
      </nav>

      {/* ===== HERO ===== */}
      <header className="imm-hero">
        <p className="imm-eyebrow rise" style={{ animationDelay: ".05s" }}>Para abogados de inmigración</p>
        <h1 className="imm-h1 rise" style={{ animationDelay: ".13s" }}>
          Sé el nombre en que las familias <span className="imm-it">confían.</span>
        </h1>
        <p className="imm-es rise" style={{ animationDelay: ".22s" }}>Visible en dos idiomas. Imposible de ignorar.</p>
        <p className="imm-lede rise" style={{ animationDelay: ".30s" }}>
          Te convertimos en el abogado de inmigración que las familias encuentran — y recuerdan —
          primero. Guion, grabación, edición y publicación: lo hacemos todo por ti, en inglés y español.
        </p>
        <div className="imm-cta rise" style={{ animationDelay: ".38s" }}>
          <Link to="/1mguarantee" className="imm-btn imm-btn-gold imm-btn-lg">Trabaja con nosotros<span className="imm-arr">→</span></Link>
          <a href="#promise" className="imm-btn imm-btn-glass imm-btn-lg">Ver la garantía</a>
        </div>
        <div className="imm-guar-chip rise" style={{ animationDelay: ".48s" }}>
          <span className="imm-diamond" aria-hidden>◆</span>
          Al menos <b>30 prospectos calificados</b> al mes — o no pagas.
        </div>
      </header>

      {/* ===== THE PROMISE ===== */}
      <section className="imm-section" id="promise">
        <div className="imm-wrap">
          <div className="imm-promise glass">
            <div className="imm-promise-num">
              <span className="imm-30">30</span>
              <span className="imm-plus">+</span>
            </div>
            <div className="imm-promise-body">
              <p className="imm-eyebrow">La garantía</p>
              <h2 className="imm-h2">Prospectos calificados cada mes — <span className="imm-it">garantizado.</span></h2>
              <p className="imm-promise-text">
                Nos comprometemos a un mínimo de <b>30 prospectos de inmigración calificados al mes</b>.
                Si no los entregamos, <span className="imm-gold">no pagas.</span> Sin anticipos por nada,
                sin vistas de vanidad — familias reales, listas para hablar.
              </p>
              <p className="imm-promise-es">Resultados, no promesas.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ===== FEATURES (glass) ===== */}
      <section className="imm-section">
        <div className="imm-wrap">
          <div className="imm-head center">
            <p className="imm-eyebrow">Lo que incluye</p>
            <h2 className="imm-h2">Un estudio, un estratega y tu contenido — <span className="imm-it">resueltos.</span></h2>
          </div>
          <div className="imm-feat-grid">
            {FEATURES.map(([en, es, body]) => (
              <div className="imm-feat glass" key={en}>
                <div className="imm-feat-es">{es}</div>
                <h3 className="imm-feat-h">{en}</h3>
                <p className="imm-feat-p">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== PRACTICE AREAS ===== */}
      <section className="imm-section">
        <div className="imm-wrap">
          <div className="imm-head center">
            <p className="imm-eyebrow">Áreas de práctica</p>
            <h2 className="imm-h2">Contenido para cada caso que tomas.</h2>
          </div>
          <div className="imm-areas">
            {AREAS.map(([en, es]) => (
              <div className="imm-area glass" key={en}>
                <span className="imm-area-en">{en}</span>
                <span className="imm-area-es">{es}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== METHOD ===== */}
      <section className="imm-section" id="method">
        <div className="imm-wrap">
          <div className="imm-head">
            <p className="imm-eyebrow">El método</p>
            <h2 className="imm-h2">Tú ejerces. <span className="imm-it">Nosotros construimos el nombre.</span></h2>
          </div>
          <div className="imm-steps">
            {STEPS.map(([n, en, es, body]) => (
              <div className="imm-step glass" key={n}>
                <span className="imm-step-n">{n}</span>
                <h3 className="imm-step-en">{en}</h3>
                <span className="imm-step-es">{es}</span>
                <p className="imm-step-p">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== PROOF ===== */}
      <section className="imm-section" id="proof">
        <div className="imm-wrap">
          <div className="imm-head center">
            <p className="imm-eyebrow">El historial</p>
            <h2 className="imm-h2">El trabajo ya habla por sí solo.</h2>
          </div>
          <div className="imm-proof glass">
            <div className="imm-proof-stat">
              <span className="imm-proof-num">100M+</span>
              <span className="imm-proof-cap">vistas generadas</span>
            </div>
            <div className="imm-proof-div" />
            <div className="imm-proof-stat">
              <span className="imm-proof-num">100K+</span>
              <span className="imm-proof-cap">seguidores ganados</span>
            </div>
            <div className="imm-proof-div" />
            <div className="imm-proof-stat">
              <span className="imm-proof-num">650K</span>
              <span className="imm-proof-cap">cuenta del fundador</span>
            </div>
          </div>
          <p className="imm-proof-note">
            Antes de Brand &amp; Order, nuestro fundador hizo crecer su propia cuenta de inmigración{" "}
            <a href="https://www.tiktok.com/@elabogadojonathan" target="_blank" rel="noopener noreferrer" className="imm-link">@elabogadojonathan</a>{" "}
            a más de 650 mil — el mismo método ahora trabaja para los abogados con los que colaboramos.
          </p>
        </div>
      </section>

      {/* ===== TESTIMONIAL ===== */}
      <section className="imm-section">
        <div className="imm-wrap">
          <figure className="imm-quote glass">
            <blockquote>
              "Antes perseguíamos clientes. Ahora ellos nos <span className="imm-gold">encuentran primero</span> —
              en inglés <span className="imm-it">y</span> en español."
            </blockquote>
            <figcaption>
              <span className="imm-avatar" aria-hidden>H</span>
              <span>
                <b>Abg. Luis Herrera</b>
                <i>Abogado de Inmigración · Miami · ilustrativo</i>
              </span>
            </figcaption>
          </figure>
        </div>
      </section>

      {/* ===== FINAL CTA ===== */}
      <section className="imm-final">
        <div className="imm-wrap center">
          <h2 className="imm-final-h">Construyamos tu nombre.<br /><span className="imm-it">Tu nombre, en boca de todos.</span></h2>
          <Link to="/1mguarantee" className="imm-btn imm-btn-gold imm-btn-lg">Trabaja con nosotros<span className="imm-arr">→</span></Link>
          <p className="imm-final-sub">Al menos 30 prospectos calificados al mes, o no pagas.</p>
        </div>
      </section>

      <footer className="imm-foot">
        <span className="imm-brand"><span className="imm-brand-dot" aria-hidden />Brand <span className="imm-amp">&amp;</span> Order</span>
        <span>Contenido para abogados de inmigración · Español e Inglés · © 2026</span>
      </footer>
    </div>
  );
}

/* ============================ scoped styles ============================ */
const CSS = `
.imm {
  --bg:       #080B14;
  --text:     #F2EFE7;
  --text-2:   rgba(242,239,231,0.60);
  --text-3:   rgba(242,239,231,0.38);
  --gold:     #E6C78C;
  --gold-2:   #CDA763;
  --sky:      #A6CBE8;
  --glass:    rgba(255,255,255,0.045);
  --glass-2:  rgba(255,255,255,0.08);
  --gb:       rgba(255,255,255,0.11);
  --gb-2:     rgba(255,255,255,0.20);

  position: relative; min-height: 100vh; background: var(--bg); color: var(--text);
  font-family: 'Manrope', system-ui, sans-serif; line-height: 1.6; overflow-x: hidden;
  -webkit-font-smoothing: antialiased;
}
.imm * { box-sizing: border-box; }
.imm a { color: inherit; text-decoration: none; }
.imm .imm-wrap { max-width: 1120px; margin: 0 auto; padding: 0 30px; position: relative; z-index: 2; }
.imm .center { text-align: center; }

/* aurora + grain */
.imm .imm-aura {
  position: fixed; inset: 0; z-index: 0; pointer-events: none;
  background:
    radial-gradient(38% 34% at 16% 10%, rgba(230,199,140,0.20), transparent 72%),
    radial-gradient(42% 38% at 86% 16%, rgba(166,203,232,0.18), transparent 72%),
    radial-gradient(46% 42% at 74% 88%, rgba(182,168,232,0.13), transparent 72%),
    radial-gradient(40% 40% at 8% 84%, rgba(230,199,140,0.11), transparent 72%);
}
.imm .imm-grain {
  position: fixed; inset: 0; z-index: 1; pointer-events: none; opacity: 0.4; mix-blend-mode: overlay;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E");
}

/* glass primitive */
.imm .glass {
  background: var(--glass);
  -webkit-backdrop-filter: blur(24px) saturate(1.3);
  backdrop-filter: blur(24px) saturate(1.3);
  border: 1px solid var(--gb);
  box-shadow: 0 30px 70px -38px rgba(0,0,0,0.85), inset 0 1px 0 rgba(255,255,255,0.07);
}

@keyframes imm-rise { from { opacity: 0; transform: translateY(22px); } to { opacity: 1; transform: none; } }
.imm .rise { animation: imm-rise 0.9s cubic-bezier(0.2,0.8,0.2,1) backwards; }
@media (prefers-reduced-motion: reduce) { .imm .rise { animation: none; } }

.imm .imm-it { font-family: 'Playfair Display', Georgia, serif; font-style: italic; color: var(--gold); font-weight: 500; }
.imm .imm-gold { color: var(--gold); }
.imm .imm-eyebrow {
  font-size: 12px; font-weight: 600; letter-spacing: 0.26em; text-transform: uppercase;
  color: var(--gold-2); margin: 0 0 18px;
}

/* buttons */
.imm .imm-btn {
  display: inline-flex; align-items: center; gap: 9px; font-family: 'Manrope', sans-serif;
  font-weight: 600; font-size: 15px; padding: 13px 24px; border-radius: 100px; cursor: pointer;
  border: 1px solid transparent; transition: transform .16s ease, box-shadow .16s ease, background .16s ease;
}
.imm .imm-btn-sm { padding: 10px 19px; font-size: 14px; }
.imm .imm-btn-lg { padding: 16px 30px; font-size: 16px; }
.imm .imm-btn-gold { background: linear-gradient(135deg, var(--gold), var(--gold-2)); color: #20170A; box-shadow: 0 14px 38px -14px rgba(230,199,140,0.6); }
.imm .imm-btn-gold:hover { transform: translateY(-2px); box-shadow: 0 20px 46px -14px rgba(230,199,140,0.7); }
.imm .imm-btn-glass { background: var(--glass-2); color: var(--text); border-color: var(--gb-2); -webkit-backdrop-filter: blur(16px); backdrop-filter: blur(16px); }
.imm .imm-btn-glass:hover { transform: translateY(-2px); border-color: var(--gold-2); }
.imm .imm-arr { transition: transform .2s ease; }
.imm .imm-btn:hover .imm-arr { transform: translateX(4px); }

/* nav */
.imm .imm-nav {
  position: sticky; top: 16px; z-index: 50; max-width: 980px; width: calc(100% - 32px);
  margin: 16px auto 0; display: flex; align-items: center; justify-content: space-between; gap: 18px;
  padding: 10px 10px 10px 22px; border-radius: 100px;
  background: rgba(16,20,32,0.55); -webkit-backdrop-filter: blur(20px); backdrop-filter: blur(20px);
  border: 1px solid var(--gb); box-shadow: 0 18px 40px -24px rgba(0,0,0,0.8);
}
.imm .imm-brand { display: inline-flex; align-items: center; gap: 10px; font-family: 'Playfair Display', serif; font-weight: 600; font-size: 22px; letter-spacing: 0.01em; }
.imm .imm-brand-dot { width: 12px; height: 12px; border-radius: 50%; background: linear-gradient(135deg, var(--gold), var(--gold-2)); box-shadow: 0 0 14px rgba(230,199,140,0.6); }
.imm .imm-amp { font-style: italic; color: var(--gold); font-weight: 500; margin: 0 1px; }
.imm .imm-nav-links { display: flex; gap: 28px; font-size: 14.5px; font-weight: 500; color: var(--text-2); }
.imm .imm-nav-links a:hover { color: var(--text); }

/* hero */
.imm .imm-hero { position: relative; z-index: 2; max-width: 920px; margin: 0 auto; padding: 96px 30px 70px; text-align: center; }
.imm .imm-h1 { font-family: 'Playfair Display', Georgia, serif; font-weight: 500; font-size: clamp(46px, 8vw, 104px); line-height: 1.0; letter-spacing: -0.02em; margin: 0; }
.imm .imm-h1 .imm-it { font-size: 1.04em; }
.imm .imm-es { font-family: 'Playfair Display', serif; font-style: italic; font-size: clamp(18px, 2.4vw, 27px); color: var(--text-2); margin: 18px 0 0; }
.imm .imm-lede { max-width: 540px; margin: 24px auto 0; font-size: 17.5px; color: var(--text-2); }
.imm .imm-cta { display: flex; gap: 14px; justify-content: center; flex-wrap: wrap; margin-top: 36px; }
.imm .imm-guar-chip {
  display: inline-flex; align-items: center; gap: 10px; margin-top: 40px;
  padding: 11px 22px; border-radius: 100px; font-size: 14.5px; color: var(--text);
  background: var(--glass); -webkit-backdrop-filter: blur(18px); backdrop-filter: blur(18px);
  border: 1px solid var(--gb-2); box-shadow: inset 0 1px 0 rgba(255,255,255,0.08);
}
.imm .imm-guar-chip b { color: var(--gold); font-weight: 700; }
.imm .imm-diamond { color: var(--gold); font-size: 11px; }

/* sections */
.imm .imm-section { position: relative; z-index: 2; padding: 80px 0; }
.imm .imm-head { max-width: 720px; margin-bottom: 46px; }
.imm .imm-head.center { margin-left: auto; margin-right: auto; }
.imm .imm-h2 { font-family: 'Playfair Display', Georgia, serif; font-weight: 500; font-size: clamp(30px, 4.4vw, 52px); line-height: 1.08; letter-spacing: -0.015em; margin: 0; }

/* promise */
.imm .imm-promise { display: grid; grid-template-columns: auto 1fr; gap: 44px; align-items: center; border-radius: 30px; padding: 52px 54px; }
.imm .imm-promise-num { display: flex; align-items: flex-start; line-height: 0.8; }
.imm .imm-30 { font-family: 'Playfair Display', serif; font-weight: 600; font-size: clamp(120px, 17vw, 220px); letter-spacing: -0.04em; background: linear-gradient(160deg, #F4DDA8, var(--gold-2)); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; }
.imm .imm-plus { font-family: 'Playfair Display', serif; font-size: clamp(40px, 6vw, 72px); color: var(--gold-2); margin-top: 0.18em; }
.imm .imm-promise-text { font-size: 17px; color: var(--text-2); margin: 16px 0 0; max-width: 460px; }
.imm .imm-promise-text b { color: var(--text); font-weight: 700; }
.imm .imm-promise-es { font-family: 'Playfair Display', serif; font-style: italic; color: var(--text-3); margin: 14px 0 0; font-size: 16px; }

/* features */
.imm .imm-feat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
.imm .imm-feat { border-radius: 24px; padding: 32px 30px; transition: transform .2s ease, border-color .2s ease; }
.imm .imm-feat:hover { transform: translateY(-5px); border-color: var(--gb-2); }
.imm .imm-feat-es { font-family: 'Playfair Display', serif; font-style: italic; color: var(--gold-2); font-size: 14px; margin-bottom: 14px; }
.imm .imm-feat-h { font-family: 'Playfair Display', serif; font-weight: 500; font-size: 25px; margin: 0 0 12px; letter-spacing: -0.01em; }
.imm .imm-feat-p { font-size: 14.5px; color: var(--text-2); margin: 0; }

/* areas */
.imm .imm-areas { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
.imm .imm-area { border-radius: 18px; padding: 24px 26px; display: flex; flex-direction: column; gap: 3px; transition: transform .18s ease, border-color .18s ease; }
.imm .imm-area:hover { transform: translateY(-4px); border-color: var(--gb-2); }
.imm .imm-area-en { font-family: 'Playfair Display', serif; font-weight: 500; font-size: 22px; letter-spacing: -0.01em; }
.imm .imm-area-es { font-style: italic; font-family: 'Playfair Display', serif; color: var(--gold-2); font-size: 15px; }

/* method */
.imm .imm-steps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
.imm .imm-step { border-radius: 24px; padding: 32px 30px; }
.imm .imm-step-n { font-family: 'Playfair Display', serif; font-style: italic; font-weight: 600; font-size: 50px; line-height: 1; background: linear-gradient(160deg, #F4DDA8, var(--gold-2)); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; }
.imm .imm-step-en { font-family: 'Playfair Display', serif; font-weight: 500; font-size: 24px; margin: 18px 0 2px; letter-spacing: -0.01em; }
.imm .imm-step-es { display: block; font-style: italic; font-family: 'Playfair Display', serif; color: var(--sky); font-size: 14.5px; margin-bottom: 12px; }
.imm .imm-step-p { font-size: 14.5px; color: var(--text-2); margin: 0; }

/* proof */
.imm .imm-proof { display: flex; align-items: center; justify-content: center; gap: 18px; flex-wrap: wrap; border-radius: 26px; padding: 46px 30px; }
.imm .imm-proof-stat { text-align: center; padding: 0 26px; }
.imm .imm-proof-num { display: block; font-family: 'Playfair Display', serif; font-weight: 600; font-size: clamp(48px, 7vw, 78px); line-height: 1; letter-spacing: -0.02em; background: linear-gradient(160deg, #FBF0D6, var(--gold)); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; }
.imm .imm-proof-cap { font-size: 13px; color: var(--text-2); letter-spacing: 0.04em; margin-top: 8px; display: block; }
.imm .imm-proof-div { width: 1px; height: 60px; background: var(--gb); }
.imm .imm-proof-note { text-align: center; max-width: 600px; margin: 28px auto 0; color: var(--text-2); font-size: 15px; }
.imm .imm-link { color: var(--gold); border-bottom: 1px solid rgba(230,199,140,0.4); }

/* testimonial */
.imm .imm-quote { max-width: 880px; margin: 0 auto; border-radius: 28px; padding: 52px 54px; text-align: center; }
.imm .imm-quote blockquote { font-family: 'Playfair Display', serif; font-weight: 500; font-size: clamp(25px, 3.4vw, 40px); line-height: 1.28; letter-spacing: -0.01em; margin: 0 0 28px; }
.imm .imm-quote figcaption { display: inline-flex; align-items: center; gap: 14px; }
.imm .imm-avatar { width: 52px; height: 52px; border-radius: 50%; background: linear-gradient(135deg, var(--gold), var(--gold-2)); color: #20170A; display: grid; place-items: center; font-family: 'Playfair Display', serif; font-style: italic; font-weight: 600; font-size: 23px; }
.imm .imm-quote figcaption b { display: block; font-family: 'Playfair Display', serif; font-weight: 600; font-size: 17px; text-align: left; }
.imm .imm-quote figcaption i { display: block; font-style: normal; font-size: 13px; color: var(--text-3); text-align: left; }

/* final */
.imm .imm-final { position: relative; z-index: 2; padding: 110px 0; text-align: center; }
.imm .imm-final-h { font-family: 'Playfair Display', serif; font-weight: 500; font-size: clamp(40px, 6.6vw, 88px); line-height: 1.02; letter-spacing: -0.02em; margin: 0 0 34px; }
.imm .imm-final-sub { margin-top: 18px; font-size: 14px; color: var(--text-3); letter-spacing: 0.02em; }

/* footer */
.imm .imm-foot { position: relative; z-index: 2; display: flex; justify-content: space-between; flex-wrap: wrap; gap: 14px; align-items: center; max-width: 1120px; margin: 0 auto; padding: 30px 30px 46px; border-top: 1px solid var(--gb); font-size: 13.5px; color: var(--text-2); }
.imm .imm-foot .imm-brand { font-size: 18px; }

/* responsive */
@media (max-width: 880px) {
  .imm .imm-nav-links { display: none; }
  .imm .imm-promise { grid-template-columns: 1fr; gap: 18px; text-align: center; padding: 40px 30px; }
  .imm .imm-promise-num { justify-content: center; }
  .imm .imm-promise-text { margin-left: auto; margin-right: auto; }
  .imm .imm-feat-grid, .imm .imm-areas, .imm .imm-steps { grid-template-columns: 1fr; }
  .imm .imm-proof-div { display: none; }
  .imm .imm-section { padding: 56px 0; }
}
`;
