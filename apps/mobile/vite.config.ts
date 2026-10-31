import { defineConfig } from "vite";

// The app reuses Tekkie's character and voice code from apps/web.
export default defineConfig({
  build: {
    // Keep the audio worklet a real file rather than an inlined data: URL.
    assetsInlineLimit: (file) => (file.endsWith("-worklet.js") ? false : undefined),
  },
});
