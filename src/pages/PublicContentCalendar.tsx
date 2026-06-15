import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  Loader2, ChevronLeft, ChevronRight, Download,
  ExternalLink, Calendar, AlertCircle, Share2, CheckCircle, MessageSquare,
  Play, List, CalendarDays, FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { LIFECYCLE_STYLE, deriveFromLegacy, type LifecycleStatus } from "@/lib/lifecycleStatus";

interface CalendarPost {
  id: string;
  notion_page_id?: string | null;
  client_id: string;
  title: string;
  scheduled_date: string;           // YYYY-MM-DD
  post_status: string;              // legacy — kept for dual-write compatibility
  lifecycle_status: LifecycleStatus; // preferred display field
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

// A non-Drive URL we can try to play inline (Supabase storage, direct mp4/mov/webm, etc.)
function looksPlayable(url: string): boolean {
  return /\.(mp4|mov|webm|m4v)(\?|$)/i.test(url) || /supabase\.co\/storage/i.test(url);
}

async function copyLink(link: string, onCopied: () => void) {
  let copied = false;
  try {
    await navigator.clipboard.writeText(link);
    copied = true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = link;
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
  if (copied) onCopied();
  else toast.success(link, { duration: 8000 });
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

function formatAgendaDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", weekday: "short" }).toUpperCase();
}

const VIDEO_BOX = "mx-auto w-full max-w-[360px] aspect-[9/16] max-h-[65vh] rounded-xl overflow-hidden bg-black border border-border/30";

/** Portrait-friendly video block for vertical reels.
 *  `url` may be a Google Drive link, a direct http(s) video URL, or a bare
 *  Supabase Storage path. Bare paths live in private buckets, so we resolve a
 *  short-lived signed URL through the public-calendar-video edge function. */
function VideoBlock({ url, postId, clientId }: { url: string; postId: string; clientId: string }) {
  const driveId = extractGoogleDriveFileId(url);
  const isHttp = /^https?:\/\//i.test(url);
  const needsSigning = !driveId && !isHttp;

  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [resolving, setResolving] = useState(needsSigning);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!needsSigning) return;
    let cancelled = false;
    setResolving(true);
    setFailed(false);
    setSignedUrl(null);
    supabase.functions
      .invoke("public-calendar-video", { body: { post_id: postId, client_id: clientId } })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data?.url) setFailed(true);
        else setSignedUrl(data.url);
      })
      .catch(() => { if (!cancelled) setFailed(true); })
      .finally(() => { if (!cancelled) setResolving(false); });
    return () => { cancelled = true; };
  }, [url, postId, clientId, needsSigning]);

  if (driveId) {
    return (
      <div className={VIDEO_BOX}>
        <iframe
          src={`https://drive.google.com/file/d/${driveId}/preview`}
          className="w-full h-full"
          allow="autoplay; fullscreen"
          allowFullScreen
        />
      </div>
    );
  }

  const playableUrl = signedUrl ?? (isHttp && looksPlayable(url) ? url : null);
  if (playableUrl) {
    return (
      <div className={VIDEO_BOX}>
        <video src={playableUrl} controls playsInline preload="metadata" className="w-full h-full object-contain" />
      </div>
    );
  }

  if (resolving) {
    return (
      <div className={`${VIDEO_BOX} flex items-center justify-center`}>
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // A real external URL we couldn't embed — offer it as a link.
  if (isHttp && !failed) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer"
        className="flex items-center justify-center gap-2 h-12 rounded-xl border border-border/40 bg-card/40 text-sm text-primary hover:bg-card/60 transition-colors">
        <ExternalLink className="w-4 h-4" />
        Open video file
      </a>
    );
  }

  return (
    <div className={`${VIDEO_BOX} flex items-center justify-center`}>
      <span className="text-xs text-muted-foreground">Video unavailable</span>
    </div>
  );
}

export default function PublicContentCalendar() {
  const { clientId } = useParams<{ clientId: string }>();
  const [searchParams] = useSearchParams();
  const [clientName, setClientName] = useState("");
  const [posts, setPosts] = useState<CalendarPost[]>([]);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPost, setSelectedPost] = useState<CalendarPost | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [showRevisionModal, setShowRevisionModal] = useState(false);
  const [revisionNotes, setRevisionNotes] = useState("");
  const [reviewerName, setReviewerName] = useState("");
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [view, setView] = useState<"agenda" | "calendar">("agenda"); // mobile toggle; desktop shows both

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
    copyLink(publicLink, () => {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
      toast.success("Public link copied!");
    });
  }, [clientId]);

  const handleDownload = useCallback(async () => {
    if (!selectedPost || !clientId) return;
    const submission = selectedPost.file_submission_url;
    const driveDl = submission ? extractGoogleDriveFileId(submission) : null;
    // Remote links → redirect (Drive's download endpoint, or the external URL).
    if (driveDl) { window.open(getGoogleDriveDownloadUrl(driveDl), "_blank", "noopener,noreferrer"); return; }
    if (submission && /^https?:\/\//i.test(submission)) { window.open(submission, "_blank", "noopener,noreferrer"); return; }
    // Private storage → ask the edge fn for the ORIGINAL (footage), not the proxy.
    setDownloading(true);
    try {
      const { data, error } = await supabase.functions.invoke("public-calendar-video", {
        body: { post_id: selectedPost.id, client_id: clientId, prefer: "original" },
      });
      if (error || !data?.url) throw error || new Error("No file");
      if (data.kind === "external") { window.open(data.url, "_blank", "noopener,noreferrer"); return; }
      const res = await fetch(data.url);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = `${(selectedPost.title || "video").replace(/[^a-zA-Z0-9_\- ]/g, "")}.mp4`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch {
      toast.error("Download failed");
    } finally {
      setDownloading(false);
    }
  }, [selectedPost, clientId]);

  const handleApprove = useCallback(async () => {
    if (!selectedPost || !clientId) return;
    setUpdatingStatus(true);
    try {
      // No-login review: anyone with the share link can approve. The endpoint
      // verifies the post belongs to this client_id before writing.
      const res = await supabase.functions.invoke("public-review-post", {
        body: { post_id: selectedPost.id, client_id: clientId, action: "approve" },
      });
      if (res.error) throw res.error;
      toast.success("Post approved!");
      const id = selectedPost.id;
      setPosts((prev) => prev.map((p) => p.id === id ? { ...p, post_status: "Approved", lifecycle_status: "Published" } : p));
      setSelectedPost((prev) => prev ? { ...prev, post_status: "Approved", lifecycle_status: "Published" } : null);
    } catch (error) {
      console.error("Approve error:", error);
      toast.error("Failed to approve");
    } finally {
      setUpdatingStatus(false);
    }
  }, [selectedPost, clientId]);

  const handleRevisionClick = useCallback(() => {
    setRevisionNotes(selectedPost?.revision_notes || "");
    setShowRevisionModal(true);
  }, [selectedPost]);

  const handleSubmitRevision = useCallback(async () => {
    if (!selectedPost || !clientId) return;
    if (!revisionNotes.trim()) {
      toast.error("Please describe what needs to change.");
      return;
    }
    setShowRevisionModal(false);
    setUpdatingStatus(true);
    const storedNote = reviewerName.trim() ? `${reviewerName.trim()}: ${revisionNotes.trim()}` : revisionNotes.trim();
    try {
      const res = await supabase.functions.invoke("public-review-post", {
        body: {
          post_id: selectedPost.id,
          client_id: clientId,
          action: "revision",
          revision_notes: revisionNotes.trim(),
          reviewer_name: reviewerName.trim() || undefined,
        },
      });
      if (res.error) throw res.error;
      toast.success("Sent back for revision.");
      const id = selectedPost.id;
      setPosts((prev) => prev.map((p) => p.id === id ? { ...p, post_status: "Needs Revision", lifecycle_status: "Needs Revisions", revision_notes: storedNote } : p));
      setSelectedPost((prev) => prev ? { ...prev, post_status: "Needs Revision", lifecycle_status: "Needs Revisions", revision_notes: storedNote } : null);
    } catch (error) {
      console.error("Revision error:", error);
      toast.error("Failed to update status");
    } finally {
      setUpdatingStatus(false);
    }
  }, [selectedPost, clientId, revisionNotes, reviewerName]);

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
          .select("id, reel_title, schedule_date, post_status, lifecycle_status, file_submission, script_url, revisions, caption, client_id")
          .eq("client_id", clientId)
          .is("deleted_at", null)
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
          lifecycle_status: (v.lifecycle_status as LifecycleStatus | null) ?? deriveFromLegacy(v.status, v.post_status),
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

  // Deep link: ?post=<id> auto-opens that post once loaded.
  useEffect(() => {
    const target = searchParams.get("post");
    if (!target || posts.length === 0) return;
    const match = posts.find((p) => p.id === target);
    if (match) setSelectedPost(match);
  }, [searchParams, posts]);

  if (fetching) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const hasVideo = (p: CalendarPost) => !!p.file_submission_url;
  const isApproved = (p: CalendarPost) => p.lifecycle_status === "Published" || p.lifecycle_status === "Scheduled";

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Sticky header */}
      <header className="sticky top-0 z-20 bg-background/90 backdrop-blur-md border-b border-border/40">
        <div className="px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg sm:text-2xl font-bold text-foreground font-serif truncate">{clientName || "Content Calendar"}</h1>
            <p className="text-[11px] sm:text-xs text-muted-foreground font-normal">Content Calendar</p>
          </div>
          <Button onClick={handleShareLink} variant="outline" size="sm" className="gap-1.5 text-xs flex-shrink-0">
            {copiedLink ? <><CheckCircle className="w-3.5 h-3.5" />Copied!</> : <><Share2 className="w-3.5 h-3.5" />Share</>}
          </Button>
        </div>

        {/* Mobile view toggle */}
        {posts.length > 0 && (
          <div className="md:hidden px-4 pb-3">
            <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-muted/40 border border-border/40">
              <button
                onClick={() => setView("agenda")}
                className={`flex items-center justify-center gap-1.5 h-9 rounded-md text-xs font-semibold transition-colors ${view === "agenda" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}
              >
                <List className="w-3.5 h-3.5" /> Agenda
              </button>
              <button
                onClick={() => setView("calendar")}
                className={`flex items-center justify-center gap-1.5 h-9 rounded-md text-xs font-semibold transition-colors ${view === "calendar" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}
              >
                <CalendarDays className="w-3.5 h-3.5" /> Calendar
              </button>
            </div>
          </div>
        )}
      </header>

      <div className="flex-1 px-4 sm:px-6 py-4 flex flex-col min-h-0">
        {/* Legend */}
        <div className="flex items-center gap-4 mb-4 text-xs text-muted-foreground flex-wrap">
          <span className="inline-flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-primary" />Scheduled</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />Approved</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-destructive" />Needs Revision</span>
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
          <div className="flex-1 flex flex-col md:flex-row gap-4 min-h-0">
            {/* Agenda — full width on mobile (when selected), sidebar on desktop */}
            <div className={`${view === "agenda" ? "flex" : "hidden"} md:flex w-full md:w-80 min-h-0 flex-col flex-shrink-0 rounded-xl border border-border/40 bg-card/20 backdrop-blur-sm overflow-hidden`}>
              <div className="flex-1 overflow-y-auto p-3 space-y-1">
                {sortedDates.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-center text-sm text-muted-foreground">No posts</div>
                ) : (
                  sortedDates.map((dateStr) => {
                    const datePosts = postsByDate.get(dateStr) || [];
                    return (
                      <div key={dateStr}>
                        <div className="sticky top-0 flex items-center gap-2 px-1 py-2 mt-2 first:mt-0 bg-background/85 backdrop-blur-sm z-10">
                          <div className="h-px flex-1 bg-border/30" />
                          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest whitespace-nowrap">{formatAgendaDate(dateStr)}</span>
                          <div className="h-px flex-1 bg-border/30" />
                        </div>
                        <div className="space-y-1.5 mt-1">
                          {datePosts.map((post) => {
                            const lcStyle = LIFECYCLE_STYLE[post.lifecycle_status];
                            return (
                              <button
                                key={post.id}
                                onClick={() => setSelectedPost(post)}
                                className="w-full text-left flex items-center gap-3 rounded-lg border border-border/40 bg-card/40 hover:bg-card/70 active:bg-card/80 transition-colors p-3 min-h-[56px]"
                              >
                                <span className={`w-1.5 self-stretch rounded-full flex-shrink-0 ${lcStyle.text.replace("text-", "bg-")}`} />
                                <div className="min-w-0 flex-1">
                                  <div className="text-sm font-medium text-foreground line-clamp-2 leading-snug">{post.title}</div>
                                  <div className="mt-1 flex items-center gap-2">
                                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${lcStyle.bg} ${lcStyle.text} ${lcStyle.border}`}>{lcStyle.label}</span>
                                    {hasVideo(post) && (
                                      <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground"><Play className="w-3 h-3" />Video</span>
                                    )}
                                  </div>
                                </div>
                                <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
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

            {/* Calendar — full width on mobile (when selected), main pane on desktop */}
            <div className={`${view === "calendar" ? "flex" : "hidden"} md:flex w-full md:flex-1 rounded-xl border border-border/40 bg-card/20 backdrop-blur-sm p-3 sm:p-4 flex-col`}>
              <div className="flex items-center justify-between gap-2 mb-4">
                <button onClick={prevMonth} className="p-2 rounded-md hover:bg-muted active:bg-muted/70 transition-colors"><ChevronLeft className="w-5 h-5" /></button>
                <span className="text-sm font-semibold text-foreground flex-1 text-center">{MONTH_NAMES[month]} {year}</span>
                <button onClick={nextMonth} className="p-2 rounded-md hover:bg-muted active:bg-muted/70 transition-colors"><ChevronRight className="w-5 h-5" /></button>
              </div>

              <div className="grid grid-cols-7 gap-0 mb-2">
                {DAY_NAMES_EN.map((d) => (
                  <div key={d} className="text-center text-[10px] font-semibold text-muted-foreground uppercase tracking-wider py-1">{d}</div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-0 flex-1 auto-rows-fr">
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
                      onClick={() => { if (dayPosts && dayPosts.length > 0) setSelectedPost(dayPosts[0]); }}
                      className={`relative min-h-[52px] py-2 px-1 flex flex-col items-center justify-start text-center transition-colors border-r border-b border-border/30
                        ${col === 6 ? "border-r-0" : ""} ${row === 5 ? "border-b-0" : ""}
                        ${isCurrentMonth ? "hover:bg-muted/10 active:bg-muted/20" : "bg-background/20"}
                        ${isToday ? "bg-primary/15" : ""}
                        ${dayPosts && dayPosts.length > 0 ? "cursor-pointer" : "cursor-default"}`}
                    >
                      <span className={`inline-flex w-7 h-7 items-center justify-center rounded-full text-xs font-semibold
                        ${isToday ? "bg-primary text-primary-foreground" : isCurrentMonth ? "text-foreground" : "text-muted-foreground/40"}`}>
                        {day.getDate()}
                      </span>
                      {dayPosts && dayPosts.length > 0 && (
                        <div className="flex flex-wrap justify-center gap-1 mt-1.5">
                          {dayPosts.slice(0, 4).map((post, i) => {
                            const lcStyle = LIFECYCLE_STYLE[post.lifecycle_status];
                            return <div key={i} className={`w-2 h-2 rounded-full ${lcStyle.text.replace("text-", "bg-")}`} />;
                          })}
                          {dayPosts.length > 4 && <span className="text-[9px] text-muted-foreground leading-none">+{dayPosts.length - 4}</span>}
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
        <DialogContent className="max-w-[95vw] sm:max-w-md rounded-xl">
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
            <input
              value={reviewerName}
              onChange={(e) => setReviewerName(e.target.value)}
              placeholder="Your name (optional)"
              className="w-full h-11 px-3 rounded-md border border-border/50 bg-muted/30 text-base text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
            />
            <Textarea
              value={revisionNotes}
              onChange={(e) => setRevisionNotes(e.target.value)}
              placeholder="Describe what needs to be changed or fixed..."
              rows={4}
              className="text-base resize-none"
              autoFocus
            />
          </div>
          <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
            <Button variant="ghost" size="sm" className="h-11 sm:h-9" onClick={() => setShowRevisionModal(false)}>Cancel</Button>
            <Button variant="destructive" size="sm" className="h-11 sm:h-9 gap-1.5" onClick={handleSubmitRevision}>
              <MessageSquare className="w-3.5 h-3.5" />
              Send for Revision
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Post Detail Modal */}
      <Dialog open={!!selectedPost} onOpenChange={() => setSelectedPost(null)}>
        <DialogContent className="max-w-[95vw] sm:max-w-2xl max-h-[92vh] overflow-y-auto rounded-xl">
          {selectedPost && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-start gap-2 flex-wrap text-base pr-6">
                  <span className="break-words">{selectedPost.title}</span>
                  {(() => { const lcStyle = LIFECYCLE_STYLE[selectedPost.lifecycle_status]; return (
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border self-center ${lcStyle.bg} ${lcStyle.text} ${lcStyle.border}`}>
                      {lcStyle.label}
                    </span>
                  ); })()}
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4">
                {/* Scheduled date */}
                {selectedPost.scheduled_date && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Calendar className="w-3.5 h-3.5 flex-shrink-0" />
                    Scheduled for:{" "}
                    <span className="font-semibold text-foreground">
                      {new Date(selectedPost.scheduled_date + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
                    </span>
                  </div>
                )}

                {/* Video */}
                {selectedPost.file_submission_url ? (
                  <VideoBlock url={selectedPost.file_submission_url} postId={selectedPost.id} clientId={clientId ?? ""} />
                ) : (
                  <div className="mx-auto w-full max-w-[360px] aspect-[9/16] max-h-[50vh] rounded-xl bg-muted/30 border border-border/30 flex items-center justify-center">
                    <span className="text-xs text-muted-foreground">No video attached</span>
                  </div>
                )}

                {/* Caption */}
                {selectedPost.caption && (
                  <div className="rounded-lg bg-muted/20 border border-border/30 p-3">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1 font-semibold">Caption</div>
                    <p className="text-sm text-foreground whitespace-pre-wrap break-words">{selectedPost.caption}</p>
                  </div>
                )}

                {/* Download / Script links */}
                {(selectedPost.script_url || selectedPost.file_submission_url) && (
                  <div className="flex items-center gap-3 text-sm flex-wrap">
                    {selectedPost.file_submission_url && (
                      <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={handleDownload} disabled={downloading}>
                        {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                        {downloading ? "Downloading..." : "Download"}
                      </Button>
                    )}
                    {selectedPost.script_url && (
                      <a href={selectedPost.script_url} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-primary hover:underline">
                        <FileText className="w-4 h-4" />View Script
                      </a>
                    )}
                  </div>
                )}

                {/* Review actions — no login required */}
                <div className="pt-4 border-t border-border/40 space-y-2">
                  {isApproved(selectedPost) && (
                    <div className="flex items-center gap-2 text-sm text-emerald-400">
                      <CheckCircle className="w-4 h-4" />
                      This post has been approved.
                    </div>
                  )}
                  {/* Request Revisions is ALWAYS available — even on a scheduled
                      post the client can still send it back. Approve only shows
                      when it isn't already approved. */}
                  <div className="flex flex-col sm:flex-row gap-2">
                    {!isApproved(selectedPost) && (
                      <Button
                        className="flex-1 h-11 gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white"
                        onClick={handleApprove}
                        disabled={updatingStatus}
                      >
                        {updatingStatus ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                        Approve
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      className="flex-1 h-11 gap-1.5 text-destructive border-destructive/40 hover:bg-destructive/10"
                      onClick={handleRevisionClick}
                      disabled={updatingStatus}
                    >
                      {updatingStatus ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquare className="w-4 h-4" />}
                      Request Revisions
                    </Button>
                  </div>
                </div>

                {/* Revision notes — shown when set */}
                {selectedPost.revision_notes && (
                  <div className="pt-3 border-t border-border/40">
                    <div className="text-xs text-muted-foreground mb-1 font-medium">Revision notes</div>
                    <p className="text-sm text-foreground whitespace-pre-wrap break-words">{selectedPost.revision_notes}</p>
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
