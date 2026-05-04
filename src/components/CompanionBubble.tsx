import { X } from "lucide-react";
import { useLocation } from "react-router-dom";
import { useCompanion } from "@/contexts/CompanionContext";
import { useLanguage } from "@/hooks/useLanguage";
import { useAuth } from "@/hooks/useAuth";
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
        className="fixed bottom-5 right-5 z-50 flex items-center justify-center rounded-full shadow-lg transition-transform hover:scale-105 active:scale-95"
        style={{
          width: 52,
          height: 52,
          background: "#1E293B",
          boxShadow: "0 4px 24px rgba(0,0,0,0.5)",
        }}
        aria-label={en ? `Open ${companionName}` : `Abrir ${companionName}`}
      >
        {badgeCount > 0 && !isOpen && (
          <span
            className="absolute inset-[-5px] rounded-full border-2 border-[rgba(34,211,238,0.55)] animate-ping"
            style={{ animationDuration: "2.2s" }}
          />
        )}
        {isOpen ? (
          <X className="w-5 h-5 text-white" />
        ) : (
          <img src="/favicon-transparent.png" alt="Connecta" className="w-9 h-9 object-contain" />
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
