// src/lib/video-taxonomy.ts
// MIRROR of supabase/functions/_shared/video-taxonomy.ts
// Keep these in sync — any change here must also be made in the Deno file.

export const CONTENT_FORMATS = [
  { slug: "caption_post",   label: "Caption Post" },
  { slug: "storytelling",   label: "Storytelling" },
  { slug: "educational",    label: "Educational" },
  { slug: "comparison",     label: "Comparison" },
  { slug: "authority",      label: "Authority" },
  { slug: "reaction",       label: "Reaction" },
  { slug: "listicle",       label: "Listicle" },
  { slug: "tutorial",       label: "Tutorial" },
  { slug: "vlog",           label: "Vlog" },
  { slug: "selling",        label: "Selling" },
  { slug: "funny",          label: "Funny" },
] as const;

export type ContentFormat = typeof CONTENT_FORMATS[number]["slug"];

const FORMAT_SLUGS = new Set<string>(CONTENT_FORMATS.map((f) => f.slug));

export function isValidContentFormat(value: unknown): value is ContentFormat {
  return typeof value === "string" && FORMAT_SLUGS.has(value);
}

export const CANONICAL_NICHES = [
  "personal_branding", "fitness", "sales", "real_estate", "finance",
  "ecommerce", "coaching", "saas_tech", "beauty", "food",
  "mindset", "relationships", "education", "lifestyle", "parenting",
] as const;

const CANONICAL_NICHE_SET = new Set<string>(CANONICAL_NICHES);

/** True if a niche slug is one of the 15 canonical seeds. */
export function isCanonicalNiche(slug: string): boolean {
  return CANONICAL_NICHE_SET.has(slug);
}

/** snake_case slug → Title Case label for display. */
export function nicheLabel(slug: string): string {
  if (!slug) return "";
  return slug
    .split("_")
    .map((s) => (s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1)))
    .join(" ");
}
