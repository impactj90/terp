/**
 * Activity Codes KldB Router
 *
 * Public lookup for KldB (Klassifikation der Berufe) activity codes.
 * Uses full-text search with German language support.
 * No permission required (tenant auth only).
 */
import { z } from "zod"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { handleServiceError } from "@/trpc/errors"

// --- Router ---

export const activityCodesKldbRouter = createTRPCRouter({
  /**
   * activityCodesKldb.search -- Searches KldB activity codes by name or code prefix.
   *
   * Uses PostgreSQL full-text search with German language support
   * and code prefix matching.
   */
  search: tenantProcedure
    .input(
      z.object({
        query: z.string(),
        limit: z.number().optional(),
      })
    )
    .output(
      z.object({
        data: z.array(
          z.object({
            code: z.string(),
            name: z.string(),
            category: z.string().nullable(),
          })
        ),
      })
    )
    .query(async ({ ctx, input }) => {
      try {
        const codePrefix = input.query + "%"
        const limit = input.limit ?? 20
        const results = await ctx.prisma.$queryRaw<
          Array<{ code: string; name: string; category: string | null }>
        >`
          SELECT code, name, category
          FROM activity_codes_kldb
          WHERE is_active = true AND (
            to_tsvector('german', name) @@ plainto_tsquery('german', ${input.query})
            OR code LIKE ${codePrefix}
          )
          LIMIT ${limit}
        `
        return { data: results }
      } catch (err) {
        handleServiceError(err)
      }
    }),
})
