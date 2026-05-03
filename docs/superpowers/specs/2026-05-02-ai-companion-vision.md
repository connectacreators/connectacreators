# AI Companion — Project Vision & Roadmap
**Date:** 2026-05-02  
**Status:** Phase 1 shipped · Brainstorming Phase 2+ intelligence upgrades

---

## The Goal

Make **anyone** — even someone with zero marketing knowledge — able to produce winning content consistently using ConnectaCreators. The AI companion guides them through every step, from coming up with ideas all the way to the video appearing in the content calendar after editing.

---

## Phase 1 — Shipped ✅

- Floating bubble on every page (CompanionBubble)
- Command Center page at `/ai` with task cards + chat
- First-login naming modal (Max, Luna, Nova, etc.)
- Persistent memory via `companion_state.workflow_context`
- 40-message conversation history
- Auto/Ask/Plan autonomy modes
- Full tool library: navigate, fill_onboarding, create_script, find_viral_videos, schedule_content, submit_to_editing_queue, get_editing_queue, get_content_calendar, create_canvas_note, list_all_clients, get_client_info, get_hooks, save_memory

---

## Phase 2 — Intelligence Upgrades (Brainstorming in Progress)

### Decisions Made

**Autonomy:** Option C — Monday sweep (time-based) + real-time triggers (event-based). Both.

**Draft review:** Option A — "Robby's Drafts" tab in the Command Center. Everything Robby prepared sits there. Approve/edit/reject without touching main workflow.

**Content strategy location:** A dedicated **Strategy tab on each client's profile page** — same view for agency and client. Serves as both visual dashboard and Robby's instruction set.

**Strategy is Robby's context:** The strategy page data is loaded into Robby's system prompt. Robby reads the monthly target, content mix, ManyChat keyword, CTA goal, stories target, etc. and uses this to make all decisions automatically.

---

### Strategy Page Design (Approved)

**Fulfillment Score** (0–100) at the top:
- 80–100 = Green "On Track"
- 50–79 = Yellow "Needs Attention"
- 0–49 = Red "Action Required"

Score is calculated from weighted average of all areas below.

**Traffic light sections:**
1. **Social Media Presence** — handles + follower count + engagement per platform
2. **Monthly Pace** — scripts created, videos edited, posts scheduled vs. goal (default 20/month)
3. **Content Mix** — Reach/Trust/Convert bar (plain English, not TOFU/MOFU/BOFU)
4. **Audience Alignment** — are scripts targeting the right people? interest ratio score, uniqueness score
5. **ManyChat & CTAs** — is it set up, what keyword, is it used consistently
6. **Stories** — target vs actual per week
7. **Ads** — running or not, budget, goal

**Strategy fields stored per client:**
- Posts per month (default: 20)
- Scripts per month (default: 20)
- Videos edited per month (default: 20)
- Stories per week (default: 10)
- Content mix: % reach / % trust / % convert (default: 60/30/10)
- Primary platform (Instagram, TikTok, YouTube)
- ManyChat active: yes/no
- ManyChat keyword (default: none)
- CTA goal: ManyChat trigger / Follow / Link in bio
- Running ads: yes/no
- Ad budget
- Ad goal

---

### Robby's Proactive Intelligence (To Build)

**Monday sweep:** Every Monday, Robby checks all clients:
- How far behind is each client on their monthly goal?
- What content types are missing from the mix?
- What needs to go into the editing queue?
- What calendar slots are empty?

Robby auto-generates what's missing → places everything in "Robby's Drafts" tab.

**Real-time triggers:**
- Client hasn't posted in 5+ days → draft a script
- Calendar has empty slots next week → fill them
- Editing queue stalled → flag it
- Monthly target pace is off → generate batch scripts

**Drafts queue:** Everything Robby generates auto is a "draft" — never goes live without human approval. Agency or client reviews in Command Center → approve/edit/reject.

---

### Brainstorm Questions Still Open

- [ ] When Robby auto-generates scripts, which decisions does it make alone vs. ask about? (topic, hook, viral reference, format, CTA, caption)
- [ ] What triggers the Monday sweep? (scheduled cron job vs. manual trigger)
- [ ] Can clients approve their own drafts or only agency?
- [ ] What does the "Robby's Drafts" tab look like inside the Command Center?

---

## Full Tool Library (Current)

| Tool | Status |
|------|--------|
| navigate_to_page | ✅ |
| fill_onboarding_fields | ✅ |
| save_memory | ✅ |
| get_client_info | ✅ |
| create_script | ✅ |
| find_viral_videos | ✅ |
| list_client_scripts | ✅ |
| schedule_content | ✅ |
| submit_to_editing_queue | ✅ |
| get_editing_queue | ✅ |
| get_content_calendar | ✅ |
| create_canvas_note | ✅ |
| list_all_clients | ✅ |
| get_hooks | ✅ |
| respond_to_user | ✅ |
| **get_client_strategy** | 🔲 To build |
| **create_draft_script** | 🔲 To build |
| **approve_draft** | 🔲 To build |
| **batch_create_scripts** | 🔲 To build |
| **generate_caption** | 🔲 To build |
| **run_5_50_filter** | 🔲 To build |
| **extract_content_pillars** | 🔲 To build |
| **generate_weekly_report** | 🔲 To build |
