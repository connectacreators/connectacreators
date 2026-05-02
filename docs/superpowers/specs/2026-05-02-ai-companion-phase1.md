# AI Companion — Phase 1 Design Spec
**Date:** 2026-05-02
**Vision doc:** `docs/superpowers/specs/2026-05-02-ai-companion-vision.md`
**Status:** Approved — ready for implementation planning

---

## Goal

Build the foundation of the AI companion: a named, persistent AI assistant that lives on every page as a floating bubble, has a dedicated Command Center page for task management, and speaks plain English (and Spanish) to every user regardless of role.

---

## Core Design Decisions

1. **One AI, one voice** — same plain English for clients, agency users, admins, everyone. No jargon, no technical labels, no role-specific modes.
2. **The AI has a name** chosen by the user on first login. Every message refers to the AI by that name ("Max found 3 videos", "Ask Max anything").
3. **The AI is an orchestrator** — it watches what's happening across the app (last post date, pending scripts, stalled edits, empty calendar) and tells the user exactly what to do next. The user doesn't have to think. They just respond.
4. **Bilingual** — full EN/ES support using the existing `tr()` / `useLanguage()` system. All UI copy, task labels, messages, and the naming popup translate automatically.

---

## Two UI Components

### 1. Floating Bubble (global, always visible)

A circular button in the bottom-right corner of every page, at all times.

**Visual:**
- 52px circle, gradient `linear-gradient(135deg, #0891B2, #84CC16)`
- Bot icon (Lucide `Bot`) centered inside
- Animated ring pulse when there are pending tasks
- Red badge showing the count of "Needs Action" tasks (matches Command Center count)
- `z-index: 50` so it floats above all page content

**Behavior:**
- Click → opens a compact chat panel (slide up from bubble, ~340px wide)
- The compact panel shows the top 1–2 most urgent tasks + a chat input
- A "See all" link inside the compact panel navigates to the full Command Center page
- When there are 0 pending tasks, the bubble shows no badge and the panel says "You're all caught up."

**Placement:** Rendered once in `App.tsx` inside the `OutOfCreditsProvider`, available on all authenticated routes.

---

### 2. Command Center Page (`/ai`)

A dedicated page accessible via the nav sidebar (bot icon with badge). The AI's full workspace.

**Header:**
- Bot icon + assistant's name (e.g. "Max")
- Status line: "N things need your attention" (EN) / "N cosas necesitan tu atención" (ES)
- Animated online dot

**Tabs:**
- **To Do** — tasks needing user action, sorted by urgency (red → amber → blue)
- **In Progress** — tasks the AI is currently running
- **Done** — completed tasks, dimmed

**Task cards:**
Each task has:
- Colored dot (red = urgent, amber = attention needed, blue = next step, gray = done)
- Title in plain English — never technical (e.g. "You haven't posted in 5 days" not "Pipeline pending")
- Subtitle referencing the AI by name (e.g. "Max found 3 viral videos on your topic")
- Primary action button + "Later" / "Skip" button
- Clicking the primary action navigates to the relevant page and starts the flow automatically

**Chat strip at bottom:**
- Always-visible input: "Ask [Name] anything..." / "Pregúntale a [Name] lo que quieras..."
- Voice memo button (mic icon) — records and transcribes to text
- Send button
- Messages sent here appear as a conversation inline above the input (the AI responds)

**Nav item:** Bot icon in the left sidebar, same position for all roles. Shows red badge count matching "To Do" count.

---

## Naming Flow (First Login)

Triggered once, immediately after the user's first successful login (auth state transitions from null → user for the first time, detected by a `companion_setup_done` flag on the client record).

**Modal appearance:**
- Blurs and darkens the app behind it (`backdrop-filter: blur(6px)`, `rgba(6,10,15,0.75)` overlay)
- Centered modal card (~300px wide)
- Bot icon with teal glow halo
- Title: "Welcome to Connecta" / "Bienvenido a Connecta"
- Body: "Your AI assistant is ready. What should we call it?" / "Tu asistente de IA está listo. ¿Cómo lo llamamos?"
- Text input (pre-filled with a random suggestion)
- Quick-pick name chips: Max, Luna, Nova, Ace, Rio, Zara
- CTA button: "Start with [Name] →" (updates live as user types) / "Empezar con [Name] →"
- Skip link: "Skip, I'll name it later" / "Saltar, lo nombraré después"

**On confirm:**
- Saves `companion_name` and sets `companion_setup_done: true` in `companion_state` (upsert)
- Modal closes, app becomes interactive
- Floating bubble appears with a brief greeting: "Hi, I'm [Name]. Let's get you set up."

**On skip:**
- AI defaults to "AI" as the display name in `companion_state`
- `companion_setup_done` still set to true so the modal never shows again
- User can rename the AI in Settings later

---

## Memory & Data Model

### New DB table: `companion_state`

```sql
CREATE TABLE companion_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES clients(id) ON DELETE CASCADE,
  companion_name text DEFAULT 'AI',
  companion_setup_done boolean DEFAULT false,
  last_seen_at timestamptz,
  workflow_context jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(client_id)
);
```

`workflow_context` stores what the AI knows about the user's current state:
```json
{
  "last_post_date": "2026-04-27",
  "active_topic": "organic growth",
  "pending_script_id": "uuid",
  "last_uploaded_footage": null,
  "onboarding_complete": true
}
```

### New DB table: `companion_messages`

```sql
CREATE TABLE companion_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES clients(id) ON DELETE CASCADE,
  role text CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  created_at timestamptz DEFAULT now()
);
```

Stores conversation history. Max 50 messages per client retained; oldest messages beyond 50 are deleted when a new message is inserted.

---

## Task Generation Logic

Tasks are generated server-side by a new `get-companion-tasks` edge function. Called on:
- Page load (Command Center)
- Bubble click
- After any action completes

The function queries existing tables to detect what needs attention:

| Condition | Task title | Priority |
|-----------|-----------|----------|
| No script saved in last 5 days | "You haven't posted in 5 days" | Red |
| Script in `approved` status, no footage uploaded | "Time to film" | Amber |
| Editing queue item with no editor assigned > 2 days | "Your edit needs an editor" | Amber |
| Content calendar empty next 7 days | "Next week's calendar is empty" | Blue |
| Onboarding not complete | "Let's finish setting up your profile" | Red |
| Script in `draft` state > 3 days | "You have an unfinished script" | Blue |
| No vault templates | "Save your first viral video structure" | Blue |

Tasks are sorted: Red → Amber → Blue. Done tasks shown dimmed in the Done tab.

---

## AI Response (Chat)

Chat messages in the compact bubble panel and the Command Center bottom strip go to a new `companion-chat` Supabase edge function. It:

1. Fetches the last 20 messages from `companion_messages` for context
2. Fetches the client's `workflow_context` from `companion_state`
3. Fetches the client's `onboarding_data` from `clients`
4. Calls Claude API (Sonnet 4.6) with a system prompt that:
   - Names itself as the user's chosen companion name
   - Knows what stage the client is at (from workflow_context)
   - Has the client's brand, niche, and audience info
   - Speaks plain English always
   - Knows what pages exist and can suggest navigating to them
   - Responds in the same language the user writes in (auto-detects EN/ES)
5. Streams the response back
6. Saves both the user message and AI response to `companion_messages`

---

## Bilingual Support

All hardcoded strings use the existing `tr()` utility:

```tsx
tr({ en: "You haven't posted in 5 days", es: "No has publicado en 5 días" }, language)
tr({ en: `Ask ${companionName} anything...`, es: `Pregúntale a ${companionName} lo que quieras...` }, language)
```

The AI's conversational responses auto-detect language from the user's message and respond in kind (handled in the system prompt to the Claude API).

---

## Files to Create / Modify

| Action | File | Purpose |
|--------|------|---------|
| Create | `src/components/CompanionBubble.tsx` | Floating bubble + compact panel |
| Create | `src/pages/CommandCenter.tsx` | Full `/ai` Command Center page |
| Create | `src/components/NamingModal.tsx` | First-login naming popup |
| Create | `src/contexts/CompanionContext.tsx` | Global state: name, tasks, open/close |
| Create | `supabase/functions/get-companion-tasks/index.ts` | Generates task list from DB state |
| Create | `supabase/functions/companion-chat/index.ts` | Streams AI responses |
| Modify | `src/App.tsx` | Add `CompanionBubble` + `NamingModal` at root, add `/ai` route |
| Modify | `src/components/DashboardSidebar.tsx` | Add bot nav icon with badge |
| DB migration | `companion_state` + `companion_messages` tables | Memory + chat history |
| DB migration | `companion_state` table | All companion state including name and setup flag (no changes to `clients` table) |

---

## Out of Scope (Phase 1)

- Canvas node creation from chat (Phase 2)
- Script wizard automation from chat (Phase 3)
- Editing queue / calendar automation (Phase 4)
- Voice output / text-to-speech
- Push notifications
- AI renaming in Settings (can be added after Phase 1 ships)

---

## Success Criteria

- User signs up → sees naming modal → names their AI → sees the Command Center with relevant tasks
- Tasks accurately reflect app state (no posts in 5 days triggers the task, posting removes it)
- Chat responds in plain English (or Spanish) using the client's brand context
- Floating bubble is visible on every authenticated page
- Badge count stays in sync with active task count
- Everything works in both EN and ES
