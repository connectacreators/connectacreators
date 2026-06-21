# Collaborative Script Editing — Phase 2 (Presence Avatars) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Show a presence banner of the real people currently viewing/editing an open script (name initials + per-person color), so collaborators can see who else is in the script.

**Architecture:** Reuse the existing Supabase presence hook (`useRealtimePresence`, used by Super Canvas), extended to carry the logged-in user's display name. A new `ScriptPresenceBanner` renders deduped real-person avatars. `Scripts.tsx` joins a `script:<scriptId>` presence room when a script is open and mounts the banner in the editor header.

**Tech Stack:** React + TypeScript, Supabase Realtime presence, Vitest. Spec: `docs/superpowers/specs/2026-06-20-collaborative-script-editing-design.md`.

## Global Constraints

- Editor lives on `origin/main`; this work is in a worktree off main.
- App-surface code uses `hsl(var(--...))` branding tokens, never palette hex (pre-commit hook blocks hex). The aqua token is `hsl(var(--aqua))`.
- CI runs `vite build` only; tsconfig is NON-STRICT (won't catch type/null mismatches). Verify `npx tsc --noEmit` exits 0 and judge correctness by reading code.
- Supabase project id: `hxojqrilwhhrvloiwmfo`.
- `useRealtimePresence` already exists at `src/hooks/useRealtimePresence.ts`; presence channels need no realtime-publication changes.

---

## Task 1: Carry display name through `useRealtimePresence`

**Files:**
- Modify: `src/hooks/useRealtimePresence.ts`

**Interfaces:**
- Produces: `PresenceUser.name?: string`; `UseRealtimePresenceOptions.displayName?: string`. The tracked payload includes `name: displayName` in all three `.track(...)` calls.

- [ ] **Step 1: Add `name` to `PresenceUser`**

In `src/hooks/useRealtimePresence.ts`, in the `PresenceUser` interface, add after `userId: string;`:

```ts
  name?: string;
```

- [ ] **Step 2: Add `displayName` to the options interface**

In `UseRealtimePresenceOptions`, add:

```ts
  /** Human display name for real-person presence (e.g. profile display_name) */
  displayName?: string;
```

- [ ] **Step 3: Destructure and track `displayName`**

In the hook signature destructure, add `displayName,` (after `userId,`). Then add `name: displayName,` to the payload object in ALL THREE `channel.track({...})` / `channelRef.current.track({...})` calls (the `broadcastCursor` callback, the `.subscribe` SUBSCRIBED handler, and the currentView-change effect). Also add `displayName` to the dependency array of the `broadcastCursor` `useCallback` and the currentView effect.

Example (the SUBSCRIBED handler):

```ts
          await channel.track({
            tabId: tabId.current,
            userId,
            name: displayName,
            animalName: animalName.current,
            color: color.current,
            lastActive: Date.now(),
            currentView,
          });
```

- [ ] **Step 4: Verify compile**

Run: `npx tsc --noEmit`
Expected: exit 0. (Super Canvas callers omit `displayName`; it is optional, so they are unaffected.)

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useRealtimePresence.ts
git commit -m "feat(presence): carry display name through useRealtimePresence"
```

---

## Task 2: `ScriptPresenceBanner` component + tests for its pure helpers

**Files:**
- Create: `src/components/scripts/ScriptPresenceBanner.tsx`
- Create: `src/lib/presenceAvatar.ts`
- Test: `src/lib/presenceAvatar.test.ts`

**Interfaces:**
- Consumes: `PresenceUser` from `@/hooks/useRealtimePresence`.
- Produces:
  - `initialsFromName(name: string | undefined): string` — up to 2 uppercase initials; `"?"` when empty.
  - `colorForUser(userId: string): string` — deterministic `hsl(...)` from a hash of userId (stable per person).
  - `dedupePresenceByUser(others: PresenceUser[]): PresenceUser[]` — one entry per `userId` (first wins), preserving order.
  - Default export `ScriptPresenceBanner({ others }: { others: PresenceUser[] })` — renders nothing when no others; otherwise a row of colored circular avatars with initials and a hover tooltip showing the full name.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/presenceAvatar.test.ts
import { describe, it, expect } from "vitest";
import { initialsFromName, colorForUser, dedupePresenceByUser } from "./presenceAvatar";
import type { PresenceUser } from "@/hooks/useRealtimePresence";

const u = (userId: string, name?: string, tabId = userId + "-t"): PresenceUser => ({
  tabId, userId, name, animalName: "Cat", color: "#fff", lastActive: 0,
});

describe("initialsFromName", () => {
  it("returns up to two uppercase initials", () => {
    expect(initialsFromName("Roberto Gauna")).toBe("RG");
    expect(initialsFromName("joss")).toBe("J");
  });
  it("falls back to ? when empty/undefined", () => {
    expect(initialsFromName(undefined)).toBe("?");
    expect(initialsFromName("   ")).toBe("?");
  });
});

describe("colorForUser", () => {
  it("is deterministic per userId", () => {
    expect(colorForUser("abc")).toBe(colorForUser("abc"));
  });
  it("returns an hsl() string", () => {
    expect(colorForUser("abc")).toMatch(/^hsl\(/);
  });
});

describe("dedupePresenceByUser", () => {
  it("keeps one entry per userId, preserving order", () => {
    const list = [u("a", "A"), u("b", "B"), u("a", "A", "a-t2")];
    expect(dedupePresenceByUser(list).map((x) => x.userId)).toEqual(["a", "b"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/presenceAvatar.test.ts`
Expected: FAIL — cannot resolve `./presenceAvatar`.

- [ ] **Step 3: Implement the pure helpers**

```ts
// src/lib/presenceAvatar.ts
import type { PresenceUser } from "@/hooks/useRealtimePresence";

export function initialsFromName(name: string | undefined): string {
  const clean = (name ?? "").trim();
  if (!clean) return "?";
  const parts = clean.split(/\s+/).filter(Boolean);
  const letters = (parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "");
  return letters.toUpperCase() || "?";
}

export function colorForUser(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) hash = (hash * 31 + userId.charCodeAt(i)) | 0;
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue} 65% 45%)`;
}

export function dedupePresenceByUser(others: PresenceUser[]): PresenceUser[] {
  const seen = new Set<string>();
  const out: PresenceUser[] = [];
  for (const p of others) {
    if (seen.has(p.userId)) continue;
    seen.add(p.userId);
    out.push(p);
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/presenceAvatar.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Implement the component**

```tsx
// src/components/scripts/ScriptPresenceBanner.tsx
import type { PresenceUser } from "@/hooks/useRealtimePresence";
import { initialsFromName, colorForUser, dedupePresenceByUser } from "@/lib/presenceAvatar";

interface Props {
  others: PresenceUser[];
}

/** Shows real-person avatars for everyone else currently in this script. */
export default function ScriptPresenceBanner({ others }: Props) {
  const people = dedupePresenceByUser(others);
  if (people.length === 0) return null;

  return (
    <div className="flex items-center gap-2">
      <span
        className="text-[10px] uppercase tracking-wider"
        style={{ color: "hsl(var(--bone) / 0.55)" }}
      >
        Editing now
      </span>
      <div className="flex items-center -space-x-2">
        {people.slice(0, 6).map((p) => (
          <div key={p.userId} className="relative group">
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold text-white ring-2"
              style={{ background: colorForUser(p.userId), boxShadow: "0 0 0 2px hsl(var(--ink))" }}
            >
              {initialsFromName(p.name)}
            </div>
            <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 px-2.5 py-1.5 text-[10px] font-medium bg-black/90 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 shadow-lg">
              {p.name?.trim() || "Someone"}
            </div>
          </div>
        ))}
        {people.length > 6 && (
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white/80"
            style={{ background: "hsl(var(--graphite))", boxShadow: "0 0 0 2px hsl(var(--ink))" }}
          >
            +{people.length - 6}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Verify compile + full test suite**

Run: `npx tsc --noEmit` (expect exit 0) and `npx vitest run src/lib/presenceAvatar.test.ts` (expect PASS).

- [ ] **Step 7: Commit**

```bash
git add src/components/scripts/ScriptPresenceBanner.tsx src/lib/presenceAvatar.ts src/lib/presenceAvatar.test.ts
git commit -m "feat(scripts): ScriptPresenceBanner real-person avatars + helpers"
```

---

## Task 3: Wire presence into Scripts.tsx

**Files:**
- Modify: `src/pages/Scripts.tsx`
  - imports
  - add `myDisplayName` state + fetch effect
  - call `useRealtimePresence` for the open script
  - mount `<ScriptPresenceBanner>` at the top of the `view === "view-script"` block (~line 3010)

**Interfaces:**
- Consumes: `useRealtimePresence`, `ScriptPresenceBanner`, existing `user` (from `useAuth`, line 414) and `supabase`.

- [ ] **Step 1: Add imports**

Near the other imports in `src/pages/Scripts.tsx`:

```ts
import { useRealtimePresence } from "@/hooks/useRealtimePresence";
import ScriptPresenceBanner from "@/components/scripts/ScriptPresenceBanner";
```

- [ ] **Step 2: Add `myDisplayName` state + fetch**

Near the other `useState` declarations (e.g. after `revisionRef`/other refs), add:

```ts
  const [myDisplayName, setMyDisplayName] = useState<string>("");
```

Add an effect (near other effects) to load it once per user:

```ts
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    supabase.from("profiles").select("display_name").eq("user_id", user.id).maybeSingle()
      .then(({ data }) => { if (!cancelled) setMyDisplayName(data?.display_name?.trim() || ""); });
    return () => { cancelled = true; };
  }, [user?.id]);
```

- [ ] **Step 3: Join the presence room for the open script**

Add (near other hooks, after `myDisplayName`):

```ts
  const { others: scriptPresence } = useRealtimePresence({
    roomId: viewingScriptId ? `script:${viewingScriptId}` : "",
    userId: user?.id || "",
    currentView: "script",
    displayName: myDisplayName,
  });
```

(The hook no-ops when `roomId` or `userId` is empty — i.e. when no script is open.)

- [ ] **Step 4: Mount the banner in the editor header**

Find the open-script view opener (~line 3009-3010):

```tsx
        {view === "view-script" && (
          <div className="space-y-4 animate-fade-in">
```

Immediately after that opening `<div ...>`, insert:

```tsx
            {scriptPresence.length > 0 && (
              <div className="flex justify-end">
                <ScriptPresenceBanner others={scriptPresence} />
              </div>
            )}
```

- [ ] **Step 5: Verify compile + tests**

Run: `npx tsc --noEmit` (exit 0) and `npx vitest run` (all pass except the pre-existing `scriptBlocks.reorder.test.ts` "No test suite found").

- [ ] **Step 6: Commit**

```bash
git add src/pages/Scripts.tsx
git commit -m "feat(scripts): show real-person presence banner in the open script"
```

---

## Task 4: Manual verification

- [ ] **Step 1:** `npx tsc --noEmit && npx vitest run` — tsc exit 0; tests pass (minus the pre-existing reorder file).
- [ ] **Step 2:** Two-browser test: open the SAME script as two different logged-in users (or two tabs). Each should see the other's avatar with correct initials + name tooltip; closing one tab removes its avatar within a few seconds; opening a different script shows no stale avatars. Self is not shown.

## Self-Review Notes

- Spec Layer 3a (presence banner, real people) → Tasks 1-3.
- Avatars dedupe by `userId` (one per person across tabs), color is stable per person (`colorForUser`), initials from display name.
- Out of scope: live block/caption sync (Phase 3), remote cursors.
- Branding: all colors via tokens or computed `hsl()`; no palette hex.
