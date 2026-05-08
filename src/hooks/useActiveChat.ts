// src/hooks/useActiveChat.ts
//
// Cross-page chat continuity. The companion drawer (CompanionDrawer) and
// the /ai surface (CommandCenter) used to manage their own activeThreadId
// independently, so navigating between them killed the conversation.
// This hook persists the active thread to localStorage so both surfaces
// hydrate the same chat on mount and any thread change made from one
// surface is visible to the other on next mount/navigation.
//
// Stored value:
//   { threadId: string, clientId: string | null, updatedAt: number }
// We expire after 24h to avoid resurrecting stale chats from yesterday.

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "connecta_active_chat_v1";
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

type ActiveChat = {
  threadId: string;
  clientId: string | null;
  updatedAt: number;
};

function read(): ActiveChat | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ActiveChat;
    if (!parsed?.threadId) return null;
    if (Date.now() - parsed.updatedAt > MAX_AGE_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function write(value: ActiveChat | null) {
  try {
    if (!value) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // localStorage can throw in private browsing; chat continuity is
    // a nice-to-have — silently degrade rather than break the app.
  }
}

/**
 * Subscribe to the persisted active chat. Returns the current value plus
 * a setter that writes back to localStorage and broadcasts to other
 * mounted hook instances via a window storage event so cross-surface
 * updates land immediately, not just on next mount.
 */
/** Threshold for considering an active chat "fresh" — used by the drawer to
 *  decide whether to auto-open on mount after an in-app navigation. Picked
 *  to be generous enough to cover slow page loads, tight enough that a
 *  yesterday-stale chat doesn't pop a drawer open out of nowhere. */
const RECENT_THRESHOLD_MS = 60 * 1000;

export function useActiveChat(): {
  activeThreadId: string | null;
  activeClientId: string | null;
  /** True when the active chat was set within the last RECENT_THRESHOLD_MS.
   *  The drawer reads this to decide whether to auto-open after an AI-driven
   *  navigation. */
  wasUpdatedRecently: boolean;
  setActiveChat: (threadId: string | null, clientId?: string | null) => void;
  clearActiveChat: () => void;
} {
  const [state, setState] = useState<ActiveChat | null>(() => read());

  // React to storage events so a change in CommandCenter is visible to
  // CompanionDrawer (or vice versa) without a remount. Only fires across
  // tabs for native storage events; we manually dispatch within the same
  // tab via a CustomEvent below.
  useEffect(() => {
    const onStorage = () => setState(read());
    window.addEventListener("storage", onStorage);
    window.addEventListener("connecta-active-chat-change", onStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("connecta-active-chat-change", onStorage);
    };
  }, []);

  const setActiveChat = useCallback(
    (threadId: string | null, clientId: string | null = null) => {
      const next: ActiveChat | null = threadId
        ? { threadId, clientId, updatedAt: Date.now() }
        : null;
      write(next);
      setState(next);
      window.dispatchEvent(new CustomEvent("connecta-active-chat-change"));
    },
    [],
  );

  const clearActiveChat = useCallback(() => setActiveChat(null), [setActiveChat]);

  const wasUpdatedRecently = !!state &&
    Date.now() - state.updatedAt < RECENT_THRESHOLD_MS;

  return {
    activeThreadId: state?.threadId ?? null,
    activeClientId: state?.clientId ?? null,
    wasUpdatedRecently,
    setActiveChat,
    clearActiveChat,
  };
}
