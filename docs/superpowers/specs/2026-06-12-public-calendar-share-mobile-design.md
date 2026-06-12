# Public Content Calendar — Share Fix + Mobile-First Redesign

Date: 2026-06-12
Branch: `fix/public-calendar-share-mobile` (off `origin/main`)

## Problem

1. **Share button does nothing.** On the admin `/content-calendar` route, `handleSharePublicLink`
   reads `filterClientId` but it's missing from the `useCallback` dependency array. The memoized
   callback is frozen from the first render (`filterClientId === "all"`), so `shareId` always
   resolves to `null` and the handler returns silently. The button appears (its render condition
   re-evaluates with fresh state) but clicking copies nothing.

2. **Per-post share builds a dead link.** The post-detail modal's `handleShareLink` builds
   `/public/calendar/${post.id}` using the *post* id, but the public route queries `video_edits`
   by `client_id` → renders an empty calendar.

3. **Public "leave revisions" / "approve" silently fail.** Both call `update-post-status`, which
   hard-requires a `Bearer` JWT (returns 401 without one). A client opening the share link has no
   session → 401.

4. **Public view is not mobile-friendly.** Desktop calendar grid is the primary mobile element
   (cramped 7×6 grid, 1.5px dots); the agenda is buried below. Videos render 16:9 but the content
   is vertical reels → heavy letterboxing. Tap targets are tiny.

## Decisions (from user)

- **Revisions stay login-gated.** Public link is view-only for anyone without an account. The fix
  is to route non-authenticated viewers to login *gracefully* instead of silently 401-ing.
- **Full mobile-first redesign** of the public view.

## Design

### 1. Share button fix (`ContentCalendar.tsx`)
- Add `filterClientId` to `handleSharePublicLink` deps.
- Robust clipboard: `await navigator.clipboard.writeText`, fall back to a temp `<textarea>` +
  `execCommand('copy')`, and as a last resort surface the link in a long toast so it can still be
  sent. Show an explicit "Pick a client first" error when no client is resolved.
- Fix the per-post `handleShareLink` to deep-link the client's calendar:
  `/public/calendar/${post.client_id}?post=${post.id}`.

### 2. Mobile-first public view (`PublicContentCalendar.tsx`)
- **Responsive layout:** mobile is single-column with a segmented **Agenda | Calendar** toggle
  (Agenda default — it's what matters on a phone). Desktop (`md+`) shows both panes side-by-side
  and hides the toggle.
- **Agenda cards:** comfortable tap targets (status bar + title + date + play affordance when a
  video exists). Compact on the desktop sidebar.
- **Calendar grid:** taller cells on mobile (`min-h`), legible day numbers and status dots.
- **Post detail sheet:** portrait-friendly video container (`aspect-[9/16]`, capped height,
  centered) so vertical reels fill instead of letterbox. Drive → `iframe` preview; direct video
  URLs → `<video controls playsInline>`; otherwise a link. Larger, stacked action buttons on mobile.
- **Login-gated review:** detect auth via `supabase.auth.getSession()` + `onAuthStateChange`.
  - Authenticated → working Approve / Revisions buttons.
  - Not authenticated → a single prominent "Sign in to approve or request revisions" button →
    `/login?redirect=/public/calendar/:clientId` (returns to the calendar after login).
  - Download / View Script remain available to everyone.
- **Deep link:** read `?post=<id>` and auto-open that post once posts load.

## Out of scope
- No JWT-free public revision endpoint (login-gated per user decision).
- No share-token / link-obfuscation change (client UUIDs are random v4; low enumeration risk).

## Verification
- `tsc --noEmit` clean (CI runs no typecheck — type errors crash at runtime, so verify by exit code).
- `vite build` succeeds.
- Headless mobile render of `/public/calendar/<real client id>` at 390px width.

---

## Addendum (same day) — Share dialog + no-login review

Two follow-ups after live testing:

1. **Share button now opens a visible dialog** (not just a clipboard copy + toast).
   The admin clicked Share and "nothing popped up" — the toast-only feedback was
   too subtle. The button now opens a Share dialog showing the public URL, a Copy
   button, and Preview / WhatsApp / Email quick-send actions. Available on mobile too.

2. **Review is now NO-LOGIN** (reverses the earlier login-gate decision). Clients can
   approve / request revisions straight from the share link with no account.
   - New edge function `public-review-post` (`verify_jwt = false`, deployed via MCP —
     CI does not deploy edge functions). It is JWT-free but **validates post→client
     ownership server-side** before any write (wrong client_id → 404), and scopes the
     UPDATE to `id + client_id`. Mirrors `update-post-status`'s lifecycle/legacy mapping.
   - Optional reviewer name on the revision modal; stored as `"Name: notes"` in
     `revisions` for editor attribution.
   - Public view drops the login CTA and always shows Approve / Request Revisions for
     non-approved posts.

Verified: tsc clean, vite build clean; function tested for security gate (wrong
client → 404), valid approve/revision (DB write confirmed, then restored), and
missing-field validation (400); mobile render shows the no-login review buttons.

---

## Addendum 2 (same day) — video playback, always-revisions, dropdown scope

1. **Public video wouldn't play.** `video_edits.file_submission` is a bare Storage
   path (web proxy) in the private `footage-proxies` bucket (raw .mov originals live in
   `footage`); both are auth-only, so anon `<video src=path>` 404'd. New edge function
   `public-calendar-video` (`verify_jwt=false`, MCP-deployed) validates post→client
   ownership then service-role-signs a 1h URL, preferring `footage-proxies` (small mp4)
   → `footage` → `storage_path`. `VideoBlock` now resolves bare paths through it (Drive
   and direct http URLs still handled inline). Verified: signed URL serves video/mp4
   (HTTP 206), wrong client → 404, plays in headless (404x720, readyState 4).

2. **No way to leave revisions on a Scheduled post.** The review block hid all actions
   for Published/Scheduled. Request Revisions is now ALWAYS shown; Approve only when not
   already approved. Submitting a revision (via `public-review-post`) sets status →
   Needs Revisions, writes the note to `revisions`, and does NOT touch `schedule_date`,
   so it returns to the editing queue without rescheduling.

3. **Admin client dropdown scope.** The Content Calendar admin picker now lists only the
   admin's own client (`user_id = me`) plus active Connecta+ clients
   (`plan_type='connecta_plus' AND subscription_status='active'`) — currently Bravo
   Bonetti, Dr Calvin's Clinic, Spencer Barton.

---

## Addendum 3 (same day) — latest-version playback + V1/V2 toggle

**Public calendar showed an OLD version.** `video_edits.file_submission` mirrors a path that
exists in BOTH `footage` (the real submission) and `footage-proxies` (a small web proxy). When an
editor re-uploads with the same filename, `footage` updates but the proxy can lag — e.g. Insulin's
footage submission was 2026-06-12 04:24 while its proxy was 03:08 (1h16m stale). The signer
preferred the proxy → served the old video; the editing queue reads `footage` → showed the current
one. Fix: `public-calendar-video` now signs the FRESHEST copy (compares `footage` vs
`footage-proxies` object timestamps via storage `list`; newer wins, tie favours the lighter proxy),
file_submission before storage_path. Verified: Insulin now resolves to footage (24MB, latest);
Puffy Face still falls back to its proxy; headless render shows the current video (1080x1920).

**V1/V2 toggle was broken.** `VideoReviewModal` built versions as `[file_submission…] + storage_path`,
so "V2" was the raw multi-GB `.mov` original (unplayable in-browser), not a real second edit — and
since uploads overwrite `file_submission`, true version history isn't kept. Fix: raw `storage_path`
is only shown as the video when there's NO submission deliverable, so it never appears as a broken
"V2" beside a real submission.

NOTE (follow-up): true multi-version V1/V2 history would require the editor upload flow to retain
past submissions (it currently overwrites `file_submission`). Not done here.
