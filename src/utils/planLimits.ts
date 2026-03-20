import { supabase } from "@/integrations/supabase/client";

export const PLAN_LIMITS: Record<string, { leads: number; scripts: number; landing_pages: number; channel_scrapes: number }> = {
  free:       { leads: 25,  scripts: 10,  landing_pages: 0, channel_scrapes: 1 },
  starter:    { leads: 100, scripts: 75,  landing_pages: 1, channel_scrapes: 8 },
  growth:     { leads: 500, scripts: 200, landing_pages: 3, channel_scrapes: 15 },
  enterprise: { leads: -1,  scripts: -1,  landing_pages: -1, channel_scrapes: 25 },
};

export type PlanResource = "leads" | "scripts" | "landing_pages" | "channel_scrapes";

export function getPlanLimit(planType: string, resource: PlanResource): number {
  const plan = PLAN_LIMITS[planType];
  if (!plan) return 0;
  return plan[resource];
}

export function isUnlimited(planType: string, resource: PlanResource): boolean {
  return getPlanLimit(planType, resource) === -1;
}

/**
 * Fetch the plan_type for a given client ID.
 * Returns the plan_type string, or "free" if not found.
 */
export async function getClientPlanType(clientId: string): Promise<string> {
  const { data } = await supabase
    .from("clients")
    .select("plan_type")
    .eq("id", clientId)
    .maybeSingle();
  return data?.plan_type || "free";
}

/**
 * Check if a resource creation is allowed for a client.
 * Returns { allowed: true } or { allowed: false, limit, current, planType }.
 */
export async function checkResourceLimit(
  clientId: string,
  resource: PlanResource
): Promise<{ allowed: boolean; limit: number; current: number; planType: string }> {
  const planType = await getClientPlanType(clientId);
  const limit = getPlanLimit(planType, resource);

  // Unlimited
  if (limit === -1) {
    return { allowed: true, limit, current: 0, planType };
  }

  // Zero means feature not available
  if (limit === 0) {
    return { allowed: false, limit, current: 0, planType };
  }

  // Count current resources
  let table: string;
  let filterColumn: string;
  switch (resource) {
    case "leads":
      table = "leads";
      filterColumn = "client_id";
      break;
    case "scripts":
      table = "scripts";
      filterColumn = "client_id";
      break;
    case "landing_pages":
      table = "landing_pages";
      filterColumn = "client_id";
      break;
    case "channel_scrapes":
      // Channel scrapes are enforced via DB columns, not here
      return { allowed: true, limit, current: 0, planType };
    default:
      return { allowed: true, limit, current: 0, planType };
  }

  const { count, error } = await supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq(filterColumn, clientId);

  if (error) {
    console.error(`Error counting ${resource}:`, error);
    // Allow on error to avoid blocking
    return { allowed: true, limit, current: 0, planType };
  }

  const current = count ?? 0;
  return { allowed: current < limit, limit, current, planType };
}
