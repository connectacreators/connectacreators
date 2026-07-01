-- Outlier score = views / channel baseline, where the baseline is the MEDIAN
-- views over the channel's trailing 90 days (excluding the video itself). Falls
-- back to the channel's all-time median when the 90-day window has <3 prior
-- videos. Median (not mean) because a channel's mean is dominated by the very
-- spikes we are trying to measure — a trailing MEAN over a small batch also caps
-- the max achievable score near the sample size, which is why the old
-- views/batch-mean formula could never produce the 50-100x scores competitors show.
--
-- Applied to prod via Supabase MCP on 2026-07-01 (not `db push`). Kept here for
-- provenance. Called after every channel scrape by auto-scrape-channels and
-- scrape-channel; backfilled once across all channels at deploy time.
create or replace function recompute_channel_outliers(p_channel_id uuid)
returns void
language sql
as $$
  update viral_videos t
  set outlier_score = c.new_score
  from (
    select v.id,
      coalesce(
        round(
          (v.views_count / nullif(
            case when w.win_n >= 3 then w.win_med else a.all_med end
          , 0))::numeric
        , 1)
      , 1.0) as new_score
    from viral_videos v
    left join lateral (
      select percentile_cont(0.5) within group (order by p.views_count) as win_med,
             count(*) as win_n
      from viral_videos p
      where p.channel_id = v.channel_id and p.id <> v.id
        and p.views_count is not null
        and v.posted_at is not null
        and p.posted_at >= v.posted_at - interval '90 days'
        and p.posted_at <  v.posted_at
    ) w on true
    left join lateral (
      select percentile_cont(0.5) within group (order by p.views_count) as all_med
      from viral_videos p
      where p.channel_id = v.channel_id and p.id <> v.id
        and p.views_count is not null
    ) a on true
    where v.channel_id = p_channel_id
      and v.views_count is not null
  ) c
  where t.id = c.id;
$$;
