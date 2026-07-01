import { useEffect } from "react";
import { Link } from "react-router-dom";
import jossReels from "@/assets/abogado-joss-reels.png";
import jossComments from "@/assets/abogado-joss-comments.png";
import jossDm from "@/assets/abogado-joss-dm.png";

/* =============================================================================
   Immigration-attorney landing (Spanish) — "Connecta · Abogados".
   Aesthetic: dark-luxe glassmorphism. Frosted glass panels, aurora glows,
   champagne-gold + soft-steel accents, Playfair Display + Manrope. Spanish
   throughout. Centerpiece is the organic-acquisition funnel: Atracción ·
   Nutrición · Conversión, illustrated with real Abogado Joss screenshots.
   CTAs open the same Calendly discovery-call embed as /doctors.
   Self-contained — scoped to .abg, fonts injected at runtime.
   ============================================================================= */

const CALENDLY_URL = "https://calendly.com/rob_gauna/advisory_call?primary_color=ffbb35";
const CALENDLY_SCRIPT_ID = "calendly-widget-script";

const FONT_LINK_ID = "abg-fonts";
const FONT_HREF =
  "https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500;1,600&family=Manrope:wght@400;500;600;700;800&display=swap";

const AREAS = [
  ["Asilo", "y refugio"],
  ["Residencia", "permanente"],
  ["Visas de trabajo", "y de inversión"],
  ["Ciudadanía", "y naturalización"],
  ["Defensa", "de deportación"],
  ["Peticiones", "familiares"],
];

const INCLUDES = [
  ["Contenido bilingüe", "Español + Inglés", "Cada reel grabado y editado en español natural — y en inglés cuando lo necesitas. Hablándole directo al inmigrante, nunca traducido por máquina."],
  ["Hecho por completo para ti", "De principio a fin", "Estrategia, guiones, grabación, edición y publicación diaria. Tú solo apareces frente a la cámara; nosotros corremos el estudio."],
  ["IA que califica y agenda", "Tu secretaria digital", "Cuando comentan la palabra clave, una secuencia automatizada por IA conversa, califica el caso y agenda la cita con tu firma — 24/7."],
];

const FAQ: [string, string][] = [
  ["¿Qué hace Connecta exactamente?", "Construimos el sistema de contenido que te convierte en el abogado de inmigración que las familias encuentran primero: estrategia, guiones, grabación, edición, publicación y la automatización que califica y agenda los casos. Hecho por ti. Tú apareces; nosotros corremos el estudio."],
  ["¿Por qué orgánico y no pauta?", "Los inmigrantes buscan respuestas y siguen a quien se las da. Cuando tu contenido educa sobre asilo, greencard, TPS y las noticias que les importan, te ganas su confianza antes de que necesiten un abogado. Eso baja tu costo de adquisición a casi cero — sin depender de anuncios."],
  ["¿Tengo que salir en cámara?", "Sí — así las familias aprenden a confiar en ti antes de llamarte. Pero no todo el tiempo: grabamos de forma eficiente, un mes de contenido en una sola sesión corta."],
  ["¿Cómo funciona la palabra clave \"ASILO\"?", "En cada post invitamos a la gente a comentar una palabra como \"ASILO\". Eso dispara una secuencia automatizada por IA que les escribe por mensaje, entiende su situación, califica el caso y agenda una cita con tu firma — sin que tu equipo levante el teléfono."],
  ["¿En cuánto tiempo veo resultados?", "El contenido orgánico compone con el tiempo. Las primeras conversaciones calificadas suelen empezar en las primeras semanas y crecen mes a mes a medida que tu audiencia crece."],
  ["¿Qué los hace diferentes?", "Nada de plantillas. Construimos un solo sistema alrededor de tu firma, en tu voz, y lo respaldamos con una meta clara: 10 casos de inmigración nuevos cada 60 días, de forma 100% orgánica."],
  ["¿Cómo empezamos?", "Agenda una llamada de descubrimiento. Trabajamos con un grupo selecto de firmas a la vez y vemos si somos el equipo correcto para ti."],
];

export default function LandingPageAbogados() {
  const openBooking = () =>
    document.getElementById("book")?.scrollIntoView({ behavior: "smooth", block: "start" });

  useEffect(() => {
    if (document.getElementById(FONT_LINK_ID)) return;
    const link = document.createElement("link");
    link.id = FONT_LINK_ID;
    link.rel = "stylesheet";
    link.href = FONT_HREF;
    document.head.appendChild(link);
  }, []);

  // Load Calendly's inline-widget script and mount the booking calendar.
  useEffect(() => {
    const initWidget = () => {
      const Calendly = (window as unknown as { Calendly?: { initInlineWidget: (o: { url: string; parentElement: Element }) => void } }).Calendly;
      const el = document.getElementById("calendly-embed");
      if (Calendly && el && !el.querySelector("iframe")) {
        Calendly.initInlineWidget({ url: CALENDLY_URL, parentElement: el });
      }
    };
    const existing = document.getElementById(CALENDLY_SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      initWidget();
      return;
    }
    const script = document.createElement("script");
    script.id = CALENDLY_SCRIPT_ID;
    script.src = "https://assets.calendly.com/assets/external/widget.js";
    script.async = true;
    script.onload = initWidget;
    document.body.appendChild(script);
  }, []);

  return (
    <div className="abg">
      <style>{CSS}</style>

      {/* aurora background */}
      <div className="abg-aura" aria-hidden />

      {/* glass nav */}
      <nav className="abg-nav">
        <Link to="/" className="abg-brand" aria-label="Connecta">
          <span className="abg-brand-dot" aria-hidden />
          Connecta
        </Link>
        <div className="abg-nav-links">
          <a href="#metodo">Cómo funciona</a>
          <a href="#sistema">El sistema</a>
          <a href="#resultados">Resultados</a>
          <a href="#faq">Preguntas</a>
        </div>
        <button onClick={openBooking} className="abg-btn abg-btn-gold abg-btn-sm">Agenda una llamada</button>
      </nav>

      {/* ===== HERO ===== */}
      <header className="abg-hero">
        <span className="abg-tag rise" style={{ animationDelay: ".04s" }}>
          <span className="abg-tag-dot" /> Para abogados de inmigración
        </span>
        <h1 className="abg-h1 rise" style={{ animationDelay: ".12s" }}>
          Ayudamos a abogados a conseguir <span className="abg-it">10 casos de inmigración nuevos</span> cada <span className="abg-it">60 días</span> con el Sistema de Adquisición Orgánico.
        </h1>
        <p className="abg-lede rise" style={{ animationDelay: ".30s" }}>
          Sin pauta y sin perseguir clientes. Convertimos tu Instagram en el lugar donde los
          inmigrantes que buscan asilo, greencard o TPS te encuentran, confían en ti y agendan
          su cita — guion, grabación, edición y automatización, hecho por ti.
        </p>
        <div className="abg-cta rise" style={{ animationDelay: ".38s" }}>
          <button onClick={openBooking} className="abg-btn abg-btn-gold abg-btn-lg">
            Agenda una llamada <span className="abg-arr">→</span>
          </button>
          <a href="#metodo" className="abg-btn abg-btn-glass abg-btn-lg">Ver cómo funciona</a>
        </div>
      </header>

      {/* ===== CÓMO FUNCIONA — the funnel ===== */}
      <section className="abg-section" id="metodo">
        <div className="abg-wrap">
          <div className="abg-head center">
            <span className="abg-eyebrow">Cómo funciona</span>
            <h2 className="abg-h2">Tres pasos. <span className="abg-it">Un sistema orgánico.</span></h2>
            <p className="abg-head-p">
              Atraer, nutrir y convertir a los inmigrantes que ya están buscando un abogado —
              todo desde tu contenido, sin gastar un dólar en anuncios.
            </p>
          </div>

          {/* 01 Atracción */}
          <div className="abg-step">
            <div className="abg-step-body glass">
              <span className="abg-step-n">01</span>
              <h3 className="abg-step-h">Atracción</h3>
              <p className="abg-step-p">
                Atraes clientes de forma orgánica con reels que le hablan directo a los inmigrantes:
                noticias de inmigración, las nuevas preguntas en la entrevista de asilo, qué hacer con
                tu caso de greencard o TPS. Das valor real y te vuelves la voz a la que vuelven cada día.
              </p>
              <div className="abg-chips">
                <span className="abg-chip">Asilo</span>
                <span className="abg-chip">Greencard</span>
                <span className="abg-chip">TPS</span>
                <span className="abg-chip">Noticias de inmigración</span>
              </div>
            </div>
            <figure className="abg-shot">
              <img src={jossReels} alt="Reels de El Abogado Joss hablándole a inmigrantes sobre las nuevas preguntas en la entrevista de asilo" loading="lazy" />
              <figcaption>Contenido que le habla directo al inmigrante.</figcaption>
            </figure>
          </div>

          {/* 02 Nutrición */}
          <div className="abg-step abg-step-reverse">
            <div className="abg-step-body glass">
              <span className="abg-step-n">02</span>
              <h3 className="abg-step-h">Nutrición</h3>
              <p className="abg-step-p">
                Les das información de qué pueden hacer con su caso y qué alternativas tienen. Les
                envías recursos gratis para que confíen en ti y te sigan. Así, cuando piensen en
                contratar a un abogado, serás tú a quien quieran contratar.
              </p>
              <ul className="abg-list">
                <li><span className="abg-list-mark">✓</span>Guías y recursos gratuitos sobre cada tipo de caso</li>
                <li><span className="abg-list-mark">✓</span>Respuestas a las dudas reales de tu comunidad</li>
                <li><span className="abg-list-mark">✓</span>Presencia diaria que construye confianza y autoridad</li>
              </ul>
            </div>
            <div className="abg-nurture glass" aria-hidden>
              <span className="abg-nurture-quote">“Recursos gratis hoy.<br />Tu abogado de confianza mañana.”</span>
            </div>
          </div>

          {/* 03 Conversión */}
          <div className="abg-step">
            <div className="abg-step-body glass">
              <span className="abg-step-n">03</span>
              <h3 className="abg-step-h">Conversión</h3>
              <p className="abg-step-p">
                En tus posts invitas a comentar la palabra <b className="abg-gold">“ASILO”</b>. Eso dispara
                una secuencia de mensajes automatizada por IA que conversa con la persona, califica su
                caso y después agenda una cita con tu firma — sin que tu equipo levante el teléfono.
              </p>
              <div className="abg-flow">
                <span className="abg-flow-step">Comenta “ASILO”</span>
                <span className="abg-flow-arr">→</span>
                <span className="abg-flow-step">IA califica</span>
                <span className="abg-flow-arr">→</span>
                <span className="abg-flow-step">Cita agendada</span>
              </div>
            </div>
            <div className="abg-shot-stack">
              <figure className="abg-shot">
                <img src={jossComments} alt="Decenas de personas comentando la palabra Asilo en un reel de El Abogado Joss" loading="lazy" />
                <figcaption>La llamada a la acción: comentar “Asilo”.</figcaption>
              </figure>
              <figure className="abg-shot">
                <img src={jossDm} alt="Secuencia de IA conversando por mensaje directo, calificando un caso de asilo y dónde se sigue la corte" loading="lazy" />
                <figcaption>La IA califica el caso y agenda la cita.</figcaption>
              </figure>
            </div>
          </div>

          <div className="abg-center-cta">
            <button onClick={openBooking} className="abg-btn abg-btn-gold abg-btn-lg">
              Agenda una llamada <span className="abg-arr">→</span>
            </button>
          </div>
        </div>
      </section>

      {/* ===== EL SISTEMA — what's included ===== */}
      <section className="abg-section abg-section-tint" id="sistema">
        <div className="abg-wrap">
          <div className="abg-head center">
            <span className="abg-eyebrow">El sistema</span>
            <h2 className="abg-h2">Un estudio, un estratega y tu contenido — <span className="abg-it">resueltos.</span></h2>
          </div>
          <div className="abg-feat-grid">
            {INCLUDES.map(([title, kick, body]) => (
              <div className="abg-feat glass" key={title}>
                <span className="abg-feat-kick">{kick}</span>
                <h3 className="abg-feat-h">{title}</h3>
                <p className="abg-feat-p">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== ÁREAS ===== */}
      <section className="abg-section">
        <div className="abg-wrap">
          <div className="abg-head center">
            <span className="abg-eyebrow">Para tu práctica</span>
            <h2 className="abg-h2">Hecho para tu tipo de caso.</h2>
          </div>
          <div className="abg-areas">
            {AREAS.map(([a, b]) => (
              <div className="abg-area glass" key={a}>
                <span className="abg-area-a">{a}</span>
                <span className="abg-area-b">{b}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== RESULTADOS ===== */}
      <section className="abg-section abg-section-tint" id="resultados">
        <div className="abg-wrap">
          <div className="abg-proof glass">
            <span className="abg-eyebrow">Resultados</span>
            <h2 className="abg-h2">Esto no es teoría — <span className="abg-it">ya está pasando.</span></h2>
            <p className="abg-proof-p">
              Las imágenes de arriba son reales: el contenido que atrae, decenas de inmigrantes
              comentando “Asilo” en un solo reel, y una conversación entrando por mensaje directo
              donde la IA ya está calificando un caso — preguntando en qué estado vive la persona y
              dónde se sigue su corte. Ese es el sistema completo, funcionando.
            </p>
            <div className="abg-proof-stats">
              <div><b>100%</b><span>orgánico · sin pauta</span></div>
              <div className="abg-proof-sep" />
              <div><b>24/7</b><span>IA califica y agenda</span></div>
              <div className="abg-proof-sep" />
              <div><b>ES / EN</b><span>contenido bilingüe</span></div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== FAQ ===== */}
      <section className="abg-section" id="faq">
        <div className="abg-wrap abg-wrap-narrow">
          <div className="abg-head center">
            <span className="abg-eyebrow">Antes de agendar</span>
            <h2 className="abg-h2">Preguntas frecuentes.</h2>
          </div>
          <div className="abg-faq">
            {FAQ.map(([q, a]) => (
              <details className="abg-faq-item" key={q}>
                <summary className="abg-faq-q">{q}<span className="abg-faq-plus" aria-hidden>+</span></summary>
                <p className="abg-faq-a">{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ===== ROI GUARANTEE ===== */}
      <section className="abg-guarantee">
        <div className="abg-wrap center">
          <p className="abg-guarantee-txt">100% ROI guarantee. We only win when you win.</p>
        </div>
      </section>

      {/* ===== FINAL CTA — Calendly booking ===== */}
      <section className="abg-final" id="book">
        <div className="abg-glow-final" aria-hidden />
        <div className="abg-wrap center">
          <span className="abg-eyebrow">¿Listo para llenar tu agenda?</span>
          <h2 className="abg-final-h">Agenda tu <span className="abg-it">llamada de descubrimiento.</span></h2>
          <p className="abg-final-sub">
            Elige un horario abajo. Trabajamos con un grupo selecto de firmas a la vez — con gusto
            conocemos tu práctica y vemos si somos el equipo correcto para ti.
          </p>
          <div id="calendly-embed" className="abg-calendly" />
          <p className="abg-final-fine">10 casos de inmigración nuevos cada 60 días, de forma 100% orgánica.</p>
        </div>
      </section>

      <footer className="abg-foot">
        <span className="abg-brand"><span className="abg-brand-dot" aria-hidden />Connecta</span>
        <span>Marketing orgánico para abogados de inmigración · Español &amp; Inglés · © 2026</span>
      </footer>
    </div>
  );
}

/* ============================ scoped styles ============================ */
const CSS = `
.abg {
  --bg:      #0B0A10;
  --bg-2:    #100E16;
  --glass:   rgba(255,255,255,0.045);
  --glass-2: rgba(255,255,255,0.07);
  --ink:     #F4F0E8;
  --ink-2:   rgba(244,240,232,0.64);
  --ink-3:   rgba(244,240,232,0.40);
  --gold:    #E6C780;
  --gold-2:  #C9A85C;
  --gold-soft: rgba(230,199,128,0.12);
  --steel:   #9FB6D6;
  --line:    rgba(244,240,232,0.10);

  position: relative; background: var(--bg); color: var(--ink);
  font-family: 'Manrope', system-ui, sans-serif; line-height: 1.6;
  overflow-x: hidden; -webkit-font-smoothing: antialiased;
}
.abg * { box-sizing: border-box; }
.abg a { color: inherit; text-decoration: none; }
.abg em { font-style: normal; }
.abg .abg-wrap { position: relative; z-index: 1; max-width: 1140px; margin: 0 auto; padding: 0 28px; }
.abg .abg-wrap-narrow { max-width: 820px; }
.abg .abg-wrap.center, .abg .center { text-align: center; }
.abg .abg-it { color: var(--gold); }
.abg .abg-gold { color: var(--gold); }

@keyframes abg-rise { from { opacity: 0; transform: translateY(22px); } to { opacity: 1; transform: none; } }
.abg .rise { animation: abg-rise 0.85s cubic-bezier(0.2,0.8,0.2,1) backwards; }
@media (prefers-reduced-motion: reduce) { .abg .rise { animation: none; } }

/* aurora background */
.abg .abg-aura {
  position: fixed; inset: 0; z-index: 0; pointer-events: none;
  background:
    radial-gradient(46% 38% at 18% 8%, rgba(230,199,128,0.16), transparent 70%),
    radial-gradient(42% 40% at 84% 22%, rgba(159,182,214,0.12), transparent 72%),
    radial-gradient(50% 44% at 50% 100%, rgba(230,199,128,0.08), transparent 72%);
  filter: blur(8px);
}

/* glass helper */
.abg .glass {
  background: var(--glass); border: 1px solid var(--line);
  backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
  box-shadow: 0 20px 50px -34px rgba(0,0,0,0.8);
}

/* nav */
.abg .abg-nav {
  position: sticky; top: 16px; z-index: 50;
  max-width: 1000px; width: calc(100% - 32px); margin: 16px auto 0;
  display: flex; align-items: center; justify-content: space-between; gap: 18px;
  background: rgba(16,14,22,0.66); backdrop-filter: blur(18px); -webkit-backdrop-filter: blur(18px);
  border: 1px solid var(--line); border-radius: 100px; padding: 9px 9px 9px 22px;
  box-shadow: 0 10px 34px -18px rgba(0,0,0,0.85);
}
.abg .abg-brand { display: inline-flex; align-items: center; gap: 9px; font-family: 'Playfair Display', serif; font-weight: 700; font-size: 20px; letter-spacing: -0.01em; }
.abg .abg-brand-dot { width: 11px; height: 11px; border-radius: 50%; background: var(--gold); box-shadow: 0 0 0 3px var(--gold-soft); }
.abg .abg-nav-links { display: flex; gap: 24px; font-size: 14.5px; font-weight: 500; color: var(--ink-2); }
.abg .abg-nav-links a:hover { color: var(--ink); }

/* buttons */
.abg .abg-btn {
  display: inline-flex; align-items: center; gap: 8px;
  font-family: 'Manrope', sans-serif; font-weight: 700; font-size: 15px;
  padding: 13px 22px; border-radius: 100px; cursor: pointer; border: 1.5px solid transparent;
  transition: transform .15s ease, box-shadow .15s ease, background .15s ease, border-color .15s ease;
}
.abg .abg-btn-sm { padding: 10px 18px; font-size: 14px; }
.abg .abg-btn-lg { padding: 16px 28px; font-size: 16px; }
.abg .abg-btn-gold { background: linear-gradient(160deg, var(--gold) 0%, var(--gold-2) 100%); color: #2A2008; box-shadow: 0 12px 30px -12px rgba(230,199,128,0.5); }
.abg .abg-btn-gold:hover { transform: translateY(-2px); box-shadow: 0 18px 38px -12px rgba(230,199,128,0.6); }
.abg .abg-btn-glass { background: var(--glass); color: var(--ink); border-color: var(--line); backdrop-filter: blur(10px); }
.abg .abg-btn-glass:hover { border-color: var(--gold); color: var(--gold); transform: translateY(-2px); }
.abg .abg-arr { transition: transform .2s ease; }
.abg .abg-btn:hover .abg-arr { transform: translateX(4px); }

/* hero */
.abg .abg-hero { position: relative; z-index: 1; max-width: 960px; margin: 0 auto; padding: 60px 28px 72px; text-align: center; }
.abg .abg-tag {
  display: inline-flex; align-items: center; gap: 8px;
  font-size: 13px; font-weight: 600; color: var(--ink-2);
  background: var(--glass); border: 1px solid var(--line); border-radius: 100px; padding: 7px 15px; margin-bottom: 26px;
  backdrop-filter: blur(10px);
}
.abg .abg-tag-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--gold); box-shadow: 0 0 0 4px var(--gold-soft); animation: abg-pulse 2.4s ease-in-out infinite; }
@keyframes abg-pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.4 } }
.abg .abg-h1 {
  font-family: 'Playfair Display', serif; font-weight: 700;
  font-size: clamp(38px, 5.6vw, 72px); line-height: 1.04; letter-spacing: -0.02em; margin: 0;
}
.abg .abg-es { font-family: 'Playfair Display', serif; font-weight: 500; font-size: clamp(18px, 2.3vw, 26px); color: var(--ink-2); margin: 18px 0 0; }
.abg .abg-es em { color: var(--gold); }
.abg .abg-lede { max-width: 600px; margin: 22px auto 0; font-size: 17.5px; color: var(--ink-2); line-height: 1.62; }
.abg .abg-cta { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; margin-top: 34px; }
.abg .abg-guar-chip {
  display: inline-flex; align-items: center; gap: 10px; margin-top: 40px;
  font-size: 14px; font-weight: 600; color: var(--ink);
  background: var(--glass); border: 1px solid var(--gold-soft); border-radius: 100px; padding: 11px 22px;
  backdrop-filter: blur(10px);
}
.abg .abg-diamond { color: var(--gold); font-size: 12px; }

/* sections */
.abg .abg-section { position: relative; z-index: 1; padding: 92px 0; }
.abg .abg-section-tint { background: var(--bg-2); }
.abg .abg-head { max-width: 720px; margin-bottom: 52px; }
.abg .abg-head.center { margin-left: auto; margin-right: auto; }
.abg .abg-eyebrow { display: inline-block; font-size: 12px; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; color: var(--gold); margin-bottom: 16px; }
.abg .abg-h2 { font-family: 'Playfair Display', serif; font-weight: 700; font-size: clamp(30px, 4.4vw, 52px); line-height: 1.08; letter-spacing: -0.02em; margin: 0; }
.abg .abg-head-p { margin: 18px 0 0; font-size: 16.5px; color: var(--ink-2); line-height: 1.62; }
.abg .abg-head.center .abg-head-p { margin-left: auto; margin-right: auto; max-width: 620px; }
.abg .abg-center-cta { text-align: center; margin-top: 52px; }

/* steps (funnel) */
.abg .abg-step { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; align-items: center; margin-bottom: 26px; }
.abg .abg-step-reverse .abg-step-body { order: 2; }
.abg .abg-step-body { border-radius: 26px; padding: 40px; }
.abg .abg-step-n { font-family: 'Playfair Display', serif; font-weight: 700; font-size: 18px; color: #2A2008; background: linear-gradient(160deg, var(--gold), var(--gold-2)); width: 46px; height: 46px; border-radius: 14px; display: grid; place-items: center; }
.abg .abg-step-h { font-family: 'Playfair Display', serif; font-weight: 700; font-size: clamp(26px, 3.2vw, 36px); letter-spacing: -0.01em; margin: 20px 0 14px; }
.abg .abg-step-p { font-size: 16px; color: var(--ink-2); line-height: 1.68; margin: 0; }
.abg .abg-chips { display: flex; flex-wrap: wrap; gap: 9px; margin-top: 22px; }
.abg .abg-chip { font-size: 13px; font-weight: 600; color: var(--gold); background: var(--gold-soft); border: 1px solid var(--gold-soft); border-radius: 100px; padding: 7px 15px; }
.abg .abg-list { list-style: none; margin: 22px 0 0; padding: 0; display: flex; flex-direction: column; gap: 13px; }
.abg .abg-list li { display: flex; align-items: flex-start; gap: 11px; font-size: 15px; color: var(--ink-2); line-height: 1.5; }
.abg .abg-list-mark { flex-shrink: 0; width: 21px; height: 21px; border-radius: 50%; display: grid; place-items: center; font-size: 12px; font-weight: 800; background: var(--gold); color: #2A2008; margin-top: 1px; }
.abg .abg-flow { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-top: 24px; }
.abg .abg-flow-step { font-size: 13.5px; font-weight: 700; color: var(--ink); background: var(--glass-2); border: 1px solid var(--line); border-radius: 100px; padding: 9px 16px; }
.abg .abg-flow-arr { color: var(--gold); font-weight: 700; }

/* media frames */
.abg .abg-shot { margin: 0; border-radius: 20px; overflow: hidden; border: 1px solid var(--line); background: rgba(0,0,0,0.35); box-shadow: 0 30px 60px -36px rgba(0,0,0,0.9); }
.abg .abg-shot img { display: block; width: 100%; height: auto; }
.abg .abg-shot figcaption { padding: 12px 18px; font-size: 13px; color: var(--ink-3); text-align: center; border-top: 1px solid var(--line); }
.abg .abg-shot-stack { display: flex; flex-direction: column; gap: 16px; }
.abg .abg-nurture { border-radius: 26px; padding: 48px 40px; display: grid; place-items: center; min-height: 260px; text-align: center; }
.abg .abg-nurture-quote { font-family: 'Playfair Display', serif; font-weight: 500; font-size: clamp(22px, 3vw, 30px); line-height: 1.3; color: var(--ink); }

/* includes / features */
.abg .abg-feat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; }
.abg .abg-feat { border-radius: 24px; padding: 34px 30px; transition: transform .18s ease, border-color .18s ease; }
.abg .abg-feat:hover { transform: translateY(-4px); border-color: var(--gold-soft); }
.abg .abg-feat-kick { font-size: 12.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: var(--gold); }
.abg .abg-feat-h { font-family: 'Playfair Display', serif; font-weight: 600; font-size: 24px; letter-spacing: -0.01em; margin: 12px 0 12px; }
.abg .abg-feat-p { font-size: 14.5px; color: var(--ink-2); line-height: 1.62; margin: 0; }

/* areas */
.abg .abg-areas { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
.abg .abg-area { border-radius: 18px; padding: 24px 26px; display: flex; flex-direction: column; gap: 3px; transition: border-color .16s ease, transform .16s ease; }
.abg .abg-area:hover { border-color: var(--gold); transform: translateY(-3px); }
.abg .abg-area-a { font-family: 'Playfair Display', serif; font-weight: 600; font-size: 21px; letter-spacing: -0.01em; }
.abg .abg-area-b { font-size: 13.5px; color: var(--gold); font-weight: 500; }

/* proof */
.abg .abg-proof { border-radius: 30px; padding: 56px; text-align: center; }
.abg .abg-proof-p { max-width: 700px; margin: 18px auto 0; font-size: 16.5px; color: var(--ink-2); line-height: 1.7; }
.abg .abg-proof-stats { display: inline-flex; align-items: center; gap: 30px; flex-wrap: wrap; justify-content: center; margin-top: 40px; }
.abg .abg-proof-stats > div:not(.abg-proof-sep) { display: flex; flex-direction: column; align-items: center; }
.abg .abg-proof-stats b { font-family: 'Playfair Display', serif; font-weight: 700; font-size: 38px; letter-spacing: -0.01em; color: var(--gold); }
.abg .abg-proof-stats span { font-size: 12.5px; color: var(--ink-2); margin-top: 4px; }
.abg .abg-proof-sep { width: 1px; height: 40px; background: var(--line); }

/* faq */
.abg .abg-faq { display: flex; flex-direction: column; gap: 12px; }
.abg .abg-faq-item { background: var(--glass); border: 1px solid var(--line); border-radius: 16px; padding: 4px 22px; backdrop-filter: blur(10px); transition: border-color .16s ease; }
.abg .abg-faq-item[open] { border-color: var(--gold-soft); }
.abg .abg-faq-q { display: flex; align-items: center; justify-content: space-between; gap: 14px; cursor: pointer; list-style: none; padding: 18px 0; font-family: 'Playfair Display', serif; font-weight: 600; font-size: 18px; letter-spacing: -0.01em; }
.abg .abg-faq-q::-webkit-details-marker { display: none; }
.abg .abg-faq-plus { flex-shrink: 0; color: var(--gold); font-size: 22px; font-weight: 400; transition: transform .2s ease; }
.abg .abg-faq-item[open] .abg-faq-plus { transform: rotate(45deg); }
.abg .abg-faq-a { margin: 0 0 18px; font-size: 15px; color: var(--ink-2); line-height: 1.68; }

/* final */
.abg .abg-final { position: relative; z-index: 1; padding: 110px 0; text-align: center; overflow: hidden; }
.abg .abg-glow-final { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 820px; height: 540px; pointer-events: none; background: radial-gradient(closest-side, rgba(230,199,128,0.16), transparent 70%); filter: blur(40px); }
.abg .abg-final > .abg-wrap { position: relative; z-index: 1; }
.abg .abg-final-h { font-family: 'Playfair Display', serif; font-weight: 700; font-size: clamp(34px, 5.4vw, 70px); line-height: 1.04; letter-spacing: -0.02em; margin: 8px 0 22px; }
.abg .abg-final-sub { max-width: 580px; margin: 0 auto 32px; font-size: 17px; color: var(--ink-2); line-height: 1.62; }
.abg .abg-final-fine { margin-top: 18px; font-size: 13.5px; color: var(--ink-3); }
.abg .abg-calendly { width: 100%; max-width: 1040px; min-width: 320px; height: 700px; margin: 8px auto 0; border-radius: 16px; overflow: hidden; background: #fff; }

/* roi guarantee band */
.abg .abg-guarantee { position: relative; z-index: 1; padding: 72px 0; background: linear-gradient(135deg, var(--gold), var(--gold-2)); }
.abg .abg-guarantee-txt { max-width: 920px; margin: 0 auto; color: #2A2008; font-family: 'Playfair Display', serif; font-weight: 700; font-size: clamp(26px, 4vw, 44px); line-height: 1.2; letter-spacing: -0.01em; }

/* footer */
.abg .abg-foot { position: relative; z-index: 1; display: flex; justify-content: space-between; flex-wrap: wrap; gap: 14px; align-items: center; max-width: 1140px; margin: 0 auto; padding: 30px 28px 44px; border-top: 1px solid var(--line); font-size: 13.5px; color: var(--ink-2); }
.abg .abg-foot .abg-brand { font-size: 18px; }

/* responsive */
@media (max-width: 920px) {
  .abg .abg-nav-links { display: none; }
  .abg .abg-step { grid-template-columns: 1fr; }
  .abg .abg-step-reverse .abg-step-body { order: 0; }
  .abg .abg-feat-grid { grid-template-columns: 1fr; }
  .abg .abg-areas { grid-template-columns: 1fr 1fr; }
  .abg .abg-section { padding: 64px 0; }
}
@media (max-width: 540px) {
  .abg .abg-hero { padding: 44px 20px 56px; }
  .abg .abg-h1 { font-size: 34px; }
  .abg .abg-step-body { padding: 28px; }
  .abg .abg-proof { padding: 36px 24px; }
  .abg .abg-proof-stats { gap: 18px; }
  .abg .abg-proof-sep { display: none; }
  .abg .abg-areas { grid-template-columns: 1fr; }
  .abg .abg-wrap { padding: 0 20px; }
}
`;
