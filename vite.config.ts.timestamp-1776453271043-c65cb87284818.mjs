// vite.config.ts
import { defineConfig } from "file:///Users/admin/Documents/connectacreators/node_modules/vite/dist/node/index.js";
import react from "file:///Users/admin/Documents/connectacreators/node_modules/@vitejs/plugin-react-swc/index.mjs";
import path from "path";
import { componentTagger } from "file:///Users/admin/Documents/connectacreators/node_modules/lovable-tagger/dist/index.js";
var __vite_injected_original_dirname = "/Users/admin/Documents/connectacreators";
var vite_config_default = defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080
  },
  plugins: [
    react(),
    mode === "development" && componentTagger()
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__vite_injected_original_dirname, "./src")
    }
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/three/")) return "three";
          if (id.includes("node_modules/ogl/")) return "ogl";
          if (id.includes("node_modules/gsap/")) return "gsap";
          if (id.includes("node_modules")) {
            return "vendor";
          }
          if (id.includes("followupEngine") || id.includes("aiGenerator") || id.includes("messageService") || id.includes("followupWorker")) {
            return "followup";
          }
        }
      }
    }
  }
}));
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvVXNlcnMvYWRtaW4vRG9jdW1lbnRzL2Nvbm5lY3RhY3JlYXRvcnNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZmlsZW5hbWUgPSBcIi9Vc2Vycy9hZG1pbi9Eb2N1bWVudHMvY29ubmVjdGFjcmVhdG9ycy92aXRlLmNvbmZpZy50c1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9pbXBvcnRfbWV0YV91cmwgPSBcImZpbGU6Ly8vVXNlcnMvYWRtaW4vRG9jdW1lbnRzL2Nvbm5lY3RhY3JlYXRvcnMvdml0ZS5jb25maWcudHNcIjtpbXBvcnQgeyBkZWZpbmVDb25maWcgfSBmcm9tIFwidml0ZVwiO1xuaW1wb3J0IHJlYWN0IGZyb20gXCJAdml0ZWpzL3BsdWdpbi1yZWFjdC1zd2NcIjtcbmltcG9ydCBwYXRoIGZyb20gXCJwYXRoXCI7XG5pbXBvcnQgeyBjb21wb25lbnRUYWdnZXIgfSBmcm9tIFwibG92YWJsZS10YWdnZXJcIjtcblxuLy8gaHR0cHM6Ly92aXRlanMuZGV2L2NvbmZpZy9cbmV4cG9ydCBkZWZhdWx0IGRlZmluZUNvbmZpZygoeyBtb2RlIH0pID0+ICh7XG4gIHNlcnZlcjoge1xuICAgIGhvc3Q6IFwiOjpcIixcbiAgICBwb3J0OiA4MDgwLFxuICB9LFxuICBwbHVnaW5zOiBbXG4gICAgcmVhY3QoKSxcbiAgICBtb2RlID09PSAnZGV2ZWxvcG1lbnQnICYmXG4gICAgY29tcG9uZW50VGFnZ2VyKCksXG4gIF0uZmlsdGVyKEJvb2xlYW4pLFxuICByZXNvbHZlOiB7XG4gICAgYWxpYXM6IHtcbiAgICAgIFwiQFwiOiBwYXRoLnJlc29sdmUoX19kaXJuYW1lLCBcIi4vc3JjXCIpLFxuICAgIH0sXG4gIH0sXG4gIGJ1aWxkOiB7XG4gICAgcm9sbHVwT3B0aW9uczoge1xuICAgICAgb3V0cHV0OiB7XG4gICAgICAgIG1hbnVhbENodW5rcyhpZCkge1xuICAgICAgICAgIC8vIEhlYXZ5IDNEL1dlYkdMIGxpYnMgZ2V0IHRoZWlyIG93biBjaHVua3MgdG8gYXZvaWQgdmVuZG9yIGNodW5rIGJsb2F0XG4gICAgICAgICAgaWYgKGlkLmluY2x1ZGVzKCdub2RlX21vZHVsZXMvdGhyZWUvJykpIHJldHVybiAndGhyZWUnO1xuICAgICAgICAgIGlmIChpZC5pbmNsdWRlcygnbm9kZV9tb2R1bGVzL29nbC8nKSkgcmV0dXJuICdvZ2wnO1xuICAgICAgICAgIGlmIChpZC5pbmNsdWRlcygnbm9kZV9tb2R1bGVzL2dzYXAvJykpIHJldHVybiAnZ3NhcCc7XG4gICAgICAgICAgLy8gQWxsIG90aGVyIG5vZGVfbW9kdWxlcyBpbnRvIGEgdmVuZG9yIGNodW5rXG4gICAgICAgICAgaWYgKGlkLmluY2x1ZGVzKCdub2RlX21vZHVsZXMnKSkge1xuICAgICAgICAgICAgcmV0dXJuICd2ZW5kb3InO1xuICAgICAgICAgIH1cbiAgICAgICAgICAvLyBGb2xsb3d1cCBlbmdpbmUgbW9kdWxlcyBpc29sYXRlZCB0byBicmVhayBjaXJjdWxhciBpbml0IG9yZGVyaW5nXG4gICAgICAgICAgaWYgKFxuICAgICAgICAgICAgaWQuaW5jbHVkZXMoJ2ZvbGxvd3VwRW5naW5lJykgfHxcbiAgICAgICAgICAgIGlkLmluY2x1ZGVzKCdhaUdlbmVyYXRvcicpIHx8XG4gICAgICAgICAgICBpZC5pbmNsdWRlcygnbWVzc2FnZVNlcnZpY2UnKSB8fFxuICAgICAgICAgICAgaWQuaW5jbHVkZXMoJ2ZvbGxvd3VwV29ya2VyJylcbiAgICAgICAgICApIHtcbiAgICAgICAgICAgIHJldHVybiAnZm9sbG93dXAnO1xuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgfSxcbiAgfSxcbn0pKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7QUFBdVMsU0FBUyxvQkFBb0I7QUFDcFUsT0FBTyxXQUFXO0FBQ2xCLE9BQU8sVUFBVTtBQUNqQixTQUFTLHVCQUF1QjtBQUhoQyxJQUFNLG1DQUFtQztBQU16QyxJQUFPLHNCQUFRLGFBQWEsQ0FBQyxFQUFFLEtBQUssT0FBTztBQUFBLEVBQ3pDLFFBQVE7QUFBQSxJQUNOLE1BQU07QUFBQSxJQUNOLE1BQU07QUFBQSxFQUNSO0FBQUEsRUFDQSxTQUFTO0FBQUEsSUFDUCxNQUFNO0FBQUEsSUFDTixTQUFTLGlCQUNULGdCQUFnQjtBQUFBLEVBQ2xCLEVBQUUsT0FBTyxPQUFPO0FBQUEsRUFDaEIsU0FBUztBQUFBLElBQ1AsT0FBTztBQUFBLE1BQ0wsS0FBSyxLQUFLLFFBQVEsa0NBQVcsT0FBTztBQUFBLElBQ3RDO0FBQUEsRUFDRjtBQUFBLEVBQ0EsT0FBTztBQUFBLElBQ0wsZUFBZTtBQUFBLE1BQ2IsUUFBUTtBQUFBLFFBQ04sYUFBYSxJQUFJO0FBRWYsY0FBSSxHQUFHLFNBQVMscUJBQXFCLEVBQUcsUUFBTztBQUMvQyxjQUFJLEdBQUcsU0FBUyxtQkFBbUIsRUFBRyxRQUFPO0FBQzdDLGNBQUksR0FBRyxTQUFTLG9CQUFvQixFQUFHLFFBQU87QUFFOUMsY0FBSSxHQUFHLFNBQVMsY0FBYyxHQUFHO0FBQy9CLG1CQUFPO0FBQUEsVUFDVDtBQUVBLGNBQ0UsR0FBRyxTQUFTLGdCQUFnQixLQUM1QixHQUFHLFNBQVMsYUFBYSxLQUN6QixHQUFHLFNBQVMsZ0JBQWdCLEtBQzVCLEdBQUcsU0FBUyxnQkFBZ0IsR0FDNUI7QUFDQSxtQkFBTztBQUFBLFVBQ1Q7QUFBQSxRQUNGO0FBQUEsTUFDRjtBQUFBLElBQ0Y7QUFBQSxFQUNGO0FBQ0YsRUFBRTsiLAogICJuYW1lcyI6IFtdCn0K
