# Agency Dashboard Redesign — Design Spec

**Status:** Approved — ready for implementation plan
**Date:** 2026-05-15
**Scope:** `/dashboard` page (`src/pages/Dashboard.tsx`) + a contextual addition to `DashboardSidebar.tsx` when on `/ai`. The current "tool launcher" with 3 folder cards (Content Creation · Sales · Client Set Up) is replaced. The Super Canvas, AI surfaces, and other routes are unchanged.

---

## 1. Goal

Remake the dashboard around two truths that became clear after shipping the Super Canvas and editorial rebrand:

1. **This is a content agency app, not a chatbot.** The dashboard should center on the agency's work — clients and the things to do across them.
2. **The AI (Robby) is ambient.** The CompanionDrawer is always available globally; the dashboard does not need to "be the AI." It should *launch* AI work, not replace itself with chat.

The new dashboard answers two questions at a glance:
- **Who needs me today?** (clients that have pending work)
- **What can I start right now?** (six AI quick prompts that handle the most common workflows)

## 2. Locked decisions (from brainstorm 2026-05-15)

| Decision | Resolution |
|---|---|
| Direction | Agency-first dashboard (NOT AI-chat homepage). The AI lives in the drawer and the fullscreen `/ai` view, and is *launched* from the dashboard via prompt cards. |
| Theme | **Light main + dark sidebar.** Page background: Bone (`#EAE6DC`). Cards: pure `#ffffff` with `1px solid #141414` ink stroke + `3px 3px 0 #141414` offset shadow (landing sticker style). Sidebar stays Graphite (`#1F1F1F`) — light surfaces are where work happens, dark surfaces are chrome/AI. |
| Sidebar | **Hybrid context-aware sidebar.** The existing `DashboardSidebar.tsx` nav (Home · Robby · Create group · Editing · Growth · Agency · Settings) stays unchanged everywhere. On `/ai` only, a "Recent chats" section slides into the lower half. Nothing else in the sidebar changes. |
| Dashboard composition | Two main sections stacked: **(1) Client roster** of cards that need attention, **(2) "Start with Robby"** — six AI quick prompt cards. |
| Client cards | Medium density: `EB Garamond` name + 2–3 status pills (e.g., "2 to approve", "+12K views", "Editing 4"). |
| Client click | **Switch global "active client" context.** The whole app scopes to that client (top breadcrumb shows their name with an `×` to unscope, sidebar links route to `/clients/{id}/...`, AI drawer auto-includes their brand context). Click `×` to return to agency view. |
| Roster filter | **Only clients with pending work appear.** No "+ Add client" tile in the roster. The full client list lives under sidebar → Agency → Clients. |
| Client-scoped view (after clicking into a client) | **"Robby's read."** Roster + 6 prompts are replaced by a list of AI-narrated insight rows. Each row is a sticker card with: small ink icon, plain-English insight, and an action link. Clicking a row opens the AI drawer pre-loaded with that prompt + the client's context. |
| AI prompt cards | Six fixed prompts (see §5). Doodle aesthetic: pure ink line icons (no emojis, no tint). Each card opens the AI drawer with that prompt pre-loaded + the current client context (or "all clients" if in agency view). Doodle SVG assets are TBD; ship with lucide-react icons as placeholders until the user provides finals. |

## 3. Layout

### 3.1 Page structure (agency view)

```
┌────────┬───────────────────────────────────────────────────────────┐
│        │  Hi Roberto.                                  (greeting)  │
│ SIDEBAR│  4 clients · 7 things to handle today.        (subtitle)  │
│        │                                                            │
│ (no    │  CLIENTS  (eyebrow)                                       │
│ chats) │  ┌──────────┐ ┌──────────┐ ┌──────────┐                    │
│        │  │ Dr Calvin│ │ Joe G.   │ │ Sarah R. │  (medium card)    │
│        │  │ pill pill│ │ pill pill│ │ pill pill│                    │
│        │  └──────────┘ └──────────┘ └──────────┘                    │
│        │  ┌──────────┐                                              │
│        │  │ M. Club  │                                              │
│        │  └──────────┘                                              │
│        │                                                            │
│        │  START WITH ROBBY  (eyebrow)                              │
│        │  ┌──────────┐ ┌──────────┐ ┌──────────┐                    │
│        │  │ icon     │ │ icon     │ │ icon     │  (prompt card)    │
│        │  │ Title    │ │ Title    │ │ Title    │                    │
│        │  │ desc     │ │ desc     │ │ desc     │                    │
│        │  └──────────┘ └──────────┘ └──────────┘                    │
│        │  ┌──────────┐ ┌──────────┐ ┌──────────┐                    │
│        │  │ icon     │ │ icon     │ │ icon     │                    │
│        │  └──────────┘ └──────────┘ └──────────┘                    │
└────────┴───────────────────────────────────────────────────────────┘
```

- **Page padding:** ~22px top/bottom, 28px left/right (or container width-bounded)
- **Page background:** `#EAE6DC` (Bone, the canvas color)
- **Section spacing:** 28px between roster and prompts
- **Eyebrow label:** Figtree 600, 10px, 0.20em letter-spacing, uppercase, `rgba(20,20,20,0.45)`
- **Greeting H1:** EB Garamond 500, ~26px on desktop, ink color, `-0.01em` letter-spacing
- **Greeting subtitle:** Figtree 12px, `rgba(20,20,20,0.55)`

### 3.2 Page structure (client-scoped view)

When `?client={id}` is in the URL (or after clicking a client card):

```
┌────────┬───────────────────────────────────────────────────────────┐
│        │  Agency / [● Dr Calvin ×]                  (breadcrumb)   │
│ SIDEBAR│                                                            │
│        │  Robby's read on Dr Calvin                   (H1)         │
│        │                                                            │
│        │  ┌──────────────────────────────────────────────────┐     │
│        │  │ ⊙  The morning reel needs your approval before  │     │
│        │  │    11am — queued to auto-post.                   │     │
│        │  │    Open in editor →                              │     │
│        │  └──────────────────────────────────────────────────┘     │
│        │  ┌──────────────────────────────────────────────────┐     │
│        │  │ ⊙  3 "morning routine" videos trending 5–8×.    │     │
│        │  │    Dr Calvin's voice fits two — I drafted hooks.│     │
│        │  │    See the hooks →                               │     │
│        │  └──────────────────────────────────────────────────┘     │
│        │  ...                                                       │
└────────┴───────────────────────────────────────────────────────────┘
```

The Robby's-read rows replace the roster + prompts sections. Click any action link or row → opens the AI drawer with the prompt + client context pre-loaded.

## 4. Components

### 4.1 `<ClientCard />` (medium density)

**File:** `src/components/dashboard/ClientCard.tsx` (new)

```tsx
interface ClientCardProps {
  clientId: string;
  name: string;
  avatarColor?: string;        // defaults to Aqua
  pendingItems: PendingItem[]; // shapes the pills
  onClick: () => void;         // switches global active client context
}

interface PendingItem {
  label: string;
  variant: "honey" | "aqua" | "ink";
  count?: number;
}
```

**Styling:**
- Background: `#ffffff`
- Border: `1px solid #141414`
- Box-shadow: `2px 2px 0 #141414` (hover → `3px 3px 0 #141414`, transform `translate(-1px, -1px)`)
- Border-radius: `12px`
- Padding: `12px 14px`
- Header: `display: flex; align-items: center; gap: 10px;`
  - Avatar: 32px circle, Aqua fill (or `avatarColor`), Ink monogram (first letters of name), font-weight 600, font-size 12px
  - Name: EB Garamond 14px weight 500, ink color
- Pills row: `display: flex; flex-wrap: wrap; gap: 5px;` margin-top: 8px

**Pill variants:**
- `honey`: `bg-rgba(224,165,96,0.18) text-#6B4D26 border-rgba(224,165,96,0.50)`
- `aqua`:  `bg-rgba(143,208,213,0.18) text-#2E5E61 border-rgba(143,208,213,0.50)`
- `ink`:   `bg-rgba(20,20,20,0.06) text-rgba(20,20,20,0.65) border-rgba(20,20,20,0.18)`

All pills: 10px Figtree 500, `2px 8px` padding, `999px` radius.

### 4.2 `<PromptCard />`

**File:** `src/components/dashboard/PromptCard.tsx` (new)

```tsx
interface PromptCardProps {
  icon: LucideIcon;        // placeholder; swap for doodle SVG asset later
  title: string;
  description: string;
  prompt: string;          // the actual prompt text sent to the AI drawer
  onClick: () => void;     // opens AI drawer with prompt pre-loaded + current client context
}
```

**Styling:**
- Background: `#ffffff`
- Border: `1px solid #141414`
- Box-shadow: `3px 3px 0 #141414` (hover → `4px 4px 0 #141414` + transform `translate(-1px, -1px)`)
- Border-radius: `12px`
- Padding: `14px`
- Icon: 24px lucide line icon in ink color, 1.5 stroke width, line-cap round, top-aligned
- Title: EB Garamond 15px weight 500, ink color, letter-spacing `-0.005em`, margin-bottom 3px
- Description: Figtree 11px, `rgba(20,20,20,0.55)`, line-height 1.4

### 4.3 `<RobbyInsightRow />`

**File:** `src/components/dashboard/RobbyInsightRow.tsx` (new)

```tsx
interface RobbyInsightRowProps {
  icon: LucideIcon;
  text: string;           // plain-English insight, can contain <strong> via children
  actionLabel: string;    // e.g., "Open in editor →"
  prompt: string;         // AI prompt to load when clicked
  scopedClientId: string; // injected as client context for the AI
  onClick: () => void;
}
```

**Styling:** matches `PromptCard` (white card, ink stroke, 2px offset shadow) but with `display: flex; gap: 10px;` layout — icon left in a 22×22 Aqua-tinted circle, text + action link right.

### 4.4 Active-client breadcrumb

When scoped to a client, the top of the main area shows:

```html
<div class="breadcrumb">
  <a href="/dashboard">Agency</a>
  <span>/</span>
  <button class="client-chip">
    <span class="avatar-mini">DC</span>
    Dr Calvin
    <span class="x">×</span>
  </button>
</div>
```

Click the `×` or the "Agency" link → un-scope back to agency view.

### 4.5 Sidebar hybrid section

**File:** `src/components/DashboardSidebar.tsx` (modify)

The existing sidebar gets one addition: a conditionally-rendered "Recent chats" section that appears in the lower half **only when** `useLocation().pathname === "/ai"`.

Structure when on `/ai`:

```
┌─────────────┐
│ Brand       │
│ + New chat  │   (slides in)
├─────────────┤
│ [existing   │
│  nav        │   (shrinks to top half, scrolls if needed)
│  unchanged] │
├─────────────┤
│ Recent      │
│ ▸ Today     │   (chats grouped by date, scrolls independently)
│ ▸ Yesterday │
│ ▸ Last week │
├─────────────┤
│ Avatar · RG │
└─────────────┘
```

When NOT on `/ai`, the sidebar is unchanged from current state — no chats section, nav takes full height, no "+ New chat" button.

**Implementation:** wrap the existing nav in a flex column that yields to a `<RecentChatsPanel>` sibling only when `pathname === "/ai"`. The chat panel reads from existing `assistant_threads` Supabase tables (already used by `CompanionDrawer`).

## 5. The six AI quick prompts

| Title | Icon | Description | Prompt sent to AI |
|---|---|---|---|
| Generate hooks | lucide `Anchor` (placeholder for fishing-hook doodle) | 3–5 viral hooks for the active client, tuned to their voice + niche | `"Give me 5 hook ideas for {client} about {topic}. Match their tone and use proven outlier formulas."` |
| Script from notes | lucide `FileText` | Drop talking points; get a polished reel script (hook → body → CTA) | `"Turn these notes into a 45-second reel script for {client}. Hook, body, CTA structure."` |
| Find viral angles | lucide `Flame` | Scan today's Viral Today for the client's niche, pull 3 angles | `"Pull 3 trending angles from Viral Today that fit {client}'s niche. Tell me what's working and why."` |
| Plan the week | lucide `CalendarDays` | Lay out next 7 days of posts across clients | `"Plan the next 7 days of content across all clients. Group shoot days, mix formats, flag gaps."` |
| Edit feedback | lucide `Clapperboard` | Critique a draft edit as a sales coach | `"Critique this edit for {client}. Pacing, hook strength, CTA — call out what to fix before posting."` |
| Audit performance | lucide `BarChart3` | What's working last 30 days, what to double down on | `"Audit the last 30 days of {client}'s posts. What's working, what's not, what to double-down on."` |

`{client}` is substituted with the active client's name + brand context; in agency view it becomes "across all clients" or the user is asked to pick.

## 6. Data flow

### 6.1 Which clients show in the roster

A client appears in the roster if `pendingItems.length > 0`. Pending items come from existing tables:
- **2 to approve** → count of `scheduled_posts` with `status = 'awaiting_approval'`
- **N to schedule** → count of `scripts` with `status = 'ready'` and no `scheduled_post`
- **N in editing** → count of `editing_queue` rows where `client_id = X` and `status != 'done'`
- **N new leads** → count of `leads` rows where `client_id = X` and `created_at > now() - 24h` and unread
- **+NK views** → optional perf delta (last 7 days vs previous 7), shown as Aqua pill if positive

If `pendingItems` resolves to `[]` for a client, **do not render that card**. The dashboard becomes empty of clients when all clients are caught up.

### 6.2 Empty state — no clients need attention

When the resolved roster is empty:

```
Hi Roberto.
All caught up — nothing pending across your 4 clients.

[6 prompt cards still render]
```

The prompt cards always render regardless of roster state — the user can still launch AI work even if no clients are pending.

### 6.3 Empty state — first-time user (no clients at all)

```
Hi Roberto.
Add your first client to get started.

[Big card: "+ Add client" → goes to /onboarding or /clients/new]

[Below: the 6 prompt cards still render — AI works without clients]
```

### 6.4 Active client context

State managed via a new React context (`ActiveClientProvider`) wrapping the dashboard layout. Default `null` (agency view). When a `ClientCard` is clicked, the context updates and a `?client={id}` query param is added to the URL so the state survives reloads and deep-links.

The `AI Drawer` reads `useActiveClient()` to inject client brand context into every prompt automatically.

## 7. Routes

- `/dashboard` — agency view (current state)
- `/dashboard?client={id}` — client-scoped view (Robby's read)

The legacy `/clients/{id}/...` deep-routes (Scripts, Vault, Editing Queue, Calendar) still exist and continue to work — clicking a Robby's-read action link or a sidebar nav item while in scope routes to those.

## 8. Out of scope for this spec

- Editing the existing `/clients/{id}/scripts`, `/clients/{id}/leads`, etc. pages — they are unchanged
- The AI drawer or `/ai` page internals — they keep their current shipped design
- New doodle SVG assets for the prompt card icons — ship with lucide placeholders; the user will provide finals as a follow-up
- The mobile dashboard layout — handled in a separate plan (current desktop-first spec)
- Multi-user / collaborator views — separate concern

## 9. Acceptance criteria

After this plan ships:

1. Landing on `/dashboard` renders the new agency view: greeting, client roster (only clients with pending work), six AI prompt cards
2. Clicking a client card scopes the app: URL updates to `?client={id}`, top breadcrumb shows the client, the main area replaces roster + prompts with Robby's read
3. Clicking the `×` on the breadcrumb (or "Agency" link) un-scopes back to agency view
4. Clicking a prompt card opens the AI drawer pre-loaded with that prompt + active client context (or "across all clients" when in agency view)
5. Clicking a Robby's-read action link opens the AI drawer with that prompt + the scoped client's context
6. The sidebar on `/dashboard` is identical to today's `DashboardSidebar` — no chats section, no behavioral changes
7. The sidebar on `/ai` adds a "Recent chats" section in the lower half + a "+ New chat" button; nav remains in the upper half and scrolls if overflowing
8. Clients with no pending items do not render in the roster — they are reachable via sidebar → Agency → Clients
9. Empty state (no clients need attention) renders the "All caught up" message and still shows the 6 prompt cards
10. First-time empty state (no clients at all) renders an "+ Add client" CTA + the 6 prompt cards
11. All cards use the editorial sticker treatment (`1px solid #141414` + `2px 2px 0 #141414` or `3px 3px 0 #141414` shadow) and EB Garamond + Figtree typography from the existing palette
12. No grey/cream backgrounds — all card surfaces are pure `#ffffff`

## 10. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Active-client context global state collides with existing `useAssistantMode()` hook in `CompanionDrawer` | Reuse `useAssistantMode` if possible (it already reads `?clientId=` from the URL for `/clients/:id/...` routes). Extend it to also read from `/dashboard?client={id}` instead of forking a new context. |
| Pending-items queries (Supabase) are expensive when many clients × many tables | Batch via a single RPC that returns `{ clientId, pendingItems: PendingItem[] }[]`. Cache for the session. Re-fetch on tab focus + Supabase realtime channel for `scheduled_posts`, `editing_queue`, `leads`. |
| Robby's-read content depends on AI insights that don't exist yet | Phase 1 ships with three deterministic insight types (approve-pending, viral-trends-spike, performance-callout) computed locally. AI-generated narration is a later enhancement. |
| Lucide icons for prompt cards don't match the editorial doodle aesthetic | User has indicated they'll provide hand-drawn SVG assets later. Stub the icon prop to accept either `LucideIcon` or a custom SVG component so swap-in is trivial. |
| Removing the current 3-folder pattern strands users who relied on the folder hierarchy | All sub-cards from those folders are still reachable via the unchanged sidebar nav. The new dashboard surfaces a *subset* (Super Canvas through prompt cards). |

## 11. Files affected

| File | Change |
|---|---|
| `src/pages/Dashboard.tsx` | **Complete rewrite.** Replaces the 950-line "folder/sub-card" launcher with the new agency view. Conditionally renders agency view or client-scoped view based on `?client=` query param. |
| `src/components/DashboardSidebar.tsx` | **Modify.** Add conditional "Recent chats" panel rendered when `pathname === "/ai"`. No other changes. |
| `src/components/dashboard/ClientCard.tsx` | **New.** Medium-density client card with pills. |
| `src/components/dashboard/PromptCard.tsx` | **New.** AI prompt sticker card. |
| `src/components/dashboard/RobbyInsightRow.tsx` | **New.** Robby's-read row for the client-scoped view. |
| `src/components/dashboard/ActiveClientBreadcrumb.tsx` | **New.** Top breadcrumb when scoped to a client. |
| `src/components/dashboard/RecentChatsPanel.tsx` | **New.** Lower-half chats panel for the hybrid sidebar on `/ai`. |
| `src/hooks/useDashboardPendingItems.ts` | **New.** Reads pending items per client (single batched query). |
| `src/contexts/ActiveClientContext.tsx` | **New** (or extend existing `useAssistantMode`). URL-synced `?client=` param. |

Estimated: 5 new files, 2 modified, ~600–800 lines of new code, Dashboard.tsx shrinks from ~950 to ~250 lines.
