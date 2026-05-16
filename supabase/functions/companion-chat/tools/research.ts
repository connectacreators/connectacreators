// supabase/functions/companion-chat/tools/research.ts
import type { ToolContext, ToolDef, ToolResult } from "./types.ts";
import { resolveClient } from "./types.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;

// Free-text industry → canonical primary_niche slug. Categorize fn writes one
// of these 15 by preference; mapping the client's onboarding industry to the
// same vocabulary lets us filter viral_videos without LIKE-fuzzing.
const INDUSTRY_TO_NICHE: Array<[RegExp, string]> = [
  [/chiropract|physical therap|physio|sports med|wellness|holistic|nutritionist|dietitian/i, "fitness"],
  [/personal train|fitness|gym|crossfit|yoga|pilates/i, "fitness"],
  [/realtor|real estate|mortgage|broker|home loan/i, "real_estate"],
  [/sales|sdr|closer|appointment setter|outbound|cold call/i, "sales"],
  [/financ|cpa|account|tax|wealth|invest|bookkeep|insurance/i, "finance"],
  [/coach|consult|mentor|advisor|life coach|business coach/i, "coaching"],
  [/ecommerce|shopify|amazon fba|dtc|drop ship|online store/i, "ecommerce"],
  [/saas|software|tech|developer|engineer|startup|founder/i, "saas_tech"],
  [/beauty|esthetic|skincare|makeup|cosmetic|hair stylist|salon|nail/i, "beauty"],
  [/food|chef|restaurant|recipe|bakery|cafe/i, "food"],
  [/mindset|self help|productivity|motivation|stoic/i, "mindset"],
  [/dating|relationship|marriage|couples therapy/i, "relationships"],
  [/teach|tutor|education|course creator|professor/i, "education"],
  [/lifestyle|vlog|travel|fashion|home decor/i, "lifestyle"],
  [/parent|mom|dad|family|baby|toddler/i, "parenting"],
  [/lawyer|attorney|immigration|legal|law firm/i, "personal_branding"],
  [/dentist|doctor|medical|surgeon|clinic|aesthetics|med spa/i, "personal_branding"],
];

function mapIndustryToNiche(industry: string | null | undefined): string | null {
  if (!industry) return null;
  for (const [re, slug] of INDUSTRY_TO_NICHE) {
    if (re.test(industry)) return slug;
  }
  return null;
}

// Reach / trust / convert → which content_format slugs to favor for each bucket.
// Reach = broad-appeal hooks. Trust = teaching/authority. Convert = sales/CTA.
const MIX_TO_FORMATS: Record<"reach" | "trust" | "convert", string[]> = {
  reach: ["storytelling", "funny", "caption_post", "reaction", "vlog"],
  trust: ["educational", "authority", "tutorial", "listicle", "comparison"],
  convert: ["selling", "authority", "comparison", "listicle"],
};

function pickFormatsForBucket(bucket: "reach" | "trust" | "convert", override?: string[]): string[] {
  if (override && override.length > 0) return override.map((s) => s.toLowerCase());
  return MIX_TO_FORMATS[bucket];
}

interface ViralVideoRow {
  id: string;
  channel_username: string | null;
  platform: string | null;
  caption: string | null;
  transcript: string | null;
  views_count: number | null;
  outlier_score: number | null;
  hook_text: string | null;
  cta_text: string | null;
  framework_meta: unknown;
  content_format: string | null;
  primary_niche: string | null;
  video_url: string | null;
}

function summarizeVideoForPrompt(v: ViralVideoRow, idx: number): string {
  const cap = (v.caption ?? "").slice(0, 240);
  const tx = (v.transcript ?? "").slice(0, 380);
  const fm = v.framework_meta
    ? typeof v.framework_meta === "string"
      ? v.framework_meta.slice(0, 220)
      : JSON.stringify(v.framework_meta).slice(0, 220)
    : "";
  return [
    `REF ${idx + 1}: @${v.channel_username ?? "?"} · ${v.platform ?? "?"} · ${v.outlier_score?.toFixed?.(1) ?? "?"}x outlier · [${v.content_format ?? "?"} / ${v.primary_niche ?? "?"}]`,
    cap && `Caption: ${cap}`,
    tx && `Transcript: ${tx}`,
    v.hook_text && `Hook: ${v.hook_text}`,
    v.cta_text && `CTA: ${v.cta_text}`,
    fm && `Framework: ${fm}`,
  ].filter(Boolean).join("\n");
}

export const RESEARCH_TOOLS: ToolDef[] = [
  {
    name: "run_audience_analysis",
    description: "Run an audience alignment analysis for a client using their Instagram handle. Returns audience score and content uniqueness score out of 10. Costs credits. Tell the user before calling this.",
    input_schema: {
      type: "object",
      properties: {
        client_name: { type: "string" },
      },
      required: ["client_name"],
    },
  },
  {
    name: "get_instagram_top_posts",
    description: "Fetch a client's top-performing Instagram posts ranked by engagement. Use before building a content strategy to understand what's already working for them.",
    input_schema: {
      type: "object",
      properties: {
        client_name: { type: "string" },
        limit: { type: "number", description: "Number of posts to return (default 6)" },
      },
      required: ["client_name"],
    },
  },
  {
    name: "deep_research",
    description: "Do live web research on a topic and return structured findings with sources. Use when the user asks you to 'research X' or when you need current statistics, trends, or competitor information. Costs credits.",
    input_schema: {
      type: "object",
      properties: {
        topic: { type: "string", description: "What to research (e.g. 'chiropractic social media trends 2025')" },
        context: { type: "string", description: "Optional context to focus the research (e.g. 'for a chiropractor in Texas')" },
      },
      required: ["topic"],
    },
  },
  {
    name: "scrape_viral_channel",
    description: "Scrape viral videos from an Instagram or TikTok account and add them to the viral reference database. Use when a client finds a good reference creator and wants to track them.",
    input_schema: {
      type: "object",
      properties: {
        username: { type: "string", description: "The creator's username (without @)" },
        platform: { type: "string", description: "instagram (default) or tiktok" },
      },
      required: ["username"],
    },
  },
  {
    name: "generate_ideas_from_viral",
    description: "Generate N viral-grounded content ideas for a client. Resolves the client's niche from their onboarding industry (with override), splits the count across reach/trust/convert per their content_strategy mix (with override), pulls top viral_videos in each bucket by content_format + primary_niche, then writes ideas modeled on those real references. Output includes for each idea: title, hook, bucket, format, reference creator. ONLY use this tool when the user asks for multiple content ideas ('give me 15 ideas', 'come up with 10 reels', 'ideate', 'brainstorm content'). For single-script work, use find_viral_videos → create_script. For a 7-day calendar, use generate_week_plan. Costs an Anthropic call.",
    input_schema: {
      type: "object",
      properties: {
        client_name: { type: "string", description: "Client to anchor voice, story, audience, offer. On URL-locked surfaces the lock overrides this." },
        count: { type: "number", description: "How many ideas to generate. Range 3–30. Default 10." },
        niche: { type: "string", description: "Override niche slug (e.g. 'sales', 'fitness', 'coaching'). Default: derived from client.industry → canonical slug. Use when the user explicitly asks for a different niche." },
        formats: {
          type: "array",
          description: "Optional content_format slugs to restrict to (e.g. ['funny', 'storytelling']). One of: caption_post, storytelling, educational, comparison, authority, reaction, listicle, tutorial, vlog, selling, funny. Default: bucket-derived blend.",
          items: { type: "string" },
        },
        topic_hint: { type: "string", description: "Optional topic the user mentioned (e.g. 'lead magnets', 'mistakes', 'morning routine'). Used as additional caption/transcript filter and prompt context." },
        mix_override: {
          type: "object",
          description: "Override the client's strategy mix (must sum to 100). Default: client_strategies.mix_reach/mix_trust/mix_convert, fallback 60/30/10.",
          properties: {
            reach: { type: "number" },
            trust: { type: "number" },
            convert: { type: "number" },
          },
        },
        min_outlier: { type: "number", description: "Minimum outlier score to pull references from. Default 3, lower for thin niches." },
        days_back: { type: "number", description: "Recency window for references. Omit for all-time. Use ~90 for fresh trends." },
      },
      required: ["client_name", "count"],
    },
  },
  {
    name: "list_vault_files",
    description: "List footage and media files uploaded to a client's vault. Use before building an editing queue item to know what footage exists.",
    input_schema: {
      type: "object",
      properties: {
        client_name: { type: "string" },
      },
      required: ["client_name"],
    },
  },
];

export async function handleResearchTool(
  block: { id: string; name: string; input: Record<string, any> },
  ctx: ToolContext,
): Promise<ToolResult | null> {
  const { adminClient, userId } = ctx;

  if (block.name === "run_audience_analysis") {
    const { client_name } = block.input;
    const client = await resolveClient(ctx, client_name);
    if (!client) return { type: "tool_result", tool_use_id: block.id, content: `No client found: "${client_name}"` };

    const { data: clientRow } = await adminClient.from("clients").select("onboarding_data").eq("id", client.id).maybeSingle();
    const instagram = (clientRow?.onboarding_data as any)?.instagram;
    if (!instagram) return { type: "tool_result", tool_use_id: block.id, content: `${client.name} has no Instagram handle set in their onboarding profile. Fill that in first.` };

    const res = await fetch(`${SUPABASE_URL}/functions/v1/analyze-audience-alignment`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
      body: JSON.stringify({ client_id: client.id, instagram_handle: instagram }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { type: "tool_result", tool_use_id: block.id, content: `Analysis failed: ${json.error ?? `HTTP ${res.status}`}` };

    const analysis = json.analysis ?? json;
    return {
      type: "tool_result",
      tool_use_id: block.id,
      content: `Audience analysis for ${client.name} (@${instagram}):\nAudience alignment: ${analysis.audience_score ?? "??"}/10 — ${analysis.audience_detail ?? ""}\nContent uniqueness: ${analysis.uniqueness_score ?? "??"}/10 — ${analysis.uniqueness_detail ?? ""}\nSummary: ${analysis.summary ?? "no summary"}`,
    };
  }

  if (block.name === "get_instagram_top_posts") {
    const { client_name, limit = 6 } = block.input;
    const client = await resolveClient(ctx, client_name);
    if (!client) return { type: "tool_result", tool_use_id: block.id, content: `No client found: "${client_name}"` };

    const { data: clientRow } = await adminClient.from("clients").select("onboarding_data").eq("id", client.id).maybeSingle();
    const instagram = (clientRow?.onboarding_data as any)?.instagram;
    if (!instagram) return { type: "tool_result", tool_use_id: block.id, content: `${client.name} has no Instagram handle set. Add it in their onboarding profile first.` };

    const res = await fetch(`${SUPABASE_URL}/functions/v1/fetch-instagram-top-posts`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
      body: JSON.stringify({ username: instagram, limit }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { type: "tool_result", tool_use_id: block.id, content: `Failed to fetch posts: ${json.error ?? `HTTP ${res.status}`}` };

    const posts = Array.isArray(json.posts) ? json.posts : Array.isArray(json) ? json : [];
    if (posts.length === 0) return { type: "tool_result", tool_use_id: block.id, content: `No posts found for @${instagram}.` };

    const lines = posts.slice(0, limit).map((p: any, i: number) =>
      `${i + 1}. ${p.views_count ? p.views_count.toLocaleString() + " views" : p.likes_count ? p.likes_count.toLocaleString() + " likes" : "?"} — "${(p.caption ?? "").slice(0, 100)}"`
    );
    return { type: "tool_result", tool_use_id: block.id, content: `Top posts for @${instagram}:\n${lines.join("\n")}` };
  }

  if (block.name === "generate_ideas_from_viral") {
    const {
      client_name,
      count,
      niche: nicheOverride,
      formats: formatsOverride,
      topic_hint,
      mix_override,
      min_outlier = 3,
      days_back,
    } = block.input as {
      client_name: string;
      count: number;
      niche?: string;
      formats?: string[];
      topic_hint?: string;
      mix_override?: { reach?: number; trust?: number; convert?: number };
      min_outlier?: number;
      days_back?: number;
    };

    const client = await resolveClient(ctx, client_name);
    if (!client) return { type: "tool_result", tool_use_id: block.id, content: `No client found: "${client_name}"` };

    const n = Math.max(3, Math.min(Number(count) || 10, 30));

    // Pull strategy + onboarding in parallel.
    const [{ data: stratRow }, { data: clientRow }] = await Promise.all([
      adminClient
        .from("client_strategies")
        .select("mix_reach, mix_trust, mix_convert, content_pillars, audience_score, uniqueness_score, cta_goal, manychat_active, manychat_keyword")
        .eq("client_id", client.id)
        .maybeSingle(),
      adminClient.from("clients").select("onboarding_data, name").eq("id", client.id).maybeSingle(),
    ]);
    const strat = (stratRow ?? {}) as Record<string, unknown>;
    const od = (clientRow?.onboarding_data ?? {}) as Record<string, unknown>;

    // Resolve niche: explicit override → onboarding industry → null (no niche filter).
    const resolvedNiche = nicheOverride
      ? String(nicheOverride).toLowerCase()
      : mapIndustryToNiche(typeof od.industry === "string" ? od.industry : null);

    // Resolve mix. Override > strategy > 60/30/10 default.
    const mixReach = mix_override?.reach ?? (typeof strat.mix_reach === "number" ? strat.mix_reach : 60);
    const mixTrust = mix_override?.trust ?? (typeof strat.mix_trust === "number" ? strat.mix_trust : 30);
    const mixConvert = mix_override?.convert ?? (typeof strat.mix_convert === "number" ? strat.mix_convert : 10);
    const mixSum = mixReach + mixTrust + mixConvert;
    const safeMix = mixSum > 0
      ? { reach: mixReach / mixSum, trust: mixTrust / mixSum, convert: mixConvert / mixSum }
      : { reach: 0.6, trust: 0.3, convert: 0.1 };

    // Split count across buckets — never lose ideas to rounding.
    const reachCount = Math.round(safeMix.reach * n);
    const trustCount = Math.round(safeMix.trust * n);
    const convertCount = Math.max(0, n - reachCount - trustCount);

    // Per-bucket viral pulls. Each bucket queries its own format set so we get
    // genuinely diverse references, not 15 funny reels.
    async function pullForBucket(bucket: "reach" | "trust" | "convert", wanted: number): Promise<ViralVideoRow[]> {
      if (wanted <= 0) return [];
      const fmts = pickFormatsForBucket(bucket, formatsOverride);
      let q = adminClient
        .from("viral_videos")
        .select("id, channel_username, platform, caption, transcript, views_count, outlier_score, hook_text, cta_text, framework_meta, content_format, primary_niche, video_url")
        .gte("outlier_score", min_outlier)
        .in("content_format", fmts)
        .order("outlier_score", { ascending: false })
        .limit(Math.max(wanted * 2, 5)); // overpull so the prompt has alternatives
      if (resolvedNiche) q = q.eq("primary_niche", resolvedNiche);
      if (topic_hint) {
        const safe = String(topic_hint).replace(/[%,]/g, "");
        q = q.or(`caption.ilike.%${safe}%,transcript.ilike.%${safe}%`);
      }
      if (days_back && Number(days_back) > 0) {
        const cutoff = new Date(Date.now() - Number(days_back) * 86_400_000).toISOString();
        q = q.gte("posted_at", cutoff);
      }
      const { data } = await q;
      return (data ?? []) as ViralVideoRow[];
    }

    let [reachRefs, trustRefs, convertRefs] = await Promise.all([
      pullForBucket("reach", reachCount),
      pullForBucket("trust", trustCount),
      pullForBucket("convert", convertCount),
    ]);

    // Fallback ladder if any bucket came up empty (thin niche, strict filters):
    // 1) drop the niche filter, keep format, 2) drop topic_hint too.
    async function fallback(bucket: "reach" | "trust" | "convert", wanted: number, dropNiche: boolean, dropTopic: boolean): Promise<ViralVideoRow[]> {
      if (wanted <= 0) return [];
      const fmts = pickFormatsForBucket(bucket, formatsOverride);
      let q = adminClient
        .from("viral_videos")
        .select("id, channel_username, platform, caption, transcript, views_count, outlier_score, hook_text, cta_text, framework_meta, content_format, primary_niche, video_url")
        .gte("outlier_score", min_outlier)
        .in("content_format", fmts)
        .order("outlier_score", { ascending: false })
        .limit(Math.max(wanted * 2, 5));
      if (!dropNiche && resolvedNiche) q = q.eq("primary_niche", resolvedNiche);
      if (!dropTopic && topic_hint) {
        const safe = String(topic_hint).replace(/[%,]/g, "");
        q = q.or(`caption.ilike.%${safe}%,transcript.ilike.%${safe}%`);
      }
      const { data } = await q;
      return (data ?? []) as ViralVideoRow[];
    }

    if (reachRefs.length === 0) reachRefs = await fallback("reach", reachCount, true, false);
    if (reachRefs.length === 0) reachRefs = await fallback("reach", reachCount, true, true);
    if (trustRefs.length === 0) trustRefs = await fallback("trust", trustCount, true, false);
    if (trustRefs.length === 0) trustRefs = await fallback("trust", trustCount, true, true);
    if (convertRefs.length === 0) convertRefs = await fallback("convert", convertCount, true, false);
    if (convertRefs.length === 0) convertRefs = await fallback("convert", convertCount, true, true);

    const totalRefs = reachRefs.length + trustRefs.length + convertRefs.length;
    if (totalRefs === 0) {
      return {
        type: "tool_result",
        tool_use_id: block.id,
        content: `No viral references at all matched filters (niche=${resolvedNiche ?? "none"}, min_outlier=${min_outlier}). Run scrape_viral_channel to grow the reference library before generating ideas.`,
      };
    }

    // Build prompt. References are bucketed so Claude knows which idea to slot where.
    const refSection = (label: string, rows: ViralVideoRow[]) =>
      rows.length === 0
        ? `${label} REFERENCES: (none — generate ${label.toLowerCase()} ideas from the client's profile alone)`
        : `${label} REFERENCES (${rows.length}):\n${rows.map((v, i) => summarizeVideoForPrompt(v, i)).join("\n\n")}`;

    const pillars = Array.isArray(strat.content_pillars) ? (strat.content_pillars as string[]).join(", ") : "";
    const audienceScore = typeof strat.audience_score === "number" ? strat.audience_score : null;
    const onboardingComplete = !!(od.industry && (od.story || od.uniqueValues) && od.targetClient);

    const prompt = `Generate EXACTLY ${n} short-form video content ideas for one creator.

CREATOR PROFILE:
- Name: ${od.clientName ?? clientRow?.name ?? client.name}
- Industry: ${od.industry ?? "unknown"}
- Resolved viral niche slug: ${resolvedNiche ?? "(no filter applied)"}
- Target audience: ${od.targetClient ?? "unknown"}
- Unique offer: ${od.uniqueOffer ?? "unknown"}
- Voice/values: ${od.uniqueValues ?? "unspecified"}
- Story/origin: ${od.story ?? "unspecified"}
- Story with numbers: ${od.storyNumbers ?? "unspecified"}

STRATEGY:
- Content mix: ${Math.round(safeMix.reach * 100)}% reach / ${Math.round(safeMix.trust * 100)}% trust / ${Math.round(safeMix.convert * 100)}% convert
- Content pillars: ${pillars || "(none defined)"}
- CTA goal: ${strat.cta_goal ?? "unset"}
- ManyChat: ${strat.manychat_active ? `active, keyword "${strat.manychat_keyword ?? "?"}"` : "not active"}
- Audience alignment score: ${audienceScore !== null ? `${audienceScore}/10` : "not analyzed"}
${topic_hint ? `\nUSER'S TOPIC REQUEST: ${topic_hint}` : ""}

YOU MUST PRODUCE:
- ${reachCount} REACH idea(s) — broad-appeal hooks to grow followers (formats: ${pickFormatsForBucket("reach", formatsOverride).join("/")})
- ${trustCount} TRUST idea(s) — teaching/authority to build credibility (formats: ${pickFormatsForBucket("trust", formatsOverride).join("/")})
- ${convertCount} CONVERT idea(s) — sales-leaning to turn warm audience into leads (formats: ${pickFormatsForBucket("convert", formatsOverride).join("/")})

${refSection("REACH", reachRefs)}

${refSection("TRUST", trustRefs)}

${refSection("CONVERT", convertRefs)}

RULES:
- Every idea must be modeled on (not copied from) the closest viral reference above. Adapt the framework to THIS creator's story, audience, and offer.
- Use concrete details from the creator's profile — their numbers, story, audience pain — never generic.
- Ideas must be DIFFERENT angles, not 15 variations of the same hook.
- Hook is the first 3 seconds of the video; make it scroll-stopping and specific.
${onboardingComplete ? "" : "- WARNING: this creator's onboarding is incomplete. Lead with the strongest signal you have; flag what's missing.\n"}

Output ONLY a JSON array of ${n} objects, no markdown, no commentary:
[
  {
    "bucket": "reach" | "trust" | "convert",
    "format": "<content_format slug>",
    "title": "<5-9 word working title>",
    "hook": "<8-16 word hook line, scroll-stopping>",
    "angle": "<one sentence explaining the unique take>",
    "reference": "@<creator from the matching REFERENCES block, or 'none' if generated from profile alone>"
  }
]`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 3000,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return { type: "tool_result", tool_use_id: block.id, content: `Idea generation failed: ${err.error?.message ?? res.statusText}` };
    }
    const json = await res.json();
    let raw = (json.content?.[0]?.text as string ?? "").trim();
    raw = raw.replace(/^```json\s*/i, "").replace(/^```\s*/, "").replace(/\s*```$/, "").trim();

    let ideas: Array<{ bucket?: string; format?: string; title?: string; hook?: string; angle?: string; reference?: string }> = [];
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) ideas = parsed;
    } catch {
      return {
        type: "tool_result",
        tool_use_id: block.id,
        content: `Generator returned unparseable output. Raw: ${raw.slice(0, 400)}`,
      };
    }
    if (ideas.length === 0) {
      return { type: "tool_result", tool_use_id: block.id, content: "Generator returned an empty array. Try again or relax filters (lower min_outlier, drop niche, widen days_back)." };
    }

    // Format for the user.
    const lines = ideas.map((idea, i) => {
      const bucket = (idea.bucket ?? "?").toLowerCase();
      const fmt = idea.format ?? "?";
      const title = idea.title ?? "(untitled)";
      const hook = idea.hook ?? "";
      const angle = idea.angle ?? "";
      const ref = idea.reference ?? "none";
      return `${i + 1}. [${bucket} · ${fmt}] ${title}\n   Hook: ${hook}\n   Angle: ${angle}\n   Modeled on: ${ref}`;
    });

    const header = `Generated ${ideas.length} ideas for ${client.name} (niche: ${resolvedNiche ?? "no filter"}, mix: ${Math.round(safeMix.reach * 100)}/${Math.round(safeMix.trust * 100)}/${Math.round(safeMix.convert * 100)}, references pulled: ${reachRefs.length} reach + ${trustRefs.length} trust + ${convertRefs.length} convert${topic_hint ? `, topic: "${topic_hint}"` : ""}).`;
    const footer = onboardingComplete
      ? `\nNext: pick one and say "build a script for #N" — I'll model it after the reference.`
      : `\nHEADS-UP: ${client.name}'s onboarding is incomplete. Ideas will be sharper once industry/story/audience are filled.`;

    return {
      type: "tool_result",
      tool_use_id: block.id,
      content: `${header}\n\n${lines.join("\n\n")}${footer}`,
    };
  }

  if (block.name === "deep_research") {
    const { topic, context } = block.input;
    const query = context ? `${topic} — ${context}` : topic;

    const res = await fetch(`${SUPABASE_URL}/functions/v1/deep-research`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
      body: JSON.stringify({ query }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { type: "tool_result", tool_use_id: block.id, content: `Research failed: ${json.error ?? `HTTP ${res.status}`}` };

    const result = json.result ?? json.content ?? json.answer ?? JSON.stringify(json).slice(0, 800);
    return { type: "tool_result", tool_use_id: block.id, content: `Research on "${topic}":\n\n${result}` };
  }

  if (block.name === "scrape_viral_channel") {
    const { username, platform = "instagram" } = block.input;

    const res = await fetch(`${SUPABASE_URL}/functions/v1/scrape-channel`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
      body: JSON.stringify({ username: username.replace(/^@/, ""), platform }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { type: "tool_result", tool_use_id: block.id, content: `Scrape failed: ${json.error ?? `HTTP ${res.status}`}` };

    const count = json.videos_added ?? json.count ?? "unknown number of";
    return { type: "tool_result", tool_use_id: block.id, content: `Scraped @${username} on ${platform}. Added ${count} video(s) to the viral database. They're now available as reference frameworks.` };
  }

  if (block.name === "list_vault_files") {
    const { client_name } = block.input;
    const client = await resolveClient(ctx, client_name);
    if (!client) return { type: "tool_result", tool_use_id: block.id, content: `No client found: "${client_name}"` };

    const { data: files } = await adminClient
      .from("canvas_media")
      .select("id, file_name, file_type, file_size, transcript_status, created_at")
      .eq("client_id", client.id)
      .order("created_at", { ascending: false })
      .limit(20);

    if (!files || files.length === 0) return { type: "tool_result", tool_use_id: block.id, content: `No files in ${client.name}'s vault.` };

    const lines = files.map((f: any) => {
      const size = f.file_size ? `${Math.round(f.file_size / 1024 / 1024)}MB` : "?";
      const transcribed = f.transcript_status === "done" ? " [transcribed]" : f.transcript_status === "processing" ? " [transcribing]" : "";
      return `${f.file_name ?? "Untitled"} (${f.file_type ?? "?"}, ${size})${transcribed}`;
    });
    return { type: "tool_result", tool_use_id: block.id, content: `${files.length} file(s) in ${client.name}'s vault:\n${lines.join("\n")}` };
  }

  return null;
}
