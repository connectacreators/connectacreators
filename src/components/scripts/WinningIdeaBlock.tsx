/**
 * Soft-glow card that elevates the "winning idea" (idea_ganadora) as the
 * dominant element over metadata like target/format. The top label shows the
 * script's `format` uppercased (e.g. "TALKING HEAD"), giving each card a
 * scannable per-script identity instead of a repeated "WINNING IDEA" banner.
 * Falls back to "SCRIPT" when there's no curated idea or no format.
 *
 * Variants:
 *   - "detail"  → large headline (22px), for the Public share page
 *   - "editor"  → mid headline (17px), for the Script Doc Editor metadata block
 *   - "node"    → compact (13px, no gradient), for the canvas Script node
 */

import { ReactNode, useState } from "react";

type Variant = "detail" | "editor" | "node";

const TARGET_CHIP_TRUNCATE_CHARS = 40;

interface WinningIdeaBlockProps {
  idea: string | null | undefined;
  hasIdea?: boolean;                 // false → render fallback "SCRIPT" label
  target?: string | null;
  format?: string | null;
  inspirationUrl?: string | null;
  variant?: Variant;
  className?: string;
  children?: ReactNode;              // optional extra row (e.g. inline rename)
  onIdeaClick?: () => void;          // for surfaces where clicking the idea opens edit mode
}

const GLOW_BORDER = "rgba(34,211,238,0.35)";
const GLOW_LABEL  = "rgba(34,211,238,0.7)";

export function WinningIdeaBlock({
  idea,
  hasIdea = !!idea,
  target,
  format,
  inspirationUrl,
  variant = "editor",
  className,
  children,
  onIdeaClick,
}: WinningIdeaBlockProps) {
  const label = hasIdea ? (format?.trim().toUpperCase() || "SCRIPT") : "SCRIPT";
  const display = idea || "Untitled";

  const sizes = {
    detail: { padding: "22px 24px", radius: 16, titleSize: 22, labelSize: 10 },
    editor: { padding: "18px 20px", radius: 14, titleSize: 17, labelSize: 10 },
    node:   { padding: "10px 12px", radius: 10, titleSize: 13, labelSize: 9 },
  }[variant];

  const containerStyle: React.CSSProperties = variant === "node"
    ? {
        padding: sizes.padding,
        borderRadius: sizes.radius,
        border: `1px solid ${GLOW_BORDER}`,
        borderLeft: "3px solid #22d3ee",
        background: "rgba(15,23,42,0.7)",
      }
    : {
        padding: sizes.padding,
        borderRadius: sizes.radius,
        border: `1px solid ${GLOW_BORDER}`,
        background: "radial-gradient(ellipse at top left, rgba(34,211,238,0.12), rgba(34,211,238,0.02) 60%)",
        boxShadow: "inset 0 0 40px rgba(34,211,238,0.05)",
      };

  return (
    <div className={className} style={containerStyle}>
      <div
        style={{
          fontSize: sizes.labelSize,
          textTransform: "uppercase",
          letterSpacing: 1.5,
          color: GLOW_LABEL,
          fontWeight: 700,
          marginBottom: variant === "node" ? 4 : 8,
        }}
      >
        {label}
      </div>
      <h2
        onClick={onIdeaClick}
        style={{
          fontSize: sizes.titleSize,
          fontWeight: 700,
          color: "#ffffff",
          lineHeight: 1.3,
          margin: 0,
          marginBottom: variant === "node" ? 0 : (target || format || inspirationUrl) ? 12 : 0,
          cursor: onIdeaClick ? "pointer" : "default",
          overflowWrap: "anywhere",
        }}
      >
        {display}
      </h2>
      {children}
      {(target || format || inspirationUrl) && variant !== "node" && (
        <div
          style={{
            display: "flex",
            gap: 6,
            flexWrap: "wrap",
            paddingTop: 10,
            borderTop: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          {target && <TargetChip target={target} />}
          {format && <MetaChip label="Format">{format}</MetaChip>}
          {inspirationUrl && (
            <a
              href={inspirationUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                fontSize: 10,
                padding: "3px 9px",
                borderRadius: 999,
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.1)",
                color: "rgba(255,255,255,0.75)",
                textDecoration: "none",
              }}
            >
              <span style={{ color: "rgba(255,255,255,0.5)", fontWeight: 500 }}>Inspiration</span>
              &nbsp;Open
            </a>
          )}
        </div>
      )}
    </div>
  );
}

function TargetChip({ target }: { target: string }) {
  const [expanded, setExpanded] = useState(false);
  const needsTruncation = target.length > TARGET_CHIP_TRUNCATE_CHARS;
  const display = !needsTruncation || expanded
    ? target
    : `${target.slice(0, TARGET_CHIP_TRUNCATE_CHARS).trimEnd()}…`;

  return (
    <button
      type="button"
      onClick={() => needsTruncation && setExpanded((v) => !v)}
      title={needsTruncation && !expanded ? target : undefined}
      aria-expanded={needsTruncation ? expanded : undefined}
      aria-label={needsTruncation ? `Target: ${target}` : undefined}
      style={{
        display: "inline-flex",
        alignItems: "flex-start",
        gap: 4,
        fontSize: 10,
        padding: "3px 9px",
        borderRadius: 999,
        background: "rgba(255,255,255,0.05)",
        border: "1px solid rgba(255,255,255,0.1)",
        color: "rgba(255,255,255,0.75)",
        cursor: needsTruncation ? "pointer" : "default",
        textAlign: "left",
        maxWidth: expanded ? "100%" : undefined,
        whiteSpace: expanded ? "normal" : "nowrap",
        font: "inherit",
        lineHeight: 1.4,
      }}
    >
      <span style={{ color: "rgba(255,255,255,0.5)", fontWeight: 500, flexShrink: 0 }}>Target</span>
      <span>&nbsp;{display}</span>
    </button>
  );
}

function MetaChip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: 10,
        padding: "3px 9px",
        borderRadius: 999,
        background: "rgba(255,255,255,0.05)",
        border: "1px solid rgba(255,255,255,0.1)",
        color: "rgba(255,255,255,0.75)",
      }}
    >
      <span style={{ color: "rgba(255,255,255,0.5)", fontWeight: 500 }}>{label}</span>
      &nbsp;{children}
    </span>
  );
}

export default WinningIdeaBlock;
