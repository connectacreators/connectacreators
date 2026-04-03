import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
  if (!ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { batchId, topicMap, videoMap, clientId } = await req.json();

    if (!batchId) {
      return new Response(JSON.stringify({ error: "batchId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Retrieve batch status
    const batchRes = await fetch(`https://api.anthropic.com/v1/messages/batches/${batchId}`, {
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
    });

    if (!batchRes.ok) {
      const err = await batchRes.text();
      throw new Error(`Batch retrieve error ${batchRes.status}: ${err}`);
    }

    const batch = await batchRes.json();

    if (batch.processing_status !== "ended") {
      return new Response(
        JSON.stringify({
          status: "processing",
          requestCounts: batch.request_counts,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Batch done — retrieve results as JSONL
    const resultsRes = await fetch(`https://api.anthropic.com/v1/messages/batches/${batchId}/results`, {
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
    });

    if (!resultsRes.ok) {
      const err = await resultsRes.text();
      throw new Error(`Batch results error ${resultsRes.status}: ${err}`);
    }

    const text = await resultsRes.text();
    const results: any[] = [];
    const correlationMap = videoMap || topicMap || {};

    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const result = JSON.parse(trimmed);
        const topic = correlationMap[result.custom_id] || result.custom_id;

        if (result.result?.type === "succeeded") {
          const toolUse = result.result.message?.content?.find((b: any) => b.type === "tool_use");
          let script = toolUse?.input ?? null;

          if (script?.idea_ganadora) {
            const words = script.idea_ganadora.split(/\s+/);
            if (words.length > 5) script.idea_ganadora = words.slice(0, 5).join(" ");
          }

          results.push({ customId: result.custom_id, topic, script, error: null });
        } else {
          results.push({
            customId: result.custom_id,
            topic,
            script: null,
            error: result.result?.error?.message || "Request failed",
          });
        }
      } catch {
        // Skip malformed lines
      }
    }

    // Write ScriptBatchNode entries to canvas if clientId provided
    if (clientId && results.some((r) => r.script)) {
      try {
        const adminClient = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        );

        const { data: session } = await adminClient
          .from("canvas_states")
          .select("id, nodes")
          .eq("client_id", clientId)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (session) {
          const existingNodes: any[] = Array.isArray(session.nodes) ? session.nodes : [];

          // Base position: right of existing content
          let maxX = 0;
          for (const n of existingNodes) {
            const nx = (n.position?.x ?? 0) + (n.width ?? 260);
            if (nx > maxX) maxX = nx;
          }
          const baseX = maxX + 100;
          const baseY = 100;

          const newNodes: any[] = [];
          let yOffset = 0;
          for (const r of results) {
            if (!r.script) continue;
            const vd = (videoMap || {})[r.customId] || {};
            const nodeId = `scriptBatchNode_${Date.now()}_${yOffset}`;
            newNodes.push({
              id: nodeId,
              type: "scriptBatchNode",
              position: { x: baseX, y: baseY + yOffset },
              width: 260,
              data: {
                script: r.script,
                videoThumbnail: vd.thumbnail_url || null,
                videoUrl: vd.video_url || null,
                videoCaption: vd.caption || null,
                ownerUsername: vd.owner_username || null,
                outlierScore: vd.outlier_score || null,
                platform: vd.platform || null,
              },
            });
            yOffset += 220;
          }

          await adminClient
            .from("canvas_states")
            .update({
              nodes: [...existingNodes, ...newNodes],
              updated_at: new Date().toISOString(),
            })
            .eq("id", session.id);
        }
      } catch (canvasErr) {
        console.error("Failed to write batch results to canvas:", canvasErr);
      }
    }

    return new Response(
      JSON.stringify({ status: "done", results, requestCounts: batch.request_counts }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e: any) {
    console.error("batch-poll-scripts error:", e);
    return new Response(JSON.stringify({ error: e.message || "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
