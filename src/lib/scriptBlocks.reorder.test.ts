// Standalone test for reorderBlocksOnDrag (no vitest in this repo).
// Run: npx tsx src/lib/scriptBlocks.reorder.test.ts
import { reorderBlocksOnDrag } from "./scriptBlocks";
import type { ScriptLine } from "@/hooks/useScripts";

const H = (uid: string, section: string): ScriptLine => ({
  line_number: 0, line_type: "text_on_screen", section: section as ScriptLine["section"],
  text: section, block_kind: "heading", uid,
});
const L = (uid: string, section: string): ScriptLine => ({
  line_number: 0, line_type: "filming", section: section as ScriptLine["section"],
  text: uid, block_kind: "line", uid,
});

let failures = 0;
function eq(name: string, got: ScriptLine[] | null, expectedUids: string[] | null) {
  const gotUids = got === null ? null : got.map((b) => b.uid);
  const ok = JSON.stringify(gotUids) === JSON.stringify(expectedUids);
  if (!ok) { failures++; console.error(`✗ ${name}\n   got: ${JSON.stringify(gotUids)}\n   exp: ${JSON.stringify(expectedUids)}`); }
  else console.log(`✓ ${name}`);
}

// Fixture: Hook[a1,a2] · Body[b1] · CTA[c1]
const base = (): ScriptLine[] => [
  H("H1", "hook"), L("a1", "hook"), L("a2", "hook"),
  H("H2", "body"), L("b1", "body"),
  H("H3", "cta"),  L("c1", "cta"),
];

// THE BUG: drag CTA section UP onto a hook line, dropping on the LOWER half.
// Was: jumped to the absolute top. Now: lands just after the Hook section.
eq("section up, lower half → after target section (not top)",
  reorderBlocksOnDrag(base(), "H3", "a2", /*dropIsBelow*/ true),
  ["H1", "a1", "a2", "H3", "c1", "H2", "b1"]);

// Upper half of the same target → before the target section (intentional top here).
eq("section up, upper half → before target section",
  reorderBlocksOnDrag(base(), "H3", "a2", /*dropIsBelow*/ false),
  ["H3", "c1", "H1", "a1", "a2", "H2", "b1"]);

// Drag Hook section DOWN onto a body line, lower half → after the Body section.
eq("section down, lower half → after target section",
  reorderBlocksOnDrag(base(), "H1", "b1", /*dropIsBelow*/ true),
  ["H2", "b1", "H1", "a1", "a2", "H3", "c1"]);

// Dropping a section just below its own current neighbour = no change → null.
eq("section move that changes nothing → null",
  reorderBlocksOnDrag(base(), "H3", "b1", /*dropIsBelow*/ true),
  null);

// Sections never get split: the whole group [H3,c1] stays contiguous (checked above).
// Content line move is a plain reorder, independent of dropIsBelow.
eq("content line move → plain reorder",
  reorderBlocksOnDrag(base(), "a1", "c1", /*dropIsBelow*/ false),
  ["H1", "a2", "H2", "b1", "H3", "c1", "a1"]);

// Guards.
eq("drop onto self → null", reorderBlocksOnDrag(base(), "H1", "H1", true), null);
eq("unknown id → null", reorderBlocksOnDrag(base(), "nope", "a1", true), null);

// Length is always preserved on a real move.
for (const r of [
  reorderBlocksOnDrag(base(), "H3", "a2", true),
  reorderBlocksOnDrag(base(), "H1", "b1", true),
  reorderBlocksOnDrag(base(), "a1", "c1", false),
]) {
  if (r && r.length !== 7) { failures++; console.error(`✗ length preserved (got ${r.length})`); }
}
console.log(failures === 0 ? "✓ length preserved on all moves" : "");

if (failures > 0) { console.error(`\n${failures} test(s) failed`); process.exit(1); }
console.log("\nAll reorder tests passed.");
