// supabase/functions/_shared/build-session/service.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { rowToBuildSession } from "./service.ts";

function baseRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "b1",
    user_id: "u1",
    client_id: "c1",
    thread_id: "t1",
    canvas_state_id: null,
    status: "running",
    current_state: "INIT",
    ideas: [],
    current_idea_index: 0,
    selected_ideas: [],
    current_framework_video_id: null,
    current_script_draft: null,
    current_script_id: null,
    cached_canvas_context: null,
    cached_canvas_context_at: null,
    auto_pilot: false,
    error_message: null,
    token_usage: {},
    created_at: "2026-05-04T10:00:00Z",
    updated_at: "2026-05-04T10:00:00Z",
    last_activity_at: "2026-05-04T10:00:00Z",
    ...overrides,
  };
}

Deno.test("rowToBuildSession — maps DB row to typed BuildSession", () => {
  const session = rowToBuildSession(
    baseRow({ canvas_state_id: "cs1" }),
  );
  assertEquals(session.id, "b1");
  assertEquals(session.userId, "u1");
  assertEquals(session.clientId, "c1");
  assertEquals(session.threadId, "t1");
  assertEquals(session.canvasStateId, "cs1");
  assertEquals(session.status, "running");
  assertEquals(session.currentState, "INIT");
  assertEquals(session.autoPilot, false);
  assertEquals(session.ideas, []);
});

Deno.test("rowToBuildSession — preserves status enum values", () => {
  const statuses = ["running","awaiting_user","paused","completed","cancelled","error"] as const;
  for (const s of statuses) {
    const row = baseRow({ status: s });
    assertEquals(rowToBuildSession(row).status, s);
  }
});

Deno.test("rowToBuildSession — null canvas_state_id stays null", () => {
  const session = rowToBuildSession(baseRow());
  assertEquals(session.canvasStateId, null);
});
