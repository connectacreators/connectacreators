import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TOOLS = [
  {
    name: "navigate_to_page",
    description: "Navigate the user to a specific page in the app. Use this when the user needs to go somewhere or after you've completed an action.",
    input_schema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Page path. Options: /onboarding, /scripts, /vault, /viral-today, /editing-queue, /content-calendar, /subscription, /ai, /dashboard",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "fill_onboarding_fields",
    description: "Fill in the client onboarding profile. Use when the user asks you to complete their profile, or when you have enough context to fill specific fields on their behalf.",
    input_schema: {
      type: "object",
      properties: {
        fields: {
          type: "object",
          description: "Key-value pairs. Available fields: clientName, email, instagram, tiktok, youtube, facebook, package, adBudget, top3Profiles, targetClient, industry, state, uniqueOffer, uniqueValues, competition, story, callLink, additionalNotes",
          additionalProperties: { type: "string" },
        },
        navigate_to_onboarding: {
          type: "boolean",
          description: "Set true to navigate the user to /onboarding after filling so they can review",
        },
      },
      required: ["fields"],
    },
  },
];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const { message, companion_name, current_path } = await req.json() as {
      message: string;
      companion_name: string;
      current_path?: string;
    };

    if (!message?.trim()) {
      return new Response(JSON.stringify({ error: "message is required" }), { status: 400, headers: corsHeaders });
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: { user } } = await createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    ).auth.getUser();

    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const { data: client } = await adminClient
      .from("clients")
      .select("id, name, onboarding_data")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!client) {
      return new Response(JSON.stringify({ error: "No client found" }), { status: 400, headers: corsHeaders });
    }

    // Last 20 messages for context
    const { data: history } = await adminClient
      .from("companion_messages")
      .select("role, content")
      .eq("client_id", client.id)
      .order("created_at", { ascending: false })
      .limit(20);

    const priorMessages = (history || []).reverse().map((m: any) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    // Build brand context from existing onboarding data
    const od = client.onboarding_data || {};
    const brandLines = [
      od.clientName && `Client name: ${od.clientName}`,
      od.industry && `Industry: ${od.industry}`,
      od.uniqueOffer && `Unique offer: ${od.uniqueOffer}`,
      od.targetClient && `Target audience: ${od.targetClient}`,
      od.uniqueValues && `Key values: ${od.uniqueValues}`,
      od.competition && `Competition: ${od.competition}`,
      od.story && `Story: ${od.story}`,
    ].filter(Boolean).join("\n");

    const name = companion_name || "AI";
    const systemPrompt = `You are ${name}, the AI assistant inside Connecta Creators — a done-for-you social media and personal branding platform for service professionals and local business owners.

WHAT CONNECTA DOES:
Connecta is a done-for-you agency focused on organic social media strategy and personal branding. The core offer is building authority and attention through organic content, then turning that attention into leads and clients.

The methodology:
- Outlier Method: Study the top 1% of content in the niche, reverse-engineer why it performed, then adapt it to the client's voice and offer.
- Protagonist-Focused Branding: Every account has one clear face. People follow people, not logos. Content is built around one person's personality, story, and expertise.
- TOFU/MOFU/BOFU funnel: TOFU = broad viral content to grow reach. MOFU = trust and authority content. BOFU = conversion content to turn warm audience into booked leads.
- Hook-First Scripting: The first 3 seconds of every video are the most important. Scripts are built backwards from the hook.
- ManyChat + Lead Magnets: Keyword triggers on viral posts that automatically DM a lead magnet to commenters, moving them into a real conversation.
- Compounding consistency: Not one viral post, but a system that stacks content week over week around the same protagonist and offer.

WHAT CONNECTA DOES NOT DO: SEO, web design, traditional PR, email marketing, e-commerce, B2B/enterprise work.

User's name: ${client.name || "there"}
Currently on page: ${current_path || "unknown"}
${brandLines ? `\nWhat we already know about them:\n${brandLines}` : "\nNo onboarding data yet."}

YOUR RULES — FOLLOW EXACTLY:
1. NEVER use markdown. No asterisks, no bold, no headers, no bullet dashes. Plain text only.
2. NEVER use emojis.
3. Speak plain English (or Spanish if they write in Spanish).
4. Be direct and action-oriented. When someone asks you to do something, DO IT using your tools — don't just ask questions.
5. When someone says "fill out the onboarding", "complete my profile", or similar — call fill_onboarding_fields immediately with whatever you know, then navigate them there to review.
6. Keep text replies short: 2-4 sentences. Never long paragraphs.
7. You are a coach who takes action, not a chatbot that asks questions.
8. Never say "pipeline", "leverage", "synergy", "streamline", "utilize", or "robust".
9. CRITICAL: Never tell the user to go somewhere or navigate manually. If navigation is needed, call the navigate_to_page tool immediately — the app will take them there automatically. Do not say "head to X" or "go to X" or "visit X". Just call the tool.
10. CRITICAL: If the user says "yes", "ok", "let's go", "sure", "do it" in response to something you suggested — execute it immediately using the appropriate tool. Do not ask again.`;

    // Save user message
    await adminClient.from("companion_messages").insert({
      client_id: client.id,
      role: "user",
      content: message,
    });

    // Prune to 50 messages
    const { data: allMsgs } = await adminClient
      .from("companion_messages")
      .select("id")
      .eq("client_id", client.id)
      .order("created_at", { ascending: false });

    if (allMsgs && allMsgs.length > 50) {
      const toDelete = allMsgs.slice(50).map((m: any) => m.id);
      await adminClient.from("companion_messages").delete().in("id", toDelete);
    }

    // First Claude call with tools
    const firstRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        system: systemPrompt,
        tools: TOOLS,
        messages: [...priorMessages, { role: "user", content: message }],
      }),
    });

    const firstResult = await firstRes.json();
    const actions: any[] = [];
    let reply = "";

    // Process response — may have tool_use blocks
    if (firstResult.stop_reason === "tool_use") {
      const toolUseBlocks = firstResult.content.filter((b: any) => b.type === "tool_use");
      const textBlocks = firstResult.content.filter((b: any) => b.type === "text");
      if (textBlocks.length > 0) reply = textBlocks[0].text;

      const toolResults: any[] = [];

      for (const block of toolUseBlocks) {
        if (block.name === "navigate_to_page") {
          const { path } = block.input;
          actions.push({ type: "navigate", path });
          toolResults.push({ type: "tool_result", tool_use_id: block.id, content: `Navigating to ${path}` });
        }

        if (block.name === "fill_onboarding_fields") {
          const { fields, navigate_to_onboarding } = block.input;
          // Merge new fields into existing onboarding_data
          const merged = { ...(client.onboarding_data || {}), ...fields };
          await adminClient.from("clients").update({ onboarding_data: merged }).eq("id", client.id);
          actions.push({ type: "fill_onboarding", fields });
          if (navigate_to_onboarding) actions.push({ type: "navigate", path: "/onboarding" });
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: `Filled fields: ${Object.keys(fields).join(", ")}`,
          });
        }
      }

      // Second Claude call to get the text reply after tool use
      if (!reply) {
        const secondRes = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 512,
            system: systemPrompt,
            tools: TOOLS,
            messages: [
              ...priorMessages,
              { role: "user", content: message },
              { role: "assistant", content: firstResult.content },
              { role: "user", content: toolResults },
            ],
          }),
        });
        const secondResult = await secondRes.json();
        const textBlock = secondResult.content?.find((b: any) => b.type === "text");
        reply = textBlock?.text || "Done.";
      }
    } else {
      // Normal text response
      const textBlock = firstResult.content?.find((b: any) => b.type === "text");
      reply = textBlock?.text || "I'm here — what do you need?";
    }

    // Save assistant reply
    await adminClient.from("companion_messages").insert({
      client_id: client.id,
      role: "assistant",
      content: reply,
    });

    return new Response(JSON.stringify({ reply, actions }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
