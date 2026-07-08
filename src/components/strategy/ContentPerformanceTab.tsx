import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, ExternalLink, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import {
  fmtViews,
  fmtOutlier,
  timeAgo,
  proxyImg,
  getOutlierColor,
  viralBadgeClass,
  getEngagementColor,
  PLATFORM_ICON,
} from "@/lib/viral-card-utils";
import type { ClientChannelLink } from "@/hooks/useClientViralChannels";

interface PerfVideo {
  id: string;
  video_url: string | null;
  thumbnail_url: string | null;
  caption: string | null;
  views_count: number;
  likes_count: number;
  comments_count: number;
  engagement_rate: number;
  outlier_score: number;
  posted_at: string | null;
  scraped_at: string;
}

interface Props {
  linked: ClientChannelLink[];
  isTeam: boolean;
  en: boolean;
  banner: React.ReactNode;
  onRescrape: (target: { platform: "instagram" | "tiktok" | "youtube"; username: string }) => void;
}

const STAT_POSTS = 20;

export function ContentPerformanceTab({ linked, isTeam, en, banner, onRescrape }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [videos, setVideos] = useState<PerfVideo[]>([]);
  const [loadingVideos, setLoadingVideos] = useState(false);

  // Instagram is the priority platform; default to it when linked.
  const defaultChannel = linked.find(l => l.platform === "instagram") || linked[0];
  const selected = linked.find(l => l.channel?.id === selectedId) || defaultChannel;
  const channel = selected?.channel || null;

  useEffect(() => {
    if (!channel?.id) { setVideos([]); return; }
    let cancelled = false;
    setLoadingVideos(true);
    supabase
      .from("viral_videos")
      .select("id, video_url, thumbnail_url, caption, views_count, likes_count, comments_count, engagement_rate, outlier_score, posted_at, scraped_at")
      .eq("channel_id", channel.id)
      .order("posted_at", { ascending: false, nullsFirst: false })
      .limit(30)
      .then(({ data }) => {
        if (cancelled) return;
        setVideos((data || []) as PerfVideo[]);
        setLoadingVideos(false);
      });
    return () => { cancelled = true; };
  }, [channel?.id, channel?.last_scraped_at]);

  const stats = useMemo(() => {
    const sample = videos.slice(0, STAT_POSTS);
    if (sample.length === 0) return null;
    const avg = (f: (v: PerfVideo) => number) => sample.reduce((s, v) => s + f(v), 0) / sample.length;
    return {
      sampleSize: sample.length,
      avgViews: Math.round(avg(v => v.views_count || 0)),
      avgLikes: Math.round(avg(v => v.likes_count || 0)),
      avgEngagement: avg(v => v.engagement_rate || 0),
      bestOutlier: Math.max(...sample.map(v => v.outlier_score || 0)),
    };
  }, [videos]);

  if (linked.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        {banner}
        <div className="glass-card rounded-xl p-8 text-center">
          <p className="text-sm text-white/70 font-semibold mb-1">
            {en ? "No channels tracked yet" : "Aún no hay canales monitoreados"}
          </p>
          <p className="text-xs text-muted-foreground">
            {isTeam
              ? (en ? "Add the client's channels to Viral Today above to start tracking post performance." : "Añade los canales del cliente a Viral Today arriba para monitorear el rendimiento.")
              : (en ? "Your channels aren't being tracked yet — ask your strategist." : "Tus canales aún no se están monitoreando — pregunta a tu estratega.")}
          </p>
        </div>
      </div>
    );
  }

  const scraping = channel?.scrape_status === "running";
  const scrapeFailed = channel?.scrape_status === "error";

  return (
    <div className="flex flex-col gap-3">
      {banner}

      {/* Channel switcher */}
      {linked.length > 1 && (
        <div className="flex items-center gap-2 flex-wrap">
          {linked.map(l => {
            const Icon = PLATFORM_ICON[l.platform];
            const active = l.channel?.id === channel?.id;
            return (
              <button
                key={`${l.platform}:${l.username}`}
                onClick={() => setSelectedId(l.channel?.id || null)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors"
                style={{
                  background: active ? "hsl(var(--aqua) / 0.12)" : "rgba(255,255,255,0.05)",
                  border: active ? "1px solid hsl(var(--aqua) / 0.35)" : "1px solid rgba(255,255,255,0.1)",
                  color: active ? "hsl(var(--aqua))" : "rgba(255,255,255,0.55)",
                }}
              >
                {l.channel?.avatar_url ? (
                  <img src={proxyImg(l.channel.avatar_url) || undefined} alt="" className="w-4 h-4 rounded-full object-cover" />
                ) : Icon ? <Icon className="w-3.5 h-3.5" /> : null}
                @{l.username}
              </button>
            );
          })}
        </div>
      )}

      {/* Summary stats */}
      <div className="glass-card rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            {channel?.avatar_url && (
              <img src={proxyImg(channel.avatar_url) || undefined} alt="" className="w-8 h-8 rounded-full object-cover" style={{ border: "1.5px solid hsl(var(--aqua) / 0.3)" }} />
            )}
            <div>
              <div className="text-sm font-bold text-foreground">@{selected?.username}</div>
              <div className="text-[10px] text-muted-foreground">
                {channel?.follower_count ? `${fmtViews(channel.follower_count)} ${en ? "followers · " : "seguidores · "}` : ""}
                {channel?.video_count ?? 0} {en ? "posts tracked" : "posts monitoreados"}
              </div>
            </div>
          </div>
          <Link
            to="/viral-today"
            className="flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-md transition-opacity hover:opacity-80"
            style={{ background: "hsl(var(--aqua) / 0.1)", color: "hsl(var(--aqua))", border: "1px solid hsl(var(--aqua) / 0.2)" }}
          >
            {en ? "View in Viral Today" : "Ver en Viral Today"}
            <ExternalLink className="w-3 h-3" />
          </Link>
        </div>

        {stats ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: en ? "Avg views" : "Vistas prom.", value: fmtViews(stats.avgViews), cls: "text-foreground" },
              { label: en ? "Avg likes" : "Likes prom.", value: fmtViews(stats.avgLikes), cls: "text-foreground" },
              { label: en ? "Avg engagement" : "Engagement prom.", value: `${stats.avgEngagement.toFixed(1)}%`, cls: getEngagementColor(stats.avgEngagement) },
              { label: en ? "Best outlier" : "Mejor outlier", value: fmtOutlier(stats.bestOutlier), cls: getOutlierColor(stats.bestOutlier) },
            ].map(item => (
              <div key={item.label}>
                <div className="text-[9px] font-bold uppercase tracking-wider text-white/30 mb-1">{item.label}</div>
                <div className={`text-lg font-black ${item.cls}`}>{item.value}</div>
              </div>
            ))}
          </div>
        ) : scraping ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            {en ? `Scraping @${selected?.username}… first results in a few minutes.` : `Escaneando @${selected?.username}… primeros resultados en unos minutos.`}
          </div>
        ) : scrapeFailed ? (
          <div className="flex items-center justify-between gap-2 py-2">
            <p className="text-xs" style={{ color: "#ef4444" }}>
              {en ? "Last scrape failed" : "El último escaneo falló"}{channel?.scrape_error ? ` — ${channel.scrape_error}` : ""}
            </p>
            {isTeam && selected && (
              <button
                onClick={() => onRescrape({ platform: selected.platform, username: selected.username })}
                className="flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-md flex-shrink-0"
                style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.25)" }}
              >
                <RefreshCw className="w-3 h-3" />
                {en ? "Re-scrape" : "Re-escanear"}
              </button>
            )}
          </div>
        ) : loadingVideos ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            {en ? "Loading posts…" : "Cargando posts…"}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground py-2">
            {en ? "No posts stored for this channel yet." : "Aún no hay posts guardados para este canal."}
          </p>
        )}

        {stats && (
          <p className="text-[10px] text-white/30 mt-3">
            {en
              ? `Averages over the last ${stats.sampleSize} posts.`
              : `Promedios de los últimos ${stats.sampleSize} posts.`}
          </p>
        )}
      </div>

      {/* Post list */}
      {videos.length > 0 && (
        <div className="glass-card rounded-xl p-3 sm:p-4">
          <div className="flex flex-col divide-y divide-white/[0.06]">
            {videos.map(v => {
              const thumb = proxyImg(v.thumbnail_url, v.video_url);
              const row = (
                <div className="flex items-center gap-3 py-2.5">
                  <div className="w-10 h-14 rounded-md overflow-hidden bg-white/[0.05] flex-shrink-0">
                    {thumb && <img src={thumb} alt="" loading="lazy" className="w-full h-full object-cover" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] text-white/80 truncate">{v.caption || (en ? "(no caption)" : "(sin descripción)")}</p>
                    <div className="flex items-center gap-3 mt-1 text-[10px] text-white/40 flex-wrap">
                      <span>{timeAgo(v.posted_at ?? v.scraped_at)}</span>
                      <span>{fmtViews(v.views_count || 0)} {en ? "views" : "vistas"}</span>
                      <span>{fmtViews(v.likes_count || 0)} likes</span>
                      <span>{fmtViews(v.comments_count || 0)} {en ? "comments" : "comentarios"}</span>
                      {v.engagement_rate > 0 && (
                        <span className={getEngagementColor(v.engagement_rate)}>{v.engagement_rate.toFixed(1)}% eng</span>
                      )}
                    </div>
                  </div>
                  <span className={viralBadgeClass(v.outlier_score || 0)}>{fmtOutlier(v.outlier_score || 0)}</span>
                </div>
              );
              return v.video_url ? (
                <a key={v.id} href={v.video_url} target="_blank" rel="noopener noreferrer" className="hover:bg-white/[0.03] transition-colors rounded-md -mx-1 px-1">
                  {row}
                </a>
              ) : (
                <div key={v.id} className="-mx-1 px-1">{row}</div>
              );
            })}
          </div>
        </div>
      )}

      {/* Freshness footer */}
      {channel?.last_scraped_at && (
        <p className="text-[10px] text-white/30 text-center">
          {en
            ? `Last scraped ${timeAgo(channel.last_scraped_at)} · auto-refreshes every 4 hours`
            : `Último escaneo ${timeAgo(channel.last_scraped_at)} · se actualiza cada 4 horas`}
        </p>
      )}
    </div>
  );
}
