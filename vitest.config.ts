import { defineConfig } from "vitest/config"
import path from "path"
import dotenv from "dotenv"

// Load .env.local for DATABASE_URL and other env vars needed by router tests
dotenv.config({ path: path.resolve(__dirname, ".env.local") })

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/__tests__/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
