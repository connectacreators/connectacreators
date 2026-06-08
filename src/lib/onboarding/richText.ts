// Helpers for the onboarding form's rich-text (B/I/U) long-response fields and
// the "profiles to emulate" repeater.
//
// Long responses are stored as a small, sanitized HTML string (only <b> <strong>
// <i> <em> <u> <br> and <div>/<p> line wrappers survive). This keeps bold/italic/
// underline while staying a superset of the old plain-text values — existing
// answers render unchanged. Downstream consumers that want plain text call
// stripHtml().

const ALLOWED_TAGS = new Set(["B", "STRONG", "I", "EM", "U", "BR", "DIV", "P"]);

/**
 * Strip all HTML down to plain text with line breaks preserved. Used by the
 * non-editing display surfaces (canvas node previews, strategy page, AI prompts).
 * Safe on plain strings (returns them unchanged) and on null/undefined.
 */
export function stripHtml(value: unknown): string {
  if (value == null) return "";
  const str = String(value);
  if (!str.includes("<")) return str; // fast path: already plain text
  if (typeof document === "undefined") {
    // SSR / edge fallback: crude tag strip.
    return str
      .replace(/<\s*br\s*\/?>/gi, "\n")
      .replace(/<\/(div|p)>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/gi, " ")
      .trim();
  }
  const tmp = document.createElement("div");
  tmp.innerHTML = str;
  // Convert block boundaries to newlines before reading textContent.
  tmp.querySelectorAll("br").forEach((br) => br.replaceWith("\n"));
  tmp.querySelectorAll("div,p").forEach((el) => el.append("\n"));
  return (tmp.textContent || "").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Sanitize editor HTML to the small allowlist above. Runs in the browser only
 * (uses the DOM). Removes scripts, styles, attributes, and any disallowed tag
 * while keeping its text content.
 */
export function sanitizeRichText(html: string): string {
  if (typeof document === "undefined") return html;
  const tmp = document.createElement("div");
  tmp.innerHTML = html;

  const walk = (node: Node) => {
    const children = Array.from(node.childNodes);
    for (const child of children) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as HTMLElement;
        if (!ALLOWED_TAGS.has(el.tagName)) {
          // Replace the disallowed element with its (sanitized) children.
          walk(el);
          el.replaceWith(...Array.from(el.childNodes));
          continue;
        }
        // Strip every attribute (no inline styles, classes, event handlers).
        for (const attr of Array.from(el.attributes)) el.removeAttribute(attr.name);
        walk(el);
      }
    }
  };
  walk(tmp);
  return tmp.innerHTML;
}

/** True when sanitized rich-text has no visible characters (only tags/whitespace). */
export function isRichTextEmpty(html: unknown): boolean {
  return stripHtml(html).trim().length === 0;
}

// ─── Profiles-to-emulate: stored as string[] but tolerant of legacy strings ───

/** Normalize any stored value (legacy newline/comma string, or array) to a string[]. */
export function toProfilesArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v ?? ""));
  if (typeof value === "string") {
    return value
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

/** Join profiles into a human/AI-readable plain string (used by downstream readers). */
export function profilesToText(value: unknown, separator = "\n"): string {
  return toProfilesArray(value).filter(Boolean).join(separator);
}

/**
 * Split a spoken/typed phrase into list items — used by FAST mode's profiles
 * card so "Gary Vee, Alex Hormozi and Sam Sulek" becomes three entries.
 * Splits on commas, semicolons, newlines, and the whole word "and".
 */
export function parseSpokenList(text: string): string[] {
  return String(text || "")
    .split(/,|;|\n|\band\b/gi)
    .map((s) => s.trim())
    .filter(Boolean);
}
