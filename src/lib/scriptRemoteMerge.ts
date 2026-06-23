import type { ScriptLine } from "@/hooks/useScripts";

/**
 * Merge a freshly-fetched remote block list into the local document.
 *
 * SAFETY INVARIANT: this NEVER removes a line from the editor. A behind/stale
 * remote copy (e.g. a peer that hasn't saved yet, or a re-sync triggered by a
 * tab swipe) must not be able to make a line disappear.
 *
 * - Order follows `remote` for blocks present in both.
 * - A remote block replaces the local one UNLESS its id is in `dirtyIds` (the
 *   user changed it since their last save) — then the local edit is kept.
 * - EVERY local-only block (present locally, absent from remote) is kept and
 *   appended — whether dirty (just created) or clean. We deliberately do NOT
 *   treat "absent from remote" as "deleted remotely", because we cannot tell a
 *   real deletion apart from a remote copy that is merely behind. Trade-off: a
 *   line deleted in another session reappears here (safe over-preservation)
 *   until re-deleted; true deletion-propagation is left to the CRDT model.
 * - The local `uid` is carried onto taken-remote blocks so React keys are stable.
 */
export function mergeRemoteBlocks(
  local: ScriptLine[],
  remote: ScriptLine[],
  dirtyIds: Set<string>,
): ScriptLine[] {
  const localById = new Map<string, ScriptLine>();
  for (const l of local) if (l.id) localById.set(l.id, l);

  const remoteIds = new Set<string>();
  const out: ScriptLine[] = [];

  for (const r of remote) {
    if (!r.id) { out.push(r); continue; }
    remoteIds.add(r.id);
    const localMatch = localById.get(r.id);
    if (localMatch && dirtyIds.has(r.id)) {
      out.push(localMatch); // preserve the user's unsaved edit
    } else {
      out.push({ ...r, uid: localMatch?.uid ?? r.uid });
    }
  }

  // Keep EVERY local-only block (never drop a line from the editor).
  for (const l of local) {
    if (!l.id) { out.push(l); continue; }
    if (!remoteIds.has(l.id)) out.push(l);
  }

  return out;
}
