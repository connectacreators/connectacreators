import { Mic, Video, Users, Grid3X3, type LucideIcon } from "lucide-react";
import type { Language } from "@/hooks/useLanguage";

// ==================== SCRIPT FORMATS ====================
// Shared source of truth for the preset script formats. Consumed by the
// AI Script Wizard (format picker) and the script editor's FORMAT card.
// `label` is the canonical value persisted to scripts.formato — NEVER translate it.
// `localizedLabel` is what the UI shows, resolved per language via getFormatLabel().
export type ScriptFormat = {
  id: string;
  icon: LucideIcon;
  label: string;
  /** English UI label shown on the pill; falls back to `label`. `label` stays the persisted value. */
  display?: string;
  /** Language-aware display label. `label` is always the persisted (untranslated) value. */
  localizedLabel: { en: string; es: string };
  description: { en: string; es: string };
  color: string;
  activeColor: string;
  iconColor: string;
};

export const SCRIPT_FORMATS: ScriptFormat[] = [
  {
    id: "talking_head",
    icon: Mic,
    label: "TALKING HEAD",
    localizedLabel: { en: "TALKING HEAD", es: "TALKING HEAD" },
    description: { en: "Direct-to-camera monologue", es: "Monólogo directo a cámara" },
    color: "from-[hsl(var(--aqua) / 0.12)] to-[hsl(var(--aqua) / 0.06)] border-[hsl(var(--aqua) / 0.35)]",
    activeColor: "from-[hsl(var(--aqua) / 0.30)] to-[hsl(var(--aqua) / 0.20)] border-[hsl(var(--aqua) / 0.60)]",
    iconColor: "text-[hsl(var(--aqua))]",
  },
  {
    id: "broll_caption",
    icon: Video,
    label: "B-ROLL CAPTION",
    localizedLabel: { en: "B-ROLL CAPTION", es: "B-ROLL CAPTION" },
    description: { en: "Voiceover with B-roll footage", es: "Voz en off con imágenes de apoyo" },
    color: "from-[hsl(var(--aqua) / 0.12)] to-[hsl(var(--aqua) / 0.06)] border-[hsl(var(--aqua) / 0.35)]",
    activeColor: "from-[hsl(var(--aqua) / 0.30)] to-[hsl(var(--aqua) / 0.20)] border-[hsl(var(--aqua) / 0.60)]",
    iconColor: "text-[hsl(var(--aqua))]",
  },
  {
    id: "entrevista",
    icon: Users,
    label: "ENTREVISTA",
    display: "INTERVIEW",
    localizedLabel: { en: "INTERVIEW", es: "ENTREVISTA" },
    description: { en: "Interview / Q&A format", es: "Formato de entrevista / Q&A" },
    color: "from-[hsl(var(--aqua) / 0.12)] to-[hsl(var(--aqua) / 0.06)] border-[hsl(var(--aqua) / 0.35)]",
    activeColor: "from-[hsl(var(--aqua) / 0.30)] to-[hsl(var(--aqua) / 0.20)] border-[hsl(var(--aqua) / 0.60)]",
    iconColor: "text-[hsl(var(--aqua))]",
  },
  {
    id: "variado",
    icon: Grid3X3,
    label: "VARIADO",
    display: "MIXED",
    localizedLabel: { en: "MIXED", es: "VARIADO" },
    description: { en: "Mixed format & transitions", es: "Formato mixto con transiciones" },
    color: "from-[hsl(var(--aqua) / 0.12)] to-[hsl(var(--aqua) / 0.06)] border-[hsl(var(--aqua) / 0.35)]",
    activeColor: "from-[hsl(var(--aqua) / 0.30)] to-[hsl(var(--aqua) / 0.20)] border-[hsl(var(--aqua) / 0.60)]",
    iconColor: "text-[hsl(var(--aqua))]",
  },
];

/**
 * Resolve the display label for a persisted format value, in the given language.
 * `value` is the canonical scripts.formato string (e.g. "VARIADO"). Preset formats
 * map to their localized label ("VARIADO" -> "MIXED" in EN); custom/free-text
 * formats fall through unchanged so nothing is ever lost.
 */
export function getFormatLabel(value: string | null | undefined, lang: Language): string {
  const v = (value ?? "").trim();
  if (!v) return "";
  const fmt = SCRIPT_FORMATS.find((f) => f.label.toUpperCase() === v.toUpperCase());
  return fmt ? fmt.localizedLabel[lang] : v;
}
