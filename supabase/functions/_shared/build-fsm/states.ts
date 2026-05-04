// supabase/functions/_shared/build-fsm/states.ts
// Build session FSM — state names, classification, happy-path transitions.
// See docs/superpowers/specs/2026-05-04-conversational-script-builder-design.md

export const BUILD_STATES = [
  "INIT",
  "RESOLVE_CHAT",
  "AWAITING_IDEA",
  "READING_CONTEXT",
  "IDEAS_GENERATED",
  "FINDING_FRAMEWORKS",
  "FRAMEWORKS_PRESENTED",
  "ADDING_VIDEOS",
  "TRANSCRIBING",
  "DRAFTING_SCRIPT",
  "DRAFT_PRESENTED",
  "GENERATING_SCRIPT",
  "SCRIPT_SAVED",
  "LOOPING_NEXT",
  "DONE",
] as const;

export type BuildStateName = (typeof BUILD_STATES)[number];

export type StateClassification = "AUTO" | "SOFT_ASK" | "HARD_ASK";

const CLASSIFICATION: Record<BuildStateName, StateClassification> = {
  INIT: "SOFT_ASK",
  RESOLVE_CHAT: "SOFT_ASK",
  AWAITING_IDEA: "SOFT_ASK",
  READING_CONTEXT: "AUTO",
  IDEAS_GENERATED: "SOFT_ASK",
  FINDING_FRAMEWORKS: "AUTO",
  FRAMEWORKS_PRESENTED: "SOFT_ASK",
  ADDING_VIDEOS: "AUTO",
  TRANSCRIBING: "AUTO",
  DRAFTING_SCRIPT: "AUTO",
  DRAFT_PRESENTED: "HARD_ASK",
  GENERATING_SCRIPT: "AUTO",
  SCRIPT_SAVED: "AUTO",
  LOOPING_NEXT: "SOFT_ASK",
  DONE: "AUTO",
};

export function classifyState(state: BuildStateName): StateClassification {
  const c = CLASSIFICATION[state];
  if (!c) throw new Error(`Unknown build state: ${state}`);
  return c;
}

const NEXT: Partial<Record<BuildStateName, BuildStateName>> = {
  INIT: "RESOLVE_CHAT",
  RESOLVE_CHAT: "AWAITING_IDEA",
  AWAITING_IDEA: "READING_CONTEXT",
  READING_CONTEXT: "IDEAS_GENERATED",
  IDEAS_GENERATED: "FINDING_FRAMEWORKS",
  FINDING_FRAMEWORKS: "FRAMEWORKS_PRESENTED",
  FRAMEWORKS_PRESENTED: "ADDING_VIDEOS",
  ADDING_VIDEOS: "TRANSCRIBING",
  TRANSCRIBING: "DRAFTING_SCRIPT",
  DRAFTING_SCRIPT: "DRAFT_PRESENTED",
  DRAFT_PRESENTED: "GENERATING_SCRIPT",
  GENERATING_SCRIPT: "SCRIPT_SAVED",
  SCRIPT_SAVED: "LOOPING_NEXT",
  LOOPING_NEXT: "AWAITING_IDEA",
  // DONE is terminal — no successor.
};

export function nextState(current: BuildStateName): BuildStateName | null {
  return NEXT[current] ?? null;
}

export function isTerminal(state: BuildStateName): boolean {
  return state === "DONE";
}
