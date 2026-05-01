import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Download, Link, Loader2, Plus, Trash2, FileVideo, ChevronDown } from 'lucide-react';
import ThemedVideoPlayer from './ThemedVideoPlayer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import FootageUploadDialog from './FootageUploadDialog';
import { toast } from 'sonner';

const BUCKET = 'footage';

/** Parse footage column: supports JSON array or single URL string */
function parseFootageLinks(footage: string | null | undefined): string[] {
  if (!footage) return [];
  const trimmed = footage.trim();
  if (trimmed.startsWith('[')) {
    try { return (JSON.parse(trimmed) as string[]).filter(Boolean); } catch { return [trimmed]; }
  }
  return [trimmed];
}

/** Truncate URL for display */
function displayUrl(url: string, maxLen = 60): string {
  if (url.length <= maxLen) return url;
  return url.slice(0, maxLen - 3) + '...';
}

interface StorageFile { name: string; signedUrl: string; }

interface Props {
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

export default function FootageViewerModal({
  open, onClose, title, videoEditId, clientId,
  footageUrl, fileSubmissionUrl, uploadSource, storagePath, storageUrl, onComplete, subfolder, scriptId,
}: Props) {
  const [links, setLinks] = useState<string[]>([]);
  const [files, setFiles] = useState<StorageFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [newLink, setNewLink] = useState('');
  const [saving, setSaving] = useState(false);
  const [previewFile, setPreviewFile] = useState<StorageFile | null>(null);
  const [previewAspect, setPreviewAspect] = useState<number | null>(null); // width/height ratio

  const prefix = subfolder
    ? `${clientId}/${videoEditId}/${subfolder}/`
    : `${clientId}/${videoEditId}/`;

  // Load links + storage files when modal opens
  useEffect(() => {
    if (!open) return;
    const raw = subfolder === 'submission' ? fileSubmissionUrl : footageUrl;
    // Only treat actual URLs as links — storage paths (no https://) are handled by loadFiles() via signed URL
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

  /** Persist links to video_edits.footage (or file_submission) + sync to scripts.google_drive_link */
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

    // Sync primary link to scripts.google_drive_link
    if (scriptId && subfolder !== 'submission') {
      const primary = updatedLinks[0] || null;
      await supabase.from('scripts').update({ google_drive_link: primary }).eq('id', scriptId);
    }
  };

  const handleAddLink = async () => {
    const url = newLink.trim();
    if (!url) return;
    setSaving(true);
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
      setSaving(false);
    }
  };

  const handleRemoveLink = async (idx: number) => {
    setSaving(true);
    try {
      const updated = links.filter((_, i) => i !== idx);
      await persistLinks(updated);
      setLinks(updated);
      toast.success('Link removed');
      if (updated.length === 0 && files.length === 0) {
        onComplete();
        onClose();
      } else {
        onComplete();
      }
    } catch (err: any) {
      toast.error(`Failed to remove: ${err.message || 'Unknown error'}`);
    } finally {
      setSaving(false);
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
      if (remaining.length === 0) {
        // Only clear storage metadata — never touch link columns (file_submission / footage)
        await supabase.from('video_edits').update({
          storage_path: null,
          storage_url: null,
          upload_source: null,
        }).eq('id', videoEditId);
      }
      toast.success('File deleted');
      if (remaining.length === 0 && links.length === 0) {
        onComplete();
        onClose();
      } else {
        onComplete();
      }
    } catch (err: any) {
      toast.error(`Delete failed: ${err.message || 'Unknown error'}`);
    } finally {
      setDeleting(null);
    }
  };

  const hasContent = links.length > 0 || files.length > 0;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle className="text-sm truncate max-w-md">Footage — {title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-4">
              {/* ── Links section ── */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">Links</p>
                </div>
                {links.length === 0 && (
                  <p className="text-xs text-muted-foreground/60 py-1">No links added yet</p>
                )}
                {links.map((url, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-lg border border-border/50 px-3 py-2 group/link hover:border-border transition-colors min-w-0">
                    <Link className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-foreground hover:text-primary truncate flex-1 min-w-0"
                      title={url}
                    >
                      {displayUrl(url)}
                    </a>
                    <button
                      onClick={() => handleRemoveLink(i)}
                      disabled={saving}
                      className="text-muted-foreground hover:text-destructive flex-shrink-0 transition-colors"
                      title="Remove link"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                <div className="flex gap-2 mt-1">
                  <Input
                    placeholder="Paste Google Drive or footage link..."
                    value={newLink}
                    onChange={(e) => setNewLink(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleAddLink(); }}
                    className="h-8 text-xs"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs gap-1 px-3 flex-shrink-0"
                    onClick={handleAddLink}
                    disabled={saving || !newLink.trim()}
                  >
                    {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                    Add
                  </Button>
                </div>
              </div>

              {/* ── Footage files section ── */}
              <div className="space-y-1.5 border-t border-border/40 pt-3">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">Footage</p>
                  <FootageUploadDialog
                    videoEditId={videoEditId}
                    clientId={clientId}
                    onComplete={() => { onComplete(); loadFiles(); }}
                    currentFootageUrl={footageUrl}
                    currentFileSubmissionUrl={fileSubmissionUrl}
                    uploadSource={uploadSource}
                    subfolder={subfolder}
                  />
                </div>
                {files.length === 0 && (
                  <p className="text-xs text-muted-foreground/60 py-1">No footage uploaded yet</p>
                )}
                {files.map((f) => (
                  <div key={f.name} className="space-y-0">
                    <div
                      className={`flex items-center gap-2 border border-border/50 px-3 py-2 group/file hover:border-border transition-colors cursor-pointer ${previewFile?.name === f.name ? 'rounded-t-lg' : 'rounded-lg'}`}
                      onClick={() => { if (previewFile?.name === f.name) { setPreviewFile(null); setPreviewAspect(null); } else { setPreviewFile(f); setPreviewAspect(null); } }}
                    >
                      <FileVideo className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                      <span className="text-xs text-foreground truncate min-w-0 flex-1 w-0" title={f.name}>{f.name}</span>
                      <ChevronDown
                        className={`w-3.5 h-3.5 text-muted-foreground flex-shrink-0 transition-transform duration-200 ${previewFile?.name === f.name ? 'rotate-180' : ''}`}
                      />
                      <a
                        href={f.signedUrl}
                        download={f.name}
                        className="text-muted-foreground hover:text-foreground flex-shrink-0"
                        title="Download"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Download className="w-3.5 h-3.5" />
                      </a>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteFile(f.name); }}
                        disabled={deleting === f.name}
                        className="text-muted-foreground hover:text-destructive flex-shrink-0 transition-colors"
                        title="Delete file"
                      >
                        {deleting === f.name
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <Trash2 className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                    {previewFile?.name === f.name && (
                      <div className="rounded-b-lg overflow-hidden border border-t-0 border-border/50 flex justify-center bg-black">
                        <div style={{ width: previewAspect !== null && previewAspect < 1 ? `${Math.round(previewAspect * 340)}px` : '100%' }}>
                          <ThemedVideoPlayer
                            src={f.signedUrl}
                            maxHeight="420px"
                            onLoadedMetadata={(_duration, w, h) => {
                              if (h > 0) setPreviewAspect(w / h);
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
