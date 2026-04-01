import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import connectaLogo from "@/assets/connecta-login-logo.png";
import {
  Loader2, Play, ExternalLink, Download, ChevronDown, MessageSquare, Save,
  Clapperboard, Globe, Calendar, CalendarPlus,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

interface QueueItem {
  id: string;
  title: string;
  status: string;
  postStatus: string | null;
  fileSubmissionUrl: string | null;
  footageUrl: string | null;
  scriptUrl: string | null;
  assignee: string | null;
  revisions: string | null;
  scheduledDate: string | null;
  caption: string | null;
  clientId: string;
  clientName: string;
  source?: "db";
}

const STATUS_OPTIONS = ["Not started", "In progress", "Needs Revision", "Done"];
const POST_STATUS_OPTIONS = ["Scheduled", "Needs Revision", "Approved", "Done"];

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

function getStatusClassName(status: string): string {
  const l = status.toLowerCase();
  if (l === "done" || l === "complete" || l === "completed")
    return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
  if (l.includes("revision"))
    return "bg-destructive/15 text-destructive border-destructive/30";
  if (l.includes("progress") || l.includes("editing"))
    return "bg-amber-500/15 text-amber-400 border-amber-500/30";
  return "bg-muted text-muted-foreground";
}

function getStatusDotColor(status: string): string {
  const l = status.toLowerCase();
  if (l === "done" || l === "complete") return "bg-emerald-400";
  if (l.includes("revision")) return "bg-destructive";
  if (l.includes("progress")) return "bg-amber-400";
  return "bg-muted-foreground";
}

export default function PublicEditingQueue() {
  const { clientId } = useParams<{ clientId: string }>();
  const isMaster = clientId === "all";

  const [items, setItems] = useState<QueueItem[]>([]);
  const [clientName, setClientName] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);
  const [updatingPostStatus, setUpdatingPostStatus] = useState<string | null>(null);
  const [revisionDialogItem, setRevisionDialogItem] = useState<QueueItem | null>(null);
  const [revisionText, setRevisionText] = useState("");
  const [savingRevision, setSavingRevision] = useState(false);
  const [selectedItem, setSelectedItem] = useState<QueueItem | null>(null);
  const [scheduleItem, setScheduleItem] = useState<QueueItem | null>(null);
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduling, setScheduling] = useState(false);

  const fetchQueue = async () => {
    setLoading(true);
    setError(null);
    try {
      let clientIds: string[] = [];
      let clientNameMap = new Map<string, string>();

      if (isMaster) {
        const { data: clients } = await supabase.from("clients").select("id, name");
        clientIds = (clients ?? []).map((c: any) => c.id);
        (clients ?? []).forEach((c: any) => clientNameMap.set(c.id, c.name));
      } else {
        clientIds = [clientId!];
        const { data: c } = await supabase
          .from("clients").select("name").eq("id", clientId).maybeSingle();
        if (c?.name) setClientName(c.name);
      }

      if (clientIds.length === 0) { setItems([]); setLoading(false); return; }

      const { data: dbVideos, error: dbErr } = await supabase
        .from("video_edits")
        .select("id, reel_title, status, post_status, file_submission, script_url, assignee, revisions, footage, schedule_date, caption, client_id, clients(name)")
        .in("client_id", clientIds)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

      if (dbErr) throw dbErr;

      const allItems: QueueItem[] = (dbVideos || []).map((v: any) => ({
        id: v.id,
        title: v.reel_title || "Untitled",
        status: v.status || "Not started",
        postStatus: v.post_status ?? null,
        fileSubmissionUrl: v.file_submission || null,
        footageUrl: v.footage || null,
        scriptUrl: v.script_url || null,
        assignee: v.assignee || null,
        revisions: v.revisions || null,
        scheduledDate: v.schedule_date || null,
        caption: v.caption ?? null,
        clientId: v.client_id,
        clientName: v.clients?.name || clientNameMap.get(v.client_id) || clientName,
        source: "db" as const,
      }));

      setItems(allItems);
    } catch (e: any) {
      setError(e.message || "Failed to load editing queue");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchQueue(); }, [clientId]);

  const handleStatusChange = async (item: QueueItem, newStatus: string) => {
    setUpdatingStatus(item.id);
    try {
      const { error } = await supabase.from("video_edits").update({ status: newStatus }).eq("id", item.id);
      if (error) throw error;
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, status: newStatus } : i)));
      toast.success("Status updated");
    } catch {
      toast.error("Failed to update status");
    } finally {
      setUpdatingStatus(null);
    }
  };

  const handlePostStatusChange = async (item: QueueItem, newStatus: string) => {
    setUpdatingPostStatus(item.id);
    try {
      const { error } = await supabase.from("video_edits").update({ post_status: newStatus }).eq("id", item.id);
      if (error) throw error;
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, postStatus: newStatus } : i)));
      toast.success("Post status updated");
    } catch {
      toast.error("Failed to update post status");
    } finally {
      setUpdatingPostStatus(null);
    }
  };

  const handleOpenRevisions = (item: QueueItem) => {
    setRevisionDialogItem(item);
    setRevisionText(item.revisions || "");
  };

  const handleSaveRevision = async () => {
    if (!revisionDialogItem) return;
    setSavingRevision(true);
    try {
      const { error } = await supabase
        .from("video_edits").update({ revisions: revisionText }).eq("id", revisionDialogItem.id);
      if (error) throw error;
      setItems((prev) =>
        prev.map((i) => (i.id === revisionDialogItem.id ? { ...i, revisions: revisionText } : i))
      );
      toast.success("Revisions saved");
      setRevisionDialogItem(null);
    } catch {
      toast.error("Failed to save revisions");
    } finally {
      setSavingRevision(false);
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
      setItems((prev) =>
        prev.map((i) => (i.id === scheduleItem.id ? { ...i, scheduledDate: scheduleDate } : i))
      );
      toast.success(`Scheduled for ${scheduleDate}`);
      setScheduleItem(null);
      setScheduleDate("");
    } catch {
      toast.error("Failed to schedule post");
    } finally {
      setScheduling(false);
    }
  };

  const selectedDriveId = selectedItem?.fileSubmissionUrl
    ? extractGoogleDriveFileId(selectedItem.fileSubmissionUrl)
    : null;

  const pageTitle = isMaster
    ? "Editing Queue — All Clients"
    : clientName
    ? `${clientName} — Editing Queue`
    : "Editing Queue";

  return (
    <>
      <div className="min-h-screen bg-background">
        {/* Header */}
        <div className="border-b border-border/30 bg-card/30 backdrop-blur-sm px-4 sm:px-8 py-4">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Clapperboard className="w-5 h-5 text-primary" />
              <div>
                <h1 className="text-lg sm:text-xl font-bold text-foreground tracking-tight">{pageTitle}</h1>
                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                  <Globe className="w-3 h-3" />
                  Public view — changes are saved in real time
                </p>
              </div>
            </div>
            <img src={connectaLogo} alt="ConnectaCreators" className="h-7 w-auto hidden sm:block" />
          </div>
        </div>

        {/* Content */}
        <div className="px-4 sm:px-8 py-8 max-w-7xl mx-auto">
          {loading ? (
            <div className="flex items-center justify-center py-32">
              <Loader2 className="w-7 h-7 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="text-center py-32 text-muted-foreground text-sm">{error}</div>
          ) : items.length === 0 ? (
            <div className="text-center py-32 text-muted-foreground text-sm">
              No items in the editing queue yet.
            </div>
          ) : (
            <div className="rounded-xl border border-border/50 bg-card/30 overflow-hidden overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {isMaster && <TableHead>Client</TableHead>}
                    <TableHead>Title</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Post Status</TableHead>
                    <TableHead>Assignee</TableHead>
                    <TableHead>Revisions</TableHead>
                    <TableHead>Footage</TableHead>
                    <TableHead className="text-center">File Submission</TableHead>
                    <TableHead>Script</TableHead>
                    <TableHead>Schedule</TableHead>
                    <TableHead>Caption</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => {
                    const hasDriveVideo = item.fileSubmissionUrl
                      ? !!extractGoogleDriveFileId(item.fileSubmissionUrl)
                      : false;

                    return (
                      <TableRow key={item.id}>
                        {isMaster && (
                          <TableCell>
                            <span className="text-xs font-medium text-primary/80">{item.clientName}</span>
                          </TableCell>
                        )}

                        {/* Title */}
                        <TableCell className="font-medium text-foreground text-sm">{item.title}</TableCell>

                        {/* Status */}
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
                                  onClick={() => handleStatusChange(item, s)}
                                  className={item.status === s ? "font-bold" : ""}
                                >
                                  <span className={`inline-block w-2 h-2 rounded-full mr-2 ${getStatusDotColor(s)}`} />
                                  {s}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>

                        {/* Post Status */}
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                className="inline-flex items-center gap-1 focus:outline-none"
                                disabled={updatingPostStatus === item.id}
                              >
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
                                  onClick={() => handlePostStatusChange(item, s)}
                                  className={item.postStatus === s ? "font-bold" : ""}
                                >
                                  {s}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>

                        {/* Assignee */}
                        <TableCell>
                          {item.assignee ? (
                            <span className="text-xs text-muted-foreground">{item.assignee}</span>
                          ) : (
                            <span className="text-xs text-muted-foreground/40">—</span>
                          )}
                        </TableCell>

                        {/* Revisions */}
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
                              <span className="text-muted-foreground">Add note</span>
                            )}
                          </Button>
                        </TableCell>

                        {/* Footage */}
                        <TableCell>
                          {item.footageUrl ? (
                            <a
                              href={item.footageUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                            >
                              <ExternalLink className="w-3 h-3" />
                              Footage
                            </a>
                          ) : (
                            <span className="text-xs text-muted-foreground/40">—</span>
                          )}
                        </TableCell>

                        {/* File Submission */}
                        <TableCell className="text-center">
                          {hasDriveVideo ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="gap-1.5 text-xs"
                              onClick={() => setSelectedItem(item)}
                            >
                              <Play className="w-3.5 h-3.5" />
                              Play
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
                            <span className="text-xs text-muted-foreground/40">—</span>
                          )}
                        </TableCell>

                        {/* Script */}
                        <TableCell>
                          {item.scriptUrl ? (
                            <a
                              href={item.scriptUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                            >
                              <ExternalLink className="w-3 h-3" />
                              View
                            </a>
                          ) : (
                            <span className="text-xs text-muted-foreground/40">—</span>
                          )}
                        </TableCell>

                        {/* Schedule */}
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
                              <><CalendarPlus className="w-3.5 h-3.5" />Schedule</>
                            )}
                          </Button>
                        </TableCell>

                        {/* Caption */}
                        <TableCell className="max-w-[200px]">
                          {item.caption ? (
                            <span className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">{item.caption}</span>
                          ) : (
                            <span className="text-xs text-muted-foreground/40">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>

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
                    Download Video
                  </a>
                  {selectedItem?.scriptUrl && (
                    <a
                      href={selectedItem.scriptUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      <ExternalLink className="w-3 h-3" />
                      View Script
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
                  Open file link
                </a>
              </div>
            ) : null}
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
              Revisions — {revisionDialogItem?.title}
            </DialogTitle>
            {revisionDialogItem && isMaster && (
              <DialogDescription className="text-xs">{revisionDialogItem.clientName}</DialogDescription>
            )}
          </DialogHeader>
          <div className="mt-2 space-y-3">
            <Textarea
              value={revisionText}
              onChange={(e) => setRevisionText(e.target.value)}
              placeholder="Leave revision notes here..."
              rows={5}
              className="text-sm"
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setRevisionDialogItem(null)}>Cancel</Button>
              <Button size="sm" onClick={handleSaveRevision} disabled={savingRevision} className="gap-1.5">
                {savingRevision ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Schedule Dialog */}
      <Dialog open={!!scheduleItem} onOpenChange={() => setScheduleItem(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <CalendarPlus className="w-4 h-4 text-primary" />
              {scheduleItem?.scheduledDate ? "Reschedule Post" : "Schedule Post"}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {scheduleItem?.title}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-xs font-medium">Select publish date</Label>
              <Input
                type="date"
                value={scheduleDate}
                onChange={(e) => setScheduleDate(e.target.value)}
                min={new Date().toISOString().split("T")[0]}
                className="text-sm"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              This will add the post to the Content Calendar.
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" size="sm" onClick={() => setScheduleItem(null)} disabled={scheduling}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSchedulePost} disabled={scheduling || !scheduleDate} className="gap-1.5">
              {scheduling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CalendarPlus className="w-3.5 h-3.5" />}
              Schedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
