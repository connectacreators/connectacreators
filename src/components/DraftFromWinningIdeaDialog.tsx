// src/components/DraftFromWinningIdeaDialog.tsx
//
// "Draft script from winning idea": generates a full Hook/Body/CTA draft
// using the canvas templatize-script engine —
//   CONTENT  ← the winning-idea video's analysis (what the script is about)
//   STRUCTURE ← the "How to film & edit" format reference's transcript
//               (falls back to the winning idea's own structure when no
//                format reference is attached/analyzed)
//
// Destructive by design: it REPLACES the current document. The user must
// confirm, and the current persisted version is force-snapshotted into
// History first so it's always restorable.

import { useEffect, useState } from "react";
import { Loader2, Wand2, AlertTriangle, History as HistoryIcon } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { videoUrlLookupVariants } from "@/lib/canonicalize-video-url";
import { forceVersionSnapshot, type ScriptLine } from "@/hooks/useScripts";
import { useOutOfCredits } from "@/contexts/OutOfCreditsContext";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

interface VideoInfo {
  transcript: string | null;
  hook_text: string | null;
  analysis_status: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  scriptId: string;
  scriptTitle: string;
  inspirationUrl: string | null;
  formatReferenceUrl: string | null;
  language: "en" | "es";
  /** Receives the generated flat lines; the parent replaces the document. */
  onApply: (lines: ScriptLine[]) => void;
}

async function fetchVideo(url: string | null): Promise<VideoInfo | null> {
  if (!url) return null;
  // Match every URL spelling the row might be stored under (IG /p/ vs /reel/).
  const variants = videoUrlLookupVariants(url);
  if (variants.length === 0) return null;
  const { data } = await supabase
    .from("viral_videos")
    .select("transcript, hook_text, analysis_status")
    .in("video_url", variants)
    .order("transcript", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  return (data as VideoInfo) ?? null;
}

export function DraftFromWinningIdeaDialog({
  open, onClose, scriptId, scriptTitle, inspirationUrl, formatReferenceUrl, language, onApply,
}: Props) {
  const { showOutOfCreditsModal } = useOutOfCredits();
  const [checking, setChecking] = useState(false);
  const [idea, setIdea] = useState<VideoInfo | null>(null);
  const [formatRef, setFormatRef] = useState<VideoInfo | null>(null);
  const [working, setWorking] = useState<string | null>(null);
  // Free-form user context passed to the generator as extra instructions.
  // Survives close/reopen for the same script; clears when switching scripts.
  const [notes, setNotes] = useState("");
  useEffect(() => {
    setNotes("");
  }, [scriptId]);

  // Look up both videos' analyses when the dialog opens.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setChecking(true);
    Promise.all([fetchVideo(inspirationUrl), fetchVideo(formatReferenceUrl)]).then(([i, f]) => {
      if (cancelled) return;
      setIdea(i);
      setFormatRef(f);
      setChecking(false);
    });
    return () => {
      cancelled = true;
    };
  }, [open, inspirationUrl, formatReferenceUrl]);

  const ideaReady = !!idea?.transcript?.trim();
  const formatReady = !!formatRef?.transcript?.trim();
  // Structure template: format reference when available, else the idea itself.
  const structureSource: "format" | "idea" | null = formatReady ? "format" : ideaReady ? "idea" : null;

  const run = async () => {
    if (!ideaReady || !structureSource) return;
    try {
      // 1. Guaranteed restore point BEFORE anything is touched.
      setWorking(language === "es" ? "Guardando respaldo en el historial…" : "Backing up current version to History…");
      await forceVersionSnapshot(scriptId);

      // 2. Generate: structure from the chosen template, content from the idea.
      setWorking(language === "es" ? "Redactando el borrador…" : "Drafting the script…");
      const structureTranscript = structureSource === "format" ? formatRef!.transcript! : idea!.transcript!;
      let topic =
        structureSource === "format"
          ? `${scriptTitle}. Content source — the winning video says: "${(idea!.hook_text ?? "").slice(0, 200)}" — ${idea!.transcript!.slice(0, 600)}`
          : scriptTitle;
      if (notes.trim()) {
        topic += `\n\nADDITIONAL CONTEXT / REQUESTS FROM THE USER (follow these): ${notes.trim().slice(0, 800)}`;
      }

      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-build-script`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({
          step: "templatize-script",
          topic,
          transcription: structureTranscript,
          language,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (json.insufficient_credits) {
          showOutOfCreditsModal();
          return;
        }
        throw new Error(json.error || "Generation failed");
      }
      const lines = (json.lines ?? []) as ScriptLine[];
      if (lines.length === 0) throw new Error("The generator returned an empty script");

      onApply(lines);
      onClose();
      toast.success(
        language === "es"
          ? "Borrador listo — revísalo y guarda. La versión anterior está en el Historial."
          : "Draft ready — review and Save. Your previous version is in History.",
        { duration: 8000 },
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to draft the script");
    } finally {
      setWorking(null);
    }
  };

  const t = (en: string, es: string) => (language === "es" ? es : en);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !working && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="w-4 h-4 text-primary" />
            {t("Draft script from winning idea", "Redactar script desde la idea ganadora")}
          </DialogTitle>
          <DialogDescription>
            {t(
              "Writes a complete Hook / Body / CTA draft: the content comes from the winning idea, structured like your film & edit reference.",
              "Escribe un borrador completo de Hook / Body / CTA: el contenido viene de la idea ganadora, con la estructura de tu referencia de formato.",
            )}
          </DialogDescription>
        </DialogHeader>

        {checking ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> {t("Checking video analyses…", "Verificando análisis de los videos…")}
          </div>
        ) : working ? (
          <div className="flex items-center gap-2 py-6 text-sm text-foreground">
            <Loader2 className="w-4 h-4 animate-spin text-primary" /> {working}
          </div>
        ) : !inspirationUrl ? (
          <p className="py-4 text-sm text-muted-foreground">
            {t("Add a winning-idea video to the script first.", "Primero agrega un video de idea ganadora al script.")}
          </p>
        ) : !ideaReady ? (
          <div className="py-2 space-y-2 text-sm">
            <p className="flex items-start gap-1.5 text-amber-500">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              {t(
                "The winning-idea video hasn't been analyzed yet — open it (play button) and hit Analyze first, then come back.",
                "El video de la idea ganadora aún no está analizado — ábrelo (botón de play) y presiona Analizar primero, luego vuelve.",
              )}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <ul className="text-sm text-muted-foreground space-y-1.5">
              <li>
                💡 {t("Content from the winning idea video", "Contenido del video de idea ganadora")}
              </li>
              <li>
                🎬{" "}
                {structureSource === "format"
                  ? t("Structure from your film & edit reference", "Estructura de tu referencia de formato")
                  : t("No analyzed format reference — using the winning idea's own structure", "Sin referencia de formato analizada — se usa la estructura de la propia idea ganadora")}
              </li>
              <li className="flex items-center gap-1.5">
                <HistoryIcon className="w-3.5 h-3.5" />
                {t("Current version is backed up to History first", "La versión actual se respalda primero en el Historial")}
              </li>
            </ul>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder={t(
                "Add any additional info, notes, requests, context etc…",
                "Agrega información adicional, notas, peticiones, contexto, etc…",
              )}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
            />
            <div className="rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2 text-xs text-destructive">
              {t(
                "This REPLACES the whole script document. You can restore the previous version from History at any time.",
                "Esto REEMPLAZA todo el documento del script. Puedes restaurar la versión anterior desde el Historial en cualquier momento.",
              )}
            </div>
            <div className="flex items-center justify-between pt-1">
              <span className="text-[11px] text-muted-foreground">{t("50 credits", "50 créditos")}</span>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={onClose}>
                  {t("Cancel", "Cancelar")}
                </Button>
                <Button size="sm" onClick={run} className="gap-1.5">
                  <Wand2 className="w-3.5 h-3.5" />
                  {t("Draft it", "Redactar")}
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
