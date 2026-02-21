import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import DashboardSidebar from "@/components/DashboardSidebar";
import DashboardTopBar from "@/components/DashboardTopBar";
import AnimatedDots from "@/components/ui/AnimatedDots";
import { Loader2, ArrowLeft, Play, ExternalLink, Download, ChevronDown, UserCircle, MessageSquare, Save } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

interface EditingQueueItem {
  id: string;
  title: string;
  status: string;
  statusColor: string;
  fileSubmissionUrl: string | null;
  scriptUrl: string | null;
  assignee: string | null;
  assigneeId: string | null;
  assigneePropName: string | null;
  revisions: string | null;
  revisionPropName: string | null;
  lastEdited: string;
}

interface NotionUser {
  id: string;
  name: string;
}

const STATUS_OPTIONS = ["Not started", "In progress", "Done", "Needs revision"];

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
  const isMobile = typeof window !== "undefined" && window.innerWidth < 1024;
  const [sidebarOpen, setSidebarOpen] = useState(!isMobile);
  const [clientName, setClientName] = useState("");
  const [items, setItems] = useState<EditingQueueItem[]>([]);
  const [notionUsers, setNotionUsers] = useState<NotionUser[]>([]);
  const [assigneeProperty, setAssigneeProperty] = useState("Assignee");
  const [revisionProperty, setRevisionProperty] = useState("Revisions");
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<EditingQueueItem | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);
  const [updatingAssignee, setUpdatingAssignee] = useState<string | null>(null);
  const [revisionDialogItem, setRevisionDialogItem] = useState<EditingQueueItem | null>(null);
  const [revisionText, setRevisionText] = useState("");
  const [savingRevision, setSavingRevision] = useState(false);

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
      const res = await supabase.functions.invoke("fetch-editing-queue", {
        body: { client_id: clientId },
      });
      if (res.error) throw res.error;
      setItems(res.data?.items || []);
      setNotionUsers(res.data?.notionUsers || []);
      setAssigneeProperty(res.data?.assigneeProperty || "Assignee");
      setRevisionProperty(res.data?.revisionProperty || "Revisions");
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

  const handleStatusChange = async (pageId: string, newStatus: string) => {
    setUpdatingStatus(pageId);
    try {
      const res = await supabase.functions.invoke("update-editing-status", {
        body: { page_id: pageId, status: newStatus },
      });
      if (res.error) throw res.error;
      setItems((prev) =>
        prev.map((item) =>
          item.id === pageId ? { ...item, status: newStatus } : item
        )
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

  const handleAssigneeChange = async (pageId: string, userId: string | null, userName: string | null, propName: string) => {
    setUpdatingAssignee(pageId);
    try {
      const res = await supabase.functions.invoke("update-editing-status", {
        body: {
          page_id: pageId,
          assignee_id: userId,
          assignee_property: propName,
        },
      });
      if (res.error) throw res.error;
      setItems((prev) =>
        prev.map((item) =>
          item.id === pageId ? { ...item, assignee: userName, assigneeId: userId } : item
        )
      );
      setSelectedItem((prev) =>
        prev && prev.id === pageId ? { ...prev, assignee: userName, assigneeId: userId } : prev
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
      const propName = revisionDialogItem.revisionPropName || revisionProperty;
      const res = await supabase.functions.invoke("update-editing-status", {
        body: {
          page_id: revisionDialogItem.id,
          revisions: revisionText,
          revision_property: propName,
        },
      });
      if (res.error) throw res.error;
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

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const selectedDriveId = selectedItem?.fileSubmissionUrl
    ? extractGoogleDriveFileId(selectedItem.fileSubmissionUrl)
    : null;

  const renderAssigneeDropdown = (item: EditingQueueItem) => {
    const propName = item.assigneePropName || assigneeProperty;
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="inline-flex items-center gap-1 focus:outline-none text-xs"
            disabled={updatingAssignee === item.id}
          >
            {updatingAssignee === item.id ? (
              <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
            ) : item.assignee ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-foreground text-xs cursor-pointer hover:bg-primary/20 transition-colors">
                <UserCircle className="w-3 h-3" />
                {item.assignee}
                <ChevronDown className="w-3 h-3 opacity-60" />
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-dashed border-muted-foreground/30 text-muted-foreground text-xs cursor-pointer hover:border-primary/50 hover:text-foreground transition-colors">
                <UserCircle className="w-3 h-3" />
                {language === "en" ? "Assign" : "Asignar"}
                <ChevronDown className="w-3 h-3 opacity-60" />
              </span>
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="bg-popover border border-border z-50 min-w-[160px]">
          {notionUsers.length === 0 ? (
            <DropdownMenuItem disabled className="text-xs text-muted-foreground">
              {language === "en" ? "No users found" : "No se encontraron usuarios"}
            </DropdownMenuItem>
          ) : (
            <>
              {item.assignee && (
                <DropdownMenuItem
                  onClick={() => handleAssigneeChange(item.id, null, null, propName)}
                  className="text-xs text-muted-foreground"
                >
                  {language === "en" ? "Unassign" : "Desasignar"}
                </DropdownMenuItem>
              )}
              {notionUsers.map((nu) => (
                <DropdownMenuItem
                  key={nu.id}
                  onClick={() => handleAssigneeChange(item.id, nu.id, nu.name, propName)}
                  className={`text-xs ${item.assigneeId === nu.id ? "font-bold" : ""}`}
                >
                  <UserCircle className="w-3.5 h-3.5 mr-2" />
                  {nu.name}
                </DropdownMenuItem>
              ))}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  return (
    <div className="min-h-screen bg-background flex" style={{ fontFamily: "Arial, sans-serif" }}>
      <AnimatedDots />
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/40 z-30 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <DashboardSidebar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} currentPath="/clients" />

      <main className="flex-1 flex flex-col min-h-screen">
        <DashboardTopBar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />

        <div className="flex-1 px-4 sm:px-8 py-8 max-w-6xl mx-auto w-full">
          <motion.button
            onClick={() => navigate(`/clients/${clientId}`)}
            className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors mb-6"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            {clientName || (language === "en" ? "Back" : "Volver")}
          </motion.button>

          <motion.h1
            className="text-xl sm:text-2xl font-bold text-foreground mb-6 tracking-tight"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.05 }}
          >
            Editing Queue
          </motion.h1>

          {fetching ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="text-center py-20 text-muted-foreground text-sm">{error}</div>
          ) : items.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground text-sm">
              {language === "en" ? "No items in the editing queue" : "No hay elementos en la cola de edición"}
            </div>
          ) : (
            <motion.div
              className="rounded-xl border border-border/50 bg-card/30 overflow-hidden"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.1 }}
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{language === "en" ? "Title" : "Título"}</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>{language === "en" ? "Assignee" : "Asignado"}</TableHead>
                    <TableHead>{language === "en" ? "Revisions" : "Revisiones"}</TableHead>
                    <TableHead>Video</TableHead>
                    <TableHead>Script</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => {
                    const hasDriveVideo = item.fileSubmissionUrl
                      ? !!extractGoogleDriveFileId(item.fileSubmissionUrl)
                      : false;

                    return (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium text-foreground">{item.title}</TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                className="inline-flex items-center gap-1 focus:outline-none"
                                disabled={updatingStatus === item.id}
                              >
                                <Badge variant="outline" className={`${getStatusClassName(item.status)} cursor-pointer`}>
                                  {updatingStatus === item.id ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                  ) : (
                                    <>
                                      {item.status}
                                      <ChevronDown className="w-3 h-3 ml-1 opacity-60" />
                                    </>
                                  )}
                                </Badge>
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
                          {renderAssigneeDropdown(item)}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="gap-1.5 text-xs"
                            onClick={() => handleOpenRevisions(item)}
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                            {item.revisions ? (
                              <span className="max-w-[120px] truncate">{item.revisions}</span>
                            ) : (
                              <span className="text-muted-foreground">{language === "en" ? "Add" : "Agregar"}</span>
                            )}
                          </Button>
                        </TableCell>
                        <TableCell>
                          {hasDriveVideo ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="gap-1.5 text-xs"
                              onClick={() => setSelectedItem(item)}
                            >
                              <Play className="w-3.5 h-3.5" />
                              {language === "en" ? "Play" : "Ver"}
                            </Button>
                          ) : item.fileSubmissionUrl ? (
                            <a
                              href={item.fileSubmissionUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                            >
                              <ExternalLink className="w-3 h-3" />
                              Link
                            </a>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {item.scriptUrl ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="gap-1.5 text-xs text-primary hover:underline"
                              onClick={() => navigate(`/clients/${clientId}/scripts?scriptTitle=${encodeURIComponent(item.title)}`)}
                            >
                              <ExternalLink className="w-3 h-3" />
                              {language === "en" ? "View" : "Ver"}
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
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

      {/* Video Preview Modal */}
      <Dialog open={!!selectedItem} onOpenChange={() => setSelectedItem(null)}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3 flex-wrap">
              <span>{selectedItem?.title}</span>
              {selectedItem && (
                <Badge variant="outline" className={getStatusClassName(selectedItem.status)}>
                  {selectedItem.status}
                </Badge>
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
                        <Badge variant="outline" className={`${getStatusClassName(selectedItem.status)} cursor-pointer`}>
                          {updatingStatus === selectedItem.id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <>
                              {selectedItem.status}
                              <ChevronDown className="w-3 h-3 ml-1 opacity-60" />
                            </>
                          )}
                        </Badge>
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
                  {renderAssigneeDropdown(selectedItem)}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs"
                  onClick={() => handleOpenRevisions(selectedItem)}
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  {language === "en" ? "Revisions" : "Revisiones"}
                </Button>
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
    </div>
  );
}