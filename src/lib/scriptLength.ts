import type { ScriptLine } from "@/hooks/useScripts";

/** Max characters allowed in a script body (content lines, headings excluded). */
export const SCRIPT_BODY_CHAR_LIMIT = 15000;

/** Total characters across content-line text (heading rows don't count). */
export function scriptBodyLength(blocks: ScriptLine[]): number {
  let total = 0;
  for (const b of blocks) {
    if ((b.block_kind ?? "line") === "heading") continue;
    total += (b.text ?? "").length;
  }
  return total;
}
