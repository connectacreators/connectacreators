import { useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  type?: string;
  [key: string]: any;
}

interface UseRealtimeChatSyncOptions {
  /** Current active chat ID to watch for changes */
  chatId: string | null;
  /** Called when another tab broadcasts updated messages — receives the FULL array */
  onRemoteMessages: (messages: ChatMessage[]) => void;
  /** Called when another tab is streaming AI content (live typing) */
  onRemoteStreaming?: (content: string | null) => void;
  /** Stable identifier for the AI room (e.g. `${clientId}:${nodeId}`) used for cross-chat events
   *  like "active chat changed". Optional — when null/undefined, no room channel is opened. */
  roomId?: string | null;
  /** Called when another collaborator switches the active chat in the same room. */
  onRemoteActiveChat?: (chatId: string | null) => void;
}

// Get unique tab ID
function getTabId(): string {
  let id = sessionStorage.getItem("presence_tab_id");
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem("presence_tab_id", id);
  }
  return id;
}

/**
 * Broadcast-based live AI chat sync via Supabase Realtime channels.
 *
 * Flow:
 * - "messages-update": Full messages array broadcast when a message is added/completed
 * - "streaming": Live AI streaming content so other tabs see the typewriter effect
 *
 * The receiving tab REPLACES its messages state (not append) to stay perfectly in sync.
 */
export function useRealtimeChatSync({
  chatId,
  onRemoteMessages,
  onRemoteStreaming,
  roomId,
  onRemoteActiveChat,
}: UseRealtimeChatSyncOptions) {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const roomChannelRef = useRef<RealtimeChannel | null>(null);
  const tabId = useRef(getTabId());
  // Per-hook-instance source id — distinguishes the inline AI node from the fullscreen view
  // running in the same tab so the same-tab window-event bus doesn't loop back to the sender.
  const sourceId = useRef<string>(crypto.randomUUID());
  // Separate throttles per event type — sharing one ref let `broadcastStreaming` swallow a
  // following `broadcastMessages` (so the committed AI message never reached collaborators).
  const lastMessagesBroadcastAt = useRef(0);
  const lastStreamingBroadcastAt = useRef(0);

  // Keep callbacks fresh
  const onRemoteMessagesRef = useRef(onRemoteMessages);
  onRemoteMessagesRef.current = onRemoteMessages;
  const onRemoteStreamingRef = useRef(onRemoteStreaming);
  onRemoteStreamingRef.current = onRemoteStreaming;
  const onRemoteActiveChatRef = useRef(onRemoteActiveChat);
  onRemoteActiveChatRef.current = onRemoteActiveChat;

  useEffect(() => {
    if (!chatId) return;

    // Clean up previous channel
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    const channel = supabase
      .channel(`chat-broadcast:${chatId}`)
      .on("broadcast", { event: "messages-update" }, ({ payload }) => {
        if (payload.tabId === tabId.current) return;
        if (Array.isArray(payload.messages)) {
          onRemoteMessagesRef.current(payload.messages);
        }
      })
      .on("broadcast", { event: "streaming" }, ({ payload }) => {
        if (payload.tabId === tabId.current) return;
        onRemoteStreamingRef.current?.(payload.content);
      })
      .subscribe();

    channelRef.current = channel;

    // Same-tab event bus — Supabase realtime filters out same-tab events, so the inline AI
    // node and the fullscreen view (mounted simultaneously in one tab) need this to mirror
    // each other live. Filter by chatId match and skip events sourced by this hook instance.
    const onBusMessages = (e: Event) => {
      const ce = e as CustomEvent<{ chatId: string; sourceId: string; messages: ChatMessage[] }>;
      if (!ce.detail || ce.detail.sourceId === sourceId.current) return;
      if (ce.detail.chatId !== chatId) return;
      if (Array.isArray(ce.detail.messages)) onRemoteMessagesRef.current(ce.detail.messages);
    };
    const onBusStreaming = (e: Event) => {
      const ce = e as CustomEvent<{ chatId: string; sourceId: string; content: string | null }>;
      if (!ce.detail || ce.detail.sourceId === sourceId.current) return;
      if (ce.detail.chatId !== chatId) return;
      onRemoteStreamingRef.current?.(ce.detail.content);
    };
    window.addEventListener("canvas-ai-bus:messages", onBusMessages);
    window.addEventListener("canvas-ai-bus:streaming", onBusStreaming);

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
      window.removeEventListener("canvas-ai-bus:messages", onBusMessages);
      window.removeEventListener("canvas-ai-bus:streaming", onBusStreaming);
    };
  }, [chatId]);

  // Room-scoped channel for cross-chat events (e.g. active-chat-id sync) keyed by client+node.
  // Distinct from the chat-scoped channel above, which is keyed by chatId.
  useEffect(() => {
    if (!roomId) return;
    if (roomChannelRef.current) {
      supabase.removeChannel(roomChannelRef.current);
      roomChannelRef.current = null;
    }
    const room = supabase
      .channel(`chat-room:${roomId}`)
      .on("broadcast", { event: "active-chat" }, ({ payload }) => {
        if (payload.tabId === tabId.current) return;
        onRemoteActiveChatRef.current?.(payload.chatId ?? null);
      })
      .subscribe();
    roomChannelRef.current = room;

    // Same-tab event bus mirror — see explanation in chatId effect.
    const onBusActiveChat = (e: Event) => {
      const ce = e as CustomEvent<{ roomId: string; sourceId: string; chatId: string | null }>;
      if (!ce.detail || ce.detail.sourceId === sourceId.current) return;
      if (ce.detail.roomId !== roomId) return;
      onRemoteActiveChatRef.current?.(ce.detail.chatId);
    };
    window.addEventListener("canvas-ai-bus:active-chat", onBusActiveChat);

    return () => {
      supabase.removeChannel(room);
      roomChannelRef.current = null;
      window.removeEventListener("canvas-ai-bus:active-chat", onBusActiveChat);
    };
  }, [roomId]);

  /** Broadcast the full messages array to other tabs and same-tab consumers */
  const broadcastMessages = useCallback(
    (messages: ChatMessage[]) => {
      // Throttle to max 2 broadcasts per second to avoid flooding
      const now = Date.now();
      if (now - lastMessagesBroadcastAt.current < 500) return;
      lastMessagesBroadcastAt.current = now;

      // Strip heavy fields (images, script_data) to keep payload small
      const lightweight = messages.map(m => ({
        role: m.role,
        content: m.content,
        type: m.type,
        credits_used: m.credits_used,
      }));

      channelRef.current?.send({
        type: "broadcast",
        event: "messages-update",
        payload: { tabId: tabId.current, messages: lightweight },
      });
      // Same-tab mirror — for the other view (inline ↔ fullscreen) sharing this tab.
      if (chatId) {
        window.dispatchEvent(new CustomEvent("canvas-ai-bus:messages", {
          detail: { chatId, sourceId: sourceId.current, messages: lightweight },
        }));
      }
    },
    [chatId]
  );

  /** Broadcast streaming content (AI typewriter) to other tabs and same-tab consumers */
  const broadcastStreaming = useCallback(
    (content: string | null) => {
      // Throttle streaming to ~10fps; null (stream-end) always passes through.
      const now = Date.now();
      if (content !== null && now - lastStreamingBroadcastAt.current < 100) return;
      lastStreamingBroadcastAt.current = now;

      channelRef.current?.send({
        type: "broadcast",
        event: "streaming",
        payload: { tabId: tabId.current, content },
      });
      if (chatId) {
        window.dispatchEvent(new CustomEvent("canvas-ai-bus:streaming", {
          detail: { chatId, sourceId: sourceId.current, content },
        }));
      }
    },
    [chatId]
  );

  /** Broadcast the active chat id to all collaborators in the room (client+node scope). */
  const broadcastActiveChat = useCallback(
    (newChatId: string | null) => {
      roomChannelRef.current?.send({
        type: "broadcast",
        event: "active-chat",
        payload: { tabId: tabId.current, chatId: newChatId },
      });
      if (roomId) {
        window.dispatchEvent(new CustomEvent("canvas-ai-bus:active-chat", {
          detail: { roomId, sourceId: sourceId.current, chatId: newChatId },
        }));
      }
    },
    [roomId]
  );

  return {
    broadcastMessages,
    broadcastStreaming,
    broadcastActiveChat,
  };
}
