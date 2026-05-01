import { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight, Check, SkipForward } from "lucide-react";
import type { DeckPayload, DeckAnswer } from "@/lib/parseDeck";

const LETTERS = ["A", "B", "C", "D", "E", "F"];

interface Props {
  deck: DeckPayload;
  initialAnswers?: DeckAnswer[];
  onSubmit: (answers: DeckAnswer[]) => void;
}

export function QuestionDeckCard({ deck, initialAnswers, onSubmit }: Props) {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, DeckAnswer>>(() => {
    const seed: Record<string, DeckAnswer> = {};
    if (initialAnswers) for (const a of initialAnswers) seed[a.id] = a;
    return seed;
  });
  const [typed, setTyped] = useState("");

  const total = deck.questions.length;
  const current = deck.questions[index];
  const isLast = index === total - 1;
  const currentAnswer = answers[current.id];

  const answeredCount = useMemo(
    () => Object.values(answers).filter((a) => a.source !== "skipped").length,
    [answers],
  );

  const selectChip = (chip: string) => {
    setAnswers((prev) => ({ ...prev, [current.id]: { id: current.id, answer: chip, source: "chip" } }));
    setTyped("");
  };

  const commitTyped = () => {
    const value = typed.trim();
    if (value) {
      setAnswers((prev) => ({ ...prev, [current.id]: { id: current.id, answer: value, source: "typed" } }));
    }
  };

  const advance = () => {
    commitTyped();
    if (isLast) {
      const composed = deck.questions.map<DeckAnswer>((q) => {
        const existing = answers[q.id];
        if (q.id === current.id && typed.trim()) {
          return { id: q.id, answer: typed.trim(), source: "typed" };
        }
        return existing ?? { id: q.id, answer: "", source: "skipped" };
      });
      onSubmit(composed);
      return;
    }
    setIndex(index + 1);
    setTyped("");
  };

  const back = () => {
    if (index === 0) return;
    commitTyped();
    setIndex(index - 1);
    setTyped("");
  };

  return (
    <div
      className="my-2"
      style={{
        padding: "12px 14px",
        borderRadius: 14,
        border: "1px solid rgba(34,211,238,0.35)",
        background: "linear-gradient(180deg, rgba(34,211,238,0.08) 0%, rgba(8,145,178,0.04) 100%)",
        boxShadow: "inset 0 0 40px rgba(34,211,238,0.08)",
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <span
          style={{
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: 1.4,
            color: "rgba(34,211,238,0.85)",
            textTransform: "uppercase",
          }}
        >
          Q{index + 1} / {total}{current.label ? ` · ${current.label}` : ""}
        </span>
      </div>
      <h3 className="m-0 mb-1" style={{ fontSize: 13, fontWeight: 700, color: "#f1f5f9", lineHeight: 1.3 }}>
        {current.question}
      </h3>
      {current.body && (
        <p className="mb-2" style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.5 }}>
          {current.body}
        </p>
      )}
      {current.chips.length > 0 && (
        <div className="flex flex-col gap-1.5 mb-2">
          {current.chips.map((chip, chipIdx) => {
            const selected = currentAnswer?.source === "chip" && currentAnswer.answer === chip;
            return (
              <button
                key={chip}
                type="button"
                aria-pressed={selected}
                onClick={() => selectChip(chip)}
                className="flex items-center gap-2.5 text-left transition-colors w-full"
                style={{
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: selected ? "1px solid rgba(34,211,238,0.6)" : "1px solid rgba(148,163,184,0.2)",
                  background: selected ? "rgba(34,211,238,0.12)" : "rgba(255,255,255,0.03)",
                  color: "#e2e8f0",
                  cursor: "pointer",
                }}
              >
                <span
                  className="flex-shrink-0 flex items-center justify-center"
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 6,
                    background: selected ? "rgba(34,211,238,0.25)" : "rgba(148,163,184,0.15)",
                    color: selected ? "#22d3ee" : "#94a3b8",
                    fontSize: 10,
                    fontWeight: 700,
                  }}
                >
                  {LETTERS[chipIdx] ?? chipIdx + 1}
                </span>
                <span className="flex-1" style={{ fontSize: 11, lineHeight: 1.4 }}>
                  {chip}
                </span>
              </button>
            );
          })}
        </div>
      )}
      <div
        className="flex items-center gap-1.5"
        style={{
          padding: "5px 6px 5px 9px",
          background: "rgba(255,255,255,0.03)",
          border: `1px solid ${typed ? "rgba(34,211,238,0.45)" : "rgba(148,163,184,0.15)"}`,
          borderRadius: 7,
        }}
      >
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              advance();
            }
          }}
          placeholder={currentAnswer?.source === "chip" ? currentAnswer.answer : "Or type your own…"}
          className="flex-1 bg-transparent border-0 outline-none"
          style={{ color: "#cbd5e1", fontSize: 11 }}
        />
        <div className="flex gap-1">
          <button
            type="button"
            onClick={back}
            disabled={index === 0}
            aria-label="Previous question"
            className="flex items-center justify-center"
            style={{
              height: 24,
              minWidth: 24,
              padding: "0 6px",
              borderRadius: 6,
              border: "1px solid rgba(148,163,184,0.2)",
              background: "rgba(255,255,255,0.03)",
              color: index === 0 ? "rgba(203,213,225,0.35)" : "#cbd5e1",
              cursor: index === 0 ? "not-allowed" : "pointer",
            }}
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={advance}
            aria-label={isLast ? "Submit answers" : "Next question"}
            className="flex items-center justify-center gap-1"
            style={{
              height: 24,
              padding: "0 10px",
              borderRadius: 6,
              border: "1px solid rgba(34,211,238,0.5)",
              background: "rgba(34,211,238,0.18)",
              color: "#22d3ee",
              fontSize: 10,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {isLast ? (
              <>
                <span>Done</span>
                <Check className="w-3.5 h-3.5" />
              </>
            ) : (
              <>
                <span>Next</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </div>
      </div>
      <div className="flex gap-1 mt-2" aria-label={`Question ${index + 1} of ${total}`}>
        {deck.questions.map((q, i) => {
          const hasAnswer = answers[q.id]?.source && answers[q.id].source !== "skipped";
          const isActive = i === index;
          return (
            <div
              key={q.id}
              style={{
                flex: 1,
                height: 2,
                borderRadius: 1,
                background: hasAnswer
                  ? "rgba(34,211,238,0.75)"
                  : isActive
                  ? "rgba(34,211,238,0.45)"
                  : "rgba(148,163,184,0.2)",
              }}
            />
          );
        })}
      </div>
      <div className="flex justify-between items-center mt-1.5">
        <span style={{ fontSize: 9, color: "rgba(148,163,184,0.55)" }}>
          {answeredCount} / {total} answered
        </span>
        {!isLast && (
          <button
            type="button"
            onClick={() => setIndex(index + 1)}
            className="flex items-center gap-1"
            style={{ fontSize: 9, color: "rgba(148,163,184,0.7)", background: "transparent", border: 0, cursor: "pointer" }}
          >
            <span>Skip</span>
            <SkipForward className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  );
}
