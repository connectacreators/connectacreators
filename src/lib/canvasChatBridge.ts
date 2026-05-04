// src/lib/canvasChatBridge.ts
//
// Read-path bridge: canvas chat surfaces (CanvasAIPanel + FullscreenAIView)
// load messages from `assistant_messages` so they share the same conversation
// as the floating Robby drawer / /ai page.
//
// Writes still go to `canvas_ai_chats.messages` (legacy JSONB) — the
// edge-function dual-write keeps both tables in sync. Phase B.3 keeps
// writes on the legacy path to preserve image/script fidelity until the
// MessageContent union grows variants for those.
//
// `assistant_threads.id == canvas_ai_chats.id` (set by Phase A backfill),
// so the chat-list query still uses canvas_ai_chats but the message body
// query uses assistant_messages.

import { supabase } from "@/integrations/supabase/client";
import type { AssistantMessage } from "@/components/canvas/CanvasAIPanel.shared";

const MAX_LOAD = 200;

type AssistantMessageRow = {
  role: "user" | "assistant" | "tool";
  content: unknown;
  created_at: string;
};

function rowToCanvasMessage(row: AssistantMessageRow): AssistantMessage | null {
  if (row.role !== "user" && row.role !== "assistant") return null;
  const c: any = row.content;
  let content = "";
  if (typeof c === "string") {
    content = c;
  } else if (c && typeof c === "object") {
    if (typeof c.text === "string") content = c.text;
    else if (typeof c.content === "string") content = c.content;
    else content = JSON.stringify(c);
  }
  return { role: row.role, content };
}

/**
 * Load a canvas chat's message body from `assistant_messages`. Falls back to
 * `canvas_ai_chats.messages` JSONB if the new table has no rows for the
 * thread (defensive — the Phase A backfill closed this gap, but the fallback
 * is here in case any thread predates dual-write coverage).
 */
export async function loadCanvasChatMessages(
  threadId: string,
): Promise<AssistantMessage[]> {
  const { data, error } = await supabase
    .from("assistant_messages")
    .select("role, content, created_at")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true })
    .limit(MAX_LOAD);

  if (!error && data && data.length > 0) {
    return (data as AssistantMessageRow[])
      .map(rowToCanvasMessage)
      .filter((m): m is AssistantMessage => m !== null);
  }

  // Fallback: read the legacy JSONB. This preserves rich fields (image_b64,
  // script_data) that the new content shape doesn't yet carry.
  const { data: legacy } = await supabase
    .from("canvas_ai_chats")
    .select("messages")
    .eq("id", threadId)
    .maybeSingle();
  const arr = (legacy?.messages as any) || [];
  return Array.isArray(arr) ? arr : [];
}
