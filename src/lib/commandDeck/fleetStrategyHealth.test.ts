import { describe, it, expect } from "vitest";
import { monthWindow } from "@/lib/strategy/pace";
import { rankFleetStrategyHealth, bandForScore } from "./fleetStrategyHealth";

describe("bandForScore", () => {
  it("bands >=80 as hi (On track)", () => {
    expect(bandForScore(80)).toBe("hi");
    expect(bandForScore(92)).toBe("hi");
  });

  it("bands 50-79 as mid (Needs attention)", () => {
    expect(bandForScore(50)).toBe("mid");
    expect(bandForScore(74)).toBe("mid");
  });

  it("bands <50 as lo (Action required)", () => {
    expect(bandForScore(49)).toBe("lo");
    expect(bandForScore(0)).toBe("lo");
  });
});

describe("rankFleetStrategyHealth", () => {
  it("sorts worst-first so Action-required clients surface before On-track ones", () => {
    const w = monthWindow(2026, 6, new Date(2026, 6, 15));
    const strong: import("@/lib/strategy/pace").ScoreInputs = {
      scripts: 20, edited: 20, scheduled: 20, scriptsTarget: 20, editedTarget: 20, scheduledTarget: 20,
      manychatActive: true, audienceScore: 10, uniquenessScore: 10,
    };
    const weak: import("@/lib/strategy/pace").ScoreInputs = {
      scripts: 0, edited: 0, scheduled: 0, scriptsTarget: 20, editedTarget: 20, scheduledTarget: 20,
      manychatActive: false, audienceScore: 2, uniquenessScore: 2,
    };
    const ranked = rankFleetStrategyHealth(
      [
        { clientId: "a", clientName: "Strong", inputs: strong },
        { clientId: "b", clientName: "Weak", inputs: weak },
      ],
      w,
    );
    expect(ranked[0].clientId).toBe("b");
    expect(ranked[0].band).toBe("lo");
    expect(ranked[1].clientId).toBe("a");
    expect(ranked[1].band).toBe("hi");
  });
});
