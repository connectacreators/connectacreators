import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import PageTransition from "@/components/PageTransition";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useClients } from "@/hooks/useClients";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
  ExternalLink,
  StickyNote,
} from "lucide-react";
import LanguageToggle from "@/components/LanguageToggle";
import { useTheme } from "@/hooks/useTheme";
import { useLanguage } from "@/hooks/useLanguage";
import { t, tr } from "@/i18n/translations";
import { useIsMobile } from "@/hooks/use-mobile";

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

type ViewMode = "day" | "week" | "month";

const STATUS_COLORS: Record<string, { bg: string; border: string; text: string; badge: string }> = {
  // Standardized status names (DB + new Notion configs)
  "New Lead":    { bg: "bg-yellow-500/15", border: "border-l-yellow-500", text: "text-yellow-600 dark:text-yellow-400", badge: "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 border-yellow-500/30" },
  "Follow-up 1": { bg: "bg-orange-500/15", border: "border-l-orange-500", text: "text-orange-600 dark:text-orange-400", badge: "bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30" },
  "Follow-up 2": { bg: "bg-blue-500/15",   border: "border-l-blue-500",   text: "text-blue-600 dark:text-blue-400",   badge: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30" },
  "Follow-up 3": { bg: "bg-pink-500/15",   border: "border-l-pink-500",   text: "text-pink-600 dark:text-pink-400",   badge: "bg-pink-500/15 text-pink-600 dark:text-pink-400 border-pink-500/30" },
  "Booked":      { bg: "bg-green-500/15",  border: "border-l-green-500",  text: "text-green-600 dark:text-green-400", badge: "bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30" },
  "Canceled":    { bg: "bg-red-500/15",    border: "border-l-red-500",    text: "text-red-600 dark:text-red-400",     badge: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30" },
  // Legacy Notion status names (backward compat)
  "Appointment Booked":        { bg: "bg-green-500/15",  border: "border-l-green-500",  text: "text-green-600 dark:text-green-400",  badge: "bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30" },
  "Follow up #1 (Not Booked)": { bg: "bg-orange-500/15", border: "border-l-orange-500", text: "text-orange-600 dark:text-orange-400", badge: "bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30" },
  "Follow up #2 (Not Booked)": { bg: "bg-blue-500/15",   border: "border-l-blue-500",   text: "text-blue-600 dark:text-blue-400",   badge: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30" },
  "Follow up #3 (Not Booked)": { bg: "bg-pink-500/15",   border: "border-l-pink-500",   text: "text-pink-600 dark:text-pink-400",   badge: "bg-pink-500/15 text-pink-600 dark:text-pink-400 border-pink-500/30" },
  "Meta Ad (Not Booked)":      { bg: "bg-yellow-500/15", border: "border-l-yellow-500", text: "text-yellow-600 dark:text-yellow-400", badge: "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 border-yellow-500/30" },
};

const DEFAULT_STATUS_COLOR = { bg: "bg-muted/50", border: "border-l-muted-foreground", text: "text-muted-foreground", badge: "bg-muted text-muted-foreground" };

function getStatusColor(status: string) {
  return STATUS_COLORS[status] || DEFAULT_STATUS_COLOR;
}

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

// ---- Overlap layout algorithm ----
// Returns a Record<leadId, { columnIndex, columnCount }> for all leads in a single day.
// Events within 45 minutes of each other are grouped into clusters and rendered side-by-side.
function computeLayoutForDay(leads: Lead[]): Record<string, { columnIndex: number; columnCount: number }> {
  // Filter to leads with valid time, sort by time ascending
  const items = leads
    .filter((l) => getHourDecimal(l.appointmentDate) !== null)
    .sort((a, b) => (getHourDecimal(a.appointmentDate) ?? 0) - (getHourDecimal(b.appointmentDate) ?? 0));

  if (items.length === 0) return {};

  // Build adjacency list: overlaps[i] = set of indices j where items[i] and items[j] overlap
  const overlaps: Set<number>[] = items.map(() => new Set<number>());
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const hi = getHourDecimal(items[i].appointmentDate) ?? 0;
      const hj = getHourDecimal(items[j].appointmentDate) ?? 0;
      if (Math.abs(hi - hj) < 0.75) {
        overlaps[i].add(j);
        overlaps[j].add(i);
      }
    }
  }

  // BFS to find clusters (connected components in the overlap graph)
  const visited = new Set<number>();
  const clusters: number[][] = [];
  for (let i = 0; i < items.length; i++) {
    if (visited.has(i)) continue;
    const cluster: number[] = [];
    const queue = [i];
    while (queue.length > 0) {
      const idx = queue.shift()!;
      if (visited.has(idx)) continue;
      visited.add(idx);
      cluster.push(idx);
      overlaps[idx].forEach((neighbor) => {
        if (!visited.has(neighbor)) queue.push(neighbor);
      });
    }
    clusters.push(cluster);
  }

  // Assign column indices within each cluster (greedy, sorted by time)
  const result: Record<string, { columnIndex: number; columnCount: number }> = {};
  for (const cluster of clusters) {
    // Sort cluster members by their time
    const sorted = [...cluster].sort(
      (a, b) => (getHourDecimal(items[a].appointmentDate) ?? 0) - (getHourDecimal(items[b].appointmentDate) ?? 0)
    );
    const colAssigned: Record<number, number> = {};
    for (const idx of sorted) {
      const usedCols = new Set<number>();
      overlaps[idx].forEach((j) => {
        if (j in colAssigned) usedCols.add(colAssigned[j]);
      });
      let col = 0;
      while (usedCols.has(col)) col++;
      colAssigned[idx] = col;
    }
    const colValues = Object.values(colAssigned);
    const clusterSize = colValues.length > 0 ? Math.max(...colValues) + 1 : 1;
    for (const idx of cluster) {
      result[items[idx].id] = {
        columnIndex: colAssigned[idx],
        columnCount: clusterSize,
      };
    }
  }
  return result;
}

// ---- Lead Popover Card ----
function LeadPopoverCard({ lead, isAdmin }: { lead: Lead; isAdmin: boolean }) {
  const time = formatTime(lead.appointmentDate);
  return (
    <div className="space-y-2.5 min-w-[240px]">
      <div className="flex items-start justify-between gap-2">
        <h4 className="font-semibold text-foreground text-sm">{lead.fullName || "No name"}</h4>
        {lead.notionUrl && isAdmin && (
          <a href={lead.notionUrl} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary transition-colors flex-shrink-0">
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
      </div>
      {lead.leadStatus && (
        <StatusBadge status={lead.leadStatus} />
      )}
      <div className="space-y-1.5 text-xs text-muted-foreground">
        {time && (
          <p className="flex items-center gap-1.5"><Clock className="w-3 h-3 text-primary" /><span className="text-foreground font-medium">{time}</span></p>
        )}
        {lead.phone && (
          <a href={`tel:${lead.phone}`} className="flex items-center gap-1.5 text-primary hover:underline"><Phone className="w-3 h-3" />{lead.phone}</a>
        )}
        {lead.email && (
          <a href={`mailto:${lead.email}`} className="flex items-center gap-1.5 hover:text-foreground transition-colors"><Mail className="w-3 h-3" />{lead.email}</a>
        )}
        {isAdmin && lead.client && (
          <p className="flex items-center gap-1.5"><Users className="w-3 h-3" />{lead.client}</p>
        )}
        {lead.notes && (
          <p className="flex items-start gap-1.5"><StickyNote className="w-3 h-3 mt-0.5 flex-shrink-0" /><span className="line-clamp-2">{lead.notes}</span></p>
        )}
      </div>
    </div>
  );
}

// ---- Event Block (used in week/day views) ----
function EventBlock({
  lead, hourHeight, startHour, isAdmin, columnIndex, columnCount,
}: {
  lead: Lead;
  hourHeight: number;
  startHour: number;
  isAdmin: boolean;
  columnIndex?: number;
  columnCount?: number;
}) {
  const hourDec = getHourDecimal(lead.appointmentDate);
  const time = formatTime(lead.appointmentDate);
  if (hourDec === null) return null;
  const top = (hourDec - startHour) * hourHeight;
  if (top < 0) return null;
  const sc = getStatusColor(lead.leadStatus);

  const colIdx = columnIndex ?? 0;
  const colCnt = columnCount ?? 1;
  const widthPct = 100 / colCnt;
  const leftPct = colIdx * widthPct;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <div
          className={`${sc.bg} border-l-[3px] ${sc.border} rounded-r-md px-1.5 py-1 cursor-pointer hover:brightness-110 hover:shadow-sm transition-all z-10 overflow-hidden`}
          style={{
            position: "absolute",
            top,
            minHeight: 40,
            maxHeight: hourHeight - 2,
            width: `calc(${widthPct}% - 2px)`,
            left: `calc(${leftPct}% + 1px)`,
          }}
        >
          {/* Row 1: name + time */}
          <div className="flex items-baseline gap-1 min-w-0">
            <p className={`text-[10px] font-bold ${sc.text} truncate flex-1`}>
              {lead.fullName || "No name"}
            </p>
            {time && (
              <span className="text-[9px] text-muted-foreground whitespace-nowrap flex-shrink-0">
                {time}
              </span>
            )}
          </div>
          {/* Row 2: status badge */}
          {lead.leadStatus && (
            <div className="mt-0.5">
              <span className={`text-[8px] px-1 py-px rounded-full border ${sc.badge} inline-block leading-none`}>
                {lead.leadStatus}
              </span>
            </div>
          )}
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-3" side="right" align="start">
        <LeadPopoverCard lead={lead} isAdmin={isAdmin} />
      </PopoverContent>
    </Popover>
  );
}

// ---- Current Time Indicator ----
function NowIndicator({ hourHeight, startHour }: { hourHeight: number; startHour: number }) {
  const now = new Date();
  const nowHour = now.getHours() + now.getMinutes() / 60;
  if (nowHour < startHour || nowHour > HOURS[HOURS.length - 1] + 1) return null;
  const top = (nowHour - startHour) * hourHeight;
  return (
    <div className="absolute left-0 right-0 z-20 flex items-center pointer-events-none" style={{ top }}>
      <div className="w-2.5 h-2.5 rounded-full bg-destructive -ml-1 shadow-sm" />
      <div className="flex-1 h-[2px] bg-destructive" />
    </div>
  );
}

// ---- Mini Calendar (sidebar) ----
function MiniCalendar({ currentDate, onSelectDate, leadsByDate, monthShort, dayNamesShort }: { currentDate: Date; onSelectDate: (d: Date) => void; leadsByDate: Record<string, Lead[]>; monthShort: string[]; dayNamesShort: string[] }) {
  const [miniYear, setMiniYear] = useState(currentDate.getFullYear());
  const [miniMonth, setMiniMonth] = useState(currentDate.getMonth());
  const todayStr = formatDateStr(new Date());
  const daysInMonth = getDaysInMonth(miniYear, miniMonth);
  const firstDow = getFirstDayOfWeek(miniYear, miniMonth);

  const goPrevMonth = () => {
    if (miniMonth === 0) { setMiniMonth(11); setMiniYear(miniYear - 1); } else setMiniMonth(miniMonth - 1);
  };
  const goNextMonth = () => {
    if (miniMonth === 11) { setMiniMonth(0); setMiniYear(miniYear + 1); } else setMiniMonth(miniMonth + 1);
  };

  return (
    <div className="p-2">
      <div className="flex items-center justify-between mb-1.5">
        <button onClick={goPrevMonth} className="p-0.5 hover:bg-accent rounded"><ChevronLeft className="w-3 h-3" /></button>
        <span className="text-[11px] font-semibold text-foreground">{monthShort[miniMonth]} {miniYear}</span>
        <button onClick={goNextMonth} className="p-0.5 hover:bg-accent rounded"><ChevronRight className="w-3 h-3" /></button>
      </div>
      <div className="grid grid-cols-7 gap-px">
        {dayNamesShort.map((dn, i) => (
          <span key={i} className="text-[8px] text-muted-foreground font-medium w-5 h-5 flex items-center justify-center">{dn}</span>
        ))}
        {Array.from({ length: firstDow }).map((_, i) => <span key={`e-${i}`} />)}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const ds = `${miniYear}-${String(miniMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const hasLeads = !!leadsByDate[ds];
          const isToday = ds === todayStr;
          const isCurrentDate = ds === formatDateStr(currentDate);
          return (
            <button
              key={day}
              onClick={() => onSelectDate(new Date(miniYear, miniMonth, day))}
              className={`text-[9px] text-center leading-none rounded-full w-5 h-5 flex items-center justify-center transition-colors
                ${isCurrentDate ? "bg-primary text-primary-foreground font-bold" : isToday ? "border border-primary text-primary font-semibold" : hasLeads ? "font-semibold text-foreground" : "text-muted-foreground hover:bg-accent"}
              `}
            >
              {day}
              {hasLeads && !isCurrentDate && !isToday && (
                <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---- Half-hour grid lines ----
function TimeGridLines({ hours, hourHeight }: { hours: number[]; hourHeight: number }) {
  return (
    <>
      {hours.map((h) => {
        const top = (h - hours[0]) * hourHeight;
        return (
          <div key={h}>
            {/* Full hour line */}
            <div className="absolute left-0 right-0 flex items-center" style={{ top }}>
              <div className="w-14 flex-shrink-0 pr-2 text-right">
                <span className="text-[10px] text-muted-foreground leading-none">{formatHourLabel(h)}</span>
              </div>
              <div className="flex-1 h-px bg-border/40" />
            </div>
            {/* Half-hour line */}
            <div className="absolute left-14 right-0 h-px bg-border/20" style={{ top: top + hourHeight / 2 }} />
          </div>
        );
      })}
    </>
  );
}


export default function LeadCalendar() {
  const { clientId: urlClientId } = useParams<{ clientId?: string }>();

  const { theme } = useTheme();
  const { language } = useLanguage();
  const { user, loading: authLoading, isAdmin, isVideographer } = useAuth();
  const isStaff = isAdmin || isVideographer;
  const { clients } = useClients(isStaff);
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  // Translations for month and day names
  const MONTH_NAMES = language === "en" ? ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"] : ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
  const MONTH_SHORT = language === "en" ? ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] : ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  const DAY_NAMES = language === "en" ? ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] : ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
  const DAY_NAMES_SHORT = language === "en" ? ["S", "M", "T", "W", "T", "F", "S"] : ["D", "L", "M", "M", "J", "V", "S"];

  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedClient, setSelectedClient] = useState<string>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("week");

  // Auto-select client from URL param
  useEffect(() => {
    if (!urlClientId || clients.length === 0) return;
    const target = clients.find((c) => c.id === urlClientId);
    if (target) setSelectedClient(target.id);
  }, [urlClientId, clients]);

  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [viewDate, setViewDate] = useState(new Date()); // for day view
  const [viewWeekStart, setViewWeekStart] = useState<Date>(() => {
    const d = new Date();
    d.setDate(d.getDate() - d.getDay());
    return d;
  });

  const fetchLeads = useCallback(async (clientId?: string) => {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");
      const params = new URLSearchParams();
      if (clientId && clientId !== "all") params.set("client_id", clientId);
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
      setError(e.message || (language === "en" ? "Error loading leads" : "Error al cargar leads"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && user) {
      fetchLeads(isStaff && selectedClient !== "all" ? selectedClient : undefined);
    }
  }, [authLoading, user, isStaff, selectedClient, fetchLeads]);

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

  const navigateToDay = (date: Date) => {
    setViewDate(date);
    setViewYear(date.getFullYear());
    setViewMonth(date.getMonth());
    const ws = new Date(date);
    ws.setDate(ws.getDate() - ws.getDay());
    setViewWeekStart(ws);
    setViewMode("day");
  };

  const goPrev = () => {
    if (viewMode === "day") {
      const d = new Date(viewDate);
      d.setDate(d.getDate() - 1);
      setViewDate(d);
      setViewYear(d.getFullYear());
      setViewMonth(d.getMonth());
    } else if (viewMode === "month") {
      if (viewMonth === 0) { setViewMonth(11); setViewYear(viewYear - 1); } else setViewMonth(viewMonth - 1);
    } else if (viewMode === "week") {
      const d = new Date(viewWeekStart); d.setDate(d.getDate() - 7); setViewWeekStart(d);
    }
  };
  const goNext = () => {
    if (viewMode === "day") {
      const d = new Date(viewDate);
      d.setDate(d.getDate() + 1);
      setViewDate(d);
      setViewYear(d.getFullYear());
      setViewMonth(d.getMonth());
    } else if (viewMode === "month") {
      if (viewMonth === 11) { setViewMonth(0); setViewYear(viewYear + 1); } else setViewMonth(viewMonth + 1);
    } else if (viewMode === "week") {
      const d = new Date(viewWeekStart); d.setDate(d.getDate() + 7); setViewWeekStart(d);
    }
  };
  const goToday = () => {
    const n = new Date();
    setViewDate(n);
    setViewYear(n.getFullYear()); setViewMonth(n.getMonth());
    const ws = new Date(n); ws.setDate(ws.getDate() - ws.getDay()); setViewWeekStart(ws);
  };

  const headerLabel = viewMode === "day"
    ? viewDate.toLocaleDateString(language === "en" ? "en-US" : "es-MX", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
    : viewMode === "month"
      ? `${MONTH_NAMES[viewMonth]} ${viewYear}`
      : (() => {
          const dates = getWeekDates(viewWeekStart);
          const s = dates[0]; const e = dates[6];
          if (s.getMonth() === e.getMonth()) return `${s.getDate()} – ${e.getDate()} ${MONTH_NAMES[s.getMonth()]} ${s.getFullYear()}`;
          return `${s.getDate()} ${MONTH_SHORT[s.getMonth()]} – ${e.getDate()} ${MONTH_SHORT[e.getMonth()]} ${e.getFullYear()}`;
        })();

  if (authLoading) {
    return <div className="min-h-screen bg-background flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;
  }
  if (!user) { navigate("/"); return null; }

  const HOUR_HEIGHT = 56;

  // For mobile week: show 3 days
  const getVisibleWeekDates = () => {
    const allDates = getWeekDates(viewWeekStart);
    if (!isMobile) return allDates;
    // Show current day (or first day) +/- 1
    const todayIdx = allDates.findIndex(d => formatDateStr(d) === todayStr);
    const centerIdx = todayIdx >= 0 ? todayIdx : 0;
    const start = Math.max(0, Math.min(centerIdx - 1, 4));
    return allDates.slice(start, start + 3);
  };

  return (
    <PageTransition className="min-h-screen bg-background flex flex-col">
    <div style={{ fontFamily: "Arial, sans-serif" }} className="flex flex-col flex-1">
      <AnimatedDots />
      {/* Header */}
      <header className="border-b border-border/50 bg-background/80 backdrop-blur-xl sticky top-0 z-10 hidden lg:block">
        <div className="mx-auto px-3 py-2.5 flex items-center gap-2 max-w-[1600px]">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate("/")}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <h1 className="font-bold text-base sm:text-lg">{tr(t.leadCalendar.title, language)}</h1>
          <div className="ml-auto flex items-center gap-1.5">
            <LanguageToggle />
            <Button variant="outline" size="sm" className="h-7 text-xs px-2" onClick={goToday}>{tr(t.leadCalendar.today, language)}</Button>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => fetchLeads(isStaff && selectedClient !== "all" ? selectedClient : undefined)} disabled={loading}>
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
      </header>

      {/* Body: sidebar (1/4) + calendar (3/4) */}
      <div className="flex-1 flex flex-col lg:flex-row max-w-[1600px] mx-auto w-full">
        {/* LEFT SIDEBAR */}
        <aside className="lg:w-1/4 lg:max-w-[320px] lg:min-w-[240px] border-b lg:border-b-0 lg:border-r border-border bg-card/50 flex flex-col order-1 lg:order-1">
          {/* Mini Calendar */}
          <div className="border-b border-border hidden lg:block">
            <MiniCalendar
              currentDate={viewMode === "day" ? viewDate : new Date(viewYear, viewMonth, 1)}
              onSelectDate={navigateToDay}
              leadsByDate={leadsByDate}
              monthShort={MONTH_SHORT}
              dayNamesShort={DAY_NAMES_SHORT}
            />
          </div>

          <div className="p-3 border-b border-border">
            <h3 className="text-xs font-bold text-foreground flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-primary" />
              {tr(t.leadCalendar.leads, language)} ({leads.length})
            </h3>
            {isStaff && (
              <Select value={selectedClient} onValueChange={setSelectedClient}>
                <SelectTrigger className="w-full h-7 text-xs mt-2">
                  <SelectValue placeholder={tr(t.leadCalendar.client, language)} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{tr(t.leadCalendar.allClients, language)}</SelectItem>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="flex-1 overflow-y-auto max-h-[250px] lg:max-h-none divide-y divide-border">
            {sortedLeads.length === 0 ? (
              <p className="text-xs text-muted-foreground p-4 text-center">{tr(t.leadCalendar.noLeads, language)}</p>
            ) : (
              sortedLeads.map((lead) => {
                const dateKey = lead.appointmentDate.split("T")[0];
                const time = formatTime(lead.appointmentDate);
                const sc = getStatusColor(lead.leadStatus);
                return (
                  <button
                    key={lead.id}
                    onClick={() => navigateToDay(new Date(lead.appointmentDate))}
                    className="w-full text-left px-3 py-2 hover:bg-accent/50 transition-colors"
                  >
                    <p className="text-xs font-semibold text-foreground truncate">{lead.fullName || "No name"}</p>
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
                    {lead.leadStatus && (
                      <StatusBadge status={lead.leadStatus} className="mt-0.5" />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </aside>

        {/* RIGHT - Calendar 75% */}
        <main className="flex-1 flex flex-col order-2 lg:order-2 min-w-0 p-3">
          {/* Controls */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={goPrev}><ChevronLeft className="w-4 h-4" /></Button>
              <h2 className="text-sm sm:text-base font-bold text-foreground min-w-[140px] text-center capitalize">{headerLabel}</h2>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={goNext}><ChevronRight className="w-4 h-4" /></Button>
            </div>
            <div className="flex bg-muted rounded-md p-0.5">
              {(["day", "week", "month"] as ViewMode[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  className={`px-2 py-1 text-[11px] font-medium rounded transition-colors ${viewMode === mode ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {mode === "day" ? "Día" : mode === "week" ? tr(t.leadCalendar.week, language) : tr(t.leadCalendar.month, language)}
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

              {/* ===== DAY VIEW ===== */}
              {viewMode === "day" && (() => {
                const dateStr = formatDateStr(viewDate);
                const dayLeads = leadsByDate[dateStr] || [];
                const isToday = dateStr === todayStr;
                return (
                  <div className="flex-1 flex flex-col border border-border rounded-lg overflow-hidden">
                    <div className="overflow-y-auto" style={{ maxHeight: "calc(100vh - 200px)" }}>
                      {/* Sticky day header inside scroll container */}
                      <div className="sticky top-0 z-10 flex bg-muted/50 border-b border-border">
                        <div className="w-14 flex-shrink-0" />
                        <div className="flex-1 p-2 text-center">
                          <span className="text-xs text-muted-foreground">{DAY_NAMES[viewDate.getDay()]}</span>
                          <span className={`text-lg font-bold inline-flex items-center justify-center w-9 h-9 rounded-full ml-2 ${isToday ? "bg-primary text-primary-foreground" : "text-foreground"}`}>
                            {viewDate.getDate()}
                          </span>
                        </div>
                      </div>
                      <div className="relative" style={{ height: HOURS.length * HOUR_HEIGHT }}>
                        <TimeGridLines hours={HOURS} hourHeight={HOUR_HEIGHT} />
                        <div className="absolute top-0 bottom-0 left-14 right-0">
                          {(() => {
                            const layoutMap = computeLayoutForDay(dayLeads);
                            return dayLeads.map((lead) => {
                              const layout = layoutMap[lead.id] ?? { columnIndex: 0, columnCount: 1 };
                              return (
                                <EventBlock
                                  key={lead.id}
                                  lead={lead}
                                  hourHeight={HOUR_HEIGHT}
                                  startHour={HOURS[0]}
                                  isAdmin={isAdmin}
                                  columnIndex={layout.columnIndex}
                                  columnCount={layout.columnCount}
                                />
                              );
                            });
                          })()}
                          {isToday && <NowIndicator hourHeight={HOUR_HEIGHT} startHour={HOURS[0]} />}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* ===== WEEK VIEW with time grid ===== */}
              {viewMode === "week" && (() => {
                const weekDates = getVisibleWeekDates();
                const colCount = weekDates.length;
                return (
                  <div className="flex-1 flex flex-col border border-border rounded-lg overflow-hidden">
                    <div className="overflow-y-auto" style={{ maxHeight: "calc(100vh - 200px)" }}>
                      {/* Sticky day headers inside scroll container so they share the same width */}
                      <div className="sticky top-0 z-10 flex bg-muted/50 border-b border-border">
                        <div className="w-14 flex-shrink-0" />
                        <div className="flex-1 grid" style={{ gridTemplateColumns: `repeat(${colCount}, minmax(0, 1fr))` }}>
                          {weekDates.map((d, i) => {
                            const dateStr = formatDateStr(d);
                            const isToday = dateStr === todayStr;
                            return (
                              <div key={i} className={`p-1.5 text-center ${i > 0 ? "border-l border-border/30" : ""} ${isToday ? "bg-primary/10" : ""}`}>
                                <span className="text-[10px] text-muted-foreground block">{DAY_NAMES[d.getDay()]}</span>
                                <button
                                  onClick={() => navigateToDay(d)}
                                  className={`text-sm font-bold inline-flex items-center justify-center w-7 h-7 rounded-full hover:bg-accent transition-colors ${isToday ? "bg-primary text-primary-foreground" : "text-foreground"}`}
                                >
                                  {d.getDate()}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                      {/* Time grid */}
                      <div className="relative" style={{ height: HOURS.length * HOUR_HEIGHT }}>
                        <TimeGridLines hours={HOURS} hourHeight={HOUR_HEIGHT} />
                        <div className="absolute top-0 bottom-0 left-14 right-0 grid" style={{ gridTemplateColumns: `repeat(${colCount}, minmax(0, 1fr))` }}>
                          {weekDates.map((d, colIdx) => {
                            const dateStr = formatDateStr(d);
                            const dayLeads = leadsByDate[dateStr] || [];
                            const isToday = dateStr === todayStr;
                            return (
                              <div key={colIdx} className={`relative ${colIdx > 0 ? "border-l border-border/30" : ""} ${isToday ? "bg-primary/5" : ""}`}>
                                {(() => {
                                  const layoutMap = computeLayoutForDay(dayLeads);
                                  return dayLeads.map((lead) => {
                                    const layout = layoutMap[lead.id] ?? { columnIndex: 0, columnCount: 1 };
                                    return (
                                      <EventBlock
                                        key={lead.id}
                                        lead={lead}
                                        hourHeight={HOUR_HEIGHT}
                                        startHour={HOURS[0]}
                                        isAdmin={isAdmin}
                                        columnIndex={layout.columnIndex}
                                        columnCount={layout.columnCount}
                                      />
                                    );
                                  });
                                })()}
                                {isToday && <NowIndicator hourHeight={HOUR_HEIGHT} startHour={HOURS[0]} />}
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
                    return (
                      <button
                        key={day}
                        onClick={() => navigateToDay(new Date(viewYear, viewMonth, day))}
                        className="bg-card p-1 sm:p-1.5 min-h-[48px] sm:min-h-[72px] text-left transition-colors hover:bg-accent/50 flex flex-col"
                      >
                        <span className={`text-[10px] sm:text-xs font-medium inline-flex items-center justify-center w-5 h-5 sm:w-6 sm:h-6 rounded-full ${isToday ? "bg-primary text-primary-foreground" : "text-foreground"}`}>
                          {day}
                        </span>
                        {dayLeads.length > 0 && (
                          <div className="mt-auto pt-0.5 space-y-0.5 overflow-hidden">
                            {dayLeads.slice(0, 2).map((lead) => {
                              const time = formatTime(lead.appointmentDate);
                              const sc = getStatusColor(lead.leadStatus);
                              return (
                                <div key={lead.id} className={`text-[7px] sm:text-[9px] ${sc.bg} ${sc.text} rounded-md px-1 py-px truncate border-l-2 ${sc.border}`}>
                                  {time && <span className="font-semibold">{time} </span>}
                                  <span className="hidden sm:inline">{lead.fullName?.split(" ")[0] || ""}</span>
                                </div>
                              );
                            })}
                            {dayLeads.length > 2 && (
                              <span className="text-[7px] text-muted-foreground font-medium">+{dayLeads.length - 2} más</span>
                            )}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}


              {leads.length === 0 && !loading && (
                <p className="text-center text-muted-foreground py-8 text-sm">{tr(t.leadCalendar.noAppointments, language)}</p>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
    </PageTransition>
  );
}
