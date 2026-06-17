import { useState, useEffect, useRef } from "react";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const NICHES = [
  "Health & Wellness",
  "Fitness & Nutrition",
  "Real Estate",
  "Legal Services",
  "Coaches",
  "Other",
];

const REVENUE_OPTIONS = [
  "Less than $3,000 / month",
  "Between $3,000 and $10,000 / month",
  "Between $10,000 and $30,000 / month",
  "More than $30,000 / month",
];

const INVEST_OPTIONS = [
  { label: "Yes, I'm ready to invest", qualified: true },
  { label: "I need more information first", qualified: true },
  { label: "In the next 30 to 60 days", qualified: true },
  { label: "Not the right time yet", qualified: false },
];

type Branch = "fisico" | "online" | null;

interface FormData {
  niche: string;
  business_type: Branch;
  city: string;
  state: string;
  revenue_range: string;
  investment_ready: string;
  name: string;
  phone: string;
  email: string;
}

const BRAND = "#4FB5BC";
const BG = "#8FD0D5";
const CARD = "#ffffff";
const BORDER = "#e5e7eb";
const TEXT = "#0a0a0a";
const MUTED = "#6b7280";

export default function LeadFormEN({ variant = "section" }: { variant?: "section" | "modal" }) {
  const isModal = variant === "modal";
  const [step, setStep] = useState(1);
  const [branch, setBranch] = useState<Branch>(null);
  const [data, setData] = useState<FormData>({
    niche: "", business_type: null, city: "", state: "",
    revenue_range: "", investment_ready: "", name: "", phone: "", email: "",
  });
  const [cityLoading, setCityLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<"qualified" | "disqualified" | null>(null);
  const formRef = useRef<HTMLDivElement>(null);

  const totalSteps = branch === "fisico" ? 7 : branch === "online" ? 5 : 7;

  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [step]);

  useEffect(() => {
    if (step === 3 && branch === "fisico" && !data.city) {
      setCityLoading(true);
      navigator.geolocation?.getCurrentPosition(
        async (pos) => {
          try {
            const res = await fetch(
              `https://nominatim.openstreetmap.org/reverse?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&format=json`
            );
            const geo = await res.json();
            setData((d) => ({
              ...d,
              city: geo.address?.city || geo.address?.town || geo.address?.village || "",
              state: geo.address?.state || "",
            }));
          } catch { /* ignore */ }
          setCityLoading(false);
        },
        () => setCityLoading(false)
      );
    }
  }, [step, branch]);

  useEffect(() => {
    if (step === 4 && branch === "fisico" && !verified) {
      setVerifying(true);
      const t = setTimeout(() => { setVerifying(false); setVerified(true); }, 3000);
      return () => clearTimeout(t);
    }
  }, [step, branch, verified]);

  function pick<K extends keyof FormData>(key: K, value: FormData[K]) {
    setData((d) => ({ ...d, [key]: value }));
  }

  function next() { setStep((s) => s + 1); }

  async function submit() {
    const isQualified = INVEST_OPTIONS.find((o) => o.label === data.investment_ready)?.qualified ?? true;
    const status = isQualified ? "calificado" : "no_calificado";
    setSubmitting(true);
    try {
      await fetch(`${SUPABASE_URL}/functions/v1/send-lead-notification`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY },
        body: JSON.stringify({ ...data, business_type: branch, status, source: "1mguarantee" }),
      });
    } catch { /* show success anyway */ }
    setSubmitting(false);
    setSubmitted(isQualified ? "qualified" : "disqualified");
  }

  const StepDots = () => (
    <div style={{ display: "flex", gap: 6, justifyContent: "center", marginBottom: 28 }}>
      {Array.from({ length: totalSteps }).map((_, i) => (
        <div
          key={i}
          style={{
            width: i + 1 === step ? 20 : 8,
            height: 8,
            borderRadius: 4,
            background: i + 1 <= step ? BRAND : BORDER,
            transition: "all 0.3s",
          }}
        />
      ))}
    </div>
  );

  const OptionGrid = ({
    options, cols = 2, value, onSelect,
  }: { options: string[]; cols?: number; value: string; onSelect: (v: string) => void }) => (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 10 }}>
      {options.map((opt) => (
        <button
          key={opt}
          onClick={() => onSelect(opt)}
          style={{
            padding: "14px 12px",
            borderRadius: 8,
            border: `2px solid ${value === opt ? BRAND : BORDER}`,
            background: value === opt ? `${BRAND}1a` : "#f9fafb",
            color: value === opt ? BRAND : TEXT,
            fontFamily: "'Montserrat', sans-serif",
            fontWeight: value === opt ? 700 : 500,
            fontSize: 13,
            cursor: "pointer",
            textAlign: "left",
            transition: "all 0.15s",
          }}
        >
          {opt}
        </button>
      ))}
    </div>
  );

  const NextBtn = ({ disabled, onClick }: { disabled?: boolean; onClick?: () => void }) => (
    <button
      disabled={disabled}
      onClick={onClick || next}
      style={{
        marginTop: 24,
        width: "100%",
        padding: "16px",
        background: disabled ? "#333" : BRAND,
        color: disabled ? MUTED : "#fff",
        fontFamily: "'Montserrat', sans-serif",
        fontWeight: 700,
        fontSize: 14,
        letterSpacing: "0.08em",
        textTransform: "uppercase" as const,
        border: "none",
        borderRadius: 8,
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "background 0.15s",
      }}
    >
      CONTINUE →
    </button>
  );

  const Q = ({ text }: { text: string }) => (
    <p style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 700, fontSize: 18, color: TEXT, marginBottom: 20, lineHeight: 1.4 }}>
      {text}
    </p>
  );

  if (submitted === "qualified") {
    return (
      <div ref={formRef} style={isModal ? undefined : { background: BG, padding: "72px 24px" }}>
        <div style={{ maxWidth: 520, margin: "0 auto" }}>
          <div style={{
            background: CARD,
            borderRadius: 16,
            padding: "48px 32px",
            boxShadow: "0 12px 40px rgba(0,0,0,0.12)",
            textAlign: "center",
          }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
            <p style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 700, fontSize: 22, color: TEXT, marginBottom: 12 }}>
              Application received, {data.name.split(" ")[0]}!
            </p>
            <p style={{ fontFamily: "'Montserrat', sans-serif", fontSize: 16, color: MUTED, lineHeight: 1.6 }}>
              A strategist from Connecta Creators will contact you within the next 24 hours via WhatsApp.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (submitted === "disqualified") {
    return (
      <div ref={formRef} style={isModal ? undefined : { background: BG, padding: "72px 24px" }}>
        <div style={{ maxWidth: 520, margin: "0 auto" }}>
          <div style={{
            background: CARD,
            borderRadius: 16,
            padding: "48px 32px",
            boxShadow: "0 12px 40px rgba(0,0,0,0.12)",
            textAlign: "center",
          }}>
            <p style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 700, fontSize: 20, color: TEXT, marginBottom: 12 }}>
              Thanks for your interest.
            </p>
            <p style={{ fontFamily: "'Montserrat', sans-serif", fontSize: 15, color: MUTED, lineHeight: 1.6 }}>
              When you're ready to take the next step, we'll be here. We'll keep you on our list.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const renderStep = () => {
    if (step === 1) return (
      <>
        <Q text="What's your niche or industry?" />
        <OptionGrid options={NICHES} cols={2} value={data.niche} onSelect={(v) => { pick("niche", v); }} />
        <NextBtn disabled={!data.niche} />
      </>
    );

    if (step === 2) return (
      <>
        <Q text="Do you have a physical business or sell online?" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {[
            { label: "Physical business", icon: "🏢", value: "fisico" as Branch },
            { label: "I sell online", icon: "💻", value: "online" as Branch },
          ].map((opt) => (
            <button
              key={opt.value}
              onClick={() => {
                pick("business_type", opt.value);
                setBranch(opt.value);
                next();
              }}
              style={{
                padding: "24px 16px",
                borderRadius: 10,
                border: `2px solid ${data.business_type === opt.value ? BRAND : BORDER}`,
                background: data.business_type === opt.value ? `${BRAND}1a` : "#f9fafb",
                color: TEXT,
                fontFamily: "'Montserrat', sans-serif",
                fontWeight: 700,
                fontSize: 15,
                cursor: "pointer",
                textAlign: "center" as const,
                display: "flex",
                flexDirection: "column" as const,
                alignItems: "center",
                gap: 10,
              }}
            >
              <span style={{ fontSize: 32 }}>{opt.icon}</span>
              {opt.label}
            </button>
          ))}
        </div>
      </>
    );

    if (step === 3 && branch === "fisico") return (
      <>
        <Q text="Where is your business located?" />
        {cityLoading ? (
          <p style={{ color: MUTED, fontFamily: "'Montserrat', sans-serif", fontSize: 14, marginBottom: 16 }}>
            Detecting location...
          </p>
        ) : null}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {[
            { label: "City", key: "city" as const },
            { label: "State", key: "state" as const },
          ].map((f) => (
            <input
              key={f.key}
              placeholder={f.label}
              value={data[f.key]}
              onChange={(e) => pick(f.key, e.target.value)}
              style={{
                padding: "14px 16px",
                borderRadius: 8,
                border: `1px solid ${BORDER}`,
                background: "#f9fafb",
                color: TEXT,
                fontFamily: "'Montserrat', sans-serif",
                fontSize: 15,
                outline: "none",
              }}
            />
          ))}
        </div>
        <NextBtn disabled={!data.city.trim()} />
      </>
    );

    if (step === 4 && branch === "fisico") return (
      <>
        {verifying ? (
          <div style={{ textAlign: "center", padding: "40px 0" }}>
            <div style={{
              width: 40, height: 40, border: `3px solid ${BORDER}`,
              borderTop: `3px solid #f59e0b`,
              borderRadius: "50%", margin: "0 auto 20px",
              animation: "spin 1s linear infinite",
            }} />
            <p style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 600, fontSize: 16, color: TEXT }}>
              Checking availability in {data.city}...
            </p>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        ) : verified ? (
          <div style={{ textAlign: "center", padding: "24px 0" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
            <p style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 700, fontSize: 18, color: "#22c55e", marginBottom: 8 }}>
              Your city is available!
            </p>
            <p style={{ fontFamily: "'Montserrat', sans-serif", fontSize: 14, color: "#f59e0b" }}>
              Limited spots — secure yours now.
            </p>
            <NextBtn />
          </div>
        ) : null}
      </>
    );

    const isRevenueStep = (branch === "online" && step === 3) || (branch === "fisico" && step === 5);
    if (isRevenueStep) return (
      <>
        <Q text="How much does your business currently generate per month?" />
        <OptionGrid options={REVENUE_OPTIONS} cols={1} value={data.revenue_range} onSelect={(v) => pick("revenue_range", v)} />
        <NextBtn disabled={!data.revenue_range} />
      </>
    );

    const isInvestStep = (branch === "online" && step === 4) || (branch === "fisico" && step === 6);
    if (isInvestStep) return (
      <>
        <Q text="Are you willing to invest between $1,500 and $4,000 a month to grow your business?" />
        <OptionGrid
          options={INVEST_OPTIONS.map((o) => o.label)}
          cols={1}
          value={data.investment_ready}
          onSelect={(v) => pick("investment_ready", v)}
        />
        <NextBtn disabled={!data.investment_ready} />
      </>
    );

    const isContactStep = (branch === "online" && step === 5) || (branch === "fisico" && step === 7);
    if (isContactStep) return (
      <>
        <Q text="Almost done! How should we reach you?" />
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {[
            { label: "Full name", key: "name" as const, type: "text" },
            { label: "WhatsApp number", key: "phone" as const, type: "tel" },
            { label: "Email address", key: "email" as const, type: "email" },
          ].map((f) => (
            <input
              key={f.key}
              type={f.type}
              placeholder={f.label}
              value={data[f.key] as string}
              onChange={(e) => pick(f.key, e.target.value)}
              style={{
                padding: "14px 16px",
                borderRadius: 8,
                border: `1px solid ${BORDER}`,
                background: "#f9fafb",
                color: TEXT,
                fontFamily: "'Montserrat', sans-serif",
                fontSize: 15,
                outline: "none",
              }}
            />
          ))}
        </div>
        <button
          disabled={submitting || !data.name.trim() || !data.phone.trim() || !data.email.trim()}
          onClick={submit}
          style={{
            marginTop: 24,
            width: "100%",
            padding: "18px",
            background: submitting || !data.name.trim() ? "#333" : BRAND,
            color: !data.name.trim() ? MUTED : "#fff",
            fontFamily: "'Montserrat', sans-serif",
            fontWeight: 900,
            fontSize: 14,
            letterSpacing: "0.1em",
            textTransform: "uppercase" as const,
            border: "none",
            borderRadius: 8,
            cursor: "pointer",
          }}
        >
          {submitting ? "SENDING..." : "REQUEST MY FREE STRATEGY CALL"}
        </button>
      </>
    );

    return null;
  };

  return (
    <div ref={formRef} id={isModal ? undefined : "apply"} style={isModal ? undefined : { background: BG, padding: "72px 24px" }}>
      <div style={{ maxWidth: 520, margin: "0 auto" }}>
        <div style={{
          background: CARD,
          borderRadius: 16,
          padding: "40px 32px",
          boxShadow: "0 12px 40px rgba(0,0,0,0.12)",
        }}>
          <p style={{
            fontFamily: "'Montserrat', sans-serif", fontWeight: 600, fontSize: "clamp(19px, 3.8vw, 26px)",
            textTransform: "uppercase", color: TEXT, textAlign: "center", marginBottom: 8, letterSpacing: "0.01em",
          }}>
            Apply to work with us
          </p>
          <p style={{
            fontFamily: "'Montserrat', sans-serif", fontSize: 14, color: MUTED,
            textAlign: "center", marginBottom: 28,
          }}>
            We accept a maximum of 5 new clients per month.
          </p>

          <StepDots />

          {renderStep()}
        </div>
      </div>
    </div>
  );
}
