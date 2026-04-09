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
const REPORTS_VIEW = permissionIdByKey("reports.view")!
const AUDIT_LOG_EXPORT = permissionIdByKey("audit_log.export")!

// --- Output Schemas ---

const auditLogUserSchema = z
  .object({
    id: z.string(),
    email: z.string(),
    displayName: z.string(),
  })
  .nullable()

const auditLogOutputSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  userId: z.string().nullable(),
  action: z.string(),
  entityType: z.string(),
  entityId: z.string(),
  entityName: z.string().nullable(),
  changes: z.unknown().nullable(),
  metadata: z.unknown().nullable(),
  ipAddress: z.string().nullable(),
  userAgent: z.string().nullable(),
  performedAt: z.coerce.date(),
  user: auditLogUserSchema.optional(),
})

// --- Input Schemas ---

const listInputSchema = z
  .object({
    page: z.number().int().min(1).optional().default(1),
    pageSize: z.number().int().min(1).max(100).optional().default(20),
    userId: z.string().optional(),
    entityType: z.string().optional(),
    entityId: z.string().optional(),
    action: z.string().optional(),
    fromDate: z.string().optional(),
    toDate: z.string().optional(),
  })
  .optional()

const exportInputSchema = z.object({
  userId: z.string().optional(),
  entityType: z.string().optional(),
  entityId: z.string().optional(),
  action: z.string().optional(),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
})

// --- Router ---

export const auditLogsRouter = createTRPCRouter({
  /**
   * auditLogs.list -- Returns paginated audit logs with optional filters.
   *
   * Supports filtering by userId, entityType, entityId, action, and date range.
   * Results are ordered by performedAt DESC.
   * Includes user relation (id, email, displayName).
   *
   * Requires: users.manage OR reports.view permission
   */
  list: tenantProcedure
    .use(requirePermission(USERS_MANAGE, REPORTS_VIEW))
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
   * Requires: users.manage OR reports.view permission
   */
  getById: tenantProcedure
    .use(requirePermission(USERS_MANAGE, REPORTS_VIEW))
    .input(z.object({ id: z.string() }))
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

  /**
   * auditLogs.exportCsv -- Export audit log entries as CSV.
   *
   * Returns base64-encoded UTF-8 CSV with BOM.
   * Limit: 10,000 entries max.
   *
   * Requires: audit_log.export permission
   */
  exportCsv: tenantProcedure
    .use(requirePermission(AUDIT_LOG_EXPORT))
    .input(exportInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const { exportCsv } = await import(
          "@/lib/services/audit-log-export-service"
        )
        const audit = {
          userId: ctx.user!.id,
          ipAddress: ctx.ipAddress ?? null,
          userAgent: ctx.userAgent ?? null,
        }
        const result = await exportCsv(ctx.prisma, ctx.tenantId!, input, audit)
        return {
          csv: Buffer.from(result.csv, "utf-8").toString("base64"),
          filename: result.filename,
          count: result.count,
        }
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * auditLogs.exportPdf -- Export audit log entries as PDF.
   *
   * Returns base64-encoded PDF buffer.
   * A4 landscape with tenant branding.
   * Limit: 10,000 entries max.
   *
   * Requires: audit_log.export permission
   */
  exportPdf: tenantProcedure
    .use(requirePermission(AUDIT_LOG_EXPORT))
    .input(exportInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const { exportPdf } = await import(
          "@/lib/services/audit-log-export-service"
        )
        const audit = {
          userId: ctx.user!.id,
          ipAddress: ctx.ipAddress ?? null,
          userAgent: ctx.userAgent ?? null,
        }
        const result = await exportPdf(ctx.prisma, ctx.tenantId!, input, audit)
        return {
          pdf: result.pdf.toString("base64"),
          filename: result.filename,
          count: result.count,
        }
      } catch (err) {
        handleServiceError(err)
      }
    }),
})
