import { useState, useEffect, useRef } from "react";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const NICHES = [
  "Salud y Bienestar",
  "Fitness y Nutricion",
  "Dental y Estetica",
  "Bienes Raices",
  "Servicios Legales",
  "Belleza y Cuidado Personal",
  "Restaurantes y Food",
  "Otro",
];

const REVENUE_OPTIONS = [
  "Menos de $3,000 / mes",
  "Entre $3,000 y $10,000 / mes",
  "Entre $10,000 y $30,000 / mes",
  "Mas de $30,000 / mes",
];

const INVEST_OPTIONS = [
  { label: "Si, estoy listo para invertir", qualified: true },
  { label: "Necesito mas informacion primero", qualified: true },
  { label: "En los proximos 30 a 60 dias", qualified: true },
  { label: "Todavia no es el momento", qualified: false },
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

const BRAND = "#0891B2";
const BG = "#111";
const CARD = "#1a1a1a";
const BORDER = "#2a2a2a";
const TEXT = "#f0f0f0";
const MUTED = "#888";

export default function LeadForm() {
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

  // Total steps: 5 for online, 7 for physical (once branch known)
  const totalSteps = branch === "fisico" ? 7 : branch === "online" ? 5 : 7;

  const isFirstRender = useRef(true);
  // Auto-scroll to form when step changes, but not on initial mount
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [step]);

  // Geolocation on step 3 (physical branch)
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

  // City verification animation (step 4, physical branch)
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
        body: JSON.stringify({ ...data, business_type: branch, status }),
      });
    } catch { /* show success anyway */ }
    setSubmitting(false);
    setSubmitted(isQualified ? "qualified" : "disqualified");
  }

  // ── Step dots ──────────────────────────────────────────────
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

  // ── Option grid ────────────────────────────────────────────
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
            background: value === opt ? `${BRAND}22` : CARD,
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
      CONTINUAR →
    </button>
  );

  const Q = ({ text }: { text: string }) => (
    <p style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 700, fontSize: 18, color: TEXT, marginBottom: 20, lineHeight: 1.4 }}>
      {text}
    </p>
  );

  // ── CONFIRMED screens ──────────────────────────────────────
  if (submitted === "qualified") {
    return (
      <div ref={formRef} style={{ background: BG, padding: "60px 24px", textAlign: "center" }}>
        <div style={{ maxWidth: 480, margin: "0 auto" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
          <p style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 700, fontSize: 22, color: TEXT, marginBottom: 12 }}>
            ¡Solicitud recibida, {data.name.split(" ")[0]}!
          </p>
          <p style={{ fontFamily: "'Montserrat', sans-serif", fontSize: 16, color: MUTED, lineHeight: 1.6 }}>
            Un estratega de Connecta Creators se pondrá en contacto contigo en las próximas 24 horas via WhatsApp.
          </p>
        </div>
      </div>
    );
  }

  if (submitted === "disqualified") {
    return (
      <div ref={formRef} style={{ background: BG, padding: "60px 24px", textAlign: "center" }}>
        <div style={{ maxWidth: 480, margin: "0 auto" }}>
          <p style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 700, fontSize: 20, color: TEXT, marginBottom: 12 }}>
            Gracias por tu interés.
          </p>
          <p style={{ fontFamily: "'Montserrat', sans-serif", fontSize: 15, color: MUTED, lineHeight: 1.6 }}>
            Cuando estés listo para dar el siguiente paso, estaremos aquí. Te guardamos en nuestra lista.
          </p>
        </div>
      </div>
    );
  }

  // ── STEP RENDERER ──────────────────────────────────────────
  const renderStep = () => {
    // Step 1 — Nicho
    if (step === 1) return (
      <>
        <Q text="¿Cuál es tu nicho o industria?" />
        <OptionGrid options={NICHES} cols={2} value={data.niche} onSelect={(v) => { pick("niche", v); }} />
        <NextBtn disabled={!data.niche} />
      </>
    );

    // Step 2 — Tipo de negocio
    if (step === 2) return (
      <>
        <Q text="¿Tienes un negocio físico o vendes online?" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {[
            { label: "Negocio físico", icon: "🏢", value: "fisico" as Branch },
            { label: "Vendo online", icon: "💻", value: "online" as Branch },
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
                background: data.business_type === opt.value ? `${BRAND}22` : CARD,
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

    // Step 3A — Ubicación (physical only)
    if (step === 3 && branch === "fisico") return (
      <>
        <Q text="¿Dónde está ubicado tu negocio?" />
        {cityLoading ? (
          <p style={{ color: MUTED, fontFamily: "'Montserrat', sans-serif", fontSize: 14, marginBottom: 16 }}>
            Detectando ubicación...
          </p>
        ) : null}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {[
            { label: "Ciudad", key: "city" as const },
            { label: "Estado", key: "state" as const },
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
                background: CARD,
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

    // Step 4A — Verificación ciudad (physical only)
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
              Verificando disponibilidad en {data.city}...
            </p>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        ) : verified ? (
          <div style={{ textAlign: "center", padding: "24px 0" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
            <p style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 700, fontSize: 18, color: "#22c55e", marginBottom: 8 }}>
              ¡Tu ciudad está disponible!
            </p>
            <p style={{ fontFamily: "'Montserrat', sans-serif", fontSize: 14, color: "#f59e0b" }}>
              Cupos limitados — asegura el tuyo ahora.
            </p>
            <NextBtn />
          </div>
        ) : null}
      </>
    );

    // Revenue step: step 3 for online, step 5 for physical
    const isRevenueStep = (branch === "online" && step === 3) || (branch === "fisico" && step === 5);
    if (isRevenueStep) return (
      <>
        <Q text="¿Cuánto genera tu negocio actualmente por mes?" />
        <OptionGrid options={REVENUE_OPTIONS} cols={1} value={data.revenue_range} onSelect={(v) => pick("revenue_range", v)} />
        <NextBtn disabled={!data.revenue_range} />
      </>
    );

    // Investment step: step 4 for online, step 6 for physical
    const isInvestStep = (branch === "online" && step === 4) || (branch === "fisico" && step === 6);
    if (isInvestStep) return (
      <>
        <Q text="¿Estás dispuesto a invertir entre $1,500 y $4,000 al mes para hacer crecer tu negocio?" />
        <OptionGrid
          options={INVEST_OPTIONS.map((o) => o.label)}
          cols={1}
          value={data.investment_ready}
          onSelect={(v) => pick("investment_ready", v)}
        />
        <NextBtn disabled={!data.investment_ready} />
      </>
    );

    // Contact step: step 5 for online, step 7 for physical
    const isContactStep = (branch === "online" && step === 5) || (branch === "fisico" && step === 7);
    if (isContactStep) return (
      <>
        <Q text="¡Casi listo! ¿Cómo te contactamos?" />
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {[
            { label: "Nombre completo", key: "name" as const, type: "text" },
            { label: "Número de WhatsApp", key: "phone" as const, type: "tel" },
            { label: "Correo electrónico", key: "email" as const, type: "email" },
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
                background: CARD,
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
          {submitting ? "ENVIANDO..." : "SOLICITAR MI ESTRATEGIA GRATUITA"}
        </button>
      </>
    );

    return null;
  };

  return (
    <div ref={formRef} id="aplicar" style={{ background: BG, padding: "72px 24px" }}>
      <div style={{ maxWidth: 520, margin: "0 auto" }}>
        <p style={{
          fontFamily: "'Montserrat', sans-serif", fontWeight: 900, fontSize: "clamp(22px, 5vw, 32px)",
          textTransform: "uppercase", color: "#fff", textAlign: "center", marginBottom: 8,
        }}>
          APLICA PARA TRABAJAR CON NOSOTROS
        </p>
        <p style={{ fontFamily: "'Montserrat', sans-serif", fontSize: 14, color: MUTED, textAlign: "center", marginBottom: 36 }}>
          Aceptamos un máximo de 5 nuevos clientes al mes.
        </p>

        <StepDots />

        <div style={{
          background: CARD, borderRadius: 12, border: `1px solid ${BORDER}`, padding: "32px 28px",
        }}>
          {renderStep()}
        </div>
      </div>
    </div>
  );
}
