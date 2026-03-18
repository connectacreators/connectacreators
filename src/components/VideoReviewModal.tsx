import { useState, useEffect, useRef, useMemo } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { revisionCommentService, type RevisionComment } from '@/services/revisionCommentService';
import { videoUploadService } from '@/services/videoUploadService';
import { toast } from 'sonner';
import { Check, CheckCheck, Play, Pause, Send, X } from 'lucide-react';

interface VideoReviewModalProps {
  open: boolean;
  onClose: () => void;
  videoEditId: string;
  title: string;
  uploadSource: string | null; // 'supabase' | 'gdrive' | null
  storagePath: string | null;
  fileSubmissionUrl: string | null;
  onCommentsChanged?: () => void;
  onStatusChanged?: (newStatus: string) => void;
}

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function parseTimestamp(input: string): number | null {
  const parts = input.trim().split(':');
  if (parts.length === 2) {
    const mins = parseInt(parts[0], 10);
    const secs = parseInt(parts[1], 10);
    if (!isNaN(mins) && !isNaN(secs)) return mins * 60 + secs;
  }
  if (parts.length === 1) {
    const secs = parseInt(parts[0], 10);
    if (!isNaN(secs)) return secs;
  }
  return null;
}

function extractGoogleDriveFileId(url: string): string | null {
  const m1 = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (m1) return m1[1];
  const m2 = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (m2) return m2[1];
  return null;
}

const ROLE_COLORS: Record<string, string> = {
  admin: '#3b82f6',
  editor: '#8b5cf6',
  client: '#f59e0b',
};

export default function VideoReviewModal({
  open,
  onClose,
  videoEditId,
  title,
  uploadSource,
  storagePath,
  fileSubmissionUrl,
  onCommentsChanged,
  onStatusChanged,
}: VideoReviewModalProps) {
  const { user, isAdmin } = useAuth();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [comments, setComments] = useState<RevisionComment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [manualTimestamp, setManualTimestamp] = useState('');
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPaused, setIsPaused] = useState(true);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const isSupabaseVideo = uploadSource === 'supabase' && storagePath;
  const isDriveVideo = uploadSource === 'gdrive' && fileSubmissionUrl;
  const driveFileId = isDriveVideo ? extractGoogleDriveFileId(fileSubmissionUrl!) : null;

  // Load comments
  useEffect(() => {
    if (!open || !videoEditId) return;
    setLoading(true);
    revisionCommentService.getCommentsByVideoEdit(videoEditId)
      .then(setComments)
      .catch(() => toast.error('Failed to load comments'))
      .finally(() => setLoading(false));
  }, [open, videoEditId]);

  // Load signed video URL for Supabase videos
  useEffect(() => {
    if (!open || !isSupabaseVideo || !storagePath) return;
    videoUploadService.getSignedVideoUrl(storagePath)
      .then(setVideoUrl)
      .catch(() => toast.error('Failed to load video'));
  }, [open, isSupabaseVideo, storagePath]);

  // Track video time
  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
    }
  };

  const handlePlayPause = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play();
      setIsPaused(false);
    } else {
      videoRef.current.pause();
      setIsPaused(true);
    }
  };

  const seekTo = (seconds: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = seconds;
      setCurrentTime(seconds);
    }
  };

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!videoRef.current || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    seekTo(pct * duration);
  };

  // Sorted comments: timestamped first (ascending), then general (null timestamp) at end
  const sortedComments = useMemo(() => {
    const timestamped = comments
      .filter(c => c.timestamp_seconds !== null)
      .sort((a, b) => (a.timestamp_seconds ?? 0) - (b.timestamp_seconds ?? 0));
    const general = comments.filter(c => c.timestamp_seconds === null);
    return [...timestamped, ...general];
  }, [comments]);

  const unresolvedCount = comments.filter(c => !c.resolved).length;
  const resolvedCount = comments.filter(c => c.resolved).length;

  const handleAddComment = async () => {
    if (!newComment.trim()) return;

    let timestampSeconds: number | null = null;

    if (isSupabaseVideo) {
      // Auto-capture from paused player
      timestampSeconds = isPaused ? Math.floor(currentTime) : null;
    } else if (isDriveVideo && manualTimestamp.trim()) {
      // Manual timestamp for Drive videos
      timestampSeconds = parseTimestamp(manualTimestamp);
    }

    const authorName = user?.user_metadata?.full_name || user?.email || 'Admin';

    try {
      const created = await revisionCommentService.createComment({
        video_edit_id: videoEditId,
        timestamp_seconds: timestampSeconds,
        comment: newComment.trim(),
        author_name: authorName,
        author_role: 'admin',
        author_id: user?.id || null,
      });
      setComments(prev => [...prev, created]);
      setNewComment('');
      setManualTimestamp('');
      // Auto-set status to Needs Revision when a comment is added
      await supabase.from('video_edits').update({ status: 'Needs Revision' }).eq('id', videoEditId);
      onStatusChanged?.('Needs Revision');
      onCommentsChanged?.();
    } catch {
      toast.error('Failed to add comment');
    }
  };

  const handleResolve = async (commentId: string, resolved: boolean) => {
    try {
      await revisionCommentService.resolveComment(commentId, resolved);
      const updatedComments = comments.map(c => c.id === commentId ? { ...c, resolved } : c);
      setComments(updatedComments);
      // Auto-update status based on unresolved count
      const allResolved = updatedComments.length > 0 && updatedComments.every(c => c.resolved);
      const newStatus = allResolved ? 'Done' : 'Needs Revision';
      await supabase.from('video_edits').update({ status: newStatus }).eq('id', videoEditId);
      onStatusChanged?.(newStatus);
      onCommentsChanged?.();
    } catch {
      toast.error('Failed to update comment');
    }
  };

  const handleResolveAll = async () => {
    const unresolved = comments.filter(c => !c.resolved);
    if (!unresolved.length) return;
    try {
      await Promise.all(unresolved.map(c => revisionCommentService.resolveComment(c.id, true)));
      setComments(prev => prev.map(c => ({ ...c, resolved: true })));
      // All resolved → set status to Done
      await supabase.from('video_edits').update({ status: 'Done' }).eq('id', videoEditId);
      onStatusChanged?.('Done');
      onCommentsChanged?.();
      toast.success('All revisions marked as complete');
    } catch {
      toast.error('Failed to resolve all comments');
    }
  };

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-6xl w-[95vw] h-[85vh] flex flex-col p-0 gap-0">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h2 className="text-lg font-semibold truncate">{title || 'Video Review'}</h2>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Body: Player + Comments */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left: Video Player */}
          <div className="flex-[3] flex flex-col p-4 border-r">
            {/* Video area */}
            <div className="flex-1 bg-black rounded-lg overflow-hidden flex items-center justify-center">
              {isSupabaseVideo && videoUrl ? (
                <video
                  ref={videoRef}
                  src={videoUrl}
                  className="max-w-full max-h-full"
                  onTimeUpdate={handleTimeUpdate}
                  onLoadedMetadata={handleLoadedMetadata}
                  onPlay={() => setIsPaused(false)}
                  onPause={() => setIsPaused(true)}
                  controls={false}
                  onClick={handlePlayPause}
                />
              ) : isDriveVideo && driveFileId ? (
                <iframe
                  src={`https://drive.google.com/file/d/${driveFileId}/preview`}
                  className="w-full h-full"
                  allow="autoplay"
                  sandbox="allow-scripts allow-same-origin"
                />
              ) : (
                <div className="text-muted-foreground text-sm">No video available</div>
              )}
            </div>

            {/* Custom controls for Supabase videos */}
            {isSupabaseVideo && videoUrl && (
              <>
                {/* Progress bar with markers */}
                <div className="mt-3 relative cursor-pointer" onClick={handleProgressClick}>
                  <div className="w-full h-1.5 bg-muted rounded-full">
                    <div
                      className="h-full bg-primary rounded-full"
                      style={{ width: duration ? `${(currentTime / duration) * 100}%` : '0%' }}
                    />
                  </div>
                  {/* Timeline markers */}
                  {duration > 0 && sortedComments
                    .filter(c => c.timestamp_seconds !== null)
                    .map(c => (
                      <div
                        key={c.id}
                        className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-background cursor-pointer hover:scale-125 transition-transform"
                        style={{
                          left: `${((c.timestamp_seconds ?? 0) / duration) * 100}%`,
                          backgroundColor: c.resolved ? '#10b981' : (ROLE_COLORS[c.author_role] || '#888'),
                        }}
                        title={`${formatTimestamp(c.timestamp_seconds!)} — ${c.comment.slice(0, 40)}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          seekTo(c.timestamp_seconds!);
                        }}
                      />
                    ))}
                </div>
                {/* Time + Play/Pause */}
                <div className="flex items-center justify-between mt-2">
                  <Button variant="ghost" size="sm" onClick={handlePlayPause}>
                    {isPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                  </Button>
                  <span className="text-xs text-muted-foreground font-mono">
                    {formatTimestamp(currentTime)} / {formatTimestamp(duration)}
                  </span>
                </div>
              </>
            )}

            {/* Comment input */}
            <div className="mt-3 flex gap-2 items-center">
              {isSupabaseVideo && isPaused && (
                <span className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded font-mono whitespace-nowrap">
                  {formatTimestamp(currentTime)}
                </span>
              )}
              {isDriveVideo && (
                <Input
                  placeholder="0:00"
                  value={manualTimestamp}
                  onChange={(e) => setManualTimestamp(e.target.value)}
                  className="w-16 h-8 text-xs font-mono"
                />
              )}
              <Input
                placeholder={
                  isSupabaseVideo && isPaused
                    ? `Add note at ${formatTimestamp(currentTime)}...`
                    : isDriveVideo
                    ? 'Add revision note...'
                    : 'Add general note...'
                }
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddComment()}
                className="flex-1 h-8 text-sm"
              />
              <Button size="sm" className="h-8" onClick={handleAddComment} disabled={!newComment.trim()}>
                <Send className="h-3.5 w-3.5 mr-1" /> Add
              </Button>
            </div>
          </div>

          {/* Right: Comment Thread */}
          <div className="flex-[2] flex flex-col p-4 overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-muted-foreground">
                REVISION NOTES ({comments.length})
              </span>
              <div className="flex items-center gap-2">
                {resolvedCount > 0 && (
                  <span className="text-xs text-green-500">{resolvedCount} resolved</span>
                )}
                {isAdmin && unresolvedCount > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 text-[10px] px-2 gap-1 border-green-500 text-green-500 hover:bg-green-500/10"
                    onClick={handleResolveAll}
                  >
                    <CheckCheck className="h-3 w-3" /> Mark All Complete
                  </Button>
                )}
              </div>
            </div>

            {loading ? (
              <div className="text-sm text-muted-foreground">Loading comments...</div>
            ) : sortedComments.length === 0 ? (
              <div className="text-sm text-muted-foreground">No revision notes yet. Pause the video and add one.</div>
            ) : (
              <div className="flex flex-col gap-2">
                {sortedComments.map((c) => (
                  <div
                    key={c.id}
                    className={`rounded-lg p-3 border-l-[3px] ${
                      c.resolved
                        ? 'opacity-40 bg-muted/20'
                        : 'bg-card border border-border/60 shadow-sm'
                    }`}
                    style={{
                      borderLeftColor: c.resolved ? '#10b981' : (ROLE_COLORS[c.author_role] || '#888'),
                    }}
                  >
                    <div className="flex items-center justify-between">
                      {c.timestamp_seconds !== null ? (
                        <button
                          className="text-xs font-semibold font-mono hover:underline"
                          style={{ color: ROLE_COLORS[c.author_role] || '#888' }}
                          onClick={() => isSupabaseVideo && seekTo(c.timestamp_seconds!)}
                        >
                          {formatTimestamp(c.timestamp_seconds)} {isSupabaseVideo ? '— Jump' : ''}
                        </button>
                      ) : (
                        <span className="text-xs font-semibold text-muted-foreground">General note</span>
                      )}
                      {c.resolved ? (
                        isAdmin ? (
                          <button
                            className="text-xs text-green-500 flex items-center gap-1 hover:text-amber-500 hover:line-through transition-colors"
                            title="Click to unresolve"
                            onClick={() => handleResolve(c.id, false)}
                          >
                            <Check className="h-3 w-3" /> Resolved
                          </button>
                        ) : (
                          <span className="text-xs text-green-500 flex items-center gap-1">
                            <Check className="h-3 w-3" /> Resolved
                          </span>
                        )
                      ) : isAdmin ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 text-[10px] px-2"
                          onClick={() => handleResolve(c.id, true)}
                        >
                          Mark Resolved
                        </Button>
                      ) : null}
                    </div>
                    <p className="text-sm mt-1">{c.comment}</p>
                    <div className="text-[11px] text-muted-foreground mt-1">
                      {c.author_name} ({c.author_role}) · {timeAgo(c.created_at)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
