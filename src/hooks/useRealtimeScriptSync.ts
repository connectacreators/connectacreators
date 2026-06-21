import { useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

function getTabId(): string {
  let id = sessionStorage.getItem("presence_tab_id");
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem("presence_tab_id", id);
  }
  return id;
}

interface Options {
  /** e.g. "script:<scriptId>" — empty string disables the hook */
  roomId: string;
  /** Called when another session reports it just saved this script. */
  onRemoteSaved: () => void;
}

/**
 * Lightweight save-ping sync. After a session persists changes it calls
 * broadcastSaved(); peers receive it and re-fetch + merge. Broadcast is
 * ephemeral — the DB remains the source of truth.
 */
export function useRealtimeScriptSync({ roomId, onRemoteSaved }: Options): { broadcastSaved: () => void } {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const tabId = useRef(getTabId());
  const savedCb = useRef(onRemoteSaved);
  savedCb.current = onRemoteSaved;

  useEffect(() => {
    if (!roomId) return;
    const channel = supabase
      .channel(`script-sync:${roomId}`)
      .on("broadcast", { event: "saved" }, ({ payload }) => {
        if (payload?.tabId === tabId.current) return;
        savedCb.current();
      })
      .subscribe();
    channelRef.current = channel;
    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [roomId]);

  const broadcastSaved = useCallback(() => {
    channelRef.current?.send({
      type: "broadcast",
      event: "saved",
      payload: { tabId: tabId.current },
    });
  }, []);

  return { broadcastSaved };
}
