import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  Loader2, ChevronLeft, ChevronRight, Download,
  ExternalLink, Calendar, AlertCircle, Share2, Copy, CheckCircle, MessageSquare,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

interface CalendarPost {
  id: string;
  notion_page_id?: string | null;
  client_id: string;
  title: string;
  scheduled_date: string;           // YYYY-MM-DD
  post_status: string;
  file_submission_url: string | null;
  script_url: string | null;
  revision_notes?: string | null;
  caption?: string | null;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DAY_NAMES_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

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

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const TODAY_KEY = toDateKey(new Date());

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

const STATUS_CONFIGS: Record<string, any> = {};
function buildStatusConfig(s: string) {
  const lower = s?.toLowerCase() || "";
  if (lower === "approved" || lower === "done") return {
    bg: "bg-emerald-500/20",
    dot: "bg-emerald-400",
    badge: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  };
  if (lower === "needs revision") return {
    bg: "bg-destructive/15",
    dot: "bg-destructive",
    badge: "bg-destructive/15 text-destructive border-destructive/30",
  };
  if (lower === "scheduled") return {
    bg: "bg-primary/15",
    dot: "bg-primary",
    badge: "bg-primary/15 text-primary border-primary/30",
  };
  return {
    bg: "bg-muted/40",
    dot: "bg-muted-foreground",
    badge: "bg-muted text-muted-foreground border-border/30",
  };
}

function getStatusConfig(status: string) {
  const key = status?.toLowerCase() || "";
  if (!STATUS_CONFIGS[key]) STATUS_CONFIGS[key] = buildStatusConfig(status);
  return STATUS_CONFIGS[key];
}

function formatAgendaDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", weekday: "short" }).toUpperCase();
}

export default function PublicContentCalendar() {
  const { clientId } = useParams<{ clientId: string }>();
  const [clientName, setClientName] = useState("");
  const [posts, setPosts] = useState<CalendarPost[]>([]);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPost, setSelectedPost] = useState<CalendarPost | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [showRevisionModal, setShowRevisionModal] = useState(false);
  const [revisionNotes, setRevisionNotes] = useState("");
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const [currentDate, setCurrentDate] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const calendarGrid = useMemo(() => buildCalendarGrid(year, month), [year, month]);

  const postsByDate = useMemo(() => {
    const map = new Map<string, CalendarPost[]>();
    for (const post of posts) {
      const key = post.scheduled_date;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(post);
    }
    return map;
  }, [posts]);

  const sortedDates = useMemo(() => {
    const dates = Array.from(postsByDate.keys());
    return dates.sort((a, b) => a.localeCompare(b));
  }, [postsByDate]);

  const prevMonth = useCallback(() => setCurrentDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1)), []);
  const nextMonth = useCallback(() => setCurrentDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1)), []);

  const handleShareLink = useCallback(() => {
    if (!clientId) return;
    const publicLink = `${window.location.origin}/public/calendar/${clientId}`;
    navigator.clipboard.writeText(publicLink);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
    toast.success("Public link copied!");
  }, [clientId]);

  const handleApprove = useCallback(async () => {
    if (!selectedPost) return;
    setUpdatingStatus(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const authHeader = session?.access_token ? `Bearer ${session.access_token}` : undefined;

      const res = await supabase.functions.invoke("update-post-status", {
        headers: authHeader ? { Authorization: authHeader } : {},
        body: { id: selectedPost.id, status: "Approved" },
      });
      if (res.error) throw res.error;
      toast.success("Post approved!");
      const id = selectedPost.id;
      setPosts((prev) => prev.map((p) => p.id === id ? { ...p, post_status: "Approved" } : p));
      setSelectedPost((prev) => prev ? { ...prev, post_status: "Approved" } : null);
    } catch (error) {
      console.error("Approve error:", error);
      toast.error("Failed to approve");
    } finally {
      setUpdatingStatus(false);
    }
  }, [selectedPost]);

  const handleRevisionClick = useCallback(() => {
    setRevisionNotes(selectedPost?.revision_notes || "");
    setShowRevisionModal(true);
  }, [selectedPost]);

  const handleSubmitRevision = useCallback(async () => {
    if (!selectedPost) return;
    setShowRevisionModal(false);
    setUpdatingStatus(true);
    try {
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
      toast.success("Sent back for revision.");
      const id = selectedPost.id;
      setPosts((prev) => prev.map((p) => p.id === id ? { ...p, post_status: "Needs Revision", revision_notes: revisionNotes } : p));
      setSelectedPost((prev) => prev ? { ...prev, post_status: "Needs Revision", revision_notes: revisionNotes } : null);
    } catch (error) {
      console.error("Revision error:", error);
      toast.error("Failed to update status");
    } finally {
      setUpdatingStatus(false);
    }
  }, [selectedPost, revisionNotes]);

  useEffect(() => {
    if (!clientId) return;
    supabase
      .from("clients")
      .select("name")
      .eq("id", clientId)
      .maybeSingle()
      .then(({ data }) => { if (data) setClientName(data.name); });
  }, [clientId]);

  useEffect(() => {
    const fetchPosts = async () => {
      if (!clientId) return;
      setFetching(true);
      setError(null);
      try {
        const { data, error: fetchErr } = await supabase
          .from("video_edits")
          .select("id, reel_title, schedule_date, post_status, file_submission, script_url, revisions, caption, client_id")
          .eq("client_id", clientId)
          .not("schedule_date", "is", null)
          .order("schedule_date", { ascending: true });

        if (fetchErr) throw fetchErr;

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
          caption: v.caption ?? null,
        }));

        setPosts(mappedData);
      } catch (e: any) {
        setError(e.message || "Failed to load calendar");
      } finally {
        setFetching(false);
      }
    };
    fetchPosts();
  }, [clientId]);

  if (fetching) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="flex-1 px-4 sm:px-6 py-6 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">{clientName || "Content Calendar"}</h1>
            <p className="text-xs text-muted-foreground font-normal mt-0.5">Content Calendar</p>
          </div>
          <Button
            onClick={handleShareLink}
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs"
          >
            {copiedLink ? (
              <>
                <CheckCircle className="w-3.5 h-3.5" />
                Copied!
              </>
            ) : (
              <>
                <Share2 className="w-3.5 h-3.5" />
                Share
              </>
            )}
          </Button>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 mb-4 text-xs text-muted-foreground flex-wrap">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-primary" />
            Scheduled
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            Approved
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-destructive" />
            Needs Revision
          </span>
        </div>

        {error ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <AlertCircle className="w-8 h-8 text-destructive mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">{error}</p>
            </div>
          </div>
        ) : posts.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center text-sm text-muted-foreground">
              <Calendar className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p>No scheduled posts yet</p>
            </div>
          </div>
        ) : (
          /* Calendar + Agenda Layout */
          <div className="flex-1 flex flex-col md:flex-row gap-4 min-h-0">
            {/* Agenda - Left (shown below calendar on mobile) */}
            <div className="w-full md:w-72 min-h-0 flex flex-col flex-shrink-0 rounded-xl border border-border/40 bg-card/20 backdrop-blur-sm overflow-hidden order-2 md:order-1">
              <div className="flex-1 overflow-y-auto p-4 space-y-1">
                {sortedDates.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-center text-sm text-muted-foreground">
                    <Calendar className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    No posts
                  </div>
                ) : (
                  sortedDates.map((dateStr) => {
                    const datePosts = postsByDate.get(dateStr) || [];
                    return (
                      <div key={dateStr}>
                        <div className="sticky top-0 flex items-center gap-2 px-2 py-2 mt-2 first:mt-0 bg-background/80 backdrop-blur-sm z-10">
                          <div className="h-px flex-1 bg-border/30" />
                          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest whitespace-nowrap">
                            {formatAgendaDate(dateStr)}
                          </span>
                          <div className="h-px flex-1 bg-border/30" />
                        </div>

                        <div className="space-y-1 mt-1">
                          {datePosts.map((post) => {
                            const cfg = getStatusConfig(post.post_status);
                            return (
                              <button
                                key={post.id}
                                onClick={() => setSelectedPost(post)}
                                className={`w-full text-left px-3 py-2 rounded text-[11px] font-medium transition-all truncate
                                  ${cfg.bg} hover:opacity-80`}
                              >
                                <div className="flex items-center gap-2">
                                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
                                  <span className="truncate">{post.title}</span>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Calendar - Right (shown first on mobile) */}
            <div className="w-full md:flex-1 rounded-xl border border-border/40 bg-card/20 backdrop-blur-sm p-4 flex flex-col order-1 md:order-2">
              {/* Month Navigation */}
              <div className="flex items-center justify-between gap-2 mb-4">
                <button
                  onClick={prevMonth}
                  className="p-1.5 rounded-md hover:bg-muted transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-sm font-semibold text-foreground flex-1 text-center">
                  {MONTH_NAMES[month]} {year}
                </span>
                <button
                  onClick={nextMonth}
                  className="p-1.5 rounded-md hover:bg-muted transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              {/* Day Headers */}
              <div className="grid grid-cols-7 gap-0 mb-2">
                {DAY_NAMES_EN.map((d) => (
                  <div key={d} className="text-center text-[10px] font-semibold text-muted-foreground uppercase tracking-wider py-1">
                    {d}
                  </div>
                ))}
              </div>

              {/* Calendar Grid */}
              <div className="grid grid-cols-7 gap-0 flex-1">
                {calendarGrid.map((day, idx) => {
                  const dayKey = toDateKey(day);
                  const isCurrentMonth = day.getMonth() === month;
                  const isToday = dayKey === TODAY_KEY;
                  const dayPosts = postsByDate.get(dayKey);
                  const col = idx % 7;
                  const row = Math.floor(idx / 7);

                  return (
                    <button
                      key={dayKey}
                      onClick={() => {
                        if (dayPosts && dayPosts.length > 0) {
                          setSelectedPost(dayPosts[0]);
                        }
                      }}
                      className={`relative py-3 px-1 flex flex-col items-center justify-start text-center text-xs font-medium transition-colors border-r border-b border-border/30 cursor-pointer
                        ${col === 6 ? "border-r-0" : ""}
                        ${row === 5 ? "border-b-0" : ""}
                        ${isCurrentMonth ? "hover:bg-muted/10" : "bg-background/20"}
                        ${isToday ? "bg-primary/20" : ""}`}
                    >
                      <span className={`inline-block w-6 h-6 flex items-center justify-center rounded-full text-[11px] font-semibold
                        ${isToday ? "bg-primary text-primary-foreground"
                          : isCurrentMonth ? "text-foreground"
                          : "text-muted-foreground/40"}`}
                      >
                        {day.getDate()}
                      </span>
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

      {/* Revision Notes Modal */}
      <Dialog open={showRevisionModal} onOpenChange={(open) => { if (!open) setShowRevisionModal(false); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <MessageSquare className="w-4 h-4 text-destructive" />
              Send for Revision
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              Leave your revisions for the editor. Once the changes are made, it will be sent back to the content calendar for review.
            </p>
            <Textarea
              value={revisionNotes}
              onChange={(e) => setRevisionNotes(e.target.value)}
              placeholder="Describe what needs to be changed or fixed..."
              rows={4}
              className="text-sm resize-none"
              autoFocus
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" size="sm" onClick={() => setShowRevisionModal(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleSubmitRevision}
              className="gap-1.5"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              Send for Revision
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Post Detail Modal */}
      <Dialog open={!!selectedPost} onOpenChange={() => setSelectedPost(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          {selectedPost && (
            <>
              <DialogHeader>
                <div className="flex items-center justify-between gap-2 flex-wrap w-full">
                  <DialogTitle className="flex items-center gap-2 flex-wrap text-base">
                    <span className="truncate max-w-[250px]">{selectedPost.title}</span>
                    <Badge variant="outline" className={getStatusConfig(selectedPost.post_status).badge}>
                      {selectedPost.post_status}
                    </Badge>
                  </DialogTitle>
                </div>
              </DialogHeader>

              <div className="space-y-4">
                {/* Scheduled date */}
                {selectedPost.scheduled_date && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Calendar className="w-3.5 h-3.5" />
                    Scheduled for:{" "}
                    <span className="font-semibold text-foreground">
                      {new Date(selectedPost.scheduled_date + "T00:00:00").toLocaleDateString(
                        "en-US",
                        { weekday: "long", year: "numeric", month: "long", day: "numeric" }
                      )}
                    </span>
                  </div>
                )}

                {/* Video */}
                {selectedPost.file_submission_url ? (
                  (() => {
                    const driveId = extractGoogleDriveFileId(selectedPost.file_submission_url);
                    return driveId ? (
                      <div className="rounded-xl overflow-hidden bg-black aspect-video border border-border/30">
                        <iframe
                          src={`https://drive.google.com/file/d/${driveId}/preview`}
                          className="w-full h-full"
                          allow="autoplay"
                          allowFullScreen
                        />
                      </div>
                    ) : (
                      <a href={selectedPost.file_submission_url} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline">
                        <ExternalLink className="w-3.5 h-3.5" />
                        Open video file
                      </a>
                    );
                  })()
                ) : (
                  <div className="aspect-video rounded-xl bg-muted/30 border border-border/30 flex items-center justify-center">
                    <span className="text-xs text-muted-foreground">No video attached</span>
                  </div>
                )}

                {/* All action buttons in one row: Download / Script / Approve / Revisions */}
                <div className="flex items-center justify-between gap-2 text-xs pt-4 border-t border-border/40 flex-wrap">
                  {/* Left: Download + Script */}
                  <div className="flex items-center gap-4">
                    {selectedPost.file_submission_url && extractGoogleDriveFileId(selectedPost.file_submission_url) && (
                      <a href={getGoogleDriveDownloadUrl(extractGoogleDriveFileId(selectedPost.file_submission_url)!)}
                        target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-primary hover:underline">
                        <Download className="w-3.5 h-3.5" />
                        Download
                      </a>
                    )}
                    {selectedPost.script_url && (
                      <a href={selectedPost.script_url} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-primary hover:underline">
                        <ExternalLink className="w-3 h-3" />
                        View Script
                      </a>
                    )}
                  </div>

                  {/* Right: Approve + Revisions */}
                  <div className="flex items-center gap-2">
                    {selectedPost.post_status !== "Approved" && selectedPost.post_status !== "Done" && (
                      <Button
                        size="sm"
                        className="gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs h-8"
                        onClick={handleApprove}
                        disabled={updatingStatus}
                      >
                        {updatingStatus ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                        Approve
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 text-destructive border-destructive/40 hover:bg-destructive/10 text-xs h-8"
                      onClick={handleRevisionClick}
                      disabled={updatingStatus}
                    >
                      {updatingStatus ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MessageSquare className="w-3.5 h-3.5" />}
                      Revisions
                    </Button>
                  </div>
                </div>

                {/* Status message */}
                {(selectedPost.post_status === "Approved" || selectedPost.post_status === "Done") && (
                  <div className="pt-4 flex items-center gap-2 text-sm text-emerald-400">
                    <CheckCircle className="w-4 h-4" />
                    This post has been approved.
                  </div>
                )}

                {/* Revision notes — shown when set */}
                {selectedPost.revision_notes && (
                  <div className="pt-3 border-t border-border/40">
                    <div className="text-xs text-muted-foreground mb-1 font-medium">Revision notes</div>
                    <p className="text-sm text-foreground whitespace-pre-wrap">{selectedPost.revision_notes}</p>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
