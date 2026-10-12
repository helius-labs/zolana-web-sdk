import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  build: {
    target: "esnext",
    // Minifying would strip the worker's /* @vite-ignore */ and warn in every consumer's build.
    minify: false,
    lib: {
      entry: "src/index.ts",
      formats: ["es"],
      fileName: "index",
    },
  },
  worker: { format: "es" },
});
