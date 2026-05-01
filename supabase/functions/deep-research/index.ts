import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RESEARCH_CREDIT_COST = 100;

async function getPrimaryClientId(
  adminClient: ReturnType<typeof createClient>,
  userId: string
): Promise<string | null> {
  const { data } = await adminClient
    .from("subscriber_clients")
    .select("client_id")
    .eq("subscriber_user_id", userId)
    .eq("is_primary", true)
    .maybeSingle();
  if (data?.client_id) return data.client_id;

  const { data: client } = await adminClient
    .from("clients")
    .select("id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  return client?.id ?? null;
}

async function checkAndDeductCredits(
  adminClient: any,
  userId: string,
): Promise<{ error?: string; clientId?: string }> {
  const { data: roleData } = await adminClient
    .from("user_roles").select("role").eq("user_id", userId).maybeSingle();
  const role = roleData?.role;
  if (role === "admin" || role === "videographer" || role === "editor") return {};

  const primaryClientId = await getPrimaryClientId(adminClient, userId);
  if (!primaryClientId) return {};

  const { data: result, error } = await adminClient.rpc("deduct_credits_atomic", {
    p_client_id: primaryClientId,
    p_action: "deep-research",
    p_cost: RESEARCH_CREDIT_COST,
  });
  if (error) { console.error("[deep-research] Credit error:", error); return {}; }
  if (!result?.ok) return { error: result?.error };
  return { clientId: primaryClientId };
}

/** Generate 3 targeted search queries from the user's topic using GPT-4o */
async function generateSearchQueries(topic: string, openaiKey: string): Promise<string[]> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${openaiKey}` },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You generate focused web search queries for content creator research. Return a JSON array of exactly 3 strings, no other text.",
        },
        {
          role: "user",
          content: `Generate 3 targeted web search queries to research: "${topic}"\n\nFocus on: recent statistics, clinical/industry data, trends, and angles a content creator could use. Return ONLY a JSON array like: ["query1", "query2", "query3"]`,
        },
      ],
      max_tokens: 200,
      temperature: 0.3,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Query generation failed: ${err}`);
  }

  const json = await res.json();
  const text = json.choices?.[0]?.message?.content?.trim() ?? "[]";
  try {
    const queries = JSON.parse(text);
    return Array.isArray(queries) ? queries.slice(0, 3) : [topic];
  } catch {
    return [topic, `${topic} statistics 2025`, `${topic} latest research`];
  }
}

/** Run a single web search via OpenAI Responses API */
async function runWebSearch(query: string, openaiKey: string): Promise<{ text: string; query: string }> {
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${openaiKey}` },
    body: JSON.stringify({
      model: "gpt-4o",
      tools: [{ type: "web_search_preview" }],
      input: query,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.warn(`[deep-research] Web search failed for "${query}": ${err}`);
    return { text: "", query };
  }

  const json = await res.json();
  // Extract text from the response output
  let text = "";
  for (const item of json.output ?? []) {
    if (item.type === "message") {
      for (const block of item.content ?? []) {
        if (block.type === "output_text") text += block.text + "\n";
        else if (block.type === "text") text += block.text + "\n";
      }
    }
  }
  return { text: text.trim(), query };
}

/** Synthesize web search results with Claude Sonnet — returns a ReadableStream for SSE */
async function synthesizeWithClaude(
  topic: string,
  searchResults: Array<{ text: string; query: string }>,
  canvasContext: string,
  anthropicKey: string,
): Promise<{ stream: ReadableStream; sourceCount: number }> {
  const validResults = searchResults.filter(r => r.text.length > 0);
  const sourceCount = validResults.length;

  const contextBlock = canvasContext
    ? `\nCANVAS CONTEXT:\n${canvasContext.slice(0, 800)}\n`
    : "";

  const searchBlock = validResults
    .map((r, i) => `--- Search ${i + 1}: "${r.query}" ---\n${r.text.slice(0, 1200)}`)
    .join("\n\n");

  const systemPrompt = `You are a research assistant for social media content creators. Synthesize web search results into a clear, actionable research report. Be concise, data-driven, and focused on content creator use cases.

Format your response EXACTLY like this:

## [Topic]

**Key Findings**
• [most important data point with number/stat]
• [second finding with number/stat if available]
• [third finding]

**Trends**
• [emerging pattern]
• [growing trend]

**Content Angles**
• [video idea angle 1]
• [video idea angle 2]
• [video idea angle 3]

Keep it tight. Prioritize facts with numbers, percentages, and specific data. No fluff.`;

  const userMessage = `Research topic: "${topic}"
${contextBlock}
Web search results:
${searchBlock || "No search results available — use your training knowledge."}

Synthesize into a research report following the exact format in your instructions.`;

  const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": anthropicKey,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "prompt-caching-2024-07-31",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 800,
      stream: true,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  if (!claudeRes.ok) {
    const err = await claudeRes.text();
    throw new Error(`Claude synthesis failed: ${err}`);
  }

  return { stream: claudeRes.body!, sourceCount };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
  const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");

  if (!OPENAI_API_KEY) {
    return new Response(JSON.stringify({ error: "OpenAI API key not configured" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({ error: "Anthropic API key not configured" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Auth
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error: authErr } = await adminClient.auth.getUser(token);
  if (authErr || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { topic, canvas_context = "" } = body;
  if (!topic?.trim()) {
    return new Response(JSON.stringify({ error: "topic is required" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Credit check & deduction
  const creditResult = await checkAndDeductCredits(adminClient, user.id);
  if (creditResult.error) {
    return new Response(JSON.stringify({ error: creditResult.error, insufficient_credits: true }), {
      status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Stream response via SSE
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  const send = (data: object) => writer.write(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

  // Run research pipeline in background
  (async () => {
    try {
      // Step 1: Generate search queries
      const queries = await generateSearchQueries(topic.trim(), OPENAI_API_KEY);
      console.log(`[deep-research] Queries: ${JSON.stringify(queries)}`);

      // Step 2: Parallel web searches
      const searchResults = await Promise.all(
        queries.map(q => runWebSearch(q, OPENAI_API_KEY).catch(() => ({ text: "", query: q })))
      );
      const validCount = searchResults.filter(r => r.text.length > 0).length;
      console.log(`[deep-research] ${validCount}/${queries.length} searches succeeded`);

      // Step 3: Claude synthesis (streaming)
      const { stream, sourceCount } = await synthesizeWithClaude(
        topic.trim(),
        searchResults,
        canvas_context,
        ANTHROPIC_API_KEY,
      );

      // Pipe Claude SSE → our SSE
      const reader = stream.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6);
          if (raw === "[DONE]") continue;
          try {
            const ev = JSON.parse(raw);
            if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta") {
              await send({ delta: ev.delta.text });
            }
          } catch { /* skip */ }
        }
      }
      reader.releaseLock();

      // Done event with metadata
      await send({ done: true, source_count: sourceCount });
    } catch (e: any) {
      console.error("[deep-research] Pipeline error:", e.message);
      await send({ error: e.message || "Research failed" });
    } finally {
      await writer.close();
    }
  })();

  return new Response(readable, {
    headers: {
      ...corsHeaders,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
});
