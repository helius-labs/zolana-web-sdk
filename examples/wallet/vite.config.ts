import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, type ProxyOptions } from "vite";

// Threaded proving shares memory between workers, which needs cross-origin isolation.
const isolationHeaders = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
};

/**
 * A key missing from `public/keys` is fetched from the pinned key CDN through
 * this server, so every supported shape proves without installing every key.
 * The CDN sends no CORS headers, so the page cannot fetch it directly; the page
 * checks each key against the digests bundled in the prover package.
 */
function provingKeysProxy(publicDirectory: string): Record<string, ProxyOptions> {
  const packageDist = dirname(fileURLToPath(import.meta.resolve("@heliuslabs/zolana-web-prover")));
  const { provingKeysBaseUrl } = JSON.parse(readFileSync(join(packageDist, "runtime.lock.json"), "utf8")) as {
    provingKeysBaseUrl: string;
  };
  return {
    "/keys": {
      target: provingKeysBaseUrl,
      changeOrigin: true,
      rewrite: (path) => path.replace(/^\/keys\//u, ""),
      // An installed key is served from `public` as before.
      bypass: (request) => (request.url !== undefined && existsSync(join(publicDirectory, request.url)) ? request.url : undefined),
    },
  };
}

const proxy = provingKeysProxy(fileURLToPath(new URL("./public", import.meta.url)));

export default defineConfig({
  plugins: [react()],
  build: { target: "esnext" },
  worker: { format: "es" },
  server: { host: "127.0.0.1", port: 5179, strictPort: true, headers: isolationHeaders, proxy },
  preview: { host: "127.0.0.1", port: 5179, strictPort: true, headers: isolationHeaders, proxy },
});
