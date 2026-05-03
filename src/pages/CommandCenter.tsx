import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Bot, Send } from "lucide-react";
import { useCompanion } from "@/contexts/CompanionContext";
import { useLanguage } from "@/hooks/useLanguage";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import PageTransition from "@/components/PageTransition";

type Tab = "todo" | "done";

export default function CommandCenter() {
  const { companionName, tasks, loadingTasks, refreshTasks, autonomyMode, setAutonomyMode } = useCompanion();
  const { user } = useAuth();
  const { language } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const en = language === "en";
  const [tab, setTab] = useState<Tab>("todo");
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [sending, setSending] = useState(false);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  // Re-fetch tasks every time this page is visited so completed actions clear immediately
  useEffect(() => { refreshTasks(); }, []);

  const todoTasks = tasks.filter((t) => !dismissedIds.has(t.id));
  const urgentCount = todoTasks.filter((t) => t.priority === "red" || t.priority === "amber").length;

  const sendMessage = async () => {
    if (!chatInput.trim() || sending || !user) return;
    const userMsg = chatInput.trim();
    setChatInput("");
    setSending(true);
    setChatMessages((prev) => [...prev, { role: "user", content: userMsg }]);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data } = await supabase.functions.invoke("companion-chat", {
        body: { message: userMsg, companion_name: companionName, current_path: location.pathname, autonomy_mode: autonomyMode },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (data?.reply) {
        setChatMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
      }
      if (data?.actions) {
        for (const action of data.actions) {
          if (action.type === "navigate") navigate(action.path);
          if (action.type === "fill_onboarding") {
            window.dispatchEvent(new CustomEvent("companion:fill-onboarding", { detail: action.fields }));
          }
        }
      }
    } finally {
      setSending(false);
    }
  };

  const dotColor: Record<string, string> = {
    red: "#ef4444",
    amber: "#f59e0b",
    blue: "#22d3ee",
  };

  return (
    <PageTransition className="flex flex-col h-full max-w-2xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ background: "linear-gradient(135deg,#0891B2,#84CC16)" }}
        >
          <Bot className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-lg font-black text-foreground">{companionName}</h1>
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#22d3ee] animate-pulse inline-block" />
            {urgentCount > 0
              ? (en ? `${urgentCount} things need your attention` : `${urgentCount} cosas necesitan tu atención`)
              : (en ? "You're all caught up" : "Estás al día")}
          </p>
        </div>
      </div>

      {/* Autonomy mode toggle */}
      <div className="flex items-center gap-2 mb-4">
        {([
          { key: "auto" as const, label: en ? "Auto" : "Auto", icon: "⚡", desc: en ? "Acts immediately" : "Actúa de inmediato" },
          { key: "ask" as const, label: en ? "Ask" : "Preguntar", icon: "?", desc: en ? "Confirms first" : "Confirma primero" },
          { key: "plan" as const, label: en ? "Plan" : "Plan", icon: "≡", desc: en ? "Shows plan first" : "Plan primero" },
        ]).map((m) => (
          <button
            key={m.key}
            onClick={() => setAutonomyMode(m.key)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium transition-all"
            style={{
              background: autonomyMode === m.key ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.04)",
              color: autonomyMode === m.key ? "#e5e5e5" : "rgba(255,255,255,0.3)",
              border: autonomyMode === m.key ? "1px solid rgba(255,255,255,0.15)" : "1px solid rgba(255,255,255,0.07)",
            }}
            title={m.desc}
          >
            <span style={{ fontSize: 11 }}>{m.icon}</span>
            {m.label}
          </button>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border/40 mb-4">
        {([
          { key: "todo" as Tab, enLabel: "To Do", esLabel: "Por Hacer", count: todoTasks.length },
          { key: "done" as Tab, enLabel: "Done", esLabel: "Hecho", count: 0 },
        ]).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="px-4 py-2 text-[11px] font-semibold relative flex items-center gap-1.5 transition-colors"
            style={{ color: tab === t.key ? "#22d3ee" : "rgba(255,255,255,0.3)" }}
          >
            {en ? t.enLabel : t.esLabel}
            {t.count > 0 && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: "rgba(239,68,68,0.2)", color: "#f87171" }}>
                {t.count}
              </span>
            )}
            {tab === t.key && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#22d3ee]" />
            )}
          </button>
        ))}
      </div>

      {/* Task list — shrinks when chat is active so chat gets room */}
      <div className={`overflow-y-auto space-y-2 mb-4 ${chatMessages.length > 0 ? "max-h-[220px]" : "flex-1"}`}>
        {tab === "todo" && (
          <>
            {loadingTasks && (
              <div className="py-8 text-center text-sm text-muted-foreground">
                {en ? `${companionName} is checking your pipeline...` : `${companionName} está revisando tu pipeline...`}
              </div>
            )}
            {!loadingTasks && todoTasks.length === 0 && (
              <div className="py-10 text-center">
                <p className="text-sm font-semibold text-foreground">
                  {en ? "You're all caught up!" : "¡Estás al día!"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {en ? `${companionName} will let you know when something needs attention.` : `${companionName} te avisará cuando algo necesite atención.`}
                </p>
              </div>
            )}
            {todoTasks.map((task) => (
              <div
                key={task.id}
                className="rounded-xl p-3.5 flex items-start gap-3"
                style={{
                  background: task.priority === "red"
                    ? "rgba(239,68,68,0.03)"
                    : task.priority === "amber"
                    ? "rgba(245,158,11,0.03)"
                    : "rgba(255,255,255,0.03)",
                  border: `1px solid ${task.priority === "red"
                    ? "rgba(239,68,68,0.2)"
                    : task.priority === "amber"
                    ? "rgba(245,158,11,0.18)"
                    : "rgba(255,255,255,0.06)"}`,
                }}
              >
                <div
                  className="w-2 h-2 rounded-full flex-shrink-0 mt-1.5"
                  style={{ background: dotColor[task.priority] }}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-bold text-white leading-tight">
                    {en ? task.titleEn : task.titleEs}
                  </p>
                  <p className="text-[11px] text-white/40 mt-1 leading-relaxed">
                    {en ? task.subtitleEn : task.subtitleEs}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 mt-0.5">
                  <button
                    onClick={() => navigate(task.actionPath)}
                    className="text-[11px] font-semibold px-3 py-1.5 rounded-lg transition-opacity hover:opacity-80"
                    style={{ background: "rgba(8,145,178,0.15)", color: "#22d3ee", border: "1px solid rgba(8,145,178,0.25)" }}
                  >
                    {en ? task.actionLabelEn : task.actionLabelEs}
                  </button>
                  <button
                    onClick={() => setDismissedIds((prev) => new Set([...prev, task.id]))}
                    className="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg transition-opacity hover:opacity-80"
                    style={{ background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.35)", border: "1px solid rgba(255,255,255,0.08)" }}
                  >
                    {en ? task.skipLabelEn : task.skipLabelEs}
                  </button>
                </div>
              </div>
            ))}
          </>
        )}
        {tab === "done" && (
          <div className="py-10 text-center">
            <p className="text-sm text-muted-foreground">
              {en ? "Completed tasks will appear here." : "Las tareas completadas aparecerán aquí."}
            </p>
          </div>
        )}
      </div>

      {/* Chat messages */}
      {chatMessages.length > 0 && (
        <div className="space-y-3 mb-3 flex-1 overflow-y-auto min-h-0">
          {chatMessages.map((msg, i) => (
            <div key={i} className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              {msg.role === "assistant" && (
                <div className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center mt-0.5" style={{ background: "linear-gradient(135deg,#0891B2,#84CC16)" }}>
                  <Bot className="w-3 h-3 text-white" />
                </div>
              )}
              <div
                className="max-w-sm text-[12px] px-3 py-2 rounded-xl leading-relaxed"
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

      {/* Input */}
      <div
        className="flex items-center gap-3 rounded-xl px-4 py-3"
        style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
      >
        <input
          type="text"
          value={chatInput}
          onChange={(e) => setChatInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
          placeholder={en ? `Ask ${companionName} anything...` : `Pregúntale a ${companionName} lo que quieras...`}
          className="flex-1 bg-transparent text-sm text-white/70 placeholder:text-white/25 outline-none"
        />
        <button
          onClick={sendMessage}
          disabled={!chatInput.trim() || sending}
          className="w-8 h-8 rounded-full flex items-center justify-center disabled:opacity-40 transition-opacity flex-shrink-0"
          style={{ background: "linear-gradient(135deg,#0891B2,#84CC16)" }}
        >
          <Send className="w-4 h-4 text-white" />
        </button>
      </div>
    </PageTransition>
  );
}
