import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Film, Mic, Scissors, Loader2, FileText, MonitorPlay } from "lucide-react";
import { WinningIdeaBlock } from "@/components/scripts/WinningIdeaBlock";
import { useLanguage } from "@/hooks/useLanguage";
import { t, tr } from "@/i18n/translations";

type ScriptLine = {
  line_type: "filming" | "actor" | "editor" | "text_on_screen";
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
  filming: { labelKey: t.scripts.filmingInstructions, icon: Film, color: "text-orange-400", bg: "bg-gradient-to-br from-orange-500/10 to-orange-900/5", border: "border-orange-500/25" },
  actor: { labelKey: t.scripts.voiceoverDialogue, icon: Mic, color: "text-[#22d3ee]", bg: "bg-gradient-to-br from-[rgba(8,145,178,0.1)] to-[rgba(8,145,178,0.02)]", border: "border-[rgba(8,145,178,0.25)]" },
  editor: { labelKey: t.scripts.editingInstructions, icon: Scissors, color: "text-[#a3e635]", bg: "bg-gradient-to-br from-[rgba(132,204,22,0.08)] to-[rgba(132,204,22,0.02)]", border: "border-[rgba(132,204,22,0.2)]" },
  text_on_screen: { labelKey: t.scripts.textOnScreen, icon: MonitorPlay, color: "text-[#94a3b8]", bg: "bg-gradient-to-br from-[rgba(148,163,184,0.06)] to-[rgba(148,163,184,0.02)]", border: "border-[rgba(148,163,184,0.15)]" },
};

export default function PublicScript() {
  const { id } = useParams<{ id: string }>();
  const { language } = useLanguage();
  const [script, setScript] = useState<ScriptData | null>(null);
  const [lines, setLines] = useState<ScriptLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) { setNotFound(true); setLoading(false); return; }
    const run = async () => {
      const { data, error } = await supabase.functions.invoke("get-public-script", {
        body: { id },
      });
      if (error || !data || data.error) { setNotFound(true); setLoading(false); return; }
      setScript(data.script as ScriptData);
      setLines((data.lines || []) as ScriptLine[]);
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

  const sectionLabels = { hook: "Hook", body: "Body", cta: "CTA" };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-card/50 to-background" style={{ fontFamily: "Arial, sans-serif" }}>
      <header className="border-b border-border/50 bg-gradient-to-r from-background/90 to-card/90 backdrop-blur-xl">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            <span className="text-sm font-semibold text-primary uppercase tracking-wider">{tr(t.scripts.readOnly, language)}</span>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-3xl">
        {/* Winning Idea block — promoted as the header */}
        <div className="mb-6">
          <WinningIdeaBlock
            idea={script.idea_ganadora || script.title}
            hasIdea={!!script.idea_ganadora}
            target={script.target}
            format={script.formato}
            inspirationUrl={script.inspiration_url}
            variant="detail"
          />
          {script.idea_ganadora && script.title && script.title !== script.idea_ganadora && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              {script.title}
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
                        <span className={`text-xs font-semibold uppercase tracking-wider ${cfg.color}`}>{tr(cfg.labelKey, language)}</span>
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
