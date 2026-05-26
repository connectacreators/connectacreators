import { useEffect, useState } from "react";
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
 *
 * NOTE: We used to auto-open the drawer on route change when a thread had
 * been "recently updated" (within 60s). That fired on every page nav for
 * up to a minute after any chat activity, which felt intrusive. The drawer
 * now only opens via explicit user click on the bubble — or it can be
 * triggered externally via setIsOpen(true) when the AI genuinely needs
 * the user's attention (pending plan approval, agentic in-flight, etc).
 */
export default function CompanionBubble() {
  const { companionName, tasks, isOpen, setIsOpen, bubbleHidden } = useCompanion();
  const { user } = useAuth();
  const { language } = useLanguage();
  const location = useLocation();
  const en = language === "en";

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
  // User opted to hide the floating bubble via Settings. Re-enable from /settings.
  if (bubbleHidden) return null;

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
            style={{ filter: "brightness(0)" }}
            /* ink-tinted: matches the bone sticker treatment of the bubble */
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
