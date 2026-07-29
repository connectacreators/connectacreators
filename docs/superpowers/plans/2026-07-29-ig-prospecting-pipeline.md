# Instagram Lead Prospecting Pipeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn an Instagram keyword search into an enriched, de-duplicated prospect list that feeds the existing DM outreach funnel on `/outbound`.

**Architecture:** The scraper VPS gains two routes that own every Instagram API call (it holds the session cookies and WARP proxy, and has no Supabase credentials). Supabase owns all state: a search edge function persists handles instantly, and a pg_cron-driven enrich function drips profile detail in over the following minutes. A Prospects tab on `/outbound` works the list, writing stage changes through the same two tables the manual steppers already use.

**Tech Stack:** Node 18 (plain CommonJS, no framework) on the VPS; Deno edge functions; Postgres + pg_cron; React 18 + TypeScript + Tailwind + shadcn/ui; Vitest.

**Spec:** [docs/superpowers/specs/2026-07-29-ig-prospecting-pipeline-design.md](../specs/2026-07-29-ig-prospecting-pipeline-design.md)

## Global Constraints

- **`ytdlp-server.js` is VPS-only and NOT in git.** Always `scp` the live copy down before editing. The repo copy has drifted stale before. Deploy with `scp` + `pm2 restart ytdlp-server`.
- **Migrations are documentation copies.** Never run `db push`. SQL is applied to prod via the Management API; the file in `supabase/migrations/` records what was applied.
- **Edge functions deploy manually:** `SUPABASE_ACCESS_TOKEN=$(grep SUPABASE_ACCESS_TOKEN .env.local | cut -d'=' -f2) npx -y supabase@latest functions deploy <name> --project-ref hxojqrilwhhrvloiwmfo`
- **VPS:** `root@72.62.200.145`, password auth only, password in `deploy-to-vps.sh`. No `sshpass`; drive it with `expect`.
- **VPS API key:** header `x-api-key: ytdlp_connecta_2026_secret` (constant `API_KEY`, line ~723).
- **Cron secret:** header `x-cron-secret: connectacreators-cron-2026`.
- **Supabase project ref:** `hxojqrilwhhrvloiwmfo`
- **Instagram request shape** (never vary these): SOCKS proxy `--socks5-hostname 127.0.0.1:1080`, `User-Agent: Instagram 344.0.0.0.98 Android (33/13; 420dpi; 1080x2340; samsung; SM-G991B; o1s; exynos2100)`, `X-IG-App-ID: 936619743392459`.
- **`execFileSync` is NOT at module scope** in `ytdlp-server.js`. Every call site does its own `const { execFileSync } = require("child_process");`. Follow that pattern.
- **Never mark an account stale on a throttle.** An IG reply matching `/please wait a few minutes/i` carries `require_login: true` but is transient. Marking it stale previously dropped every live account from rotation and returned "0 videos" until the rotation auto-reset.
- **Frontend tests:** Vitest, `npm test`, scoped to `src/**/*.{test,spec}.{ts,tsx}`. Pure-logic modules live in `src/lib/**` with a colocated `.test.ts`.
- **Platform is always `'instagram'`** for every funnel write this feature makes.

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/prospects/stageDeltas.ts` | Pure funnel math: stage transition → signed counter deltas |
| `src/lib/prospects/stageDeltas.test.ts` | Tests for the above, incl. monotone invariant |
| `src/lib/prospects/linkBadge.ts` | Classify `external_url` into a display badge |
| `src/lib/prospects/linkBadge.test.ts` | Tests for the above |
| `ytdlp-server.js` (VPS) | Two new routes + two shared IG helpers |
| `supabase/migrations/20260729_ig_prospects.sql` | `ig_prospect_runs`, `ig_prospects`, RLS, indexes |
| `supabase/migrations/20260729_ig_prospect_enrich_cron.sql` | pg_cron schedule |
| `supabase/functions/ig-prospect-search/index.ts` | Search → persist handles |
| `supabase/functions/ig-prospect-enrich/index.ts` | Claim pending → enrich → write |
| `src/hooks/useProspects.ts` | List query, search mutation, stage/follow writes |
| `src/components/outbound/ProspectsTab.tsx` | Search bar, filters, table shell |
| `src/components/outbound/ProspectRow.tsx` | One row: fields + stage actions |
| `src/pages/Outbound.tsx` | Add the Prospects view toggle |

---

### Task 1: Funnel stage math

The highest-risk logic in the feature — it mutates numbers the operator relies on. Pure, dependency-free, so it goes first.

**Files:**
- Create: `src/lib/prospects/stageDeltas.ts`
- Test: `src/lib/prospects/stageDeltas.test.ts`

**Interfaces:**
- Consumes: `STAGE_FIELDS`, `StageKey`, `EMPTY_COUNTS`, `computeRates` from `src/hooks/useOutboundMetrics.ts`
- Produces: `STAGE_ORDER: StageKey[]`, `MAX_STAGE: number`, `StageDelta { stage: StageKey; delta: number }`, `stageDeltas(from: number, to: number): StageDelta[]`, `stageLabel(stage: number): string`

- [ ] **Step 1: Write the failing test**

Create `src/lib/prospects/stageDeltas.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { stageDeltas, STAGE_ORDER, MAX_STAGE } from "./stageDeltas";
import { EMPTY_COUNTS, computeRates } from "@/hooks/useOutboundMetrics";

describe("STAGE_ORDER", () => {
  it("is the six outbound funnel stages in sheet order", () => {
    expect(STAGE_ORDER).toEqual([
      "pre_initiated", "message_seen", "initiated",
      "engaged", "calendly_sent", "booked",
    ]);
    expect(MAX_STAGE).toBe(6);
  });
});

describe("stageDeltas", () => {
  it("counts only pre_initiated when a sourced row is first targeted", () => {
    expect(stageDeltas(0, 1)).toEqual([{ stage: "pre_initiated", delta: 1 }]);
  });

  it("fills every stage below when advancing several at once", () => {
    expect(stageDeltas(0, 3)).toEqual([
      { stage: "pre_initiated", delta: 1 },
      { stage: "message_seen", delta: 1 },
      { stage: "initiated", delta: 1 },
    ]);
  });

  it("un-counts only the stages given up when retreating", () => {
    expect(stageDeltas(4, 2)).toEqual([
      { stage: "initiated", delta: -1 },
      { stage: "engaged", delta: -1 },
    ]);
  });

  it("writes nothing for a no-op transition", () => {
    expect(stageDeltas(3, 3)).toEqual([]);
    expect(stageDeltas(0, 0)).toEqual([]);
  });

  it("clamps out-of-range input instead of producing junk stages", () => {
    expect(stageDeltas(-5, 1)).toEqual([{ stage: "pre_initiated", delta: 1 }]);
    expect(stageDeltas(0, 99)).toHaveLength(6);
    expect(stageDeltas(0, Number.NaN)).toEqual([]);
  });

  it("keeps the funnel monotone across an arbitrary transition sequence", () => {
    // Apply many transitions to real counters, then assert no stage ever
    // exceeds the one above it — which is what keeps every rate <= 100%.
    const counts = { ...EMPTY_COUNTS };
    const rows = [0, 0, 0, 0, 0];
    const moves: [number, number][] = [
      [0, 1], [1, 3], [2, 6], [3, 2], [4, 5],
      [0, 6], [1, 0], [2, 4], [3, 6], [4, 1],
    ];
    for (const [row, to] of moves) {
      for (const d of stageDeltas(rows[row], to)) counts[d.stage] += d.delta;
      rows[row] = to;
    }
    for (let i = 1; i < STAGE_ORDER.length; i++) {
      expect(counts[STAGE_ORDER[i]]).toBeLessThanOrEqual(counts[STAGE_ORDER[i - 1]]);
    }
    for (const r of computeRates(counts).steps) {
      if (r.value === "—") continue;
      expect(Number.parseFloat(r.value)).toBeLessThanOrEqual(100);
    }
  });

  it("never drives a counter negative when every row is fully retreated", () => {
    const counts = { ...EMPTY_COUNTS };
    const apply = (from: number, to: number) => {
      for (const d of stageDeltas(from, to)) counts[d.stage] += d.delta;
    };
    apply(0, 6); apply(0, 4); apply(6, 0); apply(4, 0);
    for (const s of STAGE_ORDER) expect(counts[s]).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/prospects/stageDeltas.test.ts`
Expected: FAIL — `Failed to resolve import "./stageDeltas"`

- [ ] **Step 3: Write the implementation**

Create `src/lib/prospects/stageDeltas.ts`:

```ts
import { STAGE_FIELDS, type StageKey } from "@/hooks/useOutboundMetrics";

/**
 * The six funnel stages in sheet order. A prospect's `stage_reached` is an
 * index into this list PLUS ONE — 0 means "sourced but not yet targeted",
 * which writes to no counter at all.
 *
 * That offset is deliberate. Every overall rate on /outbound (IMSR, IR, PRR,
 * CSR, ABR) divides by pre_initiated, so counting scraped-but-unreviewed
 * handles as A1 would inflate the funnel base and silently depress every
 * conversion percentage on the page.
 */
export const STAGE_ORDER: StageKey[] = STAGE_FIELDS.map((f) => f.key);

export const MAX_STAGE = STAGE_ORDER.length;

export interface StageDelta {
  stage: StageKey;
  delta: number;
}

function clampStage(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(MAX_STAGE, Math.round(n)));
}

/**
 * Signed counter deltas for moving one prospect from stage `from` to `to`.
 *
 * Advancing counts every stage in (from, to]; retreating un-counts every
 * stage in (to, from]. This keeps the funnel monotone — a booked prospect is
 * also counted at engaged and calendly_sent — so a stage conversion like
 * C -> D can never read above 100%.
 *
 * Returns [] for a no-op, which makes repeated writes idempotent.
 */
export function stageDeltas(from: number, to: number): StageDelta[] {
  const a = clampStage(from);
  const b = clampStage(to);
  if (a === b) return [];
  const sign = b > a ? 1 : -1;
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const out: StageDelta[] = [];
  for (let i = lo; i < hi; i++) out.push({ stage: STAGE_ORDER[i], delta: sign });
  return out;
}

/** Human label for a stage_reached value; 0 is the pre-funnel state. */
export function stageLabel(stage: number): string {
  const s = clampStage(stage);
  return s === 0 ? "Sourced" : STAGE_FIELDS[s - 1].label;
}
```

Note the NaN case: `clampStage(NaN)` returns 0, so `stageDeltas(0, NaN)` is `0 -> 0` = `[]`, matching the test.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/prospects/stageDeltas.test.ts`
Expected: PASS, 8 tests

- [ ] **Step 5: Commit**

```bash
git add src/lib/prospects/stageDeltas.ts src/lib/prospects/stageDeltas.test.ts
git commit -m "feat(prospects): funnel stage transition math

Advancing a prospect counts every stage below it and retreating un-counts
them, so the funnel stays monotone and stage conversion rates cannot exceed
100%. Stage 0 (sourced) writes nothing -- counting unreviewed scraped handles
as pre_initiated would inflate the base every overall rate divides by."
```

---

### Task 2: External-link badge classifier

Small pure helper the row UI needs. Done now so Task 8 has no logic left in it.

**Files:**
- Create: `src/lib/prospects/linkBadge.ts`
- Test: `src/lib/prospects/linkBadge.test.ts`

**Interfaces:**
- Produces: `type LinkBadge = "calendly" | "booking" | "site" | "none"`, `classifyLink(url: string | null | undefined): LinkBadge`, `LINK_BADGE_LABEL: Record<LinkBadge, string>`

- [ ] **Step 1: Write the failing test**

Create `src/lib/prospects/linkBadge.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { classifyLink, LINK_BADGE_LABEL } from "./linkBadge";

describe("classifyLink", () => {
  it("detects Calendly", () => {
    expect(classifyLink("https://calendly.com/drmiller/intro")).toBe("calendly");
    expect(classifyLink("CALENDLY.COM/x")).toBe("calendly");
  });

  it("detects other booking platforms", () => {
    expect(classifyLink("https://acuityscheduling.com/x")).toBe("booking");
    expect(classifyLink("https://squareup.com/appointments/y")).toBe("booking");
    expect(classifyLink("https://www.setmore.com/z")).toBe("booking");
  });

  it("detects a booking intent in the path of an own-domain link", () => {
    expect(classifyLink("https://millerchiro.com/book-now")).toBe("booking");
    expect(classifyLink("https://millerchiro.com/schedule")).toBe("booking");
    expect(classifyLink("https://millerchiro.com/appointment")).toBe("booking");
  });

  it("falls back to a plain site for anything else", () => {
    expect(classifyLink("https://millerchiro.com")).toBe("site");
    expect(classifyLink("https://linktr.ee/miller")).toBe("site");
  });

  it("reports absence for empty input", () => {
    expect(classifyLink(null)).toBe("none");
    expect(classifyLink(undefined)).toBe("none");
    expect(classifyLink("")).toBe("none");
    expect(classifyLink("   ")).toBe("none");
  });

  it("labels every badge", () => {
    expect(LINK_BADGE_LABEL.calendly).toBe("Calendly");
    expect(LINK_BADGE_LABEL.booking).toBe("Booking");
    expect(LINK_BADGE_LABEL.site).toBe("Site");
    expect(LINK_BADGE_LABEL.none).toBe("None");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/prospects/linkBadge.test.ts`
Expected: FAIL — `Failed to resolve import "./linkBadge"`

- [ ] **Step 3: Write the implementation**

Create `src/lib/prospects/linkBadge.ts`:

```ts
/**
 * A prospect's bio link is the strongest single qualification signal: a
 * booking link means they already sell, which is the "proven offer" the
 * /1million offer requires. Classify it for at-a-glance scanning.
 */
export type LinkBadge = "calendly" | "booking" | "site" | "none";

export const LINK_BADGE_LABEL: Record<LinkBadge, string> = {
  calendly: "Calendly",
  booking: "Booking",
  site: "Site",
  none: "None",
};

const BOOKING_HOSTS = [
  "acuityscheduling.com", "squareup.com/appointments", "setmore.com",
  "simplybook.me", "vagaro.com", "mindbodyonline.com", "janeapp.com",
  "schedulicity.com", "booksy.com", "zocdoc.com", "cal.com",
];

const BOOKING_PATH = /\/(book|booking|book-now|schedule|scheduling|appointment|appointments|consult|consultation)\b/i;

export function classifyLink(url: string | null | undefined): LinkBadge {
  const raw = (url ?? "").trim();
  if (!raw) return "none";
  const lower = raw.toLowerCase();
  if (lower.includes("calendly.com")) return "calendly";
  if (BOOKING_HOSTS.some((h) => lower.includes(h))) return "booking";
  if (BOOKING_PATH.test(lower)) return "booking";
  return "site";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/prospects/linkBadge.test.ts`
Expected: PASS, 6 tests

- [ ] **Step 5: Commit**

```bash
git add src/lib/prospects/linkBadge.ts src/lib/prospects/linkBadge.test.ts
git commit -m "feat(prospects): classify bio links into qualification badges"
```

---

### Task 3: VPS `/ig-search` route

**Files:**
- Modify: `ytdlp-server.js` on the VPS (fetch live copy first)
- Sync after deploy: no repo copy exists; this file is VPS-only

**Interfaces:**
- Produces: `POST /ig-search` → `{ users: [{ username, user_id, full_name, follower_count, profile_pic_url, is_verified, is_private }] }`
- Produces (internal): `igAuthedFetch(apiUrl, session) -> { ok: true, data } | { ok: false, reason: "auth"|"throttled"|"network" }` and `igTopSearch(query, limit, session)`, both consumed by Task 4

- [ ] **Step 1: Fetch the live server file**

```bash
cd /private/tmp/claude-501/-Users-admin-Projects-connectacreators/13a48a7e-19d7-4355-b67f-15e781ecddde/scratchpad
cat > fetch.exp << 'EOF'
#!/usr/bin/expect
set timeout 120
spawn scp -o StrictHostKeyChecking=no root@72.62.200.145:/var/www/ytdlp-server.js ./ytdlp-server.js
expect "password:" { send "Loqueveoloveo290802#\r" }
expect eof
EOF
expect fetch.exp
wc -l ytdlp-server.js   # expect ~3951
```

- [ ] **Step 2: Add the shared IG helpers**

Insert immediately after the `markIgAccountStale` function (ends ~line 688, just before the `warmIgSessions` comment block):

```js
// ── Shared authed IG fetch (used by /ig-search and /ig-profile-info) ─────────
// Mirrors the fetcher inside scrapeInstagramProfile, including the one rule
// that matters most: a transient "please wait a few minutes" reply carries
// require_login:true but must NOT mark the account stale. Doing so once
// dropped both live accounts from rotation and returned 0 results until the
// rotation auto-reset.
function igAuthedFetch(apiUrl, session) {
  const { execFileSync } = require("child_process");
  const args = [
    "-s", "--max-time", "20",
    "--socks5-hostname", "127.0.0.1:1080",
    "-H", "User-Agent: Instagram 344.0.0.0.98 Android (33/13; 420dpi; 1080x2340; samsung; SM-G991B; o1s; exynos2100)",
    "-H", "X-IG-App-ID: 936619743392459",
    "-H", "X-CSRFToken: " + session.csrfToken,
    "-H", "Cookie: " + session.cookieHeader,
    apiUrl,
  ];
  try {
    const raw = execFileSync("curl", args, { maxBuffer: 10 * 1024 * 1024, timeout: 25000 });
    const parsed = JSON.parse(raw.toString());
    if (parsed.message === "login_required" || parsed.message === "challenge_required" || parsed.require_login) {
      if (/please wait a few minutes/i.test(parsed.message || "")) {
        console.warn("[ig-search] Rate-limited (transient):", (session.file || "").split("/").pop());
        return { ok: false, reason: "throttled" };
      }
      console.warn("[ig-search] Auth error:", parsed.message, "on", (session.file || "").split("/").pop());
      if (session.file) markIgAccountStale(session.file);
      return { ok: false, reason: "auth" };
    }
    return { ok: true, data: parsed };
  } catch (e) {
    console.error("[ig-search] fetch error:", (e.message || "").slice(0, 200));
    return { ok: false, reason: "network" };
  }
}

// Keyword -> Instagram accounts. Same topsearch_flat call /scrape-reels-search
// already runs in production, lifted out so lead prospecting can use it too.
function igTopSearch(query, limit, session) {
  const r = igAuthedFetch(
    "https://i.instagram.com/api/v1/fbsearch/topsearch_flat/?query=" +
      encodeURIComponent(query) + "&search_surface=top_search_page",
    session
  );
  if (!r.ok) return r;
  const list = (r.data && r.data.list) || [];
  const users = list
    .filter((item) => item.user)
    .map((item) => ({
      username: item.user.username,
      user_id: String(item.user.pk || item.user.pk_id || ""),
      full_name: item.user.full_name || "",
      follower_count: item.user.follower_count || 0,
      profile_pic_url: item.user.profile_pic_url || null,
      is_verified: !!item.user.is_verified,
      is_private: !!item.user.is_private,
    }))
    .slice(0, limit);
  return { ok: true, users };
}
```

- [ ] **Step 3: Add the route**

Insert immediately before the `/scrape-reels-search` route (`if (req.method === "POST" && req.url === "/scrape-reels-search")`, ~line 3201):

```js
  // ── /ig-search — keyword → Instagram accounts (lead prospecting) ────────────
  if (req.method === "POST" && req.url === "/ig-search") {
    if (req.headers["x-api-key"] !== API_KEY) {
      res.writeHead(401, corsHeaders);
      res.end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", () => {
      try {
        const { query, limit = 15 } = JSON.parse(body || "{}");
        if (!query || typeof query !== "string" || !query.trim()) {
          res.writeHead(400, corsHeaders);
          res.end(JSON.stringify({ error: "query is required" }));
          return;
        }
        const safeLim = Math.max(1, Math.min(Number(limit) || 15, 30));
        const session = getNextIgCookies();
        if (!session) {
          res.writeHead(503, corsHeaders);
          res.end(JSON.stringify({ error: "No IG cookie files available", code: "NO_IG_SESSIONS" }));
          return;
        }
        console.log("[ig-search] query:", JSON.stringify(query.trim()), "limit:", safeLim);
        const r = igTopSearch(query.trim(), safeLim, session);
        if (!r.ok) {
          res.writeHead(503, corsHeaders);
          res.end(JSON.stringify({
            error: "Instagram search unavailable (" + r.reason + ")",
            code: r.reason === "auth" ? "SESSION_EXPIRED" : "IG_UNAVAILABLE",
          }));
          return;
        }
        console.log("[ig-search] returned", r.users.length, "accounts");
        res.writeHead(200, corsHeaders);
        res.end(JSON.stringify({ users: r.users }));
      } catch (e) {
        console.error("[ig-search] Error:", e.message);
        res.writeHead(500, corsHeaders);
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }
```

`corsHeaders` (line ~636) already includes `Content-Type: application/json`, so it is passed alone.

- [ ] **Step 4: Deploy to the VPS**

```bash
cd /private/tmp/claude-501/-Users-admin-Projects-connectacreators/13a48a7e-19d7-4355-b67f-15e781ecddde/scratchpad
cat > push.exp << 'EOF'
#!/usr/bin/expect
set timeout 180
spawn scp -o StrictHostKeyChecking=no ./ytdlp-server.js root@72.62.200.145:/var/www/ytdlp-server.js
expect "password:" { send "Loqueveoloveo290802#\r" }
expect eof
spawn ssh -o StrictHostKeyChecking=no root@72.62.200.145 "pm2 restart ytdlp-server && sleep 3 && pm2 logs ytdlp-server --lines 15 --nostream"
expect "password:" { send "Loqueveoloveo290802#\r" }
expect eof
EOF
expect push.exp
```

Expected: PM2 restart succeeds; logs show `[ig-rotate] Loaded N IG accounts` with no syntax error.

- [ ] **Step 5: Verify against live Instagram**

```bash
curl -s -m 30 -X POST http://72.62.200.145:3099/ig-search \
  -H "Content-Type: application/json" \
  -H "x-api-key: ytdlp_connecta_2026_secret" \
  -d '{"query":"chiropractor","limit":5}' | head -c 1200
```

Expected: JSON `{"users":[...]}` with 1–5 entries, each having a non-empty `username` and a numeric `follower_count`.

Also confirm auth is enforced:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://72.62.200.145:3099/ig-search \
  -H "Content-Type: application/json" -d '{"query":"chiropractor"}'
```

Expected: `401`

If the search returns `SESSION_EXPIRED`, the cookie pool is 2FA-locked — that is the known recurring failure, not a bug in this code. Recovery is a manual browser login plus cookie transplant into `/var/www/ig-account-<n>.json`.

- [ ] **Step 6: Commit the plan checkpoint**

Nothing to commit — this file lives only on the VPS. Record completion by checking the boxes above.

---

### Task 4: VPS `/ig-profile-info` route

**Files:**
- Modify: `ytdlp-server.js` on the VPS

**Interfaces:**
- Consumes: `igAuthedFetch` from Task 3
- Produces: `POST /ig-profile-info` `{ usernames: string[] }` → `{ profiles: { [username]: ProfileFields | { error: string } }, sessionsExhausted: boolean }`, where `ProfileFields` = `{ ig_user_id, full_name, biography, external_url, category, is_business, media_count, follower_count, following_count, public_email, public_phone, city_name, is_private, is_verified }`

- [ ] **Step 1: Add the route**

Insert immediately after the `/ig-search` route added in Task 3:

```js
  // ── /ig-profile-info — batch profile enrichment for lead qualification ──────
  if (req.method === "POST" && req.url === "/ig-profile-info") {
    if (req.headers["x-api-key"] !== API_KEY) {
      res.writeHead(401, corsHeaders);
      res.end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", async () => {
      try {
        const { usernames } = JSON.parse(body || "{}");
        if (!Array.isArray(usernames) || usernames.length === 0) {
          res.writeHead(400, corsHeaders);
          res.end(JSON.stringify({ error: "usernames array is required" }));
          return;
        }
        const list = usernames
          .slice(0, 10)
          .map((u) => String(u || "").replace(/^@/, "").trim())
          .filter(Boolean);

        const profiles = {};
        let authFailures = 0;
        let sessionsExhausted = false;

        for (let i = 0; i < list.length; i++) {
          // Pace the batch: ~4-6s between profiles. The cookie pool is the
          // fragile resource here (all 6 accounts 2FA-locked at once on
          // 2026-07-27), so this stays well under Viral Today's own load.
          if (i > 0) {
            await new Promise((r) => setTimeout(r, 4000 + Math.floor(Math.random() * 2000)));
          }
          const session = getNextIgCookies();
          if (!session) { sessionsExhausted = true; break; }

          const name = list[i];
          const r = igAuthedFetch(
            "https://i.instagram.com/api/v1/users/" + encodeURIComponent(name) + "/usernameinfo/",
            session
          );

          if (!r.ok) {
            if (r.reason === "auth") {
              // getNextIgCookies() never returns null from staleness -- it
              // clears the stale set and retries -- so exhaustion is detected
              // by consecutive auth failures instead. Two in a row means the
              // pool is down, not that one account rotated badly.
              authFailures++;
              if (authFailures >= 2) { sessionsExhausted = true; break; }
            }
            profiles[name] = { error: r.reason };
            continue;
          }
          authFailures = 0;

          const u = r.data && r.data.user;
          if (!u) { profiles[name] = { error: "not_found" }; continue; }

          profiles[name] = {
            ig_user_id: String(u.pk || u.pk_id || ""),
            full_name: u.full_name || "",
            biography: u.biography || "",
            external_url: u.external_url || null,
            category: u.category || null,
            is_business: !!u.is_business,
            media_count: u.media_count || 0,
            follower_count: u.follower_count || 0,
            following_count: u.following_count || 0,
            public_email: u.public_email || null,
            public_phone: u.public_phone_number || null,
            city_name: u.city_name || null,
            is_private: !!u.is_private,
            is_verified: !!u.is_verified,
          };
        }

        const gotAny = Object.keys(profiles).some((k) => !profiles[k].error);
        if (sessionsExhausted && !gotAny) {
          res.writeHead(503, corsHeaders);
          res.end(JSON.stringify({
            error: "Instagram sessions exhausted",
            code: "SESSION_EXPIRED",
            profiles: {},
            sessionsExhausted: true,
          }));
          return;
        }
        console.log("[ig-profile-info] enriched", Object.keys(profiles).length, "of", list.length,
          sessionsExhausted ? "(sessions exhausted mid-batch)" : "");
        res.writeHead(200, corsHeaders);
        res.end(JSON.stringify({ profiles, sessionsExhausted }));
      } catch (e) {
        console.error("[ig-profile-info] Error:", e.message);
        res.writeHead(500, corsHeaders);
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }
```

- [ ] **Step 2: Register the route as heavy**

A 10-profile batch occupies the route ~50s, so it must count against the concurrency limiter. Modify `HEAVY_PATHS` (~line 640):

```js
const HEAVY_PATHS = new Set([
  '/cobalt-proxy', '/ig-thumbnail', '/extract-audio',
  '/analyze-video', '/download-video', '/scrape-profile', '/scrape-reels-search',
  '/ig-profile-info'
]);
```

`/ig-search` stays light — it is a single sub-second call.

- [ ] **Step 3: Deploy**

Re-run the `push.exp` script from Task 3 Step 4.

Expected: PM2 restart clean, no syntax errors in logs.

- [ ] **Step 4: Verify against live Instagram**

```bash
time curl -s -m 90 -X POST http://72.62.200.145:3099/ig-profile-info \
  -H "Content-Type: application/json" \
  -H "x-api-key: ytdlp_connecta_2026_secret" \
  -d '{"usernames":["chiropractor","zocdoc"]}' | head -c 1500
```

Expected: `{"profiles":{"chiropractor":{...},"zocdoc":{...}},"sessionsExhausted":false}` with `biography`, `category`, and `follower_count` populated on at least one. Elapsed time ≥4s, confirming the pacing gap is in effect.

Verify the batch cap:

```bash
curl -s -m 120 -X POST http://72.62.200.145:3099/ig-profile-info \
  -H "Content-Type: application/json" -H "x-api-key: ytdlp_connecta_2026_secret" \
  -d '{"usernames":["a","b","c","d","e","f","g","h","i","j","k","l"]}' \
  | python3 -c "import json,sys; print(len(json.load(sys.stdin)['profiles']))"
```

Expected: at most `10` — the extra two are sliced off.

---

### Task 5: Prospect tables migration

**Files:**
- Create: `supabase/migrations/20260729_ig_prospects.sql`

**Interfaces:**
- Produces: tables `public.ig_prospect_runs`, `public.ig_prospects` with the columns consumed by Tasks 6, 7, and 9

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/20260729_ig_prospects.sql`:

```sql
-- Instagram lead prospecting (2026-07-29) — APPLIED TO PROD via Management
-- API (documentation copy; never `db push`).
--
-- Sourced Instagram handles for DM outreach. Rows land at stage_reached = 0
-- ("sourced"), which writes to no funnel counter; the operator advances a row
-- to 1 (pre_initiated / A1) when they decide to work it. See
-- docs/superpowers/specs/2026-07-29-ig-prospecting-pipeline-design.md.

create table if not exists public.ig_prospect_runs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  query       text not null,
  requested   int  not null default 0,
  returned    int  not null default 0,
  inserted    int  not null default 0,
  created_at  timestamptz not null default now()
);

alter table public.ig_prospect_runs enable row level security;
create policy "Admin full access ig_prospect_runs" on public.ig_prospect_runs
  for all using (public.is_admin()) with check (public.is_admin());

-- unique(username) is GLOBAL, deliberately not scoped to run or user: a handle
-- already worked must never resurface from a different query.
create table if not exists public.ig_prospects (
  id                  uuid primary key default gen_random_uuid(),
  username            text not null unique,
  user_id             uuid not null references auth.users(id) on delete cascade,
  run_id              uuid references public.ig_prospect_runs(id) on delete set null,

  -- identity (from /ig-search, always present)
  ig_user_id          text,
  full_name           text,
  follower_count      int,
  profile_pic_url     text,
  is_verified         boolean not null default false,
  is_private          boolean not null default false,

  -- enrichment (from /ig-profile-info, filled in later)
  biography           text,
  external_url        text,
  category            text,
  is_business         boolean,
  media_count         int,
  following_count     int,
  public_email        text,
  public_phone        text,
  city_name           text,

  -- enrichment state
  enrichment_status   text not null default 'pending'
                        check (enrichment_status in ('pending','done','failed')),
  enrichment_attempts int  not null default 0,
  enriched_at         timestamptz,
  enrichment_error    text,

  -- workflow
  stage_reached       int  not null default 0 check (stage_reached between 0 and 6),
  stage_at            timestamptz,
  followed            boolean not null default false,
  followed_back       boolean not null default false,
  notes               text,
  created_at          timestamptz not null default now()
);

alter table public.ig_prospects enable row level security;
create policy "Admin full access ig_prospects" on public.ig_prospects
  for all using (public.is_admin()) with check (public.is_admin());

-- Claim query: pending rows under the retry ceiling, oldest first.
create index if not exists idx_ig_prospects_claim
  on public.ig_prospects (enrichment_status, enrichment_attempts, created_at);

-- List view: an admin's prospects ordered by how far they have moved.
create index if not exists idx_ig_prospects_user_stage
  on public.ig_prospects (user_id, stage_reached, created_at desc);
```

- [ ] **Step 2: Apply to production**

Apply via the Supabase Management API / SQL editor for project `hxojqrilwhhrvloiwmfo`. Do not run `db push`.

- [ ] **Step 3: Verify the tables exist with the right constraints**

Run in the SQL editor:

```sql
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_name = 'ig_prospects' order by ordinal_position;

select conname, pg_get_constraintdef(oid)
from pg_constraint where conrelid = 'public.ig_prospects'::regclass;
```

Expected: 27 columns; constraints include `ig_prospects_username_key` (UNIQUE), the `stage_reached between 0 and 6` check, and the `enrichment_status` in-list check.

- [ ] **Step 4: Verify RLS blocks non-admins**

```sql
select relrowsecurity from pg_class where relname = 'ig_prospects';
select polname from pg_policy where polrelid = 'public.ig_prospects'::regclass;
```

Expected: `relrowsecurity = true`, one policy named `Admin full access ig_prospects`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260729_ig_prospects.sql
git commit -m "feat(prospects): ig_prospects and ig_prospect_runs tables

Global unique(username) so a handle already worked never resurfaces from a
different query. Rows start at stage_reached 0 -- sourced, uncounted."
```

---

### Task 6: `ig-prospect-search` edge function

**Files:**
- Create: `supabase/functions/ig-prospect-search/index.ts`

**Interfaces:**
- Consumes: VPS `POST /ig-search` (Task 3); tables from Task 5
- Produces: `POST /ig-prospect-search` `{ query: string, limit?: number }` → `{ run_id: string, returned: number, inserted: number, already_known: number, prospects: ProspectRow[] }`

- [ ] **Step 1: Write the function**

Create `supabase/functions/ig-prospect-search/index.ts`:

```ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const VPS_SERVER = "http://72.62.200.145:3099";
const VPS_API_KEY = "ytdlp_connecta_2026_secret";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return json({ error: "Unauthorized" }, 401);

  let query: string;
  let limit: number;
  try {
    const body = await req.json();
    query = String(body.query ?? "").trim();
    limit = Math.max(1, Math.min(Number(body.limit) || 15, 30));
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  if (!query) return json({ error: "query is required" }, 400);

  // Provenance row first, so even a failed search leaves a trace of the attempt.
  const { data: run, error: runErr } = await supabase
    .from("ig_prospect_runs")
    .insert({ user_id: user.id, query, requested: limit })
    .select("id")
    .single();
  if (runErr || !run) return json({ error: `Could not create run: ${runErr?.message}` }, 500);

  let users: Array<Record<string, unknown>> = [];
  try {
    const res = await fetch(`${VPS_SERVER}/ig-search`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": VPS_API_KEY },
      body: JSON.stringify({ query, limit }),
    });
    if (!res.ok) {
      const text = await res.text();
      return json({
        error: `Instagram search failed (${res.status})`,
        detail: text.slice(0, 300),
        run_id: run.id,
      }, res.status === 503 ? 503 : 502);
    }
    const payload = await res.json();
    users = Array.isArray(payload.users) ? payload.users : [];
  } catch (e) {
    return json({ error: `Could not reach scraper: ${(e as Error).message}`, run_id: run.id }, 502);
  }

  // on conflict do nothing => a handle already in the table is silently skipped,
  // which is the whole point of the global unique(username).
  const rows = users.map((u) => ({
    username: String(u.username),
    user_id: user.id,
    run_id: run.id,
    ig_user_id: u.user_id ? String(u.user_id) : null,
    full_name: (u.full_name as string) ?? null,
    follower_count: (u.follower_count as number) ?? null,
    profile_pic_url: (u.profile_pic_url as string) ?? null,
    is_verified: !!u.is_verified,
    is_private: !!u.is_private,
  }));

  let inserted: unknown[] = [];
  if (rows.length > 0) {
    const { data, error } = await supabase
      .from("ig_prospects")
      .upsert(rows, { onConflict: "username", ignoreDuplicates: true })
      .select("*");
    if (error) return json({ error: `Insert failed: ${error.message}`, run_id: run.id }, 500);
    inserted = data ?? [];
  }

  await supabase
    .from("ig_prospect_runs")
    .update({ returned: users.length, inserted: inserted.length })
    .eq("id", run.id);

  return json({
    run_id: run.id,
    returned: users.length,
    inserted: inserted.length,
    already_known: users.length - inserted.length,
    prospects: inserted,
  });
});
```

- [ ] **Step 2: Deploy**

```bash
SUPABASE_ACCESS_TOKEN=$(grep SUPABASE_ACCESS_TOKEN .env.local | cut -d'=' -f2) \
  npx -y supabase@latest functions deploy ig-prospect-search --project-ref hxojqrilwhhrvloiwmfo
```

Expected: "Deployed Function ig-prospect-search". A "Docker is not running" warning is harmless.

- [ ] **Step 3: Verify end to end**

From the browser console while signed in as an admin on connectacreators.com:

```js
const { data, error } = await window.supabase.functions.invoke("ig-prospect-search", {
  body: { query: "chiropractor austin", limit: 10 },
});
console.log(error, data);
```

Expected: `data.returned > 0`, `data.inserted > 0`, `data.prospects[0].enrichment_status === "pending"`, `data.prospects[0].stage_reached === 0`.

- [ ] **Step 4: Verify dedupe by re-running the same query**

Run the exact same invoke again.

Expected: `inserted === 0` and `already_known === returned` — the second run adds nothing.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/ig-prospect-search/index.ts
git commit -m "feat(prospects): ig-prospect-search edge function

Searches Instagram via the VPS and persists handles at stage 0 with
enrichment pending. Returns in ~2s; dedupes on username globally."
```

---

### Task 7: `ig-prospect-enrich` edge function + cron

**Files:**
- Create: `supabase/functions/ig-prospect-enrich/index.ts`
- Create: `supabase/migrations/20260729_ig_prospect_enrich_cron.sql`

**Interfaces:**
- Consumes: VPS `POST /ig-profile-info` (Task 4); tables from Task 5
- Produces: `POST /ig-prospect-enrich` (cron-guarded) → `{ claimed: number, enriched: number, failed: number, rolled_back: number, sessions_exhausted: boolean }`

- [ ] **Step 1: Write the function**

Create `supabase/functions/ig-prospect-enrich/index.ts`:

```ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const CRON_SECRET = "connectacreators-cron-2026";
const VPS_SERVER = "http://72.62.200.145:3099";
const VPS_API_KEY = "ytdlp_connecta_2026_secret";
const BATCH = 10;
const MAX_ATTEMPTS = 3;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.headers.get("x-cron-secret") !== CRON_SECRET) return json({ error: "Unauthorized" }, 401);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Claim: read candidates, then bump attempts. Bumping BEFORE the scrape is
  // what stops two overlapping cron ticks from processing the same row — the
  // second tick's filter (attempts < MAX) plus the changed value means it
  // selects a different set.
  const { data: candidates, error: selErr } = await supabase
    .from("ig_prospects")
    .select("id, username, enrichment_attempts")
    .eq("enrichment_status", "pending")
    .lt("enrichment_attempts", MAX_ATTEMPTS)
    .order("created_at", { ascending: true })
    .limit(BATCH);

  if (selErr) return json({ error: selErr.message }, 500);
  if (!candidates || candidates.length === 0) {
    return json({ claimed: 0, enriched: 0, failed: 0, rolled_back: 0, sessions_exhausted: false });
  }

  for (const c of candidates) {
    await supabase
      .from("ig_prospects")
      .update({ enrichment_attempts: c.enrichment_attempts + 1 })
      .eq("id", c.id);
  }

  const usernames = candidates.map((c) => c.username);
  let profiles: Record<string, Record<string, unknown>> = {};
  let sessionsExhausted = false;

  try {
    const res = await fetch(`${VPS_SERVER}/ig-profile-info`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": VPS_API_KEY },
      body: JSON.stringify({ usernames }),
    });
    const payload = await res.json().catch(() => ({}));
    if (res.status === 503) {
      sessionsExhausted = true;
    } else if (!res.ok) {
      sessionsExhausted = false;
    } else {
      profiles = payload.profiles ?? {};
      sessionsExhausted = !!payload.sessionsExhausted;
    }
  } catch {
    sessionsExhausted = false;
  }

  let enriched = 0, failed = 0, rolledBack = 0;

  for (const c of candidates) {
    const p = profiles[c.username];

    // No answer at all (batch aborted, scraper unreachable, sessions down):
    // give the attempt back so an Instagram outage cannot burn a row's retries.
    if (!p) {
      await supabase
        .from("ig_prospects")
        .update({ enrichment_attempts: c.enrichment_attempts })
        .eq("id", c.id);
      rolledBack++;
      continue;
    }

    if (p.error) {
      const attempts = c.enrichment_attempts + 1;
      const exhausted = attempts >= MAX_ATTEMPTS;
      await supabase
        .from("ig_prospects")
        .update({
          enrichment_error: String(p.error),
          enrichment_status: exhausted ? "failed" : "pending",
        })
        .eq("id", c.id);
      if (exhausted) failed++;
      continue;
    }

    await supabase
      .from("ig_prospects")
      .update({
        ig_user_id: p.ig_user_id ?? null,
        full_name: p.full_name ?? null,
        biography: p.biography ?? null,
        external_url: p.external_url ?? null,
        category: p.category ?? null,
        is_business: p.is_business ?? null,
        media_count: p.media_count ?? null,
        follower_count: p.follower_count ?? null,
        following_count: p.following_count ?? null,
        public_email: p.public_email ?? null,
        public_phone: p.public_phone ?? null,
        city_name: p.city_name ?? null,
        is_private: !!p.is_private,
        is_verified: !!p.is_verified,
        enrichment_status: "done",
        enrichment_error: null,
        enriched_at: new Date().toISOString(),
      })
      .eq("id", c.id);
    enriched++;
  }

  console.log(`[ig-prospect-enrich] claimed=${candidates.length} enriched=${enriched} failed=${failed} rolled_back=${rolledBack} exhausted=${sessionsExhausted}`);

  return json({
    claimed: candidates.length,
    enriched,
    failed,
    rolled_back: rolledBack,
    sessions_exhausted: sessionsExhausted,
  });
});
```

- [ ] **Step 2: Deploy the function**

```bash
SUPABASE_ACCESS_TOKEN=$(grep SUPABASE_ACCESS_TOKEN .env.local | cut -d'=' -f2) \
  npx -y supabase@latest functions deploy ig-prospect-enrich --project-ref hxojqrilwhhrvloiwmfo
```

- [ ] **Step 3: Verify it enriches a real pending row**

```bash
curl -s -m 120 -X POST \
  https://hxojqrilwhhrvloiwmfo.supabase.co/functions/v1/ig-prospect-enrich \
  -H "Content-Type: application/json" \
  -H "x-cron-secret: connectacreators-cron-2026" -d '{}'
```

Expected: `{"claimed":N,"enriched":N,...}` with `enriched > 0`, given Task 6 left pending rows.

Then confirm in SQL:

```sql
select username, category, external_url, media_count, enrichment_status, enriched_at
from public.ig_prospects where enrichment_status = 'done' limit 5;
```

Expected: populated `category` / `external_url` on at least one row.

Verify the guard rejects an unauthenticated call:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST \
  https://hxojqrilwhhrvloiwmfo.supabase.co/functions/v1/ig-prospect-enrich -d '{}'
```

Expected: `401`

- [ ] **Step 4: Verify the retry ceiling and the outage rollback**

Two behaviors that only show up under failure, so force them.

**Retry ceiling** — insert a handle that cannot resolve, then run the function three times:

```sql
insert into public.ig_prospects (username, user_id)
values ('zz_definitely_not_a_real_handle_9f3', (select id from auth.users limit 1));
```

Run the Step 3 curl three times, then:

```sql
select username, enrichment_status, enrichment_attempts, enrichment_error
from public.ig_prospects where username = 'zz_definitely_not_a_real_handle_9f3';
```

Expected: `enrichment_status = 'failed'`, `enrichment_attempts = 3`. A fourth run must not pick it up again — confirm `claimed` excludes it.

**Outage rollback** — point the function at an unreachable scraper by stopping the VPS route temporarily is too invasive; instead assert the logic directly. Insert a fresh pending row, note its `enrichment_attempts`, then run the function while the VPS is reachable but returns a 503 (achievable by confirming behavior in logs during any real `SESSION_EXPIRED` window). If no such window occurs during implementation, verify by reading the code path: `if (!p)` restores `c.enrichment_attempts`, so a row that got no answer ends the tick at the attempt count it started with.

Clean up the test row:

```sql
delete from public.ig_prospects where username = 'zz_definitely_not_a_real_handle_9f3';
```

- [ ] **Step 5: Write the cron migration**

Create `supabase/migrations/20260729_ig_prospect_enrich_cron.sql`:

```sql
-- Drip-enrich sourced Instagram prospects (2026-07-29) — APPLIED TO PROD via
-- Management API (documentation copy; never `db push`).
--
-- Every minute, at most 10 profiles, paced ~5s apart inside the VPS route.
-- That ceiling (~120 profile calls/hour) is deliberate: the IG cookie pool is
-- the fragile resource and all six accounts 2FA-locked simultaneously on
-- 2026-07-27. Same net.http_post pattern as daily-content-opportunity-scan.

do $$
begin
  perform cron.unschedule('ig-prospect-enrich');
exception when others then null;
end$$;

select cron.schedule(
  'ig-prospect-enrich',
  '* * * * *',
  $$
    select net.http_post(
      url := 'https://hxojqrilwhhrvloiwmfo.supabase.co/functions/v1/ig-prospect-enrich',
      headers := '{"Content-Type":"application/json","x-cron-secret":"connectacreators-cron-2026"}'::jsonb,
      body := '{}'::jsonb
    );
  $$
);
```

- [ ] **Step 6: Apply and verify the schedule**

Apply via the Management API, then:

```sql
select jobname, schedule, active from cron.job where jobname = 'ig-prospect-enrich';
```

Expected: one row, `* * * * *`, `active = true`.

Wait two minutes, then confirm the drip is running on its own:

```sql
select enrichment_status, count(*) from public.ig_prospects group by 1;
```

Expected: `pending` count decreasing across successive checks.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/ig-prospect-enrich/index.ts supabase/migrations/20260729_ig_prospect_enrich_cron.sql
git commit -m "feat(prospects): drip enrichment function and per-minute cron

Claims <=10 pending rows per tick, bumping attempts before the scrape so
overlapping ticks cannot double-process. An Instagram outage rolls the
attempt back rather than burning a row's three retries."
```

---

### Task 8: Prospects data hook

**Files:**
- Create: `src/hooks/useProspects.ts`

**Interfaces:**
- Consumes: `stageDeltas`, `STAGE_ORDER` from Task 1; `supabase` client; `useAuth`
- Produces: `IgProspect` interface, `useProspects()` returning `{ prospects, loading, searching, anyPending, search(query, limit), setStage(prospect, next), toggleFollow(prospect, field) }`

- [ ] **Step 1: Write the hook**

Create `src/hooks/useProspects.ts`:

```ts
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { stageDeltas } from "@/lib/prospects/stageDeltas";
import type { StageKey } from "@/hooks/useOutboundMetrics";

export interface IgProspect {
  id: string;
  username: string;
  full_name: string | null;
  follower_count: number | null;
  following_count: number | null;
  profile_pic_url: string | null;
  is_verified: boolean;
  is_private: boolean;
  biography: string | null;
  external_url: string | null;
  category: string | null;
  is_business: boolean | null;
  media_count: number | null;
  public_email: string | null;
  public_phone: string | null;
  city_name: string | null;
  enrichment_status: "pending" | "done" | "failed";
  stage_reached: number;
  followed: boolean;
  followed_back: boolean;
  notes: string | null;
  created_at: string;
}

const tbl = () => (supabase as any).from("ig_prospects");
const metricsTbl = () => (supabase as any).from("outbound_metrics");
const dailyLogTbl = () => (supabase as any).from("outbound_daily_log");

const PLATFORM = "instagram";
const thisMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

/**
 * Every counter column on outbound_metrics. `follows` / `follow_backs` are
 * parallel counters, not funnel stages, so they are not StageKey members —
 * but they are written through the same path.
 */
type CounterKey = StageKey | "follows" | "follow_backs";

/**
 * Applies signed stage deltas to the SAME two tables the /outbound steppers
 * write to, with the same semantics: monthly rollup in outbound_metrics, plus
 * a day-level signed row in outbound_daily_log for the current month only
 * (editing a past month is backfill, not activity today).
 *
 * Counters credit the ACTING user, not whoever originally sourced the handle —
 * outbound_metrics is per-admin.
 */
async function applyFunnelDeltas(
  userId: string,
  deltas: { stage: CounterKey; delta: number }[],
) {
  if (deltas.length === 0) return;
  const month = thisMonth();

  const { data: existing } = await metricsTbl()
    .select("*")
    .eq("user_id", userId)
    .eq("platform", PLATFORM)
    .eq("month", month)
    .maybeSingle();

  const row: Record<string, unknown> = {
    user_id: userId, platform: PLATFORM, month,
    pre_initiated: existing?.pre_initiated ?? 0,
    message_seen: existing?.message_seen ?? 0,
    initiated: existing?.initiated ?? 0,
    engaged: existing?.engaged ?? 0,
    calendly_sent: existing?.calendly_sent ?? 0,
    booked: existing?.booked ?? 0,
    follows: existing?.follows ?? 0,
    follow_backs: existing?.follow_backs ?? 0,
    updated_at: new Date().toISOString(),
  };
  for (const d of deltas) {
    // The table has `>= 0` checks on every counter; clamp so a correction can
    // never push a rollup negative and reject the whole upsert.
    row[d.stage] = Math.max(0, (row[d.stage] as number) + d.delta);
  }

  const { error } = await metricsTbl().upsert(row, { onConflict: "user_id,platform,month" });
  if (error) { toast.error(`Couldn't update funnel: ${error.message}`); return; }

  await dailyLogTbl().insert(
    deltas.map((d) => ({ user_id: userId, platform: PLATFORM, stage: d.stage, delta: d.delta })),
  );
}

export function useProspects() {
  const { user } = useAuth();
  const [prospects, setProspects] = useState<IgProspect[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await tbl().select("*").order("created_at", { ascending: false }).limit(500);
    setProspects((data ?? []) as IgProspect[]);
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const anyPending = prospects.some((p) => p.enrichment_status === "pending");

  // Poll only while something on screen is still filling in, then stop.
  useEffect(() => {
    if (!anyPending) {
      if (pollTimer.current) { clearInterval(pollTimer.current); pollTimer.current = null; }
      return;
    }
    if (pollTimer.current) return;
    pollTimer.current = setInterval(load, 5000);
    return () => {
      if (pollTimer.current) { clearInterval(pollTimer.current); pollTimer.current = null; }
    };
  }, [anyPending, load]);

  const search = useCallback(async (query: string, limit = 15) => {
    if (!query.trim()) return;
    setSearching(true);
    const { data, error } = await supabase.functions.invoke("ig-prospect-search", {
      body: { query: query.trim(), limit },
    });
    setSearching(false);
    if (error) { toast.error(`Search failed: ${error.message}`); return; }
    const known = data?.already_known ?? 0;
    toast.success(
      `${data?.inserted ?? 0} new prospect${data?.inserted === 1 ? "" : "s"}` +
      (known > 0 ? ` · ${known} already known` : ""),
    );
    await load();
  }, [load]);

  const setStage = useCallback(async (p: IgProspect, next: number) => {
    if (!user || next === p.stage_reached) return;
    const deltas = stageDeltas(p.stage_reached, next);
    setProspects((prev) => prev.map((x) => (x.id === p.id ? { ...x, stage_reached: next } : x)));
    const { error } = await tbl()
      .update({ stage_reached: next, stage_at: new Date().toISOString() })
      .eq("id", p.id);
    if (error) {
      setProspects((prev) => prev.map((x) => (x.id === p.id ? { ...x, stage_reached: p.stage_reached } : x)));
      toast.error(`Couldn't save: ${error.message}`);
      return;
    }
    await applyFunnelDeltas(user.id, deltas);
  }, [user]);

  const toggleFollow = useCallback(async (p: IgProspect, field: "followed" | "followed_back") => {
    if (!user) return;
    const next = !p[field];
    const counter: CounterKey = field === "followed" ? "follows" : "follow_backs";
    setProspects((prev) => prev.map((x) => (x.id === p.id ? { ...x, [field]: next } : x)));
    const { error } = await tbl().update({ [field]: next }).eq("id", p.id);
    if (error) {
      setProspects((prev) => prev.map((x) => (x.id === p.id ? { ...x, [field]: !next } : x)));
      toast.error(`Couldn't save: ${error.message}`);
      return;
    }
    await applyFunnelDeltas(user.id, [{ stage: counter, delta: next ? 1 : -1 }]);
  }, [user]);

  return { prospects, loading, searching, anyPending, search, setStage, toggleFollow };
}
```

Note on the month rule: this hook has no month navigation — a prospect action is always activity today — so every write is current-month by construction. The spec's "current month only" day-log rule is therefore satisfied structurally rather than by a branch.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: no errors referencing `useProspects.ts`

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useProspects.ts
git commit -m "feat(prospects): data hook with funnel-writing stage changes

Stage changes write through the same outbound_metrics + outbound_daily_log
path the manual steppers use, crediting the acting admin. Polls every 5s only
while rows are still enriching."
```

---

### Task 9: Prospects tab UI

**Files:**
- Create: `src/components/outbound/ProspectsTab.tsx`
- Create: `src/components/outbound/ProspectRow.tsx`
- Modify: `src/pages/Outbound.tsx` (view toggle at lines ~87-95, render switch at lines ~121-125)

**Interfaces:**
- Consumes: `useProspects`, `IgProspect` (Task 8); `classifyLink`, `LINK_BADGE_LABEL` (Task 2); `STAGE_ORDER`, `stageLabel` (Task 1); `STAGE_FIELDS`, `STAGE_ICON` from `Outbound.tsx`/`useOutboundMetrics`
- Produces: `<ProspectsTab />`, `<ProspectRow prospect onStage onFollow />`

- [ ] **Step 1: Export `STAGE_ICON` from the page so the row can reuse it**

In `src/pages/Outbound.tsx`, change the `STAGE_ICON` declaration (~line 41) from `const STAGE_ICON` to `export const STAGE_ICON`. The icons are the funnel's visual vocabulary; the row must use the same ones or the tab reads as a different tool.

- [ ] **Step 2: Write the row component**

Create `src/components/outbound/ProspectRow.tsx`:

```tsx
import { ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { STAGE_FIELDS } from "@/hooks/useOutboundMetrics";
import { STAGE_ICON } from "@/pages/Outbound";
import { classifyLink, LINK_BADGE_LABEL } from "@/lib/prospects/linkBadge";
import type { IgProspect } from "@/hooks/useProspects";

const compact = (n: number | null) =>
  n == null ? "—" : n >= 1000 ? `${Math.round(n / 100) / 10}K` : String(n);

export function ProspectRow({
  prospect: p,
  onStage,
  onFollow,
}: {
  prospect: IgProspect;
  onStage: (p: IgProspect, next: number) => void;
  onFollow: (p: IgProspect, field: "followed" | "followed_back") => void;
}) {
  const pending = p.enrichment_status === "pending";
  const badge = classifyLink(p.external_url);

  return (
    <div className={`px-4 py-3 space-y-2 ${pending ? "opacity-55" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <a
            href={`https://instagram.com/${p.username}`}
            target="_blank"
            rel="noreferrer"
            className="text-sm font-semibold text-foreground hover:text-primary inline-flex items-center gap-1"
          >
            @{p.username}
            <ExternalLink className="w-3 h-3 shrink-0" />
          </a>
          <div className="text-xs text-muted-foreground truncate">
            {p.full_name || "—"}
            {p.category ? ` · ${p.category}` : ""}
            {p.city_name ? ` · ${p.city_name}` : ""}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-sm font-semibold tabular-nums text-foreground">
            {compact(p.follower_count)}
          </div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">followers</div>
        </div>
      </div>

      {pending ? (
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Loader2 className="w-3 h-3 animate-spin" /> enriching…
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className={`px-2 py-0.5 rounded-full border ${
            badge === "none"
              ? "border-border/60 text-muted-foreground"
              : "border-primary/40 text-primary"
          }`}>
            {LINK_BADGE_LABEL[badge]}
          </span>
          <span className="text-muted-foreground">{compact(p.media_count)} posts</span>
          {p.is_business && <span className="text-muted-foreground">· business</span>}
          {p.biography && (
            <span className="text-muted-foreground/80 truncate max-w-full">· {p.biography.slice(0, 80)}</span>
          )}
        </div>
      )}

      {/* Stage progression — same icons, labels and sheet codes as the funnel
          this feeds, so advancing a prospect reads as the funnel moving. */}
      <div className="flex flex-wrap items-center gap-1">
        {STAGE_FIELDS.map((f, i) => {
          const Icon = STAGE_ICON[f.key];
          const stage = i + 1;
          const reached = p.stage_reached >= stage;
          return (
            <button
              key={f.key}
              title={`${f.label} (${f.code})`}
              onClick={() => onStage(p, reached && p.stage_reached === stage ? stage - 1 : stage)}
              className={`h-8 px-2 rounded-lg border text-[10px] font-semibold inline-flex items-center gap-1 transition-colors ${
                reached
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card/60 text-muted-foreground border-border/60 hover:text-foreground"
              }`}
            >
              <Icon className="w-3 h-3" />
              {f.code}
            </button>
          );
        })}
        <div className="ml-auto flex items-center gap-1">
          <Button
            variant={p.followed ? "cta" : "ghost"}
            size="sm"
            className="h-8 px-2 text-[10px]"
            onClick={() => onFollow(p, "followed")}
          >
            Followed
          </Button>
          <Button
            variant={p.followed_back ? "cta" : "ghost"}
            size="sm"
            className="h-8 px-2 text-[10px]"
            onClick={() => onFollow(p, "followed_back")}
          >
            Back
          </Button>
        </div>
      </div>
    </div>
  );
}
```

Clicking the stage a prospect currently occupies steps it back one, which is how a mis-click gets corrected — and `stageDeltas` writes the matching negative deltas.

- [ ] **Step 3: Write the tab component**

Create `src/components/outbound/ProspectsTab.tsx`:

```tsx
import { useMemo, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useProspects } from "@/hooks/useProspects";
import { classifyLink } from "@/lib/prospects/linkBadge";
import { ProspectRow } from "./ProspectRow";

type SortKey = "recent" | "followers_desc" | "followers_asc";

export function ProspectsTab() {
  const { prospects, loading, searching, search, setStage, toggleFollow } = useProspects();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("recent");
  const [minFollowers, setMinFollowers] = useState(0);
  const [maxFollowers, setMaxFollowers] = useState(0); // 0 = no ceiling
  const [linkOnly, setLinkOnly] = useState(false);
  const [hideWorked, setHideWorked] = useState(false);

  const rows = useMemo(() => {
    let out = prospects;
    if (minFollowers > 0) out = out.filter((p) => (p.follower_count ?? 0) >= minFollowers);
    if (maxFollowers > 0) out = out.filter((p) => (p.follower_count ?? 0) <= maxFollowers);
    if (linkOnly) out = out.filter((p) => classifyLink(p.external_url) !== "none");
    if (hideWorked) out = out.filter((p) => p.stage_reached === 0);
    const sorted = [...out];
    if (sort === "followers_desc") sorted.sort((a, b) => (b.follower_count ?? 0) - (a.follower_count ?? 0));
    else if (sort === "followers_asc") sorted.sort((a, b) => (a.follower_count ?? 0) - (b.follower_count ?? 0));
    return sorted;
  }, [prospects, sort, minFollowers, maxFollowers, linkOnly, hideWorked]);

  return (
    <div className="space-y-4">
      <form
        onSubmit={(e) => { e.preventDefault(); search(query); }}
        className="flex items-center gap-2"
      >
        <div className="flex-1 relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="chiropractor austin"
            className="w-full h-10 pl-9 pr-3 rounded-xl border border-border/60 bg-background text-sm text-foreground focus:outline-none focus:border-primary/50"
          />
        </div>
        <Button type="submit" variant="cta" size="sm" className="h-10 px-4" disabled={searching || !query.trim()}>
          {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : "Search"}
        </Button>
      </form>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className="h-8 px-2 rounded-lg border border-border/60 bg-card/60 text-foreground"
        >
          <option value="recent">Newest</option>
          <option value="followers_desc">Most followers</option>
          <option value="followers_asc">Fewest followers</option>
        </select>
        <input
          type="number" inputMode="numeric" placeholder="min followers"
          value={minFollowers || ""} onChange={(e) => setMinFollowers(Number(e.target.value) || 0)}
          className="h-8 w-28 px-2 rounded-lg border border-border/60 bg-card/60 text-foreground"
        />
        <input
          type="number" inputMode="numeric" placeholder="max followers"
          value={maxFollowers || ""} onChange={(e) => setMaxFollowers(Number(e.target.value) || 0)}
          className="h-8 w-28 px-2 rounded-lg border border-border/60 bg-card/60 text-foreground"
        />
        <Button variant={linkOnly ? "cta" : "ghost"} size="sm" className="h-8 px-2 text-xs" onClick={() => setLinkOnly((v) => !v)}>
          Has link
        </Button>
        <Button variant={hideWorked ? "cta" : "ghost"} size="sm" className="h-8 px-2 text-xs" onClick={() => setHideWorked((v) => !v)}>
          Untouched only
        </Button>
        <span className="ml-auto text-muted-foreground">{rows.length} shown</span>
      </div>

      {loading ? (
        <div className="py-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : rows.length === 0 ? (
        <div className="py-12 text-center text-sm text-muted-foreground">
          No prospects yet. Search a niche and city above.
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-card/60 divide-y divide-border/40">
          {rows.map((p) => (
            <ProspectRow key={p.id} prospect={p} onStage={setStage} onFollow={toggleFollow} />
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Wire the tab into the page**

In `src/pages/Outbound.tsx`:

Add the import at the top with the other local imports:

```tsx
import { ProspectsTab } from "@/components/outbound/ProspectsTab";
```

Widen the view state (~line 67) from `useState<"month" | "annual">("month")` to:

```tsx
const [view, setView] = useState<"month" | "annual" | "prospects">("month");
```

Add a third toggle button after the Annual button (~line 93):

```tsx
<Button variant={view === "prospects" ? "cta" : "ghost"} size="sm" className="h-8 px-3 text-xs" onClick={() => setView("prospects")} disabled={platform !== "instagram"}>
  Prospects
</Button>
```

Replace the render switch (~lines 121-125) with:

```tsx
{view === "prospects" ? (
  <ProspectsTab />
) : view === "month" ? (
  <MonthView platform={platform} month={month} onShift={(d) => setMonth((m) => shiftMonth(m, d))} />
) : (
  <AnnualView platform={platform} year={year} onShift={(d) => setYear((y) => y + d)} />
)}
```

Finally, guard against the tab staying open when the operator switches platform — add after the view state:

```tsx
// Prospecting only sources Instagram, so leaving the tab open under another
// platform would show Instagram rows under a TikTok header.
useEffect(() => {
  if (view === "prospects" && platform !== "instagram") setView("month");
}, [platform, view]);
```

Add `useEffect` to the existing `react` import at line 1.

- [ ] **Step 5: Typecheck, lint and build**

```bash
npx tsc --noEmit -p tsconfig.app.json
npm run lint
npm run build
```

Expected: all three clean.

- [ ] **Step 6: Verify in the running app**

```bash
npm run dev
```

Navigate to `/outbound`, Instagram platform, Prospects tab. Verify:
1. Searching "chiropractor austin" adds rows within ~3s, greyed with "enriching…".
2. Within ~2 minutes rows fill in with category, link badge, and post count.
3. Clicking `A1` on a row highlights it; `/outbound` → Monthly shows Pre-Initiated incremented by 1.
4. Clicking `B` on the same row jumps it to Engaged, and Monthly shows Message Seen, Initiated and Engaged each incremented — the funnel stays monotone.
5. Clicking `B` again on that same row steps it back one, to Initiated (`A2`), and Engaged decrements by 1 while the stages below it stay put.
6. Switching to the TikTok platform tab drops the view back to Monthly.

- [ ] **Step 7: Commit**

```bash
git add src/components/outbound/ProspectsTab.tsx src/components/outbound/ProspectRow.tsx src/pages/Outbound.tsx
git commit -m "feat(prospects): Prospects tab on /outbound

Search sources handles instantly and they enrich in place. Stage buttons use
the same icons and sheet codes as the funnel they feed. Instagram-only, since
that is the only platform this sources."
```

- [ ] **Step 8: Deploy the frontend**

```bash
GH_TOKEN=$(grep GITHUB_ACCESS_TOKEN .env.local | cut -d'=' -f2) \
  git push "https://x-access-token:${GH_TOKEN}@github.com/connectacreators/connectacreators.git" HEAD:main
GH_TOKEN=$(grep GITHUB_ACCESS_TOKEN .env.local | cut -d'=' -f2) \
  git fetch "https://x-access-token:${GH_TOKEN}@github.com/connectacreators/connectacreators.git" main:refs/remotes/origin/main
```

Expected: CI builds and deploys. Confirm the Prospects tab is live on connectacreators.com/outbound.

---

## Post-implementation verification

Run the full suite and confirm nothing regressed:

```bash
npm test
npx tsc --noEmit -p tsconfig.app.json
npm run lint
```

Then confirm the drip is still healthy a day later:

```sql
select enrichment_status, count(*) from public.ig_prospects group by 1;
select stage, sum(delta) from public.outbound_daily_log
where platform = 'instagram' and logged_at > now() - interval '1 day' group by 1;
```

Expected: few or no `pending` rows lingering; day-log deltas match the stage actions taken.
