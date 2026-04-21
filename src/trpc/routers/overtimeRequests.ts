/**
 * Overtime Requests Router
 *
 * Thin tRPC wrapper around overtime-request-service. Authorisation:
 * - create     → overtime.request
 * - list/get   → tenantProcedure + applyDataScope
 * - approve    → overtime.approve (escalation gate inside service)
 * - reject     → overtime.approve
 * - cancel     → own-request OR overtime.approve
 * - pending    → tenantProcedure + applyDataScope
 */
import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { handleServiceError } from "@/trpc/errors"
import {
  requirePermission,
  applyDataScope,
} from "@/lib/auth/middleware"
import { hasPermission, isUserAdmin } from "@/lib/auth/permissions"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import * as overtimeRequestService from "@/lib/services/overtime-request-service"

const OVERTIME_REQUEST = permissionIdByKey("overtime.request")!
const OVERTIME_APPROVE = permissionIdByKey("overtime.approve")!
const OVERTIME_APPROVE_ESCALATED = permissionIdByKey(
  "overtime.approve_escalated"
)!

const overtimeRequestOutputSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  employeeId: z.string(),
  requestType: z.string(),
  requestDate: z.date(),
  plannedMinutes: z.number().int(),
  actualMinutes: z.number().int().nullable(),
  reason: z.string(),
  status: z.string(),
  approvedBy: z.string().nullable(),
  approvedAt: z.date().nullable(),
  rejectionReason: z.string().nullable(),
  arbzgWarnings: z.array(z.string()),
  arbzgOverrideReason: z.string().nullable(),
  createdBy: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  employee: z
    .object({
      id: z.string(),
      firstName: z.string(),
      lastName: z.string(),
      personnelNumber: z.string().nullable(),
      isActive: z.boolean(),
      departmentId: z.string().nullable(),
    })
    .optional(),
})

export const overtimeRequestsRouter = createTRPCRouter({
  create: tenantProcedure
    .use(requirePermission(OVERTIME_REQUEST))
    .input(
      z.object({
        employeeId: z.string(),
        requestType: z.enum(["PLANNED", "REOPEN"]),
        requestDate: z.string().date(),
        plannedMinutes: z.number().int().min(1),
        reason: z.string().min(2).max(2000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await overtimeRequestService.create(
          ctx.prisma,
          ctx.tenantId!,
          input,
          {
            userId: ctx.user!.id,
            ipAddress: ctx.ipAddress,
            userAgent: ctx.userAgent,
          }
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  list: tenantProcedure
    .use(applyDataScope())
    .input(
      z
        .object({
          page: z.number().int().min(1).optional(),
          pageSize: z.number().int().min(1).max(500).optional(),
          employeeId: z.string().optional(),
          status: z.enum(["pending", "approved", "rejected", "cancelled"]).optional(),
          requestType: z.enum(["PLANNED", "REOPEN"]).optional(),
          from: z.string().date().optional(),
          to: z.string().date().optional(),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      try {
        return await overtimeRequestService.list(
          ctx.prisma,
          ctx.tenantId!,
          input ?? {},
          ctx.dataScope
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  getById: tenantProcedure
    .use(applyDataScope())
    .input(z.object({ id: z.string() }))
    .output(overtimeRequestOutputSchema)
    .query(async ({ ctx, input }) => {
      try {
        return await overtimeRequestService.getById(
          ctx.prisma,
          ctx.tenantId!,
          input.id,
          ctx.dataScope
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  pendingCount: tenantProcedure
    .use(applyDataScope())
    .output(z.object({ count: z.number().int() }))
    .query(async ({ ctx }) => {
      try {
        const count = await overtimeRequestService.pendingCount(
          ctx.prisma,
          ctx.tenantId!,
          ctx.dataScope
        )
        return { count }
      } catch (err) {
        handleServiceError(err)
      }
    }),

  approve: tenantProcedure
    .use(requirePermission(OVERTIME_APPROVE))
    .use(applyDataScope())
    .input(
      z.object({
        id: z.string(),
        arbzgOverrideReason: z.string().max(2000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const user = ctx.user!
        const admin = isUserAdmin(user)
        const userPermissionKeys: string[] = []
        if (hasPermission(user, OVERTIME_APPROVE_ESCALATED)) {
          userPermissionKeys.push("overtime.approve_escalated")
        }
        if (hasPermission(user, OVERTIME_APPROVE)) {
          userPermissionKeys.push("overtime.approve")
        }
        return await overtimeRequestService.approve(
          ctx.prisma,
          ctx.tenantId!,
          input.id,
          { arbzgOverrideReason: input.arbzgOverrideReason },
          { userPermissionKeys, isAdmin: admin },
          ctx.dataScope,
          {
            userId: user.id,
            ipAddress: ctx.ipAddress,
            userAgent: ctx.userAgent,
          }
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  reject: tenantProcedure
    .use(requirePermission(OVERTIME_APPROVE))
    .use(applyDataScope())
    .input(
      z.object({
        id: z.string(),
        reason: z.string().min(2).max(2000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await overtimeRequestService.reject(
          ctx.prisma,
          ctx.tenantId!,
          input.id,
          input.reason,
          ctx.dataScope,
          {
            userId: ctx.user!.id,
            ipAddress: ctx.ipAddress,
            userAgent: ctx.userAgent,
          }
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  cancel: tenantProcedure
    .use(applyDataScope())
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const user = ctx.user!
        // Self-service OR approver permission.
        if (!isUserAdmin(user) && !hasPermission(user, OVERTIME_APPROVE)) {
          const row = await ctx.prisma.overtimeRequest.findFirst({
            where: { id: input.id, tenantId: ctx.tenantId! },
            select: { employeeId: true },
          })
          if (!row || row.employeeId !== user.employeeId) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "Insufficient permissions",
            })
          }
        }
        return await overtimeRequestService.cancel(
          ctx.prisma,
          ctx.tenantId!,
          input.id,
          ctx.dataScope,
          {
            userId: user.id,
            ipAddress: ctx.ipAddress,
            userAgent: ctx.userAgent,
          }
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),
})
