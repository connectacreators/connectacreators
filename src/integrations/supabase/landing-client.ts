// Slim Supabase REST client used only by the public landing entry. Uses
// @supabase/postgrest-js directly so we don't pull in auth-js, realtime-js,
// storage-js, and functions-js into the landing bundle. ~75 KB smaller than
// the full @supabase/supabase-js client.

import { PostgrestClient } from "@supabase/postgrest-js";
import type { Database } from "./types";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const landingDb = new PostgrestClient<Database>(`${SUPABASE_URL}/rest/v1`, {
  headers: {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  },
});
