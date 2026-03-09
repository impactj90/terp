/**
 * Audit Logs Router
 *
 * Provides read-only audit log access via tRPC procedures.
 * Audit log creation is internal only (called by other services).
 *
 * Replaces the Go backend audit log endpoints:
 * - GET /audit-logs -> auditLogs.list
 * - GET /audit-logs/{id} -> auditLogs.getById
 *
 * @see apps/api/internal/service/auditlog.go
 */
import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { createTRPCRouter, tenantProcedure } from "../trpc"
import { requirePermission } from "../middleware/authorization"
import { permissionIdByKey } from "../lib/permission-catalog"

// --- Permission Constants ---

const USERS_MANAGE = permissionIdByKey("users.manage")!

// --- Output Schemas ---

const auditLogUserSchema = z
  .object({
    id: z.string().uuid(),
    email: z.string(),
    displayName: z.string(),
  })
  .nullable()

const auditLogOutputSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  userId: z.string().uuid().nullable(),
  action: z.string(),
  entityType: z.string(),
  entityId: z.string().uuid(),
  entityName: z.string().nullable(),
  changes: z.unknown().nullable(),
  metadata: z.unknown().nullable(),
  ipAddress: z.string().nullable(),
  userAgent: z.string().nullable(),
  performedAt: z.date(),
  user: auditLogUserSchema.optional(),
})

// --- Input Schemas ---

const listInputSchema = z
  .object({
    page: z.number().int().min(1).optional().default(1),
    pageSize: z.number().int().min(1).max(100).optional().default(20),
    userId: z.string().uuid().optional(),
    entityType: z.string().optional(),
    entityId: z.string().uuid().optional(),
    action: z.string().optional(),
    fromDate: z.string().datetime().optional(),
    toDate: z.string().datetime().optional(),
  })
  .optional()

// --- Helpers ---

/**
 * Maps a Prisma AuditLog record to the output shape.
 */
function mapToOutput(log: Record<string, unknown>) {
  const user = log.user as
    | { id: string; email: string; displayName: string }
    | null
    | undefined

  return {
    id: log.id as string,
    tenantId: log.tenantId as string,
    userId: (log.userId as string | null) ?? null,
    action: log.action as string,
    entityType: log.entityType as string,
    entityId: log.entityId as string,
    entityName: (log.entityName as string | null) ?? null,
    changes: (log.changes as unknown) ?? null,
    metadata: (log.metadata as unknown) ?? null,
    ipAddress: (log.ipAddress as string | null) ?? null,
    userAgent: (log.userAgent as string | null) ?? null,
    performedAt: log.performedAt as Date,
    ...(user !== undefined ? { user: user ?? null } : {}),
  }
}

// --- Router ---

export const auditLogsRouter = createTRPCRouter({
  /**
   * auditLogs.list -- Returns paginated audit logs with optional filters.
   *
   * Supports filtering by userId, entityType, entityId, action, and date range.
   * Results are ordered by performedAt DESC.
   * Includes user relation (id, email, displayName).
   *
   * Requires: users.manage permission
   */
  list: tenantProcedure
    .use(requirePermission(USERS_MANAGE))
    .input(listInputSchema)
    .output(
      z.object({
        items: z.array(auditLogOutputSchema),
        total: z.number(),
      })
    )
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!
      const page = input?.page ?? 1
      const pageSize = input?.pageSize ?? 20

      // Build dynamic where clause
      const where: Record<string, unknown> = { tenantId }

      if (input?.userId) {
        where.userId = input.userId
      }
      if (input?.entityType) {
        where.entityType = input.entityType
      }
      if (input?.entityId) {
        where.entityId = input.entityId
      }
      if (input?.action) {
        where.action = input.action
      }
      if (input?.fromDate || input?.toDate) {
        const performedAt: Record<string, Date> = {}
        if (input.fromDate) {
          performedAt.gte = new Date(input.fromDate)
        }
        if (input.toDate) {
          performedAt.lte = new Date(input.toDate)
        }
        where.performedAt = performedAt
      }

      // Run findMany + count in parallel
      const [items, total] = await Promise.all([
        ctx.prisma.auditLog.findMany({
          where,
          include: {
            user: {
              select: { id: true, email: true, displayName: true },
            },
          },
          orderBy: { performedAt: "desc" },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        ctx.prisma.auditLog.count({ where }),
      ])

      return {
        items: items.map((item) =>
          mapToOutput(item as unknown as Record<string, unknown>)
        ),
        total,
      }
    }),

  /**
   * auditLogs.getById -- Returns a single audit log by ID.
   *
   * Includes user relation (id, email, displayName).
   * Throws NOT_FOUND if audit log doesn't exist for this tenant.
   *
   * Requires: users.manage permission
   */
  getById: tenantProcedure
    .use(requirePermission(USERS_MANAGE))
    .input(z.object({ id: z.string().uuid() }))
    .output(auditLogOutputSchema)
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      const log = await ctx.prisma.auditLog.findFirst({
        where: { id: input.id, tenantId },
        include: {
          user: {
            select: { id: true, email: true, displayName: true },
          },
        },
      })

      if (!log) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Audit log not found",
        })
      }

      return mapToOutput(log as unknown as Record<string, unknown>)
    }),
})
