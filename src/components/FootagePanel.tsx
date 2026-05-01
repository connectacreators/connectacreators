import { useCallback, useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Film, FolderOpen, Loader2, Trash2, Download, ExternalLink } from 'lucide-react';
import ThemedVideoPlayer from './ThemedVideoPlayer';
import { supabase } from '@/integrations/supabase/client';
import { uploadStore, UploadEntry } from '@/services/uploadStore';
import { videoUploadService } from '@/services/videoUploadService';
import { toast } from 'sonner';

const BUCKET = 'footage';
const MAX_FILE_SIZE = 50 * 1024 * 1024 * 1024; // 50 GB

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

interface StorageFile { name: string; signedUrl: string; }

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
    const signed = await Promise.all(
      fileObjects.map(async (f) => {
        const path = `${prefix}${f.name}`;
        const { data: url } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
        return url ? { name: f.name, signedUrl: url.signedUrl } : null;
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
        await supabase.from('video_edits').update({
          storage_path: null, storage_url: null, upload_source: null,
        }).eq('id', videoEditId);
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
    const uploadId = `${videoEditId}-${Date.now()}`;
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
    Array.from(fileList).forEach(f => {
      if (!f.type.startsWith('video/')) {
        toast.error(`${f.name}: Not a video file`);
        return;
      }
      startUpload(f);
    });
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
          accept="video/*"
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
            className={`w-full flex items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-2.5 text-xs transition-colors cursor-pointer ${
              isDragging
                ? 'border-cyan-500 bg-cyan-500/8 text-cyan-400'
                : 'border-muted-foreground/20 text-muted-foreground/50 hover:border-cyan-500/40 hover:text-cyan-500/70'
            }`}
          >
            <span>↑</span> Drop more files or click to browse
          </button>
        ) : (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className={`w-full flex flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed px-4 py-8 text-xs transition-colors cursor-pointer ${
              isDragging
                ? 'border-cyan-500 bg-cyan-500/8 text-cyan-400'
                : 'border-muted-foreground/20 text-muted-foreground/50 hover:border-cyan-500/40 hover:text-cyan-500/70'
            }`}
          >
            <span className="text-2xl mb-1">☁</span>
            <span>
              Drop videos here or{' '}
              <strong className="text-cyan-500">click to browse</strong>{' '}
              — multiple files OK
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
                      ? 'rounded-t-lg border-cyan-500/40 bg-cyan-500/5'
                      : 'rounded-lg border-border/50 hover:border-border bg-card/50'
                  }`}
                  onClick={() => {
                    if (activeFile?.name === f.name) { setActiveFile(null); setAspect(null); }
                    else { setActiveFile(f); setAspect(null); setVideoErrors(prev => { const n = new Set(prev); n.delete(f.name); return n; }); }
                  }}
                >
                  {/* Thumbnail */}
                  <div className="w-[52px] h-[34px] rounded-md bg-black border border-border/50 flex-shrink-0 overflow-hidden relative">
                    <video
                      src={f.signedUrl}
                      preload="none"
                      muted
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                      <span className="text-[10px] text-white/70">▶</span>
                    </div>
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
                  <div className="rounded-b-lg overflow-hidden border border-t-0 border-cyan-500/25 bg-black">
                    {videoErrors.has(f.name) ? (
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
                    ) : (
                      <div
                        className="mx-auto"
                        style={{ maxWidth: aspect !== null && aspect < 1 ? `${Math.round(aspect * 560)}px` : '100%' }}
                      >
                        <ThemedVideoPlayer
                          src={f.signedUrl}
                          maxHeight="400px"
                          onLoadedMetadata={(_dur, w, h) => { if (h > 0) setAspect(w / h); }}
                          onError={() => setVideoErrors(prev => new Set([...prev, f.name]))}
                        />
                      </div>
                    )}
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
