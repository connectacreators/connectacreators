import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
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
  ArrowLeft,
  Loader2,
  RefreshCw,
  Search,
  Phone,
  Mail,
  Calendar,
  ExternalLink,
  Users,
} from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";
import LanguageToggle from "@/components/LanguageToggle";
import { useTheme } from "@/hooks/useTheme";
import { useLanguage } from "@/hooks/useLanguage";
import { t, tr } from "@/i18n/translations";


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
};

const SOURCE_COLORS: Record<string, string> = {
  "Meta Ads": "bg-blue-500/15 text-blue-400",
  "Google Ads": "bg-red-500/15 text-red-400",
  Website: "bg-purple-500/15 text-purple-400",
  Referral: "bg-emerald-500/15 text-emerald-400",
  Organic: "bg-cyan-500/15 text-cyan-400",
  Other: "bg-gray-500/15 text-gray-400",
};

export default function LeadTracker() {
  const { theme } = useTheme();
  const { language } = useLanguage();
  const { user, loading: authLoading, isAdmin } = useAuth();
  const { clients } = useClients(isAdmin);
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

  const fetchLeads = useCallback(async (clientName?: string) => {
    setLoading(true);
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
      setLeads(result.leads || []);
      if (result.statusOptions) setStatusOptions(result.statusOptions);
    } catch (e: any) {
      console.error("Error fetching leads:", e);
      setError(e.message || "Error al cargar leads");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && user) {
      fetchLeads(isAdmin && selectedClient !== "all" ? selectedClient : undefined);
    }
  }, [authLoading, user, isAdmin, selectedClient, fetchLeads]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    navigate("/");
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

  return (
    <div className="min-h-screen bg-background" style={{ fontFamily: "Arial, sans-serif" }}>
      {/* Header */}
      <header className="border-b border-border/50 bg-background/80 backdrop-blur-xl sticky top-0 z-10">
        <div className="container mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
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
                fetchLeads(isAdmin && selectedClient !== "all" ? selectedClient : undefined)
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

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          {isAdmin && (
            <Select value={selectedClient} onValueChange={setSelectedClient}>
              <SelectTrigger className="w-full sm:w-[200px]">
                <Users className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Cliente" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{tr(t.leadTracker.allClients, language)}</SelectItem>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.name}>
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

        {!loading && filtered.length > 0 && (
          <div className="space-y-3">
            {filtered.map((lead) => (
              <div
                key={lead.id}
                className="bg-card border border-border rounded-lg p-4 hover:border-primary/30 transition-colors"
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
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {isAdmin && lead.client && (
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
      </main>
    </div>
  );
}
