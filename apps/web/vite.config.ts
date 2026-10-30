import { defineConfig } from "vite";

export default defineConfig({
  server: {
    port: 5173,
    proxy: { "/api": "http://localhost:8787" },
  },
  build: {
    // Keep the audio worklet a real file: data: URLs are blocked by strict CSPs (and in extensions).
    assetsInlineLimit: (file) => (file.endsWith("-worklet.js") ? false : undefined),
  },
});
