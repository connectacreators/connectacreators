import { useCallback, useState } from 'react';
import { noteAttachmentService, isImageFile, type NoteAttachment } from '@/services/noteAttachmentService';
import { toast } from 'sonner';

// A picked-but-not-yet-uploaded image. `previewUrl` is a local object URL shown
// as a thumbnail while composing; it's revoked on remove/reset. Uploads happen
// only on send (uploadAll), so cancelling a note never leaves an orphan.
export interface PendingAttachment {
  id: string;
  file: File;
  previewUrl: string;
}

export function useNoteComposerAttachments(
  clientId: string | null | undefined,
  videoEditId: string | null | undefined,
) {
  const [pending, setPending] = useState<PendingAttachment[]>([]);
  const [uploading, setUploading] = useState(false);

  const addFiles = useCallback((files: FileList | File[]) => {
    const imgs = Array.from(files).filter(isImageFile);
    if (Array.from(files).length && !imgs.length) {
      toast.error('Only image files can be attached');
      return;
    }
    if (!imgs.length) return;
    setPending(prev => [
      ...prev,
      ...imgs.map(file => ({ id: crypto.randomUUID(), file, previewUrl: URL.createObjectURL(file) })),
    ]);
  }, []);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const files = Array.from(e.clipboardData?.items || [])
      .filter(it => it.kind === 'file' && it.type.startsWith('image/'))
      .map(it => it.getAsFile())
      .filter((f): f is File => !!f);
    if (files.length) { e.preventDefault(); addFiles(files); }
  }, [addFiles]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    const files = Array.from(e.dataTransfer?.files || []).filter(isImageFile);
    if (files.length) { e.preventDefault(); addFiles(files); }
  }, [addFiles]);

  const removePending = useCallback((id: string) => {
    setPending(prev => {
      const found = prev.find(p => p.id === id);
      if (found) URL.revokeObjectURL(found.previewUrl);
      return prev.filter(p => p.id !== id);
    });
  }, []);

  const reset = useCallback(() => {
    setPending(prev => { prev.forEach(p => URL.revokeObjectURL(p.previewUrl)); return []; });
  }, []);

  // Compress + upload every pending image and return the records to store on the
  // note. Clears the pending list on success; leaves it intact on failure so the
  // caller can keep the composed note and let the user retry.
  const uploadAll = useCallback(async (): Promise<NoteAttachment[]> => {
    if (!pending.length) return [];
    if (!clientId || !videoEditId) throw new Error('Missing client/video context');
    setUploading(true);
    try {
      const results = await Promise.all(
        pending.map(p => noteAttachmentService.upload(p.file, clientId, videoEditId)),
      );
      reset();
      return results;
    } finally {
      setUploading(false);
    }
  }, [pending, clientId, videoEditId, reset]);

  return { pending, uploading, addFiles, handlePaste, handleDrop, removePending, uploadAll, reset };
}
