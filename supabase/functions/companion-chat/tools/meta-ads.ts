// supabase/functions/companion-chat/tools/meta-ads.ts
import type { ToolContext, ToolDef, ToolResult } from "./types.ts";
import { resolveClient } from "./types.ts";

const META_API = "https://graph.facebook.com/v19.0";

export const META_ADS_TOOLS: ToolDef[] = [
  {
    name: "setup_meta_ads",
    description:
      "Store Meta Ads (Facebook Ads) credentials for a client — ad account ID and access token. Admin only. Use when the user says 'connect Meta Ads for X', 'save the token for X', or 'set up Facebook Ads for X'.",
    input_schema: {
      type: "object",
      properties: {
        client_name: { type: "string", description: "Client name" },
        ad_account_id: {
          type: "string",
          description: "Meta Ad Account ID — with or without the act_ prefix, e.g. act_1571936029698345",
        },
        access_token: { type: "string", description: "Meta Ads access token" },
        label: { type: "string", description: "Optional friendly label for this account" },
      },
      required: ["client_name", "ad_account_id", "access_token"],
    },
  },
  {
    name: "get_meta_ads_report",
    description:
      "Get Meta Ads campaign performance for a client — spend, leads, CPL, CTR, impressions, frequency by campaign and ad set. Includes campaign/adset IDs needed to update budgets. Use when the user asks 'how are the ads doing?', 'check the car wreck campaign', 'audit Dr Calvin's ads', 'what's the CPL?', etc.",
    input_schema: {
      type: "object",
      properties: {
        client_name: { type: "string", description: "Client name" },
        date_preset: {
          type: "string",
          description:
            "Date range: last_7d (default), last_14d, last_30d, last_90d, today, yesterday, this_month, last_month",
        },
        campaign_filter: {
          type: "string",
          description:
            "Optional: only show campaigns whose name contains this string, e.g. 'car wreck' or 'retargeting'",
        },
      },
      required: ["client_name"],
    },
  },
  {
    name: "get_meta_ad_creatives",
    description:
      "Get ad-level performance breakdown — which specific creative (video/image) is winning. Returns spend, leads, CTR per individual ad sorted by performance. Use when the user asks 'which ad is performing best?', 'which creative is getting the most leads?', 'which video is working?'",
    input_schema: {
      type: "object",
      properties: {
        client_name: { type: "string", description: "Client name" },
        date_preset: {
          type: "string",
          description: "Date range: last_7d (default), last_14d, last_30d, today, yesterday, this_month",
        },
        campaign_filter: {
          type: "string",
          description: "Optional: only show campaigns whose name contains this string",
        },
      },
      required: ["client_name"],
    },
  },
  {
    name: "search_competitor_ads",
    description:
      "Search the Meta Ads Library for competitor ads by business name or keyword. Returns active ads with copy, headlines, and platforms. Use when the user asks to research competitors, see what other businesses are advertising, analyze competitor messaging, or find inspiration. Examples: 'what are other chiropractors in Utah advertising?', 'research competitor ads for Dr Calvin', 'what is [business name] running on Facebook?'",
    input_schema: {
      type: "object",
      properties: {
        client_name: {
          type: "string",
          description: "Client name — used to look up their Meta token for the API call",
        },
        search_query: {
          type: "string",
          description:
            "Business name, keyword, or topic to search, e.g. 'chiropractor Utah' or 'quiropráctico accidente auto'",
        },
        country: {
          type: "string",
          description: "Two-letter country code to search in, default 'US'",
        },
      },
      required: ["client_name", "search_query"],
    },
  },
  {
    name: "update_meta_budget",
    description:
      "Update the daily budget of a Meta Ads campaign or ad set. Admin only. ALWAYS call get_meta_ads_report first to confirm the entity ID before updating. Use when the user asks to increase/decrease budget, scale a campaign, or adjust spend. Example: 'increase the car wreck campaign to $80/day'.",
    input_schema: {
      type: "object",
      properties: {
        client_name: { type: "string", description: "Client name" },
        entity_id: {
          type: "string",
          description:
            "The numeric campaign ID or ad set ID to update. Get this from get_meta_ads_report — it is in the campaign_id or adset_id fields.",
        },
        entity_type: {
          type: "string",
          enum: ["campaign", "adset"],
          description: "Whether the ID is a campaign or ad set",
        },
        daily_budget_cents: {
          type: "number",
          description:
            "New daily budget in CENTS. $60/day = 6000. $80/day = 8000. Must be at least 100 (=$1).",
        },
      },
      required: ["client_name", "entity_id", "entity_type", "daily_budget_cents"],
    },
  },
];

async function metaGet(
  path: string,
  params: Record<string, string>,
  token: string,
): Promise<any> {
  const url = new URL(`${META_API}/${path}`);
  url.searchParams.set("access_token", token);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString());
  const json = await res.json();
  if (json.error) throw new Error(json.error.message);
  return json;
}

async function metaPost(
  path: string,
  body: Record<string, string | number>,
  token: string,
): Promise<any> {
  const url = new URL(`${META_API}/${path}`);
  url.searchParams.set("access_token", token);
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message);
  return json;
}

function extractLeads(actions: any[]): number {
  return parseInt(actions?.find((a: any) => a.action_type === "lead")?.value ?? "0");
}

function extractCPL(costPerAction: any[]): string | null {
  const v = costPerAction?.find((a: any) => a.action_type === "lead")?.value;
  return v ? `$${parseFloat(v).toFixed(2)}` : null;
}

async function getCredsForClient(
  client: { id: string; name: string },
  adminClient: any,
): Promise<{ ad_account_id: string; access_token: string; label: string | null } | null> {
  const { data } = await adminClient
    .from("meta_ads_accounts")
    .select("ad_account_id, access_token, label")
    .eq("client_id", client.id)
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

export async function handleMetaAdsTool(
  block: { id: string; name: string; input: Record<string, any> },
  ctx: ToolContext,
): Promise<ToolResult | null> {
  const { adminClient, isAdmin } = ctx;
  const reply = (content: string): ToolResult => ({
    type: "tool_result",
    tool_use_id: block.id,
    content,
  });

  // ── setup_meta_ads ────────────────────────────────────────────────────────
  if (block.name === "setup_meta_ads") {
    if (!isAdmin) return reply("Only admins can set up Meta Ads credentials.");

    const client = await resolveClient(ctx, block.input.client_name);
    if (!client) return reply(`Client "${block.input.client_name}" not found.`);

    const adAccountId = String(block.input.ad_account_id).startsWith("act_")
      ? block.input.ad_account_id
      : `act_${block.input.ad_account_id}`;

    const { error } = await adminClient.from("meta_ads_accounts").upsert(
      {
        client_id: client.id,
        ad_account_id: adAccountId,
        access_token: block.input.access_token,
        label: block.input.label ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "client_id,ad_account_id" },
    );

    if (error) return reply(`Failed to save credentials: ${error.message}`);
    return reply(`Meta Ads connected for ${client.name}. Account: ${adAccountId}`);
  }

  // ── get_meta_ads_report ───────────────────────────────────────────────────
  if (block.name === "get_meta_ads_report") {
    const client = await resolveClient(ctx, block.input.client_name);
    if (!client) return reply(`Client "${block.input.client_name}" not found.`);

    const creds = await getCredsForClient(client, adminClient);
    if (!creds) {
      return reply(
        `No Meta Ads account connected for ${client.name}. Use setup_meta_ads to add the credentials first, or go to Integrations in the sidebar.`,
      );
    }

    const datePreset = (block.input.date_preset as string | undefined) ?? "last_7d";
    const campaignFilter = block.input.campaign_filter as string | undefined;

    try {
      const insights = await metaGet(
        `${creds.ad_account_id}/insights`,
        {
          fields:
            "campaign_id,campaign_name,adset_id,adset_name,spend,impressions,reach,clicks,ctr,cpc,frequency,actions,cost_per_action_type",
          level: "adset",
          date_preset: datePreset,
          limit: "50",
        },
        creds.access_token,
      );

      let rows: any[] = insights.data ?? [];

      if (campaignFilter) {
        const f = campaignFilter.toLowerCase();
        rows = rows.filter((r) => r.campaign_name?.toLowerCase().includes(f));
      }

      if (rows.length === 0) {
        return reply(
          `No ad data found for ${client.name} (${datePreset})${campaignFilter ? ` matching "${campaignFilter}"` : ""}. ` +
            `The campaign may be too new, paused, or have no spend yet.`,
        );
      }

      const adsets = rows.map((r) => {
        const leads = extractLeads(r.actions ?? []);
        const cpl = extractCPL(r.cost_per_action_type ?? []);
        return {
          campaign: r.campaign_name,
          campaign_id: r.campaign_id,
          adset: r.adset_name,
          adset_id: r.adset_id,
          spend: `$${parseFloat(r.spend ?? "0").toFixed(2)}`,
          impressions: parseInt(r.impressions ?? "0").toLocaleString(),
          reach: parseInt(r.reach ?? "0").toLocaleString(),
          frequency: parseFloat(r.frequency ?? "0").toFixed(2),
          ctr: `${parseFloat(r.ctr ?? "0").toFixed(2)}%`,
          cpc: r.cpc ? `$${parseFloat(r.cpc).toFixed(2)}` : "N/A",
          leads,
          cpl: cpl ?? (leads === 0 ? "no leads yet" : "N/A"),
        };
      });

      const totalSpend = rows.reduce((s, r) => s + parseFloat(r.spend ?? "0"), 0);
      const totalLeads = rows.reduce((s, r) => s + extractLeads(r.actions ?? []), 0);

      return reply(
        JSON.stringify({
          client: client.name,
          date_range: datePreset,
          account: creds.label ?? creds.ad_account_id,
          total_spend: `$${totalSpend.toFixed(2)}`,
          total_leads: totalLeads,
          overall_cpl: totalLeads > 0 ? `$${(totalSpend / totalLeads).toFixed(2)}` : "no leads yet",
          adsets,
          note: "campaign_id and adset_id fields can be used with update_meta_budget to change budgets.",
        }),
      );
    } catch (err: any) {
      return reply(
        `Meta API error: ${err.message}. The token may be expired — update it in the client's Integrations page.`,
      );
    }
  }

  // ── get_meta_ad_creatives ─────────────────────────────────────────────────
  if (block.name === "get_meta_ad_creatives") {
    const client = await resolveClient(ctx, block.input.client_name);
    if (!client) return reply(`Client "${block.input.client_name}" not found.`);

    const creds = await getCredsForClient(client, adminClient);
    if (!creds) {
      return reply(`No Meta Ads credentials for ${client.name}. Add them via Integrations.`);
    }

    const datePreset = (block.input.date_preset as string | undefined) ?? "last_7d";
    const campaignFilter = block.input.campaign_filter as string | undefined;

    try {
      const insights = await metaGet(
        `${creds.ad_account_id}/insights`,
        {
          fields:
            "ad_id,ad_name,adset_name,campaign_name,spend,impressions,clicks,ctr,cpc,frequency,actions,cost_per_action_type",
          level: "ad",
          date_preset: datePreset,
          limit: "50",
        },
        creds.access_token,
      );

      let rows: any[] = insights.data ?? [];

      if (campaignFilter) {
        const f = campaignFilter.toLowerCase();
        rows = rows.filter((r: any) => r.campaign_name?.toLowerCase().includes(f));
      }

      if (rows.length === 0) {
        return reply(`No ad creative data for ${client.name} (${datePreset}).`);
      }

      const ads = rows
        .map((r: any) => {
          const leads = extractLeads(r.actions ?? []);
          const cpl = extractCPL(r.cost_per_action_type ?? []);
          return {
            ad: r.ad_name,
            ad_id: r.ad_id,
            campaign: r.campaign_name,
            adset: r.adset_name,
            spend: `$${parseFloat(r.spend ?? "0").toFixed(2)}`,
            impressions: parseInt(r.impressions ?? "0").toLocaleString(),
            ctr: `${parseFloat(r.ctr ?? "0").toFixed(2)}%`,
            cpc: r.cpc ? `$${parseFloat(r.cpc).toFixed(2)}` : "N/A",
            frequency: parseFloat(r.frequency ?? "0").toFixed(2),
            leads,
            cpl: cpl ?? (leads === 0 ? "no leads yet" : "N/A"),
            _spend_raw: parseFloat(r.spend ?? "0"),
            _leads_raw: leads,
          };
        })
        .sort((a: any, b: any) => b._leads_raw - a._leads_raw || b._spend_raw - a._spend_raw)
        .map(({ _spend_raw: _s, _leads_raw: _l, ...rest }: any) => rest);

      return reply(
        JSON.stringify({
          client: client.name,
          date_range: datePreset,
          note: "Sorted by leads (best performer first), then by spend.",
          ad_creatives: ads,
        }),
      );
    } catch (err: any) {
      return reply(`Meta API error: ${err.message}. Token may be expired — update in Integrations.`);
    }
  }

  // ── search_competitor_ads ─────────────────────────────────────────────────
  if (block.name === "search_competitor_ads") {
    const client = await resolveClient(ctx, block.input.client_name);
    if (!client) return reply(`Client "${block.input.client_name}" not found.`);

    const creds = await getCredsForClient(client, adminClient);
    if (!creds) {
      return reply(`No Meta Ads credentials for ${client.name}. Add them via Integrations.`);
    }

    const country = (block.input.country as string | undefined) ?? "US";
    const searchQuery = block.input.search_query as string;

    try {
      const data = await metaGet("ads_archive", {
        search_terms: searchQuery,
        ad_reached_countries: `["${country}"]`,
        ad_type: "ALL",
        fields:
          "page_name,ad_creative_body,ad_creative_link_title,ad_creative_link_description,ad_delivery_start_time,ad_delivery_stop_time,publisher_platforms,spend",
        limit: "30",
      }, creds.access_token);

      const ads: any[] = data.data ?? [];

      if (ads.length === 0) {
        return reply(
          `No ads found for "${searchQuery}" in ${country}. Try a broader search term, e.g. "chiropractor" instead of a specific business name.`,
        );
      }

      return reply(
        JSON.stringify({
          query: searchQuery,
          country,
          total_found: ads.length,
          ads: ads.slice(0, 25).map((ad: any) => ({
            page: ad.page_name,
            headline: ad.ad_creative_link_title ?? null,
            body: ad.ad_creative_body ?? null,
            description: ad.ad_creative_link_description ?? null,
            platforms: ad.publisher_platforms ?? [],
            running_since: ad.ad_delivery_start_time ?? null,
            stopped: ad.ad_delivery_stop_time ?? null,
            spend_range: ad.spend ?? null,
          })),
          note:
            "Analyze the ad copy patterns, CTAs, pain points, and offers across these competitors. Look for messaging gaps the client can own.",
        }),
      );
    } catch (err: any) {
      const msg = err.message ?? "";
      if (msg.includes("ads_library") || msg.includes("permission")) {
        return reply(
          `Ads Library permission error: the stored token may need the 'ads_library' permission. ` +
            `Ask the user to generate a new system user token with ads_library scope, or use a personal user token with that permission.`,
        );
      }
      return reply(`Competitor search failed: ${msg}`);
    }
  }

  // ── update_meta_budget ────────────────────────────────────────────────────
  if (block.name === "update_meta_budget") {
    if (!isAdmin) return reply("Only admins can update Meta Ads budgets.");

    const client = await resolveClient(ctx, block.input.client_name);
    if (!client) return reply(`Client "${block.input.client_name}" not found.`);

    const creds = await getCredsForClient(client, adminClient);
    if (!creds) {
      return reply(`No Meta Ads credentials for ${client.name}. Add them via Integrations.`);
    }

    const entityId = String(block.input.entity_id);
    const entityType = block.input.entity_type as "campaign" | "adset";
    const dailyBudgetCents = Math.round(Number(block.input.daily_budget_cents));

    if (dailyBudgetCents < 100) {
      return reply("daily_budget_cents must be at least 100 ($1). Got: " + dailyBudgetCents);
    }

    try {
      const result = await metaPost(entityId, { daily_budget: dailyBudgetCents }, creds.access_token);

      if (!result.success) {
        return reply(`Meta returned no success for ${entityType} ${entityId}. Response: ${JSON.stringify(result)}`);
      }

      const dollars = (dailyBudgetCents / 100).toFixed(2);
      return reply(
        `Budget updated: ${entityType} ${entityId} is now set to $${dollars}/day ($${(dailyBudgetCents / 100 * 30.44).toFixed(0)}/month). Change takes effect within minutes.`,
      );
    } catch (err: any) {
      return reply(
        `Budget update failed: ${err.message}. Common causes: wrong entity ID, budget type mismatch (lifetime vs daily), or insufficient token permissions.`,
      );
    }
  }

  return null;
}
