import { defineConfig, type PluginOption } from "vite";
import { resolve } from "node:path";
import { copyFileSync, existsSync } from "node:fs";

/**
 * UMD bundle ships as both `.umd.cjs` (Node `require()`) and `.umd.js`
 * (browser via CDN). The `.cjs` extension is required by Node — because
 * the package has `"type": "module"`, Node would otherwise try to parse
 * the UMD bundle as ESM and fail. But jsdelivr / unpkg serve `.cjs`
 * files with `Content-Type: application/node`, which modern browsers
 * refuse to execute under strict MIME checking. The `.js` mirror solves
 * that — it serves as `application/javascript` and the UMD wrapper
 * still detects the browser environment correctly.
 *
 * Bytes are identical between the two; the second file is purely a
 * server-side rename for CDN compatibility.
 */
const mirrorUmdAsJs = (): PluginOption => ({
  name: "boostgrid:mirror-umd-as-js",
  closeBundle() {
    const distDir = resolve(__dirname, "dist");
    const src = resolve(distDir, "boostgrid.umd.cjs");
    const dst = resolve(distDir, "boostgrid.umd.js");
    if (!existsSync(src)) return;
    copyFileSync(src, dst);
    const srcMap = src + ".map";
    if (existsSync(srcMap)) copyFileSync(srcMap, dst + ".map");
  },
});

export default defineConfig({
  plugins: [mirrorUmdAsJs()],
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
    // Use forked child processes instead of worker threads. The default
    // `threads` pool keeps the parent Vite/Vitest server alive ~10s after
    // the last test ("Tests closed successfully but something prevents
    // Vite server from exiting"). Forks die cleanly with their child
    // process, so `vitest run` exits immediately. Slightly slower per
    // file but avoids the 10s teardown timeout in `publish.bat`.
    pool: "forks",
    teardownTimeout: 1000,
  },
});
