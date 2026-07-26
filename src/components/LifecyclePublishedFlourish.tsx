import { memo } from "react";

/**
 * One-shot "landed on Published" flourish for a lifecycle badge: a
 * checkmark draws itself in beside the label, and a soft green glow blooms
 * beneath the badge shortly after (once the color crossfade has settled),
 * then drifts up and fades out.
 *
 * Purely presentational — mount it as the first child inside a badge whose
 * className includes `relative` (it needs a positioning context for the
 * glow). The caller controls its lifecycle: mount only while
 * useJustPublishedFlourish flags the row's id, and it'll finish playing
 * well within that window. See useJustPublishedFlourish for the "just
 * transitioned to Published, not on mount" detection and
 * prefers-reduced-motion handling (this component assumes the caller
 * already skipped mounting it when reduced motion is requested).
 */
function LifecyclePublishedFlourishBase() {
  return (
    <>
      {/* In-flow: sized as a normal flex item so the badge's existing
          `gap-*` utility spaces it from the label naturally. */}
      <svg viewBox="0 0 20 20" className="lifecycle-publish-check" aria-hidden="true">
        <path
          d="M4 10.5 8 14.5 16 5.5"
          fill="none"
          stroke="#7FB58A"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {/* Out-of-flow: absolutely centered behind the whole badge (its
          `relative` ancestor is the positioning context), independent of
          the checkmark's position in the flex row. */}
      <span className="lifecycle-publish-glow" aria-hidden="true" />
    </>
  );
}

export const LifecyclePublishedFlourish = memo(LifecyclePublishedFlourishBase);
