// Shared helpers for the "everything is a block" script model.
// A script is one ordered list of script_lines rows. block_kind:'heading' rows are
// renamable section headers (their `section` = role hook/body/cta/custom-slug; their
// text/rich_text = the label). block_kind:'line' rows are content; each content
// line's `section` = role of the nearest heading above it.
import type { ScriptLine } from "@/hooks/useScripts";

// Canonical order for synthesizing/sorting roles when no explicit headings exist.
export const CANONICAL_SECTION_ORDER = ["hook", "body", "cta"] as const;

const DEFAULT_SECTION_LABELS: Record<string, string> = {
  hook: "Hook",
  body: "Body",
  cta: "CTA",
};

// Human label for a role/slug: built-ins map to Hook/Body/CTA; custom slugs are Title-cased.
export function defaultSectionLabel(role: string): string {
  if (DEFAULT_SECTION_LABELS[role]) return DEFAULT_SECTION_LABELS[role];
  return role
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ") || "Section";
}

// Generate a stable in-memory uid for an editor block.
let _uidCounter = 0;
export function newBlockUid(): string {
  _uidCounter += 1;
  return `blk_${Date.now().toString(36)}_${_uidCounter.toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// Ensure every block carries a stable uid (preserve existing ones).
export function withUids(blocks: ScriptLine[]): ScriptLine[] {
  return blocks.map((b) => (b.uid ? b : { ...b, uid: newBlockUid() }));
}

// Distinct content-line sections in canonical order [hook, body, cta, ...custom].
export function distinctSectionsInOrder(lines: ScriptLine[]): string[] {
  const seen = new Set<string>();
  const order: string[] = [];
  for (const l of lines) {
    const s = l.section || "body";
    if (!seen.has(s)) { seen.add(s); order.push(s); }
  }
  const rank = (s: string) => {
    const i = (CANONICAL_SECTION_ORDER as readonly string[]).indexOf(s);
    return i === -1 ? CANONICAL_SECTION_ORDER.length + order.indexOf(s) : i;
  };
  return order.sort((a, b) => rank(a) - rank(b));
}

// Synthesize an interleaved heading+line block list from content-only lines.
// Used for lazy backfill (no heading rows exist) and to converge Card View save.
export function synthesizeBlocksFromLines(lines: ScriptLine[]): ScriptLine[] {
  const sections = distinctSectionsInOrder(lines);
  // If there are no lines at all, default to the three canonical sections so the
  // editor always shows Hook/Body/CTA headings.
  const order = sections.length > 0 ? sections : [...CANONICAL_SECTION_ORDER];
  const out: ScriptLine[] = [];
  for (const role of order) {
    out.push({
      line_number: 0,
      line_type: "text_on_screen",
      section: role as ScriptLine["section"],
      text: defaultSectionLabel(role),
      block_kind: "heading",
      uid: newBlockUid(),
    });
    for (const l of lines) {
      if ((l.section || "body") === role) {
        out.push({ ...l, block_kind: "line", uid: l.uid ?? newBlockUid() });
      }
    }
  }
  return out;
}

// Move an item within an array (pure). Mirrors @dnd-kit's arrayMove so the data
// layer stays free of UI deps.
function moveItem<T>(arr: T[], from: number, to: number): T[] {
  const next = arr.slice();
  const [item] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(to, next.length)), 0, item);
  return next;
}

// Compute the new block order when block `activeId` is dragged onto block `overId`.
//
// - Content lines move individually (simple reorder within the stream).
// - A heading (section) moves as a unit together with all of its content lines
//   (the slice from the heading up to — but not including — the next heading).
//   Sections are atomic: a section is never interleaved into another section's
//   lines. `dropIsBelow` (did the dragged row land on the LOWER half of the
//   target row?) decides whether the section lands just AFTER or just BEFORE the
//   target's whole section — so it goes where you dropped it, not at the top.
//
// Returns the new block array, or null when the move is a no-op / invalid.
export function reorderBlocksOnDrag(
  blocks: ScriptLine[],
  activeId: string,
  overId: string,
  dropIsBelow: boolean,
): ScriptLine[] | null {
  if (activeId === overId) return null;
  const fromIdx = blocks.findIndex((b) => b.uid === activeId);
  const overIdx = blocks.findIndex((b) => b.uid === overId);
  if (fromIdx === -1 || overIdx === -1) return null;

  const dragged = blocks[fromIdx];

  // --- Content-line move: simple reorder within the stream. ---
  if (dragged.block_kind !== "heading") {
    const next = moveItem(blocks, fromIdx, overIdx);
    return next.some((b, i) => b.uid !== blocks[i].uid) ? next : null;
  }

  // --- Heading (group) move: relocate the heading + its lines as a unit. ---
  // The dragged section's slice is [fromIdx, sliceEnd).
  let sliceEnd = blocks.length;
  for (let i = fromIdx + 1; i < blocks.length; i++) {
    if (blocks[i].block_kind === "heading") { sliceEnd = i; break; }
  }
  const groupSize = sliceEnd - fromIdx;
  if (groupSize <= 0) return null;
  const groupSlice = blocks.slice(fromIdx, sliceEnd);
  const remaining = [...blocks.slice(0, fromIdx), ...blocks.slice(sliceEnd)];

  // Drop target inside the moved group → no-op.
  const targetIdx = remaining.findIndex((b) => b.uid === overId);
  if (targetIdx === -1) return null;

  // Resolve the target's section span [boundary, secEnd): boundary = nearest
  // heading at/above the target; secEnd = the following heading (or end).
  let boundary = 0;
  for (let i = targetIdx; i >= 0; i--) {
    if (remaining[i].block_kind === "heading") { boundary = i; break; }
  }
  let secEnd = remaining.length;
  for (let i = boundary + 1; i < remaining.length; i++) {
    if (remaining[i].block_kind === "heading") { secEnd = i; break; }
  }

  // Lower half → after the target section; upper half → before it.
  const insertAt = dropIsBelow ? secEnd : boundary;
  const next = [
    ...remaining.slice(0, insertAt),
    ...groupSlice,
    ...remaining.slice(insertAt),
  ];
  if (next.length !== blocks.length) return null;
  return next.some((b, i) => b.uid !== blocks[i].uid) ? next : null;
}

// Given the FULL ordered block list, recompute each content line's section from the
// nearest preceding heading (fallback 'body'), and renumber line_number = index+1.
// Heading rows keep their own section (role) and label. Returns a normalized copy.
export function normalizeBlocks(blocks: ScriptLine[]): ScriptLine[] {
  let currentRole = "body";
  return blocks.map((b, i) => {
    if (b.block_kind === "heading") {
      currentRole = b.section || "body";
      return { ...b, line_number: i + 1 };
    }
    return {
      ...b,
      block_kind: "line" as const,
      section: currentRole as ScriptLine["section"],
      line_number: i + 1,
    };
  });
}
