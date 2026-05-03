import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const { message, companion_name } = await req.json() as { message: string; companion_name: string };
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

    // Build brand context
    const od = client.onboarding_data || {};
    const brandLines = [
      od.business_name && `Business: ${od.business_name}`,
      od.industry && `Industry: ${od.industry}`,
      od.unique_offer && `Unique offer: ${od.unique_offer}`,
      od.target_client && `Target audience: ${od.target_client}`,
      od.unique_values && `Key values: ${od.unique_values}`,
    ].filter(Boolean).join("\n");

    const name = companion_name || "AI";
    const systemPrompt = `You are ${name}, a friendly AI assistant for Connecta Creators — a content creation platform.

Your job: guide users step by step through creating great content, even if they know nothing about marketing. You do the thinking, they make decisions.

User's name: ${client.name || "there"}
${brandLines ? `\nBrand context:\n${brandLines}` : ""}

Rules:
- Always speak plain English (or Spanish if they write in Spanish — detect automatically).
- Be warm, encouraging, and direct. Like a good coach.
- Keep replies short: 2–4 sentences max unless they ask for detail.
- Refer to yourself as "${name}" when natural.
- If they ask where to find something, point them to the right page: Scripts, Vault, Viral Today, Editing Queue, Content Calendar, Subscription.
- Never use jargon like "pipeline", "leverage", "synergy", or "streamline".`;

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

    // Call Claude
    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
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
        messages: [...priorMessages, { role: "user", content: message }],
      }),
    });

    const result = await claudeRes.json();
    const reply: string = result.content?.[0]?.text || "I'm here — what do you need?";

    // Save assistant reply
    await adminClient.from("companion_messages").insert({
      client_id: client.id,
      role: "assistant",
      content: reply,
    });

    return new Response(JSON.stringify({ reply }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
