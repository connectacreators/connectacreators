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

  // Escape closes (backdrop click already did).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div
        className="relative rounded-2xl shadow-2xl border border-border bg-card overflow-hidden flex flex-col"
        style={{ width: "min(560px, 92vw)", maxHeight: "85vh" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h2 className="text-base font-bold text-foreground">Use in Script</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Attach this video to a script as inspiration, or start a new script from it.
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-4 overflow-y-auto">
          {/* Client */}
          {clientOptions.length > 1 && (
            <div>
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                Client
              </label>
              <select
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                className="mt-1 w-full h-9 rounded-md border border-border bg-background text-sm px-2 text-foreground"
              >
                <option value="">Choose a client…</option>
                {clientOptions.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Lane — violet/cyan are semantic lane accents (not palette hex) */}
          <div>
            <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              Use as
            </label>
            <div className="mt-1 grid grid-cols-2 gap-2">
              <button
                onClick={() => setLane("idea")}
                className={
                  "flex items-start gap-2 rounded-lg border p-3 text-left transition-colors " +
                  (lane === "idea" ? "border-violet-500 bg-violet-500/10" : "border-border bg-transparent")
                }
              >
                <Lightbulb className={"w-4 h-4 mt-0.5 shrink-0 " + (lane === "idea" ? "text-violet-400" : "text-muted-foreground")} />
                <span>
                  <span className="block text-[13px] font-semibold text-foreground">Idea inspiration</span>
                  <span className="block text-[11px] text-muted-foreground mt-0.5">
                    What the script is about — added to the script's inspiration list.
                  </span>
                </span>
              </button>
              <button
                onClick={() => setLane("format")}
                className={
                  "flex items-start gap-2 rounded-lg border p-3 text-left transition-colors " +
                  (lane === "format" ? "border-cyan-400 bg-cyan-400/10" : "border-border bg-transparent")
                }
              >
                <Clapperboard className={"w-4 h-4 mt-0.5 shrink-0 " + (lane === "format" ? "text-cyan-300" : "text-muted-foreground")} />
                <span>
                  <span className="block text-[13px] font-semibold text-foreground">Film & edit reference</span>
                  <span className="block text-[11px] text-muted-foreground mt-0.5">
                    How to shoot and edit it — one reference per script.
                  </span>
                </span>
              </button>
            </div>
          </div>

          {/* Script list */}
          <div className="flex flex-col gap-2 min-h-0">
            <div className="flex items-center justify-between gap-2">
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                Add to a script
              </label>
              <button
                onClick={createNewScript}
                disabled={!clientId || creating}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold transition-colors disabled:opacity-50 bg-foreground text-background hover:opacity-90"
              >
                {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                New script from this video
              </button>
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search scripts…"
                className="w-full h-8 rounded-md border border-border bg-background text-sm pl-8 pr-2 text-foreground placeholder:text-muted-foreground"
              />
            </div>

            <div className="overflow-y-auto rounded-lg border border-border" style={{ maxHeight: 260 }}>
              {!clientId ? (
                <p className="text-center py-8 text-xs text-muted-foreground">Choose a client to see their scripts.</p>
              ) : loadingScripts ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                </div>
              ) : filtered.length === 0 ? (
                <p className="text-center py-8 text-xs text-muted-foreground">
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
                      className="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/60 disabled:opacity-60 border-b border-border last:border-b-0"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-medium text-foreground">
                          {s.title ?? "Untitled"}
                        </span>
                        {lane === "format" && s.format_reference_url && !attached && (
                          <span className="text-[10px] text-amber-500">Has a reference — will be replaced</span>
                        )}
                      </span>
                      {busyScriptId === s.id ? (
                        <Loader2 className="w-4 h-4 animate-spin shrink-0 text-muted-foreground" />
                      ) : attached ? (
                        <span className="flex items-center gap-1 shrink-0 text-[11px] text-emerald-500">
                          <Check className="w-3.5 h-3.5" /> Attached
                        </span>
                      ) : (
                        <Plus className="w-4 h-4 shrink-0 text-muted-foreground" />
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
