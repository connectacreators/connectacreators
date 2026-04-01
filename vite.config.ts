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
      output: {
        manualChunks(id) {
          // All node_modules into a vendor chunk
          if (id.includes('node_modules')) {
            return 'vendor';
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
        },
      },
    },
  },
}));
