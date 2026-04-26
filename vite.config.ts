import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    mode === 'development' &&
    componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, "index.html"),
        landing: path.resolve(__dirname, "landing.html"),
      },
      output: {
        manualChunks(id) {
          // Heavy 3D/WebGL libs get their own chunks to avoid vendor chunk bloat
          if (id.includes('node_modules/three/')) return 'three';
          if (id.includes('node_modules/ogl/')) return 'ogl';
          if (id.includes('node_modules/gsap/')) return 'gsap';
          // Isolate postgrest-js into its own chunk so the public landing
          // entry can use it without dragging in auth/realtime/storage.
          if (id.includes('node_modules/@supabase/postgrest-js/')) {
            return 'postgrest';
          }
          // Force the heavy parts of Supabase (auth, realtime, storage,
          // functions, the umbrella supabase-js) plus the main full client
          // into a dedicated chunk. This is what the main app uses. The
          // public landing entry uses postgrest-js directly via
          // landing-client.ts, so this chunk is not loaded for landing.
          if (
            id.includes('node_modules/@supabase/supabase-js/') ||
            id.includes('node_modules/@supabase/auth-js/') ||
            id.includes('node_modules/@supabase/realtime-js/') ||
            id.includes('node_modules/@supabase/storage-js/') ||
            id.includes('node_modules/@supabase/functions-js/') ||
            id.endsWith('/integrations/supabase/client.ts')
          ) {
            return 'supabase-client';
          }
          // Followup engine modules isolated to break circular init ordering
          if (
            id.includes('followupEngine') ||
            id.includes('aiGenerator') ||
            id.includes('messageService') ||
            id.includes('followupWorker')
          ) {
            return 'followup';
          }
          // Let Rollup auto-chunk everything else: shared deps used by both
          // landing-main and main entries end up in a shared chunk; main-only
          // deps end up in main-only chunks.
        },
      },
    },
  },
}));
