import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Film, Mic, Scissors, Loader2, FileText } from "lucide-react";

type ScriptLine = {
  line_type: "filming" | "actor" | "editor";
  section: "hook" | "body" | "cta";
  text: string;
};

type ScriptData = {
  title: string;
  idea_ganadora: string | null;
  target: string | null;
  formato: string | null;
  inspiration_url: string | null;
};

const typeConfig = {
  filming: { label: "Instrucciones de Filmación", icon: Film, color: "text-red-400", bg: "bg-gradient-to-br from-red-500/25 to-red-900/10", border: "border-red-500/40" },
  actor: { label: "Voiceover / Diálogo", icon: Mic, color: "text-purple-400", bg: "bg-gradient-to-br from-purple-500/25 to-purple-900/10", border: "border-purple-500/40" },
  editor: { label: "Instrucciones de Edición", icon: Scissors, color: "text-emerald-400", bg: "bg-gradient-to-br from-emerald-500/25 to-emerald-900/10", border: "border-emerald-500/40" },
};

export default function PublicScript() {
  const { id } = useParams<{ id: string }>();
  const [script, setScript] = useState<ScriptData | null>(null);
  const [lines, setLines] = useState<ScriptLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) { setNotFound(true); setLoading(false); return; }
    const fetch = async () => {
      const { data: s, error: sErr } = await supabase
        .from("scripts")
        .select("title, idea_ganadora, target, formato, inspiration_url")
        .eq("id", id)
        .is("deleted_at", null)
        .maybeSingle();
      if (sErr || !s) { setNotFound(true); setLoading(false); return; }
      setScript(s);

      const { data: l } = await supabase
        .from("script_lines")
        .select("line_type, text, section")
        .eq("script_id", id)
        .order("line_number");
      setLines((l || []) as ScriptLine[]);
      setLoading(false);
    };
    fetch();
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
          <h1 className="text-xl font-bold text-foreground">Script no encontrado</h1>
          <p className="text-muted-foreground text-sm">Este script no existe o fue eliminado.</p>
        </div>
      </div>
    );
  }

  const sectionLabels = { hook: "Hook", body: "Body", cta: "CTA" };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-card/50 to-background" style={{ fontFamily: "Arial, sans-serif" }}>
      <header className="border-b border-border/50 bg-gradient-to-r from-background/90 to-card/90 backdrop-blur-xl">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            <span className="text-sm font-semibold text-primary uppercase tracking-wider">Script (Solo lectura)</span>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-3xl">
        {/* Metadata */}
        <div className="mb-6 space-y-1 p-4 rounded-2xl bg-gradient-to-br from-card via-card to-muted/30 border border-border">
          {script.idea_ganadora && (
            <p className="text-sm text-foreground">
              <span className="font-semibold text-amber-400">Idea Ganadora:</span> {script.idea_ganadora}
            </p>
          )}
          {script.target && (
            <p className="text-sm text-foreground">
              <span className="font-semibold text-red-400">Target:</span> {script.target}
            </p>
          )}
          {script.formato && (
            <p className="text-sm text-foreground">
              <span className="font-semibold text-violet-400">Formato:</span> {script.formato}
            </p>
          )}
          {script.inspiration_url && (
            <p className="text-sm text-foreground">
              <span className="font-semibold text-blue-400">Inspiración:</span>{" "}
              <a href={script.inspiration_url} target="_blank" rel="noopener noreferrer" className="underline hover:opacity-80">
                {script.inspiration_url}
              </a>
            </p>
          )}
        </div>

        {/* Lines grouped by section */}
        {(["hook", "body", "cta"] as const).map((section) => {
          const sectionLines = lines.filter((l) => l.section === section);
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
                        <p className="mt-1 text-sm leading-relaxed text-foreground">{line.text}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </main>
    </div>
  );
}
