import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, type Connect, type Plugin, type ProxyOptions } from "vite";

// Threaded proving shares memory between workers, which needs cross-origin isolation.
const isolationHeaders = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
};

/**
 * Every proving key, not only the ones `assets` installed: a key missing from
 * `public/keys` is fetched from the pinned key CDN through this server, and
 * `keys/manifest.json` lists all of them from the package's lockfile, which the
 * page checks each key against. The CDN sends no CORS headers, so the page
 * cannot fetch it directly.
 */
function provingKeysFromCdn(publicDirectory: string): Readonly<{ plugin: Plugin; proxy: Record<string, ProxyOptions> }> {
  const packageDist = dirname(fileURLToPath(import.meta.resolve("@heliuslabs/zolana-web-prover")));
  const read = (file: string): unknown => JSON.parse(readFileSync(join(packageDist, file), "utf8"));
  const { provingKeysBaseUrl } = read("runtime.lock.json") as { provingKeysBaseUrl: string };
  const { keys } = read("wasm/prover/provingkeys/proving-keys.lock") as {
    keys: Record<string, { size: number; sha256: string }>;
  };
  const manifest = JSON.stringify(
    Object.fromEntries(
      Object.entries(keys)
        .filter(([name]) => /^(transfer_confidential_\d+_\d+|merge_\d+_1)\.key$/u.test(name))
        .map(([name, { size, sha256 }]) => [name, { size, sha256 }]),
    ),
  );
  const serveManifest: Connect.NextHandleFunction = (request, response, next) => {
    if (request.url !== "/keys/manifest.json") return next();
    response.setHeader("content-type", "application/json");
    response.end(manifest);
  };
  return {
    plugin: {
      name: "proving-keys-from-cdn",
      configureServer(server) {
        server.middlewares.use(serveManifest);
      },
      configurePreviewServer(server) {
        server.middlewares.use(serveManifest);
      },
    },
    proxy: {
      "/keys": {
        target: provingKeysBaseUrl,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/keys\//u, ""),
        // An installed key is served from `public` as before.
        bypass: (request) => (request.url !== undefined && existsSync(join(publicDirectory, request.url)) ? request.url : undefined),
      },
    },
  };
}

const keys = provingKeysFromCdn(fileURLToPath(new URL("./public", import.meta.url)));

export default defineConfig({
  plugins: [react(), keys.plugin],
  build: { target: "esnext" },
  worker: { format: "es" },
  server: { host: "127.0.0.1", port: 5179, strictPort: true, headers: isolationHeaders, proxy: keys.proxy },
  preview: { host: "127.0.0.1", port: 5179, strictPort: true, headers: isolationHeaders, proxy: keys.proxy },
});
