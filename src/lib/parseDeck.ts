export interface DeckQuestion {
  id: string;
  label: string;
  question: string;
  body?: string;
  chips: string[];
}

export interface DeckPayload {
  type: "questions_deck";
  preamble?: string;
  questions: DeckQuestion[];
}

export interface DeckAnswer {
  id: string;
  answer: string;
  source: "chip" | "typed" | "skipped";
}

const FENCE_RE = /^\s*```(?:json)?\s*\n([\s\S]*?)\n```\s*$/;

function extractJson(raw: string): string | null {
  const fenced = raw.match(FENCE_RE);
  if (fenced) return fenced[1].trim();
  const trimmed = raw.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace <= firstBrace) return null;
  return trimmed.slice(firstBrace, lastBrace + 1);
}

export function parseDeck(raw: string): DeckPayload | null {
  if (!raw || typeof raw !== "string") return null;
  if (!raw.includes("questions_deck")) return null;
  const candidate = extractJson(raw);
  if (!candidate) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;
  if (obj.type !== "questions_deck") return null;
  if (!Array.isArray(obj.questions) || obj.questions.length === 0) return null;
  const questions: DeckQuestion[] = [];
  for (const q of obj.questions) {
    if (!q || typeof q !== "object") return null;
    const qo = q as Record<string, unknown>;
    if (typeof qo.id !== "string" || typeof qo.question !== "string") return null;
    const chips = Array.isArray(qo.chips)
      ? qo.chips.filter((c): c is string => typeof c === "string")
      : [];
    questions.push({
      id: qo.id,
      label: typeof qo.label === "string" ? qo.label : "",
      question: qo.question,
      body: typeof qo.body === "string" ? qo.body : undefined,
      chips,
    });
  }
  return {
    type: "questions_deck",
    preamble: typeof obj.preamble === "string" ? obj.preamble : undefined,
    questions,
  };
}

export function composeDeckAnswers(
  questions: DeckQuestion[],
  answers: DeckAnswer[],
): string {
  const byId = new Map(answers.map((a) => [a.id, a]));
  return questions
    .map((q, idx) => {
      const a = byId.get(q.id);
      const label = q.label ? ` — ${q.label}` : "";
      if (!a || a.source === "skipped") return `Q${idx + 1}${label}: (skipped)`;
      return `Q${idx + 1}${label}: ${a.answer}`;
    })
    .join("\n");
}
