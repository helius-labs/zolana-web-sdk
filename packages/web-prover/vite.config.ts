import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  build: {
    target: "esnext",
    lib: {
      entry: "src/index.ts",
      formats: ["es"],
      fileName: "index",
    },
    rollupOptions: {
      external: ["@heliuslabs/zolana"],
    },
  },
  worker: { format: "es" },
});
