import { useEffect, useState } from "react";
import PageTransition from "@/components/PageTransition";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Play, ExternalLink, Download, ChevronDown, MessageSquare, Save, Clapperboard, Trash2, Calendar, CalendarPlus, HelpCircle, X, Share2, Pencil, RotateCcw } from "lucide-react";
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
  deleted_at?: string | null;
}

const STATUS_OPTIONS = ["Not started", "In progress", "Needs Revision", "Done"];
const POST_STATUS_OPTIONS = ["Unpublished", "Scheduled", "Needs Revision", "Published"];

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
  if (lower === "done" || lower === "complete" || lower === "published") return "bg-emerald-400";
  if (lower.includes("revision")) return "bg-destructive";
  if (lower.includes("progress")) return "bg-amber-400";
  if (lower === "scheduled") return "bg-primary";
  return "bg-muted-foreground";
}

export default function MasterEditingQueue() {
  const { user, loading, isAdmin, isEditor, isVideographer } = useAuth();
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

  const [inlineEdit, setInlineEdit] = useState<{ itemId: string; value: string } | null>(null);
  const [savingInline, setSavingInline] = useState(false);
  const [editingTitle, setEditingTitle] = useState<{ itemId: string; value: string } | null>(null);
  const [footageViewerItem, setFootageViewerItem] = useState<EditingQueueItem | null>(null);
  const [viewerSubfolder, setViewerSubfolder] = useState<string | undefined>(undefined);

  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [reviewItem, setReviewItem] = useState<EditingQueueItem | null>(null);
  const [unresolvedCounts, setUnresolvedCounts] = useState<Record<string, number>>({});
  const [teamMembers, setTeamMembers] = useState<{ user_id: string; display_name: string }[]>([]);

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
    } catch { toast.error("Failed to save"); }
    finally { setSavingInline(false); }
  };

  const handleSaveTitle = async () => {
    if (!editingTitle) return;
    const newTitle = editingTitle.value.trim() || "Untitled";
    const item = items.find(i => i.id === editingTitle.itemId);
    try {
      const { error } = await supabase.from("video_edits").update({ reel_title: newTitle }).eq("id", editingTitle.itemId);
      if (error) throw error;
      // Sync to scripts table if linked
      if (item?.script_id) {
        await supabase.from("scripts").update({ title: newTitle, idea_ganadora: newTitle }).eq("id", item.script_id);
      }
      setItems(prev => prev.map(i => i.id === editingTitle.itemId ? { ...i, title: newTitle } : i));
      setEditingTitle(null);
    } catch { toast.error("Failed to save title"); setEditingTitle(null); }
  };

  // Trash
  const [showTrash, setShowTrash] = useState(false);
  const [trashedItems, setTrashedItems] = useState<EditingQueueItem[]>([]);
  const [fetchingTrash, setFetchingTrash] = useState(false);

  // Multi-select
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const fetchQueue = async () => {
    if (!user) return;
    setFetching(true);
    setError(null);
    try {
      // Fetch client IDs based on role
      let clientIds: string[] = [];

      if (isAdmin) {
        // Admins see ALL clients
        const { data: allClients } = await supabase
          .from("clients")
          .select("id");
        if (allClients) clientIds = allClients.map((c) => c.id);
      } else if (isEditor || isVideographer) {
        // Editors & videographers see assigned clients
        const { data: assignments } = await supabase
          .from("videographer_clients")
          .select("client_id")
          .eq("videographer_user_id", user.id);
        if (assignments) clientIds = assignments.map((a) => a.client_id);
      } else {
        // Regular users see owned clients
        const { data: ownedClients } = await supabase
          .from("clients")
          .select("id")
          .eq("user_id", user.id);
        if (ownedClients) clientIds = ownedClients.map((c) => c.id);
      }

      if (clientIds.length === 0) {
        setItems([]);
        setFetching(false);
        return;
      }

      const { data: dbVideos, error: dbErr } = await supabase
        .from("video_edits")
        .select("id, reel_title, status, post_status, file_submission, script_url, assignee, assignee_user_id, revisions, created_at, footage, schedule_date, client_id, caption, upload_source, storage_path, storage_url, deleted_at, script_id, clients(name)")
        .in("client_id", clientIds)
        .is("deleted_at", null)
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
        assignee_user_id: v.assignee_user_id || null,
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
        script_id: v.script_id || null,
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

  const handleAssigneeChange = async (pageId: string, userId: string | null) => {
    setUpdatingAssignee(pageId);
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
      setItems((prev) =>
        prev.map((item) =>
          item.id === pageId
            ? { ...item, assignee: displayName || null, assignee_user_id: userId }
            : item
        )
      );
      setSelectedItem((prev) =>
        prev && prev.id === pageId
          ? { ...prev, assignee: displayName || null, assignee_user_id: userId }
          : prev
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
    const now = new Date().toISOString();
    try {
      const { error } = await supabase
        .from("video_edits")
        .update({ deleted_at: now })
        .eq("id", deleteConfirmItem.id);
      if (error) throw error;
      // Also trash the linked script
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
    const now = new Date().toISOString();
    try {
      const ids = Array.from(selectedIds);
      const { error } = await supabase.from("video_edits").update({ deleted_at: now }).in("id", ids);
      if (error) throw error;
      // Also trash linked scripts
      const scriptIds = items.filter(i => selectedIds.has(i.id) && i.script_id).map(i => i.script_id!);
      if (scriptIds.length > 0) {
        await supabase.from("scripts").update({ deleted_at: now }).in("id", scriptIds);
      }
      const count = ids.length;
      setItems(prev => prev.filter(i => !selectedIds.has(i.id)));
      setSelectedIds(new Set());
      toast.success(language === "en" ? `${count} items moved to trash` : `${count} elementos movidos a papelera`);
    } catch (e: any) {
      toast.error(language === "en" ? "Failed to delete items" : "Error al eliminar elementos");
    } finally {
      setBulkDeleting(false);
    }
  };

  const fetchTrashedItems = async () => {
    if (!user) return;
    setFetchingTrash(true);
    try {
      const { data, error } = await supabase
        .from("video_edits")
        .select("id, reel_title, status, client_id, deleted_at, created_at, script_id, clients(name)")
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false });
      if (error) throw error;
      setTrashedItems((data || []).map((v: any) => ({
        id: v.id,
        title: v.reel_title || "Untitled",
        status: v.status || "Not started",
        statusColor: "",
        fileSubmissionUrl: null,
        footageUrl: null,
        scriptUrl: null,
        assignee: null,
        assignee_user_id: null,
        assigneeId: null,
        assigneePropName: null,
        revisions: null,
        revisionPropName: null,
        lastEdited: v.created_at,
        scheduledDate: null,
        clientId: v.client_id,
        clientName: v.clients?.name || v.client_id,
        script_id: v.script_id || null,
        source: 'db' as const,
        deleted_at: v.deleted_at,
      })));
    } catch (e: any) {
      toast.error("Failed to fetch trash");
    } finally {
      setFetchingTrash(false);
    }
  };

  const handleRestoreItem = async (itemId: string) => {
    try {
      const item = trashedItems.find(i => i.id === itemId);
      const { error } = await supabase.from("video_edits").update({ deleted_at: null }).eq("id", itemId);
      if (error) throw error;
      // Also restore the linked script
      if (item?.script_id) {
        await supabase.from("scripts").update({ deleted_at: null }).eq("id", item.script_id);
      }
      setTrashedItems(prev => prev.filter(i => i.id !== itemId));
      toast.success(language === "en" ? "Item restored" : "Elemento restaurado");
      fetchQueue();
    } catch {
      toast.error(language === "en" ? "Failed to restore" : "Error al restaurar");
    }
  };

  const handlePermanentDelete = async (itemId: string) => {
    if (!window.confirm(language === "en" ? "Permanently delete this item? This cannot be undone." : "¿Eliminar permanentemente? No se puede deshacer.")) return;
    try {
      const item = trashedItems.find(i => i.id === itemId);
      const { error } = await supabase.from("video_edits").delete().eq("id", itemId);
      if (error) throw error;
      // Also permanently delete the linked script
      if (item?.script_id) {
        await supabase.from("scripts").delete().eq("id", item.script_id);
      }
      setTrashedItems(prev => prev.filter(i => i.id !== itemId));
      toast.success(language === "en" ? "Permanently deleted" : "Eliminado permanentemente");
    } catch {
      toast.error(language === "en" ? "Failed to delete" : "Error al eliminar");
    }
  };

  const [deletingFootage, setDeletingFootage] = useState<string | null>(null);
  const [deletingSubmission, setDeletingSubmission] = useState<string | null>(null);

  const handleDeleteFootage = async (item: EditingQueueItem) => {
    if (!window.confirm(language === "en" ? "Delete this footage? This will also remove the file from storage." : "¿Eliminar este metraje? También se eliminará el archivo del almacenamiento.")) return;
    setDeletingFootage(item.id);
    try {
      // Delete from Supabase Storage if it's a storage path (not a URL)
      if (item.storagePath && !item.storagePath.includes('/submission/')) {
        await supabase.storage.from('footage').remove([item.storagePath]);
      }
      const update: Record<string, any> = {
        footage: null,
        upload_source: null,
        file_size_bytes: null,
        file_expires_at: null,
        record_expires_at: null,
      };
      // Only clear storage_path/url if they don't point to a submission
      if (!item.storagePath?.includes('/submission/')) {
        update.storage_path = null;
        update.storage_url = null;
      }
      const { error } = await supabase.from('video_edits').update(update).eq('id', item.id);
      if (error) throw error;
      setItems(prev => prev.map(i => i.id === item.id ? {
        ...i,
        footageUrl: null,
        storagePath: item.storagePath?.includes('/submission/') ? item.storagePath : null,
        storageUrl: item.storagePath?.includes('/submission/') ? item.storageUrl : null,
        uploadSource: item.storagePath?.includes('/submission/') ? item.uploadSource : null,
      } : i));
      toast.success(language === "en" ? "Footage deleted" : "Metraje eliminado");
    } catch (err: any) {
      toast.error(language === "en" ? `Failed to delete footage: ${err.message}` : `Error al eliminar metraje: ${err.message}`);
    } finally {
      setDeletingFootage(null);
    }
  };

  const handleDeleteFileSubmission = async (item: EditingQueueItem) => {
    if (!window.confirm(language === "en" ? "Delete this file submission? This will also remove the file from storage." : "¿Eliminar esta entrega? También se eliminará el archivo del almacenamiento.")) return;
    setDeletingSubmission(item.id);
    try {
      // Delete from Supabase Storage if it's a storage path (not a Google Drive URL)
      if (item.fileSubmissionUrl && !item.fileSubmissionUrl.startsWith('http')) {
        await supabase.storage.from('footage').remove([item.fileSubmissionUrl]);
      }
      const update: Record<string, any> = { file_submission: null };
      // If storage_path points to the submission, clear those too
      if (item.storagePath && item.storagePath === item.fileSubmissionUrl) {
        update.storage_path = null;
        update.storage_url = null;
        update.upload_source = null;
        update.file_size_bytes = null;
        update.file_expires_at = null;
        update.record_expires_at = null;
      }
      const { error } = await supabase.from('video_edits').update(update).eq('id', item.id);
      if (error) throw error;
      setItems(prev => prev.map(i => i.id === item.id ? {
        ...i,
        fileSubmissionUrl: null,
        storagePath: item.storagePath === item.fileSubmissionUrl ? null : item.storagePath,
        storageUrl: item.storagePath === item.fileSubmissionUrl ? null : item.storageUrl,
        uploadSource: item.storagePath === item.fileSubmissionUrl ? null : item.uploadSource,
      } : i));
      toast.success(language === "en" ? "File submission deleted" : "Entrega eliminada");
    } catch (err: any) {
      toast.error(language === "en" ? `Failed to delete: ${err.message}` : `Error al eliminar: ${err.message}`);
    } finally {
      setDeletingSubmission(null);
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
    if (updatingAssignee === item.id) {
      return <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />;
    }
    // Fallback: if item has a legacy text assignee but no UUID yet, show it as placeholder
    const hasLegacyAssignee = !item.assignee_user_id && item.assignee;
    return (
      <Select
        value={item.assignee_user_id || "__none__"}
        onValueChange={(val) => handleAssigneeChange(item.id, val === "__none__" ? null : val)}
      >
        <SelectTrigger className="h-7 text-xs min-w-[120px] bg-transparent border-none shadow-none px-1">
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
    );
  };

  return (

    <>
      <PageTransition className="flex-1 flex flex-col min-h-screen">

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

              {/* Trash toggle */}
              <button
                onClick={() => {
                  if (!showTrash) fetchTrashedItems();
                  setShowTrash(!showTrash);
                }}
                className={`inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg backdrop-blur-sm border transition-all ${
                  showTrash
                    ? "bg-destructive/15 border-destructive/30 text-destructive"
                    : "bg-white/10 border-white/20 text-muted-foreground hover:text-foreground hover:bg-white/20"
                }`}
              >
                <Trash2 className="w-3.5 h-3.5" />
                {language === "en" ? "Trash" : "Papelera"}
              </button>

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

          {showTrash ? (
            /* ===== TRASH VIEW ===== */
            <motion.div
              className="rounded-xl border border-border/50 bg-card/30 overflow-hidden glass-card"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.1 }}
            >
              <div className="px-4 py-3 border-b border-border/50">
                <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
                  <Trash2 className="w-4 h-4" />
                  {language === "en" ? "Items are automatically deleted after 90 days in trash" : "Los elementos se eliminan automáticamente después de 90 días en la papelera"}
                </h3>
              </div>
              {fetchingTrash ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : trashedItems.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground text-sm">
                  {language === "en" ? "Trash is empty" : "La papelera está vacía"}
                </div>
              ) : (
                <div className="divide-y divide-border/30">
                  {trashedItems.map((item) => {
                    const deletedDate = item.deleted_at ? new Date(item.deleted_at) : new Date();
                    const daysLeft = Math.max(0, 90 - Math.floor((Date.now() - deletedDate.getTime()) / (1000 * 60 * 60 * 24)));
                    return (
                      <div key={item.id} className="flex items-center gap-3 px-4 py-3 opacity-70 hover:opacity-90 transition-opacity">
                        <Clapperboard className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-muted-foreground truncate line-through">{item.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {item.clientName} · {language === "en" ? "Deleted" : "Eliminado"} {deletedDate.toLocaleDateString(language === "en" ? "en-US" : "es-MX")} · {daysLeft} {language === "en" ? "days left" : "días restantes"}
                          </p>
                        </div>
                        <div className="flex gap-1 flex-shrink-0">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRestoreItem(item.id)}
                            title={language === "en" ? "Restore" : "Restaurar"}
                            className="h-8 w-8 p-0 text-emerald-500 hover:text-emerald-400"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                          </Button>
                          {isAdmin && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handlePermanentDelete(item.id)}
                              title={language === "en" ? "Delete permanently" : "Eliminar permanentemente"}
                              className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </motion.div>
          ) : fetching ? (
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
              className="rounded-xl border border-border/50 bg-card/30 overflow-hidden glass-card eq-table-wrap"
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
                    <TableHead>Footage</TableHead>
                    <TableHead>File Submission</TableHead>
                    <TableHead>Script</TableHead>
                    <TableHead>Schedule</TableHead>
                    <TableHead>Caption</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredItems.map((item) => {
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
                        <TableCell className="font-medium text-foreground max-w-[200px]">
                          {editingTitle?.itemId === item.id ? (
                            <input
                              autoFocus
                              className="text-xs font-medium border rounded px-1.5 py-0.5 w-full bg-background focus:outline-none focus:ring-1 focus:ring-primary/50"
                              value={editingTitle.value}
                              onChange={(e) => setEditingTitle({ ...editingTitle, value: e.target.value })}
                              onBlur={handleSaveTitle}
                              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSaveTitle(); } if (e.key === 'Escape') setEditingTitle(null); }}
                            />
                          ) : (
                            <button
                              onClick={() => setEditingTitle({ itemId: item.id, value: item.title })}
                              className="text-left w-full truncate hover:text-primary transition-colors cursor-text"
                              title="Click to edit title"
                            >
                              {item.title}
                            </button>
                          )}
                        </TableCell>
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
                                  {updatingPostStatus === item.id ? (
                                    <Badge variant="outline" className="cursor-pointer text-xs">
                                      <Loader2 className="w-3 h-3 animate-spin" />
                                    </Badge>
                                  ) : item.postStatus ? (
                                    <span className="cursor-pointer inline-flex items-center gap-1">
                                      <StatusBadge status={item.postStatus} />
                                      <ChevronDown className="w-3 h-3 opacity-60" />
                                    </span>
                                  ) : (
                                    <Badge variant="outline" className="cursor-pointer text-xs">
                                      —
                                      <ChevronDown className="w-3 h-3 ml-1 opacity-60" />
                                    </Badge>
                                  )}
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="start" className="bg-popover border border-border z-50">
                                {POST_STATUS_OPTIONS.map((s) => (
                                  <DropdownMenuItem
                                    key={s}
                                    onClick={() => handlePostStatusChange(item.id, s)}
                                    className={item.postStatus === s ? "font-bold" : ""}
                                  >
                                    <StatusBadge status={s} />
                                  </DropdownMenuItem>
                                ))}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>{renderAssigneeInput(item)}</TableCell>
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
                          {(item.footageUrl || item.storageUrl) ? (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => { setViewerSubfolder(undefined); setFootageViewerItem(item); }}
                                className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-green-500/15 text-green-500 border border-green-500/30 hover:bg-green-500/25 transition-colors"
                              >
                                <Play className="w-3 h-3" />
                                View
                              </button>
                              {isAdmin && (
                                <button
                                  onClick={() => handleDeleteFootage(item)}
                                  disabled={deletingFootage === item.id}
                                  className="inline-flex items-center justify-center w-5 h-5 rounded-full text-destructive/60 hover:text-destructive hover:bg-destructive/10 transition-colors"
                                  title={language === "en" ? "Delete footage" : "Eliminar metraje"}
                                >
                                  {deletingFootage === item.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
                                </button>
                              )}
                            </div>
                          ) : (
                            <FootageUploadDialog
                              videoEditId={item.id}
                              clientId={item.clientId}
                              onComplete={() => fetchQueue()}
                              currentFootageUrl={item.footageUrl}
                              currentFileSubmissionUrl={item.fileSubmissionUrl}
                              uploadSource={item.uploadSource}
                            />
                          )}
                        </TableCell>
                        {/* File Submission */}
                        <TableCell>
                          {item.fileSubmissionUrl ? (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => { setViewerSubfolder('submission'); setFootageViewerItem(item); }}
                                className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-green-500/15 text-green-500 border border-green-500/30 hover:bg-green-500/25 transition-colors"
                              >
                                <Play className="w-3 h-3" />
                                View
                              </button>
                              {isAdmin && (
                                <button
                                  onClick={() => handleDeleteFileSubmission(item)}
                                  disabled={deletingSubmission === item.id}
                                  className="inline-flex items-center justify-center w-5 h-5 rounded-full text-destructive/60 hover:text-destructive hover:bg-destructive/10 transition-colors"
                                  title={language === "en" ? "Delete file submission" : "Eliminar entrega"}
                                >
                                  {deletingSubmission === item.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
                                </button>
                              )}
                            </div>
                          ) : (
                            <FootageUploadDialog
                              videoEditId={item.id}
                              clientId={item.clientId}
                              onComplete={() => fetchQueue()}
                              currentFootageUrl={item.footageUrl}
                              currentFileSubmissionUrl={item.fileSubmissionUrl}
                              uploadSource={item.uploadSource}
                              subfolder="submission"
                            />
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
                          {inlineEdit?.itemId === item.id ? (
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
                            <button onClick={() => setInlineEdit({ itemId: item.id, value: item.caption || '' })} className="text-xs text-muted-foreground line-clamp-2 leading-relaxed text-left hover:text-foreground transition-colors w-full">
                              {item.caption}
                            </button>
                          ) : (
                            <button onClick={() => setInlineEdit({ itemId: item.id, value: '' })} className="text-xs text-muted-foreground/50 hover:text-primary transition-colors border border-dashed border-muted-foreground/20 hover:border-primary/40 rounded px-1.5 py-0.5">Add caption</button>
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
              {language === "en" ? "Move to Trash" : "Mover a Papelera"}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {language === "en"
                ? `Move "${deleteConfirmItem?.title}" to trash? You can restore it within 90 days.`
                : `¿Mover "${deleteConfirmItem?.title}" a la papelera? Puedes restaurarlo en 90 días.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="ghost" size="sm" onClick={() => setDeleteConfirmItem(null)} disabled={deleting}>
              {language === "en" ? "Cancel" : "Cancelar"}
            </Button>
            <Button variant="destructive" size="sm" onClick={handleDeleteItem} disabled={deleting} className="gap-1.5">
              {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              {language === "en" ? "Move to Trash" : "Mover a Papelera"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {reviewItem && (
        <VideoReviewModal
          open={reviewModalOpen}
          onClose={() => {
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
        <FootageViewerModal
          open={!!footageViewerItem}
          onClose={() => setFootageViewerItem(null)}
          title={footageViewerItem.title}
          videoEditId={footageViewerItem.id}
          clientId={footageViewerItem.clientId}
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
