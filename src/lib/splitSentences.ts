// Deterministic sentence splitter for the script editor's Re-categorize action.
//
// Splits a block of text into one segment per sentence WITHOUT ever rewriting or
// reordering characters — it only chops. Used to turn a pasted multi-sentence
// paragraph (one editor block) into several line blocks before the AI recolors
// them. Safety over cleverness: when a cut is uncertain, it does not cut.

// Abbreviations whose trailing period must never be treated as a sentence end.
const PROTECTED_ABBREV = [
  "EE.UU.",
  "Sra.",
  "Sr.",
  "Dra.",
  "Dr.",
  "Lic.",
  "Uds.",
  "Ud.",
  "etc.",
  "No.",
  "Av.",
];

// A sentence ends at a run of . ! ? … followed by whitespace and the start of a
// new sentence (an uppercase/accented letter, or a Spanish opener ¿ / ¡).
const BOUNDARY = /([.!?…]+)(\s+)(?=[A-ZÁÉÍÓÚÑÜ¿¡])/g;

function endsWithProtectedAbbrev(sentence: string): boolean {
  const s = sentence.trimEnd();
  for (const ab of PROTECTED_ABBREV) {
    if (s.endsWith(ab)) {
      const before = s[s.length - ab.length - 1];
      if (before === undefined || /\s/.test(before)) return true;
    }
  }
  return false;
}

function splitPart(part: string): string[] {
  const out: string[] = [];
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  BOUNDARY.lastIndex = 0;
  while ((m = BOUNDARY.exec(part)) !== null) {
    const punctEnd = m.index + m[1].length;
    const sentence = part.slice(lastIndex, punctEnd);
    // A protected abbreviation isn't a real sentence end — keep scanning so the
    // abbreviation stays inside the larger sentence.
    if (endsWithProtectedAbbrev(sentence)) continue;
    const trimmed = sentence.trim();
    if (trimmed) out.push(trimmed);
    lastIndex = punctEnd + m[2].length;
  }
  const tail = part.slice(lastIndex).trim();
  if (tail) out.push(tail);
  return out;
}

/**
 * Returns the sentence segments of `text`, in order, each trimmed and non-empty.
 *
 * - Splits first on existing newlines, then on sentence boundaries.
 * - A single sentence (or input that can't be split safely) returns a
 *   one-element array with the original text.
 * - Empty / whitespace-only input returns an empty array.
 * - Never inserts, drops, or reorders non-whitespace characters: if the produced
 *   segments don't rejoin to the original (ignoring whitespace), the whole text
 *   is returned as a single segment instead.
 */
export function splitSentences(text: string): string[] {
  if (!text || !text.trim()) return [];

  const parts = text.split(/\n+/).map((p) => p.trim()).filter(Boolean);
  const out: string[] = [];
  for (const part of parts) out.push(...splitPart(part));

  // Belt-and-suspenders: never lose or duplicate text. If anything drifted,
  // treat the block as not-split.
  const orig = text.replace(/\s+/g, "");
  const joined = out.join("").replace(/\s+/g, "");
  if (joined !== orig) return [text.trim()];

  return out;
}
