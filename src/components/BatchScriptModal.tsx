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
