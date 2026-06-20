import type { ScriptLine } from "@/hooks/useScripts";

export interface BlockRow {
  id: string;
  line_number: number;
  line_type: string;
  section: string;
  text: string;
  rich_text: string | null;
  block_kind: "line" | "heading";
}

export interface BlockDiff {
  upserts: BlockRow[];
  deleteIds: string[];
}

/** Stable content signature: any field that must persist if changed. */
export function blockSignature(b: {
  line_number: number; line_type: string; section: string; text: string;
  rich_text?: string | null; block_kind?: string;
}): string {
  return JSON.stringify([
    b.line_number, b.line_type, b.section, b.text,
    b.rich_text ?? null, b.block_kind ?? "line",
  ]);
}

export function buildBaseline(blocks: (ScriptLine & { id: string })[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const b of blocks) m.set(b.id, blockSignature(b));
  return m;
}

export function computeBlockDiff(
  nextBlocks: (ScriptLine & { id: string })[],
  baseline: Map<string, string>,
  removedIds: string[],
): BlockDiff {
  const nextIds = new Set(nextBlocks.map((b) => b.id));
  const upserts: BlockRow[] = [];
  for (const b of nextBlocks) {
    if (baseline.get(b.id) !== blockSignature(b)) {
      upserts.push({
        id: b.id,
        line_number: b.line_number,
        line_type: b.line_type,
        section: b.section,
        text: b.text,
        rich_text: b.rich_text ?? null,
        block_kind: (b.block_kind ?? "line") as "line" | "heading",
      });
    }
  }
  const deleteIds = Array.from(new Set(removedIds)).filter((id) => !nextIds.has(id));
  return { upserts, deleteIds };
}
