import { Mic, Video, Users, Grid3X3, type LucideIcon } from "lucide-react";

// ==================== SCRIPT FORMATS ====================
// Shared source of truth for the preset script formats. Consumed by the
// AI Script Wizard (format picker) and the script editor's FORMAT card.
// `label` is the canonical value persisted to scripts.formato.
export type ScriptFormat = {
  id: string;
  icon: LucideIcon;
  label: string;
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
    description: { en: "Direct-to-camera monologue", es: "Monólogo directo a cámara" },
    color: "from-[hsl(var(--aqua) / 0.12)] to-[hsl(var(--aqua) / 0.06)] border-[hsl(var(--aqua) / 0.35)]",
    activeColor: "from-[hsl(var(--aqua) / 0.30)] to-[hsl(var(--aqua) / 0.20)] border-[hsl(var(--aqua) / 0.60)]",
    iconColor: "text-[hsl(var(--aqua))]",
  },
  {
    id: "broll_caption",
    icon: Video,
    label: "B-ROLL CAPTION",
    description: { en: "Voiceover with B-roll footage", es: "Voz en off con imágenes de apoyo" },
    color: "from-[hsl(var(--aqua) / 0.12)] to-[hsl(var(--aqua) / 0.06)] border-[hsl(var(--aqua) / 0.35)]",
    activeColor: "from-[hsl(var(--aqua) / 0.30)] to-[hsl(var(--aqua) / 0.20)] border-[hsl(var(--aqua) / 0.60)]",
    iconColor: "text-[hsl(var(--aqua))]",
  },
  {
    id: "entrevista",
    icon: Users,
    label: "ENTREVISTA",
    description: { en: "Interview / Q&A format", es: "Formato de entrevista / Q&A" },
    color: "from-[hsl(var(--aqua) / 0.12)] to-[hsl(var(--aqua) / 0.06)] border-[hsl(var(--aqua) / 0.35)]",
    activeColor: "from-[hsl(var(--aqua) / 0.30)] to-[hsl(var(--aqua) / 0.20)] border-[hsl(var(--aqua) / 0.60)]",
    iconColor: "text-[hsl(var(--aqua))]",
  },
  {
    id: "variado",
    icon: Grid3X3,
    label: "VARIADO",
    description: { en: "Mixed format & transitions", es: "Formato mixto con transiciones" },
    color: "from-[hsl(var(--aqua) / 0.12)] to-[hsl(var(--aqua) / 0.06)] border-[hsl(var(--aqua) / 0.35)]",
    activeColor: "from-[hsl(var(--aqua) / 0.30)] to-[hsl(var(--aqua) / 0.20)] border-[hsl(var(--aqua) / 0.60)]",
    iconColor: "text-[hsl(var(--aqua))]",
  },
];
