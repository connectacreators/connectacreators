import { useCallback, useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Film, FolderOpen, Loader2, Trash2, Download, ExternalLink, Music, FileText, FileArchive, File } from 'lucide-react';
import ThemedVideoPlayer from './ThemedVideoPlayer';
import { supabase } from '@/integrations/supabase/client';
import { uploadStore, UploadEntry } from '@/services/uploadStore';
import { videoUploadService } from '@/services/videoUploadService';
import { emptyFolderClearUpdate } from '@/lib/footageDelete';
import { toast } from 'sonner';

const BUCKET = 'footage';
const MAX_FILE_SIZE = 50 * 1024 * 1024 * 1024; // 50 GB

const IMAGE_EXTS = ['.png', '.webp', '.jpg', '.jpeg', '.gif', '.avif', '.heic', '.heif', '.bmp', '.svg'];
const AUDIO_EXTS = ['.mp3', '.wav', '.m4a', '.aac', '.flac', '.ogg', '.oga', '.opus', '.aiff', '.aif', '.wma'];
const VIDEO_EXTS = ['.mp4', '.mov', '.webm', '.mkv', '.avi', '.m4v', '.mpg', '.mpeg', '.wmv', '.flv', '.3gp', '.ts', '.mts', '.m2ts'];
const ARCHIVE_EXTS = ['.zip', '.rar', '.7z', '.tar', '.gz', '.tgz'];
const DOC_EXTS = ['.pdf', '.doc', '.docx', '.txt', '.rtf', '.pages', '.odt', '.csv', '.xls', '.xlsx', '.ppt', '.pptx', '.key', '.md', '.srt', '.vtt'];

type FileKind = 'image' | 'audio' | 'video' | 'archive' | 'doc' | 'other';

/**
 * Classify a file by extension — storage `list` only gives us the filename,
 * not a MIME type, so we categorize by suffix. The VIDEO_EXTS list covers every
 * real footage container; truly unrecognized files become `other` and get a
 * generic download card rather than a broken player.
 */
function fileKind(name: string): FileKind {
  const lower = name.toLowerCase();
  if (IMAGE_EXTS.some(ext => lower.endsWith(ext))) return 'image';
  if (AUDIO_EXTS.some(ext => lower.endsWith(ext))) return 'audio';
  if (VIDEO_EXTS.some(ext => lower.endsWith(ext))) return 'video';
  if (ARCHIVE_EXTS.some(ext => lower.endsWith(ext))) return 'archive';
  if (DOC_EXTS.some(ext => lower.endsWith(ext))) return 'doc';
  return 'other';
}

function parseFootageLinks(footage: string | null | undefined): string[] {
  if (!footage) return [];
  const trimmed = footage.trim();
  if (trimmed.startsWith('[')) {
    try { return (JSON.parse(trimmed) as string[]).filter(Boolean); } catch { return [trimmed]; }
  }
  return [trimmed];
}

function displayUrl(url: string, maxLen = 60): string {
  if (url.length <= maxLen) return url;
  return url.slice(0, maxLen - 3) + '...';
}

interface StorageFile {
  name: string;
  signedUrl: string;                 // ALWAYS the original — used for download/copy-link
  previewUrl: string;                // proxy signed URL if ready, else the original
  proxyStatus?: "queued" | "processing" | "done" | "error";
}

interface FootagePanelProps {
  open: boolean;
  onClose: () => void;
  title: string;
  videoEditId: string;
  clientId: string;
  footageUrl: string | null;
  fileSubmissionUrl: string | null;
  uploadSource?: string | null;
  storagePath?: string | null;
  storageUrl?: string | null;
  onComplete: () => void;
  subfolder?: string;
  scriptId?: string | null;
}

export default function FootagePanel({
  open, onClose, title, videoEditId, clientId,
  footageUrl, fileSubmissionUrl, uploadSource, storagePath, storageUrl,
  onComplete, subfolder, scriptId,
}: FootagePanelProps) {
  const [files, setFiles] = useState<StorageFile[]>([]);
  const [links, setLinks] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [activeFile, setActiveFile] = useState<StorageFile | null>(null);
  const [aspect, setAspect] = useState<number | null>(null);
  const [newLink, setNewLink] = useState('');
  const [savingLink, setSavingLink] = useState(false);
  const [uploads, setUploads] = useState<UploadEntry[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [videoErrors, setVideoErrors] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const prefix = subfolder
    ? `${clientId}/${videoEditId}/${subfolder}/`
    : `${clientId}/${videoEditId}/`;


  // Subscribe to upload store
  useEffect(() => {
    const unsub = uploadStore.subscribe(() => {
      setUploads(uploadStore.getAll().filter(u => u.id.startsWith(`${videoEditId}-`)));
    });
    return unsub;
  }, [videoEditId]);

  // Load on open
  useEffect(() => {
    if (!open) return;
    const raw = subfolder === 'submission' ? fileSubmissionUrl : footageUrl;
    setLinks(parseFootageLinks(raw).filter(u => u.startsWith('http')));
    loadFiles();
  }, [open, clientId, videoEditId, footageUrl, fileSubmissionUrl, subfolder]);

  const loadFiles = async () => {
    setLoading(true);
    const { data, error } = await supabase.storage.from(BUCKET).list(prefix);
    if (error || !data?.length) { setFiles([]); setLoading(false); return; }
    const fileObjects = data.filter(f => f.name && !f.name.endsWith('/'));

    // Fetch proxy status for every source path in this folder in one query.
    const sourcePaths = fileObjects.map(f => `${prefix}${f.name}`);
    const { data: proxies, error: proxyErr } = await supabase
      .from('footage_proxies')
      .select('source_path, proxy_bucket, proxy_path, status')
      .in('source_path', sourcePaths);
    // Degrades gracefully: on error (e.g. table not yet provisioned), proxies is
    // null and every file falls back to its original signed URL. Log so the
    // missing-table case is visible during rollout instead of silently no-op.
    if (proxyErr) console.warn('[FootagePanel] footage_proxies query failed:', proxyErr.message);
    const proxyBySource = new Map(
      (proxies ?? []).map((p: any) => [p.source_path, p])
    );

    const signed = await Promise.all(
      fileObjects.map(async (f) => {
        const sourcePath = `${prefix}${f.name}`;
        const { data: orig } = await supabase.storage.from(BUCKET).createSignedUrl(sourcePath, 3600);
        if (!orig) return null;
        const proxy = proxyBySource.get(sourcePath);
        let previewUrl = orig.signedUrl;
        if (proxy?.status === 'done' && proxy.proxy_path) {
          const { data: purl } = await supabase.storage
            .from(proxy.proxy_bucket || 'footage-proxies')
            .createSignedUrl(proxy.proxy_path, 3600);
          if (purl) previewUrl = purl.signedUrl;
        }
        return {
          name: f.name,
          signedUrl: orig.signedUrl,
          previewUrl,
          proxyStatus: proxy?.status as StorageFile['proxyStatus'],
        };
      })
    );
    setFiles(signed.filter(Boolean) as StorageFile[]);
    setLoading(false);
  };

  const persistLinks = async (updatedLinks: string[]) => {
    const value = updatedLinks.length === 0 ? null
      : updatedLinks.length === 1 ? updatedLinks[0]
      : JSON.stringify(updatedLinks);

    const updateData: Record<string, any> = {};
    if (subfolder === 'submission') {
      updateData.file_submission = value;
    } else {
      updateData.footage = value;
      updateData.upload_source = value ? 'gdrive' : null;
    }
    await supabase.from('video_edits').update(updateData).eq('id', videoEditId);

    if (scriptId && subfolder !== 'submission') {
      const primary = updatedLinks[0] || null;
      await supabase.from('scripts').update({ google_drive_link: primary }).eq('id', scriptId);
    }
  };

  const handleAddLink = async () => {
    const url = newLink.trim();
    if (!url) return;
    setSavingLink(true);
    try {
      const updated = [...links, url];
      await persistLinks(updated);
      setLinks(updated);
      setNewLink('');
      toast.success('Link added');
      onComplete();
    } catch (err: any) {
      toast.error(`Failed to save: ${err.message || 'Unknown error'}`);
    } finally {
      setSavingLink(false);
    }
  };

  const handleRemoveLink = async (idx: number) => {
    setSavingLink(true);
    try {
      const updated = links.filter((_, i) => i !== idx);
      await persistLinks(updated);
      setLinks(updated);
      toast.success('Link removed');
      if (updated.length === 0 && files.length === 0) { onComplete(); onClose(); }
      else { onComplete(); }
    } catch (err: any) {
      toast.error(`Failed to remove: ${err.message || 'Unknown error'}`);
    } finally {
      setSavingLink(false);
    }
  };

  const handleDeleteFile = async (fileName: string) => {
    if (!confirm(`Delete "${fileName}"? This cannot be undone.`)) return;
    setDeleting(fileName);
    try {
      const path = `${prefix}${fileName}`;
      const { error } = await supabase.storage.from(BUCKET).remove([path]);
      if (error) throw error;
      const remaining = files.filter(f => f.name !== fileName);
      setFiles(remaining);
      if (activeFile?.name === fileName) { setActiveFile(null); setAspect(null); }
      if (remaining.length === 0) {
        // Clear only THIS slot's columns — submission -> file_submission, footage -> storage_*.
        await supabase.from('video_edits')
          .update(emptyFolderClearUpdate(subfolder))
          .eq('id', videoEditId);
      }
      toast.success('File deleted');
      if (remaining.length === 0 && links.length === 0) { onComplete(); onClose(); }
      else { onComplete(); }
    } catch (err: any) {
      toast.error(`Delete failed: ${err.message || 'Unknown error'}`);
    } finally {
      setDeleting(null);
    }
  };

  const startUpload = (file: File) => {
    if (file.size > MAX_FILE_SIZE) {
      toast.error(`${file.name}: File too large (max 50 GB)`);
      return;
    }
    const uploadId = `${videoEditId}-${crypto.randomUUID()}`;
    uploadStore.add(uploadId, file.name, window.location.pathname);
    videoUploadService.uploadVideoFile(file, clientId, videoEditId,
      (pct) => uploadStore.update(uploadId, pct),
      subfolder,
      (abort) => uploadStore.setAbort(uploadId, abort)
    ).then(() => {
      uploadStore.complete(uploadId);
      toast.success(`${file.name} uploaded`);
      onComplete();
      loadFiles();
    }).catch((err: any) => {
      uploadStore.fail(uploadId, err.message || 'Upload failed');
    });
  };

  const handleFiles = (fileList: FileList | null) => {
    if (!fileList) return;
    // Any file type is accepted — video, audio, images, docs, archives, etc.
    // The footage bucket has no MIME restriction; size is enforced in startUpload.
    Array.from(fileList).forEach(f => startUpload(f));
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  }, []);

  const hasContent = files.length > 0 || links.length > 0;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className="sm:max-w-xl max-h-[90vh] overflow-y-auto overflow-x-hidden"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-1.5 text-sm truncate max-w-md">
            <Film className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
            Footage — {title}
          </DialogTitle>
        </DialogHeader>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="*"
          multiple
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files);
            if (fileInputRef.current) fileInputRef.current.value = '';
          }}
        />

        {/* Drop zone */}
        {hasContent ? (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className={`w-full flex items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-2.5 text-xs transition-colors cursor-pointer ${
              isDragging
                ? 'border-primary bg-primary/8 text-primary'
                : 'border-muted-foreground/20 text-muted-foreground/50 hover:border-primary/40 hover:text-primary/70'
            }`}
          >
            <span>↑</span> Drop more files or click to browse
          </button>
        ) : (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className={`w-full flex flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed px-4 py-8 text-xs transition-colors cursor-pointer ${
              isDragging
                ? 'border-primary bg-primary/8 text-primary'
                : 'border-muted-foreground/20 text-muted-foreground/50 hover:border-primary/40 hover:text-primary/70'
            }`}
          >
            <span className="text-2xl mb-1">☁</span>
            <span>
              Drop files here or{' '}
              <strong className="text-primary">click to browse</strong>{' '}
              — any type, multiple files OK
            </span>
          </button>
        )}

        {/* File list */}
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {/* In-progress uploads */}
            {uploads.filter(u => !u.done).map(u => (
              <div key={u.id} className="flex items-center gap-2.5 rounded-lg border border-blue-500/20 bg-blue-500/5 px-3 py-2">
                <div className="w-[52px] h-[34px] rounded-md bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                  <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-muted-foreground truncate">{u.filename}</div>
                  <div className="mt-1 h-1 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-400 rounded-full transition-all"
                      style={{ width: `${u.progress}%` }}
                    />
                  </div>
                  <div className="text-[10px] text-blue-400 mt-0.5">{u.progress}% uploading…</div>
                </div>
              </div>
            ))}

            {/* Storage files */}
            {files.map((f) => (
              <div key={f.name}>
                <div
                  className={`flex items-center gap-2.5 border px-3 py-2 cursor-pointer transition-colors group/row ${
                    activeFile?.name === f.name
                      ? 'rounded-t-lg border-primary/40 bg-primary/5'
                      : 'rounded-lg border-border/50 hover:border-border bg-card/50'
                  }`}
                  onClick={() => {
                    if (activeFile?.name === f.name) { setActiveFile(null); setAspect(null); }
                    else { setActiveFile(f); setAspect(null); setVideoErrors(prev => { const n = new Set(prev); n.delete(f.name); return n; }); }
                  }}
                >
                  {/* Thumbnail */}
                  <div className="w-[52px] h-[34px] rounded-md bg-black border border-border/50 flex-shrink-0 overflow-hidden relative flex items-center justify-center">
                    {(() => {
                      const kind = fileKind(f.name);
                      if (kind === 'image') return (
                        <img src={f.signedUrl} alt={f.name} loading="lazy" className="w-full h-full object-cover" />
                      );
                      if (kind === 'video') return (
                        <>
                          <video src={f.signedUrl} preload="none" muted className="w-full h-full object-cover" />
                          <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                            <span className="text-[10px] text-white/70">▶</span>
                          </div>
                        </>
                      );
                      if (kind === 'audio') return <Music className="w-4 h-4 text-primary/70" />;
                      if (kind === 'archive') return <FileArchive className="w-4 h-4 text-muted-foreground/70" />;
                      if (kind === 'doc') return <FileText className="w-4 h-4 text-muted-foreground/70" />;
                      return <File className="w-4 h-4 text-muted-foreground/70" />;
                    })()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-foreground truncate">{f.name}</div>
                  </div>
                  {/* Hover actions */}
                  <div className="flex gap-1 opacity-0 group-hover/row:opacity-100 transition-opacity flex-shrink-0">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigator.clipboard.writeText(f.signedUrl);
                        toast.success('Link copied');
                      }}
                      className="w-6 h-6 rounded border border-border/50 bg-muted/50 flex items-center justify-center text-muted-foreground hover:text-foreground text-[10px]"
                      title="Copy link"
                    >⧉</button>
                    <a
                      href={f.signedUrl}
                      download={f.name}
                      onClick={(e) => e.stopPropagation()}
                      className="w-6 h-6 rounded border border-border/50 bg-muted/50 flex items-center justify-center text-muted-foreground hover:text-foreground"
                      title="Download"
                    >
                      <Download className="w-3 h-3" />
                    </a>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handleDeleteFile(f.name); }}
                      disabled={deleting === f.name}
                      className="w-6 h-6 rounded border border-border/50 bg-muted/50 flex items-center justify-center text-muted-foreground hover:text-destructive hover:border-destructive/50 hover:bg-destructive/5"
                      title="Delete"
                    >
                      {deleting === f.name
                        ? <Loader2 className="w-3 h-3 animate-spin" />
                        : <Trash2 className="w-3 h-3" />}
                    </button>
                  </div>
                </div>

                {/* Inline player */}
                {activeFile?.name === f.name && (
                  <div className="rounded-b-lg overflow-hidden border border-t-0 border-primary/25 bg-black">
                    {(() => {
                      const kind = fileKind(f.name);
                      if (kind === 'image') return (
                        <img
                          src={f.signedUrl}
                          alt={f.name}
                          className="mx-auto block max-h-[400px] w-auto object-contain"
                        />
                      );
                      if (kind === 'audio') return (
                        <div className="flex flex-col items-center gap-3 py-6 px-4">
                          <Music className="w-8 h-8 text-primary/60" />
                          <audio src={f.signedUrl} controls className="w-full max-w-sm">
                            Your browser does not support audio playback.
                          </audio>
                        </div>
                      );
                      if (kind === 'archive' || kind === 'doc' || kind === 'other') {
                        const Icon = kind === 'archive' ? FileArchive : kind === 'doc' ? FileText : File;
                        return (
                          <div className="flex flex-col items-center gap-2 py-6 px-4 text-center">
                            <Icon className="w-8 h-8 text-muted-foreground/40" />
                            <p className="text-xs text-muted-foreground">
                              This file type can't be previewed in the browser.
                            </p>
                            <div className="flex gap-2 mt-1">
                              <a
                                href={f.signedUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs border border-border/50 rounded px-3 py-1.5 text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5"
                              >
                                <ExternalLink className="w-3 h-3" /> Open
                              </a>
                              <a
                                href={f.signedUrl}
                                download={f.name}
                                className="text-xs border border-border/50 rounded px-3 py-1.5 text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5"
                              >
                                <Download className="w-3 h-3" /> Download
                              </a>
                            </div>
                          </div>
                        );
                      }
                      // video
                      if (videoErrors.has(f.name)) return (
                        <div className="flex flex-col items-center gap-2 py-6 px-4 text-center">
                          <Film className="w-8 h-8 text-muted-foreground/40" />
                          <p className="text-xs text-muted-foreground">
                            This file can't be previewed in the browser.<br />
                            <span className="text-muted-foreground/60">Large files or unsupported codecs may not stream.</span>
                          </p>
                          <a
                            href={f.signedUrl}
                            download={f.name}
                            className="mt-1 text-xs border border-border/50 rounded px-3 py-1.5 text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5"
                          >
                            <Download className="w-3 h-3" /> Download to watch
                          </a>
                        </div>
                      );
                      return (
                        <div
                          className="mx-auto"
                          style={{ maxWidth: aspect !== null && aspect < 1 ? `${Math.round(aspect * 560)}px` : '100%' }}
                        >
                          <ThemedVideoPlayer
                            src={f.previewUrl}
                            maxHeight="400px"
                            onLoadedMetadata={(_dur, w, h) => { if (h > 0) setAspect(w / h); }}
                            onError={() => setVideoErrors(prev => new Set([...prev, f.name]))}
                          />
                          {(f.proxyStatus === 'queued' || f.proxyStatus === 'processing') && (
                            <div className="text-[11px] text-muted-foreground/70 mt-1 text-center">
                              Optimizing for faster playback…
                            </div>
                          )}
                        </div>
                      );
                    })()}
                    <div className="flex gap-2 px-3 py-2 border-t border-border/20">
                      <button
                        type="button"
                        onClick={() => { navigator.clipboard.writeText(f.signedUrl); toast.success('Link copied'); }}
                        className="text-xs text-muted-foreground hover:text-foreground border border-border/50 rounded px-2 py-1 transition-colors"
                      >⧉ Copy link</button>
                      <a
                        href={f.signedUrl}
                        download={f.name}
                        className="text-xs text-muted-foreground hover:text-foreground border border-border/50 rounded px-2 py-1 transition-colors"
                      >⬇ Download</a>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {/* Link rows */}
            {links.map((url, i) => (
              <div
                key={i}
                role="link"
                tabIndex={0}
                onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    window.open(url, '_blank', 'noopener,noreferrer');
                  }
                }}
                className="flex items-center gap-2.5 rounded-lg border border-border/50 bg-card/50 px-3 py-2 group/link cursor-pointer hover:border-border hover:bg-card/80 transition-colors"
              >
                <div className="w-[52px] h-[34px] rounded-md bg-blue-500/10 border border-blue-500/20 flex-shrink-0 flex items-center justify-center">
                  <FolderOpen className="w-4 h-4 text-blue-400/70" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-blue-300/80 truncate">{displayUrl(url)}</div>
                  <div className="text-[10px] text-muted-foreground/50 mt-0.5">External link</div>
                </div>
                <div className="flex gap-1 opacity-0 group-hover/link:opacity-100 transition-opacity flex-shrink-0">
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="w-6 h-6 rounded border border-border/50 bg-muted/50 flex items-center justify-center text-muted-foreground hover:text-foreground"
                    title="Open in new tab"
                  >
                    <ExternalLink className="w-3 h-3" />
                  </a>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleRemoveLink(i); }}
                    disabled={savingLink}
                    className="w-6 h-6 rounded border border-border/50 bg-muted/50 flex items-center justify-center text-muted-foreground hover:text-destructive hover:border-destructive/50 hover:bg-destructive/5"
                    title="Remove"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add link */}
        <div className="flex gap-2 pt-1">
          <Input
            placeholder="Paste Google Drive or footage link…"
            value={newLink}
            onChange={(e) => setNewLink(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAddLink(); }}
            className="h-8 text-xs"
          />
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs px-3 flex-shrink-0"
            onClick={handleAddLink}
            disabled={savingLink || !newLink.trim()}
          >
            {savingLink ? <Loader2 className="w-3 h-3 animate-spin" /> : '+ Add link'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
