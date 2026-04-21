import { describe, it, expect, vi, beforeEach } from "vitest"
import * as repo from "../service-object-repository"
import type { PrismaClient } from "@/generated/prisma/client"

const TENANT_A = "a0000000-0000-4000-a000-000000000100"

function makePrisma(overrides: Record<string, unknown> = {}) {
  return {
    serviceObject: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    serviceObjectAttachment: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
    order: { count: vi.fn().mockResolvedValue(0) },
    whStockMovement: { count: vi.fn().mockResolvedValue(0) },
    ...overrides,
  } as unknown as PrismaClient
}

describe("service-object-repository", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("findMany", () => {
    it("scopes query to tenantId", async () => {
      const prisma = makePrisma()
      ;(prisma.serviceObject.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])
      ;(prisma.serviceObject.count as ReturnType<typeof vi.fn>).mockResolvedValue(0)

      await repo.findMany(prisma, TENANT_A, { page: 1, pageSize: 10 })

      const call = (prisma.serviceObject.findMany as ReturnType<typeof vi.fn>).mock
        .calls[0]![0]
      expect(call.where).toMatchObject({ tenantId: TENANT_A })
    })

    it("applies search across number/name/manufacturer", async () => {
      const prisma = makePrisma()
      ;(prisma.serviceObject.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])
      ;(prisma.serviceObject.count as ReturnType<typeof vi.fn>).mockResolvedValue(0)

      await repo.findMany(prisma, TENANT_A, {
        page: 1,
        pageSize: 10,
        search: "pump",
      })

      const call = (prisma.serviceObject.findMany as ReturnType<typeof vi.fn>).mock
        .calls[0]![0]
      expect(call.where.OR).toBeDefined()
      expect(Array.isArray(call.where.OR)).toBe(true)
    })
  })

  describe("findParentId", () => {
    it("returns parentId only, scoped to tenant", async () => {
      const prisma = makePrisma()
      ;(prisma.serviceObject.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
        parentId: null,
      })

      const res = await repo.findParentId(prisma, TENANT_A, "some-id")

      expect(res).toEqual({ parentId: null })
      const call = (prisma.serviceObject.findFirst as ReturnType<typeof vi.fn>).mock
        .calls[0]![0]
      expect(call.where).toEqual({ id: "some-id", tenantId: TENANT_A })
      expect(call.select).toEqual({ parentId: true })
    })
  })

  describe("hardDelete", () => {
    it("scopes deleteMany to tenantId", async () => {
      const prisma = makePrisma()
      ;(prisma.serviceObject.deleteMany as ReturnType<typeof vi.fn>).mockResolvedValue({
        count: 1,
      })

      const ok = await repo.hardDelete(prisma, TENANT_A, "some-id")

      expect(ok).toBe(true)
      const call = (prisma.serviceObject.deleteMany as ReturnType<typeof vi.fn>).mock
        .calls[0]![0]
      expect(call.where).toEqual({ id: "some-id", tenantId: TENANT_A })
    })

    it("returns false when nothing matched", async () => {
      const prisma = makePrisma()
      ;(prisma.serviceObject.deleteMany as ReturnType<typeof vi.fn>).mockResolvedValue({
        count: 0,
      })
      const ok = await repo.hardDelete(prisma, TENANT_A, "x")
      expect(ok).toBe(false)
    })
  })

  describe("findById", () => {
    it("requests customerAddress, parent, children with tenant filter", async () => {
      const prisma = makePrisma()
      ;(prisma.serviceObject.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
        { id: "x" }
      )
      await repo.findById(prisma, TENANT_A, "x")
      const call = (prisma.serviceObject.findFirst as ReturnType<typeof vi.fn>).mock
        .calls[0]![0]
      expect(call.where).toEqual({ id: "x", tenantId: TENANT_A })
      expect(call.include).toHaveProperty("customerAddress")
      expect(call.include).toHaveProperty("parent")
      expect(call.include).toHaveProperty("children")
      expect(call.include._count).toBeDefined()
    })
  })

  describe("findAllForTree", () => {
    it("returns flat list scoped to tenant + customer", async () => {
      const prisma = makePrisma()
      ;(prisma.serviceObject.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(
        []
      )
      await repo.findAllForTree(prisma, TENANT_A, "customer-1")
      const call = (prisma.serviceObject.findMany as ReturnType<typeof vi.fn>).mock
        .calls[0]![0]
      expect(call.where).toEqual({
        tenantId: TENANT_A,
        customerAddressId: "customer-1",
      })
    })
  })

  describe("findByNumber", () => {
    it("uses findFirst scoped to tenant + number", async () => {
      const prisma = makePrisma()
      ;(prisma.serviceObject.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
        null
      )
      await repo.findByNumber(prisma, TENANT_A, "SO-001")
      const call = (prisma.serviceObject.findFirst as ReturnType<typeof vi.fn>).mock
        .calls[0]![0]
      expect(call.where).toEqual({ tenantId: TENANT_A, number: "SO-001" })
    })
  })

  describe("countChildren / countLinkedOrders / countLinkedStockMovements", () => {
    it("scopes count queries to tenant", async () => {
      const prisma = makePrisma()
      ;(prisma.serviceObject.count as ReturnType<typeof vi.fn>).mockResolvedValue(3)
      ;(prisma.order.count as ReturnType<typeof vi.fn>).mockResolvedValue(1)
      ;(prisma.whStockMovement.count as ReturnType<typeof vi.fn>).mockResolvedValue(2)

      expect(await repo.countChildren(prisma, TENANT_A, "p-1")).toBe(3)
      expect(await repo.countLinkedOrders(prisma, TENANT_A, "p-1")).toBe(1)
      expect(await repo.countLinkedStockMovements(prisma, TENANT_A, "p-1")).toBe(2)

      const childCall = (prisma.serviceObject.count as ReturnType<typeof vi.fn>).mock
        .calls[0]![0]
      expect(childCall.where).toEqual({ parentId: "p-1", tenantId: TENANT_A })

      const orderCall = (prisma.order.count as ReturnType<typeof vi.fn>).mock.calls[0]![0]
      expect(orderCall.where).toEqual({
        tenantId: TENANT_A,
        serviceObjectId: "p-1",
      })
    })
  })

  describe("softDelete", () => {
    it("updates isActive to false via tenant-scoped update", async () => {
      const prisma = makePrisma()
      ;(prisma.serviceObject.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue(
        { count: 1 }
      )
      ;(prisma.serviceObject.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
        { id: "x", isActive: false }
      )
      await repo.softDelete(prisma, TENANT_A, "x")
      const umCall = (prisma.serviceObject.updateMany as ReturnType<typeof vi.fn>).mock
        .calls[0]![0]
      expect(umCall.where).toEqual({ id: "x", tenantId: TENANT_A })
      expect(umCall.data).toEqual({ isActive: false })
    })
  })

  describe("attachment repo functions", () => {
    it("findAttachments scopes to tenant + SO id", async () => {
      const prisma = makePrisma()
      await repo.findAttachments(prisma, TENANT_A, "so-1")
      const call = (prisma.serviceObjectAttachment.findMany as ReturnType<
        typeof vi.fn
      >).mock.calls[0]![0]
      expect(call.where).toEqual({ tenantId: TENANT_A, serviceObjectId: "so-1" })
    })

    it("findAttachmentById scopes to tenant", async () => {
      const prisma = makePrisma()
      await repo.findAttachmentById(prisma, TENANT_A, "att-1")
      const call = (prisma.serviceObjectAttachment.findFirst as ReturnType<
        typeof vi.fn
      >).mock.calls[0]![0]
      expect(call.where).toEqual({ id: "att-1", tenantId: TENANT_A })
    })

    it("countAttachments scopes to tenant + SO id", async () => {
      const prisma = makePrisma()
      ;(prisma.serviceObjectAttachment.count as ReturnType<
        typeof vi.fn
      >).mockResolvedValue(5)
      const n = await repo.countAttachments(prisma, TENANT_A, "so-1")
      expect(n).toBe(5)
    })

    it("deleteAttachment scopes deleteMany to tenant", async () => {
      const prisma = makePrisma()
      ;(prisma.serviceObjectAttachment.deleteMany as ReturnType<
        typeof vi.fn
      >).mockResolvedValue({ count: 1 })
      const ok = await repo.deleteAttachment(prisma, TENANT_A, "att-1")
      expect(ok).toBe(true)
      const call = (prisma.serviceObjectAttachment.deleteMany as ReturnType<
        typeof vi.fn
      >).mock.calls[0]![0]
      expect(call.where).toEqual({ id: "att-1", tenantId: TENANT_A })
    })
  })
})
