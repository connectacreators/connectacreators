// supabase/functions/_shared/video-taxonomy.ts

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

/**
 * Coerce a raw niche string (possibly AI-invented) into a safe snake_case slug.
 * - Lowercases
 * - Trims whitespace
 * - Replaces internal whitespace runs with single underscores
 * - Strips non-alphanumeric (except underscores)
 * - Caps length at 50
 * Returns empty string for blank input.
 */
export function normalizeNicheSlug(raw: string | null | undefined): string {
  if (!raw || typeof raw !== "string") return "";
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return "";
  const collapsed = trimmed.replace(/\s+/g, "_");
  const cleaned = collapsed.replace(/[^a-z0-9_]/g, "");
  return cleaned.slice(0, 50);
}

/** snake_case slug → Title Case label for display. */
export function nicheLabel(slug: string): string {
  if (!slug) return "";
  return slug
    .split("_")
    .map((s) => (s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1)))
    .join(" ");
}
