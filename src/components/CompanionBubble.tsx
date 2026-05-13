import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { useLocation } from "react-router-dom";
import { useCompanion } from "@/contexts/CompanionContext";
import { useLanguage } from "@/hooks/useLanguage";
import { useAuth } from "@/hooks/useAuth";
import { useActiveChat } from "@/hooks/useActiveChat";
import CompanionDrawer from "./CompanionDrawer";

/**
 * Floating companion trigger — a 52px circle pinned to the bottom-right.
 * Click to toggle the right-side <CompanionDrawer>. The badge + pulse
 * indicator surface urgent task counts. The drawer owns all chat/threads UI.
 */
export default function CompanionBubble() {
  const { companionName, tasks, isOpen, setIsOpen } = useCompanion();
  const { user } = useAuth();
  const { language } = useLanguage();
  const location = useLocation();
  const en = language === "en";

  // Auto-open the drawer when the user lands on a page with a freshly
  // active chat — i.e., the AI just navigated us here AND the chat was
  // recent (within 60s). Lives here, not in CompanionDrawer, because the
  // drawer is only mounted when isOpen=true; this needs to fire while the
  // drawer is closed. Uses a ref to fire only ONCE per route change so we
  // don't fight the user if they manually close it.
  const { activeThreadId, wasUpdatedRecently } = useActiveChat();
  const lastAutoOpenedRouteRef = useRef<string | null>(null);
  useEffect(() => {
    // Only auto-open on routes that aren't /ai (the bubble is hidden there
    // anyway, and CommandCenter handles its own state).
    if (location.pathname === "/ai") return;
    // Only fire once per (route + activeThread) combo so re-renders don't
    // re-open after the user closes manually.
    const key = `${location.pathname}::${activeThreadId ?? ""}`;
    if (lastAutoOpenedRouteRef.current === key) return;
    if (activeThreadId && wasUpdatedRecently && !isOpen) {
      setIsOpen(true);
      lastAutoOpenedRouteRef.current = key;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, activeThreadId, wasUpdatedRecently]);

  const badgeCount = tasks.filter(
    (t) => t.priority === "red" || t.priority === "amber",
  ).length;

  if (!user) return null;
  // Hide on /ai — the page IS the full assistant view, the bubble is redundant.
  if (location.pathname === "/ai") return null;

  return (
    <>
      {/* Floating bubble */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-5 right-5 z-50 flex items-center justify-center rounded-full transition-transform hover:scale-105 active:scale-95"
        style={{
          width: 52,
          height: 52,
          background: "rgba(255,255,255,0.08)",
          backdropFilter: "blur(20px) saturate(140%)",
          WebkitBackdropFilter: "blur(20px) saturate(140%)",
          border: "1px solid rgba(255,255,255,0.12)",
          boxShadow: "0 4px 24px rgba(0,0,0,0.35)",
        }}
        aria-label={en ? `Open ${companionName}` : `Abrir ${companionName}`}
      >
        {badgeCount > 0 && !isOpen && (
          <span
            className="absolute inset-[-5px] rounded-full border-2 border-[rgba(255,255,255,0.35)] animate-ping"
            style={{ animationDuration: "2.2s" }}
          />
        )}
        {isOpen ? (
          <X className="w-5 h-5 text-white" />
        ) : (
          <img
            src="/favicon-transparent.png"
            alt="Connecta"
            className="w-9 h-9 object-contain"
            style={{ filter: "brightness(0) invert(1)" }}
          />
        )}
        {badgeCount > 0 && !isOpen && (
          <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
            {badgeCount}
          </span>
        )}
      </button>

      {/* Right-side drawer (replaces the old compact panel) */}
      {isOpen && <CompanionDrawer />}
    </>
  );
}
