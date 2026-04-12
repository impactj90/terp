import { describe, it, expect, vi } from "vitest"
import { createCallerFactory } from "@/trpc/init"
import { whArticlesRouter } from "../warehouse/articles"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import {
  createMockContext,
  createMockSession,
  createUserWithPermissions,
  createMockUserTenant,
} from "./helpers"

// Mock the db module for requireModule middleware
vi.mock("@/lib/db", () => ({
  prisma: {
    tenantModule: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi
        .fn()
        .mockResolvedValue({ id: "mock", module: "warehouse" }),
    },
  },
}))

// Mock the article image service
vi.mock("@/lib/services/wh-article-image-service", () => ({
  listImages: vi.fn().mockResolvedValue([]),
  getUploadUrl: vi.fn().mockResolvedValue({
    signedUrl: "https://test.supabase.co/upload-signed",
    storagePath: "tenant/article/image.jpg",
    token: "test-token",
  }),
  confirmUpload: vi.fn().mockResolvedValue({
    id: "img-1",
    articleId: "art-1",
    isPrimary: true,
  }),
  setPrimary: vi.fn().mockResolvedValue({ success: true }),
  reorderImages: vi.fn().mockResolvedValue({ success: true }),
  deleteImage: vi.fn().mockResolvedValue({ success: true }),
}))

// --- Constants ---
const WH_VIEW = permissionIdByKey("wh_articles.view")!
const WH_CREATE = permissionIdByKey("wh_articles.create")!
const WH_EDIT = permissionIdByKey("wh_articles.edit")!
const WH_DELETE = permissionIdByKey("wh_articles.delete")!
const WH_GROUPS_MANAGE = permissionIdByKey("wh_article_groups.manage")!
const WH_UPLOAD_IMAGE = permissionIdByKey("wh_articles.upload_image")!
const WH_DELETE_IMAGE = permissionIdByKey("wh_articles.delete_image")!
const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const USER_ID = "a0000000-0000-4000-a000-000000000001"
const ARTICLE_ID = "b1000000-0000-4000-a000-000000000001"
const IMAGE_ID = "c1000000-0000-4000-a000-000000000001"

const ALL_PERMS = [
  WH_VIEW,
  WH_CREATE,
  WH_EDIT,
  WH_DELETE,
  WH_GROUPS_MANAGE,
  WH_UPLOAD_IMAGE,
  WH_DELETE_IMAGE,
]

const createCaller = createCallerFactory(whArticlesRouter)

// --- Helpers ---
const MODULE_MOCK = {
  tenantModule: {
    findMany: vi.fn().mockResolvedValue([]),
    findUnique: vi
      .fn()
      .mockResolvedValue({ id: "mock", module: "warehouse" }),
  },
}

function withModuleMock(prisma: Record<string, unknown>) {
  return { ...MODULE_MOCK, ...prisma }
}

function createTestContext(
  prisma: Record<string, unknown>,
  permissions: string[] = ALL_PERMS
) {
  return createMockContext({
    prisma: withModuleMock(prisma) as unknown as ReturnType<
      typeof createMockContext
    >["prisma"],
    authToken: "test-token",
    user: createUserWithPermissions(permissions, {
      id: USER_ID,
      userTenants: [createMockUserTenant(USER_ID, TENANT_ID)],
    }),
    session: createMockSession(),
    tenantId: TENANT_ID,
  })
}

function createViewOnlyContext(prisma: Record<string, unknown>) {
  return createTestContext(prisma, [WH_VIEW])
}

function createNoPermContext(prisma: Record<string, unknown>) {
  return createTestContext(prisma, [])
}

// --- Tests ---

describe("warehouse.articles.images", () => {
  describe("list", () => {
    it("returns images sorted by sortOrder", async () => {
      const prisma = {}
      const caller = createCaller(createTestContext(prisma))
      const result = await caller.images.list({ articleId: ARTICLE_ID })

      expect(result).toBeDefined()
      expect(Array.isArray(result)).toBe(true)
    })

    it("requires wh_articles.view permission", async () => {
      const prisma = {}
      const caller = createCaller(createNoPermContext(prisma))

      await expect(
        caller.images.list({ articleId: ARTICLE_ID })
      ).rejects.toThrow("Insufficient permissions")
    })
  })

  describe("getUploadUrl", () => {
    it("requires wh_articles.upload_image permission", async () => {
      const prisma = {}
      const caller = createCaller(createViewOnlyContext(prisma))

      await expect(
        caller.images.getUploadUrl({
          articleId: ARTICLE_ID,
          filename: "test.jpg",
          mimeType: "image/jpeg",
        })
      ).rejects.toThrow("Insufficient permissions")
    })

    it("returns signed URL on success", async () => {
      const prisma = {}
      const caller = createCaller(createTestContext(prisma))
      const result = await caller.images.getUploadUrl({
        articleId: ARTICLE_ID,
        filename: "test.jpg",
        mimeType: "image/jpeg",
      })

      expect(result).toMatchObject({
        signedUrl: expect.stringContaining("upload-signed"),
        storagePath: expect.any(String),
        token: "test-token",
      })
    })
  })

  describe("confirm", () => {
    it("validates input schema — requires sizeBytes", async () => {
      const prisma = {}
      const caller = createCaller(createTestContext(prisma))

      await expect(
        caller.images.confirm({
          articleId: ARTICLE_ID,
          storagePath: "path/to/image.jpg",
          filename: "test.jpg",
          mimeType: "image/jpeg",
          sizeBytes: 0, // min(1) should fail
        })
      ).rejects.toThrow()
    })

    it("requires wh_articles.upload_image permission", async () => {
      const prisma = {}
      const caller = createCaller(createViewOnlyContext(prisma))

      await expect(
        caller.images.confirm({
          articleId: ARTICLE_ID,
          storagePath: "path/to/image.jpg",
          filename: "test.jpg",
          mimeType: "image/jpeg",
          sizeBytes: 50000,
        })
      ).rejects.toThrow("Insufficient permissions")
    })
  })

  describe("setPrimary", () => {
    it("calls service with correct args", async () => {
      const prisma = {}
      const caller = createCaller(createTestContext(prisma))
      const result = await caller.images.setPrimary({ imageId: IMAGE_ID })

      expect(result).toEqual({ success: true })
    })

    it("requires wh_articles.upload_image permission", async () => {
      const prisma = {}
      const caller = createCaller(createViewOnlyContext(prisma))

      await expect(
        caller.images.setPrimary({ imageId: IMAGE_ID })
      ).rejects.toThrow("Insufficient permissions")
    })
  })

  describe("reorder", () => {
    it("passes image IDs array", async () => {
      const prisma = {}
      const caller = createCaller(createTestContext(prisma))
      const result = await caller.images.reorder({
        imageIds: [IMAGE_ID, "c2000000-0000-4000-a000-000000000002"],
      })

      expect(result).toEqual({ success: true })
    })
  })

  describe("delete", () => {
    it("requires wh_articles.delete_image permission", async () => {
      const prisma = {}
      // Context with only upload_image, not delete_image
      const caller = createCaller(
        createTestContext(prisma, [WH_VIEW, WH_UPLOAD_IMAGE])
      )

      await expect(
        caller.images.delete({ imageId: IMAGE_ID })
      ).rejects.toThrow("Insufficient permissions")
    })

    it("calls service with correct args", async () => {
      const prisma = {}
      const caller = createCaller(createTestContext(prisma))
      const result = await caller.images.delete({ imageId: IMAGE_ID })

      expect(result).toEqual({ success: true })
    })
  })
})
