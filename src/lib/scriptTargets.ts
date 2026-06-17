import type { Language } from "@/hooks/useLanguage";

// Most `scripts.target` values are free-form audience descriptions written by
// the AI (e.g. "Spanish-speaking adults 45+ with neuropathy symptoms") and must
// be left exactly as stored. A small set of short, category-style values were
// saved in Spanish (Educativo, Salud, Viral, ...) and show up untranslated on an
// English page. Those — and "/"-combined variants like "Salud/Educativo" — get
// localized here. Anything that isn't fully composed of known categories passes
// through unchanged, so audience descriptions are never mangled.
const TARGET_CATEGORIES: Record<string, { en: string; es: string }> = {
  educativo: { en: "Educational", es: "Educativo" },
  educational: { en: "Educational", es: "Educativo" },
  viral: { en: "Viral", es: "Viral" },
  ventas: { en: "Sales", es: "Ventas" },
  venta: { en: "Sales", es: "Venta" },
  sales: { en: "Sales", es: "Ventas" },
  salud: { en: "Health", es: "Salud" },
  health: { en: "Health", es: "Salud" },
  entretenimiento: { en: "Entertainment", es: "Entretenimiento" },
  entertainment: { en: "Entertainment", es: "Entretenimiento" },
  inspiracional: { en: "Inspirational", es: "Inspiracional" },
  inspirational: { en: "Inspirational", es: "Inspiracional" },
  inmigrantes: { en: "Immigrants", es: "Inmigrantes" },
  hispanos: { en: "Hispanics", es: "Hispanos" },
  engagement: { en: "Engagement", es: "Engagement" },
  branding: { en: "Branding", es: "Branding" },
  awareness: { en: "Awareness", es: "Awareness" },
};

/**
 * Localize a script `target` value for display. If the value is composed
 * entirely of known short categories (optionally joined with "/"), it is
 * translated to `lang`; otherwise the original free-form value is returned
 * unchanged.
 */
export function getTargetLabel(value: string | null | undefined, lang: Language): string {
  const raw = (value ?? "").trim();
  if (!raw) return "";
  const segments = raw.split("/").map((p) => p.trim());
  const allKnown = segments.every((p) => TARGET_CATEGORIES[p.toLowerCase()]);
  if (!allKnown) return raw;
  return segments.map((p) => TARGET_CATEGORIES[p.toLowerCase()][lang]).join("/");
}
