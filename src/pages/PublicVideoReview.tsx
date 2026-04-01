import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { revisionCommentService, type RevisionComment } from '@/services/revisionCommentService';
import { videoUploadService } from '@/services/videoUploadService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Send, Play, Pause, Check } from 'lucide-react';
import { toast } from 'sonner';
import { Toaster as Sonner } from '@/components/ui/sonner';

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
  return null;
}

function extractGoogleDriveFileId(url: string): string | null {
  const m = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

const ROLE_COLORS: Record<string, string> = {
  admin: '#3b82f6',
  editor: '#8b5cf6',
  client: '#f59e0b',
};

export default function PublicVideoReview() {
  const { videoEditId } = useParams<{ videoEditId: string }>();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [video, setVideo] = useState<any>(null);
  const [comments, setComments] = useState<RevisionComment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [manualTimestamp, setManualTimestamp] = useState('');
  const [clientName, setClientName] = useState(() => localStorage.getItem('review_client_name') || '');
  const [nameSubmitted, setNameSubmitted] = useState(() => !!localStorage.getItem('review_client_name'));
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPaused, setIsPaused] = useState(true);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const isSupabaseVideo = video?.upload_source === 'supabase' && video?.storage_path;
  const isDriveVideo = video?.upload_source === 'gdrive' && video?.file_submission;
  const driveFileId = isDriveVideo ? extractGoogleDriveFileId(video.file_submission) : null;

  // Load video data
  useEffect(() => {
    if (!videoEditId) return;
    supabase
      .from('video_edits')
      .select('*')
      .eq('id', videoEditId)
      .is('deleted_at', null)
      .single()
      .then(({ data, error }) => {
        if (error || !data) {
          toast.error('Video not found');
          return;
        }
        setVideo(data);
      });
  }, [videoEditId]);

  // Load comments
  useEffect(() => {
    if (!videoEditId) return;
    setLoading(true);
    revisionCommentService.getCommentsByVideoEdit(videoEditId)
      .then(setComments)
      .catch(() => toast.error('Failed to load comments'))
      .finally(() => setLoading(false));
  }, [videoEditId]);

  // Load signed URL for Supabase videos
  useEffect(() => {
    if (!isSupabaseVideo || !video?.storage_path) return;
    videoUploadService.getSignedVideoUrl(video.storage_path)
      .then(setVideoUrl)
      .catch(() => toast.error('Failed to load video'));
  }, [isSupabaseVideo, video?.storage_path]);

  const sortedComments = useMemo(() => {
    const ts = comments.filter(c => c.timestamp_seconds !== null)
      .sort((a, b) => (a.timestamp_seconds ?? 0) - (b.timestamp_seconds ?? 0));
    const gen = comments.filter(c => c.timestamp_seconds === null);
    return [...ts, ...gen];
  }, [comments]);

  const handleSubmitName = () => {
    if (!clientName.trim()) return;
    localStorage.setItem('review_client_name', clientName.trim());
    setNameSubmitted(true);
  };

  const handleAddComment = async () => {
    if (!newComment.trim() || !videoEditId) return;

    let timestampSeconds: number | null = null;
    if (isSupabaseVideo && isPaused) {
      timestampSeconds = Math.floor(currentTime);
    } else if (isDriveVideo && manualTimestamp.trim()) {
      timestampSeconds = parseTimestamp(manualTimestamp);
    }

    try {
      const created = await revisionCommentService.createComment({
        video_edit_id: videoEditId,
        timestamp_seconds: timestampSeconds,
        comment: newComment.trim(),
        author_name: clientName,
        author_role: 'client',
      });
      setComments(prev => [...prev, created]);
      setNewComment('');
      setManualTimestamp('');
    } catch {
      toast.error('Failed to add comment');
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
    seekTo(((e.clientX - rect.left) / rect.width) * duration);
  };

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  // Name entry gate
  if (!nameSubmitted) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Sonner />
        <div className="bg-card rounded-xl p-8 shadow-lg max-w-sm w-full">
          <h2 className="text-xl font-semibold mb-2">Video Review</h2>
          <p className="text-sm text-muted-foreground mb-4">Enter your name to leave revision notes.</p>
          <Input
            placeholder="Your name"
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmitName()}
            className="mb-3"
          />
          <Button className="w-full" onClick={handleSubmitName} disabled={!clientName.trim()}>
            Continue to Review
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Sonner />
      <div className="max-w-6xl mx-auto p-4">
        <h1 className="text-2xl font-bold mb-4">{video?.reel_title || 'Video Review'}</h1>

        <div className="flex flex-col lg:flex-row gap-4">
          {/* Video Player */}
          <div className="flex-[3] flex flex-col">
            <div className="bg-black rounded-lg overflow-hidden aspect-video flex items-center justify-center">
              {isSupabaseVideo && videoUrl ? (
                <video
                  ref={videoRef}
                  src={videoUrl}
                  className="max-w-full max-h-full"
                  onTimeUpdate={() => videoRef.current && setCurrentTime(videoRef.current.currentTime)}
                  onLoadedMetadata={() => videoRef.current && setDuration(videoRef.current.duration)}
                  onPlay={() => setIsPaused(false)}
                  onPause={() => setIsPaused(true)}
                  onClick={() => {
                    if (!videoRef.current) return;
                    videoRef.current.paused ? videoRef.current.play() : videoRef.current.pause();
                  }}
                />
              ) : isDriveVideo && driveFileId ? (
                <iframe
                  src={`https://drive.google.com/file/d/${driveFileId}/preview`}
                  className="w-full h-full"
                  allow="autoplay"
                  sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
                />
              ) : (
                <div className="text-muted-foreground">No video available</div>
              )}
            </div>

            {/* Progress bar with markers (Supabase only) */}
            {isSupabaseVideo && videoUrl && (
              <>
                <div className="mt-3 relative cursor-pointer" onClick={handleProgressClick}>
                  <div className="w-full h-1.5 bg-muted rounded-full">
                    <div className="h-full bg-primary rounded-full" style={{ width: duration ? `${(currentTime / duration) * 100}%` : '0%' }} />
                  </div>
                  {duration > 0 && sortedComments.filter(c => c.timestamp_seconds !== null).map(c => (
                    <div
                      key={c.id}
                      className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-background cursor-pointer hover:scale-125 transition-transform"
                      style={{
                        left: `${((c.timestamp_seconds ?? 0) / duration) * 100}%`,
                        backgroundColor: c.resolved ? '#10b981' : (ROLE_COLORS[c.author_role] || '#888'),
                      }}
                      onClick={(e) => { e.stopPropagation(); seekTo(c.timestamp_seconds!); }}
                    />
                  ))}
                </div>
                <div className="flex items-center justify-between mt-2">
                  <Button variant="ghost" size="sm" onClick={() => {
                    if (!videoRef.current) return;
                    videoRef.current.paused ? videoRef.current.play() : videoRef.current.pause();
                  }}>
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
                <span className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded font-mono">
                  {formatTimestamp(currentTime)}
                </span>
              )}
              {isDriveVideo && (
                <Input placeholder="0:00" value={manualTimestamp} onChange={(e) => setManualTimestamp(e.target.value)} className="w-16 h-8 text-xs font-mono" />
              )}
              <Input
                placeholder="Add your revision note..."
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddComment()}
                className="flex-1 h-8 text-sm"
              />
              <Button size="sm" className="h-8" onClick={handleAddComment} disabled={!newComment.trim()}>
                <Send className="h-3.5 w-3.5 mr-1" /> Send
              </Button>
            </div>
          </div>

          {/* Comment Thread */}
          <div className="flex-[2] flex flex-col">
            <h3 className="text-sm font-semibold text-muted-foreground mb-3">
              REVISION NOTES ({comments.length})
            </h3>
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading...</p>
            ) : sortedComments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No notes yet. Pause the video and add one.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {sortedComments.map(c => (
                  <div
                    key={c.id}
                    className={`rounded-lg p-3 border-l-[3px] ${c.resolved ? 'opacity-50 bg-muted/30' : 'bg-muted/50'}`}
                    style={{ borderLeftColor: c.resolved ? '#10b981' : (ROLE_COLORS[c.author_role] || '#888') }}
                  >
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
                    {c.resolved && (
                      <span className="text-xs text-green-500 float-right flex items-center gap-1">
                        <Check className="h-3 w-3" /> Resolved
                      </span>
                    )}
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
      </div>
    </div>
  );
}
