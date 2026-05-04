// supabase/functions/process-build-step/handlers.ts
// Per-state work handlers. Phase 1 = dummy sleep + log. Phase 2 = real work.
//
// Each handler returns one of:
//   { kind: "advance" }   — work done, FSM advances normally
//   { kind: "pause", message? } — work done but FSM should pause regardless of classification
//   { kind: "error", message } — work failed, FSM stops in error state

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { BuildStateName } from "../_shared/build-fsm/states.ts";
import type { BuildSession } from "../_shared/build-session/types.ts";
import { updateBuildSession } from "../_shared/build-session/service.ts";

export type HandlerOutcome =
  | { kind: "advance" }
  | { kind: "pause"; message?: string }
  | { kind: "error"; message: string };

export interface HandlerContext {
  admin: SupabaseClient;
  session: BuildSession;
}

export type StateHandler = (ctx: HandlerContext) => Promise<HandlerOutcome>;

// ── Logging helpers ────────────────────────────────────────────────────────

async function logProgress(ctx: HandlerContext, text: string): Promise<void> {
  // Write a progress message to the thread so the drawer shows what's happening.
  // Phase 1: this is a thin wrapper; Phase 2 may add ui_elements.
  try {
    await ctx.admin.from("assistant_messages").insert({
      thread_id: ctx.session.threadId,
      role: "assistant",
      content: { type: "text", text },
    });
  } catch (e) {
    console.error("[handlers] logProgress failed:", (e as Error).message);
  }
}

// ── Phase 1 dummy handlers (replaced in Phase 2) ───────────────────────────

async function dummy(ctx: HandlerContext, label: string): Promise<HandlerOutcome> {
  await logProgress(ctx, label);
  await new Promise((r) => setTimeout(r, 500));
  return { kind: "advance" };
}

const HANDLERS: Record<BuildStateName, StateHandler> = {
  INIT: (ctx) => dummy(ctx, "Setting up..."),
  RESOLVE_CHAT: (ctx) => dummy(ctx, "Confirming canvas..."),
  AWAITING_IDEA: (ctx) => dummy(ctx, "Ready for an idea."),
  READING_CONTEXT: (ctx) => dummy(ctx, "Reading canvas notes..."),
  IDEAS_GENERATED: (ctx) => dummy(ctx, "Coming up with ideas..."),
  FINDING_FRAMEWORKS: (ctx) => dummy(ctx, "Searching viral frameworks..."),
  FRAMEWORKS_PRESENTED: (ctx) => dummy(ctx, "Showing frameworks..."),
  ADDING_VIDEOS: (ctx) => dummy(ctx, "Adding videos to canvas..."),
  TRANSCRIBING: (ctx) => dummy(ctx, "Transcribing video..."),
  DRAFTING_SCRIPT: (ctx) => dummy(ctx, "Drafting script..."),
  DRAFT_PRESENTED: (ctx) => dummy(ctx, "Draft ready for your review."),
  GENERATING_SCRIPT: (ctx) => dummy(ctx, "Saving script..."),
  SCRIPT_SAVED: (ctx) => dummy(ctx, "Script saved."),
  LOOPING_NEXT: async (ctx) => {
    // If there are more selected ideas, advance to AWAITING_IDEA for the next one;
    // otherwise mark DONE. Phase 1: no real ideas, so go to DONE after first loop.
    const next = ctx.session.currentIdeaIndex + 1;
    if (next < (ctx.session.selectedIdeas?.length ?? 0)) {
      await updateBuildSession(ctx.admin, ctx.session.id, {
        currentIdeaIndex: next,
      });
      await logProgress(ctx, `Moving to idea ${next + 1}...`);
      return { kind: "advance" };
    }
    await logProgress(ctx, "All scripts done.");
    // Caller will then advance to DONE via nextState. We override by jumping to DONE.
    await updateBuildSession(ctx.admin, ctx.session.id, { currentState: "DONE" });
    return { kind: "advance" };
  },
  DONE: async (_ctx) => ({ kind: "advance" }),
};

export function getHandler(state: BuildStateName): StateHandler {
  return HANDLERS[state];
}

export { logProgress, createClient };
