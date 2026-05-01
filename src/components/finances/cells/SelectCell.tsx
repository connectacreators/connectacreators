import { useEffect, useRef, useState } from "react";
import type { FinanceCategory } from "@/hooks/useFinanceTransactions";
import { categoryColor } from "../categoryColors";

interface Props {
  value: FinanceCategory;
  options: FinanceCategory[];
  onCommit: (next: FinanceCategory) => void;
  ariaLabel?: string;
}

export function SelectCell({ value, options, onCommit, ariaLabel }: Props) {
  const [editing, setEditing] = useState(false);
  const selectRef = useRef<HTMLSelectElement | null>(null);

  useEffect(() => {
    if (editing && selectRef.current) selectRef.current.focus();
  }, [editing]);

  if (editing) {
    return (
      <select
        ref={selectRef}
        value={value}
        onChange={(e) => {
          onCommit(e.target.value as FinanceCategory);
          setEditing(false);
        }}
        onBlur={() => setEditing(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setEditing(false);
        }}
        aria-label={ariaLabel}
        className="bg-transparent outline-none"
        style={{
          border: "2px solid rgba(34,211,238,0.55)",
          background: "#0f172a",
          borderRadius: 3,
          color: "#e2e8f0",
          fontSize: 11,
          padding: "3px 5px",
        }}
      >
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    );
  }

  const c = categoryColor(value);
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      aria-label={ariaLabel}
      className="inline-flex items-center cursor-pointer"
      style={{
        background: c.bg,
        color: c.text,
        border: `1px solid ${c.border}`,
        borderRadius: 4,
        padding: "2px 7px",
        fontSize: 9,
        fontWeight: 500,
      }}
    >
      {value}
    </button>
  );
}
