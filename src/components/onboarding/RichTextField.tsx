import { useRef, useEffect, useState, useCallback } from "react";
import { Bold, Italic, Underline } from "lucide-react";
import { cn } from "@/lib/utils";
import { sanitizeRichText, isRichTextEmpty } from "@/lib/onboarding/richText";
import VoiceButton from "./VoiceButton";

interface RichTextFieldProps {
  id?: string;
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
  /** Hide the voice button (e.g. where dictation doesn't apply). Default false. */
  noVoice?: boolean;
}

type Mark = "bold" | "italic" | "underline";

/**
 * A lightweight Google-Docs-style editor for long onboarding answers: bold,
 * italic, underline, plus voice dictation. Stores sanitized HTML (see
 * lib/onboarding/richText). Uses contentEditable + execCommand — deprecated but
 * universally supported and perfectly adequate for inline B/I/U on a form.
 */
export default function RichTextField({
  id,
  value,
  onChange,
  placeholder,
  className,
  noVoice,
}: RichTextFieldProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<Record<Mark, boolean>>({
    bold: false,
    italic: false,
    underline: false,
  });

  // Sync external value into the DOM only when it diverges from what's already
  // rendered — writing innerHTML on every keystroke would reset the caret.
  useEffect(() => {
    const el = ref.current;
    if (el && el.innerHTML !== value) el.innerHTML = value || "";
  }, [value]);

  const refreshActive = useCallback(() => {
    if (typeof document === "undefined") return;
    try {
      setActive({
        bold: document.queryCommandState("bold"),
        italic: document.queryCommandState("italic"),
        underline: document.queryCommandState("underline"),
      });
    } catch {
      /* queryCommandState can throw if no selection — ignore */
    }
  }, []);

  const emitChange = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    onChange(sanitizeRichText(el.innerHTML));
  }, [onChange]);

  const applyMark = useCallback(
    (mark: Mark) => {
      ref.current?.focus();
      document.execCommand(mark, false);
      refreshActive();
      emitChange();
    },
    [emitChange, refreshActive],
  );

  const handleVoice = useCallback(
    (text: string) => {
      const el = ref.current;
      if (!el) return;
      el.focus();
      // Insert at the caret if the editor has focus/selection, else append.
      const sel = window.getSelection();
      const within = sel && sel.rangeCount > 0 && el.contains(sel.anchorNode);
      const prefix = el.textContent && !/\s$/.test(el.textContent) ? " " : "";
      if (within) {
        document.execCommand("insertText", false, prefix + text);
      } else {
        el.innerHTML = (el.innerHTML || "") + (el.innerHTML ? " " : "") + text;
      }
      emitChange();
    },
    [emitChange],
  );

  const showPlaceholder = isRichTextEmpty(value);

  const marks: { mark: Mark; Icon: typeof Bold; label: string }[] = [
    { mark: "bold", Icon: Bold, label: "Bold" },
    { mark: "italic", Icon: Italic, label: "Italic" },
    { mark: "underline", Icon: Underline, label: "Underline" },
  ];

  return (
    <div
      className={cn(
        "rounded-md border border-input bg-background overflow-hidden",
        "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-0",
        className,
      )}
    >
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 border-b border-border/60 bg-foreground/[0.03] px-1.5 py-1">
        {marks.map(({ mark, Icon, label }) => (
          <button
            key={mark}
            type="button"
            aria-label={label}
            aria-pressed={active[mark]}
            title={label}
            // onMouseDown + preventDefault keeps the editor selection intact.
            onMouseDown={(e) => {
              e.preventDefault();
              applyMark(mark);
            }}
            className={cn(
              "inline-flex h-7 w-7 items-center justify-center rounded transition-colors",
              active[mark]
                ? "bg-foreground/10 text-foreground"
                : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
          </button>
        ))}
        {!noVoice && (
          <div className="ml-auto">
            <VoiceButton onTranscript={handleVoice} />
          </div>
        )}
      </div>

      {/* Editor */}
      <div className="relative">
        {showPlaceholder && placeholder && (
          <span className="pointer-events-none absolute left-3 top-2.5 text-sm text-muted-foreground">
            {placeholder}
          </span>
        )}
        <div
          id={id}
          ref={ref}
          contentEditable
          role="textbox"
          aria-multiline="true"
          suppressContentEditableWarning
          onInput={emitChange}
          onKeyUp={refreshActive}
          onMouseUp={refreshActive}
          onFocus={refreshActive}
          className="min-h-[6rem] w-full px-3 py-2.5 text-sm leading-relaxed text-foreground outline-none [&_b]:font-semibold [&_strong]:font-semibold"
        />
      </div>
    </div>
  );
}
