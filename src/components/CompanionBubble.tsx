import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Bot, X, ChevronRight, Send } from "lucide-react";
import { useCompanion } from "@/contexts/CompanionContext";
import { useLanguage } from "@/hooks/useLanguage";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

export default function CompanionBubble() {
  const { companionName, tasks, isOpen, setIsOpen, autonomyMode, setAutonomyMode } = useCompanion();
  const { user } = useAuth();
  const { language } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const en = language === "en";
  const [chatInput, setChatInput] = useState("");
  const [sending, setSending] = useState(false);
  const [panelMessages, setPanelMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);

  const urgentTasks = tasks.filter((t) => t.priority === "red" || t.priority === "amber").slice(0, 2);
  const badgeCount = tasks.filter((t) => t.priority === "red" || t.priority === "amber").length;

  const sendMessage = async () => {
    if (!chatInput.trim() || sending || !user) return;
    const userMsg = chatInput.trim();
    setChatInput("");
    setSending(true);
    setPanelMessages((prev) => [...prev, { role: "user", content: userMsg }]);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data } = await supabase.functions.invoke("companion-chat", {
        body: { message: userMsg, companion_name: companionName, current_path: location.pathname, autonomy_mode: autonomyMode },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (data?.reply) {
        setPanelMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
      }
      // Execute actions returned by the AI
      if (data?.actions) {
        for (const action of data.actions) {
          if (action.type === "navigate") {
            navigate(action.path);
          }
          if (action.type === "fill_onboarding") {
            window.dispatchEvent(new CustomEvent("companion:fill-onboarding", { detail: action.fields }));
          }
        }
      }
    } finally {
      setSending(false);
    }
  };

  if (!user) return null;

  return (
    <>
      {/* Floating bubble */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-5 right-5 z-50 flex items-center justify-center rounded-full shadow-lg transition-transform hover:scale-105 active:scale-95"
        style={{ width: 52, height: 52, background: "linear-gradient(135deg,#0891B2,#84CC16)", boxShadow: "0 4px 24px rgba(8,145,178,0.45)" }}
        aria-label={en ? `Open ${companionName}` : `Abrir ${companionName}`}
      >
        {badgeCount > 0 && !isOpen && (
          <span
            className="absolute inset-[-5px] rounded-full border-2 border-[rgba(8,145,178,0.4)] animate-ping"
            style={{ animationDuration: "2.2s" }}
          />
        )}
        {isOpen ? <X className="w-5 h-5 text-white" /> : <Bot className="w-5 h-5 text-white" />}
        {badgeCount > 0 && !isOpen && (
          <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
            {badgeCount}
          </span>
        )}
      </button>

      {/* Compact panel */}
      {isOpen && (
        <div
          className="fixed bottom-20 right-5 z-50 w-[340px] rounded-2xl overflow-hidden shadow-2xl"
          style={{ background: "#111827", border: "1px solid rgba(8,145,178,0.2)", boxShadow: "0 24px 64px rgba(0,0,0,0.7)" }}
        >
          {/* Panel header */}
          <div
            className="flex items-center gap-3 px-4 py-3"
            style={{ background: "linear-gradient(135deg,#0c1524,#111d35)", borderBottom: "1px solid rgba(255,255,255,0.05)" }}
          >
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ background: "linear-gradient(135deg,#0891B2,#84CC16)" }}
            >
              <Bot className="w-4 h-4 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white">{companionName}</p>
              <p className="text-[10px] text-white/35 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#22d3ee] animate-pulse inline-block" />
                {en ? "Online" : "En línea"}
              </p>
            </div>
            <button
              onClick={() => { navigate("/ai"); setIsOpen(false); }}
              className="text-[11px] font-semibold text-[#22d3ee] flex items-center gap-0.5 hover:opacity-80 transition-opacity"
            >
              {en ? "See all" : "Ver todo"} <ChevronRight className="w-3 h-3" />
            </button>
          </div>

          {/* Autonomy mode toggle */}
          <div className="flex items-center gap-1.5 px-3 py-2" style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
            {([
              { key: "auto", label: "Auto", icon: "⚡" },
              { key: "ask", label: "Ask", icon: "?" },
              { key: "plan", label: "Plan", icon: "≡" },
            ] as const).map((m) => (
              <button
                key={m.key}
                onClick={() => setAutonomyMode(m.key)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium transition-all"
                style={{
                  background: autonomyMode === m.key ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.04)",
                  color: autonomyMode === m.key ? "#e5e5e5" : "rgba(255,255,255,0.3)",
                  border: autonomyMode === m.key ? "1px solid rgba(255,255,255,0.15)" : "1px solid rgba(255,255,255,0.06)",
                }}
              >
                <span style={{ fontSize: 10 }}>{m.icon}</span>
                {m.label}
              </button>
            ))}
          </div>

          {/* Urgent tasks */}
          {urgentTasks.length > 0 && panelMessages.length === 0 && (
            <div className="px-3 pt-3 space-y-2">
              {urgentTasks.map((task) => (
                <div
                  key={task.id}
                  className="rounded-xl p-3 flex items-start gap-2.5"
                  style={{
                    background: task.priority === "red" ? "rgba(239,68,68,0.04)" : "rgba(245,158,11,0.04)",
                    border: `1px solid ${task.priority === "red" ? "rgba(239,68,68,0.2)" : "rgba(245,158,11,0.18)"}`,
                  }}
                >
                  <div
                    className="w-2 h-2 rounded-full flex-shrink-0 mt-1.5"
                    style={{ background: task.priority === "red" ? "#ef4444" : "#f59e0b" }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-semibold text-white leading-tight">
                      {en ? task.titleEn : task.titleEs}
                    </p>
                    <p className="text-[10px] text-white/40 mt-0.5 leading-relaxed">
                      {en ? task.subtitleEn : task.subtitleEs}
                    </p>
                  </div>
                  <button
                    onClick={() => { navigate(task.actionPath); setIsOpen(false); }}
                    className="text-[10px] font-semibold px-2.5 py-1.5 rounded-lg flex-shrink-0 transition-opacity hover:opacity-80"
                    style={{ background: "rgba(8,145,178,0.15)", color: "#22d3ee", border: "1px solid rgba(8,145,178,0.25)" }}
                  >
                    {en ? task.actionLabelEn : task.actionLabelEs}
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Chat messages */}
          {panelMessages.length > 0 && (
            <div className="px-3 pt-3 space-y-2 max-h-[200px] overflow-y-auto">
              {panelMessages.map((msg, i) => (
                <div key={i} className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  {msg.role === "assistant" && (
                    <div className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center mt-0.5" style={{ background: "linear-gradient(135deg,#0891B2,#84CC16)" }}>
                      <Bot className="w-3 h-3 text-white" />
                    </div>
                  )}
                  <div
                    className="max-w-[220px] text-[12px] px-3 py-2 rounded-xl leading-relaxed"
                    style={msg.role === "assistant"
                      ? { background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.85)", borderRadius: "4px 12px 12px 12px" }
                      : { background: "linear-gradient(135deg,#0891B2,#0e7490)", color: "#fff", borderRadius: "12px 4px 12px 12px" }
                    }
                  >
                    {msg.content}
                  </div>
                </div>
              ))}
              {sending && (
                <div className="flex gap-2">
                  <div className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center" style={{ background: "linear-gradient(135deg,#0891B2,#84CC16)" }}>
                    <Bot className="w-3 h-3 text-white" />
                  </div>
                  <div className="flex gap-1 items-center px-3 py-2 rounded-xl" style={{ background: "rgba(255,255,255,0.06)" }}>
                    {[0, 1, 2].map((i) => (
                      <span key={i} className="w-1.5 h-1.5 rounded-full bg-white/40 animate-bounce" style={{ animationDelay: `${i * 0.1}s` }} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Chat input */}
          <div className="p-3 pt-3" style={{ borderTop: "1px solid rgba(255,255,255,0.05)", marginTop: 8 }}>
            <div
              className="flex items-center gap-2 rounded-xl px-3 py-2"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
            >
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                placeholder={en ? `Ask ${companionName}...` : `Pregúntale a ${companionName}...`}
                className="flex-1 bg-transparent text-[12px] text-white/70 placeholder:text-white/25 outline-none"
              />
              <button
                onClick={sendMessage}
                disabled={!chatInput.trim() || sending}
                className="w-6 h-6 rounded-full flex items-center justify-center disabled:opacity-40 transition-opacity"
                style={{ background: "linear-gradient(135deg,#0891B2,#84CC16)" }}
              >
                <Send className="w-3 h-3 text-white" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
