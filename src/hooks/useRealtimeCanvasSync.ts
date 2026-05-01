import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type { Node, Edge } from "@xyflow/react";

/**
 * Lightweight node snapshot for broadcasting — only position/size/connections matter.
 */
interface LightNode {
  id: string;
  type?: string;
  position: { x: number; y: number };
  width?: number;
  height?: number;
  parentId?: string;
  hidden?: boolean;
}

export interface RemoteCursor {
  tabId: string;
  animalName: string;
  color: string;
  x: number;
  y: number;
  lastSeen: number;
}

function getTabId(): string {
  let id = sessionStorage.getItem("presence_tab_id");
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem("presence_tab_id", id);
  }
  return id;
}

function getAnimalName(): string {
  return sessionStorage.getItem("presence_animal") || "Unknown";
}

function getPresenceColor(): string {
  return sessionStorage.getItem("presence_color") || "#22d3ee";
}

/** Payload for a single node's data update (annotation resize, text change, etc.) */
interface NodeDataUpdate {
  nodeId: string;
  data: Record<string, any>;
}

interface UseRealtimeCanvasSyncOptions {
  /** Room ID — e.g. "canvas:clientId:sessionId" */
  roomId: string;
  /** Called when another tab broadcasts node position changes */
  onRemoteNodeChanges: (nodes: LightNode[]) => void;
  /** Called when another tab broadcasts edge changes (connect/disconnect) */
  onRemoteEdgeChanges: (edges: Edge[]) => void;
  /** Called when another tab broadcasts a node data update (e.g. annotation fontSize/width) */
  onRemoteNodeDataUpdate?: (update: NodeDataUpdate) => void;
}

/**
 * Broadcast-based live canvas sync via Supabase Realtime.
 *
 * Events:
 * - "node-positions": Lightweight node positions
 * - "edge-changes": Full edges array
 * - "cursor-move": Remote cursor positions (high-frequency, ~15fps)
 */
export function useRealtimeCanvasSync({
  roomId,
  onRemoteNodeChanges,
  onRemoteEdgeChanges,
  onRemoteNodeDataUpdate,
}: UseRealtimeCanvasSyncOptions) {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const tabId = useRef(getTabId());
  const lastNodeBroadcast = useRef(0);
  const lastCursorBroadcast = useRef(0);
  const [remoteCursors, setRemoteCursors] = useState<RemoteCursor[]>([]);

  // Keep callbacks fresh
  const onRemoteNodeChangesRef = useRef(onRemoteNodeChanges);
  onRemoteNodeChangesRef.current = onRemoteNodeChanges;
  const onRemoteEdgeChangesRef = useRef(onRemoteEdgeChanges);
  onRemoteEdgeChangesRef.current = onRemoteEdgeChanges;
  const onRemoteNodeDataUpdateRef = useRef(onRemoteNodeDataUpdate);
  onRemoteNodeDataUpdateRef.current = onRemoteNodeDataUpdate;

  useEffect(() => {
    if (!roomId) return;

    // Clean up previous channel
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    const channel = supabase
      .channel(`canvas-sync:${roomId}`)
      .on("broadcast", { event: "node-positions" }, ({ payload }) => {
        if (payload.tabId === tabId.current) return;
        if (Array.isArray(payload.nodes)) {
          onRemoteNodeChangesRef.current(payload.nodes);
        }
      })
      .on("broadcast", { event: "edge-changes" }, ({ payload }) => {
        if (payload.tabId === tabId.current) return;
        if (Array.isArray(payload.edges)) {
          onRemoteEdgeChangesRef.current(payload.edges);
        }
      })
      .on("broadcast", { event: "node-data-update" }, ({ payload }) => {
        if (payload.tabId === tabId.current) return;
        if (payload.nodeId && payload.data) {
          onRemoteNodeDataUpdateRef.current?.({ nodeId: payload.nodeId, data: payload.data });
        }
      })
      .on("broadcast", { event: "cursor-move" }, ({ payload }) => {
        if (payload.tabId === tabId.current) return;
        setRemoteCursors(prev => {
          const now = Date.now();
          // Update or add cursor, remove stale ones (>5s old)
          const filtered = prev.filter(c => c.tabId !== payload.tabId && now - c.lastSeen < 5000);
          return [...filtered, {
            tabId: payload.tabId,
            animalName: payload.animalName,
            color: payload.color,
            x: payload.x,
            y: payload.y,
            lastSeen: now,
          }];
        });
      })
      .subscribe();

    channelRef.current = channel;

    // Cleanup stale cursors every 3 seconds
    const staleInterval = setInterval(() => {
      setRemoteCursors(prev => {
        const now = Date.now();
        const active = prev.filter(c => now - c.lastSeen < 5000);
        return active.length !== prev.length ? active : prev;
      });
    }, 3000);

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
      clearInterval(staleInterval);
    };
  }, [roomId]);

  /** Broadcast node positions — throttled to 5fps */
  const broadcastNodePositions = useCallback((nodes: Node[]) => {
    const now = Date.now();
    if (now - lastNodeBroadcast.current < 200) return;
    lastNodeBroadcast.current = now;

    const lightweight: LightNode[] = nodes.map(n => ({
      id: n.id,
      type: n.type,
      position: n.position,
      width: n.measured?.width ?? n.width,
      height: n.measured?.height ?? n.height,
      parentId: n.parentId,
      hidden: n.hidden,
    }));

    channelRef.current?.send({
      type: "broadcast",
      event: "node-positions",
      payload: { tabId: tabId.current, nodes: lightweight },
    });
  }, []);

  /** Broadcast edges after connect/disconnect */
  const broadcastEdgeChanges = useCallback((edges: Edge[]) => {
    const lightweight = edges.map(e => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle,
      targetHandle: e.targetHandle,
      type: e.type,
      animated: e.animated,
      style: e.style,
    }));

    channelRef.current?.send({
      type: "broadcast",
      event: "edge-changes",
      payload: { tabId: tabId.current, edges: lightweight },
    });
  }, []);

  /** Broadcast a single node's data update (e.g. annotation fontSize/width/text/color) */
  const broadcastNodeDataUpdate = useCallback((nodeId: string, data: Record<string, any>) => {
    channelRef.current?.send({
      type: "broadcast",
      event: "node-data-update",
      payload: { tabId: tabId.current, nodeId, data },
    });
  }, []);

  /** Broadcast cursor position — throttled to ~15fps */
  const broadcastCursorPosition = useCallback((x: number, y: number) => {
    const now = Date.now();
    if (now - lastCursorBroadcast.current < 66) return; // ~15fps
    lastCursorBroadcast.current = now;

    channelRef.current?.send({
      type: "broadcast",
      event: "cursor-move",
      payload: {
        tabId: tabId.current,
        animalName: getAnimalName(),
        color: getPresenceColor(),
        x,
        y,
      },
    });
  }, []);

  return {
    broadcastNodePositions,
    broadcastEdgeChanges,
    broadcastNodeDataUpdate,
    broadcastCursorPosition,
    remoteCursors,
  };
}
