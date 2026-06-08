import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  Folder, FolderOpen, FileText, Loader2, ChevronLeft, ChevronRight, Clapperboard,
} from "lucide-react";
import { SCRIPT_FORMATS } from "@/lib/scriptFormats";
import { TYPE_BAR_CLASS, TYPE_TEXT_CLASS } from "@/lib/scriptLineTypes";
import { defaultSectionLabel } from "@/lib/scriptBlocks";
import { applyBranding } from "@/lib/branding/apply";
import { PALETTES, FONT_PAIRINGS } from "@/lib/branding/presets";
import { EDITORIAL_DEFAULT, type PaletteId, type FontPairingId } from "@/lib/branding/types";

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

type ShareBranding = {
  palette: string;
  font_pairing: string;
  logo_url: string | null;
  logo_alt: string | null;
};

type SharePayload = {
  permission: "viewer" | "editor";
  root: { id: string; name: string };
  branding?: ShareBranding | null;
  folders: FolderNode[];
  scripts: ScriptStub[];
};

// Apply the sending account's selected palette + fonts to the public reader so
// it matches their in-app theme. Unknown/missing values fall back to the
// editorial default. The colors/fonts are validated against the known presets
// before being applied (the payload is server-controlled but we never trust it
// to be a valid preset id).
function applyShareBranding(branding: ShareBranding | null | undefined): void {
  const palette: PaletteId =
    branding && branding.palette in PALETTES
      ? (branding.palette as PaletteId)
      : EDITORIAL_DEFAULT.palette;
  const fontPairing: FontPairingId =
    branding && branding.font_pairing in FONT_PAIRINGS
      ? (branding.font_pairing as FontPairingId)
      : EDITORIAL_DEFAULT.fontPairing;
  applyBranding({
    palette,
    fontPairing,
    logoUrl: branding?.logo_url ?? null,
    logoAlt: branding?.logo_alt ?? null,
  });
}

function previewFromLines(lines: ScriptLine[]): string {
  const actor = lines.filter((l) => l.line_type === "actor");
  const source = actor.length > 0 ? actor : lines;
  return source.slice(0, 3).map((l) => l.text).join(" ").slice(0, 220);
}

// Read-only line: thin type-colored bar + type-colored text (mirrors the editor
// and the /s/ public view). Colors come from the shared scriptLineTypes maps so
// they never drift from the editor.
function ReaderLine({ line }: { line: ScriptLine }) {
  return (
    <div className="flex items-stretch gap-3 py-1.5">
      <div className={`w-[2px] rounded-full shrink-0 ${TYPE_BAR_CLASS[line.line_type]}`} />
      <div className={`flex-1 min-w-0 text-sm leading-relaxed ${TYPE_TEXT_CLASS[line.line_type]}`}>
        {line.text}
      </div>
    </div>
  );
}

function SectionHeading({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2.5 mt-6 mb-2 first:mt-0">
      <span
        className="font-serif font-bold text-foreground text-[15px]"
        style={{ letterSpacing: "0.06em" }}
      >
        {label}
      </span>
      <div className="flex-1 h-px bg-[hsl(var(--bone)_/_0.14)]" />
    </div>
  );
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
      const payload = resp as SharePayload;
      applyShareBranding(payload.branding);
      setData(payload);
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
      <div className="editorial-page-dark min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (notFound || !data) {
    return (
      <div className="editorial-page-dark min-h-screen bg-background flex items-center justify-center px-6">
        <div className="text-center space-y-2 max-w-sm">
          <FileText className="w-12 h-12 text-muted-foreground mx-auto" />
          <h1 className="font-serif font-medium text-xl text-foreground">Link not found</h1>
          <p className="text-muted-foreground text-sm">
            This share link doesn't exist or has been revoked.
          </p>
        </div>
      </div>
    );
  }

  // ── Script detail view ────────────────────────────────────────────────────
  if (openScript) {
    // Render the script as a block document: section heading + colored lines,
    // grouped by section role in hook → body → cta order (matches the editor).
    const sectionOrder: ScriptLine["section"][] = [];
    for (const l of openScript.lines) {
      if (!sectionOrder.includes(l.section)) sectionOrder.push(l.section);
    }
    const presetFormat = SCRIPT_FORMATS.find((f) => f.label === openScript.formato);
    const FormatIcon = presetFormat?.icon;

    return (
      <div className="editorial-page-dark min-h-screen bg-background">
        <header className="sticky top-0 z-20 border-b border-border/50 bg-background/90 backdrop-blur-xl">
          <div className="container mx-auto px-4 py-3 max-w-3xl flex items-center gap-2">
            <button
              onClick={() => setOpenScriptId(null)}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronLeft className="w-4 h-4" /> Back
            </button>
            <div className="ml-auto flex items-center gap-2">
              <FileText className="w-3.5 h-3.5" style={{ color: "hsl(var(--bone) / 0.55)" }} />
              <span className="editorial-eyebrow" style={{ letterSpacing: "0.20em", fontSize: 10 }}>Read-only</span>
            </div>
          </div>
        </header>

        <main className="container mx-auto px-4 py-8 max-w-3xl">
          {/* Winning Idea — flat editorial card (mirrors the editor chrome) */}
          <div className="editorial-card mb-4" style={{ padding: "20px 22px" }}>
            <h1
              style={{
                fontFamily: "var(--font-display, 'EB Garamond'), Georgia, serif",
                fontWeight: 500,
                fontSize: 22,
                letterSpacing: "-0.01em",
                lineHeight: 1.3,
                color: "hsl(var(--cream))",
              }}
            >
              {openScript.idea_ganadora || openScript.title || "Untitled"}
            </h1>
            {openScript.target && (
              <div className="mt-3 pt-3" style={{ borderTop: "1px solid hsl(var(--bone) / 0.10)" }}>
                <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/30 px-2.5 py-1 text-xs text-muted-foreground">
                  <span className="uppercase tracking-wider text-[9px] opacity-70">Target</span>
                  {openScript.target}
                </span>
              </div>
            )}
          </div>

          {/* Format */}
          {openScript.formato && (
            <div className="editorial-card p-5 mb-2">
              <div className="flex items-center gap-2 mb-3">
                <Clapperboard className="w-3.5 h-3.5" style={{ color: "hsl(var(--bone) / 0.55)" }} />
                <span className="editorial-eyebrow" style={{ letterSpacing: "0.20em", fontSize: 10 }}>Format</span>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-md border border-primary bg-primary/10 px-2.5 py-1.5 text-xs font-medium text-primary">
                {FormatIcon && <FormatIcon className="w-3.5 h-3.5 shrink-0" />}
                {openScript.formato}
              </span>
            </div>
          )}

          {/* Script document */}
          {openScript.lines.length > 0 ? (
            <div className="editorial-card p-5 mt-2">
              {sectionOrder.map((section) => (
                <div key={section}>
                  <SectionHeading label={defaultSectionLabel(section)} />
                  {openScript.lines
                    .filter((l) => l.section === section)
                    .map((line, i) => <ReaderLine key={`${section}-${i}`} line={line} />)}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">This script has no content yet.</p>
          )}
        </main>
      </div>
    );
  }

  // ── Folder feed view ──────────────────────────────────────────────────────
  return (
    <div className="editorial-page-dark min-h-screen bg-background">
      <header className="border-b border-border/50 bg-background/90 backdrop-blur-xl">
        <div className="container mx-auto px-4 py-4 max-w-3xl">
          <div className="flex items-center gap-2 mb-1">
            <FileText className="w-3.5 h-3.5" style={{ color: "hsl(var(--bone) / 0.55)" }} />
            <span className="editorial-eyebrow" style={{ letterSpacing: "0.20em", fontSize: 10 }}>Shared scripts · Read-only</span>
          </div>
          <h1 className="font-serif font-medium text-xl text-foreground flex items-center gap-2">
            <FolderOpen className="w-5 h-5" style={{ color: "hsl(var(--aqua))" }} />
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
                  className="editorial-card flex flex-col items-start gap-2 p-4 text-left"
                >
                  <Folder className="w-6 h-6" style={{ color: "hsl(var(--aqua) / 0.8)" }} />
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
                  className="editorial-card w-full flex flex-col gap-2 p-4 text-left group"
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 p-1.5 rounded-lg bg-primary/10 border border-primary/20 shrink-0">
                      <FileText className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-serif font-semibold text-foreground text-base leading-snug">{s.title || "Untitled"}</h3>
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
                    <ChevronRight className="w-4 h-4 text-muted-foreground/50 group-hover:text-foreground transition-colors shrink-0 mt-1" />
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
