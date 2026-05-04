// supabase/functions/_shared/build-fsm/states.test.ts
import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  BUILD_STATES,
  type BuildStateName,
  classifyState,
  nextState,
  isTerminal,
} from "./states.ts";

Deno.test("BUILD_STATES — contains all 15 states from the spec", () => {
  const expected: BuildStateName[] = [
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
  ];
  assertEquals(BUILD_STATES, expected);
});

Deno.test("classifyState — SOFT_ASK states pause by default", () => {
  assertEquals(classifyState("INIT"), "SOFT_ASK");
  assertEquals(classifyState("RESOLVE_CHAT"), "SOFT_ASK");
  assertEquals(classifyState("AWAITING_IDEA"), "SOFT_ASK");
  assertEquals(classifyState("IDEAS_GENERATED"), "SOFT_ASK");
  assertEquals(classifyState("FRAMEWORKS_PRESENTED"), "SOFT_ASK");
  assertEquals(classifyState("LOOPING_NEXT"), "SOFT_ASK");
});

Deno.test("classifyState — HARD_ASK states always pause", () => {
  assertEquals(classifyState("DRAFT_PRESENTED"), "HARD_ASK");
});

Deno.test("classifyState — AUTO states never pause", () => {
  assertEquals(classifyState("READING_CONTEXT"), "AUTO");
  assertEquals(classifyState("FINDING_FRAMEWORKS"), "AUTO");
  assertEquals(classifyState("ADDING_VIDEOS"), "AUTO");
  assertEquals(classifyState("TRANSCRIBING"), "AUTO");
  assertEquals(classifyState("DRAFTING_SCRIPT"), "AUTO");
  assertEquals(classifyState("GENERATING_SCRIPT"), "AUTO");
  assertEquals(classifyState("SCRIPT_SAVED"), "AUTO");
  assertEquals(classifyState("DONE"), "AUTO");
});

Deno.test("classifyState — unknown state throws", () => {
  assertThrows(() => classifyState("BANANA" as BuildStateName));
});

Deno.test("nextState — happy path follows the spec", () => {
  assertEquals(nextState("INIT"), "RESOLVE_CHAT");
  assertEquals(nextState("RESOLVE_CHAT"), "AWAITING_IDEA");
  assertEquals(nextState("AWAITING_IDEA"), "READING_CONTEXT");
  assertEquals(nextState("READING_CONTEXT"), "IDEAS_GENERATED");
  assertEquals(nextState("IDEAS_GENERATED"), "FINDING_FRAMEWORKS");
  assertEquals(nextState("FINDING_FRAMEWORKS"), "FRAMEWORKS_PRESENTED");
  assertEquals(nextState("FRAMEWORKS_PRESENTED"), "ADDING_VIDEOS");
  assertEquals(nextState("ADDING_VIDEOS"), "TRANSCRIBING");
  assertEquals(nextState("TRANSCRIBING"), "DRAFTING_SCRIPT");
  assertEquals(nextState("DRAFTING_SCRIPT"), "DRAFT_PRESENTED");
  assertEquals(nextState("DRAFT_PRESENTED"), "GENERATING_SCRIPT");
  assertEquals(nextState("GENERATING_SCRIPT"), "SCRIPT_SAVED");
  assertEquals(nextState("SCRIPT_SAVED"), "LOOPING_NEXT");
  assertEquals(nextState("LOOPING_NEXT"), "AWAITING_IDEA");
});

Deno.test("nextState — terminal returns null", () => {
  assertEquals(nextState("DONE"), null);
});

Deno.test("isTerminal — only DONE is terminal", () => {
  assertEquals(isTerminal("DONE"), true);
  assertEquals(isTerminal("INIT"), false);
  assertEquals(isTerminal("DRAFT_PRESENTED"), false);
  assertEquals(isTerminal("LOOPING_NEXT"), false);
});
