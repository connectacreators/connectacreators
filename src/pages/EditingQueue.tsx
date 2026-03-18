import { useEffect, useState, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, ArrowLeft, Play, ExternalLink, Download, ChevronDown, UserCircle, MessageSquare, Save, Trash2, CalendarPlus, Calendar, CheckCircle, Share2 } from "lucide-react";
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
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import TableHeaderComponent from "@/components/tables/TableHeader";
import { StatusBadge } from "@/components/ui/status-badge";
import { exportToCSV } from "@/utils/csvExport";
import FootageUploadDialog from '@/components/FootageUploadDialog';
import FootageViewerModal from '@/components/FootageViewerModal';
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
}


const STATUS_OPTIONS = ["Not started", "In progress", "Needs Revision", "Done"];
const POST_STATUS_OPTIONS = ["Scheduled", "Needs Revision", "Approved", "Done"];

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

export default function EditingQueue() {
  const { clientId } = useParams<{ clientId: string }>();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { language } = useLanguage();
  const [clientName, setClientName] = useState("");
  const [items, setItems] = useState<EditingQueueItem[]>([]);

  const [fetching, setFetching] = useState(true);
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

  const [footageViewerItem, setFootageViewerItem] = useState<EditingQueueItem | null>(null);
  const [viewerSubfolder, setViewerSubfolder] = useState<string | undefined>(undefined);

  const [teamMembers, setTeamMembers] = useState<{ user_id: string; display_name: string }[]>([]);

  // Multi-select
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

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

  const fetchQueue = async () => {
    if (!clientId || !user) return;
    setFetching(true);
    setError(null);
    try {
      const { data, error: videoErr } = await supabase
        .from("video_edits")
        .select("id, reel_title, status, file_submission, script_url, assignee, assignee_user_id, revisions, post_status, schedule_date, created_at, footage, caption, script_id, upload_source, storage_path, storage_url")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false });

      if (videoErr) throw videoErr;

      const mappedVideos: EditingQueueItem[] = (data || []).map((v: any) => ({
        id: v.id,
        title: v.reel_title || "Untitled",
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
      }));

      setItems(mappedVideos);
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
      const counts: Record<string, number> = {};
      await Promise.all(
        items.map(async (item) => {
          try {
            counts[item.id] = await revisionCommentService.getUnresolvedCount(item.id);
          } catch { counts[item.id] = 0; }
        })
      );
      setUnresolvedCounts(counts);
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
      const { error } = await supabase.from("video_edits").update({
        assignee: displayName || null,
        assignee_user_id: userId || null,
      }).eq("id", pageId);
      if (error) throw error;
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
    try {
      const { error } = await supabase.from("video_edits").delete().eq("id", deleteConfirmItem.id);
      if (error) throw error;
      setItems((prev) => prev.filter((item) => item.id !== deleteConfirmItem.id));
      toast.success(language === "en" ? "Item deleted" : "Elemento eliminado");
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
    try {
      const ids = Array.from(selectedIds);
      await supabase.from("video_edits").delete().in("id", ids);
      const count = selectedIds.size;
      setItems(prev => prev.filter(i => !selectedIds.has(i.id)));
      setSelectedIds(new Set());
      toast.success(language === "en" ? `${count} items deleted` : `${count} elementos eliminados`);
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
    const dbField = 'caption';
    const stateField = 'caption';
    try {
      const { error } = await supabase.from("video_edits").update({
        [dbField]: inlineEdit.value || null,
      }).eq("id", inlineEdit.itemId);
      if (error) throw error;
      setItems((prev) => prev.map((i) => i.id === inlineEdit.itemId ? { ...i, [stateField]: inlineEdit.value || null } : i));
      setInlineEdit(null);
    } catch {
      toast.error("Failed to save");
    } finally {
      setSavingInline(false);
    }
  };

  if (loading) {
    return (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
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
    // Fallback: show legacy text assignee as placeholder if no UUID yet
    const hasLegacyAssignee = !item.assignee_user_id && item.assignee;
    return (
      <Select
        value={item.assignee_user_id || ""}
        onValueChange={(val) => handleAssigneeUpdate(item.id, val || null)}
      >
        <SelectTrigger className="h-7 text-xs min-w-[120px] bg-transparent border-none shadow-none px-1">
          <SelectValue placeholder={hasLegacyAssignee ? item.assignee! : (language === "en" ? "Unassigned" : "Sin asignar")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="">{language === "en" ? "Unassigned" : "Sin asignar"}</SelectItem>
          {teamMembers.map((m) => (
            <SelectItem key={m.user_id} value={m.user_id}>
              {m.display_name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  };

  return (

    <>
      <main className="flex-1 flex flex-col min-h-screen">

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
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
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
                        <TableHead className="font-semibold">{language === "en" ? "Title" : "Título"}</TableHead>
                        <TableHead className="font-semibold">Status</TableHead>
                        <TableHead className="font-semibold">{language === "en" ? "Post Status" : "Estado Post"}</TableHead>
                        <TableHead className="font-semibold">{language === "en" ? "Assignee" : "Asignado"}</TableHead>
                        <TableHead className="font-semibold">{language === "en" ? "Revisions" : "Revisiones"}</TableHead>
                        <TableHead className="font-semibold">Footage</TableHead>
                        <TableHead className="font-semibold">File Submission</TableHead>
                        <TableHead className="font-semibold">Script</TableHead>
                        <TableHead className="font-semibold">{language === "en" ? "Schedule" : "Fecha"}</TableHead>
                        <TableHead className="font-semibold">Caption</TableHead>
                        <TableHead className="w-[50px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredItems.map((item) => {
                    return (
                      <TableRow key={item.id} className="group">
                        <TableCell className="w-[40px] pr-0" onClick={(e) => e.stopPropagation()}>
                          {item.source !== 'script' && (
                            <input
                              type="checkbox"
                              className={`checkbox-clean transition-opacity ${selectedIds.has(item.id) ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
                              checked={selectedIds.has(item.id)}
                              onChange={(e) => {
                                setSelectedIds(prev => {
                                  const next = new Set(prev);
                                  if (e.target.checked) next.add(item.id); else next.delete(item.id);
                                  return next;
                                });
                              }}
                            />
                          )}
                        </TableCell>
                        <TableCell className="font-medium text-foreground max-w-xs truncate">{item.title}</TableCell>
                        {/* Status */}
                        <TableCell>
                          {item.source === 'script' ? (
                            <StatusBadge status={item.status} />
                          ) : (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button
                                  className="inline-flex items-center gap-1 focus:outline-none"
                                  disabled={updatingStatus === item.id}
                                >
                                  <StatusBadge status={item.status} />
                                  {updatingStatus !== item.id && <ChevronDown className="w-3 h-3 opacity-60" />}
                                  {updatingStatus === item.id && <Loader2 className="w-3 h-3 animate-spin" />}
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="start" className="bg-popover border border-border z-50">
                                {STATUS_OPTIONS.map((s) => (
                                  <DropdownMenuItem
                                    key={s}
                                    onClick={() => handleStatusChange(item.id, s)}
                                    className={item.status === s ? "font-bold" : ""}
                                  >
                                    <span className={`inline-block w-2 h-2 rounded-full mr-2 ${getStatusDotColor(s)}`} />
                                    {s}
                                  </DropdownMenuItem>
                                ))}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </TableCell>
                        {/* Post Status */}
                        <TableCell>
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
                                    <span className={`inline-block w-2 h-2 rounded-full mr-2 ${s === "Approved" || s === "Done" ? "bg-emerald-400" : s === "Needs Revision" ? "bg-destructive" : s === "Scheduled" ? "bg-primary" : "bg-muted-foreground"}`} />
                                    {s}
                                  </DropdownMenuItem>
                                ))}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </TableCell>
                        {/* Assignee */}
                        <TableCell>
                          {item.source === 'script' ? (
                            <span className="text-xs text-muted-foreground">—</span>
                          ) : renderAssigneeCell(item)}
                        </TableCell>
                        {/* Revisions */}
                        <TableCell>
                          <Button
                            variant="outline"
                            size="sm"
                            className={`h-6 text-xs px-2.5 gap-1 ${
                              unresolvedCounts[item.id] > 0
                                ? "border-destructive text-destructive hover:bg-destructive/10"
                                : "border-green-500 text-green-500 hover:bg-green-500/10"
                            }`}
                            onClick={() => { setReviewItem(item); setReviewModalOpen(true); }}
                          >
                            <MessageSquare className="w-3 h-3" />
                            {language === "en" ? "Revisions" : "Revisiones"}
                          </Button>
                        </TableCell>
                        {/* Footage */}
                        <TableCell>
                          {item.source === 'script' ? (
                            <span className="text-xs text-muted-foreground">—</span>
                          ) : (item.footageUrl || item.storageUrl) ? (
                            <button
                              onClick={() => { setViewerSubfolder(undefined); setFootageViewerItem(item); }}
                              className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-green-500/15 text-green-500 border border-green-500/30 hover:bg-green-500/25 transition-colors"
                            >
                              <Play className="w-3 h-3" />
                              View
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
                        </TableCell>
                        {/* File Submission */}
                        <TableCell>
                          {item.source === 'script' ? (
                            <span className="text-xs text-muted-foreground">—</span>
                          ) : item.fileSubmissionUrl ? (
                            <button
                              onClick={() => { setViewerSubfolder('submission'); setFootageViewerItem(item); }}
                              className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-green-500/15 text-green-500 border border-green-500/30 hover:bg-green-500/25 transition-colors"
                            >
                              <Play className="w-3 h-3" />
                              View
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
                        </TableCell>
                        {/* Script */}
                        <TableCell>
                          {item.scriptUrl ? (
                            <a href={item.scriptUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                              <ExternalLink className="w-3 h-3" />
                              {language === "en" ? "View" : "Ver"}
                            </a>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        {/* Schedule */}
                        <TableCell>
                          {item.source === 'script' ? (
                            <span className="text-xs text-muted-foreground">—</span>
                          ) : (
                            <Button
                              variant="ghost" size="sm"
                              className={`gap-1.5 text-xs ${item.scheduledDate ? "text-primary hover:text-primary/80" : "text-muted-foreground hover:text-primary"}`}
                              onClick={() => { setScheduleItem(item); setScheduleDate(item.scheduledDate || ""); }}
                            >
                              {item.scheduledDate ? (
                                <><Calendar className="w-3 h-3" />{item.scheduledDate}</>
                              ) : (
                                <><CalendarPlus className="w-3.5 h-3.5" />{language === "en" ? "Schedule" : "Programar"}</>
                              )}
                            </Button>
                          )}
                        </TableCell>
                        {/* Caption */}
                        <TableCell>
                          {inlineEdit?.itemId === item.id ? (
                            <textarea
                              autoFocus
                              className="text-xs border rounded px-1.5 py-0.5 w-full max-w-[160px] bg-background focus:outline-none focus:ring-1 focus:ring-primary/50 resize-none"
                              value={inlineEdit.value}
                              placeholder="Post caption..."
                              rows={2}
                              onChange={(e) => setInlineEdit({ ...inlineEdit, value: e.target.value })}
                              onBlur={handleSaveInline}
                              onKeyDown={(e) => { if (e.key === 'Escape') setInlineEdit(null); }}
                            />
                          ) : item.caption ? (
                            <button onClick={() => setInlineEdit({ itemId: item.id, value: item.caption || '' })} className="text-xs text-muted-foreground max-w-[120px] truncate block text-left hover:text-foreground transition-colors">
                              {item.caption}
                            </button>
                          ) : item.source !== 'script' ? (
                            <button onClick={() => setInlineEdit({ itemId: item.id, value: '' })} className="text-xs text-muted-foreground/50 hover:text-primary transition-colors border border-dashed border-muted-foreground/20 hover:border-primary/40 rounded px-1.5 py-0.5">Add caption</button>
                          ) : <span className="text-xs text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell>
                          {item.source !== 'script' && (
                            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10 p-1.5" onClick={() => setDeleteConfirmItem(item)}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
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
      </main>

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
        />
      )}

      {footageViewerItem && (
        <FootageViewerModal
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
          onComplete={() => { fetchQueue(); setFootageViewerItem(null); }}
        />
      )}
    </>
  );
}