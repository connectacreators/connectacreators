// src/components/viral-today/UseInScriptModal.tsx
//
// "Use in Script" — attach a Viral Today video to a client's script in one of
// two lanes, or create a new script pre-linked to it:
//   💡 Idea inspiration      → appended to scripts.inspiration_urls
//   🎬 Film & edit reference → sets scripts.format_reference_url
//
// Scripts store inspiration as canonicalized URL strings (no FK); the script
// editor's InspirationVideoEmbed re-finds the cached viral_videos row by URL,
// so attaching here immediately plays from cache in the editor.

import { useEffect, useMemo, useState } from "react";
import { X, Loader2, Lightbulb, Clapperboard, Plus, Check, Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { canonicalizeVideoUrl } from "@/lib/canonicalize-video-url";

export type InspirationLane = "idea" | "format";

interface ScriptRow {
  id: string;
  title: string | null;
  updated_at: string | null;
  inspiration_urls: string[] | null;
  format_reference_url: string | null;
}

interface UseInScriptModalProps {
  open: boolean;
  onClose: () => void;
  video: {
    id: string;
    video_url: string;
    caption?: string | null;
    channel_username?: string | null;
  };
  clientOptions: { id: string; name: string }[];
}

function canon(url: string | null | undefined): string | null {
  if (!url) return null;
  return canonicalizeVideoUrl(url)?.normalizedUrl ?? url.trim();
}

export default function UseInScriptModal({ open, onClose, video, clientOptions }: UseInScriptModalProps) {
  const navigate = useNavigate();
  const [clientId, setClientId] = useState<string>(clientOptions.length === 1 ? clientOptions[0].id : "");
  const [lane, setLane] = useState<InspirationLane>("idea");
  const [scripts, setScripts] = useState<ScriptRow[]>([]);
  const [loadingScripts, setLoadingScripts] = useState(false);
  const [search, setSearch] = useState("");
  const [busyScriptId, setBusyScriptId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const canonicalUrl = useMemo(() => canon(video.video_url) ?? video.video_url, [video.video_url]);

  useEffect(() => {
    if (clientOptions.length === 1) setClientId(clientOptions[0].id);
  }, [clientOptions]);

  // Load the client's scripts (excluding trash + canvas draft phantoms).
  useEffect(() => {
    if (!open || !clientId) {
      setScripts([]);
      return;
    }
    let cancelled = false;
    setLoadingScripts(true);
    supabase
      .from("scripts")
      .select("id, title, updated_at, inspiration_urls, format_reference_url")
      .eq("client_id", clientId)
      .is("deleted_at", null)
      .neq("status", "draft")
      .order("updated_at", { ascending: false })
      .limit(200)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) toast.error(error.message);
        setScripts((data ?? []) as ScriptRow[]);
        setLoadingScripts(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, clientId]);

  const isAttached = (s: ScriptRow): boolean => {
    if (lane === "idea") {
      return (s.inspiration_urls ?? []).some((u) => canon(u) === canonicalUrl);
    }
    return canon(s.format_reference_url) === canonicalUrl;
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return scripts;
    return scripts.filter((s) => (s.title ?? "").toLowerCase().includes(q));
  }, [scripts, search]);

  const openScript = (scriptId: string) => {
    navigate(`/clients/${clientId}/scripts?scriptId=${scriptId}`);
  };

  const attachToScript = async (s: ScriptRow) => {
    if (isAttached(s)) {
      toast.info(`Already ${lane === "idea" ? "an inspiration" : "the format reference"} on “${s.title ?? "Untitled"}”`);
      return;
    }
    setBusyScriptId(s.id);
    try {
      if (lane === "idea") {
        const urls = [...(s.inspiration_urls ?? []), canonicalUrl];
        const { error } = await supabase
          .from("scripts")
          .update({ inspiration_urls: urls, inspiration_url: urls[0] })
          .eq("id", s.id);
        if (error) throw error;
        setScripts((prev) => prev.map((p) => (p.id === s.id ? { ...p, inspiration_urls: urls } : p)));
        toast.success(`Added as idea inspiration to “${s.title ?? "Untitled"}”`, {
          action: { label: "Open script", onClick: () => openScript(s.id) },
        });
      } else {
        const replaced = !!s.format_reference_url && canon(s.format_reference_url) !== canonicalUrl;
        const { error } = await supabase
          .from("scripts")
          .update({ format_reference_url: canonicalUrl })
          .eq("id", s.id);
        if (error) throw error;
        setScripts((prev) => prev.map((p) => (p.id === s.id ? { ...p, format_reference_url: canonicalUrl } : p)));
        toast.success(
          replaced
            ? `Replaced the format reference on “${s.title ?? "Untitled"}”`
            : `Set as format reference on “${s.title ?? "Untitled"}”`,
          { action: { label: "Open script", onClick: () => openScript(s.id) } },
        );
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to attach video");
    } finally {
      setBusyScriptId(null);
    }
  };

  const createNewScript = async () => {
    if (!clientId) return;
    setCreating(true);
    try {
      const captionTitle = (video.caption ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
      const title = captionTitle || `Idea from @${video.channel_username ?? "viral video"}`;
      const laneFields =
        lane === "idea"
          ? { inspiration_urls: [canonicalUrl], inspiration_url: canonicalUrl }
          : { format_reference_url: canonicalUrl };
      const { data, error } = await supabase
        .from("scripts")
        .insert({
          client_id: clientId,
          title,
          idea_ganadora: title,
          raw_content: "",
          ...laneFields,
        })
        .select("id")
        .single();
      if (error) throw error;
      toast.success(`Script created with the video as ${lane === "idea" ? "idea inspiration" : "format reference"}`);
      onClose();
      openScript(data.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create script");
    } finally {
      setCreating(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div
        className="relative rounded-2xl shadow-2xl border overflow-hidden flex flex-col"
        style={{ background: "#18181b", borderColor: "#27272a", width: "min(560px, 92vw)", maxHeight: "85vh" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid #27272a" }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: "#fafafa" }}>Use in Script</h2>
            <p style={{ fontSize: 12, color: "#71717a", marginTop: 2 }}>
              Attach this video to a script as inspiration, or start a new script from it.
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/10" aria-label="Close">
            <X className="w-4 h-4" style={{ color: "#a1a1aa" }} />
          </button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-4 overflow-y-auto">
          {/* Client */}
          {clientOptions.length > 1 && (
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: "#a1a1aa", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Client
              </label>
              <select
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                className="mt-1 w-full h-9 rounded-md border text-sm px-2"
                style={{ background: "#09090b", borderColor: "#27272a", color: "#fafafa" }}
              >
                <option value="">Choose a client…</option>
                {clientOptions.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Lane */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: "#a1a1aa", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Use as
            </label>
            <div className="mt-1 grid grid-cols-2 gap-2">
              <button
                onClick={() => setLane("idea")}
                className="flex items-start gap-2 rounded-lg border p-3 text-left transition-colors"
                style={{
                  borderColor: lane === "idea" ? "#8b5cf6" : "#27272a",
                  background: lane === "idea" ? "rgba(139,92,246,0.10)" : "transparent",
                }}
              >
                <Lightbulb className="w-4 h-4 mt-0.5 shrink-0" style={{ color: lane === "idea" ? "#a78bfa" : "#71717a" }} />
                <span>
                  <span style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#fafafa" }}>Idea inspiration</span>
                  <span style={{ display: "block", fontSize: 11, color: "#71717a", marginTop: 2 }}>
                    What the script is about — added to the script's inspiration list.
                  </span>
                </span>
              </button>
              <button
                onClick={() => setLane("format")}
                className="flex items-start gap-2 rounded-lg border p-3 text-left transition-colors"
                style={{
                  borderColor: lane === "format" ? "#22d3ee" : "#27272a",
                  background: lane === "format" ? "rgba(34,211,238,0.08)" : "transparent",
                }}
              >
                <Clapperboard className="w-4 h-4 mt-0.5 shrink-0" style={{ color: lane === "format" ? "#67e8f9" : "#71717a" }} />
                <span>
                  <span style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#fafafa" }}>Film & edit reference</span>
                  <span style={{ display: "block", fontSize: 11, color: "#71717a", marginTop: 2 }}>
                    How to shoot and edit it — one reference per script.
                  </span>
                </span>
              </button>
            </div>
          </div>

          {/* Script list */}
          <div className="flex flex-col gap-2 min-h-0">
            <div className="flex items-center justify-between gap-2">
              <label style={{ fontSize: 11, fontWeight: 600, color: "#a1a1aa", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Add to a script
              </label>
              <button
                onClick={createNewScript}
                disabled={!clientId || creating}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold transition-colors disabled:opacity-50"
                style={{ background: "#fafafa", color: "#18181b" }}
              >
                {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                New script from this video
              </button>
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "#52525b" }} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search scripts…"
                className="w-full h-8 rounded-md border text-sm pl-8 pr-2"
                style={{ background: "#09090b", borderColor: "#27272a", color: "#fafafa" }}
              />
            </div>

            <div className="overflow-y-auto rounded-lg border" style={{ borderColor: "#27272a", maxHeight: 260 }}>
              {!clientId ? (
                <p className="text-center py-8" style={{ fontSize: 12, color: "#71717a" }}>Choose a client to see their scripts.</p>
              ) : loadingScripts ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-4 h-4 animate-spin" style={{ color: "#71717a" }} />
                </div>
              ) : filtered.length === 0 ? (
                <p className="text-center py-8" style={{ fontSize: 12, color: "#71717a" }}>
                  {search ? "No scripts match your search." : "No scripts yet for this client — create one above."}
                </p>
              ) : (
                filtered.map((s) => {
                  const attached = isAttached(s);
                  return (
                    <button
                      key={s.id}
                      onClick={() => attachToScript(s)}
                      disabled={busyScriptId === s.id}
                      className="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors hover:bg-white/5 disabled:opacity-60"
                      style={{ borderBottom: "1px solid #27272a" }}
                    >
                      <span className="min-w-0">
                        <span className="block truncate" style={{ fontSize: 13, fontWeight: 500, color: "#fafafa" }}>
                          {s.title ?? "Untitled"}
                        </span>
                        {lane === "format" && s.format_reference_url && !attached && (
                          <span style={{ fontSize: 10, color: "#f59e0b" }}>Has a reference — will be replaced</span>
                        )}
                      </span>
                      {busyScriptId === s.id ? (
                        <Loader2 className="w-4 h-4 animate-spin shrink-0" style={{ color: "#71717a" }} />
                      ) : attached ? (
                        <span className="flex items-center gap-1 shrink-0" style={{ fontSize: 11, color: "#34d399" }}>
                          <Check className="w-3.5 h-3.5" /> Attached
                        </span>
                      ) : (
                        <Plus className="w-4 h-4 shrink-0" style={{ color: "#71717a" }} />
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
