/**
 * ServiceObjects Router
 *
 * tRPC endpoints for service-object master data. Gated by the `crm` module
 * and three dedicated permissions (service_objects.{view,manage,delete}).
 *
 * Plan: 2026-04-21-serviceobjekte-stammdaten.md
 */
import { z } from "zod"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { handleServiceError } from "@/trpc/errors"
import { requirePermission } from "@/lib/auth/middleware"
import { requireModule } from "@/lib/modules"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import * as serviceObjectService from "@/lib/services/service-object-service"
import * as attachmentService from "@/lib/services/service-object-attachment-service"
import * as qrService from "@/lib/services/service-object-qr-service"
import * as importService from "@/lib/services/service-object-import-service"
import type { PrismaClient } from "@/generated/prisma/client"

// --- Permission Constants ---
const SO_VIEW = permissionIdByKey("service_objects.view")!
const SO_MANAGE = permissionIdByKey("service_objects.manage")!
const SO_DELETE = permissionIdByKey("service_objects.delete")!

// --- Base procedure with module guard ---
const serviceObjectProcedure = tenantProcedure.use(requireModule("crm"))

const KIND_ENUM = z.enum([
  "SITE",
  "BUILDING",
  "SYSTEM",
  "EQUIPMENT",
  "COMPONENT",
])
const STATUS_ENUM = z.enum([
  "OPERATIONAL",
  "DEGRADED",
  "IN_MAINTENANCE",
  "OUT_OF_SERVICE",
  "DECOMMISSIONED",
])
const BUILDING_USAGE_ENUM = z.enum([
  "OFFICE",
  "WAREHOUSE",
  "PRODUCTION",
  "RETAIL",
  "RESIDENTIAL",
  "MIXED",
  "OTHER",
])
const LABEL_FORMAT_ENUM = z.enum(["AVERY_L4736", "AVERY_L4731"])

export const serviceObjectsRouter = createTRPCRouter({
  list: serviceObjectProcedure
    .use(requirePermission(SO_VIEW))
    .input(
      z.object({
        customerAddressId: z.string().uuid().optional(),
        parentId: z.string().uuid().nullable().optional(),
        kind: KIND_ENUM.optional(),
        status: STATUS_ENUM.optional(),
        search: z.string().max(255).optional(),
        isActive: z.boolean().optional(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(25),
      })
    )
    .query(async ({ ctx, input }) => {
      try {
        return await serviceObjectService.listServiceObjects(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  getById: serviceObjectProcedure
    .use(requirePermission(SO_VIEW))
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      try {
        return await serviceObjectService.getServiceObjectById(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  getTree: serviceObjectProcedure
    .use(requirePermission(SO_VIEW))
    .input(z.object({ customerAddressId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      try {
        return await serviceObjectService.getServiceObjectTree(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.customerAddressId
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  getHistory: serviceObjectProcedure
    .use(requirePermission(SO_VIEW))
    .input(
      z.object({
        id: z.string().uuid(),
        limit: z.number().int().min(1).max(200).default(50),
      })
    )
    .query(async ({ ctx, input }) => {
      try {
        return await serviceObjectService.getHistoryByServiceObject(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id,
          { limit: input.limit }
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  create: serviceObjectProcedure
    .use(requirePermission(SO_MANAGE))
    .input(
      z.object({
        number: z.string().min(1).max(50),
        name: z.string().min(1).max(255),
        description: z.string().max(4000).nullable().optional(),
        kind: KIND_ENUM.optional(),
        parentId: z.string().uuid().nullable().optional(),
        customerAddressId: z.string().uuid(),
        internalNumber: z.string().max(100).nullable().optional(),
        manufacturer: z.string().max(255).nullable().optional(),
        model: z.string().max(255).nullable().optional(),
        serialNumber: z.string().max(255).nullable().optional(),
        yearBuilt: z.number().int().nullable().optional(),
        inServiceSince: z.string().datetime().nullable().optional(),
        // SITE
        siteStreet: z.string().max(255).nullable().optional(),
        siteZip: z.string().max(20).nullable().optional(),
        siteCity: z.string().max(100).nullable().optional(),
        siteCountry: z.string().max(10).nullable().optional(),
        siteAreaSqm: z.number().int().nullable().optional(),
        // BUILDING
        floorCount: z.number().int().nullable().optional(),
        floorAreaSqm: z.number().int().nullable().optional(),
        buildingUsage: BUILDING_USAGE_ENUM.nullable().optional(),
        status: STATUS_ENUM.optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await serviceObjectService.createServiceObject(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          { ...input, createdById: ctx.user!.id },
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

  update: serviceObjectProcedure
    .use(requirePermission(SO_MANAGE))
    .input(
      z.object({
        id: z.string().uuid(),
        number: z.string().min(1).max(50).optional(),
        name: z.string().min(1).max(255).optional(),
        description: z.string().max(4000).nullable().optional(),
        kind: KIND_ENUM.optional(),
        parentId: z.string().uuid().nullable().optional(),
        customerAddressId: z.string().uuid().optional(),
        internalNumber: z.string().max(100).nullable().optional(),
        manufacturer: z.string().max(255).nullable().optional(),
        model: z.string().max(255).nullable().optional(),
        serialNumber: z.string().max(255).nullable().optional(),
        yearBuilt: z.number().int().nullable().optional(),
        inServiceSince: z.string().datetime().nullable().optional(),
        // SITE
        siteStreet: z.string().max(255).nullable().optional(),
        siteZip: z.string().max(20).nullable().optional(),
        siteCity: z.string().max(100).nullable().optional(),
        siteCountry: z.string().max(10).nullable().optional(),
        siteAreaSqm: z.number().int().nullable().optional(),
        // BUILDING
        floorCount: z.number().int().nullable().optional(),
        floorAreaSqm: z.number().int().nullable().optional(),
        buildingUsage: BUILDING_USAGE_ENUM.nullable().optional(),
        status: STATUS_ENUM.optional(),
        isActive: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const { id, ...rest } = input
        return await serviceObjectService.updateServiceObject(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          id,
          rest,
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

  move: serviceObjectProcedure
    .use(requirePermission(SO_MANAGE))
    .input(
      z.object({
        id: z.string().uuid(),
        parentId: z.string().uuid().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await serviceObjectService.moveServiceObject(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id,
          input.parentId,
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

  delete: serviceObjectProcedure
    .use(requirePermission(SO_DELETE))
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await serviceObjectService.deleteServiceObject(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id,
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

  // --- Attachments ---

  getAttachments: serviceObjectProcedure
    .use(requirePermission(SO_VIEW))
    .input(z.object({ serviceObjectId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      try {
        return await attachmentService.listAttachments(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.serviceObjectId
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  getUploadUrl: serviceObjectProcedure
    .use(requirePermission(SO_MANAGE))
    .input(
      z.object({
        serviceObjectId: z.string().uuid(),
        filename: z.string().min(1).max(255),
        mimeType: z.string().min(1).max(100),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await attachmentService.getUploadUrl(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.serviceObjectId,
          input.filename,
          input.mimeType
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  confirmUpload: serviceObjectProcedure
    .use(requirePermission(SO_MANAGE))
    .input(
      z.object({
        serviceObjectId: z.string().uuid(),
        storagePath: z.string().min(1),
        filename: z.string().min(1).max(255),
        mimeType: z.string().min(1).max(100),
        sizeBytes: z.number().int().positive(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await attachmentService.confirmUpload(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.serviceObjectId,
          input.storagePath,
          input.filename,
          input.mimeType,
          input.sizeBytes,
          ctx.user!.id,
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

  getDownloadUrl: serviceObjectProcedure
    .use(requirePermission(SO_VIEW))
    .input(z.object({ attachmentId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await attachmentService.getDownloadUrl(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.attachmentId
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  deleteAttachment: serviceObjectProcedure
    .use(requirePermission(SO_MANAGE))
    .input(z.object({ attachmentId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await attachmentService.deleteAttachment(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.attachmentId,
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

  // --- QR Code ---

  generateSingleQr: serviceObjectProcedure
    .use(requirePermission(SO_VIEW))
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      try {
        return await qrService.generateServiceObjectQrDataUrl(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  generateQrPdf: serviceObjectProcedure
    .use(requirePermission(SO_VIEW))
    .input(
      z.object({
        ids: z.array(z.string().uuid()).min(1).max(200),
        format: LABEL_FORMAT_ENUM,
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await qrService.generateServiceObjectLabelPdf(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.ids,
          input.format
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  scanByQr: serviceObjectProcedure
    .use(requirePermission(SO_VIEW))
    .input(z.object({ code: z.string().min(1).max(500) }))
    .query(async ({ ctx, input }) => {
      try {
        return await qrService.resolveServiceObjectQrCode(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.code
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  // --- CSV Import ---

  importPreview: serviceObjectProcedure
    .use(requirePermission(SO_MANAGE))
    .input(
      z.object({
        fileBase64: z.string().min(1),
        filename: z.string().min(1).max(255),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await importService.parseServiceObjectImport(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.fileBase64,
          input.filename
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  importCommit: serviceObjectProcedure
    .use(requirePermission(SO_MANAGE))
    .input(
      z.object({
        fileBase64: z.string().min(1),
        filename: z.string().min(1).max(255),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await importService.confirmServiceObjectImport(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.fileBase64,
          input.filename,
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
})
