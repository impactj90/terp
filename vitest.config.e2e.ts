import { defineConfig } from "vitest/config"
import path from "path"
import dotenv from "dotenv"

// Load .env.local since vitest skips it in test mode
dotenv.config({ path: path.resolve(__dirname, ".env.local") })

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/e2e/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
