// src/components/dashboard/TriageClientBlock.tsx
//
// One client block in the admin triage dashboard: a card with a colored
// monogram avatar, the client name, a chevron link to the drilldown, and
// up to 5 rows (already pre-sorted by the parent).

import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { TriageRow } from "./TriageRow";
import type { TriageClient, TriageRow as TriageRowData } from "@/lib/triage/types";

interface Props {
  client: TriageClient;
  rows: TriageRowData[];
}

// Deterministic monogram palette — picks one slot per client name hash.
const MONOGRAM_PALETTE: Array<{ bg: string; fg: string }> = [
  { bg: '#C5882F', fg: '#FFFFFF' },  // honey
  { bg: '#2F6B62', fg: '#FFFFFF' },  // pine
  { bg: '#7C5BAE', fg: '#FFFFFF' },  // violet
  { bg: '#B23A2A', fg: '#FFFFFF' },  // brick
  { bg: '#1F4D72', fg: '#FFFFFF' },  // navy
  { bg: '#3D7846', fg: '#FFFFFF' },  // forest
  { bg: '#141414', fg: '#EAE6DC' },  // ink
];

function colorFor(name: string): { bg: string; fg: string } {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return MONOGRAM_PALETTE[Math.abs(h) % MONOGRAM_PALETTE.length];
}

function initials(name: string): string {
  const cleaned = name.replace(/['']/g, '').trim();
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return cleaned.slice(0, 2).toUpperCase();
}

export function TriageClientBlock({ client, rows }: Props) {
  const mono = colorFor(client.name);

  return (
    <article
      className="group relative rounded-2xl transition-all"
      style={{
        background: 'rgba(255,255,255,0.55)',
        border: '1px solid rgba(20,20,20,0.07)',
        boxShadow: '0 1px 0 rgba(20,20,20,0.03)',
        padding: '20px 24px 22px',
        marginBottom: 14,
        backdropFilter: 'blur(6px)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = '0 12px 32px rgba(20,20,20,0.07), 0 2px 0 rgba(20,20,20,0.04)';
        e.currentTarget.style.transform = 'translateY(-1px)';
        e.currentTarget.style.borderColor = 'rgba(20,20,20,0.10)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = '0 1px 0 rgba(20,20,20,0.03)';
        e.currentTarget.style.transform = 'none';
        e.currentTarget.style.borderColor = 'rgba(20,20,20,0.07)';
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
          <h2
            className="truncate"
            style={{
              fontSize: 25,
              fontWeight: 500,
              color: '#141414',
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
          color="rgba(20,20,20,0.30)"
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
