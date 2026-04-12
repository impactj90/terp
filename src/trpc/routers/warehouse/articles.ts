/**
 * Warehouse Articles Router
 *
 * tRPC procedures for article master data (Artikelstamm).
 * All procedures require warehouse module and appropriate permissions.
 */
import { z } from "zod"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { handleServiceError } from "@/trpc/errors"
import { requirePermission } from "@/lib/auth/middleware"
import { requireModule } from "@/lib/modules"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import * as whArticleService from "@/lib/services/wh-article-service"
import * as whArticleGroupService from "@/lib/services/wh-article-group-service"
import * as whArticleImageService from "@/lib/services/wh-article-image-service"
import type { PrismaClient } from "@/generated/prisma/client"

// --- Permission Constants ---
const WH_VIEW = permissionIdByKey("wh_articles.view")!
const WH_CREATE = permissionIdByKey("wh_articles.create")!
const WH_EDIT = permissionIdByKey("wh_articles.edit")!
const WH_DELETE = permissionIdByKey("wh_articles.delete")!
const WH_GROUPS_MANAGE = permissionIdByKey("wh_article_groups.manage")!
const WH_UPLOAD_IMAGE = permissionIdByKey("wh_articles.upload_image")!
const WH_DELETE_IMAGE = permissionIdByKey("wh_articles.delete_image")!

// --- Base procedure with module guard ---
const whProcedure = tenantProcedure.use(requireModule("warehouse"))

// --- Tree Building Helper ---

type ArticleGroupTreeNode = {
  group: {
    id: string
    tenantId: string
    parentId: string | null
    name: string
    sortOrder: number
  }
  children: ArticleGroupTreeNode[]
}

function buildGroupTree(
  groups: Array<{
    id: string
    parentId: string | null
    tenantId: string
    name: string
    sortOrder: number
    createdAt: Date
    updatedAt: Date
  }>
): ArticleGroupTreeNode[] {
  const nodeMap = new Map<string, ArticleGroupTreeNode>()
  for (const g of groups) {
    nodeMap.set(g.id, {
      group: {
        id: g.id,
        tenantId: g.tenantId,
        parentId: g.parentId,
        name: g.name,
        sortOrder: g.sortOrder,
      },
      children: [],
    })
  }
  const roots: ArticleGroupTreeNode[] = []
  for (const g of groups) {
    const node = nodeMap.get(g.id)!
    if (g.parentId === null) {
      roots.push(node)
    } else {
      const parent = nodeMap.get(g.parentId)
      if (parent) parent.children.push(node)
    }
  }
  return roots
}

// --- Router ---
export const whArticlesRouter = createTRPCRouter({
  // ========== Article CRUD ==========

  list: whProcedure
    .use(requirePermission(WH_VIEW))
    .input(
      z.object({
        search: z.string().max(255).optional(),
        groupId: z.string().uuid().optional(),
        isActive: z.boolean().optional().default(true),
        stockTracking: z.boolean().optional(),
        belowMinStock: z.boolean().optional(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(25),
      })
    )
    .query(async ({ ctx, input }) => {
      try {
        return await whArticleService.list(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  getById: whProcedure
    .use(requirePermission(WH_VIEW))
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      try {
        return await whArticleService.getById(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  create: whProcedure
    .use(requirePermission(WH_CREATE))
    .input(
      z.object({
        name: z.string().min(1, "Name is required").max(255),
        description: z.string().optional(),
        descriptionAlt: z.string().optional(),
        groupId: z.string().uuid().optional(),
        matchCode: z.string().max(100).optional(),
        unit: z.string().max(20).optional().default("Stk"),
        vatRate: z.number().min(0).max(100).optional().default(19.0),
        sellPrice: z.number().optional(),
        buyPrice: z.number().optional(),
        discountGroup: z.string().max(50).optional(),
        orderType: z.string().max(50).optional(),
        stockTracking: z.boolean().optional().default(false),
        minStock: z.number().optional(),
        warehouseLocation: z.string().max(255).optional(),
        images: z.any().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await whArticleService.create(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input,
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

  update: whProcedure
    .use(requirePermission(WH_EDIT))
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().min(1).max(255).optional(),
        description: z.string().nullable().optional(),
        descriptionAlt: z.string().nullable().optional(),
        groupId: z.string().uuid().nullable().optional(),
        matchCode: z.string().max(100).nullable().optional(),
        unit: z.string().max(20).optional(),
        vatRate: z.number().min(0).max(100).optional(),
        sellPrice: z.number().nullable().optional(),
        buyPrice: z.number().nullable().optional(),
        discountGroup: z.string().max(50).nullable().optional(),
        orderType: z.string().max(50).nullable().optional(),
        stockTracking: z.boolean().optional(),
        minStock: z.number().nullable().optional(),
        warehouseLocation: z.string().max(255).nullable().optional(),
        images: z.any().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await whArticleService.update(
          ctx.prisma as unknown as PrismaClient,
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

  delete: whProcedure
    .use(requirePermission(WH_DELETE))
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await whArticleService.remove(
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

  restore: whProcedure
    .use(requirePermission(WH_EDIT))
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await whArticleService.restoreArticle(
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

  hardDelete: whProcedure
    .use(requirePermission(WH_DELETE))
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await whArticleService.hardDelete(
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

  adjustStock: whProcedure
    .use(requirePermission(WH_EDIT))
    .input(
      z.object({
        id: z.string().uuid(),
        quantity: z.number(),
        reason: z.string().max(500).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await whArticleService.adjustStock(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id,
          input.quantity,
          input.reason,
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

  search: whProcedure
    .use(requirePermission(WH_VIEW))
    .input(
      z.object({
        query: z.string().min(1).max(255),
        limit: z.number().int().min(1).max(50).optional().default(10),
      })
    )
    .query(async ({ ctx, input }) => {
      try {
        return await whArticleService.searchArticles(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.query,
          input.limit
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  stockValueSummary: whProcedure
    .use(requirePermission(WH_VIEW))
    .query(async ({ ctx }) => {
      try {
        return await whArticleService.getStockValueSummary(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  // ========== Article Groups ==========

  groups: createTRPCRouter({
    tree: whProcedure
      .use(requirePermission(WH_VIEW))
      .query(async ({ ctx }) => {
        try {
          const groups = await whArticleGroupService.getTree(
            ctx.prisma as unknown as PrismaClient,
            ctx.tenantId!
          )
          return buildGroupTree(groups)
        } catch (err) {
          handleServiceError(err)
        }
      }),

    create: whProcedure
      .use(requirePermission(WH_GROUPS_MANAGE))
      .input(
        z.object({
          name: z.string().min(1).max(255),
          parentId: z.string().uuid().optional(),
          sortOrder: z.number().int().optional().default(0),
        })
      )
      .mutation(async ({ ctx, input }) => {
        try {
          return await whArticleGroupService.create(
            ctx.prisma as unknown as PrismaClient,
            ctx.tenantId!,
            input,
            { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
          )
        } catch (err) {
          handleServiceError(err)
        }
      }),

    update: whProcedure
      .use(requirePermission(WH_GROUPS_MANAGE))
      .input(
        z.object({
          id: z.string().uuid(),
          name: z.string().min(1).max(255).optional(),
          parentId: z.string().uuid().nullable().optional(),
          sortOrder: z.number().int().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        try {
          return await whArticleGroupService.update(
            ctx.prisma as unknown as PrismaClient,
            ctx.tenantId!,
            input,
            { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
          )
        } catch (err) {
          handleServiceError(err)
        }
      }),

    delete: whProcedure
      .use(requirePermission(WH_GROUPS_MANAGE))
      .input(z.object({ id: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        try {
          return await whArticleGroupService.remove(
            ctx.prisma as unknown as PrismaClient,
            ctx.tenantId!,
            input.id,
            { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
          )
        } catch (err) {
          handleServiceError(err)
        }
      }),
  }),

  // ========== Suppliers ==========

  suppliersList: whProcedure
    .use(requirePermission(WH_VIEW))
    .input(z.object({ articleId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      try {
        return await whArticleService.listSuppliers(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.articleId
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  suppliersAdd: whProcedure
    .use(requirePermission(WH_EDIT))
    .input(
      z.object({
        articleId: z.string().uuid(),
        supplierId: z.string().uuid(),
        supplierArticleNumber: z.string().max(100).optional(),
        supplierDescription: z.string().optional(),
        isPrimary: z.boolean().optional().default(false),
        orderUnit: z.string().max(20).optional(),
        leadTimeDays: z.number().int().optional(),
        defaultOrderQty: z.number().optional(),
        buyPrice: z.number().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await whArticleService.addSupplier(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  suppliersUpdate: whProcedure
    .use(requirePermission(WH_EDIT))
    .input(
      z.object({
        id: z.string().uuid(),
        supplierArticleNumber: z.string().max(100).nullable().optional(),
        supplierDescription: z.string().nullable().optional(),
        isPrimary: z.boolean().optional(),
        orderUnit: z.string().max(20).nullable().optional(),
        leadTimeDays: z.number().int().nullable().optional(),
        defaultOrderQty: z.number().nullable().optional(),
        buyPrice: z.number().nullable().optional(),
        notes: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const { id, ...fields } = input
        return await whArticleService.updateSupplier(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          id,
          fields
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  suppliersRemove: whProcedure
    .use(requirePermission(WH_EDIT))
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await whArticleService.removeSupplier(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  // ========== BOM ==========

  bomList: whProcedure
    .use(requirePermission(WH_VIEW))
    .input(z.object({ articleId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      try {
        return await whArticleService.listBom(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.articleId
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  bomAdd: whProcedure
    .use(requirePermission(WH_EDIT))
    .input(
      z.object({
        parentArticleId: z.string().uuid(),
        childArticleId: z.string().uuid(),
        quantity: z.number().min(0.001).default(1),
        sortOrder: z.number().int().optional().default(0),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await whArticleService.addBom(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  bomUpdate: whProcedure
    .use(requirePermission(WH_EDIT))
    .input(
      z.object({
        id: z.string().uuid(),
        quantity: z.number().min(0.001).optional(),
        sortOrder: z.number().int().optional(),
        notes: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const { id, ...fields } = input
        return await whArticleService.updateBom(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          id,
          fields
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  bomRemove: whProcedure
    .use(requirePermission(WH_EDIT))
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await whArticleService.removeBom(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  // ========== Images ==========

  images: createTRPCRouter({
    list: whProcedure
      .use(requirePermission(WH_VIEW))
      .input(z.object({ articleId: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        try {
          return await whArticleImageService.listImages(
            ctx.prisma as unknown as PrismaClient,
            ctx.tenantId!,
            input.articleId
          )
        } catch (err) {
          handleServiceError(err)
        }
      }),

    getUploadUrl: whProcedure
      .use(requirePermission(WH_UPLOAD_IMAGE))
      .input(
        z.object({
          articleId: z.string().uuid(),
          filename: z.string().min(1).max(255),
          mimeType: z.string().min(1).max(100),
        })
      )
      .mutation(async ({ ctx, input }) => {
        try {
          return await whArticleImageService.getUploadUrl(
            ctx.prisma as unknown as PrismaClient,
            ctx.tenantId!,
            input.articleId,
            input.filename,
            input.mimeType
          )
        } catch (err) {
          handleServiceError(err)
        }
      }),

    confirm: whProcedure
      .use(requirePermission(WH_UPLOAD_IMAGE))
      .input(
        z.object({
          articleId: z.string().uuid(),
          storagePath: z.string().min(1),
          filename: z.string().min(1).max(255),
          mimeType: z.string().min(1).max(100),
          sizeBytes: z.number().int().min(1),
        })
      )
      .mutation(async ({ ctx, input }) => {
        try {
          return await whArticleImageService.confirmUpload(
            ctx.prisma as unknown as PrismaClient,
            ctx.tenantId!,
            input.articleId,
            input.storagePath,
            input.filename,
            input.mimeType,
            input.sizeBytes,
            ctx.user!.id,
            { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
          )
        } catch (err) {
          handleServiceError(err)
        }
      }),

    setPrimary: whProcedure
      .use(requirePermission(WH_UPLOAD_IMAGE))
      .input(z.object({ imageId: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        try {
          return await whArticleImageService.setPrimary(
            ctx.prisma as unknown as PrismaClient,
            ctx.tenantId!,
            input.imageId,
            { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
          )
        } catch (err) {
          handleServiceError(err)
        }
      }),

    reorder: whProcedure
      .use(requirePermission(WH_UPLOAD_IMAGE))
      .input(z.object({ imageIds: z.array(z.string().uuid()).min(1) }))
      .mutation(async ({ ctx, input }) => {
        try {
          return await whArticleImageService.reorderImages(
            ctx.prisma as unknown as PrismaClient,
            ctx.tenantId!,
            input.imageIds
          )
        } catch (err) {
          handleServiceError(err)
        }
      }),

    delete: whProcedure
      .use(requirePermission(WH_DELETE_IMAGE))
      .input(z.object({ imageId: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        try {
          return await whArticleImageService.deleteImage(
            ctx.prisma as unknown as PrismaClient,
            ctx.tenantId!,
            input.imageId,
            { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
          )
        } catch (err) {
          handleServiceError(err)
        }
      }),
  }),
})
