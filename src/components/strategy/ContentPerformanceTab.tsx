import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, ExternalLink, RefreshCw, Plus, ChevronDown, ChevronUp } from "lucide-react";
import { Link } from "react-router-dom";
import {
  fmtViews,
  fmtOutlier,
  timeAgo,
  proxyImg,
  getOutlierColor,
  getViewsColor,
  getEngagementColor,
  PLATFORM_ICON,
} from "@/lib/viral-card-utils";
import type { ClientChannelLink } from "@/hooks/useClientViralChannels";
import type { ViralPlatform } from "@/lib/viral/channelHandle";

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
  links: ClientChannelLink[];
  isTeam: boolean;
  en: boolean;
  banner: React.ReactNode;
  addingPlatforms: ViralPlatform[];
  onAdd: (targets: { platform: ViralPlatform; username: string }[]) => void;
}

const STAT_POSTS = 20;

type SortKey = "date" | "views" | "likes" | "comments" | "engagement" | "outlier";

export function ContentPerformanceTab({ links, isTeam, en, banner, addingPlatforms, onAdd }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [videos, setVideos] = useState<PerfVideo[]>([]);
  const [loadingVideos, setLoadingVideos] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortAsc, setSortAsc] = useState(false);

  const linked = links.filter(l => l.channel);

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
      .limit(50)
      .then(({ data, error }) => {
        if (cancelled) return;
        // Keep the last good videos on a transient RLS/auth blip rather than
        // blanking the list.
        if (error) { setLoadingVideos(false); return; }
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

  const sortedVideos = useMemo(() => {
    const val = (v: PerfVideo): number => {
      switch (sortKey) {
        case "views": return v.views_count || 0;
        case "likes": return v.likes_count || 0;
        case "comments": return v.comments_count || 0;
        case "engagement": return v.engagement_rate || 0;
        case "outlier": return v.outlier_score || 0;
        default: return new Date(v.posted_at ?? v.scraped_at).getTime();
      }
    };
    return videos.slice().sort((a, b) => (sortAsc ? val(a) - val(b) : val(b) - val(a)));
  }, [videos, sortKey, sortAsc]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setSortAsc(a => !a);
    else { setSortKey(key); setSortAsc(false); }
  };

  if (links.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        {banner}
        <div className="glass-card rounded-xl p-8 text-center">
          <p className="text-sm text-white/70 font-semibold mb-1">
            {en ? "No channels found in onboarding" : "No hay canales en el onboarding"}
          </p>
          <p className="text-xs text-muted-foreground">
            {en
              ? "Add Instagram, TikTok, YouTube, or Facebook handles in the client's onboarding to track performance."
              : "Agrega usuarios de Instagram, TikTok, YouTube o Facebook en el onboarding del cliente para monitorear el rendimiento."}
          </p>
        </div>
      </div>
    );
  }

  const scraping = channel?.scrape_status === "running";
  const scrapeFailed = channel?.scrape_status === "error";

  const SORT_COLUMNS: { key: SortKey; label: string }[] = [
    { key: "date", label: en ? "Date" : "Fecha" },
    { key: "views", label: en ? "Views" : "Vistas" },
    { key: "likes", label: "Likes" },
    { key: "comments", label: en ? "Comments" : "Coment." },
    { key: "engagement", label: "Eng %" },
    { key: "outlier", label: "Outlier" },
  ];

  return (
    <div className="flex flex-col gap-3">
      {banner}

      {/* Channel switcher — every onboarding channel; untracked ones addable by team */}
      {links.length > 1 && (
        <div className="flex items-center gap-2 flex-wrap">
          {links.map(l => {
            const Icon = PLATFORM_ICON[l.platform];
            const isLinked = !!l.channel;
            const active = isLinked && l.channel!.id === channel?.id;
            const isAdding = addingPlatforms.includes(l.platform);
            return (
              <button
                key={`${l.platform}:${l.username}`}
                onClick={() => {
                  if (isLinked) setSelectedId(l.channel!.id);
                  else if (isTeam && !isAdding) onAdd([{ platform: l.platform, username: l.username }]);
                }}
                disabled={!isLinked && (!isTeam || isAdding)}
                title={isLinked ? undefined : (isTeam ? (en ? "Not tracked — click to add to Viral Today" : "Sin monitorear — clic para añadir a Viral Today") : (en ? "Not tracked yet" : "Aún sin monitorear"))}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors disabled:cursor-default"
                style={{
                  background: active ? "hsl(var(--aqua) / 0.12)" : "rgba(255,255,255,0.05)",
                  border: active ? "1px solid hsl(var(--aqua) / 0.35)" : `1px ${isLinked ? "solid" : "dashed"} rgba(255,255,255,${isLinked ? "0.1" : "0.18"})`,
                  color: active ? "hsl(var(--aqua))" : isLinked ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.35)",
                }}
              >
                {isLinked && l.channel!.avatar_url ? (
                  <img src={proxyImg(l.channel!.avatar_url) || undefined} alt="" className="w-4 h-4 rounded-full object-cover" />
                ) : Icon ? <Icon className="w-3.5 h-3.5" /> : null}
                @{l.username}
                {!isLinked && (
                  isAdding
                    ? <Loader2 className="w-3 h-3 animate-spin" />
                    : isTeam
                      ? <span className="flex items-center gap-0.5" style={{ color: "#f59e0b" }}><Plus className="w-3 h-3" />{en ? "track" : "añadir"}</span>
                      : <span className="text-[10px]">{en ? "(not tracked)" : "(sin datos)"}</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Summary stats */}
      {channel && (
      <div className="glass-card rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            {channel.avatar_url && (
              <img src={proxyImg(channel.avatar_url) || undefined} alt="" className="w-8 h-8 rounded-full object-cover" style={{ border: "1.5px solid hsl(var(--aqua) / 0.3)" }} />
            )}
            <div>
              <div className="text-sm font-bold text-foreground">@{selected?.username}</div>
              <div className="text-[10px] text-muted-foreground">
                {channel.follower_count ? `${fmtViews(channel.follower_count)} ${en ? "followers · " : "seguidores · "}` : ""}
                {channel.video_count ?? 0} {en ? "posts tracked" : "posts monitoreados"}
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
              {en ? "Last scrape failed" : "El último escaneo falló"}{channel.scrape_error ? ` — ${channel.scrape_error}` : ""}
            </p>
            {isTeam && selected && (
              <button
                onClick={() => onAdd([{ platform: selected.platform, username: selected.username }])}
                disabled={addingPlatforms.includes(selected.platform)}
                className="flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-md flex-shrink-0 disabled:opacity-50"
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
      )}

      {!channel && (
        <div className="glass-card rounded-xl p-8 text-center">
          <p className="text-sm text-white/70 font-semibold mb-1">
            {en ? "No channels tracked yet" : "Aún no hay canales monitoreados"}
          </p>
          <p className="text-xs text-muted-foreground">
            {isTeam
              ? (en ? "Click a channel above (or use the banner) to start tracking it on Viral Today." : "Haz clic en un canal arriba (o usa el aviso) para monitorearlo en Viral Today.")
              : (en ? "Your channels aren't being tracked yet — ask your strategist." : "Tus canales aún no se están monitoreando — pregunta a tu estratega.")}
          </p>
        </div>
      )}

      {/* Sortable post table */}
      {videos.length > 0 && (
        <div className="glass-card rounded-xl p-3 sm:p-4 overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse">
            <thead>
              <tr className="border-b border-white/[0.08]">
                <th className="text-left text-[9px] font-bold uppercase tracking-wider text-white/30 pb-2 pr-2">
                  {en ? "Post" : "Post"}
                </th>
                {SORT_COLUMNS.map(col => (
                  <th key={col.key} className="pb-2 px-1.5 whitespace-nowrap">
                    <button
                      onClick={() => toggleSort(col.key)}
                      className="flex items-center gap-0.5 ml-auto text-[9px] font-bold uppercase tracking-wider transition-colors"
                      style={{ color: sortKey === col.key ? "hsl(var(--aqua))" : "rgba(255,255,255,0.3)" }}
                    >
                      {col.label}
                      {sortKey === col.key && (sortAsc ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedVideos.map(v => {
                const thumb = proxyImg(v.thumbnail_url, v.video_url);
                const open = v.video_url ? () => window.open(v.video_url!, "_blank", "noopener,noreferrer") : undefined;
                return (
                  <tr
                    key={v.id}
                    onClick={open}
                    className={`border-b border-white/[0.04] last:border-0 ${open ? "cursor-pointer hover:bg-white/[0.03]" : ""} transition-colors`}
                  >
                    <td className="py-2 pr-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-11 rounded overflow-hidden bg-white/[0.05] flex-shrink-0">
                          {thumb && <img src={thumb} alt="" loading="lazy" className="w-full h-full object-cover" />}
                        </div>
                        <span className="text-[11px] text-white/75 truncate max-w-[220px]">
                          {v.caption || (en ? "(no caption)" : "(sin descripción)")}
                        </span>
                      </div>
                    </td>
                    <td className="py-2 px-1.5 text-right text-[11px] text-white/40 whitespace-nowrap">{timeAgo(v.posted_at ?? v.scraped_at)}</td>
                    <td className={`py-2 px-1.5 text-right text-[11px] font-semibold whitespace-nowrap ${getViewsColor(v.views_count || 0)}`}>{fmtViews(v.views_count || 0)}</td>
                    <td className="py-2 px-1.5 text-right text-[11px] text-white/60 whitespace-nowrap">{fmtViews(v.likes_count || 0)}</td>
                    <td className="py-2 px-1.5 text-right text-[11px] text-white/60 whitespace-nowrap">{fmtViews(v.comments_count || 0)}</td>
                    <td className={`py-2 px-1.5 text-right text-[11px] font-semibold whitespace-nowrap ${getEngagementColor(v.engagement_rate || 0)}`}>
                      {v.engagement_rate > 0 ? `${v.engagement_rate.toFixed(1)}%` : "—"}
                    </td>
                    <td className={`py-2 px-1.5 text-right text-[11px] font-bold whitespace-nowrap ${getOutlierColor(v.outlier_score || 0)}`}>
                      {fmtOutlier(v.outlier_score || 0)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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
