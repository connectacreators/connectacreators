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
        background: "#1e293b",
        border: "1px solid rgba(34,211,238,0.25)",
        borderRadius: 10,
        padding: "10px 12px",
        color: "#cbd5e1",
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
                  color: "rgba(148,163,184,0.6)",
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
                  color: "#f1f5f9",
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
        style={{ borderTop: "1px solid rgba(148,163,184,0.12)" }}
      >
        <span style={{ color: "rgba(148,163,184,0.6)", fontSize: 9 }}>
          {answeredCount} / {questions.length} answered
        </span>
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            className="flex items-center gap-1"
            style={{
              color: "#22d3ee",
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
