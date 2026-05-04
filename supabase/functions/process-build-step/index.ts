// supabase/functions/process-build-step/index.ts
// Background worker: advance one build session by one FSM step.
// Self-chains through AUTO states; halts at SOFT_ASK/HARD_ASK or when paused.
//
// See:
//  - docs/superpowers/specs/2026-05-04-conversational-script-builder-design.md
//  - supabase/functions/_shared/build-fsm/states.ts

import { createClient } from "@supabase/supabase-js";
import { corsHeaders } from "../_shared/cors.ts";
import {
  classifyState,
  isTerminal,
  nextState,
} from "../_shared/build-fsm/states.ts";
import {
  getBuildSession,
  updateBuildSession,
} from "../_shared/build-session/service.ts";
import { getHandler } from "./handlers.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface RequestBody {
  build_session_id: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return new Response(JSON.stringify({ error: "invalid json" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!body.build_session_id) {
    return new Response(JSON.stringify({ error: "missing build_session_id" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const session = await getBuildSession(admin, body.build_session_id);
  if (!session) {
    return new Response(JSON.stringify({ error: "session not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (session.status !== "running") {
    return new Response(
      JSON.stringify({ stopped: true, reason: `status=${session.status}` }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // Run the handler for the current state.
  const handler = getHandler(session.currentState);
  let outcome;
  try {
    outcome = await handler({ admin, session });
  } catch (e) {
    const msg = (e as Error).message ?? "unknown handler error";
    console.error(`[process-build-step] handler ${session.currentState} threw:`, msg);
    await updateBuildSession(admin, session.id, {
      status: "error",
      errorMessage: msg,
    });
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (outcome.kind === "error") {
    await updateBuildSession(admin, session.id, {
      status: "error",
      errorMessage: outcome.message,
    });
    return new Response(JSON.stringify({ error: outcome.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Re-read the session — the handler may have mutated state (e.g. LOOPING_NEXT
  // jumped current_state directly to DONE).
  const fresh = await getBuildSession(admin, session.id);
  if (!fresh) {
    return new Response(JSON.stringify({ error: "session vanished" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (fresh.status !== "running") {
    // Handler decided to stop (e.g. paused, cancelled by user race condition).
    return new Response(JSON.stringify({ stopped: true, reason: `status=${fresh.status}` }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (isTerminal(fresh.currentState)) {
    await updateBuildSession(admin, fresh.id, { status: "completed" });
    return new Response(JSON.stringify({ done: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // If handler explicitly asked to pause, honor it regardless of next-state classification.
  if (outcome.kind === "pause") {
    await updateBuildSession(admin, fresh.id, { status: "awaiting_user" });
    return new Response(JSON.stringify({ paused: true, reason: "handler-pause" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Advance to next state.
  const nxt = nextState(fresh.currentState);
  if (!nxt) {
    await updateBuildSession(admin, fresh.id, { status: "completed" });
    return new Response(JSON.stringify({ done: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const cls = classifyState(nxt);
  const willPause = cls === "HARD_ASK" || (cls === "SOFT_ASK" && !fresh.autoPilot);

  if (willPause) {
    await updateBuildSession(admin, fresh.id, {
      currentState: nxt,
      status: "awaiting_user",
    });
    return new Response(JSON.stringify({ paused: true, state: nxt }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Auto-advance: persist next state and chain to ourselves.
  await updateBuildSession(admin, fresh.id, { currentState: nxt });
  void fetch(`${SUPABASE_URL}/functions/v1/process-build-step`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({ build_session_id: fresh.id }),
  }).catch((e) => console.error("[process-build-step] chain fetch failed:", e));

  return new Response(JSON.stringify({ chained: true, state: nxt }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
