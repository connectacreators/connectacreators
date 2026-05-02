# AI Companion — Project Vision & Roadmap
**Date:** 2026-05-02  
**Status:** Brainstorming in progress — Phase 1 not yet specced  

---

## The Goal

Make **anyone** — even someone with zero marketing knowledge — able to produce winning content consistently using ConnectaCreators. The AI companion guides them through every step, from coming up with ideas all the way to the video appearing in the content calendar after editing.

---

## Who It Serves

The companion adapts its tone, questions, and guidance based on who is logged in:

- **Client (business owner / creator):** No marketing knowledge assumed. Companion leads, explains, and does the heavy lifting. Asks simple questions, translates answers into content strategy automatically.
- **Agency user (Connecta team member):** More efficient mode — companion accelerates workflows, suggests next actions, and manages multiple clients without hand-holding.

Role detection uses existing auth roles (`isUser`, `isAdmin`, `isVideographer`, etc.).

---

## Existing Systems the Companion Orchestrates

All of these already exist in the codebase and the companion will call into them:

| System | File | What the companion uses it for |
|--------|------|-------------------------------|
| Onboarding data | `clients.onboarding_data` | Client's brand, offer, target audience, competitors |
| SuperPlanningCanvas | `SuperPlanningCanvas.tsx` | Creating nodes (ideas, research, brand guide, competitor profiles) |
| Script Wizard | `AIScriptWizard.tsx` | Pre-filling and running the 5-step script generation |
| Viral Today | `ViralReelFeed.tsx` | Selecting reference viral videos by niche/format |
| Vault | `vault_templates` table | Saving and reusing video structures |
| Editing Queue | `EditingQueue.tsx` | Routing footage to editors |
| Content Calendar | `ContentCalendar.tsx` | Scheduling approved content |
| Credits system | `deduct_credits_atomic()` | All AI operations deduct credits |

---

## 4-Phase Roadmap

### Phase 1 — Floating AI Companion + Memory *(spec this next)*
A chat bubble in the bottom-right corner of **every page**, always available. Has persistent memory of the client across sessions (what stage they're in, what they've discussed before, what content they've made). Proactively asks the next question. Knows what page the user is on and adjusts its guidance accordingly.

**Key capabilities:**
- Floating bubble UI, expands into a chat panel
- Persistent conversation memory across sessions (stored in DB)
- Workflow stage awareness (onboarding → ideation → scripting → filming → editing → published)
- Role-aware tone (client = guided/simple, agency = efficient/direct)
- Can navigate the user to the right page
- Calls the existing Claude API edge function for responses

**What's NOT in Phase 1:**
- No canvas node creation yet
- No script wizard automation yet
- No editing queue automation yet
- Just: companion UI + memory + guidance + navigation

---

### Phase 2 — Canvas Orchestration
Companion can create and fill SuperPlanningCanvas nodes from conversation:
- Ideas from chat → text nodes
- Voice memo transcription → text/research nodes
- Competitor URL → competitor profile node
- Brand info from onboarding → brand guide node
- Entire canvas pre-populated from a 10-minute onboarding conversation

---

### Phase 3 — Script Pipeline Automation
Companion handles the full script creation flow from chat:
1. Asks what topic/idea to create content about
2. Searches Viral Today for matching viral videos in the client's niche
3. Recommends 3 reference videos with explanation of why they work
4. Client picks one (or says "you pick")
5. Companion pre-fills the script wizard (format, hook type, research facts)
6. Script is generated, reviewed in chat, saved
7. Client is prompted to film

---

### Phase 4 — Post-Production Automation
When footage is uploaded:
1. Companion detects the upload (via editing queue or storage event)
2. Auto-creates an editing queue item with the script attached
3. Assigns to best available editor (based on workload/availability)
4. Notifies editor
5. When approved: auto-schedules to content calendar with AI-generated caption
6. Notifies client that their content is live

---

## UI Concept (Phase 1)

**Floating bubble:** Bottom-right corner, always visible across all pages. Shows an animated pulse when the companion has something to say. Clicking opens a chat panel.

**Chat panel:** Slides up from the bubble. Shows:
- Companion avatar + name (e.g. "Connecta AI")
- Current workflow stage indicator ("You're in: Idea Phase")
- Conversation history (persistent, scrollable)
- Input field with voice memo option
- Quick action chips based on context ("Show me viral videos", "Start a script", "What's next?")

**Adaptive greeting:**
- Client (no marketing knowledge): "Hey [Name]! Ready to create something great today? Let's figure out what we're posting this week."
- Agency user: "Hey — [ClientName] hasn't posted in 4 days. Want to run the script pipeline?"

---

## Memory Architecture (Phase 1 Design Decision — TBD)

Options to decide during Phase 1 brainstorming:
- **A:** Store conversation history + workflow state in a new `ai_companion_sessions` table
- **B:** Use the existing `onboarding_data` JSON blob extended with companion state
- **C:** New `companion_memory` table with structured fields (stage, last_topic, last_script_id, etc.)

Recommendation: **C** — structured memory is easier to query for "where are they in the workflow" logic.

---

## Open Questions (to answer during Phase 1 brainstorm)

1. Does the companion speak first (proactive) or wait for the user to open it?
2. What is the companion's name/persona? Or just "Connecta AI"?
3. Does it have a voice (text-to-speech output)? Or text only?
4. Maximum messages stored per client session?
5. Does the companion appear for all users or only clients + agency users (not editors/videographers)?

---

## Next Steps

1. Continue Phase 1 brainstorm — clarify open questions above
2. Present Phase 1 design (UI mockups + data model + behavior)
3. Write Phase 1 spec → plan → build
4. Repeat for Phases 2–4
