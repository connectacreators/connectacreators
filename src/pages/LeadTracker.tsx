import { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useClients } from "@/hooks/useClients";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
} from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";
import LanguageToggle from "@/components/LanguageToggle";
import { useTheme } from "@/hooks/useTheme";
import { useLanguage } from "@/hooks/useLanguage";
import { t, tr } from "@/i18n/translations";
import { toast } from "sonner";
import { useSubscriptionGuard } from "@/hooks/useSubscriptionGuard";
import AnimatedDots from "@/components/ui/AnimatedDots";

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
  notionUrl: string;
};

const STATUS_COLORS: Record<string, string> = {
  "Appointment Booked": "bg-green-500/15 text-green-400 border-green-500/30",
  "Follow up #1 (Not Booked)": "bg-orange-500/15 text-orange-400 border-orange-500/30",
  "Follow up #2 (Not Booked)": "bg-blue-500/15 text-blue-400 border-blue-500/30",
  "Follow up #3 (Not Booked)": "bg-pink-500/15 text-pink-400 border-pink-500/30",
  "Meta Ad (Not Booked)": "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  "Canceled": "bg-red-500/15 text-red-400 border-red-500/30",
};

const SOURCE_COLORS: Record<string, string> = {
  "Meta Ads": "bg-blue-500/15 text-blue-400",
  "Google Ads": "bg-red-500/15 text-red-400",
  Website: "bg-purple-500/15 text-purple-400",
  Referral: "bg-emerald-500/15 text-emerald-400",
  Organic: "bg-cyan-500/15 text-cyan-400",
  Other: "bg-gray-500/15 text-gray-400",
};

const ALLOWED_STATUSES = ["Meta Ad (Not Booked)", "Appointment Booked", "Canceled"];

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

  // View mode state (with localStorage persistence)
  const [viewMode, setViewMode] = useState<"cards" | "table">(() => {
    return (localStorage.getItem("leadTrackerViewMode") as "cards" | "table") || "cards";
  });

  const toggleView = (mode: "cards" | "table") => {
    setViewMode(mode);
    localStorage.setItem("leadTrackerViewMode", mode);
  };

  // (Lead notifications are now handled globally by LeadNotificationProvider)

  const fetchLeads = useCallback(async (clientName?: string, silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const params = new URLSearchParams();
      if (clientName && clientName !== "all") {
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
      fetchLeads(isStaff && selectedClient !== "all" ? selectedClient : undefined);
    }
  }, [authLoading, user, isStaff, selectedClient, fetchLeads]);

  // Auto-refresh every 2 minutes
  useEffect(() => {
    if (!user || authLoading) return;
    const interval = setInterval(() => {
      fetchLeads(isStaff && selectedClient !== "all" ? selectedClient : undefined, true);
    }, 120_000);
    return () => clearInterval(interval);
  }, [user, authLoading, isStaff, selectedClient, fetchLeads]);

  const openLeadDetail = (lead: Lead) => {
    setSelectedLead(lead);
    setNewStatus(lead.leadStatus);
    setModalOpen(true);
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
      fetchLeads(isStaff && selectedClient !== "all" ? selectedClient : undefined);
    } catch (e: any) {
      console.error("Error updating status:", e);
      toast.error(tr(t.leadDetail.statusError, language));
    } finally {
      setSaving(false);
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

  // Filters
  const filtered = leads.filter((lead) => {
    const matchesSearch =
      !searchTerm ||
      lead.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lead.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lead.phone.includes(searchTerm);
    const matchesStatus = statusFilter === "all" || lead.leadStatus === statusFilter;
    const matchesSource = sourceFilter === "all" || lead.leadSource === sourceFilter;
    return matchesSearch && matchesStatus && matchesSource;
  });

  const statuses = statusOptions.length > 0 ? statusOptions : [...new Set(leads.map((l) => l.leadStatus).filter(Boolean))];
  const sources = sourceOptions.length > 0 ? sourceOptions : [...new Set(leads.map((l) => l.leadSource).filter(Boolean))];

  // Stats
  const totalLeads = leads.length;
  const bookedCount = leads.filter((l) => l.leadStatus === "Appointment Booked").length;
  const conversionRate = totalLeads > 0 ? Math.round((bookedCount / totalLeads) * 100) : 0;

  const na = tr(t.leadDetail.noData, language);

  return (
    <div className="min-h-screen bg-background" style={{ fontFamily: "Arial, sans-serif" }}>
      <AnimatedDots />
      {/* Header */}
      <header className="border-b border-border/50 bg-background/80 backdrop-blur-xl sticky top-0 z-10">
        <div className="container mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          
          <h1 className="font-bold text-lg">{tr(t.leadTracker.title, language)}</h1>
          <div className="ml-auto flex items-center gap-1.5">
            <LanguageToggle />
            <ThemeToggle />
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                fetchLeads(isStaff && selectedClient !== "all" ? selectedClient : undefined)
              }
              disabled={loading}
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-5xl">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-card border border-border rounded-lg p-4 text-center">
            <p className="text-2xl font-bold text-foreground">{totalLeads}</p>
            <p className="text-xs text-muted-foreground">{tr(t.leadTracker.totalLeads, language)}</p>
          </div>
          <div className="bg-card border border-border rounded-lg p-4 text-center">
            <p className="text-2xl font-bold text-green-400">{bookedCount}</p>
            <p className="text-xs text-muted-foreground">{tr(t.leadTracker.booked, language)}</p>
          </div>
          <div className="bg-card border border-border rounded-lg p-4 text-center">
            <p className="text-2xl font-bold text-primary">{conversionRate}%</p>
            <p className="text-xs text-muted-foreground">{tr(t.leadTracker.conversion, language)}</p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          {isStaff && (
            <Select value={selectedClient} onValueChange={setSelectedClient}>
              <SelectTrigger className="w-full sm:w-[200px]">
                <Users className="w-4 h-4 mr-2" />
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

          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder={tr(t.leadTracker.searchPlaceholder, language)}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-[200px]">
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
            <SelectTrigger className="w-full sm:w-[180px]">
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

          {/* View toggle: Cards / Table */}
          <div className="flex items-center border border-border rounded-md overflow-hidden flex-shrink-0">
            <button
              onClick={() => toggleView("cards")}
              className={`px-3 py-2 text-sm transition-colors ${viewMode === "cards" ? "bg-accent/20 text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              title="Card view"
            >
              <LayoutList className="w-4 h-4" />
            </button>
            <button
              onClick={() => toggleView("table")}
              className={`px-3 py-2 text-sm border-l border-border transition-colors ${viewMode === "table" ? "bg-accent/20 text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              title="Table view"
            >
              <Table2 className="w-4 h-4" />
            </button>
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
                className="bg-card border border-border rounded-lg p-4 hover:border-primary/30 transition-colors cursor-pointer"
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
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && filtered.length > 0 && viewMode === "table" && (
          <div className="overflow-x-auto rounded-lg border border-border">
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
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </main>

      {/* Lead Detail Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-md">
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

              {/* Notes */}
              {selectedLead.notes && (
                <div>
                  <p className="text-muted-foreground text-xs mb-1">{tr(t.leadDetail.notes, language)}</p>
                  <p className="text-sm text-foreground bg-muted/50 rounded-md p-2">{selectedLead.notes}</p>
                </div>
              )}

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
                            s === "Appointment Booked" ? "bg-green-400" :
                            s === "Canceled" ? "bg-red-400" : "bg-yellow-400"
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
    </div>
  );
}
