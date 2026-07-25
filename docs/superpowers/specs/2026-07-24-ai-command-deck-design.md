# AI Command Deck — Design

## Summary

Rebuild `/ai` from a chat-first "Command Center" into an always-on, living command deck — a Jarvis-style HUD in Connecta's own brand language (ink/aqua/serif), wired to real agency metrics, driven primarily by voice, and admin-only.

Two-part project:
1. **Design + infrastructure** (this spec) — the visual/interaction redesign, shipped to main.
2. **Leaks & gaps audit** (separate follow-on workstream, out of scope here) — find what the assistant still can't do as a command and produce a fix plan. Preliminary findings are noted in [Known gaps](#known-gaps-carried-into-part-2) below so they aren't lost, but scoping that work is a future spec.

## Current state (as of 2026-07-24)

`/ai` renders `CommandCenter.tsx` (~1,357 lines), a chat-first surface (companion nicknamed "Robby") backed by the `companion-chat` edge function:

- **~90 tools** already live: clients/onboarding, scripts, canvas, editing queue, content calendar, leads/outreach, finance, analytics, viral discovery, contracts, plans/autonomy (Auto/Ask/Plan).
- Claude tool-calling with model tiering (Haiku for reads, Sonnet-4.6 for writes), SSE streaming, rich inline embeds (video cards, metric strips, script previews).
- **Voice today = push-to-dictate only** (Web Speech API → appends to the text box). No read-back, no conversation, no hands-free use.
- **No persistent metrics surface** — all live numbers only ever appear inside chat replies, never as an always-on dashboard.
- **No role gating** — any authenticated user can currently reach `/ai`. It needs to become admin-only.
- Long-term memory tools exist in code but are fully disabled; three overlapping AI backends exist (`companion-chat`, `ai-assistant`, `ai-build-script`). These are Part 2 territory.

## Goals

- A command deck that is genuinely useful as an ambient, always-on surface — not just a chat window with a nicer background.
- Voice as the primary interaction mode, with typing as a first-class fallback (not a downgrade).
- Real agency data on screen at a glance: client performance, revenue goal, outbound pace, content-strategy health, editing/scheduling pace.
- A generalizable pattern for how *any* AI action (not just chat replies) surfaces in the deck without leaving the page.
- Admin-only. This is an internal operations tool, not a client-facing surface.

## Non-goals

- Rebuilding the underlying `companion-chat` tool set — Phase 1 is the shell and the data surface; existing tools are reused as-is.
- Fixing the leaks/gaps found in the current assistant (memory, backend duplication, etc.) — tracked separately, Part 2.
- Redesigning any other page's visual system. `/ai`'s dark HUD language is intentionally its own thing, distinct from the rest of the app's light "editorial" surfaces.

## Visual language

Brand-native HUD: keep Connecta's tokens (`--ink` #141414 field, `--aqua` #8FD0D5 accent/glow, `--bone` #EAE6DC text, `--honey` #E0A560 secondary accent, EB Garamond/serif for display numbers, mono for data labels) but adopt a JARVIS-style live-HUD structure and ambient motion. No raw palette hex outside tokens — passes the existing pre-commit brand guard.

**Boxless, not carded.** Early iterations used bordered/filled panels; user feedback was explicit that this reads as clutter and fights the orb for attention. The converged direction has **no panel fills, no card borders, no border-radius chrome** anywhere. Every HUD element — labels, bars, logs, radar, gauges — sits directly on the page's grid background as plain text/shapes. Structure comes from spacing, thin hairline dividers, and mono-caps labels, not boxes.

**The orb is the hero.** The center of the deck is a large (up to 60% of viewport height), continuously rotating volumetric globe — a ~560-point Fibonacci-sphere point cloud with a lit-sphere shading pass (offset radial gradient + specular highlight, not just flat dots), two tilted orbit rings with small "wing" ornaments, an outer dashed compass ring, and a tight, crisp glow (CSS `drop-shadow`, 2 layers max — early passes over-bloomed into haze and were pulled back). Motion is slow and eased (~0.003 rad/frame rotation, a subtle 9s breathing scale, `smoothstep` depth falloff) — deliberately calmer than a typical "AI orb" cliché.

No text renders on top of the orb — an early version overlaid "ROBBY / STANDBY" on the sphere and it was unreadable against the moving dots. The identity/status line now lives as a small caption *below* the globe, above the greeting.

**Ambient ↔ active.** At rest, the deck shows the idle orb + greeting + composer + a few low-contrast suggestion chips. The moment a conversation or action starts, the center transforms into the response surface (see [Action surface pattern](#action-surface-pattern)) — the rest of the HUD (header, side panels, bottom bar) never moves.

**Depth without gimmicks.** A vignette (darkened edges), a very low-opacity animated film-grain texture, and a slightly-out-of-focus background grid separate the HUD from its backdrop. A single ambient light-sweep passes over the page every ~17s using a wide, soft, multi-stop gradient with `mix-blend-mode: screen` and eased timing — tuned down from an earlier version that read as an obvious scanline gimmick.

**Load choreography.** One orchestrated power-on sequence on mount: header drops in, side HUD blocks slide in from their respective edges, the globe fades up from a blurred/scaled-down state into full focus, then the greeting/composer settle in. All entrance animations respect `prefers-reduced-motion` (near-zero duration, final state applied instantly; continuous ambient animations — breathing, scan sweep, orb pulse — are fully disabled).

## Layout

Three-region grid: left HUD column, center (the orb / action surface), right HUD column. Header spans full width in two boxless corners (brand/objective/badges top-left; clock/date/credits/status top-right). A bottom "roll call" strip (boxless, hairline top border only) shows realtime channel status and latency/sync stats.

**Left column:**
- **System Vitals** — thin bars: scripts this month vs. goal, editing queue load, calendar coverage (next 7d), companion latency.
- **Telemetry** — a ticking monospace event log (script created, video edited, post published, etc.), sourced from `get_recent_activity` plus a live feed.

**Right column:**
- **Voice** — an audio-style equalizer/waveform reflecting the live voice channel (idle vs. listening), synced to the mic toggle state. Lives here, not in the bottom bar, so it reads as part of the deck's live signal readouts rather than decoration on the status strip.
- **Attention Radar** — a small sweeping radar showing overdue items, stalled clients, empty calendar days as blips (`get_overdue_items` / `get-companion-tasks`).
- **Outbound Pace** — a single-line gauge, "N / 50 sent today," with quick per-platform "+1" tap-to-log links.
- **Diagnostics** — a rotating ticker that cycles every ~5.5s through three data channels sharing one slot (a small dot indicator shows which is active), rather than three permanent boxes:
  1. **Client Intel** — clients ranked by 7-day views (the explicit priority: *"primarily what clients are being in views, revenue not so much"*). Rank, name, views, delta.
  2. **Strategy Health** — per-client fulfillment score + On track / Needs attention / Action required flag.
  3. **Agency Goals** — compact revenue-vs-goal and outbound-vs-goal lines.

## Data sources

All panels map to real, already-queryable data — no new backend needed to *read* most of this:

| Panel | Source |
|---|---|
| Scripts / queue / calendar vitals | `get-companion-tasks`, `get_editing_queue`, `get_content_calendar` |
| Client views leaderboard | `viral_videos` / post-performance data (`get_post_performance`, `compare_clients`) |
| Attention radar | `get_overdue_items`, `get-companion-tasks` |
| Activity telemetry | `get_recent_activity` + Realtime |
| Strategy health | `client_strategies` + `src/lib/strategy/pace.ts` (`fulfillmentScore()`) — see gap below |
| Revenue goal | `finance_transactions`, `client_strategies.monthly_revenue_goal` — see gap below |
| Outbound pace | `outbound_metrics` — see gap below |

Three panels need small, scoped backend additions before they can show real numbers:

1. **Agency-wide revenue goal doesn't exist.** No "$50,000/mo" concept exists anywhere in the schema — `client_strategies.monthly_revenue_goal` is per-client and manually typed. Need a single agency-level goal setting (new column/table, or sum-of-per-client as an interim). `monthly_revenue_actual` is likewise manual, not derived from `finance_transactions` — the deck should compute the actual from real transactions rather than trusting the manual field.
2. **Outbound has no daily granularity.** `outbound_metrics` stores monthly aggregates only (`(user_id, platform, month)`), no per-day timestamps, and `companion-chat` doesn't touch this table at all today. The "+1 quick-log" affordance shown in the mockup is the intended fix: a lightweight daily log (new table, one row per tap) that both feeds the deck's live "N/50 today" gauge and rolls up into the existing monthly `outbound_metrics` row.
3. **Strategy Health has no fleet-wide view.** `fulfillmentScore()` in `src/lib/strategy/pace.ts` is real and correct (25% scripts pace + 25% edited pace + 20% scheduled pace + 15% ManyChat + 15% audience/uniqueness score; thresholds ≥80 On track / ≥50 Needs attention / <50 Action required) but only ever runs per-client today. Need to batch it across all clients (pattern: `useTriageRows`'s `.in("client_id", clientIds)` approach), reusing the existing pure scoring function — not reinventing it.

## Action surface pattern

The generalizable mechanic for how *any* assistant action materializes in the deck without navigating away, validated against a concrete case: "open the next video that needs revisions for Dr. Calvin."

- The orb and greeting/composer fade back (opacity + slight scale down) — they yield, they don't vanish abruptly.
- In their place, a task-specific surface fades up in the *same* power-on visual language as the orb itself (blur→focus, scale-up), so it reads as one coherent system rather than a modal bolted onto a chat window.
- The rest of the deck (header, side HUD, bottom bar) never moves. This is the literal answer to "it shouldn't leave the page."
- A small "← Back to command" control collapses the surface back to the idle orb.
- The surface itself is restyled into the deck's own boxless HUD language (thin dividers, mono labels, role-colored accents) — **not** a copy of the existing light-mode `VideoReviewModal`. This is intentional: `/ai` has its own visual system, confirmed explicitly with the user rather than assumed.
- Functionally, the surface must carry the *real* granularity of the underlying feature, not a simplified summary. For the revision-review case specifically, that means: actual video playback position (play/pause/scrub), point-in-time notes, **ranged** notes (locking a start position, playing/scrubbing, locking an end position — mirrors the real `VideoReviewModal`'s range-note mechanic exactly), resolve/unresolve per note, photo attachments on notes, reassigning the editor, and changing lifecycle status — all backed by the same tools the rest of the assistant already has (`open_editing_item`, `add_revision_notes`, `set_lifecycle_status`, `assign_editor`).
- Every action taken inside a surface also emits into the Telemetry log, so the ambient HUD visibly reflects what just happened rather than the action being invisible outside the surface itself.

This pattern generalizes to any queue-item or record-level action (a lead, a script, a client record) — the revision workflow is the reference implementation because it's the most granular real case (video scrubbing + timestamped notes), and if the pattern holds up there it holds up for simpler cases.

## Admin gating

`/ai` currently has no role check — any authenticated user can reach it. Apply the existing, proven pattern used by `Finances.tsx`, `Outbound.tsx`, and `ApiUsage.tsx`:

```
const { isAdmin, loading: authLoading } = useAuth();
if (authLoading) return <spinner>;
if (!isAdmin) return <Navigate to="/dashboard" replace />;
```

No new infrastructure needed — `useAuth()` / `AuthContext` already expose `isAdmin`, and `public.is_admin()` is the standard RLS pattern if any new tables (the outbound daily log, the revenue goal setting) need admin-only policies.

## Voice architecture (Phase 2)

Full conversational (speech-to-speech) voice, not simple dictation — confirmed as the priority given the "working in voice mode mainly" requirement. Three shapes considered:

- **A — Realtime as pure I/O, companion-chat as the only brain.** Every request round-trips through the existing multi-tool agent. Keeps all 90 tools untouched but loses the snappy speech-to-speech feel for small talk.
- **B — Realtime as the agent, all 90 tools re-registered on the Realtime session.** Lowest latency, but duplicates every tool and creates a second execution bridge to maintain. Rejected.
- **C — Hybrid (chosen).** Realtime handles conversation plus a handful of instant local tools (navigate, read visible panels, start/stop). Anything real calls one meta-tool → the existing `companion-chat` (all 90 tools, unchanged) → speaks the summary back while the HUD renders any embeds/action surfaces. Snappy for small talk, full power on demand, zero tool duplication.

**Infra:** a new `realtime-voice` edge function mints ephemeral OpenAI Realtime tokens (reuses the existing `OPENAI_API_KEY` already in secrets for Whisper) — the key never reaches the browser. Client connects via WebRTC. Push-to-activate at launch; wake-word ("Robby") is a straightforward later add, not required for Phase 2.

## Phasing

1. **Phase 1 — The Deck** (this spec's scope). Boxless brand-native HUD shell, real data wired into every panel (including the three scoped backend additions above), admin gating, the action-surface pattern implemented for the revision-review case as the reference. Fully usable via typing and the existing push-to-dictate voice input. This is what ships to main first.
2. **Phase 2 — The Voice.** `realtime-voice` relay + WebRTC + the hybrid tool bridge described above.
3. **Part 2 of the overall ask — Leaks & gaps audit.** Separate workstream, scoped in its own spec after Phase 1 ships. See below for what's already known.

## Implementation note

The frontend/backend investigation in this spec was done early in a long design session. Before writing any code, re-read the current live versions of every file touched (`CommandCenter.tsx`, `App.tsx`, `companion-chat/index.ts` and its `tools/*.ts`, `client_strategies`/`outbound_metrics` schema, etc.) rather than trusting the summaries above — real work may have landed on `main` in the meantime, and stale assumptions risk silently overwriting it. Treat this document as design intent, not a snapshot of exact line numbers to edit blind.

## Known gaps carried into Part 2

Surfaced during backend investigation; not fixed here, but recorded so they aren't lost before that audit:

- Long-term memory tools exist in code (`tools/memories.ts`, `assistant_memories` table, `enforce_assistant_memory_cap` RPC) but are fully disabled — the assistant is instructed to tell users it has no persistent memory.
- Three overlapping AI backends (`companion-chat`, `ai-assistant`, `ai-build-script`) with duplicated logic (e.g. `add_video_to_canvas`, script drafting/saving exist in more than one place) and diverging model choices.
- Two coexisting status models in the editing queue — legacy (`update_editing_status`, `mark_post_published`, etc.) vs. newer `set_lifecycle_status`/`bulk_set_lifecycle_status` — kept side-by-side as "legacy compat," which is easy to write to the wrong field.
- Bulk operations (editing queue) are capped at 14 items per call — larger sweeps silently truncate with no user-visible warning.
- `mode-router.ts`'s per-mode tool filtering is now dead code (the full ~90-tool array ships on every call to preserve prompt caching); the file's per-mode lists no longer reflect what's actually sent to Claude.
- A regex-based "dead-end" retry heuristic (detecting "Let me…/I'll…" promises) fires an extra Anthropic call and is brittle.
- Repo hygiene: multiple stale git-sync duplicate files (` 2.ts`, ` 3.ts`) inside `companion-chat/`, risk of editing the wrong copy.

## Design artifact

An interactive HTML mockup was built and iterated live with the user across several rounds (visual direction → density/panel content → orb dominance & boxless HUD → depth/bloom polish → glow correction → label/scan-sweep fixes → the action-surface pattern with a fully working play/scrub/point-vs-range revision demo). The final mockup is the source of truth for exact visual/motion details not fully spelled out in prose above — implementers should reference it directly rather than re-deriving spacing, easing curves, or the globe rendering approach from scratch.
