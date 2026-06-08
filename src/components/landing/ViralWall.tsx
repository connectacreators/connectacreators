/**
 * ViralWall — a horizontally-scrolling wall of real viral video thumbnails.
 * Purely presentational. Two variants:
 *
 *   "band"        (default) — a full-width foreground strip that lives in its
 *                 own section. Full colour, view-count badges on show, edges
 *                 faded horizontally. The proud "wall of hits".
 *   "background"  — dimmed/greyed layer that tiles behind hero content, with a
 *                 vertical fade mask. (Kept available; not currently used.)
 *
 * Assets live in /public/viral-wall/01.jpg … 21.jpg (optimized ~320px JPEGs,
 * view-count badges baked into each cover). Each row duplicates its image set
 * so the le-marquee translateX(-50%) loop is seamless. Rows alternate direction
 * and run at slightly different speeds. Frozen under prefers-reduced-motion
 * (see src/landing.css). Decorative only — aria-hidden.
 */

const COUNT = 21;
const IMAGES = Array.from(
  { length: COUNT },
  (_, i) => `/viral-wall/${String(i + 1).padStart(2, "0")}.jpg`,
);

// Offset each row so the same covers don't stack in a vertical column.
function rotate<T>(arr: T[], n: number): T[] {
  const k = ((n % arr.length) + arr.length) % arr.length;
  return [...arr.slice(k), ...arr.slice(0, k)];
}

type Variant = "band" | "background";

export default function ViralWall({
  rows = 2,
  variant = "band",
}: {
  rows?: number;
  variant?: Variant;
}) {
  return (
    <div className={`viral-wall viral-wall--${variant}`} aria-hidden="true">
      {Array.from({ length: rows }).map((_, r) => {
        const imgs = rotate(IMAGES, r * 5);
        // Slow, calm drift — reads as ambient motion, not a ticker.
        const duration = 64 + r * 9;
        return (
          <div
            key={r}
            className={`viral-wall-row${r % 2 ? " rev" : ""}`}
            style={{ animationDuration: `${duration}s` }}
          >
            {[...imgs, ...imgs].map((src, i) => (
              <img
                key={i}
                src={src}
                className="viral-wall-thumb"
                /* Eager, NOT lazy: the row is ~3,800px wide and most thumbs sit
                   off-screen, moved into view only by the CSS translateX marquee.
                   Lazy-load doesn't fire for images revealed by a transform, so on
                   narrow (mobile) viewports all but the first few stayed blank.
                   Only 21 unique ~50KB JPEGs (the duplicate set is cache hits). */
                loading="eager"
                decoding="async"
                draggable={false}
                alt=""
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}
