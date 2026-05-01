import { useState, useCallback, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Zap, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { loadStripe } from "@stripe/stripe-js";
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";

const stripePromise = loadStripe(
  "pk_live_51T1wYhCp1qPE081LgFT3WQBCIjLkFTbpqRjKtVIgRk9rXZpQQJcVpWqJuafMFnKlhHFolIlYx7rIy1dSuH8hIjMz00rlJINFjF"
);

interface Pack {
  key: "small" | "medium" | "large";
  credits: number;
  price: number;
  label: string;
  perCredit: number;
  popular?: boolean;
  badge?: string;
}

const PACKS: Pack[] = [
  { key: "small",  credits: 1000,  price: 5,  label: "Emergency",    perCredit: 0.005 },
  { key: "medium", credits: 4000,  price: 15, label: "Standard",     perCredit: 0.00375, popular: true, badge: "Most Popular" },
  { key: "large",  credits: 10000, price: 30, label: "Best Value",   perCredit: 0.003,   badge: "Save 40%" },
];

interface AddCreditsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function AddCreditsModal({ open, onOpenChange, onSuccess }: AddCreditsModalProps) {
  const [selectedPack, setSelectedPack] = useState<Pack | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchClientSecret = useCallback(async (packKey: string) => {
    const { data, error } = await supabase.functions.invoke("create-topup-checkout", {
      body: { pack_type: packKey },
    });
    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(data.error);
    return data.client_secret;
  }, []);

  const handlePackSelect = useCallback(async (pack: Pack) => {
    setLoading(true);
    setSelectedPack(pack);
    try {
      const secret = await fetchClientSecret(pack.key);
      setClientSecret(secret);
    } catch (err: any) {
      toast.error(err.message || "Failed to start checkout");
      setSelectedPack(null);
    } finally {
      setLoading(false);
    }
  }, [fetchClientSecret]);

  const handleClose = useCallback((isOpen: boolean) => {
    if (!isOpen) {
      setSelectedPack(null);
      setClientSecret(null);
    }
    onOpenChange(isOpen);
  }, [onOpenChange]);

  const checkoutOptions = useMemo(
    () => (clientSecret ? { fetchClientSecret: () => Promise.resolve(clientSecret) } : undefined),
    [clientSecret]
  );

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl flex items-center gap-2">
            <Zap className="w-6 h-6 text-primary" />
            Add Credits
          </DialogTitle>
          <DialogDescription>
            Top up your account with one-time credit packs. Credits never expire.
          </DialogDescription>
        </DialogHeader>

        {!clientSecret ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
            {PACKS.map((pack) => (
              <button
                key={pack.key}
                onClick={() => handlePackSelect(pack)}
                disabled={loading}
                className={`relative text-left p-5 rounded-xl border transition-all hover:scale-[1.02] active:scale-[0.99] disabled:opacity-50 ${
                  pack.popular
                    ? "border-primary bg-primary/5"
                    : "border-border bg-card hover:border-primary/50"
                }`}
              >
                {pack.badge && (
                  <div
                    className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider"
                    style={{
                      background: pack.popular
                        ? "linear-gradient(135deg, #22d3ee, #a855f7)"
                        : "linear-gradient(135deg, #a3e635, #22d3ee)",
                      color: "white",
                    }}
                  >
                    {pack.badge}
                  </div>
                )}
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                  {pack.label}
                </div>
                <div className="text-3xl font-bold mb-1">
                  ${pack.price}
                </div>
                <div className="text-lg font-semibold text-primary mb-3">
                  {pack.credits.toLocaleString()} credits
                </div>
                <div className="text-[10px] text-muted-foreground mb-4">
                  ${pack.perCredit.toFixed(4)}/credit
                </div>
                <ul className="space-y-1.5 mb-4 text-xs text-foreground/70">
                  <li className="flex items-center gap-1.5">
                    <Check className="w-3 h-3 text-green-500" />
                    Credits never expire
                  </li>
                  <li className="flex items-center gap-1.5">
                    <Check className="w-3 h-3 text-green-500" />
                    Instant delivery
                  </li>
                  <li className="flex items-center gap-1.5">
                    <Check className="w-3 h-3 text-green-500" />
                    One-time payment
                  </li>
                </ul>
                <Button
                  className="w-full"
                  variant={pack.popular ? "default" : "outline"}
                  disabled={loading && selectedPack?.key === pack.key}
                >
                  {loading && selectedPack?.key === pack.key ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Loading...</>
                  ) : (
                    "Buy Now"
                  )}
                </Button>
              </button>
            ))}
          </div>
        ) : (
          <div className="mt-4">
            <EmbeddedCheckoutProvider stripe={stripePromise} options={checkoutOptions}>
              <EmbeddedCheckout />
            </EmbeddedCheckoutProvider>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
