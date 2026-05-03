// src/components/assistant/AssistantChipsBar.tsx
//
// Small horizontal scroll bar of context chips rendered above the assistant
// input. Pure presentational — receives a string array and a click handler.
// Lifted out of `src/components/canvas/CanvasAIPanel.tsx` (Phase B.1, Task 4).
//
// The chip *content* (which strings to show) is computed by the caller
// (canvas uses `getDynamicChips` which is canvas-context-aware). This
// component only renders.

export interface AssistantChipsBarProps {
  chips: string[];
  onChip: (label: string) => void;
  /** Disable all chip buttons — e.g. while a request is in-flight */
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
        gap: 5,
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
            background: "transparent",
            border: "1px solid rgba(255,255,255,0.08)",
            color: "rgba(255,255,255,0.4)",
            borderRadius: 8,
            padding: "4px 9px",
            fontSize: 10,
            whiteSpace: "nowrap",
            flexShrink: 0,
            cursor: "pointer",
            opacity: disabled ? 0.4 : 1,
          }}
        >
          {chip}
        </button>
      ))}
    </div>
  );
}
