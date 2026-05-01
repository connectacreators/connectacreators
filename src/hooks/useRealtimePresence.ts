import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

// ── Pixel creature names for anonymous presence ─────────────────────────────
// Paired with the 8-bit PixelAvatar component. Field name stays `animalName`
// on PresenceUser for backwards compatibility — value is now a creature.
const ANIMALS = [
  "Ghost", "Robot", "Slime", "Alien", "Cat", "Pumpkin",
  "Skull", "Heart", "Star", "Mushroom", "Frog", "Owl",
  "Bee", "Duck", "Penguin", "Rabbit", "Cloud", "Flame",
  "Crystal", "Pizza", "Donut", "Crown", "Crab", "Bat",
];

const COLORS = [
  "#22d3ee", // cyan
  "#a78bfa", // violet
  "#f472b6", // pink
  "#fb923c", // orange
  "#4ade80", // green
  "#facc15", // yellow
  "#f87171", // red
  "#38bdf8", // sky
];

function getAnimalName(): string {
  // Persist per browser tab so it stays consistent across navigations
  let name = sessionStorage.getItem("presence_animal");
  if (!name) {
    name = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
    sessionStorage.setItem("presence_animal", name);
  }
  return name;
}

function getPresenceColor(): string {
  let color = sessionStorage.getItem("presence_color");
  if (!color) {
    color = COLORS[Math.floor(Math.random() * COLORS.length)];
    sessionStorage.setItem("presence_color", color);
  }
  return color;
}

// Unique tab ID (different from user ID — same user can have multiple tabs)
function getTabId(): string {
  let id = sessionStorage.getItem("presence_tab_id");
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem("presence_tab_id", id);
  }
  return id;
}

export interface PresenceUser {
  tabId: string;
  userId: string;
  animalName: string;
  color: string;
  cursorX?: number;
  cursorY?: number;
  lastActive: number;
  currentView?: string; // "canvas" | "fullscreen-ai" | etc.
}

interface UseRealtimePresenceOptions {
  /** Channel room name, e.g. "canvas:clientId:sessionId" */
  roomId: string;
  /** Current user ID */
  userId: string;
  /** Which view the user is on */
  currentView?: string;
  /** Whether to track cursor position (default false) */
  trackCursor?: boolean;
}

export function useRealtimePresence({
  roomId,
  userId,
  currentView = "canvas",
  trackCursor = false,
}: UseRealtimePresenceOptions) {
  const [others, setOthers] = useState<PresenceUser[]>([]);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const tabId = useRef(getTabId());
  const animalName = useRef(getAnimalName());
  const color = useRef(getPresenceColor());

  // Broadcast cursor position (throttled)
  const lastBroadcast = useRef(0);
  const broadcastCursor = useCallback(
    (x: number, y: number) => {
      const now = Date.now();
      if (now - lastBroadcast.current < 50) return; // throttle to 20fps
      lastBroadcast.current = now;
      channelRef.current?.track({
        tabId: tabId.current,
        userId,
        animalName: animalName.current,
        color: color.current,
        cursorX: x,
        cursorY: y,
        lastActive: now,
        currentView,
      });
    },
    [userId, currentView]
  );

  useEffect(() => {
    if (!roomId || !userId) return;

    const channel = supabase.channel(`presence:${roomId}`, {
      config: { presence: { key: tabId.current } },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<PresenceUser>();
        const users: PresenceUser[] = [];
        for (const [_key, presences] of Object.entries(state)) {
          for (const p of presences) {
            // Don't include self
            if (p.tabId === tabId.current) continue;
            users.push(p as unknown as PresenceUser);
          }
        }
        setOthers(users);
      })
      .on("presence", { event: "join" }, ({ newPresences }) => {
        // Handled by sync
      })
      .on("presence", { event: "leave" }, ({ leftPresences }) => {
        // Handled by sync
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({
            tabId: tabId.current,
            userId,
            animalName: animalName.current,
            color: color.current,
            lastActive: Date.now(),
            currentView,
          });
        }
      });

    channelRef.current = channel;

    return () => {
      channel.untrack();
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [roomId, userId]);

  // Update presence when view changes
  useEffect(() => {
    if (!channelRef.current) return;
    channelRef.current.track({
      tabId: tabId.current,
      userId,
      animalName: animalName.current,
      color: color.current,
      lastActive: Date.now(),
      currentView,
    });
  }, [currentView, userId]);

  return {
    /** Other users currently present (excludes self) */
    others,
    /** This user's animal name */
    myAnimalName: animalName.current,
    /** This user's presence color */
    myColor: color.current,
    /** Broadcast cursor position (if trackCursor is enabled) */
    broadcastCursor,
    /** Total online count (including self) */
    onlineCount: others.length + 1,
  };
}
