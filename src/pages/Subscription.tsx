import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/useTheme";
import { useLanguage } from "@/hooks/useLanguage";
import { t, tr } from "@/i18n/translations";
import { supabase } from "@/integrations/supabase/client";
import ScriptsLogin from "@/components/ScriptsLogin";
import DashboardSidebar from "@/components/DashboardSidebar";
import DashboardTopBar from "@/components/DashboardTopBar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Loader2,
  Download,
  CreditCard,
  CalendarDays,
  AlertCircle,
  ArrowUpCircle,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import AnimatedDots from "@/components/ui/AnimatedDots";

interface SubscriptionData {
  id: string;
  status: string;
  current_period_start: number;
  current_period_end: number;
  cancel_at_period_end: boolean;
  plan_name: string;
  amount: number;
  currency: string;
  interval: string;
}

interface InvoiceData {
  id: string;
  number: string;
  date: number;
  amount: number;
  currency: string;
  status: string;
  pdf_url: string | null;
  hosted_url: string | null;
}

const CANCEL_REASONS = [
  { value: "too_expensive", label: "Too expensive" },
  { value: "not_using", label: "Not using it enough" },
  { value: "better_alternative", label: "Found a better alternative" },
  { value: "missing_features", label: "Missing features I need" },
  { value: "other", label: "Other" },
];

export default function Subscription() {
  const { user, loading: authLoading, isAdmin, isVideographer, signOut, signInWithEmail, signUpWithEmail } = useAuth();
  const isStaff = isAdmin || isVideographer;
  const navigate = useNavigate();
  const { theme } = useTheme();
  const { language } = useLanguage();
  const isMobile = typeof window !== "undefined" && window.innerWidth < 1024;
  const [sidebarOpen, setSidebarOpen] = useState(!isMobile);

  const [subscription, setSubscription] = useState<SubscriptionData | null>(null);
  const [invoices, setInvoices] = useState<InvoiceData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Cancel modal state
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelStep, setCancelStep] = useState<"reason" | "confirming" | "done">("reason");
  const [cancelReason, setCancelReason] = useState("");
  const [cancelFeedback, setCancelFeedback] = useState("");
  const [canceling, setCanceling] = useState(false);
  const [clientPlanType, setClientPlanType] = useState<string | null>(null);

  const isManagedPlan = clientPlanType === "connecta_plan" || clientPlanType === "connecta_plus";

  const fetchData = async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      // Fetch client plan type
      const { data: clientData } = await supabase
        .from("clients")
        .select("plan_type")
        .eq("user_id", user.id)
        .maybeSingle();
      if (clientData) setClientPlanType(clientData.plan_type);

      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("get-subscription", {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (res.error) throw new Error(res.error.message);
      setSubscription(res.data.subscription);
      setInvoices(res.data.invoices || []);
    } catch (err: any) {
      setError(err.message || "Error loading subscription");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [user]);

  const handleCancel = async () => {
    setCanceling(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { error } = await supabase.functions.invoke("cancel-subscription", {
        headers: { Authorization: `Bearer ${session?.access_token}` },
        body: { reason: cancelReason, feedback: cancelFeedback },
      });
      if (error) throw error;
      setCancelStep("done");
      toast.success("Subscription canceled");
      // Refresh data
      await fetchData();
    } catch (err: any) {
      toast.error(err.message || "Failed to cancel subscription");
    } finally {
      setCanceling(false);
    }
  };

  const closeCancelModal = () => {
    setCancelOpen(false);
    setCancelStep("reason");
    setCancelReason("");
    setCancelFeedback("");
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    return (
      <ScriptsLogin
        onSignIn={() => {}}
        signInWithEmail={signInWithEmail}
        signUpWithEmail={signUpWithEmail}
      />
    );
  }

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat(language === "es" ? "es-MX" : "en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(amount / 100);
  };

  const formatDate = (ts: number) => {
    return new Date(ts * 1000).toLocaleDateString(
      language === "es" ? "es-MX" : "en-US",
      { year: "numeric", month: "short", day: "numeric" }
    );
  };

  const statusColor = (status: string) => {
    switch (status) {
      case "active": return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
      case "past_due": return "bg-amber-500/20 text-amber-400 border-amber-500/30";
      case "canceled": case "unpaid": return "bg-red-500/20 text-red-400 border-red-500/30";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const invoiceStatusColor = (status: string) => {
    switch (status) {
      case "paid": return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
      case "open": return "bg-amber-500/20 text-amber-400 border-amber-500/30";
      default: return "bg-muted text-muted-foreground";
    }
  };

  return (
    <div className="min-h-screen bg-background flex" style={{ fontFamily: "Arial, sans-serif" }}>
      <AnimatedDots />
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/40 z-30 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <DashboardSidebar
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
        currentPath="/subscription"
      />

      <main className="flex-1 flex flex-col min-h-screen">
        <DashboardTopBar
          sidebarOpen={sidebarOpen}
          setSidebarOpen={setSidebarOpen}
        />

        <div className="flex-1 px-4 sm:px-8 py-8 max-w-4xl mx-auto w-full">
          <h1 className="text-2xl font-bold text-foreground mb-6 flex items-center gap-2">
            <CreditCard className="w-6 h-6 text-primary" />
            {tr(t.subscription.title, language)}
          </h1>

          {isStaff ? (
            <Card>
              <CardContent className="py-16 text-center">
                <p className="text-4xl mb-4">😎</p>
                <p className="text-lg font-medium text-foreground">
                  No tienes suscripción, mas bien te tenemos que pagar
                </p>
              </CardContent>
            </Card>
          ) : loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <Card className="border-destructive/50">
              <CardContent className="flex items-center gap-3 py-6">
                <AlertCircle className="w-5 h-5 text-destructive" />
                <p className="text-destructive">{error}</p>
              </CardContent>
            </Card>
          ) : !subscription ? (
            <Card>
              <CardContent className="py-12 text-center">
                <CreditCard className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground mb-4">{tr(t.subscription.noSubscription, language)}</p>
                <Button onClick={() => navigate("/select-plan")} className="gap-2">
                  <ArrowUpCircle className="w-4 h-4" />
                  Choose a Plan
                </Button>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Current Plan Card */}
              <Card className="mb-8">
                <CardHeader>
                  <CardTitle className="text-lg">{tr(t.subscription.currentPlan, language)}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <Badge className={`${statusColor(subscription.status)} border`}>
                      {subscription.status}
                    </Badge>
                    {subscription.cancel_at_period_end && (
                      <>
                        <Badge variant="outline" className="text-amber-400 border-amber-500/30">
                          {tr(t.subscription.cancelsAtEnd, language)}
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                          Available until {formatDate(subscription.current_period_end)}
                        </span>
                      </>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">{tr(t.subscription.amount, language)}</p>
                      <p className="text-foreground font-semibold text-lg">
                        {formatCurrency(subscription.amount, subscription.currency)}
                        <span className="text-muted-foreground text-sm font-normal"> / {subscription.interval}</span>
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">
                        {subscription.cancel_at_period_end ? "Access ends" : tr(t.subscription.nextPayment, language)}
                      </p>
                      <p className="text-foreground font-medium flex items-center gap-1">
                        <CalendarDays className="w-4 h-4 text-muted-foreground" />
                        {formatDate(subscription.current_period_end)}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">{tr(t.subscription.billingPeriod, language)}</p>
                      <p className="text-foreground font-medium">
                        {formatDate(subscription.current_period_start)} – {formatDate(subscription.current_period_end)}
                      </p>
                    </div>
                  </div>

                  {/* Upgrade & Cancel actions — hidden for managed plans */}
                  {!isManagedPlan && (
                    <div className="flex items-center justify-between pt-4 border-t border-border">
                      {!subscription.cancel_at_period_end && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => navigate("/select-plan?upgrade=true")}
                          className="gap-2"
                        >
                          <ArrowUpCircle className="w-4 h-4" />
                          Upgrade Plan
                        </Button>
                      )}
                      {!subscription.cancel_at_period_end && (
                        <button
                          onClick={() => setCancelOpen(true)}
                          className="text-xs text-muted-foreground hover:text-destructive transition-colors underline"
                        >
                          Cancel subscription
                        </button>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Payment History */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">{tr(t.subscription.paymentHistory, language)}</CardTitle>
                </CardHeader>
                <CardContent>
                  {invoices.length === 0 ? (
                    <p className="text-muted-foreground text-sm py-4 text-center">
                      {tr(t.subscription.noInvoices, language)}
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>{tr(t.subscription.date, language)}</TableHead>
                            <TableHead>{tr(t.subscription.invoiceNumber, language)}</TableHead>
                            <TableHead>{tr(t.subscription.amount, language)}</TableHead>
                            <TableHead>{tr(t.subscription.status, language)}</TableHead>
                            <TableHead className="text-right">{tr(t.subscription.invoice, language)}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {invoices.map((inv) => (
                            <TableRow key={inv.id}>
                              <TableCell className="text-sm">{formatDate(inv.date)}</TableCell>
                              <TableCell className="text-sm font-mono">{inv.number || "—"}</TableCell>
                              <TableCell className="text-sm font-medium">
                                {formatCurrency(inv.amount, inv.currency)}
                              </TableCell>
                              <TableCell>
                                <Badge className={`${invoiceStatusColor(inv.status || "")} border text-xs`}>
                                  {inv.status}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right flex items-center justify-end gap-1">
                                {inv.status === "open" && inv.hosted_url && (
                                  <Button
                                    variant="default"
                                    size="sm"
                                    onClick={() => window.open(inv.hosted_url!, "_blank")}
                                    className="gap-1"
                                  >
                                    <CreditCard className="w-3.5 h-3.5" />
                                    {language === "es" ? "Pagar" : "Pay"}
                                  </Button>
                                )}
                                {inv.pdf_url && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => window.open(inv.pdf_url!, "_blank")}
                                  >
                                    <Download className="w-4 h-4" />
                                  </Button>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </main>

      {/* Cancel Subscription Modal */}
      <Dialog open={cancelOpen} onOpenChange={(open) => { if (!open) closeCancelModal(); }}>
        <DialogContent className="sm:max-w-md">
          {cancelStep === "reason" && (
            <>
              <DialogHeader>
                <DialogTitle>We're sad to see you go 😢</DialogTitle>
                <DialogDescription>
                  Please let us know why you're canceling so we can improve.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <RadioGroup value={cancelReason} onValueChange={setCancelReason}>
                  {CANCEL_REASONS.map((r) => (
                    <div key={r.value} className="flex items-center space-x-3">
                      <RadioGroupItem value={r.value} id={r.value} />
                      <Label htmlFor={r.value} className="cursor-pointer">{r.label}</Label>
                    </div>
                  ))}
                </RadioGroup>
                <Textarea
                  placeholder="Additional feedback (optional)"
                  value={cancelFeedback}
                  onChange={(e) => setCancelFeedback(e.target.value)}
                  className="mt-2"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={closeCancelModal}>
                  Never mind
                </Button>
                <Button
                  variant="destructive"
                  disabled={!cancelReason || canceling}
                  onClick={handleCancel}
                >
                  {canceling ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Cancel Subscription
                </Button>
              </div>
            </>
          )}
          {cancelStep === "done" && (
            <>
              <DialogHeader>
                <DialogTitle>Subscription Canceled</DialogTitle>
              </DialogHeader>
              <div className="py-6 text-center">
                <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
                <p className="text-muted-foreground">
                  Your subscription will remain active until the end of your current billing period
                  {subscription ? ` (${formatDate(subscription.current_period_end)})` : ""}.
                </p>
              </div>
              <div className="flex justify-end">
                <Button onClick={closeCancelModal}>Close</Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
