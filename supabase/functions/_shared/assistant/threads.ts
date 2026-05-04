// supabase/functions/_shared/assistant/threads.ts
import type {
  AssistantMessage,
  AssistantOrigin,
  AssistantRole,
  MessageContent,
  ThreadMeta,
} from "./types.ts";
import type { SupabaseClient } from "@supabase/supabase-js";

export function rowToThreadMeta(row: any): ThreadMeta {
  return {
    id: row.id,
    userId: row.user_id,
    clientId: row.client_id,
    canvasNodeId: row.canvas_node_id,
    origin: row.origin as AssistantOrigin,
    title: row.title,
    messageCount: row.message_count,
    lastMessageAt: row.last_message_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function rowToMessage(row: any): AssistantMessage {
  return {
    id: row.id,
    threadId: row.thread_id,
    role: row.role,
    content: row.content as MessageContent,
    model: row.model ?? undefined,
    createdAt: row.created_at,
  };
}

export interface CreateThreadParams {
  userId: string;
  clientId?: string | null;
  canvasNodeId?: string | null;
  origin: AssistantOrigin;
  title?: string;
}

export async function createThread(
  supabase: SupabaseClient,
  p: CreateThreadParams,
): Promise<ThreadMeta> {
  const { data, error } = await supabase
    .from("assistant_threads")
    .insert({
      user_id: p.userId,
      client_id: p.clientId ?? null,
      canvas_node_id: p.canvasNodeId ?? null,
      origin: p.origin,
      title: p.title ?? null,
    })
    .select()
    .single();
  if (error || !data) throw new Error(`createThread: ${error?.message ?? "no row returned"}`);
  return rowToThreadMeta(data);
}

export async function getThread(
  supabase: SupabaseClient,
  threadId: string,
): Promise<ThreadMeta | null> {
  const { data, error } = await supabase
    .from("assistant_threads")
    .select("*")
    .eq("id", threadId)
    .maybeSingle();
  if (error) throw new Error(`getThread: ${error.message}`);
  return data ? rowToThreadMeta(data) : null;
}

export async function listThreadsForClient(
  supabase: SupabaseClient,
  userId: string,
  clientId: string,
  limit = 50,
): Promise<ThreadMeta[]> {
  const { data, error } = await supabase
    .from("assistant_threads")
    .select("*")
    .eq("user_id", userId)
    .eq("client_id", clientId)
    .order("last_message_at", { ascending: false, nullsLast: true })
    .limit(limit);
  if (error) throw new Error(`listThreadsForClient: ${error.message}`);
  return (data ?? []).map(rowToThreadMeta);
}

export async function listAgencyThreads(
  supabase: SupabaseClient,
  userId: string,
  limit = 20,
): Promise<ThreadMeta[]> {
  const { data, error } = await supabase
    .from("assistant_threads")
    .select("*")
    .eq("user_id", userId)
    .is("client_id", null)
    .order("last_message_at", { ascending: false, nullsLast: true })
    .limit(limit);
  if (error) throw new Error(`listAgencyThreads: ${error.message}`);
  return (data ?? []).map(rowToThreadMeta);
}

export async function appendMessage(
  supabase: SupabaseClient,
  threadId: string,
  msg: { role: AssistantRole; content: MessageContent; model?: string },
): Promise<AssistantMessage> {
  const { data, error } = await supabase
    .from("assistant_messages")
    .insert({
      thread_id: threadId,
      role: msg.role,
      content: msg.content,
      model: msg.model ?? null,
    })
    .select()
    .single();
  if (error || !data) throw new Error(`appendMessage: ${error?.message ?? "no row"}`);
  return rowToMessage(data);
}

export async function loadMessages(
  supabase: SupabaseClient,
  threadId: string,
  limit = 100,
): Promise<AssistantMessage[]> {
  const { data, error } = await supabase
    .from("assistant_messages")
    .select("*")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error(`loadMessages: ${error.message}`);
  return (data ?? []).map(rowToMessage);
}
