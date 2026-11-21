import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: { environment: "node", include: ["tests/**/*.test.ts"], testTimeout: 30000, hookTimeout: 60000, fileParallelism: false, env: { NOTIFY_DISABLED: "true", AUTH_SECRET: "test-secret", TICKET_SECRET: "test-ticket" } },
});
