import { describe, it, expect, vi } from "vitest"
import * as service from "../wh-withdrawal-service"
import type { PrismaClient } from "@/generated/prisma/client"

const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const SO_ID = "s0000000-0000-4000-a000-000000000001"

function createMockPrisma(findManyReturn: unknown[] = []) {
  return {
    whStockMovement: {
      findMany: vi.fn().mockResolvedValue(findManyReturn),
    },
    user: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  } as unknown as PrismaClient
}

describe("wh-withdrawal-service.listByServiceObject", () => {
  it("scopes where-clause to tenantId + serviceObjectId + withdrawal/delivery-note types", async () => {
    const prisma = createMockPrisma()
    await service.listByServiceObject(prisma, TENANT_ID, SO_ID)
    const call = (prisma.whStockMovement.findMany as ReturnType<typeof vi.fn>)
      .mock.calls[0]![0]
    expect(call.where).toEqual({
      tenantId: TENANT_ID,
      type: { in: ["WITHDRAWAL", "DELIVERY_NOTE"] },
      serviceObjectId: SO_ID,
    })
  })

  it("includes article columns required for history rendering", async () => {
    const prisma = createMockPrisma()
    await service.listByServiceObject(prisma, TENANT_ID, SO_ID)
    const call = (prisma.whStockMovement.findMany as ReturnType<typeof vi.fn>)
      .mock.calls[0]![0]
    expect(call.include.article.select).toEqual({
      id: true,
      number: true,
      name: true,
      unit: true,
    })
  })

  it("uses default limit of 50 when none provided", async () => {
    const prisma = createMockPrisma()
    await service.listByServiceObject(prisma, TENANT_ID, SO_ID)
    const call = (prisma.whStockMovement.findMany as ReturnType<typeof vi.fn>)
      .mock.calls[0]![0]
    expect(call.take).toBe(50)
  })

  it("respects explicit limit param", async () => {
    const prisma = createMockPrisma()
    await service.listByServiceObject(prisma, TENANT_ID, SO_ID, { limit: 12 })
    const call = (prisma.whStockMovement.findMany as ReturnType<typeof vi.fn>)
      .mock.calls[0]![0]
    expect(call.take).toBe(12)
  })

  it("orders by date desc", async () => {
    const prisma = createMockPrisma()
    await service.listByServiceObject(prisma, TENANT_ID, SO_ID)
    const call = (prisma.whStockMovement.findMany as ReturnType<typeof vi.fn>)
      .mock.calls[0]![0]
    expect(call.orderBy).toEqual({ date: "desc" })
  })
})
