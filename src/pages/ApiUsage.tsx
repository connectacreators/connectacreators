import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";

import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Range = "7d" | "30d" | "90d" | "all";

interface UsageRow {
  id: number;
  created_at: string;
  user_id: string | null;
  function_name: string;
  model: string;
  input_tokens: number;
  cache_creation_tokens: number;
  cache_read_tokens: number;
  output_tokens: number;
  cost_usd: number;
  metadata: Record<string, unknown> | null;
}

interface ProfileRow {
  user_id: string;
  email: string | null;
  display_name: string | null;
}

function rangeStart(range: Range): string | null {
  if (range === "all") return null;
  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

function fmtUsd(n: number): string {
  return `$${n.toFixed(2)}`;
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export default function ApiUsage() {
  const { isAdmin, loading: authLoading } = useAuth();
  const [range, setRange] = useState<Range>("30d");
  const [rows, setRows] = useState<UsageRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ProfileRow>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      let q = supabase
        .from("anthropic_usage_log")
        .select("id, created_at, user_id, function_name, model, input_tokens, cache_creation_tokens, cache_read_tokens, output_tokens, cost_usd, metadata")
        .order("created_at", { ascending: false })
        .limit(5000);

      const start = rangeStart(range);
      if (start) q = q.gte("created_at", start);

      const { data, error: err } = await q;
      if (cancelled) return;
      if (err) {
        setError(err.message);
        setLoading(false);
        return;
      }

      const usageRows = (data ?? []) as UsageRow[];
      setRows(usageRows);

      // Fetch profile info for any user_ids we see (admin can read all profiles via existing RLS).
      const uniqueUserIds = Array.from(new Set(usageRows.map(r => r.user_id).filter((u): u is string => !!u)));
      if (uniqueUserIds.length > 0) {
        const { data: profileData } = await supabase
          .from("profiles")
          .select("user_id, email, display_name")
          .in("user_id", uniqueUserIds);
        if (!cancelled && profileData) {
          const map: Record<string, ProfileRow> = {};
          for (const p of profileData as ProfileRow[]) map[p.user_id] = p;
          setProfiles(map);
        }
      }

      setLoading(false);
    }

    load();
    return () => { cancelled = true; };
  }, [isAdmin, range]);

  const totals = useMemo(() => {
    let cost = 0;
    let input = 0;
    let cacheCreate = 0;
    let cacheRead = 0;
    let output = 0;
    for (const r of rows) {
      cost += Number(r.cost_usd) || 0;
      input += r.input_tokens;
      cacheCreate += r.cache_creation_tokens;
      cacheRead += r.cache_read_tokens;
      output += r.output_tokens;
    }
    return { cost, input, cacheCreate, cacheRead, output, calls: rows.length };
  }, [rows]);

  const byModel = useMemo(() => {
    const map = new Map<string, { cost: number; calls: number }>();
    for (const r of rows) {
      const cur = map.get(r.model) ?? { cost: 0, calls: 0 };
      cur.cost += Number(r.cost_usd) || 0;
      cur.calls += 1;
      map.set(r.model, cur);
    }
    return Array.from(map.entries())
      .map(([model, v]) => ({ model, ...v }))
      .sort((a, b) => b.cost - a.cost);
  }, [rows]);

  const byFunction = useMemo(() => {
    const map = new Map<string, { cost: number; calls: number }>();
    for (const r of rows) {
      const cur = map.get(r.function_name) ?? { cost: 0, calls: 0 };
      cur.cost += Number(r.cost_usd) || 0;
      cur.calls += 1;
      map.set(r.function_name, cur);
    }
    return Array.from(map.entries())
      .map(([function_name, v]) => ({ function_name, ...v }))
      .sort((a, b) => b.cost - a.cost);
  }, [rows]);

  const byUser = useMemo(() => {
    const map = new Map<string, { cost: number; calls: number }>();
    for (const r of rows) {
      const key = r.user_id ?? "__system__";
      const cur = map.get(key) ?? { cost: 0, calls: 0 };
      cur.cost += Number(r.cost_usd) || 0;
      cur.calls += 1;
      map.set(key, cur);
    }
    return Array.from(map.entries())
      .map(([user_id, v]) => ({ user_id, ...v }))
      .sort((a, b) => b.cost - a.cost);
  }, [rows]);

  const labelForUser = (uid: string): string => {
    if (uid === "__system__") return "System / background";
    const p = profiles[uid];
    return p?.email ?? p?.display_name ?? uid.slice(0, 8);
  };

  if (authLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  return (
    <div className="container mx-auto max-w-7xl space-y-6 px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Anthropic API Usage</h1>
          <p className="text-sm text-muted-foreground">
            Per-call token + cost ledger across every edge function calling Claude.
          </p>
        </div>
        <div className="flex gap-1 rounded-md border bg-muted p-1">
          {(["7d", "30d", "90d", "all"] as const).map(r => (
            <Button
              key={r}
              variant={range === r ? "default" : "ghost"}
              size="sm"
              className="h-7 px-3"
              onClick={() => setRange(r)}
            >
              {r === "all" ? "All time" : `Last ${r}`}
            </Button>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <SummaryStat label="Total cost" value={fmtUsd(totals.cost)} />
        <SummaryStat label="API calls" value={totals.calls.toLocaleString()} />
        <SummaryStat label="Output tokens" value={fmtTokens(totals.output)} />
        <SummaryStat
          label="Cache hit rate"
          value={
            totals.cacheCreate + totals.cacheRead > 0
              ? `${((totals.cacheRead / (totals.cacheCreate + totals.cacheRead)) * 100).toFixed(0)}%`
              : "—"
          }
          subtitle={`${fmtTokens(totals.cacheRead)} read / ${fmtTokens(totals.cacheCreate)} written`}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <BreakdownCard title="By model" rows={byModel.map(r => ({ key: r.model, label: r.model, cost: r.cost, calls: r.calls }))} totalCost={totals.cost} />
        <BreakdownCard title="By function" rows={byFunction.map(r => ({ key: r.function_name, label: r.function_name, cost: r.cost, calls: r.calls }))} totalCost={totals.cost} />
        <BreakdownCard
          title="By user"
          rows={byUser.map(r => ({ key: r.user_id, label: labelForUser(r.user_id), cost: r.cost, calls: r.calls }))}
          totalCost={totals.cost}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent calls (latest 100)</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex h-32 items-center justify-center">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Function</TableHead>
                    <TableHead>Model</TableHead>
                    <TableHead className="text-right">Input</TableHead>
                    <TableHead className="text-right">Cache W</TableHead>
                    <TableHead className="text-right">Cache R</TableHead>
                    <TableHead className="text-right">Output</TableHead>
                    <TableHead className="text-right">Cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.slice(0, 100).map(r => (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {new Date(r.created_at).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-xs">{labelForUser(r.user_id ?? "__system__")}</TableCell>
                      <TableCell className="text-xs">{r.function_name}</TableCell>
                      <TableCell className="text-xs">{r.model}</TableCell>
                      <TableCell className="text-right text-xs tabular-nums">{fmtTokens(r.input_tokens)}</TableCell>
                      <TableCell className="text-right text-xs tabular-nums">{fmtTokens(r.cache_creation_tokens)}</TableCell>
                      <TableCell className="text-right text-xs tabular-nums">{fmtTokens(r.cache_read_tokens)}</TableCell>
                      <TableCell className="text-right text-xs tabular-nums">{fmtTokens(r.output_tokens)}</TableCell>
                      <TableCell className="text-right text-xs tabular-nums">{fmtUsd(Number(r.cost_usd))}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryStat({ label, value, subtitle }: { label: string; value: string; subtitle?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
        {subtitle && <div className="text-xs text-muted-foreground mt-1">{subtitle}</div>}
      </CardContent>
    </Card>
  );
}

interface BreakdownRow { key: string; label: string; cost: number; calls: number }

function BreakdownCard({ title, rows, totalCost }: { title: string; rows: BreakdownRow[]; totalCost: number }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.length === 0 && <div className="text-sm text-muted-foreground">No data.</div>}
        {rows.map(r => {
          const pct = totalCost > 0 ? (r.cost / totalCost) * 100 : 0;
          return (
            <div key={r.key} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="truncate">{r.label}</span>
                <span className="tabular-nums text-muted-foreground">
                  {fmtUsd(r.cost)} <span className="ml-1 text-xs">({r.calls})</span>
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded bg-muted">
                <div className="h-full bg-primary" style={{ width: `${Math.min(pct, 100)}%` }} />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
