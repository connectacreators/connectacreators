import { useRef, useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { X, ImagePlus, ExternalLink } from 'lucide-react';
import type { NoteAttachment } from '@/services/noteAttachmentService';
import type { PendingAttachment } from '@/hooks/useNoteComposerAttachments';

// Thumbnail strip of not-yet-sent images, shown under the note composer.
export function PendingAttachmentsStrip({
  pending,
  onRemove,
}: {
  pending: PendingAttachment[];
  onRemove: (id: string) => void;
}) {
  if (!pending.length) return null;
  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {pending.map(p => (
        <div key={p.id} className="relative w-16 h-16 rounded-md overflow-hidden border border-border bg-muted">
          <img src={p.previewUrl} alt="attachment preview" className="w-full h-full object-cover" />
          <button
            type="button"
            onClick={() => onRemove(p.id)}
            className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/70 text-white flex items-center justify-center hover:bg-black"
            title="Remove"
          >
            <X className="w-2.5 h-2.5" />
          </button>
        </div>
      ))}
    </div>
  );
}

// A file-picker button (image icon) wired to a hidden multi-image input.
export function AttachPhotoButton({
  onFiles,
  disabled,
}: {
  onFiles: (files: FileList) => void;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <button
        type="button"
        title="Attach photo (or paste / drag one in)"
        disabled={disabled}
        onClick={() => ref.current?.click()}
        className="h-8 w-8 flex items-center justify-center rounded border border-border text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors flex-shrink-0 disabled:opacity-50"
      >
        <ImagePlus className="h-3.5 w-3.5" />
      </button>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => { if (e.target.files?.length) onFiles(e.target.files); e.target.value = ''; }}
      />
    </>
  );
}

// Display gallery of a note's saved attachments; click a thumbnail to open the
// lightbox. `onDelete` (admins only) removes a single photo from the note.
export function AttachmentGallery({
  attachments,
  onDelete,
}: {
  attachments: NoteAttachment[] | null | undefined;
  onDelete?: (a: NoteAttachment) => void;
}) {
  const [lightbox, setLightbox] = useState<NoteAttachment | null>(null);
  if (!attachments?.length) return null;
  return (
    <>
      <div className="flex flex-wrap gap-1.5 mt-2">
        {attachments.map(a => (
          <div key={a.path} className="relative w-16 h-16 rounded-md overflow-hidden border border-border bg-muted group">
            <img
              src={a.url}
              alt="note attachment"
              loading="lazy"
              className="w-full h-full object-cover cursor-zoom-in"
              onClick={() => setLightbox(a)}
            />
            {onDelete && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onDelete(a); }}
                className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/70 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-black transition-opacity"
                title="Delete photo"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            )}
          </div>
        ))}
      </div>
      <Dialog open={!!lightbox} onOpenChange={(v) => !v && setLightbox(null)}>
        <DialogContent className="max-w-4xl w-[95vw] p-0 gap-0 bg-black/95 border-border [&>button:last-child]:hidden">
          {lightbox && (
            <div className="relative flex items-center justify-center">
              <img src={lightbox.url} alt="attachment" className="w-full max-h-[85vh] object-contain" />
              <div className="absolute top-2 right-2 flex gap-1">
                <a
                  href={lightbox.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-8 h-8 rounded-full bg-black/70 text-white flex items-center justify-center hover:bg-black"
                  title="Open full size in a new tab"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
                <button
                  onClick={() => setLightbox(null)}
                  className="w-8 h-8 rounded-full bg-black/70 text-white flex items-center justify-center hover:bg-black"
                  title="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
