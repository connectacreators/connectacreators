# Agency Dashboard Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 950-line tool-launcher `Dashboard.tsx` with an agency-first surface (greeting · client roster · 6 AI prompt cards) and add a contextual "Recent chats" panel to the sidebar on `/ai`. Pure white sticker cards with ink stroke + ink offset shadow.

**Architecture:** Three sequential PRs. PR 1 builds the leaf components + hook + context in isolation (no Dashboard.tsx changes — the new pieces are unwired). PR 2 rewrites Dashboard.tsx using the PR 1 pieces + adds `RobbyInsightRow` for client-scoped view. PR 3 modifies `DashboardSidebar.tsx` to conditionally render `RecentChatsPanel` on `/ai`. Each PR ships independently.

**Tech Stack:** React + Vite + TypeScript + Tailwind 3 + shadcn/ui + Supabase + lucide-react icons. No new test framework — verify via `npm run build` (typecheck) + visual check on `localhost:8081`. Pre-existing `useAssistantMode()` hook is extended (not replaced) to also read `?client=` from `/dashboard` URL.

**Spec:** `docs/superpowers/specs/2026-05-15-agency-dashboard-redesign-design.md`

---

## File Structure

| File | PR | Role |
|---|---|---|
| [`src/hooks/useAssistantMode.ts`](src/hooks/useAssistantMode.ts) | PR 1 | **Modify.** Add fallback: when path is `/dashboard`, read `?client=` query param to derive client mode. |
| [`src/hooks/useDashboardPendingItems.ts`](src/hooks/useDashboardPendingItems.ts) | PR 1 | **New.** Reads `video_edits` + `leads` per client; returns `Record<clientId, PendingItem[]>`. |
| [`src/components/dashboard/ClientCard.tsx`](src/components/dashboard/ClientCard.tsx) | PR 1 | **New.** Medium-density client roster card. Pure presentational. |
| [`src/components/dashboard/PromptCard.tsx`](src/components/dashboard/PromptCard.tsx) | PR 1 | **New.** AI prompt sticker card. Pure presentational. |
| [`src/components/dashboard/ActiveClientBreadcrumb.tsx`](src/components/dashboard/ActiveClientBreadcrumb.tsx) | PR 1 | **New.** Top breadcrumb shown when scoped to a client. |
| [`src/components/dashboard/RobbyInsightRow.tsx`](src/components/dashboard/RobbyInsightRow.tsx) | PR 2 | **New.** AI-narrated insight row for client-scoped view. |
| [`src/components/dashboard/getRobbyInsights.ts`](src/components/dashboard/getRobbyInsights.ts) | PR 2 | **New.** Pure function turning pending items + recent data into `RobbyInsight[]` (Phase-1 deterministic). |
| [`src/components/dashboard/PROMPTS.ts`](src/components/dashboard/PROMPTS.ts) | PR 2 | **New.** Constant array of the 6 prompts (title, icon, description, prompt template). |
| [`src/pages/Dashboard.tsx`](src/pages/Dashboard.tsx) | PR 2 | **Full rewrite.** ~950 → ~250 lines. |
| [`src/components/dashboard/RecentChatsPanel.tsx`](src/components/dashboard/RecentChatsPanel.tsx) | PR 3 | **New.** Reads from `assistant_threads`; groups by Today / Yesterday / Last week. |
| [`src/components/DashboardSidebar.tsx`](src/components/DashboardSidebar.tsx) | PR 3 | **Modify.** Conditionally renders `RecentChatsPanel` when `pathname === '/ai'`. |

---

# PR 1 — Foundation: context, hook, and leaf components

Ships components in isolation (not yet wired into Dashboard). Safe to merge without changing user-visible behavior. The new pieces just sit there until PR 2 wires them.

## Task 1.1: Extend `useAssistantMode` to read `?client=` on `/dashboard`

**Files:**
- Modify: [`src/hooks/useAssistantMode.ts`](src/hooks/useAssistantMode.ts)

The existing hook derives `{ mode, clientId }` from the route path (`/clients/:clientId/*`). For the new dashboard we also want `?client={id}` on `/dashboard` to put the app in client mode.

- [ ] **Step 1: Read the current implementation**

```bash
cat src/hooks/useAssistantMode.ts
```

You should see a regex match against `/clients/([^/]+)`. We're adding a fallback search-params check.

- [ ] **Step 2: Modify `useAssistantMode` to also check query params**

Replace the file with:

```typescript
// src/hooks/useAssistantMode.ts
//
// Derives the assistant's current operational mode from the URL.
//   - `/clients/:clientId/*`            → client mode (path-derived)
//   - `/dashboard?client={clientId}`    → client mode (query-derived, agency dashboard scope)
//   - everything else                   → agency mode

import { useLocation } from "react-router-dom";

export type AssistantMode =
  | { mode: "agency"; clientId: null }
  | { mode: "client"; clientId: string };

const CLIENT_PATH = /^\/clients\/([^/]+)/;

function deriveMode(pathname: string, search: string): AssistantMode {
  // Path-derived (existing behavior)
  const m = pathname.match(CLIENT_PATH);
  if (m) return { mode: "client", clientId: m[1] };

  // Query-derived (NEW — dashboard scope)
  if (pathname === "/dashboard" || pathname === "/") {
    const params = new URLSearchParams(search);
    const clientId = params.get("client");
    if (clientId) return { mode: "client", clientId };
  }

  return { mode: "agency", clientId: null };
}

export function useAssistantMode(): AssistantMode {
  const { pathname, search } = useLocation();
  return deriveMode(pathname, search);
}

/**
 * Manual override variant — useful for SSR / testing where useLocation
 * isn't available.
 */
export function useAssistantModeFor(pathname: string, search = ""): AssistantMode {
  return deriveMode(pathname, search);
}

export function useCurrentPath(): string {
  return useLocation().pathname;
}
```

- [ ] **Step 3: Build to typecheck**

```bash
npm run build 2>&1 | tail -5
```
Expected: `✓ built in <N>s`. If errors, the existing consumers of `useAssistantModeFor` are calling with a different signature — extend it to take a `search` param with a default.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useAssistantMode.ts
git commit -m "feat(assistant): useAssistantMode reads ?client= from /dashboard URL"
```

---

## Task 1.2: `useDashboardPendingItems` hook

**Files:**
- Create: [`src/hooks/useDashboardPendingItems.ts`](src/hooks/useDashboardPendingItems.ts)

Queries Supabase for the items that drive client-card pills. Phase 1 runs three parallel queries client-side (one batched query per concern) — future optimization can collapse to a single RPC.

- [ ] **Step 1: Create the file with the full implementation**

```typescript
// src/hooks/useDashboardPendingItems.ts
//
// Resolves per-client "what needs attention" pills for the dashboard
// roster. A client appears in the roster ONLY when its pendingItems
// array is non-empty.
//
// Pending items derived from existing tables:
//   - "N to approve"   → video_edits.lifecycle_status = 'Needs Revisions'
//   - "N in editing"   → video_edits.lifecycle_status = 'In progress'
//   - "N scheduled"    → video_edits.lifecycle_status = 'Scheduled'
//   - "N new leads"    → leads.created_at > now() - 24h (per client)
//
// Single hook returns a map keyed by clientId. Re-fetches on `refresh()`.

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export type PendingItemVariant = "honey" | "aqua" | "ink";

export interface PendingItem {
  label: string;
  variant: PendingItemVariant;
}

export type PendingItemsByClient = Record<string, PendingItem[]>;

interface UseDashboardPendingItemsResult {
  data: PendingItemsByClient;
  loading: boolean;
  error: Error | null;
  refresh: () => void;
}

/**
 * Fetches pending items for the given list of clientIds. Returns a
 * record keyed by clientId. Clients with empty arrays should be
 * filtered out by the caller (so they don't appear in the roster).
 */
export function useDashboardPendingItems(
  clientIds: string[],
): UseDashboardPendingItemsResult {
  const [data, setData] = useState<PendingItemsByClient>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (clientIds.length === 0) {
      setData({});
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    Promise.all([
      // video_edits grouped by client + lifecycle_status
      supabase
        .from("video_edits")
        .select("client_id, lifecycle_status")
        .in("client_id", clientIds)
        .in("lifecycle_status", ["Needs Revisions", "In progress", "Scheduled"]),
      // recent leads per client
      supabase
        .from("leads")
        .select("client_id")
        .in("client_id", clientIds)
        .gte("created_at", yesterday),
    ])
      .then(([editsRes, leadsRes]) => {
        if (cancelled) return;
        if (editsRes.error) throw editsRes.error;
        if (leadsRes.error) throw leadsRes.error;

        // Count buckets per client
        const buckets: Record<string, { approve: number; editing: number; scheduled: number; leads: number }> = {};
        for (const id of clientIds) {
          buckets[id] = { approve: 0, editing: 0, scheduled: 0, leads: 0 };
        }
        for (const row of editsRes.data ?? []) {
          const b = buckets[row.client_id];
          if (!b) continue;
          if (row.lifecycle_status === "Needs Revisions") b.approve += 1;
          else if (row.lifecycle_status === "In progress") b.editing += 1;
          else if (row.lifecycle_status === "Scheduled") b.scheduled += 1;
        }
        for (const row of leadsRes.data ?? []) {
          const b = buckets[row.client_id];
          if (b) b.leads += 1;
        }

        // Build PendingItem[] per client
        const out: PendingItemsByClient = {};
        for (const id of clientIds) {
          const b = buckets[id];
          const items: PendingItem[] = [];
          if (b.approve > 0) items.push({ label: `${b.approve} to approve`, variant: "honey" });
          if (b.leads > 0)   items.push({ label: `${b.leads} new lead${b.leads === 1 ? "" : "s"}`, variant: "aqua" });
          if (b.editing > 0) items.push({ label: `${b.editing} in editing`, variant: "ink" });
          if (b.scheduled > 0) items.push({ label: `${b.scheduled} scheduled`, variant: "ink" });
          out[id] = items;
        }
        setData(out);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err : new Error(String(err)));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [clientIds.join(","), tick]);

  return { data, loading, error, refresh };
}
```

- [ ] **Step 2: Build to typecheck**

```bash
npm run build 2>&1 | tail -5
```
Expected: clean build. If TS complains about a column name (e.g. `lifecycle_status` not on `video_edits`), check `src/integrations/supabase/types.ts` for the actual column name and adjust the query.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useDashboardPendingItems.ts
git commit -m "feat(dashboard): useDashboardPendingItems hook resolves client-card pills"
```

---

## Task 1.3: `ClientCard` component

**Files:**
- Create: [`src/components/dashboard/ClientCard.tsx`](src/components/dashboard/ClientCard.tsx)

Medium-density sticker card. Pure presentational — receives all data via props.

- [ ] **Step 1: Create the file**

```tsx
// src/components/dashboard/ClientCard.tsx
//
// Medium-density client roster card. Pure presentational.
// Renders only when pendingItems.length > 0 (filter at the parent).

import type { PendingItem } from "@/hooks/useDashboardPendingItems";

interface ClientCardProps {
  clientId: string;
  name: string;
  avatarColor?: string;
  pendingItems: PendingItem[];
  onClick: (clientId: string) => void;
}

function monogramOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "·";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

const PILL_STYLES: Record<PendingItem["variant"], React.CSSProperties> = {
  honey: { background: "rgba(224,165,96,0.18)", color: "#6B4D26", border: "1px solid rgba(224,165,96,0.50)" },
  aqua:  { background: "rgba(143,208,213,0.18)", color: "#2E5E61", border: "1px solid rgba(143,208,213,0.50)" },
  ink:   { background: "rgba(20,20,20,0.06)",    color: "rgba(20,20,20,0.65)", border: "1px solid rgba(20,20,20,0.18)" },
};

export function ClientCard({ clientId, name, avatarColor = "#8FD0D5", pendingItems, onClick }: ClientCardProps) {
  return (
    <button
      type="button"
      onClick={() => onClick(clientId)}
      className="text-left transition-transform duration-150 hover:-translate-x-px hover:-translate-y-px"
      style={{
        background: "#ffffff",
        border: "1px solid #141414",
        boxShadow: "2px 2px 0 #141414",
        borderRadius: 12,
        padding: "12px 14px",
        width: "100%",
        cursor: "pointer",
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.boxShadow = "3px 3px 0 #141414"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.boxShadow = "2px 2px 0 #141414"; }}
    >
      <div className="flex items-center gap-2.5 mb-2">
        <div
          className="flex items-center justify-center font-semibold"
          style={{
            width: 32, height: 32, borderRadius: "50%",
            background: avatarColor, color: "#141414",
            fontSize: 12, flexShrink: 0,
          }}
        >
          {monogramOf(name)}
        </div>
        <span
          className="font-serif"
          style={{ fontSize: 14, fontWeight: 500, color: "#141414", letterSpacing: "-0.005em" }}
        >
          {name}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {pendingItems.map((item, i) => (
          <span
            key={i}
            style={{
              ...PILL_STYLES[item.variant],
              fontSize: 10,
              padding: "2px 8px",
              borderRadius: 999,
              fontWeight: 500,
              fontFamily: "Figtree, sans-serif",
            }}
          >
            {item.label}
          </span>
        ))}
      </div>
    </button>
  );
}
```

- [ ] **Step 2: Build**

```bash
npm run build 2>&1 | tail -5
```
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/ClientCard.tsx
git commit -m "feat(dashboard): ClientCard component — medium-density sticker card"
```

---

## Task 1.4: `PromptCard` component

**Files:**
- Create: [`src/components/dashboard/PromptCard.tsx`](src/components/dashboard/PromptCard.tsx)

Sticker card for the 6 AI prompts. Slightly heavier visual treatment (3px offset shadow vs ClientCard's 2px).

- [ ] **Step 1: Create the file**

```tsx
// src/components/dashboard/PromptCard.tsx
//
// AI prompt sticker card for the dashboard. Pure presentational.
// Lucide icons are placeholders — swap for hand-drawn doodle SVGs later.

import type { LucideIcon } from "lucide-react";

interface PromptCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
  onClick: () => void;
}

export function PromptCard({ icon: Icon, title, description, onClick }: PromptCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left transition-transform duration-150 hover:-translate-x-px hover:-translate-y-px"
      style={{
        background: "#ffffff",
        border: "1px solid #141414",
        boxShadow: "3px 3px 0 #141414",
        borderRadius: 12,
        padding: 14,
        width: "100%",
        cursor: "pointer",
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.boxShadow = "4px 4px 0 #141414"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.boxShadow = "3px 3px 0 #141414"; }}
    >
      <div style={{ height: 28, marginBottom: 8, display: "flex", alignItems: "center" }}>
        <Icon size={22} strokeWidth={1.5} color="#141414" />
      </div>
      <div
        className="font-serif"
        style={{ fontSize: 15, fontWeight: 500, color: "#141414", letterSpacing: "-0.005em", marginBottom: 3 }}
      >
        {title}
      </div>
      <div
        style={{
          fontSize: 11,
          color: "rgba(20,20,20,0.55)",
          lineHeight: 1.4,
          fontFamily: "Figtree, sans-serif",
        }}
      >
        {description}
      </div>
    </button>
  );
}
```

- [ ] **Step 2: Build + commit**

```bash
npm run build 2>&1 | tail -5
git add src/components/dashboard/PromptCard.tsx
git commit -m "feat(dashboard): PromptCard component — AI prompt sticker card"
```

---

## Task 1.5: `ActiveClientBreadcrumb` component

**Files:**
- Create: [`src/components/dashboard/ActiveClientBreadcrumb.tsx`](src/components/dashboard/ActiveClientBreadcrumb.tsx)

Top breadcrumb shown on `/dashboard?client={id}`. "Agency / [● Dr Calvin ×]".

- [ ] **Step 1: Create the file**

```tsx
// src/components/dashboard/ActiveClientBreadcrumb.tsx
//
// Top breadcrumb shown when the dashboard is scoped to a specific client.
// Clicking the × or the "Agency" link removes the ?client= query param.

import { Link, useNavigate } from "react-router-dom";
import { X } from "lucide-react";

interface ActiveClientBreadcrumbProps {
  clientName: string;
  avatarColor?: string;
}

function monogramOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "·";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function ActiveClientBreadcrumb({ clientName, avatarColor = "#8FD0D5" }: ActiveClientBreadcrumbProps) {
  const navigate = useNavigate();
  const unscope = () => navigate("/dashboard");

  return (
    <div className="flex items-center gap-2 mb-3" style={{ fontSize: 11, color: "rgba(20,20,20,0.55)" }}>
      <Link to="/dashboard" style={{ color: "rgba(20,20,20,0.55)" }} className="hover:underline">
        Agency
      </Link>
      <span>/</span>
      <button
        type="button"
        onClick={unscope}
        className="inline-flex items-center gap-1.5"
        style={{
          background: "#ffffff",
          border: "1px solid #141414",
          boxShadow: "1px 1px 0 #141414",
          padding: "3px 10px",
          borderRadius: 999,
          fontSize: 11,
          color: "#141414",
          cursor: "pointer",
        }}
        title="Back to agency view"
      >
        <span
          className="flex items-center justify-center"
          style={{
            width: 16, height: 16, borderRadius: "50%",
            background: avatarColor, color: "#141414",
            fontSize: 8, fontWeight: 600,
          }}
        >
          {monogramOf(clientName)}
        </span>
        <span>{clientName}</span>
        <X size={11} style={{ color: "rgba(20,20,20,0.45)" }} />
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Build + commit**

```bash
npm run build 2>&1 | tail -5
git add src/components/dashboard/ActiveClientBreadcrumb.tsx
git commit -m "feat(dashboard): ActiveClientBreadcrumb component"
```

---

## Task 1.6: PR 1 final verification + push

- [ ] **Step 1: Sanity-check that nothing is wired in yet**

```bash
grep -rn "ClientCard\|PromptCard\|ActiveClientBreadcrumb\|useDashboardPendingItems" src/pages/Dashboard.tsx
```
Expected: zero hits. PR 1 ships components in isolation. Dashboard.tsx is unchanged.

- [ ] **Step 2: Full build**

```bash
npm run build 2>&1 | tail -10
```
Expected: clean build.

- [ ] **Step 3: Push and merge PR 1**

```bash
git log --oneline -8
git push origin HEAD:main
```

GitHub Actions deploys automatically. Users see no change. PR 2 can begin now.

---

# PR 2 — Dashboard.tsx full rewrite (uses PR 1 components)

User-visible change: `/dashboard` looks completely new. The old folder-launcher is gone. Client-scoped view replaces it when `?client=` is set.

## Task 2.1: Define the 6 prompts as a constant

**Files:**
- Create: [`src/components/dashboard/PROMPTS.ts`](src/components/dashboard/PROMPTS.ts)

- [ ] **Step 1: Create the file**

```typescript
// src/components/dashboard/PROMPTS.ts
//
// The 6 AI quick prompt cards on the dashboard. Each card opens the
// AI drawer (CompanionDrawer) pre-loaded with `prompt` and the current
// active client context.

import {
  Anchor,
  FileText,
  Flame,
  CalendarDays,
  Clapperboard,
  BarChart3,
  type LucideIcon,
} from "lucide-react";

export interface DashboardPrompt {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  /** Template — `{client}` is substituted at click time. */
  prompt: string;
}

export const DASHBOARD_PROMPTS: DashboardPrompt[] = [
  {
    id: "hooks",
    title: "Generate hooks",
    description: "3–5 viral hooks for the active client, tuned to their voice + niche",
    icon: Anchor,
    prompt: "Give me 5 hook ideas for {client} about a topic of your choice. Match their tone and use proven outlier formulas.",
  },
  {
    id: "script-from-notes",
    title: "Script from notes",
    description: "Drop talking points; get a polished reel script with hook, body, CTA",
    icon: FileText,
    prompt: "Turn the notes I paste next into a 45-second reel script for {client}. Hook, body, CTA structure.",
  },
  {
    id: "viral-angles",
    title: "Find viral angles",
    description: "Scan today's Viral Today for the client's niche; pull 3 angles worth remixing",
    icon: Flame,
    prompt: "Pull 3 trending angles from Viral Today that fit {client}'s niche. Tell me what's working and why.",
  },
  {
    id: "plan-week",
    title: "Plan the week",
    description: "Lay out next 7 days of posts across clients — mix formats, batch shoot days",
    icon: CalendarDays,
    prompt: "Plan the next 7 days of content across all clients. Group shoot days, mix formats, flag gaps.",
  },
  {
    id: "edit-feedback",
    title: "Edit feedback",
    description: "Critique a draft edit as a sales coach — pacing, hook strength, CTA punch",
    icon: Clapperboard,
    prompt: "Critique an edit for {client}. Pacing, hook strength, CTA — call out what to fix before posting.",
  },
  {
    id: "audit-performance",
    title: "Audit performance",
    description: "What's working? What to double-down on? Cuts through 30 days of data",
    icon: BarChart3,
    prompt: "Audit the last 30 days of {client}'s posts. What's working, what's not, what to double-down on.",
  },
];

/**
 * Substitute `{client}` in the prompt template. When no client is
 * scoped, use "across all clients" as a sensible fallback.
 */
export function renderPrompt(prompt: string, clientName: string | null): string {
  return prompt.replace(/\{client\}/g, clientName ?? "across all clients");
}
```

- [ ] **Step 2: Build + commit**

```bash
npm run build 2>&1 | tail -5
git add src/components/dashboard/PROMPTS.ts
git commit -m "feat(dashboard): define the 6 AI quick prompts"
```

---

## Task 2.2: `RobbyInsightRow` component

**Files:**
- Create: [`src/components/dashboard/RobbyInsightRow.tsx`](src/components/dashboard/RobbyInsightRow.tsx)

Sticker row for the client-scoped Robby's-read view. Click → opens AI drawer with prompt + client context.

- [ ] **Step 1: Create the file**

```tsx
// src/components/dashboard/RobbyInsightRow.tsx
//
// AI-narrated insight row on the client-scoped dashboard view.
// Renders a small ink icon in an Aqua-tinted circle + plain-English
// insight text + an action link. Click → handed off to the AI drawer.

import type { LucideIcon } from "lucide-react";

interface RobbyInsightRowProps {
  icon: LucideIcon;
  text: React.ReactNode;
  actionLabel: string;
  onClick: () => void;
}

export function RobbyInsightRow({ icon: Icon, text, actionLabel, onClick }: RobbyInsightRowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left transition-transform duration-150 hover:-translate-x-px hover:-translate-y-px"
      style={{
        background: "#ffffff",
        border: "1px solid #141414",
        boxShadow: "2px 2px 0 #141414",
        borderRadius: 10,
        padding: "11px 12px",
        marginBottom: 7,
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        cursor: "pointer",
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.boxShadow = "3px 3px 0 #141414"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.boxShadow = "2px 2px 0 #141414"; }}
    >
      <div
        className="flex items-center justify-center flex-shrink-0"
        style={{
          width: 22, height: 22, borderRadius: "50%",
          background: "rgba(143,208,213,0.20)",
          border: "1px solid #141414",
        }}
      >
        <Icon size={12} strokeWidth={1.5} color="#141414" />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12, color: "#141414", lineHeight: 1.45 }}>{text}</div>
        <div style={{ fontSize: 10, color: "#2E5E61", marginTop: 3, fontWeight: 500 }}>
          {actionLabel}
        </div>
      </div>
    </button>
  );
}
```

- [ ] **Step 2: Build + commit**

```bash
npm run build 2>&1 | tail -5
git add src/components/dashboard/RobbyInsightRow.tsx
git commit -m "feat(dashboard): RobbyInsightRow component"
```

---

## Task 2.3: `getRobbyInsights` — Phase 1 deterministic builder

**Files:**
- Create: [`src/components/dashboard/getRobbyInsights.ts`](src/components/dashboard/getRobbyInsights.ts)

Turns the client's pending items into 1-3 Robby insight rows. AI-generated narration is a later enhancement; Phase 1 uses templated strings keyed off existing data.

- [ ] **Step 1: Create the file**

```typescript
// src/components/dashboard/getRobbyInsights.ts
//
// Phase-1 deterministic Robby insights. Given a client's pending items,
// returns 0-3 RobbyInsight rows ready to render. Each row, when clicked,
// hands a prompt off to the AI drawer.

import { AlertCircle, Flame, BarChart3, type LucideIcon } from "lucide-react";
import type { PendingItem } from "@/hooks/useDashboardPendingItems";
import { DASHBOARD_PROMPTS } from "./PROMPTS";

export interface RobbyInsight {
  id: string;
  icon: LucideIcon;
  text: React.ReactNode;
  actionLabel: string;
  /** Resolved prompt to send to the AI drawer (already includes client name). */
  prompt: string;
}

export function getRobbyInsights(clientName: string, pendingItems: PendingItem[]): RobbyInsight[] {
  const insights: RobbyInsight[] = [];

  // 1. "Approve before posting" insight
  const approveItem = pendingItems.find((p) => /to approve/i.test(p.label));
  if (approveItem) {
    insights.push({
      id: "approve",
      icon: AlertCircle,
      text: (
        <>
          {approveItem.label.split(" ")[0]} item{Number(approveItem.label.split(" ")[0]) === 1 ? "" : "s"} for{" "}
          <strong>{clientName}</strong> need your approval before going live. Worth a 30-second review.
        </>
      ),
      actionLabel: "Open in editor →",
      prompt: `Show me what's pending approval for ${clientName} and summarize each item in one line.`,
    });
  }

  // 2. "Viral angles" insight — always shown as Robby's suggestion
  insights.push({
    id: "viral-angles",
    icon: Flame,
    text: (
      <>
        Trending angles match <strong>{clientName}</strong>'s niche right now. I can pull the top 3 and draft hooks.
      </>
    ),
    actionLabel: "See the hooks →",
    prompt: DASHBOARD_PROMPTS.find((p) => p.id === "viral-angles")!.prompt.replace("{client}", clientName),
  });

  // 3. "Performance audit" insight
  insights.push({
    id: "perf-audit",
    icon: BarChart3,
    text: (
      <>
        I can audit <strong>{clientName}</strong>'s last 30 days and call out what's working before it cools off.
      </>
    ),
    actionLabel: "Run the audit →",
    prompt: DASHBOARD_PROMPTS.find((p) => p.id === "audit-performance")!.prompt.replace("{client}", clientName),
  });

  return insights;
}
```

- [ ] **Step 2: Build + commit**

```bash
npm run build 2>&1 | tail -5
git add src/components/dashboard/getRobbyInsights.ts
git commit -m "feat(dashboard): getRobbyInsights Phase-1 deterministic builder"
```

---

## Task 2.4: Rewrite `Dashboard.tsx`

**Files:**
- Modify: [`src/pages/Dashboard.tsx`](src/pages/Dashboard.tsx) — full rewrite

This is the big one. Replace the 950-line tool-launcher with the agency dashboard.

- [ ] **Step 1: Before rewriting, capture the existing exports/imports we need to preserve**

```bash
grep "^export\b" src/pages/Dashboard.tsx
```
Expected: `export default function Dashboard()`. That's the only export. Good — safe to rewrite.

- [ ] **Step 2: Replace the entire file contents with the new implementation**

```tsx
// src/pages/Dashboard.tsx
//
// Agency dashboard — replaces the old tool-launcher (3 folder cards).
// Two views:
//   1) Agency view (default)            — greeting + client roster + 6 AI prompt cards
//   2) Client-scoped view (?client=X)   — breadcrumb + "Robby's read" insight rows
//
// Spec: docs/superpowers/specs/2026-05-15-agency-dashboard-redesign-design.md

import { useMemo, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useCompanion } from "@/contexts/CompanionContext";
import ScriptsLogin from "@/components/ScriptsLogin";
import { Loader2 } from "lucide-react";

import { useDashboardPendingItems } from "@/hooks/useDashboardPendingItems";
import { ClientCard } from "@/components/dashboard/ClientCard";
import { PromptCard } from "@/components/dashboard/PromptCard";
import { ActiveClientBreadcrumb } from "@/components/dashboard/ActiveClientBreadcrumb";
import { RobbyInsightRow } from "@/components/dashboard/RobbyInsightRow";
import { DASHBOARD_PROMPTS, renderPrompt } from "@/components/dashboard/PROMPTS";
import { getRobbyInsights } from "@/components/dashboard/getRobbyInsights";

interface Client {
  id: string;
  name: string;
  avatar_color?: string | null;
}

export default function Dashboard() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { setIsOpen: setDrawerOpen } = useCompanion();

  const activeClientId = searchParams.get("client");

  // Load clients (admin view: all clients owned by the user)
  const [clients, setClients] = useState<Client[]>([]);
  const [clientsLoading, setClientsLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setClientsLoading(true);
    supabase
      .from("clients")
      .select("id, name, avatar_color")
      .eq("owner_id", user.id)
      .order("name")
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error("[Dashboard] failed to load clients:", error);
          setClients([]);
        } else {
          setClients((data ?? []) as Client[]);
        }
        setClientsLoading(false);
      });
    return () => { cancelled = true; };
  }, [user]);

  const clientIds = useMemo(() => clients.map((c) => c.id), [clients]);
  const { data: pendingByClient, loading: pendingLoading } = useDashboardPendingItems(clientIds);

  // Filter to ONLY clients with pending work for the roster
  const rosterClients = useMemo(
    () => clients.filter((c) => (pendingByClient[c.id]?.length ?? 0) > 0),
    [clients, pendingByClient],
  );

  // Active client (when scoped)
  const activeClient = useMemo(
    () => clients.find((c) => c.id === activeClientId) ?? null,
    [clients, activeClientId],
  );
  const activeClientName = activeClient?.name ?? null;

  // ── Handlers ───────────────────────────────────────────────────
  const onClientClick = (clientId: string) => {
    navigate(`/dashboard?client=${clientId}`);
  };

  const onPromptClick = (promptId: string) => {
    const def = DASHBOARD_PROMPTS.find((p) => p.id === promptId);
    if (!def) return;
    const rendered = renderPrompt(def.prompt, activeClientName);
    // Stash the prompt for the drawer to pick up
    (window as any).__companionPendingPrompt = rendered;
    setDrawerOpen(true);
  };

  const onInsightClick = (insightPrompt: string) => {
    (window as any).__companionPendingPrompt = insightPrompt;
    setDrawerOpen(true);
  };

  // ── Render ─────────────────────────────────────────────────────
  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: "rgba(20,20,20,0.40)" }} />
      </div>
    );
  }
  if (!user) return <ScriptsLogin />;

  const firstName = (user.user_metadata?.first_name as string | undefined) ?? user.email?.split("@")[0] ?? "there";
  const pendingCount = rosterClients.length;

  return (
    <div className="min-h-screen" style={{ background: "#EAE6DC", padding: "22px 28px" }}>

      {/* Agency view */}
      {!activeClient && (
        <>
          <h1
            className="font-serif"
            style={{ fontSize: 26, fontWeight: 500, color: "#141414", letterSpacing: "-0.01em", marginBottom: 4 }}
          >
            Hi {firstName}.
          </h1>
          <p style={{ fontSize: 12, color: "rgba(20,20,20,0.55)", marginBottom: 22 }}>
            {clientsLoading || pendingLoading
              ? "Loading…"
              : pendingCount === 0
                ? clients.length === 0
                  ? "Add your first client to get started."
                  : `All caught up across your ${clients.length} client${clients.length === 1 ? "" : "s"}.`
                : `${pendingCount} client${pendingCount === 1 ? "" : "s"} need${pendingCount === 1 ? "s" : ""} you today.`}
          </p>

          {/* Roster — only clients with pending items */}
          {rosterClients.length > 0 && (
            <section style={{ marginBottom: 28 }}>
              <div
                style={{
                  fontSize: 9.5,
                  letterSpacing: "0.20em",
                  textTransform: "uppercase",
                  color: "rgba(20,20,20,0.45)",
                  marginBottom: 10,
                  fontFamily: "Figtree, sans-serif",
                  fontWeight: 600,
                }}
              >
                Clients
              </div>
              <div className="grid grid-cols-3 gap-3">
                {rosterClients.map((c) => (
                  <ClientCard
                    key={c.id}
                    clientId={c.id}
                    name={c.name}
                    avatarColor={c.avatar_color ?? undefined}
                    pendingItems={pendingByClient[c.id] ?? []}
                    onClick={onClientClick}
                  />
                ))}
              </div>
            </section>
          )}

          {/* First-time empty state — no clients at all */}
          {!clientsLoading && clients.length === 0 && (
            <section style={{ marginBottom: 28 }}>
              <button
                type="button"
                onClick={() => navigate("/onboarding")}
                style={{
                  background: "#ffffff",
                  border: "1px dashed rgba(20,20,20,0.30)",
                  borderRadius: 12,
                  padding: 24,
                  width: "100%",
                  fontFamily: "Georgia, serif",
                  fontSize: 14,
                  color: "rgba(20,20,20,0.55)",
                  cursor: "pointer",
                }}
              >
                + Add your first client
              </button>
            </section>
          )}

          {/* 6 AI prompts — always render */}
          <section>
            <div
              style={{
                fontSize: 9.5,
                letterSpacing: "0.20em",
                textTransform: "uppercase",
                color: "rgba(20,20,20,0.45)",
                marginBottom: 10,
                fontFamily: "Figtree, sans-serif",
                fontWeight: 600,
              }}
            >
              Start with Robby
            </div>
            <div className="grid grid-cols-3 gap-3.5">
              {DASHBOARD_PROMPTS.map((p) => (
                <PromptCard
                  key={p.id}
                  icon={p.icon}
                  title={p.title}
                  description={p.description}
                  onClick={() => onPromptClick(p.id)}
                />
              ))}
            </div>
          </section>
        </>
      )}

      {/* Client-scoped view — Robby's read */}
      {activeClient && (
        <>
          <ActiveClientBreadcrumb
            clientName={activeClient.name}
            avatarColor={activeClient.avatar_color ?? undefined}
          />
          <h1
            className="font-serif"
            style={{ fontSize: 26, fontWeight: 500, color: "#141414", letterSpacing: "-0.01em", marginBottom: 14 }}
          >
            Robby's read on {activeClient.name}
          </h1>
          {getRobbyInsights(activeClient.name, pendingByClient[activeClient.id] ?? []).map((ins) => (
            <RobbyInsightRow
              key={ins.id}
              icon={ins.icon}
              text={ins.text}
              actionLabel={ins.actionLabel}
              onClick={() => onInsightClick(ins.prompt)}
            />
          ))}
        </>
      )}

    </div>
  );
}
```

- [ ] **Step 3: Build to typecheck**

```bash
npm run build 2>&1 | tail -10
```
Expected: clean. If errors:
- `clients.owner_id` doesn't exist → check actual column name in `supabase/types.ts`, adjust the query.
- `useAuth` doesn't expose `user_metadata` typed → cast as in the existing Dashboard.tsx pattern.

- [ ] **Step 4: Visual smoke test**

```bash
npm run dev 2>&1 &
DEV_PID=$!
sleep 5
curl -s http://localhost:8081/dashboard -o /dev/null -w "%{http_code}\n"
kill $DEV_PID 2>/dev/null
```
Expected: `200`. Then manually open `http://localhost:8081/dashboard` and verify:
- Greeting renders with your first name
- Roster shows only clients with pending pills
- 6 prompt cards render with lucide line icons + EB Garamond titles
- Clicking a client card → URL gets `?client={id}` and view switches to Robby's read
- Clicking the × on the breadcrumb → returns to agency view
- Clicking a prompt card → opens the AI drawer (assuming `CompanionContext` is wired in the app shell; the `__companionPendingPrompt` window var is a temporary handoff — see Task 2.5 for the proper wire-up if needed)

- [ ] **Step 5: Commit**

```bash
git add src/pages/Dashboard.tsx
git commit -m "feat(dashboard): full rewrite — agency view + client-scoped view

Replaces the 950-line tool-launcher with the spec'd agency dashboard:
- Greeting + client roster (only clients with pending pills)
- 6 AI quick prompt cards
- Client-scoped view: breadcrumb + Robby's read insight rows
- First-time empty state: + Add your first client

Wired with useDashboardPendingItems hook + DASHBOARD_PROMPTS constant
+ getRobbyInsights deterministic builder. AI drawer handoff uses
window.__companionPendingPrompt + setDrawerOpen.

Spec: docs/superpowers/specs/2026-05-15-agency-dashboard-redesign-design.md"
```

---

## Task 2.5: Wire `CompanionDrawer` to read `__companionPendingPrompt`

**Files:**
- Modify: [`src/components/CompanionDrawer.tsx`](src/components/CompanionDrawer.tsx)

The dashboard hands off prompts via `window.__companionPendingPrompt`. The drawer needs to read that on open and pre-fill its input.

- [ ] **Step 1: Find the input state in CompanionDrawer**

```bash
grep -n "const \[input, setInput\]\|setInput" src/components/CompanionDrawer.tsx | head -3
```
Expected: a line like `const [input, setInput] = useState("");`. Note the line number.

- [ ] **Step 2: Add a useEffect that reads the window var on mount**

Right after the existing `useState` declarations in `CompanionDrawer`, add:

```tsx
// Read pending prompt handed off by Dashboard / RobbyInsightRow.
// One-shot: consume and clear.
useEffect(() => {
  const pending = (window as any).__companionPendingPrompt as string | undefined;
  if (pending && typeof pending === "string") {
    setInput(pending);
    (window as any).__companionPendingPrompt = undefined;
  }
}, []);
```

- [ ] **Step 3: Build + commit**

```bash
npm run build 2>&1 | tail -5
git add src/components/CompanionDrawer.tsx
git commit -m "feat(companion): drawer reads __companionPendingPrompt handoff on open"
```

---

## Task 2.6: PR 2 verification + push

- [ ] **Step 1: Manual end-to-end test**

```bash
npm run dev &
sleep 5
```
Open `http://localhost:8081/dashboard` and verify the full flow:
1. Land → agency view
2. See client cards (only those with pending work) + 6 prompts
3. Click a client → switches to Robby's read view + URL has `?client=`
4. Click an insight row → AI drawer opens with the prompt pre-filled in the input box
5. Click the × in breadcrumb → back to agency view
6. Click a prompt card from agency view → drawer opens, prompt pre-filled with "across all clients" in place of `{client}`

If any of those don't work, debug before pushing.

- [ ] **Step 2: Push**

```bash
kill %1 2>/dev/null
git push origin HEAD:main
```

GitHub Actions deploys. PR 3 can begin.

---

# PR 3 — Hybrid sidebar with chats panel on `/ai`

User-visible change: on `/ai` only, a "Recent chats" section slides into the lower half of the sidebar with a "+ New chat" button. Nothing changes on other routes.

## Task 3.1: `RecentChatsPanel` component

**Files:**
- Create: [`src/components/dashboard/RecentChatsPanel.tsx`](src/components/dashboard/RecentChatsPanel.tsx)

Reads `assistant_threads` for the current user, groups by Today / Yesterday / Last week, navigates to `/ai?thread={id}` on click.

- [ ] **Step 1: Create the file**

```tsx
// src/components/dashboard/RecentChatsPanel.tsx
//
// "Recent chats" panel rendered in the lower half of the sidebar when
// the user is on /ai. Reads from assistant_threads (same source as
// CompanionDrawer and FullscreenAIView), groups by date.

import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Plus } from "lucide-react";

interface Thread {
  id: string;
  title: string | null;
  last_message_at: string | null;
  updated_at: string;
}

interface ThreadGroup {
  label: string;
  threads: Thread[];
}

function groupByDate(threads: Thread[]): ThreadGroup[] {
  const now = Date.now();
  const oneDay = 24 * 60 * 60 * 1000;
  const today: Thread[] = [];
  const yesterday: Thread[] = [];
  const lastWeek: Thread[] = [];
  const older: Thread[] = [];
  for (const t of threads) {
    const ts = new Date(t.last_message_at ?? t.updated_at).getTime();
    const age = now - ts;
    if (age < oneDay) today.push(t);
    else if (age < 2 * oneDay) yesterday.push(t);
    else if (age < 7 * oneDay) lastWeek.push(t);
    else older.push(t);
  }
  const groups: ThreadGroup[] = [];
  if (today.length)     groups.push({ label: "Today",     threads: today });
  if (yesterday.length) groups.push({ label: "Yesterday", threads: yesterday });
  if (lastWeek.length)  groups.push({ label: "Last week", threads: lastWeek });
  if (older.length)     groups.push({ label: "Older",     threads: older });
  return groups;
}

export function RecentChatsPanel() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const activeThreadId = searchParams.get("thread");
  const [threads, setThreads] = useState<Thread[]>([]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    supabase
      .from("assistant_threads")
      .select("id, title, last_message_at, updated_at")
      .eq("user_id", user.id)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(50)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (!error) setThreads((data ?? []) as Thread[]);
      });
    return () => { cancelled = true; };
  }, [user]);

  const groups = groupByDate(threads);

  const onNewChat = () => navigate("/ai");
  const onChatClick = (id: string) => navigate(`/ai?thread=${id}`);

  return (
    <div className="flex flex-col flex-1 min-h-0 border-t border-white/[0.06] pt-2 mt-2">
      <div className="px-3 mb-2">
        <button
          type="button"
          onClick={onNewChat}
          className="w-full"
          style={{
            background: "#8FD0D5",
            color: "#141414",
            border: "1px solid #EAE6DC",
            borderRadius: 999,
            padding: "6px 11px",
            fontSize: 11,
            fontWeight: 500,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 5,
            cursor: "pointer",
          }}
        >
          <Plus size={12} strokeWidth={2} />
          New chat
        </button>
      </div>

      <div className="px-3 mb-1.5" style={{ fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(234,230,220,0.40)" }}>
        Recent
      </div>

      <div
        className="flex-1 min-h-0 overflow-y-auto"
        style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(234,230,220,0.20) transparent" }}
      >
        {groups.map((g) => (
          <div key={g.label}>
            <div
              className="px-3 pt-2 pb-1"
              style={{ fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(234,230,220,0.30)" }}
            >
              {g.label}
            </div>
            {g.threads.map((t) => {
              const isActive = t.id === activeThreadId;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onChatClick(t.id)}
                  className="block w-full text-left truncate"
                  style={{
                    padding: "5px 14px",
                    fontSize: 11,
                    color: isActive ? "#EAE6DC" : "rgba(234,230,220,0.62)",
                    background: isActive ? "rgba(234,230,220,0.06)" : "transparent",
                    cursor: "pointer",
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = "rgba(234,230,220,0.04)";
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                  }}
                >
                  {t.title ?? "Untitled chat"}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build + commit**

```bash
npm run build 2>&1 | tail -5
git add src/components/dashboard/RecentChatsPanel.tsx
git commit -m "feat(sidebar): RecentChatsPanel component for /ai hybrid sidebar"
```

---

## Task 3.2: Conditionally render `RecentChatsPanel` in `DashboardSidebar`

**Files:**
- Modify: [`src/components/DashboardSidebar.tsx`](src/components/DashboardSidebar.tsx)

The sidebar already imports `useLocation`. Add a conditional render of `RecentChatsPanel` so it only appears on `/ai`.

- [ ] **Step 1: Locate the sidebar's main render return**

```bash
grep -n "return (\|<aside\|<nav\|className=.*glass-sidebar\|sidebar-root" src/components/DashboardSidebar.tsx | head -10
```
Note the line where the sidebar's outer wrapper is — typically a `<div className="glass-sidebar ...">`.

- [ ] **Step 2: Add the import + conditional render**

At the top of `src/components/DashboardSidebar.tsx`, add this import next to the other React-Router imports:

```tsx
import { useLocation } from "react-router-dom";
import { RecentChatsPanel } from "@/components/dashboard/RecentChatsPanel";
```

If `useLocation` is already imported, just add the `RecentChatsPanel` import.

Inside the component body, after the existing nav rendering but before the closing tag of the sidebar's outer container, add:

```tsx
{useLocation().pathname === "/ai" && <RecentChatsPanel />}
```

The exact placement is "after the existing list of nav items, before the bottom profile/avatar section." The panel uses `flex-1 min-h-0` so it fills the remaining height between the nav and the profile.

If the existing nav is wrapped in something that doesn't yield space (e.g. `overflow-y-auto` taking all available height), wrap it in a `flex-shrink-0` container so the chats panel can claim the bottom half.

- [ ] **Step 3: Build + visual test**

```bash
npm run build 2>&1 | tail -5
npm run dev &
sleep 5
```
Open `http://localhost:8081/ai` and verify:
- "+ New chat" button appears below the nav
- "Recent" section with grouped chats appears
- Sidebar scrolls properly — nav takes the top portion, chats panel takes the bottom
- Open `http://localhost:8081/dashboard` (or anything other than `/ai`) and verify: no chats panel, no "+ New chat" button. Sidebar is unchanged.

- [ ] **Step 4: Commit + push**

```bash
kill %1 2>/dev/null
git add src/components/DashboardSidebar.tsx
git commit -m "feat(sidebar): conditional RecentChatsPanel on /ai (hybrid pattern)"
git push origin HEAD:main
```

---

# Verification across all three PRs

After PR 3 lands:

- [ ] **Step 1: Acceptance criteria sweep**

| Spec criterion | Verify |
|---|---|
| Landing on `/dashboard` renders agency view | ✓ visit `/dashboard` |
| Roster shows only clients with pending work | ✓ check roster matches `useDashboardPendingItems` non-empty entries |
| Click client → URL gets `?client=` and view switches to Robby's read | ✓ click any card |
| Click `×` on breadcrumb → returns to agency view | ✓ |
| Click prompt card → AI drawer opens with prompt pre-loaded | ✓ |
| Robby insight click → AI drawer opens with prompt pre-loaded | ✓ |
| Sidebar on `/dashboard` is identical to today | ✓ compare against pre-PR-3 |
| Sidebar on `/ai` has Recent chats in lower half + "+ New chat" | ✓ visit `/ai` |
| Clients with no pending items do not appear in roster | ✓ |
| Empty state — caught up | ✓ in dev, manually clear pending data for all clients |
| Empty state — no clients | ✓ create a fresh user account |
| All cards: 1px ink stroke + 2/3px ink offset shadow + EB Garamond + Figtree | ✓ inspect |
| No grey/cream backgrounds — all surfaces pure `#ffffff` or `#EAE6DC` | ✓ grep + visual |

- [ ] **Step 2: Spec coverage check**

Each numbered acceptance criterion in §9 of the spec maps to at least one task above. Run through them once mentally:

1. `/dashboard` renders agency view — Task 2.4
2. Click client → context switch — Task 2.4 (`onClientClick`)
3. `×` on breadcrumb → un-scope — Task 1.5 (`ActiveClientBreadcrumb` calls `navigate("/dashboard")`)
4. Prompt card → AI drawer pre-loaded — Tasks 2.4 + 2.5
5. Robby's-read action → AI drawer pre-loaded — Tasks 2.2 + 2.5
6. Sidebar on `/dashboard` unchanged — PR 3 only adds a conditional render
7. Sidebar on `/ai` has chats + new chat button — Task 3.1 + 3.2
8. Empty roster filter — Task 2.4 (`rosterClients` memo)
9. Empty-state copy — Task 2.4
10. First-time empty state — Task 2.4 (`+ Add your first client` block)
11. Editorial sticker treatment — Tasks 1.3, 1.4, 1.5, 2.2 (all cards use `1px solid #141414` + offset shadow)
12. No grey/cream backgrounds — all card surfaces hardcoded `#ffffff`, page bg `#EAE6DC`

All criteria covered.

---

## Self-review notes

- **No placeholders.** Every step has real code. The only "TBD" in the spec was hand-drawn doodle SVGs, which is explicitly deferred (lucide icons ship as placeholders).
- **Type consistency.** `PendingItem`, `PendingItemVariant`, `DashboardPrompt`, `RobbyInsight` are defined once and re-used across tasks with matching names.
- **Spec coverage.** §1-§11 all map to tasks above.
- **Test approach.** No frontend test framework exists in this repo (only Deno-based edge function tests). Each task verifies via `npm run build` (typecheck) + manual visual smoke test, matching how the rest of the React app has been built and verified throughout the editorial rebrand work. Adding Vitest is out of scope.
- **Robby's read** uses a deterministic builder in Phase 1 (Task 2.3). The spec calls this out as Phase 1; AI-generated narration is a follow-up plan, not in scope here.
