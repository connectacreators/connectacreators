# Mario × Super Canvas Script Builder — Design Spec

**Date:** 2026-05-03
**Status:** Approved for implementation

---

## The Problem

Mario currently builds scripts entirely in chat: he calls `find_viral_videos` + `get_hooks` + `create_script` and the result appears as a saved script with no process visibility. The user can't see the research, can't review the winning idea before it's used, and can't intervene mid-build. The winning idea selection is also too narrow (defaults to storytelling) and doesn't analyze what the reference video actually says.

---

## The Vision

The Super Canvas becomes Mario's workspace. Chat is the communication channel — the canvas is where the work happens. Every research step is visible as a node. The user can intervene at any point by typing in chat. The winning idea emerges from the intersection of 4 inputs, covers 6 content categories, and gets tailored into a framework-driven script.

---

## Architecture

### New Mario Tools (4 additions to companion-chat)

**`add_video_to_canvas`**
- Input: `client_name`, `video_url`, `reason` (why this reference was chosen)
- Adds a `videoNode` to the active canvas session
- Immediately triggers transcription via `transcribe-canvas-media` edge function
- Returns: transcription text (waits up to 30s) or signals "transcription in progress"
- Mario reads the transcript to extract: first 3 seconds (real hook), body structure, CTA type

**`add_research_note_to_canvas`**
- Input: `client_name`, `title`, `content` (analysis of the video)
- Adds a `researchNoteNode` with structured breakdown: hook type, why it works, how to adapt
- Positioned next to the video node on canvas

**`add_idea_nodes_to_canvas`**
- Input: `client_name`, `ideas[]` (array of 1 or 3 ideas)
- Each idea: `{ title, hook_sentence, category, framework, why_it_works }`
- Categories: `storytelling | educational | comparison | authority | pattern_interrupt | curiosity_gap`
- Adds each idea as a `textNoteNode` with a distinct color per category
- In Ask/Plan mode: adds all 3. In Auto mode: adds 1 (the selected one)

**`add_script_draft_to_canvas`**
- Input: `client_name`, `title`, `winning_idea`, `framework`, `lines[]`
- Adds a `textNoteNode` as a structured script draft (hook, body lines, CTA)
- This is the editable draft — user can modify lines directly on canvas before saving
- Does NOT save to scripts library yet

**`save_script_from_canvas`**
- Input: `client_name`, `title`, `lines[]`, `winning_idea`, `framework`
- Calls the existing `create_script` logic to persist to scripts library
- Auto mode: called immediately after draft. Ask mode: called after confirmation. Plan mode: called after explicit approval.

---

## Winning Idea Synthesis

The winning idea is found at the intersection of 4 inputs Mario loads at the start of every script session:

1. **Onboarding context** — client's story (specific failures, wins, numbers), unique offer, target audience, competition
2. **Strategy context** — content type needed (reach/trust/convert based on mix gap), audience alignment score and gaps, CTA goal
3. **Viral reference transcript** — actual hook words (first 3 seconds), body structure, why it performed
4. **Hook library** — available frameworks per content type

Mario generates ideas across 6 categories:
- **Storytelling** — personal failure → turning point → lesson. Best for reach.
- **Educational** — counterintuitive claim → proof → method. Best for trust.
- **Comparison** — wrong approach vs right approach, before/after. Best for reach + convert.
- **Authority** — credential lead that stops scroll. Best for trust + convert.
- **Pattern Interrupt** — unexpected or controversial open. Best for reach.
- **Curiosity Gap** — open a loop the brain needs to close. Best for reach + trust.

The synthesis prompt instructs Claude to find the intersection of: the client's most specific credential, the viral hook structure that worked, what the audience actually needs (from alignment gap), and the content type required. Output: one specific hook sentence no one else in the niche is using.

---

## Framework Selection

After the winning idea is identified, Mario selects a framework based on content type:

| Content Type | Framework | Hook | Body | CTA |
|---|---|---|---|---|
| Reach | Vulnerability Open | Personal failure + specific detail | 3 moments → turning point | ManyChat keyword |
| Reach | Pattern Interrupt | Unexpected claim | Proof → expand | Follow for more |
| Trust | Teaching + Proof | Counterintuitive claim | Teach → prove with result | Follow / Part 2 |
| Trust | Authority Lead | Credential + surprise | Method → proof | Link in bio |
| Convert | Problem → Solution | Name the exact pain | Why others fail → what works | Direct DM offer |
| Convert | Comparison | Wrong vs right | Side by side → verdict | ManyChat / DM |

The winning idea is the **what** (the angle and hook premise). The framework is the **how** (the structure it gets built into). Mario plugs the idea into the framework and writes every line.

---

## Mode-Dependent Behavior

### ⚡ Auto Mode
1. Loads all 4 context inputs
2. Picks best idea itself — adds 1 idea node to canvas
3. Announces in chat: "Going with [category] hook — [one sentence why]. Building now."
4. Adds video node → research note → idea node → script draft → saves to library
5. Never pauses for approval
6. Supports batch: "build 20 scripts" loops the full flow 20 times, saves each

### ? Ask Mode
1. Loads context, generates 3 ideas across different categories
2. Adds all 3 as idea nodes to canvas
3. Chat: "Here are 3 ideas. They're on your canvas — which one? Say 1, 2, or 3 (or redirect me)."
4. Pauses. User picks.
5. Builds selected idea → adds script draft to canvas
6. Chat: "Draft is on your canvas. Should I save it to your scripts library?"
7. Pauses. User confirms.
8. Saves.

### ≡ Plan Mode
1. Loads context, generates 3 ideas
2. Adds 3 idea nodes + a plan note to canvas: "Step 1: [idea selected]. Step 2: framework. Step 3: build. Step 4: save."
3. Chat: "Plan is on your canvas. Approve to execute."
4. Pauses. User approves.
5. Executes the full plan.
6. Pauses before saving. User approves save.

---

## Canvas Session Structure

Each script build session populates the canvas in this order (left to right):

```
[Onboarding ref] → [VideoNode + transcript] → [Research Note] → [Idea Node(s)] → [Script Draft]
```

For batch builds (20 scripts), each script gets its own row of nodes. The canvas accumulates all research — user can review any reference video, any idea, any draft.

---

## Updated System Prompt Rules

Rule 18 (script creation) becomes:

1. Check strategy context (already in system prompt) — determine content type needed
2. Call `find_viral_videos` → call `add_video_to_canvas` (video node appears with transcript loading)
3. Once transcript available — call `add_research_note_to_canvas` with hook analysis
4. Generate winning ideas (1 in Auto, 3 in Ask/Plan) — call `add_idea_nodes_to_canvas`
5. In Ask/Plan: pause for idea selection. In Auto: proceed with best idea.
6. Select framework based on content type + chosen idea category
7. Build script lines using idea + framework — call `add_script_draft_to_canvas`
8. In Ask/Plan: pause for draft review. In Auto: proceed.
9. Call `save_script_from_canvas` — In Ask/Plan: after confirmation. In Auto: immediately.
10. Navigate to canvas to show the user the finished work.

---

## What Does NOT Change

- The existing `create_script` database logic — `save_script_from_canvas` calls it internally
- The VideoNode component — it already supports transcription
- The `canvas_states` table — nodes are added via the existing upsert pattern
- The 4 existing companion-chat tools (create_canvas_note, find_viral_videos, get_hooks, create_script remain but are now called internally by the new flow)

---

## Out of Scope

- Real-time streaming of script lines to canvas (script draft appears as a complete node, not line by line)
- Multi-user canvas collaboration during Mario's build
- Automatic scheduling of the finished script (user triggers that separately)
- Video analysis beyond audio transcription (no visual frame analysis)
