import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [vue()],
  build: {
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      name: "VueBoostgrid",
      fileName: (format) => format === "es" ? "vue-boostgrid.js" : `vue-boostgrid.${format}.cjs`,
      formats: ["es", "umd"],
    },
    sourcemap: true,
    emptyOutDir: false,
    rollupOptions: {
      external: ["vue", "boostgrid"],
      output: {
        exports: "named",
        globals: {
          vue: "Vue",
          boostgrid: "Boostgrid",
        },
      },
    },
  },
});
