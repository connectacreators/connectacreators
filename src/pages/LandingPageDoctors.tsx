import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import drCalvinPortrait from "@/assets/dr-calvin-portrait.jpg";
import ApplyModal from "@/components/ApplyModal";
import DoctorBookingForm from "@/components/DoctorBookingForm";

/* =============================================================================
   Doctors landing — "Content Doctors" edition.
   Aesthetic: dark navy canvas, vivid teal accents, bold conversational display,
   confident "be the biggest name in your city" voice. Self-contained, scoped to
   .dc, fonts injected at runtime. CTAs open a qualifying discovery-call booking
   that emails Roberto via SMTP (send-doctor-lead). English throughout.
   ============================================================================= */

const FONT_LINK_ID = "imx-fonts";
const FONT_HREF =
  "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,500;12..96,600;12..96,700;12..96,800&family=Instrument+Sans:ital,wght@0,400;0,500;0,600;1,400;1,500&display=swap";

const OUTCOMES = [
  ["More Patients", "Content systems that bring new patients in every month — without chasing them."],
  ["Bigger Brand", "The most known doctor in your city. The kind patients search for by name."],
  ["Done-For-You", "We handle the content, filming, and follow-up. You focus on practicing medicine."],
];

const SERVICES = [
  ["Content Strategy", "The backbone. We study your niche, the algorithm, and what actually blows up, then engineer the plan."],
  ["Short-Form Video", "Reels and shorts built to travel — the content that grows the name."],
  ["Commercial Video", "Polished brand films that make your practice look like the obvious choice."],
  ["Photo Production", "Scroll-stopping stills for your feed, ads, and site."],
  ["Social Media", "Posted daily, on every platform, managed end to end."],
  ["Paid Marketing", "Ads that turn the audience into booked appointments."],
  ["Graphic Design", "A brand that looks as good as the medicine you practice."],
  ["Website & SEO", "So when they search you — and your city — you're the answer."],
];

const FOR_YOU = [
  "You're tired of being your city's best-kept secret",
  "Your online presence feels stale",
  "You're ready to show up on camera and build a personal brand",
  "You want a system, not another agency selling à la carte services",
  "You're ready to be the face of your practice, not just the doctor behind it",
];

const NOT_FOR_YOU = [
  "You're satisfied with how things are right now",
  "You don't believe online marketing works for doctors",
  "You won't be on camera under any circumstance",
  "You want SEO only, ads only, or social only — not the full system",
  "You're shopping by lowest price",
];

const FAQ = [
  ["What does Connecta actually do?", "We build the content system that makes you the most known doctor in your city — strategy, scripts, filming, editing, posting, and ads. Done for you. You show up; we run the studio."],
  ["What is content strategy, and why does it matter so much?", "It's the backbone. We study your niche, the algorithm, and what actually performs in medical content, then engineer a plan around how you explain medicine. Without it, you're just posting. With it, you're growing."],
  ["Do I have to be on camera all the time?", "On camera, yes — that's how patients come to trust you before they ever call. But not all the time. We make filming efficient: batch a month of content in a single short session."],
  ["How much does it cost?", "It depends on your market and goals. Book a discovery call and we'll walk you through it honestly — no pressure, no à la carte upsells."],
  ["How long until I see results?", "Brand momentum builds in the first weeks; patient leads follow as the system compounds. Dr. Calvin went from 7K followers in 16 years to 93K — and 30–50 new leads a month."],
  ["What makes you different?", "No templates. We build one system around your practice, in your voice, and we back it: 90 leads in 90 days, or you don't pay."],
  ["How do we get started?", "Book a discovery call. We work with a select group of doctors at a time and we'll see if we're a fit."],
];

export default function LandingPageDoctors() {
  const [bookingOpen, setBookingOpen] = useState(false);
  const openBooking = () => setBookingOpen(true);

  useEffect(() => {
    if (document.getElementById(FONT_LINK_ID)) return;
    const link = document.createElement("link");
    link.id = FONT_LINK_ID;
    link.rel = "stylesheet";
    link.href = FONT_HREF;
    document.head.appendChild(link);
  }, []);

  return (
    <div className="dc">
      <style>{CSS}</style>

      {/* floating pill nav */}
      <nav className="dc-nav">
        <Link to="/" className="dc-brand" aria-label="Connecta">
          <span className="dc-brand-dot" aria-hidden />
          Connecta
        </Link>
        <div className="dc-nav-links">
          <a href="#work">Work</a>
          <a href="#outcomes">Outcomes</a>
          <a href="#services">Services</a>
          <a href="#about">About</a>
          <a href="#faq">FAQ</a>
        </div>
        <button onClick={openBooking} className="dc-btn dc-btn-teal dc-btn-sm">Book a Call</button>
      </nav>

      {/* ===== HERO ===== */}
      <header className="dc-hero">
        <div className="dc-glow" aria-hidden />
        <span className="dc-tag rise" style={{ animationDelay: ".04s" }}>
          <span className="dc-tag-dot" /> Now accepting new doctor partners
        </span>
        <h1 className="dc-h1 rise" style={{ animationDelay: ".12s" }}>
          We help doctors become the <span className="dc-grad">biggest name</span> in their city.
        </h1>
        <p className="dc-lede rise" style={{ animationDelay: ".24s" }}>
          More patients. Bigger brand. A practice people drive across town for.
        </p>
        <div className="dc-cta rise" style={{ animationDelay: ".34s" }}>
          <button onClick={openBooking} className="dc-btn dc-btn-teal dc-btn-lg">
            Book a Discovery Meeting <span className="dc-arr">→</span>
          </button>
          <a href="#work" className="dc-btn dc-btn-line dc-btn-lg">See the work →</a>
        </div>
        <div className="dc-stats rise" style={{ animationDelay: ".46s" }}>
          <div><b>93K</b><span>followers grown</span></div>
          <div className="dc-stat-sep" />
          <div><b>30–50</b><span>new leads / month</span></div>
          <div className="dc-stat-sep" />
          <div><b>$15K</b><span>extra revenue / month</span></div>
        </div>
      </header>

      {/* ===== RECENT WORK — Dr. Calvin case study ===== */}
      <section className="dc-section" id="work">
        <div className="dc-wrap">
          <div className="dc-head">
            <span className="dc-eyebrow">Recent work</span>
            <h2 className="dc-h2">Reels that built a <span className="dc-teal-tx">real practice.</span></h2>
            <p className="dc-head-p">A look at what the system ships. Every post is part of a machine that turns a feed into booked patients.</p>
          </div>

          <div className="dc-case">
            <div className="dc-case-media">
              <img className="dc-case-img" src={drCalvinPortrait} alt="Dr. Calvin" />
              <span className="dc-case-badge">Dr. Calvin · Chiropractic</span>
            </div>
            <div className="dc-case-body">
              <h3 className="dc-case-h">From 7K followers in 16 years to 93K — and a packed schedule.</h3>
              <p className="dc-case-p">
                We built Dr. Calvin's feed into one of the most-watched in his space: 50M+ views,
                93K followers, and a steady 30–50 new patient leads every month — about $15K in extra
                revenue. The same playbook now runs for the doctors we partner with.
              </p>
              <div className="dc-case-stats">
                <div><b>50M+</b><span>views</span></div>
                <div><b>93K</b><span>followers</span></div>
                <div><b>$15K</b><span>extra / mo</span></div>
              </div>
              <a className="dc-case-link" href="https://www.facebook.com/drcalvinsclinics/reels/" target="_blank" rel="noopener noreferrer">
                Watch his reels →
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ===== THREE OUTCOMES ===== */}
      <section className="dc-section dc-section-tint" id="outcomes">
        <div className="dc-wrap">
          <div className="dc-head center">
            <span className="dc-eyebrow">The offer</span>
            <h2 className="dc-h2">Three outcomes. <span className="dc-teal-tx">One system.</span></h2>
          </div>
          <div className="dc-outcomes">
            {OUTCOMES.map(([h, p], i) => (
              <div className="dc-outcome" key={h}>
                <span className="dc-outcome-n">0{i + 1}</span>
                <h3 className="dc-outcome-h">{h}</h3>
                <p className="dc-outcome-p">{p}</p>
              </div>
            ))}
          </div>
          <div className="dc-center-cta">
            <button onClick={openBooking} className="dc-btn dc-btn-teal dc-btn-lg">Book a Discovery Meeting <span className="dc-arr">→</span></button>
          </div>
        </div>
      </section>

      {/* ===== SERVICES ===== */}
      <section className="dc-section" id="services">
        <div className="dc-wrap">
          <div className="dc-head">
            <span className="dc-eyebrow">What we do</span>
            <h2 className="dc-h2">Not your average <span className="dc-teal-tx">marketing agency.</span></h2>
            <p className="dc-head-p">No templates. We study your niche, your patients, what sets you apart — then build the system that makes you the name in your city.</p>
          </div>
          <div className="dc-services">
            {SERVICES.map(([name, blurb], i) => (
              <div className="dc-service" key={name}>
                <span className="dc-service-n">{String(i + 1).padStart(2, "0")}</span>
                <h3 className="dc-service-h">{name}</h3>
                <p className="dc-service-p">{blurb}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== ABOUT — Roberto ===== */}
      <section className="dc-section dc-section-tint" id="about">
        <div className="dc-wrap">
          <div className="dc-about">
            <div className="dc-about-text">
              <span className="dc-eyebrow">Who you work with</span>
              <h2 className="dc-h2">Meet your strategist.</h2>
              <p className="dc-about-p">
                I'm <b>Roberto Gauna</b>, founder of Connecta. I build personal brands for doctors and
                clinics — including Dr. Calvin's growth to 93K followers and 50M+ views. I own the
                strategy and playbook that turn good doctors into the most-known name in their city,
                and I'm personally in the room for every practice we take on.
              </p>
              <p className="dc-about-sign">— Roberto Gauna · Founder, Connecta</p>
              <button onClick={openBooking} className="dc-btn dc-btn-teal dc-btn-lg" style={{ marginTop: 26 }}>Book a call with me <span className="dc-arr">→</span></button>
            </div>
            <div className="dc-about-card">
              <span className="dc-about-kick">The promise</span>
              <p className="dc-about-quote">"90 leads in 90 days — or you don't pay."</p>
              <p className="dc-about-note">We only win when you do. That's the whole model.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ===== TESTIMONIAL ===== */}
      <section className="dc-section">
        <div className="dc-wrap">
          <div className="dc-quote-card">
            <span className="dc-eyebrow">What doctors say</span>
            <p className="dc-quote">
              "I had 7K followers for 16 years… now <span className="dc-teal-tx">93K</span> — with 30–50 new
              leads and about <span className="dc-teal-tx">$15K extra every month.</span> Best decision I've
              made for my practice."
            </p>
            <div className="dc-quote-by">
              <img className="dc-avatar" src={drCalvinPortrait} alt="Dr. Calvin" />
              <div>
                <div className="dc-by-name">Dr. Calvin</div>
                <div className="dc-by-role">
                  Chiropractor · 93K followers · 50M+ views with Connecta ·{" "}
                  <a href="https://www.facebook.com/drcalvinsclinics/reels/" target="_blank" rel="noopener noreferrer" className="dc-by-link">see his work →</a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== IS THIS FOR YOU ===== */}
      <section className="dc-section dc-section-tint">
        <div className="dc-wrap">
          <div className="dc-head center">
            <span className="dc-eyebrow">Honest filter</span>
            <h2 className="dc-h2">Is this for you?</h2>
            <p className="dc-head-p">We're not for every doctor. If both sides resonate, you're already in the right room.</p>
          </div>
          <div className="dc-fit">
            <div className="dc-fit-col dc-fit-yes">
              <h3 className="dc-fit-h">For you if…</h3>
              <ul>
                {FOR_YOU.map((t) => <li key={t}><span className="dc-fit-mark yes">✓</span>{t}</li>)}
              </ul>
            </div>
            <div className="dc-fit-col dc-fit-no">
              <h3 className="dc-fit-h">Not for you if…</h3>
              <ul>
                {NOT_FOR_YOU.map((t) => <li key={t}><span className="dc-fit-mark no">×</span>{t}</li>)}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ===== FAQ ===== */}
      <section className="dc-section" id="faq">
        <div className="dc-wrap dc-wrap-narrow">
          <div className="dc-head center">
            <span className="dc-eyebrow">Before you book</span>
            <h2 className="dc-h2">Questions doctors ask.</h2>
          </div>
          <div className="dc-faq">
            {FAQ.map(([q, a]) => (
              <details className="dc-faq-item" key={q}>
                <summary className="dc-faq-q">{q}<span className="dc-faq-plus" aria-hidden>+</span></summary>
                <p className="dc-faq-a">{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ===== FINAL CTA ===== */}
      <section className="dc-final">
        <div className="dc-glow dc-glow-final" aria-hidden />
        <div className="dc-wrap center">
          <span className="dc-eyebrow">Ready to grow?</span>
          <h2 className="dc-final-h">Stop being your city's <span className="dc-grad">best-kept secret.</span></h2>
          <p className="dc-final-sub">
            Book a discovery meeting. We work with a select group of doctors at a time — always happy
            to learn about your practice and see if we're a fit.
          </p>
          <button onClick={openBooking} className="dc-btn dc-btn-teal dc-btn-lg">Book a Discovery Meeting <span className="dc-arr">→</span></button>
          <p className="dc-final-fine">90 leads in 90 days, or you don't pay.</p>
        </div>
      </section>

      <footer className="dc-foot">
        <span className="dc-brand"><span className="dc-brand-dot" aria-hidden />Connecta</span>
        <span>Marketing for doctors who want to be the most-known name in their city · © 2026</span>
      </footer>

      <ApplyModal open={bookingOpen} onClose={() => setBookingOpen(false)} label="Book a discovery call" dark>
        <DoctorBookingForm />
      </ApplyModal>
    </div>
  );
}

/* ============================ scoped styles ============================ */
const CSS = `
.dc {
  --bg:      #0A0F1A;
  --bg-2:    #0E1424;
  --surface: #111A2E;
  --ink:     #F1F5F9;
  --ink-2:   rgba(241,245,249,0.66);
  --ink-3:   rgba(241,245,249,0.42);
  --teal:    #2DD4BF;
  --teal-2:  #14B8A6;
  --teal-soft: rgba(45,212,191,0.12);
  --line:    rgba(241,245,249,0.10);

  position: relative; background: var(--bg); color: var(--ink);
  font-family: 'Instrument Sans', system-ui, sans-serif; line-height: 1.55;
  overflow-x: hidden; -webkit-font-smoothing: antialiased;
}
.dc * { box-sizing: border-box; }
.dc a { color: inherit; text-decoration: none; }
.dc em { font-style: italic; }
.dc .dc-wrap { max-width: 1140px; margin: 0 auto; padding: 0 28px; }
.dc .dc-wrap-narrow { max-width: 820px; }
.dc .dc-wrap.center, .dc .center { text-align: center; }

@keyframes dc-rise { from { opacity: 0; transform: translateY(22px); } to { opacity: 1; transform: none; } }
.dc .rise { animation: dc-rise 0.8s cubic-bezier(0.2,0.8,0.2,1) backwards; }
@media (prefers-reduced-motion: reduce) { .dc .rise { animation: none; } }

.dc .dc-teal-tx { color: var(--teal); }
.dc .dc-grad {
  background: linear-gradient(96deg, var(--teal) 0%, #5EEAD4 100%);
  -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent;
}

/* nav */
.dc .dc-nav {
  position: sticky; top: 16px; z-index: 50;
  max-width: 980px; width: calc(100% - 32px); margin: 16px auto 0;
  display: flex; align-items: center; justify-content: space-between; gap: 18px;
  background: rgba(17,26,46,0.72); backdrop-filter: blur(16px);
  border: 1px solid var(--line); border-radius: 100px; padding: 9px 9px 9px 22px;
  box-shadow: 0 8px 30px -16px rgba(0,0,0,0.6);
}
.dc .dc-brand { display: inline-flex; align-items: center; gap: 9px; font-family: 'Bricolage Grotesque', sans-serif; font-weight: 700; font-size: 19px; letter-spacing: -0.02em; }
.dc .dc-brand-dot { width: 13px; height: 13px; border-radius: 50%; background: var(--teal); box-shadow: 0 0 0 3px var(--teal-soft); }
.dc .dc-nav-links { display: flex; gap: 24px; font-size: 14.5px; font-weight: 500; color: var(--ink-2); }
.dc .dc-nav-links a:hover { color: var(--ink); }

/* buttons */
.dc .dc-btn {
  display: inline-flex; align-items: center; gap: 8px;
  font-family: 'Instrument Sans', sans-serif; font-weight: 600; font-size: 15px;
  padding: 13px 22px; border-radius: 100px; cursor: pointer; border: 1.5px solid transparent;
  transition: transform .15s ease, box-shadow .15s ease, background .15s ease;
}
.dc .dc-btn-sm { padding: 10px 18px; font-size: 14px; }
.dc .dc-btn-lg { padding: 16px 28px; font-size: 16px; }
.dc .dc-btn-teal { background: var(--teal); color: #04201C; font-weight: 700; box-shadow: 0 10px 26px -10px rgba(45,212,191,0.55); }
.dc .dc-btn-teal:hover { transform: translateY(-2px); box-shadow: 0 16px 34px -10px rgba(45,212,191,0.6); }
.dc .dc-btn-line { background: transparent; color: var(--ink); border-color: var(--line); }
.dc .dc-btn-line:hover { border-color: var(--teal); color: var(--teal); transform: translateY(-2px); }
.dc .dc-arr { transition: transform .2s ease; }
.dc .dc-btn:hover .dc-arr { transform: translateX(4px); }

/* hero */
.dc .dc-hero { position: relative; max-width: 960px; margin: 0 auto; padding: 60px 28px 70px; text-align: center; }
.dc .dc-glow {
  position: absolute; top: -40px; left: 50%; transform: translateX(-50%);
  width: 820px; height: 540px; pointer-events: none; z-index: 0;
  background:
    radial-gradient(closest-side, rgba(45,212,191,0.20), transparent 70%),
    radial-gradient(closest-side, rgba(20,184,166,0.14), transparent 70%);
  background-position: 35% 30%, 70% 60%; background-repeat: no-repeat;
  background-size: 60% 80%, 55% 70%; filter: blur(44px);
}
.dc .dc-hero > *:not(.dc-glow) { position: relative; z-index: 1; }
.dc .dc-tag {
  display: inline-flex; align-items: center; gap: 8px;
  font-size: 13px; font-weight: 600; color: var(--ink-2);
  background: var(--surface); border: 1px solid var(--line); border-radius: 100px; padding: 7px 15px; margin-bottom: 26px;
}
.dc .dc-tag-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--teal); box-shadow: 0 0 0 4px var(--teal-soft); animation: dc-pulse 2.4s ease-in-out infinite; }
@keyframes dc-pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.4 } }
.dc .dc-h1 {
  font-family: 'Bricolage Grotesque', sans-serif; font-weight: 700;
  font-size: clamp(42px, 7vw, 88px); line-height: 1.0; letter-spacing: -0.035em; margin: 0;
}
.dc .dc-lede { max-width: 560px; margin: 22px auto 0; font-size: 19px; color: var(--ink-2); line-height: 1.5; }
.dc .dc-cta { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; margin-top: 34px; }

.dc .dc-stats {
  display: inline-flex; align-items: center; gap: 26px; flex-wrap: wrap; justify-content: center;
  margin-top: 52px; padding: 18px 30px; background: var(--surface); border: 1px solid var(--line); border-radius: 20px;
  box-shadow: 0 18px 40px -28px rgba(0,0,0,0.6);
}
.dc .dc-stats > div:not(.dc-stat-sep) { display: flex; flex-direction: column; align-items: center; }
.dc .dc-stats b { font-family: 'Bricolage Grotesque', sans-serif; font-weight: 700; font-size: 30px; letter-spacing: -0.02em; color: var(--teal); }
.dc .dc-stats span { font-size: 12.5px; color: var(--ink-2); }
.dc .dc-stat-sep { width: 1px; height: 34px; background: var(--line); }

/* sections */
.dc .dc-section { padding: 92px 0; }
.dc .dc-section-tint { background: var(--bg-2); }
.dc .dc-head { max-width: 680px; margin-bottom: 48px; }
.dc .dc-head.center { margin-left: auto; margin-right: auto; }
.dc .dc-eyebrow { display: inline-block; font-size: 12.5px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: var(--teal); margin-bottom: 16px; }
.dc .dc-h2 { font-family: 'Bricolage Grotesque', sans-serif; font-weight: 700; font-size: clamp(30px, 4.4vw, 52px); line-height: 1.05; letter-spacing: -0.03em; margin: 0; }
.dc .dc-head-p { margin: 18px 0 0; font-size: 16.5px; color: var(--ink-2); line-height: 1.6; }
.dc .dc-head.center .dc-head-p { margin-left: auto; margin-right: auto; max-width: 600px; }

/* case study */
.dc .dc-case { display: grid; grid-template-columns: 0.85fr 1.15fr; gap: 28px; align-items: stretch; }
.dc .dc-case-media { position: relative; border-radius: 24px; overflow: hidden; border: 1px solid var(--line); min-height: 360px; }
.dc .dc-case-img { width: 100%; height: 100%; object-fit: cover; display: block; }
.dc .dc-case-badge { position: absolute; left: 16px; bottom: 16px; background: rgba(10,15,26,0.8); backdrop-filter: blur(8px); border: 1px solid var(--line); color: var(--ink); font-size: 13px; font-weight: 600; padding: 8px 14px; border-radius: 100px; }
.dc .dc-case-body { background: var(--surface); border: 1px solid var(--line); border-radius: 24px; padding: 36px; display: flex; flex-direction: column; }
.dc .dc-case-h { font-family: 'Bricolage Grotesque', sans-serif; font-weight: 700; font-size: clamp(24px, 3vw, 34px); line-height: 1.1; letter-spacing: -0.02em; margin: 0 0 16px; }
.dc .dc-case-p { font-size: 16px; color: var(--ink-2); line-height: 1.62; margin: 0 0 26px; }
.dc .dc-case-stats { display: flex; gap: 30px; flex-wrap: wrap; margin-bottom: 24px; }
.dc .dc-case-stats b { font-family: 'Bricolage Grotesque', sans-serif; font-weight: 700; font-size: 30px; color: var(--teal); display: block; letter-spacing: -0.02em; }
.dc .dc-case-stats span { font-size: 12.5px; color: var(--ink-2); }
.dc .dc-case-link { margin-top: auto; align-self: flex-start; color: var(--teal); font-weight: 700; font-size: 15px; border-bottom: 1px solid var(--teal-soft); padding-bottom: 2px; }
.dc .dc-case-link:hover { border-color: var(--teal); }

/* outcomes */
.dc .dc-outcomes { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; }
.dc .dc-outcome { background: var(--surface); border: 1px solid var(--line); border-radius: 22px; padding: 32px 28px; transition: transform .18s ease, border-color .18s ease; }
.dc .dc-outcome:hover { transform: translateY(-4px); border-color: var(--teal); }
.dc .dc-outcome-n { font-family: 'Bricolage Grotesque', sans-serif; font-weight: 800; font-size: 15px; color: var(--teal); }
.dc .dc-outcome-h { font-family: 'Bricolage Grotesque', sans-serif; font-weight: 700; font-size: 25px; letter-spacing: -0.02em; margin: 14px 0 10px; }
.dc .dc-outcome-p { font-size: 15px; color: var(--ink-2); line-height: 1.6; margin: 0; }
.dc .dc-center-cta { text-align: center; margin-top: 44px; }

/* services */
.dc .dc-services { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; }
.dc .dc-service { background: var(--surface); border: 1px solid var(--line); border-radius: 18px; padding: 24px; transition: border-color .16s ease, transform .16s ease; }
.dc .dc-service:hover { border-color: var(--teal); transform: translateY(-3px); }
.dc .dc-service-n { font-family: 'Bricolage Grotesque', sans-serif; font-weight: 800; font-size: 13px; color: var(--teal-2); }
.dc .dc-service-h { font-family: 'Bricolage Grotesque', sans-serif; font-weight: 600; font-size: 18px; letter-spacing: -0.01em; margin: 10px 0 8px; }
.dc .dc-service-p { font-size: 13.5px; color: var(--ink-2); line-height: 1.55; margin: 0; }

/* about */
.dc .dc-about { display: grid; grid-template-columns: 1.3fr 0.7fr; gap: 28px; align-items: center; }
.dc .dc-about-p { font-size: 17px; color: var(--ink-2); line-height: 1.68; margin: 20px 0 0; max-width: 560px; }
.dc .dc-about-p b { color: var(--ink); }
.dc .dc-about-sign { margin: 16px 0 0; font-size: 14px; color: var(--teal); font-weight: 600; }
.dc .dc-about-card { background: linear-gradient(160deg, var(--teal) 0%, var(--teal-2) 100%); color: #04201C; border-radius: 24px; padding: 34px; }
.dc .dc-about-kick { font-size: 12.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; opacity: 0.7; }
.dc .dc-about-quote { font-family: 'Bricolage Grotesque', sans-serif; font-weight: 700; font-size: 28px; line-height: 1.12; letter-spacing: -0.02em; margin: 14px 0 14px; }
.dc .dc-about-note { font-size: 14.5px; line-height: 1.55; margin: 0; opacity: 0.85; }

/* quote */
.dc .dc-quote-card { max-width: 880px; margin: 0 auto; background: var(--surface); border: 1px solid var(--line); border-radius: 28px; padding: 48px; text-align: center; box-shadow: 0 30px 60px -40px rgba(0,0,0,0.7); }
.dc .dc-quote-card .dc-eyebrow { margin-bottom: 20px; }
.dc .dc-quote { font-family: 'Bricolage Grotesque', sans-serif; font-weight: 500; font-size: clamp(23px, 3.1vw, 36px); line-height: 1.24; letter-spacing: -0.02em; margin: 0 0 28px; }
.dc .dc-quote-by { display: inline-flex; align-items: center; gap: 13px; }
.dc .dc-avatar { width: 50px; height: 50px; border-radius: 50%; object-fit: cover; }
.dc .dc-by-name { font-family: 'Bricolage Grotesque', sans-serif; font-weight: 600; font-size: 16px; text-align: left; }
.dc .dc-by-role { font-size: 13px; color: var(--ink-3); text-align: left; }
.dc .dc-by-link { color: var(--teal); font-weight: 600; }

/* fit */
.dc .dc-fit { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
.dc .dc-fit-col { background: var(--surface); border: 1px solid var(--line); border-radius: 22px; padding: 32px; }
.dc .dc-fit-yes { border-color: rgba(45,212,191,0.4); }
.dc .dc-fit-h { font-family: 'Bricolage Grotesque', sans-serif; font-weight: 700; font-size: 20px; letter-spacing: -0.01em; margin: 0 0 18px; }
.dc .dc-fit-col ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 14px; }
.dc .dc-fit-col li { display: flex; align-items: flex-start; gap: 12px; font-size: 15px; color: var(--ink-2); line-height: 1.5; }
.dc .dc-fit-mark { flex-shrink: 0; width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center; font-size: 13px; font-weight: 800; margin-top: 1px; }
.dc .dc-fit-mark.yes { background: var(--teal); color: #04201C; }
.dc .dc-fit-mark.no { background: rgba(241,245,249,0.10); color: var(--ink-3); }

/* faq */
.dc .dc-faq { display: flex; flex-direction: column; gap: 12px; }
.dc .dc-faq-item { background: var(--surface); border: 1px solid var(--line); border-radius: 16px; padding: 4px 22px; transition: border-color .16s ease; }
.dc .dc-faq-item[open] { border-color: var(--teal); }
.dc .dc-faq-q { display: flex; align-items: center; justify-content: space-between; gap: 14px; cursor: pointer; list-style: none; padding: 18px 0; font-family: 'Bricolage Grotesque', sans-serif; font-weight: 600; font-size: 17px; letter-spacing: -0.01em; }
.dc .dc-faq-q::-webkit-details-marker { display: none; }
.dc .dc-faq-plus { flex-shrink: 0; color: var(--teal); font-size: 22px; font-weight: 400; transition: transform .2s ease; }
.dc .dc-faq-item[open] .dc-faq-plus { transform: rotate(45deg); }
.dc .dc-faq-a { margin: 0 0 18px; font-size: 15px; color: var(--ink-2); line-height: 1.65; }

/* final */
.dc .dc-final { position: relative; padding: 110px 0; text-align: center; overflow: hidden; }
.dc .dc-glow-final { top: 50%; transform: translate(-50%, -50%); }
.dc .dc-final > .dc-wrap { position: relative; z-index: 1; }
.dc .dc-final-h { font-family: 'Bricolage Grotesque', sans-serif; font-weight: 700; font-size: clamp(36px, 5.8vw, 76px); line-height: 1.0; letter-spacing: -0.035em; margin: 8px 0 22px; }
.dc .dc-final-sub { max-width: 560px; margin: 0 auto 32px; font-size: 17px; color: var(--ink-2); line-height: 1.6; }
.dc .dc-final-fine { margin-top: 18px; font-size: 13.5px; color: var(--ink-3); }

/* footer */
.dc .dc-foot { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 14px; align-items: center; max-width: 1140px; margin: 0 auto; padding: 30px 28px 44px; border-top: 1px solid var(--line); font-size: 13.5px; color: var(--ink-2); }
.dc .dc-foot .dc-brand { font-size: 17px; }

/* responsive */
@media (max-width: 920px) {
  .dc .dc-nav-links { display: none; }
  .dc .dc-case { grid-template-columns: 1fr; }
  .dc .dc-case-media { min-height: 280px; }
  .dc .dc-outcomes { grid-template-columns: 1fr; }
  .dc .dc-services { grid-template-columns: 1fr 1fr; }
  .dc .dc-about { grid-template-columns: 1fr; }
  .dc .dc-fit { grid-template-columns: 1fr; }
  .dc .dc-section { padding: 64px 0; }
}
@media (max-width: 540px) {
  .dc .dc-services { grid-template-columns: 1fr; }
  .dc .dc-hero { padding: 44px 20px 54px; }
  .dc .dc-h1 { font-size: 40px; letter-spacing: -0.03em; }
  .dc .dc-lede { font-size: 17px; }
  .dc .dc-stats { gap: 14px 18px; padding: 16px 18px; width: 100%; }
  .dc .dc-stats b { font-size: 26px; }
  .dc .dc-stat-sep { display: none; }
  .dc .dc-case-body { padding: 26px; }
  .dc .dc-case-stats { gap: 22px; }
  .dc .dc-wrap { padding: 0 20px; }
}
`;
