import dotenv from "dotenv"
import { defineConfig, env } from "prisma/config"

// Load .env.local (Next.js convention), falling back to .env
dotenv.config({ path: ".env.local" })
dotenv.config({ path: ".env" })

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: env("DATABASE_URL"),
  },
})
