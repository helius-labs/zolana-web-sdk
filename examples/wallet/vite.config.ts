import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Threaded proving shares memory between workers, which needs cross-origin isolation.
const isolationHeaders = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
};

export default defineConfig({
  plugins: [react()],
  build: { target: "esnext" },
  worker: { format: "es" },
  server: { host: "127.0.0.1", port: 5179, strictPort: true, headers: isolationHeaders },
  preview: { host: "127.0.0.1", port: 5179, strictPort: true, headers: isolationHeaders },
});
