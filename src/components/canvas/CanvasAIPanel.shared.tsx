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
  type?: "text" | "image" | "script_preview";
  is_progress?: boolean;
  image_b64?: string;
  _blobUrl?: string;
  revised_prompt?: string;
  credits_used?: number;
  script_data?: ScriptResult;
  _imagePreview?: string;
  is_research?: boolean;
  source_count?: number;
  research_topic?: string;
  actual_model?: string;
  downgraded?: boolean;
  meta?: DeckMeta;
}

// ── Model labels ───────────────────────────────────────────────────────────

export const AI_MODELS = [
  { key: "claude-haiku-4-5", label: "Haiku 4.5", provider: "Anthropic", tier: "fast", color: "#3fb950", cost: "~3-8 cr" },
  { key: "claude-sonnet-4-5", label: "Sonnet 4.5", provider: "Anthropic", tier: "balanced", color: "#0891b2", cost: "~15-25 cr" },
  { key: "claude-opus-4", label: "Opus 4.7", provider: "Anthropic", tier: "power", color: "#a371f7", cost: "~60-100 cr" },
  { key: "gpt-4o-mini", label: "GPT-4o mini", provider: "OpenAI", tier: "fast", color: "#3fb950", cost: "~3-8 cr" },
  { key: "gpt-4o", label: "GPT-4o", provider: "OpenAI", tier: "balanced", color: "#f0883e", cost: "~10-20 cr" },
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

/** Render a single line with inline markdown: **bold**, *italic*, `code`, URLs */
export function renderInline(line: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  // Match **bold**, *italic*, `code`, https:// URLs in order
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`|(https?:\/\/[^\s<>"']+))/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = regex.exec(line)) !== null) {
    if (match.index > last)
      parts.push(<Fragment key={key++}>{line.slice(last, match.index)}</Fragment>);
    if (match[2] !== undefined)
      parts.push(
        <strong key={key++} className="font-semibold">
          {match[2]}
        </strong>,
      );
    else if (match[3] !== undefined)
      parts.push(<em key={key++}>{match[3]}</em>);
    else if (match[4] !== undefined)
      parts.push(
        <code
          key={key++}
          className="px-1 py-0.5 rounded bg-muted text-[10px] font-mono"
        >
          {match[4]}
        </code>,
      );
    else if (match[5] !== undefined)
      parts.push(
        <a
          key={key++}
          href={match[5]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-cyan-400 underline hover:text-cyan-300 break-all"
          onClick={(e) => e.stopPropagation()}
        >
          {match[5]}
        </a>,
      );
    last = match.index + match[0].length;
  }
  if (last < line.length)
    parts.push(<Fragment key={key++}>{line.slice(last)}</Fragment>);
  return parts;
}

/** Render full markdown text: headings, bullets, numbered lists, paragraphs */
export function MarkdownText({ text }: { text: string }) {
  const lines = text.split("\n");
  const nodes: React.ReactNode[] = [];
  let bulletGroup: React.ReactNode[] = [];
  let i = 0;

  const flushBullets = () => {
    if (bulletGroup.length > 0) {
      nodes.push(
        <ul
          key={`ul-${i}`}
          className="list-disc list-inside space-y-0.5 my-1"
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
          className="font-semibold text-foreground mt-2 mb-0.5"
        >
          {renderInline(text)}
        </p>,
      );
    }
    // Bullet: - or *
    else if (/^[-*]\s/.test(trimmed)) {
      const text = trimmed.replace(/^[-*]\s/, "");
      bulletGroup.push(
        <li key={i} className="text-xs leading-relaxed">
          {renderInline(text)}
        </li>,
      );
    }
    // Numbered list: 1. 2. etc
    else if (/^\d+\.\s/.test(trimmed)) {
      flushBullets();
      const text = trimmed.replace(/^\d+\.\s/, "");
      nodes.push(
        <p key={i} className="text-xs leading-relaxed pl-3">
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
            background: "rgba(34,211,238,0.06)",
            borderLeft: "3px solid rgba(34,211,238,0.45)",
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
                color: "#22d3ee",
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
              color: "rgba(255,255,255,0.88)",
              fontFamily: "ui-monospace, 'SF Mono', monospace",
              lineHeight: 1.45,
              flex: 1,
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
              color: "#22d3ee",
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
        <p key={i} className="text-xs leading-relaxed">
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
  editor: { color: "#4ade80", label: "Editor" },
  text_on_screen: { color: "#60a5fa", label: "Text" },
};
const SECTION_ORDER = ["hook", "body", "cta"] as const;
const SECTION_COLORS: Record<string, string> = {
  hook: "#f97316",
  body: "#22d3ee",
  cta: "#a78bfa",
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
  const badgeColor =
    virality >= 8 ? "#4ade80" : virality >= 6 ? "#22d3ee" : "#f97316";

  const handleSave = async () => {
    onSave();
    setSaved(true);
  };

  return (
    <div
      style={{
        background: "rgba(20, 20, 24, 0.85)",
        border: "1px solid rgba(34, 211, 238, 0.25)",
        borderRadius: 12,
        overflow: "hidden",
        backdropFilter: "blur(12px)",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "10px 12px",
          display: "flex",
          alignItems: "center",
          gap: 8,
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          background: "rgba(34, 211, 238, 0.04)",
        }}
      >
        <FileText className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#22d3ee" }} />
        <span
          style={{
            flex: 1,
            fontSize: 11,
            fontWeight: 600,
            color: "rgba(255,255,255,0.9)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {script.idea_ganadora || "Untitled Script"}
        </span>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: badgeColor,
            background: `${badgeColor}15`,
            padding: "2px 7px",
            borderRadius: 6,
            whiteSpace: "nowrap",
          }}
        >
          {virality.toFixed(1)}/10
        </span>
      </div>

      {/* Script Lines — max 5 total */}
      <div style={{ padding: "6px 10px 4px" }}>
        {script.lines.length === 0 ? (
          <div
            style={{
              fontSize: 11,
              color: "rgba(255,255,255,0.35)",
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
            const sectionColor = SECTION_COLORS[section] || "#22d3ee";
            return (
              <div key={section} style={{ marginBottom: 6 }}>
                <div
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: sectionColor,
                    opacity: 0.7,
                    marginBottom: 3,
                  }}
                >
                  {section}
                </div>
                <div
                  style={{
                    background: "rgba(0,0,0,0.3)",
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
                              ? "1px solid rgba(255,255,255,0.04)"
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
                              color: "rgba(255,255,255,0.85)",
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
                  color: "rgba(34,211,238,0.5)",
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
          borderTop: "1px solid rgba(255,255,255,0.06)",
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
            border: "none",
            fontSize: 11,
            fontWeight: 600,
            cursor: saving || saved ? "default" : "pointer",
            background: saved ? "rgba(74, 222, 128, 0.15)" : "rgba(34, 211, 238, 0.15)",
            color: saved ? "#4ade80" : "#22d3ee",
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
            border: "1px solid rgba(255,255,255,0.1)",
            fontSize: 11,
            fontWeight: 500,
            cursor: "pointer",
            background: "transparent",
            color: "rgba(255,255,255,0.5)",
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

const THINKING_VERBS = [
  "Thinking",
  "Connecting",
  "Analyzing",
  "Brainstorming",
  "Crafting",
  "Processing",
  "Reasoning",
  "Exploring",
  "Synthesizing",
  "Considering",
  "Evaluating",
  "Composing",
  "Reflecting",
  "Understanding",
  "Generating",
];

export function ThinkingAnimation() {
  const [index, setIndex] = useState(() =>
    Math.floor(Math.random() * THINKING_VERBS.length),
  );
  const [fade, setFade] = useState(true);

  useEffect(() => {
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
    }, 2400);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex items-center gap-1.5">
      <span
        className="text-[11px] text-muted-foreground/80 font-medium transition-opacity duration-200"
        style={{ opacity: fade ? 1 : 0 }}
      >
        {THINKING_VERBS[index]}
      </span>
      <span className="flex gap-[3px] items-end" style={{ height: 10 }}>
        {([0, 150, 300] as const).map((delay) => (
          <span
            key={delay}
            style={{
              display: "inline-block",
              width: 2.5,
              height: 8,
              borderRadius: 2,
              background: "#c9a96e",
              animation: `goldBarPulse 1.2s ease-in-out infinite`,
              animationDelay: `${delay}ms`,
            }}
          />
        ))}
      </span>
    </div>
  );
}
