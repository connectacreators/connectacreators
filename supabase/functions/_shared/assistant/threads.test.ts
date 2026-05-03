// supabase/functions/_shared/assistant/threads.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { rowToThreadMeta, rowToMessage } from "./threads.ts";

Deno.test("rowToThreadMeta — maps DB row to ThreadMeta", () => {
  const row = {
    id: "t1",
    user_id: "u1",
    client_id: "c1",
    canvas_node_id: "node-7",
    origin: "canvas",
    title: "Launch script",
    message_count: 24,
    last_message_at: "2026-05-03T10:00:00Z",
    created_at: "2026-05-01T10:00:00Z",
    updated_at: "2026-05-03T10:00:00Z",
  };
  const meta = rowToThreadMeta(row);
  assertEquals(meta.id, "t1");
  assertEquals(meta.userId, "u1");
  assertEquals(meta.clientId, "c1");
  assertEquals(meta.canvasNodeId, "node-7");
  assertEquals(meta.origin, "canvas");
  assertEquals(meta.title, "Launch script");
  assertEquals(meta.messageCount, 24);
});

Deno.test("rowToThreadMeta — handles null client_id and canvas_node_id (drawer thread)", () => {
  const row = {
    id: "t2",
    user_id: "u1",
    client_id: null,
    canvas_node_id: null,
    origin: "drawer",
    title: null,
    message_count: 0,
    last_message_at: null,
    created_at: "2026-05-03T10:00:00Z",
    updated_at: "2026-05-03T10:00:00Z",
  };
  const meta = rowToThreadMeta(row);
  assertEquals(meta.clientId, null);
  assertEquals(meta.canvasNodeId, null);
  assertEquals(meta.origin, "drawer");
});

Deno.test("rowToMessage — preserves jsonb content as-is", () => {
  const row = {
    id: "m1",
    thread_id: "t1",
    role: "user",
    content: { type: "text", text: "hello" },
    model: null,
    created_at: "2026-05-03T10:00:00Z",
  };
  const msg = rowToMessage(row);
  assertEquals(msg.threadId, "t1");
  assertEquals(msg.role, "user");
  assertEquals(msg.content, { type: "text", text: "hello" });
});
