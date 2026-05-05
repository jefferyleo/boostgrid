import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      name: "Boostgrid",
      fileName: (format) => format === "es" ? "boostgrid.js" : `boostgrid.${format}.cjs`,
      formats: ["es", "umd"],
    },
    sourcemap: true,
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        assetFileNames: (asset) => asset.name === "style.css" ? "boostgrid.css" : asset.name ?? "asset",
      },
    },
  },
  server: {
    open: "/docs/index.html",
  },
  test: {
    environment: "jsdom",
    globals: true,
    include: ["test/**/*.test.ts"],
  },
});
