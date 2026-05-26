// src/components/dashboard/TriageClientBlock.tsx
//
// One client block in the admin triage dashboard: name + chevron header
// linking to the drilldown, then up to 5 rows (already pre-sorted).

import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { TriageRow } from "./TriageRow";
import type { TriageClient, TriageRow as TriageRowData } from "@/lib/triage/types";

interface Props {
  client: TriageClient;
  rows: TriageRowData[];
}

export function TriageClientBlock({ client, rows }: Props) {
  return (
    <section style={{ borderTop: '1px solid rgba(20,20,20,0.08)', padding: '18px 0' }}>
      <Link
        to={`/dashboard?client=${client.id}`}
        className="flex items-center justify-between mb-1.5 group"
        style={{ textDecoration: 'none' }}
      >
        <h2
          style={{
            fontSize: 26,
            fontWeight: 500,
            color: '#141414',
            letterSpacing: '-0.01em',
            fontFamily: "'EB Garamond', Georgia, serif",
          }}
        >
          {client.name}
        </h2>
        <ChevronRight
          size={18}
          color="rgba(20,20,20,0.30)"
          className="transition-transform group-hover:translate-x-0.5"
        />
      </Link>

      <div className="flex flex-col gap-0.5">
        {rows.map((row, i) => (
          <TriageRow key={`${row.type}-${i}`} row={row} clientId={client.id} />
        ))}
      </div>
    </section>
  );
}
