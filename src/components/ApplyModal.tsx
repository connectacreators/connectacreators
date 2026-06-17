import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

interface ApplyModalProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  label?: string;
}

/**
 * Lightweight, self-contained modal overlay for the landing pages' apply form.
 * Intentionally uses inline styles (not the app's shadcn/theme system) to match
 * the standalone landing pages. Portals to <body> so no ancestor overflow/transform
 * can clip the fixed overlay. Closes on backdrop click, ESC, or the × button;
 * locks body scroll and restores focus while open.
 */
export default function ApplyModal({ open, onClose, children, label = "Apply to work with us" }: ApplyModalProps) {
  const lastFocused = useRef<HTMLElement | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    lastFocused.current = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);

    // Move focus into the dialog for keyboard/screen-reader users.
    const focusTimer = setTimeout(() => cardRef.current?.focus(), 0);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
      clearTimeout(focusTimer);
      lastFocused.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label}
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2147483000,
        background: "rgba(10,10,10,0.66)",
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        overflowY: "auto",
        padding: "clamp(16px, 5vh, 56px) 16px",
        animation: "applyModalFade 0.2s ease",
      }}
    >
      <style>{`
        @keyframes applyModalFade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes applyModalRise { from { opacity: 0; transform: translateY(14px) } to { opacity: 1; transform: none } }
      `}</style>
      <div
        ref={cardRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "relative",
          width: "100%",
          maxWidth: 520,
          margin: "auto",
          outline: "none",
          animation: "applyModalRise 0.28s cubic-bezier(0.16,1,0.3,1)",
        }}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            position: "absolute",
            top: 12,
            right: 12,
            zIndex: 2,
            width: 36,
            height: 36,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "50%",
            border: "none",
            background: "rgba(10,10,10,0.06)",
            color: "#0a0a0a",
            fontSize: 22,
            lineHeight: 1,
            cursor: "pointer",
            fontFamily: "'Montserrat', sans-serif",
          }}
        >
          ×
        </button>
        {children}
      </div>
    </div>,
    document.body
  );
}
