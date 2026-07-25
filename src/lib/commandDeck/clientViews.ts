// Pure ranking/formatting math for the Command Deck's Client Views channel.
// Kept dependency-free so it's unit-testable without a Supabase client.

export interface ClientViewsInput {
  clientId: string;
  clientName: string;
  viewsThisWeek: number;
  viewsPriorWeek: number;
}

export interface RankedClientViews {
  clientId: string;
  clientName: string;
  views: number;
  deltaPct: number | null; // null when there's no prior-week baseline to compare against
  up: boolean;
}

/** Ranks clients by this-week views (descending), computing week-over-week delta. */
export function rankClientViews(rows: ClientViewsInput[]): RankedClientViews[] {
  return rows
    .map((r) => {
      const deltaPct =
        r.viewsPriorWeek > 0 ? Math.round(((r.viewsThisWeek - r.viewsPriorWeek) / r.viewsPriorWeek) * 100) : null;
      return {
        clientId: r.clientId,
        clientName: r.clientName,
        views: r.viewsThisWeek,
        deltaPct,
        up: deltaPct !== null ? deltaPct >= 0 : true,
      };
    })
    .sort((a, b) => b.views - a.views);
}

/** Compact view-count formatting: 428431 -> "428K", 1200000 -> "1.2M". */
export function formatViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}
