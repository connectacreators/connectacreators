import { useEffect, useRef, useState } from "react";
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

  // Keep the drawer mounted briefly after close so the slide-out animation
  // can play before unmount. Open immediately when isOpen flips true.
  const [drawerMounted, setDrawerMounted] = useState(isOpen);
  useEffect(() => {
    if (isOpen) {
      setDrawerMounted(true);
      return;
    }
    const t = setTimeout(() => setDrawerMounted(false), 220);
    return () => clearTimeout(t);
  }, [isOpen]);

  const badgeCount = tasks.filter(
    (t) => t.priority === "red" || t.priority === "amber",
  ).length;

  if (!user) return null;
  // Hide on /ai — the page IS the full assistant view, the bubble is redundant.
  if (location.pathname === "/ai") return null;

  return (
    <>
      {/* Floating bubble — editorial sticker: bone fill, ink stroke + offset shadow */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-5 right-5 z-50 flex items-center justify-center rounded-full"
        style={{
          width: 52,
          height: 52,
          background: "#EAE6DC",
          border: "1px solid #141414",
          boxShadow: "3px 3px 0 #141414",
          transition: "box-shadow 120ms, transform 120ms",
        }}
        onMouseEnter={(e) => {
          const el = e.currentTarget;
          el.style.boxShadow = "4px 4px 0 #141414";
          el.style.transform = "translate(-1px,-1px)";
        }}
        onMouseLeave={(e) => {
          const el = e.currentTarget;
          el.style.boxShadow = "3px 3px 0 #141414";
          el.style.transform = "none";
        }}
        aria-label={en ? `Open ${companionName}` : `Abrir ${companionName}`}
      >
        {badgeCount > 0 && !isOpen && (
          <span
            className="absolute inset-[-5px] rounded-full border border-[#141414] animate-ping"
            style={{ animationDuration: "2.2s", opacity: 0.35 }}
          />
        )}
        {isOpen ? (
          <X className="w-5 h-5" style={{ color: "#141414" }} />
        ) : (
          <img
            src="/favicon-transparent.png"
            alt="Connecta"
            className="w-6 h-6 object-contain"
          />
        )}
        {badgeCount > 0 && !isOpen && (
          <span
            className="absolute -top-1 -right-1 w-5 h-5 rounded-full text-[9px] font-bold flex items-center justify-center"
            style={{ background: "#C7682A", color: "#EAE6DC", border: "1px solid #141414" }}
          >
            {badgeCount}
          </span>
        )}
      </button>

      {/* Right-side drawer (replaces the old compact panel) */}
      {drawerMounted && <CompanionDrawer closing={!isOpen} />}
    </>
  );
}
