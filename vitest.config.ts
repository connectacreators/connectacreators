import { defineConfig } from "vitest/config";
import path from "path";

// Frontend unit tests only. The repo also contains Deno tests under
// supabase/functions/** (imported via https: URLs) and a separate vitest
// project under render-worker/** — neither should run with the root runner,
// so we scope include to src/.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    environment: "node",
  },
});
