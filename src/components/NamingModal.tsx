import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompanion } from "@/contexts/CompanionContext";
import { useLanguage } from "@/hooks/useLanguage";
import connectaFavicon from "@/assets/connecta-favicon-icon.png";

export default function NamingModal() {
  const { setupDone, setSetupDone, setCompanionName, clientId } = useCompanion();
  const { language } = useLanguage();
  const en = language === "en";
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  if (setupDone || !clientId) return null;

  const saveAndClose = async (chosenName: string) => {
    setSaving(true);
    const finalName = chosenName.trim() || "AI";
    await supabase.from("companion_state").upsert(
      { client_id: clientId, companion_name: finalName, companion_setup_done: true },
      { onConflict: "client_id" }
    );
    setCompanionName(finalName);
    setSetupDone(true);
    setSaving(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ backdropFilter: "blur(8px)", background: "rgba(15,15,18,0.7)" }}
    >
      <div
        className="w-full max-w-md rounded-2xl px-10 py-12"
        style={{ background: "#16171a", border: "1px solid rgba(255,255,255,0.08)" }}
      >
        <div className="text-center mb-7">
          <img src={connectaFavicon} alt="Connecta" className="w-10 h-10 object-contain mx-auto mb-5 opacity-90" />
          <h2 className="font-caslon text-xl sm:text-2xl font-light text-foreground leading-snug" style={{ letterSpacing: "0.02em" }}>
            {en ? "Welcome to Connecta" : "Bienvenido a Connecta"}
          </h2>
          <p className="text-xs text-muted-foreground mt-2 tracking-wide leading-relaxed max-w-[280px] mx-auto">
            {en
              ? "Your AI assistant is ready. What should we call it?"
              : "Tu asistente de IA está listo. ¿Cómo lo llamamos?"}
          </p>
        </div>

        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/60 mb-2">
          {en ? "Name your assistant" : "Nombra a tu asistente"}
        </p>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={20}
          autoFocus
          className="w-full text-center text-sm font-medium text-foreground rounded-lg px-4 py-3 outline-none transition-colors"
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
          onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.25)'; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; }}
        />

        <button
          disabled={saving || !name.trim()}
          onClick={() => saveAndClose(name)}
          className="relative mt-5 w-full inline-flex items-center justify-center gap-2 py-3 text-sm font-semibold text-white/85 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed overflow-visible"
        >
          <svg className="scribble-btn" viewBox="0 0 320 48" preserveAspectRatio="none" style={{ position: 'absolute', inset: -2, width: 'calc(100% + 4px)', height: 'calc(100% + 4px)', overflow: 'visible', pointerEvents: 'none', opacity: 0 }}>
            <path d="M10,3 C80,1.5 220,1 290,2 C306,2.5 316,5 317,10 C318,18 318,30 317,38 C316,44 306,46 285,47 C200,48 100,48 30,47 C12,46 2,43 2,38 C1,29 1,17 2,10 C2.5,6 5,3.5 10,3 Z" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" style={{ strokeDasharray: 700, strokeDashoffset: 700 }} />
          </svg>
          {en ? `Start with ${name || "AI"} →` : `Empezar con ${name || "AI"} →`}
        </button>

        <button
          onClick={() => saveAndClose("AI")}
          className="w-full text-center text-xs text-muted-foreground/60 mt-4 hover:text-foreground transition-colors"
        >
          {en ? "Skip, I'll name it later" : "Saltar, lo nombraré después"}
        </button>
      </div>
    </div>
  );
}
