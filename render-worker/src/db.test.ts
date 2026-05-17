// render-worker/src/db.test.ts
import { describe, it, expect } from "vitest";
import { makeClient } from "./db.js";

describe("makeClient", () => {
  it("throws when env vars are missing", () => {
    const oldUrl = process.env.SUPABASE_URL;
    const oldKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(() => makeClient()).toThrow(/SUPABASE_URL/);
    process.env.SUPABASE_URL = oldUrl;
    process.env.SUPABASE_SERVICE_ROLE_KEY = oldKey;
  });
});
