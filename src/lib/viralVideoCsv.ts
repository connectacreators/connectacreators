// Shared CSV export logic for viral_videos rows — used by both the bulk
// export (ViralToday.tsx) and the single-video export (ViralVideoDetail.tsx)
// so the two never drift into different column sets/formatting.

export const VIRAL_VIDEO_CSV_HEADERS = [
  "channel_username", "platform", "posted_at", "video_url", "caption",
  "views_count", "likes_count", "comments_count", "engagement_rate",
  "outlier_score", "framework_score", "primary_niche", "content_format",
  "niche_tags", "analysis_status", "hook_text", "cta_text", "transcript",
  "visual_breakdown", "audience", "key_topics", "body_structure",
  "hook_template", "scraped_at",
];

// Quote/escape a single CSV cell. Empty/missing analysis fields export as "None".
export function csvCell(value: unknown): string {
  if (value === null || value === undefined || value === "") return '"None"';
  const s = Array.isArray(value) ? value.join(" | ") : String(value);
  if (s.trim() === "") return '"None"';
  return `"${s.replace(/"/g, '""')}"`;
}

// Plain-value cell (always-present metadata) — does NOT substitute "None".
export function csvNum(value: unknown): string {
  if (value === null || value === undefined) return '""';
  return `"${String(value).replace(/"/g, '""')}"`;
}

// Flatten framework_meta.visual_segments into a readable, single-cell breakdown.
export function visualBreakdownForCsv(meta: any): string {
  const segments = (meta?.visual_segments ?? []) as Array<{
    start?: number; end?: number; description?: string; text_on_screen?: string[];
  }>;
  if (!Array.isArray(segments) || segments.length === 0) return "";
  return segments
    .map((s) => {
      const start = typeof s.start === "number" ? s.start.toFixed(1) : "?";
      const end = typeof s.end === "number" ? s.end.toFixed(1) : "?";
      const text = (s.text_on_screen ?? []).length ? ` | text: ${(s.text_on_screen ?? []).join(" / ")}` : "";
      return `[${start}s–${end}s] ${s.description ?? ""}${text}`;
    })
    .join("\n");
}

// A viral_videos row plus the (sometimes separately-fetched) analysis columns
// used to build one CSV row. `analysis` defaults to reading straight off `v`
// when the caller already has the full row (e.g. a single-video detail page
// that fetched via select("*")) rather than needing a merged lookup.
export function buildViralVideoCsvRow(v: Record<string, any>, analysis?: Record<string, any>): string {
  const a = analysis ?? v;
  const fm = a.framework_meta ?? v.framework_meta ?? {};
  return [
    csvNum(v.channel_username),
    csvNum(v.platform),
    csvNum(v.posted_at),
    csvNum(v.video_url),
    csvCell(v.caption),
    csvNum(v.views_count),
    csvNum(v.likes_count),
    csvNum(v.comments_count),
    csvNum(v.engagement_rate),
    csvNum(v.outlier_score),
    csvNum(v.framework_score),
    csvCell(v.primary_niche),
    csvCell(v.content_format),
    csvCell(v.niche_tags),
    csvCell(a.analysis_status ?? v.analysis_status),
    csvCell(a.hook_text),
    csvCell(a.cta_text),
    csvCell(a.transcript),
    csvCell(visualBreakdownForCsv(fm)),
    csvCell(fm.audience),
    csvCell(fm.key_topics),
    csvCell(fm.body_structure),
    csvCell(fm.hook_template),
    csvNum(v.scraped_at),
  ].join(",");
}

export function buildViralVideoCsv(rows: Record<string, any>[], analysisById?: Map<string, any>): string {
  const lines = [VIRAL_VIDEO_CSV_HEADERS.map((h) => csvNum(h)).join(",")];
  for (const v of rows) {
    lines.push(buildViralVideoCsvRow(v, analysisById?.get(v.id)));
  }
  // UTF-8 BOM so Excel renders Spanish accents correctly.
  return "﻿" + lines.join("\r\n");
}

// Triggers a browser download of a CSV string via a temporary anchor tag.
export function downloadCsvFile(csv: string, filename: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
