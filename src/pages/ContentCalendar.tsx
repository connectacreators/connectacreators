import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  Loader2, ArrowLeft, ChevronLeft, ChevronRight, Download,
  CheckCircle, XCircle, ExternalLink, Calendar, AlertCircle, MessageSquare, Copy, Share2,
} from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CalendarPost {
  id: string;
  notion_page_id?: string | null;   // optional — always null after migration
  client_id: string;                // required — non-null FK
  title: string;
  scheduled_date: string;           // YYYY-MM-DD (truncated at mapping boundary)
  post_status: string;              // Scheduled | Approved | Needs Revision | Done
  file_submission_url?: string | null;
  script_url?: string | null;
  revision_notes?: string | null;
  caption?: string | null;
  client_name?: string;
}

// ─── Module-level constants (never re-created) ────────────────────────────────

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const MONTH_NAMES_ES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];
const DAY_NAMES_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_NAMES_ES = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

// ─── Helpers (pure, defined outside component) ────────────────────────────────

function extractGoogleDriveFileId(url: string): string | null {
  const m1 = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (m1) return m1[1];
  const m2 = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (m2) return m2[1];
  return null;
}

function getGoogleDriveDownloadUrl(fileId: string): string {
  return `https://drive.google.com/uc?export=download&id=${fileId}`;
}

// Cached status configs — only 4 possible values, no recomputation needed
const STATUS_CONFIGS: Record<string, ReturnType<typeof buildStatusConfig>> = {};
function buildStatusConfig(s: string) {
  const lower = s?.toLowerCase() || "";
  if (lower === "approved" || lower === "done") return {
    bg: "bg-emerald-500/20 hover:bg-emerald-500/35",
    border: "border-emerald-500/40",
    text: "text-emerald-400",
    dot: "bg-emerald-400",
    badge: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  };
  if (lower === "needs revision") return {
    bg: "bg-destructive/15 hover:bg-destructive/25",
    border: "border-destructive/40",
    text: "text-destructive",
    dot: "bg-destructive",
    badge: "bg-destructive/15 text-destructive border-destructive/30",
  };
  if (lower === "scheduled") return {
    bg: "bg-primary/15 hover:bg-primary/25",
    border: "border-primary/40",
    text: "text-primary",
    dot: "bg-primary",
    badge: "bg-primary/15 text-primary border-primary/30",
  };
  return {
    bg: "bg-muted/40 hover:bg-muted/60",
    border: "border-border/50",
    text: "text-muted-foreground",
    dot: "bg-muted-foreground",
    badge: "bg-muted text-muted-foreground border-border/30",
  };
}
function getStatusConfig(status: string) {
  const key = status?.toLowerCase() || "";
  if (!STATUS_CONFIGS[key]) STATUS_CONFIGS[key] = buildStatusConfig(status);
  return STATUS_CONFIGS[key];
}

// Build a 6-week (42-cell) calendar grid
function buildCalendarGrid(year: number, month: number): Date[] {
  const firstDay = new Date(year, month, 1);
  const startOffset = firstDay.getDay();
  const grid: Date[] = [];
  for (let i = startOffset - 1; i >= 0; i--) grid.push(new Date(year, month, -i));
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) grid.push(new Date(year, month, d));
  while (grid.length < 42) {
    const last = grid[grid.length - 1];
    grid.push(new Date(last.getTime() + 86400000));
  }
  return grid;
}

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Static today key — never changes within a session
const TODAY_KEY = toDateKey(new Date());

function formatAgendaDate(dateStr: string, language: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString(
    language === "en" ? "en-US" : "es-ES",
    { month: "short", day: "numeric", weekday: "short" }
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ContentCalendar() {
  const { clientId } = useParams<{ clientId: string }>();
  const { user, loading, isAdmin, isEditor } = useAuth();
  const navigate = useNavigate();
  const { language } = useLanguage();

  const [clientName, setClientName] = useState("");
  const [posts, setPosts] = useState<CalendarPost[]>([]);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const todayForNav = useMemo(() => new Date(), []);
  const [currentDate, setCurrentDate] = useState(
    () => new Date(todayForNav.getFullYear(), todayForNav.getMonth(), 1)
  );

  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedPost, setSelectedPost] = useState<CalendarPost | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [showRevisionModal, setShowRevisionModal] = useState(false);
  const [revisionNotes, setRevisionNotes] = useState("");
  const [viewMode, setViewMode] = useState<"agenda" | "table">("agenda");
  const [copiedLink, setCopiedLink] = useState(false);

  // Admin client filter (when no clientId param)
  const [allClients, setAllClients] = useState<{ id: string; name: string }[]>([]);
  const [filterClientId, setFilterClientId] = useState<string>("all");

  // Editor state
  const [editorClients, setEditorClients] = useState<{ id: string; name: string }[]>([]);
  const [editorSelectedClientId, setEditorSelectedClientId] = useState<string | null>(null);

  const agendaRef = useRef<HTMLDivElement>(null);

  // Derived year/month — stable references for memoization
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  // Memoized: calendar grid only rebuilds when month/year changes
  const calendarGrid = useMemo(() => buildCalendarGrid(year, month), [year, month]);

  // Filtered posts by client (admin view)
  const filteredPosts = useMemo(() => {
    if (clientId || filterClientId === "all") return posts;
    return posts.filter(p => p.client_id === filterClientId);
  }, [posts, filterClientId, clientId]);

  // Memoized: posts grouped by date — only rebuilds when posts array changes
  const postsByDate = useMemo(() => {
    const map = new Map<string, CalendarPost[]>();
    for (const post of filteredPosts) {
      const key = post.scheduled_date;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(post);
    }
    return map;
  }, [filteredPosts]);

  // Memoized: sorted unique dates for agenda
  const sortedDates = useMemo(() => {
    const dates = Array.from(postsByDate.keys());
    return dates.sort((a, b) => a.localeCompare(b));
  }, [postsByDate]);

  const monthNames = language === "en" ? MONTH_NAMES : MONTH_NAMES_ES;
  const dayNames = language === "en" ? DAY_NAMES_EN : DAY_NAMES_ES;

  // Memoized navigation handlers — stable references prevent child re-renders
  const prevMonth = useCallback(() => setCurrentDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1)), []);
  const nextMonth = useCallback(() => setCurrentDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1)), []);

  const handleSharePublicLink = useCallback(() => {
    if (!clientId) return;
    const publicLink = `${window.location.origin}/public/calendar/${clientId}`;
    navigator.clipboard.writeText(publicLink);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
    toast.success(language === "en" ? "Public link copied!" : "¡Enlace público copiado!");
  }, [clientId, language]);

  // Fetch client name
  useEffect(() => {
    if (!clientId || !user) return;
    supabase
      .from("clients")
      .select("name")
      .eq("id", clientId)
      .maybeSingle()
      .then(({ data }) => { if (data) setClientName(data.name); });
  }, [clientId, user]);

  // Fetch clients list for admin filter
  useEffect(() => {
    if (clientId || !isAdmin || !user) return;
    supabase
      .from("clients")
      .select("id, name")
      .order("name")
      .then(({ data }) => { if (data) setAllClients(data); });
  }, [clientId, isAdmin, user]);

  // Fetch assigned clients for editor
  useEffect(() => {
    if (!isEditor || !user) return;
    supabase
      .from("videographer_clients")
      .select("client_id, clients(id, name)")
      .eq("videographer_user_id", user.id)
      .then(({ data }) => {
        const clients = (data || [])
          .filter((a: any) => a.clients)
          .map((a: any) => ({ id: a.clients.id, name: a.clients.name }));
        setEditorClients(clients);
        if (clients.length > 0 && !editorSelectedClientId) {
          setEditorSelectedClientId(clients[0].id);
        }
      });
  }, [isEditor, user]);

  // Update client name when editor switches client
  useEffect(() => {
    if (!isEditor || !editorSelectedClientId) return;
    const client = editorClients.find((c) => c.id === editorSelectedClientId);
    if (client) setClientName(client.name);
  }, [isEditor, editorSelectedClientId, editorClients]);

  // Fetch posts
  const fetchPosts = useCallback(async () => {
    if (!user) return;
    setFetching(true);
    setError(null);
    try {
      let query = supabase
        .from("video_edits")
        .select("id, reel_title, schedule_date, post_status, assignee, script_id, file_submission, caption, script_url, revisions, client_id")
        .not("schedule_date", "is", null)
        .order("schedule_date", { ascending: true });
      if (clientId) {
        query = query.eq("client_id", clientId);
      } else if (isEditor) {
        const targetId = editorSelectedClientId;
        if (!targetId) {
          setPosts([]);
          setFetching(false);
          return;
        }
        query = query.eq("client_id", targetId);
      }

      const { data, error: fetchErr } = await query;
      if (fetchErr) throw fetchErr;

      // Map video_edits fields to CalendarPost, truncating TIMESTAMPTZ to YYYY-MM-DD
      const mappedData: CalendarPost[] = (data || []).map((v: any) => ({
        id: v.id,
        notion_page_id: null,
        client_id: v.client_id,
        title: v.reel_title || "Untitled",
        scheduled_date: (v.schedule_date as string).slice(0, 10),
        post_status: v.post_status || "Unpublished",
        file_submission_url: v.file_submission,
        script_url: v.script_url,
        revision_notes: v.revisions ?? null,
        caption: v.caption,
      }));

      if (isAdmin && !clientId && mappedData.length > 0) {
        const uniqueIds = [...new Set(mappedData.map((p) => p.client_id))];
        const { data: clientsData } = await supabase
          .from("clients").select("id, name").in("id", uniqueIds);
        const clientMap = new Map<string, string>();
        (clientsData || []).forEach((c: any) => clientMap.set(c.id, c.name));
        setPosts(mappedData.map((p) => ({ ...p, client_name: clientMap.get(p.client_id) || "" })));
      } else {
        setPosts(mappedData);
      }
    } catch (e: any) {
      setError(e.message || "Failed to load calendar");
    } finally {
      setFetching(false);
    }
  }, [clientId, user, isAdmin, isEditor, editorSelectedClientId]);

  useEffect(() => { fetchPosts(); }, [fetchPosts]);

  // Scroll agenda to selected date
  useEffect(() => {
    if (!selectedDate || !agendaRef.current) return;
    const dateElement = agendaRef.current.querySelector(`[data-date="${selectedDate}"]`);
    if (dateElement) {
      dateElement.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [selectedDate]);

  // Approval handlers — memoized so they don't cause child re-renders
  const handleApprove = useCallback(async () => {
    if (!selectedPost) return;
    setUpdatingStatus(true);
    try {
      // Get current session to pass auth header
      const { data: { session } } = await supabase.auth.getSession();
      const authHeader = session?.access_token ? `Bearer ${session.access_token}` : undefined;

      const res = await supabase.functions.invoke("update-post-status", {
        headers: authHeader ? { Authorization: authHeader } : {},
        body: { id: selectedPost.id, status: "Approved" },
      });
      if (res.error) throw res.error;
      toast.success(language === "en" ? "Post approved!" : "¡Post aprobado!");
      const id = selectedPost.id;
      setPosts((prev) => prev.map((p) => p.id === id ? { ...p, post_status: "Approved" } : p));
      setSelectedPost((prev) => prev ? { ...prev, post_status: "Approved" } : null);
    } catch (error) {
      console.error("Approve error:", error);
      toast.error(language === "en" ? "Failed to approve" : "Error al aprobar");
    } finally {
      setUpdatingStatus(false);
    }
  }, [selectedPost, language]);

  // Step 1: open the revision notes modal
  const handleRevisionClick = useCallback(() => {
    setRevisionNotes(selectedPost?.revision_notes || "");
    setShowRevisionModal(true);
  }, [selectedPost]);

  // Step 2: submit revision with notes
  const handleSubmitRevision = useCallback(async () => {
    if (!selectedPost) return;
    setShowRevisionModal(false);
    setUpdatingStatus(true);
    try {
      // Get current session to pass auth header
      const { data: { session } } = await supabase.auth.getSession();
      const authHeader = session?.access_token ? `Bearer ${session.access_token}` : undefined;

      const res = await supabase.functions.invoke("update-post-status", {
        headers: authHeader ? { Authorization: authHeader } : {},
        body: {
          id: selectedPost.id,
          status: "Needs Revision",
          revision_notes: revisionNotes,
        },
      });
      if (res.error) throw res.error;
      toast.success(language === "en" ? "Sent back for revision." : "Enviado para revisión.");
      const id = selectedPost.id;
      setPosts((prev) => prev.map((p) => p.id === id ? { ...p, post_status: "Needs Revision", revision_notes: revisionNotes } : p));
      setSelectedPost((prev) => prev ? { ...prev, post_status: "Needs Revision", revision_notes: revisionNotes } : null);
    } catch (error) {
      console.error("Revision error:", error);
      toast.error(language === "en" ? "Failed to update status" : "Error al actualizar estado");
    } finally {
      setUpdatingStatus(false);
    }
  }, [selectedPost, revisionNotes, language]);

  if (loading) {
    return (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
    );
  }

  return (

    <>
      <main className="flex-1 flex flex-col min-h-screen overflow-hidden">

        <div className="flex-1 px-4 sm:px-6 py-6 flex flex-col animate-fade-in">

          {/* Header: Back button + Title + Share button */}
          <div className="flex items-center justify-between gap-3 mb-6">
            <div className="flex items-center gap-3">
              {clientId && (
                <button
                  onClick={() => navigate(`/clients/${clientId}`)}
                  className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  {clientName || (language === "en" ? "Back" : "Volver")}
                </button>
              )}
              <h1 className="text-xl sm:text-2xl font-bold text-foreground tracking-tight flex items-center gap-2">
                <Calendar className="w-5 h-5 text-primary" />
                {language === "en" ? "Content Calendar" : "Calendario de Contenido"}
              </h1>
            </div>
            <div className="flex items-center gap-2">
              {/* Client Filter — admin only, no clientId */}
              {isAdmin && !clientId && allClients.length > 0 && (
                <select
                  value={filterClientId}
                  onChange={(e) => setFilterClientId(e.target.value)}
                  className="h-8 px-2 pr-7 text-xs rounded-md border border-border/50 bg-card/50 text-foreground backdrop-blur-sm focus:outline-none focus:ring-1 focus:ring-primary/50 appearance-none cursor-pointer"
                  style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 6px center' }}
                >
                  <option value="all">{language === "en" ? "All Clients" : "Todos los Clientes"}</option>
                  {allClients.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              )}
              {/* Share Button - Desktop only */}
              {clientId && (
                <Button
                  onClick={handleSharePublicLink}
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs hidden md:inline-flex"
                  title={language === "en" ? "Copy public link" : "Copiar enlace público"}
                >
                  {copiedLink ? (
                    <>
                      <CheckCircle className="w-3.5 h-3.5" />
                      {language === "en" ? "Copied!" : "¡Copiado!"}
                    </>
                  ) : (
                    <>
                      <Share2 className="w-3.5 h-3.5" />
                      {language === "en" ? "Share" : "Compartir"}
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 mb-4 text-xs text-muted-foreground flex-wrap">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-primary" />
              {language === "en" ? "Scheduled" : "Programado"}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              {language === "en" ? "Approved" : "Aprobado"}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-destructive" />
              {language === "en" ? "Needs Revision" : "Necesita Revisión"}
            </span>
          </div>

          {/* Editor: client picker */}
          {isEditor && !clientId && (
            <div className="mb-4 flex items-center gap-3">
              <Select
                value={editorSelectedClientId || ""}
                onValueChange={setEditorSelectedClientId}
              >
                <SelectTrigger className="w-[220px] h-9 text-sm">
                  <SelectValue placeholder="Select client" />
                </SelectTrigger>
                <SelectContent>
                  {editorClients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Editor: no assigned clients */}
          {isEditor && editorClients.length === 0 && !fetching && (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-2">
              <Calendar className="w-10 h-10 opacity-30" />
              <p className="text-sm">You have no assigned clients. Contact your admin.</p>
            </div>
          )}

          {fetching ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <AlertCircle className="w-8 h-8 text-destructive mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">{error}</p>
                <Button variant="outline" size="sm" className="mt-3" onClick={fetchPosts}>
                  {language === "en" ? "Retry" : "Reintentar"}
                </Button>
              </div>
            </div>
          ) : filteredPosts.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center text-sm text-muted-foreground">
                <Calendar className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p>{language === "en"
                  ? "No scheduled posts yet. Use the Schedule button in the Editing Queue to add posts."
                  : "No hay posts programados aún. Usa el botón Programar en la Cola de Edición."}
                </p>
              </div>
            </div>
          ) : (
            // ─── Calendar + Agenda Layout (Google Calendar Style) ────────────────────
            <div className="flex-1 flex flex-col md:flex-row gap-4 min-h-0">

              {/* ─── Agenda + Table View (LEFT - Fixed width on desktop) ──────────────────────────────────── */}
              <div className="w-full md:w-72 min-h-0 flex flex-col flex-shrink-0">
                {/* View Toggle */}
                <div className="flex gap-2 mb-3 md:mb-0 md:mb-3">
                  <button
                    onClick={() => setViewMode("agenda")}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all flex-1 ${
                      viewMode === "agenda"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    }`}
                  >
                    {language === "en" ? "Agenda" : "Agenda"}
                  </button>
                  <button
                    onClick={() => setViewMode("table")}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all flex-1 ${
                      viewMode === "table"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    }`}
                  >
                    {language === "en" ? "Scheduled" : "Programados"}
                  </button>
                </div>

                {/* Agenda or Table View */}
                <div
                  ref={agendaRef}
                  className="flex-1 overflow-y-auto rounded-xl border border-border/40 bg-card/20 backdrop-blur-sm"
                >
                  {viewMode === "agenda" ? (
                  <div className="p-4 space-y-1">
                    {sortedDates.length === 0 ? (
                      <div className="flex items-center justify-center h-full text-center text-sm text-muted-foreground py-12">
                        <Calendar className="w-8 h-8 mx-auto mb-2 opacity-30" />
                        {language === "en" ? "No posts scheduled" : "Sin posts programados"}
                      </div>
                    ) : (
                      sortedDates.map((dateStr) => {
                        const datePosts = postsByDate.get(dateStr) || [];
                        return (
                          <div key={dateStr} data-date={dateStr}>
                            {/* Sticky date header */}
                            <div className="flex items-center gap-2 mb-2">
                              <div className="h-px flex-1 bg-border/30" />
                              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest whitespace-nowrap">
                                {formatAgendaDate(dateStr, language)}
                              </span>
                              <div className="h-px flex-1 bg-border/30" />
                            </div>

                            {/* Posts for this date */}
                            <div className="space-y-2 mt-2">
                              {datePosts.map((post) => {
                                const cfg = getStatusConfig(post.post_status);
                                return (
                                  <button
                                    key={post.id}
                                    onClick={() => setSelectedPost(post)}
                                    className={`w-full text-left px-3 py-2.5 rounded-lg border border-border/30 transition-colors flex items-center gap-2.5
                                      ${cfg.bg} hover:border-border/60`}
                                  >
                                    {/* Status dot */}
                                    <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />

                                    {/* Post content */}
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-medium text-foreground line-clamp-2">{post.title}</p>
                                      {post.client_name && isAdmin && (
                                        <p className="text-[10px] text-muted-foreground truncate">{post.client_name}</p>
                                      )}
                                    </div>

                                    {/* Status badge */}
                                    <StatusBadge status={post.post_status} className="flex-shrink-0" />
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                  ) : (
                    // Table View - Scheduled Posts Only
                    <div className="p-4">
                      {filteredPosts.filter(p => p.post_status === "Scheduled").length === 0 ? (
                        <div className="flex items-center justify-center h-full text-center text-sm text-muted-foreground py-12">
                          <Calendar className="w-8 h-8 mx-auto mb-2 opacity-30" />
                          {language === "en" ? "No scheduled posts" : "Sin posts programados"}
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {filteredPosts
                            .filter(p => p.post_status === "Scheduled")
                            .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date))
                            .map((post) => (
                              <button
                                key={post.id}
                                onClick={() => setSelectedPost(post)}
                                className="w-full text-left px-3 py-2.5 rounded-lg border border-blue-500/30 bg-blue-500/5 hover:bg-blue-500/10 transition-colors flex items-start gap-3 group"
                              >
                                <div className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1 flex-shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-foreground line-clamp-2">{post.title}</p>
                                  <p className="text-[10px] text-muted-foreground mt-1">
                                    {formatAgendaDate(post.scheduled_date, language)}
                                  </p>
                                  {post.client_name && isAdmin && (
                                    <p className="text-[10px] text-muted-foreground">{post.client_name}</p>
                                  )}
                                </div>
                                <StatusBadge status="Scheduled" className="flex-shrink-0" />
                              </button>
                            ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* ─── Expanded Calendar (RIGHT - flex-1 on desktop) ──────────────────────────── */}
              <div className="w-full md:flex-1 rounded-xl border border-border/40 bg-card/20 backdrop-blur-sm p-4 flex flex-col">

                {/* Month Navigation */}
                <div className="flex items-center justify-between gap-2 mb-4">
                  <button
                    onClick={prevMonth}
                    className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-sm font-semibold text-foreground text-center flex-1">
                    {monthNames[month]} {year}
                  </span>
                  <button
                    onClick={nextMonth}
                    className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                {/* Day Headers (Mo Tu We...) */}
                <div className="grid grid-cols-7 gap-0 mb-2">
                  {dayNames.map((d) => (
                    <div key={d} className="text-center text-[10px] font-semibold text-muted-foreground uppercase tracking-wider py-1">
                      {d}
                    </div>
                  ))}
                </div>

                {/* Calendar Grid (7x6, expanded cells) */}
                <div className="grid grid-cols-7 gap-0 flex-1">
                  {calendarGrid.map((day, idx) => {
                    const dayKey = toDateKey(day);
                    const isCurrentMonth = day.getMonth() === month;
                    const isToday = dayKey === TODAY_KEY;
                    const isSelected = dayKey === selectedDate;
                    const dayPosts = postsByDate.get(dayKey);
                    const col = idx % 7;
                    const row = Math.floor(idx / 7);

                    const handleDateClick = () => {
                      setSelectedDate(dayKey);
                      // If there are posts for this date, show the first one
                      if (dayPosts && dayPosts.length > 0) {
                        setSelectedPost(dayPosts[0]);
                      }
                    };

                    return (
                      <button
                        key={dayKey}
                        onClick={handleDateClick}
                        className={`relative py-3 px-1 flex flex-col items-center justify-start text-center text-xs font-medium transition-colors border-r border-b border-border/30 cursor-pointer
                          ${col === 6 ? "border-r-0" : ""}
                          ${row === 5 ? "border-b-0" : ""}
                          ${isCurrentMonth ? "hover:bg-muted/10" : "bg-background/20"}
                          ${isToday ? "bg-primary/20" : ""}
                          ${isSelected ? "bg-muted/30" : ""}`}
                      >
                        <span className={`inline-block w-6 h-6 flex items-center justify-center rounded-full text-[11px] font-semibold
                          ${isToday ? "bg-primary text-primary-foreground"
                            : isCurrentMonth ? "text-foreground"
                            : "text-muted-foreground/40"}`}
                        >
                          {day.getDate()}
                        </span>
                        {/* Colored dots for posts */}
                        {dayPosts && dayPosts.length > 0 && (
                          <div className="flex flex-wrap justify-center gap-0.5 mt-1.5">
                            {dayPosts.slice(0, 4).map((post, i) => {
                              const cfg = getStatusConfig(post.post_status);
                              return (
                                <div
                                  key={i}
                                  className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`}
                                />
                              );
                            })}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

        </div>
      </main>

      {/* ─── Post Detail Modal ─────────────────────────────────────────────────── */}
      <Dialog open={!!selectedPost} onOpenChange={() => setSelectedPost(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          {selectedPost && (
            <PostDetailContent
              post={selectedPost}
              language={language}
              updatingStatus={updatingStatus}
              revisionNotes={selectedPost.revision_notes}
              onApprove={handleApprove}
              onRevision={handleRevisionClick}
              isEditor={isEditor}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* ─── Revision Notes Modal (admin/user only, hidden for editors) ───────── */}
      <Dialog open={!isEditor && showRevisionModal} onOpenChange={(open) => { if (!open) setShowRevisionModal(false); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <MessageSquare className="w-4 h-4 text-destructive" />
              {language === "en" ? "Send for Revision" : "Enviar para Revisión"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              {language === "en"
                ? "Leave revision notes for the videographer. This will change the video status to Needs Revision."
                : "Deja notas de revisión para el videógrafo. Esto cambiará el estado del video a Necesita Revisión."}
            </p>
            <Textarea
              value={revisionNotes}
              onChange={(e) => setRevisionNotes(e.target.value)}
              placeholder={language === "en"
                ? "Describe what needs to be changed or fixed..."
                : "Describe qué necesita cambiarse o corregirse..."}
              rows={4}
              className="text-sm resize-none"
              autoFocus
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" size="sm" onClick={() => setShowRevisionModal(false)}>
              {language === "en" ? "Cancel" : "Cancelar"}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleSubmitRevision}
              className="gap-1.5"
            >
              <XCircle className="w-3.5 h-3.5" />
              {language === "en" ? "Send for Revision" : "Enviar para Revisión"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Post Detail (extracted to avoid re-rendering calendar grid on modal open) ─

interface PostDetailProps {
  post: CalendarPost;
  language: string;
  updatingStatus: boolean;
  revisionNotes?: string | null;
  onApprove: () => void;
  onRevision: () => void;  // opens the revision notes modal
  isEditor?: boolean;
}

function PostDetailContent({ post, language, updatingStatus, revisionNotes, onApprove, onRevision, isEditor }: PostDetailProps) {
  // These are now only computed when the modal is actually open with a post
  const driveId = post.file_submission_url ? extractGoogleDriveFileId(post.file_submission_url) : null;
  const cfg = getStatusConfig(post.post_status);
  const isApproved = post.post_status === "Approved" || post.post_status === "Done";
  const isRevision = post.post_status === "Needs Revision";
  const [copied, setCopied] = useState(false);

  const handleShareLink = useCallback(() => {
    const publicLink = `${window.location.origin}/public/calendar/${post.id}`;
    navigator.clipboard.writeText(publicLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success(language === "en" ? "Link copied to clipboard" : "Enlace copiado al portapapeles");
  }, [post.id, language]);

  return (
    <>
      <DialogHeader>
        <div className="flex items-center justify-between gap-2 flex-wrap w-full">
          <DialogTitle className="flex items-center gap-2 flex-wrap text-base">
            <span className="truncate max-w-[250px]">{post.title}</span>
            <StatusBadge status={post.post_status} />
            {post.client_name && (
              <Badge variant="outline" className="text-[10px] font-normal bg-muted/30 text-muted-foreground border-border/40">
                {post.client_name}
              </Badge>
            )}
          </DialogTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleShareLink}
            className="gap-1.5 text-xs h-8"
            title={language === "en" ? "Copy share link" : "Copiar enlace compartido"}
          >
            {copied ? (
              <>
                <Copy className="w-3.5 h-3.5" />
                {language === "en" ? "Copied" : "Copiado"}
              </>
            ) : (
              <>
                <Share2 className="w-3.5 h-3.5" />
                {language === "en" ? "Share" : "Compartir"}
              </>
            )}
          </Button>
        </div>
      </DialogHeader>

      <div className="space-y-4">
        {/* Scheduled date */}
        {post.scheduled_date && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Calendar className="w-3.5 h-3.5" />
            {language === "en" ? "Scheduled for" : "Programado para"}:{" "}
            <span className="font-semibold text-foreground">
              {new Date(post.scheduled_date + "T00:00:00").toLocaleDateString(
                language === "en" ? "en-US" : "es-ES",
                { weekday: "long", year: "numeric", month: "long", day: "numeric" }
              )}
            </span>
          </div>
        )}

        {/* Video */}
        {driveId ? (
          <div className="rounded-xl overflow-hidden bg-black aspect-video border border-border/30">
            <iframe
              src={`https://drive.google.com/file/d/${driveId}/preview`}
              className="w-full h-full"
              allow="autoplay"
              allowFullScreen
            />
          </div>
        ) : post.file_submission_url ? (
          <a href={post.file_submission_url} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline">
            <ExternalLink className="w-3.5 h-3.5" />
            {language === "en" ? "Open video file" : "Abrir archivo de video"}
          </a>
        ) : (
          <div className="aspect-video rounded-xl bg-muted/30 border border-border/30 flex items-center justify-center">
            <span className="text-xs text-muted-foreground">
              {language === "en" ? "No video attached" : "Sin video adjunto"}
            </span>
          </div>
        )}

        {/* All action buttons in one row: Download / Script / Approve / Revisions */}
        <div className="flex items-center justify-between gap-2 text-xs pt-4 border-t border-border/40 flex-wrap">
          {/* Left: Download + Script */}
          <div className="flex items-center gap-4">
            {driveId && (
              <a href={getGoogleDriveDownloadUrl(driveId)} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:underline">
                <Download className="w-3.5 h-3.5" />
                {language === "en" ? "Download" : "Descargar"}
              </a>
            )}
            {post.script_url && (
              <a href={post.script_url} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:underline">
                <ExternalLink className="w-3 h-3" />
                {language === "en" ? "View Script" : "Ver Guión"}
              </a>
            )}
          </div>

          {/* Right: Approve + Revisions (hidden for editors) */}
          {!isEditor && (
            <div className="flex items-center gap-2">
              {!isApproved && (
                <Button
                  size="sm"
                  className="gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs h-8"
                  onClick={onApprove}
                  disabled={updatingStatus}
                >
                  {updatingStatus ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                  {language === "en" ? "Approve" : "Aprobar"}
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 text-destructive border-destructive/40 hover:bg-destructive/10 text-xs h-8"
                onClick={onRevision}
                disabled={updatingStatus}
              >
                {updatingStatus ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MessageSquare className="w-3.5 h-3.5" />}
                {language === "en" ? "Revisions" : "Revisiones"}
              </Button>
            </div>
          )}
        </div>

        {/* Status message below */}
        {isApproved && (
          <div className="pt-4 flex items-center gap-2 text-sm text-emerald-400">
            <CheckCircle className="w-4 h-4" />
            {language === "en" ? "This post has been approved." : "Este post ha sido aprobado."}
          </div>
        )}
        {isRevision && revisionNotes && (
          <div className="pt-4 bg-destructive/10 border border-destructive/20 rounded-lg p-3 text-xs text-foreground">
            <p className="text-muted-foreground text-[10px] uppercase font-semibold mb-1 tracking-wide">
              {language === "en" ? "Revision Notes" : "Notas de Revisión"}
            </p>
            <p className="whitespace-pre-wrap">{revisionNotes}</p>
          </div>
        )}
        {post.caption && (
          <div className="pt-4 border-t border-border/40">
            <p className="text-xs text-muted-foreground uppercase font-semibold mb-1 tracking-wide">Caption</p>
            <p className="text-sm whitespace-pre-wrap text-foreground leading-relaxed">{post.caption}</p>
          </div>
        )}
      </div>
    </>
  );
}
