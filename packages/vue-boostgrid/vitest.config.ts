import { defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
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
