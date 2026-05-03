# Mario × Super Canvas Script Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Mario 5 new canvas tools so he builds scripts visually on the Super Canvas — viral video node, research note, idea nodes (1 in Auto, 3 in Ask/Plan), script draft, and save — instead of outputting everything in chat.

**Architecture:** All changes are in `supabase/functions/companion-chat/index.ts`. Five new tool schemas are added to the TOOLS array. Five new tool handlers are added to the tool-execution loop. System prompt Rule 18 is rewritten to enforce the canvas-first workflow. No frontend changes needed — VideoNode, TextNoteNode, and ResearchNoteNode already exist on the canvas and render whatever data is written to `canvas_states`.

**Tech Stack:** Deno edge function, Supabase `canvas_states` table (JSONB nodes array), Anthropic Claude (companion-chat), existing VideoNode/TextNoteNode node types.

---

## Context for agentic workers

**The codebase:** Connecta Creators — a social media agency platform. `/Users/admin/Documents/connectacreators`

**The file you're editing:** `supabase/functions/companion-chat/index.ts` — a large Deno edge function (~940 lines) that powers Mario, an AI companion. It has a TOOLS array (schema definitions), a tool-execution loop (handlers), and a system prompt.

**How canvas nodes work:** The `canvas_states` table has a `nodes` JSONB column (array of node objects). Each node has `{ id, type, position: {x, y}, data: {...} }`. To add a node, fetch the active canvas state for the client, append the new node, and upsert. The existing `create_canvas_note` handler (around line 696) shows the exact pattern to follow.

**Node types you'll use:**
- `videoNode` — data: `{ url, caption, channel_username, videoTitle, videoLabel }`. When `url` is set on creation, the node auto-transcribes when the canvas opens (client-side, no action needed from the edge function).
- `textNoteNode` — data: `{ noteText, noteHtml }`. Used for research notes, idea nodes, and script drafts.

**How nodes are positioned:** Use this layout per script session (one row per script in batch):
```
row_y = (count of existing videoNodes) * 700
VideoNode:    x=50,   y=row_y, width=280, height=350
ResearchNote: x=370,  y=row_y, width=280, height=220
IdeaNode 1:   x=680,  y=row_y, width=260, height=180
IdeaNode 2:   x=680,  y=row_y+200, width=260, height=180
IdeaNode 3:   x=680,  y=row_y+400, width=260, height=180
ScriptDraft:  x=980,  y=row_y, width=320, height=500
```

**How to find active canvas for a client:**
```typescript
const { data: canvasState } = await adminClient
  .from("canvas_states")
  .select("id, nodes")
  .eq("client_id", targetClient.id)
  .eq("is_active", true)
  .limit(1)
  .maybeSingle();
```
If `canvasState` is null, return an error: "No active canvas. Have the user open Super Canvas first."

**Row index for positioning:**
```typescript
const existingNodes = Array.isArray(canvasState.nodes) ? canvasState.nodes : [];
const videoNodeCount = existingNodes.filter((n: any) => n.type === "videoNode").length;
const rowY = videoNodeCount * 700;
```

---

## File Map

| File | Action | What changes |
|---|---|---|
| `supabase/functions/companion-chat/index.ts` | Modify | Add 5 tool schemas to TOOLS array; add 5 handlers to tool-execution loop; rewrite Rule 18 in system prompt |

---

## Task 1: Add 5 new tool schemas to the TOOLS array

**Files:**
- Modify: `supabase/functions/companion-chat/index.ts` (TOOLS array, lines ~10-231)

- [ ] **Step 1: Find the end of the TOOLS array**

Open `supabase/functions/companion-chat/index.ts`. The TOOLS array ends around line 231 with the closing `];`. Find the `respond_to_user` tool — it's the last tool. You'll insert the 5 new tools before the closing `];`.

- [ ] **Step 2: Insert the 5 new tool schemas**

Find the line `];` that closes the TOOLS array (after `respond_to_user`). Insert these 5 schemas before it:

```typescript
  {
    name: "add_video_to_canvas",
    description: "Add a viral reference video as a VideoNode on the client's Super Canvas. The node will auto-transcribe when the user opens the canvas. Call this immediately after find_viral_videos to place the reference video visibly on the canvas. Always call this BEFORE add_research_note_to_canvas.",
    input_schema: {
      type: "object",
      properties: {
        client_name: { type: "string", description: "The client's name" },
        video_url: { type: "string", description: "The full URL of the viral video" },
        video_title: { type: "string", description: "Title or hook of the video" },
        channel_username: { type: "string", description: "The creator's username (e.g. @victorheras)" },
        reason: { type: "string", description: "One sentence: why this video was chosen as inspiration" },
      },
      required: ["client_name", "video_url", "video_title", "reason"],
    },
  },
  {
    name: "add_research_note_to_canvas",
    description: "Add a research note to the canvas analyzing the viral video. Call this after add_video_to_canvas. Use the find_viral_videos caption and your knowledge of hook patterns to analyze the video structure.",
    input_schema: {
      type: "object",
      properties: {
        client_name: { type: "string", description: "The client's name" },
        hook_type: { type: "string", description: "The hook category: storytelling, educational, comparison, authority, pattern_interrupt, or curiosity_gap" },
        hook_text: { type: "string", description: "The actual hook (first line of the video based on caption/title)" },
        why_it_works: { type: "string", description: "2-3 sentences: why this video performed. Be specific about the hook mechanism, not generic." },
        how_to_adapt: { type: "string", description: "1 sentence: how to apply this structure to the client's specific story and offer" },
      },
      required: ["client_name", "hook_type", "hook_text", "why_it_works", "how_to_adapt"],
    },
  },
  {
    name: "add_idea_nodes_to_canvas",
    description: "Add winning idea nodes to the canvas. In Auto mode: call with 1 idea (your best pick). In Ask or Plan mode: call with 3 ideas across different categories so the user can pick. Each idea is the WHAT — the hook premise tailored to this client's story and audience.",
    input_schema: {
      type: "object",
      properties: {
        client_name: { type: "string", description: "The client's name" },
        ideas: {
          type: "array",
          description: "1 idea in Auto mode, 3 ideas in Ask/Plan mode. Each across a different category.",
          items: {
            type: "object",
            properties: {
              number: { type: "number", description: "1, 2, or 3" },
              category: { type: "string", description: "storytelling | educational | comparison | authority | pattern_interrupt | curiosity_gap" },
              hook_sentence: { type: "string", description: "The exact first line of the video — specific, not generic. Uses the client's real numbers/story." },
              framework: { type: "string", description: "The script structure: e.g. 'vulnerability open → 3 moments → turning point → ManyChat CTA'" },
              why_it_works: { type: "string", description: "One sentence: why this idea will stop the scroll for the target audience" },
            },
            required: ["number", "category", "hook_sentence", "framework", "why_it_works"],
          },
        },
      },
      required: ["client_name", "ideas"],
    },
  },
  {
    name: "add_script_draft_to_canvas",
    description: "Add the full script draft as a node on the canvas. The draft is the winning idea plugged into the framework — every line written. Call this after the idea is selected (either you chose it in Auto mode, or the user picked one in Ask/Plan mode). Do NOT call save_script_from_canvas yet.",
    input_schema: {
      type: "object",
      properties: {
        client_name: { type: "string", description: "The client's name" },
        title: { type: "string", description: "The winning idea / hook title" },
        category: { type: "string", description: "The idea category used" },
        framework: { type: "string", description: "The framework applied" },
        hook: { type: "string", description: "The hook line(s)" },
        body: { type: "string", description: "The full body of the script, each line on a new line" },
        cta: { type: "string", description: "The call to action" },
      },
      required: ["client_name", "title", "category", "framework", "hook", "body", "cta"],
    },
  },
  {
    name: "save_script_from_canvas",
    description: "Save the canvas script draft to the scripts library. In Auto mode call this immediately after add_script_draft_to_canvas. In Ask mode only call this after the user confirms ('yes', 'save it', 'looks good'). In Plan mode only after explicit approval.",
    input_schema: {
      type: "object",
      properties: {
        client_name: { type: "string", description: "The client's name" },
        title: { type: "string", description: "The script title / winning idea" },
        hook: { type: "string", description: "The hook line(s)" },
        body: { type: "string", description: "The body lines, each on a new line" },
        cta: { type: "string", description: "The call to action" },
        category: { type: "string", description: "The idea category" },
        framework: { type: "string", description: "The framework used" },
      },
      required: ["client_name", "title", "hook", "body", "cta"],
    },
  },
```

- [ ] **Step 3: Verify the TOOLS array still closes correctly**

The file should still have `];` after your insertions. Run:
```bash
grep -n "^];" supabase/functions/companion-chat/index.ts
```
Expected: one line showing `];` — the TOOLS array closing bracket.

- [ ] **Step 4: Commit**
```bash
git add supabase/functions/companion-chat/index.ts
git commit -m "feat(mario): add 5 canvas script builder tool schemas to TOOLS array"
```

---

## Task 2: Add handlers for `add_video_to_canvas` and `add_research_note_to_canvas`

**Files:**
- Modify: `supabase/functions/companion-chat/index.ts` (tool-execution loop, around line 696 where `create_canvas_note` handler is)

The tool-execution loop processes `toolUseBlocks` in a `for` loop. Each `if (block.name === "xxx")` block handles one tool. Find the `create_canvas_note` handler block and add the new handlers after it.

- [ ] **Step 1: Find the insertion point**

Search for:
```
if (block.name === "create_canvas_note") {
```
The new handlers go AFTER the closing `}` of the `create_canvas_note` block but BEFORE the next `if (block.name === "get_client_strategy")`.

- [ ] **Step 2: Add `add_video_to_canvas` handler**

```typescript
        if (block.name === "add_video_to_canvas") {
          const { client_name, video_url, video_title, channel_username, reason } = block.input;
          const { data: targetClient } = await adminClient
            .from("clients").select("id, name").ilike("name", "%" + client_name + "%").limit(1).maybeSingle();
          if (!targetClient) {
            toolResults.push({ type: "tool_result", tool_use_id: block.id, content: "Client not found: " + client_name });
          } else {
            const { data: canvasState } = await adminClient
              .from("canvas_states").select("id, nodes").eq("client_id", targetClient.id).eq("is_active", true).limit(1).maybeSingle();
            if (!canvasState) {
              toolResults.push({ type: "tool_result", tool_use_id: block.id, content: "No active canvas for " + targetClient.name + ". Have the user open Super Canvas first." });
            } else {
              const existingNodes = Array.isArray(canvasState.nodes) ? canvasState.nodes : [];
              const videoNodeCount = existingNodes.filter((n: any) => n.type === "videoNode").length;
              const rowY = videoNodeCount * 700;
              const nodeId = `videoNode_mario_${Date.now()}`;
              const newNode = {
                id: nodeId,
                type: "videoNode",
                position: { x: 50, y: rowY },
                data: {
                  url: video_url,
                  videoTitle: video_title,
                  videoLabel: video_title,
                  channel_username: channel_username || "",
                  caption: reason,
                },
              };
              await adminClient.from("canvas_states").update({ nodes: [...existingNodes, newNode] }).eq("id", canvasState.id);
              actions.push({ type: "navigate", path: "/scripts?view=canvas" });
              toolResults.push({ type: "tool_result", tool_use_id: block.id, content: `Video node added to canvas for ${targetClient.name}: "${video_title}". The node will auto-transcribe when the canvas opens. Row position: ${rowY}.` });
            }
          }
        }
```

- [ ] **Step 3: Add `add_research_note_to_canvas` handler**

```typescript
        if (block.name === "add_research_note_to_canvas") {
          const { client_name, hook_type, hook_text, why_it_works, how_to_adapt } = block.input;
          const { data: targetClient } = await adminClient
            .from("clients").select("id, name").ilike("name", "%" + client_name + "%").limit(1).maybeSingle();
          if (!targetClient) {
            toolResults.push({ type: "tool_result", tool_use_id: block.id, content: "Client not found: " + client_name });
          } else {
            const { data: canvasState } = await adminClient
              .from("canvas_states").select("id, nodes").eq("client_id", targetClient.id).eq("is_active", true).limit(1).maybeSingle();
            if (!canvasState) {
              toolResults.push({ type: "tool_result", tool_use_id: block.id, content: "No active canvas for " + targetClient.name + "." });
            } else {
              const existingNodes = Array.isArray(canvasState.nodes) ? canvasState.nodes : [];
              const videoNodeCount = existingNodes.filter((n: any) => n.type === "videoNode").length;
              const rowY = Math.max(0, videoNodeCount - 1) * 700;
              const nodeId = `textNoteNode_research_${Date.now()}`;
              const noteText = `HOOK TYPE: ${hook_type.toUpperCase()}\n\nHook: "${hook_text}"\n\nWhy it works: ${why_it_works}\n\nHow to adapt: ${how_to_adapt}`;
              const newNode = {
                id: nodeId,
                type: "textNoteNode",
                position: { x: 370, y: rowY },
                data: { noteText, noteHtml: `<p><strong>HOOK TYPE: ${hook_type.toUpperCase()}</strong></p><p>Hook: "${hook_text}"</p><p>Why it works: ${why_it_works}</p><p>How to adapt: ${how_to_adapt}</p>` },
              };
              await adminClient.from("canvas_states").update({ nodes: [...existingNodes, newNode] }).eq("id", canvasState.id);
              toolResults.push({ type: "tool_result", tool_use_id: block.id, content: `Research note added to ${targetClient.name}'s canvas.` });
            }
          }
        }
```

- [ ] **Step 4: Commit**
```bash
git add supabase/functions/companion-chat/index.ts
git commit -m "feat(mario): add add_video_to_canvas and add_research_note_to_canvas handlers"
```

---

## Task 3: Add handlers for `add_idea_nodes_to_canvas`, `add_script_draft_to_canvas`, `save_script_from_canvas`

**Files:**
- Modify: `supabase/functions/companion-chat/index.ts` (same tool-execution loop)

Add these handlers after the `add_research_note_to_canvas` block from Task 2.

- [ ] **Step 1: Add `add_idea_nodes_to_canvas` handler**

```typescript
        if (block.name === "add_idea_nodes_to_canvas") {
          const { client_name, ideas } = block.input;
          const { data: targetClient } = await adminClient
            .from("clients").select("id, name").ilike("name", "%" + client_name + "%").limit(1).maybeSingle();
          if (!targetClient) {
            toolResults.push({ type: "tool_result", tool_use_id: block.id, content: "Client not found: " + client_name });
          } else {
            const { data: canvasState } = await adminClient
              .from("canvas_states").select("id, nodes").eq("client_id", targetClient.id).eq("is_active", true).limit(1).maybeSingle();
            if (!canvasState) {
              toolResults.push({ type: "tool_result", tool_use_id: block.id, content: "No active canvas for " + targetClient.name + "." });
            } else {
              const existingNodes = Array.isArray(canvasState.nodes) ? canvasState.nodes : [];
              const videoNodeCount = existingNodes.filter((n: any) => n.type === "videoNode").length;
              const rowY = Math.max(0, videoNodeCount - 1) * 700;
              const ideaNodes = (ideas as any[]).map((idea, i) => {
                const nodeId = `textNoteNode_idea_${Date.now()}_${i}`;
                const noteText = `IDEA ${idea.number} — ${idea.category.toUpperCase()}\n\n"${idea.hook_sentence}"\n\nFramework: ${idea.framework}\n\nWhy it works: ${idea.why_it_works}`;
                return {
                  id: nodeId,
                  type: "textNoteNode",
                  position: { x: 680, y: rowY + i * 210 },
                  data: {
                    noteText,
                    noteHtml: `<p><strong>IDEA ${idea.number} — ${idea.category.toUpperCase()}</strong></p><p>"${idea.hook_sentence}"</p><p>Framework: ${idea.framework}</p><p>Why it works: ${idea.why_it_works}</p>`,
                  },
                };
              });
              await adminClient.from("canvas_states").update({ nodes: [...existingNodes, ...ideaNodes] }).eq("id", canvasState.id);
              const summary = (ideas as any[]).map((idea: any) => `Idea ${idea.number} (${idea.category}): "${idea.hook_sentence}"`).join("\n");
              toolResults.push({ type: "tool_result", tool_use_id: block.id, content: `${ideas.length} idea node(s) added to canvas:\n${summary}` });
            }
          }
        }
```

- [ ] **Step 2: Add `add_script_draft_to_canvas` handler**

```typescript
        if (block.name === "add_script_draft_to_canvas") {
          const { client_name, title, category, framework, hook, body, cta } = block.input;
          const { data: targetClient } = await adminClient
            .from("clients").select("id, name").ilike("name", "%" + client_name + "%").limit(1).maybeSingle();
          if (!targetClient) {
            toolResults.push({ type: "tool_result", tool_use_id: block.id, content: "Client not found: " + client_name });
          } else {
            const { data: canvasState } = await adminClient
              .from("canvas_states").select("id, nodes").eq("client_id", targetClient.id).eq("is_active", true).limit(1).maybeSingle();
            if (!canvasState) {
              toolResults.push({ type: "tool_result", tool_use_id: block.id, content: "No active canvas for " + targetClient.name + "." });
            } else {
              const existingNodes = Array.isArray(canvasState.nodes) ? canvasState.nodes : [];
              const videoNodeCount = existingNodes.filter((n: any) => n.type === "videoNode").length;
              const rowY = Math.max(0, videoNodeCount - 1) * 700;
              const nodeId = `textNoteNode_script_${Date.now()}`;
              const noteText = `SCRIPT DRAFT — ${category.toUpperCase()}\nFramework: ${framework}\n\nHOOK:\n${hook}\n\nBODY:\n${body}\n\nCTA:\n${cta}`;
              const newNode = {
                id: nodeId,
                type: "textNoteNode",
                position: { x: 980, y: rowY },
                data: {
                  noteText,
                  noteHtml: `<p><strong>SCRIPT DRAFT — ${category.toUpperCase()}</strong></p><p>Framework: ${framework}</p><hr><p><strong>HOOK:</strong></p><p>${hook.replace(/\n/g, "<br>")}</p><p><strong>BODY:</strong></p><p>${body.replace(/\n/g, "<br>")}</p><p><strong>CTA:</strong></p><p>${cta}</p>`,
                  width: 320,
                },
              };
              await adminClient.from("canvas_states").update({ nodes: [...existingNodes, newNode] }).eq("id", canvasState.id);
              toolResults.push({ type: "tool_result", tool_use_id: block.id, content: `Script draft added to ${targetClient.name}'s canvas: "${title}". The user can edit it directly on the canvas.` });
            }
          }
        }
```

- [ ] **Step 3: Add `save_script_from_canvas` handler**

This reuses the `create_script` logic pattern. Find the `create_script` handler (around line 486) and model the insert after it.

```typescript
        if (block.name === "save_script_from_canvas") {
          const { client_name, title, hook, body, cta, category, framework } = block.input;
          const { data: targetClient } = await adminClient
            .from("clients").select("id, name").ilike("name", "%" + client_name + "%").limit(1).maybeSingle();
          if (!targetClient) {
            toolResults.push({ type: "tool_result", tool_use_id: block.id, content: "Client not found: " + client_name });
          } else {
            const rawContent = [hook, body, cta].join("\n");
            const { data: script, error: scriptErr } = await adminClient
              .from("scripts")
              .insert({
                client_id: targetClient.id,
                title,
                idea_ganadora: title,
                raw_content: rawContent,
                formato: "talking_head",
                status: "complete",
              })
              .select("id")
              .single();
            if (scriptErr || !script) {
              toolResults.push({ type: "tool_result", tool_use_id: block.id, content: "Error saving script: " + (scriptErr?.message || "unknown") });
            } else {
              // Insert script lines
              const lineRows = [
                { script_id: script.id, line_number: 1, line_type: "hook", section: "hook", text: hook },
                ...body.split("\n").filter(Boolean).map((line: string, i: number) => ({
                  script_id: script.id, line_number: i + 2, line_type: "body", section: "body", text: line,
                })),
                { script_id: script.id, line_number: body.split("\n").filter(Boolean).length + 2, line_type: "cta", section: "cta", text: cta },
              ];
              await adminClient.from("script_lines").insert(lineRows);
              actions.push({ type: "navigate", path: `/clients/${targetClient.id}/scripts` });
              toolResults.push({ type: "tool_result", tool_use_id: block.id, content: `Script "${title}" saved to ${targetClient.name}'s scripts library. Navigating to scripts page.` });
            }
          }
        }
```

- [ ] **Step 4: Commit**
```bash
git add supabase/functions/companion-chat/index.ts
git commit -m "feat(mario): add idea nodes, script draft, and save_script_from_canvas handlers"
```

---

## Task 4: Rewrite Rule 18 in the system prompt

**Files:**
- Modify: `supabase/functions/companion-chat/index.ts` (system prompt section, around line 400-415)

- [ ] **Step 1: Find the current Rule 18**

Search for:
```
18. SCRIPT CREATION WORKFLOW
```
This is in the system prompt string. Replace the entire Rule 18 block with the new version.

- [ ] **Step 2: Replace Rule 18**

Find the current Rule 18 text block (from `18. SCRIPT CREATION WORKFLOW` to the line ending `NEVER skip Step 2-4...`) and replace it entirely with:

```
18. SCRIPT CREATION WORKFLOW — Follow this EXACTLY. Never shortcut. Never navigate to /scripts immediately.

STEP 1 — DETERMINE CONTENT TYPE: Read the CLIENT STRATEGY already in your context. What type of content is most needed right now? (reach / trust / convert). The one farthest from its monthly goal is the priority. State it: "You need reach content — here's what I'm building."

STEP 2 — FIND VIRAL REFERENCE: Call find_viral_videos with the client's niche + the content type. Pick the video with the highest views that matches the content type.

STEP 3 — ADD VIDEO TO CANVAS: Immediately call add_video_to_canvas with the video URL, title, and creator. Also call respond_to_user to tell the user what reference you found and why. Do NOT navigate or do anything else yet.

STEP 4 — ANALYZE THE REFERENCE: Call add_research_note_to_canvas. Use the video caption/title from find_viral_videos to identify the hook type, why it worked, and how to adapt it. Be specific — name the actual hook mechanism (vulnerability open, curiosity gap, etc.), not generic observations.

STEP 5 — GENERATE WINNING IDEAS: The winning idea = the viral hook structure + the client's specific story/credentials + what the audience actually needs (from audience alignment gap in strategy). Ideas must NOT be generic — use real numbers from onboarding (e.g. "250M views", "failed 3 businesses", "D2D sales").
  - In AUTO mode: call add_idea_nodes_to_canvas with 1 idea (your best pick). Tell the user what you chose and why. Proceed immediately.
  - In ASK mode: call add_idea_nodes_to_canvas with 3 ideas across DIFFERENT categories (e.g. one storytelling, one authority, one comparison). Tell the user: "3 ideas are on your canvas. Which one — say 1, 2, or 3?" Then STOP and wait.
  - In PLAN mode: call add_idea_nodes_to_canvas with 3 ideas. Tell the user: "3 ideas on canvas. Approve one to proceed." Then STOP and wait.

STEP 6 — BUILD SCRIPT DRAFT: Once the idea is confirmed (immediately in Auto, after user pick in Ask/Plan), call add_script_draft_to_canvas with the FULL script — hook lines, all body lines, CTA. The idea is the WHAT. The framework determines the HOW (structure). Plug the winning idea into the framework and write every single line.

Frameworks by content type:
  Reach + Storytelling: Hook = personal failure + specific detail | Body = 3 moments → turning point | CTA = ManyChat keyword
  Reach + Pattern Interrupt: Hook = unexpected/controversial claim | Body = proof → expand | CTA = follow
  Trust + Educational: Hook = counterintuitive claim | Body = teach → prove with result | CTA = follow/part 2
  Trust + Authority: Hook = credential + surprise | Body = method → proof | CTA = link in bio
  Convert + Problem-Solution: Hook = name the exact pain | Body = why others fail → what works | CTA = DM offer
  Convert + Comparison: Hook = wrong vs right | Body = side by side → verdict | CTA = ManyChat/DM

STEP 7 — SAVE (mode-dependent):
  - AUTO: Call save_script_from_canvas immediately after the draft. No confirmation needed.
  - ASK: Tell the user "Draft is on your canvas. Should I save it?" Wait for confirmation. Then call save_script_from_canvas.
  - PLAN: Tell the user "Draft is on your canvas. Approve to save." Wait. Then call save_script_from_canvas.

CRITICAL: NEVER call navigate_to_page("/scripts") as your first action when asked to build a script. Always do steps 2-4 first. ALWAYS call respond_to_user alongside your canvas tools so the user knows what's happening.

BATCH (Auto mode only): "Build 20 scripts" → loop steps 2-7 twenty times. Each loop picks a different viral reference and different idea category. Save each. Report total at the end.
```

- [ ] **Step 3: Remove the old duplicate rule**

After replacing Rule 18, search for any remaining references to the old script creation text:
```bash
grep -n "NEVER skip Step 2-4\|Call get_hooks to find the best hook structure\|STEP 2 — FIND VIRAL INSPIRATION" supabase/functions/companion-chat/index.ts
```
Expected: no matches. If any remain, delete those lines.

- [ ] **Step 4: Commit**
```bash
git add supabase/functions/companion-chat/index.ts
git commit -m "feat(mario): rewrite Rule 18 — canvas-first script workflow with mode-dependent idea generation"
```

---

## Task 5: Deploy and verify

**Files:** None modified — this is deployment and smoke testing.

- [ ] **Step 1: Deploy companion-chat**
```bash
npx supabase functions deploy companion-chat --no-verify-jwt 2>&1 | tail -3
```
Expected: `Deployed Functions on project hxojqrilwhhrvloiwmfo: companion-chat`

- [ ] **Step 2: Verify tool schemas are readable**

Run a quick parse check — the Deno file should have no obvious syntax errors:
```bash
npx supabase functions deploy companion-chat --no-verify-jwt 2>&1 | grep -i "error\|Error"
```
Expected: no error lines.

- [ ] **Step 3: Smoke test in the app**

1. Open the app at `connecta.so/ai` as Roger Jimenez
2. Make sure Mario is in **Ask mode**
3. Type: "lets build a script"
4. Expected sequence in chat:
   - Mario says what content type is needed (e.g. "You need reach content")
   - Mario announces the viral reference it found
   - Canvas automatically opens (navigate action fires)
   - A VideoNode appears on the canvas
   - A research note TextNoteNode appears
   - Three idea TextNoteNodes appear
   - Mario asks: "3 ideas on your canvas. Which one — 1, 2, or 3?"
5. Reply "1"
6. Expected: script draft TextNoteNode appears on canvas. Mario asks to save.
7. Reply "yes"
8. Expected: script appears in scripts library. Mario navigates to scripts.

- [ ] **Step 4: Smoke test Auto mode**

1. Switch Mario to **Auto mode**
2. Type: "build a script"
3. Expected: Mario announces content type → video node → research note → 1 idea node → script draft → saved → navigates to scripts. All without pausing.

- [ ] **Step 5: Final commit and push**
```bash
git add supabase/functions/companion-chat/index.ts
git commit -m "deploy: mario canvas script builder — 5 tools, canvas workflow, mode-dependent ideas"
git push origin main
```

---

## Self-Review

**Spec coverage:**
- ✅ `add_video_to_canvas` — Task 1 schema + Task 2 handler. Adds VideoNode with URL, auto-transcribes client-side.
- ✅ `add_research_note_to_canvas` — Task 1 schema + Task 2 handler. TextNoteNode with hook analysis.
- ✅ `add_idea_nodes_to_canvas` — Task 1 schema + Task 3 handler. 1 in Auto, 3 in Ask/Plan.
- ✅ `add_script_draft_to_canvas` — Task 1 schema + Task 3 handler. Full script as TextNoteNode.
- ✅ `save_script_from_canvas` — Task 1 schema + Task 3 handler. Inserts to scripts + script_lines.
- ✅ Rule 18 rewrite — Task 4. Enforces canvas-first, mode-dependent pauses, batch support.
- ✅ 6 idea categories — baked into Rule 18's synthesis instructions and framework table.
- ✅ Mode behavior — Rule 18 explicitly handles Auto/Ask/Plan at steps 5 and 7.
- ✅ Row positioning for batch — handlers compute `rowY = videoNodeCount * 700`.
- ✅ No frontend changes needed — VideoNode/TextNoteNode already render from canvas_states data.

**Placeholder scan:** No TBDs. All code blocks complete. All line references are approximate but directional.

**Type consistency:** `client_name` used consistently across all 5 tool schemas and handlers. `canvasState.nodes` pattern matches existing `create_canvas_note` handler. `targetClient.id` used for all DB queries.
