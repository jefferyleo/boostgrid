import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      name: "BoostgridExport",
      fileName: (format) => format === "es" ? "boostgrid-export.js" : `boostgrid-export.${format}.cjs`,
      formats: ["es", "umd"],
    },
    sourcemap: true,
    emptyOutDir: false, // keep tsc-emitted .d.ts files
    rollupOptions: {
      external: ["boostgrid", "xlsx-js-style"],
      output: {
        exports: "named",
        globals: {
          boostgrid: "Boostgrid",
          "xlsx-js-style": "XLSX",
        },
      },
    },
  },
});
