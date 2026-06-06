import { Pencil } from "lucide-react";
import type { DeckQuestion, DeckAnswer } from "@/lib/parseDeck";

interface Props {
  questions: DeckQuestion[];
  answers: DeckAnswer[];
  onEdit?: () => void;
}

export function DeckSummaryBubble({ questions, answers, onEdit }: Props) {
  const byId = new Map(answers.map((a) => [a.id, a]));
  const answeredCount = answers.filter((a) => a.source !== "skipped").length;
  return (
    <div
      style={{
        background: "hsl(var(--cream))",
        border: "1px solid hsl(var(--ink-on-cream) / 0.12)",
        borderRadius: 10,
        padding: "10px 12px",
        color: "hsl(var(--ink-on-cream) / 0.7)",
        fontSize: 11,
        lineHeight: 1.5,
      }}
    >
      <dl className="m-0 p-0">
        {questions.map((q, idx) => {
          const a = byId.get(q.id);
          const isTyped = a?.source === "typed";
          const display = !a || a.source === "skipped" ? "—" : a.answer;
          return (
            <div key={q.id} className="flex gap-1.5 py-0.5">
              <dt
                style={{
                  color: "hsl(var(--ink-on-cream) / 0.4)",
                  flexShrink: 0,
                  width: 32,
                  fontVariantNumeric: "tabular-nums",
                  fontWeight: 600,
                }}
              >
                Q{idx + 1}
              </dt>
              <dd
                className="m-0 flex-1"
                style={{
                  color: "hsl(var(--ink-on-cream))",
                  fontStyle: isTyped ? "italic" : "normal",
                }}
              >
                {display}
              </dd>
            </div>
          );
        })}
      </dl>
      <div
        className="flex justify-between items-center mt-2 pt-1.5"
        style={{ borderTop: "1px solid hsl(var(--ink-on-cream) / 0.08)" }}
      >
        <span style={{ color: "hsl(var(--ink-on-cream) / 0.4)", fontSize: 9 }}>
          {answeredCount} / {questions.length} answered
        </span>
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            className="flex items-center gap-1"
            style={{
              color: "hsl(var(--aqua))",
              fontSize: 9,
              fontWeight: 600,
              background: "transparent",
              border: 0,
              cursor: "pointer",
            }}
          >
            <Pencil className="w-2.5 h-2.5" />
            <span>Edit</span>
          </button>
        )}
      </div>
    </div>
  );
}
