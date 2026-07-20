import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, RefreshCw, AlertTriangle, HardDrive } from "lucide-react";

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
import { STORAGE_WARN_GB, STORAGE_BLOCK_GB } from "@/lib/storageGuard";

const GB = 1024 * 1024 * 1024;

interface BucketRow { bucket: string; bytes: number; files: number }
interface ClientRow { client: string; bytes: number; files: number }
interface TopEdit { title: string | null; client: string; status: string | null; bytes: number }

interface StorageReport {
  total_bytes: number;
  limit_bytes: number;
  reclaimable_bytes: number;
  by_bucket: BucketRow[];
  by_client: ClientRow[];
  by_state: Record<string, number>;
  top_edits: TopEdit[];
  generated_at: string;
}

function fmtGB(bytes: number): string {
  const gb = bytes / GB;
  if (gb < 1) return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
  return `${gb.toFixed(1)} GB`;
}

export function StorageUsageTab() {
  const [report, setReport] = useState<StorageReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    // RPC not in generated types yet — cast to call it.
    const { data, error: err } = await (supabase as any).rpc("get_storage_report");
    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }
    setReport(data as unknown as StorageReport);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && !report) {
    return (
      <div className="flex h-48 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
        {error}
      </div>
    );
  }
  if (!report) return null;

  const limitGb = report.limit_bytes / GB;
  const usedGb = report.total_bytes / GB;
  const pct = Math.min(100, (report.total_bytes / report.limit_bytes) * 100);
  const level: "ok" | "warn" | "block" =
    usedGb >= STORAGE_BLOCK_GB ? "block" : usedGb >= STORAGE_WARN_GB ? "warn" : "ok";

  const barColor =
    level === "block" ? "bg-destructive" : level === "warn" ? "bg-amber-500" : "bg-emerald-500";
  const textColor =
    level === "block" ? "text-destructive" : level === "warn" ? "text-amber-500" : "text-emerald-500";

  const totalForBars = report.total_bytes || 1;

  return (
    <div className="space-y-6">
      {/* Quota gauge */}
      <Card>
        <CardContent className="p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="flex items-center gap-3">
              <HardDrive className={`size-5 ${textColor}`} />
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  Storage used (live)
                </div>
                <div className="mt-0.5 text-3xl font-semibold tabular-nums">
                  {usedGb.toFixed(1)}{" "}
                  <span className="text-lg font-normal text-muted-foreground">
                    / {limitGb.toFixed(0)} GB
                  </span>
                </div>
              </div>
            </div>
            <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={load} disabled={loading}>
              <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>

          <div className="mt-4 h-3 w-full overflow-hidden rounded-full bg-muted">
            <div className={`h-full rounded-full ${barColor} transition-all`} style={{ width: `${pct}%` }} />
          </div>
          <div className="mt-1.5 flex justify-between text-[11px] text-muted-foreground">
            <span>{pct.toFixed(0)}% of quota</span>
            <span>Warn {STORAGE_WARN_GB} GB · Uploads blocked {STORAGE_BLOCK_GB} GB</span>
          </div>

          {level !== "ok" && (
            <div
              className={`mt-4 flex items-start gap-2 rounded-md border p-3 text-sm ${
                level === "block"
                  ? "border-destructive/30 bg-destructive/10 text-destructive"
                  : "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"
              }`}
            >
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <div>
                {level === "block"
                  ? `Storage is at the ${STORAGE_BLOCK_GB} GB safety limit — new uploads are blocked until you free space.`
                  : `Storage is past ${STORAGE_WARN_GB} GB. Free space soon — uploads are blocked at ${STORAGE_BLOCK_GB} GB.`}{" "}
                <Link to="/editing-queue" className="font-medium underline underline-offset-2">
                  Open Editing Queue → Trash
                </Link>{" "}
                and empty it to reclaim space.
              </div>
            </div>
          )}

          {report.reclaimable_bytes > 0 && (
            <div className="mt-3 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{fmtGB(report.reclaimable_bytes)}</span>{" "}
              is reclaimable now (footage in Archived + Trashed edits). Empty the Editing Queue trash to free it.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Footage lifecycle split */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StateStat label="Active footage" bytes={report.by_state.active ?? 0} tone="foreground" />
        <StateStat label="Archived footage" bytes={report.by_state.archived ?? 0} tone="amber" />
        <StateStat label="Trashed footage" bytes={report.by_state.trashed ?? 0} tone="destructive" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <BreakdownCard
          title="By bucket"
          rows={report.by_bucket.map((b) => ({ key: b.bucket, label: b.bucket, bytes: b.bytes, sub: `${b.files} files` }))}
          total={totalForBars}
        />
        <BreakdownCard
          title="Footage by client"
          rows={report.by_client.map((c) => ({ key: c.client, label: c.client, bytes: c.bytes, sub: `${c.files} files` }))}
          total={totalForBars}
        />
      </div>

      {/* Heaviest edits */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Heaviest edits (top 15)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Footage</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.top_edits.map((e, i) => (
                  <TableRow key={i}>
                    <TableCell className="max-w-[24rem] truncate text-xs">{e.title || "—"}</TableCell>
                    <TableCell className="text-xs">{e.client}</TableCell>
                    <TableCell className="text-xs">{e.status || "—"}</TableCell>
                    <TableCell className="text-right text-xs tabular-nums">{fmtGB(e.bytes)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <p className="text-[11px] text-muted-foreground">
        Live from Supabase storage (updated {new Date(report.generated_at).toLocaleString()}). This is the
        real figure — Supabase's own dashboard number can lag up to an hour.
      </p>
    </div>
  );
}

function StateStat({ label, bytes, tone }: { label: string; bytes: number; tone: "foreground" | "amber" | "destructive" }) {
  const color =
    tone === "amber" ? "text-amber-500" : tone === "destructive" ? "text-destructive" : "text-foreground";
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className={`mt-1 text-2xl font-semibold tabular-nums ${color}`}>{fmtGB(bytes)}</div>
      </CardContent>
    </Card>
  );
}

interface BRow { key: string; label: string; bytes: number; sub: string }

function BreakdownCard({ title, rows, total }: { title: string; rows: BRow[]; total: number }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2.5">
        {rows.length === 0 && <div className="text-sm text-muted-foreground">No data.</div>}
        {rows.map((r) => {
          const pct = total > 0 ? (r.bytes / total) * 100 : 0;
          return (
            <div key={r.key} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="truncate">{r.label}</span>
                <span className="tabular-nums text-muted-foreground">
                  {fmtGB(r.bytes)} <span className="ml-1 text-xs">({r.sub})</span>
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
