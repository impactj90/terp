/**
 * Order Target Service tests (NK-1, Decision 1)
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
import * as service from "../order-target-service"
import {
  OrderTargetConflictError,
  OrderTargetNotFoundError,
  OrderTargetValidationError,
} from "../order-target-service"

const TENANT_ID = "f0000000-0000-4000-a000-0000000a1501"
const TENANT_SLUG = "ot-target-test"
const ORDER_ID = "f0000000-0000-4000-a000-0000000a1502"
const ACTIVITY_PER_UNIT_ID = "f0000000-0000-4000-a000-0000000a1503"
const USER_ID = "a0000000-0000-4000-a000-0000000a1599"

beforeAll(async () => {
  await prisma.tenant.upsert({
    where: { id: TENANT_ID },
    update: {},
    create: {
      id: TENANT_ID,
      name: "Order Target Test",
      slug: TENANT_SLUG,
      isActive: true,
    },
  })
  await prisma.orderTarget.deleteMany({ where: { tenantId: TENANT_ID } })
  await prisma.activity.deleteMany({ where: { tenantId: TENANT_ID } })
  await prisma.order.deleteMany({ where: { id: ORDER_ID } })
  await prisma.order.create({
    data: {
      id: ORDER_ID,
      tenantId: TENANT_ID,
      code: "OT-1",
      name: "OT 1",
      status: "active",
    },
  })
  await prisma.activity.create({
    data: {
      id: ACTIVITY_PER_UNIT_ID,
      tenantId: TENANT_ID,
      code: "PU",
      name: "Per Unit",
      pricingType: "PER_UNIT",
      unit: "Stk",
    },
  })
})

afterAll(async () => {
  await prisma.orderTarget.deleteMany({ where: { tenantId: TENANT_ID } })
  await prisma.activity.deleteMany({ where: { tenantId: TENANT_ID } })
  await prisma.order.deleteMany({ where: { id: ORDER_ID } })
  await prisma.tenant.deleteMany({ where: { id: TENANT_ID } })
})

beforeEach(async () => {
  await prisma.orderTarget.deleteMany({ where: { tenantId: TENANT_ID } })
})

describe("order-target-service", () => {
  it("createInitialTarget creates v1", async () => {
    const t = await service.createInitialTarget(
      prisma,
      TENANT_ID,
      {
        orderId: ORDER_ID,
        validFrom: "2026-01-01",
        targetHours: 100,
        targetRevenue: 10000,
      },
      { userId: USER_ID, ipAddress: null, userAgent: null },
    )
    expect(t.version).toBe(1)
    expect(t.validTo).toBeNull()
  })

  it("createInitialTarget throws if active version exists", async () => {
    await service.createInitialTarget(prisma, TENANT_ID, {
      orderId: ORDER_ID,
      validFrom: "2026-01-01",
    })
    await expect(
      service.createInitialTarget(prisma, TENANT_ID, {
        orderId: ORDER_ID,
        validFrom: "2026-02-01",
      }),
    ).rejects.toThrow(OrderTargetConflictError)
  })

  it("updateTarget closes v1 and creates v2 atomically", async () => {
    await service.createInitialTarget(prisma, TENANT_ID, {
      orderId: ORDER_ID,
      validFrom: "2026-01-01",
      targetHours: 100,
    })
    const v2 = await service.updateTarget(
      prisma,
      TENANT_ID,
      {
        orderId: ORDER_ID,
        validFrom: "2026-04-01",
        targetHours: 150,
        changeReason: "REPLAN",
      },
      { userId: USER_ID, ipAddress: null, userAgent: null },
    )
    expect(v2.version).toBe(2)
    expect(v2.validTo).toBeNull()
    const all = await service.listVersions(prisma, TENANT_ID, ORDER_ID)
    expect(all).toHaveLength(2)
    const v1 = all.find((t) => t.version === 1)!
    expect(v1.validTo).not.toBeNull()
    // v1.validTo == 2026-03-31 (= newValidFrom - 1d)
    expect(v1.validTo!.toISOString().slice(0, 10)).toBe("2026-03-31")
  })

  it("updateTarget rejects validFrom <= active.validFrom", async () => {
    await service.createInitialTarget(prisma, TENANT_ID, {
      orderId: ORDER_ID,
      validFrom: "2026-01-01",
    })
    await expect(
      service.updateTarget(prisma, TENANT_ID, {
        orderId: ORDER_ID,
        validFrom: "2026-01-01",
      }),
    ).rejects.toThrow(OrderTargetValidationError)
  })

  it("updateTarget without active version → NotFound", async () => {
    await expect(
      service.updateTarget(prisma, TENANT_ID, {
        orderId: ORDER_ID,
        validFrom: "2026-04-01",
      }),
    ).rejects.toThrow(OrderTargetNotFoundError)
  })

  it("validates targetHours >= 0", async () => {
    await expect(
      service.createInitialTarget(prisma, TENANT_ID, {
        orderId: ORDER_ID,
        validFrom: "2026-01-01",
        targetHours: -1,
      }),
    ).rejects.toThrow(OrderTargetValidationError)
  })

  it("validates targetUnitItems with PER_UNIT activity", async () => {
    const t = await service.createInitialTarget(prisma, TENANT_ID, {
      orderId: ORDER_ID,
      validFrom: "2026-01-01",
      targetUnitItems: [
        { activityId: ACTIVITY_PER_UNIT_ID, quantity: 100 },
      ],
    })
    expect(t.targetUnitItems).toBeDefined()
  })

  it("rejects targetUnitItems with non-PER_UNIT activity", async () => {
    const hourlyActId = "f0000000-0000-4000-a000-0000000a15ff"
    await prisma.activity.create({
      data: {
        id: hourlyActId,
        tenantId: TENANT_ID,
        code: "HRLY",
        name: "Hourly",
        pricingType: "HOURLY",
      },
    })
    await expect(
      service.createInitialTarget(prisma, TENANT_ID, {
        orderId: ORDER_ID,
        validFrom: "2026-01-01",
        targetUnitItems: [{ activityId: hourlyActId, quantity: 5 }],
      }),
    ).rejects.toThrow(OrderTargetValidationError)
    await prisma.activity.delete({ where: { id: hourlyActId } })
  })

  it("upsertTarget dispatches: created → replanned", async () => {
    const r1 = await service.upsertTarget(prisma, TENANT_ID, {
      orderId: ORDER_ID,
      validFrom: "2026-01-01",
    })
    expect(r1.mode).toBe("created")
    const r2 = await service.upsertTarget(prisma, TENANT_ID, {
      orderId: ORDER_ID,
      validFrom: "2026-04-01",
    })
    expect(r2.mode).toBe("replanned")
  })
})
