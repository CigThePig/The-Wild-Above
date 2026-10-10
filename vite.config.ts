import { defineConfig } from "vite";
export default defineConfig({
  // Captures and compare checkouts are written under artifacts/ while the
  // dev server runs; they are outputs, not sources to hot-reload.
  server: {
    port: 5173,
    strictPort: true,
    watch: { ignored: ["**/artifacts/**"] },
  },
  build: { chunkSizeWarningLimit: 1600 },
});
