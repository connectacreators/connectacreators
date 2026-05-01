import { useEffect, useRef, useState } from "react";

interface Props {
  value: string;
  onCommit: (next: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  suggestions?: string[];
  className?: string;
  align?: "left" | "right";
  muted?: boolean;
}

export function TextCell({
  value,
  onCommit,
  placeholder,
  ariaLabel,
  suggestions,
  className,
  align = "left",
  muted = false,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  function commit() {
    if (draft !== value) onCommit(draft);
    setEditing(false);
  }

  function cancel() {
    setDraft(value);
    setEditing(false);
  }

  if (editing) {
    const listId = suggestions ? `cell-suggest-${Math.random().toString(36).slice(2, 8)}` : undefined;
    return (
      <span className="block w-full" style={{ position: "relative" }}>
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); commit(); }
            else if (e.key === "Escape") { e.preventDefault(); cancel(); }
          }}
          placeholder={placeholder}
          aria-label={ariaLabel}
          list={listId}
          className="w-full bg-transparent outline-none"
          style={{
            border: "2px solid rgba(34,211,238,0.55)",
            background: "rgba(34,211,238,0.08)",
            borderRadius: 3,
            color: "#e2e8f0",
            fontSize: 11,
            padding: "4px 6px",
            textAlign: align,
          }}
        />
        {suggestions && (
          <datalist id={listId}>
            {suggestions.map((s) => <option key={s} value={s} />)}
          </datalist>
        )}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      aria-label={ariaLabel}
      className={`block w-full text-left bg-transparent border-0 cursor-text ${className ?? ""}`}
      style={{
        color: muted ? "#94a3b8" : "#e2e8f0",
        fontSize: 11,
        padding: "4px 0",
        textAlign: align,
        minHeight: 22,
      }}
    >
      {value || <span style={{ color: "rgba(148,163,184,0.4)" }}>{placeholder ?? "—"}</span>}
    </button>
  );
}
