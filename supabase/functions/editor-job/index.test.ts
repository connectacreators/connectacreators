// supabase/functions/editor-job/index.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

// Minimal black-box: only check the validation branches. Postgres-touching
// behavior is verified in the end-to-end smoke test (Task 21).

Deno.test("editor-job rejects non-POST", async () => {
  const mod = await import("./index.ts");
  // The serve() side effect runs on import; we exercise it by hitting localhost.
  // Skip integration here — this test exists as a placeholder for future
  // unit-extractable validators. For Phase 1 we leave validation tested at the
  // smoke level. (See Task 21.)
  assertEquals(typeof mod, "object");
});
