import { useState, useEffect, useRef, useMemo } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { revisionCommentService, type RevisionComment } from '@/services/revisionCommentService';
import { videoUploadService } from '@/services/videoUploadService';
import { toast } from 'sonner';
import { Check, CheckCheck, Clock, Download, Loader2, Lock, Send, Trash2, X } from 'lucide-react';
import ThemedVideoPlayer from './ThemedVideoPlayer';

interface VideoReviewModalProps {
  open: boolean;
  onClose: () => void;
  videoEditId: string;
  title: string;
  uploadSource: string | null;
  storagePath: string | null;
  fileSubmissionUrl: string | null;
  onCommentsChanged?: () => void;
  onStatusChanged?: (newStatus: string) => void;
}

interface VideoSource {
  id: string;
  label: string;
  type: 'supabase' | 'drive' | 'external';
  rawUrl: string;
  driveId?: string;
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

function parseLinks(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const trimmed = raw.trim();
  if (trimmed.startsWith('[')) {
    try { return (JSON.parse(trimmed) as string[]).filter(Boolean); } catch { return [trimmed]; }
  }
  return [trimmed];
}

function shortLabel(str: string, max = 20): string {
  return str.length <= max ? str : str.slice(0, max - 1) + '…';
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
  const { user, isAdmin, isVideographer, isEditor } = useAuth();
  const canResolve = isAdmin || isVideographer || isEditor;
  const videoRef = useRef<HTMLVideoElement>(null);
  const [comments, setComments] = useState<RevisionComment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [manualTimestamp, setManualTimestamp] = useState('');
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPaused, setIsPaused] = useState(true);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [internalOnly, setInternalOnly] = useState(false);

  // Multi-source
  const [sources, setSources] = useState<VideoSource[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [videoUrl, setVideoUrl] = useState<string | null>(null); // signed URL for supabase source
  const activeSource = sources[activeIdx] ?? null;

  // Build source list when modal opens
  useEffect(() => {
    if (!open) return;
    const list: VideoSource[] = [];

    // Parse links/paths from file_submission
    const links = parseLinks(fileSubmissionUrl);
    const addedPaths = new Set<string>();
    let versionCount = 0;
    links.forEach((url, i) => {
      if (!url.startsWith('http')) {
        versionCount++;
        list.push({ id: `sub-${i}`, label: `V${versionCount}`, type: 'supabase', rawUrl: url });
        addedPaths.add(url);
      } else {
        const driveId = extractGoogleDriveFileId(url);
        if (driveId) {
          versionCount++;
          list.push({ id: `drive-${i}`, label: `V${versionCount}`, type: 'drive', rawUrl: url, driveId });
        } else {
          list.push({ id: `ext-${i}`, label: `Link ${i + 1}`, type: 'external', rawUrl: url });
        }
      }
    });

    // Supabase storage file from storage_path (avoid duplicate if already added via file_submission)
    if (storagePath && !addedPaths.has(storagePath)) {
      const vIdx = list.filter(s => s.type === 'supabase' || s.type === 'drive').length + 1;
      list.push({ id: 'supabase', label: `V${vIdx}`, type: 'supabase', rawUrl: storagePath });
    }

    setSources(list);
    setActiveIdx(0);
    setVideoUrl(null);
    setCurrentTime(0);
    setDuration(0);
    setIsPaused(true);
  }, [open, fileSubmissionUrl, storagePath]);

  // Load signed URL when active source is supabase
  useEffect(() => {
    if (!activeSource || activeSource.type !== 'supabase') { setVideoUrl(null); return; }
    videoUploadService.getSignedVideoUrl(activeSource.rawUrl)
      .then(setVideoUrl)
      .catch(() => setVideoUrl(null));
  }, [activeSource]);

  // Reset playback state when switching sources
  const switchSource = (idx: number) => {
    setActiveIdx(idx);
    setCurrentTime(0);
    setDuration(0);
    setIsPaused(true);
  };

  // Load comments
  useEffect(() => {
    if (!open || !videoEditId) return;
    setLoading(true);
    revisionCommentService.getCommentsByVideoEdit(videoEditId)
      .then(setComments)
      .catch(() => toast.error('Failed to load comments'))
      .finally(() => setLoading(false));
  }, [open, videoEditId]);

  const isActiveSupabase = activeSource?.type === 'supabase' && !!videoUrl;
  const isActiveDrive = activeSource?.type === 'drive' && !!activeSource.driveId;
  // Can seek only when ThemedVideoPlayer is active (Supabase sources)
  const canSeek = isActiveSupabase;

  const handleDownload = async () => {
    if (!activeSource) return;
    let url: string | null = null;
    if (activeSource.type === 'supabase') url = videoUrl;
    else if (activeSource.type === 'drive' && activeSource.driveId)
      url = `https://drive.google.com/uc?export=download&id=${activeSource.driveId}`;
    else url = activeSource.rawUrl;
    if (!url) return;
    setDownloading(true);
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `${(title || 'video').replace(/[^a-zA-Z0-9_\- ]/g, '')}.mp4`;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a); URL.revokeObjectURL(blobUrl);
    } catch { toast.error('Download failed'); }
    finally { setDownloading(false); }
  };

  const seekTo = (seconds: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = seconds;
      setCurrentTime(seconds);
    }
  };

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
    let commentBody = newComment.trim();

    if (canSeek) {
      timestampSeconds = isPaused ? Math.floor(currentTime) : null;
    } else {
      // First try the dedicated timestamp input.
      if (manualTimestamp.trim()) {
        timestampSeconds = parseTimestamp(manualTimestamp);
      }
      // If no explicit timestamp but the comment STARTS with a time token,
      // extract it. Supported: "1:23", "@1:23", "at 1:23", "01:23:45".
      if (timestampSeconds == null) {
        const leading = commentBody.match(/^\s*(?:@|at\s+)?(\d{1,2}(?::\d{2}){1,2})\b[\s\-—:,.]*/i);
        if (leading) {
          const parsed = parseTimestamp(leading[1]);
          if (parsed != null) {
            timestampSeconds = parsed;
            commentBody = commentBody.slice(leading[0].length).trim();
          }
        }
      }
    }

    if (!commentBody) commentBody = newComment.trim();

    const authorName = user?.user_metadata?.full_name || user?.email || 'Admin';
    // Tag with source only when multiple sources exist
    const sourceRef = sources.length > 1 ? (activeSource?.label ?? null) : null;

    try {
      const created = await revisionCommentService.createComment({
        video_edit_id: videoEditId,
        timestamp_seconds: timestampSeconds,
        comment: commentBody,
        author_name: authorName,
        author_role: 'admin',
        author_id: user?.id || null,
        source_ref: sourceRef,
        internal_only: isAdmin ? internalOnly : false,
      });
      setComments(prev => [...prev, created]);
      setNewComment('');
      setManualTimestamp('');
      setInternalOnly(false);
      await supabase.from('video_edits').update({ status: 'Needs Revision' }).eq('id', videoEditId);
      onStatusChanged?.('Needs Revision');
      onCommentsChanged?.();
    } catch { toast.error('Failed to add comment'); }
  };

  const handleResolve = async (commentId: string, resolved: boolean) => {
    try {
      await revisionCommentService.resolveComment(commentId, resolved);
      const updated = comments.map(c => c.id === commentId ? { ...c, resolved } : c);
      setComments(updated);
      const allResolved = updated.length > 0 && updated.every(c => c.resolved);
      const newStatus = allResolved ? 'Done' : 'Needs Revision';
      await supabase.from('video_edits').update({ status: newStatus }).eq('id', videoEditId);
      onStatusChanged?.(newStatus);
      onCommentsChanged?.();
    } catch { toast.error('Failed to update comment'); }
  };

  const handleResolveAll = async () => {
    const unresolved = comments.filter(c => !c.resolved);
    if (!unresolved.length) return;
    try {
      await Promise.all(unresolved.map(c => revisionCommentService.resolveComment(c.id, true)));
      setComments(prev => prev.map(c => ({ ...c, resolved: true })));
      await supabase.from('video_edits').update({ status: 'Done' }).eq('id', videoEditId);
      onStatusChanged?.('Done');
      onCommentsChanged?.();
      toast.success('All revisions marked as complete');
    } catch { toast.error('Failed to resolve all comments'); }
  };

  const handleEditComment = async (commentId: string) => {
    const trimmed = editText.trim();
    if (!trimmed) return;
    try {
      await revisionCommentService.updateComment(commentId, trimmed);
      setComments(prev => prev.map(c => c.id === commentId ? { ...c, comment: trimmed } : c));
      setEditingId(null);
      onCommentsChanged?.();
    } catch { toast.error('Failed to update note'); }
  };

  const handleDeleteComment = async (commentId: string) => {
    try {
      await revisionCommentService.deleteComment(commentId);
      setComments(prev => prev.filter(c => c.id !== commentId));
      onCommentsChanged?.();
      toast.success('Note deleted');
    } catch { toast.error('Failed to delete note'); }
  };

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  // Comments for active source — filter internal for non-admins
  const visibleComments = useMemo(() => {
    let filtered = isAdmin ? sortedComments : sortedComments.filter(c => !c.internal_only);
    if (sources.length <= 1) return filtered;
    return filtered.filter(c => !c.source_ref || c.source_ref === activeSource?.label);
  }, [sortedComments, sources.length, activeSource, isAdmin]);

  const progressOverlay = duration > 0 ? (
    <>
      {visibleComments.filter(c => c.timestamp_seconds !== null && (isAdmin || !c.internal_only)).map(c => (
        <div
          key={c.id}
          style={{
            position: 'absolute',
            left: `${((c.timestamp_seconds ?? 0) / duration) * 100}%`,
            top: '50%', transform: 'translateY(-50%)',
            width: 10, height: 10, borderRadius: '50%',
            border: '2px solid rgba(0,0,0,0.6)',
            cursor: 'pointer',
            backgroundColor: c.resolved ? '#10b981' : (ROLE_COLORS[c.author_role] || '#888'),
            zIndex: 2,
          }}
          title={`${formatTimestamp(c.timestamp_seconds!)} — ${c.comment.slice(0, 40)}`}
          onMouseEnter={(e) => { (e.target as HTMLElement).style.transform = 'translateY(-50%) scale(1.3)'; }}
          onMouseLeave={(e) => { (e.target as HTMLElement).style.transform = 'translateY(-50%)'; }}
          onClick={(e) => { e.stopPropagation(); seekTo(c.timestamp_seconds!); }}
        />
      ))}
    </>
  ) : undefined;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-6xl w-[95vw] h-[85vh] flex flex-col p-0 gap-0 [&>button:last-child]:hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h2 className="text-lg font-semibold truncate">{title || 'Video Review'}</h2>
          <div className="flex items-center gap-1">
            {activeSource && (
              <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-muted-foreground hover:text-foreground" onClick={handleDownload} disabled={downloading}>
                {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                {downloading ? 'Downloading...' : 'Download'}
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Body */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left: Video */}
          <div className="flex-[3] flex flex-col p-4 border-r overflow-hidden">

            {/* Source tabs — only when multiple sources */}
            {sources.length > 1 && (
              <div className="flex gap-1.5 mb-2 flex-wrap">
                {sources.map((s, i) => (
                  <button
                    key={s.id}
                    onClick={() => switchSource(i)}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors border ${
                      i === activeIdx
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'border-border text-muted-foreground hover:border-primary/50 hover:text-foreground'
                    }`}
                  >
                    <span className="opacity-60 font-mono">{i + 1}</span>
                    <span className="max-w-[110px] truncate">{s.label}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Player area */}
            <div className="w-full flex-1 min-h-0" style={{ maxHeight: '60vh' }}>
              {isActiveSupabase ? (
                <ThemedVideoPlayer
                  src={videoUrl!}
                  videoRef={videoRef}
                  className="h-full"
                  maxHeight="100%"
                  onTimeUpdate={(t) => setCurrentTime(t)}
                  onLoadedMetadata={(d) => setDuration(d)}
                  onPlay={() => setIsPaused(false)}
                  onPause={() => setIsPaused(true)}
                  progressOverlay={progressOverlay}
                />
              ) : isActiveDrive ? (
                // Always use Google Drive's native embedded player
                <div className="w-full h-full rounded-lg overflow-hidden bg-black" style={{ border: '1px solid rgba(8,145,178,0.2)' }}>
                  <iframe
                    src={`https://drive.google.com/file/d/${activeSource!.driveId}/preview`}
                    className="w-full h-full"
                    allow="autoplay"
                    sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
                  />
                </div>
              ) : activeSource?.type === 'external' ? (
                <div className="w-full h-full bg-black rounded-lg flex flex-col items-center justify-center gap-3" style={{ border: '1px solid rgba(8,145,178,0.2)' }}>
                  <p className="text-sm text-muted-foreground">External link — open in browser</p>
                  <a href={activeSource.rawUrl} target="_blank" rel="noopener noreferrer" className="text-primary underline text-sm">{activeSource.rawUrl}</a>
                </div>
              ) : (
                <div className="w-full h-full bg-black rounded-lg flex items-center justify-center text-muted-foreground text-sm" style={{ border: '1px solid rgba(8,145,178,0.2)' }}>
                  No video available
                </div>
              )}
            </div>

            {/* Note input */}
            <div className="mt-3 flex gap-2 items-center">
              {canSeek && isPaused && (
                <span className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded font-mono whitespace-nowrap">
                  {formatTimestamp(currentTime)}
                </span>
              )}
              {(!canSeek) && (
                <div className="relative">
                  <Clock className="absolute left-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-primary pointer-events-none" />
                  <Input
                    placeholder="1:23"
                    value={manualTimestamp}
                    onChange={(e) => setManualTimestamp(e.target.value)}
                    className="w-20 h-8 text-xs font-mono pl-6"
                    title="Optional — type the time from the Drive player (MM:SS). You can also prefix your note with 1:23."
                  />
                </div>
              )}
              <Input
                placeholder={
                  canSeek && isPaused
                    ? `Add note at ${formatTimestamp(currentTime)}...`
                    : !canSeek
                      ? `Add revision note (prefix with 1:23 to set a time)`
                      : 'Add revision note...'
                }
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddComment()}
                className="flex-1 h-8 text-sm"
              />
              {isAdmin && (
                <button
                  type="button"
                  title={internalOnly ? 'Internal only — clients cannot see this' : 'Visible to all — click to make internal'}
                  onClick={() => setInternalOnly(v => !v)}
                  className={`h-8 w-8 flex items-center justify-center rounded border transition-colors flex-shrink-0 ${
                    internalOnly
                      ? 'bg-amber-500/20 border-amber-500/60 text-amber-400'
                      : 'border-border text-muted-foreground hover:border-amber-500/40 hover:text-amber-400'
                  }`}
                >
                  <Lock className="h-3.5 w-3.5" />
                </button>
              )}
              <Button size="sm" className="h-8" onClick={handleAddComment} disabled={!newComment.trim()}>
                <Send className="h-3.5 w-3.5 mr-1" /> Add
              </Button>
            </div>
          </div>

          {/* Right: Comments */}
          <div className="flex-[2] flex flex-col p-4 overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-muted-foreground">
                REVISION NOTES ({visibleComments.length})
                {sources.length > 1 && activeSource && (
                  <span className="ml-1 text-[10px] font-normal text-muted-foreground/60">· {activeSource.label}</span>
                )}
              </span>
              <div className="flex items-center gap-2">
                {resolvedCount > 0 && <span className="text-xs text-green-500">{resolvedCount} resolved</span>}
                {canResolve && unresolvedCount > 0 && (
                  <Button variant="outline" size="sm" className="h-6 text-[10px] px-2 gap-1 border-green-500 text-green-500 hover:bg-green-500/10" onClick={handleResolveAll}>
                    <CheckCheck className="h-3 w-3" /> Mark All Complete
                  </Button>
                )}
              </div>
            </div>

            {loading ? (
              <div className="text-sm text-muted-foreground">Loading comments...</div>
            ) : visibleComments.length === 0 ? (
              <div className="text-sm text-muted-foreground">No revision notes yet. Pause the video and add one.</div>
            ) : (
              <div className="flex flex-col gap-2">
                {visibleComments.map((c) => (
                  <div
                    key={c.id}
                    className={`rounded-lg p-3 border-l-[3px] ${c.resolved ? 'opacity-40 bg-muted/20' : c.internal_only ? 'bg-amber-500/5 border border-amber-500/20 shadow-sm' : 'bg-card border border-border/60 shadow-sm'}`}
                    style={{ borderLeftColor: c.resolved ? '#10b981' : c.internal_only ? '#f59e0b' : (ROLE_COLORS[c.author_role] || '#888') }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {c.internal_only && (
                          <span className="flex items-center gap-0.5 text-[9px] font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded-full whitespace-nowrap">
                            <Lock className="h-2.5 w-2.5" /> Internal
                          </span>
                        )}
                        {c.timestamp_seconds !== null ? (
                          <button
                            className="text-xs font-semibold font-mono hover:underline whitespace-nowrap"
                            style={{ color: ROLE_COLORS[c.author_role] || '#888' }}
                            onClick={() => canSeek && c.source_ref === (sources.length > 1 ? activeSource?.label : c.source_ref) && seekTo(c.timestamp_seconds!)}
                          >
                            {formatTimestamp(c.timestamp_seconds)} {canSeek ? '— Jump' : ''}
                          </button>
                        ) : (
                          <span className="text-xs font-semibold text-muted-foreground">General note</span>
                        )}
                        {sources.length > 1 && c.source_ref && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground truncate max-w-[80px]">{c.source_ref}</span>
                        )}
                      </div>
                      {c.resolved ? (
                        canResolve ? (
                          <button className="text-xs text-green-500 flex items-center gap-1 hover:text-amber-500 transition-colors whitespace-nowrap" onClick={() => handleResolve(c.id, false)}>
                            <Check className="h-3 w-3" /> Resolved
                          </button>
                        ) : (
                          <span className="text-xs text-green-500 flex items-center gap-1 whitespace-nowrap"><Check className="h-3 w-3" /> Resolved</span>
                        )
                      ) : canResolve ? (
                        <Button variant="ghost" size="sm" className="h-5 text-[10px] px-2 whitespace-nowrap" onClick={() => handleResolve(c.id, true)}>Mark Resolved</Button>
                      ) : null}
                    </div>

                    {editingId === c.id ? (
                      <div className="flex gap-1.5 mt-1">
                        <Input autoFocus value={editText} onChange={(e) => setEditText(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') handleEditComment(c.id); if (e.key === 'Escape') setEditingId(null); }}
                          className="h-7 text-sm" />
                        <Button size="sm" className="h-7 text-xs px-2" onClick={() => handleEditComment(c.id)}>Save</Button>
                        <Button size="sm" variant="ghost" className="h-7 text-xs px-2" onClick={() => setEditingId(null)}>Cancel</Button>
                      </div>
                    ) : (
                      <p className="text-sm mt-1 cursor-pointer rounded px-1 -mx-1 hover:bg-muted/40 transition-colors break-all"
                        onDoubleClick={() => { setEditingId(c.id); setEditText(c.comment); }}
                        title="Double-click to edit"
                      >
                        {c.comment.split(/(https?:\/\/[^\s]+)/g).map((part, idx) =>
                          /^https?:\/\//.test(part)
                            ? <a key={idx} href={part} target="_blank" rel="noopener noreferrer" className="text-primary underline hover:opacity-80" onClick={e => e.stopPropagation()}>{part}</a>
                            : part
                        )}
                      </p>
                    )}
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground mt-1">
                      <span>{c.author_name} ({c.author_role}) · {timeAgo(c.created_at)}</span>
                      {isAdmin && (
                        <button onClick={() => handleDeleteComment(c.id)} className="text-muted-foreground hover:text-destructive transition-colors p-0.5" title="Delete note">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
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
