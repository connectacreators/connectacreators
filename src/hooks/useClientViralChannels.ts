import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { onboardingSocialChannels, type ViralPlatform } from "@/lib/viral/channelHandle";

export interface ViralChannelRow {
  id: string;
  username: string;
  platform: string;
  display_name: string | null;
  avatar_url: string | null;
  follower_count: number | null;
  avg_views: number;
  video_count: number;
  last_scraped_at: string | null;
  scrape_status: "idle" | "running" | "done" | "error";
  scrape_error: string | null;
}

export interface ClientChannelLink {
  platform: ViralPlatform;
  username: string;
  channel: ViralChannelRow | null;
}

/** Match the client's onboarding handles (IG/TikTok/YouTube) against
 *  viral_channels, and add missing ones via the same insert + scrape-channel
 *  flow Viral Today uses. Polls while any linked channel is scraping. */
export function useClientViralChannels(onboarding: Record<string, unknown>, clientId?: string) {
  const { user } = useAuth();
  const [links, setLinks] = useState<ClientChannelLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingPlatforms, setAddingPlatforms] = useState<ViralPlatform[]>([]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fbFetchedRef = useRef(false);

  const handles = onboardingSocialChannels(onboarding);
  const handlesKey = handles.map(h => `${h.platform}:${h.username}`).join(",");

  const refresh = useCallback(async () => {
    const wanted: { platform: ViralPlatform; username: string }[] = onboardingSocialChannels(onboarding);

    // Facebook is sourced from the scheduler's social_connections (official
    // Graph API via page token) — NOT onboarding handles — because FB pages
    // can't be scraped. The channel row is keyed by the connection's label.
    if (clientId) {
      const { data: fb } = await supabase
        .from("social_connections")
        .select("account_label")
        .eq("client_id", clientId)
        .eq("platform", "facebook")
        .eq("status", "active")
        .maybeSingle();
      if (fb?.account_label) {
        const fbUser = String(fb.account_label).replace(/^@/, "");
        if (!wanted.some(w => w.platform === "facebook")) wanted.push({ platform: "facebook", username: fbUser });
      }
    }

    if (wanted.length === 0) {
      setLinks([]);
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from("viral_channels")
      .select("id, username, platform, display_name, avatar_url, follower_count, avg_views, video_count, last_scraped_at, scrape_status, scrape_error")
      .in("username", wanted.map(h => h.username));
    const rows = (data || []) as ViralChannelRow[];
    setLinks(wanted.map(h => ({
      ...h,
      channel: rows.find(r => r.platform === h.platform && r.username === h.username) || null,
    })));
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handlesKey, clientId]);

  useEffect(() => { refresh(); }, [refresh]);

  // Refresh the client's Facebook page videos once per mount via the Graph API
  // (persists into viral_videos), then re-read so the FB channel appears.
  useEffect(() => {
    if (!clientId || fbFetchedRef.current) return;
    fbFetchedRef.current = true;
    supabase.functions
      .invoke("fetch-facebook-videos", { body: { client_id: clientId, persist: true } })
      .then(() => refresh())
      .catch(() => {});
  }, [clientId, refresh]);

  // Poll while any channel is mid-scrape so status flips to done/error live.
  const anyRunning = links.some(l => l.channel?.scrape_status === "running");
  useEffect(() => {
    if (!anyRunning) {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      return;
    }
    pollRef.current = setInterval(refresh, 8_000);
    return () => {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    };
  }, [anyRunning, refresh]);

  /** Add the given missing channels sequentially (the VPS scraper rejects
   *  concurrent runs). Team-initiated: never touches client scrape credits. */
  const addChannels = useCallback(async (targets: { platform: ViralPlatform; username: string }[]) => {
    if (targets.length === 0) return;
    setAddingPlatforms(targets.map(t => t.platform));
    try {
      for (const { platform, username } of targets) {
        try {
          const { data: existing } = await supabase
            .from("viral_channels")
            .select("id")
            .eq("platform", platform)
            .eq("username", username)
            .maybeSingle();

          let channelId = existing?.id as string | undefined;
          if (!channelId) {
            const { data: created, error } = await supabase
              .from("viral_channels")
              .insert({ username, platform, created_by: user?.id })
              .select("id")
              .single();
            if (error) throw error;
            channelId = created.id;
          }
          await refresh();

          const invokeScrape = () => supabase.functions.invoke("scrape-channel", {
            body: { channelId, username, platform },
          });
          let { data: result, error: scrapeError } = await invokeScrape();
          if (!scrapeError && result?.server_busy) {
            // One retry after the scraper frees up; else the 4h auto-scrape
            // picks the channel up on its own.
            await new Promise(r => setTimeout(r, 30_000));
            ({ data: result, error: scrapeError } = await invokeScrape());
          }
          if (scrapeError) throw scrapeError;
          if (result?.server_busy) {
            toast.info(`@${username} queued — the auto-scrape will pick it up shortly`);
          } else if (result?.status === "done") {
            toast.success(`@${username} scraped — ${result.videosStored ?? 0} posts tracked`);
          } else {
            toast.info(`Scraping @${username}… results in a few minutes`);
          }
        } catch (e) {
          toast.error(`@${username}: ${e instanceof Error ? e.message : "failed to add"}`);
        }
        await refresh();
      }
    } finally {
      setAddingPlatforms([]);
    }
  }, [refresh, user?.id]);

  const linked = links.filter(l => l.channel);
  const missing = links.filter(l => !l.channel);

  return { links, linked, missing, loading, addingPlatforms, addChannels, refresh };
}
