import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock Supabase admin client
vi.mock("@/lib/supabase/admin", () => {
  const upload = vi.fn().mockResolvedValue({ error: null })
  const download = vi.fn().mockResolvedValue({
    data: new Blob([new Uint8Array(100)], { type: "image/jpeg" }),
    error: null,
  })
  const createSignedUrl = vi.fn().mockResolvedValue({
    data: { signedUrl: "https://test.supabase.co/signed" },
    error: null,
  })
  const createSignedUploadUrl = vi.fn().mockResolvedValue({
    data: { signedUrl: "https://test.supabase.co/upload-signed", token: "test-token" },
    error: null,
  })
  const remove = vi.fn().mockResolvedValue({ error: null })
  const from = vi.fn().mockReturnValue({
    upload,
    download,
    createSignedUrl,
    createSignedUploadUrl,
    remove,
  })
  return {
    createAdminClient: vi.fn().mockReturnValue({
      storage: { from },
    }),
    __mocks: { upload, download, createSignedUrl, createSignedUploadUrl, remove, from },
  }
})

vi.mock("@/lib/config", () => ({
  serverEnv: { supabaseUrl: "https://test.supabase.co" },
  clientEnv: { supabaseUrl: "https://test.supabase.co" },
}))

// Mock sharp
vi.mock("sharp", () => ({
  default: vi.fn().mockReturnValue({
    resize: vi.fn().mockReturnValue({
      webp: vi.fn().mockReturnValue({
        toBuffer: vi.fn().mockResolvedValue(Buffer.from("thumbnail")),
      }),
    }),
  }),
}))

import {
  listImages,
  getUploadUrl,
  confirmUpload,
  setPrimary,
  reorderImages,
  deleteImage,
  WhArticleImageValidationError,
  WhArticleImageNotFoundError,
} from "../wh-article-image-service"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabaseMocks = (await import("@/lib/supabase/admin") as any).__mocks as {
  upload: ReturnType<typeof vi.fn>
  download: ReturnType<typeof vi.fn>
  createSignedUrl: ReturnType<typeof vi.fn>
  createSignedUploadUrl: ReturnType<typeof vi.fn>
  remove: ReturnType<typeof vi.fn>
  from: ReturnType<typeof vi.fn>
}

const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const ARTICLE_ID = "b1000000-0000-4000-a000-000000000001"
const IMAGE_ID = "c1000000-0000-4000-a000-000000000001"
const IMAGE_ID_2 = "c2000000-0000-4000-a000-000000000002"

const mockImage = {
  id: IMAGE_ID,
  articleId: ARTICLE_ID,
  tenantId: TENANT_ID,
  filename: "test.jpg",
  storagePath: `${TENANT_ID}/${ARTICLE_ID}/test.jpg`,
  thumbnailPath: `${TENANT_ID}/${ARTICLE_ID}/test_thumb.webp`,
  mimeType: "image/jpeg",
  sizeBytes: 100000,
  sortOrder: 0,
  isPrimary: true,
  createdAt: new Date(),
  createdById: null,
}

const mockImage2 = {
  ...mockImage,
  id: IMAGE_ID_2,
  filename: "test2.jpg",
  storagePath: `${TENANT_ID}/${ARTICLE_ID}/test2.jpg`,
  thumbnailPath: `${TENANT_ID}/${ARTICLE_ID}/test2_thumb.webp`,
  isPrimary: false,
  sortOrder: 1,
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createMockPrisma(overrides: Record<string, any> = {}) {
  return {
    whArticleImage: {
      findMany: vi.fn().mockResolvedValue([mockImage, mockImage2]),
      findFirst: vi.fn().mockResolvedValue(mockImage),
      create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ ...mockImage, ...data })),
      count: vi.fn().mockResolvedValue(0),
      delete: vi.fn().mockResolvedValue(mockImage),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      ...overrides.whArticleImage,
    },
    whArticle: {
      findFirst: vi.fn().mockResolvedValue({ id: ARTICLE_ID }),
      ...overrides.whArticle,
    },
    $transaction: vi.fn().mockImplementation(async (arg: unknown) => {
      if (Array.isArray(arg)) return arg
      if (typeof arg === "function") return (arg as (tx: unknown) => unknown)(createMockPrisma(overrides))
      return arg
    }),
    ...overrides,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any
}

describe("wh-article-image-service", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset supabase mocks to defaults
    supabaseMocks.createSignedUrl.mockResolvedValue({
      data: { signedUrl: "https://test.supabase.co/signed" },
      error: null,
    })
    supabaseMocks.createSignedUploadUrl.mockResolvedValue({
      data: { signedUrl: "https://test.supabase.co/upload-signed", token: "test-token" },
      error: null,
    })
    supabaseMocks.download.mockResolvedValue({
      data: new Blob([new Uint8Array(100)], { type: "image/jpeg" }),
      error: null,
    })
    supabaseMocks.upload.mockResolvedValue({ error: null })
    supabaseMocks.remove.mockResolvedValue({ error: null })
  })

  // ==========================================================================
  // listImages
  // ==========================================================================

  describe("listImages", () => {
    it("returns images sorted by sortOrder with signed URLs", async () => {
      const prisma = createMockPrisma()
      const result = await listImages(prisma, TENANT_ID, ARTICLE_ID)

      expect(result).toHaveLength(2)
      expect(result[0]).toMatchObject({
        id: IMAGE_ID,
        url: expect.stringContaining("signed"),
        thumbnailUrl: expect.stringContaining("signed"),
      })
      expect(prisma.whArticleImage.findMany).toHaveBeenCalledWith({
        where: { tenantId: TENANT_ID, articleId: ARTICLE_ID },
        orderBy: { sortOrder: "asc" },
      })
    })

    it("filters by tenantId", async () => {
      const prisma = createMockPrisma()
      await listImages(prisma, TENANT_ID, ARTICLE_ID)

      expect(prisma.whArticleImage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: TENANT_ID }),
        })
      )
    })
  })

  // ==========================================================================
  // getUploadUrl
  // ==========================================================================

  describe("getUploadUrl", () => {
    it("validates mime type — rejects invalid types", async () => {
      const prisma = createMockPrisma()
      await expect(
        getUploadUrl(prisma, TENANT_ID, ARTICLE_ID, "test.gif", "image/gif")
      ).rejects.toThrow(WhArticleImageValidationError)
    })

    it("returns signed URL for valid jpeg", async () => {
      const prisma = createMockPrisma()
      const result = await getUploadUrl(
        prisma,
        TENANT_ID,
        ARTICLE_ID,
        "photo.jpg",
        "image/jpeg"
      )

      expect(result).toMatchObject({
        signedUrl: expect.stringContaining("upload-signed"),
        storagePath: expect.stringContaining(`${TENANT_ID}/${ARTICLE_ID}/`),
        token: "test-token",
      })
    })

    it("generates correct storage path format", async () => {
      const prisma = createMockPrisma()
      const result = await getUploadUrl(
        prisma,
        TENANT_ID,
        ARTICLE_ID,
        "photo.jpg",
        "image/jpeg"
      )

      // Path should be: {tenantId}/{articleId}/{uuid}.jpg
      expect(result.storagePath).toMatch(
        new RegExp(`^${TENANT_ID}/${ARTICLE_ID}/[a-f0-9-]+\\.jpg$`)
      )
    })

    it("throws when article not found", async () => {
      const prisma = createMockPrisma({
        whArticle: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      })
      await expect(
        getUploadUrl(prisma, TENANT_ID, ARTICLE_ID, "test.jpg", "image/jpeg")
      ).rejects.toThrow(WhArticleImageNotFoundError)
    })
  })

  // ==========================================================================
  // confirmUpload
  // ==========================================================================

  describe("confirmUpload", () => {
    it("creates DB record with correct metadata", async () => {
      const prisma = createMockPrisma()
      await confirmUpload(
        prisma,
        TENANT_ID,
        ARTICLE_ID,
        `${TENANT_ID}/${ARTICLE_ID}/new.jpg`,
        "new.jpg",
        "image/jpeg",
        50000,
        "user-id"
      )

      expect(prisma.whArticleImage.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          articleId: ARTICLE_ID,
          tenantId: TENANT_ID,
          filename: "new.jpg",
          mimeType: "image/jpeg",
          sizeBytes: 50000,
          createdById: "user-id",
        }),
      })
    })

    it("first image becomes isPrimary", async () => {
      const prisma = createMockPrisma({
        whArticleImage: {
          findMany: vi.fn().mockResolvedValue([]),
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockImplementation(({ data }) =>
            Promise.resolve({ ...mockImage, ...data })
          ),
          count: vi.fn().mockResolvedValue(0),
        },
      })
      await confirmUpload(
        prisma,
        TENANT_ID,
        ARTICLE_ID,
        `${TENANT_ID}/${ARTICLE_ID}/first.jpg`,
        "first.jpg",
        "image/jpeg",
        50000,
        null
      )

      expect(prisma.whArticleImage.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ isPrimary: true }),
      })
    })

    it("subsequent images are not isPrimary", async () => {
      const prisma = createMockPrisma({
        whArticleImage: {
          findMany: vi.fn().mockResolvedValue([mockImage]),
          findFirst: vi.fn().mockResolvedValue({ sortOrder: 0 }),
          create: vi.fn().mockImplementation(({ data }) =>
            Promise.resolve({ ...mockImage, ...data })
          ),
          count: vi.fn().mockResolvedValue(2),
        },
      })
      await confirmUpload(
        prisma,
        TENANT_ID,
        ARTICLE_ID,
        `${TENANT_ID}/${ARTICLE_ID}/second.jpg`,
        "second.jpg",
        "image/jpeg",
        50000,
        null
      )

      expect(prisma.whArticleImage.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ isPrimary: false }),
      })
    })

    it("rejects files exceeding 5 MB", async () => {
      const prisma = createMockPrisma()
      await expect(
        confirmUpload(
          prisma,
          TENANT_ID,
          ARTICLE_ID,
          `${TENANT_ID}/${ARTICLE_ID}/large.jpg`,
          "large.jpg",
          "image/jpeg",
          6 * 1024 * 1024,
          null
        )
      ).rejects.toThrow(WhArticleImageValidationError)
    })
  })

  // ==========================================================================
  // setPrimary
  // ==========================================================================

  describe("setPrimary", () => {
    it("updates isPrimary flags correctly", async () => {
      const prisma = createMockPrisma()
      await setPrimary(prisma, TENANT_ID, IMAGE_ID)

      expect(prisma.$transaction).toHaveBeenCalled()
    })

    it("throws when image not found", async () => {
      const prisma = createMockPrisma({
        whArticleImage: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      })
      await expect(setPrimary(prisma, TENANT_ID, IMAGE_ID)).rejects.toThrow(
        WhArticleImageNotFoundError
      )
    })

    it("rejects when image belongs to different tenant", async () => {
      const prisma = createMockPrisma({
        whArticleImage: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      })
      const otherTenantId = "a0000000-0000-4000-a000-000000000999"
      await expect(
        setPrimary(prisma, otherTenantId, IMAGE_ID)
      ).rejects.toThrow(WhArticleImageNotFoundError)
    })
  })

  // ==========================================================================
  // reorderImages
  // ==========================================================================

  describe("reorderImages", () => {
    it("updates sortOrder for each image", async () => {
      const prisma = createMockPrisma({
        whArticleImage: {
          findMany: vi.fn().mockResolvedValue([
            { id: IMAGE_ID, articleId: ARTICLE_ID },
            { id: IMAGE_ID_2, articleId: ARTICLE_ID },
          ]),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      })

      const result = await reorderImages(prisma, TENANT_ID, [
        IMAGE_ID_2,
        IMAGE_ID,
      ])

      expect(result).toEqual({ success: true })
      expect(prisma.$transaction).toHaveBeenCalled()
    })

    it("throws when some images are invalid", async () => {
      const prisma = createMockPrisma({
        whArticleImage: {
          findMany: vi.fn().mockResolvedValue([
            { id: IMAGE_ID, articleId: ARTICLE_ID },
          ]),
        },
      })

      await expect(
        reorderImages(prisma, TENANT_ID, [IMAGE_ID, "nonexistent"])
      ).rejects.toThrow(WhArticleImageValidationError)
    })
  })

  // ==========================================================================
  // deleteImage
  // ==========================================================================

  describe("deleteImage", () => {
    it("removes storage files and DB record", async () => {
      const prisma = createMockPrisma()
      await deleteImage(prisma, TENANT_ID, IMAGE_ID)

      // Should remove both original and thumbnail from storage
      expect(supabaseMocks.remove).toHaveBeenCalledWith([
        mockImage.storagePath,
        mockImage.thumbnailPath,
      ])
      // Should delete from DB
      expect(prisma.whArticleImage.delete).toHaveBeenCalledWith({
        where: { id: IMAGE_ID, tenantId: TENANT_ID },
      })
    })

    it("when primary deleted, next image becomes primary", async () => {
      const prisma = createMockPrisma({
        whArticleImage: {
          findFirst: vi.fn().mockResolvedValue({ ...mockImage, isPrimary: true }),
          findMany: vi.fn().mockResolvedValue([mockImage2]),
          delete: vi.fn().mockResolvedValue(mockImage),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      })

      await deleteImage(prisma, TENANT_ID, IMAGE_ID)

      expect(prisma.whArticleImage.updateMany).toHaveBeenCalledWith({
        where: { id: IMAGE_ID_2, tenantId: TENANT_ID },
        data: { isPrimary: true },
      })
    })

    it("throws when image not found", async () => {
      const prisma = createMockPrisma({
        whArticleImage: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      })
      await expect(
        deleteImage(prisma, TENANT_ID, IMAGE_ID)
      ).rejects.toThrow(WhArticleImageNotFoundError)
    })

    it("throws when image belongs to different tenant", async () => {
      const prisma = createMockPrisma({
        whArticleImage: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      })
      const otherTenant = "a0000000-0000-4000-a000-000000000999"
      await expect(
        deleteImage(prisma, otherTenant, IMAGE_ID)
      ).rejects.toThrow(WhArticleImageNotFoundError)
    })
  })
})
