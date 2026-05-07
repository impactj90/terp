/**
 * Order Type Service tests (NK-1, Decision 15)
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from "vitest"
import { prisma } from "@/lib/db/prisma"
import * as service from "../order-type-service"
import {
  OrderTypeValidationError,
  OrderTypeConflictError,
} from "../order-type-service"

const TENANT_ID = "f0000000-0000-4000-a000-0000000a1101"
const TENANT_SLUG = "order-type-test"
const ORDER_ID = "f0000000-0000-4000-a000-0000000a1102"

beforeAll(async () => {
  await prisma.tenant.upsert({
    where: { id: TENANT_ID },
    update: {},
    create: {
      id: TENANT_ID,
      name: "Order Type Test",
      slug: TENANT_SLUG,
      isActive: true,
    },
  })
})

afterAll(async () => {
  await prisma.order.deleteMany({ where: { id: ORDER_ID } })
  await prisma.orderType.deleteMany({ where: { tenantId: TENANT_ID } })
  await prisma.tenant.deleteMany({ where: { id: TENANT_ID } })
})

beforeEach(async () => {
  await prisma.order.deleteMany({ where: { id: ORDER_ID } })
  await prisma.nkThresholdConfig.deleteMany({
    where: { tenantId: TENANT_ID },
  })
  await prisma.orderType.deleteMany({ where: { tenantId: TENANT_ID } })
})

describe("order-type-service", () => {
  it("create + list", async () => {
    const ot = await service.create(prisma, TENANT_ID, {
      code: "WARTUNG",
      name: "Wartung",
      sortOrder: 10,
    })
    expect(ot.code).toBe("WARTUNG")
    const list = await service.list(prisma, TENANT_ID)
    expect(list).toHaveLength(1)
  })

  it("rejects empty code", async () => {
    await expect(
      service.create(prisma, TENANT_ID, { code: "  ", name: "X" }),
    ).rejects.toThrow(OrderTypeValidationError)
  })

  it("conflicts on duplicate code", async () => {
    await service.create(prisma, TENANT_ID, { code: "X", name: "1" })
    await expect(
      service.create(prisma, TENANT_ID, { code: "X", name: "2" }),
    ).rejects.toThrow(OrderTypeConflictError)
  })

  it("remove blocks if order uses it", async () => {
    const ot = await service.create(prisma, TENANT_ID, {
      code: "X",
      name: "Test",
    })
    await prisma.order.create({
      data: {
        id: ORDER_ID,
        tenantId: TENANT_ID,
        code: "ORD-X",
        name: "ORD",
        status: "active",
        orderTypeId: ot.id,
      },
    })
    await expect(
      service.remove(prisma, TENANT_ID, ot.id),
    ).rejects.toThrow(OrderTypeConflictError)
  })

  it("remove blocks if threshold config uses it", async () => {
    const ot = await service.create(prisma, TENANT_ID, {
      code: "X",
      name: "Test",
    })
    await prisma.nkThresholdConfig.create({
      data: {
        tenantId: TENANT_ID,
        orderTypeId: ot.id,
        marginAmberFromPercent: 5,
        marginRedFromPercent: 0,
        productivityAmberFromPercent: 70,
        productivityRedFromPercent: 50,
      },
    })
    await expect(
      service.remove(prisma, TENANT_ID, ot.id),
    ).rejects.toThrow(OrderTypeConflictError)
  })
})
