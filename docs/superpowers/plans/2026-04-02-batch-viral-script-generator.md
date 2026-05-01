# Batch Viral Script Generator — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Select multiple viral videos in Viral Today, generate scripts for all of them via Anthropic Batch API using canvas client context, and place completed scripts as nodes in the Super Planning Canvas.

**Architecture:** Multi-select checkboxes on VideoCard → floating action bar → BatchScriptModal (client picker + credit check) → `batch-generate-scripts` edge function (reads canvas context, submits batch) → frontend polls `batch-poll-scripts` → on completion, poll function writes ScriptBatchNode entries to canvas_states → toast notification with link to canvas.

**Tech Stack:** React 18, ReactFlow, Tailwind CSS, Supabase (edge functions + Postgres), Anthropic Batch API, Framer Motion, Sonner (toasts), Lucide icons.

---

## File Structure

### Create
- `src/components/canvas/ScriptBatchNode.tsx` — Compact ReactFlow canvas node showing batch-generated script with thumbnail, metadata, expand toggle
- `src/components/BatchScriptModal.tsx` — Modal for selecting client, previewing videos, checking credits, triggering batch generation + background polling

### Modify
- `src/pages/ViralToday.tsx` — Add multi-select checkboxes to VideoCard, selectedVideos state, floating action bar
- `src/pages/SuperPlanningCanvas.tsx` — Register `scriptBatchNode` type in nodeTypes, add to addNode union type
- `supabase/functions/batch-generate-scripts/index.ts` — Accept `videos[]` input alongside existing `topics[]`, extract canvas context, build video-aware prompts
- `supabase/functions/batch-poll-scripts/index.ts` — On batch completion with `sessionId`, write ScriptBatchNode entries to canvas_states

---

## Task 1: Create ScriptBatchNode Canvas Component

**Files:**
- Create: `src/components/canvas/ScriptBatchNode.tsx`

This is a compact ReactFlow custom node that displays a batch-generated script. It shows the source video thumbnail, script title, source metadata, a preview, and an expand toggle to see the full script.

- [ ] **Step 1: Create ScriptBatchNode component**

```tsx
// src/components/canvas/ScriptBatchNode.tsx
import { memo, useState } from "react";
import { type NodeProps, NodeResizer } from "@xyflow/react";
import { ChevronDown, ChevronUp, ExternalLink, Instagram, Youtube } from "lucide-react";

// TikTok icon (matches ViralToday pattern — lucide doesn't have TikTok)
function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 00-.79-.05A6.34 6.34 0 003.15 15a6.34 6.34 0 0010.86-4.43v-7a8.16 8.16 0 004.77 1.52v-3.4h-.19z" />
    </svg>
  );
}

const PLATFORM_ICON: Record<string, React.ElementType> = {
  instagram: Instagram,
  tiktok: TikTokIcon,
  youtube: Youtube,
};

interface ScriptBatchData {
  script: {
    lines: { line_type: string; section: string; text: string }[];
    idea_ganadora: string;
    target: string;
    formato: string;
    virality_score: number;
  } | null;
  videoThumbnail: string | null;
  videoUrl: string | null;
  videoCaption: string | null;
  ownerUsername: string | null;
  outlierScore: number | null;
  platform: string | null;
  onUpdate?: (updates: Partial<ScriptBatchData>) => void;
  onDelete?: () => void;
}

function proxyImg(url: string | null): string | null {
  if (!url) return null;
  if (url.includes("connectacreators.com/thumb-cache")) return url;
  if (url.includes("cdninstagram.com") || url.includes("fbcdn.net")) {
    return `https://connectacreators.com/api/proxy-image?url=${encodeURIComponent(url)}`;
  }
  return url;
}

const ScriptBatchNode = memo(({ data, selected }: NodeProps) => {
  const d = data as ScriptBatchData;
  const [expanded, setExpanded] = useState(false);
  const [imgError, setImgError] = useState(false);

  const PlatformIcon = PLATFORM_ICON[d.platform || "instagram"] ?? Instagram;
  const title = d.script?.idea_ganadora || "Batch Script";
  const previewLines = d.script?.lines?.slice(0, 2).map((l) => l.text).join(" ") || "";
  const fullScript = d.script?.lines?.map((l) => {
    const prefix = l.section === "hook" ? "HOOK: " : l.section === "cta" ? "CTA: " : "";
    return `${prefix}${l.text}`;
  }).join("\n") || "";

  return (
    <div
      className="rounded-xl shadow-lg relative overflow-hidden"
      style={{
        width: 260,
        background: "#18181b",
        border: selected ? "1.5px solid #06b6d4" : "1px solid #27272a",
        borderLeft: "4px solid #06b6d4",
      }}
    >
      <NodeResizer
        minWidth={220}
        minHeight={100}
        handleStyle={{ width: 8, height: 8, borderRadius: 4 }}
      />

      {/* Drag handle + delete */}
      <div
        className="drag-handle flex items-center justify-between px-3 py-2"
        style={{ cursor: "grab", borderBottom: "1px solid #27272a" }}
      >
        <div className="flex items-center gap-1.5">
          <div
            className="w-2 h-2 rounded-full"
            style={{ background: "#06b6d4" }}
          />
          <span
            style={{ fontSize: 10, color: "#06b6d4", fontWeight: 600 }}
          >
            BATCH SCRIPT
          </span>
        </div>
        {d.onDelete && (
          <button
            onClick={d.onDelete}
            className="text-zinc-500 hover:text-red-400 transition-colors"
            style={{ fontSize: 11 }}
          >
            ✕
          </button>
        )}
      </div>

      {/* Thumbnail */}
      {d.videoThumbnail && !imgError ? (
        <div style={{ width: "100%", height: 100, overflow: "hidden", position: "relative" }}>
          <img
            src={proxyImg(d.videoThumbnail) ?? d.videoThumbnail}
            alt={title}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
            onError={() => setImgError(true)}
          />
          {/* Platform badge */}
          <div
            className="absolute top-1.5 left-1.5 w-5 h-5 rounded-full flex items-center justify-center"
            style={{ background: "rgba(0,0,0,0.6)", border: "1px solid rgba(255,255,255,0.1)" }}
          >
            <PlatformIcon className="w-2.5 h-2.5 text-white/80" />
          </div>
        </div>
      ) : (
        <div
          className="flex items-center justify-center"
          style={{ width: "100%", height: 60, background: "#27272a" }}
        >
          <PlatformIcon className="w-5 h-5 text-zinc-500" />
        </div>
      )}

      {/* Content */}
      <div className="px-3 py-2">
        {/* Title */}
        <p style={{ fontSize: 13, fontWeight: 600, color: "#fafafa", marginBottom: 4 }}>
          {title}
        </p>

        {/* Source metadata */}
        <div className="flex items-center gap-1.5" style={{ marginBottom: 6 }}>
          {d.ownerUsername && (
            <span style={{ fontSize: 10, color: "#71717a" }}>
              @{d.ownerUsername}
            </span>
          )}
          {d.outlierScore != null && (
            <>
              <span style={{ fontSize: 10, color: "#3f3f46" }}>·</span>
              <span style={{ fontSize: 10, color: "#71717a" }}>
                {d.outlierScore >= 10 ? Math.round(d.outlierScore) : d.outlierScore.toFixed(1)}x
              </span>
            </>
          )}
          {d.script?.virality_score != null && (
            <>
              <span style={{ fontSize: 10, color: "#3f3f46" }}>·</span>
              <span style={{ fontSize: 10, color: "#06b6d4" }}>
                {d.script.virality_score.toFixed(1)} virality
              </span>
            </>
          )}
        </div>

        {/* Preview or full script */}
        {expanded ? (
          <pre
            style={{
              fontSize: 11,
              color: "#a1a1aa",
              lineHeight: 1.5,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              maxHeight: 300,
              overflowY: "auto",
              marginBottom: 6,
              fontFamily: "inherit",
            }}
          >
            {fullScript}
          </pre>
        ) : (
          <p
            style={{
              fontSize: 11,
              color: "#a1a1aa",
              lineHeight: 1.4,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
              marginBottom: 6,
            }}
          >
            "{previewLines}"
          </p>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 hover:opacity-80 transition-opacity"
            style={{ fontSize: 11, color: "#06b6d4", background: "none", border: "none", cursor: "pointer", padding: 0 }}
          >
            {expanded ? (
              <>
                Collapse <ChevronUp className="w-3 h-3" />
              </>
            ) : (
              <>
                Expand script <ChevronDown className="w-3 h-3" />
              </>
            )}
          </button>

          {d.videoUrl && (
            <a
              href={d.videoUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: 11, color: "#71717a" }}
              className="hover:text-white transition-colors"
            >
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
});

ScriptBatchNode.displayName = "ScriptBatchNode";
export default ScriptBatchNode;
```

- [ ] **Step 2: Verify the component has no import errors**

Run: `cd /Users/admin/Desktop/connectacreators && npx tsc --noEmit src/components/canvas/ScriptBatchNode.tsx 2>&1 | head -20`

Expected: No errors (or only project-wide errors unrelated to this file).

- [ ] **Step 3: Commit**

```bash
git add src/components/canvas/ScriptBatchNode.tsx
git commit -m "feat: add ScriptBatchNode canvas component for batch-generated scripts"
```

---

## Task 2: Register ScriptBatchNode in SuperPlanningCanvas

**Files:**
- Modify: `src/pages/SuperPlanningCanvas.tsx`

Register the new node type so ReactFlow can render it when canvas state contains `scriptBatchNode` nodes.

- [ ] **Step 1: Add import for ScriptBatchNode**

At the top of `src/pages/SuperPlanningCanvas.tsx`, after the existing canvas node imports (around line 18, after the `AnnotationNode` import), add:

```typescript
import ScriptBatchNode from "@/components/canvas/ScriptBatchNode";
```

- [ ] **Step 2: Register in nodeTypes object**

In the `nodeTypes` object (around line 80), add `scriptBatchNode` after the `annotationNode` entry:

```typescript
const nodeTypes = {
  videoNode: VideoNode,
  textNoteNode: TextNoteNode,
  researchNoteNode: ResearchNoteNode,
  aiAssistantNode: AIAssistantNode,
  hookGeneratorNode: HookGeneratorNode,
  brandGuideNode: BrandGuideNode,
  ctaBuilderNode: CTABuilderNode,
  instagramProfileNode: CompetitorProfileNode,
  competitorProfileNode: CompetitorProfileNode,
  mediaNode: MediaNode,
  groupNode: GroupNode,
  annotationNode: AnnotationNode,
  scriptBatchNode: ScriptBatchNode,  // ← ADD THIS LINE
};
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/SuperPlanningCanvas.tsx
git commit -m "feat: register ScriptBatchNode type in canvas nodeTypes"
```

---

## Task 3: Create BatchScriptModal Component

**Files:**
- Create: `src/components/BatchScriptModal.tsx`

Modal shown after clicking "Generate Scripts" in the floating action bar. Fetches clients, shows thumbnail strip, credit estimate, and triggers batch generation + background polling.

- [ ] **Step 1: Create BatchScriptModal component**

```tsx
// src/components/BatchScriptModal.tsx
import { useState, useEffect, useCallback, useRef } from "react";
import { X, Loader2, AlertCircle, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

interface ViralVideo {
  id: string;
  channel_id: string;
  channel_username: string;
  platform: string;
  video_url: string | null;
  thumbnail_url: string | null;
  caption: string | null;
  views_count: number;
  likes_count: number;
  comments_count: number;
  engagement_rate: number;
  outlier_score: number;
  posted_at: string | null;
  scraped_at: string;
  apify_video_id: string | null;
}

interface Client {
  id: string;
  name: string;
  credits_balance: number | null;
}

interface BatchScriptModalProps {
  open: boolean;
  onClose: () => void;
  selectedVideos: Map<string, ViralVideo>;
  onRemoveVideo: (id: string) => void;
}

const CREDIT_COST_PER_SCRIPT = 25;
const POLL_INTERVAL_MS = 15_000;

function proxyImg(url: string | null): string | null {
  if (!url) return null;
  if (url.includes("connectacreators.com/thumb-cache")) return url;
  if (url.includes("cdninstagram.com") || url.includes("fbcdn.net")) {
    return `https://connectacreators.com/api/proxy-image?url=${encodeURIComponent(url)}`;
  }
  return url;
}

export default function BatchScriptModal({ open, onClose, selectedVideos, onRemoveVideo }: BatchScriptModalProps) {
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [loadingClients, setLoadingClients] = useState(false);
  const [generating, setGenerating] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const navigate = useNavigate();

  // Fetch clients on mount
  useEffect(() => {
    if (!open) return;
    setLoadingClients(true);
    supabase
      .from("clients")
      .select("id, name, credits_balance")
      .order("name")
      .then(({ data }) => {
        setClients((data ?? []) as Client[]);
        setLoadingClients(false);
      });
  }, [open]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const videoCount = selectedVideos.size;
  const totalCredits = videoCount * CREDIT_COST_PER_SCRIPT;
  const selectedClient = clients.find((c) => c.id === selectedClientId);
  const hasEnoughCredits = !selectedClient || (selectedClient.credits_balance ?? 0) >= totalCredits;

  const handleGenerate = useCallback(async () => {
    if (!selectedClientId || videoCount < 2) return;
    setGenerating(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("Not authenticated");

      const videos = Array.from(selectedVideos.values()).map((v) => ({
        id: v.id,
        caption: v.caption,
        video_url: v.video_url,
        thumbnail_url: v.thumbnail_url,
        views_count: v.views_count,
        outlier_score: v.outlier_score,
        engagement_rate: v.engagement_rate,
        owner_username: v.channel_username,
        platform: v.platform,
      }));

      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
      const headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      };

      // Submit batch
      const res = await fetch(`${SUPABASE_URL}/functions/v1/batch-generate-scripts`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          videos,
          clientId: selectedClientId,
          language: "en",
          format: "talking_head",
        }),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({ error: "Request failed" }));
        if (errBody.insufficient_credits) {
          toast.error(`Not enough credits. Need ${errBody.needed}, have ${errBody.balance}.`);
          setGenerating(false);
          return;
        }
        throw new Error(errBody.error || `HTTP ${res.status}`);
      }

      const { batchId, videoMap } = await res.json();
      toast.success(`Batch started — ${videoCount} scripts generating in background`);

      // Close modal immediately
      onClose();
      setGenerating(false);

      // Start background polling
      pollRef.current = setInterval(async () => {
        try {
          const pollRes = await fetch(`${SUPABASE_URL}/functions/v1/batch-poll-scripts`, {
            method: "POST",
            headers,
            body: JSON.stringify({
              batchId,
              videoMap,
              clientId: selectedClientId,
            }),
          });

          if (!pollRes.ok) return;
          const pollData = await pollRes.json();

          if (pollData.status === "done") {
            if (pollRef.current) clearInterval(pollRef.current);
            pollRef.current = null;

            const succeeded = pollData.results?.filter((r: any) => r.script) ?? [];
            const failed = pollData.results?.filter((r: any) => r.error) ?? [];
            const clientName = selectedClient?.name || "client";

            if (failed.length === 0) {
              toast.success(`${succeeded.length} scripts added to ${clientName} canvas`, {
                action: {
                  label: "Open Canvas →",
                  onClick: () => navigate(`/canvas?client=${selectedClientId}`),
                },
              });
            } else {
              toast.success(
                `${succeeded.length}/${videoCount} scripts generated. ${failed.length} failed.`,
                {
                  action: {
                    label: "Open Canvas →",
                    onClick: () => navigate(`/canvas?client=${selectedClientId}`),
                  },
                }
              );
            }
          }
        } catch {
          // Silent poll failure — will retry
        }
      }, POLL_INTERVAL_MS);
    } catch (e: any) {
      toast.error(e.message || "Failed to start batch generation");
      setGenerating(false);
    }
  }, [selectedClientId, selectedVideos, videoCount, onClose, selectedClient, navigate]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div
        className="relative rounded-2xl shadow-2xl border overflow-hidden"
        style={{
          background: "#18181b",
          borderColor: "#27272a",
          width: "min(520px, 92vw)",
          maxHeight: "85vh",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: "1px solid #27272a" }}
        >
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: "#fafafa" }}>
              Generate Batch Scripts
            </h2>
            <p style={{ fontSize: 12, color: "#71717a", marginTop: 2 }}>
              {videoCount} video{videoCount !== 1 ? "s" : ""} selected
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-zinc-800 transition-colors"
          >
            <X className="w-4 h-4 text-zinc-400" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-5 overflow-y-auto" style={{ maxHeight: "calc(85vh - 140px)" }}>
          {/* Client picker */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#a1a1aa", display: "block", marginBottom: 6 }}>
              Client
            </label>
            {loadingClients ? (
              <div className="flex items-center gap-2" style={{ color: "#71717a", fontSize: 12 }}>
                <Loader2 className="w-3 h-3 animate-spin" /> Loading clients…
              </div>
            ) : (
              <select
                value={selectedClientId}
                onChange={(e) => setSelectedClientId(e.target.value)}
                className="w-full h-9 rounded-lg px-3 text-sm"
                style={{
                  background: "#27272a",
                  border: "1px solid #3f3f46",
                  color: "#fafafa",
                  outline: "none",
                }}
              >
                <option value="">Select a client…</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Thumbnail strip */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#a1a1aa", display: "block", marginBottom: 6 }}>
              Selected Videos
            </label>
            <div className="flex gap-2 overflow-x-auto pb-2" style={{ scrollbarWidth: "thin" }}>
              {Array.from(selectedVideos.values()).map((v) => (
                <div
                  key={v.id}
                  className="relative flex-shrink-0 rounded-lg overflow-hidden group"
                  style={{ width: 64, height: 80, background: "#27272a" }}
                >
                  {v.thumbnail_url ? (
                    <img
                      src={proxyImg(v.thumbnail_url) ?? v.thumbnail_url}
                      alt={v.channel_username}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <span style={{ fontSize: 10, color: "#71717a" }}>No img</span>
                    </div>
                  )}
                  {/* Remove button */}
                  <button
                    onClick={() => onRemoveVideo(v.id)}
                    className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ background: "rgba(0,0,0,0.7)", border: "1px solid rgba(255,255,255,0.2)" }}
                  >
                    <X className="w-2.5 h-2.5 text-white" />
                  </button>
                  {/* Username */}
                  <div
                    className="absolute bottom-0 left-0 right-0 text-center truncate"
                    style={{ fontSize: 8, color: "#e4e4e7", background: "rgba(0,0,0,0.7)", padding: "1px 2px" }}
                  >
                    @{v.channel_username}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Credit estimate */}
          <div
            className="flex items-center gap-2 rounded-lg px-3 py-2.5"
            style={{
              background: hasEnoughCredits ? "rgba(6,182,212,0.08)" : "rgba(239,68,68,0.08)",
              border: `1px solid ${hasEnoughCredits ? "rgba(6,182,212,0.2)" : "rgba(239,68,68,0.2)"}`,
            }}
          >
            {hasEnoughCredits ? (
              <Info className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#06b6d4" }} />
            ) : (
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#ef4444" }} />
            )}
            <span style={{ fontSize: 12, color: hasEnoughCredits ? "#06b6d4" : "#ef4444" }}>
              {hasEnoughCredits
                ? `This will use ~${totalCredits} credits (${videoCount} scripts × ${CREDIT_COST_PER_SCRIPT} credits each)`
                : `Not enough credits. Need ${totalCredits}, have ${selectedClient?.credits_balance ?? 0}.`}
            </span>
          </div>

          {/* Info about canvas context */}
          <div className="flex items-start gap-2 rounded-lg px-3 py-2.5" style={{ background: "#1f1f23" }}>
            <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: "#71717a" }} />
            <span style={{ fontSize: 11, color: "#71717a", lineHeight: 1.5 }}>
              Scripts will use context from the client's most recent canvas session (text notes, brand info).
              Results will be added as nodes to that canvas automatically.
            </span>
          </div>
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-end gap-3 px-5 py-4"
          style={{ borderTop: "1px solid #27272a" }}
        >
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            style={{ color: "#a1a1aa", background: "#27272a", border: "1px solid #3f3f46" }}
          >
            Cancel
          </button>
          <button
            onClick={handleGenerate}
            disabled={!selectedClientId || videoCount < 2 || !hasEnoughCredits || generating}
            className="px-4 py-2 rounded-lg text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background: "#06b6d4",
              color: "#000",
              border: "1px solid #06b6d4",
            }}
          >
            {generating ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Submitting…
              </span>
            ) : (
              "Generate in Background"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/BatchScriptModal.tsx
git commit -m "feat: add BatchScriptModal for batch script generation with client picker"
```

---

## Task 4: Add Multi-Select + Floating Action Bar to ViralToday

**Files:**
- Modify: `src/pages/ViralToday.tsx`

Add checkbox selection to VideoCard (admin only), a `selectedVideos` state Map, and a floating action bar that appears when 2+ videos are selected.

- [ ] **Step 1: Add imports**

At the top of `src/pages/ViralToday.tsx`, add the lazy import for BatchScriptModal after the existing imports (around line 18):

```typescript
import { CheckSquare } from "lucide-react";
const BatchScriptModal = lazy(() => import("@/components/BatchScriptModal"));
```

Note: `CheckSquare` is added to the existing lucide-react import. `lazy` is already imported from React on line 1.

- [ ] **Step 2: Add selectedVideos state**

Inside the `ViralToday` component function, after the existing state declarations (around line 760, near the other `useState` calls), add:

```typescript
const [selectedVideos, setSelectedVideos] = useState<Map<string, ViralVideo>>(new Map());
const [showBatchModal, setShowBatchModal] = useState(false);
```

- [ ] **Step 3: Add toggle handler**

After the state declarations, add the toggle function:

```typescript
const toggleVideoSelect = useCallback((video: ViralVideo) => {
  setSelectedVideos((prev) => {
    const next = new Map(prev);
    if (next.has(video.id)) {
      next.delete(video.id);
    } else {
      if (next.size >= 10) {
        toast.error("Maximum 10 videos per batch");
        return prev;
      }
      next.set(video.id, video);
    }
    return next;
  });
}, []);
```

- [ ] **Step 4: Update VideoCard props and add checkbox**

Modify the `VideoCard` function signature to accept new props:

```typescript
function VideoCard({
  video, isAdmin, onDelete, selected, onToggleSelect,
}: {
  video: ViralVideo;
  isAdmin?: boolean;
  onDelete?: (id: string) => void;
  selected?: boolean;
  onToggleSelect?: (video: ViralVideo) => void;
}) {
```

Inside the VideoCard thumbnail area, after the existing platform icon div (`<div className="absolute top-2 left-2 ...">`) and before the top-right icon, add the checkbox overlay. Replace the entire `{/* Top-left: platform icon (always) */}` block with:

```tsx
{/* Top-left: platform icon + admin checkbox overlay */}
<div className="absolute top-2 left-2 z-10">
  {isAdmin && onToggleSelect ? (
    <button
      onClick={(e) => { e.stopPropagation(); onToggleSelect(video); }}
      className={cn(
        "w-6 h-6 rounded-md flex items-center justify-center border transition-all",
        selected
          ? "bg-cyan-500 border-cyan-400"
          : "bg-black/60 backdrop-blur-sm border-white/10 opacity-0 group-hover:opacity-100"
      )}
    >
      {selected ? (
        <CheckSquare className="w-3.5 h-3.5 text-white" />
      ) : (
        <PlatformIcon className="w-3 h-3 text-white/80" />
      )}
    </button>
  ) : (
    <div className="w-6 h-6 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center border border-white/10">
      <PlatformIcon className="w-3 h-3 text-white/80" />
    </div>
  )}
</div>
```

Also add a cyan border to the card when selected. On the outer `<motion.div>`, update the className:

```tsx
className={cn(
  "group relative flex flex-col rounded-xl overflow-hidden bg-card border hover:border-border transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg",
  selected ? "border-cyan-500 ring-1 ring-cyan-500/30" : "border-border"
)}
```

- [ ] **Step 5: Update VideoCard call site to pass new props**

In the video grid render section (around line 1516), update the `<VideoCard>` call:

```tsx
<VideoCard
  key={v.id}
  video={v}
  isAdmin={isAdmin}
  onDelete={(id) => setVideos((prev) => prev.filter((x) => x.id !== id))}
  selected={selectedVideos.has(v.id)}
  onToggleSelect={toggleVideoSelect}
/>
```

- [ ] **Step 6: Add floating action bar + BatchScriptModal**

Right before the closing `</PageTransition>` tag (around line 1730), add the floating action bar and modal:

```tsx
{/* Floating action bar — visible when 2+ videos selected (admin only) */}
<AnimatePresence>
  {isAdmin && selectedVideos.size >= 2 && (
    <motion.div
      initial={{ y: 80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 80, opacity: 0 }}
      transition={{ type: "spring", damping: 25, stiffness: 300 }}
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-4 px-5 py-3 rounded-2xl shadow-2xl"
      style={{
        background: "rgba(24,24,27,0.85)",
        backdropFilter: "blur(12px)",
        border: "1px solid rgba(63,63,70,0.5)",
      }}
    >
      <span style={{ fontSize: 13, color: "#a1a1aa" }}>
        <span style={{ color: "#06b6d4", fontWeight: 700 }}>{selectedVideos.size}</span> videos selected
      </span>
      <button
        onClick={() => setShowBatchModal(true)}
        className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all hover:brightness-110"
        style={{ background: "#06b6d4", color: "#000" }}
      >
        Generate Scripts →
      </button>
      <button
        onClick={() => setSelectedVideos(new Map())}
        style={{ fontSize: 12, color: "#71717a", background: "none", border: "none", cursor: "pointer" }}
        className="hover:text-white transition-colors"
      >
        Clear
      </button>
    </motion.div>
  )}
</AnimatePresence>

{/* Batch Script Modal */}
<Suspense fallback={null}>
  {showBatchModal && (
    <BatchScriptModal
      open={showBatchModal}
      onClose={() => setShowBatchModal(false)}
      selectedVideos={selectedVideos}
      onRemoveVideo={(id) => {
        setSelectedVideos((prev) => {
          const next = new Map(prev);
          next.delete(id);
          return next;
        });
      }}
    />
  )}
</Suspense>
```

- [ ] **Step 7: Commit**

```bash
git add src/pages/ViralToday.tsx
git commit -m "feat: add multi-select checkboxes + floating action bar to Viral Today"
```

---

## Task 5: Modify batch-generate-scripts Edge Function

**Files:**
- Modify: `supabase/functions/batch-generate-scripts/index.ts`

Add a `videos[]` input path alongside existing `topics[]`. When videos are provided, fetch canvas context for the client and build video-aware prompts.

- [ ] **Step 1: Update BATCH_COST_PER_SCRIPT and add video prompt builder**

At the top of the file, change the cost constant from 50 to 25:

```typescript
const BATCH_COST_PER_SCRIPT = 25;
```

After the existing `buildScriptPrompt` function (around line 73), add a new function for video-based prompts:

```typescript
function buildVideoScriptPrompt(
  video: { caption: string; platform: string; views_count: number; outlier_score: number; engagement_rate: number; owner_username: string },
  clientContext: string,
  language: string,
  format: string,
): string {
  const langLabel = language === "es" ? "SPANISH (Latin American)" : "ENGLISH";
  const formatMap: Record<string, string> = {
    talking_head: "TALKING HEAD — speak directly to camera, build personal trust, share insight",
    broll_caption: "B-ROLL CAPTION — words complement visuals, narrate scenes",
    entrevista: "ENTREVISTA — conversational Q&A energy",
    variado: "VARIADO — dynamic mixed: direct camera, b-roll, text moments",
  };
  const formatDesc = formatMap[format] || formatMap.talking_head;

  return `You are creating a short-form video script inspired by this viral video.

VIRAL VIDEO CONTEXT:
- Caption: ${video.caption || "No caption"}
- Platform: ${video.platform}
- Views: ${video.views_count} | Outlier: ${video.outlier_score}x | Engagement: ${video.engagement_rate}%
- Account: @${video.owner_username}

CLIENT CONTEXT:
${clientContext || "No specific client context available."}

Write a compelling, viral short-form social media script (45 seconds / ~90-120 words) in ${langLabel}.
Format: ${formatDesc}

Create a script that replicates the style, structure, and hook pattern of this viral video but adapted for the client's brand, niche, and audience. Include: HOOK, SHIFT, BODY, CTA sections.`;
}

async function extractCanvasContext(adminClient: any, clientId: string): Promise<string> {
  const { data } = await adminClient
    .from("canvas_states")
    .select("nodes")
    .eq("client_id", clientId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data?.nodes || !Array.isArray(data.nodes)) return "";

  const textContent: string[] = [];
  for (const node of data.nodes) {
    if (node.type === "textNoteNode" || node.type === "researchNoteNode") {
      const text = node.data?.noteText || node.data?.text || "";
      if (text.trim()) textContent.push(text.trim());
    }
    if (node.type === "brandGuideNode") {
      const brand = node.data?.brandText || node.data?.text || "";
      if (brand.trim()) textContent.push(`BRAND: ${brand.trim()}`);
    }
  }

  return textContent.join("\n\n").slice(0, 4000);
}
```

- [ ] **Step 2: Update the main request handler to accept videos[]**

In the `serve` handler, after `const { topics, language = "en", format = "talking_head", clientId } = await req.json();` (line 204), replace the validation and batch submission logic with:

```typescript
    const body = await req.json();
    const { topics, videos, language = "en", format = "talking_head", clientId } = body;

    // Determine mode: videos[] (new) or topics[] (legacy)
    const isVideoMode = Array.isArray(videos) && videos.length > 0;

    if (!isVideoMode && (!topics || !Array.isArray(topics) || topics.length === 0)) {
      return new Response(JSON.stringify({ error: "topics or videos array is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const itemCount = isVideoMode ? videos.length : topics.length;
    if (itemCount > 10) {
      return new Response(JSON.stringify({ error: "Maximum 10 items per batch" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Deduct credits
    const totalCost = itemCount * BATCH_COST_PER_SCRIPT;
    if (totalCost > 0) {
      const creditErr = await deductCredits(adminClient, user.id, "batch_generate", totalCost);
      if (creditErr) {
        return new Response(creditErr, {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Extract canvas context for video mode
    let clientContext = "";
    if (isVideoMode && clientId) {
      clientContext = await extractCanvasContext(adminClient, clientId);
    }

    // Build batch requests
    const requests = isVideoMode
      ? videos.map((video: any, i: number) => ({
          custom_id: `vscript-${clientId || "unknown"}-${i}-${Date.now()}`,
          params: {
            model: "claude-haiku-4-5",
            max_tokens: 2048,
            system: SCRIPT_SYSTEM_PROMPT,
            tools: [RETURN_SCRIPT_TOOL],
            tool_choice: { type: "tool", name: "return_script" },
            messages: [{ role: "user", content: buildVideoScriptPrompt(video, clientContext, language, format) }],
          },
        }))
      : topics.map((topic: string, i: number) => ({
          custom_id: `script-${clientId || "unknown"}-${i}-${Date.now()}`,
          params: {
            model: "claude-haiku-4-5",
            max_tokens: 2048,
            system: SCRIPT_SYSTEM_PROMPT,
            tools: [RETURN_SCRIPT_TOOL],
            tool_choice: { type: "tool", name: "return_script" },
            messages: [{ role: "user", content: buildScriptPrompt(topic, language, format) }],
          },
        }));

    // Submit batch
    const batchRes = await fetch("https://api.anthropic.com/v1/messages/batches", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({ requests }),
    });

    if (!batchRes.ok) {
      const err = await batchRes.text();
      throw new Error(`Anthropic Batches API error ${batchRes.status}: ${err}`);
    }

    const batch = await batchRes.json();

    // Build map for correlation: custom_id → video/topic data
    const videoMap: Record<string, any> = {};
    if (isVideoMode) {
      requests.forEach((r: any, i: number) => {
        videoMap[r.custom_id] = videos[i];
      });
    } else {
      requests.forEach((r: any, i: number) => {
        videoMap[r.custom_id] = topics[i];
      });
    }

    return new Response(
      JSON.stringify({
        batchId: batch.id,
        status: batch.processing_status,
        videoMap,
        topicMap: isVideoMode ? undefined : videoMap, // backwards compat
        requestCounts: batch.request_counts,
        isVideoMode,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/batch-generate-scripts/index.ts
git commit -m "feat: batch-generate-scripts accepts videos[] with canvas context extraction"
```

---

## Task 6: Modify batch-poll-scripts Edge Function

**Files:**
- Modify: `supabase/functions/batch-poll-scripts/index.ts`

When batch completes and `clientId` is provided, write ScriptBatchNode entries to the client's most recent canvas_states session.

- [ ] **Step 1: Add Supabase client setup and canvas write logic**

Add the Supabase import at the top of the file (after the existing serve import):

```typescript
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
```

After the batch results are parsed (after the `for (const line of text.split("\n"))` loop ends), add canvas write logic before the return statement:

```typescript
    // If clientId provided, write results as ScriptBatchNode entries to canvas
    const { clientId } = await req.json().catch(() => ({}));
    // Re-parse body since we already consumed it — use the passed variables
    if (clientId && results.some((r: any) => r.script)) {
      try {
        const adminClient = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        );

        // Fetch the most recent canvas session for this client
        const { data: session } = await adminClient
          .from("canvas_states")
          .select("id, nodes, edges")
          .eq("client_id", clientId)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (session) {
          const existingNodes: any[] = Array.isArray(session.nodes) ? session.nodes : [];

          // Calculate base position: rightmost node x + 400, y = 100
          let maxX = 0;
          for (const n of existingNodes) {
            const nx = (n.position?.x ?? 0) + (n.width ?? 260);
            if (nx > maxX) maxX = nx;
          }
          const baseX = maxX + 100;
          const baseY = 100;

          // Build new ScriptBatchNode entries
          const newNodes: any[] = [];
          let yOffset = 0;
          for (const r of results) {
            if (!r.script) continue;
            const videoData = (videoMap || {})[r.customId] || {};
            const nodeId = `scriptBatchNode_${Date.now()}_${yOffset}`;
            newNodes.push({
              id: nodeId,
              type: "scriptBatchNode",
              position: { x: baseX, y: baseY + yOffset },
              width: 260,
              data: {
                script: r.script,
                videoThumbnail: videoData.thumbnail_url || null,
                videoUrl: videoData.video_url || null,
                videoCaption: videoData.caption || null,
                ownerUsername: videoData.owner_username || null,
                outlierScore: videoData.outlier_score || null,
                platform: videoData.platform || null,
              },
            });
            yOffset += 220;
          }

          // Append to existing nodes and save
          const updatedNodes = [...existingNodes, ...newNodes];
          await adminClient
            .from("canvas_states")
            .update({
              nodes: updatedNodes,
              updated_at: new Date().toISOString(),
            })
            .eq("id", session.id);
        }
      } catch (canvasErr) {
        console.error("Failed to write batch results to canvas:", canvasErr);
        // Don't fail the response — results are still returned to frontend
      }
    }
```

**Important:** The body has already been consumed by `req.json()` earlier. We need to restructure the handler to parse the body once and extract `clientId` and `videoMap` from it at the same time as `batchId` and `topicMap`. Change the destructuring near the top to:

```typescript
    const { batchId, topicMap, videoMap, clientId } = await req.json();
```

And use `videoMap` (passed from frontend) for the canvas node data correlation instead of `topicMap`.

- [ ] **Step 2: Write the complete updated file**

Replace the entire `supabase/functions/batch-poll-scripts/index.ts` with the corrected version that parses all fields from the body at once:

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
  if (!ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { batchId, topicMap, videoMap, clientId } = await req.json();

    if (!batchId) {
      return new Response(JSON.stringify({ error: "batchId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Retrieve batch status
    const batchRes = await fetch(`https://api.anthropic.com/v1/messages/batches/${batchId}`, {
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
    });

    if (!batchRes.ok) {
      const err = await batchRes.text();
      throw new Error(`Batch retrieve error ${batchRes.status}: ${err}`);
    }

    const batch = await batchRes.json();

    if (batch.processing_status !== "ended") {
      return new Response(
        JSON.stringify({
          status: "processing",
          requestCounts: batch.request_counts,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Batch done — retrieve results as JSONL
    const resultsRes = await fetch(`https://api.anthropic.com/v1/messages/batches/${batchId}/results`, {
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
    });

    if (!resultsRes.ok) {
      const err = await resultsRes.text();
      throw new Error(`Batch results error ${resultsRes.status}: ${err}`);
    }

    const text = await resultsRes.text();
    const results: any[] = [];
    const correlationMap = videoMap || topicMap || {};

    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const result = JSON.parse(trimmed);
        const topic = correlationMap[result.custom_id] || result.custom_id;

        if (result.result?.type === "succeeded") {
          const toolUse = result.result.message?.content?.find((b: any) => b.type === "tool_use");
          let script = toolUse?.input ?? null;

          if (script?.idea_ganadora) {
            const words = script.idea_ganadora.split(/\s+/);
            if (words.length > 5) script.idea_ganadora = words.slice(0, 5).join(" ");
          }

          results.push({ customId: result.custom_id, topic, script, error: null });
        } else {
          results.push({
            customId: result.custom_id,
            topic,
            script: null,
            error: result.result?.error?.message || "Request failed",
          });
        }
      } catch {
        // Skip malformed lines
      }
    }

    // Write ScriptBatchNode entries to canvas if clientId provided
    if (clientId && results.some((r) => r.script)) {
      try {
        const adminClient = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        );

        const { data: session } = await adminClient
          .from("canvas_states")
          .select("id, nodes")
          .eq("client_id", clientId)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (session) {
          const existingNodes: any[] = Array.isArray(session.nodes) ? session.nodes : [];

          // Base position: right of existing content
          let maxX = 0;
          for (const n of existingNodes) {
            const nx = (n.position?.x ?? 0) + (n.width ?? 260);
            if (nx > maxX) maxX = nx;
          }
          const baseX = maxX + 100;
          const baseY = 100;

          const newNodes: any[] = [];
          let yOffset = 0;
          for (const r of results) {
            if (!r.script) continue;
            const vd = (videoMap || {})[r.customId] || {};
            const nodeId = `scriptBatchNode_${Date.now()}_${yOffset}`;
            newNodes.push({
              id: nodeId,
              type: "scriptBatchNode",
              position: { x: baseX, y: baseY + yOffset },
              width: 260,
              data: {
                script: r.script,
                videoThumbnail: vd.thumbnail_url || null,
                videoUrl: vd.video_url || null,
                videoCaption: vd.caption || null,
                ownerUsername: vd.owner_username || null,
                outlierScore: vd.outlier_score || null,
                platform: vd.platform || null,
              },
            });
            yOffset += 220;
          }

          await adminClient
            .from("canvas_states")
            .update({
              nodes: [...existingNodes, ...newNodes],
              updated_at: new Date().toISOString(),
            })
            .eq("id", session.id);
        }
      } catch (canvasErr) {
        console.error("Failed to write batch results to canvas:", canvasErr);
      }
    }

    return new Response(
      JSON.stringify({ status: "done", results, requestCounts: batch.request_counts }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e: any) {
    console.error("batch-poll-scripts error:", e);
    return new Response(JSON.stringify({ error: e.message || "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/batch-poll-scripts/index.ts
git commit -m "feat: batch-poll-scripts writes ScriptBatchNode entries to canvas on completion"
```

---

## Task 7: Build and Deploy to VPS

**Files:**
- All modified files from Tasks 1-6

Build the frontend and deploy everything to the VPS. Deploy both edge functions to Supabase.

- [ ] **Step 1: Run local type check**

```bash
cd /Users/admin/Desktop/connectacreators && npx tsc --noEmit 2>&1 | tail -20
```

Expected: No new errors from our changes.

- [ ] **Step 2: Build the frontend**

SCP changed files to VPS, run build there:

```bash
# SCP all changed/new frontend files to VPS
scp src/components/canvas/ScriptBatchNode.tsx root@72.62.200.145:/var/www/connectacreators/src/components/canvas/
scp src/components/BatchScriptModal.tsx root@72.62.200.145:/var/www/connectacreators/src/components/
scp src/pages/ViralToday.tsx root@72.62.200.145:/var/www/connectacreators/src/pages/
scp src/pages/SuperPlanningCanvas.tsx root@72.62.200.145:/var/www/connectacreators/src/pages/

# Build on VPS
ssh root@72.62.200.145 "cd /var/www/connectacreators && npm run build"
```

Expected: Build succeeds with no errors.

- [ ] **Step 3: Deploy index.html alongside assets**

```bash
# Copy built assets + index.html to web root (critical: both must be deployed together)
ssh root@72.62.200.145 "cp /var/www/connectacreators/dist/index.html /var/www/connectacreators/dist/assets/* /var/www/connectacreators/ 2>/dev/null; nginx -s reload"
```

Note: The exact deploy path depends on your nginx config. Adjust as needed.

- [ ] **Step 4: Deploy edge functions to Supabase**

```bash
cd /Users/admin/Desktop/connectacreators
npx supabase functions deploy batch-generate-scripts
npx supabase functions deploy batch-poll-scripts
```

Expected: Both functions deploy successfully.

- [ ] **Step 5: Manual verification**

1. Open Viral Today page as admin
2. Hover over video cards — checkbox should appear top-left
3. Select 3+ videos — floating action bar should slide up
4. Click "Generate Scripts" — BatchScriptModal opens
5. Select a client, verify credit estimate shows
6. Click "Generate in Background" — toast confirms batch started
7. Wait for completion toast (1-3 minutes depending on batch API queue)
8. Open Super Planning Canvas for that client — new ScriptBatchNode entries should appear
9. Verify nodes show thumbnails, script previews, expand/collapse works

- [ ] **Step 6: Commit any build fixes**

```bash
git add -A
git commit -m "feat: batch viral script generator — complete deployment"
```

---

## Verification Checklist

- [ ] Admin sees checkboxes on hover in Viral Today
- [ ] Non-admin does NOT see checkboxes
- [ ] Selecting 2+ videos shows floating action bar
- [ ] Max 10 video limit enforced
- [ ] BatchScriptModal shows client picker, thumbnail strip, credit estimate
- [ ] Insufficient credits disables Generate button
- [ ] Batch submits to Anthropic and returns batchId
- [ ] Background polling detects completion
- [ ] Toast shows with "Open Canvas" link
- [ ] Canvas shows new ScriptBatchNode entries with real thumbnails
- [ ] Script expand/collapse works
- [ ] Existing topics[] batch flow still works (backwards compatible)
