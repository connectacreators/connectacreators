import { useState, useEffect, useRef, useMemo } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/useAuth';
import { useIsMobile } from '@/hooks/use-mobile';
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
  clientId: string;
  title: string;
  uploadSource: string | null;
  storagePath: string | null;
  fileSubmissionUrl: string | null;
  associatedFootage?: string | null;
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

// "1:23-1:45", "1:23 – 1:45", "1:23 to 1:45" → { start, end }. Falls back to
// a single timestamp with end=null. End must be after start to count.
function parseTimestampRange(input: string): { start: number; end: number | null } | null {
  const m = input.trim().match(/^(.+?)\s*(?:-|–|—|\bto\b)\s*(.+)$/i);
  if (m) {
    const start = parseTimestamp(m[1]);
    const end = parseTimestamp(m[2]);
    if (start != null) return { start, end: end != null && end > start ? end : null };
  }
  const single = parseTimestamp(input);
  return single != null ? { start: single, end: null } : null;
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

function parseFootageList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const trimmed = raw.trim();
  if (trimmed.startsWith('[')) {
    try { return (JSON.parse(trimmed) as string[]).filter(Boolean); } catch { return []; }
  }
  return [trimmed].filter(Boolean);
}

// Footage files are categorized by extension (storage `list` gives us no MIME).
// Mirrors FootagePanel's classification so the reference preview renders the
// right element — a player for video, an <img> for stills.
const FOOTAGE_IMAGE_EXTS = ['.png', '.webp', '.jpg', '.jpeg', '.gif', '.avif', '.heic', '.heif', '.bmp', '.svg'];
function footageIsImage(name: string): boolean {
  const lower = name.toLowerCase();
  return FOOTAGE_IMAGE_EXTS.some(ext => lower.endsWith(ext));
}

// Renders a note body with two kinds of inline links:
//   • plain URLs  → open in a new tab
//   • @footage    → clickable button that opens the footage preview (only when
//                   the filename matches a real file in this edit's storage)
// A single tokenizer pass handles both so neither clobbers the other.
function renderCommentWithFootageLinks(comment: string, footage: string[], onFootageClick: (filename: string) => void): React.ReactNode {
  const footageSet = new Set(footage);
  const parts: React.ReactNode[] = [];
  const regex = /(https?:\/\/[^\s]+)|@([A-Za-z0-9_\-.]+)/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(comment)) !== null) {
    const url = match[1];
    const filename = match[2];

    // A footage mention only becomes a button when it names a real file;
    // otherwise leave the literal "@text" in place (don't drop it).
    if (filename && !footageSet.has(filename)) continue;

    if (match.index > lastIndex) parts.push(comment.slice(lastIndex, match.index));

    if (url) {
      parts.push(
        <a
          key={`url-${match.index}`}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline hover:opacity-80"
          onClick={(e) => e.stopPropagation()}
        >
          {url}
        </a>
      );
    } else {
      parts.push(
        <button
          key={`footage-${match.index}`}
          onClick={(e) => { e.stopPropagation(); onFootageClick(filename); }}
          className="text-primary hover:underline font-medium"
        >
          @{filename}
        </button>
      );
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < comment.length) parts.push(comment.slice(lastIndex));
  return parts;
}

export default function VideoReviewModal({
  open,
  onClose,
  videoEditId,
  clientId,
  title,
  uploadSource,
  storagePath,
  fileSubmissionUrl,
  associatedFootage,
  onCommentsChanged,
  onStatusChanged,
}: VideoReviewModalProps) {
  const { user, isAdmin, isVideographer, isEditor } = useAuth();
  const canResolve = isAdmin || isVideographer || isEditor;
  const isMobile = useIsMobile();
  // On mobile the video and notes share a tabbed view (full-width each); desktop keeps both side-by-side.
  const [mobileTab, setMobileTab] = useState<'video' | 'notes'>('video');
  const videoRef = useRef<HTMLVideoElement>(null);
  const [comments, setComments] = useState<RevisionComment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [manualTimestamp, setManualTimestamp] = useState('');
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPaused, setIsPaused] = useState(true);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [footagePreviewOpen, setFootagePreviewOpen] = useState(false);
  const [selectedFootageFile, setSelectedFootageFile] = useState<string | null>(null);
  const [footagePreviewUrl, setFootagePreviewUrl] = useState<string | null>(null);
  const [footagePreviewLoading, setFootagePreviewLoading] = useState(false);
  const [footageDownloading, setFootageDownloading] = useState(false);
  const [showFootageAutocomplete, setShowFootageAutocomplete] = useState(false);
  const [footageSearchQuery, setFootageSearchQuery] = useState('');
  const [showEditAutocomplete, setShowEditAutocomplete] = useState(false);
  const [editSearchQuery, setEditSearchQuery] = useState('');
  const [availableFootageFiles, setAvailableFootageFiles] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [internalOnly, setInternalOnly] = useState(false);
  // Range mode: double-click the timestamp chip locks the start; the end chip
  // follows the playhead until clicked (rangeEnd null = still following).
  const [rangeStart, setRangeStart] = useState<number | null>(null);
  const [rangeEnd, setRangeEnd] = useState<number | null>(null);
  // Double-clicking a saved note's timestamp picks/updates its END point:
  // the note's end chip follows the playhead until clicked to save.
  const [pickingEndFor, setPickingEndFor] = useState<string | null>(null);

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

    // The review modal shows the editor's FINAL SUBMISSION only. storage_path is
    // the raw source footage (multi-GB original, often not browser-playable), so
    // we deliberately do NOT fall back to it — otherwise a video with no
    // submission would silently play raw footage. When there's no submission the
    // player shows a clear "No file submission yet" empty state instead.

    setSources(list);
    // Version arrays are stored oldest-first, so default to the NEWEST version
    // (the last entry labelled V#). Ignore trailing external "Link N" items.
    let defaultIdx = 0;
    for (let i = list.length - 1; i >= 0; i--) {
      if (/^V\d+$/.test(list[i].label)) { defaultIdx = i; break; }
    }
    setActiveIdx(defaultIdx);
    setVideoUrl(null);
    setCurrentTime(0);
    setDuration(0);
    setIsPaused(true);
    setRangeStart(null);
    setRangeEnd(null);
    setPickingEndFor(null);
    setMobileTab('video');
  }, [open, fileSubmissionUrl, storagePath]);

  // Load signed URL when active source is supabase. Playback uses the fast
  // 720p proxy when ready (downloads still pull the original — see handleDownload).
  useEffect(() => {
    if (!activeSource || activeSource.type !== 'supabase') { setVideoUrl(null); return; }
    videoUploadService.getPlaybackVideoUrl(activeSource.rawUrl)
      .then(setVideoUrl)
      .catch(() => setVideoUrl(null));
  }, [activeSource]);

  // Reset playback state when switching sources
  const switchSource = (idx: number) => {
    setActiveIdx(idx);
    setCurrentTime(0);
    setDuration(0);
    setIsPaused(true);
    setRangeStart(null);
    setRangeEnd(null);
    setPickingEndFor(null);
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

  // Load actual footage files from storage
  useEffect(() => {
    if (!open || !videoEditId || !clientId) return;
    const loadFootage = async () => {
      try {
        const { data, error } = await supabase.storage
          .from('footage')
          .list(`${clientId}/${videoEditId}/`, { limit: 1000 });
        if (error) throw error;
        const files = (data || [])
          .filter(f => f.name && !f.name.endsWith('/'))
          .map(f => f.name)
          .sort();
        setAvailableFootageFiles(files);
      } catch (err) {
        console.warn('Failed to load footage files:', err);
        setAvailableFootageFiles([]);
      }
    };
    loadFootage();
  }, [open, videoEditId, clientId]);

  const filteredFootage = useMemo(() => {
    if (!footageSearchQuery) return availableFootageFiles;
    return availableFootageFiles.filter(f => f.toLowerCase().includes(footageSearchQuery.toLowerCase()));
  }, [availableFootageFiles, footageSearchQuery]);

  // Resolve a playback URL for the referenced footage when its preview opens.
  // Playback uses the proxy-aware resolver (fast 720p when ready); the Download
  // button pulls the full-res original separately — never reuse one for both.
  useEffect(() => {
    if (!footagePreviewOpen || !selectedFootageFile) { setFootagePreviewUrl(null); return; }
    let cancelled = false;
    setFootagePreviewLoading(true);
    setFootagePreviewUrl(null);
    const path = `${clientId}/${videoEditId}/${selectedFootageFile}`;
    const resolver = footageIsImage(selectedFootageFile)
      ? videoUploadService.getSignedVideoUrl(path)
      : videoUploadService.getPlaybackVideoUrl(path);
    resolver
      .then(url => { if (!cancelled) setFootagePreviewUrl(url); })
      .catch(() => { if (!cancelled) toast.error('Failed to load footage'); })
      .finally(() => { if (!cancelled) setFootagePreviewLoading(false); });
    return () => { cancelled = true; };
  }, [footagePreviewOpen, selectedFootageFile, clientId, videoEditId]);

  const handleFootageDownload = async () => {
    if (!selectedFootageFile) return;
    setFootageDownloading(true);
    try {
      const path = `${clientId}/${videoEditId}/${selectedFootageFile}`;
      const url = await videoUploadService.getDownloadVideoUrl(path, selectedFootageFile);
      const a = document.createElement('a');
      a.href = url;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch {
      toast.error('Download failed');
    } finally {
      setFootageDownloading(false);
    }
  };

  // --- @-mention footage autocomplete (shared by the new-note input and the
  // inline edit input). `computeAtQuery` returns the partial filename being
  // typed after a trailing "@", or null when no active mention. `insertFootageInto`
  // replaces that partial token with the chosen filename. ---
  const computeAtQuery = (value: string): string | null => {
    const lastAtIndex = value.lastIndexOf('@');
    if (lastAtIndex === -1) return null;
    const afterAt = value.substring(lastAtIndex + 1);
    if (afterAt.includes(' ') || afterAt.length >= 50) return null;
    return afterAt;
  };

  const insertFootageInto = (value: string, filename: string): string => {
    const lastAtIndex = value.lastIndexOf('@');
    if (lastAtIndex === -1) return value;
    const beforeAt = value.substring(0, lastAtIndex);
    const afterAt = value.substring(lastAtIndex + 1);
    const afterAtEndIndex = afterAt.search(/\s/);
    const afterEnd = afterAtEndIndex === -1 ? '' : afterAt.substring(afterAtEndIndex);
    return `${beforeAt}@${filename}${afterEnd}`;
  };

  const handleCommentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setNewComment(value);
    const query = computeAtQuery(value);
    if (query !== null) {
      setFootageSearchQuery(query);
      setShowFootageAutocomplete(availableFootageFiles.length > 0);
    } else {
      setShowFootageAutocomplete(false);
    }
  };

  const insertFootage = (filename: string) => {
    setNewComment(prev => insertFootageInto(prev, filename));
    setShowFootageAutocomplete(false);
    setFootageSearchQuery('');
  };

  const handleEditTextChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const value = e.target.value;
    setEditText(value);
    const query = computeAtQuery(value);
    if (query !== null) {
      setEditSearchQuery(query);
      setShowEditAutocomplete(availableFootageFiles.length > 0);
    } else {
      setShowEditAutocomplete(false);
    }
  };

  const insertFootageIntoEdit = (filename: string) => {
    setEditText(prev => insertFootageInto(prev, filename));
    setShowEditAutocomplete(false);
    setEditSearchQuery('');
  };

  const filteredEditFootage = useMemo(() => {
    if (!editSearchQuery) return availableFootageFiles;
    return availableFootageFiles.filter(f => f.toLowerCase().includes(editSearchQuery.toLowerCase()));
  }, [availableFootageFiles, editSearchQuery]);

  const isActiveSupabase = activeSource?.type === 'supabase' && !!videoUrl;
  const isActiveDrive = activeSource?.type === 'drive' && !!activeSource.driveId;
  // Can seek only when ThemedVideoPlayer is active (Supabase sources)
  const canSeek = isActiveSupabase;

  const handleDownload = async () => {
    if (!activeSource) return;
    setDownloading(true);
    const filename = `${(title || 'video').replace(/[^a-zA-Z0-9_\- ]/g, '')}.mp4`;
    let url: string | null = null;
    try {
      if (activeSource.type === 'supabase')
        // Sign the ORIGINAL (footage) with a Content-Disposition: attachment so
        // the browser streams it straight to disk. Do NOT fetch()+blob() it —
        // that buffers the whole file in memory and OOMs on large originals
        // (600MB+ footage), which is what made "Download failed" fire.
        url = await videoUploadService.getDownloadVideoUrl(activeSource.rawUrl, filename);
      else if (activeSource.type === 'drive' && activeSource.driveId)
        url = `https://drive.google.com/uc?export=download&id=${activeSource.driveId}`;
      else url = activeSource.rawUrl;
    } catch {
      url = null;
    }
    if (!url) { setDownloading(false); toast.error('Download failed'); return; }
    try {
      // Anchor navigation to an attachment URL downloads without buffering and
      // without a cross-origin fetch (Google Drive sends no CORS headers).
      const a = document.createElement('a');
      a.href = url;
      a.download = filename; // honored same-origin; the CD header forces it cross-origin
      a.rel = 'noopener';
      document.body.appendChild(a); a.click();
      document.body.removeChild(a);
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
    let endTimestampSeconds: number | null = null;
    let commentBody = newComment.trim();

    if (canSeek) {
      if (rangeStart !== null) {
        // Range mode: locked end wins; otherwise take the current playhead.
        // An end that isn't past the start degrades to a plain point note.
        timestampSeconds = rangeStart;
        const endCandidate = rangeEnd ?? Math.floor(currentTime);
        endTimestampSeconds = endCandidate > rangeStart ? endCandidate : null;
      } else {
        timestampSeconds = isPaused ? Math.floor(currentTime) : null;
      }
    } else {
      // First try the dedicated timestamp input ("1:23" or "1:23-1:45").
      if (manualTimestamp.trim()) {
        const range = parseTimestampRange(manualTimestamp);
        if (range) {
          timestampSeconds = range.start;
          endTimestampSeconds = range.end;
        }
      }
      // If no explicit timestamp but the comment STARTS with a time token,
      // extract it. Supported: "1:23", "@1:23", "at 1:23", "01:23:45",
      // and ranges like "1:23-1:45" / "1:23 to 1:45".
      if (timestampSeconds == null) {
        const leading = commentBody.match(/^\s*(?:@|at\s+)?(\d{1,2}(?::\d{2}){1,2}(?:\s*(?:-|–|—|to)\s*\d{1,2}(?::\d{2}){1,2})?)\b[\s\-—:,.]*/i);
        if (leading) {
          const range = parseTimestampRange(leading[1]);
          if (range) {
            timestampSeconds = range.start;
            endTimestampSeconds = range.end;
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
        end_timestamp_seconds: endTimestampSeconds,
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
      setRangeStart(null);
      setRangeEnd(null);
      if (isMobile) setMobileTab('notes'); // surface the note that just landed
      await supabase.from('video_edits').update({ status: 'Needs Revision' }).eq('id', videoEditId);
      onStatusChanged?.('Needs Revision');
      onCommentsChanged?.();
    } catch { toast.error('Failed to add comment'); }
  };

  const handleSaveEnd = async (c: RevisionComment) => {
    const start = c.timestamp_seconds ?? 0;
    const end = Math.floor(currentTime);
    if (end <= start) {
      toast.info('Play or scrub past the start point, then click to save the end');
      return;
    }
    try {
      await revisionCommentService.updateEndTimestamp(c.id, end);
      setComments(prev => prev.map(x => x.id === c.id ? { ...x, end_timestamp_seconds: end } : x));
      setPickingEndFor(null);
      onCommentsChanged?.();
    } catch { toast.error('Failed to set end point'); }
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

  // Frame.io-style comment markers: an avatar chip (commenter's initial, role
  // color) sits just BELOW the timeline, with a bracket line spanning ranged
  // notes. IMPORTANT: the chip JSX is inlined (not a component defined in
  // render) — an inline component gets a new identity every render, so React
  // remounted every chip on each seek and the pop-in animation replayed, which
  // read as "all the dots jump when you click one". Inlined + stable keys =
  // the pop-in plays exactly once, and clicking one chip only seeks the video.
  const markerColor = (c: typeof visibleComments[number]) =>
    c.resolved ? '#10b981' : (ROLE_COLORS[c.author_role] || '#f59e0b');
  const initialOf = (name: string | null) => (name?.trim()?.[0] || '•').toUpperCase();
  const chip = (c: typeof visibleComments[number], atSeconds: number, isEnd: boolean) => {
    const rangeLabel = c.end_timestamp_seconds != null
      ? `${formatTimestamp(c.timestamp_seconds!)} – ${formatTimestamp(c.end_timestamp_seconds!)}`
      : formatTimestamp(atSeconds);
    // Edge-aware popover: a centered card clips at the player edges (a note at
    // 0:00 lost its left half). Anchor the card to the chip's side near the ends.
    const pct = (atSeconds / duration) * 100;
    const popStyle: React.CSSProperties =
      pct < 14 ? { left: 0, transform: 'none' }
      : pct > 86 ? { right: 0, transform: 'none' }
      : { left: '50%', transform: 'translateX(-50%)' };
    return (
      <div
        key={isEnd ? `end-${c.id}` : c.id}
        className="group"
        style={{
          position: 'absolute',
          left: `${(atSeconds / duration) * 100}%`,
          top: 12, transform: 'translateX(-50%)',
          zIndex: 4, cursor: 'pointer',
        }}
        onClick={(e) => { e.stopPropagation(); seekTo(atSeconds); }}
      >
        <div
          className="review-marker-chip transition-transform group-hover:scale-125"
          style={{
            width: 18, height: 18, borderRadius: '50%',
            background: markerColor(c),
            border: '2px solid #fff',
            boxShadow: '0 2px 6px rgba(0,0,0,0.55)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: isEnd ? 11 : 9, fontWeight: 700, color: '#fff', lineHeight: 1,
            opacity: isEnd ? 0.9 : 1,
          }}
        >
          {isEnd ? '›' : initialOf(c.author_name)}
        </div>
        {/* Hover popover — timestamp + the note itself, Frame.io-style */}
        <div
          className="hidden group-hover:block absolute bottom-full mb-2 w-56 pointer-events-none z-50"
          style={popStyle}
        >
          <div className="rounded-lg bg-popover border border-border shadow-xl px-3 py-2 text-left">
            <div className="text-[10px] font-mono font-semibold mb-1" style={{ color: markerColor(c) }}>
              {rangeLabel}
            </div>
            <div className="text-xs text-foreground leading-snug line-clamp-4">{c.comment}</div>
            {c.author_name && (
              <div className="text-[10px] text-muted-foreground mt-1">{c.author_name}</div>
            )}
          </div>
        </div>
      </div>
    );
  };
  const progressOverlay = duration > 0 ? (
    <>
      {/* Range bracket — a thin rounded line just under the bar, start→end */}
      {visibleComments.filter(c => c.timestamp_seconds !== null && c.end_timestamp_seconds !== null && (isAdmin || !c.internal_only)).map(c => (
        <div
          key={`range-${c.id}`}
          className="review-marker-range"
          style={{
            position: 'absolute',
            left: `${((c.timestamp_seconds ?? 0) / duration) * 100}%`,
            width: `${(((c.end_timestamp_seconds ?? 0) - (c.timestamp_seconds ?? 0)) / duration) * 100}%`,
            // Passes through the dot centers: chip top 12 + half of 18 = 21.
            top: 20, height: 2, borderRadius: 1,
            cursor: 'pointer',
            backgroundColor: markerColor(c),
            zIndex: 2,
          }}
          onClick={(e) => { e.stopPropagation(); seekTo(c.timestamp_seconds!); }}
        />
      ))}
      {/* One avatar chip per note, at its start. For ranged notes the line
          alone marks the end — no end-cap dot. */}
      {visibleComments.filter(c => c.timestamp_seconds !== null && (isAdmin || !c.internal_only)).map(c => chip(c, c.timestamp_seconds!, false))}
    </>
  ) : undefined;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className={`flex flex-col p-0 gap-0 [&>button:last-child]:hidden ${isMobile ? 'w-screen h-[100dvh] max-w-none rounded-none border-0' : 'max-w-[92rem] w-[96vw] h-[92vh]'}`}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h2 className="text-lg font-semibold truncate">{title || 'Video Review'}</h2>
          <div className="flex items-center gap-1">
            {activeSource && (
              <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-muted-foreground hover:text-foreground" onClick={handleDownload} disabled={downloading}>
                {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                {!isMobile && (downloading ? 'Downloading...' : 'Download')}
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Body */}
        <div className={`flex flex-1 overflow-hidden min-h-0 ${isMobile ? 'flex-col' : ''}`}>
          {/* Mobile tab bar — Video / Notes */}
          {isMobile && (
            <div className="flex shrink-0 border-b">
              <button
                onClick={() => setMobileTab('video')}
                className={`flex-1 py-2.5 text-sm font-medium transition-colors ${mobileTab === 'video' ? 'text-foreground border-b-2 border-primary' : 'text-muted-foreground'}`}
              >
                Video
              </button>
              <button
                onClick={() => setMobileTab('notes')}
                className={`flex-1 py-2.5 text-sm font-medium transition-colors ${mobileTab === 'notes' ? 'text-foreground border-b-2 border-primary' : 'text-muted-foreground'}`}
              >
                Notes · {visibleComments.length}
                {resolvedCount > 0 && <span className="text-green-500"> ({resolvedCount}✓)</span>}
              </button>
            </div>
          )}

          {/* Left: Video */}
          <div className={`flex flex-col p-4 overflow-hidden ${isMobile ? (mobileTab === 'video' ? 'flex-1 w-full' : 'hidden') : 'flex-[5] border-r'}`}>

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

            {/* Player area — fills the column height (Frame.io-style dominant
                video); no 60vh cap so a portrait reel gets the full modal. */}
            <div className="w-full flex-1 min-h-0">
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
                <div className="w-full h-full rounded-lg overflow-hidden bg-black" style={{ border: '1px solid hsl(var(--aqua) / 0.2)' }}>
                  <iframe
                    src={`https://drive.google.com/file/d/${activeSource!.driveId}/preview`}
                    className="w-full h-full"
                    allow="autoplay"
                    sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
                  />
                </div>
              ) : activeSource?.type === 'external' ? (
                <div className="w-full h-full bg-black rounded-lg flex flex-col items-center justify-center gap-3" style={{ border: '1px solid hsl(var(--aqua) / 0.2)' }}>
                  <p className="text-sm text-muted-foreground">External link — open in browser</p>
                  <a href={activeSource.rawUrl} target="_blank" rel="noopener noreferrer" className="text-primary underline text-sm">{activeSource.rawUrl}</a>
                </div>
              ) : (
                <div className="w-full h-full bg-black rounded-lg flex items-center justify-center text-muted-foreground text-sm" style={{ border: '1px solid hsl(var(--aqua) / 0.2)' }}>
                  {sources.length === 0 ? 'No file submission yet' : 'No video available'}
                </div>
              )}
            </div>

            {/* Note input */}
            <div className="mt-3 flex gap-2 items-center">
              {canSeek && (isPaused || rangeStart !== null) && (
                rangeStart === null ? (
                  <button
                    type="button"
                    className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded font-mono whitespace-nowrap select-none"
                    title="Double-click to mark a start–end range"
                    onDoubleClick={() => { setRangeStart(Math.floor(currentTime)); setRangeEnd(null); }}
                  >
                    {formatTimestamp(currentTime)}
                  </button>
                ) : (
                  <div className="flex items-center gap-1 whitespace-nowrap">
                    <span className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded font-mono" title="Range start">
                      {formatTimestamp(rangeStart)}
                    </span>
                    <span className="text-xs text-muted-foreground">→</span>
                    <button
                      type="button"
                      className={`text-xs px-2 py-0.5 rounded font-mono border transition-colors ${
                        rangeEnd !== null
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'border-primary/60 text-primary animate-pulse'
                      }`}
                      title={rangeEnd !== null ? 'End locked — click to follow the playhead again' : 'Following playhead — play/scrub to the end, then click to lock it'}
                      onClick={() => {
                        if (rangeEnd !== null) { setRangeEnd(null); return; }
                        const t = Math.floor(currentTime);
                        if (t > rangeStart) setRangeEnd(t);
                        else toast.info('Play or scrub past the start point, then lock the end');
                      }}
                    >
                      {formatTimestamp(rangeEnd ?? Math.max(currentTime, rangeStart))}
                    </button>
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground p-0.5"
                      title="Clear range"
                      onClick={() => { setRangeStart(null); setRangeEnd(null); }}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                )
              )}
              {(!canSeek) && (
                <div className="relative">
                  <Clock className="absolute left-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-primary pointer-events-none" />
                  <Input
                    placeholder="1:23-1:45"
                    value={manualTimestamp}
                    onChange={(e) => setManualTimestamp(e.target.value)}
                    className="w-24 h-8 text-xs font-mono pl-6"
                    title="Optional — type the time from the Drive player (MM:SS), or a range like 1:23-1:45. You can also prefix your note with it."
                  />
                </div>
              )}
              <div className="relative flex-1">
                <Input
                  placeholder={
                    canSeek && rangeStart !== null
                      ? `Add note for ${formatTimestamp(rangeStart)} – ${formatTimestamp(rangeEnd ?? Math.max(currentTime, rangeStart))}...`
                      : canSeek && isPaused
                        ? `Add note at ${formatTimestamp(currentTime)}...`
                        : !canSeek
                          ? `Add revision note (prefix with 1:23 or 1:23-1:45 to set a time) or type @ for footage`
                          : 'Add revision note... (type @ for footage)'
                  }
                  value={newComment}
                  onChange={handleCommentChange}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddComment()}
                  className="flex-1 h-8 text-sm"
                />
                {showFootageAutocomplete && filteredFootage.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg z-50 max-h-40 overflow-y-auto">
                    {filteredFootage.map((footage) => (
                      <button
                        key={footage}
                        onClick={() => insertFootage(footage)}
                        className="w-full text-left px-3 py-2 hover:bg-muted transition-colors text-sm text-foreground"
                      >
                        @{footage}
                      </button>
                    ))}
                  </div>
                )}
              </div>
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
          <div className={`flex flex-col p-4 overflow-y-auto ${isMobile ? (mobileTab === 'notes' ? 'flex-1 w-full' : 'hidden') : 'flex-[2]'}`}>
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
                    <div className="flex items-center justify-between gap-2 flex-wrap gap-y-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {c.internal_only && (
                          <span className="flex items-center gap-0.5 text-[9px] font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded-full whitespace-nowrap">
                            <Lock className="h-2.5 w-2.5" /> Internal
                          </span>
                        )}
                        {c.timestamp_seconds !== null && pickingEndFor === c.id ? (
                          <div className="flex items-center gap-1 whitespace-nowrap">
                            <span className="text-xs font-semibold font-mono" style={{ color: ROLE_COLORS[c.author_role] || '#888' }}>
                              {formatTimestamp(c.timestamp_seconds)}
                            </span>
                            <span className="text-xs text-muted-foreground">→</span>
                            <button
                              className="text-xs px-1.5 py-0.5 rounded font-mono border border-primary/60 text-primary animate-pulse"
                              title="Following playhead — play/scrub to the end, then click to save it"
                              onClick={() => handleSaveEnd(c)}
                            >
                              {formatTimestamp(Math.max(currentTime, c.timestamp_seconds))}
                            </button>
                            <button
                              className="text-muted-foreground hover:text-foreground p-0.5"
                              title="Cancel"
                              onClick={() => setPickingEndFor(null)}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        ) : c.timestamp_seconds !== null ? (
                          <button
                            className="text-xs font-semibold font-mono hover:underline whitespace-nowrap"
                            style={{ color: ROLE_COLORS[c.author_role] || '#888' }}
                            title={canSeek ? 'Click to jump · double-click to set the end point' : undefined}
                            onClick={() => canSeek && c.source_ref === (sources.length > 1 ? activeSource?.label : c.source_ref) && seekTo(c.timestamp_seconds!)}
                            onDoubleClick={() => canSeek && setPickingEndFor(c.id)}
                          >
                            {formatTimestamp(c.timestamp_seconds)}{c.end_timestamp_seconds !== null ? ` – ${formatTimestamp(c.end_timestamp_seconds)}` : ''}
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
                      <div className="mt-1">
                        <div className="relative">
                          <Textarea autoFocus value={editText} onChange={handleEditTextChange}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleEditComment(c.id); }
                              if (e.key === 'Escape') { setEditingId(null); setShowEditAutocomplete(false); }
                            }}
                            rows={3}
                            className="text-sm min-h-[4.5rem] resize-y"
                            placeholder="Edit note… (Enter to save, Shift+Enter for a new line, @ for footage)" />
                          {showEditAutocomplete && filteredEditFootage.length > 0 && (
                            <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg z-50 max-h-40 overflow-y-auto">
                              {filteredEditFootage.map((footage) => (
                                <button
                                  key={footage}
                                  onClick={() => insertFootageIntoEdit(footage)}
                                  className="w-full text-left px-3 py-2 hover:bg-muted transition-colors text-sm text-foreground"
                                >
                                  @{footage}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="flex gap-1.5 mt-1.5 justify-end">
                          <Button size="sm" variant="ghost" className="h-7 text-xs px-2" onClick={() => { setEditingId(null); setShowEditAutocomplete(false); }}>Cancel</Button>
                          <Button size="sm" className="h-7 text-xs px-2" onClick={() => handleEditComment(c.id)}>Save</Button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm mt-1 cursor-pointer rounded px-1 -mx-1 hover:bg-muted/40 transition-colors break-words [overflow-wrap:anywhere]"
                        onDoubleClick={() => { setEditingId(c.id); setEditText(c.comment); }}
                        title="Double-click to edit"
                      >
                        {renderCommentWithFootageLinks(c.comment, availableFootageFiles, (filename) => {
                          setSelectedFootageFile(filename);
                          setFootagePreviewOpen(true);
                        })}
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

      {selectedFootageFile && (
        <Dialog open={footagePreviewOpen} onOpenChange={setFootagePreviewOpen}>
          <DialogContent className="max-w-2xl w-[95vw] p-0 gap-0 [&>button:last-child]:hidden overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <h2 className="text-sm font-semibold truncate font-mono">{selectedFootageFile}</h2>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                  onClick={handleFootageDownload}
                  disabled={footageDownloading}
                >
                  {footageDownloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  {footageDownloading ? 'Downloading...' : 'Download'}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setFootagePreviewOpen(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="p-4">
              {footagePreviewLoading ? (
                <div className="w-full aspect-video bg-black rounded-lg flex items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : !footagePreviewUrl ? (
                <div className="w-full aspect-video bg-black rounded-lg flex items-center justify-center text-muted-foreground text-sm">
                  Couldn't load this footage
                </div>
              ) : footageIsImage(selectedFootageFile) ? (
                <div className="w-full bg-black rounded-lg overflow-hidden flex items-center justify-center" style={{ maxHeight: '60vh' }}>
                  <img src={footagePreviewUrl} alt={selectedFootageFile} className="max-w-full max-h-[60vh] object-contain" />
                </div>
              ) : (
                <ThemedVideoPlayer src={footagePreviewUrl} maxHeight="60vh" />
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </Dialog>
  );
}
