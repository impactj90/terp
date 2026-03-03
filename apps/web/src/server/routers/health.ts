/**
 * Health Check Router
 *
 * Provides a simple health check endpoint to verify tRPC is working
 * end-to-end, including database connectivity.
 */
import { z } from "zod"
import { createTRPCRouter, publicProcedure } from "../trpc"

export const healthRouter = createTRPCRouter({
  check: publicProcedure
    .output(
      z.object({
        status: z.string(),
        timestamp: z.string(),
        database: z.string(),
      })
    )
    .query(async ({ ctx }) => {
      // Verify database connectivity with a simple query
      let dbStatus = "disconnected"
      try {
        await ctx.prisma.$queryRaw`SELECT 1`
        dbStatus = "connected"
      } catch {
        dbStatus = "error"
      }

      return {
        status: "ok",
        timestamp: new Date().toISOString(),
        database: dbStatus,
      }
    }),
})
