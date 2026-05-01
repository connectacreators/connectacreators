import { useEffect, useRef, useState } from "react";

interface Props {
  value: number;
  onCommit: (next: number) => void;
  ariaLabel?: string;
}

const USD = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

function parseAmount(raw: string): number | null {
  const trimmed = raw.replace(/[\s$,]/g, "").trim();
  if (!trimmed) return null;
  const k = /^(-?\d*\.?\d+)k$/i.exec(trimmed);
  if (k) return parseFloat(k[1]) * 1000;
  const m = /^(-?\d*\.?\d+)m$/i.exec(trimmed);
  if (m) return parseFloat(m[1]) * 1_000_000;
  const n = parseFloat(trimmed);
  return Number.isFinite(n) ? n : null;
}

export function NumberCell({ value, onCommit, ariaLabel }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const [invalid, setInvalid] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!editing) setDraft(String(value));
  }, [value, editing]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  function commit() {
    const parsed = parseAmount(draft);
    if (parsed === null) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    if (parsed !== value) onCommit(parsed);
    setEditing(false);
  }

  function cancel() {
    setDraft(String(value));
    setInvalid(false);
    setEditing(false);
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => { setDraft(e.target.value); setInvalid(false); }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); commit(); }
          else if (e.key === "Escape") { e.preventDefault(); cancel(); }
        }}
        aria-label={ariaLabel}
        title={invalid ? "Couldn't parse this as a number" : undefined}
        className="w-full bg-transparent outline-none"
        style={{
          border: invalid ? "2px solid rgba(239,68,68,0.6)" : "2px solid rgba(34,211,238,0.55)",
          background: invalid ? "rgba(239,68,68,0.06)" : "rgba(34,211,238,0.08)",
          borderRadius: 3,
          color: "#e2e8f0",
          fontSize: 11,
          fontWeight: 600,
          fontVariantNumeric: "tabular-nums",
          padding: "4px 6px",
          textAlign: "right",
        }}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      aria-label={ariaLabel}
      className="block w-full text-right bg-transparent border-0 cursor-text"
      style={{
        color: "#e2e8f0",
        fontSize: 11,
        fontWeight: 600,
        fontVariantNumeric: "tabular-nums",
        padding: "4px 0",
        minHeight: 22,
      }}
    >
      {USD.format(value)}
    </button>
  );
}
