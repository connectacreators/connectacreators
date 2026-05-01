import { Paperclip } from "lucide-react";

interface Props {
  url: string | null;
  ariaLabel?: string;
}

export function AttachmentCell({ url, ariaLabel }: Props) {
  if (!url) {
    return (
      <span
        aria-label={ariaLabel ?? "No attachment"}
        className="inline-block"
        style={{ color: "rgba(148,163,184,0.25)", fontSize: 11 }}
      >
        —
      </span>
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={ariaLabel ?? "Open attachment"}
      onClick={(e) => e.stopPropagation()}
      className="inline-flex items-center justify-center"
      style={{
        width: 22,
        height: 22,
        borderRadius: 4,
        background: "rgba(148,163,184,0.12)",
        color: "rgba(203,213,225,0.7)",
      }}
    >
      <Paperclip className="w-3 h-3" />
    </a>
  );
}
