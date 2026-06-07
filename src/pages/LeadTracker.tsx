import { useState, useEffect, useCallback } from "react";
import PageTransition from "@/components/PageTransition";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useClients } from "@/hooks/useClients";
import { supabase } from "@/integrations/supabase/client";
import { readCache, writeCache } from "@/lib/sessionCache";
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
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  ArrowLeft,
  Loader2,
  RefreshCw,
  Search,
  Phone,
  Mail,
  Calendar,
  SlidersHorizontal,
  ExternalLink,
  Users,
  Save,
  LayoutList,
  Columns3,
  TrendingUp,
  Clock,
  Trash2,
  Plus,
  ArrowUpDown,
  Download,
} from "lucide-react";
import { useTheme } from "@/hooks/useTheme";
import { useLanguage } from "@/hooks/useLanguage";
import { t, tr } from "@/i18n/translations";
import { toast } from "sonner";

import { leadService } from "@/services/leadService";
import { checkResourceLimit } from "@/utils/planLimits";
import { KanbanBoard } from "@/components/leads/LeadKanbanBoard";
import { exportToCSV } from "@/utils/csvExport";

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
  "New Lead":            "bg-[hsl(var(--aqua) / 0.15)] text-[hsl(var(--aqua))] border-[hsl(var(--aqua) / 0.30)]",
  "Follow-up 1":         "bg-[rgba(132,204,22,0.15)] text-[hsl(var(--honey))] border-[rgba(132,204,22,0.30)]",
  "Follow-up 2":         "bg-[hsl(var(--aqua) / 0.15)] text-[hsl(var(--aqua))] border-[hsl(var(--aqua) / 0.30)]",
  "Follow-up 3":         "bg-pink-500/15 text-pink-400 border-pink-500/30",
  "Booked":              "bg-[rgba(245,158,11,0.15)] text-[#F59E0B] border-[rgba(245,158,11,0.30)]",
  "Appointment Booked":  "bg-[rgba(245,158,11,0.15)] text-[#F59E0B] border-[rgba(245,158,11,0.30)]",
  "Closed":              "bg-[rgba(148,163,184,0.12)] text-[#94a3b8] border-[rgba(148,163,184,0.25)]",
  "Won":                 "bg-[rgba(148,163,184,0.12)] text-[#94a3b8] border-[rgba(148,163,184,0.25)]",
  "Canceled":            "bg-red-500/15 text-red-400 border-red-500/30",
};

// A lead counts as "booked" when it has a booking slot (appointmentDate set) OR
// when its status string matches either the canonical "Booked" or the legacy
// Notion label "Appointment Booked". The appointmentDate signal is the reliable
// one — it's set when public-booking creates the slot — so it catches legacy
// leads whose status never synced. Canceled leads are excluded.
const BOOKED_STATUSES = new Set(["Booked", "Appointment Booked"]);
const CANCELED_STATUSES = new Set(["Canceled"]);
const isCanceledStatus = (status?: string) => !!status && CANCELED_STATUSES.has(status);
const isBookedLead = (lead: { leadStatus?: string; appointmentDate?: string; booked?: boolean }) => {
  if (isCanceledStatus(lead.leadStatus)) return false;
  return !!lead.appointmentDate || !!lead.booked || (!!lead.leadStatus && BOOKED_STATUSES.has(lead.leadStatus));
};

const SOURCE_COLORS: Record<string, string> = {
  "Meta Ads": "bg-blue-500/15 text-blue-400",
  "Google Ads": "bg-red-500/15 text-red-400",
  Website: "bg-purple-500/15 text-purple-400",
  Referral: "bg-emerald-500/15 text-emerald-400",
  Organic: "bg-primary/15 text-primary",
  Other: "bg-gray-500/15 text-gray-400",
};

const ALLOWED_STATUSES = ["New Lead", "Follow-up 1", "Follow-up 2", "Follow-up 3", "Booked", "Canceled"];

/** Strip the "db_" prefix added by fetch-leads edge function to get the real Supabase UUID */
const stripDbPrefix = (id: string) => id.startsWith("db_") ? id.slice(3) : id;

export default function LeadTracker() {
  const { clientId: urlClientId } = useParams<{ clientId?: string }>();

  const { theme } = useTheme();
  const { language } = useLanguage();
  const { user, loading: authLoading, isAdmin, isVideographer } = useAuth();
  const isStaff = isAdmin || isVideographer;

  const [ownClientId, setOwnClientId] = useState<string | null>(null);
  const [isSubscriber, setIsSubscriber] = useState(false);

  useEffect(() => {
    if (!user) return;
    // Junction table lookup
    supabase
      .from("subscriber_clients")
      .select("client_id, clients(id, plan_type)")
      .eq("subscriber_user_id", user.id)
      .eq("is_primary", true)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.client_id && data.clients) {
          const c = data.clients as any;
          setOwnClientId(c.id);
          const pt = c.plan_type;
          setIsSubscriber(pt === "starter" || pt === "growth" || pt === "enterprise");
        } else {
          // Fallback: direct lookup
          supabase.from("clients").select("id, plan_type").eq("user_id", user.id).maybeSingle()
            .then(({ data: fb }) => {
              if (fb) {
                setOwnClientId(fb.id);
                const pt = fb.plan_type;
                setIsSubscriber(pt === "starter" || pt === "growth" || pt === "enterprise");
              }
            });
        }
      });
  }, [user]);
  const { clients } = useClients(isStaff);
  const navigate = useNavigate();

  // Hydrate cached leads keyed by URL client (or "all" for global view).
  const leadCacheKey = `leads_${urlClientId || "all"}`;
  const cachedLeads = readCache<Lead[]>(leadCacheKey, []);
  const [leads, setLeads] = useState<Lead[]>(cachedLeads);
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
  const [sortMode, setSortMode] = useState<"recent" | "oldest" | "name" | "booked">("recent");

  // Auto-select client from URL param
  useEffect(() => {
    if (!urlClientId || clients.length === 0) return;
    const target = clients.find((c) => c.id === urlClientId);
    if (target) setSelectedClient(target.id);
  }, [urlClientId, clients]);

  // Modal state
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [newStatus, setNewStatus] = useState("");
  const [saving, setSaving] = useState(false);

  // Notes state
  const [notesText, setNotesText] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);

  // Booking date/time state for lead detail modal
  const [editBookingDate, setEditBookingDate] = useState("");
  const [editBookingTime, setEditBookingTime] = useState("");
  const [savingBooking, setSavingBooking] = useState(false);

  // Delete state
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // View mode state (with localStorage persistence)
  const [viewMode, setViewMode] = useState<"cards" | "kanban" | "chart">(() => {
    const stored = localStorage.getItem("leadTrackerViewMode");
    // Migrate legacy "table" preference → cards (table view was removed).
    if (stored === "table") return "cards";
    return (stored as "cards" | "kanban" | "chart") || "cards";
  });

  const toggleView = (mode: "cards" | "kanban" | "chart") => {
    setViewMode(mode);
    localStorage.setItem("leadTrackerViewMode", mode);
  };

  // Kanban drag-update tracking — keep a local optimistic status while the
  // backend roundtrip resolves so the card doesn't snap back to the old column.
  const [kanbanUpdatingId, setKanbanUpdatingId] = useState<string | null>(null);

  const updateLeadStatusInline = useCallback(async (leadId: string, newStatus: string) => {
    const lead = leads.find((l) => l.id === leadId);
    if (!lead || lead.leadStatus === newStatus) return;

    // Optimistic UI update
    setLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, leadStatus: newStatus } : l)));
    setKanbanUpdatingId(leadId);

    try {
      if (isSubscriber) {
        await leadService.updateLead(stripDbPrefix(leadId), { status: newStatus });
      } else {
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
            body: JSON.stringify({ leadId, newStatus, clientId: urlClientId }),
          },
        );
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `Error ${res.status}`);
        }
      }
      toast.success(tr(t.leadDetail.statusUpdated, language));
    } catch (e: any) {
      console.error("Error updating lead status:", e);
      toast.error(tr(t.leadDetail.statusError, language));
      // Roll back optimistic update
      setLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, leadStatus: lead.leadStatus } : l)));
    } finally {
      setKanbanUpdatingId(null);
    }
  }, [leads, isSubscriber, urlClientId, language]);

  // Add Lead dialog state
  const [showAddLead, setShowAddLead] = useState(false);
  const [addLeadForm, setAddLeadForm] = useState({
    name: "", email: "", phone: "", source: "", status: "New Lead",
    follow_up_step: 0, last_contacted_at: "", next_follow_up_at: "",
    booked: false, stopped: false, replied: false,
    booking_date: "", booking_time: "",
  });

  const resetAddLeadForm = () => setAddLeadForm({
    name: "", email: "", phone: "", source: "", status: "New Lead",
    follow_up_step: 0, last_contacted_at: "", next_follow_up_at: "",
    booked: false, stopped: false, replied: false,
    booking_date: "", booking_time: "",
  });

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
      writeCache(leadCacheKey, fetchedLeads);
      if (result.statusOptions) setStatusOptions(result.statusOptions);
      if (result.sourceOptions) setSourceOptions(result.sourceOptions);
    } catch (e: any) {
      console.error("Error fetching leads:", e);
      if (!silent) setError(e.message || "Error loading leads");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  const fetchSubscriberLeads = useCallback(async (silent = false) => {
    if (!ownClientId) return;
    if (!silent) setLoading(true);
    setError(null);
    try {
      const supaLeads = await leadService.getLeadsByClient(ownClientId);
      const normalized: Lead[] = supaLeads.map((sl) => ({
        id: sl.id,
        fullName: sl.name,
        email: sl.email || "",
        phone: sl.phone || "",
        leadStatus: sl.status,
        leadSource: sl.source || "",
        client: "",
        campaignName: "",
        notes: sl.notes || "",
        createdDate: sl.created_at,
        lastContacted: sl.last_contacted_at || "",
        appointmentDate: sl.booking_date || "",
        bookingTime: sl.booking_time || undefined,
        booked: sl.booked,
        notionUrl: "",
      }));
      setLeads(normalized.sort((a, b) => {
        const dateA = a.createdDate ? new Date(a.createdDate).getTime() : 0;
        const dateB = b.createdDate ? new Date(b.createdDate).getTime() : 0;
        return dateB - dateA;
      }));
      const statuses = [...new Set(normalized.map(l => l.leadStatus).filter(Boolean))];
      const sources = [...new Set(normalized.map(l => l.leadSource).filter(Boolean))];
      if (statuses.length) setStatusOptions(statuses);
      if (sources.length) setSourceOptions(sources);
    } catch (e: any) {
      console.error("Error fetching subscriber leads:", e);
      if (!silent) setError(e.message || "Error loading leads");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [ownClientId]);

  useEffect(() => {
    if (!authLoading && user) {
      if (isSubscriber) {
        fetchSubscriberLeads();
      } else if (isStaff) {
        fetchLeads(undefined, selectedClient !== "all" ? selectedClient : urlClientId || undefined);
      } else {
        fetchLeads();
      }
    }
  }, [authLoading, user, isSubscriber, isStaff, selectedClient, urlClientId, fetchLeads, fetchSubscriberLeads]);

  // Refresh when AI writes to leads
  useEffect(() => {
    const handler = (e: Event) => {
      const scope = (e as CustomEvent).detail?.scope as string;
      if (scope === "leads" || scope === "all") {
        if (isSubscriber) {
          fetchSubscriberLeads(true);
        } else if (isStaff) {
          fetchLeads(undefined, selectedClient !== "all" ? selectedClient : urlClientId || undefined, true);
        } else {
          fetchLeads(undefined, undefined, true);
        }
      }
    };
    window.addEventListener("ai:data-changed", handler);
    return () => window.removeEventListener("ai:data-changed", handler);
  }, [isSubscriber, isStaff, selectedClient, urlClientId, fetchLeads, fetchSubscriberLeads]);

  // Auto-refresh every 2 minutes
  useEffect(() => {
    if (!user || authLoading) return;
    const interval = setInterval(() => {
      if (isSubscriber) {
        fetchSubscriberLeads(true);
      } else if (isStaff) {
        fetchLeads(undefined, selectedClient !== "all" ? selectedClient : urlClientId || undefined, true);
      } else {
        fetchLeads(undefined, undefined, true);
      }
    }, 120_000);
    return () => clearInterval(interval);
  }, [user, authLoading, isSubscriber, isStaff, selectedClient, urlClientId, fetchLeads, fetchSubscriberLeads]);

  const openLeadDetail = (lead: Lead) => {
    setSelectedLead(lead);
    setNewStatus(lead.leadStatus);
    setNotesText(lead.notes || "");
    setEditBookingDate(lead.appointmentDate || "");
    setEditBookingTime(lead.bookingTime || "");
    setModalOpen(true);
  };

  const handleSaveNotes = async () => {
    if (!selectedLead) return;
    const trimmed = notesText.trim();
    if (trimmed === (selectedLead.notes || "")) return; // no change
    setSavingNotes(true);
    try {
      if (isSubscriber) {
        await leadService.updateLead(stripDbPrefix(selectedLead.id), { notes: trimmed });
        setLeads((prev) => prev.map((l) => l.id === selectedLead.id ? { ...l, notes: trimmed } : l));
        setSelectedLead((prev) => prev ? { ...prev, notes: trimmed } : prev);
        toast.success(tr({ en: "Notes saved", es: "Notas guardadas" }, language));
      } else {
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
      }
    } catch (e: any) {
      console.error("Error saving notes:", e);
      toast.error(tr({ en: "Failed to save notes", es: "Error al guardar las notas" }, language));
    } finally {
      setSavingNotes(false);
    }
  };

  const handleSaveBooking = async () => {
    if (!selectedLead) return;
    setSavingBooking(true);
    try {
      if (isSubscriber) {
        const realId = stripDbPrefix(selectedLead.id);
        await leadService.updateLead(realId, {
          booked: !!editBookingDate,
        });
        await supabase.from("leads").update({
          booking_date: editBookingDate || null,
          booking_time: editBookingTime || null,
        }).eq("id", realId);
        setLeads((prev) => prev.map((l) => l.id === selectedLead.id ? { ...l, appointmentDate: editBookingDate, bookingTime: editBookingTime, booked: !!editBookingDate } : l));
        setSelectedLead((prev) => prev ? { ...prev, appointmentDate: editBookingDate, bookingTime: editBookingTime, booked: !!editBookingDate } : prev);
        toast.success(tr({ en: "Booking saved", es: "Reserva guardada" }, language));
      }
    } catch (e: any) {
      console.error("Error saving booking:", e);
      toast.error(tr({ en: "Failed to save booking", es: "Error al guardar la reserva" }, language));
    } finally {
      setSavingBooking(false);
    }
  };

  const handleSaveStatus = async () => {
    if (!selectedLead || newStatus === selectedLead.leadStatus) {
      setModalOpen(false);
      return;
    }
    setSaving(true);
    try {
      if (isSubscriber) {
        await leadService.updateLead(stripDbPrefix(selectedLead.id), { status: newStatus });
        toast.success(tr(t.leadDetail.statusUpdated, language));
        setModalOpen(false);
        fetchSubscriberLeads();
      } else {
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
          ? fetchLeads(undefined, selectedClient !== "all" ? selectedClient : urlClientId || undefined)
          : fetchLeads();
      }
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
      if (isSubscriber) {
        await leadService.deleteLead(lead.id);
        setLeads((prev) => prev.filter((l) => l.id !== lead.id));
        toast.success(language === "en" ? "Lead deleted" : "Lead eliminado");
        setConfirmDeleteId(null);
        if (modalOpen && selectedLead?.id === lead.id) setModalOpen(false);
      } else {
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
      }
    } catch (e: any) {
      toast.error(e.message || "Error deleting lead");
    } finally {
      setDeleting(false);
    }
  };

  const handleAddLead = async () => {
    if (!addLeadForm.name.trim()) {
      toast.error(language === "en" ? "Lead name is required" : "El nombre del lead es requerido");
      return;
    }
    const clientId = isSubscriber ? ownClientId : urlClientId;
    if (!clientId) {
      toast.error(language === "en" ? "No client associated" : "Sin cliente asociado");
      return;
    }
    try {
      // Check plan limit before creating
      const limitCheck = await checkResourceLimit(clientId, "leads");
      if (!limitCheck.allowed) {
        toast.error(
          language === "en"
            ? `You've reached your lead limit (${limitCheck.limit} leads). Upgrade your plan for more.`
            : `Has alcanzado tu límite de leads (${limitCheck.limit} leads). Mejora tu plan para más.`
        );
        return;
      }
      await leadService.createLead({
        client_id: clientId,
        name: addLeadForm.name.trim(),
        phone: addLeadForm.phone || null,
        email: addLeadForm.email || null,
        source: addLeadForm.source || null,
        status: addLeadForm.status,
        booking_date: addLeadForm.booking_date || null,
        booking_time: addLeadForm.booking_time || null,
        booked: addLeadForm.booked,
        follow_up_step: addLeadForm.follow_up_step,
        last_contacted_at: addLeadForm.last_contacted_at || null,
        next_follow_up_at: addLeadForm.next_follow_up_at || null,
        stopped: addLeadForm.stopped,
        replied: addLeadForm.replied,
      });
      toast.success(language === "en" ? "Lead created" : "Lead creado");
      setShowAddLead(false);
      resetAddLeadForm();
      if (isSubscriber) {
        fetchSubscriberLeads();
      } else {
        fetchLeads(undefined, selectedClient !== "all" ? selectedClient : urlClientId || undefined);
      }
    } catch (e: any) {
      console.error("Error creating lead:", e);
      toast.error(e.message || "Error creating lead");
    }
  };

  if (authLoading) {
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

  if (isSubscriber && !ownClientId && !authLoading) {
    return (
      <main className="flex-1 overflow-y-auto">
        <div className="container mx-auto px-4 py-16 max-w-6xl text-center">
          <p className="text-muted-foreground text-lg">
            {language === "en" ? "No account found. Please complete onboarding first." : "No se encontró cuenta. Por favor completa la incorporación primero."}
          </p>
        </div>
      </main>
    );
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
  }).sort((a, b) => {
    if (sortMode === "name") return a.fullName.localeCompare(b.fullName);
    if (sortMode === "booked") {
      const aBooked = isBookedLead(a) ? 1 : 0;
      const bBooked = isBookedLead(b) ? 1 : 0;
      if (aBooked !== bBooked) return bBooked - aBooked;
      // tie-break by recency
      const aT = a.createdDate ? new Date(a.createdDate).getTime() : 0;
      const bT = b.createdDate ? new Date(b.createdDate).getTime() : 0;
      return bT - aT;
    }
    const aT = a.createdDate ? new Date(a.createdDate).getTime() : 0;
    const bT = b.createdDate ? new Date(b.createdDate).getTime() : 0;
    return sortMode === "oldest" ? aT - bT : bT - aT;
  });

  const statuses = statusOptions.length > 0 ? statusOptions : [...new Set(leads.map((l) => l.leadStatus).filter(Boolean))];
  const sources = sourceOptions.length > 0 ? sourceOptions : [...new Set(leads.map((l) => l.leadSource).filter(Boolean))];

  // CSV export of the currently-visible (post-filter, post-sort) list. Column
  // labels are human-friendly so the file opens cleanly in Sheets / Excel.
  const handleExportCSV = () => {
    if (filtered.length === 0) {
      toast.error(language === "en" ? "No leads to export" : "No hay leads para exportar");
      return;
    }
    const fmtDate = (s: string | undefined | null) => {
      if (!s) return "";
      const d = new Date(s);
      return isNaN(d.getTime()) ? s : d.toISOString().split("T")[0];
    };
    const rows = filtered.map((l) => ({
      Name:               l.fullName ?? "",
      Email:              l.email ?? "",
      Phone:              l.phone ?? "",
      Status:             l.leadStatus ?? "",
      Source:             l.leadSource ?? "",
      Campaign:           l.campaignName ?? "",
      "Appointment Date": fmtDate(l.appointmentDate),
      "Appointment Time": l.bookingTime ?? "",
      Booked:             isBookedLead(l) ? "Yes" : "No",
      Notes:              l.notes ?? "",
      "Created Date":     fmtDate(l.createdDate),
      "Last Contacted":   fmtDate(l.lastContacted),
    }));
    const clientLabel = clients.find((c) => c.id === (selectedClient !== "all" ? selectedClient : urlClientId))?.name
      ?? "all-clients";
    const slug = clientLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const today = new Date().toISOString().split("T")[0];
    exportToCSV(rows, { filename: `leads-${slug}-${today}.csv` });
    toast.success(
      language === "en"
        ? `Exported ${filtered.length} leads`
        : `${filtered.length} leads exportados`
    );
  };

  // Stats — reflect active filters (date + search + status + source)
  const totalLeads = filtered.length;
  const bookedCount = filtered.filter((l) => isBookedLead(l)).length;
  const pendingCount = filtered.filter((l) => !isBookedLead(l) && !isCanceledStatus(l.leadStatus)).length;
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
    if (!l.createdDate || !isBookedLead(l)) return false;
    const d = new Date(l.createdDate);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;
  const lastMonthBooked = leads.filter((l) => {
    if (!l.createdDate || !isBookedLead(l)) return false;
    const d = new Date(l.createdDate);
    const prev = new Date(now.getFullYear(), now.getMonth() - 1);
    return d.getMonth() === prev.getMonth() && d.getFullYear() === prev.getFullYear();
  }).length;
  const bookedDelta = lastMonthBooked > 0 ? Math.round(((thisMonthBooked - lastMonthBooked) / lastMonthBooked) * 100) : (thisMonthBooked > 0 ? 100 : 0);

  const na = tr(t.leadDetail.noData, language);

  return (
    <>
    <PageTransition className="editorial-page flex-1 overflow-y-auto">
      <div className="container mx-auto px-4 md:px-7 py-7 max-w-6xl">
        {/* Page heading */}
        <div className="mb-7">
          <h1 className="editorial-h text-[28px] md:text-[32px] mb-1">
            {language === "en" ? "Lead Tracker" : "Seguimiento de leads"}
          </h1>
          <p className="text-sm" style={{ color: "hsl(var(--ink-on-cream) / 0.55)" }}>
            {language === "en"
              ? "Track every inbound lead and the status of their booking."
              : "Sigue cada lead entrante y el estado de su reserva."}
          </p>
        </div>

        {/* Stats Grid — editorial white cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-8">
          {[
            {
              label: tr(t.leadTracker.totalLeads, language),
              value: totalLeads,
              icon: Users,
              delta: totalDelta,
              deltaLabel: language === "en" ? "from last month" : "vs mes anterior",
            },
            {
              label: tr(t.leadTracker.booked, language),
              value: bookedCount,
              icon: Calendar,
              delta: bookedDelta,
              deltaLabel: language === "en" ? "from last month" : "vs mes anterior",
            },
            {
              label: language === "en" ? "Pending" : "Pendientes",
              value: pendingCount,
              icon: Clock,
              delta: null,
              deltaLabel: language === "en" ? "in follow-up" : "en seguimiento",
            },
            {
              label: language === "en" ? "Conv. Rate" : "Conversión",
              value: `${conversionRate}%`,
              icon: TrendingUp,
              delta: null,
              deltaLabel: language === "en" ? "booked / total" : "reservados / total",
            },
          ].map((card, i) => {
            const Icon = card.icon;
            const isPositive = (card.delta ?? 0) >= 0;
            return (
              <div
                key={i}
                className="editorial-card relative p-5 flex flex-col gap-3 transition-shadow duration-200"
                style={{
                  boxShadow: "0 1px 0 hsl(var(--ink-on-cream) / 0.04)",
                }}
              >
                {/* Top row: label + icon */}
                <div className="flex items-start justify-between">
                  <p className="editorial-eyebrow" style={{ letterSpacing: "0.16em", fontSize: 10 }}>
                    {card.label}
                  </p>
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ background: "hsl(var(--ink-on-cream) / 0.05)", border: "1px solid hsl(var(--ink-on-cream) / 0.08)" }}
                  >
                    <Icon className="w-3.5 h-3.5" style={{ color: "hsl(var(--ink-on-cream) / 0.55)" }} />
                  </div>
                </div>

                {/* Value */}
                <p
                  className="leading-none"
                  style={{
                    fontFamily: "var(--font-display, 'EB Garamond'), Georgia, serif",
                    fontWeight: 500,
                    fontSize: "clamp(30px, 4.5vw, 44px)",
                    letterSpacing: "-0.015em",
                    color: "hsl(var(--ink-on-cream))",
                  }}
                >
                  {card.value}
                </p>

                {/* Bottom trend row */}
                <div className="flex items-center gap-1.5">
                  {card.delta !== null ? (
                    <>
                      <TrendingUp className="w-3 h-3 flex-shrink-0" style={{ color: isPositive ? "#1f7a5a" : "#A85B1F" }} />
                      <span className="text-[11px] font-semibold" style={{ color: isPositive ? "#1f7a5a" : "#A85B1F" }}>
                        {isPositive ? "+" : ""}{card.delta}%
                      </span>
                      <span className="text-[11px]" style={{ color: "hsl(var(--ink-on-cream) / 0.45)" }}>
                        {card.deltaLabel}
                      </span>
                    </>
                  ) : (
                    <span className="text-[11px]" style={{ color: "hsl(var(--ink-on-cream) / 0.45)" }}>
                      {card.deltaLabel}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Filters Section */}
        <div className="bg-white border border-[hsl(var(--ink-on-cream))] rounded-xl p-3 mb-8">
          <div className="flex flex-col sm:flex-row sm:flex-nowrap sm:items-center gap-2 sm:overflow-x-auto">
            {isStaff && (
              <Select value={selectedClient} onValueChange={setSelectedClient}>
                <SelectTrigger className="w-full sm:w-[150px] sm:flex-shrink-0 bg-background/50 border-border/50">
                  <Users className="w-4 h-4 mr-1.5" />
                  <SelectValue placeholder={tr(t.leadCalendar.client, language)} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{tr(t.leadTracker.allClients, language)}</SelectItem>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
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

            {/* Combined Filters popover (status + source + date) */}
            {(() => {
              const activeCount =
                (statusFilter !== "all" ? 1 : 0) +
                (sourceFilter !== "all" ? 1 : 0) +
                (dateFilter !== "all" ? 1 : 0);
              return (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="bg-background/50 border-border/50 h-10 gap-2 flex-shrink-0"
                    >
                      <SlidersHorizontal className="w-4 h-4" />
                      <span>{language === "en" ? "Filters" : "Filtros"}</span>
                      {activeCount > 0 && (
                        <span className="ml-0.5 inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px] font-bold w-5 h-5">
                          {activeCount}
                        </span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-72 p-3 space-y-3" align="end">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1.5">{tr(t.leadDetail.status, language)}</p>
                      <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger className="h-9 bg-background/50 border-border/50">
                          <SelectValue placeholder="Status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">{tr(t.leadTracker.allStatuses, language)}</SelectItem>
                          {statuses.map((s) => (
                            <SelectItem key={s} value={s}>{s}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1.5">{tr(t.leadDetail.source, language)}</p>
                      <Select value={sourceFilter} onValueChange={setSourceFilter}>
                        <SelectTrigger className="h-9 bg-background/50 border-border/50">
                          <SelectValue placeholder={tr(t.leadDetail.source, language)} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">{tr(t.leadTracker.allSources, language)}</SelectItem>
                          {sources.map((s) => (
                            <SelectItem key={s} value={s}>{s}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1.5">{language === "en" ? "Date" : "Fecha"}</p>
                      <Select value={dateFilter} onValueChange={(v) => setDateFilter(v as typeof dateFilter)}>
                        <SelectTrigger className="h-9 bg-background/50 border-border/50">
                          <Calendar className="w-3.5 h-3.5 mr-1.5 flex-shrink-0" />
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
                      {dateFilter === "custom" && (() => {
                        const formatLocal = (d: Date) => {
                          const yr = d.getFullYear();
                          const mo = String(d.getMonth() + 1).padStart(2, "0");
                          const dy = String(d.getDate()).padStart(2, "0");
                          return `${yr}-${mo}-${dy}`;
                        };
                        const fmtLabel = (s: string) =>
                          parseLocalDate(s).toLocaleDateString(language === "en" ? "en-US" : "es-ES", {
                            month: "short", day: "numeric", year: "numeric",
                          });
                        const fromDate = dateFrom ? parseLocalDate(dateFrom) : undefined;
                        const toDate = dateTo ? parseLocalDate(dateTo) : undefined;
                        const triggerCls = "h-9 w-full px-3 inline-flex items-center justify-between gap-1.5 rounded-md bg-background/50 border border-border/50 text-xs text-foreground hover:bg-background/80 transition-colors";
                        return (
                          <div className="grid grid-cols-2 gap-2 mt-2">
                            <Popover>
                              <PopoverTrigger asChild>
                                <button type="button" className={triggerCls}>
                                  <span className={dateFrom ? "" : "text-muted-foreground"}>
                                    {dateFrom ? fmtLabel(dateFrom) : (language === "en" ? "From" : "Desde")}
                                  </span>
                                  <Calendar className="w-3.5 h-3.5 opacity-60" />
                                </button>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-0" align="start">
                                <CalendarPicker
                                  mode="single"
                                  selected={fromDate}
                                  onSelect={(d) => setDateFrom(d ? formatLocal(d) : "")}
                                  initialFocus
                                />
                                {dateFrom && (
                                  <div className="border-t p-2 flex justify-end">
                                    <button
                                      className="text-xs text-destructive hover:underline"
                                      onClick={() => setDateFrom("")}
                                    >
                                      {language === "en" ? "Clear" : "Limpiar"}
                                    </button>
                                  </div>
                                )}
                              </PopoverContent>
                            </Popover>
                            <Popover>
                              <PopoverTrigger asChild>
                                <button type="button" className={triggerCls}>
                                  <span className={dateTo ? "" : "text-muted-foreground"}>
                                    {dateTo ? fmtLabel(dateTo) : (language === "en" ? "To" : "Hasta")}
                                  </span>
                                  <Calendar className="w-3.5 h-3.5 opacity-60" />
                                </button>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-0" align="start">
                                <CalendarPicker
                                  mode="single"
                                  selected={toDate}
                                  onSelect={(d) => setDateTo(d ? formatLocal(d) : "")}
                                  initialFocus
                                  disabled={fromDate ? { before: fromDate } : undefined}
                                />
                                {dateTo && (
                                  <div className="border-t p-2 flex justify-end">
                                    <button
                                      className="text-xs text-destructive hover:underline"
                                      onClick={() => setDateTo("")}
                                    >
                                      {language === "en" ? "Clear" : "Limpiar"}
                                    </button>
                                  </div>
                                )}
                              </PopoverContent>
                            </Popover>
                          </div>
                        );
                      })()}
                    </div>
                    {activeCount > 0 && (
                      <button
                        onClick={() => {
                          setStatusFilter("all");
                          setSourceFilter("all");
                          setDateFilter("all");
                          setDateFrom("");
                          setDateTo("");
                        }}
                        className="w-full text-xs text-muted-foreground hover:text-foreground py-1 transition-colors"
                      >
                        {language === "en" ? "Clear all filters" : "Limpiar filtros"}
                      </button>
                    )}
                  </PopoverContent>
                </Popover>
              );
            })()}

            {/* Sort */}
            <Select value={sortMode} onValueChange={(v) => setSortMode(v as typeof sortMode)}>
              <SelectTrigger className="w-full sm:w-[150px] sm:flex-shrink-0 bg-background/50 border-border/50">
                <ArrowUpDown className="w-4 h-4 mr-1.5 flex-shrink-0" />
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="recent">{language === "en" ? "Most recent" : "Más recientes"}</SelectItem>
                <SelectItem value="oldest">{language === "en" ? "Oldest first" : "Más antiguos"}</SelectItem>
                <SelectItem value="name">{language === "en" ? "Name (A–Z)" : "Nombre (A–Z)"}</SelectItem>
                <SelectItem value="booked">{language === "en" ? "Booked first" : "Reservados primero"}</SelectItem>
              </SelectContent>
            </Select>

            {/* Export the currently-filtered list to CSV. Disabled when empty
                so users get a clear affordance + tooltip instead of a no-op. */}
            <Button
              size="sm"
              variant="outline"
              onClick={handleExportCSV}
              disabled={filtered.length === 0}
              className="flex-shrink-0 gap-1.5"
              title={
                language === "en"
                  ? `Export ${filtered.length} filtered lead${filtered.length === 1 ? "" : "s"} as CSV`
                  : `Exportar ${filtered.length} lead${filtered.length === 1 ? "" : "s"} filtrado${filtered.length === 1 ? "" : "s"} a CSV`
              }
            >
              <Download className="w-4 h-4" />
              {language === "en" ? "Export" : "Exportar"}
            </Button>

            {(isSubscriber || isAdmin) && (
              <Button
                size="sm"
                onClick={() => setShowAddLead(true)}
                className="flex-shrink-0 gap-1.5"
              >
                <Plus className="w-4 h-4" />
                {language === "en" ? "Add Lead" : "Agregar Lead"}
              </Button>
            )}

            {/* View toggle: Cards / Table / Chart */}
            <div className="flex items-center border border-primary/30 bg-gradient-to-r from-primary/10 to-teal-500/10 rounded-lg overflow-hidden flex-shrink-0 ml-auto">
              <button
                onClick={() => toggleView("cards")}
                className={`px-3 py-2 text-sm transition-all border-r border-primary/20 ${viewMode === "cards" ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"}`}
                title="Card view"
              >
                <LayoutList className="w-4 h-4" />
              </button>
              <button
                onClick={() => toggleView("kanban")}
                className={`px-3 py-2 text-sm transition-all border-r border-primary/20 ${viewMode === "kanban" ? "bg-emerald-500/20 text-emerald-300" : "text-muted-foreground hover:text-foreground"}`}
                title="Kanban view"
              >
                <Columns3 className="w-4 h-4" />
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
                className="rounded-xl p-5 transition-all duration-200 cursor-pointer"
                style={{
                  background: "#ffffff",
                  border: "1px solid hsl(var(--ink-on-cream))",
                  boxShadow: "2px 2px 0 hsl(var(--ink-on-cream))",
                  color: "hsl(var(--ink-on-cream))",
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = "3px 3px 0 hsl(var(--ink-on-cream))"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = "2px 2px 0 hsl(var(--ink-on-cream))"; }}
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
            const PIE_COLORS = ["hsl(var(--aqua))", "#10b981", "#f59e0b", "#a78bfa", "#f87171", "#fb923c"];

            // Daily leads last 30 days
            const days = Array.from({ length: 30 }, (_, i) => {
              const d = new Date();
              d.setDate(d.getDate() - (29 - i));
              return d.toISOString().split("T")[0];
            });
            const lineData = days.map((date) => ({
              date: date.slice(5),
              leads: leads.filter((l) => l.createdDate?.startsWith(date)).length,
              booked: leads.filter((l) => l.createdDate?.startsWith(date) && isBookedLead(l)).length,
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
                      <div className="rounded-xl border border-[hsl(var(--ink-on-cream))] bg-white p-5">
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
                      <div className="rounded-xl border border-[hsl(var(--ink-on-cream))] bg-white p-5">
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
                    <div className="rounded-xl border border-[hsl(var(--ink-on-cream))] bg-white p-5">
                      <h3 className="text-sm font-semibold mb-4 text-foreground">Leads — Last 30 Days</h3>
                      <ResponsiveContainer width="100%" height={220}>
                        <LineChart data={lineData} margin={{ top: 4, right: 8, left: -20, bottom: 4 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                          <XAxis dataKey="date" tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }} tickLine={false} interval={4} />
                          <YAxis tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }} tickLine={false} allowDecimals={false} />
                          <Tooltip contentStyle={{ background: "rgba(15,15,15,0.9)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }} />
                          <Legend wrapperStyle={{ fontSize: 11 }} />
                          <Line type="monotone" dataKey="leads" stroke="hsl(var(--aqua))" strokeWidth={2} dot={false} name="New Leads" />
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

        {!loading && filtered.length > 0 && viewMode === "kanban" && (
          <KanbanBoard
            leads={filtered}
            statusOptions={statusOptions.length > 0 ? statusOptions : ALLOWED_STATUSES}
            updatingId={kanbanUpdatingId}
            language={language}
            onCardClick={openLeadDetail}
            onMoveLead={updateLeadStatusInline}
          />
        )}

      </div>
      </PageTransition>

      {/* Lead Detail Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-md bg-card/95 border border-primary/20 backdrop-blur-xl">
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
                {selectedLead.appointmentDate && (
                  <div className="col-span-2">
                    <p className="text-muted-foreground text-xs">{language === "en" ? "Booking" : "Reserva"}</p>
                    <p className="font-medium text-foreground flex items-center gap-2">
                      <Calendar className="w-3.5 h-3.5 text-primary" />
                      {(() => {
                        const [yr, mo, dy] = selectedLead.appointmentDate.split("-").map(Number);
                        const d = new Date(yr, (mo || 1) - 1, dy || 1);
                        const dateStr = d.toLocaleDateString(language === "en" ? "en-US" : "es-ES", {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        });
                        if (selectedLead.bookingTime) {
                          // Format time as h:MM AM/PM
                          const [h, m] = selectedLead.bookingTime.split(":").map(Number);
                          const hour12 = h % 12 || 12;
                          const ampm = h >= 12 ? "PM" : "AM";
                          const timeStr = `${hour12}:${String(m || 0).padStart(2, "0")} ${ampm}`;
                          return `${dateStr} · ${timeStr}`;
                        }
                        return dateStr;
                      })()}
                    </p>
                  </div>
                )}
              </div>

              {/* Booking date/time — editable for subscribers */}
              {isSubscriber && (
                <div className="space-y-2 pt-2 border-t border-border/40">
                  <div className="flex items-center justify-between">
                    <p className="text-muted-foreground text-xs font-medium">{language === "en" ? "Booking" : "Reserva"}</p>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-xs text-primary hover:bg-primary/10"
                      disabled={savingBooking || (editBookingDate === (selectedLead.appointmentDate || "") && editBookingTime === (selectedLead.bookingTime || ""))}
                      onClick={handleSaveBooking}
                    >
                      {savingBooking ? (
                        <><Loader2 className="w-3 h-3 mr-1 animate-spin" />{language === "en" ? "Saving..." : "Guardando..."}</>
                      ) : (
                        <><Save className="w-3 h-3 mr-1" />{language === "en" ? "Save booking" : "Guardar reserva"}</>
                      )}
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-muted-foreground">{language === "en" ? "Date" : "Fecha"}</label>
                      <Input type="date" value={editBookingDate} onChange={(e) => setEditBookingDate(e.target.value)} className="h-8 text-sm" style={{ colorScheme: "dark" }} />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">{language === "en" ? "Time" : "Hora"}</label>
                      <Input type="time" value={editBookingTime} onChange={(e) => setEditBookingTime(e.target.value)} className="h-8 text-sm" style={{ colorScheme: "dark" }} />
                    </div>
                  </div>
                </div>
              )}

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

      <Dialog open={showAddLead} onOpenChange={setShowAddLead}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{language === "en" ? "Add New Lead" : "Agregar Nuevo Lead"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">{language === "en" ? "Name" : "Nombre"} *</label>
              <Input placeholder={language === "en" ? "Lead name" : "Nombre del lead"} value={addLeadForm.name} onChange={(e) => setAddLeadForm({ ...addLeadForm, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Email</label>
              <Input type="email" placeholder="email@example.com" value={addLeadForm.email} onChange={(e) => setAddLeadForm({ ...addLeadForm, email: e.target.value })} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">{language === "en" ? "Phone" : "Teléfono"}</label>
              <Input placeholder="+1 (555) 000-0000" value={addLeadForm.phone} onChange={(e) => setAddLeadForm({ ...addLeadForm, phone: e.target.value })} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">{language === "en" ? "Source" : "Fuente"}</label>
              <Input placeholder="Facebook, Referral, etc." value={addLeadForm.source} onChange={(e) => setAddLeadForm({ ...addLeadForm, source: e.target.value })} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Status</label>
              <Select value={addLeadForm.status} onValueChange={(value) => setAddLeadForm({ ...addLeadForm, status: value })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ALLOWED_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">{language === "en" ? "Follow Up Step" : "Paso de Seguimiento"}</label>
              <Input type="number" min="0" max="10" value={addLeadForm.follow_up_step} onChange={(e) => setAddLeadForm({ ...addLeadForm, follow_up_step: parseInt(e.target.value) || 0 })} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">{language === "en" ? "Last Contacted" : "Último Contacto"}</label>
              <Input type="date" value={addLeadForm.last_contacted_at} onChange={(e) => setAddLeadForm({ ...addLeadForm, last_contacted_at: e.target.value })} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">{language === "en" ? "Next Follow Up" : "Próximo Seguimiento"}</label>
              <Input type="date" value={addLeadForm.next_follow_up_at} onChange={(e) => setAddLeadForm({ ...addLeadForm, next_follow_up_at: e.target.value })} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">{language === "en" ? "Booking Date & Time" : "Fecha y Hora de Reserva"}</label>
              <div className="grid grid-cols-2 gap-2">
                <Input type="date" value={addLeadForm.booking_date} onChange={(e) => setAddLeadForm({ ...addLeadForm, booking_date: e.target.value })} style={{ colorScheme: "dark" }} />
                <Input type="time" value={addLeadForm.booking_time} onChange={(e) => setAddLeadForm({ ...addLeadForm, booking_time: e.target.value })} style={{ colorScheme: "dark" }} />
              </div>
            </div>
            <div className="space-y-3 pt-2 border-t">
              <div className="flex items-center gap-2">
                <input type="checkbox" id="addLead-booked" checked={addLeadForm.booked} onChange={(e) => setAddLeadForm({ ...addLeadForm, booked: e.target.checked })} className="rounded" />
                <label htmlFor="addLead-booked" className="text-sm cursor-pointer">Booked</label>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="addLead-replied" checked={addLeadForm.replied} onChange={(e) => setAddLeadForm({ ...addLeadForm, replied: e.target.checked })} className="rounded" />
                <label htmlFor="addLead-replied" className="text-sm cursor-pointer">{language === "en" ? "Replied" : "Respondió"}</label>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="addLead-stopped" checked={addLeadForm.stopped} onChange={(e) => setAddLeadForm({ ...addLeadForm, stopped: e.target.checked })} className="rounded" />
                <label htmlFor="addLead-stopped" className="text-sm cursor-pointer">{language === "en" ? "Stopped/Archived" : "Detenido/Archivado"}</label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowAddLead(false); resetAddLeadForm(); }}>
              {language === "en" ? "Cancel" : "Cancelar"}
            </Button>
            <Button onClick={handleAddLead}>
              {language === "en" ? "Create Lead" : "Crear Lead"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
