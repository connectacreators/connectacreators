import { memo, useState, useEffect, useRef, useCallback } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import {
  Upload,
  Trash2,
  Mic,
  Eye,
  Play,
  Pause,
  FileImage,
  FileVideo,
  FileAudio,
  Loader2,
  X,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";
import {
  canvasMediaService,
  type CanvasMediaRecord,
  type SessionUsage,
} from "@/services/canvasMediaService";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MediaNodeData {
  mediaId?: string;
  fileName?: string;
  fileType?: "image" | "video" | "voice";
  mimeType?: string;
  fileSizeBytes?: number;
  storagePath?: string;
  signedUrl?: string;

  // Transcription
  audioTranscription?: string;
  visualTranscription?: any;
  transcriptionStatus?: "none" | "processing" | "done" | "error";

  // Standard callbacks
  onUpdate?: (updates: Partial<MediaNodeData>) => void;
  onDelete?: () => void;
  authToken?: string | null;
  clientId?: string | null;
  nodeId?: string;
  sessionId?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatUsage(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

const FILE_TYPE_ICON: Record<string, typeof FileImage> = {
  image: FileImage,
  video: FileVideo,
  voice: FileAudio,
};

// Signed URLs expire after 1 hour; consider stale at 55 minutes
const SIGNED_URL_TTL_MS = 55 * 60 * 1000;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const MediaNode = memo(({ data }: NodeProps) => {
  const d = data as MediaNodeData;

  // ─── Upload state ───
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadFileName, setUploadFileName] = useState<string | null>(null);
  const [uploadFileSize, setUploadFileSize] = useState<number | null>(null);

  // ─── Session usage ───
  const [usage, setUsage] = useState<SessionUsage | null>(null);

  // ─── Signed URL management ───
  const [signedUrl, setSignedUrl] = useState<string | null>(d.signedUrl || null);
  const signedUrlCreatedAt = useRef<number>(d.signedUrl ? Date.now() : 0);

  // ─── Transcription UI ───
  const [showTranscript, setShowTranscript] = useState(false);
  const [transcribing, setTranscribing] = useState(
    d.transcriptionStatus === "processing"
  );

  // ─── Drag state ───
  const [dragOver, setDragOver] = useState(false);

  // ─── Delete confirm ───
  const [confirmDelete, setConfirmDelete] = useState(false);

  // ─── Audio/video play state ───
  const [playing, setPlaying] = useState(false);
  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ─── Fetch session usage on mount (empty state) ───
  useEffect(() => {
    if (!d.mediaId && d.sessionId) {
      canvasMediaService
        .getSessionUsage(d.sessionId)
        .then(setUsage)
        .catch(() => {});
    }
  }, [d.mediaId, d.sessionId]);

  // ─── Refresh signed URL on mount if we have a storagePath but no URL ───
  useEffect(() => {
    if (d.storagePath && !signedUrl) {
      refreshSignedUrl();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshSignedUrl = useCallback(async () => {
    if (!d.storagePath) return null;
    try {
      const url = await canvasMediaService.getSignedUrl(d.storagePath);
      setSignedUrl(url);
      signedUrlCreatedAt.current = Date.now();
      d.onUpdate?.({ signedUrl: url });
      return url;
    } catch (err) {
      console.error("[MediaNode] Failed to refresh signed URL:", err);
      return null;
    }
  }, [d.storagePath, d.onUpdate]);

  const ensureFreshUrl = useCallback(async (): Promise<string | null> => {
    if (
      signedUrl &&
      Date.now() - signedUrlCreatedAt.current < SIGNED_URL_TTL_MS
    ) {
      return signedUrl;
    }
    return refreshSignedUrl();
  }, [signedUrl, refreshSignedUrl]);

  // ─── File upload handler ───
  const handleFiles = async (files: FileList | File[]) => {
    const file = files[0];
    if (!file) return;

    if (!d.sessionId || !d.clientId || !d.nodeId) {
      toast.error("Missing session info — cannot upload.");
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    setUploadFileName(file.name);
    setUploadFileSize(file.size);

    try {
      const record: CanvasMediaRecord = await canvasMediaService.uploadMedia(
        file,
        d.sessionId,
        d.clientId,
        d.nodeId,
        (pct) => setUploadProgress(pct)
      );

      // Get signed URL for immediate display
      const url = await canvasMediaService.getSignedUrl(record.storage_path);
      setSignedUrl(url);
      signedUrlCreatedAt.current = Date.now();

      d.onUpdate?.({
        mediaId: record.id,
        fileName: record.file_name,
        fileType: record.file_type as "image" | "video" | "voice",
        mimeType: record.mime_type,
        fileSizeBytes: record.file_size_bytes,
        storagePath: record.storage_path,
        signedUrl: url,
        transcriptionStatus: "none",
      });

      toast.success(`Uploaded ${record.file_name}`);
    } catch (err: any) {
      toast.error(err.message || "Upload failed");
    } finally {
      setUploading(false);
      setUploadFileName(null);
      setUploadFileSize(null);
      setUploadProgress(0);
    }
  };

  // ─── Drag & drop handlers ───
  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  };
  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    if (e.dataTransfer.files?.length) {
      handleFiles(e.dataTransfer.files);
    }
  };

  // ─── Delete handler ───
  const handleDelete = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    try {
      if (d.mediaId && d.storagePath) {
        await canvasMediaService.deleteMedia(d.mediaId, d.storagePath);
      }
      toast.success("Media deleted");
      d.onDelete?.();
    } catch (err: any) {
      toast.error(err.message || "Delete failed");
    }
    setConfirmDelete(false);
  };

  // ─── Transcription handler ───
  const triggerTranscription = async (
    mode: "audio" | "visual" | "both"
  ) => {
    if (!d.mediaId || !d.authToken) {
      toast.error("Cannot transcribe — missing media info or auth.");
      return;
    }

    setTranscribing(true);
    d.onUpdate?.({ transcriptionStatus: "processing" });

    try {
      const res = await fetch(
        `${SUPABASE_URL}/functions/v1/transcribe-canvas-media`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${d.authToken}`,
          },
          body: JSON.stringify({ media_id: d.mediaId, mode }),
        }
      );

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Transcription failed");

      const updates: Partial<MediaNodeData> = {
        transcriptionStatus: "done",
      };
      if (json.audio_transcription) {
        updates.audioTranscription = json.audio_transcription;
      }
      if (json.visual_transcription) {
        updates.visualTranscription = json.visual_transcription;
      }

      d.onUpdate?.(updates);
      toast.success("Transcription complete");
    } catch (err: any) {
      toast.error(err.message || "Transcription failed");
      d.onUpdate?.({ transcriptionStatus: "error" });
    } finally {
      setTranscribing(false);
    }
  };

  // ─── Play/pause for video & audio ───
  const togglePlay = async () => {
    const url = await ensureFreshUrl();
    if (!url) {
      toast.error("Could not load media URL");
      return;
    }
    // Update src if URL refreshed
    if (mediaRef.current && mediaRef.current.src !== url) {
      mediaRef.current.src = url;
    }
    if (playing) {
      mediaRef.current?.pause();
      setPlaying(false);
    } else {
      mediaRef.current?.play();
      setPlaying(true);
    }
  };

  // ─── Determine current state ───
  const isUploaded = !!d.mediaId;
  const isEmpty = !isUploaded && !uploading;
  const fileType = d.fileType;
  const hasAudioTranscription = !!d.audioTranscription;
  const hasVisualTranscription = !!d.visualTranscription;
  const hasAnyTranscription = hasAudioTranscription || hasVisualTranscription;
  const isProcessing = transcribing || d.transcriptionStatus === "processing";

  const TypeIcon = fileType ? FILE_TYPE_ICON[fileType] || Upload : Upload;

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div
      className="glass-card rounded-2xl shadow-xl relative"
      style={{ width: 280 }}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-primary !border-primary/70"
      />

      {/* ═══════════ STATE 1: Empty — Drop zone ═══════════ */}
      {isEmpty && (
        <>
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2.5 bg-[rgba(8,145,178,0.08)] border-b border-[rgba(8,145,178,0.15)]">
            <div className="flex items-center gap-2">
              <Upload className="w-3.5 h-3.5 text-primary" />
              <span className="text-xs font-semibold text-primary/80">
                Media Upload
              </span>
            </div>
            {d.onDelete && (
              <button
                onClick={d.onDelete}
                className="nodrag p-0.5 rounded hover:bg-red-500/20 text-muted-foreground hover:text-red-400 transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          <div className="p-3 space-y-2.5">
            {/* Drop zone */}
            <div
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`nodrag cursor-pointer flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed py-6 px-4 transition-colors ${
                dragOver
                  ? "border-primary bg-primary/10"
                  : "border-border/50 hover:border-primary/40 hover:bg-muted/20"
              }`}
            >
              <Upload
                className={`w-6 h-6 ${
                  dragOver ? "text-primary" : "text-muted-foreground/50"
                }`}
              />
              <span className="text-xs text-muted-foreground/70 text-center">
                Drop file here or click to browse
              </span>
              <span className="text-[10px] text-muted-foreground/40">
                Images &middot; Videos &middot; Voice Notes
              </span>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*,audio/*"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.length) handleFiles(e.target.files);
                }}
              />
            </div>

            {/* Session usage bar */}
            {usage && (
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[10px] text-muted-foreground/60">
                  <span>Session storage</span>
                  <span>
                    {formatUsage(usage.used)} / {formatUsage(usage.limit)}
                  </span>
                </div>
                <Progress
                  value={Math.min(
                    100,
                    (usage.used / usage.limit) * 100
                  )}
                  className="h-1.5"
                />
              </div>
            )}
          </div>
        </>
      )}

      {/* ═══════════ STATE 2: Uploading ═══════════ */}
      {uploading && (
        <>
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2.5 bg-[rgba(8,145,178,0.08)] border-b border-[rgba(8,145,178,0.15)]">
            <div className="flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />
              <span className="text-xs font-semibold text-primary/80">
                Uploading...
              </span>
            </div>
          </div>

          <div className="p-3 space-y-2.5">
            <Progress value={uploadProgress} className="h-2" />
            <div className="flex items-center justify-between text-[10px] text-muted-foreground/70">
              <span className="truncate max-w-[180px]">
                {uploadFileName || "File"}
              </span>
              <span>{uploadProgress}%</span>
            </div>
            {uploadFileSize !== null && (
              <span className="text-[10px] text-muted-foreground/50">
                {formatFileSize(uploadFileSize)}
              </span>
            )}
          </div>
        </>
      )}

      {/* ═══════════ STATE 3: Uploaded ═══════════ */}
      {isUploaded && (
        <>
          {/* ─── IMAGE ─── */}
          {fileType === "image" && (
            <>
              {/* Image preview */}
              {signedUrl && (
                <div className="relative">
                  <img
                    src={signedUrl}
                    alt={d.fileName || "Uploaded image"}
                    className="w-full rounded-t-2xl object-cover"
                    style={{ maxHeight: 280 }}
                    onError={() => {
                      // Try refreshing signed URL on error
                      refreshSignedUrl();
                    }}
                  />
                  {/* Delete button overlay */}
                  <div className="absolute top-2 right-2">
                    <button
                      onClick={handleDelete}
                      className={`nodrag p-1 rounded-lg backdrop-blur-sm transition-colors ${
                        confirmDelete
                          ? "bg-red-500/80 text-white"
                          : "bg-black/40 hover:bg-red-500/60 text-white/80 hover:text-white"
                      }`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}

              {/* File info */}
              <div className="px-3 py-2.5 flex items-center gap-2 border-t border-border/30">
                <FileImage className="w-3.5 h-3.5 text-muted-foreground/60 flex-shrink-0" />
                <span className="text-[11px] text-foreground/70 truncate flex-1">
                  {d.fileName}
                </span>
                {d.fileSizeBytes && (
                  <span className="text-[10px] text-muted-foreground/50 flex-shrink-0">
                    {formatFileSize(d.fileSizeBytes)}
                  </span>
                )}
              </div>
            </>
          )}

          {/* ─── VIDEO ─── */}
          {fileType === "video" && (
            <>
              {/* Video player */}
              <div className="relative">
                {signedUrl ? (
                  <video
                    ref={(el) => {
                      mediaRef.current = el;
                    }}
                    src={signedUrl}
                    controls
                    className="w-full rounded-t-2xl nodrag"
                    style={{ maxHeight: 320 }}
                    onPlay={() => setPlaying(true)}
                    onPause={() => setPlaying(false)}
                    onEnded={() => setPlaying(false)}
                    onError={() => refreshSignedUrl()}
                  />
                ) : (
                  <div className="w-full flex items-center justify-center py-10 bg-muted/10 rounded-t-2xl">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground/40" />
                  </div>
                )}
                {/* Delete button overlay */}
                <div className="absolute top-2 right-2">
                  <button
                    onClick={handleDelete}
                    className={`nodrag p-1 rounded-lg backdrop-blur-sm transition-colors ${
                      confirmDelete
                        ? "bg-red-500/80 text-white"
                        : "bg-black/40 hover:bg-red-500/60 text-white/80 hover:text-white"
                    }`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* File info */}
              <div className="px-3 py-2 flex items-center gap-2 border-b border-border/30">
                <FileVideo className="w-3.5 h-3.5 text-muted-foreground/60 flex-shrink-0" />
                <span className="text-[11px] text-foreground/70 truncate flex-1">
                  {d.fileName}
                </span>
                {d.fileSizeBytes && (
                  <span className="text-[10px] text-muted-foreground/50 flex-shrink-0">
                    {formatFileSize(d.fileSizeBytes)}
                  </span>
                )}
              </div>

              {/* Transcription buttons */}
              {!hasAnyTranscription && !isProcessing && (
                <div className="px-3 py-2.5 space-y-2">
                  <p className="text-[10px] text-muted-foreground/60">
                    Transcribe this video:
                  </p>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => triggerTranscription("audio")}
                      className="nodrag flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg bg-primary/10 border border-primary/25 text-primary/80 hover:bg-primary/20 hover:text-primary transition-colors text-[10px] font-medium"
                    >
                      <Mic className="w-3 h-3" />
                      Audio (150)
                    </button>
                    <button
                      onClick={() => triggerTranscription("visual")}
                      className="nodrag flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg bg-primary/10 border border-primary/25 text-primary/80 hover:bg-primary/20 hover:text-primary transition-colors text-[10px] font-medium"
                    >
                      <Eye className="w-3 h-3" />
                      Visual (100)
                    </button>
                    <button
                      onClick={() => triggerTranscription("both")}
                      className="nodrag flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg bg-primary/10 border border-primary/25 text-primary/80 hover:bg-primary/20 hover:text-primary transition-colors text-[10px] font-medium"
                    >
                      Both (200)
                    </button>
                  </div>
                </div>
              )}

              {/* Transcription processing */}
              {isProcessing && (
                <div className="px-3 py-3 flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-primary/70" />
                  <span className="text-[11px] text-primary/70">
                    Transcribing...
                  </span>
                </div>
              )}

              {/* Transcription results */}
              {hasAnyTranscription && !isProcessing && (
                <TranscriptionDropdown
                  audioTranscription={d.audioTranscription}
                  visualTranscription={d.visualTranscription}
                  showTranscript={showTranscript}
                  setShowTranscript={setShowTranscript}
                />
              )}
            </>
          )}

          {/* ─── VOICE NOTE ─── */}
          {fileType === "voice" && (
            <>
              {/* Header */}
              <div className="flex items-center justify-between px-3 py-2.5 bg-[rgba(8,145,178,0.08)] border-b border-[rgba(8,145,178,0.15)]">
                <div className="flex items-center gap-2">
                  <FileAudio className="w-3.5 h-3.5 text-primary" />
                  <span className="text-xs font-semibold text-primary/80">
                    Voice Note
                  </span>
                </div>
                <button
                  onClick={handleDelete}
                  className={`nodrag p-0.5 rounded transition-colors ${
                    confirmDelete
                      ? "bg-red-500/80 text-white"
                      : "hover:bg-red-500/20 text-muted-foreground hover:text-red-400"
                  }`}
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>

              {/* Audio player */}
              <div className="px-3 py-3 space-y-2.5">
                {signedUrl ? (
                  <div className="flex items-center gap-2.5">
                    <button
                      onClick={togglePlay}
                      className="nodrag flex-shrink-0 w-8 h-8 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center text-primary hover:bg-primary/25 transition-colors"
                    >
                      {playing ? (
                        <Pause className="w-3.5 h-3.5" />
                      ) : (
                        <Play className="w-3.5 h-3.5 ml-0.5" />
                      )}
                    </button>
                    <audio
                      ref={(el) => {
                        mediaRef.current = el;
                      }}
                      src={signedUrl}
                      onPlay={() => setPlaying(true)}
                      onPause={() => setPlaying(false)}
                      onEnded={() => setPlaying(false)}
                      onError={() => refreshSignedUrl()}
                      className="hidden"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] text-foreground/70 truncate">
                        {d.fileName}
                      </p>
                      {d.fileSizeBytes && (
                        <p className="text-[10px] text-muted-foreground/50">
                          {formatFileSize(d.fileSizeBytes)}
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground/40" />
                  </div>
                )}

                {/* Transcription button */}
                {!hasAudioTranscription && !isProcessing && (
                  <button
                    onClick={() => triggerTranscription("audio")}
                    className="nodrag w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-primary/10 border border-primary/25 text-primary/80 hover:bg-primary/20 hover:text-primary transition-colors text-[11px] font-medium"
                  >
                    <Mic className="w-3.5 h-3.5" />
                    Transcribe (150 credits)
                  </button>
                )}

                {/* Transcription processing */}
                {isProcessing && (
                  <div className="flex items-center gap-2 py-1">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-primary/70" />
                    <span className="text-[11px] text-primary/70">
                      Transcribing...
                    </span>
                  </div>
                )}
              </div>

              {/* Transcription results */}
              {hasAudioTranscription && !isProcessing && (
                <TranscriptionDropdown
                  audioTranscription={d.audioTranscription}
                  showTranscript={showTranscript}
                  setShowTranscript={setShowTranscript}
                />
              )}
            </>
          )}

          {/* ─── Confirm delete banner ─── */}
          {confirmDelete && (
            <div className="px-3 py-2 bg-red-500/10 border-t border-red-500/20 flex items-center justify-between">
              <span className="text-[10px] text-red-400">
                Delete this file?
              </span>
              <div className="flex gap-1.5">
                <button
                  onClick={handleDelete}
                  className="nodrag px-2 py-0.5 rounded text-[10px] bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors font-medium"
                >
                  Confirm
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="nodrag px-2 py-0.5 rounded text-[10px] text-muted-foreground hover:bg-muted/20 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </>
      )}

      <Handle
        type="source"
        position={Position.Right}
        className="!bg-primary !border-primary/70"
      />
    </div>
  );
});

// ---------------------------------------------------------------------------
// Transcription Dropdown Sub-component
// ---------------------------------------------------------------------------

interface TranscriptionDropdownProps {
  audioTranscription?: string;
  visualTranscription?: any;
  showTranscript: boolean;
  setShowTranscript: (v: boolean | ((prev: boolean) => boolean)) => void;
}

function TranscriptionDropdown({
  audioTranscription,
  visualTranscription,
  showTranscript,
  setShowTranscript,
}: TranscriptionDropdownProps) {
  return (
    <div>
      <button
        onClick={() => setShowTranscript((v: boolean) => !v)}
        className="nodrag w-full flex items-center justify-between px-3 py-2.5 border-t border-border/40 hover:bg-muted/20 transition-colors"
      >
        <span className="text-xs font-semibold text-foreground/80">
          Transcription
        </span>
        {showTranscript ? (
          <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
        )}
      </button>
      {showTranscript && (
        <div
          className="px-3 py-2.5 border-t border-border/40 bg-muted/10 nowheel space-y-3"
          style={{ maxHeight: 250, overflowY: "auto" }}
        >
          {/* Audio transcription */}
          {audioTranscription && (
            <div className="space-y-1">
              <div className="flex items-center gap-1.5">
                <Mic className="w-3 h-3 text-muted-foreground/50" />
                <span className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider">
                  Audio
                </span>
              </div>
              <p className="text-[11px] text-foreground/80 leading-relaxed whitespace-pre-wrap">
                {audioTranscription}
              </p>
            </div>
          )}

          {/* Visual transcription */}
          {visualTranscription && (
            <div className="space-y-1">
              <div className="flex items-center gap-1.5">
                <Eye className="w-3 h-3 text-muted-foreground/50" />
                <span className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider">
                  Visual
                </span>
              </div>
              {/* Visual segments */}
              {visualTranscription.visual_segments?.length > 0 ? (
                <div className="space-y-1.5">
                  {visualTranscription.visual_segments.map(
                    (seg: any, i: number) => (
                      <div
                        key={i}
                        className="rounded-lg border border-border/20 bg-muted/8 px-2.5 py-2 space-y-1"
                      >
                        <span className="text-[9px] font-semibold text-muted-foreground/60">
                          {seg.start}s &ndash; {seg.end}s
                        </span>
                        <p className="text-[10px] text-foreground/70 leading-relaxed">
                          {seg.description}
                        </p>
                        {seg.text_on_screen?.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {seg.text_on_screen.map(
                              (txt: string, j: number) => (
                                <span
                                  key={j}
                                  className="text-[9px] px-1.5 py-0.5 rounded bg-[rgba(8,145,178,0.08)] border border-[rgba(8,145,178,0.2)] text-[#22d3ee]/80"
                                >
                                  {txt}
                                </span>
                              )
                            )}
                          </div>
                        )}
                      </div>
                    )
                  )}
                </div>
              ) : (
                <p className="text-[11px] text-foreground/80 leading-relaxed whitespace-pre-wrap">
                  {typeof visualTranscription === "string"
                    ? visualTranscription
                    : JSON.stringify(visualTranscription, null, 2)}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

MediaNode.displayName = "MediaNode";
export default MediaNode;
