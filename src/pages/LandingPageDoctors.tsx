import { useEffect } from "react";
import { Link } from "react-router-dom";
import drCalvinPortrait from "@/assets/dr-calvin-portrait.jpg";

/* =============================================================================
   Doctors landing — modern edition.
   Aesthetic: bright, contemporary, confident. Off-white canvas, vivid cobalt +
   warm coral accents, oversized Bricolage Grotesque display, bento grid,
   soft gradient glow, big rounded cards. English throughout.
   Self-contained — scoped to .imx, fonts injected at runtime.
   ============================================================================= */

const FONT_LINK_ID = "imx-fonts";
const FONT_HREF =
  "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,500;12..96,600;12..96,700;12..96,800&family=Instrument+Sans:ital,wght@0,400;0,500;0,600;1,400;1,500&display=swap";

const AREAS = [
  "Family Medicine",
  "Dermatology",
  "Cardiology",
  "Pediatrics",
  "Aesthetics",
  "Wellness",
];

const STEPS = [
  ["01", "We learn your voice", "How you explain medicine, in plain language. Trained on you, not a template."],
  ["02", "We script, film & edit", "Hooks that travel, captions that convert. You show up; we run the studio."],
  ["03", "We post & grow", "Daily, on every platform — so the next patient finds you before they call anyone else."],
];

export default function LandingPageDoctors() {
  useEffect(() => {
    if (document.getElementById(FONT_LINK_ID)) return;
    const link = document.createElement("link");
    link.id = FONT_LINK_ID;
    link.rel = "stylesheet";
    link.href = FONT_HREF;
    document.head.appendChild(link);
  }, []);

  return (
    <div className="imx">
      <style>{CSS}</style>

      {/* floating pill nav */}
      <nav className="imx-nav">
        <Link to="/" className="imx-brand" aria-label="Connecta">
          <span className="imx-brand-dot" aria-hidden />
          Connecta
        </Link>
        <div className="imx-nav-links">
          <a href="#what">What we do</a>
          <a href="#method">The method</a>
          <a href="#proof">Results</a>
        </div>
        <Link to="/1mguarantee" className="imx-btn imx-btn-dark imx-btn-sm">Work with us</Link>
      </nav>

      {/* ===== HERO ===== */}
      <header className="imx-hero">
        <div className="imx-glow" aria-hidden />
        <span className="imx-tag rise" style={{ animationDelay: ".04s" }}>
          <span className="imx-tag-dot" /> For doctors and clinicians
        </span>
        <h1 className="imx-h1 rise" style={{ animationDelay: ".12s" }}>
          The doctor patients<br />
          trust <span className="imx-grad">before they call.</span>
        </h1>
        <p className="imx-lede rise" style={{ animationDelay: ".30s" }}>
          We build your personal brand — <em>scripted, filmed, edited, and posted for you.</em>{" "}
          You practice medicine; we make sure the right patients find you first.
        </p>
        <div className="imx-cta rise" style={{ animationDelay: ".38s" }}>
          <Link to="/1mguarantee" className="imx-btn imx-btn-cobalt imx-btn-lg">
            Work with us <span className="imx-arr">→</span>
          </Link>
          <a href="#what" className="imx-btn imx-btn-line imx-btn-lg">See how it works</a>
        </div>
        <div className="imx-stats rise" style={{ animationDelay: ".48s" }}>
          <div><b>93K</b><span>followers grown</span></div>
          <div className="imx-stat-sep" />
          <div><b>30–50</b><span>new leads / month</span></div>
          <div className="imx-stat-sep" />
          <div><b>$15K</b><span>extra revenue / month</span></div>
        </div>
      </header>

      {/* ===== BENTO — what we do ===== */}
      <section className="imx-section" id="what">
        <div className="imx-wrap">
          <div className="imx-head">
            <span className="imx-eyebrow">What we do</span>
            <h2 className="imx-h2">Everything handled — <span className="imx-cobalt-tx">done for you.</span></h2>
          </div>

          <div className="imx-bento">
            <div className="imx-card imx-b-wide imx-card-cobalt">
              <span className="imx-card-kick">The Connecta edge</span>
              <h3 className="imx-card-h">Your expertise, turned into content patients can't scroll past.</h3>
              <p className="imx-card-p">
                We learn how you explain medicine, then build a feed around it — scripted, filmed,
                and edited to your voice. The result: a steady stream of new patients who already
                trust you before they walk in.
              </p>
            </div>

            <div className="imx-card">
              <span className="imx-emoji" aria-hidden>✍️</span>
              <h3 className="imx-card-h sm">Patient-first scripts</h3>
              <p className="imx-card-p">Complex medicine, explained simply — a hook in the first 3 seconds.</p>
            </div>

            <div className="imx-card">
              <span className="imx-emoji" aria-hidden>🎬</span>
              <h3 className="imx-card-h sm">Filmed &amp; edited</h3>
              <p className="imx-card-p">A full studio team, without hiring one. You just show up.</p>
            </div>

            <div className="imx-card">
              <span className="imx-emoji" aria-hidden>📈</span>
              <h3 className="imx-card-h sm">Posted &amp; grown</h3>
              <p className="imx-card-p">Daily, every platform, tracked — done for you.</p>
            </div>

            <div className="imx-card imx-b-wide imx-card-dark">
              <span className="imx-card-kick light">The guarantee</span>
              <h3 className="imx-card-h light">90 leads in 90 days — <span className="imx-coral-tx">or you don't pay.</span></h3>
              <p className="imx-card-p light">We watch what's winning in medical content every day and put your spin on it before the trend peaks.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ===== PRACTICE AREAS ===== */}
      <section className="imx-section imx-section-tint">
        <div className="imx-wrap">
          <div className="imx-head center">
            <span className="imx-eyebrow">For your specialty</span>
            <h2 className="imx-h2">Made for your specialty.</h2>
          </div>
          <div className="imx-areas">
            {AREAS.map((en) => (
              <div className="imx-area" key={en}>
                <span className="imx-area-en">{en}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== METHOD ===== */}
      <section className="imx-section" id="method">
        <div className="imx-wrap">
          <div className="imx-head">
            <span className="imx-eyebrow">The method</span>
            <h2 className="imx-h2">You practice medicine. <span className="imx-cobalt-tx">We run your feed.</span></h2>
          </div>
          <div className="imx-steps">
            {STEPS.map(([n, en, body]) => (
              <div className="imx-step" key={n}>
                <span className="imx-step-n">{n}</span>
                <h3 className="imx-step-en">{en}</h3>
                <p className="imx-step-p">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== PROOF (cobalt block) ===== */}
      <section className="imx-proof" id="proof">
        <div className="imx-wrap">
          <span className="imx-eyebrow light">The record · Dr. Calvin</span>
          <h2 className="imx-proof-h">The numbers are already in.</h2>
          <div className="imx-proof-grid">
            <div className="imx-proof-stat"><b>93K</b><span>followers grown</span></div>
            <div className="imx-proof-stat"><b>30–50</b><span>new leads / month</span></div>
            <div className="imx-proof-stat"><b>$15K</b><span>extra revenue / month</span></div>
          </div>
          <p className="imx-proof-note">
            Dr. Calvin grew to{" "}
            <a href="https://www.facebook.com/drcalvinsclinics/reels/" target="_blank" rel="noopener noreferrer">93K followers and 50M+ views</a>{" "}
            with Connecta — turning his feed into 30–50 new patient leads and about $15K in extra
            revenue every month. The same playbook now runs for the doctors we work with.
          </p>
        </div>
      </section>

      {/* ===== TESTIMONIAL ===== */}
      <section className="imx-section">
        <div className="imx-wrap">
          <div className="imx-quote-card">
            <p className="imx-quote">
              "I had 7K followers for 16 years… now <span className="imx-cobalt-tx">93K</span> — with
              30–50 new leads and about <span className="imx-cobalt-tx">$15K extra every month.</span>
              Thank you guys."
            </p>
            <div className="imx-quote-by">
              <img className="imx-avatar" src={drCalvinPortrait} alt="Dr. Calvin" />
              <div>
                <div className="imx-by-name">Dr. Calvin</div>
                <div className="imx-by-role">
                  Chiropractor · 93K followers · 50M+ views with Connecta ·{" "}
                  <a href="https://www.facebook.com/drcalvinsclinics/reels/" target="_blank" rel="noopener noreferrer" className="imx-by-link">see his work →</a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== FINAL CTA ===== */}
      <section className="imx-final">
        <div className="imx-wrap center">
          <h2 className="imx-final-h">Let's build <span className="imx-grad">your name.</span></h2>
          <Link to="/1mguarantee" className="imx-btn imx-btn-cobalt imx-btn-lg">
            Work with us <span className="imx-arr">→</span>
          </Link>
          <p className="imx-final-sub">90 leads in 90 days, or you don't pay.</p>
        </div>
      </section>

      <footer className="imx-foot">
        <span className="imx-brand"><span className="imx-brand-dot" aria-hidden />Connecta</span>
        <span>Content for doctors &amp; clinics · © 2026</span>
      </footer>
    </div>
  );
}

/* ============================ scoped styles ============================ */
const CSS = `
.imx {
  --bg:      #F4F3EE;
  --bg-2:    #ECEAE2;
  --surface: #FFFFFF;
  --ink:     #141413;
  --ink-2:   rgba(20,20,19,0.58);
  --ink-3:   rgba(20,20,19,0.38);
  --cobalt:  #2742E6;
  --cobalt-2:#1B31C4;
  --cobalt-soft: rgba(39,66,230,0.09);
  --coral:   #FF5A3F;
  --line:    rgba(20,20,19,0.10);

  position: relative; background: var(--bg); color: var(--ink);
  font-family: 'Instrument Sans', system-ui, sans-serif; line-height: 1.55;
  overflow-x: hidden; -webkit-font-smoothing: antialiased;
}
.imx * { box-sizing: border-box; }
.imx a { color: inherit; text-decoration: none; }
.imx em { font-style: italic; }
.imx .imx-wrap { max-width: 1140px; margin: 0 auto; padding: 0 28px; }
.imx .imx-wrap.center, .imx .center { text-align: center; }

@keyframes imx-rise { from { opacity: 0; transform: translateY(22px); } to { opacity: 1; transform: none; } }
.imx .rise { animation: imx-rise 0.8s cubic-bezier(0.2,0.8,0.2,1) backwards; }
@media (prefers-reduced-motion: reduce) { .imx .rise { animation: none; } }

/* display helpers */
.imx .imx-cobalt-tx { color: var(--cobalt); }
.imx .imx-coral-tx { color: var(--coral); }
.imx .imx-grad {
  background: linear-gradient(96deg, var(--cobalt) 0%, var(--coral) 120%);
  -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent;
}

/* nav */
.imx .imx-nav {
  position: sticky; top: 16px; z-index: 50;
  max-width: 940px; width: calc(100% - 32px); margin: 16px auto 0;
  display: flex; align-items: center; justify-content: space-between; gap: 18px;
  background: rgba(255,255,255,0.72); backdrop-filter: blur(16px);
  border: 1px solid var(--line); border-radius: 100px; padding: 9px 9px 9px 22px;
  box-shadow: 0 8px 30px -16px rgba(20,20,19,0.25);
}
.imx .imx-brand { display: inline-flex; align-items: center; gap: 9px; font-family: 'Bricolage Grotesque', sans-serif; font-weight: 700; font-size: 19px; letter-spacing: -0.02em; }
.imx .imx-brand-dot { width: 13px; height: 13px; border-radius: 50%; background: var(--cobalt); box-shadow: 0 0 0 3px var(--cobalt-soft); }
.imx .imx-nav-links { display: flex; gap: 26px; font-size: 14.5px; font-weight: 500; color: var(--ink-2); }
.imx .imx-nav-links a:hover { color: var(--ink); }

/* buttons */
.imx .imx-btn {
  display: inline-flex; align-items: center; gap: 8px;
  font-family: 'Instrument Sans', sans-serif; font-weight: 600; font-size: 15px;
  padding: 13px 22px; border-radius: 100px; cursor: pointer; border: 1.5px solid transparent;
  transition: transform .15s ease, box-shadow .15s ease, background .15s ease;
}
.imx .imx-btn-sm { padding: 10px 18px; font-size: 14px; }
.imx .imx-btn-lg { padding: 16px 28px; font-size: 16px; }
.imx .imx-btn-cobalt { background: var(--cobalt); color: #fff; box-shadow: 0 10px 26px -10px rgba(39,66,230,0.65); }
.imx .imx-btn-cobalt:hover { transform: translateY(-2px); box-shadow: 0 16px 34px -10px rgba(39,66,230,0.7); }
.imx .imx-btn-dark { background: var(--ink); color: #fff; }
.imx .imx-btn-dark:hover { transform: translateY(-2px); }
.imx .imx-btn-line { background: transparent; color: var(--ink); border-color: var(--line); }
.imx .imx-btn-line:hover { border-color: var(--ink); transform: translateY(-2px); }
.imx .imx-arr { transition: transform .2s ease; }
.imx .imx-btn:hover .imx-arr { transform: translateX(4px); }

/* hero */
.imx .imx-hero { position: relative; max-width: 940px; margin: 0 auto; padding: 52px 28px 64px; text-align: center; }
.imx .imx-glow {
  position: absolute; top: -60px; left: 50%; transform: translateX(-50%);
  width: 760px; height: 520px; pointer-events: none; z-index: 0;
  background:
    radial-gradient(closest-side, rgba(39,66,230,0.20), transparent 70%),
    radial-gradient(closest-side, rgba(255,90,63,0.16), transparent 70%);
  background-position: 30% 30%, 75% 60%; background-repeat: no-repeat;
  background-size: 60% 80%, 55% 70%; filter: blur(36px);
}
.imx .imx-hero > *:not(.imx-glow) { position: relative; z-index: 1; }
.imx .imx-tag {
  display: inline-flex; align-items: center; gap: 8px;
  font-size: 13px; font-weight: 600; color: var(--ink-2);
  background: var(--surface); border: 1px solid var(--line); border-radius: 100px; padding: 7px 15px; margin-bottom: 26px;
}
.imx .imx-tag-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--coral); }
.imx .imx-h1 {
  font-family: 'Bricolage Grotesque', sans-serif; font-weight: 700;
  font-size: clamp(46px, 7.6vw, 96px); line-height: 0.98; letter-spacing: -0.035em; margin: 0;
}
.imx .imx-es { font-family: 'Bricolage Grotesque', sans-serif; font-weight: 500; font-size: clamp(18px, 2.3vw, 26px); color: var(--ink-2); margin: 18px 0 0; }
.imx .imx-es em { color: var(--coral); font-style: italic; }
.imx .imx-lede { max-width: 560px; margin: 22px auto 0; font-size: 17.5px; color: var(--ink-2); line-height: 1.6; }
.imx .imx-lede em { color: var(--ink); font-style: normal; font-weight: 600; }
.imx .imx-cta { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; margin-top: 34px; }

.imx .imx-stats {
  display: inline-flex; align-items: center; gap: 26px; flex-wrap: wrap; justify-content: center;
  margin-top: 50px; padding: 18px 30px; background: var(--surface); border: 1px solid var(--line); border-radius: 20px;
  box-shadow: 0 18px 40px -28px rgba(20,20,19,0.4);
}
.imx .imx-stats > div:not(.imx-stat-sep) { display: flex; flex-direction: column; align-items: center; }
.imx .imx-stats b { font-family: 'Bricolage Grotesque', sans-serif; font-weight: 700; font-size: 30px; letter-spacing: -0.02em; }
.imx .imx-stats span { font-size: 12.5px; color: var(--ink-2); }
.imx .imx-stat-sep { width: 1px; height: 34px; background: var(--line); }

/* sections */
.imx .imx-section { padding: 92px 0; }
.imx .imx-section-tint { background: var(--bg-2); }
.imx .imx-head { max-width: 680px; margin-bottom: 44px; }
.imx .imx-head.center { margin-left: auto; margin-right: auto; }
.imx .imx-eyebrow {
  display: inline-block; font-size: 12.5px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase;
  color: var(--cobalt); margin-bottom: 16px;
}
.imx .imx-eyebrow.light { color: #BFC9FF; }
.imx .imx-h2 { font-family: 'Bricolage Grotesque', sans-serif; font-weight: 700; font-size: clamp(30px, 4.4vw, 52px); line-height: 1.05; letter-spacing: -0.03em; margin: 0; }

/* bento */
.imx .imx-bento { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
.imx .imx-card {
  background: var(--surface); border: 1px solid var(--line); border-radius: 24px; padding: 28px;
  transition: transform .18s ease, box-shadow .18s ease; box-shadow: 0 1px 0 rgba(20,20,19,0.02);
}
.imx .imx-card:hover { transform: translateY(-4px); box-shadow: 0 24px 44px -26px rgba(20,20,19,0.32); }
.imx .imx-b-wide { grid-column: span 2; }
.imx .imx-card-cobalt { background: var(--cobalt); border-color: var(--cobalt); color: #fff; }
.imx .imx-card-dark { background: var(--ink); border-color: var(--ink); color: #fff; }
.imx .imx-emoji { font-size: 26px; display: block; margin-bottom: 16px; }
.imx .imx-card-kick { font-size: 12.5px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: rgba(255,255,255,0.7); }
.imx .imx-card-kick.light { color: rgba(255,255,255,0.6); }
.imx .imx-card-h { font-family: 'Bricolage Grotesque', sans-serif; font-weight: 600; font-size: 28px; line-height: 1.08; letter-spacing: -0.02em; margin: 12px 0 12px; }
.imx .imx-card-h.sm { font-size: 21px; margin: 0 0 8px; }
.imx .imx-card-h.light { color: #fff; }
.imx .imx-card-p { font-size: 14.5px; color: var(--ink-2); line-height: 1.55; margin: 0; }
.imx .imx-card-cobalt .imx-card-p, .imx .imx-card-dark .imx-card-p { color: rgba(255,255,255,0.78); }
.imx .imx-lang-row { display: flex; align-items: center; gap: 12px; margin-top: 20px; }
.imx .imx-lang-chip { font-family: 'Bricolage Grotesque', sans-serif; font-weight: 700; font-size: 14px; background: rgba(255,255,255,0.16); color: #fff; padding: 7px 14px; border-radius: 100px; }
.imx .imx-lang-coral { background: var(--coral); }
.imx .imx-lang-x { color: rgba(255,255,255,0.6); font-size: 18px; }

/* practice areas */
.imx .imx-areas { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
.imx .imx-area {
  background: var(--surface); border: 1px solid var(--line); border-radius: 18px; padding: 22px 24px;
  display: flex; flex-direction: column; gap: 3px; transition: border-color .16s ease, transform .16s ease;
}
.imx .imx-area:hover { border-color: var(--cobalt); transform: translateY(-3px); }
.imx .imx-area-en { font-family: 'Bricolage Grotesque', sans-serif; font-weight: 600; font-size: 19px; letter-spacing: -0.01em; }
.imx .imx-area-es { font-size: 13.5px; color: var(--coral); font-weight: 500; }

/* steps */
.imx .imx-steps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 22px; }
.imx .imx-step { background: var(--surface); border: 1px solid var(--line); border-radius: 22px; padding: 28px; }
.imx .imx-step-n { font-family: 'Bricolage Grotesque', sans-serif; font-weight: 800; font-size: 17px; color: #fff; background: var(--cobalt); width: 40px; height: 40px; border-radius: 12px; display: grid; place-items: center; }
.imx .imx-step-en { font-family: 'Bricolage Grotesque', sans-serif; font-weight: 600; font-size: 21px; letter-spacing: -0.01em; margin: 18px 0 12px; }
.imx .imx-step-es { display: block; font-size: 13px; color: var(--coral); font-weight: 600; margin-bottom: 12px; }
.imx .imx-step-p { font-size: 14.5px; color: var(--ink-2); line-height: 1.6; margin: 0; }

/* proof */
.imx .imx-proof { background: var(--cobalt); color: #fff; padding: 96px 0; text-align: center; position: relative; overflow: hidden; }
.imx .imx-proof::before { content: ""; position: absolute; inset: 0; background: radial-gradient(60% 80% at 50% -10%, rgba(255,255,255,0.16), transparent 60%); pointer-events: none; }
.imx .imx-proof > .imx-wrap { position: relative; }
.imx .imx-proof-h { font-family: 'Bricolage Grotesque', sans-serif; font-weight: 700; font-size: clamp(32px, 4.8vw, 58px); letter-spacing: -0.03em; margin: 6px 0 46px; }
.imx .imx-proof-grid { display: flex; justify-content: center; flex-wrap: wrap; gap: 56px; margin-bottom: 34px; }
.imx .imx-proof-stat b { font-family: 'Bricolage Grotesque', sans-serif; font-weight: 800; font-size: clamp(48px, 7vw, 84px); line-height: 1; letter-spacing: -0.03em; display: block; }
.imx .imx-proof-stat span { font-size: 14px; color: rgba(255,255,255,0.78); }
.imx .imx-proof-note { max-width: 600px; margin: 0 auto; font-size: 15px; color: rgba(255,255,255,0.82); line-height: 1.65; }
.imx .imx-proof-note a { color: #fff; font-weight: 700; border-bottom: 1px solid rgba(255,255,255,0.5); }

/* quote */
.imx .imx-quote-card { max-width: 860px; margin: 0 auto; background: var(--surface); border: 1px solid var(--line); border-radius: 28px; padding: 48px; text-align: center; box-shadow: 0 30px 60px -40px rgba(20,20,19,0.4); }
.imx .imx-quote { font-family: 'Bricolage Grotesque', sans-serif; font-weight: 500; font-size: clamp(24px, 3.2vw, 38px); line-height: 1.22; letter-spacing: -0.02em; margin: 0 0 28px; }
.imx .imx-quote em { font-style: italic; }
.imx .imx-quote-by { display: inline-flex; align-items: center; gap: 13px; }
.imx .imx-avatar { width: 50px; height: 50px; border-radius: 50%; object-fit: cover; background: linear-gradient(135deg, var(--cobalt), var(--coral)); color: #fff; display: grid; place-items: center; font-family: 'Bricolage Grotesque', sans-serif; font-weight: 700; font-size: 21px; }
.imx .imx-by-name { font-family: 'Bricolage Grotesque', sans-serif; font-weight: 600; font-size: 16px; text-align: left; }
.imx .imx-by-role { font-size: 13px; color: var(--ink-3); text-align: left; }
.imx .imx-by-link { color: var(--cobalt); font-weight: 600; }

/* final */
.imx .imx-final { padding: 110px 0; }
.imx .imx-final-h { font-family: 'Bricolage Grotesque', sans-serif; font-weight: 700; font-size: clamp(40px, 6.4vw, 82px); line-height: 1.0; letter-spacing: -0.035em; margin: 0 0 34px; }
.imx .imx-final-sub { margin-top: 18px; font-size: 14px; color: var(--ink-3); }

/* footer */
.imx .imx-foot { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 14px; align-items: center; max-width: 1140px; margin: 0 auto; padding: 30px 28px 44px; border-top: 1px solid var(--line); font-size: 13.5px; color: var(--ink-2); }
.imx .imx-foot .imx-brand { font-size: 17px; }

/* responsive */
@media (max-width: 880px) {
  .imx .imx-nav-links { display: none; }
  .imx .imx-bento { grid-template-columns: 1fr 1fr; }
  .imx .imx-b-wide { grid-column: span 2; }
  .imx .imx-areas { grid-template-columns: 1fr 1fr; }
  .imx .imx-steps { grid-template-columns: 1fr; }
  .imx .imx-proof-grid { gap: 32px; }
  .imx .imx-section { padding: 64px 0; }
}
@media (max-width: 560px) {
  .imx .imx-bento { grid-template-columns: 1fr; }
  .imx .imx-b-wide { grid-column: span 1; }
  .imx .imx-areas { grid-template-columns: 1fr; }
  .imx .imx-stats { gap: 16px; padding: 16px 20px; }
  .imx .imx-stat-sep { display: none; }
}
`;
