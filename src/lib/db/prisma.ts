import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "@/generated/prisma/client"

/**
 * Prisma Client singleton.
 *
 * In development, Next.js hot-reloading creates new module instances on every
 * change, which would exhaust database connections. This singleton pattern
 * reuses the existing PrismaClient across hot reloads.
 *
 * Prisma 7 requires a driver adapter (PrismaPg) for PostgreSQL connections.
 *
 * @see https://www.prisma.io/docs/orm/more/help-and-troubleshooting/help-articles/nextjs-prisma-client-dev-practices
 */

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL!
  const isRemote = connectionString.includes("supabase.co") || connectionString.includes("pooler.supabase.com")

  const adapter = new PrismaPg({
    connectionString,
    options: {
      ssl: isRemote ? { rejectUnauthorized: false } : undefined,
    },
  })

  return new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  })
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma
}
