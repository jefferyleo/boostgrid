import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    include: ["test/**/*.test.ts"],
    server: {
      deps: {
        // xlsx-js-style is an OPTIONAL peer dep — keep it out of vite's
        // module graph so tests can run without it installed.
        external: ["xlsx-js-style"],
      },
    },
    // Forks pool so the Vite server tears down immediately on test exit
    // (avoids the 10s "close timed out" hang in publish.bat).
    pool: "forks",
    teardownTimeout: 1000,
  },
});
