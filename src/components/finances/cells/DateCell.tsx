import { useEffect, useRef, useState } from "react";

interface Props {
  value: string;          // YYYY-MM-DD
  onCommit: (next: string) => void;
  ariaLabel?: string;
}

function shortDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export function DateCell({ value, onCommit, ariaLabel }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [editing]);

  function commit() {
    if (draft && draft !== value) onCommit(draft);
    setEditing(false);
  }

  function cancel() {
    setDraft(value);
    setEditing(false);
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="date"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); commit(); }
          else if (e.key === "Escape") { e.preventDefault(); cancel(); }
        }}
        aria-label={ariaLabel}
        className="w-full bg-transparent outline-none"
        style={{
          border: "2px solid rgba(34,211,238,0.55)",
          background: "rgba(34,211,238,0.08)",
          borderRadius: 3,
          color: "#e2e8f0",
          fontSize: 11,
          padding: "4px 6px",
          colorScheme: "dark",
        }}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      aria-label={ariaLabel}
      className="block w-full text-left bg-transparent border-0 cursor-text"
      style={{
        color: "#94a3b8",
        fontSize: 11,
        fontVariantNumeric: "tabular-nums",
        padding: "4px 0",
        minHeight: 22,
      }}
    >
      {shortDate(value)}
    </button>
  );
}
