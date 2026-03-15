import { useState, useRef, useEffect, useCallback, Fragment, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Bot, Send, Loader2, Wand2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useLanguage } from "@/hooks/useLanguage";
import { useAuth } from "@/hooks/useAuth";

/** Render a single line with inline markdown: **bold**, *italic*, `code` */
function renderInline(line: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  // Match **bold**, *italic*, `code` in order
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = regex.exec(line)) !== null) {
    if (match.index > last) parts.push(<Fragment key={key++}>{line.slice(last, match.index)}</Fragment>);
    if (match[2] !== undefined) parts.push(<strong key={key++} className="font-semibold">{match[2]}</strong>);
    else if (match[3] !== undefined) parts.push(<em key={key++}>{match[3]}</em>);
    else if (match[4] !== undefined) parts.push(<code key={key++} className="px-1 py-0.5 rounded bg-muted text-[10px] font-mono">{match[4]}</code>);
    last = match.index + match[0].length;
  }
  if (last < line.length) parts.push(<Fragment key={key++}>{line.slice(last)}</Fragment>);
  return parts;
}

/** Render full markdown text: headings, bullets, numbered lists, paragraphs */
function MarkdownText({ text }: { text: string }) {
  const lines = text.split("\n");
  const nodes: React.ReactNode[] = [];
  let bulletGroup: React.ReactNode[] = [];
  let i = 0;

  const flushBullets = () => {
    if (bulletGroup.length > 0) {
      nodes.push(<ul key={`ul-${i}`} className="list-disc list-inside space-y-0.5 my-1">{bulletGroup}</ul>);
      bulletGroup = [];
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();

    // Heading: # or ##
    if (/^#{1,3}\s/.test(trimmed)) {
      flushBullets();
      const text = trimmed.replace(/^#{1,3}\s/, "");
      nodes.push(<p key={i} className="font-semibold text-foreground mt-2 mb-0.5">{renderInline(text)}</p>);
    }
    // Bullet: - or *
    else if (/^[-*]\s/.test(trimmed)) {
      const text = trimmed.replace(/^[-*]\s/, "");
      bulletGroup.push(<li key={i} className="text-xs leading-relaxed">{renderInline(text)}</li>);
    }
    // Numbered list: 1. 2. etc
    else if (/^\d+\.\s/.test(trimmed)) {
      flushBullets();
      const text = trimmed.replace(/^\d+\.\s/, "");
      nodes.push(<p key={i} className="text-xs leading-relaxed pl-3">• {renderInline(text)}</p>);
    }
    // Empty line — spacing
    else if (trimmed === "") {
      flushBullets();
      nodes.push(<div key={i} className="h-1" />);
    }
    // Normal paragraph line
    else {
      flushBullets();
      nodes.push(<p key={i} className="text-xs leading-relaxed">{renderInline(trimmed)}</p>);
    }
    i++;
  }
  flushBullets();
  return <div className="space-y-0.5">{nodes}</div>;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

export interface CanvasContext {
  transcriptions: string[];
  structures: any[];
  text_notes: string;
  research_facts: { fact: string; impact_score: number }[];
  primary_topic: string;
  video_sources?: Array<{ channel_username: string | null; url: string | null }>;
  selected_hook?: string | null;
  selected_hook_category?: string | null;
  brand_guide?: {
    tone: string | null;
    brand_values: string | null;
    forbidden_words: string | null;
    tagline: string | null;
  } | null;
  selected_cta?: string | null;
}

interface ScriptResult {
  lines: any[];
  idea_ganadora: string;
  target: string;
  formato: string;
  virality_score: number;
}

interface Props {
  canvasContext: CanvasContext;
  clientInfo?: { name?: string; target?: string };
  onGenerateScript: (result: ScriptResult) => void;
  authToken: string | null;
  format: string;
  language: "en" | "es";
  aiModel: string;
  onFormatChange: (f: string) => void;
  onLanguageChange: (l: "en" | "es") => void;
  onModelChange: (m: string) => void;
  remixMode?: boolean;
  remixContext?: {
    channel_username: string;
    format: string | null;
    prompt_hint: string | null;
  } | null;
}

interface Message { role: "user" | "assistant"; content: string; }

const QUICK_CHIPS = [
  "Generate Script",
  "Suggest a hook",
  "Make it punchy",
  "Translate to Spanish",
  "Shorten it",
];

const hasContext = (ctx: CanvasContext) =>
  ctx.transcriptions.length > 0 || ctx.structures.length > 0 ||
  ctx.text_notes.trim().length > 0 || ctx.research_facts.length > 0 ||
  ctx.primary_topic.trim().length > 0 ||
  !!ctx.selected_hook || !!ctx.brand_guide || !!ctx.selected_cta;

export default function CanvasAIPanel({ canvasContext, clientInfo, onGenerateScript, authToken, format, language: scriptLang, aiModel, onFormatChange, onLanguageChange, onModelChange, remixMode = false, remixContext = null }: Props) {
  const { language } = useLanguage();
  const { user } = useAuth();
  const displayName = (user?.user_metadata?.full_name as string)?.split(" ")[0] || clientInfo?.name?.split(" ")[0] || "";
  const greeting = useMemo(() => {
    if (remixMode && remixContext) {
      const hint = remixContext.prompt_hint ? ` It uses a "${remixContext.prompt_hint}" style.` : "";
      const client = clientInfo?.name ?? "your client";
      return scriptLang === "es"
        ? `Analicé el video de @${remixContext.channel_username}.${hint} ¿Sobre qué tema lo aplicamos para ${client}?`
        : `I've loaded @${remixContext.channel_username}'s video.${hint} What topic do you want to apply this to for ${client}?`;
    }
    return scriptLang === "es"
      ? `¿Qué hacemos hoy${displayName ? `, ${displayName}` : ""}?`
      : `What are we doing today${displayName ? `, ${displayName}` : ""}?`;
  }, [remixMode, remixContext, scriptLang, clientInfo, displayName]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  useEffect(() => {
    if (remixMode && messages.length === 0) {
      setMessages([{ role: "assistant", content: greeting }]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remixMode]); // only fire once on mount

  const generateScript = useCallback(async () => {
    if (!hasContext(canvasContext)) {
      toast.error("Add at least one node (video, note, or research) to the canvas first.");
      return;
    }
    setGenerating(true);
    const { data: { session } } = await supabase.auth.getSession();
    const token = authToken || session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    try {
      // Strip leading assistant messages (Claude API requires user-first), and trim to last 20 messages to avoid token bloat
      const firstUserIdx = messages.findIndex(m => m.role === "user");
      const conversationMessages = firstUserIdx >= 0 ? messages.slice(firstUserIdx).slice(-20) : [];

      const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-build-script`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          step: "canvas-generate",
          ...canvasContext,
          format,
          language: scriptLang,
          clientContext: clientInfo?.name ? `Client: ${clientInfo.name}` : undefined,
          conversationMessages: conversationMessages.length > 0 ? conversationMessages : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Script generation failed");
      onGenerateScript(json);
      setMessages(prev => [...prev, {
        role: "assistant",
        content: `Script generated! "${json.idea_ganadora}" — virality score: ${json.virality_score?.toFixed(1) || "?"}/10. Review it in the panel and save when ready.`,
      }]);
    } catch (e: any) {
      toast.error(e.message || "Generation failed");
      setMessages(prev => [...prev, { role: "assistant", content: `Generation failed: ${e.message}` }]);
    } finally {
      setGenerating(false);
    }
  }, [canvasContext, authToken, format, scriptLang, clientInfo, onGenerateScript]);

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    if (trimmed.toLowerCase().includes("generate script") || trimmed.toLowerCase().includes("generate my script")) {
      setInput("");
      setMessages(prev => [...prev, { role: "user", content: trimmed }]);
      await generateScript();
      return;
    }

    const userMsg: Message = { role: "user", content: trimmed };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setInput("");
    setLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = authToken || session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      // Build full context for the AI assistant — include all connected node content
      const contextSummary = [
        canvasContext.primary_topic ? `Topic: ${canvasContext.primary_topic}` : null,
        canvasContext.text_notes ? `CREATOR NOTES (treat as core research & instructions — USE this content when generating scripts):\n${canvasContext.text_notes}` : null,
        canvasContext.transcriptions.length > 0
          ? `VIDEO TRANSCRIPTION TEMPLATES (use as FORMAT reference — replicate structure, pacing, rhythm):\n${
              canvasContext.transcriptions.map((t, i) => {
                const src = canvasContext.video_sources?.[i];
                const label = src?.channel_username ? `from @${src.channel_username}` : `Video ${i + 1}`;
                return `[${label}]: ${t}`;
              }).join("\n\n")
            }`
          : null,
        canvasContext.structures.length > 0
          ? `VIDEO STRUCTURE TEMPLATES (ONLY use sections shown):\n${
              canvasContext.structures.map((s, i) => {
                const src = canvasContext.video_sources?.[i];
                const label = src?.channel_username ? `from @${src.channel_username}` : `Video ${i + 1}`;
                return `[${label}] Format: ${s.detected_format}\n${(s.sections || [])
                  .map((sec: any) => `  [${sec.section.toUpperCase()}] "${sec.actor_text}" | Visual: ${sec.visual_cue}`)
                  .join("\n")}`;
              }).join("\n\n")
            }`
          : null,
        canvasContext.research_facts.length > 0
          ? `Research Facts:\n${canvasContext.research_facts.map(f => `- ${f.fact} (impact ${f.impact_score})`).join("\n")}`
          : null,
        canvasContext.selected_hook
          ? `⚠️ SELECTED HOOK (creator chose this — use it as the script opening, preserve its pattern):\n"${canvasContext.selected_hook}" (${canvasContext.selected_hook_category ?? "general"} style)`
          : null,
        canvasContext.brand_guide
          ? `⚠️ BRAND CONSTRAINTS (HARD RULES — violating these makes script unusable):\n- Tone: ${canvasContext.brand_guide.tone ?? "not set"}\n- Brand values: ${canvasContext.brand_guide.brand_values ?? "none"}\n- Forbidden words/phrases: ${canvasContext.brand_guide.forbidden_words ?? "none"}\n- Tagline (use if natural): "${canvasContext.brand_guide.tagline ?? ""}"`
          : null,
        canvasContext.selected_cta
          ? `⚠️ REQUIRED CTA (script MUST end with this exact call-to-action verbatim):\n"${canvasContext.selected_cta}"`
          : null,
      ].filter(Boolean).join("\n\n");

      // Claude API requires messages to start with a user role — strip any leading assistant messages
      const firstUserIdx = updated.findIndex(m => m.role === "user");
      const apiMessages = firstUserIdx >= 0 ? updated.slice(firstUserIdx) : updated;

      const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-assistant`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          messages: apiMessages,
          canvas_mode: true,
          client_info: { ...clientInfo, canvas_context: contextSummary },
          model: aiModel,
        }),
      });
      const data = await res.json();
      if (data.error) {
        console.error("[CanvasAI] Error:", data.error);
        setMessages(prev => [...prev, {
          role: "assistant",
          content: `Error: ${data.error}`,
        }]);
      } else {
        setMessages(prev => [...prev, {
          role: "assistant",
          content: data.message || "I couldn't generate a response.",
        }]);
      }
    } catch (e: any) {
      setMessages(prev => [...prev, { role: "assistant", content: "Sorry, something went wrong." }]);
    } finally {
      setLoading(false);
    }
  }, [messages, loading, canvasContext, authToken, clientInfo, aiModel, generateScript]);

  const contextCount = [
    canvasContext.transcriptions.length > 0,
    canvasContext.text_notes.trim().length > 0,
    canvasContext.research_facts.length > 0,
  ].filter(Boolean).length;

  return (
    <div className="flex flex-col h-full">
      {/* Format + Language row */}
      <div className="px-3 py-2 border-b border-border flex flex-shrink-0">
        <div className="flex items-center gap-2 w-full">
          <select
            value={format}
            onChange={(e) => onFormatChange(e.target.value)}
            className="flex-1 py-1.5 px-2 text-[11px] rounded-lg border border-border/50 bg-transparent text-muted-foreground focus:outline-none focus:border-primary/50 hover:bg-muted/40 transition-colors cursor-pointer"
          >
            <option value="talking_head">Talking Head</option>
            <option value="broll_caption">B-Roll Caption</option>
            <option value="entrevista">Entrevista</option>
            <option value="variado">Variado</option>
          </select>
          <div className="flex rounded-lg border border-border overflow-hidden">
            {(["en", "es"] as const).map((l) => (
              <button
                key={l}
                onClick={() => onLanguageChange(l)}
                className={`px-2.5 py-1.5 text-[11px] font-medium transition-colors ${scriptLang === l ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4 min-h-0">
        {/* Centered greeting when no messages */}
        {messages.length === 0 && !loading && !generating && !remixMode && (
          <div className="flex flex-col items-center justify-center flex-1 min-h-[160px] gap-3" style={{ animation: "greetingFadeIn 0.5s ease both" }}>
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Bot className="w-5 h-5 text-primary" />
            </div>
            <p className="text-base font-light text-foreground/60 text-center leading-snug px-4" style={{ letterSpacing: "-0.01em", animation: "greetingTypewriter 1.2s steps(40, end) both", overflow: "hidden", whiteSpace: "nowrap", maxWidth: "100%" }}>
              {language === "es" ? (
                <>¿Qué hacemos <strong className="font-bold text-foreground/80">hoy</strong>{displayName ? `, ${displayName}` : ""}?</>
              ) : (
                <>What are we doing <strong className="font-bold text-foreground/80">today</strong>{displayName ? `, ${displayName}` : ""}?</>
              )}
            </p>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i}>
            {msg.role === "assistant" ? (
              <div className="flex gap-2 items-start">
                <Bot className="w-3.5 h-3.5 text-primary mt-0.5 flex-shrink-0" />
                <div className="text-foreground min-w-0 flex-1">
                  <MarkdownText text={msg.content} />
                </div>
              </div>
            ) : (
              <div className="flex justify-end">
                <div className="max-w-[85%] px-3 py-2 rounded-2xl rounded-tr-sm bg-muted text-xs text-foreground">{msg.content}</div>
              </div>
            )}
          </div>
        ))}
        {(loading || generating) && (
          <div className="flex gap-2 items-start">
            <Bot className="w-3.5 h-3.5 text-primary mt-0.5 flex-shrink-0" />
            <div className="flex gap-1 items-center pt-1">
              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:0ms]" />
              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:150ms]" />
              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:300ms]" />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Generate Script button */}
      <div className="px-3 pt-2 pb-1 border-t border-border flex-shrink-0">
        <Button
          onClick={generateScript}
          disabled={generating || !hasContext(canvasContext)}
          variant="cta"
          className="w-full gap-2 text-sm mb-2"
        >
          {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
          {generating ? "Generating..." : "Generate Script"}
        </Button>

        {/* Quick chips */}
        <div className="flex flex-wrap gap-1 mb-2">
          {QUICK_CHIPS.filter(c => c !== "Generate Script").map((chip) => (
            <button
              key={chip}
              onClick={() => sendMessage(chip)}
              disabled={loading || generating}
              className="px-2 py-1 rounded-lg text-[10px] text-primary border border-primary/25 bg-primary/5 hover:bg-primary/15 transition-colors disabled:opacity-40"
            >
              {chip}
            </button>
          ))}
        </div>

        {/* Input */}
        <div className="flex gap-2 items-end">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
            placeholder="Ask anything about your script..."
            className="resize-none min-h-[36px] max-h-[100px] text-xs bg-muted/30 border-border focus:border-primary/50 rounded-xl"
            rows={1}
            disabled={loading || generating}
          />
          <Button
            size="sm"
            variant="cta"
            className="h-9 w-9 p-0 flex-shrink-0 rounded-xl"
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || loading || generating}
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
