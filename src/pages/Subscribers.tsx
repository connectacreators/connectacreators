import { useState, useEffect, useCallback } from "react";
import PageTransition from "@/components/PageTransition";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  Search,
  Plus,
  Edit2,
  UserX,
  Clock,
  CreditCard,
  Users,
  CheckCircle2,
  XCircle,
  Menu,
  Loader2,
  RefreshCw,
  AlertTriangle,
  Eye,
  EyeOff,
  KeyRound,
  Zap,
} from "lucide-react";
import { format, isPast, parseISO } from "date-fns";

type PlanType = "starter" | "growth" | "enterprise" | "connecta_dfy" | "connecta_plus";
type StatusType = "active" | "inactive" | "trial" | "canceled";
type FilterTab = "all" | StatusType;

interface Subscriber {
  id: string;
  user_id: string | null;
  email: string;
  full_name: string | null;
  plan_type: PlanType;
  status: StatusType;
  is_manually_assigned: boolean;
  trial_ends_at: string | null;
  stripe_subscription_id: string | null;
  stripe_customer_id: string | null;
  subscribed_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Credits (joined from clients table)
  client_id?: string | null;
  credits_balance?: number | null;
  credits_used?: number | null;
  credits_monthly_cap?: number | null;
}

const PLAN_LABELS: Record<PlanType, string> = {
  starter: "Starter",
  growth: "Growth",
  enterprise: "Enterprise",
  connecta_dfy: "Connecta Plan",
  connecta_plus: "Connecta Plus",
};

const PLAN_PRICES: Record<PlanType, string> = {
  starter: "$30/mo",
  growth: "$60/mo",
  enterprise: "$150/mo",
  connecta_dfy: "Custom",
  connecta_plus: "Custom",
};

const PLAN_COLORS: Record<PlanType, string> = {
  starter: "bg-sky-500/15 text-sky-400 border-sky-500/30",
  growth: "bg-violet-500/15 text-violet-400 border-violet-500/30",
  enterprise: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  connecta_dfy: "bg-rose-500/15 text-rose-400 border-rose-500/30",
  connecta_plus: "bg-orange-500/15 text-orange-400 border-orange-500/30",
};

const STATUS_COLORS: Record<StatusType, string> = {
  active: "bg-green-500/15 text-green-400 border-green-500/30",
  trial: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  inactive: "bg-muted/50 text-muted-foreground border-border",
  canceled: "bg-red-500/15 text-red-400 border-red-500/30",
};

const emptyForm = {
  email: "",
  full_name: "",
  plan_type: "starter" as PlanType,
  status: "active" as StatusType,
  trial_ends_at: "",
  stripe_subscription_id: "",
  stripe_customer_id: "",
  subscribed_at: "",
  notes: "",
  is_manually_assigned: true,
  temp_password: "",
};

export default function Subscribers() {
  const navigate = useNavigate();
  const { isAdmin, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterTab, setFilterTab] = useState<FilterTab>("all");
  const [filterPlan, setFilterPlan] = useState<"all" | PlanType>("all");

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Deactivate confirm
  const [deactivateId, setDeactivateId] = useState<string | null>(null);

  // Recharge credits
  const [rechargeTarget, setRechargeTarget] = useState<Subscriber | null>(null);
  const [rechargeAmount, setRechargeAmount] = useState("100");
  const [recharging, setRecharging] = useState(false);

  // Stripe sync
  const [syncing, setSyncing] = useState(false);

  // Redirect non-admins
  useEffect(() => {
    if (!authLoading && !isAdmin) navigate("/dashboard");
  }, [authLoading, isAdmin, navigate]);

  const expireTrials = useCallback(async () => {
    const now = new Date().toISOString();
    await supabase
      .from("subscriptions")
      .update({ status: "inactive" })
      .eq("status", "trial")
      .lt("trial_ends_at", now);
  }, []);

  const fetchSubscribers = useCallback(async () => {
    setLoading(true);
    await expireTrials();
    const { data, error } = await supabase
      .from("subscriptions")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      toast({ title: "Error loading subscribers", description: error.message, variant: "destructive" });
      setLoading(false);
      return;
    }
    const subs = (data as Subscriber[]) || [];

    // Enrich with credits from clients table
    const userIds = subs.filter((s) => s.user_id).map((s) => s.user_id!);
    if (userIds.length > 0) {
      const { data: clientsData } = await supabase
        .from("clients")
        .select("id, user_id, credits_balance, credits_used, credits_monthly_cap")
        .in("user_id", userIds);
      const creditsMap = new Map(
        (clientsData ?? []).map((c) => [c.user_id, c])
      );
      const enriched = subs.map((s) => {
        const c = s.user_id ? creditsMap.get(s.user_id) : null;
        return {
          ...s,
          client_id: c?.id ?? null,
          credits_balance: c?.credits_balance ?? null,
          credits_used: c?.credits_used ?? null,
          credits_monthly_cap: c?.credits_monthly_cap ?? null,
        };
      });
      setSubscribers(enriched);
    } else {
      setSubscribers(subs);
    }
    setLoading(false);
  }, [expireTrials, toast]);

  useEffect(() => {
    if (!authLoading && isAdmin) fetchSubscribers();
  }, [authLoading, isAdmin, fetchSubscribers]);

  // Filter logic
  const filtered = subscribers.filter((s) => {
    const matchSearch =
      !search ||
      s.email.toLowerCase().includes(search.toLowerCase()) ||
      (s.full_name ?? "").toLowerCase().includes(search.toLowerCase());
    const matchTab = filterTab === "all" || s.status === filterTab;
    const matchPlan = filterPlan === "all" || s.plan_type === filterPlan;
    return matchSearch && matchTab && matchPlan;
  });

  // Stats
  const counts = {
    all: subscribers.length,
    active: subscribers.filter((s) => s.status === "active").length,
    trial: subscribers.filter((s) => s.status === "trial").length,
    inactive: subscribers.filter((s) => s.status === "inactive").length,
    canceled: subscribers.filter((s) => s.status === "canceled").length,
  };

  // Open add modal
  const openAdd = () => {
    setEditingId(null);
    setForm({ ...emptyForm, subscribed_at: new Date().toISOString().slice(0, 10) });
    setShowPassword(false);
    setModalOpen(true);
  };

  // Open edit modal
  const openEdit = (s: Subscriber) => {
    setEditingId(s.id);
    setForm({
      email: s.email,
      full_name: s.full_name ?? "",
      plan_type: s.plan_type,
      status: s.status,
      trial_ends_at: s.trial_ends_at ? s.trial_ends_at.slice(0, 10) : "",
      stripe_subscription_id: s.stripe_subscription_id ?? "",
      stripe_customer_id: s.stripe_customer_id ?? "",
      subscribed_at: s.subscribed_at ? s.subscribed_at.slice(0, 10) : "",
      notes: s.notes ?? "",
      is_manually_assigned: s.is_manually_assigned,
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.email.trim()) {
      toast({ title: "Email is required", variant: "destructive" });
      return;
    }
    if (!editingId && !form.temp_password.trim()) {
      toast({ title: "Temporary password is required", variant: "destructive" });
      return;
    }
    if (!editingId && form.temp_password.trim().length < 8) {
      toast({ title: "Password must be at least 8 characters", variant: "destructive" });
      return;
    }
    if (form.status === "trial" && !form.trial_ends_at) {
      toast({ title: "Trial end date is required for trial status", variant: "destructive" });
      return;
    }

    setSaving(true);

    if (!editingId) {
      // CREATE: use edge function to also create the auth user
      const { data: sessionData } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke("create-subscriber-user", {
        headers: { Authorization: `Bearer ${sessionData.session?.access_token}` },
        body: {
          email: form.email.trim(),
          password: form.temp_password.trim(),
          full_name: form.full_name.trim() || null,
          plan_type: form.plan_type,
          status: form.status,
          trial_ends_at: form.trial_ends_at ? new Date(form.trial_ends_at).toISOString() : null,
          stripe_subscription_id: form.stripe_subscription_id.trim() || null,
          stripe_customer_id: form.stripe_customer_id.trim() || null,
          subscribed_at: form.subscribed_at ? new Date(form.subscribed_at).toISOString() : null,
          notes: form.notes.trim() || null,
          is_manually_assigned: form.is_manually_assigned,
        },
      });
      setSaving(false);
      if (error || data?.error) {
        toast({
          title: "Failed to create subscriber",
          description: data?.error || error?.message,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Subscriber created",
          description: `Account created for ${form.email.trim()}. Temporary password has been set.`,
        });
        setModalOpen(false);
        fetchSubscribers();
      }
    } else {
      // EDIT: update subscription record only
      const payload: Record<string, unknown> = {
        full_name: form.full_name.trim() || null,
        plan_type: form.plan_type,
        status: form.status,
        trial_ends_at: form.trial_ends_at ? new Date(form.trial_ends_at).toISOString() : null,
        stripe_subscription_id: form.stripe_subscription_id.trim() || null,
        stripe_customer_id: form.stripe_customer_id.trim() || null,
        subscribed_at: form.subscribed_at ? new Date(form.subscribed_at).toISOString() : null,
        notes: form.notes.trim() || null,
        is_manually_assigned: form.is_manually_assigned,
      };
      const { error } = await supabase.from("subscriptions").update(payload).eq("id", editingId);
      setSaving(false);
      if (error) {
        toast({ title: "Update failed", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Subscriber updated" });
        setModalOpen(false);
        fetchSubscribers();
      }
    }
  };

  const handleRecharge = async () => {
    if (!rechargeTarget?.client_id) {
      toast({ title: "No client record found for this subscriber", variant: "destructive" });
      return;
    }
    const amount = parseInt(rechargeAmount);
    if (isNaN(amount) || amount <= 0) {
      toast({ title: "Enter a valid amount", variant: "destructive" });
      return;
    }
    setRecharging(true);

    // Get current balance
    const { data: clientData, error: fetchErr } = await supabase
      .from("clients")
      .select("id, credits_balance")
      .eq("id", rechargeTarget.client_id)
      .maybeSingle();
    if (fetchErr || !clientData) {
      toast({ title: "Failed to fetch client record", variant: "destructive" });
      setRecharging(false);
      return;
    }

    // Add credits to balance
    const newBalance = (clientData.credits_balance ?? 0) + amount;
    const { error: updateErr } = await supabase
      .from("clients")
      .update({ credits_balance: newBalance })
      .eq("id", rechargeTarget.client_id);
    if (updateErr) {
      toast({ title: "Recharge failed", description: updateErr.message, variant: "destructive" });
      setRecharging(false);
      return;
    }

    // Log to credit_transactions
    await supabase.from("credit_transactions").insert({
      client_id: rechargeTarget.client_id,
      action: "admin_recharge",
      cost: -amount,
      metadata: { note: "Manual admin recharge" },
    });

    toast({ title: `${amount} credits added`, description: `Balance updated for ${rechargeTarget.email}` });
    setRechargeTarget(null);
    setRechargeAmount("100");
    setRecharging(false);
    fetchSubscribers();
  };

  const handleDeactivate = async (id: string) => {
    const { error } = await supabase
      .from("subscriptions")
      .update({ status: "inactive" })
      .eq("id", id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Subscriber deactivated" });
      setDeactivateId(null);
      fetchSubscribers();
    }
  };

  const handleStripeSync = async () => {
    setSyncing(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke("stripe-billing-portal", {
        body: { action: "admin-sync" },
        headers: { Authorization: `Bearer ${sessionData.session?.access_token}` },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({
        title: "Stripe sync complete",
        description: `${data.synced} subscription(s) synced from Stripe`,
      });
      fetchSubscribers();
    } catch (err: any) {
      toast({ title: "Sync failed", description: err.message, variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  };

  const isTrialExpired = (s: Subscriber) =>
    s.status === "trial" && s.trial_ends_at && isPast(parseISO(s.trial_ends_at));

  if (authLoading) return null;

  const TABS: { key: FilterTab; label: string }[] = [
    { key: "all", label: "All" },
    { key: "active", label: "Active" },
    { key: "trial", label: "Trial" },
    { key: "inactive", label: "Inactive" },
    { key: "canceled", label: "Canceled" },
  ];

  return (
  <>
<PageTransition className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-border/30 glass-ios-strong shrink-0">
          <div className="flex items-center gap-3">
<div>
              <h1 className="text-lg font-semibold text-foreground">Subscribers</h1>
              <p className="text-xs text-muted-foreground">Manage SaaS subscriptions</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleStripeSync}
              disabled={syncing}
              className="gap-2"
            >
              {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
              <span className="hidden sm:inline">Sync Stripe</span>
            </Button>
            <Button variant="ghost" size="sm" onClick={fetchSubscribers} className="gap-2">
              <RefreshCw className="w-4 h-4" />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
            <Button size="sm" onClick={openAdd} className="gap-2">
              <Plus className="w-4 h-4" />
              Add Subscriber
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Stats cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard icon={<Users className="w-4 h-4 text-muted-foreground" />} label="Total" value={counts.all} />
            <StatCard icon={<CheckCircle2 className="w-4 h-4 text-green-400" />} label="Active" value={counts.active} color="text-green-400" />
            <StatCard icon={<Clock className="w-4 h-4 text-blue-400" />} label="Trial" value={counts.trial} color="text-blue-400" />
            <StatCard icon={<XCircle className="w-4 h-4 text-muted-foreground" />} label="Inactive" value={counts.inactive} />
          </div>

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Status tabs */}
            <div className="flex gap-1 p-1 rounded-lg bg-muted/40 border border-border/30 flex-wrap">
              {TABS.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setFilterTab(tab.key)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    filterTab === tab.key
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tab.label}
                  <span className="ml-1.5 opacity-60">
                    {tab.key === "all" ? counts.all : counts[tab.key as StatusType]}
                  </span>
                </button>
              ))}
            </div>

            <div className="flex gap-2 flex-1">
              {/* Plan filter */}
              <Select value={filterPlan} onValueChange={(v) => setFilterPlan(v as "all" | PlanType)}>
                <SelectTrigger className="w-36 text-xs h-9">
                  <SelectValue placeholder="All Plans" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Plans</SelectItem>
                  <SelectItem value="starter">Starter</SelectItem>
                  <SelectItem value="growth">Growth</SelectItem>
                  <SelectItem value="enterprise">Enterprise</SelectItem>
                  <SelectItem value="connecta_dfy">Connecta Plan</SelectItem>
                  <SelectItem value="connecta_plus">Connecta Plus</SelectItem>
                </SelectContent>
              </Select>

              {/* Search */}
              <div className="relative flex-1 min-w-0">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search by name or email..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 text-sm h-9"
                />
              </div>
            </div>
          </div>

          {/* Table */}
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <CreditCard className="w-10 h-10 text-muted-foreground/30 mb-3" />
              <p className="text-muted-foreground font-medium">No subscribers found</p>
              <p className="text-sm text-muted-foreground/60 mt-1">
                {search || filterTab !== "all" || filterPlan !== "all"
                  ? "Try adjusting your filters"
                  : "Add your first subscriber to get started"}
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-border/30 overflow-hidden">
              {/* Table header */}
              <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_1fr_auto] gap-3 px-4 py-2.5 bg-muted/20 border-b border-border/30 text-xs font-medium text-muted-foreground hidden md:grid">
                <span>Subscriber</span>
                <span>Plan</span>
                <span>Status</span>
                <span>Stripe</span>
                <span>Subscribed</span>
                <span>Trial Ends</span>
                <span>Credits</span>
                <span></span>
              </div>

              {/* Rows */}
              <div className="divide-y divide-border/20">
                {filtered.map((s) => (
                  <SubscriberRow
                    key={s.id}
                    subscriber={s}
                    isTrialExpired={!!isTrialExpired(s)}
                    onEdit={() => openEdit(s)}
                    onDeactivate={() => setDeactivateId(s.id)}
                    onRecharge={() => { setRechargeTarget(s); setRechargeAmount("100"); }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </PageTransition>

      {/* Add/Edit Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Subscriber" : "Add Subscriber"}</DialogTitle>
            {!editingId && (
              <p className="text-sm text-muted-foreground pt-1">
                This will create a real Supabase account for the subscriber.
              </p>
            )}
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Email */}
            <div className="space-y-1.5">
              <Label>Email *</Label>
              <Input
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="user@example.com"
                type="email"
                disabled={!!editingId}
              />
              {!!editingId && (
                <p className="text-xs text-muted-foreground">Email cannot be changed after creation</p>
              )}
            </div>

            {/* Temporary password — only when creating */}
            {!editingId && (
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-amber-400" />
                  Temporary Password *
                </Label>
                <div className="relative">
                  <Input
                    value={form.temp_password}
                    onChange={(e) => setForm({ ...form, temp_password: e.target.value })}
                    placeholder="Min. 8 characters"
                    type={showPassword ? "text" : "password"}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-xs text-amber-400/80">
                  The subscriber will use this password to log in. Share it with them securely.
                </p>
              </div>
            )}

            {/* Full name */}
            <div className="space-y-1.5">
              <Label>Full Name</Label>
              <Input
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                placeholder="John Doe"
              />
            </div>

            {/* Plan + Status row */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Plan *</Label>
                <Select
                  value={form.plan_type}
                  onValueChange={(v) => setForm({ ...form, plan_type: v as PlanType })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="starter">Starter — $30/mo</SelectItem>
                    <SelectItem value="growth">Growth — $60/mo</SelectItem>
                    <SelectItem value="enterprise">Enterprise — $150/mo</SelectItem>
                    <SelectItem value="connecta_dfy">Connecta Plan</SelectItem>
                    <SelectItem value="connecta_plus">Connecta Plus</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Status *</Label>
                <Select
                  value={form.status}
                  onValueChange={(v) => setForm({ ...form, status: v as StatusType })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="trial">Trial</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                    <SelectItem value="canceled">Canceled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Trial end date (only when trial) */}
            {form.status === "trial" && (
              <div className="space-y-1.5 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                <Label className="text-blue-400">Trial End Date *</Label>
                <Input
                  type="date"
                  value={form.trial_ends_at}
                  onChange={(e) => setForm({ ...form, trial_ends_at: e.target.value })}
                  min={new Date().toISOString().slice(0, 10)}
                />
                <p className="text-xs text-blue-400/70">
                  When this date passes, status will automatically become Inactive.
                </p>
              </div>
            )}

            {/* Subscribed date */}
            <div className="space-y-1.5">
              <Label>Subscribed Date</Label>
              <Input
                type="date"
                value={form.subscribed_at}
                onChange={(e) => setForm({ ...form, subscribed_at: e.target.value })}
              />
            </div>

            {/* Manual assignment toggle */}
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/30">
              <div>
                <p className="text-sm font-medium">Manual Assignment</p>
                <p className="text-xs text-muted-foreground">Not synced to Stripe</p>
              </div>
              <button
                type="button"
                onClick={() => setForm({ ...form, is_manually_assigned: !form.is_manually_assigned })}
                className={`w-10 h-5 rounded-full transition-colors ${
                  form.is_manually_assigned ? "bg-primary" : "bg-muted"
                }`}
              >
                <div
                  className={`w-4 h-4 bg-white rounded-full shadow transition-transform mx-0.5 ${
                    form.is_manually_assigned ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            {/* Stripe IDs (collapsible section) */}
            {!form.is_manually_assigned && (
              <div className="space-y-3 p-3 rounded-lg bg-muted/20 border border-border/20">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Stripe Details</p>
                <div className="space-y-1.5">
                  <Label className="text-xs">Stripe Subscription ID</Label>
                  <Input
                    value={form.stripe_subscription_id}
                    onChange={(e) => setForm({ ...form, stripe_subscription_id: e.target.value })}
                    placeholder="sub_..."
                    className="text-xs font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Stripe Customer ID</Label>
                  <Input
                    value={form.stripe_customer_id}
                    onChange={(e) => setForm({ ...form, stripe_customer_id: e.target.value })}
                    placeholder="cus_..."
                    className="text-xs font-mono"
                  />
                </div>
              </div>
            )}

            {/* Notes */}
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Internal notes about this subscriber..."
                rows={2}
                className="text-sm resize-none"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editingId ? "Save Changes" : "Add Subscriber"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Recharge credits modal */}
      <Dialog open={!!rechargeTarget} onOpenChange={(o) => !o && setRechargeTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400" />
              Recharge Credits
            </DialogTitle>
          </DialogHeader>
          {rechargeTarget && (
            <div className="space-y-4 py-1">
              <div className="rounded-lg bg-muted/30 border border-border/30 px-4 py-3 space-y-1">
                <p className="text-xs text-muted-foreground">Subscriber</p>
                <p className="text-sm font-medium">{rechargeTarget.email}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Current balance:{" "}
                  <span className="text-foreground font-semibold">
                    {rechargeTarget.credits_balance ?? 0} credits
                  </span>
                  {rechargeTarget.credits_monthly_cap != null && (
                    <> / {rechargeTarget.credits_monthly_cap} cap</>
                  )}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>Credits to add</Label>
                <Input
                  type="number"
                  min="1"
                  value={rechargeAmount}
                  onChange={(e) => setRechargeAmount(e.target.value)}
                  placeholder="e.g. 500"
                  className="text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  New balance will be {(rechargeTarget.credits_balance ?? 0) + (parseInt(rechargeAmount) || 0)} credits
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRechargeTarget(null)}>Cancel</Button>
            <Button onClick={handleRecharge} disabled={recharging} className="gap-1.5">
              {recharging ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
              Add Credits
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deactivate confirm */}
      <Dialog open={!!deactivateId} onOpenChange={() => setDeactivateId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Deactivate Subscriber?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will set their status to Inactive. They will lose access to the platform.
            You can reactivate them at any time.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeactivateId(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => deactivateId && handleDeactivate(deactivateId)}
            >
              Deactivate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
  </>
  );
}

// ---- Sub-components ----

function StatCard({
  icon,
  label,
  value,
  color = "text-foreground",
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color?: string;
}) {
  return (
    <div className="rounded-xl border border-border/30 bg-card/50 px-4 py-3 flex items-center gap-3">
      <div className="w-8 h-8 rounded-lg bg-muted/40 flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`text-xl font-bold ${color}`}>{value}</p>
      </div>
    </div>
  );
}

function SubscriberRow({
  subscriber: s,
  isTrialExpired,
  onEdit,
  onDeactivate,
  onRecharge,
}: {
  subscriber: Subscriber;
  isTrialExpired: boolean;
  onEdit: () => void;
  onDeactivate: () => void;
  onRecharge: () => void;
}) {
  const creditsUsed = s.credits_used ?? 0;
  const creditsCap = s.credits_monthly_cap ?? 0;
  const creditsBalance = s.credits_balance ?? 0;
  const hasCredits = s.credits_monthly_cap != null;
  const pct = creditsCap > 0 ? Math.min(100, Math.round((creditsUsed / creditsCap) * 100)) : 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_1fr_auto] gap-2 md:gap-3 px-4 py-3 hover:bg-muted/10 transition-colors">
      {/* Name + email */}
      <div className="flex items-center gap-2 min-w-0">
        <div className="w-7 h-7 rounded-full bg-accent/20 flex items-center justify-center shrink-0 text-xs font-semibold text-foreground/70">
          {(s.full_name ?? s.email)[0].toUpperCase()}
        </div>
        <div className="min-w-0">
          {s.full_name && (
            <p className="text-sm font-medium text-foreground truncate">{s.full_name}</p>
          )}
          <p className={`text-xs text-muted-foreground truncate ${!s.full_name ? "text-sm text-foreground" : ""}`}>
            {s.email}
          </p>
          {s.is_manually_assigned && (
            <span className="text-[10px] text-muted-foreground/60">manual</span>
          )}
        </div>
      </div>

      {/* Plan */}
      <div className="flex items-center md:block">
        <span className="text-xs text-muted-foreground md:hidden mr-2 w-20">Plan:</span>
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${PLAN_COLORS[s.plan_type]}`}>
          {PLAN_LABELS[s.plan_type]}
          <span className="ml-1 opacity-60">{PLAN_PRICES[s.plan_type]}</span>
        </span>
      </div>

      {/* Status */}
      <div className="flex items-center md:block">
        <span className="text-xs text-muted-foreground md:hidden mr-2 w-20">Status:</span>
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_COLORS[s.status]}`}>
          {isTrialExpired && <AlertTriangle className="w-3 h-3" />}
          {s.status.charAt(0).toUpperCase() + s.status.slice(1)}
        </span>
      </div>

      {/* Stripe ID */}
      <div className="flex items-center md:block">
        <span className="text-xs text-muted-foreground md:hidden mr-2 w-20">Stripe:</span>
        {s.stripe_subscription_id ? (
          <span className="text-[10px] font-mono text-muted-foreground truncate block max-w-[100px]" title={s.stripe_subscription_id}>
            {s.stripe_subscription_id.slice(0, 14)}...
          </span>
        ) : (
          <span className="text-xs text-muted-foreground/40">—</span>
        )}
      </div>

      {/* Subscribed date */}
      <div className="flex items-center md:block">
        <span className="text-xs text-muted-foreground md:hidden mr-2 w-20">Subscribed:</span>
        <span className="text-xs text-muted-foreground">
          {s.subscribed_at
            ? format(parseISO(s.subscribed_at), "MMM d, yyyy")
            : format(parseISO(s.created_at), "MMM d, yyyy")}
        </span>
      </div>

      {/* Trial ends */}
      <div className="flex items-center md:block">
        <span className="text-xs text-muted-foreground md:hidden mr-2 w-20">Trial ends:</span>
        {s.trial_ends_at ? (
          <span className={`text-xs ${isTrialExpired ? "text-red-400" : "text-blue-400"}`}>
            {format(parseISO(s.trial_ends_at), "MMM d, yyyy")}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground/40">—</span>
        )}
      </div>

      {/* Credits */}
      <div className="flex items-center md:block">
        <span className="text-xs text-muted-foreground md:hidden mr-2 w-20">Credits:</span>
        {hasCredits ? (
          <button
            onClick={onRecharge}
            title="Click to recharge credits"
            className="group flex flex-col gap-0.5 text-left hover:opacity-80 transition-opacity"
          >
            <span className={`text-xs font-medium tabular-nums ${pct >= 90 ? "text-red-400" : pct >= 75 ? "text-amber-400" : "text-foreground"}`}>
              {creditsBalance}/{creditsCap}
            </span>
            <div className="w-16 h-1 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${pct >= 90 ? "bg-red-400" : pct >= 75 ? "bg-amber-400" : "bg-primary"}`}
                style={{ width: `${100 - pct}%` }}
              />
            </div>
          </button>
        ) : (
          <button
            onClick={onRecharge}
            title="Click to recharge credits"
            className="text-xs text-muted-foreground/40 hover:text-muted-foreground transition-colors"
          >
            No record
          </button>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 justify-end">
        <Button variant="ghost" size="sm" onClick={onEdit} className="h-7 w-7 p-0">
          <Edit2 className="w-3.5 h-3.5" />
        </Button>
        <Button variant="ghost" size="sm" onClick={onRecharge} title="Recharge credits" className="h-7 w-7 p-0 text-amber-400 hover:text-amber-300 hover:bg-amber-500/10">
          <Zap className="w-3.5 h-3.5" />
        </Button>
        {s.status !== "inactive" && s.status !== "canceled" && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onDeactivate}
            className="h-7 w-7 p-0 text-red-400 hover:text-red-300 hover:bg-red-500/10"
          >
            <UserX className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}
