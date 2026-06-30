import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import PageTransition from "@/components/PageTransition";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { readCache, writeCache } from "@/lib/sessionCache";
import {
  Loader2, ArrowLeft, ChevronLeft, ChevronRight, Download,
  CheckCircle, XCircle, ExternalLink, Calendar, AlertCircle, MessageSquare, Copy, Share2, Mail,
} from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import ThemedVideoPlayer from "@/components/ThemedVideoPlayer";
import { videoUploadService } from "@/services/videoUploadService";
import { useSchedulerEnabled } from "@/lib/featureFlags";
import { useScheduledPosts, type PostFilter, type ScheduledPostRow } from "@/lib/hooks/useScheduledPosts";
import { ReauthBanner } from "@/components/scheduler/ReauthBanner";
import { ScheduledPostCard } from "@/components/scheduler/ScheduledPostCard";
import { PublishComposer } from "@/components/scheduler/PublishComposer";
import { resolveVideoUrl } from "@/lib/videoUrl";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LIFECYCLE_STYLE, LIFECYCLE_VALUES, deriveFromLegacy, lifecycleUpdate, type LifecycleStatus } from "@/lib/lifecycleStatus";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CalendarPost {
  id: string;
  notion_page_id?: string | null;   // optional — always null after migration
  client_id: string;                // required — non-null FK
  title: string;
  scheduled_date: string;           // YYYY-MM-DD (truncated at mapping boundary)
  post_status: string;              // legacy — kept for dual-write compatibility
  lifecycle_status: LifecycleStatus; // preferred display field
  file_submission_url?: string | null;
  upload_source?: string | null;
  storage_path?: string | null;
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

// Solid, high-contrast dot color per lifecycle status — matches the calendar
// legend (Scheduled = primary, Published/Approved = emerald, Needs Revision =
// destructive). LIFECYCLE_STYLE's `text` colors are light "-300" shades (and
// white/45) meant for the app's dark surfaces; they wash out on the light
// calendar grid, so the month-grid dots use these instead.
function lifecycleDotColor(status: LifecycleStatus): string {
  switch (status) {
    case "Published":
      return "bg-emerald-500";
    case "Scheduled":
      return "bg-primary";
    case "Needs Revisions":
      return "bg-destructive";
    case "In progress":
      return "bg-amber-500";
    case "Not started":
    default:
      return "bg-muted-foreground";
  }
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
  const [searchParams, setSearchParams] = useSearchParams();
  const { language } = useLanguage();

  const [clientName, setClientName] = useState("");
  // Hydrate from cache so events render instantly while we revalidate.
  const cachedPosts = clientId ? readCache<CalendarPost[]>(`content_calendar_${clientId}`, []) : [];
  const [posts, setPosts] = useState<CalendarPost[]>(cachedPosts);
  const [fetching, setFetching] = useState(cachedPosts.length === 0);
  const [error, setError] = useState<string | null>(null);

  // Beta-only scheduler panel above the calendar. When no clientId is in
  // the URL (the global "All Clients" view), the hook fetches across all
  // clients the user has access to via RLS.
  const { enabled: schedulerEnabled } = useSchedulerEnabled();
  const [schedFilter, setSchedFilter] = useState<PostFilter>("all");
  const { data: scheduledPosts = [] } = useScheduledPosts(
    schedulerEnabled ? (clientId ?? null) : null,
    schedFilter,
  );
  const [editingPost, setEditingPost] = useState<ScheduledPostRow | null>(null);

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
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState("");

  // Admin client filter (when no clientId param)
  const [allClients, setAllClients] = useState<{ id: string; name: string }[]>([]);
  const [filterClientId, setFilterClientId] = useState<string>("all");

  // Editor state
  const [editorClients, setEditorClients] = useState<{ id: string; name: string }[]>([]);
  const [editorSelectedClientId, setEditorSelectedClientId] = useState<string | null>(null);

  const agendaRef = useRef<HTMLDivElement>(null);

  // Honor ?window=upcoming (e.g. from the admin dashboard "posts scheduled" row):
  // snap the calendar to today's month and highlight today in the agenda, then
  // strip the param so future navigation isn't sticky.
  useEffect(() => {
    if (searchParams.get("window") !== "upcoming") return;
    const today = new Date();
    setCurrentDate(new Date(today.getFullYear(), today.getMonth(), 1));
    setSelectedDate(toDateKey(today));
    const next = new URLSearchParams(searchParams);
    next.delete("window");
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    const shareId = clientId || (filterClientId && filterClientId !== "all" ? filterClientId : null);
    if (!shareId) {
      toast.error(language === "en" ? "Pick a client first" : "Elige un cliente primero");
      return;
    }
    setShareUrl(`${window.location.origin}/public/calendar/${shareId}`);
    setCopiedLink(false);
    setShareDialogOpen(true);
  }, [clientId, filterClientId, language]);

  const copyShareUrl = useCallback(async () => {
    let copied = false;
    try {
      await navigator.clipboard.writeText(shareUrl);
      copied = true;
    } catch {
      // Clipboard API can be blocked (permissions, non-secure context) — fall back to a temp textarea
      try {
        const ta = document.createElement("textarea");
        ta.value = shareUrl;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        copied = document.execCommand("copy");
        document.body.removeChild(ta);
      } catch {
        copied = false;
      }
    }
    if (copied) {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
      toast.success(language === "en" ? "Public link copied!" : "¡Enlace público copiado!");
    } else {
      toast.success(shareUrl, { duration: 8000 });
    }
  }, [shareUrl, language]);

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

  // Fetch clients list for admin filter — restrict to the admin's own client
  // plus active Connecta+ clients (the only ones with the public-calendar /
  // review workflow). Anyone else is hidden from the picker.
  useEffect(() => {
    if (clientId || !isAdmin || !user) return;
    supabase
      .from("clients")
      .select("id, name")
      .or(`user_id.eq.${user.id},and(plan_type.eq.connecta_plus,subscription_status.eq.active)`)
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
        .select("id, reel_title, schedule_date, post_status, lifecycle_status, assignee, script_id, file_submission, upload_source, storage_path, caption, script_url, revisions, client_id")
        .is("deleted_at", null)
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
        lifecycle_status: (v.lifecycle_status as LifecycleStatus | null) ?? deriveFromLegacy(v.status, v.post_status),
        file_submission_url: v.file_submission,
        upload_source: v.upload_source,
        storage_path: v.storage_path,
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
        const enriched = mappedData.map((p) => ({ ...p, client_name: clientMap.get(p.client_id) || "" }));
        setPosts(enriched);
        if (clientId) writeCache(`content_calendar_${clientId}`, enriched);
      } else {
        setPosts(mappedData);
        if (clientId) writeCache(`content_calendar_${clientId}`, mappedData);
      }
    } catch (e: any) {
      setError(e.message || "Failed to load calendar");
    } finally {
      setFetching(false);
    }
  }, [clientId, user, isAdmin, isEditor, editorSelectedClientId]);

  useEffect(() => { fetchPosts(); }, [fetchPosts]);

  // Refresh when AI writes to calendar
  useEffect(() => {
    const handler = (e: Event) => {
      const scope = (e as CustomEvent).detail?.scope as string;
      if (scope === "calendar" || scope === "all") {
        fetchPosts();
      }
    };
    window.addEventListener("ai:data-changed", handler);
    return () => window.removeEventListener("ai:data-changed", handler);
  }, [fetchPosts]);

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
      setPosts((prev) => prev.map((p) => p.id === id ? { ...p, post_status: "Approved", lifecycle_status: "Published" } : p));
      setSelectedPost((prev) => prev ? { ...prev, post_status: "Approved", lifecycle_status: "Published" } : null);
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
      setPosts((prev) => prev.map((p) => p.id === id ? { ...p, post_status: "Needs Revision", lifecycle_status: "Needs Revisions", revision_notes: revisionNotes } : p));
      setSelectedPost((prev) => prev ? { ...prev, post_status: "Needs Revision", lifecycle_status: "Needs Revisions", revision_notes: revisionNotes } : null);
    } catch (error) {
      console.error("Revision error:", error);
      toast.error(language === "en" ? "Failed to update status" : "Error al actualizar estado");
    } finally {
      setUpdatingStatus(false);
    }
  }, [selectedPost, revisionNotes, language]);

  // Admin: set lifecycle status directly (dual-writes legacy columns; the
  // video_edits workflow trigger reassigns owners exactly as the normal flow).
  const handleChangeStatus = useCallback(async (newStatus: LifecycleStatus) => {
    if (!selectedPost || newStatus === selectedPost.lifecycle_status) return;
    const id = selectedPost.id;
    const prev = selectedPost.lifecycle_status;
    setUpdatingStatus(true);
    setPosts((ps) => ps.map((p) => p.id === id ? { ...p, lifecycle_status: newStatus } : p));
    setSelectedPost((p) => p ? { ...p, lifecycle_status: newStatus } : null);
    try {
      const { error } = await supabase.from("video_edits").update(lifecycleUpdate(newStatus)).eq("id", id);
      if (error) throw error;
      toast.success(language === "en" ? "Status updated" : "Estado actualizado");
    } catch (e) {
      console.error("Status change error:", e);
      setPosts((ps) => ps.map((p) => p.id === id ? { ...p, lifecycle_status: prev } : p));
      setSelectedPost((p) => p ? { ...p, lifecycle_status: prev } : null);
      toast.error(language === "en" ? "Failed to update status" : "Error al actualizar estado");
    } finally {
      setUpdatingStatus(false);
    }
  }, [selectedPost, language]);

  // Admin: change the scheduled date (YYYY-MM-DD).
  const handleChangeDate = useCallback(async (newDate: string) => {
    if (!selectedPost || !newDate || newDate === selectedPost.scheduled_date) return;
    const id = selectedPost.id;
    const prev = selectedPost.scheduled_date;
    setUpdatingStatus(true);
    setPosts((ps) => ps.map((p) => p.id === id ? { ...p, scheduled_date: newDate } : p));
    setSelectedPost((p) => p ? { ...p, scheduled_date: newDate } : null);
    try {
      const { error } = await supabase.from("video_edits").update({ schedule_date: newDate }).eq("id", id);
      if (error) throw error;
      toast.success(language === "en" ? "Date updated" : "Fecha actualizada");
    } catch (e) {
      console.error("Date change error:", e);
      setPosts((ps) => ps.map((p) => p.id === id ? { ...p, scheduled_date: prev } : p));
      setSelectedPost((p) => p ? { ...p, scheduled_date: prev } : null);
      toast.error(language === "en" ? "Failed to update date" : "Error al actualizar fecha");
    } finally {
      setUpdatingStatus(false);
    }
  }, [selectedPost, language]);

  if (loading) {
    return (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
    );
  }

  return (

    <>
      <PageTransition className="editorial-page flex-1 flex flex-col min-h-0">

        <div className="flex-1 min-h-0 px-4 sm:px-6 py-6 flex flex-col animate-fade-in">

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
              <h1 className="text-xl sm:text-2xl font-bold text-foreground tracking-tight flex items-center gap-2 font-serif">
                <Calendar className="w-5 h-5 text-primary" />
                {language === "en" ? "Content Calendar" : "Calendario de Contenido"}
              </h1>
            </div>
            <div className="flex items-center gap-2">
              {/* Client Filter — admin only, no clientId. In-page styled
                  dropdown (not the OS-native <select>); the menu portals to
                  <body> so it's pinned to a white editorial card surface with
                  dark ink rather than inheriting the root dark popover. */}
              {isAdmin && !clientId && allClients.length > 0 && (
                <Select value={filterClientId} onValueChange={setFilterClientId}>
                  <SelectTrigger className="h-8 w-auto min-w-[150px] gap-1.5 px-2.5 text-xs rounded-md border-border/50 bg-card/50 text-foreground backdrop-blur-sm focus:ring-1 focus:ring-primary/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white text-[hsl(var(--ink-on-cream))] border-[hsl(var(--ink-on-cream)/0.1)] z-50">
                    <SelectItem value="all" className="text-xs focus:bg-[hsl(var(--ink-on-cream)/0.06)] focus:text-[hsl(var(--ink-on-cream))]">
                      {language === "en" ? "All Clients" : "Todos los Clientes"}
                    </SelectItem>
                    {allClients.map(c => (
                      <SelectItem key={c.id} value={c.id} className="text-xs focus:bg-[hsl(var(--ink-on-cream)/0.06)] focus:text-[hsl(var(--ink-on-cream))]">
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {/* Share Button - Desktop only */}
              {(clientId || (filterClientId && filterClientId !== "all")) && (
                <Button
                  onClick={handleSharePublicLink}
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs inline-flex"
                  title={language === "en" ? "Share public link" : "Compartir enlace público"}
                >
                  <Share2 className="w-3.5 h-3.5" />
                  {language === "en" ? "Share" : "Compartir"}
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

          {/* Scheduler beta panel — visible only when scheduler is enabled and we're scoped to a client */}
          {schedulerEnabled && (
            <div className="space-y-3 mb-6">
              {clientId && <ReauthBanner clientId={clientId} />}
              <Tabs value={schedFilter} onValueChange={(v) => setSchedFilter(v as PostFilter)}>
                <TabsList>
                  <TabsTrigger value="all">All</TabsTrigger>
                  <TabsTrigger value="awaiting_approval">Awaiting approval</TabsTrigger>
                  <TabsTrigger value="approved">Approved</TabsTrigger>
                  <TabsTrigger value="drafts">Drafts</TabsTrigger>
                  <TabsTrigger value="published">Published</TabsTrigger>
                  <TabsTrigger value="failed">Failed</TabsTrigger>
                </TabsList>
              </Tabs>
              <div className="space-y-2">
                {scheduledPosts.map((p) => (
                  <ScheduledPostCard
                    key={p.id}
                    post={p}
                    onClick={() => setEditingPost(p)}
                    showClientName={!clientId}
                  />
                ))}
                {scheduledPosts.length === 0 && (
                  <p className="text-sm text-muted-foreground p-3">No posts in this view.</p>
                )}
              </div>
              {editingPost && (
                <PublishComposer
                  open
                  onClose={() => setEditingPost(null)}
                  clientId={editingPost.client_id}
                  editingQueueId={editingPost.editing_queue_id ?? ""}
                  videoUrl={editingPost.video_url}
                  initialCaption={editingPost.caption}
                  existingPost={{
                    id: editingPost.id,
                    caption: editingPost.caption,
                    mode: editingPost.mode,
                    scheduled_at: editingPost.scheduled_at,
                    status: editingPost.status,
                    client_approved_at: editingPost.client_approved_at,
                    targetedPlatforms: editingPost.targets.map((t) => t.platform),
                  }}
                />
              )}
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
                                const lcStyle = LIFECYCLE_STYLE[post.lifecycle_status];
                                return (
                                  <button
                                    key={post.id}
                                    onClick={() => setSelectedPost(post)}
                                    className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors flex items-center gap-2.5
                                      ${lcStyle.bg} ${lcStyle.border} hover:opacity-90`}
                                  >
                                    {/* Status dot */}
                                    <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${lcStyle.text.replace("text-", "bg-")}`} />

                                    {/* Post content */}
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-medium text-foreground line-clamp-2">{post.title}</p>
                                      {post.client_name && isAdmin && (
                                        <p className="text-[10px] text-muted-foreground truncate">{post.client_name}</p>
                                      )}
                                    </div>

                                    {/* Status badge */}
                                    <span className={`flex-shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full border ${lcStyle.bg} ${lcStyle.text} ${lcStyle.border}`}>
                                      {lcStyle.label}
                                    </span>
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
                      {filteredPosts.filter(p => p.lifecycle_status === "Scheduled").length === 0 ? (
                        <div className="flex items-center justify-center h-full text-center text-sm text-muted-foreground py-12">
                          <Calendar className="w-8 h-8 mx-auto mb-2 opacity-30" />
                          {language === "en" ? "No scheduled posts" : "Sin posts programados"}
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {filteredPosts
                            .filter(p => p.lifecycle_status === "Scheduled")
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
              <div className="w-full md:flex-1 min-h-0 rounded-xl border border-border/40 bg-card p-4 flex flex-col">

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
                          ${isCurrentMonth ? "hover:bg-muted/10" : "bg-muted/5"}
                          ${isToday ? "bg-primary/20" : ""}
                          ${isSelected ? "bg-muted/30" : ""}`}
                      >
                        <span className={`inline-block w-6 h-6 flex items-center justify-center rounded-full text-[11px] font-semibold
                          ${isToday ? "bg-primary text-[hsl(var(--ink-on-cream))]"
                            : isCurrentMonth ? "text-foreground"
                            : "text-muted-foreground/40"}`}
                        >
                          {day.getDate()}
                        </span>
                        {/* Colored dots for posts — solid, legend-matching colors so
                            they stay visible on the light calendar surface; "+N"
                            when a day is busy. Guides against double-booking. */}
                        {dayPosts && dayPosts.length > 0 && (
                          <div className="flex flex-wrap items-center justify-center gap-0.5 mt-1.5">
                            {dayPosts.slice(0, 4).map((post, i) => (
                              <div
                                key={i}
                                className={`w-1.5 h-1.5 rounded-full ${lifecycleDotColor(post.lifecycle_status)}`}
                              />
                            ))}
                            {dayPosts.length > 4 && (
                              <span className="text-[8px] font-semibold leading-none text-muted-foreground">
                                +{dayPosts.length - 4}
                              </span>
                            )}
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
      </PageTransition>

      {/* ─── Share Public Link Dialog ──────────────────────────────────────────── */}
      <Dialog open={shareDialogOpen} onOpenChange={setShareDialogOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-md rounded-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Share2 className="w-4 h-4 text-primary" />
              {language === "en" ? "Share content calendar" : "Compartir calendario"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {language === "en"
                ? `Anyone with this link can view ${clientName || "this client"}'s calendar, watch the videos, and approve or request revisions — no account needed.`
                : `Cualquiera con este enlace puede ver el calendario de ${clientName || "este cliente"}, ver los videos y aprobar o pedir revisiones — sin necesidad de cuenta.`}
            </p>
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={shareUrl}
                onFocus={(e) => e.currentTarget.select()}
                className="flex-1 h-10 px-3 rounded-md border border-border/50 bg-muted/30 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
              />
              <Button onClick={copyShareUrl} size="sm" className="h-10 gap-1.5 flex-shrink-0">
                {copiedLink ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copiedLink ? (language === "en" ? "Copied" : "Copiado") : (language === "en" ? "Copy" : "Copiar")}
              </Button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <a
                href={shareUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-col items-center justify-center gap-1.5 h-16 rounded-lg border border-border/40 bg-card/40 hover:bg-card/70 transition-colors text-xs text-foreground"
              >
                <ExternalLink className="w-4 h-4 text-primary" />
                {language === "en" ? "Preview" : "Vista previa"}
              </a>
              <a
                href={`https://wa.me/?text=${encodeURIComponent((language === "en" ? "Here's your content calendar — review and approve here: " : "Aquí está tu calendario — revisa y aprueba aquí: ") + shareUrl)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-col items-center justify-center gap-1.5 h-16 rounded-lg border border-border/40 bg-card/40 hover:bg-card/70 transition-colors text-xs text-foreground"
              >
                <MessageSquare className="w-4 h-4 text-emerald-500" />
                WhatsApp
              </a>
              <a
                href={`mailto:?subject=${encodeURIComponent((language === "en" ? "Content calendar — " : "Calendario de contenido — ") + (clientName || ""))}&body=${encodeURIComponent((language === "en" ? "Review and approve your content here:\n\n" : "Revisa y aprueba tu contenido aquí:\n\n") + shareUrl)}`}
                className="flex flex-col items-center justify-center gap-1.5 h-16 rounded-lg border border-border/40 bg-card/40 hover:bg-card/70 transition-colors text-xs text-foreground"
              >
                <Mail className="w-4 h-4 text-primary" />
                {language === "en" ? "Email" : "Correo"}
              </a>
            </div>
          </div>
        </DialogContent>
      </Dialog>

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
              isAdmin={isAdmin}
              onChangeStatus={handleChangeStatus}
              onChangeDate={handleChangeDate}
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
  isAdmin?: boolean;
  onChangeStatus?: (status: LifecycleStatus) => void;
  onChangeDate?: (date: string) => void;
}

function PostDetailContent({ post, language, updatingStatus, revisionNotes, onApprove, onRevision, isEditor, isAdmin, onChangeStatus, onChangeDate }: PostDetailProps) {
  // The post's *deliverable* is the final submission (file_submission_url) when
  // present; the raw main footage (storage_path) is only a fallback. This
  // mirrors the download handler, which already prefers the submission. A
  // submission may be a Drive link, a remote URL, or a bare Supabase path.
  const driveId = post.file_submission_url ? extractGoogleDriveFileId(post.file_submission_url) : null;
  const submissionIsRemoteHttp = !!post.file_submission_url && !driveId && /^https?:\/\//i.test(post.file_submission_url);
  const submissionIsStoragePath = !!post.file_submission_url && !driveId && !submissionIsRemoteHttp;
  // Bare Supabase path to play: the final submission when it's a storage path,
  // otherwise the raw footage — and only when there's no submission at all.
  const playbackPath = submissionIsStoragePath
    ? post.file_submission_url!
    : (!post.file_submission_url && post.upload_source === 'supabase' ? post.storage_path : null);

  // Resolve through the proxy-aware resolver so the calendar preview also gets
  // the fast 720p proxy when one is ready (falls back to the original).
  const [supabaseVideoUrl, setSupabaseVideoUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (playbackPath) {
      videoUploadService.getPlaybackVideoUrl(playbackPath)
        .then((u) => { if (!cancelled) setSupabaseVideoUrl(u); })
        .catch(() => { if (!cancelled) setSupabaseVideoUrl(null); });
    } else {
      setSupabaseVideoUrl(null);
    }
    return () => { cancelled = true; };
  }, [playbackPath]);

  // Remote (non-Drive) submission links are signed/resolved so they play inline
  // instead of showing a download link.
  const [fallbackVideoUrl, setFallbackVideoUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (submissionIsRemoteHttp && post.file_submission_url) {
      void resolveVideoUrl(post.file_submission_url).then((u) => { if (!cancelled) setFallbackVideoUrl(u); });
    }
    return () => { cancelled = true; };
  }, [submissionIsRemoteHttp, post.file_submission_url]);
  const lcStyle = LIFECYCLE_STYLE[post.lifecycle_status];
  const isApproved = post.lifecycle_status === "Published" || post.lifecycle_status === "Scheduled";
  const isRevision = post.lifecycle_status === "Needs Revisions";
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const handleDownload = useCallback(async () => {
    const submission = post.file_submission_url;
    const driveDl = submission ? extractGoogleDriveFileId(submission) : null;
    // Remote links → just redirect (Drive's download endpoint, or the external URL).
    if (driveDl) { window.open(getGoogleDriveDownloadUrl(driveDl), "_blank", "noopener,noreferrer"); return; }
    if (submission && /^https?:\/\//i.test(submission)) { window.open(submission, "_blank", "noopener,noreferrer"); return; }
    // Supabase-hosted → sign the ORIGINAL (footage) and save the file to device.
    const path = submission || post.storage_path;
    if (!path) { toast.error(language === "en" ? "No file to download" : "Sin archivo para descargar"); return; }
    setDownloading(true);
    try {
      const filename = `${(post.title || "video").replace(/[^a-zA-Z0-9_\- ]/g, "")}.mp4`;
      // Stream straight to disk via a Content-Disposition: attachment signed URL.
      // Never fetch()+blob() — that buffers the whole file in memory and OOMs on
      // large originals (600MB+ footage), which is what made "Download failed" fire.
      const url = await videoUploadService.getDownloadVideoUrl(path, filename);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.rel = "noopener";
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
    } catch {
      toast.error(language === "en" ? "Download failed" : "Error al descargar");
    } finally {
      setDownloading(false);
    }
  }, [post.file_submission_url, post.storage_path, post.title, language]);

  const handleShareLink = useCallback(async () => {
    // Public route is client-scoped; deep-link to this specific post within the client calendar.
    const publicLink = `${window.location.origin}/public/calendar/${post.client_id}?post=${post.id}`;
    let copied = false;
    try {
      await navigator.clipboard.writeText(publicLink);
      copied = true;
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = publicLink;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        copied = document.execCommand("copy");
        document.body.removeChild(ta);
      } catch {
        copied = false;
      }
    }
    if (copied) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success(language === "en" ? "Link copied to clipboard" : "Enlace copiado al portapapeles");
    } else {
      toast.success(publicLink, { duration: 8000 });
    }
  }, [post.id, post.client_id, language]);

  return (
    <>
      <DialogHeader>
        <div className="flex items-center justify-between gap-2 flex-wrap w-full">
          <DialogTitle className="flex items-center gap-2 flex-wrap text-base">
            <span className="truncate max-w-[250px]">{post.title}</span>
            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${lcStyle.bg} ${lcStyle.text} ${lcStyle.border}`}>
              {lcStyle.label}
            </span>
            {post.client_name && (
              <Badge variant="outline" className="text-[10px] font-normal bg-muted/30 text-muted-foreground border-border/40">
                {post.client_name}
              </Badge>
            )}
          </DialogTitle>
          <div className="flex items-center gap-1">
            {(post.file_submission_url || post.storage_path) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDownload}
                disabled={downloading}
                className="gap-1.5 text-xs h-8"
                title={language === "en" ? "Download video" : "Descargar video"}
              >
                {downloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                {language === "en" ? "Download" : "Descargar"}
              </Button>
            )}
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
        </div>
      </DialogHeader>

      <div className="space-y-4">
        {/* Admin: edit status + scheduled date inline */}
        {isAdmin && (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-lg border border-border/40 bg-muted/30 p-3">
            <div className="flex items-center gap-2">
              <span className="text-[11px] uppercase tracking-wide font-semibold text-muted-foreground">
                {language === "en" ? "Status" : "Estado"}
              </span>
              <Select
                value={post.lifecycle_status}
                onValueChange={(v) => onChangeStatus?.(v as LifecycleStatus)}
                disabled={updatingStatus}
              >
                <SelectTrigger className="h-8 w-[170px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LIFECYCLE_VALUES.map((s) => (
                    <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] uppercase tracking-wide font-semibold text-muted-foreground">
                {language === "en" ? "Date" : "Fecha"}
              </span>
              <input
                type="date"
                value={post.scheduled_date || ""}
                onChange={(e) => onChangeDate?.(e.target.value)}
                disabled={updatingStatus}
                className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground outline-none focus:border-primary disabled:opacity-50"
              />
            </div>
            {updatingStatus && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
          </div>
        )}

        {/* Scheduled date (read-only for non-admin; admin edits it above) */}
        {post.scheduled_date && !isAdmin && (
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
        ) : supabaseVideoUrl ? (
          <div style={{ aspectRatio: '16 / 9' }}>
            <ThemedVideoPlayer src={supabaseVideoUrl} className="h-full" maxHeight="100%" />
          </div>
        ) : fallbackVideoUrl ? (
          <div style={{ aspectRatio: '16 / 9' }}>
            <ThemedVideoPlayer src={fallbackVideoUrl} className="h-full" maxHeight="100%" />
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
          {/* Left: Script (Download moved to the header, next to Share) */}
          <div className="flex items-center gap-4">
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
