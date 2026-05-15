import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Zap, Plus } from "lucide-react";
import { useCredits } from "@/hooks/useCredits";
import { useAuth } from "@/hooks/useAuth";
import { AddCreditsModal } from "@/components/AddCreditsModal";

export default function FloatingCredits() {
  const navigate = useNavigate();
  const { credits, refetch } = useCredits();
  const { isAdmin } = useAuth();
  const [showAddCredits, setShowAddCredits] = useState(false);

  if (!credits || credits.credits_monthly_cap === 0) return null;
  if (isAdmin) return null;

  const isEmpty = credits.credits_balance === 0 && credits.topup_credits_balance === 0;
  // Editorial sticker palette — bone fill, ink stroke + offset shadow, ink text.
  // Only the spark icon picks up the accent (honey when empty, aqua otherwise).
  const accentColor = isEmpty ? "#C7682A" : "#8FD0D5";
  const totalBalance = credits.credits_balance + credits.topup_credits_balance;

  const stickerBase: React.CSSProperties = {
    background: "#EAE6DC",
    border: "1px solid #141414",
    boxShadow: "2px 2px 0 #141414",
    color: "#141414",
    fontFamily: "'Figtree', sans-serif",
    transition: "box-shadow 120ms, transform 120ms",
  };

  return (
    <>
      <div className="fixed bottom-5 right-[80px] z-40 flex items-center gap-2">
        {/* Add credits button (only show if user has an active sub) */}
        {!isEmpty && credits.subscription_status && ["active", "trialing", "canceling"].includes(credits.subscription_status) && (
          <button
            onClick={() => setShowAddCredits(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold"
            style={stickerBase}
            onMouseEnter={(e) => { const el = e.currentTarget; el.style.boxShadow = "3px 3px 0 #141414"; el.style.transform = "translate(-1px,-1px)"; }}
            onMouseLeave={(e) => { const el = e.currentTarget; el.style.boxShadow = "2px 2px 0 #141414"; el.style.transform = "none"; }}
            title="Buy more credits"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add</span>
          </button>
        )}

        <button
          onClick={() => navigate(isEmpty ? "/select-plan" : "/subscription")}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-semibold"
          style={stickerBase}
          onMouseEnter={(e) => { const el = e.currentTarget; el.style.boxShadow = "3px 3px 0 #141414"; el.style.transform = "translate(-1px,-1px)"; }}
          onMouseLeave={(e) => { const el = e.currentTarget; el.style.boxShadow = "2px 2px 0 #141414"; el.style.transform = "none"; }}
          title={credits.topup_credits_balance > 0 ? `Plan: ${credits.credits_balance} · Top-up: ${credits.topup_credits_balance}` : undefined}
        >
          <Zap className="w-4 h-4 flex-shrink-0" style={{ color: accentColor }} strokeWidth={2} />
          {isEmpty ? (
            <span style={{ color: "#141414", fontWeight: 600 }}>Upgrade</span>
          ) : (
            <>
              <span className="tabular-nums" style={{ color: "#141414", fontWeight: 600 }}>
                {totalBalance.toLocaleString()}
              </span>
              {credits.topup_credits_balance > 0 && (
                <span className="text-[10px]" style={{ color: "rgba(20,20,20,0.55)" }}>
                  (+{credits.topup_credits_balance.toLocaleString()})
                </span>
              )}
              <span className="text-xs" style={{ color: "rgba(20,20,20,0.55)" }}>/ {credits.credits_monthly_cap.toLocaleString()}</span>
            </>
          )}
        </button>
      </div>

      <AddCreditsModal
        open={showAddCredits}
        onOpenChange={setShowAddCredits}
        onSuccess={() => refetch()}
      />
    </>
  );
}
