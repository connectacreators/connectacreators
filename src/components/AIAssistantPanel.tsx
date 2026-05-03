import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Bot, Send, Loader2, X } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { useAuth } from "@/hooks/useAuth";
import { useOutOfCredits } from "@/contexts/OutOfCreditsContext";
import { getAuthToken } from "@/lib/getAuthToken";
import chessKnightIcon from "@/assets/chess-knight-white.svg";

interface WizardState {
  step: number;
  maxUnlockedStep: number;
  topic: string;
  facts: { fact: string; impact_score: number }[];
  selectedFactIndices: number[];
  hookCategory: string | null;
  hookTemplate: string | null;
  scriptLines: { line_type: string; section: string; text: string }[] | null;
  videoType?: string;
  isStorytellingMode?: boolean;
  selectedFormat?: string;
  isRemixing?: boolean;
  remixChannelUsername?: string;
  remixHookType?: string;
  remixBodyPattern?: string;
  useRemixHook?: boolean;
  useRemixStructure?: boolean;
  typeConfirmed?: boolean;
}

interface AssistantAction {
  type: string;
  payload: any;
}

interface Props {
  wizardState: WizardState;
  clientInfo?: { name?: string; target?: string };
  onAction: (action: AssistantAction) => void;
  authToken: string | null;
  onClose?: () => void;
}

interface Message {
  role: "user" | "assistant";
  content: string;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

function getQuickChips(step: number): string[] {
  switch (step) {
    case 1: return ["Do everything for me", "Just the research", "Use storytelling mode"];
    case 2: return ["Select the best facts", "Use all 5 facts"];
    case 3: return ["Pick the best hook", "Use educational hook", "Use storytelling hook"];
    case 4: return ["Generate the script now", "Use Talking Head format"];
    case 5: return ["Make the hook more punchy", "Make it shorter", "Translate to Spanish"];
    default: return ["Do everything for me", "Just the research"];
  }
}

export default function AIAssistantPanel({ wizardState, clientInfo, onAction, authToken, onClose }: Props) {
  const { language } = useLanguage();
  const { user } = useAuth();
  const { showOutOfCreditsModal } = useOutOfCredits();
  const displayName = (user?.user_metadata?.full_name as string)?.split(" ")[0] || clientInfo?.name?.split(" ")[0] || "";
  const greeting = language === "es"
    ? `¿Qué hacemos hoy${displayName ? `, ${displayName}` : ""}?`
    : `What are we doing today${displayName ? `, ${displayName}` : ""}?`;
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const userMsg: Message = { role: "user", content: trimmed };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput("");
    setLoading(true);

    try {
      const token = await getAuthToken();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-assistant`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          messages: updatedMessages,
          wizard_state: {
            step: wizardState.step,
            max_unlocked_step: wizardState.maxUnlockedStep,
            topic: wizardState.topic,
            facts: wizardState.facts,
            selected_fact_indices: wizardState.selectedFactIndices,
            hook_category: wizardState.hookCategory,
            hook_template: wizardState.hookTemplate,
            script_lines: wizardState.scriptLines,
            video_type: wizardState.videoType,
            is_storytelling_mode: wizardState.isStorytellingMode,
            selected_format: wizardState.selectedFormat,
            is_remixing: wizardState.isRemixing,
            remix_channel_username: wizardState.remixChannelUsername,
            remix_hook_type: wizardState.remixHookType,
            remix_body_pattern: wizardState.remixBodyPattern,
            use_remix_hook: wizardState.useRemixHook,
            use_remix_structure: wizardState.useRemixStructure,
            type_confirmed: wizardState.typeConfirmed,
          },
          client_info: clientInfo,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        if (errData.insufficient_credits) {
          showOutOfCreditsModal();
          return;
        }
        throw new Error(errData.error || `Request failed: ${res.status}`);
      }

      const data = await res.json();
      const assistantMsg: Message = {
        role: "assistant",
        content: data.message || "Sorry, I couldn't generate a response.",
      };

      setMessages((prev) => [...prev, assistantMsg]);

      if (data.action) {
        onAction(data.action);
      }
    } catch (e: any) {
      console.error("AI assistant error:", e);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Sorry, something went wrong. Please try again." },
      ]);
    } finally {
      setLoading(false);
    }
  }, [messages, loading, wizardState, clientInfo, authToken, onAction]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }, [sendMessage, input]);

  return (
    <div className="flex flex-col h-[calc(100vh-2rem)] rounded-2xl border border-border bg-card shadow-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2.5">
          <img src={chessKnightIcon} alt="Connecta AI" className="w-5 h-5 object-contain" />
          <span className="font-semibold text-sm text-foreground">Connecta AI</span>
        </div>
        {onClose && (
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-md hover:bg-muted">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5 min-h-0">
        {/* Centered greeting when no messages yet */}
        {messages.length === 0 && !loading && (
          <div className="flex-1 flex items-center justify-center min-h-[200px]">
            <p className="text-xl font-semibold text-foreground/70 text-center">{greeting}</p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i}>
            {msg.role === "assistant" ? (
              <div className="flex gap-2.5 items-start">
                <div className="w-6 h-6 flex-shrink-0 mt-0.5 flex items-center justify-center">
                  <Bot className="w-4 h-4 text-amber-100" />
                </div>
                <p className="text-sm text-foreground leading-relaxed flex-1 whitespace-pre-wrap">{msg.content}</p>
              </div>
            ) : (
              <div className="flex justify-end">
                <div className="max-w-[85%] px-3 py-2 rounded-2xl rounded-tr-sm bg-muted text-sm text-foreground leading-relaxed">
                  {msg.content}
                </div>
              </div>
            )}
          </div>
        ))}

        {/* Loading — typing dots */}
        {loading && (
          <div className="flex gap-2.5 items-start">
            <div className="w-6 h-6 flex-shrink-0 mt-0.5 flex items-center justify-center">
              <Bot className="w-4 h-4 text-amber-100" />
            </div>
            <div className="flex gap-1 items-center pt-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:0ms]" />
              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:150ms]" />
              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:300ms]" />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Step-aware quick chips */}
      <div className="px-3 pt-2 pb-1 border-t border-border flex flex-wrap gap-1.5">
        {getQuickChips(wizardState.step).map((chip) => (
          <button
            key={chip}
            onClick={() => sendMessage(chip)}
            disabled={loading}
            className="px-2.5 py-1 rounded-lg text-xs text-primary border border-primary/25 bg-primary/5 hover:bg-primary/15 transition-colors disabled:opacity-40"
          >
            {chip}
          </button>
        ))}
      </div>

      {/* Input */}
      <div className="p-3 pt-1.5 border-border">
        <div className="flex gap-2 items-end">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Describe your business or ask anything..."
            className="resize-none min-h-[40px] max-h-[120px] text-sm bg-muted/30 border-border focus:border-primary/50 rounded-xl"
            rows={1}
            disabled={loading}
          />
          <Button
            size="sm"
            variant="cta"
            className="h-10 w-10 p-0 flex-shrink-0 rounded-xl"
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || loading}
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-1.5 px-1">Enter to send · Shift+Enter for newline</p>
      </div>
    </div>
  );
}
