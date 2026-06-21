import type { ScriptLine } from "@/hooks/useScripts";

/**
 * Merge a freshly-fetched remote block list into the local document without
 * overwriting blocks the local user is actively editing.
 *
 * - Order follows `remote`.
 * - A remote block replaces the local one UNLESS its id is in `dirtyIds`
 *   (the user changed it since their last save) — then the local edit is kept.
 * - Local blocks that are dirty but absent from remote (just created locally)
 *   are appended. Clean local blocks absent from remote were deleted remotely
 *   and are dropped.
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

  // Append local-only blocks the user created/edited that remote hasn't seen.
  for (const l of local) {
    if (!l.id) { out.push(l); continue; }
    if (!remoteIds.has(l.id) && dirtyIds.has(l.id)) out.push(l);
  }

  return out;
}
