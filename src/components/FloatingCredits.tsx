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
  const accentColor = isEmpty ? "#f59e0b" : "#22d3ee";
  const totalBalance = credits.credits_balance + credits.topup_credits_balance;

  return (
    <>
      <div className="fixed bottom-5 right-[80px] z-40 flex items-center gap-2">
        {/* Add credits button (only show if user has an active sub) */}
        {!isEmpty && credits.subscription_status && ["active", "trialing", "canceling"].includes(credits.subscription_status) && (
          <button
            onClick={() => setShowAddCredits(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all hover:scale-105 active:scale-95"
            style={{
              background: "rgba(34,211,238,0.10)",
              backdropFilter: "blur(16px)",
              WebkitBackdropFilter: "blur(16px)",
              border: "1px solid rgba(34,211,238,0.25)",
              boxShadow: "0 4px 24px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.08)",
              color: "#22d3ee",
            }}
            title="Buy more credits"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add</span>
          </button>
        )}

        <button
          onClick={() => navigate(isEmpty ? "/select-plan" : "/subscription")}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium transition-all hover:scale-105 active:scale-95"
          style={{
            background: isEmpty ? "rgba(245,158,11,0.10)" : "rgba(255,255,255,0.05)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
            border: `1px solid ${isEmpty ? "rgba(245,158,11,0.25)" : "rgba(255,255,255,0.10)"}`,
            boxShadow: "0 4px 24px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.08)",
            color: "var(--foreground)",
          }}
          title={credits.topup_credits_balance > 0 ? `Plan: ${credits.credits_balance} · Top-up: ${credits.topup_credits_balance}` : undefined}
        >
          <Zap className="w-4 h-4 flex-shrink-0" style={{ color: accentColor }} />
          {isEmpty ? (
            <span style={{ color: accentColor, fontWeight: 600 }}>Upgrade</span>
          ) : (
            <>
              <span className="tabular-nums" style={{ color: accentColor, fontWeight: 600 }}>
                {totalBalance.toLocaleString()}
              </span>
              {credits.topup_credits_balance > 0 && (
                <span className="text-[10px] opacity-60">
                  (+{credits.topup_credits_balance.toLocaleString()})
                </span>
              )}
              <span className="text-xs opacity-50">/ {credits.credits_monthly_cap.toLocaleString()}</span>
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
