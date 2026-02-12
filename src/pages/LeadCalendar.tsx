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
  Mail,
  Clock,
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

type ViewMode = "month" | "week" | "year";

const STATUS_COLORS: Record<string, string> = {
  "Appointment Booked": "bg-green-500/15 text-green-400 border-green-500/30",
  "Follow up #1 (Not Booked)": "bg-orange-500/15 text-orange-400 border-orange-500/30",
  "Follow up #2 (Not Booked)": "bg-blue-500/15 text-blue-400 border-blue-500/30",
  "Follow up #3 (Not Booked)": "bg-pink-500/15 text-pink-400 border-pink-500/30",
  "Meta Ad (Not Booked)": "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
};

const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];
const MONTH_SHORT = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const DAY_NAMES = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const DAY_NAMES_SHORT = ["D", "L", "M", "M", "J", "V", "S"];

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}
function getFirstDayOfWeek(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}
function getWeekDates(date: Date): Date[] {
  const day = date.getDay();
  const start = new Date(date);
  start.setDate(start.getDate() - day);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d;
  });
}
function formatDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatTime(dateStr: string): string | null {
  if (!dateStr || !dateStr.includes("T")) return null;
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", hour12: true });
  } catch {
    return null;
  }
}

export default function LeadCalendar() {
  const { user, loading: authLoading, isAdmin } = useAuth();
  const { clients } = useClients(isAdmin);
  const navigate = useNavigate();

  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedClient, setSelectedClient] = useState<string>("all");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("month");

  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [viewWeekStart, setViewWeekStart] = useState<Date>(() => {
    const d = new Date();
    d.setDate(d.getDate() - d.getDay());
    return d;
  });

  const fetchLeads = useCallback(async (clientName?: string) => {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");
      const params = new URLSearchParams();
      if (clientName && clientName !== "all") params.set("client_name", clientName);
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

  const leadsByDate = useMemo(() => {
    const map: Record<string, Lead[]> = {};
    leads.forEach((lead) => {
      const dateKey = lead.appointmentDate.split("T")[0];
      if (!map[dateKey]) map[dateKey] = [];
      map[dateKey].push(lead);
    });
    return map;
  }, [leads]);

  // Sorted leads for sidebar
  const sortedLeads = useMemo(() => {
    return [...leads].sort((a, b) => {
      const da = new Date(a.appointmentDate).getTime();
      const db = new Date(b.appointmentDate).getTime();
      return da - db;
    });
  }, [leads]);

  const todayStr = formatDateStr(now);

  // Navigation
  const goPrev = () => {
    if (viewMode === "month") {
      if (viewMonth === 0) { setViewMonth(11); setViewYear(viewYear - 1); }
      else setViewMonth(viewMonth - 1);
    } else if (viewMode === "week") {
      const d = new Date(viewWeekStart);
      d.setDate(d.getDate() - 7);
      setViewWeekStart(d);
    } else {
      setViewYear(viewYear - 1);
    }
  };
  const goNext = () => {
    if (viewMode === "month") {
      if (viewMonth === 11) { setViewMonth(0); setViewYear(viewYear + 1); }
      else setViewMonth(viewMonth + 1);
    } else if (viewMode === "week") {
      const d = new Date(viewWeekStart);
      d.setDate(d.getDate() + 7);
      setViewWeekStart(d);
    } else {
      setViewYear(viewYear + 1);
    }
  };
  const goToday = () => {
    const n = new Date();
    setViewYear(n.getFullYear());
    setViewMonth(n.getMonth());
    const ws = new Date(n);
    ws.setDate(ws.getDate() - ws.getDay());
    setViewWeekStart(ws);
    setSelectedDate(formatDateStr(n));
  };

  const headerLabel = viewMode === "month"
    ? `${MONTH_NAMES[viewMonth]} ${viewYear}`
    : viewMode === "year"
      ? `${viewYear}`
      : (() => {
          const dates = getWeekDates(viewWeekStart);
          const s = dates[0]; const e = dates[6];
          if (s.getMonth() === e.getMonth()) return `${s.getDate()} – ${e.getDate()} ${MONTH_NAMES[s.getMonth()]} ${s.getFullYear()}`;
          return `${s.getDate()} ${MONTH_SHORT[s.getMonth()]} – ${e.getDate()} ${MONTH_SHORT[e.getMonth()]} ${e.getFullYear()}`;
        })();

  const selectedLeads = selectedDate ? (leadsByDate[selectedDate] || []) : [];

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!user) { navigate("/"); return null; }

  return (
    <div className="min-h-screen bg-background flex flex-col" style={{ fontFamily: "Arial, sans-serif" }}>
      {/* Header */}
      <header className="border-b border-border/50 bg-background/80 backdrop-blur-xl sticky top-0 z-10">
        <div className="container mx-auto px-3 py-2.5 flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate("/")}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <img src={chessKnightIcon} alt="Connecta" className="h-6" />
          <h1 className="font-bold text-base sm:text-lg">Lead Calendar</h1>
          <div className="ml-auto flex items-center gap-1.5">
            <Button variant="outline" size="sm" className="h-7 text-xs px-2" onClick={goToday}>
              Hoy
            </Button>
            <Button
              variant="ghost" size="sm" className="h-7 w-7 p-0"
              onClick={() => fetchLeads(isAdmin && selectedClient !== "all" ? selectedClient : undefined)}
              disabled={loading}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col container mx-auto px-3 py-3 max-w-7xl">
        {/* Controls row */}
        <div className="flex flex-col sm:flex-row gap-2 mb-3">
          {isAdmin && (
            <Select value={selectedClient} onValueChange={setSelectedClient}>
              <SelectTrigger className="w-full sm:w-[200px] h-8 text-xs">
                <Users className="w-3.5 h-3.5 mr-1.5" />
                <SelectValue placeholder="Cliente" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los clientes</SelectItem>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {/* View mode toggle */}
          <div className="flex bg-muted rounded-md p-0.5 sm:ml-auto">
            {(["week", "month", "year"] as ViewMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`px-3 py-1 text-xs font-medium rounded transition-colors ${viewMode === mode ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                {mode === "week" ? "Semana" : mode === "month" ? "Mes" : "Año"}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 mb-3 text-xs text-destructive">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          /* Main layout: sidebar + calendar */
          <div className="flex-1 flex flex-col lg:flex-row gap-3">
            {/* LEFT SIDEBAR - Lead list */}
            <div className="lg:w-72 xl:w-80 flex-shrink-0 order-2 lg:order-1">
              <div className="bg-card border border-border rounded-lg overflow-hidden">
                <div className="p-3 border-b border-border bg-muted/50">
                  <h3 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-primary" />
                    Leads ({leads.length})
                  </h3>
                </div>
                <div className="max-h-[300px] lg:max-h-[calc(100vh-220px)] overflow-y-auto divide-y divide-border">
                  {sortedLeads.length === 0 ? (
                    <p className="text-xs text-muted-foreground p-4 text-center">No hay leads con citas.</p>
                  ) : (
                    sortedLeads.map((lead) => {
                      const dateKey = lead.appointmentDate.split("T")[0];
                      const time = formatTime(lead.appointmentDate);
                      const isActive = selectedDate === dateKey;
                      return (
                        <button
                          key={lead.id}
                          onClick={() => setSelectedDate(dateKey === selectedDate ? null : dateKey)}
                          className={`w-full text-left p-2.5 hover:bg-accent/50 transition-colors ${isActive ? "bg-accent/30" : ""}`}
                        >
                          <div className="flex items-start gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold text-foreground truncate">
                                {lead.fullName || "Sin nombre"}
                              </p>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <CalendarIcon className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                                <span className="text-[10px] text-muted-foreground">
                                  {new Date(lead.appointmentDate).toLocaleDateString("es-MX", { day: "numeric", month: "short" })}
                                </span>
                                {time && (
                                  <>
                                    <Clock className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                                    <span className="text-[10px] text-primary font-medium">{time}</span>
                                  </>
                                )}
                              </div>
                            </div>
                            {lead.leadStatus && (
                              <span className={`text-[8px] px-1 py-0.5 rounded border whitespace-nowrap ${STATUS_COLORS[lead.leadStatus] || "bg-muted text-muted-foreground border-border"}`}>
                                {lead.leadStatus.length > 12 ? lead.leadStatus.slice(0, 12) + "…" : lead.leadStatus}
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            {/* RIGHT - Calendar */}
            <div className="flex-1 flex flex-col order-1 lg:order-2 min-w-0">
              {/* Navigation */}
              <div className="flex items-center justify-between mb-3">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={goPrev}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <h2 className="text-sm sm:text-base font-bold text-foreground">{headerLabel}</h2>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={goNext}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>

              {/* ===== MONTH VIEW ===== */}
              {viewMode === "month" && (
                <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden flex-1">
                  {DAY_NAMES.map((d, i) => (
                    <div key={d} className="bg-muted p-1 sm:p-2 text-center text-[10px] sm:text-xs font-semibold text-muted-foreground">
                      <span className="hidden sm:inline">{d}</span>
                      <span className="sm:hidden">{DAY_NAMES_SHORT[i]}</span>
                    </div>
                  ))}
                  {Array.from({ length: getFirstDayOfWeek(viewYear, viewMonth) }).map((_, i) => (
                    <div key={`e-${i}`} className="bg-card min-h-[48px] sm:min-h-[72px]" />
                  ))}
                  {Array.from({ length: getDaysInMonth(viewYear, viewMonth) }).map((_, i) => {
                    const day = i + 1;
                    const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                    const dayLeads = leadsByDate[dateStr] || [];
                    const isToday = dateStr === todayStr;
                    const isSelected = dateStr === selectedDate;
                    return (
                      <button
                        key={day}
                        onClick={() => setSelectedDate(isSelected ? null : dateStr)}
                        className={`bg-card p-1 sm:p-1.5 min-h-[48px] sm:min-h-[72px] text-left transition-colors hover:bg-accent/50 flex flex-col ${isSelected ? "ring-2 ring-primary ring-inset" : ""}`}
                      >
                        <span className={`text-[10px] sm:text-xs font-medium inline-flex items-center justify-center w-5 h-5 sm:w-6 sm:h-6 rounded-full ${isToday ? "bg-primary text-primary-foreground" : "text-foreground"}`}>
                          {day}
                        </span>
                        {dayLeads.length > 0 && (
                          <div className="mt-auto pt-0.5 space-y-0.5 overflow-hidden">
                            {dayLeads.slice(0, 2).map((lead) => {
                              const time = formatTime(lead.appointmentDate);
                              return (
                                <div key={lead.id} className="text-[7px] sm:text-[9px] bg-green-500/10 text-green-400 rounded px-0.5 py-px truncate">
                                  {time && <span className="font-semibold">{time} </span>}
                                  <span className="hidden sm:inline">{lead.fullName?.split(" ")[0] || ""}</span>
                                </div>
                              );
                            })}
                            {dayLeads.length > 2 && (
                              <span className="text-[7px] text-muted-foreground">+{dayLeads.length - 2}</span>
                            )}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* ===== WEEK VIEW ===== */}
              {viewMode === "week" && (() => {
                const weekDates = getWeekDates(viewWeekStart);
                return (
                  <div className="flex-1 grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden">
                    {weekDates.map((d, i) => {
                      const dateStr = formatDateStr(d);
                      const dayLeads = leadsByDate[dateStr] || [];
                      const isToday = dateStr === todayStr;
                      const isSelected = dateStr === selectedDate;
                      return (
                        <button
                          key={i}
                          onClick={() => setSelectedDate(isSelected ? null : dateStr)}
                          className={`bg-card p-1.5 sm:p-2 min-h-[120px] sm:min-h-[200px] text-left transition-colors hover:bg-accent/50 flex flex-col ${isSelected ? "ring-2 ring-primary ring-inset" : ""}`}
                        >
                          <div className="text-center mb-1">
                            <span className="text-[10px] text-muted-foreground block">{DAY_NAMES[i]}</span>
                            <span className={`text-sm font-bold inline-flex items-center justify-center w-7 h-7 rounded-full ${isToday ? "bg-primary text-primary-foreground" : "text-foreground"}`}>
                              {d.getDate()}
                            </span>
                          </div>
                          {dayLeads.length > 0 && (
                            <div className="space-y-0.5 overflow-hidden flex-1">
                              {dayLeads.slice(0, 4).map((lead) => {
                                const time = formatTime(lead.appointmentDate);
                                return (
                                  <div key={lead.id} className="text-[9px] sm:text-[10px] bg-green-500/10 text-green-400 rounded px-1 py-0.5 truncate">
                                    {time && <span className="font-bold">{time} </span>}
                                    {lead.fullName || "Sin nombre"}
                                  </div>
                                );
                              })}
                              {dayLeads.length > 4 && (
                                <span className="text-[9px] text-muted-foreground">+{dayLeads.length - 4} más</span>
                              )}
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                );
              })()}

              {/* ===== YEAR VIEW ===== */}
              {viewMode === "year" && (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 sm:gap-3">
                  {MONTH_NAMES.map((mName, mIdx) => {
                    const monthDays = getDaysInMonth(viewYear, mIdx);
                    const firstDow = getFirstDayOfWeek(viewYear, mIdx);
                    let monthLeadCount = 0;
                    for (let d = 1; d <= monthDays; d++) {
                      const ds = `${viewYear}-${String(mIdx + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
                      if (leadsByDate[ds]) monthLeadCount += leadsByDate[ds].length;
                    }
                    const isCurrentMonth = viewYear === now.getFullYear() && mIdx === now.getMonth();
                    return (
                      <button
                        key={mIdx}
                        onClick={() => { setViewMonth(mIdx); setViewMode("month"); }}
                        className={`bg-card border rounded-lg p-2 sm:p-3 hover:border-primary/50 transition-colors text-left ${isCurrentMonth ? "border-primary/40" : "border-border"}`}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs font-bold text-foreground">{MONTH_SHORT[mIdx]}</span>
                          {monthLeadCount > 0 && (
                            <Badge variant="secondary" className="text-[9px] px-1 py-0 bg-green-500/15 text-green-400">
                              {monthLeadCount}
                            </Badge>
                          )}
                        </div>
                        <div className="grid grid-cols-7 gap-px">
                          {DAY_NAMES_SHORT.map((dn) => (
                            <span key={dn} className="text-[7px] text-muted-foreground text-center">{dn}</span>
                          ))}
                          {Array.from({ length: firstDow }).map((_, i) => (
                            <span key={`e-${i}`} />
                          ))}
                          {Array.from({ length: monthDays }).map((_, i) => {
                            const d = i + 1;
                            const ds = `${viewYear}-${String(mIdx + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
                            const has = !!leadsByDate[ds];
                            const isTd = ds === todayStr;
                            return (
                              <span
                                key={d}
                                className={`text-[7px] sm:text-[8px] text-center leading-tight rounded-sm ${isTd ? "bg-primary text-primary-foreground font-bold" : has ? "bg-green-500/20 text-green-400 font-semibold" : "text-muted-foreground"}`}
                              >
                                {d}
                              </span>
                            );
                          })}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Selected date detail panel */}
              {selectedDate && (
                <div className="border-t border-border pt-3 mt-3">
                  <h3 className="font-semibold text-foreground mb-2 flex items-center gap-2 text-sm">
                    <CalendarIcon className="w-4 h-4 text-primary" />
                    {new Date(selectedDate + "T12:00:00").toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                    <Badge variant="outline" className="ml-1 text-[10px]">{selectedLeads.length} lead{selectedLeads.length !== 1 ? "s" : ""}</Badge>
                  </h3>
                  {selectedLeads.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-4 text-center">No hay citas este día.</p>
                  ) : (
                    <div className="space-y-2">
                      {selectedLeads.map((lead) => {
                        const time = formatTime(lead.appointmentDate);
                        return (
                          <div key={lead.id} className="bg-card border border-border rounded-lg p-3 hover:border-primary/30 transition-colors">
                            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                                  <h4 className="font-semibold text-foreground text-sm truncate">{lead.fullName || "Sin nombre"}</h4>
                                  {time && (
                                    <span className="flex items-center gap-0.5 text-[10px] text-primary font-medium">
                                      <Clock className="w-3 h-3" />
                                      {time}
                                    </span>
                                  )}
                                  {lead.leadStatus && (
                                    <Badge variant="outline" className={`text-[9px] px-1 py-0 ${STATUS_COLORS[lead.leadStatus] || "bg-muted text-muted-foreground"}`}>
                                      {lead.leadStatus}
                                    </Badge>
                                  )}
                                </div>
                                <div className="flex flex-wrap gap-x-3 text-[11px] text-muted-foreground">
                                  {lead.email && (
                                    <span className="flex items-center gap-1">
                                      <Mail className="w-3 h-3" />
                                      {lead.email}
                                    </span>
                                  )}
                                  {isAdmin && lead.client && (
                                    <Badge variant="outline" className="text-[9px] px-1 py-0">{lead.client}</Badge>
                                  )}
                                </div>
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
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {!selectedDate && leads.length === 0 && !loading && (
                <p className="text-center text-muted-foreground py-8 text-sm">No hay leads con citas programadas.</p>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
