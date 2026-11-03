import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vite";

// Extension pages (widget iframe, popup, mic setup) and the background worker.
// The content script is built separately (vite.content.config.ts) because it must be one classic script.
export default defineConfig({
  base: "./",
  plugins: [
    {
      // The yeti's model lives with the web app; the extension ships the same file.
      name: "yeti-model",
      generateBundle() {
        this.emitFile({ type: "asset", fileName: "models/yeti.glb", source: readFileSync(resolve(__dirname, "../web/public/models/yeti.glb")) });
      },
    },
  ],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    // Keep the audio worklet a real file: data: URLs are blocked by extension CSPs.
    assetsInlineLimit: (file) => (file.endsWith("-worklet.js") ? false : undefined),
    rollupOptions: {
      input: {
        popup: resolve(__dirname, "popup.html"),
        permission: resolve(__dirname, "permission.html"),
        offscreen: resolve(__dirname, "offscreen.html"),
        background: resolve(__dirname, "src/background.ts"),
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
});
