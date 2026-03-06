import { describe, it, expect, vi } from "vitest"
import { Prisma } from "@/generated/prisma/client"
import { createCallerFactory } from "../trpc"
import { ordersRouter } from "../routers/orders"
import { permissionIdByKey } from "../lib/permission-catalog"
import {
  createMockContext,
  createMockSession,
  createUserWithPermissions,
  createMockUserTenant,
} from "./helpers"

// --- Constants ---

const ORDERS_MANAGE = permissionIdByKey("orders.manage")!
const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const USER_ID = "a0000000-0000-4000-a000-000000000001"
const ORDER_ID = "a0000000-0000-4000-a000-000000000600"
const ORDER_B_ID = "a0000000-0000-4000-a000-000000000601"
const CC_ID = "a0000000-0000-4000-a000-000000000300"

const createCaller = createCallerFactory(ordersRouter)

// --- Helpers ---

function makeOrder(
  overrides: Partial<{
    id: string
    tenantId: string
    code: string
    name: string
    description: string | null
    status: string
    customer: string | null
    costCenterId: string | null
    billingRatePerHour: Prisma.Decimal | null
    validFrom: Date | null
    validTo: Date | null
    isActive: boolean
    createdAt: Date
    updatedAt: Date
    costCenter: { id: string; code: string; name: string } | null
  }> = {}
) {
  return {
    id: ORDER_ID,
    tenantId: TENANT_ID,
    code: "ORD001",
    name: "Project Alpha",
    description: null,
    status: "active",
    customer: null,
    costCenterId: null,
    billingRatePerHour: null,
    validFrom: null,
    validTo: null,
    isActive: true,
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
    costCenter: null,
    ...overrides,
  }
}

function createTestContext(prisma: Record<string, unknown>) {
  return createMockContext({
    prisma: prisma as unknown as ReturnType<typeof createMockContext>["prisma"],
    authToken: "test-token",
    user: createUserWithPermissions([ORDERS_MANAGE], {
      userTenants: [createMockUserTenant(USER_ID, TENANT_ID)],
    }),
    session: createMockSession(),
    tenantId: TENANT_ID,
  })
}

// --- orders.list tests ---

describe("orders.list", () => {
  it("returns orders with costCenter", async () => {
    const orders = [
      makeOrder({
        id: ORDER_ID,
        code: "ORD001",
        costCenterId: CC_ID,
        costCenter: { id: CC_ID, code: "CC001", name: "Engineering" },
      }),
      makeOrder({ id: ORDER_B_ID, code: "ORD002" }),
    ]
    const mockPrisma = {
      order: {
        findMany: vi.fn().mockResolvedValue(orders),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.list()
    expect(result.data).toHaveLength(2)
    expect(result.data[0]!.costCenter).toEqual({
      id: CC_ID,
      code: "CC001",
      name: "Engineering",
    })
    expect(result.data[1]!.costCenter).toBeNull()
  })

  it("filters by isActive", async () => {
    const mockPrisma = {
      order: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.list({ isActive: true })
    expect(mockPrisma.order.findMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT_ID, isActive: true },
      orderBy: { code: "asc" },
      include: {
        costCenter: { select: { id: true, code: true, name: true } },
      },
    })
  })

  it("filters by status", async () => {
    const mockPrisma = {
      order: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.list({ status: "planned" })
    expect(mockPrisma.order.findMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT_ID, status: "planned" },
      orderBy: { code: "asc" },
      include: {
        costCenter: { select: { id: true, code: true, name: true } },
      },
    })
  })

  it("returns empty array", async () => {
    const mockPrisma = {
      order: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.list()
    expect(result.data).toEqual([])
  })
})

// --- orders.getById tests ---

describe("orders.getById", () => {
  it("returns order with costCenter", async () => {
    const order = makeOrder({
      costCenterId: CC_ID,
      costCenter: { id: CC_ID, code: "CC001", name: "Engineering" },
    })
    const mockPrisma = {
      order: {
        findFirst: vi.fn().mockResolvedValue(order),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.getById({ id: ORDER_ID })
    expect(result.id).toBe(ORDER_ID)
    expect(result.costCenter).toEqual({
      id: CC_ID,
      code: "CC001",
      name: "Engineering",
    })
  })

  it("throws NOT_FOUND for missing order", async () => {
    const mockPrisma = {
      order: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(caller.getById({ id: ORDER_ID })).rejects.toThrow(
      "Order not found"
    )
  })
})

// --- orders.create tests ---

describe("orders.create", () => {
  it("creates order with default status active", async () => {
    const created = makeOrder()
    const mockPrisma = {
      order: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(created),
        findUniqueOrThrow: vi.fn().mockResolvedValue(created),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.create({
      code: "ORD001",
      name: "Project Alpha",
    })
    expect(result.code).toBe("ORD001")
    expect(result.status).toBe("active")
    const createCall = mockPrisma.order.create.mock.calls[0]![0]
    expect(createCall.data.status).toBe("active")
    expect(createCall.data.isActive).toBe(true)
  })

  it("trims whitespace", async () => {
    const created = makeOrder({ description: "Desc" })
    const mockPrisma = {
      order: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(created),
        findUniqueOrThrow: vi.fn().mockResolvedValue(created),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.create({
      code: "  ORD001  ",
      name: "  Project Alpha  ",
      description: "  Desc  ",
    })
    const createCall = mockPrisma.order.create.mock.calls[0]![0]
    expect(createCall.data.code).toBe("ORD001")
    expect(createCall.data.name).toBe("Project Alpha")
    expect(createCall.data.description).toBe("Desc")
  })

  it("rejects empty code", async () => {
    const mockPrisma = { order: {} }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.create({ code: "   ", name: "Project" })
    ).rejects.toThrow("Order code is required")
  })

  it("rejects empty name", async () => {
    const mockPrisma = { order: {} }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.create({ code: "ORD001", name: "   " })
    ).rejects.toThrow("Order name is required")
  })

  it("rejects duplicate code with CONFLICT", async () => {
    const mockPrisma = {
      order: {
        findFirst: vi.fn().mockResolvedValue(makeOrder()),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.create({ code: "ORD001", name: "Project" })
    ).rejects.toThrow("Order code already exists")
  })

  it("handles costCenterId", async () => {
    const created = makeOrder({ costCenterId: CC_ID })
    const mockPrisma = {
      order: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(created),
        findUniqueOrThrow: vi.fn().mockResolvedValue(created),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.create({
      code: "ORD001",
      name: "Project",
      costCenterId: CC_ID,
    })
    const createCall = mockPrisma.order.create.mock.calls[0]![0]
    expect(createCall.data.costCenterId).toBe(CC_ID)
  })

  it("handles billingRatePerHour", async () => {
    const created = makeOrder({
      billingRatePerHour: new Prisma.Decimal("99.50"),
    })
    const mockPrisma = {
      order: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(created),
        findUniqueOrThrow: vi.fn().mockResolvedValue(created),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.create({
      code: "ORD001",
      name: "Project",
      billingRatePerHour: 99.5,
    })
    expect(result.billingRatePerHour).toBe(99.5)
  })

  it("handles validFrom/validTo dates", async () => {
    const created = makeOrder({
      validFrom: new Date("2026-01-15T00:00:00Z"),
      validTo: new Date("2026-12-31T00:00:00Z"),
    })
    const mockPrisma = {
      order: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(created),
        findUniqueOrThrow: vi.fn().mockResolvedValue(created),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.create({
      code: "ORD001",
      name: "Project",
      validFrom: "2026-01-15",
      validTo: "2026-12-31",
    })
    expect(result.validFrom).toEqual(new Date("2026-01-15T00:00:00Z"))
    expect(result.validTo).toEqual(new Date("2026-12-31T00:00:00Z"))
  })
})

// --- orders.update tests ---

describe("orders.update", () => {
  it("updates successfully", async () => {
    const existing = makeOrder()
    const updated = makeOrder({ name: "Updated" })
    const mockPrisma = {
      order: {
        findFirst: vi.fn().mockResolvedValue(existing),
        update: vi.fn().mockResolvedValue(updated),
        findUniqueOrThrow: vi.fn().mockResolvedValue(updated),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.update({ id: ORDER_ID, name: "Updated" })
    expect(result.name).toBe("Updated")
  })

  it("rejects empty code", async () => {
    const existing = makeOrder()
    const mockPrisma = {
      order: {
        findFirst: vi.fn().mockResolvedValue(existing),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.update({ id: ORDER_ID, code: "   " })
    ).rejects.toThrow("Order code is required")
  })

  it("rejects empty name", async () => {
    const existing = makeOrder()
    const mockPrisma = {
      order: {
        findFirst: vi.fn().mockResolvedValue(existing),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.update({ id: ORDER_ID, name: "   " })
    ).rejects.toThrow("Order name is required")
  })

  it("rejects duplicate code with CONFLICT", async () => {
    const existing = makeOrder({ code: "OLD" })
    const conflicting = makeOrder({ id: ORDER_B_ID, code: "NEW" })
    const mockPrisma = {
      order: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(existing)
          .mockResolvedValueOnce(conflicting),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.update({ id: ORDER_ID, code: "NEW" })
    ).rejects.toThrow("Order code already exists")
  })

  it("allows same code (no false conflict)", async () => {
    const existing = makeOrder({ code: "ORD001" })
    const updated = makeOrder({ code: "ORD001" })
    const mockPrisma = {
      order: {
        findFirst: vi.fn().mockResolvedValue(existing),
        update: vi.fn().mockResolvedValue(updated),
        findUniqueOrThrow: vi.fn().mockResolvedValue(updated),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.update({ id: ORDER_ID, code: "ORD001" })
    expect(result.code).toBe("ORD001")
    expect(mockPrisma.order.findFirst).toHaveBeenCalledTimes(1)
  })

  it("throws NOT_FOUND for missing order", async () => {
    const mockPrisma = {
      order: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.update({ id: ORDER_ID, name: "Updated" })
    ).rejects.toThrow("Order not found")
  })

  it("can update status", async () => {
    const existing = makeOrder({ status: "active" })
    const updated = makeOrder({ status: "completed" })
    const mockPrisma = {
      order: {
        findFirst: vi.fn().mockResolvedValue(existing),
        update: vi.fn().mockResolvedValue(updated),
        findUniqueOrThrow: vi.fn().mockResolvedValue(updated),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.update({ id: ORDER_ID, status: "completed" })
    expect(result.status).toBe("completed")
  })

  it("can null out costCenterId", async () => {
    const existing = makeOrder({ costCenterId: CC_ID })
    const updated = makeOrder({ costCenterId: null })
    const mockPrisma = {
      order: {
        findFirst: vi.fn().mockResolvedValue(existing),
        update: vi.fn().mockResolvedValue(updated),
        findUniqueOrThrow: vi.fn().mockResolvedValue(updated),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.update({ id: ORDER_ID, costCenterId: null })
    expect(result.costCenterId).toBeNull()
    const updateCall = mockPrisma.order.update.mock.calls[0]![0]
    expect(updateCall.data.costCenterId).toBeNull()
  })

  it("can null out billingRatePerHour", async () => {
    const existing = makeOrder({
      billingRatePerHour: new Prisma.Decimal("50.00"),
    })
    const updated = makeOrder({ billingRatePerHour: null })
    const mockPrisma = {
      order: {
        findFirst: vi.fn().mockResolvedValue(existing),
        update: vi.fn().mockResolvedValue(updated),
        findUniqueOrThrow: vi.fn().mockResolvedValue(updated),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.update({
      id: ORDER_ID,
      billingRatePerHour: null,
    })
    expect(result.billingRatePerHour).toBeNull()
    const updateCall = mockPrisma.order.update.mock.calls[0]![0]
    expect(updateCall.data.billingRatePerHour).toBeNull()
  })
})

// --- orders.delete tests ---

describe("orders.delete", () => {
  it("deletes order successfully", async () => {
    const existing = makeOrder()
    const mockPrisma = {
      order: {
        findFirst: vi.fn().mockResolvedValue(existing),
        delete: vi.fn().mockResolvedValue(existing),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.delete({ id: ORDER_ID })
    expect(result.success).toBe(true)
    expect(mockPrisma.order.delete).toHaveBeenCalledWith({
      where: { id: ORDER_ID },
    })
  })

  it("throws NOT_FOUND for missing order", async () => {
    const mockPrisma = {
      order: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(caller.delete({ id: ORDER_ID })).rejects.toThrow(
      "Order not found"
    )
  })
})
