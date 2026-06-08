import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, FileText, Eye, Play, Clapperboard, MessageSquare } from "lucide-react";
import DOMPurify from "dompurify";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { InspirationVideoEmbed } from "@/components/video/InspirationVideoEmbed";
import { SCRIPT_FORMATS } from "@/lib/scriptFormats";
import { TYPE_BAR_CLASS, TYPE_TEXT_CLASS } from "@/lib/scriptLineTypes";
import { defaultSectionLabel } from "@/lib/scriptBlocks";
import { useLanguage } from "@/hooks/useLanguage";
import { t, tr } from "@/i18n/translations";

type Block = {
  line_type: "filming" | "actor" | "editor" | "text_on_screen";
  section: string;
  text: string;
  rich_text?: string | null;
  line_number: number;
  block_kind: "line" | "heading";
};

type ScriptData = {
  title: string;
  idea_ganadora: string | null;
  target: string | null;
  formato: string | null;
  format_reference_url: string | null;
  inspiration_url: string | null;
  inspiration_urls: string[] | null;
  caption: string | null;
};

// Read-only line: thin type-colored bar + type-colored text (mirrors the editor).
function ReaderLine({ block }: { block: Block }) {
  return (
    <div className="flex items-stretch gap-3 py-1.5">
      <div className={`w-[2px] rounded-full shrink-0 ${TYPE_BAR_CLASS[block.line_type]}`} />
      <div className={`flex-1 min-w-0 text-sm leading-relaxed ${TYPE_TEXT_CLASS[block.line_type]}`}>
        {block.rich_text ? (
          <span dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(block.rich_text) }} />
        ) : (
          block.text
        )}
      </div>
    </div>
  );
}

function SectionHeading({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2.5 mt-6 mb-2">
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

export default function PublicScript() {
  const { id } = useParams<{ id: string }>();
  const { language } = useLanguage();
  const [script, setScript] = useState<ScriptData | null>(null);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!id) { setNotFound(true); setLoading(false); return; }
    const run = async () => {
      const { data, error } = await supabase.functions.invoke("get-public-script", { body: { id } });
      if (error || !data || data.error) { setNotFound(true); setLoading(false); return; }
      setScript(data.script as ScriptData);
      setBlocks(((data.lines || []) as Block[]).map((b) => ({ ...b, block_kind: b.block_kind ?? "line" })));
      setLoading(false);
    };
    run();
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (notFound || !script) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-2">
          <FileText className="w-12 h-12 text-muted-foreground mx-auto" />
          <h1 className="text-xl font-bold text-foreground">{tr(t.scripts.scriptNotFound, language)}</h1>
          <p className="text-muted-foreground text-sm">{tr(t.scripts.scriptNotFoundDesc, language)}</p>
        </div>
      </div>
    );
  }

  const inspirationUrls =
    script.inspiration_urls && script.inspiration_urls.length
      ? script.inspiration_urls
      : (script.inspiration_url ? [script.inspiration_url] : []);

  const presetFormat = SCRIPT_FORMATS.find((f) => f.label === script.formato);
  const FormatIcon = presetFormat?.icon;

  // Render the block document in order. Heading blocks become section labels; content
  // lines render colored. If the script has no heading rows, fall back to grouping by
  // section role (hook/body/cta) with default labels — matches the unified editor.
  const hasHeadings = blocks.some((b) => b.block_kind === "heading");
  let documentBody: JSX.Element[] = [];
  if (hasHeadings) {
    documentBody = blocks.map((b, i) =>
      b.block_kind === "heading"
        ? <SectionHeading key={i} label={b.text || defaultSectionLabel(b.section)} />
        : <ReaderLine key={i} block={b} />
    );
  } else {
    const lines = blocks.filter((b) => b.block_kind !== "heading");
    const order: string[] = [];
    for (const l of lines) if (!order.includes(l.section)) order.push(l.section);
    documentBody = order.flatMap((sec) => [
      <SectionHeading key={`h-${sec}`} label={defaultSectionLabel(sec)} />,
      ...lines.filter((l) => l.section === sec).map((l, i) => <ReaderLine key={`${sec}-${i}`} block={l} />),
    ]);
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/50 bg-card/40 backdrop-blur-xl">
        <div className="container mx-auto px-4 py-4 max-w-3xl">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            <span className="text-sm font-semibold text-primary uppercase tracking-wider">{tr(t.scripts.readOnly, language)}</span>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-3xl">
        {/* Winning Idea */}
        <div className="editorial-card mb-4" style={{ padding: "20px 22px" }}>
          <h2 style={{ fontFamily: "var(--font-display, 'EB Garamond'), Georgia, serif", fontWeight: 500, fontSize: 22, letterSpacing: "-0.01em", lineHeight: 1.3, color: "hsl(var(--cream))" }}>
            {script.idea_ganadora || script.title || "Untitled"}
          </h2>
          {script.target && (
            <div className="mt-3 pt-3" style={{ borderTop: "1px solid hsl(var(--bone) / 0.10)" }}>
              <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/30 px-2.5 py-1 text-xs text-muted-foreground">
                <span className="uppercase tracking-wider text-[9px] opacity-70">{tr(t.scripts.target, language)}</span>
                {script.target}
              </span>
            </div>
          )}
        </div>

        {/* Format */}
        {(script.formato || script.format_reference_url) && (
          <div className="editorial-card p-5 mb-2">
            <div className="flex items-center gap-2 mb-3">
              <Clapperboard className="w-3.5 h-3.5" style={{ color: "hsl(var(--bone) / 0.55)" }} />
              <span className="editorial-eyebrow" style={{ letterSpacing: "0.20em", fontSize: 10 }}>{tr({ en: "Format", es: "Formato" }, language)}</span>
            </div>
            {script.formato && (
              <span className="inline-flex items-center gap-1.5 rounded-md border border-primary bg-primary/10 px-2.5 py-1.5 text-xs font-medium text-primary">
                {FormatIcon && <FormatIcon className="w-3.5 h-3.5 shrink-0" />}
                {script.formato}
              </span>
            )}
            {script.format_reference_url && (
              <div className="mt-3">
                <button
                  onClick={() => setPreviewUrl(script.format_reference_url)}
                  className="group flex items-center gap-2 min-w-0 w-full rounded-md border border-border bg-muted/30 hover:bg-muted/50 px-2.5 py-1.5 text-left transition-colors"
                  title={tr({ en: "View format reference", es: "Ver referencia de formato" }, language)}
                >
                  <Play className="w-3.5 h-3.5 shrink-0 text-muted-foreground group-hover:text-primary transition-colors" />
                  <span className="text-xs text-muted-foreground truncate">{script.format_reference_url.replace(/^https?:\/\//, "")}</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* Inspiration */}
        {inspirationUrls.length > 0 && (
          <div className="editorial-card p-5 mb-2">
            <div className="flex items-center gap-2 mb-3">
              <Eye className="w-3.5 h-3.5" style={{ color: "hsl(var(--bone) / 0.55)" }} />
              <span className="editorial-eyebrow" style={{ letterSpacing: "0.20em", fontSize: 10 }}>{tr(t.scripts.inspiration, language)}</span>
            </div>
            <div className="flex flex-col gap-2">
              {inspirationUrls.map((url, idx) => (
                <button
                  key={idx}
                  onClick={() => setPreviewUrl(url)}
                  className="group flex items-center gap-2 min-w-0 rounded-md border border-border bg-muted/30 hover:bg-muted/50 px-2.5 py-1.5 text-left transition-colors"
                  title={tr({ en: "Watch inspiration", es: "Ver inspiración" }, language)}
                >
                  <Play className="w-3.5 h-3.5 shrink-0 text-muted-foreground group-hover:text-primary transition-colors" />
                  <span className="text-xs text-muted-foreground truncate">{url.replace(/^https?:\/\//, "")}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Caption */}
        {script.caption && (
          <div className="editorial-card p-5 mb-2">
            <div className="flex items-center gap-2 mb-3">
              <MessageSquare className="w-3.5 h-3.5" style={{ color: "hsl(var(--bone) / 0.55)" }} />
              <span className="editorial-eyebrow" style={{ letterSpacing: "0.20em", fontSize: 10 }}>{tr({ en: "Caption", es: "Caption" }, language)}</span>
            </div>
            <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: "hsl(var(--bone) / 0.85)" }}>{script.caption}</p>
          </div>
        )}

        {/* Script document */}
        <div className="editorial-card p-5 mt-2">
          {documentBody}
        </div>
      </main>

      <Dialog open={!!previewUrl} onOpenChange={(open) => { if (!open) setPreviewUrl(null); }}>
        <DialogContent className="max-w-3xl w-[95vw] p-0 overflow-hidden">
          <DialogHeader className="p-4 pb-0">
            <DialogTitle className="text-sm">{tr(t.scripts.inspiration, language)}</DialogTitle>
          </DialogHeader>
          <div className="p-4 pt-2">
            {previewUrl && <InspirationVideoEmbed url={previewUrl} />}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
