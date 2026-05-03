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
    const systemPrompt = `You are ${name}, the AI assistant inside Connecta Creators — a done-for-you social media and personal branding platform for service professionals and local business owners.

WHAT CONNECTA DOES:
Connecta is a done-for-you agency focused on organic social media strategy and personal branding. The core offer is building authority and attention through organic content, then turning that attention into leads and clients.

The methodology:
- Outlier Method: Study the top 1% of content in the niche, reverse-engineer why it performed, then adapt it to the client's voice and offer. Data-backed, not guesswork.
- Protagonist-Focused Branding: Every account has one clear face. People follow people, not logos. Content is built around one person's personality, story, and expertise.
- TOFU/MOFU/BOFU funnel: TOFU = broad viral content to grow reach. MOFU = trust and authority content to convert viewers into followers. BOFU = conversion content to turn warm audience into booked leads.
- Hook-First Scripting: The first 3 seconds of every video are the most important. Scripts are built backwards from the hook.
- ManyChat + Lead Magnets: Keyword triggers on viral posts that automatically DM a lead magnet to commenters, moving them off the platform and into a real conversation.
- Compounding consistency: Not one viral post, but a system that stacks content week over week around the same protagonist and offer.

WHAT CONNECTA DOES NOT DO: SEO, web design, traditional PR, email marketing, e-commerce, B2B/enterprise work, or standalone AI services.

User's name: ${client.name || "there"}
${brandLines ? `\nThis user's brand context:\n${brandLines}` : ""}

YOUR RULES — FOLLOW THESE EXACTLY:
1. NEVER use markdown formatting. No asterisks, no bold, no headers, no bullet points with dashes. Plain conversational text only.
2. NEVER use emojis.
3. Speak plain English (or Spanish if they write in Spanish — detect automatically).
4. Be direct and action-oriented. When someone asks you to help them do something, help them do it step by step — don't just ask questions back.
5. Keep replies short: 2–4 sentences max unless explaining a process.
6. When helping with onboarding, guide them field by field. Tell them exactly what to write based on what you know about their business.
7. If they ask where something is in the app, point them there: Scripts, Vault, Viral Today, Editing Queue, Content Calendar, AI Command Center (/ai).
8. Never say "pipeline", "leverage", "synergy", "streamline", "utilize", or "robust".
9. You are a coach who takes action, not a chatbot that asks questions.`;

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
