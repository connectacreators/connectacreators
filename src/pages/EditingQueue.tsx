import { useEffect, useRef, useState, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { readCache, writeCache } from "@/lib/sessionCache";
import { Loader2, ArrowLeft, Play, ExternalLink, Download, ChevronDown, ChevronUp, ChevronsUpDown, UserCircle, MessageSquare, Save, Trash2, CalendarPlus, Calendar, CheckCircle, Share2, MoreHorizontal } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import PageTransition from "@/components/PageTransition";
import { Skeleton } from "@/components/ui/skeleton";
import { useLanguage } from "@/hooks/useLanguage";
import { motion } from "framer-motion";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import TableHeaderComponent from "@/components/tables/TableHeader";
import { StatusBadge } from "@/components/ui/status-badge";
import { exportToCSV } from "@/utils/csvExport";
import FootageUploadDialog from '@/components/FootageUploadDialog';
import FootagePanel from '@/components/FootagePanel';
import VideoReviewModal from '@/components/VideoReviewModal';
import { revisionCommentService } from '@/services/revisionCommentService';

interface EditingQueueItem {
  id: string;
  title: string;
  status: string;
  statusColor: string;
  fileSubmissionUrl: string | null;
  footageUrl: string | null;
  scriptUrl: string | null;
  assignee: string | null;
  assignee_user_id: string | null;
  assigneeId: string | null;
  assigneePropName: string | null;
  revisions: string | null;
  revisionPropName: string | null;
  postStatus: string | null;
  scheduledDate: string | null;
  lastEdited: string;
  source?: 'notion' | 'db' | 'script';
  caption?: string | null;
  script_id?: string | null;
  uploadSource?: string | null;
  storagePath?: string | null;
  storageUrl?: string | null;
  deadline: string | null;
}


const STATUS_OPTIONS = ["Not started", "In progress", "Needs Revision", "Done"];
const POST_STATUS_OPTIONS = ["Unpublished", "Scheduled", "Needs Revision", "Published"];

// ... keep existing code (extractGoogleDriveFileId, getGoogleDriveDownloadUrl, getStatusClassName, getStatusDotColor)
function extractGoogleDriveFileId(url: string): string | null {
  const match1 = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (match1) return match1[1];
  const match2 = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (match2) return match2[1];
  return null;
}

function getGoogleDriveDownloadUrl(fileId: string): string {
  return `https://drive.google.com/uc?export=download&id=${fileId}`;
}

function getStatusClassName(status: string): string {
  const lower = status.toLowerCase();
  if (lower === "done" || lower === "complete" || lower === "completed")
    return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
  if (lower.includes("revision") || lower.includes("revisión"))
    return "bg-destructive/15 text-destructive border-destructive/30";
  if (lower.includes("progress") || lower.includes("editing"))
    return "bg-amber-500/15 text-amber-400 border-amber-500/30";
  return "bg-muted text-muted-foreground";
}

function getStatusDotColor(status: string): string {
  const lower = status.toLowerCase();
  if (lower === "done" || lower === "complete") return "bg-emerald-400";
  if (lower.includes("revision")) return "bg-destructive";
  if (lower.includes("progress")) return "bg-amber-400";
  return "bg-muted-foreground";
}

function getRowStatusBorderColor(status: string): string {
  const lower = status.toLowerCase();
  if (lower === "done" || lower === "complete") return "#10b981";
  if (lower.includes("revision")) return "#ef4444";
  if (lower.includes("progress")) return "#f59e0b";
  return "#334155";
}

const ASSIGNEE_COLORS = ['#0891b2','#7c3aed','#d97706','#059669','#e11d48','#4f46e5','#0d9488','#c026d3'];
function getAssigneeColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return ASSIGNEE_COLORS[Math.abs(hash) % ASSIGNEE_COLORS.length];
}

function EditingQueueSkeleton() {
  return (
    <div className="flex-1 px-4 sm:px-8 py-8 max-w-7xl mx-auto w-full space-y-3">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 p-4 rounded-xl border border-border bg-card/50">
          <Skeleton className="h-4 w-32 flex-shrink-0" />
          <Skeleton className="h-4 w-48 flex-1" />
          <Skeleton className="h-5 w-20 rounded-full flex-shrink-0" />
          <Skeleton className="h-4 w-24 flex-shrink-0" />
        </div>
      ))}
    </div>
  );
}

export default function EditingQueue() {
  const { clientId } = useParams<{ clientId: string }>();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { language } = useLanguage();
  const [clientName, setClientName] = useState("");
  // Hydrate from cache so the queue renders instantly while we revalidate.
  const cachedItems = clientId ? readCache<EditingQueueItem[]>(`editing_queue_${clientId}`, []) : [];
  const [items, setItems] = useState<EditingQueueItem[]>(cachedItems);

  const [fetching, setFetching] = useState(cachedItems.length === 0);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedItem, setSelectedItem] = useState<EditingQueueItem | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);

  const [revisionDialogItem, setRevisionDialogItem] = useState<EditingQueueItem | null>(null);
  const [revisionText, setRevisionText] = useState("");
  const [savingRevision, setSavingRevision] = useState(false);
  const [deleteConfirmItem, setDeleteConfirmItem] = useState<EditingQueueItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [updatingPostStatus, setUpdatingPostStatus] = useState<string | null>(null);

  // Schedule post modal
  const [scheduleItem, setScheduleItem] = useState<EditingQueueItem | null>(null);
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduling, setScheduling] = useState(false);

  // Inline editing for caption
  const [inlineEdit, setInlineEdit] = useState<{ itemId: string; value: string } | null>(null);
  const [savingInline, setSavingInline] = useState(false);

  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [reviewItem, setReviewItem] = useState<EditingQueueItem | null>(null);
  const [unresolvedCounts, setUnresolvedCounts] = useState<Record<string, number>>({});
  const [totalCommentCounts, setTotalCommentCounts] = useState<Record<string, number>>({});

  const [footageViewerItem, setFootageViewerItem] = useState<EditingQueueItem | null>(null);
  const [viewerSubfolder, setViewerSubfolder] = useState<string | undefined>(undefined);

  const [teamMembers, setTeamMembers] = useState<{ user_id: string; display_name: string }[]>([]);

  // Multi-select
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const lastCheckedIndexRef = useRef<number>(-1);

  // Caption edit dialog
  const [captionEditItem, setCaptionEditItem] = useState<EditingQueueItem | null>(null);
  const [captionEditValue, setCaptionEditValue] = useState('');

  // Inline deadline picker
  const [deadlineOpenId, setDeadlineOpenId] = useState<string | null>(null);
  const [savingDeadline, setSavingDeadline] = useState(false);

  // Column sort
  const [sortCol, setSortCol] = useState<string | null>(() => {
    try { return JSON.parse(localStorage.getItem('eq_sort') || 'null')?.col ?? null; } catch { return null; }
  });
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(() => {
    try { return JSON.parse(localStorage.getItem('eq_sort') || 'null')?.dir ?? 'asc'; } catch { return 'asc'; }
  });

  function handleSort(col: string) {
    if (sortCol === col) {
      if (sortDir === 'asc') {
        setSortDir('desc');
        localStorage.setItem('eq_sort', JSON.stringify({ col, dir: 'desc' }));
      } else {
        setSortCol(null);
        setSortDir('asc');
        localStorage.removeItem('eq_sort');
      }
    } else {
      setSortCol(col);
      setSortDir('asc');
      localStorage.setItem('eq_sort', JSON.stringify({ col, dir: 'asc' }));
    }
  }

  function SortIcon({ col }: { col: string }) {
    if (sortCol !== col) return <ChevronsUpDown className="inline ml-1 w-3 h-3 opacity-30" />;
    return sortDir === 'asc'
      ? <ChevronUp className="inline ml-1 w-3 h-3 text-primary" />
      : <ChevronDown className="inline ml-1 w-3 h-3 text-primary" />;
  }

  // Filtered items based on search
  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return items;
    const query = searchQuery.toLowerCase();
    return items.filter((item) =>
      item.title.toLowerCase().includes(query) ||
      item.assignee?.toLowerCase().includes(query) ||
      item.status.toLowerCase().includes(query)
    );
  }, [items, searchQuery]);

  // Sorted items
  const sortedItems = useMemo(() => {
    if (!sortCol) return filteredItems;
    return [...filteredItems].sort((a, b) => {
      let aVal: string | number = '';
      let bVal: string | number = '';
      if (sortCol === 'title') { aVal = a.title ?? ''; bVal = b.title ?? ''; }
      else if (sortCol === 'status') { aVal = a.status ?? ''; bVal = b.status ?? ''; }
      else if (sortCol === 'post_status') { aVal = a.postStatus ?? ''; bVal = b.postStatus ?? ''; }
      else if (sortCol === 'assignee') { aVal = a.assignee ?? ''; bVal = b.assignee ?? ''; }
      else if (sortCol === 'revisions') { aVal = unresolvedCounts[a.id] ?? 0; bVal = unresolvedCounts[b.id] ?? 0; }
      else if (sortCol === 'deadline') { aVal = a.deadline ?? '9999'; bVal = b.deadline ?? '9999'; }
      const cmp = typeof aVal === 'number'
        ? aVal - bVal
        : aVal.localeCompare(bVal, undefined, { sensitivity: 'base' });
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filteredItems, sortCol, sortDir, unresolvedCounts]);

  useEffect(() => {
    if (!clientId || !user) return;
    supabase
      .from("clients")
      .select("name")
      .eq("id", clientId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setClientName(data.name);
      });
  }, [clientId, user]);

  function getDeadlineColor(deadline: string | null): string {
    if (!deadline) return 'text-muted-foreground';
    const diff = new Date(deadline).getTime() - Date.now();
    if (diff < 0) return 'text-red-500';
    if (diff < 48 * 60 * 60 * 1000) return 'text-yellow-500';
    return 'text-foreground';
  }

  async function handleDeadlineSave(item: EditingQueueItem, date: Date | undefined) {
    const value = date ? date.toISOString() : null;
    setDeadlineOpenId(null);
    setSavingDeadline(true);
    const { error } = await supabase.from("video_edits").update({ deadline: value }).eq("id", item.id);
    setSavingDeadline(false);
    if (error) { toast.error("Failed to save deadline"); return; }
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, deadline: value } : i));
  }

  const fetchQueue = async () => {
    if (!clientId || !user) return;
    setFetching(true);
    setError(null);
    try {
      const { data, error: videoErr } = await supabase
        .from("video_edits")
        .select("id, reel_title, status, file_submission, script_url, assignee, assignee_user_id, revisions, post_status, schedule_date, deadline, created_at, footage, caption, script_id, upload_source, storage_path, storage_url, scripts(title, idea_ganadora)")
        .eq("client_id", clientId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

      if (videoErr) throw videoErr;

      const mappedVideos: EditingQueueItem[] = (data || []).map((v: any) => ({
        id: v.id,
        title: v.reel_title && v.reel_title !== "Sin titulo" && v.reel_title !== "Sin título"
          ? v.reel_title
          : (v.scripts?.idea_ganadora || v.scripts?.title || v.reel_title || "Untitled"),
        status: v.status || "Not started",
        statusColor: "",
        fileSubmissionUrl: v.file_submission,
        footageUrl: v.footage || null,
        scriptUrl: v.script_url || null,
        assignee: v.assignee || null,
        assignee_user_id: v.assignee_user_id || null,
        assigneeId: null,
        assigneePropName: null,
        revisions: v.revisions || null,
        revisionPropName: null,
        postStatus: v.post_status || null,
        scheduledDate: v.schedule_date || null,
        lastEdited: v.created_at,
        caption: v.caption ?? null,
        source: 'db' as const,
        script_id: v.script_id || null,
        uploadSource: v.upload_source || null,
        storagePath: v.storage_path || null,
        storageUrl: v.storage_url || null,
        deadline: v.deadline || null,
      }));

      setItems(mappedVideos);
      if (clientId) writeCache(`editing_queue_${clientId}`, mappedVideos);
    } catch (e: any) {
      console.error("Error fetching editing queue:", e);
      setError(e.message || "Failed to fetch editing queue");
    } finally {
      setFetching(false);
    }
  };

  useEffect(() => {
    fetchQueue();
  }, [clientId, user]);

  // Refresh when AI writes to editing_queue
  useEffect(() => {
    const handler = (e: Event) => {
      const scope = (e as CustomEvent).detail?.scope as string;
      if (scope === "editing_queue" || scope === "all") {
        fetchQueue();
      }
    };
    window.addEventListener("ai:data-changed", handler);
    return () => window.removeEventListener("ai:data-changed", handler);
  }, [clientId, user]);

  // Realtime sync: refresh queue whenever any video_edit for this client changes
  useEffect(() => {
    if (!clientId || !user) return;
    const channel = supabase
      .channel(`eq_video_edits_${clientId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'video_edits', filter: `client_id=eq.${clientId}` }, () => {
        fetchQueue();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [clientId, user]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("user_id, display_name")
      .then(({ data }) => {
        setTeamMembers((data || []).filter((p: any) => p.display_name));
      });
  }, [user]);

  useEffect(() => {
    if (!items.length) return;
    const loadCounts = async () => {
      const unresolved: Record<string, number> = {};
      const totals: Record<string, number> = {};
      await Promise.all(
        items.map(async (item) => {
          try {
            const summary = await revisionCommentService.getCommentSummary(item.id);
            unresolved[item.id] = summary.unresolved;
            totals[item.id] = summary.total;
          } catch {
            unresolved[item.id] = 0;
            totals[item.id] = 0;
          }
        })
      );
      setUnresolvedCounts(unresolved);
      setTotalCommentCounts(totals);
    };
    loadCounts();
  }, [items]);

  const handleStatusChange = async (pageId: string, newStatus: string) => {
    setUpdatingStatus(pageId);
    try {
      const { error } = await supabase.from("video_edits").update({ status: newStatus }).eq("id", pageId);
      if (error) throw error;
      setItems((prev) => prev.map((i) => i.id === pageId ? { ...i, status: newStatus } : i));
      setSelectedItem((prev) => prev && prev.id === pageId ? { ...prev, status: newStatus } : prev);
      toast.success(language === "en" ? "Status updated" : "Estado actualizado");
    } catch (e: any) {
      console.error("Error updating status:", e);
      toast.error(language === "en" ? "Failed to update status" : "Error al actualizar estado");
    } finally {
      setUpdatingStatus(null);
    }
  };

  const handleAssigneeUpdate = async (pageId: string, userId: string | null) => {
    try {
      const member = teamMembers.find((m) => m.user_id === userId);
      const displayName = userId ? (member?.display_name ?? "") : "";
      const res = await supabase.functions.invoke("update-editing-status", {
        body: {
          id: pageId,
          assignee: displayName || null,
          assignee_user_id: userId || null,
        },
      });
      if (res.error) throw res.error;
      setItems((prev) => prev.map((i) =>
        i.id === pageId ? { ...i, assignee: displayName || null, assignee_user_id: userId } : i
      ));
      setSelectedItem((prev) =>
        prev && prev.id === pageId ? { ...prev, assignee: displayName || null, assignee_user_id: userId } : prev
      );
    } catch (e: any) {
      console.error("Error updating assignee:", e);
      toast.error(language === "en" ? "Failed to update assignee" : "Error al actualizar asignado");
    }
  };

  const handleOpenRevisions = (item: EditingQueueItem) => {
    setRevisionDialogItem(item);
    setRevisionText(item.revisions || "");
  };

  const handleSaveRevision = async () => {
    if (!revisionDialogItem) return;
    setSavingRevision(true);
    try {
      const { error } = await supabase.from("video_edits").update({ revisions: revisionText }).eq("id", revisionDialogItem.id);
      if (error) throw error;
      setItems((prev) =>
        prev.map((item) =>
          item.id === revisionDialogItem.id ? { ...item, revisions: revisionText } : item
        )
      );
      setSelectedItem((prev) =>
        prev && prev.id === revisionDialogItem.id ? { ...prev, revisions: revisionText } : prev
      );
      toast.success(language === "en" ? "Revisions saved" : "Revisiones guardadas");
      setRevisionDialogItem(null);
    } catch (e: any) {
      console.error("Error saving revisions:", e);
      toast.error(language === "en" ? "Failed to save revisions" : "Error al guardar revisiones");
    } finally {
      setSavingRevision(false);
    }
  };

  const handleDeleteItem = async () => {
    if (!deleteConfirmItem) return;
    setDeleting(true);
    const now = new Date().toISOString();
    try {
      const { error } = await supabase.from("video_edits").update({ deleted_at: now }).eq("id", deleteConfirmItem.id);
      if (error) throw error;
      if (deleteConfirmItem.script_id) {
        await supabase.from("scripts").update({ deleted_at: now }).eq("id", deleteConfirmItem.script_id);
      }
      setItems((prev) => prev.filter((item) => item.id !== deleteConfirmItem.id));
      toast.success(language === "en" ? "Moved to trash" : "Movido a papelera");
      setDeleteConfirmItem(null);
    } catch (e: any) {
      console.error("Error deleting item:", e);
      toast.error(language === "en" ? "Failed to delete" : "Error al eliminar");
    } finally {
      setDeleting(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setBulkDeleting(true);
    const now = new Date().toISOString();
    try {
      const ids = Array.from(selectedIds);
      const { error } = await supabase.from("video_edits").update({ deleted_at: now }).in("id", ids);
      if (error) throw error;
      const scriptIds = items.filter(i => selectedIds.has(i.id) && i.script_id).map(i => i.script_id!);
      if (scriptIds.length > 0) {
        await supabase.from("scripts").update({ deleted_at: now }).in("id", scriptIds);
      }
      const count = selectedIds.size;
      setItems(prev => prev.filter(i => !selectedIds.has(i.id)));
      setSelectedIds(new Set());
      toast.success(language === "en" ? `${count} items moved to trash` : `${count} elementos movidos a papelera`);
    } catch (e: any) {
      toast.error(language === "en" ? "Failed to delete items" : "Error al eliminar elementos");
    } finally {
      setBulkDeleting(false);
    }
  };

  const handleSchedulePost = async () => {
    if (!scheduleItem || !scheduleDate) return;
    setScheduling(true);
    try {
      const { error } = await supabase.from("video_edits").update({ schedule_date: scheduleDate }).eq("id", scheduleItem.id);
      if (error) throw error;
      setItems((prev) => prev.map((i) => i.id === scheduleItem.id ? { ...i, scheduledDate: scheduleDate } : i));
      toast.success(
        language === "en"
          ? `"${scheduleItem.title}" scheduled for ${scheduleDate}`
          : `"${scheduleItem.title}" programado para ${scheduleDate}`
      );
      setScheduleItem(null);
      setScheduleDate("");
    } catch (e: any) {
      console.error("Error scheduling post:", e);
      toast.error(language === "en" ? "Failed to schedule post" : "Error al programar post");
    } finally {
      setScheduling(false);
    }
  };

  const handlePostStatusChange = async (pageId: string, newPostStatus: string) => {
    setUpdatingPostStatus(pageId);
    try {
      const { error } = await supabase.from("video_edits").update({ post_status: newPostStatus }).eq("id", pageId);
      if (error) throw error;
      setItems((prev) => prev.map((item) => item.id === pageId ? { ...item, postStatus: newPostStatus } : item));
      setSelectedItem((prev) => prev && prev.id === pageId ? { ...prev, postStatus: newPostStatus } : prev);
      toast.success(language === "en" ? "Post status updated" : "Estado de post actualizado");
    } catch (e: any) {
      console.error("Error updating post status:", e);
      toast.error(language === "en" ? "Failed to update post status" : "Error al actualizar estado");
    } finally {
      setUpdatingPostStatus(null);
    }
  };

  const handleSaveInline = async () => {
    if (!inlineEdit) return;
    setSavingInline(true);
    try {
      const { error } = await supabase.from("video_edits").update({ caption: inlineEdit.value || null }).eq("id", inlineEdit.itemId);
      if (error) throw error;
      setItems((prev) => prev.map((i) => i.id === inlineEdit.itemId ? { ...i, caption: inlineEdit.value || null } : i));
      setInlineEdit(null);
    } catch {
      toast.error("Failed to save");
    } finally {
      setSavingInline(false);
    }
  };

  const handleSaveCaptionEdit = async () => {
    if (!captionEditItem) return;
    try {
      const { error } = await supabase.from("video_edits").update({ caption: captionEditValue || null }).eq("id", captionEditItem.id);
      if (error) throw error;
      setItems(prev => prev.map(i => i.id === captionEditItem.id ? { ...i, caption: captionEditValue || null } : i));
      setCaptionEditItem(null);
      toast.success("Caption saved");
    } catch {
      toast.error("Failed to save caption");
    }
  };

  if (loading) {
    return (
      <PageTransition className="flex-1 flex flex-col min-h-screen">
        <EditingQueueSkeleton />
      </PageTransition>
    );
  }

  const selectedDriveId = selectedItem?.fileSubmissionUrl
    ? extractGoogleDriveFileId(selectedItem.fileSubmissionUrl)
    : null;

  const handleExportCSV = () => {
    const exportData = filteredItems.map((item) => ({
      Title: item.title,
      Status: item.status,
      "Post Status": item.postStatus || "—",
      Assignee: item.assignee || "—",
      Revisions: item.revisions || "—",
      "Scheduled Date": item.scheduledDate || "—",
      "Last Edited": item.lastEdited,
    }));
    exportToCSV(exportData, {
      filename: `editing-queue-${clientName}-${new Date().toISOString().split("T")[0]}.csv`,
    });
  };

  const renderAssigneeCell = (item: EditingQueueItem) => {
    const hasLegacyAssignee = !item.assignee_user_id && item.assignee;
    const displayName = item.assignee || (hasLegacyAssignee ? item.assignee! : null);
    const initial = displayName ? displayName.trim().charAt(0).toUpperCase() : null;
    const avatarColor = displayName ? getAssigneeColor(displayName) : '#334155';
    return (
      <div className="flex items-center gap-2">
        {initial ? (
          <div
            className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
            style={{ background: avatarColor }}
            title={displayName!}
          >
            {initial}
          </div>
        ) : (
          <div className="flex-shrink-0 w-6 h-6 rounded-full bg-muted border border-border/50 flex items-center justify-center">
            <UserCircle className="w-3.5 h-3.5 text-muted-foreground/50" />
          </div>
        )}
        <Select
          value={item.assignee_user_id || "__none__"}
          onValueChange={(val) => handleAssigneeUpdate(item.id, val === "__none__" ? null : val)}
        >
          <SelectTrigger className="h-7 text-xs min-w-[90px] max-w-[110px] bg-transparent border-none shadow-none px-0">
            <SelectValue placeholder={hasLegacyAssignee ? item.assignee! : (language === "en" ? "Unassigned" : "Sin asignar")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">{language === "en" ? "Unassigned" : "Sin asignar"}</SelectItem>
            {teamMembers.map((m) => (
              <SelectItem key={m.user_id} value={m.user_id}>
                {m.display_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  };

  return (

    <>
      <PageTransition className="flex-1 flex flex-col min-h-screen">

        <div className="flex-1 px-4 sm:px-8 py-8 max-w-7xl mx-auto w-full">
          <motion.div
            className="flex items-center justify-between mb-6"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <button
              onClick={() => navigate(`/clients/${clientId}`)}
              className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              {clientName || (language === "en" ? "Back" : "Volver")}
            </button>
            <button
              onClick={() => {
                navigator.clipboard.writeText(`https://connectacreators.com/public/edit-queue/${clientId}`);
                toast.success(language === "en" ? "Link copied to clipboard" : "Enlace copiado al portapapeles");
              }}
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg backdrop-blur-sm bg-white/10 border border-white/20 text-muted-foreground hover:text-foreground hover:bg-white/20 transition-all"
            >
              <Share2 className="w-3.5 h-3.5" />
              Share
            </button>
          </motion.div>

          {fetching ? (
            <EditingQueueSkeleton />
          ) : error ? (
            <div className="text-center py-20 text-muted-foreground text-sm">{error}</div>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.1 }}
            >
              <TableHeaderComponent
                title={language === "en" ? "Editing Queue" : "Cola de Edición"}
                count={filteredItems.length}
                description={items.length === 0 ? (language === "en" ? "No items yet" : "Sin elementos aún") : undefined}
                searchPlaceholder={language === "en" ? "Search by title or assignee..." : "Buscar por título o asignado..."}
                onSearchChange={setSearchQuery}
                onExport={handleExportCSV}
                showColumnToggle={false}
              />

              {items.length === 0 ? (
                <div className="text-center py-20 text-muted-foreground text-sm">
                  {language === "en" ? "No items in the editing queue" : "No hay elementos en la cola de edición"}
                </div>
              ) : filteredItems.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground text-sm">
                  {language === "en" ? "No items match your search" : "No hay elementos que coincidan con tu búsqueda"}
                </div>
              ) : (
                <div className="glass-card rounded-xl overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-border/40 hover:bg-transparent">
                        <TableHead className="w-[40px] pr-0">
                          <input
                            type="checkbox"
                            className="checkbox-clean"
                            checked={filteredItems.length > 0 && filteredItems.every(i => selectedIds.has(i.id))}
                            onChange={(e) => setSelectedIds(e.target.checked ? new Set(filteredItems.map(i => i.id)) : new Set())}
                          />
                        </TableHead>
                        <TableHead className="font-semibold cursor-pointer select-none hover:text-foreground" onClick={() => handleSort('title')}>{language === "en" ? "Title" : "Título"}<SortIcon col="title" /></TableHead>
                        <TableHead className="font-semibold cursor-pointer select-none hover:text-foreground" onClick={() => handleSort('status')}>Status<SortIcon col="status" /></TableHead>
                        <TableHead className="font-semibold cursor-pointer select-none hover:text-foreground" onClick={() => handleSort('post_status')}>{language === "en" ? "Post Status" : "Estado Post"}<SortIcon col="post_status" /></TableHead>
                        <TableHead className="font-semibold cursor-pointer select-none hover:text-foreground" onClick={() => handleSort('assignee')}>{language === "en" ? "Assignee" : "Asignado"}<SortIcon col="assignee" /></TableHead>
                        <TableHead className="font-semibold cursor-pointer select-none hover:text-foreground whitespace-nowrap" onClick={() => handleSort('revisions')}>{language === "en" ? "Revisions" : "Revisiones"}<SortIcon col="revisions" /></TableHead>
                        <TableHead className="font-semibold cursor-pointer select-none hover:text-foreground whitespace-nowrap" onClick={() => handleSort('deadline')}>Deadline<SortIcon col="deadline" /></TableHead>
                        <TableHead className="font-semibold">Files</TableHead>
                        <TableHead className="w-[40px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedItems.map((item, itemIndex) => {
                        const unresolvedCount = unresolvedCounts[item.id] ?? 0;
                        const totalCount = totalCommentCounts[item.id] ?? 0;
                        const countLoaded = unresolvedCounts[item.id] !== undefined;
                        return (
                          <TableRow
                            key={item.id}
                            className="group cursor-pointer hover:bg-primary/[0.025] transition-colors"
                            onClick={() => { setReviewItem(item); setReviewModalOpen(true); }}
                          >
                            {/* Checkbox */}
                            <TableCell className="w-[40px] pr-0" onClick={e => e.stopPropagation()}>
                              {item.source !== 'script' && (
                                <input
                                  type="checkbox"
                                  className={`checkbox-clean transition-opacity ${selectedIds.has(item.id) ? "opacity-100" : "opacity-0 group-hover:opacity-50"}`}
                                  checked={selectedIds.has(item.id)}
                                  onChange={(e) => {
                                    const checking = e.target.checked;
                                    if (e.nativeEvent instanceof MouseEvent && e.nativeEvent.shiftKey && lastCheckedIndexRef.current >= 0) {
                                      const from = Math.min(lastCheckedIndexRef.current, itemIndex);
                                      const to = Math.max(lastCheckedIndexRef.current, itemIndex);
                                      const rangeIds = sortedItems.slice(from, to + 1).filter(i => i.source !== 'script').map(i => i.id);
                                      setSelectedIds(prev => {
                                        const next = new Set(prev);
                                        rangeIds.forEach(id => checking ? next.add(id) : next.delete(id));
                                        return next;
                                      });
                                    } else {
                                      setSelectedIds(prev => {
                                        const next = new Set(prev);
                                        if (checking) next.add(item.id); else next.delete(item.id);
                                        return next;
                                      });
                                    }
                                    lastCheckedIndexRef.current = itemIndex;
                                  }}
                                />
                              )}
                            </TableCell>

                            {/* Title — left border colored by status */}
                            <TableCell
                              className="font-medium text-foreground max-w-xs"
                              style={{ borderLeft: `3px solid ${getRowStatusBorderColor(item.status)}`, paddingLeft: '13px' }}
                            >
                              <span className="truncate block max-w-[200px]">{item.title}</span>
                            </TableCell>

                            {/* Status */}
                            <TableCell onClick={e => e.stopPropagation()}>
                              {item.source === 'script' ? (
                                <StatusBadge status={item.status} />
                              ) : (
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <button className="inline-flex items-center gap-1 focus:outline-none" disabled={updatingStatus === item.id}>
                                      <StatusBadge status={item.status} />
                                      {updatingStatus !== item.id && <ChevronDown className="w-3 h-3 opacity-60" />}
                                      {updatingStatus === item.id && <Loader2 className="w-3 h-3 animate-spin" />}
                                    </button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="start" className="bg-popover border border-border z-50">
                                    {STATUS_OPTIONS.map((s) => (
                                      <DropdownMenuItem key={s} onClick={() => handleStatusChange(item.id, s)} className={item.status === s ? "font-bold" : ""}>
                                        <span className={`inline-block w-2 h-2 rounded-full mr-2 ${getStatusDotColor(s)}`} />
                                        {s}
                                      </DropdownMenuItem>
                                    ))}
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              )}
                            </TableCell>

                            {/* Post Status */}
                            <TableCell onClick={e => e.stopPropagation()}>
                              {item.source === 'script' ? (
                                <span className="text-xs text-muted-foreground">—</span>
                              ) : (
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <button className="inline-flex items-center gap-1 focus:outline-none" disabled={updatingPostStatus === item.id}>
                                      {updatingPostStatus === item.id ? (
                                        <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
                                      ) : item.postStatus ? (
                                        <div className="flex items-center gap-1">
                                          <StatusBadge status={item.postStatus} />
                                          <ChevronDown className="w-3 h-3 opacity-60" />
                                        </div>
                                      ) : (
                                        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border border-dashed border-muted-foreground/30 text-muted-foreground cursor-pointer hover:border-primary/50 hover:text-foreground transition-colors">
                                          {language === "en" ? "Set status" : "Establecer estado"}
                                          <ChevronDown className="w-2.5 h-2.5 opacity-60" />
                                        </span>
                                      )}
                                    </button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="start" className="bg-popover border border-border z-50">
                                    {POST_STATUS_OPTIONS.map((s) => (
                                      <DropdownMenuItem key={s} onClick={() => handlePostStatusChange(item.id, s)} className={`text-xs ${item.postStatus === s ? "font-bold" : ""}`}>
                                        <span className={`inline-block w-2 h-2 rounded-full mr-2 ${s === "Published" ? "bg-emerald-400" : s === "Needs Revision" ? "bg-destructive" : s === "Scheduled" ? "bg-primary" : "bg-muted-foreground"}`} />
                                        {s}
                                      </DropdownMenuItem>
                                    ))}
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              )}
                            </TableCell>

                            {/* Assignee with avatar */}
                            <TableCell onClick={e => e.stopPropagation()}>
                              {item.source === 'script' ? (
                                <span className="text-xs text-muted-foreground">—</span>
                              ) : renderAssigneeCell(item)}
                            </TableCell>

                            {/* Revisions with count badge */}
                            <TableCell onClick={e => e.stopPropagation()}>
                              <button
                                className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-md border transition-colors ${
                                  unresolvedCount > 0
                                    ? 'border-destructive/40 text-destructive hover:bg-destructive/10'
                                    : countLoaded && totalCount > 0
                                    ? 'border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/10'
                                    : 'border-border text-muted-foreground'
                                }`}
                                onClick={e => { e.stopPropagation(); setReviewItem(item); setReviewModalOpen(true); }}
                              >
                                <MessageSquare className="w-3 h-3" />
                                {unresolvedCount > 0 ? (
                                  <span className="inline-flex items-center justify-center min-w-[16px] h-4 rounded-full bg-destructive text-[10px] font-bold text-white px-1">
                                    {unresolvedCount}
                                  </span>
                                ) : countLoaded && totalCount > 0 ? (
                                  <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-emerald-500 text-[9px] font-bold text-white">✓</span>
                                ) : null}
                              </button>
                            </TableCell>

                            {/* Deadline */}
                            <TableCell onClick={e => e.stopPropagation()}>
                              {item.source === 'script' ? (
                                <span className="text-xs text-muted-foreground">—</span>
                              ) : (
                                <Popover open={deadlineOpenId === item.id} onOpenChange={open => setDeadlineOpenId(open ? item.id : null)}>
                                  <PopoverTrigger asChild>
                                    <button className={`text-xs font-medium hover:opacity-70 transition-opacity whitespace-nowrap ${getDeadlineColor(item.deadline)}`}>
                                      {item.deadline
                                        ? new Date(item.deadline).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
                                        : <span className="text-muted-foreground/50">+ Add deadline</span>}
                                    </button>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-auto p-0" align="start">
                                    <CalendarPicker
                                      mode="single"
                                      selected={item.deadline ? new Date(item.deadline) : undefined}
                                      onSelect={date => handleDeadlineSave(item, date)}
                                      initialFocus
                                    />
                                    {item.deadline && (
                                      <div className="border-t p-2 flex justify-end">
                                        <button
                                          className="text-xs text-destructive hover:underline"
                                          onClick={() => handleDeadlineSave(item, undefined)}
                                        >
                                          Clear deadline
                                        </button>
                                      </div>
                                    )}
                                  </PopoverContent>
                                </Popover>
                              )}
                            </TableCell>

                            {/* Files — merged Footage + File Submission */}
                            <TableCell onClick={e => e.stopPropagation()}>
                              {item.source === 'script' ? (
                                <span className="text-xs text-muted-foreground">—</span>
                              ) : (
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {(item.footageUrl || item.storageUrl) ? (
                                    <button
                                      onClick={() => { setViewerSubfolder(undefined); setFootageViewerItem(item); }}
                                      className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md bg-green-500/10 text-green-500 border border-green-500/25 hover:bg-green-500/20 transition-colors"
                                      title="View footage"
                                    >
                                      <Play className="w-2.5 h-2.5" /> Footage
                                    </button>
                                  ) : (
                                    <FootageUploadDialog
                                      videoEditId={item.id}
                                      clientId={clientId || ''}
                                      onComplete={() => fetchQueue()}
                                      currentFootageUrl={item.footageUrl}
                                      currentFileSubmissionUrl={item.fileSubmissionUrl}
                                      uploadSource={item.uploadSource}
                                    />
                                  )}
                                  {item.fileSubmissionUrl ? (
                                    <button
                                      onClick={() => { setViewerSubfolder('submission'); setFootageViewerItem(item); }}
                                      className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md bg-primary/10 text-primary border border-primary/25 hover:bg-primary/20 transition-colors"
                                      title="View submitted edit"
                                    >
                                      <Play className="w-2.5 h-2.5" /> Edit
                                    </button>
                                  ) : (
                                    <FootageUploadDialog
                                      videoEditId={item.id}
                                      clientId={clientId || ''}
                                      onComplete={() => fetchQueue()}
                                      currentFootageUrl={item.footageUrl}
                                      currentFileSubmissionUrl={item.fileSubmissionUrl}
                                      uploadSource={item.uploadSource}
                                      subfolder="submission"
                                    />
                                  )}
                                </div>
                              )}
                            </TableCell>

                            {/* ••• actions menu */}
                            <TableCell onClick={e => e.stopPropagation()}>
                              {item.source !== 'script' && (
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                      <MoreHorizontal className="w-4 h-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="bg-popover border border-border z-50 w-44">
                                    {item.scriptUrl ? (
                                      <DropdownMenuItem asChild>
                                        <a href={item.scriptUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-xs">
                                          <ExternalLink className="w-3.5 h-3.5" /> View Script
                                        </a>
                                      </DropdownMenuItem>
                                    ) : (
                                      <DropdownMenuItem disabled className="text-xs text-muted-foreground/50">
                                        <ExternalLink className="w-3.5 h-3.5 mr-2" /> No Script
                                      </DropdownMenuItem>
                                    )}
                                    <DropdownMenuItem
                                      onClick={() => { setScheduleItem(item); setScheduleDate(item.scheduledDate || ""); }}
                                      className="text-xs"
                                    >
                                      <Calendar className="w-3.5 h-3.5 mr-2" />
                                      {item.scheduledDate ? `Scheduled: ${item.scheduledDate}` : "Add Schedule"}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onClick={() => { setCaptionEditItem(item); setCaptionEditValue(item.caption || ''); }}
                                      className="text-xs"
                                    >
                                      <Save className="w-3.5 h-3.5 mr-2" />
                                      {item.caption ? "Edit Caption" : "Add Caption"}
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      onClick={() => setDeleteConfirmItem(item)}
                                      className="text-xs text-destructive focus:text-destructive focus:bg-destructive/10"
                                    >
                                      <Trash2 className="w-3.5 h-3.5 mr-2" /> Delete
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </motion.div>
          )}
        </div>
      </PageTransition>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-2xl px-4 py-2.5" style={{ background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', border: '1px solid rgba(255,255,255,0.10)', boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}>
          <span className="text-sm font-medium text-foreground">{selectedIds.size} {language === "en" ? "selected" : "seleccionados"}</span>
          <div className="w-px h-4 bg-border" />
          <Button variant="ghost" size="sm" className="text-xs h-7 px-2" onClick={() => setSelectedIds(new Set(filteredItems.map(i => i.id)))}>
            {language === "en" ? "Select All" : "Seleccionar Todo"}
          </Button>
          <Button variant="ghost" size="sm" className="text-xs h-7 px-2" onClick={() => setSelectedIds(new Set())}>
            {language === "en" ? "Deselect All" : "Deseleccionar"}
          </Button>
          <div className="w-px h-4 bg-border" />
          <Button
            variant="ghost"
            size="sm"
            className="text-xs h-7 px-2 text-destructive hover:text-destructive hover:bg-destructive/10 gap-1"
            onClick={handleBulkDelete}
            disabled={bulkDeleting}
          >
            {bulkDeleting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
            {language === "en" ? "Delete" : "Eliminar"}
          </Button>
        </div>
      )}

      {/* Caption Edit Dialog */}
      <Dialog open={!!captionEditItem} onOpenChange={(v) => !v && setCaptionEditItem(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">{captionEditItem?.caption ? "Edit Caption" : "Add Caption"}</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground truncate">{captionEditItem?.title}</DialogDescription>
          </DialogHeader>
          <Textarea
            value={captionEditValue}
            onChange={e => setCaptionEditValue(e.target.value)}
            placeholder="Write the post caption..."
            rows={5}
            className="resize-none text-sm"
            autoFocus
          />
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setCaptionEditItem(null)}>Cancel</Button>
            <Button size="sm" onClick={handleSaveCaptionEdit} className="gap-1.5">
              <Save className="w-3.5 h-3.5" /> Save Caption
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Video Preview Modal */}
      <Dialog open={!!selectedItem} onOpenChange={() => setSelectedItem(null)}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3 flex-wrap">
              <span>{selectedItem?.title}</span>
              {selectedItem && <StatusBadge status={selectedItem.status} />}
            </DialogTitle>
          </DialogHeader>
          <div className="mt-2">
            {selectedDriveId ? (
              <>
                <div className="aspect-video rounded-lg overflow-hidden bg-black">
                  <iframe
                    src={`https://drive.google.com/file/d/${selectedDriveId}/preview`}
                    className="w-full h-full"
                    allow="autoplay"
                    allowFullScreen
                  />
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <a
                    href={getGoogleDriveDownloadUrl(selectedDriveId)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
                  >
                    <Download className="w-3.5 h-3.5" />
                    {language === "en" ? "Download Video" : "Descargar Video"}
                  </a>
                  {selectedItem?.scriptUrl && (
                    <a
                      href={selectedItem.scriptUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      <ExternalLink className="w-3 h-3" />
                      {language === "en" ? "View Script" : "Ver Guión"}
                    </a>
                  )}
                </div>
              </>
            ) : selectedItem?.fileSubmissionUrl ? (
              <div className="text-center py-10">
                <a
                  href={selectedItem.fileSubmissionUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  {language === "en" ? "Open file link" : "Abrir enlace del archivo"}
                </a>
              </div>
            ) : null}

            {/* Status, Assignee & Revisions in modal */}
            {selectedItem && (
              <div className="mt-4 flex flex-wrap items-center gap-4 pt-3 border-t border-border/50">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {language === "en" ? "Status:" : "Estado:"}
                  </span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="inline-flex items-center gap-1 focus:outline-none" disabled={updatingStatus === selectedItem.id}>
                        {updatingStatus === selectedItem.id ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <>
                            <StatusBadge status={selectedItem.status} />
                            <ChevronDown className="w-3 h-3 opacity-60" />
                          </>
                        )}
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="bg-popover border border-border z-50">
                      {STATUS_OPTIONS.map((s) => (
                        <DropdownMenuItem
                          key={s}
                          onClick={() => handleStatusChange(selectedItem.id, s)}
                          className={selectedItem.status === s ? "font-bold" : ""}
                        >
                          <span className={`inline-block w-2 h-2 rounded-full mr-2 ${getStatusDotColor(s)}`} />
                          {s}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {language === "en" ? "Assignee:" : "Asignado:"}
                  </span>
                  {renderAssigneeCell(selectedItem)}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className={`gap-1.5 text-xs ${
                    unresolvedCounts[selectedItem.id] > 0
                      ? "border-destructive text-destructive hover:bg-destructive/10"
                      : "border-green-500 text-green-500 hover:bg-green-500/10"
                  }`}
                  onClick={() => { setReviewItem(selectedItem); setReviewModalOpen(true); }}
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  {language === "en" ? "Revisions" : "Revisiones"}
                </Button>
              </div>
            )}
            {selectedItem?.caption && (
              <div className="mt-4 pt-3 border-t border-border/40">
                <p className="text-xs text-muted-foreground uppercase font-semibold mb-1.5 tracking-wide">Caption</p>
                <p className="text-sm whitespace-pre-wrap text-foreground leading-relaxed">{selectedItem.caption}</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Revisions Dialog */}
      <Dialog open={!!revisionDialogItem} onOpenChange={() => setRevisionDialogItem(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">
              {language === "en" ? "Revisions" : "Revisiones"} — {revisionDialogItem?.title}
            </DialogTitle>
          </DialogHeader>
          <div className="mt-2 space-y-3">
            <Textarea
              value={revisionText}
              onChange={(e) => setRevisionText(e.target.value)}
              placeholder={language === "en" ? "Leave revision notes here..." : "Deja notas de revisión aquí..."}
              rows={5}
              className="text-sm"
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setRevisionDialogItem(null)}>
                {language === "en" ? "Cancel" : "Cancelar"}
              </Button>
              <Button size="sm" onClick={handleSaveRevision} disabled={savingRevision} className="gap-1.5">
                {savingRevision ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                {language === "en" ? "Save" : "Guardar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteConfirmItem} onOpenChange={() => setDeleteConfirmItem(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">
              {language === "en" ? "Delete Item" : "Eliminar Elemento"}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {language === "en"
                ? `Are you sure you want to delete "${deleteConfirmItem?.title}"? This will archive it in Notion and remove the sync record.`
                : `¿Estás seguro de que quieres eliminar "${deleteConfirmItem?.title}"? Se archivará en Notion y se eliminará el registro de sincronización.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="ghost" size="sm" onClick={() => setDeleteConfirmItem(null)} disabled={deleting}>
              {language === "en" ? "Cancel" : "Cancelar"}
            </Button>
            <Button variant="destructive" size="sm" onClick={handleDeleteItem} disabled={deleting} className="gap-1.5">
              {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              {language === "en" ? "Delete" : "Eliminar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Schedule Post Modal */}
      <Dialog open={!!scheduleItem} onOpenChange={() => setScheduleItem(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <CalendarPlus className="w-4 h-4 text-primary" />
              {scheduleItem?.scheduledDate
                ? (language === "en" ? "Reschedule Post" : "Reprogramar Post")
                : (language === "en" ? "Schedule Post" : "Programar Post")}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {scheduleItem?.title}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-xs font-medium">
                {language === "en" ? "Select publish date" : "Selecciona la fecha de publicación"}
              </Label>
              <Input
                type="date"
                value={scheduleDate}
                onChange={(e) => setScheduleDate(e.target.value)}
                min={new Date().toISOString().split("T")[0]}
                className="text-sm"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {language === "en"
                ? "This will add the post to the Content Calendar and update the Post Status in Notion to Scheduled."
                : "Esto añadirá el post al Calendario de Contenido y actualizará el Estado del Post en Notion a Programado."}
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" size="sm" onClick={() => setScheduleItem(null)} disabled={scheduling}>
              {language === "en" ? "Cancel" : "Cancelar"}
            </Button>
            <Button
              size="sm"
              onClick={handleSchedulePost}
              disabled={scheduling || !scheduleDate}
              className="gap-1.5 btn-17-primary"
            >
              {scheduling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CalendarPlus className="w-3.5 h-3.5" />}
              {language === "en" ? "Schedule" : "Programar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {reviewItem && (
        <VideoReviewModal
          open={reviewModalOpen}
          onClose={() => {
            // Refresh count when modal closes so button reflects latest state
            revisionCommentService.getUnresolvedCount(reviewItem.id)
              .then(count => setUnresolvedCounts(prev => ({ ...prev, [reviewItem.id]: count })));
            setReviewModalOpen(false);
            setReviewItem(null);
          }}
          videoEditId={reviewItem.id}
          title={reviewItem.title}
          uploadSource={reviewItem.uploadSource || null}
          storagePath={reviewItem.storagePath || null}
          fileSubmissionUrl={reviewItem.fileSubmissionUrl}
          onCommentsChanged={() => {
            revisionCommentService.getUnresolvedCount(reviewItem.id)
              .then(count => setUnresolvedCounts(prev => ({ ...prev, [reviewItem.id]: count })));
          }}
          onStatusChanged={(newStatus) => {
            const id = reviewItem.id;
            setItems(prev => prev.map(i => i.id === id ? { ...i, status: newStatus } : i));
            setSelectedItem(prev => prev && prev.id === id ? { ...prev, status: newStatus } : prev);
          }}
        />
      )}

      {footageViewerItem && (
        <FootagePanel
          open={!!footageViewerItem}
          onClose={() => setFootageViewerItem(null)}
          title={footageViewerItem.title}
          videoEditId={footageViewerItem.id}
          clientId={clientId || ''}
          footageUrl={footageViewerItem.footageUrl}
          fileSubmissionUrl={footageViewerItem.fileSubmissionUrl}
          uploadSource={footageViewerItem.uploadSource}
          storagePath={footageViewerItem.storagePath}
          storageUrl={footageViewerItem.storageUrl}
          subfolder={viewerSubfolder}
          scriptId={footageViewerItem.script_id}
          onComplete={() => { fetchQueue(); setFootageViewerItem(null); }}
        />
      )}
    </>
  );
}