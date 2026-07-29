# Jarvis semantic memory — Phase 1 design

**Date:** 2026-07-29
**Surface:** `/ai` (CommandCenter → `companion-chat` edge function)
**Status:** approved, ready for implementation planning

---

## Problem

The `/ai` assistant has memory, but it is a 40-slot keyed dictionary, not a brain.

Verified current behavior:

- `assistant_memories` is keyed on `user_id → auth.users` with RLS `auth.uid() = user_id`.
  Memory is **already per logged-in user**. A `scope` discriminator (`'user'` | `'client'`)
  sub-partitions it, but ownership is the session, never the client.
- Retrieval is not semantic. `loadMemoriesForPrompt` does
  `ORDER BY pinned DESC, updated_at DESC LIMIT 40` per scope and dumps everything into the
  prompt. Values are clamped to 250 chars; unpinned rows LRU-evict at 40.
- `assistant_messages` stores every message but only the current thread is ever read back.
  All past conversations are write-only.
- No pgvector, no embeddings anywhere in the repo.

Three consequences:

1. **Capacity.** 40 keys × 250 chars cannot hold the working memory of a head of operations.
2. **Cost and latency.** Every memory row is injected on every turn as an uncached input
   token (see "Latency" below). The system gets *slower* the more it remembers.
3. **Amnesia.** Conversation history, decisions, and operational context are never recalled.

## Goals

- Semantic recall over a growing memory corpus, scoped per logged-in user.
- **Measurably lower prompt→answer latency**, not merely "not slower." This is a
  first-class requirement, not a side effect.
- No regression in what the assistant currently remembers.

## Non-goals (Phase 1)

- Conversation-history distillation and embedding — Phase 2.
- Embedding operational data (scripts, client onboarding) — Phase 2.
- Replacing `assistant_memories` as the authoring surface for facts. It stays.
- Multi-user / team-shared memory. Ownership stays per-user.

## Decisions taken

| Question | Decision | Rationale |
|---|---|---|
| Memory scope | Per logged-in user (already true) | Confirmed in schema + RLS |
| Embedding model | OpenAI `text-embedding-3-small`, 1536d | `OPENAI_API_KEY` already provisioned for `deep-research`, `transcribe-onboarding`, `transcribe-canvas-media`, `viral-analyze-queue`. No new provider, no new secret. |
| Vector store | pgvector in the same Postgres | Retrieval is one SQL call inside the function already running |
| Corpora in Phase 1 | Distilled facts + decisions/directives | The two that need no distillation pipeline |
| Sequencing | Substrate + latency fixes ship together | Latency is a stated goal; shipping the brain without the cache fixes would make the goal unverifiable |

---

## Section 1 — Data model

### `memory_chunks` is a derived index, not a source of record

`assistant_memories` remains the authoring surface for facts. `save_memory`,
`delete_memory`, `list_memories`, `pin_memory`, `unpin_memory`,
`enforce_assistant_memory_cap`, and `AssistantMemoryEditor.tsx` all keep working unchanged.

`memory_chunks` is a **derived, rebuildable search index**. Every row points back to its
origin row.

Why this split rather than adding an `embedding` column to `assistant_memories`:

- **Model changes become truncate-and-rebuild, not a data migration.** Changing embedding
  model or dimension never touches the source of record.
- **Cross-corpus ranking stays one query.** With four corpora eventually landing here, a
  single table ranks them against each other. Per-corpus embedding columns would force a
  UNION that degrades with every corpus added.
- **Follows the established precedent.** `20260509_memories.sql` records that an earlier
  draft split memory across separate tables and was superseded by a single table with a
  discriminator.

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE memory_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id uuid REFERENCES clients(id) ON DELETE CASCADE,  -- NULL = agency-wide

  source text NOT NULL CHECK (source IN
    ('fact','decision','conversation','script','client_profile')),
  source_table text NOT NULL,   -- e.g. 'assistant_memories'
  source_ref uuid NOT NULL,     -- origin row id

  content text NOT NULL,        -- exactly the text that was embedded
  embedding vector(1536),       -- NULL until embedded
  embedding_version text NOT NULL DEFAULT 'text-embedding-3-small/v1',

  pinned boolean NOT NULL DEFAULT false,  -- mirrored from source row
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (source_table, source_ref)
);

CREATE INDEX memory_chunks_owner_idx ON memory_chunks (user_id, client_id, source);
CREATE INDEX memory_chunks_pending_idx ON memory_chunks (created_at)
  WHERE embedding IS NULL;
CREATE INDEX memory_chunks_hnsw ON memory_chunks
  USING hnsw (embedding vector_cosine_ops);

ALTER TABLE memory_chunks ENABLE ROW LEVEL SECURITY;
CREATE POLICY memory_chunks_owner ON memory_chunks
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
```

Phase 1 writes only `source IN ('fact','decision')`. The other three values are in the
CHECK constraint so Phase 2 needs no schema change.

### `assistant_decisions` (new, small)

Decisions and directives do not fit the key/value shape of `assistant_memories`.

```sql
CREATE TABLE assistant_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id uuid REFERENCES clients(id) ON DELETE CASCADE,
  decision text NOT NULL,          -- what was decided
  rationale text,                  -- why
  decided_on date NOT NULL DEFAULT current_date,
  source_thread_id uuid REFERENCES assistant_threads(id) ON DELETE SET NULL,
  superseded_by uuid REFERENCES assistant_decisions(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX assistant_decisions_owner_idx ON assistant_decisions (user_id, client_id);

ALTER TABLE assistant_decisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY assistant_decisions_owner ON assistant_decisions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
```

`superseded_by` matters: a reversed decision must stop being recalled as current. Superseded
rows are excluded from the index projection.

### Three explicit notes

**The HNSW index is not load-bearing yet.** With one user and ~40–100 fact rows Postgres
will sequential-scan, which is sub-millisecond and *more* accurate than approximate search.
The index costs nothing and matters once conversations land in Phase 2. Its presence is not
a claim that it is doing work today.

**Embedding is synchronous on write, deliberately not a cron.**
`20260729_ig_prospect_enrich_cron.sql` is the established project pattern for drip
enrichment and is **not** copied here. Once retrieval replaces the dump-everything path, a
memory saved 30 seconds ago would be invisible until the next cron tick — the assistant
would forget something it was just told. A 250-char embed is ~50 ms inside a tool handler
already doing DB round-trips. A per-minute cron still handles **backfill and repair** of
rows where `embedding IS NULL`.

**`pinned` is mirrored, not authoritative.** The source row owns it; the chunk copies it so
retrieval filters without a join. Writers must keep it in sync.

---

## Section 2 — Retrieval, prompt injection, latency

### Retrieval RPC

```sql
CREATE OR REPLACE FUNCTION match_memory_chunks(
  p_user_id uuid,
  p_client_id uuid,
  p_query_embedding vector(1536),
  p_match_count int DEFAULT 8,
  p_min_similarity float DEFAULT 0.25
)
RETURNS TABLE (
  id uuid, source text, content text, client_id uuid, similarity float
)
LANGUAGE sql STABLE
AS $$
  SELECT mc.id, mc.source, mc.content, mc.client_id,
         1 - (mc.embedding <=> p_query_embedding) AS similarity
  FROM memory_chunks mc
  WHERE mc.user_id = p_user_id
    AND mc.embedding IS NOT NULL
    AND mc.pinned = false
    AND (mc.client_id IS NULL OR mc.client_id = p_client_id)
    AND 1 - (mc.embedding <=> p_query_embedding) >= p_min_similarity
  ORDER BY mc.embedding <=> p_query_embedding
  LIMIT LEAST(GREATEST(p_match_count, 1), 25);
$$;
```

`SECURITY INVOKER` (the default) is intentional: service-role calls from `companion-chat`
are guarded by the explicit `user_id = p_user_id` predicate, and authenticated calls from
the browser additionally get RLS applied. Defence in depth without a `SECURITY DEFINER`
escape hatch.

Note the `p_client_id IS NULL` behavior falls out for free: when it is NULL,
`mc.client_id = p_client_id` is NULL rather than true, so only agency-wide rows match.
That is exactly the cross-client ("master") semantics required below.

`LEAST(GREATEST(...))` bounds `p_match_count` so a caller cannot request the whole corpus.

### Injection: a pinned floor plus semantic top-K

Pure semantic retrieval will miss load-bearing facts the query did not mention — e.g. an
`autonomy_mode: ask before acting` memory must be present regardless of similarity to the
current question.

- **Pinned rows always inject**, no similarity gate, no retrieval involved.
- **Unpinned rows** are the top 8 above similarity 0.25.

Retrieval is therefore **purely additive over the pin floor**. Anything currently
load-bearing gets pinned during migration and keeps working, so there is no behavioral
regression path.

Prompt budget: pinned (already capped at 40 per scope by `enforce_assistant_memory_cap`)
plus 8 retrieved, versus today's up-to-80 unconditional. Net shrink of the uncached prompt
suffix.

### The embedding module

New `supabase/functions/_shared/embeddings.ts`:

- `embedText(text: string): Promise<number[] | null>` — POST
  `https://api.openai.com/v1/embeddings`, model `text-embedding-3-small`, returns 1536
  floats. Returns `null` on **any** failure, logged, never thrown.
- Input normalization: trim, collapse whitespace, cap at 8000 chars to bound cost.

**Graceful degradation is a hard requirement.** If `embedText` returns `null`, memory
loading falls back to the current pinned-first / recency path with a reduced limit (12, not
40). An OpenAI outage must never break the assistant, and must not silently restore the
full 80-row dump either.

### Where the embed call goes (this is the latency-critical detail)

`companion-chat/index.ts` parses the request body at ~line 1003; `message` is available
there. Client resolution, accessible-client lookup, and `@`-mention resolution run between
there and the `Promise.all` at ~line 1378.

Start `embedText(message)` **at body-parse time without awaiting**, then include the
already-in-flight promise in the existing `Promise.all`. The embed overlaps all of client
resolution rather than adding a serial hop. Expected added critical-path latency: ~0.

The retrieval call needs both the embedding *and* the resolved `client.id`, and only the
latter is available at the `Promise.all`. To keep the embed provably off the critical path,
the new loader takes the **promise**, not the resolved vector, and awaits it internally:

```ts
// at ~1003, right after body parse — no await
const embedPromise = embedText(message);

// at ~1378, inside the existing Promise.all
loadRetrievedMemoryBlocks(adminClient, user.id, memoryClientId, embedPromise)
```

Awaiting the embed *before* the `Promise.all` would work in practice — it has almost
certainly resolved by then — but would reintroduce a serial hop on a cold connection.
Passing the promise makes the non-blocking property structural rather than incidental.

### Latency work

Verified findings this addresses:

1. **`cache_control` appears exactly twice in the whole 3,554-line function** — on
   `STATIC_SYSTEM_PROLOGUE` and on the last tool (`buildCachedSystem` /
   `buildCachedTools`). **There is no breakpoint anywhere in `messages`.** Up to 40 prior
   messages are re-prefilled at full price on every request. On a long thread this dominates
   TTFT and has nothing to do with memory.

2. **The memory block is already in the uncached suffix.** `dynamicSystemContext` is a
   6,688-char template with 41 interpolations sitting *after* the cache breakpoint. Every
   memory row injected today is a full-price token, every turn. Shrinking 80 rows to
   pinned+8 shrinks prefill, which lowers TTFT. This is why semantic retrieval makes the
   endpoint faster rather than slower.

Changes:

- **`buildCachedMessages(messages)`** — add message-level cache breakpoints. Anthropic
  allows **4 breakpoints per request** and tools + static system already consume 2, so
  exactly **2 remain for messages**. They are positioned so that each breakpoint's
  backward walk stays under the **20-content-block lookback window** — a tool-heavy turn
  can emit more than 20 `tool_use`/`tool_result` blocks and silently miss otherwise. Exact
  placement algorithm is an implementation concern with a dedicated test; the invariants
  are: ≤2 message breakpoints, walk-back <20 blocks, idempotent, correct for empty and
  single-message arrays.

- **Instrumentation.** Extend the existing `logAnthropicUsage` to record
  `cache_read_input_tokens`, `cache_creation_input_tokens`, `input_tokens`, and a
  server-measured TTFT (request entry → first SSE token flush). Without this the latency
  goal is unverifiable, so this is a requirement, not telemetry polish.

- **Cross-client memory leak fix.** `CommandCenter.tsx` reads `dashboard_viewMode` from
  localStorage and forwards `active_client_id` only when it is a UUID. Values are
  `"master" | "me" | <uuid>`. When it is `"master"`, `active_client_id` is null and
  `companion-chat` falls back to the user's **primary client**, then injects that client's
  memories — so cross-client mode silently talks as if one specific client were in the
  room. Fix: the frontend forwards a new `client_scope: 'master' | 'me' | 'explicit'`
  alongside `active_client_id`; `companion-chat` passes `p_client_id = NULL` to memory
  retrieval when `client_scope === 'master'`. The resolved client is still used for tool
  routing — tools need one — only memory injection changes. `"me"` keeps loading the user's
  own client memories, which is correct.

### Considered and rejected

**Splitting `dynamicSystemContext` into a third cached system block** (date + client +
strategy are stable within a session; only memory is per-request). Rejected: it would
consume one of the 4 breakpoints, and message-history caching is worth more given threads
run to 40 messages.

**Mid-conversation system messages** (`{role:"system"}` inside `messages[]`) are the clean
way to inject volatile retrieved context without disturbing the cached prefix. Rejected as
unavailable: that mechanism requires Opus 5 / Opus 4.8 / Fable 5, and `companion-chat` runs
`claude-sonnet-4-6` and `claude-haiku-4-5`. Retrieved memory stays in the dynamic system
suffix. This is not a regression — it is already there — but it does mean the nicer
mechanism is gated behind a model move.

---

## Section 3 — Testing and acceptance

Existing infra: Deno tests in `supabase/functions/_shared/assistant/*.test.ts` with a local
`deno.json`; vitest for the frontend.

### Pure-function tests (Deno, no DB)

- `formatRetrievedMemories()` — pinned first; source labels present; empty input → `""`.
- `buildCachedMessages()` — ≤2 breakpoints; walk-back <20 content blocks; idempotent;
  correct for `[]` and a single message; total request breakpoints never exceed 4.
- `embeddings.ts` input normalization — whitespace collapse, 8000-char cap.

### RPC tests (SQL, needs DB)

- Returns only the calling `user_id`'s rows.
- `p_client_id = NULL` returns agency-wide rows only (the master-mode semantics).
- `p_client_id = <uuid>` returns agency-wide **and** that client's rows, no others.
- `p_min_similarity` gate excludes weak matches.
- Pinned rows excluded (they inject via the separate floor path).
- Rows with `embedding IS NULL` excluded.
- `p_match_count` clamped to 25.

### Degradation test

`embedText` returns `null` → memory loading falls back to the recency path at limit 12, and
the chat still produces an answer.

### Acceptance criteria

1. `cache_read_input_tokens > 0` on turn 2+ of any thread. It is currently always 0 for
   message content — this is the primary latency fix and the check that proves it landed.
2. Uncached memory tokens per request drop from up-to-80 rows to pinned + ≤8.
3. A recorded before/after TTFT measurement on the same real thread, in the PR description.
   Not a unit test — a measurement, because "faster" was the stated goal.
4. Every memory the assistant currently surfaces is still surfaced (pin migration verified).
5. A memory saved during a conversation is retrievable in the next turn of that same
   conversation.

---

## Open item

The Supabase MCP server is not authorized in the session where this spec was written, so
the live database was not inspected — the schema statements above are derived from the
migration files in `supabase/migrations/`. Authorize it (or confirm via `psql`) before
applying migrations, in case the live schema has drifted from the migration history.
