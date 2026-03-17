import { z } from "zod"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { handleServiceError } from "@/trpc/errors"
import { requirePermission } from "@/lib/auth/middleware"
import { requireModule } from "@/lib/modules"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import * as crmTaskService from "@/lib/services/crm-task-service"
import type { PrismaClient } from "@/generated/prisma/client"

// --- Permission Constants ---
const TASK_VIEW = permissionIdByKey("crm_tasks.view")!
const TASK_CREATE = permissionIdByKey("crm_tasks.create")!
const TASK_EDIT = permissionIdByKey("crm_tasks.edit")!
const TASK_DELETE = permissionIdByKey("crm_tasks.delete")!

// --- Base procedure with module guard ---
const crmProcedure = tenantProcedure.use(requireModule("crm"))

// --- Input Schemas ---
const listInput = z.object({
  addressId: z.string().uuid().optional(),
  inquiryId: z.string().uuid().optional(),
  assigneeId: z.string().uuid().optional(),
  status: z.enum(["OPEN", "IN_PROGRESS", "COMPLETED", "CANCELLED"]).optional(),
  type: z.enum(["TASK", "MESSAGE"]).optional(),
  search: z.string().optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(25),
})

const myTasksInput = z.object({
  status: z.enum(["OPEN", "IN_PROGRESS", "COMPLETED", "CANCELLED"]).optional(),
  type: z.enum(["TASK", "MESSAGE"]).optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(25),
})

const assigneeItem = z.object({
  employeeId: z.string().min(1).optional(),
  teamId: z.string().min(1).optional(),
}).refine((a) => a.employeeId || a.teamId, "Either employeeId or teamId required")

const createInput = z.object({
  type: z.enum(["TASK", "MESSAGE"]).default("TASK"),
  subject: z.string().min(1),
  description: z.string().optional(),
  addressId: z.string().uuid().optional(),
  contactId: z.string().uuid().optional(),
  inquiryId: z.string().uuid().optional(),
  dueAt: z.string().datetime().optional(),
  dueTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  durationMin: z.number().int().min(1).optional(),
  attachments: z.array(z.object({
    name: z.string(),
    url: z.string().url(),
    size: z.number(),
    mimeType: z.string(),
  })).optional(),
  assignees: z.array(assigneeItem),
})

const updateInput = z.object({
  id: z.string().uuid(),
  subject: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  addressId: z.string().uuid().nullable().optional(),
  contactId: z.string().uuid().nullable().optional(),
  inquiryId: z.string().uuid().nullable().optional(),
  dueAt: z.string().datetime().nullable().optional(),
  dueTime: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  durationMin: z.number().int().min(1).nullable().optional(),
  attachments: z.array(z.object({
    name: z.string(),
    url: z.string().url(),
    size: z.number(),
    mimeType: z.string(),
  })).nullable().optional(),
  assignees: z.array(assigneeItem).optional(),
})

const idInput = z.object({ id: z.string().uuid() })

// --- Router ---
export const crmTasksRouter = createTRPCRouter({
  list: crmProcedure
    .use(requirePermission(TASK_VIEW))
    .input(listInput)
    .query(async ({ ctx, input }) => {
      try {
        return await crmTaskService.list(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  myTasks: crmProcedure
    .input(myTasksInput)
    .query(async ({ ctx, input }) => {
      try {
        return await crmTaskService.myTasks(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          ctx.user!.employeeId,
          input
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  getById: crmProcedure
    .use(requirePermission(TASK_VIEW))
    .input(idInput)
    .query(async ({ ctx, input }) => {
      try {
        return await crmTaskService.getById(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  create: crmProcedure
    .use(requirePermission(TASK_CREATE))
    .input(createInput)
    .mutation(async ({ ctx, input }) => {
      try {
        return await crmTaskService.create(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input,
          ctx.user!.id
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  update: crmProcedure
    .use(requirePermission(TASK_EDIT))
    .input(updateInput)
    .mutation(async ({ ctx, input }) => {
      try {
        return await crmTaskService.update(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  complete: crmProcedure
    .use(requirePermission(TASK_EDIT))
    .input(idInput)
    .mutation(async ({ ctx, input }) => {
      try {
        return await crmTaskService.complete(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id,
          ctx.user!.id
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  cancel: crmProcedure
    .use(requirePermission(TASK_EDIT))
    .input(idInput)
    .mutation(async ({ ctx, input }) => {
      try {
        return await crmTaskService.cancel(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  reopen: crmProcedure
    .use(requirePermission(TASK_EDIT))
    .input(idInput)
    .mutation(async ({ ctx, input }) => {
      try {
        return await crmTaskService.reopen(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  markRead: crmProcedure
    .input(idInput)
    .mutation(async ({ ctx, input }) => {
      try {
        await crmTaskService.markRead(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id,
          ctx.user!.employeeId
        )
        return { success: true }
      } catch (err) {
        handleServiceError(err)
      }
    }),

  delete: crmProcedure
    .use(requirePermission(TASK_DELETE))
    .input(idInput)
    .mutation(async ({ ctx, input }) => {
      try {
        await crmTaskService.remove(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id
        )
        return { success: true }
      } catch (err) {
        handleServiceError(err)
      }
    }),
})
