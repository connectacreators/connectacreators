interface Props {
  value: boolean;
  onCommit: (next: boolean) => void;
  onLabel: string;
  offLabel?: string;
  ariaLabel?: string;
}

export function ToggleCell({ value, onCommit, onLabel, offLabel, ariaLabel }: Props) {
  return (
    <button
      type="button"
      onClick={() => onCommit(!value)}
      aria-label={ariaLabel}
      aria-pressed={value}
      className="inline-flex items-center cursor-pointer"
      style={{
        background: value ? "rgba(245,158,11,0.18)" : "transparent",
        color: value ? "#f59e0b" : "rgba(148,163,184,0.4)",
        border: value ? "1px solid rgba(245,158,11,0.30)" : "1px dashed rgba(148,163,184,0.25)",
        borderRadius: 4,
        padding: "2px 7px",
        fontSize: 9,
        fontWeight: 600,
      }}
    >
      {value ? onLabel : (offLabel ?? "—")}
    </button>
  );
}
