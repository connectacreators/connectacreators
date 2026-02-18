import { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { loadStripe } from "@stripe/stripe-js";
import {
  EmbeddedCheckoutProvider,
  EmbeddedCheckout,
} from "@stripe/react-stripe-js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Loader2, ArrowLeft, User, Phone, CreditCard, Check } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";

const stripePromise = loadStripe(
  "pk_live_51T1wYhCp1qPE081LgFT3WQBCIjLkFTbpqRjKtVIgRk9rXZpQQJcVpWqJuafMFnKlhHFolIlYx7rIy1dSuH8hIjMz00rlJINFjF"
);

const PLAN_DETAILS: Record<string, { name: string; price: string; features: string[] }> = {
  starter: {
    name: "Starter",
    price: "$30/month",
    features: ["Access to Connecta CRM", "Up to 75 scripts per month", "Script generator access", "Save and organize scripts"],
  },
  growth: {
    name: "Growth",
    price: "$60/month",
    features: ["Access to Connecta CRM", "Up to 200 scripts per month", "Script generator access", "Save and organize scripts"],
  },
  enterprise: {
    name: "Enterprise",
    price: "$150/month",
    features: ["Access to Connecta CRM", "Up to 500 scripts per month", "Lead tracker access", "Facebook lead integration", "Automatic syncing of leads"],
  },
};

export default function Checkout() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const planKey = searchParams.get("plan") || "";

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loadingCheckout, setLoadingCheckout] = useState(false);

  const plan = PLAN_DETAILS[planKey];

  // Redirect if invalid plan or not authenticated
  useEffect(() => {
    if (!loading && !user) {
      navigate("/dashboard");
      return;
    }
    if (!plan) {
      navigate("/select-plan");
    }
  }, [user, loading, plan, navigate]);

  // Pre-fill user data
  useEffect(() => {
    if (!user) return;
    const fetchProfile = async () => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name, email")
        .eq("user_id", user.id)
        .maybeSingle();

      const displayName = profile?.display_name || user.user_metadata?.full_name || "";
      const parts = displayName.split(" ");
      setFirstName(parts[0] || "");
      setLastName(parts.slice(1).join(" ") || "");
      setEmail(profile?.email || user.email || "");
    };
    fetchProfile();
  }, [user]);

  const handleContinueToPayment = useCallback(async () => {
    if (!user || !planKey) return;
    setLoadingCheckout(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: { plan_type: planKey, phone },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (error) throw error;
      if (data?.client_secret) {
        setClientSecret(data.client_secret);
      } else {
        throw new Error("No client secret returned");
      }
    } catch (err: any) {
      console.error("Checkout error:", err);
      toast.error("Failed to start checkout. Please try again.");
      setLoadingCheckout(false);
    }
  }, [user, planKey, phone]);

  if (loading || !user || !plan) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/select-plan")}
          className="mb-6 text-muted-foreground"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Plans
        </Button>

        <motion.h1
          className="text-3xl font-bold text-foreground mb-8"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          Complete Your Purchase
        </motion.h1>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left: Form + Payment */}
          <div className="lg:col-span-2 space-y-6">
            {/* Personal Info */}
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
              <Card>
                <CardHeader className="pb-4">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <User className="w-5 h-5 text-primary" />
                    Personal Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="firstName">First Name</Label>
                      <Input
                        id="firstName"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        placeholder="First name"
                        disabled={!!clientSecret}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="lastName">Last Name</Label>
                      <Input
                        id="lastName"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        placeholder="Last name"
                        disabled={!!clientSecret}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      readOnly
                      className="bg-muted/50 cursor-not-allowed"
                    />
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            {/* Contact Info */}
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
              <Card>
                <CardHeader className="pb-4">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Phone className="w-5 h-5 text-primary" />
                    Contact Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone Number</Label>
                    <Input
                      id="phone"
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+1 (555) 000-0000"
                      disabled={!!clientSecret}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="contactEmail">Email</Label>
                    <Input
                      id="contactEmail"
                      type="email"
                      value={email}
                      readOnly
                      className="bg-muted/50 cursor-not-allowed"
                    />
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            {/* Payment Section */}
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
              <Card>
                <CardHeader className="pb-4">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <CreditCard className="w-5 h-5 text-primary" />
                    Payment
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {!clientSecret ? (
                    <div className="space-y-4">
                      <p className="text-sm text-muted-foreground">
                        Click below to proceed to the secure payment form.
                      </p>
                      <Button
                        className="w-full"
                        size="lg"
                        onClick={handleContinueToPayment}
                        disabled={loadingCheckout}
                      >
                        {loadingCheckout ? (
                          <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        ) : null}
                        Continue to Payment
                      </Button>
                    </div>
                  ) : (
                    <div id="checkout" className="min-h-[300px]">
                      <EmbeddedCheckoutProvider
                        stripe={stripePromise}
                        options={{ clientSecret }}
                      >
                        <EmbeddedCheckout />
                      </EmbeddedCheckoutProvider>
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          </div>

          {/* Right: Plan Summary */}
          <div className="lg:col-span-1">
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
              <Card className="sticky top-8 border-primary/30">
                <CardHeader>
                  <CardTitle className="text-lg">Order Summary</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <p className="font-semibold text-foreground text-xl">{plan.name}</p>
                    <p className="text-2xl font-bold text-primary mt-1">{plan.price}</p>
                  </div>
                  <Separator />
                  <ul className="space-y-2">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-sm text-muted-foreground">
                        <Check className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </div>

        {/* Contact Info Footer */}
        <div className="mt-12 text-center pb-4">
          <p className="text-xs text-muted-foreground/60">
            Need help? Contact us:{" "}
            <a href="mailto:admin@connectacreators.com" className="text-primary hover:underline">
              admin@connectacreators.com
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
