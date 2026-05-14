# Framework Scout & Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the existing viral framework discovery system with ranking scores, niche tags, a Top Framework star indicator, admin URL paste, and upgraded AI tool queries — all without AI credits or new scraping load.

**Architecture:** Three layers — DB migration adds three columns to `viral_videos`; backend computes `framework_score` and `niche_tags` at insert time in the scraper edge function; frontend adds a Star badge to the existing VideoCard and an admin URL paste input; both AI tool paths (`find_viral_videos` in `index.ts` and `search_viral_frameworks` in `build-tool-handlers.ts`) are upgraded to sort by score and surface featured frameworks first.

**Tech Stack:** Supabase (Postgres migrations, edge functions / Deno), React/TypeScript (ViralToday.tsx), Lucide icons, existing VPS scraper infrastructure.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `supabase/migrations/20260505_framework_fields.sql` | Create | Adds `is_featured_framework`, `niche_tags`, `framework_score` to `viral_videos` |
| `supabase/functions/scrape-reels-search/index.ts` | Modify | Compute score + extract tags after upsert |
| `supabase/functions/scrape-framework-url/index.ts` | Create | Admin URL paste — fetch single video via VPS, store with `is_featured_framework = true` |
| `src/pages/ViralToday.tsx` | Modify | `ViralVideo` type, Star indicator on VideoCard, admin URL paste input, star toggle handler |
| `supabase/functions/companion-chat/index.ts` | Modify | Upgrade `find_viral_videos` to sort by `framework_score`, include `niche_tags` + `is_featured_framework` |
| `supabase/functions/companion-chat/build-tool-handlers.ts` | Modify | Upgrade `handleSearchViralFrameworks` to include featured videos + niche_tags |

---

## Task 1: DB Migration

**Files:**
- Create: `supabase/migrations/20260505_framework_fields.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migrations/20260505_framework_fields.sql
alter table viral_videos
  add column if not exists is_featured_framework boolean not null default false,
  add column if not exists niche_tags text[] not null default '{}',
  add column if not exists framework_score float8 not null default 0;

-- Index so AI tool queries sorting by score are fast
create index if not exists idx_viral_videos_framework_score
  on viral_videos (framework_score desc)
  where framework_score > 0;

-- Index so featured videos float to top cheaply
create index if not exists idx_viral_videos_featured
  on viral_videos (is_featured_framework)
  where is_featured_framework = true;
```

- [ ] **Step 2: Apply the migration**

```bash
supabase db push
```

Expected output: migration applied with no errors. Confirm by checking the Supabase dashboard → Table Editor → `viral_videos` for the three new columns.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260505_framework_fields.sql
git commit -m "feat(db): add is_featured_framework, niche_tags, framework_score to viral_videos"
```

---

## Task 2: Scraper Upgrade — Tags + Score on New Results

**Files:**
- Modify: `supabase/functions/scrape-reels-search/index.ts`

Add two pure functions near the top (after the `STOP_WORDS` block), then call them after the upsert.

- [ ] **Step 1: Add helper functions after the `STOP_WORDS` block (around line 19)**

Insert this block immediately after the closing `});` of `STOP_WORDS`:

```ts
// ── Framework helpers ─────────────────────────────────────────────────────

function extractNicheTags(caption: string | null, hashtagSource: string | null): string[] {
  const tags: string[] = [];
  if (hashtagSource) tags.push(hashtagSource.toLowerCase().trim());
  if (caption) {
    const matches = caption.match(/#([a-zA-Z][a-zA-Z0-9_]{1,49})/g) ?? [];
    for (const m of matches) tags.push(m.slice(1).toLowerCase());
  }
  return [...new Set(tags)].slice(0, 20);
}

function computeFrameworkScore(
  outlier: number,
  engagement: number,
  postedAt: string | null,
  scrapedAt: string,
): number {
  const now = Date.now();
  const ref = postedAt ? new Date(postedAt).getTime() : new Date(scrapedAt).getTime();
  const daysSince = (now - ref) / 86_400_000;
  return outlier * Math.log(1 + engagement) * Math.exp(-daysSince / 30);
}
```

- [ ] **Step 2: Enrich each video object before upsert**

In the `.map((post) => { ... })` pipeline (around line 253), change the returned object to include the two new fields. Find the `return { channel_id: null, ...` block and add at the end of the returned object:

```ts
        niche_tags: extractNicheTags(caption.slice(0, 600), cleanQuery),
        framework_score: computeFrameworkScore(
          Number(post.outlier_score) || 1,
          engagementRate,
          postedAt,
          new Date().toISOString(),
        ),
```

The full returned object should now be:
```ts
        return {
          channel_id: null,
          channel_username: post.owner_username || "unknown",
          platform: "instagram",
          video_url: post.url,
          thumbnail_url: post.thumbnail || null,
          caption: caption.slice(0, 600),
          views_count: views,
          likes_count: likes,
          comments_count: comments,
          engagement_rate: Math.round(engagementRate * 100) / 100,
          outlier_score: Number(post.outlier_score) || 1,
          posted_at: postedAt,
          scraped_at: new Date().toISOString(),
          apify_video_id: String(videoId),
          hashtag_source: cleanQuery,
          niche_tags: extractNicheTags(caption.slice(0, 600), cleanQuery),
          framework_score: computeFrameworkScore(
            Number(post.outlier_score) || 1,
            engagementRate,
            postedAt,
            new Date().toISOString(),
          ),
        };
```

- [ ] **Step 3: Deploy the updated function**

```bash
supabase functions deploy scrape-reels-search
```

Expected: deploy succeeds. Run a test search from the Viral Today admin UI and confirm the new video rows appear with non-zero `framework_score` and populated `niche_tags` in the Supabase Table Editor.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/scrape-reels-search/index.ts
git commit -m "feat(scout): compute framework_score and niche_tags on scrape results"
```

---

## Task 3: `scrape-framework-url` Edge Function (Admin URL Paste Backend)

**Files:**
- Create: `supabase/functions/scrape-framework-url/index.ts`

This function accepts a URL from the admin UI, calls the VPS to fetch real metadata, and upserts the result with `is_featured_framework = true`.

- [ ] **Step 1: Create the function directory and file**

```bash
mkdir -p supabase/functions/scrape-framework-url
```

Create `supabase/functions/scrape-framework-url/index.ts`:

```ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const VPS_SERVER = "http://72.62.200.145:3099";
const VPS_API_KEY = "ytdlp_connecta_2026_secret";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function extractNicheTags(caption: string | null): string[] {
  if (!caption) return [];
  const matches = caption.match(/#([a-zA-Z][a-zA-Z0-9_]{1,49})/g) ?? [];
  return [...new Set(matches.map((m) => m.slice(1).toLowerCase()))].slice(0, 20);
}

function computeFrameworkScore(
  outlier: number,
  engagement: number,
  postedAt: string | null,
): number {
  const now = Date.now();
  const ref = postedAt ? new Date(postedAt).getTime() : now;
  const daysSince = (now - ref) / 86_400_000;
  return outlier * Math.log(1 + engagement) * Math.exp(-daysSince / 30);
}

function detectPlatform(url: string): "instagram" | "tiktok" | "youtube" {
  if (/tiktok\.com/i.test(url)) return "tiktok";
  if (/youtube\.com|youtu\.be/i.test(url)) return "youtube";
  return "instagram";
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  // Auth: admin only
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const adminClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) return json({ error: "Unauthorized" }, 401);

  const { data: roleData } = await adminClient
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();
  if (roleData?.role !== "admin") return json({ error: "Admin access required" }, 403);

  const { url } = await req.json();
  if (!url || typeof url !== "string") return json({ error: "url is required" }, 400);

  const platform = detectPlatform(url);

  // Attempt VPS fetch for real metadata
  let vpsData: any = null;
  try {
    const res = await fetch(`${VPS_SERVER}/scrape-single-url`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": VPS_API_KEY },
      body: JSON.stringify({ url }),
      signal: AbortSignal.timeout(60_000),
    });
    if (res.ok) vpsData = await res.json();
  } catch (e) {
    console.warn("[scrape-framework-url] VPS fetch failed:", (e as Error).message);
  }

  const usernameMatch = url.match(/instagram\.com\/(?:reels?\/|p\/)?@?([^/?#\s]+)/i)
    ?? url.match(/tiktok\.com\/@?([^/?#\s]+)/i);
  const channelUsername = (vpsData?.owner_username ?? usernameMatch?.[1] ?? "unknown")
    .replace(/^@/, "");

  const caption = (vpsData?.title ?? "(admin-curated)").slice(0, 600);
  const views = Number(vpsData?.views) || 0;
  const likes = Number(vpsData?.likes) || 0;
  const comments = Number(vpsData?.comments) || 0;
  const engagementRate = views > 0 ? ((likes + comments) / views) * 100 : 0;
  const outlier = Number(vpsData?.outlier_score) || 5; // default high — admin picked it

  let postedAt: string | null = null;
  if (vpsData?.posted_at) {
    const raw = vpsData.posted_at;
    const num = typeof raw === "number" ? raw : Number(raw);
    if (!isNaN(num) && num > 0) {
      postedAt = new Date(num < 2e10 ? num * 1000 : num).toISOString();
    }
  }

  const niche_tags = extractNicheTags(caption);
  const framework_score = computeFrameworkScore(outlier, engagementRate, postedAt);

  // Cache thumbnail if CDN URL
  let thumbnailUrl: string | null = vpsData?.thumbnail ?? null;
  if (thumbnailUrl && /cdninstagram\.com|fbcdn\.net|instagram\.f|scontent/.test(thumbnailUrl)) {
    try {
      const cacheRes = await fetch(`${VPS_SERVER}/cache-thumbnail`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": VPS_API_KEY },
        body: JSON.stringify({ url: thumbnailUrl, key: `framework_${Date.now()}` }),
      });
      if (cacheRes.ok) {
        const { cached_url } = await cacheRes.json();
        if (cached_url) thumbnailUrl = cached_url;
      }
    } catch { /* non-blocking */ }
  }

  const { data: inserted, error: upsertErr } = await adminClient
    .from("viral_videos")
    .upsert({
      channel_id: null,
      channel_username: channelUsername,
      platform,
      video_url: url,
      thumbnail_url: thumbnailUrl,
      caption,
      views_count: views,
      likes_count: likes,
      comments_count: comments,
      engagement_rate: Math.round(engagementRate * 100) / 100,
      outlier_score: outlier,
      posted_at: postedAt,
      scraped_at: new Date().toISOString(),
      is_featured_framework: true,
      niche_tags,
      framework_score,
    }, { onConflict: "platform,video_url", ignoreDuplicates: false })
    .select("id")
    .single();

  if (upsertErr || !inserted) {
    return json({ error: upsertErr?.message ?? "Upsert failed" }, 500);
  }

  return json({ id: inserted.id, channel_username: channelUsername, platform });
});
```

- [ ] **Step 2: Deploy the function**

```bash
supabase functions deploy scrape-framework-url
```

Expected: deploy succeeds with no type errors.

- [ ] **Step 3: Smoke-test via curl (replace TOKEN with a valid admin JWT)**

```bash
curl -X POST \
  https://<your-supabase-url>/functions/v1/scrape-framework-url \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://www.instagram.com/reel/SOME_ID/"}'
```

Expected: `{"id":"<uuid>","channel_username":"...","platform":"instagram"}`. Check the Supabase Table Editor to confirm `is_featured_framework = true` on the new row.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/scrape-framework-url/
git commit -m "feat(scout): scrape-framework-url edge function for admin URL paste"
```

---

## Task 4: ViralToday — Type Update + Star Indicator on VideoCard

**Files:**
- Modify: `src/pages/ViralToday.tsx`

- [ ] **Step 1: Update the `ViralVideo` interface**

Find the `interface ViralVideo` block (around line 155) and add three fields:

```ts
interface ViralVideo {
  id: string;
  channel_id: string | null;
  // ... existing fields unchanged ...
  is_featured_framework?: boolean;
  niche_tags?: string[];
  framework_score?: number;
}
```

- [ ] **Step 2: Add `Star` to the Lucide import**

Find the existing import line:
```ts
import {
  Loader2, TrendingUp, Instagram, Search, ChevronDown, X,
  Plus, Trash2, RefreshCw, Play, Eye, Zap, Radio, ArrowRight,
  LayoutGrid, List, ExternalLink, CheckCircle2, AlertCircle,
  Clock, Flame, Filter, SlidersHorizontal, Youtube, CheckSquare,
} from "lucide-react";
```

Add `Star` to the list:
```ts
import {
  Loader2, TrendingUp, Instagram, Search, ChevronDown, X,
  Plus, Trash2, RefreshCw, Play, Eye, Zap, Radio, ArrowRight,
  LayoutGrid, List, ExternalLink, CheckCircle2, AlertCircle,
  Clock, Flame, Filter, SlidersHorizontal, Youtube, CheckSquare, Star,
} from "lucide-react";
```

- [ ] **Step 3: Add star toggle handler and prop to VideoCard**

In the `VideoCard` function signature (around line 508), add:

```ts
function VideoCard({
  video, isAdmin, onDelete, selected, onToggleSelect, onSeen, onClickVideo, onToggleFeatured,
}: {
  video: ViralVideo;
  isAdmin?: boolean;
  onDelete?: (id: string) => void;
  selected?: boolean;
  onToggleSelect?: (video: ViralVideo) => void;
  onSeen?: (id: string) => void;
  onClickVideo?: (id: string) => void;
  onToggleFeatured?: (video: ViralVideo) => void;
}) {
```

- [ ] **Step 4: Insert the Star button into the thumbnail overlay**

Find the top-right button block (around line 623) — the one that renders trash for admin or external link for non-admin. Insert the Star button **before** that block so it sits to the left of the existing icon:

```tsx
        {/* Top-right: star (featured) + trash (admin) or external link (non-admin) */}
        <div className="absolute top-2 right-2 z-10 flex items-center gap-1">
          {/* Featured star — admin can toggle, non-admin sees read-only */}
          {(video.is_featured_framework || isAdmin) && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (isAdmin && onToggleFeatured) onToggleFeatured(video);
              }}
              className={cn(
                "w-6 h-6 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center border transition-colors",
                video.is_featured_framework
                  ? "border-yellow-400/60 hover:bg-yellow-500/20"
                  : "border-white/10 hover:border-yellow-400/40",
                !isAdmin && "cursor-default",
              )}
              title={video.is_featured_framework ? "Top Framework" : "Mark as Top Framework"}
              disabled={!isAdmin}
            >
              <Star
                className={cn(
                  "w-3 h-3",
                  video.is_featured_framework ? "text-yellow-400 fill-yellow-400" : "text-white/40",
                )}
              />
            </button>
          )}

          {/* Existing trash / external link */}
          {isAdmin ? (
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="w-6 h-6 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center border border-white/10 hover:bg-red-600/80 transition-colors"
              title="Remove video"
            >
              {deleting ? <Loader2 className="w-3 h-3 text-white animate-spin" /> : <Trash2 className="w-3 h-3 text-white/80" />}
            </button>
          ) : (
            <a
              href={video.video_url ?? "#"}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="w-6 h-6 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center border border-white/10 hover:bg-black/80 transition-colors"
              title="Open original"
            >
              <ExternalLink className="w-3 h-3 text-white/80" />
            </a>
          )}
        </div>
```

**Remove** the old separate trash/external-link block that was previously at `absolute top-2 right-2` — it is now replaced by the flex container above.

- [ ] **Step 5: Add `handleToggleFeatured` to the main page and wire it to VideoCard**

In the main `ViralToday` component, add this handler alongside `handleDelete`:

```ts
const handleToggleFeatured = async (video: ViralVideo) => {
  const next = !video.is_featured_framework;
  const { error } = await supabase
    .from("viral_videos")
    .update({ is_featured_framework: next })
    .eq("id", video.id);
  if (error) {
    toast.error("Failed to update framework status");
    return;
  }
  setVideos((prev) =>
    prev.map((v) => (v.id === video.id ? { ...v, is_featured_framework: next } : v))
  );
  toast.success(next ? "Marked as Top Framework" : "Removed from Top Frameworks");
};
```

Then pass it to every `<VideoCard>` render call in the grid:
```tsx
<VideoCard
  key={video.id}
  video={video}
  isAdmin={isAdmin}
  onDelete={handleDelete}
  onToggleFeatured={isAdmin ? handleToggleFeatured : undefined}
  // ... other existing props unchanged
/>
```

- [ ] **Step 6: Commit**

```bash
git add src/pages/ViralToday.tsx
git commit -m "feat(ui): Top Framework star indicator on VideoCard with admin toggle"
```

---

## Task 5: ViralToday — Admin URL Paste Input

**Files:**
- Modify: `src/pages/ViralToday.tsx`

- [ ] **Step 1: Add URL paste state near the top of the component**

Inside `ViralToday`, add alongside the other state declarations:

```ts
const [pasteUrl, setPasteUrl] = useState("");
const [pastingUrl, setPastingUrl] = useState(false);
```

- [ ] **Step 2: Add the submit handler**

```ts
const handlePasteUrl = async () => {
  if (!pasteUrl.trim() || pastingUrl) return;
  setPastingUrl(true);
  try {
    const token = await getAuthToken();
    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/scrape-framework-url`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ url: pasteUrl.trim() }),
      }
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to add framework");
    toast.success(`Framework added — @${data.channel_username}`);
    setPasteUrl("");
    fetchVideos();
  } catch (e: any) {
    toast.error(e.message || "Failed to add framework");
  } finally {
    setPastingUrl(false);
  }
};
```

You'll also need `getAuthToken` imported — it's already used in `ViralVideoDetail.tsx`, import it the same way:
```ts
import { getAuthToken } from "@/lib/getAuthToken";
```

- [ ] **Step 3: Insert the UI in the Videos tab header (admin only)**

Find the header section in the Videos tab render (around the `<h1>Videos</h1>` block, before the search bar). Add this block visible only to admins:

```tsx
{/* Admin: Add Framework by URL */}
{isAdmin && (
  <div className="flex items-center gap-2 mb-4">
    <div className="relative flex-1 max-w-sm">
      <input
        type="url"
        value={pasteUrl}
        onChange={(e) => setPasteUrl(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && handlePasteUrl()}
        placeholder="Add framework by URL (Instagram or TikTok)"
        className="w-full h-8 rounded-lg border border-yellow-500/30 bg-yellow-500/5 text-sm px-3 pr-8 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-yellow-500/60"
      />
      {pasteUrl && (
        <button
          onClick={() => setPasteUrl("")}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
    <Button
      onClick={handlePasteUrl}
      disabled={!pasteUrl.trim() || pastingUrl}
      className="h-8 px-3 bg-yellow-500/15 hover:bg-yellow-500/25 border border-yellow-500/30 text-yellow-400 text-[11px] font-semibold rounded-lg flex items-center gap-1.5"
    >
      {pastingUrl ? <Loader2 className="w-3 h-3 animate-spin" /> : <Star className="w-3 h-3" />}
      {pastingUrl ? "Adding…" : "Add Framework"}
    </Button>
  </div>
)}
```

- [ ] **Step 4: Verify in dev**

```bash
npm run dev
```

Log in as admin, go to Viral Today → Videos tab. Confirm the "Add Framework by URL" input appears above the search bar. Paste a valid Instagram reel URL and confirm a toast fires, then the video appears in the grid with the yellow star filled.

- [ ] **Step 5: Commit**

```bash
git add src/pages/ViralToday.tsx
git commit -m "feat(ui): admin URL paste input to add featured frameworks"
```

---

## Task 6: Upgrade `find_viral_videos` in `companion-chat/index.ts`

**Files:**
- Modify: `supabase/functions/companion-chat/index.ts` (around line 792)

- [ ] **Step 1: Upgrade the query**

Find the `if (block.name === "find_viral_videos")` block (around line 792) and replace the query with:

```ts
        if (block.name === "find_viral_videos") {
          const { topic, platform, limit = 5 } = block.input;

          // Build OR filter across caption, hashtag_source, and niche_tags
          let query = adminClient
            .from("viral_videos")
            .select("id, channel_username, platform, caption, views_count, outlier_score, video_url, thumbnail_url, niche_tags, is_featured_framework, framework_score")
            .gte("outlier_score", 3)
            .order("is_featured_framework", { ascending: false })
            .order("framework_score", { ascending: false, nullsFirst: false })
            .order("outlier_score", { ascending: false })
            .limit(Math.min(limit, 10));

          if (topic) {
            query = query.or(
              `caption.ilike.%${topic}%,hashtag_source.ilike.%${topic}%,niche_tags.cs.{${topic.toLowerCase()}}`
            );
          }
          if (platform) query = query.eq("platform", platform);

          const { data: videos } = await query;

          if (!videos || videos.length === 0) {
            // Fallback: featured frameworks first, then top outlier
            const { data: fallback } = await adminClient
              .from("viral_videos")
              .select("id, channel_username, platform, caption, views_count, outlier_score, video_url, is_featured_framework")
              .gte("outlier_score", 5)
              .order("is_featured_framework", { ascending: false })
              .order("framework_score", { ascending: false })
              .limit(5);
            const info = (fallback || []).map((v: any) =>
              (v.is_featured_framework ? "★ " : "") +
              "@" + v.channel_username + " (" + v.platform + ") — " +
              (v.views_count || 0).toLocaleString() + " views, " + v.outlier_score + "x. Caption: " +
              (v.caption || "").slice(0, 100)
            ).join("\n\n");
            toolResults.push({ type: "tool_result", tool_use_id: block.id, content: "No exact matches. Top frameworks:\n" + info });
          } else {
            const info = videos.map((v: any) =>
              (v.is_featured_framework ? "★ " : "") +
              "@" + v.channel_username + " (" + v.platform + ") — " +
              (v.views_count || 0).toLocaleString() + " views, " + v.outlier_score + "x outlier. " +
              "Tags: " + ((v.niche_tags as string[]) || []).slice(0, 5).join(", ") + ". " +
              "Caption: " + (v.caption || "").slice(0, 150)
            ).join("\n\n");
            toolResults.push({ type: "tool_result", tool_use_id: block.id, content: videos.length + " frameworks found:\n\n" + info });
          }
        }
```

- [ ] **Step 2: Deploy**

```bash
supabase functions deploy companion-chat
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/companion-chat/index.ts
git commit -m "feat(ai): upgrade find_viral_videos to sort by framework_score and surface featured first"
```

---

## Task 7: Upgrade `handleSearchViralFrameworks` in `build-tool-handlers.ts`

**Files:**
- Modify: `supabase/functions/companion-chat/build-tool-handlers.ts` (around line 344)

- [ ] **Step 1: Add `niche_tags` and `is_featured_framework` to the select and sort**

Find the query inside `handleSearchViralFrameworks` (around line 344):

```ts
  let query = ctx.adminClient
    .from("viral_videos")
    .select("id, video_url, thumbnail_url, caption, channel_username, views_count, outlier_score, hook_text, cta_text, framework_meta, transcript")
    .not("transcribed_at", "is", null)
    .order("outlier_score", { ascending: false, nullsFirst: false })
    .limit(25);
  if (orFilter) query = query.or(orFilter);
```

Replace with:

```ts
  // Expand OR filter to also match niche_tags
  const tagFilters = input.keywords
    .filter((k) => k.length >= 3)
    .map((k) => `niche_tags.cs.{${k.replace(/[%,{}]/g, "").toLowerCase()}}`)
    .join(",");
  const combinedFilter = [orFilter, tagFilters].filter(Boolean).join(",");

  let query = ctx.adminClient
    .from("viral_videos")
    .select("id, video_url, thumbnail_url, caption, channel_username, views_count, outlier_score, hook_text, cta_text, framework_meta, transcript, niche_tags, is_featured_framework, framework_score")
    .not("transcribed_at", "is", null)
    .order("is_featured_framework", { ascending: false, nullsFirst: false })
    .order("framework_score", { ascending: false, nullsFirst: false })
    .order("outlier_score", { ascending: false, nullsFirst: false })
    .limit(25);
  if (combinedFilter) query = query.or(combinedFilter);
```

- [ ] **Step 2: Surface featured frameworks even without transcript**

After the `const pool = ...` line, add a fallback that pulls featured frameworks even if they lack a transcript, so they appear in results:

```ts
  // Always include featured frameworks for this idea (even without transcript)
  if (pool.length < 5) {
    const { data: featured } = await ctx.adminClient
      .from("viral_videos")
      .select("id, video_url, thumbnail_url, caption, channel_username, views_count, outlier_score, hook_text, cta_text, framework_meta, transcript, niche_tags, is_featured_framework, framework_score")
      .eq("is_featured_framework", true)
      .order("framework_score", { ascending: false })
      .limit(5);

    if (featured && featured.length > 0) {
      const existingIds = new Set(pool.map((v: any) => v.id));
      for (const f of featured) {
        if (!existingIds.has(f.id) && (f.caption ?? "").trim().length > 0) {
          pool.push(f);
        }
      }
    }
  }
```

- [ ] **Step 3: Deploy**

```bash
supabase functions deploy companion-chat
```

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/companion-chat/build-tool-handlers.ts
git commit -m "feat(ai): upgrade search_viral_frameworks to include niche_tags, featured frameworks, and framework_score sort"
```

---

## Self-Review Checklist

- [x] **DB migration** covers all 3 columns from spec (`is_featured_framework`, `niche_tags`, `framework_score`)
- [x] **Scout upgrade** (Task 2) extracts tags and computes score at insert time
- [x] **Admin URL paste** (Tasks 3 + 5) — backend edge function + frontend UI wired together
- [x] **Star indicator** (Task 4) — read-only for users, toggleable for admin, matches existing card style
- [x] **Both AI tools** upgraded (Tasks 6 + 7) — `find_viral_videos` in `index.ts`, `search_viral_frameworks` in `build-tool-handlers.ts`
- [x] `getAuthToken` import noted in Task 5 Step 2
- [x] `framework_score` fallback for `null` `posted_at` handled in both helper functions
- [x] `niche_tags` array filter uses Postgres `cs` (contains) operator correctly
- [x] No AI calls added anywhere — zero credit cost
