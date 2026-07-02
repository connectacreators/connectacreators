// src/components/dashboard/TriageClientBlock.tsx
//
// One client block in the admin triage dashboard: a card with a colored
// monogram avatar, the client name, a chevron link to the drilldown, and
// up to 5 rows (already pre-sorted by the parent).

import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { TriageRow } from "./TriageRow";
import { ClientAvatar } from "./ClientAvatar";
import type { TriageClient, TriageRow as TriageRowData } from "@/lib/triage/types";
import { colorFor, initials } from "@/lib/triage/clientMonogram";

interface Props {
  client: TriageClient;
  rows: TriageRowData[];
  /** Base64 Instagram profile picture; falls back to initials when absent. */
  picUrl?: string | null;
}


export function TriageClientBlock({ client, rows, picUrl }: Props) {
  const mono = colorFor(client.name);

  return (
    <article
      className="group relative rounded-2xl transition-all"
      style={{
        // Opaque mix instead of translucent white + backdrop-blur: the page
        // behind is flat cream, and per-card backdrop-filter re-blurs on
        // every scroll frame.
        background: 'color-mix(in srgb, white 55%, hsl(var(--cream)))',
        border: '1px solid hsl(var(--ink-on-cream) / 0.07)',
        boxShadow: '0 1px 0 hsl(var(--ink-on-cream) / 0.03)',
        padding: '20px 24px 22px',
        marginBottom: 14,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = '0 12px 32px hsl(var(--ink-on-cream) / 0.07), 0 2px 0 hsl(var(--ink-on-cream) / 0.04)';
        e.currentTarget.style.transform = 'translateY(-1px)';
        e.currentTarget.style.borderColor = 'hsl(var(--ink-on-cream) / 0.10)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = '0 1px 0 hsl(var(--ink-on-cream) / 0.03)';
        e.currentTarget.style.transform = 'none';
        e.currentTarget.style.borderColor = 'hsl(var(--ink-on-cream) / 0.07)';
      }}
    >
      {/* Soft colored accent bar on the left edge */}
      <span
        aria-hidden
        style={{
          position: 'absolute',
          left: 0,
          top: 16,
          bottom: 16,
          width: 3,
          borderRadius: 999,
          background: mono.bg,
          opacity: 0.55,
        }}
      />

      <Link
        to={`/dashboard?client=${client.id}`}
        className="flex items-center justify-between mb-3"
        style={{ textDecoration: 'none' }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <ClientAvatar
            picUrl={picUrl}
            alt={client.name}
            size={38}
            style={{ boxShadow: 'inset 0 -1px 0 rgba(0,0,0,0.12)' }}
            fallback={
              <div
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 999,
                  background: mono.bg,
                  color: mono.fg,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontFamily: "var(--font-display, 'EB Garamond'), Georgia, serif",
                  fontSize: 16,
                  fontWeight: 500,
                  letterSpacing: '-0.02em',
                  flexShrink: 0,
                  boxShadow: 'inset 0 -1px 0 rgba(0,0,0,0.12)',
                }}
              >
                {initials(client.name)}
              </div>
            }
          />
          <h2
            className="truncate"
            style={{
              fontSize: 25,
              fontWeight: 500,
              color: 'hsl(var(--ink-on-cream))',
              letterSpacing: '-0.01em',
              fontFamily: "var(--font-display, 'EB Garamond'), Georgia, serif",
              lineHeight: 1.1,
            }}
          >
            {client.name}
          </h2>
        </div>
        <ChevronRight
          size={20}
          color="hsl(var(--ink-on-cream) / 0.30)"
          className="transition-transform group-hover:translate-x-0.5 shrink-0"
        />
      </Link>

      <div className="flex flex-col gap-0.5 pl-[50px]">
        {rows.map((row, i) => (
          <TriageRow key={`${row.type}-${i}`} row={row} clientId={client.id} />
        ))}
      </div>
    </article>
  );
}
