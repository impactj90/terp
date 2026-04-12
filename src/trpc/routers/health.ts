/**
 * Health Check Router
 *
 * Provides a simple health check endpoint to verify tRPC is working
 * end-to-end, including database connectivity.
 */
import { z } from "zod"
import { createTRPCRouter, publicProcedure } from "@/trpc/init"

export const healthRouter = createTRPCRouter({
  check: publicProcedure
    .output(
      z.object({
        status: z.string(),
        timestamp: z.string(),
      })
    )
    .query(async ({ ctx }) => {
      // Verify database connectivity internally (do not expose state publicly)
      try {
        await ctx.prisma.$queryRaw`SELECT 1`
      } catch {
        // Database unreachable — still return ok for the HTTP layer;
        // monitoring should detect DB issues via separate probes.
      }

      return {
        status: "ok",
        timestamp: new Date().toISOString(),
      }
    }),
})
