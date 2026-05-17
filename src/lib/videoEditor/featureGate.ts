// src/lib/videoEditor/featureGate.ts

// Phase 1: dev-only. The env var must be set explicitly (no defaulting from DEV
// mode) so a contributor can toggle the editor off in their local build without
// editing this file.
//
// Phase 2 (rollout): replace this with an is_admin() check (or a hook that
// composes the env gate AND is_admin). For Phase 1, env-only is enough because
// only the spec author runs it.

export const IS_VIDEO_EDITOR_ENABLED =
  import.meta.env.VITE_FEATURE_VIDEO_EDITOR === "true";
