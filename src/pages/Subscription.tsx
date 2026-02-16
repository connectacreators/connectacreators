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
  Loader2,
  Download,
  CreditCard,
  CalendarDays,
  AlertCircle,
} from "lucide-react";

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

export default function Subscription() {
  const { user, loading: authLoading, signOut, signInWithEmail, signUpWithEmail } = useAuth();
  const navigate = useNavigate();
  const { theme } = useTheme();
  const { language } = useLanguage();
  const isMobile = typeof window !== "undefined" && window.innerWidth < 1024;
  const [sidebarOpen, setSidebarOpen] = useState(!isMobile);

  const [subscription, setSubscription] = useState<SubscriptionData | null>(null);
  const [invoices, setInvoices] = useState<InvoiceData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
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
    fetchData();
  }, [user]);

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

          {loading ? (
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
                <p className="text-muted-foreground">{tr(t.subscription.noSubscription, language)}</p>
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
                      <Badge variant="outline" className="text-amber-400 border-amber-500/30">
                        {tr(t.subscription.cancelsAtEnd, language)}
                      </Badge>
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
                      <p className="text-muted-foreground">{tr(t.subscription.nextPayment, language)}</p>
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
                              <TableCell className="text-right">
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
    </div>
  );
}
