// src/pages/Editor.tsx
// Dedicated entry point for the video editor. Lists every video_edits row
// the current user can access that has Supabase Storage footage (i.e. is
// actually editable in the in-app editor). Open button takes you to
// /editing/:id/edit.
import { useEffect, useMemo, useState } from "react";
import PageTransition from "@/components/PageTransition";
import { useNavigate } from "react-router-dom";
import { Clapperboard, Search, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { IS_VIDEO_EDITOR_ENABLED } from "@/lib/videoEditor/featureGate";
import { Navigate } from "react-router-dom";

type Row = {
  id: string;
  title: string;
  clientId: string;
  clientName: string;
  createdAt: string;
};

function formatRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

export default function Editor() {
  if (!IS_VIDEO_EDITOR_ENABLED) return <Navigate to="/dashboard" replace />;

  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [fetching, setFetching] = useState(true);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (authLoading || !user) return;
    let cancelled = false;
    (async () => {
      setFetching(true);
      // Mirrors MasterEditingQueue's client-scope: agencies see their owned
      // clients; admins/managers see everything. RLS is the actual gate; this
      // query just orders the result.
      const { data, error } = await supabase
        .from("video_edits")
        .select("id, reel_title, created_at, client_id, storage_path, deleted_at, clients(name)")
        .not("storage_path", "is", null)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (cancelled) return;
      if (error) {
        console.error("[Editor] fetch failed:", error);
        setRows([]);
      } else {
        const mapped: Row[] = (data ?? []).map((v: any) => ({
          id: v.id,
          title:
            v.reel_title && v.reel_title !== "Sin titulo" && v.reel_title !== "Sin título"
              ? v.reel_title
              : `Edit ${(v.id as string).slice(0, 8)}`,
          clientId: v.client_id,
          clientName: v.clients?.name ?? v.client_id,
          createdAt: v.created_at,
        }));
        setRows(mapped);
      }
      setFetching(false);
    })();
    return () => { cancelled = true; };
  }, [authLoading, user]);

  const filtered = useMemo(() => {
    if (!query.trim()) return rows;
    const q = query.trim().toLowerCase();
    return rows.filter(
      (r) => r.title.toLowerCase().includes(q) || r.clientName.toLowerCase().includes(q),
    );
  }, [rows, query]);

  return (
    <PageTransition>
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-center gap-3 mb-1">
          <Clapperboard className="w-6 h-6 text-foreground" />
          <h1 className="text-2xl font-semibold tracking-tight">Editor</h1>
        </div>
        <p className="text-sm text-muted-foreground mb-6">
          Pick a video to open in the in-browser editor. Trim, transcribe, cut silences, and export.
        </p>

        <div className="relative mb-4">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by title or client…"
            className="pl-9"
          />
        </div>

        {fetching ? (
          <p className="text-sm text-muted-foreground py-10 text-center">Loading…</p>
        ) : filtered.length === 0 ? (
          <div className="border border-dashed border-border rounded-lg py-12 text-center">
            <p className="text-sm text-muted-foreground">
              {rows.length === 0
                ? "No editable footage yet. Upload a video in the editing queue to start."
                : "No matches."}
            </p>
          </div>
        ) : (
          <div className="border border-border rounded-lg overflow-hidden divide-y divide-border bg-card">
            {filtered.map((r) => (
              <button
                key={r.id}
                onClick={() => navigate(`/editing/${r.id}/edit`)}
                className="w-full flex items-center gap-4 px-4 py-3 hover:bg-accent/40 transition-colors text-left group"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{r.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {r.clientName} · {formatRelative(r.createdAt)}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/editing/${r.id}/edit`);
                  }}
                >
                  Open <ArrowRight className="w-3.5 h-3.5 ml-1" />
                </Button>
              </button>
            ))}
          </div>
        )}
      </div>
    </PageTransition>
  );
}
