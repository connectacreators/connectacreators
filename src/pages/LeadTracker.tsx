import { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useClients } from "@/hooks/useClients";
import { supabase } from "@/integrations/supabase/client";
import { PieChart, Pie, Cell, ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ArrowLeft,
  Loader2,
  RefreshCw,
  Search,
  Phone,
  Mail,
  Calendar,
  ExternalLink,
  Users,
  Save,
  LayoutList,
  Table2,
  TrendingUp,
  Clock,
  Trash2,
} from "lucide-react";
import { useTheme } from "@/hooks/useTheme";
import { useLanguage } from "@/hooks/useLanguage";
import { t, tr } from "@/i18n/translations";
import { toast } from "sonner";
import { useSubscriptionGuard } from "@/hooks/useSubscriptionGuard";

type Lead = {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  leadStatus: string;
  leadSource: string;
  client: string;
  campaignName: string;
  notes: string;
  createdDate: string;
  lastContacted: string;
  appointmentDate: string;
  bookingTime?: string;
  booked?: boolean;
  notionUrl: string;
};

const STATUS_COLORS: Record<string, string> = {
  "New Lead":    "bg-[rgba(8,145,178,0.15)] text-[#22d3ee] border-[rgba(8,145,178,0.30)]",
  "Follow-up 1": "bg-[rgba(132,204,22,0.15)] text-[#84CC16] border-[rgba(132,204,22,0.30)]",
  "Follow-up 2": "bg-[rgba(8,145,178,0.15)] text-[#22d3ee] border-[rgba(8,145,178,0.30)]",
  "Follow-up 3": "bg-pink-500/15 text-pink-400 border-pink-500/30",
  "Booked":      "bg-[rgba(132,204,22,0.15)] text-[#84CC16] border-[rgba(132,204,22,0.30)]",
  "Canceled":    "bg-red-500/15 text-red-400 border-red-500/30",
};

const SOURCE_COLORS: Record<string, string> = {
  "Meta Ads": "bg-blue-500/15 text-blue-400",
  "Google Ads": "bg-red-500/15 text-red-400",
  Website: "bg-purple-500/15 text-purple-400",
  Referral: "bg-emerald-500/15 text-emerald-400",
  Organic: "bg-cyan-500/15 text-cyan-400",
  Other: "bg-gray-500/15 text-gray-400",
};

const ALLOWED_STATUSES = ["New Lead", "Follow-up 1", "Follow-up 2", "Follow-up 3", "Booked", "Canceled"];

export default function LeadTracker() {
  const { clientId: urlClientId } = useParams<{ clientId?: string }>();
  const { checking: subscriptionChecking } = useSubscriptionGuard();
  const { theme } = useTheme();
  const { language } = useLanguage();
  const { user, loading: authLoading, isAdmin, isVideographer } = useAuth();
  const isStaff = isAdmin || isVideographer;
  const { clients } = useClients(isStaff);
  const navigate = useNavigate();

  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [selectedClient, setSelectedClient] = useState<string>("all");
  const [statusOptions, setStatusOptions] = useState<string[]>([]);
  const [sourceOptions, setSourceOptions] = useState<string[]>([]);
  const [dateFilter, setDateFilter] = useState<"all" | "today" | "week" | "month" | "custom">("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Auto-select client from URL param
  useEffect(() => {
    if (!urlClientId || clients.length === 0) return;
    const target = clients.find((c) => c.id === urlClientId);
    if (target) setSelectedClient((target as any).notion_lead_name || target.name);
  }, [urlClientId, clients]);

  // Modal state
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [newStatus, setNewStatus] = useState("");
  const [saving, setSaving] = useState(false);

  // Notes state
  const [notesText, setNotesText] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);

  // Delete state
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // View mode state (with localStorage persistence)
  const [viewMode, setViewMode] = useState<"cards" | "table" | "chart">(() => {
    return (localStorage.getItem("leadTrackerViewMode") as "cards" | "table" | "chart") || "cards";
  });

  const toggleView = (mode: "cards" | "table" | "chart") => {
    setViewMode(mode);
    localStorage.setItem("leadTrackerViewMode", mode);
  };

  // (Lead notifications are now handled globally by LeadNotificationProvider)

  const fetchLeads = useCallback(async (clientName?: string, clientId?: string, silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const params = new URLSearchParams();
      if (clientId) {
        params.set("client_id", clientId);
      } else if (clientName && clientName !== "all") {
        params.set("client_name", clientName);
      }

      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fetch-leads?${params.toString()}`;
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Error ${res.status}`);
      }

      const result = await res.json();
      const fetchedLeads: Lead[] = (result.leads || []).sort((a: Lead, b: Lead) => {
        const dateA = a.createdDate ? new Date(a.createdDate).getTime() : 0;
        const dateB = b.createdDate ? new Date(b.createdDate).getTime() : 0;
        return dateB - dateA;
      });

      setLeads(fetchedLeads);
      if (result.statusOptions) setStatusOptions(result.statusOptions);
      if (result.sourceOptions) setSourceOptions(result.sourceOptions);
    } catch (e: any) {
      console.error("Error fetching leads:", e);
      if (!silent) setError(e.message || "Error loading leads");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && user) {
      if (isStaff) {
        // When viewing a specific client's leads (from /clients/:id/leads), pass client_id directly
        fetchLeads(selectedClient !== "all" ? selectedClient : undefined, urlClientId || undefined);
      } else {
        fetchLeads();
      }
    }
  }, [authLoading, user, isStaff, selectedClient, urlClientId, fetchLeads]);

  // Auto-refresh every 2 minutes
  useEffect(() => {
    if (!user || authLoading) return;
    const interval = setInterval(() => {
      if (isStaff) {
        fetchLeads(selectedClient !== "all" ? selectedClient : undefined, urlClientId || undefined, true);
      } else {
        fetchLeads(undefined, undefined, true);
      }
    }, 120_000);
    return () => clearInterval(interval);
  }, [user, authLoading, isStaff, selectedClient, urlClientId, fetchLeads]);

  const openLeadDetail = (lead: Lead) => {
    setSelectedLead(lead);
    setNewStatus(lead.leadStatus);
    setNotesText(lead.notes || "");
    setModalOpen(true);
  };

  const handleSaveNotes = async () => {
    if (!selectedLead) return;
    const trimmed = notesText.trim();
    if (trimmed === (selectedLead.notes || "")) return; // no change
    setSavingNotes(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/update-lead-notes`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ leadId: selectedLead.id, notes: trimmed, clientId: urlClientId }),
        }
      );

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Error ${res.status}`);
      }

      // Update local state so the card view reflects the new notes immediately
      setLeads((prev) => prev.map((l) => l.id === selectedLead.id ? { ...l, notes: trimmed } : l));
      setSelectedLead((prev) => prev ? { ...prev, notes: trimmed } : prev);
      toast.success(tr({ en: "Notes saved", es: "Notas guardadas" }, language));
    } catch (e: any) {
      console.error("Error saving notes:", e);
      toast.error(tr({ en: "Failed to save notes", es: "Error al guardar las notas" }, language));
    } finally {
      setSavingNotes(false);
    }
  };

  const handleSaveStatus = async () => {
    if (!selectedLead || newStatus === selectedLead.leadStatus) {
      setModalOpen(false);
      return;
    }
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/update-lead-status`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ leadId: selectedLead.id, newStatus, clientId: urlClientId }),
        }
      );

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Error ${res.status}`);
      }

      toast.success(tr(t.leadDetail.statusUpdated, language));
      setModalOpen(false);
      isStaff
        ? fetchLeads(selectedClient !== "all" ? selectedClient : undefined, urlClientId || undefined)
        : fetchLeads();
    } catch (e: any) {
      console.error("Error updating status:", e);
      toast.error(tr(t.leadDetail.statusError, language));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteLead = async (lead: Lead, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirmDeleteId !== lead.id) {
      setConfirmDeleteId(lead.id);
      // Auto-reset confirmation after 4s if not acted on
      setTimeout(() => setConfirmDeleteId(null), 4000);
      return;
    }
    setDeleting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/delete-lead`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session?.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ leadId: lead.id }),
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Delete failed");
      }
      setLeads((prev) => prev.filter((l) => l.id !== lead.id));
      toast.success(language === "en" ? "Lead deleted" : "Lead eliminado");
      setConfirmDeleteId(null);
      if (modalOpen && selectedLead?.id === lead.id) setModalOpen(false);
    } catch (e: any) {
      toast.error(e.message || "Error deleting lead");
    } finally {
      setDeleting(false);
    }
  };

  if (authLoading || subscriptionChecking) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    navigate("/dashboard");
    return null;
  }

  // Date filter helper.
  // Notion returns date-only strings like "2026-03-11" which JS parses as UTC midnight.
  // In negative-offset timezones (e.g. Mexico UTC-6) that shifts to the previous day locally,
  // breaking "today" and "this month" filters. Parse date-only strings as LOCAL time instead.
  const parseLocalDate = (s: string): Date => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      const [yr, mo, dy] = s.split("-").map(Number);
      return new Date(yr, mo - 1, dy);
    }
    return new Date(s);
  };
  const matchesDate = (dateStr: string | null | undefined): boolean => {
    if (dateFilter === "all") return true;
    if (!dateStr) return false;
    const d = parseLocalDate(dateStr);
    const now = new Date();
    if (dateFilter === "today") return d.toDateString() === now.toDateString();
    if (dateFilter === "week") { const ago = new Date(now); ago.setDate(now.getDate() - 7); return d >= ago; }
    if (dateFilter === "month") return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    if (dateFilter === "custom") {
      if (dateFrom) { const from = parseLocalDate(dateFrom); if (d < from) return false; }
      if (dateTo) { const to = parseLocalDate(dateTo); to.setHours(23, 59, 59); if (d > to) return false; }
      return true;
    }
    return true;
  };

  // Filters
  const filtered = leads.filter((lead) => {
    const matchesSearch =
      !searchTerm ||
      lead.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lead.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lead.phone.includes(searchTerm);
    const matchesStatus = statusFilter === "all" || lead.leadStatus === statusFilter;
    const matchesSource = sourceFilter === "all" || lead.leadSource === sourceFilter;
    return matchesSearch && matchesStatus && matchesSource && matchesDate(lead.createdDate);
  });

  const statuses = statusOptions.length > 0 ? statusOptions : [...new Set(leads.map((l) => l.leadStatus).filter(Boolean))];
  const sources = sourceOptions.length > 0 ? sourceOptions : [...new Set(leads.map((l) => l.leadSource).filter(Boolean))];

  // Stats — reflect active filters (date + search + status + source)
  const totalLeads = filtered.length;
  const bookedCount = filtered.filter((l) => l.leadStatus === "Booked").length;
  const pendingCount = filtered.filter((l) => l.leadStatus !== "Appointment Booked" && l.leadStatus !== "Canceled").length;
  const conversionRate = totalLeads > 0 ? ((bookedCount / totalLeads) * 100).toFixed(1) : "0.0";

  // Month-over-month deltas
  const now = new Date();
  const thisMonthLeads = leads.filter((l) => {
    if (!l.createdDate) return false;
    const d = new Date(l.createdDate);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;
  const lastMonthLeads = leads.filter((l) => {
    if (!l.createdDate) return false;
    const d = new Date(l.createdDate);
    const prev = new Date(now.getFullYear(), now.getMonth() - 1);
    return d.getMonth() === prev.getMonth() && d.getFullYear() === prev.getFullYear();
  }).length;
  const totalDelta = lastMonthLeads > 0 ? Math.round(((thisMonthLeads - lastMonthLeads) / lastMonthLeads) * 100) : (thisMonthLeads > 0 ? 100 : 0);

  const thisMonthBooked = leads.filter((l) => {
    if (!l.createdDate || l.leadStatus !== "Appointment Booked") return false;
    const d = new Date(l.createdDate);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;
  const lastMonthBooked = leads.filter((l) => {
    if (!l.createdDate || l.leadStatus !== "Appointment Booked") return false;
    const d = new Date(l.createdDate);
    const prev = new Date(now.getFullYear(), now.getMonth() - 1);
    return d.getMonth() === prev.getMonth() && d.getFullYear() === prev.getFullYear();
  }).length;
  const bookedDelta = lastMonthBooked > 0 ? Math.round(((thisMonthBooked - lastMonthBooked) / lastMonthBooked) * 100) : (thisMonthBooked > 0 ? 100 : 0);

  const na = tr(t.leadDetail.noData, language);

  return (
    <>
    <main className="flex-1 overflow-y-auto">
      <div className="container mx-auto px-4 py-6 max-w-6xl">
        {/* Stats Grid — dark glass cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-8">
          {[
            {
              label: tr(t.leadTracker.totalLeads, language),
              value: totalLeads,
              icon: Users,
              iconColor: "#06b6d4",
              iconBg: "rgba(6,182,212,0.12)",
              delta: totalDelta,
              deltaLabel: language === "en" ? "from last month" : "vs mes anterior",
            },
            {
              label: tr(t.leadTracker.booked, language),
              value: bookedCount,
              icon: Calendar,
              iconColor: "#10b981",
              iconBg: "rgba(16,185,129,0.12)",
              delta: bookedDelta,
              deltaLabel: language === "en" ? "from last month" : "vs mes anterior",
            },
            {
              label: language === "en" ? "Pending" : "Pendientes",
              value: pendingCount,
              icon: Clock,
              iconColor: "#f59e0b",
              iconBg: "rgba(245,158,11,0.12)",
              delta: null,
              deltaLabel: language === "en" ? "in follow-up" : "en seguimiento",
            },
            {
              label: language === "en" ? "Conv. Rate" : "Conversión",
              value: `${conversionRate}%`,
              icon: TrendingUp,
              iconColor: "#a78bfa",
              iconBg: "rgba(167,139,250,0.12)",
              delta: null,
              deltaLabel: language === "en" ? "booked / total" : "reservados / total",
            },
          ].map((card, i) => {
            const Icon = card.icon;
            const isPositive = (card.delta ?? 0) >= 0;
            const isLight = theme === "light";
            return (
              <div
                key={i}
                className="relative rounded-2xl p-4 md:p-5 flex flex-col gap-3 transition-all duration-300"
                style={{
                  background: isLight ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.04)",
                  backdropFilter: "blur(16px)",
                  WebkitBackdropFilter: "blur(16px)",
                  border: isLight ? "1px solid rgba(0,0,0,0.10)" : "1px solid rgba(255,255,255,0.07)",
                  boxShadow: isLight
                    ? "0 4px 24px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.8)"
                    : "0 4px 24px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.06)",
                }}
              >
                {/* Top row: label + icon */}
                <div className="flex items-start justify-between">
                  <p className="text-[11px] font-medium tracking-wide" style={{ color: isLight ? "rgba(0,0,0,0.5)" : "rgba(255,255,255,0.45)" }}>
                    {card.label}
                  </p>
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: card.iconBg }}>
                    <Icon className="w-4 h-4" style={{ color: card.iconColor }} />
                  </div>
                </div>

                {/* Value */}
                <p className="text-3xl md:text-4xl font-bold tracking-tight leading-none" style={{ color: isLight ? "rgba(0,0,0,0.85)" : "#ffffff" }}>
                  {card.value}
                </p>

                {/* Bottom trend row */}
                <div className="flex items-center gap-1.5">
                  {card.delta !== null ? (
                    <>
                      <TrendingUp className="w-3 h-3 flex-shrink-0" style={{ color: isPositive ? "#10b981" : "#f87171" }} />
                      <span className="text-[11px] font-semibold" style={{ color: isPositive ? "#10b981" : "#f87171" }}>
                        {isPositive ? "+" : ""}{card.delta}%
                      </span>
                      <span className="text-[11px]" style={{ color: isLight ? "rgba(0,0,0,0.4)" : "rgba(255,255,255,0.3)" }}>
                        {card.deltaLabel}
                      </span>
                    </>
                  ) : (
                    <span className="text-[11px]" style={{ color: isLight ? "rgba(0,0,0,0.4)" : "rgba(255,255,255,0.3)" }}>
                      {card.deltaLabel}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Filters Section */}
        <div className="bg-card/50 border border-border/50 rounded-xl p-3 backdrop-blur-sm mb-8">
          <div className="flex flex-col sm:flex-row sm:flex-nowrap sm:items-center gap-2 sm:overflow-x-auto">
            {isStaff && (
              <Select value={selectedClient} onValueChange={setSelectedClient}>
                <SelectTrigger className="w-full sm:w-[150px] sm:flex-shrink-0 bg-background/50 border-border/50">
                  <Users className="w-4 h-4 mr-1.5" />
                  <SelectValue placeholder="Cliente" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{tr(t.leadTracker.allClients, language)}</SelectItem>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={(c as any).notion_lead_name || c.name}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <div className="relative flex-1 min-w-[140px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder={tr(t.leadTracker.searchPlaceholder, language)}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 bg-background/50 border-border/50"
              />
            </div>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[140px] sm:flex-shrink-0 bg-background/50 border-border/50">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{tr(t.leadTracker.allStatuses, language)}</SelectItem>
                {statuses.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={sourceFilter} onValueChange={setSourceFilter}>
              <SelectTrigger className="w-full sm:w-[130px] sm:flex-shrink-0 bg-background/50 border-border/50">
                <SelectValue placeholder="Fuente" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{tr(t.leadTracker.allSources, language)}</SelectItem>
                {sources.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Date filter */}
            <Select value={dateFilter} onValueChange={(v) => setDateFilter(v as typeof dateFilter)}>
              <SelectTrigger className="w-full sm:w-[130px] sm:flex-shrink-0 bg-background/50 border-border/50">
                <Calendar className="w-4 h-4 mr-1.5 flex-shrink-0" />
                <SelectValue placeholder="Date" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{language === "en" ? "All time" : "Todo el tiempo"}</SelectItem>
                <SelectItem value="today">{language === "en" ? "Today" : "Hoy"}</SelectItem>
                <SelectItem value="week">{language === "en" ? "Last 7 days" : "Últimos 7 días"}</SelectItem>
                <SelectItem value="month">{language === "en" ? "This month" : "Este mes"}</SelectItem>
                <SelectItem value="custom">{language === "en" ? "Custom range" : "Rango personalizado"}</SelectItem>
              </SelectContent>
            </Select>

            {dateFilter === "custom" && (
              <>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-full sm:w-[130px] sm:flex-shrink-0 bg-background/50 border-border/50 text-xs"
                  placeholder="From"
                />
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-full sm:w-[130px] sm:flex-shrink-0 bg-background/50 border-border/50 text-xs"
                  placeholder="To"
                />
              </>
            )}

            {/* View toggle: Cards / Table / Chart */}
            <div className="flex items-center border border-cyan-400/30 bg-gradient-to-r from-cyan-500/10 to-teal-500/10 rounded-lg overflow-hidden flex-shrink-0 ml-auto">
              <button
                onClick={() => toggleView("cards")}
                className={`px-3 py-2 text-sm transition-all border-r border-cyan-400/20 ${viewMode === "cards" ? "bg-cyan-500/20 text-cyan-300" : "text-muted-foreground hover:text-foreground"}`}
                title="Card view"
              >
                <LayoutList className="w-4 h-4" />
              </button>
              <button
                onClick={() => toggleView("table")}
                className={`px-3 py-2 text-sm transition-all border-r border-cyan-400/20 ${viewMode === "table" ? "bg-teal-500/20 text-teal-300" : "text-muted-foreground hover:text-foreground"}`}
                title="Table view"
              >
                <Table2 className="w-4 h-4" />
              </button>
              <button
                onClick={() => toggleView("chart")}
                className={`px-3 py-2 text-sm transition-all ${viewMode === "chart" ? "bg-violet-500/20 text-violet-300" : "text-muted-foreground hover:text-foreground"}`}
                title="Analytics view"
              >
                <TrendingUp className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 mb-6 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Leads list */}
        {!loading && filtered.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            {leads.length === 0 ? tr(t.leadTracker.noLeads, language) : tr(t.leadTracker.noResults, language)}
          </div>
        )}

        {!loading && filtered.length > 0 && viewMode === "cards" && (
          <div className="space-y-3">
            {filtered.map((lead) => (
              <div
                key={lead.id}
                onClick={() => openLeadDetail(lead)}
                className="glass-card rounded-xl p-5 hover:border-[rgba(8,145,178,0.5)] hover:shadow-lg hover:shadow-[rgba(8,145,178,0.1)] transition-all duration-300 cursor-pointer"
              >
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  {/* Name & badges */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <h3 className="font-semibold text-foreground truncate">{lead.fullName || tr(t.leadTracker.noName, language)}</h3>
                      {lead.leadStatus && (
                        <Badge
                          variant="outline"
                          className={`text-[10px] px-1.5 py-0 ${STATUS_COLORS[lead.leadStatus] || "bg-muted text-muted-foreground"}`}
                        >
                          {lead.leadStatus}
                        </Badge>
                      )}
                      {lead.leadSource && (
                        <Badge
                          variant="secondary"
                          className={`text-[10px] px-1.5 py-0 ${SOURCE_COLORS[lead.leadSource] || ""}`}
                        >
                          {lead.leadSource}
                        </Badge>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      {lead.email && (
                        <span className="flex items-center gap-1">
                          <Mail className="w-3 h-3" />
                          {lead.email}
                        </span>
                      )}
                      {lead.createdDate && (
                        <span className="flex items-center gap-1 text-green-400 font-medium">
                          <Calendar className="w-3 h-3" />
                          📅 {new Date(lead.createdDate).toLocaleDateString("es-MX")}
                        </span>
                      )}
                      {lead.campaignName && (
                        <span className="text-primary/70">📢 {lead.campaignName}</span>
                      )}
                    </div>

                    {lead.notes && (
                      <p className="text-xs text-muted-foreground/70 mt-1 line-clamp-1">
                        💬 {lead.notes}
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                    {isStaff && lead.client && (
                      <Badge variant="outline" className="text-[10px]">
                        {lead.client}
                      </Badge>
                    )}
                    {isAdmin && lead.notionUrl && (
                      <a
                        href={lead.notionUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-muted-foreground hover:text-primary transition-colors"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    )}
                    {lead.phone && (
                      <a
                        href={`tel:${lead.phone}`}
                        className="flex items-center gap-1.5 text-primary hover:text-primary/80 transition-colors font-semibold text-sm"
                      >
                        <Phone className="w-4 h-4" />
                        {lead.phone}
                      </a>
                    )}
                    {/* Delete button — two-step confirm */}
                    <button
                      onClick={(e) => handleDeleteLead(lead, e)}
                      disabled={deleting && confirmDeleteId === lead.id}
                      className={`flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-md transition-all ${
                        confirmDeleteId === lead.id
                          ? "bg-red-500/20 text-red-400 border border-red-500/40 hover:bg-red-500/30"
                          : "text-muted-foreground/50 hover:text-red-400 hover:bg-red-500/10"
                      }`}
                      title={confirmDeleteId === lead.id ? "Click again to confirm delete" : "Delete lead"}
                    >
                      {deleting && confirmDeleteId === lead.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="w-3.5 h-3.5" />
                      )}
                      {confirmDeleteId === lead.id && <span>Confirm?</span>}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && viewMode === "chart" && (
          (() => {
            // Status breakdown for pie chart
            const statusCounts = leads.reduce((acc, l) => {
              const s = l.leadStatus || "Unknown";
              acc[s] = (acc[s] || 0) + 1;
              return acc;
            }, {} as Record<string, number>);
            const pieData = Object.entries(statusCounts).map(([name, value]) => ({ name, value }));
            const PIE_COLORS = ["#06b6d4", "#10b981", "#f59e0b", "#a78bfa", "#f87171", "#fb923c"];

            // Daily leads last 30 days
            const days = Array.from({ length: 30 }, (_, i) => {
              const d = new Date();
              d.setDate(d.getDate() - (29 - i));
              return d.toISOString().split("T")[0];
            });
            const lineData = days.map((date) => ({
              date: date.slice(5),
              leads: leads.filter((l) => l.createdDate?.startsWith(date)).length,
              booked: leads.filter((l) => l.createdDate?.startsWith(date) && l.leadStatus === "Booked").length,
            }));

            // Source breakdown
            const sourceCounts = leads.reduce((acc, l) => {
              const s = l.leadSource || "Unknown";
              acc[s] = (acc[s] || 0) + 1;
              return acc;
            }, {} as Record<string, number>);
            const sourceData = Object.entries(sourceCounts).map(([name, value]) => ({ name, value }));

            return (
              <div className="space-y-6">
                {leads.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">{tr(t.leadTracker.noLeads, language)}</div>
                ) : (
                  <>
                    {/* Row 1: Status pie + Source pie */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="rounded-xl border border-border/50 bg-card/50 backdrop-blur-sm p-5">
                        <h3 className="text-sm font-semibold mb-4 text-foreground">Status Breakdown</h3>
                        <ResponsiveContainer width="100%" height={220}>
                          <PieChart>
                            <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false} fontSize={10}>
                              {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                            </Pie>
                            <Tooltip />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="rounded-xl border border-border/50 bg-card/50 backdrop-blur-sm p-5">
                        <h3 className="text-sm font-semibold mb-4 text-foreground">Source Breakdown</h3>
                        <ResponsiveContainer width="100%" height={220}>
                          <PieChart>
                            <Pie data={sourceData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false} fontSize={10}>
                              {sourceData.map((_, i) => <Cell key={i} fill={PIE_COLORS[(i + 2) % PIE_COLORS.length]} />)}
                            </Pie>
                            <Tooltip />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* Row 2: Leads over time line chart */}
                    <div className="rounded-xl border border-border/50 bg-card/50 backdrop-blur-sm p-5">
                      <h3 className="text-sm font-semibold mb-4 text-foreground">Leads — Last 30 Days</h3>
                      <ResponsiveContainer width="100%" height={220}>
                        <LineChart data={lineData} margin={{ top: 4, right: 8, left: -20, bottom: 4 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                          <XAxis dataKey="date" tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }} tickLine={false} interval={4} />
                          <YAxis tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }} tickLine={false} allowDecimals={false} />
                          <Tooltip contentStyle={{ background: "rgba(15,15,15,0.9)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }} />
                          <Legend wrapperStyle={{ fontSize: 11 }} />
                          <Line type="monotone" dataKey="leads" stroke="#06b6d4" strokeWidth={2} dot={false} name="New Leads" />
                          <Line type="monotone" dataKey="booked" stroke="#10b981" strokeWidth={2} dot={false} name="Booked" />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </>
                )}
              </div>
            );
          })()
        )}

        {!loading && filtered.length > 0 && viewMode === "table" && (
          <div className="overflow-x-auto rounded-xl border border-border/50 bg-card/50 backdrop-blur-sm">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Campaign</TableHead>
                  {isStaff && <TableHead>Client</TableHead>}
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((lead, idx) => (
                  <TableRow
                    key={lead.id}
                    onClick={() => openLeadDetail(lead)}
                    className="cursor-pointer hover:bg-accent/10"
                  >
                    <TableCell className="text-muted-foreground text-xs">{idx + 1}</TableCell>
                    <TableCell className="font-medium">{lead.fullName || na}</TableCell>
                    <TableCell>
                      {lead.leadStatus && (
                        <Badge variant="outline" className={`text-[10px] ${STATUS_COLORS[lead.leadStatus] || "bg-muted text-muted-foreground"}`}>
                          {lead.leadStatus}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {lead.leadSource && (
                        <Badge variant="secondary" className={`text-[10px] ${SOURCE_COLORS[lead.leadSource] || ""}`}>
                          {lead.leadSource}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[140px] truncate">{lead.email || na}</TableCell>
                    <TableCell className="text-xs">
                      {lead.phone ? (
                        <a href={`tel:${lead.phone}`} onClick={(e) => e.stopPropagation()} className="text-primary hover:underline">
                          {lead.phone}
                        </a>
                      ) : (
                        na
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {lead.createdDate ? new Date(lead.createdDate).toLocaleDateString("es-MX") : na}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[120px] truncate">{lead.campaignName || ""}</TableCell>
                    {isStaff && <TableCell className="text-xs">{lead.client || ""}</TableCell>}
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={(e) => handleDeleteLead(lead, e)}
                        disabled={deleting && confirmDeleteId === lead.id}
                        className={`flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-md transition-all ${
                          confirmDeleteId === lead.id
                            ? "bg-red-500/20 text-red-400 border border-red-500/40"
                            : "text-muted-foreground/40 hover:text-red-400 hover:bg-red-500/10"
                        }`}
                        title={confirmDeleteId === lead.id ? "Click again to confirm" : "Delete lead"}
                      >
                        {deleting && confirmDeleteId === lead.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" />
                        )}
                        {confirmDeleteId === lead.id && <span>Sure?</span>}
                      </button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
      </main>

      {/* Lead Detail Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-md bg-card/95 border border-cyan-400/20 backdrop-blur-xl">
          <DialogHeader>
            <DialogTitle>{tr(t.leadDetail.title, language)}</DialogTitle>
          </DialogHeader>

          {selectedLead && (
            <div className="space-y-4">
              {/* Info rows */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs">{tr(t.leadDetail.fullName, language)}</p>
                  <p className="font-medium text-foreground">{selectedLead.fullName || na}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">{tr(t.leadDetail.email, language)}</p>
                  <p className="font-medium text-foreground">{selectedLead.email || na}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">{tr(t.leadDetail.phone, language)}</p>
                  {selectedLead.phone ? (
                    <a href={`tel:${selectedLead.phone}`} className="font-medium text-primary hover:underline">
                      {selectedLead.phone}
                    </a>
                  ) : (
                    <p className="font-medium text-foreground">{na}</p>
                  )}
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">{tr(t.leadDetail.source, language)}</p>
                  <p className="font-medium text-foreground">{selectedLead.leadSource || na}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">{tr(t.leadDetail.client, language)}</p>
                  <p className="font-medium text-foreground">{selectedLead.client || na}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">{tr(t.leadDetail.campaign, language)}</p>
                  <p className="font-medium text-foreground">{selectedLead.campaignName || na}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">{tr(t.leadDetail.date, language)}</p>
                  <p className="font-medium text-foreground">
                    {selectedLead.createdDate ? new Date(selectedLead.createdDate).toLocaleDateString() : na}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">{tr(t.leadDetail.lastContacted, language)}</p>
                  <p className="font-medium text-foreground">
                    {selectedLead.lastContacted ? new Date(selectedLead.lastContacted).toLocaleDateString() : na}
                  </p>
                </div>
              </div>

              {/* Notes — editable */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-muted-foreground text-xs">{tr(t.leadDetail.notes, language)}</p>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-xs text-primary hover:bg-primary/10"
                    disabled={savingNotes || notesText.trim() === (selectedLead.notes || "")}
                    onClick={handleSaveNotes}
                  >
                    {savingNotes ? (
                      <><Loader2 className="w-3 h-3 mr-1 animate-spin" />{tr({ en: "Saving...", es: "Guardando..." }, language)}</>
                    ) : (
                      <><Save className="w-3 h-3 mr-1" />{tr({ en: "Save notes", es: "Guardar notas" }, language)}</>
                    )}
                  </Button>
                </div>
                <Textarea
                  value={notesText}
                  onChange={(e) => setNotesText(e.target.value)}
                  placeholder={tr({ en: "Add notes about this lead...", es: "Agregar notas sobre este lead..." }, language)}
                  className="text-sm min-h-[80px] resize-none bg-muted/30 border-border/60 focus:border-primary/60"
                  rows={3}
                />
              </div>

              {/* Status dropdown */}
              <div>
                <p className="text-muted-foreground text-xs mb-1.5">{tr(t.leadDetail.changeStatus, language)}</p>
                <Select value={newStatus} onValueChange={setNewStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ALLOWED_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        <span className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${
                            s === "Booked" ? "bg-green-400" :
                            s === "Canceled" ? "bg-red-400" :
                            s === "Follow-up 1" ? "bg-orange-400" :
                            s === "Follow-up 2" ? "bg-blue-400" :
                            s === "Follow-up 3" ? "bg-pink-400" : "bg-yellow-400"
                          }`} />
                          {s}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Admin: Notion link */}
              {isAdmin && selectedLead.notionUrl && (
                <a
                  href={selectedLead.notionUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors"
                >
                  <ExternalLink className="w-3 h-3" />
                  {tr(t.leadDetail.openInNotion, language)}
                </a>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)} size="sm">
              {tr(t.leadDetail.close, language)}
            </Button>
            <Button onClick={handleSaveStatus} disabled={saving || newStatus === selectedLead?.leadStatus} size="sm">
              {saving ? (
                <>
                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                  {tr(t.leadDetail.saving, language)}
                </>
              ) : (
                <>
                  <Save className="w-3 h-3 mr-1" />
                  {tr(t.leadDetail.save, language)}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
