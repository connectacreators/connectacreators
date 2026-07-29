import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useLocation } from "react-router-dom";
import { useCompanion } from "@/contexts/CompanionContext";
import { useLanguage } from "@/hooks/useLanguage";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/use-mobile";
import CompanionDrawer from "./CompanionDrawer";
import CommandOrb from "@/components/command-deck/CommandOrb";

/**
 * Floating companion trigger — a 52px circle pinned to the bottom-right.
 * Click to toggle the right-side <CompanionDrawer>. The badge + pulse
 * indicator surface urgent task counts. The drawer owns all chat/threads UI.
 *
 * Renders the same small orb used as the /ai Action Surface's floating
 * recovery orb (CommandOrb at a compact size) instead of a flat icon
 * button — one consistent "this is Robby" visual identity site-wide,
 * not a separate flat sticker style just for pages other than /ai. The
 * dark ink+blur backing circle is deliberate even on light-background
 * pages: the orb's canvas rendering (glow, point-cloud) is designed
 * against a dark ground and reads as a little window into the Command
 * Deck wherever it appears, not a mismatched light-mode variant.
 *
 * NOTE: We used to auto-open the drawer on route change when a thread had
 * been "recently updated" (within 60s). That fired on every page nav for
 * up to a minute after any chat activity, which felt intrusive. The drawer
 * now only opens via explicit user click on the bubble — or it can be
 * triggered externally via setIsOpen(true) when the AI genuinely needs
 * the user's attention (pending plan approval, agentic in-flight, etc).
 */
export default function CompanionBubble() {
  const { companionName, isOpen, setIsOpen, bubbleHidden, setBubbleHidden } = useCompanion();
  const { user } = useAuth();
  const { language } = useLanguage();
  const location = useLocation();
  const isMobile = useIsMobile();
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

  if (!user) return null;
  // Hide on /ai — the page IS the full assistant view, the bubble is redundant.
  if (location.pathname === "/ai") return null;
  // User opted to hide the floating bubble via Settings. Re-enable from /settings.
  if (bubbleHidden) return null;
  // Not built for small screens yet — it collides with the mobile bottom
  // nav and page content instead of sitting in a clear corner.
  if (isMobile) return null;

  return (
    <>
      {/* Floating bubble — the same small orb as /ai's Action Surface mini-orb */}
      <div className="fixed bottom-5 right-5 z-50">
        <div
          className="relative rounded-full"
          style={{
            width: 52,
            height: 52,
            background: "hsl(var(--ink) / 0.85)",
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
            boxShadow: isOpen
              ? "0 0 0 1px hsl(var(--aqua) / 0.28), 0 6px 22px rgba(0,0,0,0.45)"
              : "0 0 0 1px hsl(var(--aqua) / 0.28), 0 6px 22px rgba(0,0,0,0.45), 0 0 18px hsl(var(--aqua) / 0.25)",
            transition: "box-shadow 0.3s ease",
          }}
        >
          {isOpen ? (
            <button
              onClick={() => setIsOpen(false)}
              className="w-full h-full flex items-center justify-center rounded-full"
              aria-label={en ? `Close ${companionName}` : `Cerrar ${companionName}`}
            >
              <X className="w-5 h-5" style={{ color: "hsl(var(--bone))" }} />
            </button>
          ) : (
            <CommandOrb onTap={() => setIsOpen(true)} minSize={52} maxSize={56} />
          )}
        </div>
        {/* Dismiss button — hides the bubble site-wide. Restore from Settings → AI Assistant. */}
        {!isOpen && (
          <button
            onClick={() => setBubbleHidden(true)}
            className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center"
            style={{ background: "hsl(var(--ink-on-cream))", color: "hsl(var(--cream))", border: "1px solid hsl(var(--ink-on-cream))" }}
            aria-label={en ? "Hide assistant bubble" : "Ocultar burbuja del asistente"}
            title={en ? "Hide (re-enable in Settings)" : "Ocultar (reactivar en Ajustes)"}
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Right-side drawer (replaces the old compact panel) */}
      {drawerMounted && <CompanionDrawer closing={!isOpen} />}
    </>
  );
}
