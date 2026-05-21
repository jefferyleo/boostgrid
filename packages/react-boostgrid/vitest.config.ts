import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: {
    jsx: "automatic",
  },
  test: {
    environment: "jsdom",
    globals: true,
    include: ["test/**/*.test.{ts,tsx}"],
    // Forks pool so the Vite server tears down immediately on test exit
    // (avoids the 10s "close timed out" hang in publish.bat).
    pool: "forks",
    teardownTimeout: 1000,
  },
});
