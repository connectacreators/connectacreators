// Pure fleet-wide wrapper around the existing per-client fulfillmentScore()
// math (src/lib/strategy/pace.ts) — reuses that formula rather than
// reimplementing it, just runs it across every client and bands the result.
import { fulfillmentScore, type MonthWindow, type ScoreInputs } from "@/lib/strategy/pace";

export type StrategyBand = "hi" | "mid" | "lo";

export interface FleetClientInput {
  clientId: string;
  clientName: string;
  inputs: ScoreInputs;
}

export interface RankedStrategyHealth {
  clientId: string;
  clientName: string;
  score: number;
  band: StrategyBand;
}

export function bandForScore(score: number): StrategyBand {
  if (score >= 80) return "hi";
  if (score >= 50) return "mid";
  return "lo";
}

/** Scores every client via the existing fulfillmentScore() formula, sorted
 *  worst-first (Action required clients surface before On track ones —
 *  this is an attention panel, not a leaderboard). */
export function rankFleetStrategyHealth(clients: FleetClientInput[], w: MonthWindow): RankedStrategyHealth[] {
  return clients
    .map((c) => {
      const score = fulfillmentScore(c.inputs, w);
      return { clientId: c.clientId, clientName: c.clientName, score, band: bandForScore(score) };
    })
    .sort((a, b) => a.score - b.score);
}
