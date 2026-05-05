// src/components/assistant/AssistantChat.tsx
//
// Reusable assistant chat surface — message list, streaming bubble, infinite
// scroll, per-message actions (copy, regenerate, edit, save). Lifted out of
// `src/components/canvas/CanvasAIPanel.tsx` (Phase B.1, Task 3 of the
// companion <-> canvas AI merge).
//
// This is a structural extraction. The same JSX is rendered, the same Tailwind
// classes are used. Behavior should match the previous inline implementation
// exactly — only the relocation differs.

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ChevronDown,
  Image as ImageIcon,
  Loader2,
} from "lucide-react";
import { FingerprintAvatar } from "@/components/assistant";
import { toast } from "sonner";
import { parseDeck, composeDeckAnswers, type DeckAnswer, type DeckQuestion } from "@/lib/parseDeck";
import { QuestionDeckCard } from "@/components/canvas/QuestionDeckCard";
import { DeckSummaryBubble } from "@/components/canvas/DeckSummaryBubble";
import {
  MarkdownText,
  InlineScriptPreview,
  ThinkingAnimation,
  MODEL_LABEL,
  RESEARCH_KEYWORDS,
  type AssistantMessage,
  type ScriptResult,
} from "@/components/canvas/CanvasAIPanel.shared";

// ── Types ──────────────────────────────────────────────────────────────────

export interface AssistantChatProps {
  messages: AssistantMessage[];
  /** Live streaming text (typewriter) — null when not streaming */
  streamingContent?: string | null;
  /** Streaming text from a remote source (e.g. broadcast in FullscreenAIView) */
  remoteStreamingContent?: string | null;
  loading?: boolean;
  generating?: boolean;
  generatingImage?: boolean;
  /** Layout variant — affects padding, max width, font sizing */
  variant?: "compact" | "full";
  /** Caller's "save script" handler */
  onSaveScript?: (script: ScriptResult) => Promise<void> | void;
  /** Open the script in the full editor (canvas-side) */
  onExpandScript?: (script: ScriptResult) => void;
  /** Caller's "save research to canvas" handler — receives raw markdown */
  onSaveResearchToCanvas?: (markdown: string, topic?: string) => void;
  /** Regenerate from a specific message index (within the visible window) */
  onRegenerateFromMessage?: (visibleIdx: number) => void;
  /** Edit a user message at index (within the visible window) */
  onEditUserMessage?: (visibleIdx: number, content: string) => void;
  /** Submit answers from an in-thread question deck */
  onSubmitDeck?: (composedAnswer: string, questions: DeckQuestion[], answers: DeckAnswer[]) => void;
  /** Visible message count for windowing — null/undefined = render all */
  visibleCount?: number | null;
  /** Called when the top sentinel intersects (for infinite scroll) */
  onLoadMore?: () => void;
  /** Whether more older messages exist (controls "Load older" sentinel visibility) */
  hasOlderMessages?: boolean;
  /** Greeting copy when there are no messages — e.g. "What are we doing today?" */
  greeting?: React.ReactNode;
  /** Greeting subtitle */
  greetingSubtitle?: React.ReactNode;
  /** Suppress the greeting (e.g. when remixMode replaces it with a system message) */
  hideGreeting?: boolean;
  /** Convert a message's stored image_b64 to a renderable URL — falls back to msg._blobUrl */
  getBlobUrl?: (base64: string) => string;
  /** Whether the active session is in research mode (affects streaming bubble icon) */
  isResearchMode?: boolean;
  /** Fired after AssistantChat auto-scrolls to bottom on new message —
   *  lets the parent reset its message-window cursor. */
  onAutoScrolledToBottom?: () => void;
  className?: string;
}

// ── Component ──────────────────────────────────────────────────────────────

export function AssistantChat({
  messages,
  streamingContent = null,
  remoteStreamingContent = null,
  loading = false,
  generating = false,
  generatingImage = false,
  variant = "compact",
  onSaveScript,
  onExpandScript,
  onSaveResearchToCanvas,
  onRegenerateFromMessage,
  onEditUserMessage,
  onSubmitDeck,
  visibleCount,
  onLoadMore,
  hasOlderMessages = false,
  greeting,
  greetingSubtitle,
  hideGreeting = false,
  getBlobUrl,
  isResearchMode = false,
  onAutoScrolledToBottom,
  className = "",
}: AssistantChatProps) {
  const fullscreen = variant === "full";

  // ── Local state owned by the chat surface ───────────────────────────────
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // ── Windowed slice ──────────────────────────────────────────────────────
  const visibleMessages = useMemo(
    () =>
      typeof visibleCount === "number" && visibleCount >= 0
        ? messages.slice(-visibleCount)
        : messages,
    [messages, visibleCount],
  );

  // ── Auto-scroll to bottom on new message (when user is at bottom) ───────
  const prevLastMsgRef = useRef<string>("");
  useEffect(() => {
    const lastMsg = messages[messages.length - 1];
    const lastContent = lastMsg
      ? `${lastMsg.role}:${lastMsg.content?.slice(0, 50) ?? ""}`
      : "";
    if (lastContent && lastContent !== prevLastMsgRef.current) {
      if (!showScrollBtn) {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
        onAutoScrolledToBottom?.();
      } else if (lastMsg?.role === "assistant") {
        setUnreadCount((prev) => prev + 1);
      }
    }
    prevLastMsgRef.current = lastContent;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  // ── Scroll to bottom as streaming tokens arrive ─────────────────────────
  useEffect(() => {
    if (streamingContent !== null && !showScrollBtn) {
      bottomRef.current?.scrollIntoView({ behavior: "instant" as ScrollBehavior });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamingContent]);

  // ── IntersectionObserver — load older messages when sentinel visible ────
  useEffect(() => {
    if (!onLoadMore) return;
    const sentinel = sentinelRef.current;
    const container = scrollContainerRef.current;
    if (!sentinel || !container) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          // Save scroll position before parent expands the window
          const prevHeight = container.scrollHeight;
          const prevTop = container.scrollTop;
          onLoadMore();
          // Restore scroll position after React re-renders
          requestAnimationFrame(() => {
            const newHeight = container.scrollHeight;
            container.scrollTop = prevTop + (newHeight - prevHeight);
          });
        }
      },
      { root: container, threshold: 0.1 },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [onLoadMore, messages.length, hasOlderMessages]);

  // ── Helpers ─────────────────────────────────────────────────────────────
  const handleSubmitDeck = useCallback(
    (questions: DeckQuestion[], answers: DeckAnswer[]) => {
      if (onSubmitDeck) {
        const composed = composeDeckAnswers(questions, answers);
        onSubmitDeck(composed, questions, answers);
      }
    },
    [onSubmitDeck],
  );

  const handleSaveResearch = useCallback(
    (msg: AssistantMessage) => {
      if (onSaveResearchToCanvas) {
        onSaveResearchToCanvas(msg.content, msg.research_topic);
      } else if (typeof window !== "undefined" && (window as any).__canvasAddResearchNode) {
        // Backwards-compatible fallback — same parsing as the previous inline impl.
        const addFn = (window as any).__canvasAddResearchNode;
        const topic = msg.research_topic || "Research";
        const bulletLines = msg.content
          .split("\n")
          .map((l) => l.replace(/^[•\-*]\s*/, "").trim())
          .filter(
            (l) =>
              l.length > 10 &&
              l.length < 200 &&
              !l.startsWith("#") &&
              !l.startsWith("**"),
          );
        const facts = bulletLines
          .slice(0, 8)
          .map((fact) => ({ fact, impact_score: 9 }));
        addFn(
          topic,
          facts.length > 0
            ? facts
            : [{ fact: msg.content.slice(0, 120), impact_score: 9 }],
        );
        toast.success("Research saved to canvas");
      } else {
        toast.error("Canvas not available");
      }
    },
    [onSaveResearchToCanvas],
  );

  // Resolve image URL for a message: prefer pre-cached _blobUrl, otherwise
  // call the caller's getBlobUrl helper. If neither is available, fall back
  // to a data URL — preserves rendering even outside the canvas context.
  const resolveImageUrl = useCallback(
    (msg: AssistantMessage): string | undefined => {
      if (msg._blobUrl) return msg._blobUrl;
      if (msg.image_b64) {
        if (getBlobUrl) return getBlobUrl(msg.image_b64);
        return `data:image/png;base64,${msg.image_b64}`;
      }
      return undefined;
    },
    [getBlobUrl],
  );

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div
      ref={scrollContainerRef}
      className={`flex-1 overflow-y-auto ${fullscreen ? "px-4 py-6" : "px-3 py-3"} min-h-0 nodrag nowheel canvas-ai-scroll relative ${className}`.trim()}
      style={{ userSelect: "text", cursor: "auto" }}
      onMouseDown={(e) => e.stopPropagation()}
      onScroll={(e) => {
        const el = e.currentTarget;
        const atBottom =
          el.scrollHeight - el.scrollTop - el.clientHeight < 60;
        setShowScrollBtn(!atBottom);
        if (atBottom) setUnreadCount(0);
      }}
    >
      <div
        className={
          fullscreen ? "max-w-3xl mx-auto w-full space-y-4" : "space-y-4"
        }
      >
        {/* Centered greeting when no messages */}
        {messages.length === 0 && !loading && !generating && !hideGreeting && (
          <div
            className={`flex flex-col items-center justify-center flex-1 ${fullscreen ? "min-h-[60vh]" : "min-h-[200px]"} gap-3 px-3`}
            style={{ animation: "greetingFadeIn 0.5s ease both" }}
          >
            <FingerprintAvatar size="md" />
            {greeting && (
              <p
                className={`${fullscreen ? "text-xl" : "text-base"} font-light text-foreground/60 text-center leading-snug font-caslon`}
                style={{ letterSpacing: "0.02em" }}
              >
                {greeting}
              </p>
            )}
            {greetingSubtitle && (
              <p className="text-[11px] text-muted-foreground/50 text-center max-w-[180px] leading-relaxed">
                {greetingSubtitle}
              </p>
            )}
          </div>
        )}

        {/* Infinite scroll sentinel — triggers loading older messages */}
        {hasOlderMessages && onLoadMore && (
          <div ref={sentinelRef} className="flex justify-center py-2">
            <Loader2 className="w-3.5 h-3.5 text-muted-foreground/40 animate-spin" />
          </div>
        )}

        {visibleMessages.map((msg, i) => (
          <div key={i}>
            {msg.role === "assistant" ? (
              msg.is_progress ? (
                <div className="flex items-center gap-1.5 text-muted-foreground/60">
                  <Loader2 className="w-3 h-3 animate-spin flex-shrink-0" />
                  <span className={`${fullscreen ? "text-sm" : "text-[11px]"} italic`}>{msg.content}</span>
                </div>
              ) : msg.type === "script_preview" && msg.script_data ? (
                <div className="flex gap-2 items-start">
                  <FingerprintAvatar size="sm" />
                  <div className="min-w-0 flex-1">
                    {msg.script_data?.change_summary && (
                      <p
                        style={{
                          fontSize: 10,
                          color: "rgba(255,255,255,0.35)",
                          marginBottom: 4,
                          fontStyle: "italic",
                        }}
                      >
                        {msg.script_data.change_summary}
                      </p>
                    )}
                    <InlineScriptPreview
                      script={msg.script_data}
                      onSave={async () => {
                        if (onSaveScript) await onSaveScript(msg.script_data!);
                      }}
                      onExpand={() => onExpandScript?.(msg.script_data!)}
                    />
                  </div>
                </div>
              ) : msg.type === "image" && (msg._blobUrl || msg.image_b64) ? (
                <div className="flex gap-2 items-start">
                  <ImageIcon className="w-3.5 h-3.5 text-purple-400 mt-0.5 flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <img
                      src={resolveImageUrl(msg)}
                      alt={msg.revised_prompt || "Generated image"}
                      className="rounded-lg max-w-full border border-purple-500/20"
                    />
                    {msg.revised_prompt && (
                      <p className="text-[10px] text-muted-foreground mt-1.5 italic">
                        {msg.revised_prompt}
                      </p>
                    )}
                    {msg.credits_used && (
                      <p className="text-[10px] text-purple-400/70 mt-0.5">
                        {msg.credits_used} credits
                      </p>
                    )}
                  </div>
                </div>
              ) : msg.is_research ? (
                <div className="flex gap-2 items-start">
                  <svg
                    className="w-3.5 h-3.5 mt-0.5 flex-shrink-0"
                    style={{ color: "#c9a96e" }}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <circle cx="11" cy="11" r="8" />
                    <path d="m21 21-4.35-4.35" />
                    <path d="M11 8v6M8 11h6" />
                  </svg>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "#c9a96e" }}>
                        Deep Research
                      </span>
                      {msg.source_count != null && msg.source_count > 0 && (
                        <span className="text-[10px] text-muted-foreground">
                          · {msg.source_count} source
                          {msg.source_count !== 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                    <MarkdownText text={msg.content} />
                    <button
                      onClick={() => handleSaveResearch(msg)}
                      className="mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold border transition-colors"
                      style={{ color: "rgba(201,169,110,0.85)", borderColor: "rgba(201,169,110,0.3)", background: "rgba(201,169,110,0.07)" }}
                    >
                      <svg
                        className="w-3 h-3"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M21 10V20a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V10" />
                        <polyline points="17 3 12 8 7 3" />
                        <line x1="12" y1="8" x2="12" y2="21" />
                      </svg>
                      Save to Canvas
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2 items-start group/msg">
                  <FingerprintAvatar size="sm" />
                  <div className="text-foreground min-w-0 flex-1 relative pr-8">
                    {(() => {
                      const deck = parseDeck(msg.content);
                      if (!deck) return <MarkdownText text={msg.content} />;
                      const alreadyAnswered = visibleMessages
                        .slice(i + 1)
                        .some(
                          (later) =>
                            later.role === "user" && !!later.meta?.deck_questions,
                        );
                      if (alreadyAnswered) {
                        return deck.preamble ? (
                          <MarkdownText text={deck.preamble} />
                        ) : null;
                      }
                      return (
                        <>
                          {deck.preamble && (
                            <div className="mb-2">
                              <MarkdownText text={deck.preamble} />
                            </div>
                          )}
                          <QuestionDeckCard
                            deck={deck}
                            onSubmit={(answers) =>
                              handleSubmitDeck(deck.questions, answers)
                            }
                          />
                        </>
                      );
                    })()}
                    <div className="absolute top-0 right-0 flex items-center gap-3 opacity-0 group-hover/msg:opacity-100 transition-opacity">
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(msg.content);
                          setCopiedIdx(i);
                          setTimeout(() => setCopiedIdx(null), 1500);
                        }}
                        className="text-[9px] transition-colors relative"
                        style={{ color: copiedIdx === i ? "rgba(201,169,110,0.8)" : "rgba(255,255,255,0.28)", background: "none", border: "none", cursor: "pointer", padding: "0 2px" }}
                        title="Copy"
                      >
                        {copiedIdx === i ? "copied" : "copy"}
                        <span style={{ position: "absolute", left: 0, right: 0, bottom: -1, height: "0.75px", background: "rgba(255,255,255,0.15)", borderRadius: 1 }} />
                      </button>
                      <button
                        onClick={() => onRegenerateFromMessage?.(i)}
                        className="text-[9px] relative"
                        style={{ color: "rgba(255,255,255,0.28)", background: "none", border: "none", cursor: "pointer", padding: "0 2px" }}
                        title="Regenerate"
                      >
                        retry
                        <span style={{ position: "absolute", left: 0, right: 0, bottom: -1, height: "0.75px", background: "rgba(255,255,255,0.15)", borderRadius: 1 }} />
                      </button>
                      {msg.downgraded && msg.actual_model && (
                        <span
                          title={`Routed to ${MODEL_LABEL[msg.actual_model] || msg.actual_model}`}
                          className="text-[9px] text-muted-foreground/60 px-1.5 py-0 rounded border border-border/40"
                        >
                          {MODEL_LABEL[msg.actual_model] || msg.actual_model}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )
            ) : (
              <div className="flex justify-end group/usermsg">
                <div className="relative max-w-[85%]">
                  {msg._imagePreview && (
                    <img
                      src={msg._imagePreview}
                      alt="Attached screenshot"
                      className="w-full max-h-40 object-cover rounded-xl rounded-br-sm mb-1 border border-border/40"
                    />
                  )}
                  {msg.meta?.deck_questions ? (
                    <DeckSummaryBubble
                      questions={msg.meta.deck_questions}
                      answers={msg.meta.deck_answers}
                    />
                  ) : (
                    <div className="relative">
                      <svg
                        style={{
                          position: "absolute",
                          inset: -3,
                          width: "calc(100% + 6px)",
                          height: "calc(100% + 6px)",
                          overflow: "visible",
                          pointerEvents: "none",
                        }}
                        viewBox="0 0 200 40"
                        preserveAspectRatio="none"
                      >
                        <path
                          d="M8,2 C60,0.5 140,0.5 188,2 C195,2.5 198,5 198,9 C199,17 199,28 198,33 C197,36.5 193,38.5 185,39 C130,40 70,40 18,39 C8,38.5 3,36 2,32 C1,26 1,14 2,8 C2.5,4.5 5,2.5 8,2 Z"
                          fill="none"
                          stroke="rgba(201,169,110,0.28)"
                          strokeWidth="1.2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeDasharray={500}
                          strokeDashoffset={500}
                          style={{ animation: "scribbleDrawIn 0.5s cubic-bezier(0.4,0,0.2,1) 0.05s forwards" }}
                        />
                      </svg>
                      <div className={`px-3 py-2 ${fullscreen ? "text-sm" : "text-xs"} text-foreground`}>
                        {msg.content}
                      </div>
                    </div>
                  )}
                  <button
                    onClick={() => onEditUserMessage?.(i, msg.content)}
                    className="absolute -left-6 top-1/2 -translate-y-1/2 opacity-0 group-hover/usermsg:opacity-100 transition-opacity p-0.5 rounded text-muted-foreground hover:text-foreground"
                    title="Edit message"
                  >
                    <svg
                      className="w-3 h-3"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}

        {(loading || generating) && !generatingImage && (
          <div className="flex gap-2 items-start">
            <FingerprintAvatar size="sm" />
            <ThinkingAnimation />
          </div>
        )}

        {generatingImage && (
          <div className="flex gap-2 items-start">
            <ImageIcon className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: "rgba(201,169,110,0.6)" }} />
            <div className="min-w-0 flex-1">
              <div
                className="rounded-lg overflow-hidden relative"
                style={{ width: "100%", maxWidth: 256, aspectRatio: "1 / 1", border: "1px solid rgba(201,169,110,0.15)", background: "rgba(201,169,110,0.03)" }}
              >
                {/* Shimmer animation */}
                <div
                  className="absolute inset-0"
                  style={{
                    background:
                      "linear-gradient(90deg, transparent 0%, rgba(201,169,110,0.07) 50%, transparent 100%)",
                    backgroundSize: "200% 100%",
                    animation: "shimmer 1.5s ease-in-out infinite",
                  }}
                />
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                  <Loader2 className="w-6 h-6 animate-spin" style={{ color: "rgba(201,169,110,0.6)" }} />
                  <span className="text-[11px] font-medium" style={{ color: "rgba(201,169,110,0.55)" }}>
                    Creating image…
                  </span>
                  <span className="text-[10px]" style={{ color: "rgba(201,169,110,0.35)" }}>
                    1024 × 1024
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {showScrollBtn && (
          <div className="sticky bottom-2 flex justify-center pointer-events-none z-10">
            <button
              onClick={() => {
                bottomRef.current?.scrollIntoView({ behavior: "smooth" });
                setShowScrollBtn(false);
                setUnreadCount(0);
              }}
              className="pointer-events-auto relative flex items-center gap-1.5 px-3 py-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
              style={{ background: "none", border: "none" }}
            >
              <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "hidden", pointerEvents: "none" }} viewBox="0 0 100 28" preserveAspectRatio="none">
                <path d="M6,2.5 C25,1 75,1 92,2.5 C97,3 99,5.5 99,8.5 C99.5,13 99,19 98,22 C97,25 94,26.5 89,27 C65,28 30,28 12,27 C6,26.5 2,25 2,22 C1,17 1,11 2,7 C2.5,4 4,3 6,2.5 Z" fill="none" stroke="rgba(201,169,110,0.22)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <ChevronDown className="w-3 h-3" />
              {unreadCount > 0 ? `${unreadCount} new` : "Latest"}
            </button>
          </div>
        )}

        {/* Streaming bubble — shown while tokens arrive (locally or from a collaborator) */}
        {(() => {
          const liveText = streamingContent ?? remoteStreamingContent;
          if (liveText === null || liveText === undefined) return null;
          const lastMsgContent =
            messages[messages.length - 1]?.content?.toLowerCase() || "";
          const looksLikeResearch =
            isResearchMode ||
            RESEARCH_KEYWORDS.some((kw) => lastMsgContent.includes(kw));
          return (
            <div className="flex gap-2 items-start px-1 py-1">
              {looksLikeResearch ? (
                <svg
                  className="w-3.5 h-3.5 mt-0.5 flex-shrink-0"
                  style={{ color: "#c9a96e" }}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.35-4.35" />
                  <path d="M11 8v6M8 11h6" />
                </svg>
              ) : (
                <FingerprintAvatar size="sm" />
              )}
              {liveText.includes("questions_deck") ? (
                <div className="text-xs text-muted-foreground italic">
                  Preparing questions…
                </div>
              ) : (
                <div className="text-foreground min-w-0 flex-1 inline">
                  <MarkdownText text={liveText} />
                  <span style={{ color: "rgba(201,169,110,0.7)", fontWeight: 400 }}>▋</span>
                </div>
              )}
            </div>
          );
        })()}

        <div ref={bottomRef} />
      </div>
      {/* end max-w wrapper */}
    </div>
  );
}
