// src/components/canvas/CanvasAIPanel.shared.tsx
//
// Shared helpers extracted from CanvasAIPanel.tsx so the new
// `AssistantChat` (src/components/assistant/AssistantChat.tsx) can render
// the exact same message bubbles without duplicating logic.
//
// Phase B.1, Task 3 of the companion <-> canvas AI merge.
//
// Nothing in this module should import from CanvasAIPanel.tsx — that would
// create a circular dependency. Treat this as the source of truth for shared
// types and presentational helpers.

import { Fragment, useEffect, useMemo, useState } from "react";
import { Check, ExternalLink, FileText, Save } from "lucide-react";
import type { DeckAnswer, DeckQuestion } from "@/lib/parseDeck";
import type { BroadcastTurn, EmbedRef } from "@/lib/companion/turn-script";
import robbyThinking from "@/assets/robby-thinking.webp";
import connectaFavicon from "@/assets/connecta-favicon-icon.png";
import { FingerprintAvatar } from "@/components/assistant";

// ── Types ──────────────────────────────────────────────────────────────────

export interface ScriptResult {
  lines: any[];
  idea_ganadora: string;
  target: string;
  formato: string;
  virality_score: number;
  /** Optional change summary blurb — shown above the preview card */
  change_summary?: string;
}

export interface DeckMeta {
  deck_questions: DeckQuestion[];
  deck_answers: DeckAnswer[];
}

export interface AssistantMessage {
  role: "user" | "assistant";
  content: string;
  type?: "text" | "image" | "script_preview" | "plan_proposal";
  is_progress?: boolean;
  image_b64?: string;
  _blobUrl?: string;
  revised_prompt?: string;
  credits_used?: number;
  script_data?: ScriptResult;
  /** Set when type === "plan_proposal" — the multi-step plan the AI wants
   *  the user to approve before executing. Rendered as a card with
   *  Approve / Reject buttons. */
  plan_data?: {
    plan_id: string;
    summary: string;
    steps: Array<{ tool?: string; description?: string }>;
  };
  _imagePreview?: string;
  /** Phase A: when present AND scenes is non-empty, AssistantChat renders this
   *  turn via TurnRenderer (live broadcast scenes) instead of the plain text
   *  content. The text content stays as a fallback so non-upgraded surfaces
   *  still render. */
  broadcast?: BroadcastTurn;
  /** Phase B: standalone embeds (e.g. video cards from find_viral_videos),
   *  rendered AFTER the regular text content. Decoupled from `broadcast` so
   *  the assistant's text reply still renders in its normal style — not as
   *  italic editorial narrative. */
  embeds?: EmbedRef[];
  is_research?: boolean;
  source_count?: number;
  research_topic?: string;
  actual_model?: string;
  downgraded?: boolean;
  meta?: DeckMeta;
}

// ── Model labels ───────────────────────────────────────────────────────────

export const AI_MODELS = [
  { key: "claude-haiku-4-5", label: "Haiku 4.5", provider: "Anthropic", tier: "fast", color: "rgba(20,20,20,0.32)", cost: "~3-8 cr" },
  { key: "claude-sonnet-4-5", label: "Sonnet 4.5", provider: "Anthropic", tier: "balanced", color: "rgba(20,20,20,0.32)", cost: "~15-25 cr" },
  { key: "gpt-4o-mini", label: "GPT-4o mini", provider: "OpenAI", tier: "fast", color: "rgba(20,20,20,0.32)", cost: "~3-8 cr" },
  { key: "gpt-4o", label: "GPT-4o", provider: "OpenAI", tier: "balanced", color: "rgba(20,20,20,0.32)", cost: "~10-20 cr" },
] as const;

export const MODEL_LABEL: Record<string, string> = Object.fromEntries(
  AI_MODELS.map((m) => [m.key, m.label]),
);

// ── Research keyword detection ─────────────────────────────────────────────

// Only match if the message STARTS WITH one of these — prevents false
// positives like "no not research, use the research for the script"
export const RESEARCH_KEYWORDS = [
  "research ",
  "look up ",
  "find data on",
  "find stats on",
  "find studies on",
  "find trends on",
  "what are the latest",
  "search for ",
  "search the web",
  "find information on",
  "find info on",
  "find facts on",
  "web search ",
];

// ── Inline markdown rendering ──────────────────────────────────────────────

/** Render a single line with inline markdown: ![img](url), [link](url),
 *  **bold**, *italic*, `code`, bare URLs. Image and link patterns must come
 *  before the bare-URL pattern so they win against `(url)` inside parens. */
export function renderInline(line: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex =
    /(!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`|(https?:\/\/[^\s<>"']+))/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = regex.exec(line)) !== null) {
    if (match.index > last)
      parts.push(<Fragment key={key++}>{line.slice(last, match.index)}</Fragment>);
    if (match[3] !== undefined)
      parts.push(
        <img
          key={key++}
          src={match[3]}
          alt={match[2] || ""}
          loading="lazy"
          style={{
            maxWidth: "100%",
            maxHeight: 220,
            borderRadius: 6,
            display: "block",
            margin: "4px 0",
          }}
        />,
      );
    else if (match[5] !== undefined)
      parts.push(
        <a
          key={key++}
          href={match[5]}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "rgba(201,169,110,0.8)", textDecoration: "underline", wordBreak: "break-all" as const }}
          onClick={(e) => e.stopPropagation()}
        >
          {match[4]}
        </a>,
      );
    else if (match[6] !== undefined)
      parts.push(
        <strong key={key++} className="font-semibold">
          {match[6]}
        </strong>,
      );
    else if (match[7] !== undefined)
      parts.push(<span key={key++}>{match[7]}</span>);
    else if (match[8] !== undefined)
      parts.push(
        <code
          key={key++}
          style={{
            borderLeft: "1px solid rgba(201,169,110,0.4)",
            paddingLeft: 5,
            fontFamily: "monospace",
            fontSize: "0.9em",
            color: "rgba(20,20,20,0.58)",
          }}
        >
          {match[8]}
        </code>,
      );
    else if (match[9] !== undefined)
      parts.push(
        <a
          key={key++}
          href={match[9]}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "rgba(201,169,110,0.8)", textDecoration: "underline", wordBreak: "break-all" as const }}
          onClick={(e) => e.stopPropagation()}
        >
          {match[9]}
        </a>,
      );
    last = match.index + match[0].length;
  }
  if (last < line.length)
    parts.push(<Fragment key={key++}>{line.slice(last)}</Fragment>);
  return parts;
}

/** Render full markdown text: headings, bullets, numbered lists, paragraphs */
export function MarkdownText({ text, tone = "light" }: { text: string; tone?: "light" | "dark" }) {
  // tone = "light" → white text for DARK surfaces (drawer, /ai page)
  // tone = "dark" → ink text for LIGHT surfaces (editorial canvas)
  const isDarkSurface = tone === "light";
  const scriptLineBg = isDarkSurface ? "rgba(234,230,220,0.05)" : "rgba(20,20,20,0.05)";
  const scriptLineBorder = isDarkSurface ? "rgba(234,230,220,0.20)" : "rgba(20,20,20,0.20)";
  const scriptLineText = isDarkSurface ? "rgba(234,230,220,0.85)" : "rgba(20,20,20,0.85)";
  // Strip leading whitespace so the first rendered element is real content,
  // not an empty-line spacer. This is what makes [&:first-child]:mt-0 fire on
  // a leading heading or bullet list, which keeps the fingerprint icon aligned
  // with the first line of text.
  const lines = text.replace(/^\s+/, "").split("\n");
  const nodes: React.ReactNode[] = [];
  let bulletGroup: React.ReactNode[] = [];
  let i = 0;

  const flushBullets = () => {
    if (bulletGroup.length > 0) {
      nodes.push(
        <ul
          key={`ul-${i}`}
          className="list-disc list-inside space-y-0.5 my-1 [&:first-child]:mt-0"
        >
          {bulletGroup}
        </ul>,
      );
      bulletGroup = [];
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();

    // Heading: # or ##
    if (/^#{1,3}\s/.test(trimmed)) {
      flushBullets();
      const text = trimmed.replace(/^#{1,3}\s/, "");
      nodes.push(
        <p
          key={i}
          className="font-semibold text-foreground mt-2 mb-0.5 [&:first-child]:mt-0"
        >
          {renderInline(text)}
        </p>,
      );
    }
    // Bullet: - or *
    else if (/^[-*]\s/.test(trimmed)) {
      const text = trimmed.replace(/^[-*]\s/, "");
      bulletGroup.push(
        <li key={i} className="leading-relaxed">
          {renderInline(text)}
        </li>,
      );
    }
    // Numbered list: 1. 2. etc
    else if (/^\d+\.\s/.test(trimmed)) {
      flushBullets();
      const text = trimmed.replace(/^\d+\.\s/, "");
      nodes.push(
        <p key={i} className="leading-relaxed pl-3">
          • {renderInline(text)}
        </p>,
      );
    }
    // Empty line — spacing
    else if (trimmed === "") {
      flushBullets();
      nodes.push(<div key={i} className="h-1" />);
    }
    // Script block: only explicit labeled sections (Hook:/Body:/CTA: etc.)
    else if (/^(Hook|Body|CTA|Opening|Closing|Rehook):\s*/i.test(trimmed)) {
      flushBullets();
      const labelMatch = trimmed.match(
        /^(Hook|Body|CTA|Opening|Closing|Rehook):\s*/i,
      );
      const label = labelMatch ? labelMatch[1].toUpperCase() : null;
      const scriptText = trimmed
        .replace(/^(Hook|Body|CTA|Opening|Closing|Rehook):\s*/i, "")
        .trim();
      nodes.push(
        <div
          key={i}
          className="group/scriptline"
          style={{
            background: scriptLineBg,
            borderLeft: `3px solid ${scriptLineBorder}`,
            borderRadius: "0 6px 6px 0",
            padding: "4px 8px",
            margin: "3px 0",
            display: "flex",
            alignItems: "flex-start",
            gap: 6,
          }}
        >
          {label && (
            <span
              style={{
                fontSize: 9,
                fontWeight: 700,
                color: "#8FD0D5",
                opacity: 0.7,
                whiteSpace: "nowrap",
                marginTop: 2,
              }}
            >
              {label}
            </span>
          )}
          <span
            style={{
              fontSize: 11,
              color: scriptLineText,
              fontFamily: "ui-monospace, 'SF Mono', monospace",
              lineHeight: 1.45,
              flex: 1,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {scriptText}
          </span>
          <button
            onClick={() => navigator.clipboard.writeText(scriptText)}
            className="opacity-0 group-hover/scriptline:opacity-60 hover:!opacity-100 transition-opacity"
            style={{
              flexShrink: 0,
              marginTop: 1,
              cursor: "pointer",
              background: "none",
              border: "none",
              padding: 2,
              color: "#8FD0D5",
            }}
            title="Copy line"
          >
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <rect x="9" y="9" width="13" height="13" rx="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
          </button>
        </div>,
      );
    }
    // Normal paragraph line
    else {
      flushBullets();
      nodes.push(
        <p key={i} className="leading-relaxed">
          {renderInline(trimmed)}
        </p>,
      );
    }
    i++;
  }
  flushBullets();
  return <div className="space-y-0.5">{nodes}</div>;
}

// ── Inline Script Preview Card ─────────────────────────────────────────────

const LINE_COLORS: Record<string, { color: string; label: string }> = {
  filming: { color: "#f97316", label: "Filming" },
  actor: { color: "#d4d4d4", label: "Actor" },
  editor: { color: "#8FD0D5", label: "Editor" },
  text_on_screen: { color: "#60a5fa", label: "Text" },
};
const SECTION_ORDER = ["hook", "body", "cta"] as const;
const SECTION_COLORS: Record<string, string> = {
  hook: "rgba(20,20,20,0.35)",
  body: "rgba(20,20,20,0.35)",
  cta: "rgba(20,20,20,0.35)",
};
const MAX_PREVIEW_LINES = 5;

export function InlineScriptPreview({
  script,
  onSave,
  onExpand,
  saving,
}: {
  script: ScriptResult;
  onSave: () => void;
  onExpand: () => void;
  saving?: boolean;
}) {
  const [saved, setSaved] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const grouped = useMemo(() => {
    const map: Record<string, typeof script.lines> = {
      hook: [],
      body: [],
      cta: [],
    };
    for (const line of script.lines) {
      const s = (line.section || "body").toLowerCase();
      if (map[s]) map[s].push(line);
      else map.body.push(line);
    }
    return map;
  }, [script.lines]);

  const virality = script.virality_score ?? 0;

  const handleSave = async () => {
    onSave();
    setSaved(true);
  };

  return (
    <div
      style={{
        background: "#FDF8EC",
        border: "1px solid rgba(20,20,24,0.12)",
        borderRadius: 12,
        overflow: "hidden",
        boxShadow: "0 1px 2px rgba(20,20,24,0.04)",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "10px 12px",
          display: "flex",
          alignItems: "center",
          gap: 8,
          borderBottom: "1px solid rgba(20,20,24,0.08)",
          background: "transparent",
        }}
      >
        <FileText className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "rgba(20,20,24,0.55)" }} />
        <span
          style={{
            flex: 1,
            fontSize: 11,
            fontWeight: 400,
            fontFamily: "'Big Caslon', 'Book Antiqua', Palatino, Georgia, serif",
            letterSpacing: "0.02em",
            color: "rgba(20,20,24,0.92)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {script.idea_ganadora || "Untitled Script"}
        </span>
        <span
          style={{
            fontSize: 11,
            fontWeight: 400,
            fontFamily: "'Big Caslon', 'Book Antiqua', Palatino, Georgia, serif",
            color: "rgba(176,114,30,0.85)",
            letterSpacing: "0.04em",
            whiteSpace: "nowrap",
          }}
        >
          {virality.toFixed(1)}
        </span>
      </div>

      {/* Script Lines — max 5 total */}
      <div style={{ padding: "6px 10px 4px" }}>
        {script.lines.length === 0 ? (
          <div
            style={{
              fontSize: 11,
              color: "rgba(20,20,24,0.50)",
              textAlign: "center",
              padding: "8px 0 4px",
              fontStyle: "italic",
            }}
          >
            Click "Open Full View" to see the full script
          </div>
        ) : null}
        {(() => {
          let used = 0;
          const totalLines = script.lines.length;
          return SECTION_ORDER.map((section) => {
            const lines = grouped[section] || [];
            const limit = expanded ? 9999 : MAX_PREVIEW_LINES;
            if (lines.length === 0 || used >= limit) return null;
            const remaining = limit - used;
            const visible = lines.slice(0, remaining);
            used += visible.length;
            const sectionColor = SECTION_COLORS[section] || "#8FD0D5";
            return (
              <div key={section} style={{ marginBottom: 6 }}>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 300,
                    fontFamily: "'Big Caslon', 'Book Antiqua', Palatino, Georgia, serif",
                    letterSpacing: "0.06em",
                    fontStyle: "italic",
                    color: sectionColor,
                    marginBottom: 3,
                  }}
                >
                  {section}
                </div>
                <div
                  style={{
                    background: "rgba(20,20,24,0.04)",
                    borderRadius: 8,
                    overflow: "hidden",
                  }}
                >
                  {visible.map((line: any, j: number) => {
                    const info = LINE_COLORS[line.line_type] || LINE_COLORS.actor;
                    return (
                      <div
                        key={j}
                        style={{
                          display: "flex",
                          alignItems: "stretch",
                          borderBottom:
                            j < visible.length - 1
                              ? "1px solid rgba(20,20,24,0.06)"
                              : "none",
                        }}
                      >
                        <div
                          style={{
                            width: 3,
                            flexShrink: 0,
                            background: info.color,
                            borderRadius:
                              j === 0
                                ? "8px 0 0 0"
                                : j === visible.length - 1
                                  ? "0 0 0 8px"
                                  : 0,
                          }}
                        />
                        <div style={{ padding: "4px 8px", flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              fontSize: 11,
                              lineHeight: 1.35,
                              color: "rgba(20,20,24,0.88)",
                              ...(expanded
                                ? {}
                                : {
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                  }),
                            }}
                          >
                            {line.text}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          }).concat(
            !expanded && totalLines > MAX_PREVIEW_LINES ? (
              <div
                key="more"
                onClick={() => setExpanded(true)}
                style={{
                  fontSize: 10,
                  color: "rgba(20,20,24,0.55)",
                  textAlign: "center",
                  padding: "2px 0 4px",
                  cursor: "pointer",
                }}
              >
                +{totalLines - MAX_PREVIEW_LINES} more lines
              </div>
            ) : null,
          );
        })()}
      </div>

      {/* Footer buttons */}
      <div
        style={{
          padding: "8px 12px",
          display: "flex",
          gap: 8,
          borderTop: "1px solid rgba(20,20,24,0.08)",
        }}
      >
        <button
          onClick={handleSave}
          disabled={saving || saved}
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            padding: "7px 0",
            borderRadius: 8,
            border: "1px solid rgba(20,20,24,0.85)",
            fontSize: 11,
            fontWeight: 600,
            cursor: saving || saved ? "default" : "pointer",
            background: "#8FD0D5",
            color: "#141414",
            transition: "all 0.2s",
          }}
        >
          {saved ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
          {saving ? "Saving..." : saved ? "Saved" : "Save Script"}
        </button>
        <button
          onClick={onExpand}
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            padding: "7px 0",
            borderRadius: 8,
            border: "1px solid rgba(20,20,24,0.18)",
            fontSize: 11,
            fontWeight: 500,
            cursor: "pointer",
            background: "transparent",
            color: "rgba(20,20,24,0.70)",
            transition: "all 0.2s",
          }}
        >
          <ExternalLink className="w-3.5 h-3.5" />
          Open Full View
        </button>
      </div>
    </div>
  );
}

// ── Thinking animation ─────────────────────────────────────────────────────

// Action-oriented phrases that read like real progress. Rotated randomly while
// the request is in flight. This is purely cosmetic — companion-chat doesn't
// actually stream tool-call events yet, so the indicator isn't tied to what's
// happening on the backend. Real progress streaming is a follow-up refactor.
const THINKING_VERBS = [
  "Reading your strategy",
  "Searching Viral Today",
  "Looking up the client",
  "Checking the editing queue",
  "Pulling the latest data",
  "Drafting ideas",
  "Composing the reply",
  "Connecting the dots",
  "Weighing the options",
  "Generating hooks",
  "Cross-referencing alerts",
  "Reading recent posts",
  "Sketching the angle",
  "Distilling",
  "Thinking",
];

/**
 * In-flight indicator shown after a user message but before the assistant's
 * first token arrives. Pairs the animated fingerprint MP4 with a rotating
 * verb so it's obvious the model is working, not stuck.
 *
 * @param tone "light" for dark surfaces (drawer, /ai) where the MP4's
 *             screen-blend reads on the dark bg. "dark" for the canvas's
 *             editorial light surface, where the MP4 doesn't blend cleanly
 *             so we fall back to the static ink fingerprint.
 */
export function ThinkingAnimation({
  tone = "dark",
  verb: explicitVerb,
  meta: explicitMeta,
}: {
  tone?: "light" | "dark";
  /** When provided (e.g. live from a companion-chat SSE scene event), this
   *  exact verb is shown and the random rotation is paused. */
  verb?: string;
  /** Optional technical hint shown small under the verb (JetBrains Mono). */
  meta?: string;
} = {}) {
  const [index, setIndex] = useState(() =>
    Math.floor(Math.random() * THINKING_VERBS.length),
  );
  const [fade, setFade] = useState(true);

  useEffect(() => {
    // Pause the rotation when the parent is feeding us a real verb — no
    // point rotating placeholder phrases under a live signal.
    if (explicitVerb) return;
    const interval = setInterval(() => {
      setFade(false);
      setTimeout(() => {
        setIndex((prev) => {
          let next: number;
          do {
            next = Math.floor(Math.random() * THINKING_VERBS.length);
          } while (next === prev);
          return next;
        });
        setFade(true);
      }, 200);
    }, 1800);
    return () => clearInterval(interval);
  }, [explicitVerb]);

  // Fade the explicit verb on change too so transitions feel intentional.
  useEffect(() => {
    if (!explicitVerb) return;
    setFade(false);
    const t = setTimeout(() => setFade(true), 60);
    return () => clearTimeout(t);
  }, [explicitVerb]);

  const verbText = explicitVerb ?? THINKING_VERBS[index];
  const verbColor = tone === "dark" ? "rgba(20,20,20,0.55)" : "rgba(234,230,220,0.65)";
  const metaColor = tone === "dark" ? "rgba(20,20,20,0.35)" : "rgba(234,230,220,0.40)";

  return (
    <div className="flex items-center gap-2">
      <FingerprintAvatar size="sm" tone={tone} animated />
      <div className="flex flex-col leading-tight">
        <span
          className="text-[11px] font-medium transition-opacity duration-200"
          style={{ opacity: fade ? 1 : 0, color: verbColor }}
        >
          {verbText}
        </span>
        {explicitMeta && (
          <span
            className="text-[9px] font-jetbrains transition-opacity duration-200"
            style={{ opacity: fade ? 1 : 0, color: metaColor, letterSpacing: "0.02em" }}
          >
            {explicitMeta}
          </span>
        )}
      </div>
    </div>
  );
}
