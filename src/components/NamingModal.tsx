import { useState } from "react";
import { Bot } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCompanion } from "@/contexts/CompanionContext";
import { useLanguage } from "@/hooks/useLanguage";

const SUGGESTIONS = ["Max", "Luna", "Nova", "Ace", "Rio", "Zara"];

export default function NamingModal() {
  const { setupDone, setSetupDone, setCompanionName, clientId } = useCompanion();
  const { language } = useLanguage();
  const en = language === "en";
  const [name, setName] = useState("Max");
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
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backdropFilter: "blur(6px)", background: "rgba(6,10,15,0.75)" }}
    >
      <div
        className="w-[300px] overflow-hidden rounded-2xl shadow-2xl"
        style={{ background: "#111827", border: "1px solid rgba(8,145,178,0.25)" }}
      >
        {/* Header */}
        <div
          className="px-6 pt-8 pb-6 text-center"
          style={{ background: "linear-gradient(160deg,#0c1a2e,#0f2040)", borderBottom: "1px solid rgba(255,255,255,0.05)" }}
        >
          <div
            className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center"
            style={{ background: "linear-gradient(135deg,#0891B2,#84CC16)", boxShadow: "0 0 30px rgba(8,145,178,0.4)" }}
          >
            <Bot className="w-7 h-7 text-white" />
          </div>
          <h2 className="text-lg font-bold text-white mb-2">
            {en ? "Welcome to Connecta" : "Bienvenido a Connecta"}
          </h2>
          <p className="text-sm text-white/40 leading-relaxed">
            {en
              ? "Your AI assistant is ready. What should we call it?"
              : "Tu asistente de IA está listo. ¿Cómo lo llamamos?"}
          </p>
        </div>

        {/* Body */}
        <div className="p-5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-white/35 mb-2">
            {en ? "Name your assistant" : "Nombra a tu asistente"}
          </p>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={20}
            className="w-full text-center text-sm font-semibold text-white rounded-xl px-4 py-3 outline-none"
            style={{
              background: "rgba(255,255,255,0.05)",
              border: "1.5px solid rgba(8,145,178,0.3)",
              boxShadow: "0 0 0 3px rgba(8,145,178,0.08)",
            }}
          />
          <div className="flex flex-wrap gap-2 justify-center mt-3">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => setName(s)}
                className="text-[11px] font-semibold px-3 py-1.5 rounded-full transition-colors hover:text-[#22d3ee]"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  color: "rgba(255,255,255,0.45)",
                }}
              >
                {s}
              </button>
            ))}
          </div>
          <button
            disabled={saving || !name.trim()}
            onClick={() => saveAndClose(name)}
            className="mt-4 w-full py-3 rounded-xl text-white font-bold text-sm disabled:opacity-50 transition-all hover:brightness-110"
            style={{ background: "linear-gradient(135deg,#0891B2,#84CC16)", boxShadow: "0 4px 20px rgba(8,145,178,0.35)" }}
          >
            {en ? `Start with ${name || "AI"} →` : `Empezar con ${name || "AI"} →`}
          </button>
          <button
            onClick={() => saveAndClose("AI")}
            className="w-full text-center text-[11px] text-white/25 mt-3 hover:text-white/40 transition-colors"
          >
            {en ? "Skip, I'll name it later" : "Saltar, lo nombraré después"}
          </button>
        </div>
      </div>
    </div>
  );
}
