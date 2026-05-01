import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  Folder, FolderOpen, FileText, Loader2, ChevronLeft, ChevronRight,
  Film, Mic, Scissors, MonitorPlay,
} from "lucide-react";

type ScriptLine = {
  line_type: "filming" | "actor" | "editor" | "text_on_screen";
  section: "hook" | "body" | "cta";
  text: string;
  line_number: number;
};

type ScriptStub = {
  id: string;
  title: string;
  idea_ganadora: string | null;
  target: string | null;
  formato: string | null;
  folder_id: string;
  created_at: string;
  updated_at: string;
  lines: ScriptLine[];
};

type FolderNode = {
  id: string;
  name: string;
  parent_id: string | null;
  created_at: string;
};

type SharePayload = {
  permission: "viewer" | "editor";
  root: { id: string; name: string };
  folders: FolderNode[];
  scripts: ScriptStub[];
};

const typeConfig = {
  filming:        { label: "Filming",         icon: Film,        color: "text-orange-400",     bg: "bg-gradient-to-br from-orange-500/10 to-orange-900/5", border: "border-orange-500/25" },
  actor:          { label: "Voiceover",       icon: Mic,         color: "text-[#22d3ee]",       bg: "bg-gradient-to-br from-[rgba(8,145,178,0.1)] to-[rgba(8,145,178,0.02)]", border: "border-[rgba(8,145,178,0.25)]" },
  editor:         { label: "Editing",         icon: Scissors,    color: "text-[#a3e635]",       bg: "bg-gradient-to-br from-[rgba(132,204,22,0.08)] to-[rgba(132,204,22,0.02)]", border: "border-[rgba(132,204,22,0.2)]" },
  text_on_screen: { label: "On-screen text",  icon: MonitorPlay, color: "text-[#94a3b8]",       bg: "bg-gradient-to-br from-[rgba(148,163,184,0.06)] to-[rgba(148,163,184,0.02)]", border: "border-[rgba(148,163,184,0.15)]" },
};

function previewFromLines(lines: ScriptLine[]): string {
  const actor = lines.filter((l) => l.line_type === "actor");
  const source = actor.length > 0 ? actor : lines;
  return source.slice(0, 3).map((l) => l.text).join(" ").slice(0, 220);
}

export default function PublicFolderShare() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<SharePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Client-side navigation within the shared subtree
  const [viewingFolderId, setViewingFolderId] = useState<string | null>(null);
  const [openScriptId, setOpenScriptId] = useState<string | null>(null);

  useEffect(() => {
    if (!token) { setNotFound(true); setLoading(false); return; }
    let cancelled = false;
    (async () => {
      const { data: resp, error } = await supabase.functions.invoke("get-shared-folder", {
        body: { token },
      });
      if (cancelled) return;
      if (error || !resp || resp.error) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setData(resp as SharePayload);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [token]);

  const openScript = useMemo(
    () => data?.scripts.find((s) => s.id === openScriptId) ?? null,
    [data, openScriptId],
  );

  const currentFolderId = viewingFolderId ?? data?.root.id ?? null;

  const childFolders = useMemo(() => {
    if (!data || !currentFolderId) return [];
    return data.folders.filter((f) => f.parent_id === currentFolderId);
  }, [data, currentFolderId]);

  const folderScripts = useMemo(() => {
    if (!data || !currentFolderId) return [];
    return data.scripts.filter((s) => s.folder_id === currentFolderId);
  }, [data, currentFolderId]);

  const breadcrumbs = useMemo(() => {
    if (!data) return [];
    const trail: FolderNode[] = [];
    let cur: FolderNode | undefined = data.folders.find((f) => f.id === currentFolderId);
    const folderMap = new Map(data.folders.map((f) => [f.id, f]));
    while (cur) {
      trail.unshift(cur);
      if (cur.parent_id === null || cur.id === data.root.id) break;
      cur = folderMap.get(cur.parent_id);
      if (!cur) break;
    }
    return trail;
  }, [data, currentFolderId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (notFound || !data) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-6">
        <div className="text-center space-y-2 max-w-sm">
          <FileText className="w-12 h-12 text-muted-foreground mx-auto" />
          <h1 className="text-xl font-bold text-foreground">Link not found</h1>
          <p className="text-muted-foreground text-sm">
            This share link doesn't exist or has been revoked.
          </p>
        </div>
      </div>
    );
  }

  // ── Script detail view ────────────────────────────────────────────────────
  if (openScript) {
    const sectionLabels = { hook: "Hook", body: "Body", cta: "CTA" } as const;
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-card/50 to-background" style={{ fontFamily: "Arial, sans-serif" }}>
        <header className="sticky top-0 z-20 border-b border-border/50 bg-background/90 backdrop-blur-xl">
          <div className="container mx-auto px-4 py-3 max-w-3xl flex items-center gap-2">
            <button
              onClick={() => setOpenScriptId(null)}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronLeft className="w-4 h-4" /> Back
            </button>
            <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
              <FileText className="w-3.5 h-3.5 text-primary" />
              <span className="uppercase tracking-wider">Read-only</span>
            </div>
          </div>
        </header>

        <main className="container mx-auto px-4 py-6 max-w-3xl">
          <h1 className="text-2xl font-bold text-foreground mb-3">{openScript.title}</h1>

          {(openScript.idea_ganadora || openScript.target || openScript.formato) && (
            <div className="mb-6 space-y-1 p-4 rounded-2xl bg-gradient-to-br from-card via-card to-muted/30 border border-border">
              {openScript.idea_ganadora && (
                <p className="text-sm text-foreground"><span className="font-semibold text-[#22d3ee]">Winning Idea:</span> {openScript.idea_ganadora}</p>
              )}
              {openScript.target && (
                <p className="text-sm text-foreground"><span className="font-semibold text-orange-400">Target:</span> {openScript.target}</p>
              )}
              {openScript.formato && (
                <p className="text-sm text-foreground"><span className="font-semibold text-[#22d3ee]">Format:</span> {openScript.formato}</p>
              )}
            </div>
          )}

          {(["hook", "body", "cta"] as const).map((section) => {
            const sectionLines = openScript.lines.filter((l) => l.section === section);
            if (sectionLines.length === 0) return null;
            return (
              <div key={section} className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-sm font-bold text-foreground uppercase tracking-wider">{sectionLabels[section]}</span>
                  <div className="flex-1 h-px bg-border" />
                </div>
                <div className="space-y-3">
                  {sectionLines.map((line, i) => {
                    const cfg = typeConfig[line.line_type];
                    const Icon = cfg.icon;
                    return (
                      <div key={i} className={`flex items-start gap-3 p-4 rounded-2xl border ${cfg.bg} ${cfg.border}`}>
                        <div className={`mt-0.5 p-1.5 rounded-xl ${cfg.bg}`}>
                          <Icon className={`w-4 h-4 ${cfg.color}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className={`text-xs font-semibold uppercase tracking-wider ${cfg.color}`}>{cfg.label}</span>
                          <p className="mt-1 text-base leading-relaxed text-foreground">{line.text}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {openScript.lines.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">This script has no content yet.</p>
          )}
        </main>
      </div>
    );
  }

  // ── Folder feed view ──────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-card/50 to-background">
      <header className="border-b border-border/50 bg-background/90 backdrop-blur-xl">
        <div className="container mx-auto px-4 py-4 max-w-3xl">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-primary mb-1">
            <FileText className="w-3.5 h-3.5" />
            Shared scripts · Read-only
          </div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <FolderOpen className="w-5 h-5 text-primary" />
            {breadcrumbs[breadcrumbs.length - 1]?.name ?? data.root.name}
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {folderScripts.length} script{folderScripts.length !== 1 ? "s" : ""}
            {childFolders.length > 0 && ` · ${childFolders.length} folder${childFolders.length !== 1 ? "s" : ""}`}
          </p>

          {/* Breadcrumb within shared subtree only */}
          {breadcrumbs.length > 1 && (
            <div className="flex items-center gap-1.5 mt-3 flex-wrap">
              {breadcrumbs.map((bc, i) => (
                <span key={bc.id} className="flex items-center gap-1.5">
                  {i > 0 && <span className="text-muted-foreground/40 text-xs">/</span>}
                  {i < breadcrumbs.length - 1 ? (
                    <button
                      onClick={() => setViewingFolderId(bc.id === data.root.id ? null : bc.id)}
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {bc.name}
                    </button>
                  ) : (
                    <span className="text-xs font-semibold text-foreground">{bc.name}</span>
                  )}
                </span>
              ))}
            </div>
          )}
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-3xl space-y-6">
        {/* Subfolders */}
        {childFolders.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {childFolders.map((f) => {
              const count = data.scripts.filter((s) => s.folder_id === f.id).length;
              return (
                <button
                  key={f.id}
                  onClick={() => setViewingFolderId(f.id)}
                  className="flex flex-col items-start gap-2 p-4 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20 transition-all text-left"
                >
                  <Folder className="w-6 h-6 text-primary/80" />
                  <div className="min-w-0 w-full">
                    <p className="font-semibold text-foreground text-sm truncate">{f.name}</p>
                    <p className="text-xs text-muted-foreground">{count} script{count !== 1 ? "s" : ""}</p>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Scripts preview feed */}
        {folderScripts.length === 0 && childFolders.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground text-sm">
            This folder is empty.
          </div>
        ) : folderScripts.length > 0 ? (
          <div className="space-y-3">
            {folderScripts.map((s) => {
              const preview = previewFromLines(s.lines);
              return (
                <button
                  key={s.id}
                  onClick={() => setOpenScriptId(s.id)}
                  className="w-full flex flex-col gap-2 p-4 rounded-2xl border border-border bg-card hover:bg-card/80 hover:border-primary/40 transition-all text-left group"
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 p-1.5 rounded-lg bg-primary/10 border border-primary/20 shrink-0">
                      <FileText className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-foreground text-base leading-snug">{s.title || "Untitled"}</h3>
                      {(s.idea_ganadora || s.formato) && (
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {s.idea_ganadora && <span>{s.idea_ganadora}</span>}
                          {s.idea_ganadora && s.formato && <span className="mx-1.5">·</span>}
                          {s.formato && <span className="uppercase tracking-wider">{s.formato}</span>}
                        </p>
                      )}
                      {preview && (
                        <p className="text-sm text-muted-foreground mt-2 leading-relaxed line-clamp-3">
                          {preview}
                        </p>
                      )}
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground/50 group-hover:text-primary transition-colors shrink-0 mt-1" />
                  </div>
                </button>
              );
            })}
          </div>
        ) : null}
      </main>

      <footer className="border-t border-border/40 mt-8">
        <div className="container mx-auto px-4 py-4 max-w-3xl text-center text-[11px] text-muted-foreground">
          Shared via <a href="https://connectacreators.com" className="text-primary hover:underline">Connecta</a>
        </div>
      </footer>
    </div>
  );
}
