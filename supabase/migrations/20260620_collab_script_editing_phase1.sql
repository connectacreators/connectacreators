-- Collaborative script editing — Phase 1
-- Applied to prod via Supabase MCP on 2026-06-20 (this file is for repo history).
-- Drops the (script_id, line_number) unique constraint so diff-based upserts that
-- reorder rows do not collide; line_number becomes an ordering hint and `id` is the
-- identity. Adds scripts.revision as a concurrency convergence backstop.

alter table public.script_lines
  drop constraint if exists script_lines_script_id_line_number_unique;

alter table public.scripts
  add column if not exists revision integer not null default 0;
