import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useClients } from "@/hooks/useClients";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
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
  ChevronLeft,
  ChevronRight,
  Phone,
  Users,
  Calendar as CalendarIcon,
} from "lucide-react";
import chessKnightIcon from "@/assets/chess-knight-icon.png";

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

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const DAY_NAMES = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

export default function LeadCalendar() {
  const { user, loading: authLoading, isAdmin } = useAuth();
  const { clients } = useClients(isAdmin);
  const navigate = useNavigate();

  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedClient, setSelectedClient] = useState<string>("all");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());

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
      // Only keep leads with appointment dates
      setLeads((result.leads || []).filter((l: Lead) => l.appointmentDate));
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

  // Group leads by appointment date
  const leadsByDate = useMemo(() => {
    const map: Record<string, Lead[]> = {};
    leads.forEach((lead) => {
      const dateKey = lead.appointmentDate.split("T")[0];
      if (!map[dateKey]) map[dateKey] = [];
      map[dateKey].push(lead);
    });
    return map;
  }, [leads]);

  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const firstDay = getFirstDayOfWeek(viewYear, viewMonth);

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(viewYear - 1); }
    else setViewMonth(viewMonth - 1);
  };

  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(viewYear + 1); }
    else setViewMonth(viewMonth + 1);
  };

  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  const selectedLeads = selectedDate ? (leadsByDate[selectedDate] || []) : [];

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

  return (
    <div className="min-h-screen bg-background" style={{ fontFamily: "Arial, sans-serif" }}>
      {/* Header */}
      <header className="border-b border-border/50 bg-background/80 backdrop-blur-xl sticky top-0 z-10">
        <div className="container mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <img src={chessKnightIcon} alt="Connecta" className="h-7" />
          <h1 className="font-bold text-lg">Lead Calendar</h1>
          <div className="ml-auto">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => fetchLeads(isAdmin && selectedClient !== "all" ? selectedClient : undefined)}
              disabled={loading}
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-4xl">
        {/* Client filter for admins */}
        {isAdmin && (
          <div className="mb-4">
            <Select value={selectedClient} onValueChange={setSelectedClient}>
              <SelectTrigger className="w-full sm:w-[220px]">
                <Users className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Cliente" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los clientes</SelectItem>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {error && (
          <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 mb-6 text-sm text-destructive">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* Calendar navigation */}
            <div className="flex items-center justify-between mb-4">
              <Button variant="ghost" size="icon" onClick={prevMonth}>
                <ChevronLeft className="w-5 h-5" />
              </Button>
              <h2 className="text-lg font-bold">
                {MONTH_NAMES[viewMonth]} {viewYear}
              </h2>
              <Button variant="ghost" size="icon" onClick={nextMonth}>
                <ChevronRight className="w-5 h-5" />
              </Button>
            </div>

            {/* Calendar grid */}
            <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden mb-6">
              {DAY_NAMES.map((d) => (
                <div key={d} className="bg-muted p-2 text-center text-xs font-semibold text-muted-foreground">
                  {d}
                </div>
              ))}
              {/* Empty cells before first day */}
              {Array.from({ length: firstDay }).map((_, i) => (
                <div key={`empty-${i}`} className="bg-card p-2 min-h-[60px] sm:min-h-[80px]" />
              ))}
              {/* Day cells */}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                const dayLeads = leadsByDate[dateStr] || [];
                const isToday = dateStr === todayStr;
                const isSelected = dateStr === selectedDate;

                return (
                  <button
                    key={day}
                    onClick={() => setSelectedDate(isSelected ? null : dateStr)}
                    className={`bg-card p-1.5 sm:p-2 min-h-[60px] sm:min-h-[80px] text-left transition-colors hover:bg-accent/50 ${isSelected ? "ring-2 ring-primary ring-inset" : ""}`}
                  >
                    <span className={`text-xs font-medium inline-flex items-center justify-center w-6 h-6 rounded-full ${isToday ? "bg-primary text-primary-foreground" : "text-foreground"}`}>
                      {day}
                    </span>
                    {dayLeads.length > 0 && (
                      <div className="mt-1">
                        <Badge variant="secondary" className="text-[9px] px-1 py-0 bg-green-500/15 text-green-400">
                          {dayLeads.length} cita{dayLeads.length > 1 ? "s" : ""}
                        </Badge>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Selected date detail */}
            {selectedDate && (
              <div>
                <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                  <CalendarIcon className="w-4 h-4 text-primary" />
                  {new Date(selectedDate + "T12:00:00").toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                  <Badge variant="outline" className="ml-2 text-xs">{selectedLeads.length} lead{selectedLeads.length !== 1 ? "s" : ""}</Badge>
                </h3>
                {selectedLeads.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No hay citas este día.</p>
                ) : (
                  <div className="space-y-3">
                    {selectedLeads.map((lead) => (
                      <div key={lead.id} className="bg-card border border-border rounded-lg p-4 hover:border-primary/30 transition-colors">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <h4 className="font-semibold text-foreground truncate">{lead.fullName || "Sin nombre"}</h4>
                              {lead.leadStatus && (
                                <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${STATUS_COLORS[lead.leadStatus] || "bg-muted text-muted-foreground"}`}>
                                  {lead.leadStatus}
                                </Badge>
                              )}
                            </div>
                            {lead.email && <p className="text-xs text-muted-foreground">{lead.email}</p>}
                            {isAdmin && lead.client && (
                              <Badge variant="outline" className="text-[10px] mt-1">{lead.client}</Badge>
                            )}
                          </div>
                          {lead.phone && (
                            <a
                              href={`tel:${lead.phone}`}
                              className="flex items-center gap-1.5 text-primary hover:text-primary/80 transition-colors font-semibold text-sm flex-shrink-0"
                            >
                              <Phone className="w-4 h-4" />
                              {lead.phone}
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {!selectedDate && leads.length === 0 && (
              <p className="text-center text-muted-foreground py-8">No hay leads con citas programadas.</p>
            )}
          </>
        )}
      </main>
    </div>
  );
}
