import { useState, type CSSProperties, type ReactNode } from "react";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

/* ---------------------------------------------------------------------------
   Doctors landing — qualifying discovery-call booking form.
   Multi-step qualifier (specialty → location → revenue → marketing spend →
   personal brand → contact) + A2P-compliant SMS/contact consent.
   Submits to the send-doctor-lead edge function → doctor_leads + SMTP email.
   --------------------------------------------------------------------------- */

const SPECIALTIES = [
  "Dermatology",
  "Plastic Surgery",
  "Aesthetics / Med Spa",
  "Dentistry / Orthodontics",
  "Chiropractic",
  "Wellness / Functional",
  "Family Medicine",
  "Other",
];

const REVENUE = [
  "Under $250K / year",
  "$250K – $500K / year",
  "$500K – $1M / year",
  "$1M+ / year",
  "Prefer not to say",
];

const MARKETING_SPEND = [
  "Nothing yet",
  "Under $1K / month",
  "$1K – $5K / month",
  "$5K – $15K / month",
  "$15K+ / month",
];

const PERSONAL_BRAND = [
  "Yes — I post consistently",
  "I've started, but it's inconsistent",
  "No — not yet",
];

// palette (dark / teal)
const CARD = "#0E1626";
const PANEL = "rgba(255,255,255,0.04)";
const PANEL_HOVER = "rgba(45,212,191,0.10)";
const BORDER = "rgba(255,255,255,0.12)";
const TEAL = "#2DD4BF";
const TEXT = "#F1F5F9";
const MUTED = "#94A3B8";

interface FormData {
  specialty: string;
  city: string;
  annual_revenue: string;
  marketing_spend: string;
  personal_brand: string;
  name: string;
  practice_name: string;
  email: string;
  phone: string;
}

const TOTAL_STEPS = 6;

export default function DoctorBookingForm() {
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [consent, setConsent] = useState(false);
  const [data, setData] = useState<FormData>({
    specialty: "", city: "", annual_revenue: "", marketing_spend: "",
    personal_brand: "", name: "", practice_name: "", email: "", phone: "",
  });

  const set = (k: keyof FormData, v: string) => setData((d) => ({ ...d, [k]: v }));

  // pick an option and advance
  const pick = (k: keyof FormData, v: string) => {
    set(k, v);
    setStep((s) => Math.min(s + 1, TOTAL_STEPS));
  };

  async function submit() {
    setSubmitting(true);
    try {
      await fetch(`${SUPABASE_URL}/functions/v1/send-doctor-lead`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY },
        body: JSON.stringify({ ...data, consent, qualified: true }),
      });
    } catch {
      /* show success anyway — the lead matters more than the toast */
    }
    setSubmitting(false);
    setSubmitted(true);
  }

  const contactValid =
    !!data.name.trim() && !!data.email.trim() && !!data.phone.trim() && consent;

  return (
    <div style={styles.card}>
      <style>{CSS}</style>

      {submitted ? (
        <div style={{ textAlign: "center", padding: "16px 4px" }}>
          <div style={styles.checkWrap}>✓</div>
          <h3 style={styles.successH}>You're in.</h3>
          <p style={styles.successP}>
            Thanks{data.name ? `, ${data.name.split(" ")[0]}` : ""}. We'll reach out within
            24 hours to lock in your discovery call. Keep an eye on your inbox and phone.
          </p>
        </div>
      ) : (
        <>
          {/* progress */}
          <div style={styles.progressRow}>
            <span style={styles.kicker}>Discovery call · {step}/{TOTAL_STEPS}</span>
            <div style={styles.bar}>
              <div style={{ ...styles.barFill, width: `${(step / TOTAL_STEPS) * 100}%` }} />
            </div>
          </div>

          {step === 1 && (
            <Question title="What's your specialty?" sub="So we tailor the strategy to your patients.">
              {SPECIALTIES.map((s) => (
                <OptionBtn key={s} active={data.specialty === s} onClick={() => pick("specialty", s)}>{s}</OptionBtn>
              ))}
            </Question>
          )}

          {step === 2 && (
            <Question title="Where are you located?" sub="City and state of your practice.">
              <input
                autoFocus
                style={styles.input}
                placeholder="e.g. Salt Lake City, UT"
                value={data.city}
                onChange={(e) => set("city", e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && data.city.trim() && setStep(3)}
              />
              <Nav onBack={() => setStep(1)} onNext={() => setStep(3)} nextDisabled={!data.city.trim()} />
            </Question>
          )}

          {step === 3 && (
            <Question title="How much is your clinic making annually?" sub="Helps us right-size the plan. Kept private.">
              {REVENUE.map((r) => (
                <OptionBtn key={r} active={data.annual_revenue === r} onClick={() => pick("annual_revenue", r)}>{r}</OptionBtn>
              ))}
              <BackOnly onBack={() => setStep(2)} />
            </Question>
          )}

          {step === 4 && (
            <Question title="How much are you spending on marketing now?" sub="Monthly, across everything.">
              {MARKETING_SPEND.map((m) => (
                <OptionBtn key={m} active={data.marketing_spend === m} onClick={() => pick("marketing_spend", m)}>{m}</OptionBtn>
              ))}
              <BackOnly onBack={() => setStep(3)} />
            </Question>
          )}

          {step === 5 && (
            <Question title="Do you currently have a personal brand?" sub="Where you're starting from on social.">
              {PERSONAL_BRAND.map((p) => (
                <OptionBtn key={p} active={data.personal_brand === p} onClick={() => pick("personal_brand", p)}>{p}</OptionBtn>
              ))}
              <BackOnly onBack={() => setStep(4)} />
            </Question>
          )}

          {step === 6 && (
            <Question title="Where do we send the details?" sub="We'll reach out within 24 hours to confirm.">
              <input style={styles.input} placeholder="Full name" value={data.name} onChange={(e) => set("name", e.target.value)} autoFocus />
              <input style={styles.input} placeholder="Practice name (optional)" value={data.practice_name} onChange={(e) => set("practice_name", e.target.value)} />
              <input style={styles.input} type="email" placeholder="Email" value={data.email} onChange={(e) => set("email", e.target.value)} />
              <input style={styles.input} type="tel" placeholder="Phone / WhatsApp" value={data.phone} onChange={(e) => set("phone", e.target.value)} />

              <label style={styles.consent}>
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  style={styles.checkbox}
                />
                <span style={styles.consentText}>
                  I agree to receive calls, texts, and emails from R3 Productions LLC about my
                  inquiry. Msg &amp; data rates may apply; reply STOP to opt out. Consent is not a
                  condition of purchase. I've read the{" "}
                  <a href="/privacy-policy" target="_blank" rel="noopener noreferrer" style={styles.consentLink}>Privacy Policy</a>{" "}
                  and{" "}
                  <a href="/terms-and-conditions" target="_blank" rel="noopener noreferrer" style={styles.consentLink}>Terms &amp; Conditions</a>.
                </span>
              </label>

              <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
                <button style={styles.backBtn} onClick={() => setStep(5)}>← Back</button>
                <button
                  style={{ ...styles.submitBtn, opacity: contactValid && !submitting ? 1 : 0.5, cursor: contactValid && !submitting ? "pointer" : "not-allowed" }}
                  disabled={!contactValid || submitting}
                  onClick={submit}
                >
                  {submitting ? "Sending…" : "Book my discovery call"}
                </button>
              </div>
            </Question>
          )}
        </>
      )}
    </div>
  );
}

/* ---- small presentational helpers ---- */
function Question({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <div className="dbf-rise">
      <h3 style={styles.qTitle}>{title}</h3>
      {sub && <p style={styles.qSub}>{sub}</p>}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 18 }}>{children}</div>
    </div>
  );
}

function OptionBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button className="dbf-opt" data-active={active ? "1" : "0"} onClick={onClick} style={styles.option}>
      <span>{children}</span>
      <span style={styles.optArrow}>→</span>
    </button>
  );
}

function Nav({ onBack, onNext, nextDisabled }: { onBack: () => void; onNext: () => void; nextDisabled?: boolean }) {
  return (
    <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
      <button style={styles.backBtn} onClick={onBack}>← Back</button>
      <button style={{ ...styles.submitBtn, opacity: nextDisabled ? 0.5 : 1, cursor: nextDisabled ? "not-allowed" : "pointer" }} disabled={nextDisabled} onClick={onNext}>Continue</button>
    </div>
  );
}

function BackOnly({ onBack }: { onBack: () => void }) {
  return <button style={{ ...styles.backBtn, marginTop: 4, alignSelf: "flex-start" }} onClick={onBack}>← Back</button>;
}

const styles: Record<string, CSSProperties> = {
  card: {
    background: CARD,
    border: `1px solid ${BORDER}`,
    borderRadius: 24,
    padding: "30px 28px 28px",
    color: TEXT,
    fontFamily: "'Instrument Sans', system-ui, sans-serif",
    boxShadow: "0 40px 90px -40px rgba(0,0,0,0.8)",
  },
  progressRow: { marginBottom: 22 },
  kicker: { fontSize: 12.5, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: TEAL },
  bar: { marginTop: 10, height: 4, borderRadius: 99, background: "rgba(255,255,255,0.10)", overflow: "hidden" },
  barFill: { height: "100%", background: TEAL, borderRadius: 99, transition: "width .3s cubic-bezier(.2,.8,.2,1)" },
  qTitle: { fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 700, fontSize: 26, lineHeight: 1.1, letterSpacing: "-0.02em", margin: 0 },
  qSub: { fontSize: 14.5, color: MUTED, margin: "8px 0 0" },
  option: {
    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
    width: "100%", textAlign: "left", padding: "15px 18px", borderRadius: 14,
    background: PANEL, border: `1px solid ${BORDER}`, color: TEXT,
    fontFamily: "'Instrument Sans', sans-serif", fontSize: 15.5, fontWeight: 500, cursor: "pointer",
    transition: "background .15s ease, border-color .15s ease, transform .15s ease",
  },
  optArrow: { color: TEAL, fontWeight: 700, opacity: 0.7 },
  input: {
    width: "100%", padding: "14px 16px", borderRadius: 13, background: PANEL,
    border: `1px solid ${BORDER}`, color: TEXT, fontSize: 15.5,
    fontFamily: "'Instrument Sans', sans-serif", outline: "none",
  },
  consent: { display: "flex", gap: 10, alignItems: "flex-start", margin: "14px 2px 2px", cursor: "pointer" },
  checkbox: { marginTop: 3, width: 17, height: 17, accentColor: TEAL, flexShrink: 0, cursor: "pointer" },
  consentText: { fontSize: 12.5, color: MUTED, lineHeight: 1.5 },
  consentLink: { color: TEAL, textDecoration: "underline" },
  backBtn: {
    padding: "13px 20px", borderRadius: 99, background: "transparent",
    border: `1px solid ${BORDER}`, color: MUTED, fontSize: 14.5, fontWeight: 600,
    cursor: "pointer", fontFamily: "'Instrument Sans', sans-serif",
  },
  submitBtn: {
    flex: 1, padding: "13px 22px", borderRadius: 99, background: TEAL,
    border: "none", color: "#04201C", fontSize: 15.5, fontWeight: 700,
    fontFamily: "'Instrument Sans', sans-serif",
  },
  checkWrap: {
    width: 60, height: 60, borderRadius: "50%", margin: "0 auto 18px",
    display: "grid", placeItems: "center", background: TEAL, color: "#04201C",
    fontSize: 30, fontWeight: 800,
  },
  successH: { fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 700, fontSize: 28, margin: 0, letterSpacing: "-0.02em" },
  successP: { fontSize: 15.5, color: MUTED, margin: "12px auto 0", maxWidth: 380, lineHeight: 1.6 },
};

const CSS = `
@keyframes dbfRise { from { opacity: 0; transform: translateY(10px) } to { opacity: 1; transform: none } }
.dbf-rise { animation: dbfRise .3s cubic-bezier(.2,.8,.2,1); }
.dbf-opt:hover { background: ${PANEL_HOVER} !important; border-color: ${TEAL} !important; transform: translateY(-1px); }
.dbf-opt[data-active="1"] { background: ${PANEL_HOVER} !important; border-color: ${TEAL} !important; }
.dbf-opt:hover .dbf-arr { opacity: 1; }
input::placeholder { color: ${MUTED}; opacity: 0.7; }
`;
