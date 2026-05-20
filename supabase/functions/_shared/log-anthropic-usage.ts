// supabase/functions/_shared/log-anthropic-usage.ts
//
// Fire-and-forget per-call token + cost logger. Call after every successful
// Anthropic messages.create response, passing the response's usage block.
// Failures here MUST NOT break the user-facing response — wrap in try/catch
// at the call site or just don't await.
//
// Pricing is the rate card as of 2026-05. Update PRICES when Anthropic
// changes their published per-million-token rates.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";

/** Lazy-built service-role client used when the caller can't pass one in.
 *  Cached per worker so we don't spin up a fresh client per request. */
let _serviceClient: SupabaseClient | null = null;
function getServiceClient(): SupabaseClient | null {
  if (_serviceClient) return _serviceClient;
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return null;
  _serviceClient = createClient(url, key);
  return _serviceClient;
}

/** Anthropic's `usage` object shape returned in every messages.create response. */
export interface AnthropicUsage {
  input_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  output_tokens?: number;
}

/** Per-million-token list prices (USD). Cache writes are 1.25× input; reads are 0.1× input. */
const PRICES: Record<string, { input: number; output: number }> = {
  "claude-opus-4-7": { input: 5.0, output: 25.0 },
  "claude-opus-4-6": { input: 5.0, output: 25.0 },
  "claude-opus-4-5": { input: 5.0, output: 25.0 },
  "claude-sonnet-4-6": { input: 3.0, output: 15.0 },
  "claude-sonnet-4-5": { input: 3.0, output: 15.0 },
  "claude-haiku-4-5": { input: 1.0, output: 5.0 },
  "claude-haiku-4-5-20251001": { input: 1.0, output: 5.0 },
};

const CACHE_WRITE_MULT = 1.25;
const CACHE_READ_MULT = 0.1;
const BATCH_MULT = 0.5; // Batches API is 50% off both input + output

function priceFor(model: string): { input: number; output: number } {
  const exact = PRICES[model];
  if (exact) return exact;
  // Fall back by family if a date-suffixed ID we don't have hardcoded slips through.
  if (model.startsWith("claude-opus")) return { input: 5.0, output: 25.0 };
  if (model.startsWith("claude-sonnet")) return { input: 3.0, output: 15.0 };
  if (model.startsWith("claude-haiku")) return { input: 1.0, output: 5.0 };
  return { input: 0, output: 0 };
}

export function computeCostUsd(
  model: string,
  usage: AnthropicUsage,
  opts: { batch?: boolean } = {},
): number {
  const { input, output } = priceFor(model);
  const mult = opts.batch ? BATCH_MULT : 1;
  const inputTokens = usage.input_tokens ?? 0;
  const cacheWrite = usage.cache_creation_input_tokens ?? 0;
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  const outputTokens = usage.output_tokens ?? 0;
  const inputCost =
    (inputTokens * input +
      cacheWrite * input * CACHE_WRITE_MULT +
      cacheRead * input * CACHE_READ_MULT) /
    1_000_000;
  const outputCost = (outputTokens * output) / 1_000_000;
  return (inputCost + outputCost) * mult;
}

export interface LogParams {
  functionName: string;
  model: string;
  usage: AnthropicUsage | null | undefined;
  userId?: string | null;
  /** Set true for Batches API calls (50% off). */
  batch?: boolean;
  metadata?: Record<string, unknown>;
}

/**
 * Insert one row into anthropic_usage_log. Never throws — logs to console on
 * failure so the caller's response path is never blocked by telemetry issues.
 * Caller does NOT need to await; fire and forget is fine.
 *
 * Pass `null` for supabase to use a cached service-role client built from env
 * vars (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY). Convenient for background
 * functions that don't otherwise need a Supabase client in scope.
 */
export async function logAnthropicUsage(
  supabase: SupabaseClient | null,
  params: LogParams,
): Promise<void> {
  const client = supabase ?? getServiceClient();
  if (!client) {
    console.warn("[log-anthropic-usage] no supabase client available — skipping log");
    return;
  }
  if (!params.usage) return;
  const inputTokens = params.usage.input_tokens ?? 0;
  const cacheWrite = params.usage.cache_creation_input_tokens ?? 0;
  const cacheRead = params.usage.cache_read_input_tokens ?? 0;
  const outputTokens = params.usage.output_tokens ?? 0;
  // Skip rows that have no tokens at all (errored / aborted requests).
  if (inputTokens + cacheWrite + cacheRead + outputTokens === 0) return;

  const cost = computeCostUsd(params.model, params.usage, { batch: params.batch });

  try {
    const { error } = await client.from("anthropic_usage_log").insert({
      user_id: params.userId ?? null,
      function_name: params.functionName,
      model: params.model,
      input_tokens: inputTokens,
      cache_creation_tokens: cacheWrite,
      cache_read_tokens: cacheRead,
      output_tokens: outputTokens,
      cost_usd: cost,
      metadata: params.metadata ?? null,
    });
    if (error) {
      console.error("[log-anthropic-usage] insert failed:", error.message);
    }
  } catch (err) {
    console.error("[log-anthropic-usage] threw:", err);
  }
}
