import { useEffect } from "react";
import { X } from "lucide-react";
import { useOutOfCredits } from "@/contexts/OutOfCreditsContext";
import { useAuth } from "@/hooks/useAuth";
import connectaFavicon from "@/assets/connecta-favicon-icon.png";

// The self-serve subscription plans this modal used to sell ($39/$79/$139 via
// embedded Stripe checkout) are retired — platform access is provisioned by
// the Connecta team as part of Connecta+. Out-of-credits now just points at
// the team instead of a purchase flow.
export default function OutOfCreditsModal() {
  const { isOpen, hideOutOfCreditsModal } = useOutOfCredits();
  const { isAdmin, isVideographer, isEditor, isConnectaPlus } = useAuth();

  const handleClose = () => hideOutOfCreditsModal();

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") handleClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen]);

  if (!isOpen || isAdmin || isVideographer || isEditor || isConnectaPlus) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: "rgba(15,15,18,0.7)", backdropFilter: "blur(8px)" }}
      onClick={handleClose}
    >
      <div
        className="w-full max-w-md rounded-2xl px-10 py-12 relative"
        style={{ background: "#16171a", border: "1px solid rgba(255,255,255,0.08)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 w-7 h-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/[0.05] transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>

        <div className="text-center">
          <img src={connectaFavicon} alt="Connecta" className="w-10 h-10 object-contain mx-auto mb-5 opacity-90" />
          <h2 className="font-serif text-xl sm:text-2xl font-light text-foreground leading-snug" style={{ letterSpacing: "0.02em" }}>
            You're out of credits
          </h2>
          <p className="text-xs text-muted-foreground mt-3 leading-relaxed tracking-wide">
            Credits are part of your Connecta+ service. Reach out to the Connecta team
            and we'll get you topped up.
          </p>
          <button
            onClick={handleClose}
            className="mt-7 px-5 py-2.5 rounded-xl text-sm font-semibold text-black bg-white hover:bg-white/90 transition-colors"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
