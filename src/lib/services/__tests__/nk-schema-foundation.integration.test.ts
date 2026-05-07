/**
 * Phase 1 — Schema Foundation integration tests.
 *
 * Validates that the new NK-1 tables exist, work with tenant scoping,
 * cascade correctly, and respect FK constraints.
 *
 * See: thoughts/shared/plans/2026-04-29-nk-1-einzelauftrag-nachkalkulation.md
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest"
import { prisma } from "@/lib/db/prisma"
import { ALL_PERMISSIONS } from "@/lib/auth/permission-catalog"
import { AVAILABLE_MODULES } from "@/lib/modules/constants"
import { MODULE_PRICES } from "@/lib/platform/module-pricing"

const TENANT_A_ID = "f0000000-0000-4000-a000-0000000a0001"
const TENANT_A_SLUG = "nk-foundation-tenant-a"
const TENANT_B_ID = "f0000000-0000-4000-a000-0000000a0002"
const TENANT_B_SLUG = "nk-foundation-tenant-b"

const ORDER_A_ID = "f0000000-0000-4000-a000-0000000a0010"
const ORDER_B_ID = "f0000000-0000-4000-a000-0000000a0011"

beforeAll(async () => {
  // Tenants
  await prisma.tenant.upsert({
    where: { id: TENANT_A_ID },
    update: {},
    create: {
      id: TENANT_A_ID,
      name: "NK Foundation A",
      slug: TENANT_A_SLUG,
      isActive: true,
    },
  })
  await prisma.tenant.upsert({
    where: { id: TENANT_B_ID },
    update: {},
    create: {
      id: TENANT_B_ID,
      name: "NK Foundation B",
      slug: TENANT_B_SLUG,
      isActive: true,
    },
  })
  // One Order per tenant
  await prisma.order.deleteMany({
    where: { id: { in: [ORDER_A_ID, ORDER_B_ID] } },
  })
  await prisma.order.create({
    data: {
      id: ORDER_A_ID,
      tenantId: TENANT_A_ID,
      code: "NK-FND-A-1",
      name: "Order A",
      status: "active",
    },
  })
  await prisma.order.create({
    data: {
      id: ORDER_B_ID,
      tenantId: TENANT_B_ID,
      code: "NK-FND-B-1",
      name: "Order B",
      status: "active",
    },
  })
})

afterAll(async () => {
  await prisma.orderTarget.deleteMany({
    where: { tenantId: { in: [TENANT_A_ID, TENANT_B_ID] } },
  })
  await prisma.nkThresholdConfig.deleteMany({
    where: { tenantId: { in: [TENANT_A_ID, TENANT_B_ID] } },
  })
  await prisma.orderType.deleteMany({
    where: { tenantId: { in: [TENANT_A_ID, TENANT_B_ID] } },
  })
  await prisma.wageGroup.deleteMany({
    where: { tenantId: { in: [TENANT_A_ID, TENANT_B_ID] } },
  })
  await prisma.order.deleteMany({
    where: { id: { in: [ORDER_A_ID, ORDER_B_ID] } },
  })
  await prisma.tenant.deleteMany({
    where: { id: { in: [TENANT_A_ID, TENANT_B_ID] } },
  })
})

beforeEach(async () => {
  await prisma.orderTarget.deleteMany({
    where: { tenantId: { in: [TENANT_A_ID, TENANT_B_ID] } },
  })
  await prisma.nkThresholdConfig.deleteMany({
    where: { tenantId: { in: [TENANT_A_ID, TENANT_B_ID] } },
  })
  await prisma.orderType.deleteMany({
    where: { tenantId: { in: [TENANT_A_ID, TENANT_B_ID] } },
  })
  await prisma.wageGroup.deleteMany({
    where: { tenantId: { in: [TENANT_A_ID, TENANT_B_ID] } },
  })
})

describe("NK-1 Schema Foundation", () => {
  describe("WageGroup", () => {
    it("create + list + tenant isolation", async () => {
      await prisma.wageGroup.create({
        data: {
          tenantId: TENANT_A_ID,
          code: "MEISTER",
          name: "Meister",
          internalHourlyRate: 35,
          billingHourlyRate: 95,
        },
      })
      const a = await prisma.wageGroup.findMany({
        where: { tenantId: TENANT_A_ID },
      })
      const b = await prisma.wageGroup.findMany({
        where: { tenantId: TENANT_B_ID },
      })
      expect(a).toHaveLength(1)
      expect(b).toHaveLength(0)
    })

    it("unique code per tenant", async () => {
      await prisma.wageGroup.create({
        data: { tenantId: TENANT_A_ID, code: "DUPL", name: "Dupl 1" },
      })
      await expect(
        prisma.wageGroup.create({
          data: { tenantId: TENANT_A_ID, code: "DUPL", name: "Dupl 2" },
        }),
      ).rejects.toThrow()
      // same code allowed for other tenant
      await expect(
        prisma.wageGroup.create({
          data: { tenantId: TENANT_B_ID, code: "DUPL", name: "Dupl B" },
        }),
      ).resolves.toBeDefined()
    })
  })

  describe("OrderType", () => {
    it("create + list + tenant isolation", async () => {
      await prisma.orderType.create({
        data: { tenantId: TENANT_A_ID, code: "WARTUNG", name: "Wartung" },
      })
      const a = await prisma.orderType.findMany({
        where: { tenantId: TENANT_A_ID },
      })
      const b = await prisma.orderType.findMany({
        where: { tenantId: TENANT_B_ID },
      })
      expect(a).toHaveLength(1)
      expect(b).toHaveLength(0)
    })

    it("unique code per tenant", async () => {
      await prisma.orderType.create({
        data: { tenantId: TENANT_A_ID, code: "WARTUNG", name: "Wartung 1" },
      })
      await expect(
        prisma.orderType.create({
          data: { tenantId: TENANT_A_ID, code: "WARTUNG", name: "Wartung 2" },
        }),
      ).rejects.toThrow()
    })
  })

  describe("NkThresholdConfig", () => {
    it("default + override per orderType", async () => {
      const ot = await prisma.orderType.create({
        data: { tenantId: TENANT_A_ID, code: "NOTDIENST", name: "Notdienst" },
      })
      // Default
      await prisma.nkThresholdConfig.create({
        data: {
          tenantId: TENANT_A_ID,
          orderTypeId: null,
          marginAmberFromPercent: 5,
          marginRedFromPercent: 0,
          productivityAmberFromPercent: 70,
          productivityRedFromPercent: 50,
        },
      })
      // Override for orderType
      await prisma.nkThresholdConfig.create({
        data: {
          tenantId: TENANT_A_ID,
          orderTypeId: ot.id,
          marginAmberFromPercent: 15,
          marginRedFromPercent: 5,
          productivityAmberFromPercent: 80,
          productivityRedFromPercent: 60,
        },
      })

      const all = await prisma.nkThresholdConfig.findMany({
        where: { tenantId: TENANT_A_ID },
      })
      expect(all).toHaveLength(2)
      expect(all.find((c) => c.orderTypeId === null)).toBeDefined()
      expect(all.find((c) => c.orderTypeId === ot.id)).toBeDefined()
    })
  })

  describe("OrderTarget", () => {
    it("create + tenant isolation via order FK", async () => {
      await prisma.orderTarget.create({
        data: {
          tenantId: TENANT_A_ID,
          orderId: ORDER_A_ID,
          version: 1,
          validFrom: new Date("2026-01-01"),
          targetHours: 100,
          targetRevenue: 10000,
        },
      })

      // Cross-tenant attempt — using B's tenantId with A's orderId
      // is allowed at FK level (no relation between tenant_id and order's
      // tenant_id), but will be caught by service-layer validation. Verify
      // we can at least query it scoped:
      const a = await prisma.orderTarget.findMany({
        where: { tenantId: TENANT_A_ID },
      })
      const b = await prisma.orderTarget.findMany({
        where: { tenantId: TENANT_B_ID },
      })
      expect(a).toHaveLength(1)
      expect(b).toHaveLength(0)
    })

    it("unique active version per order (validTo IS NULL)", async () => {
      await prisma.orderTarget.create({
        data: {
          tenantId: TENANT_A_ID,
          orderId: ORDER_A_ID,
          version: 1,
          validFrom: new Date("2026-01-01"),
          validTo: null,
        },
      })
      // Second active without closing first → should violate partial unique index
      await expect(
        prisma.orderTarget.create({
          data: {
            tenantId: TENANT_A_ID,
            orderId: ORDER_A_ID,
            version: 2,
            validFrom: new Date("2026-02-01"),
            validTo: null,
          },
        }),
      ).rejects.toThrow()
    })

    it("FK cascade on order delete", async () => {
      // Create a temporary order to be deleted
      const tempOrderId = "f0000000-0000-4000-a000-0000000a0099"
      await prisma.order.create({
        data: {
          id: tempOrderId,
          tenantId: TENANT_A_ID,
          code: "NK-TEMP",
          name: "Temp",
          status: "active",
        },
      })
      await prisma.orderTarget.create({
        data: {
          tenantId: TENANT_A_ID,
          orderId: tempOrderId,
          version: 1,
          validFrom: new Date("2026-01-01"),
        },
      })
      await prisma.order.delete({ where: { id: tempOrderId } })
      const t = await prisma.orderTarget.findMany({
        where: { orderId: tempOrderId },
      })
      expect(t).toHaveLength(0)
    })
  })

  describe("Activity Pricing extension", () => {
    it("can read pricingType default HOURLY for any new activity", async () => {
      const a = await prisma.activity.create({
        data: { tenantId: TENANT_A_ID, code: "TEST_ACT", name: "Test Activity" },
      })
      expect(a.pricingType).toBe("HOURLY")
      expect(a.flatRate).toBeNull()
      expect(a.hourlyRate).toBeNull()
      await prisma.activity.delete({ where: { id: a.id } })
    })

    it("can persist FLAT_RATE activity with flatRate + calculatedHourEquivalent", async () => {
      const a = await prisma.activity.create({
        data: {
          tenantId: TENANT_A_ID,
          code: "NOTANFAHRT",
          name: "Notdienst-Anfahrt",
          pricingType: "FLAT_RATE",
          flatRate: 89,
          calculatedHourEquivalent: 0.5,
        },
      })
      expect(a.pricingType).toBe("FLAT_RATE")
      expect(Number(a.flatRate)).toBe(89)
      expect(Number(a.calculatedHourEquivalent)).toBe(0.5)
      await prisma.activity.delete({ where: { id: a.id } })
    })
  })

  describe("Module + Permissions", () => {
    it("nachkalkulation in AVAILABLE_MODULES", () => {
      expect(AVAILABLE_MODULES).toContain("nachkalkulation")
    })

    it("nachkalkulation has price entry", () => {
      expect(MODULE_PRICES.nachkalkulation).toBeDefined()
      expect(MODULE_PRICES.nachkalkulation.monthly).toBe(4)
      expect(MODULE_PRICES.nachkalkulation.annual).toBe(40)
    })

    it("permission catalog contains the new keys", () => {
      const keys = ALL_PERMISSIONS.map((p) => p.key)
      expect(keys).toContain("nachkalkulation.view")
      expect(keys).toContain("nachkalkulation.manage")
      expect(keys).toContain("nachkalkulation.config")
      expect(keys).toContain("wage_groups.view")
      expect(keys).toContain("wage_groups.manage")
      expect(keys).toContain("order_types.view")
      expect(keys).toContain("order_types.manage")
      expect(keys).toContain("activities.manage_pricing")
    })
  })
})
