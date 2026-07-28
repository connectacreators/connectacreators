// Extracts complete sentences from a streaming text buffer, for
// sentence-at-a-time TTS: speaking sentence 1 as soon as it's ready, rather
// than waiting for the whole reply then synthesizing/playing it as one
// block. Not linguistically perfect (abbreviations like "Mr. Smith" will
// split) — good enough for TTS chunking, where a slightly off boundary
// changes prosody, not correctness.
//
// A boundary only counts if there's a non-whitespace character AFTER the
// trailing whitespace — i.e. already-present-in-the-buffer proof that the
// sentence really ended here, not just that generation paused mid-sentence
// (e.g. "3." before "5" streams in for "3.5"). This guarantees a boundary
// found mid-stream is real, so the remainder is always safe to keep
// buffering rather than accidentally speaking a half-finished sentence.
const SENTENCE_BOUNDARY = /[.!?]+(?=\s+\S)/g;

export function extractCompleteSentences(buffer: string): { chunks: string[]; remainder: string } {
  const chunks: string[] = [];
  let start = 0;
  SENTENCE_BOUNDARY.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = SENTENCE_BOUNDARY.exec(buffer))) {
    const end = m.index + m[0].length;
    const chunk = buffer.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    start = end;
  }
  return { chunks, remainder: buffer.slice(start) };
}
