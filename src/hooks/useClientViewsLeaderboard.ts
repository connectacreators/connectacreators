// Fleet-wide "which clients are getting views" leaderboard, built on the
// same client-channel matching used by ViewsGuaranteeCard.tsx — a client's
// tracked channels are inferred from their onboarding social handles
// matched against viral_channels, not a direct foreign key.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { onboardingSocialChannels } from "@/lib/viral/channelHandle";
import { rankClientViews, type RankedClientViews } from "@/lib/commandDeck/clientViews";

const DAY_MS = 24 * 60 * 60 * 1000;

export function useClientViewsLeaderboard(): { loading: boolean; ranked: RankedClientViews[] } {
  const [state, setState] = useState<{ loading: boolean; ranked: RankedClientViews[] }>({
    loading: true,
    ranked: [],
  });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const [{ data: clients }, { data: channels }] = await Promise.all([
        supabase.from("clients").select("id, name, onboarding_data"),
        supabase.from("viral_channels").select("id, username, platform"),
      ]);
      if (cancelled) return;
      if (!clients || !channels) {
        setState({ loading: false, ranked: [] });
        return;
      }

      // Map each client to the viral_channels rows their onboarding handles
      // resolve to — same platform+username exact match ViewsGuaranteeCard uses.
      const clientChannelIds = new Map<string, string[]>();
      for (const c of clients) {
        const handles = onboardingSocialChannels((c.onboarding_data as Record<string, unknown>) || {});
        const ids = handles
          .map((h) => channels.find((ch) => ch.platform === h.platform && ch.username === h.username))
          .filter((ch): ch is { id: string; username: string; platform: string } => Boolean(ch))
          .map((ch) => ch.id);
        if (ids.length > 0) clientChannelIds.set(c.id, ids);
      }

      const allChannelIds = Array.from(new Set(Array.from(clientChannelIds.values()).flat()));
      if (allChannelIds.length === 0) {
        setState({ loading: false, ranked: [] });
        return;
      }

      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * DAY_MS);
      const twoWeeksAgo = new Date(now.getTime() - 14 * DAY_MS);

      const { data: videos } = await supabase
        .from("viral_videos")
        .select("channel_id, views_count, posted_at")
        .in("channel_id", allChannelIds)
        .gte("posted_at", twoWeeksAgo.toISOString())
        .limit(5000);
      if (cancelled) return;

      const viewsByChannelThisWeek = new Map<string, number>();
      const viewsByChannelPriorWeek = new Map<string, number>();
      for (const v of videos || []) {
        const postedAt = new Date(v.posted_at as string);
        const bucket = postedAt >= weekAgo ? viewsByChannelThisWeek : viewsByChannelPriorWeek;
        bucket.set(v.channel_id as string, (bucket.get(v.channel_id as string) || 0) + (v.views_count || 0));
      }

      const rows = Array.from(clientChannelIds.entries()).map(([clientId, ids]) => {
        const client = clients.find((c) => c.id === clientId);
        const viewsThisWeek = ids.reduce((sum, id) => sum + (viewsByChannelThisWeek.get(id) || 0), 0);
        const viewsPriorWeek = ids.reduce((sum, id) => sum + (viewsByChannelPriorWeek.get(id) || 0), 0);
        return { clientId, clientName: client?.name || "Unknown", viewsThisWeek, viewsPriorWeek };
      });

      setState({ loading: false, ranked: rankClientViews(rows) });
    }

    load().catch((err) => {
      console.error("useClientViewsLeaderboard failed", err);
      if (!cancelled) setState((s) => ({ ...s, loading: false }));
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
