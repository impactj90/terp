import { defineConfig } from "vitest/config"
import path from "path"
import dotenv from "dotenv"

// Load .env.local for DATABASE_URL and other env vars needed by router tests
dotenv.config({ path: path.resolve(__dirname, ".env.local") })

export default defineConfig({
  test: {
    globals: true,
    // Default environment is `node` — individual `.tsx` component tests
    // opt into `jsdom` via the `@vitest-environment jsdom` pragma at the
    // top of the file so we keep the server-side tests fast.
    environment: "node",
    include: ["src/**/__tests__/**/*.test.ts", "src/**/__tests__/**/*.test.tsx"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
