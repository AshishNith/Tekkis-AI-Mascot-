import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // shadcn convention: "@/components/ui/..." and "@/lib/utils" resolve inside src.
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: {
    port: 5173,
    proxy: { "/api": "http://localhost:8787" },
  },
  build: {
    // Keep the audio worklet a real file: data: URLs are blocked by strict CSPs (and in extensions).
    assetsInlineLimit: (file) => (file.endsWith("-worklet.js") ? false : undefined),
    // The landing page is the root; the developer playground keeps its own page.
    rollupOptions: { input: { index: "index.html", playground: "playground.html" } },
  },
});
