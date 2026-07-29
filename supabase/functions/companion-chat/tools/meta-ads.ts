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
      "Get Meta Ads campaign performance for a client — spend, leads, CPL, CTR, impressions, frequency by campaign and ad set. Use when the user asks 'how are the ads doing?', 'check the car wreck campaign', 'audit Dr Calvin's ads', 'what's the CPL?', etc.",
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

function extractLeads(actions: any[]): number {
  return parseInt(actions?.find((a: any) => a.action_type === "lead")?.value ?? "0");
}

function extractCPL(costPerAction: any[]): string | null {
  const v = costPerAction?.find((a: any) => a.action_type === "lead")?.value;
  return v ? `$${parseFloat(v).toFixed(2)}` : null;
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

  if (block.name === "get_meta_ads_report") {
    const client = await resolveClient(ctx, block.input.client_name);
    if (!client) return reply(`Client "${block.input.client_name}" not found.`);

    const { data: creds, error: credsError } = await adminClient
      .from("meta_ads_accounts")
      .select("ad_account_id, access_token, label")
      .eq("client_id", client.id)
      .limit(1)
      .maybeSingle();

    if (credsError || !creds) {
      return reply(
        `No Meta Ads account connected for ${client.name}. Use setup_meta_ads to add the credentials first.`,
      );
    }

    const datePreset = (block.input.date_preset as string | undefined) ?? "last_7d";
    const campaignFilter = block.input.campaign_filter as string | undefined;

    try {
      const insights = await metaGet(
        `${creds.ad_account_id}/insights`,
        {
          fields:
            "campaign_id,campaign_name,adset_name,spend,impressions,reach,clicks,ctr,cpc,frequency,actions,cost_per_action_type",
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
          adset: r.adset_name,
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
        }),
      );
    } catch (err: any) {
      return reply(
        `Meta API error: ${err.message}. The token may be expired — ask for a new one and run setup_meta_ads again.`,
      );
    }
  }

  return null;
}
