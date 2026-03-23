import { describe, it, expect, vi } from "vitest"
import * as service from "../wh-article-group-service"
import type { PrismaClient } from "@/generated/prisma/client"

// --- Constants ---
const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const GROUP_ID = "g1000000-0000-4000-a000-000000000001"
const GROUP_ID_2 = "g1000000-0000-4000-a000-000000000002"
const GROUP_ID_3 = "g1000000-0000-4000-a000-000000000003"

const mockGroup = {
  id: GROUP_ID,
  tenantId: TENANT_ID,
  parentId: null,
  name: "Test Group",
  sortOrder: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
}

function createMockPrisma(overrides: Record<string, unknown> = {}) {
  return {
    whArticleGroup: {
      findFirst: vi.fn().mockResolvedValue(mockGroup),
      findMany: vi.fn().mockResolvedValue([mockGroup]),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockResolvedValue(mockGroup),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    whArticle: {
      count: vi.fn().mockResolvedValue(0),
    },
    ...overrides,
  } as unknown as PrismaClient
}

// --- Tests ---

describe("wh-article-group-service", () => {
  it("creates group", async () => {
    const prisma = createMockPrisma()
    const result = await service.create(prisma, TENANT_ID, { name: "New Group" })
    expect(result).toBeDefined()
    expect(prisma.whArticleGroup.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: TENANT_ID,
          name: "New Group",
        }),
      })
    )
  })

  it("rejects empty name", async () => {
    const prisma = createMockPrisma()
    await expect(
      service.create(prisma, TENANT_ID, { name: "  " })
    ).rejects.toThrow(service.WhArticleGroupValidationError)
  })

  it("rejects circular reference in update", async () => {
    // Group 1 -> parent = Group 2, trying to set Group 2 -> parent = Group 1
    const prisma = createMockPrisma({
      whArticleGroup: {
        findFirst: vi.fn()
          // First call: find existing group (GROUP_ID_2)
          .mockResolvedValueOnce({ ...mockGroup, id: GROUP_ID_2, parentId: null })
          // Second call: find parentId of GROUP_ID (check circular)
          .mockResolvedValueOnce({ parentId: GROUP_ID_2 }),
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
        create: vi.fn(),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    })

    await expect(
      service.update(prisma, TENANT_ID, { id: GROUP_ID_2, parentId: GROUP_ID })
    ).rejects.toThrow(service.WhArticleGroupValidationError)
  })

  it("rejects delete when articles exist in group", async () => {
    const prisma = createMockPrisma({
      whArticle: {
        count: vi.fn().mockResolvedValue(3),
      },
    })

    await expect(
      service.remove(prisma, TENANT_ID, GROUP_ID)
    ).rejects.toThrow(service.WhArticleGroupValidationError)
  })

  it("rejects delete when child groups exist", async () => {
    const prisma = createMockPrisma({
      whArticleGroup: {
        findFirst: vi.fn().mockResolvedValue(mockGroup),
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(2), // has children
        create: vi.fn(),
        updateMany: vi.fn(),
        deleteMany: vi.fn(),
      },
      whArticle: {
        count: vi.fn().mockResolvedValue(0),
      },
    })

    await expect(
      service.remove(prisma, TENANT_ID, GROUP_ID)
    ).rejects.toThrow(service.WhArticleGroupValidationError)
  })

  it("deletes group when no articles or children exist", async () => {
    const prisma = createMockPrisma()
    const result = await service.remove(prisma, TENANT_ID, GROUP_ID)
    expect(result).toBe(true)
    expect(prisma.whArticleGroup.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: GROUP_ID, tenantId: TENANT_ID },
      })
    )
  })
})
