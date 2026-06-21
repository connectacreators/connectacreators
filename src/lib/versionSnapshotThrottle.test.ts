import { describe, it, expect } from "vitest";
import { shouldSnapshot } from "./versionSnapshotThrottle";

describe("shouldSnapshot", () => {
  it("snapshots when there is no prior snapshot", () => {
    expect(shouldSnapshot(undefined, 1_000)).toBe(true);
  });
  it("does not snapshot within the threshold window", () => {
    expect(shouldSnapshot(1_000, 1_000 + 60_000)).toBe(false);
  });
  it("snapshots once the threshold has elapsed", () => {
    expect(shouldSnapshot(1_000, 1_000 + 120_000)).toBe(true);
  });
  it("honors a custom threshold", () => {
    expect(shouldSnapshot(1_000, 1_000 + 5_000, 5_000)).toBe(true);
    expect(shouldSnapshot(1_000, 1_000 + 4_999, 5_000)).toBe(false);
  });
});
