import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, "src/index.tsx"),
      name: "ReactBoostgrid",
      fileName: (format) => format === "es" ? "react-boostgrid.js" : `react-boostgrid.${format}.cjs`,
      formats: ["es", "umd"],
    },
    sourcemap: true,
    emptyOutDir: false, // keep tsc-emitted .d.ts files
    rollupOptions: {
      external: ["react", "react/jsx-runtime", "react-dom", "boostgrid"],
      output: {
        exports: "named",
        globals: {
          react: "React",
          "react/jsx-runtime": "ReactJSXRuntime",
          "react-dom": "ReactDOM",
          boostgrid: "Boostgrid",
        },
      },
    },
  },
  esbuild: {
    jsx: "automatic",
  },
});
