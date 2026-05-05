// src/components/assistant/AssistantTextInput.tsx
//
// Reusable assistant input area — textarea, plus menu (image-mode / research /
// prompt presets), Generate-Script button, model selector with thinking
// toggle, mic / send / stop buttons, @ mention dropdown, pasted-image preview,
// research-mode banner, image-mode indicator.
//
// Lifted out of `src/components/canvas/CanvasAIPanel.tsx` (Phase B.1, Task 4
// of the companion <-> canvas AI merge). Same JSX, same Tailwind / inline
// styles, same callback semantics — only the location changed. Internal
// open/close state for the plus menu, the model dropdown, and the @ mention
// query is owned by this component. Everything else is driven by props.

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Send,
  Loader2,
  Wand2,
  Image as ImageIcon,
  ChevronUp,
  Check,
  Square,
  Mic,
  MicOff,
  X,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────

export interface MentionableNode {
  id: string;
  type: string;
  /** Human-readable label (e.g. "@username", note preview, etc.) */
  label?: string;
  /** Optional secondary detail line — username / filename / etc. */
  detail?: string;
}

export interface ModelOption {
  key: string;
  label: string;
  provider: string;
  color: string;
  cost: string;
}

export interface PromptPreset {
  name: string;
  description: string;
  prompt: string;
}

export interface AssistantTextInputProps {
  // Core text state
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onStop?: () => void;

  // Status
  loading?: boolean;
  generating?: boolean;
  recognizing?: boolean;

  // Attachments
  pastedImage?: { dataUrl: string; mimeType: string } | null;
  onClearPastedImage?: () => void;
  onPaste?: (e: React.ClipboardEvent<HTMLTextAreaElement>) => void;

  // Modes
  imageMode?: boolean;
  onToggleImageMode?: () => void;
  isResearchMode?: boolean;
  onToggleResearchMode?: () => void;

  // Generate Script button
  onGenerateScript?: () => void;
  generateScriptDisabled?: boolean;

  // Model selector
  selectedModel?: string;
  models?: ReadonlyArray<ModelOption>;
  onModelChange?: (key: string) => void;
  thinkingEnabled?: boolean;
  onToggleThinking?: () => void;

  // Voice
  onToggleVoice?: () => void;

  // @ mention
  mentionableNodes?: MentionableNode[];
  /** Optional: maps node.type to an icon component — passed by canvas, omitted in drawer */
  mentionIconMap?: Record<string, React.ReactNode>;
  /** Optional: maps node.type to a display label */
  mentionLabelMap?: Record<string, string>;

  // Prompt presets
  promptPresets?: PromptPreset[];

  // Layout
  variant?: "compact" | "full";
  placeholder?: string;
  /** External ref to the textarea for imperative focus / measurement */
  inputRef?: React.RefObject<HTMLTextAreaElement>;
}

// ── Component ──────────────────────────────────────────────────────────────

const PROVIDERS = ["Anthropic", "OpenAI"] as const;

export function AssistantTextInput({
  value,
  onChange,
  onSend,
  onStop,
  loading = false,
  generating = false,
  recognizing = false,
  pastedImage,
  onClearPastedImage,
  onPaste,
  imageMode = false,
  onToggleImageMode,
  isResearchMode = false,
  onToggleResearchMode,
  onGenerateScript,
  generateScriptDisabled,
  selectedModel,
  models,
  onModelChange,
  thinkingEnabled = false,
  onToggleThinking,
  onToggleVoice,
  mentionableNodes,
  mentionIconMap,
  mentionLabelMap,
  promptPresets,
  variant = "compact",
  placeholder,
  inputRef,
}: AssistantTextInputProps) {
  const fullscreen = variant === "full";

  // ── Internal state owned by this component ────────────────────────────
  const [atMentionQuery, setAtMentionQuery] = useState<string | null>(null);
  const [plusMenuOpen, setPlusMenuOpen] = useState(false);
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);

  // ── Refs ──────────────────────────────────────────────────────────────
  const internalTextareaRef = useRef<HTMLTextAreaElement>(null);
  const textareaRef = inputRef ?? internalTextareaRef;
  const inputBoxRef = useRef<HTMLDivElement>(null);
  const plusMenuRef = useRef<HTMLDivElement>(null);
  const modelDropdownRef = useRef<HTMLDivElement>(null);
  const modelPortalRef = useRef<HTMLDivElement>(null);
  const modelBtnRef = useRef<HTMLButtonElement>(null);

  // ── Auto-resize textarea ──────────────────────────────────────────────
  const adjustTextareaHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }, [textareaRef]);

  // Re-measure when value changes externally (e.g. preset insert, voice append)
  useEffect(() => {
    adjustTextareaHeight();
  }, [value, adjustTextareaHeight]);

  // ── Click-outside for model dropdown ──────────────────────────────────
  useEffect(() => {
    if (!modelDropdownOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        (!modelPortalRef.current || !modelPortalRef.current.contains(target)) &&
        (!modelDropdownRef.current ||
          !modelDropdownRef.current.contains(target)) &&
        (!modelBtnRef.current || !modelBtnRef.current.contains(target))
      ) {
        setModelDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () =>
      document.removeEventListener("mousedown", handleClickOutside);
  }, [modelDropdownOpen]);

  // ── Click-outside for plus menu ───────────────────────────────────────
  useEffect(() => {
    if (!plusMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        plusMenuRef.current &&
        !plusMenuRef.current.contains(e.target as Node)
      ) {
        setPlusMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [plusMenuOpen]);

  // ── @ mention resolution ──────────────────────────────────────────────
  const filteredMentionNodes = (() => {
    if (atMentionQuery === null) return [];
    const q = atMentionQuery;
    return (mentionableNodes ?? [])
      .map((n) => {
        const typeLabel = mentionLabelMap?.[n.type] ?? n.label ?? n.type;
        const iconEl = mentionIconMap?.[n.type] ?? (
          <span className="w-3.5 h-3.5 rounded-full bg-muted-foreground/40 inline-block" />
        );
        const detail = n.detail ?? "";
        return { id: n.id, typeLabel, iconEl, detail };
      })
      .filter(
        (n) =>
          n.typeLabel.toLowerCase().includes(q) ||
          n.detail.toLowerCase().includes(q),
      );
  })();

  const showSendBtn = !loading && !generating && value.trim().length > 0;
  const showStopBtn = loading || generating;
  const showMicBtn = !loading && !generating && value.trim().length === 0;

  const resolvedPlaceholder =
    placeholder ??
    (imageMode ? "Describe the image..." : "Ask anything about your script...");

  return (
    <div className={fullscreen ? "max-w-3xl mx-auto w-full" : ""}>
      {/* Research mode banner */}
      {isResearchMode && (
        <div
          className="flex items-center gap-2 mb-2 px-2 py-1.5 rounded-lg"
          style={{
            background: "rgba(201,169,110,0.08)",
            border: "1px solid rgba(201,169,110,0.2)",
          }}
        >
          <span
            className="w-1.5 h-1.5 rounded-full flex-shrink-0"
            style={{
              background: "#c9a96e",
              boxShadow: "0 0 5px rgba(201,169,110,0.5)",
              animation: "pulse 1.5s infinite",
            }}
          />
          <span className="text-[10px] font-medium" style={{ color: "rgba(201,169,110,0.85)" }}>
            Deep Research mode · 100 credits per query
          </span>
        </div>
      )}

      {/* Pasted image preview */}
      {pastedImage && (
        <div className="flex items-center gap-2 mb-2 px-1">
          <div className="relative flex-shrink-0">
            <img
              src={pastedImage.dataUrl}
              alt="Pasted"
              className="w-12 h-12 rounded-lg object-cover border border-border"
            />
            <button
              type="button"
              onClick={onClearPastedImage}
              className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-card border border-border flex items-center justify-center text-muted-foreground hover:text-foreground"
            >
              <X className="w-2.5 h-2.5" />
            </button>
          </div>
          <span className="text-[10px] text-muted-foreground">
            Image attached — AI will analyze it
          </span>
        </div>
      )}

      {/* UNIFIED INPUT BOX — Claude style */}
      <div
        ref={inputBoxRef}
        className="relative rounded-xl border"
        style={{
          background: imageMode
            ? "rgba(168,85,247,0.05)"
            : "rgba(255,255,255,0.04)",
          borderColor: imageMode
            ? "rgba(168,85,247,0.25)"
            : "rgba(255,255,255,0.1)",
        }}
      >
        {/* @ mention dropdown portal */}
        {atMentionQuery !== null &&
          filteredMentionNodes.length > 0 &&
          createPortal(
            <>
              <div
                style={{ position: "fixed", inset: 0, zIndex: 99998 }}
                onMouseDown={() => setAtMentionQuery(null)}
              />
              <div
                className="rounded-xl border border-border bg-card shadow-xl overflow-hidden"
                style={{
                  position: "fixed",
                  zIndex: 99999,
                  width: 240,
                  maxHeight: 200,
                  overflowY: "auto",
                  ...(textareaRef.current
                    ? {
                        left: textareaRef.current.getBoundingClientRect().left,
                        bottom:
                          window.innerHeight -
                          textareaRef.current.getBoundingClientRect().top +
                          4,
                      }
                    : {}),
                }}
              >
                {filteredMentionNodes.map((node) => (
                  <button
                    key={node.id}
                    type="button"
                    className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/60 transition-colors"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      const atIdx = value.lastIndexOf("@");
                      const before = value.slice(0, atIdx);
                      const newVal =
                        before +
                        `@${node.typeLabel}${
                          node.detail
                            ? "(" + node.detail.slice(0, 20) + ")"
                            : ""
                        } `;
                      onChange(newVal);
                      setAtMentionQuery(null);
                      setTimeout(() => textareaRef.current?.focus(), 0);
                    }}
                  >
                    <span className="text-primary/70">{node.iconEl}</span>
                    <span className="flex-1 truncate">
                      <span className="font-medium text-xs">
                        {node.typeLabel}
                      </span>
                      {node.detail && (
                        <span className="text-muted-foreground text-xs ml-1">
                          — {node.detail}
                        </span>
                      )}
                    </span>
                  </button>
                ))}
              </div>
            </>,
            document.body,
          )}

        {/* Textarea — full width */}
        <div className="relative">
          {/@\S+/.test(value) && (
            <div
              aria-hidden
              className="absolute inset-0 px-3 pt-3 text-xs pointer-events-none overflow-hidden"
              style={{
                fontFamily: "inherit",
                lineHeight: "1.5",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                zIndex: 0,
              }}
            >
              {value.split(/(@\S+)/).map((part, i) =>
                part.startsWith("@") && part.length > 1 ? (
                  <span
                    key={i}
                    style={{
                      background: "rgba(59,130,246,0.18)",
                      color: "#60a5fa",
                      borderRadius: 3,
                      padding: "0 1px",
                    }}
                  >
                    {part}
                  </span>
                ) : (
                  <span key={i} style={{ color: "transparent" }}>
                    {part}
                  </span>
                ),
              )}
            </div>
          )}
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => {
              const val = e.target.value;
              onChange(val);
              adjustTextareaHeight();
              const atIdx = val.lastIndexOf("@");
              if (atIdx >= 0 && !val.slice(atIdx).includes(" ")) {
                setAtMentionQuery(val.slice(atIdx + 1).toLowerCase());
              } else {
                setAtMentionQuery(null);
              }
            }}
            onPaste={onPaste}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setAtMentionQuery(null);
                return;
              }
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSend();
              }
            }}
            placeholder={resolvedPlaceholder}
            data-tutorial-target="ai-chat-input"
            className={`relative resize-none canvas-ai-scroll ${
              fullscreen ? "text-sm" : "text-xs"
            } w-full px-3 pt-3 pb-2 outline-none focus:ring-0 focus:outline-none bg-transparent border-0`}
            style={{
              color: /@\S+/.test(value) ? "transparent" : "#e0e0e0",
              caretColor: "#e0e0e0",
              minHeight: fullscreen ? 64 : 44,
              maxHeight: fullscreen ? 200 : 160,
              overflowY: "auto",
              zIndex: 1,
            }}
            rows={1}
            disabled={loading || generating}
          />
        </div>

        {/* Inner divider */}
        <div
          style={{
            height: 1,
            background: "rgba(255,255,255,0.06)",
            margin: "0 10px",
          }}
        />

        {/* Inner toolbar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 10px",
          }}
        >
          {/* circle-+ — image mode, research, presets. Hidden when no menu items. */}
          {(onToggleImageMode || onToggleResearchMode || (promptPresets && promptPresets.length > 0)) && (
          <div className="relative" ref={plusMenuRef}>
            <button
              type="button"
              onClick={() => setPlusMenuOpen((v) => !v)}
              style={{
                width: 26,
                height: 26,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "rgba(255,255,255,0.45)",
                fontSize: 18,
                fontWeight: 300,
                lineHeight: 1,
                background: "none",
                border: "none",
                cursor: "pointer",
                flexShrink: 0,
                position: "relative",
              }}
            >
              <svg
                style={{ position: "absolute", inset: -3, width: "calc(100% + 6px)", height: "calc(100% + 6px)", overflow: "visible", pointerEvents: "none" }}
                viewBox="0 0 32 32"
                preserveAspectRatio="none"
              >
                <path
                  d="M5,2.5 C10,1 22,1 27,2.5 C30,3.5 31.5,6 31.5,9 C32,15 32,20 31,25 C30,28.5 28,31 24,31.5 C18,32.5 11,32.5 7,31.5 C3.5,31 1.5,28.5 1,25 C0.5,20 0.5,14 1,9 C1.5,5.5 3,3.5 5,2.5 Z"
                  fill="none"
                  stroke="rgba(255,255,255,0.18)"
                  strokeWidth="1.1"
                  strokeLinecap="round"
                />
              </svg>
              +
            </button>
            {plusMenuOpen && (
              <div
                className="absolute bottom-full left-0 mb-2 w-52 rounded-xl border border-border bg-card shadow-xl overflow-hidden"
                style={{ zIndex: 99999 }}
                onPointerDown={(e) => e.stopPropagation()}
              >
                {onToggleImageMode && (
                  <button
                    type="button"
                    className={`w-full flex items-center gap-2 px-3 py-2.5 text-left transition-colors ${
                      imageMode
                        ? "text-purple-400 bg-purple-500/10"
                        : "text-muted-foreground hover:bg-muted/60"
                    }`}
                    onClick={() => {
                      onToggleImageMode();
                      setPlusMenuOpen(false);
                    }}
                  >
                    <ImageIcon className="w-3.5 h-3.5" />
                    <span className="text-xs">
                      Image generation{imageMode ? " (ON)" : ""}
                    </span>
                  </button>
                )}
                {onToggleResearchMode && (
                  <button
                    type="button"
                    className={`w-full flex items-center gap-2 px-3 py-2.5 text-left transition-colors ${
                      isResearchMode ? "" : "text-muted-foreground hover:bg-muted/60"
                    }`}
                    style={isResearchMode ? { color: "#c9a96e", background: "rgba(201,169,110,0.08)" } : undefined}
                    onClick={() => {
                      onToggleResearchMode();
                      setPlusMenuOpen(false);
                    }}
                  >
                    <svg
                      className="w-3.5 h-3.5"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <circle cx="11" cy="11" r="8" />
                      <path d="m21 21-4.35-4.35" />
                      <path d="M11 8v6M8 11h6" />
                    </svg>
                    <span className="text-xs">
                      Deep research{isResearchMode ? " (ON · 100cr)" : ""}
                    </span>
                  </button>
                )}
                {promptPresets && promptPresets.length > 0 && (
                  <>
                    <div className="h-px bg-border mx-3" />
                    <div className="px-3 py-1.5">
                      <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Prompt Presets
                      </p>
                    </div>
                    <div className="p-1.5 space-y-1 max-h-48 overflow-y-auto">
                      {promptPresets.map((preset) => (
                        <button
                          key={preset.name}
                          type="button"
                          className="w-full text-left px-3 py-2 rounded-lg hover:bg-muted/60 transition-colors group"
                          onClick={() => {
                            onChange(preset.prompt);
                            setPlusMenuOpen(false);
                          }}
                        >
                          <p className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors">
                            {preset.name}
                          </p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {preset.description}
                          </p>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
          )}

          {/* spacer */}
          <div style={{ flex: 1 }} />

          {/* Generate Script — teal text button in toolbar */}
          {onGenerateScript && (
            <button
              type="button"
              onPointerDown={(e) => {
                e.stopPropagation();
                e.preventDefault();
                if (!generating && !generateScriptDisabled) {
                  onGenerateScript();
                }
              }}
              onClick={(e) => {
                e.stopPropagation();
              }}
              disabled={generating || generateScriptDisabled}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                color:
                  generating || generateScriptDisabled
                    ? "rgba(201,169,110,0.4)"
                    : "#c9a96e",
                fontSize: 11,
                fontWeight: 600,
                background: "none",
                border: "none",
                cursor:
                  generating || generateScriptDisabled
                    ? "default"
                    : "pointer",
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
            >
              {generating ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Wand2 className="w-3 h-3" />
              )}
              {generating ? "Generating..." : "Generate Script"}
            </button>
          )}

          {/* separator */}
          {onGenerateScript && models && models.length > 0 && (
            <span
              style={{
                width: 1,
                height: 14,
                background: "rgba(255,255,255,0.1)",
                display: "inline-block",
                flexShrink: 0,
              }}
            />
          )}

          {/* Model selector — name + ChevronUp */}
          {models && models.length > 0 && selectedModel && (
            <div className="relative" ref={modelDropdownRef}>
              <button
                ref={modelBtnRef}
                type="button"
                onClick={() => setModelDropdownOpen((v) => !v)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 3,
                  color: "rgba(255,255,255,0.35)",
                  fontSize: 11,
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
                title="Change AI model"
              >
                <span>
                  {models.find((m) => m.key === selectedModel)?.label ??
                    "Haiku"}
                  {thinkingEnabled ? " ✦" : ""}
                </span>
                <ChevronUp
                  style={{
                    width: 10,
                    height: 10,
                    transform: modelDropdownOpen ? "" : "rotate(180deg)",
                    color: "rgba(255,255,255,0.35)",
                  }}
                />
              </button>
              {modelDropdownOpen &&
                createPortal(
                  <>
                    <div
                      style={{ position: "fixed", inset: 0, zIndex: 99998 }}
                      onClick={() => setModelDropdownOpen(false)}
                    />
                    <div
                      ref={modelPortalRef}
                      className="w-52 rounded-xl border border-border bg-card shadow-xl overflow-hidden"
                      style={{
                        position: "fixed",
                        zIndex: 99999,
                        ...(modelBtnRef.current
                          ? {
                              left: modelBtnRef.current.getBoundingClientRect()
                                .left,
                              top:
                                modelBtnRef.current.getBoundingClientRect()
                                  .top - 8,
                              transform: "translateY(-100%)",
                            }
                          : {}),
                      }}
                      onPointerDown={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                    >
                      {PROVIDERS.map((provider) => {
                        const modelsForProvider = models.filter(
                          (m) => m.provider === provider,
                        );
                        if (modelsForProvider.length === 0) return null;
                        return (
                          <div key={provider}>
                            <div className="px-3 py-1.5">
                              <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                                {provider}
                              </p>
                            </div>
                            {modelsForProvider.map((m) => (
                              <button
                                key={m.key}
                                type="button"
                                className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors ${
                                  selectedModel === m.key
                                    ? "border-l-2 text-foreground"
                                    : "text-muted-foreground hover:bg-muted/60"
                                }`}
                                style={selectedModel === m.key ? { borderLeftColor: "#c9a96e", background: "rgba(201,169,110,0.07)" } : undefined}
                                onClick={() => {
                                  onModelChange?.(m.key);
                                  setModelDropdownOpen(false);
                                }}
                              >
                                <span
                                  className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                                  style={{ background: m.color }}
                                />
                                <span className="text-xs font-medium">
                                  {m.label}
                                </span>
                                {selectedModel === m.key && (
                                  <Check className="w-3 h-3 ml-auto" style={{ color: "#c9a96e" }} />
                                )}
                                <span
                                  className={`text-[10px] ${
                                    selectedModel === m.key ? "" : "ml-auto"
                                  } opacity-50`}
                                >
                                  {m.cost}
                                </span>
                              </button>
                            ))}
                            {provider === "Anthropic" && (
                              <div className="h-px bg-border mx-3" />
                            )}
                          </div>
                        );
                      })}
                      {/* Extended thinking toggle */}
                      {onToggleThinking && (
                        <>
                          <div className="h-px bg-border mx-3" />
                          <button
                            type="button"
                            className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors ${
                              selectedModel.includes("sonnet") ||
                              selectedModel.includes("opus")
                                ? "text-muted-foreground hover:bg-muted/60"
                                : "text-muted-foreground/40 cursor-not-allowed"
                            }`}
                            onClick={() => {
                              if (
                                selectedModel.includes("sonnet") ||
                                selectedModel.includes("opus")
                              ) {
                                onToggleThinking();
                              }
                            }}
                          >
                            <span style={{ fontSize: 12, opacity: 0.7 }}>
                              {"✦"}
                            </span>
                            <div className="flex-1 min-w-0">
                              <span className="text-xs font-medium">
                                Extended thinking
                              </span>
                              <p className="text-[9px] opacity-50 mt-0.5">
                                Better answers, slower
                              </p>
                            </div>
                            <div
                              className="relative flex-shrink-0"
                              style={{
                                width: 28,
                                height: 16,
                                borderRadius: 8,
                                background: thinkingEnabled
                                  ? "#c9a96e"
                                  : "rgba(255,255,255,0.15)",
                                transition: "background 0.2s",
                              }}
                            >
                              <div
                                style={{
                                  position: "absolute",
                                  top: 2,
                                  width: 12,
                                  height: 12,
                                  borderRadius: 6,
                                  background: "#fff",
                                  left: thinkingEnabled ? 14 : 2,
                                  transition: "left 0.2s",
                                }}
                              />
                            </div>
                          </button>
                        </>
                      )}
                    </div>
                  </>,
                  document.body,
                )}
            </div>
          )}

          {/* Stop / Send / Mic — crossfade transitions */}
          <div
            style={{
              position: "relative",
              width: 28,
              height: 28,
              flexShrink: 0,
            }}
          >
            {/* Stop button */}
            {onStop && (
              <button
                type="button"
                onClick={onStop}
                style={{
                  position: "absolute",
                  inset: 0,
                  width: 28,
                  height: 28,
                  background: "transparent",
                  border: "none",
                  color: "rgba(255,255,255,0.45)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  opacity: showStopBtn ? 1 : 0,
                  pointerEvents: showStopBtn ? "auto" : "none",
                  transition: "opacity 200ms ease",
                }}
                title="Stop generating"
              >
                <svg
                  style={{ position: "absolute", inset: -4, width: "calc(100% + 8px)", height: "calc(100% + 8px)", overflow: "visible", pointerEvents: "none" }}
                  viewBox="0 0 36 36"
                  preserveAspectRatio="none"
                >
                  <path
                    d="M5,2.5 C10,1 26,1 31,2.5 C34,3.5 35.5,6.5 35.5,10 C36,17 36,22 35,27.5 C34,31 32,33.5 28,34.5 C21,36 13,36 8,34.5 C4,33.5 1.5,31 1,27 C0.5,21 0.5,14 1,9 C1.5,5.5 3,3.5 5,2.5 Z"
                    fill="none"
                    stroke="rgba(255,255,255,0.2)"
                    strokeWidth="1.1"
                    strokeLinecap="round"
                  />
                </svg>
                <Square className="w-3.5 h-3.5 fill-current" />
              </button>
            )}
            {/* Send button */}
            <button
              type="button"
              onClick={onSend}
              style={{
                position: "absolute",
                inset: 0,
                width: 28,
                height: 28,
                background: "transparent",
                border: "none",
                color: "#c9a96e",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                opacity: showSendBtn ? 1 : 0,
                pointerEvents: showSendBtn ? "auto" : "none",
                transition: "opacity 200ms ease",
              }}
              title="Send"
            >
              <svg
                style={{ position: "absolute", inset: -4, width: "calc(100% + 8px)", height: "calc(100% + 8px)", overflow: "visible", pointerEvents: "none" }}
                viewBox="0 0 36 36"
                preserveAspectRatio="none"
              >
                <path
                  d="M5,2.5 C10,1 26,1 31,2.5 C34,3.5 35.5,6.5 35.5,10 C36,17 36,22 35,27.5 C34,31 32,33.5 28,34.5 C21,36 13,36 8,34.5 C4,33.5 1.5,31 1,27 C0.5,21 0.5,14 1,9 C1.5,5.5 3,3.5 5,2.5 Z"
                  fill="none"
                  stroke="#c9a96e"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                />
              </svg>
              <Send className="w-3.5 h-3.5" />
            </button>
            {/* Mic button */}
            {onToggleVoice && (
              <button
                type="button"
                onClick={onToggleVoice}
                style={{
                  position: "absolute",
                  inset: 0,
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  border: "none",
                  background: "none",
                  color: recognizing ? "#f87171" : "rgba(255,255,255,0.35)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  opacity: showMicBtn ? 1 : 0,
                  pointerEvents: showMicBtn ? "auto" : "none",
                  transition: "opacity 200ms ease",
                }}
                title={recognizing ? "Stop recording" : "Voice input"}
              >
                {recognizing ? (
                  <MicOff className="w-3.5 h-3.5" />
                ) : (
                  <Mic className="w-3.5 h-3.5" />
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Image mode indicator */}
      {imageMode && (
        <div className="flex items-center gap-1.5 mt-1.5 px-2 py-1 bg-purple-500/5 rounded-lg w-fit">
          <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
          <span className="text-[10px] text-purple-400">
            Image mode · DALL-E 3 · ~150 cr
          </span>
        </div>
      )}
    </div>
  );
}

