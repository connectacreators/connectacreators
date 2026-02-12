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
import ThemeToggle from "@/components/ThemeToggle";
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
const HOURS = Array.from({ length: 15 }, (_, i) => i + 7); // 7am to 9pm

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

function getHourDecimal(dateStr: string): number | null {
  if (!dateStr || !dateStr.includes("T")) return null;
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    return d.getHours() + d.getMinutes() / 60;
  } catch {
    return null;
  }
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

function formatHourLabel(h: number) {
  if (h === 0) return "12 AM";
  if (h < 12) return `${h} AM`;
  if (h === 12) return "12 PM";
  return `${h - 12} PM`;
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
  const [viewMode, setViewMode] = useState<ViewMode>("week");

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

  const sortedLeads = useMemo(() => {
    return [...leads].sort((a, b) => new Date(a.appointmentDate).getTime() - new Date(b.appointmentDate).getTime());
  }, [leads]);

  const todayStr = formatDateStr(now);

  const goPrev = () => {
    if (viewMode === "month") {
      if (viewMonth === 0) { setViewMonth(11); setViewYear(viewYear - 1); } else setViewMonth(viewMonth - 1);
    } else if (viewMode === "week") {
      const d = new Date(viewWeekStart); d.setDate(d.getDate() - 7); setViewWeekStart(d);
    } else { setViewYear(viewYear - 1); }
  };
  const goNext = () => {
    if (viewMode === "month") {
      if (viewMonth === 11) { setViewMonth(0); setViewYear(viewYear + 1); } else setViewMonth(viewMonth + 1);
    } else if (viewMode === "week") {
      const d = new Date(viewWeekStart); d.setDate(d.getDate() + 7); setViewWeekStart(d);
    } else { setViewYear(viewYear + 1); }
  };
  const goToday = () => {
    const n = new Date();
    setViewYear(n.getFullYear()); setViewMonth(n.getMonth());
    const ws = new Date(n); ws.setDate(ws.getDate() - ws.getDay()); setViewWeekStart(ws);
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
    return <div className="min-h-screen bg-background flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;
  }
  if (!user) { navigate("/"); return null; }

  const HOUR_HEIGHT = 56; // px per hour slot

  return (
    <div className="min-h-screen bg-background flex flex-col" style={{ fontFamily: "Arial, sans-serif" }}>
      {/* Header */}
      <header className="border-b border-border/50 bg-background/80 backdrop-blur-xl sticky top-0 z-10">
        <div className="mx-auto px-3 py-2.5 flex items-center gap-2 max-w-[1600px]">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate("/")}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <img src={chessKnightIcon} alt="Connecta" className="h-6" />
          <h1 className="font-bold text-base sm:text-lg">Lead Calendar</h1>
          <div className="ml-auto flex items-center gap-1.5">
            <ThemeToggle />
            <Button variant="outline" size="sm" className="h-7 text-xs px-2" onClick={goToday}>Hoy</Button>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => fetchLeads(isAdmin && selectedClient !== "all" ? selectedClient : undefined)} disabled={loading}>
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
      </header>

      {/* Body: sidebar (1/4) + calendar (3/4) */}
      <div className="flex-1 flex flex-col lg:flex-row max-w-[1600px] mx-auto w-full">
        {/* LEFT SIDEBAR - 25% */}
        <aside className="lg:w-1/4 lg:max-w-[320px] lg:min-w-[240px] border-b lg:border-b-0 lg:border-r border-border bg-card/50 flex flex-col order-2 lg:order-1">
          <div className="p-3 border-b border-border">
            <h3 className="text-xs font-bold text-foreground flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-primary" />
              Leads ({leads.length})
            </h3>
            {isAdmin && (
              <Select value={selectedClient} onValueChange={setSelectedClient}>
                <SelectTrigger className="w-full h-7 text-xs mt-2">
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
          </div>
          <div className="flex-1 overflow-y-auto max-h-[250px] lg:max-h-none divide-y divide-border">
            {sortedLeads.length === 0 ? (
              <p className="text-xs text-muted-foreground p-4 text-center">No hay leads.</p>
            ) : (
              sortedLeads.map((lead) => {
                const dateKey = lead.appointmentDate.split("T")[0];
                const time = formatTime(lead.appointmentDate);
                const isActive = selectedDate === dateKey;
                return (
                  <button
                    key={lead.id}
                    onClick={() => setSelectedDate(dateKey === selectedDate ? null : dateKey)}
                    className={`w-full text-left px-3 py-2 hover:bg-accent/50 transition-colors ${isActive ? "bg-accent/40 border-l-2 border-l-primary" : ""}`}
                  >
                    <p className="text-xs font-semibold text-foreground truncate">{lead.fullName || "Sin nombre"}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <CalendarIcon className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(lead.appointmentDate).toLocaleDateString("es-MX", { day: "numeric", month: "short" })}
                      </span>
                      {time && (
                        <>
                          <Clock className="w-3 h-3 text-primary flex-shrink-0" />
                          <span className="text-[10px] text-primary font-medium">{time}</span>
                        </>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        {/* RIGHT - Calendar 75% */}
        <main className="flex-1 flex flex-col order-1 lg:order-2 min-w-0 p-3">
          {/* Controls */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={goPrev}><ChevronLeft className="w-4 h-4" /></Button>
              <h2 className="text-sm sm:text-base font-bold text-foreground min-w-[140px] text-center">{headerLabel}</h2>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={goNext}><ChevronRight className="w-4 h-4" /></Button>
            </div>
            <div className="flex bg-muted rounded-md p-0.5">
              {(["week", "month", "year"] as ViewMode[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors ${viewMode === mode ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {mode === "week" ? "Semana" : mode === "month" ? "Mes" : "Año"}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 mb-2 text-xs text-destructive">{error}</div>
          )}

          {loading ? (
            <div className="flex-1 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="flex-1 flex flex-col">

              {/* ===== WEEK VIEW with time grid ===== */}
              {viewMode === "week" && (() => {
                const weekDates = getWeekDates(viewWeekStart);
                return (
                  <div className="flex-1 flex flex-col border border-border rounded-lg overflow-hidden">
                    {/* Day headers */}
                    <div className="flex border-b border-border bg-muted">
                      <div className="w-12 flex-shrink-0" />
                      <div className="flex-1 grid grid-cols-7">
                        {weekDates.map((d, i) => {
                          const dateStr = formatDateStr(d);
                          const isToday = dateStr === todayStr;
                          return (
                            <div key={i} className={`p-1.5 text-center border-l border-border/30 ${isToday ? "bg-primary/10" : ""}`}>
                              <span className="text-[10px] text-muted-foreground block">{DAY_NAMES[i]}</span>
                              <span className={`text-sm font-bold inline-flex items-center justify-center w-7 h-7 rounded-full ${isToday ? "bg-primary text-primary-foreground" : "text-foreground"}`}>
                                {d.getDate()}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    {/* Time grid - scrollable */}
                    <div className="flex-1 overflow-y-auto" style={{ maxHeight: "calc(100vh - 200px)" }}>
                      <div className="relative" style={{ height: HOURS.length * HOUR_HEIGHT }}>
                        {/* Full-width horizontal hour lines + labels */}
                        {HOURS.map((h) => {
                          const top = (h - HOURS[0]) * HOUR_HEIGHT;
                          return (
                            <div key={h} className="absolute left-0 right-0 flex items-start" style={{ top }}>
                              <div className="w-12 flex-shrink-0 pr-1 text-right -translate-y-1/2">
                                <span className="text-[9px] text-muted-foreground leading-none">{formatHourLabel(h)}</span>
                              </div>
                              <div className="flex-1 border-t border-border/40" />
                            </div>
                          );
                        })}
                        {/* Day columns overlay */}
                        <div className="absolute top-0 bottom-0 left-12 right-0 grid grid-cols-7">
                          {weekDates.map((d, colIdx) => {
                            const dateStr = formatDateStr(d);
                            const dayLeads = leadsByDate[dateStr] || [];
                            const isToday = dateStr === todayStr;
                            return (
                              <div
                                key={colIdx}
                                className={`relative border-l border-border/30 ${isToday ? "bg-primary/5" : ""}`}
                                onClick={() => setSelectedDate(dateStr === selectedDate ? null : dateStr)}
                              >
                                {/* Lead blocks positioned by time */}
                                {dayLeads.map((lead) => {
                                  const hourDec = getHourDecimal(lead.appointmentDate);
                                  const time = formatTime(lead.appointmentDate);
                                  if (hourDec === null) return null;
                                  const top = (hourDec - HOURS[0]) * HOUR_HEIGHT;
                                  if (top < 0) return null;
                                  return (
                                    <div
                                      key={lead.id}
                                      className="absolute left-0.5 right-0.5 bg-green-500/20 border-l-2 border-l-green-400 rounded-r px-1 py-0.5 cursor-pointer hover:bg-green-500/30 transition-colors z-10 overflow-hidden"
                                      style={{ top, minHeight: 24, maxHeight: HOUR_HEIGHT - 2 }}
                                      title={`${lead.fullName} - ${time}`}
                                    >
                                      <p className="text-[9px] sm:text-[10px] font-bold text-green-400 truncate">{time}</p>
                                      <p className="text-[8px] sm:text-[9px] text-foreground truncate">{lead.fullName || "Sin nombre"}</p>
                                    </div>
                                  );
                                })}
                                {/* Now indicator */}
                                {isToday && (() => {
                                  const nowHour = now.getHours() + now.getMinutes() / 60;
                                  if (nowHour < HOURS[0] || nowHour > HOURS[HOURS.length - 1] + 1) return null;
                                  const top = (nowHour - HOURS[0]) * HOUR_HEIGHT;
                                  return (
                                    <div className="absolute left-0 right-0 z-20 flex items-center" style={{ top }}>
                                      <div className="w-2 h-2 rounded-full bg-destructive -ml-1" />
                                      <div className="flex-1 h-px bg-destructive" />
                                    </div>
                                  );
                                })()}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

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
                            {dayLeads.length > 2 && <span className="text-[7px] text-muted-foreground">+{dayLeads.length - 2}</span>}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* ===== YEAR VIEW ===== */}
              {viewMode === "year" && (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 sm:gap-3">
                  {MONTH_NAMES.map((_mName, mIdx) => {
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
                            <Badge variant="secondary" className="text-[9px] px-1 py-0 bg-green-500/15 text-green-400">{monthLeadCount}</Badge>
                          )}
                        </div>
                        <div className="grid grid-cols-7 gap-px">
                          {DAY_NAMES_SHORT.map((dn) => (
                            <span key={dn} className="text-[7px] text-muted-foreground text-center">{dn}</span>
                          ))}
                          {Array.from({ length: firstDow }).map((_, i) => <span key={`e-${i}`} />)}
                          {Array.from({ length: monthDays }).map((_, i) => {
                            const d = i + 1;
                            const ds = `${viewYear}-${String(mIdx + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
                            const has = !!leadsByDate[ds];
                            const isTd = ds === todayStr;
                            return (
                              <span key={d} className={`text-[7px] sm:text-[8px] text-center leading-tight rounded-sm ${isTd ? "bg-primary text-primary-foreground font-bold" : has ? "bg-green-500/20 text-green-400 font-semibold" : "text-muted-foreground"}`}>
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

              {/* Selected date detail */}
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
                                      <Clock className="w-3 h-3" />{time}
                                    </span>
                                  )}
                                  {lead.leadStatus && (
                                    <Badge variant="outline" className={`text-[9px] px-1 py-0 ${STATUS_COLORS[lead.leadStatus] || "bg-muted text-muted-foreground"}`}>
                                      {lead.leadStatus}
                                    </Badge>
                                  )}
                                </div>
                                <div className="flex flex-wrap gap-x-3 text-[11px] text-muted-foreground">
                                  {lead.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{lead.email}</span>}
                                  {isAdmin && lead.client && <Badge variant="outline" className="text-[9px] px-1 py-0">{lead.client}</Badge>}
                                </div>
                              </div>
                              {lead.phone && (
                                <a href={`tel:${lead.phone}`} className="flex items-center gap-1.5 text-primary hover:text-primary/80 transition-colors font-semibold text-sm flex-shrink-0">
                                  <Phone className="w-4 h-4" />{lead.phone}
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
          )}
        </main>
      </div>
    </div>
  );
}
