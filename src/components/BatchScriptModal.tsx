// src/components/BatchScriptModal.tsx
import { useState, useEffect } from "react";
import { X, Loader2, Info, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
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
}

interface BatchScriptModalProps {
  open: boolean;
  onClose: () => void;
  selectedVideos: Map<string, ViralVideo>;
  onRemoveVideo: (id: string) => void;
}

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
  const navigate = useNavigate();

  // Fetch clients on mount
  useEffect(() => {
    if (!open) return;
    setLoadingClients(true);
    supabase
      .from("clients")
      .select("id, name")
      .order("name")
      .then(({ data }) => {
        setClients((data ?? []) as Client[]);
        setLoadingClients(false);
      });
  }, [open]);

  const videoCount = selectedVideos.size;

  const handleAddToCanvas = () => {
    if (!selectedClientId || videoCount < 2) return;

    // Navigate to the client's scripts page with canvas view + incoming videos in state
    const videos = Array.from(selectedVideos.values());
    navigate(`/clients/${selectedClientId}/scripts?view=canvas`, {
      state: { incomingVideos: videos },
    });

    onClose();
  };

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
              Add to Canvas
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

          {/* Info about canvas flow */}
          <div className="flex items-start gap-2 rounded-lg px-3 py-2.5" style={{ background: "#1f1f23" }}>
            <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: "#71717a" }} />
            <span style={{ fontSize: 11, color: "#71717a", lineHeight: 1.5 }}>
              Videos will be added to the client's canvas as a group. The AI assistant will help you craft scripts based on these viral videos.
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
            onClick={handleAddToCanvas}
            disabled={!selectedClientId || videoCount < 2}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background: "#06b6d4",
              color: "#000",
              border: "1px solid #06b6d4",
            }}
          >
            Add to Canvas <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
