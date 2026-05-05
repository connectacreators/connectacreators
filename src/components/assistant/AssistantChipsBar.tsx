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
          style={{
            position: "relative",
            background: "none",
            border: "none",
            color: disabled ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.5)",
            padding: "4px 10px",
            fontSize: 10,
            whiteSpace: "nowrap",
            flexShrink: 0,
            cursor: disabled ? "default" : "pointer",
          }}
        >
          <svg
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              overflow: "hidden",
              pointerEvents: "none",
              opacity: disabled ? 0.4 : 1,
            }}
            viewBox="0 0 120 26"
            preserveAspectRatio="none"
          >
            <path
              d="M6,2.5 C30,1 90,1 112,2.5 C117,3 119,5.5 119,8.5 C119.5,13 119,18 118,21.5 C117,24.5 114,26 108,26.5 C80,27.5 40,27.5 14,26.5 C7,26 3,24 2,21 C1,17 1,11 2,7 C3,4 4.5,3 6,2.5 Z"
              fill="none"
              stroke="rgba(201,169,110,0.28)"
              strokeWidth="1.1"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {chip}
        </button>
      ))}
    </div>
  );
}
