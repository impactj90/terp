/**
 * Export Templates Router (Phase 2)
 *
 * CRUD + preview + test-export procedures for per-tenant Liquid templates.
 */
import { z } from "zod"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { requirePermission } from "@/lib/auth/middleware"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import { handleServiceError } from "@/trpc/errors"
import * as service from "@/lib/services/export-template-service"
import * as engine from "@/lib/services/export-engine-service"

const VIEW = permissionIdByKey("export_template.view")!
const CREATE = permissionIdByKey("export_template.create")!
const EDIT = permissionIdByKey("export_template.edit")!
const DELETE = permissionIdByKey("export_template.delete")!
const EXECUTE = permissionIdByKey("export_template.execute")!

const targetSystemEnum = z.enum([
  "datev_lodas",
  "datev_lug",
  "lexware",
  "sage",
  "custom",
])
const encodingEnum = z.enum(["windows-1252", "utf-8", "utf-8-bom"])
const lineEndingEnum = z.enum(["crlf", "lf"])

export const exportTemplatesRouter = createTRPCRouter({
  list: tenantProcedure
    .use(requirePermission(VIEW))
    .query(async ({ ctx }) => {
      try {
        return await service.list(ctx.prisma, ctx.tenantId!)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  getById: tenantProcedure
    .use(requirePermission(VIEW))
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      try {
        return await service.getById(ctx.prisma, ctx.tenantId!, input.id)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  listVersions: tenantProcedure
    .use(requirePermission(VIEW))
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      try {
        return await service.listVersions(ctx.prisma, ctx.tenantId!, input.id)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  create: tenantProcedure
    .use(requirePermission(CREATE))
    .input(
      z.object({
        name: z.string().min(1).max(200),
        description: z.string().nullable().optional(),
        targetSystem: targetSystemEnum,
        templateBody: z.string().min(1),
        outputFilename: z.string().max(200).optional(),
        encoding: encodingEnum.optional(),
        lineEnding: lineEndingEnum.optional(),
        fieldSeparator: z.string().max(5).optional(),
        decimalSeparator: z.string().length(1).optional(),
        dateFormat: z.string().max(20).optional(),
        isActive: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await service.create(ctx.prisma, ctx.tenantId!, input, {
          userId: ctx.user!.id,
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
        })
      } catch (err) {
        handleServiceError(err)
      }
    }),

  update: tenantProcedure
    .use(requirePermission(EDIT))
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(200).optional(),
        description: z.string().nullable().optional(),
        targetSystem: targetSystemEnum.optional(),
        templateBody: z.string().min(1).optional(),
        outputFilename: z.string().max(200).optional(),
        encoding: encodingEnum.optional(),
        lineEnding: lineEndingEnum.optional(),
        fieldSeparator: z.string().max(5).optional(),
        decimalSeparator: z.string().length(1).optional(),
        dateFormat: z.string().max(20).optional(),
        isActive: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const { id, ...rest } = input
        return await service.update(ctx.prisma, ctx.tenantId!, id, rest, {
          userId: ctx.user!.id,
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
        })
      } catch (err) {
        handleServiceError(err)
      }
    }),

  delete: tenantProcedure
    .use(requirePermission(DELETE))
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await service.remove(ctx.prisma, ctx.tenantId!, input.id, {
          userId: ctx.user!.id,
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
        })
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * Generates a preview of a template against the live data set.
   * Returns the rendered string truncated to 50 KB so the editor stays
   * snappy. Performs an audit log entry as a "test" export.
   */
  preview: tenantProcedure
    .use(requirePermission(EXECUTE))
    .input(
      z.object({
        id: z.string(),
        year: z.number().int().min(2000).max(2100),
        month: z.number().int().min(1).max(12),
        employeeIds: z.array(z.string()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const result = await engine.generateExport(
          ctx.prisma,
          ctx.tenantId!,
          {
            templateId: input.id,
            year: input.year,
            month: input.month,
            employeeIds: input.employeeIds,
          },
          {
            userId: ctx.user!.id,
            ipAddress: ctx.ipAddress,
            userAgent: ctx.userAgent,
          },
          { isTest: true, timeoutMs: 10_000 },
        )
        const text = result.file.toString("utf8")
        const truncated = text.length > 50_000
        return {
          rendered: truncated ? text.slice(0, 50_000) : text,
          truncated,
          employeeCount: result.employeeCount,
          byteSize: result.byteSize,
          fileHash: result.fileHash,
          filename: result.filename,
        }
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * Production run of an export template for the chosen period.
   * Returns base64-encoded file content for the client to download.
   */
  runExport: tenantProcedure
    .use(requirePermission(EXECUTE))
    .input(
      z.object({
        id: z.string(),
        exportInterfaceId: z.string().nullable().optional(),
        year: z.number().int().min(2000).max(2100),
        month: z.number().int().min(1).max(12),
        employeeIds: z.array(z.string()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const result = await engine.generateExport(
          ctx.prisma,
          ctx.tenantId!,
          {
            templateId: input.id,
            exportInterfaceId: input.exportInterfaceId ?? undefined,
            year: input.year,
            month: input.month,
            employeeIds: input.employeeIds,
          },
          {
            userId: ctx.user!.id,
            ipAddress: ctx.ipAddress,
            userAgent: ctx.userAgent,
          },
          { isTest: false },
        )
        return {
          contentBase64: result.file.toString("base64"),
          filename: result.filename,
          contentType: "application/octet-stream",
          byteSize: result.byteSize,
          fileHash: result.fileHash,
          employeeCount: result.employeeCount,
        }
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * Generates a downloadable test export. Returns base64-encoded file
   * content + filename + content type.
   */
  testExport: tenantProcedure
    .use(requirePermission(EXECUTE))
    .input(
      z.object({
        id: z.string(),
        year: z.number().int().min(2000).max(2100),
        month: z.number().int().min(1).max(12),
        employeeIds: z.array(z.string()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const result = await engine.generateExport(
          ctx.prisma,
          ctx.tenantId!,
          {
            templateId: input.id,
            year: input.year,
            month: input.month,
            employeeIds: input.employeeIds,
          },
          {
            userId: ctx.user!.id,
            ipAddress: ctx.ipAddress,
            userAgent: ctx.userAgent,
          },
          { isTest: true },
        )
        return {
          contentBase64: result.file.toString("base64"),
          filename: result.filename,
          contentType: "application/octet-stream",
          byteSize: result.byteSize,
          fileHash: result.fileHash,
          employeeCount: result.employeeCount,
        }
      } catch (err) {
        handleServiceError(err)
      }
    }),
})
