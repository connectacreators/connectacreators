import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Play, ExternalLink, Download, ChevronDown, MessageSquare, Save, Clapperboard, Trash2, Calendar, CalendarPlus, HelpCircle, X, Share2, Pencil } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import UploadButton from '@/components/UploadButton';
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
  assigneeId: string | null;
  assigneePropName: string | null;
  revisions: string | null;
  revisionPropName: string | null;
  lastEdited: string;
  scheduledDate: string | null;
  clientId: string;
  clientName: string;
  source?: 'notion' | 'db' | 'script';
  caption?: string | null;
  script_id?: string | null;
  postStatus?: string | null;
  uploadSource?: string | null;
  storagePath?: string | null;
  storageUrl?: string | null;
}

const STATUS_OPTIONS = ["Not started", "In progress", "Needs Revision", "Done"];
const POST_STATUS_OPTIONS = ["Scheduled", "Needs Revision", "Approved", "Done"];

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

export default function MasterEditingQueue() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { language } = useLanguage();

  const [items, setItems] = useState<EditingQueueItem[]>([]);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedClient, setSelectedClient] = useState<string>("all");
  const [clientOptions, setClientOptions] = useState<{ id: string; name: string }[]>([]);

  const [selectedItem, setSelectedItem] = useState<EditingQueueItem | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);
  const [updatingAssignee, setUpdatingAssignee] = useState<string | null>(null);
  const [revisionDialogItem, setRevisionDialogItem] = useState<EditingQueueItem | null>(null);
  const [revisionText, setRevisionText] = useState("");
  const [savingRevision, setSavingRevision] = useState(false);
  const [deleteConfirmItem, setDeleteConfirmItem] = useState<EditingQueueItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [scheduleItem, setScheduleItem] = useState<EditingQueueItem | null>(null);
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduling, setScheduling] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [updatingPostStatus, setUpdatingPostStatus] = useState<string | null>(null);

  const [inlineEdit, setInlineEdit] = useState<{ itemId: string; field: 'footage' | 'fileSubmission' | 'caption'; value: string } | null>(null);
  const [savingInline, setSavingInline] = useState(false);

  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [reviewItem, setReviewItem] = useState<EditingQueueItem | null>(null);
  const [unresolvedCounts, setUnresolvedCounts] = useState<Record<string, number>>({});

  const handleSaveInline = async () => {
    if (!inlineEdit) return;
    setSavingInline(true);
    const dbField = inlineEdit.field === 'footage' ? 'footage' : inlineEdit.field === 'fileSubmission' ? 'file_submission' : 'caption';
    const stateField = inlineEdit.field === 'footage' ? 'footageUrl' : inlineEdit.field === 'fileSubmission' ? 'fileSubmissionUrl' : 'caption';
    try {
      const { error } = await supabase.from("video_edits").update({
        [dbField]: inlineEdit.value || null,
      }).eq("id", inlineEdit.itemId);
      if (error) throw error;
      setItems((prev) => prev.map((i) => i.id === inlineEdit.itemId ? { ...i, [stateField]: inlineEdit.value || null } : i));
      setInlineEdit(null);
    } catch { toast.error("Failed to save"); }
    finally { setSavingInline(false); }
  };

  // Multi-select
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const fetchQueue = async () => {
    if (!user) return;
    setFetching(true);
    setError(null);
    try {
      // Fetch client IDs based on role:
      // - Admins can read client_notion_mapping directly
      // - Videographers get assigned clients
      // - Users get owned clients
      let clientIds: string[] = [];

      // Try admin path first (client_notion_mapping)
      const { data: mappings } = await supabase
        .from("client_notion_mapping")
        .select("client_id");

      if (mappings && mappings.length > 0) {
        clientIds = mappings.map((m) => m.client_id);
      } else {
        // Videographer: get assigned clients
        const { data: assignments } = await supabase
          .from("videographer_clients")
          .select("client_id")
          .eq("videographer_user_id", user.id);

        if (assignments && assignments.length > 0) {
          clientIds = assignments.map((a) => a.client_id);
        } else {
          // User: get owned clients
          const { data: ownedClients } = await supabase
            .from("clients")
            .select("id")
            .eq("owner_user_id", user.id);

          if (ownedClients && ownedClients.length > 0) {
            clientIds = ownedClients.map((c) => c.id);
          }
        }
      }

      if (clientIds.length === 0) {
        setItems([]);
        setFetching(false);
        return;
      }

      const { data: dbVideos, error: dbErr } = await supabase
        .from("video_edits")
        .select("id, reel_title, status, post_status, file_submission, script_url, assignee, revisions, created_at, footage, schedule_date, client_id, caption, clients(name)")
        .in("client_id", clientIds)
        .order("created_at", { ascending: false });

      if (dbErr) throw dbErr;

      const allItems: EditingQueueItem[] = (dbVideos || []).map((v: any) => ({
        id: v.id,
        title: v.reel_title || "Untitled",
        status: v.status || "Not started",
        statusColor: "",
        fileSubmissionUrl: v.file_submission,
        footageUrl: v.footage || null,
        scriptUrl: v.script_url || null,
        assignee: v.assignee || null,
        assigneeId: null,
        assigneePropName: null,
        revisions: v.revisions || null,
        revisionPropName: null,
        lastEdited: v.created_at,
        scheduledDate: v.schedule_date || null,
        clientId: v.client_id,
        clientName: v.clients?.name || v.client_id,
        caption: v.caption ?? null,
        postStatus: v.post_status ?? null,
        uploadSource: v.upload_source || null,
        storagePath: v.storage_path || null,
        storageUrl: v.storage_url || null,
        source: 'db' as const,
      }));

      setItems(allItems);

      const clientMap = new Map<string, string>();
      allItems.forEach((item) => {
        if (!clientMap.has(item.clientId)) {
          clientMap.set(item.clientId, item.clientName);
        }
      });
      setClientOptions(
        Array.from(clientMap.entries()).map(([id, name]) => ({ id, name }))
      );
    } catch (e: any) {
      console.error("Error fetching master editing queue:", e);
      setError(e.message || "Failed to fetch editing queue");
    } finally {
      setFetching(false);
    }
  };

  useEffect(() => {
    fetchQueue();
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

  const filteredItems = selectedClient === "all"
    ? items
    : items.filter((item) => item.clientId === selectedClient);

  const handleStatusChange = async (pageId: string, newStatus: string) => {
    setUpdatingStatus(pageId);
    try {
      const res = await supabase.functions.invoke("update-editing-status", {
        body: { id: pageId, status: newStatus },
      });
      if (res.error) throw res.error;
      setItems((prev) =>
        prev.map((item) => (item.id === pageId ? { ...item, status: newStatus } : item))
      );
      setSelectedItem((prev) =>
        prev && prev.id === pageId ? { ...prev, status: newStatus } : prev
      );
      toast.success(language === "en" ? "Status updated" : "Estado actualizado");
    } catch (e: any) {
      console.error("Error updating status:", e);
      toast.error(language === "en" ? "Failed to update status" : "Error al actualizar estado");
    } finally {
      setUpdatingStatus(null);
    }
  };

  const handleAssigneeChange = async (pageId: string, userName: string | null) => {
    setUpdatingAssignee(pageId);
    try {
      const res = await supabase.functions.invoke("update-editing-status", {
        body: { id: pageId, assignee: userName ?? "" },
      });
      if (res.error) throw res.error;
      setItems((prev) =>
        prev.map((item) => (item.id === pageId ? { ...item, assignee: userName } : item))
      );
      setSelectedItem((prev) =>
        prev && prev.id === pageId ? { ...prev, assignee: userName } : prev
      );
      toast.success(language === "en" ? "Assignee updated" : "Asignado actualizado");
    } catch (e: any) {
      console.error("Error updating assignee:", e);
      toast.error(language === "en" ? "Failed to update assignee" : "Error al actualizar asignado");
    } finally {
      setUpdatingAssignee(null);
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
      const res = await supabase.functions.invoke("update-editing-status", {
        body: { id: revisionDialogItem.id, revisions: revisionText },
      });
      if (res.error) throw res.error;
      setItems((prev) =>
        prev.map((item) => (item.id === revisionDialogItem.id ? { ...item, revisions: revisionText } : item))
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

  const handlePostStatusChange = async (itemId: string, newStatus: string) => {
    setUpdatingPostStatus(itemId);
    try {
      const { error } = await supabase.from("video_edits").update({ post_status: newStatus }).eq("id", itemId);
      if (error) throw error;
      setItems((prev) => prev.map((i) => i.id === itemId ? { ...i, postStatus: newStatus } : i));
      toast.success(language === "en" ? "Post status updated" : "Estado de post actualizado");
    } catch (e: any) {
      console.error("Error updating post status:", e);
      toast.error(language === "en" ? "Failed to update post status" : "Error al actualizar estado");
    } finally {
      setUpdatingPostStatus(null);
    }
  };

  const handleDeleteItem = async () => {
    if (!deleteConfirmItem) return;
    setDeleting(true);
    try {
      const { error } = await supabase
        .from("video_edits")
        .delete()
        .eq("id", deleteConfirmItem.id);
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

  const handleSchedulePost = async () => {
    if (!scheduleItem || !scheduleDate) return;
    setScheduling(true);
    try {
      const { error } = await supabase
        .from("video_edits")
        .update({ schedule_date: scheduleDate })
        .eq("id", scheduleItem.id);
      if (error) throw error;
      toast.success(
        language === "en"
          ? `"${scheduleItem.title}" scheduled for ${scheduleDate}`
          : `"${scheduleItem.title}" programado para ${scheduleDate}`
      );
      setItems((prev) =>
        prev.map((item) => item.id === scheduleItem.id ? { ...item, scheduledDate: scheduleDate } : item)
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

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setBulkDeleting(true);
    try {
      const ids = Array.from(selectedIds);
      const { error } = await supabase.from("video_edits").delete().in("id", ids);
      if (error) throw error;
      const count = ids.length;
      setItems(prev => prev.filter(i => !selectedIds.has(i.id)));
      setSelectedIds(new Set());
      toast.success(language === "en" ? `${count} items deleted` : `${count} elementos eliminados`);
    } catch (e: any) {
      toast.error(language === "en" ? "Failed to delete items" : "Error al eliminar elementos");
    } finally {
      setBulkDeleting(false);
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

  const renderAssigneeInput = (item: EditingQueueItem) => {
    return (
      <div className="inline-flex items-center gap-1 min-w-[80px]">
        {updatingAssignee === item.id ? (
          <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
        ) : (
          <input
            type="text"
            defaultValue={item.assignee || ""}
            placeholder={language === "en" ? "Unassigned" : "Sin asignar"}
            className="text-xs bg-transparent border-none outline-none text-foreground w-full"
            onBlur={(e) => {
              const val = e.target.value.trim();
              if (val !== (item.assignee || "")) {
                handleAssigneeChange(item.id, val || null);
              }
            }}
          />
        )}
      </div>
    );
  };

  return (

    <>
      <main className="flex-1 flex flex-col min-h-screen">

        <div className="flex-1 px-4 sm:px-8 py-8 max-w-6xl mx-auto w-full">
          <motion.div
            className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <div className="flex items-center gap-3">
              <Clapperboard className="w-5 h-5 text-primary" />
              <h1 className="text-xl sm:text-2xl font-bold text-foreground tracking-tight">
                Editing Queue
              </h1>
            </div>

            <div className="flex items-center gap-2">
              {clientOptions.length > 1 && (
                <Select value={selectedClient} onValueChange={setSelectedClient}>
                  <SelectTrigger className="w-[200px] h-9 text-xs">
                    <SelectValue placeholder={language === "en" ? "All Clients" : "Todos los clientes"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{language === "en" ? "All Clients" : "Todos los clientes"}</SelectItem>
                    {clientOptions.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {/* Share button */}
              <button
                onClick={() => {
                  navigator.clipboard.writeText("https://connectacreators.com/public/edit-queue/all");
                  toast.success("Link copied to clipboard");
                }}
                className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg backdrop-blur-sm bg-white/10 border border-white/20 text-muted-foreground hover:text-foreground hover:bg-white/20 transition-all"
              >
                <Share2 className="w-3.5 h-3.5" />
                Share
              </button>

              {/* Help button */}
              <div className="relative">
                <button
                  onClick={() => setHelpOpen((v) => !v)}
                  className="w-7 h-7 rounded-full flex items-center justify-center backdrop-blur-sm bg-white/10 border border-white/20 text-muted-foreground hover:text-foreground hover:bg-white/20 transition-all"
                  aria-label="Help"
                >
                  <HelpCircle className="w-3.5 h-3.5" />
                </button>

                {helpOpen && (
                  <div className="absolute right-0 top-9 z-50 w-72 rounded-xl border border-white/20 bg-background/70 backdrop-blur-md shadow-xl p-4">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <HelpCircle className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                      <p className="text-xs text-foreground/90 leading-relaxed flex-1">
                        All scripts will appear in the edit queue. If you want to add a line, create a script and make sure all the columns are filled out first.
                      </p>
                      <button
                        onClick={() => setHelpOpen(false)}
                        className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </motion.div>

          {fetching ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="text-center py-20 text-muted-foreground text-sm">{error}</div>
          ) : filteredItems.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground text-sm">
              {language === "en" ? "No items in the editing queue" : "No hay elementos en la cola de edición"}
            </div>
          ) : (
            <motion.div
              className="rounded-xl border border-border/50 bg-card/30 overflow-hidden glass-card"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.1 }}
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40px] pr-0">
                      <input
                        type="checkbox"
                        className="checkbox-clean"
                        checked={filteredItems.length > 0 && filteredItems.every(i => selectedIds.has(i.id))}
                        onChange={(e) => setSelectedIds(e.target.checked ? new Set(filteredItems.map(i => i.id)) : new Set())}
                      />
                    </TableHead>
                    <TableHead>{language === "en" ? "Client" : "Cliente"}</TableHead>
                    <TableHead>{language === "en" ? "Title" : "Título"}</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Post Status</TableHead>
                    <TableHead>{language === "en" ? "Assignee" : "Asignado"}</TableHead>
                    <TableHead>{language === "en" ? "Revisions" : "Revisiones"}</TableHead>
                    <TableHead>Reviews</TableHead>
                    <TableHead>Footage</TableHead>
                    <TableHead className="text-center">File Submission</TableHead>
                    <TableHead>Script</TableHead>
                    <TableHead>Schedule</TableHead>
                    <TableHead>Caption</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredItems.map((item) => {
                    const hasDriveVideo = item.fileSubmissionUrl
                      ? !!extractGoogleDriveFileId(item.fileSubmissionUrl)
                      : false;

                    return (
                      <TableRow key={item.id} className="group">
                        <TableCell className="w-[40px] pr-0" onClick={(e) => e.stopPropagation()}>
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
                        </TableCell>
                        <TableCell>
                          <button
                            onClick={() => navigate(`/clients/${item.clientId}`)}
                            className="text-xs text-primary hover:underline font-medium"
                          >
                            {item.clientName}
                          </button>
                        </TableCell>
                        <TableCell className="font-medium text-foreground">{item.title}</TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button className="inline-flex items-center gap-1 focus:outline-none" disabled={updatingStatus === item.id}>
                                {updatingStatus === item.id ? (
                                  <span className="badge-neutral cursor-pointer inline-flex items-center gap-1">
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 cursor-pointer">
                                    <StatusBadge status={item.status} />
                                    <ChevronDown className="w-3 h-3 opacity-60" />
                                  </span>
                                )}
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
                        </TableCell>
                        <TableCell>
                          {item.source !== 'script' ? (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button className="inline-flex items-center gap-1 focus:outline-none" disabled={updatingPostStatus === item.id}>
                                  <Badge variant="outline" className="cursor-pointer text-xs">
                                    {updatingPostStatus === item.id ? (
                                      <Loader2 className="w-3 h-3 animate-spin" />
                                    ) : (
                                      <>
                                        {item.postStatus || "—"}
                                        <ChevronDown className="w-3 h-3 ml-1 opacity-60" />
                                      </>
                                    )}
                                  </Badge>
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="start" className="bg-popover border border-border z-50">
                                {POST_STATUS_OPTIONS.map((s) => (
                                  <DropdownMenuItem
                                    key={s}
                                    onClick={() => handlePostStatusChange(item.id, s)}
                                    className={item.postStatus === s ? "font-bold" : ""}
                                  >
                                    {s}
                                  </DropdownMenuItem>
                                ))}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>{renderAssigneeInput(item)}</TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm" className="gap-1.5 text-xs" onClick={() => handleOpenRevisions(item)}>
                            <MessageSquare className="w-3.5 h-3.5" />
                            {item.revisions ? (
                              <span className="max-w-[120px] truncate">{item.revisions}</span>
                            ) : (
                              <span className="text-muted-foreground">{language === "en" ? "Add" : "Agregar"}</span>
                            )}
                          </Button>
                        </TableCell>
                        {/* Reviews */}
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {unresolvedCounts[item.id] > 0 ? (
                              <span className="text-xs bg-destructive text-destructive-foreground px-1.5 py-0.5 rounded-full">
                                {unresolvedCounts[item.id]} open
                              </span>
                            ) : unresolvedCounts[item.id] === 0 && Object.keys(unresolvedCounts).length > 0 ? (
                              <span className="text-xs bg-green-500/20 text-green-500 px-1.5 py-0.5 rounded-full">
                                All resolved
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 text-xs px-2"
                              onClick={() => { setReviewItem(item); setReviewModalOpen(true); }}
                            >
                              Review ▶
                            </Button>
                          </div>
                        </TableCell>
                        {/* Footage column */}
                        <TableCell>
                          {inlineEdit?.itemId === item.id && inlineEdit.field === 'footage' ? (
                            <input
                              autoFocus
                              className="text-xs border rounded px-1.5 py-0.5 w-full max-w-[140px] bg-background focus:outline-none focus:ring-1 focus:ring-primary/50"
                              value={inlineEdit.value}
                              placeholder="https://..."
                              onChange={(e) => setInlineEdit({ ...inlineEdit, value: e.target.value })}
                              onBlur={handleSaveInline}
                              onKeyDown={(e) => { if (e.key === 'Enter') handleSaveInline(); if (e.key === 'Escape') setInlineEdit(null); }}
                            />
                          ) : item.footageUrl ? (
                            <a href={item.footageUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                              <ExternalLink className="w-3 h-3" />Footage
                            </a>
                          ) : (
                            <div className="flex items-center gap-1">
                              <UploadButton
                                videoEditId={item.id}
                                clientId={item.clientId}
                                onUploadComplete={() => fetchQueue()}
                              />
                              <button onClick={() => setInlineEdit({ itemId: item.id, field: 'footage', value: '' })} className="text-xs text-muted-foreground/50 hover:text-primary transition-colors border border-dashed border-muted-foreground/20 hover:border-primary/40 rounded px-1.5 py-0.5">Add link</button>
                            </div>
                          )}
                        </TableCell>
                        {/* File Submission column */}
                        <TableCell className="text-center">
                          {inlineEdit?.itemId === item.id && inlineEdit.field === 'fileSubmission' ? (
                            <input
                              autoFocus
                              className="text-xs border rounded px-1.5 py-0.5 w-full max-w-[140px] bg-background focus:outline-none focus:ring-1 focus:ring-primary/50"
                              value={inlineEdit.value}
                              placeholder="https://drive.google.com/..."
                              onChange={(e) => setInlineEdit({ ...inlineEdit, value: e.target.value })}
                              onBlur={handleSaveInline}
                              onKeyDown={(e) => { if (e.key === 'Enter') handleSaveInline(); if (e.key === 'Escape') setInlineEdit(null); }}
                            />
                          ) : hasDriveVideo ? (
                            <Button variant="ghost" size="sm" className="gap-1.5 text-xs" onClick={() => setSelectedItem(item)}><Play className="w-3.5 h-3.5" />{language === "en" ? "Play" : "Ver"}</Button>
                          ) : item.fileSubmissionUrl ? (
                            <a href={item.fileSubmissionUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline"><ExternalLink className="w-3 h-3" />Link</a>
                          ) : (
                            <button onClick={() => setInlineEdit({ itemId: item.id, field: 'fileSubmission', value: '' })} className="text-xs text-muted-foreground/50 hover:text-primary transition-colors border border-dashed border-muted-foreground/20 hover:border-primary/40 rounded px-1.5 py-0.5">Add link</button>
                          )}
                        </TableCell>
                        <TableCell>
                          {item.scriptUrl ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="gap-1.5 text-xs text-primary hover:underline"
                              onClick={() => navigate(`/clients/${item.clientId}/scripts?scriptTitle=${encodeURIComponent(item.title)}`)}
                            >
                              <ExternalLink className="w-3 h-3" />
                              {language === "en" ? "View" : "Ver"}
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            className={`gap-1.5 text-xs ${item.scheduledDate ? "text-primary hover:text-primary/80" : "text-muted-foreground hover:text-primary"}`}
                            onClick={() => { setScheduleItem(item); setScheduleDate(item.scheduledDate || ""); }}
                          >
                            {item.scheduledDate ? (
                              <><Calendar className="w-3 h-3" />{item.scheduledDate}</>
                            ) : (
                              <><CalendarPlus className="w-3.5 h-3.5" />{language === "en" ? "Schedule" : "Programar"}</>
                            )}
                          </Button>
                        </TableCell>
                        <TableCell className="max-w-[180px]">
                          {inlineEdit?.itemId === item.id && inlineEdit.field === 'caption' ? (
                            <textarea
                              autoFocus
                              className="text-xs border rounded px-1.5 py-0.5 w-full bg-background focus:outline-none focus:ring-1 focus:ring-primary/50 resize-none"
                              value={inlineEdit.value}
                              placeholder="Post caption..."
                              rows={2}
                              onChange={(e) => setInlineEdit({ ...inlineEdit, value: e.target.value })}
                              onBlur={handleSaveInline}
                              onKeyDown={(e) => { if (e.key === 'Escape') setInlineEdit(null); }}
                            />
                          ) : item.caption ? (
                            <button onClick={() => setInlineEdit({ itemId: item.id, field: 'caption', value: item.caption || '' })} className="text-xs text-muted-foreground line-clamp-2 leading-relaxed text-left hover:text-foreground transition-colors w-full">
                              {item.caption}
                            </button>
                          ) : (
                            <button onClick={() => setInlineEdit({ itemId: item.id, field: 'caption', value: '' })} className="text-xs text-muted-foreground/50 hover:text-primary transition-colors border border-dashed border-muted-foreground/20 hover:border-primary/40 rounded px-1.5 py-0.5">Add caption</button>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10 p-1.5" onClick={() => setDeleteConfirmItem(item)}><Trash2 className="w-3.5 h-3.5" /></Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
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
              {selectedItem && (
                <StatusBadge status={selectedItem.status} />
              )}
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
                  <a href={getGoogleDriveDownloadUrl(selectedDriveId)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline">
                    <Download className="w-3.5 h-3.5" />
                    {language === "en" ? "Download Video" : "Descargar Video"}
                  </a>
                  {selectedItem?.scriptUrl && (
                    <a href={selectedItem.scriptUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                      <ExternalLink className="w-3 h-3" />
                      {language === "en" ? "View Script" : "Ver Guión"}
                    </a>
                  )}
                </div>
              </>
            ) : selectedItem?.fileSubmissionUrl ? (
              <div className="text-center py-10">
                <a href={selectedItem.fileSubmissionUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                  {language === "en" ? "Open file link" : "Abrir enlace del archivo"}
                </a>
              </div>
            ) : null}

            {selectedItem && (
              <div className="mt-4 flex flex-wrap items-center gap-4 pt-3 border-t border-border/50">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{language === "en" ? "Status:" : "Estado:"}</span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="inline-flex items-center gap-1 focus:outline-none" disabled={updatingStatus === selectedItem.id}>
                        {updatingStatus === selectedItem.id ? (
                          <span className="badge-neutral cursor-pointer inline-flex items-center gap-1">
                            <Loader2 className="w-3 h-3 animate-spin" />
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 cursor-pointer">
                            <StatusBadge status={selectedItem.status} />
                            <ChevronDown className="w-3 h-3 opacity-60" />
                          </span>
                        )}
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="bg-popover border border-border z-50">
                      {STATUS_OPTIONS.map((s) => (
                        <DropdownMenuItem key={s} onClick={() => handleStatusChange(selectedItem.id, s)} className={selectedItem.status === s ? "font-bold" : ""}>
                          <span className={`inline-block w-2 h-2 rounded-full mr-2 ${getStatusDotColor(s)}`} />
                          {s}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{language === "en" ? "Assignee:" : "Asignado:"}</span>
                  {renderAssigneeInput(selectedItem)}
                </div>
                <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => handleOpenRevisions(selectedItem)}>
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

      {/* Schedule Post Dialog */}
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
              {scheduleItem?.title} — {scheduleItem?.clientName}
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
                ? "This will add the post to the Content Calendar."
                : "Esto añadirá el post al Calendario de Contenido."}
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
              className="gap-1.5"
            >
              {scheduling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CalendarPlus className="w-3.5 h-3.5" />}
              {language === "en" ? "Schedule" : "Programar"}
            </Button>
          </DialogFooter>
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
                ? `Are you sure you want to delete "${deleteConfirmItem?.title}"? This action cannot be undone.`
                : `¿Estás seguro de que quieres eliminar "${deleteConfirmItem?.title}"? Esta acción no se puede deshacer.`}
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

      {reviewItem && (
        <VideoReviewModal
          open={reviewModalOpen}
          onClose={() => { setReviewModalOpen(false); setReviewItem(null); }}
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
    </>
  );
}
