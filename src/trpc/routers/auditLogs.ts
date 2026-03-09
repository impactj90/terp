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
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { requirePermission } from "@/lib/auth/middleware"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import { handleServiceError } from "@/trpc/errors"
import * as auditLogsService from "@/lib/services/audit-logs-service"

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
      try {
        return await auditLogsService.list(ctx.prisma, ctx.tenantId!, input)
      } catch (err) {
        handleServiceError(err)
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
      try {
        return await auditLogsService.getById(
          ctx.prisma,
          ctx.tenantId!,
          input.id
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),
})
