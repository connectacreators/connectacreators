import { describe, it, expect } from "vitest";
import { buildPipelineRows, type PipelineSource } from "@/lib/triage/buildPipelineRows";

const NOW = new Date("2026-06-10T12:00:00Z");
function daysFromNow(n: number): string {
  return new Date(NOW.getTime() + n * 24 * 60 * 60 * 1000).toISOString();
}
const empty: PipelineSource = {
  onboarding_call_at: null, script_due_at: null, editing_due_at: null,
  next_filming_at: null, boosting_at: null, posting_at: null, ads_budget: null,
};

describe("buildPipelineRows windowing", () => {
  it("returns [] for null source", () => {
    expect(buildPipelineRows(null)).toEqual([]);
  });

  it("excludes a script due 9 days out (base 7d window)", () => {
    const src = { ...empty, script_due_at: daysFromNow(9) };
    const rows = buildPipelineRows(src, { windowDays: 7, now: NOW });
    expect(rows.find((r) => r.milestone === "script_due")).toBeUndefined();
  });

  it("INCLUDES a filming 9 days out (10d prep window)", () => {
    const src = { ...empty, next_filming_at: daysFromNow(9) };
    const rows = buildPipelineRows(src, { windowDays: 7, now: NOW });
    expect(rows.find((r) => r.milestone === "filming")).toBeDefined();
  });

  it("INCLUDES an onboarding call 9 days out (10d prep window)", () => {
    const src = { ...empty, onboarding_call_at: daysFromNow(9) };
    const rows = buildPipelineRows(src, { windowDays: 7, now: NOW });
    expect(rows.find((r) => r.milestone === "onboarding_call")).toBeDefined();
  });

  it("excludes filming 11 days out (beyond 10d)", () => {
    const src = { ...empty, next_filming_at: daysFromNow(11) };
    const rows = buildPipelineRows(src, { windowDays: 7, now: NOW });
    expect(rows.find((r) => r.milestone === "filming")).toBeUndefined();
  });

  it("excludes past dates", () => {
    const src = { ...empty, script_due_at: daysFromNow(-1) };
    expect(buildPipelineRows(src, { windowDays: 7, now: NOW })).toEqual([]);
  });
});
