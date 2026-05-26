export interface AssistantChipsBarProps {
  chips: string[];
  onChip: (label: string) => void;
  disabled?: boolean;
  className?: string;
}

export function AssistantChipsBar({
  chips,
  onChip,
  disabled,
  className,
}: AssistantChipsBarProps) {
  if (!chips || chips.length === 0) return null;
  return (
    <div
      className={className}
      style={{
        display: "flex",
        gap: 6,
        overflowX: "auto",
        scrollbarWidth: "none",
        WebkitOverflowScrolling: "touch" as any,
        marginBottom: 6,
        paddingBottom: 2,
        alignItems: "center",
      }}
    >
      {chips.map((chip) => (
        <button
          type="button"
          key={chip}
          onClick={() => onChip(chip)}
          disabled={disabled}
          className="assistant-chip"
          style={{
            background: disabled ? "hsl(var(--aqua) / 0.30)" : "hsl(var(--aqua))",
            border: `1px solid ${disabled ? "hsl(var(--ink-on-cream) / 0.15)" : "hsl(var(--ink-on-cream))"}`,
            borderRadius: 999,
            color: disabled ? "hsl(var(--ink-on-cream) / 0.35)" : "hsl(var(--ink-on-cream))",
            padding: "4px 10px",
            fontSize: 10,
            fontWeight: 500,
            whiteSpace: "nowrap",
            flexShrink: 0,
            cursor: disabled ? "default" : "pointer",
            transition: "background 160ms ease, border-color 160ms ease, color 160ms ease",
          }}
        >
          {chip}
        </button>
      ))}
    </div>
  );
}
