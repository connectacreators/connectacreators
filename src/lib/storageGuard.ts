import { supabase } from "@/integrations/supabase/client";

// Client-side storage guard. Reads the LIVE storage total from the
// get_storage_total_bytes() RPC (sum of storage.objects — the real-time
// source of truth, unlike Supabase's dashboard number which lags and freezes
// under an over-quota restriction) and blocks uploads before the org hits its
// 100 GB Pro quota. Blocking early (5 GB buffer) means we never actually reach
// 100 GB, so we're never charged overage or hard-restricted.

const GB = 1024 * 1024 * 1024;

export const STORAGE_LIMIT_GB = 100; // Pro plan storage quota (org-wide)
export const STORAGE_WARN_GB = 90; // start warning
export const STORAGE_BLOCK_GB = 95; // refuse new uploads above this (safety buffer)

const LIMIT_BYTES = STORAGE_LIMIT_GB * GB;
const WARN_BYTES = STORAGE_WARN_GB * GB;
const BLOCK_BYTES = STORAGE_BLOCK_GB * GB;

const CACHE_TTL_MS = 30_000;
let cache: { bytes: number; at: number } | null = null;

/** Live total bytes across all buckets. null if it can't be read (guard fails open). */
export async function getStorageBytes(force = false): Promise<number | null> {
  if (!force && cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.bytes;
  try {
    // RPC not in generated types yet — cast to call it.
    const { data, error } = await (supabase as any).rpc("get_storage_total_bytes");
    if (error || data == null) return cache?.bytes ?? null;
    const bytes = Number(data);
    if (!Number.isFinite(bytes)) return cache?.bytes ?? null;
    cache = { bytes, at: Date.now() };
    return bytes;
  } catch {
    return cache?.bytes ?? null;
  }
}

/** Drop the cache so the next read reflects a just-completed upload/delete. */
export function invalidateStorageCache() {
  cache = null;
}

export type StorageLevel = "ok" | "warn" | "block";

export interface StorageStatus {
  bytes: number | null;
  usedGb: number | null;
  limitGb: number;
  pct: number; // 0..100 of the 100 GB quota
  level: StorageLevel;
}

export async function getStorageStatus(force = false): Promise<StorageStatus> {
  const bytes = await getStorageBytes(force);
  if (bytes == null) {
    return { bytes: null, usedGb: null, limitGb: STORAGE_LIMIT_GB, pct: 0, level: "ok" };
  }
  const level: StorageLevel =
    bytes >= BLOCK_BYTES ? "block" : bytes >= WARN_BYTES ? "warn" : "ok";
  return {
    bytes,
    usedGb: bytes / GB,
    limitGb: STORAGE_LIMIT_GB,
    pct: Math.min(100, (bytes / LIMIT_BYTES) * 100),
    level,
  };
}

function fmtGb(bytes: number): string {
  return `${(bytes / GB).toFixed(1)} GB`;
}

/**
 * Call BEFORE starting an upload. Throws a user-facing Error if the upload
 * would push storage past the block ceiling, so the caller's catch surfaces
 * it as a toast. FAILS OPEN: if usage can't be read, the upload proceeds —
 * a monitoring guard must never break the core product.
 *
 * @returns { warn } true when already in the 90–95 GB warning band.
 */
export async function assertUploadAllowed(fileSizeBytes: number): Promise<{ warn: boolean }> {
  const bytes = await getStorageBytes();
  if (bytes == null) return { warn: false }; // fail open
  const projected = bytes + Math.max(0, fileSizeBytes || 0);
  if (projected > BLOCK_BYTES) {
    throw new Error(
      `Storage almost full — ${fmtGb(bytes)} of ${STORAGE_LIMIT_GB} GB used. ` +
        `This upload would cross the ${STORAGE_BLOCK_GB} GB safety limit. ` +
        `Free space first: Editing Queue → Trash → empty it, then retry.`,
    );
  }
  return { warn: bytes >= WARN_BYTES };
}
