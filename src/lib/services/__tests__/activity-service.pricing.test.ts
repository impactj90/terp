/**
 * Activity Pricing tests (NK-1, Decision 7, Decision 29)
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
import * as service from "../activity-service"
import { ActivityValidationError } from "../activity-service"

const TENANT_ID = "f0000000-0000-4000-a000-0000000a1201"
const TENANT_SLUG = "activity-pricing-test"

beforeAll(async () => {
  await prisma.tenant.upsert({
    where: { id: TENANT_ID },
    update: {},
    create: {
      id: TENANT_ID,
      name: "Activity Pricing Test",
      slug: TENANT_SLUG,
      isActive: true,
    },
  })
})

afterAll(async () => {
  await prisma.activity.deleteMany({ where: { tenantId: TENANT_ID } })
  await prisma.tenant.deleteMany({ where: { id: TENANT_ID } })
})

beforeEach(async () => {
  await prisma.activity.deleteMany({ where: { tenantId: TENANT_ID } })
})

describe("activity-service pricing (Decision 7, Decision 29)", () => {
  it("creates HOURLY default with no rate (lookup-resolver fallback)", async () => {
    const a = await service.create(prisma, TENANT_ID, {
      code: "ARBEIT",
      name: "Arbeit",
    })
    expect(a.pricingType).toBe("HOURLY")
    expect(a.flatRate).toBeNull()
    expect(a.hourlyRate).toBeNull()
  })

  it("rejects FLAT_RATE without flatRate", async () => {
    await expect(
      service.create(prisma, TENANT_ID, {
        code: "FLAT",
        name: "Flat",
        pricingType: "FLAT_RATE",
      }),
    ).rejects.toThrow(/FLAT_RATE/)
  })

  it("rejects PER_UNIT without unit", async () => {
    await expect(
      service.create(prisma, TENANT_ID, {
        code: "PU",
        name: "Per Unit",
        pricingType: "PER_UNIT",
      }),
    ).rejects.toThrow(/PER_UNIT/)
  })

  it("rejects negative flatRate", async () => {
    await expect(
      service.create(prisma, TENANT_ID, {
        code: "F2",
        name: "F2",
        pricingType: "FLAT_RATE",
        flatRate: -5,
      }),
    ).rejects.toThrow(ActivityValidationError)
  })

  it("rejects calculatedHourEquivalent <= 0", async () => {
    await expect(
      service.create(prisma, TENANT_ID, {
        code: "F3",
        name: "F3",
        pricingType: "FLAT_RATE",
        flatRate: 89,
        calculatedHourEquivalent: 0,
      }),
    ).rejects.toThrow(ActivityValidationError)
  })

  it("creates FLAT_RATE with calculatedHourEquivalent", async () => {
    const a = await service.create(prisma, TENANT_ID, {
      code: "NOTANFAHRT",
      name: "Notdienst-Anfahrt",
      pricingType: "FLAT_RATE",
      flatRate: 89,
      calculatedHourEquivalent: 0.5,
    })
    expect(a.pricingType).toBe("FLAT_RATE")
    expect(Number(a.flatRate)).toBe(89)
    expect(Number(a.calculatedHourEquivalent)).toBe(0.5)
  })

  it("creates PER_UNIT with unit", async () => {
    const a = await service.create(prisma, TENANT_ID, {
      code: "VERLEGUNG",
      name: "Rohrverlegung",
      pricingType: "PER_UNIT",
      unit: "lfm",
      hourlyRate: 18,
    })
    expect(a.pricingType).toBe("PER_UNIT")
    expect(a.unit).toBe("lfm")
  })

  it("updatePricing: HOURLY → FLAT_RATE with flatRate", async () => {
    const a = await service.create(prisma, TENANT_ID, {
      code: "X",
      name: "X",
    })
    const u = await service.updatePricing(prisma, TENANT_ID, {
      id: a.id,
      pricingType: "FLAT_RATE",
      flatRate: 100,
    })
    expect(u.pricingType).toBe("FLAT_RATE")
    expect(Number(u.flatRate)).toBe(100)
  })

  it("updatePricing: FLAT_RATE → PER_UNIT requires unit (existing flatRate carries over)", async () => {
    const a = await service.create(prisma, TENANT_ID, {
      code: "X",
      name: "X",
      pricingType: "FLAT_RATE",
      flatRate: 100,
    })
    // Switching to PER_UNIT without setting unit fails
    await expect(
      service.updatePricing(prisma, TENANT_ID, {
        id: a.id,
        pricingType: "PER_UNIT",
      }),
    ).rejects.toThrow(/PER_UNIT/)

    // Setting both succeeds
    const u = await service.updatePricing(prisma, TENANT_ID, {
      id: a.id,
      pricingType: "PER_UNIT",
      unit: "Stk",
    })
    expect(u.pricingType).toBe("PER_UNIT")
    expect(u.unit).toBe("Stk")
  })

  it("regular update without pricing fields does NOT touch pricing", async () => {
    const a = await service.create(prisma, TENANT_ID, {
      code: "X",
      name: "Old",
      pricingType: "FLAT_RATE",
      flatRate: 50,
    })
    const u = await service.update(prisma, TENANT_ID, {
      id: a.id,
      name: "New",
    })
    expect(u.name).toBe("New")
    expect(u.pricingType).toBe("FLAT_RATE")
    expect(Number(u.flatRate)).toBe(50)
  })

  // NK-1-FIX-FORM-1 (closing-pass-followup 2026-05-06): the `update`
  // service now accepts pricing fields in the same payload. Permission
  // gating happens at the router layer (manage_pricing required).
  it("FIX-FORM-1: update with pricing fields persists them (PER_UNIT → HOURLY)", async () => {
    const a = await service.create(prisma, TENANT_ID, {
      code: "X",
      name: "X",
      pricingType: "PER_UNIT",
      unit: "lfm",
    })
    const u = await service.update(prisma, TENANT_ID, {
      id: a.id,
      pricingType: "HOURLY",
      hourlyRate: 70,
      unit: null,
    })
    expect(u.pricingType).toBe("HOURLY")
    expect(Number(u.hourlyRate)).toBe(70)
    expect(u.unit).toBeNull()
  })

  it("FIX-FORM-1: update validates pricing cross-field (FLAT_RATE without flatRate fails)", async () => {
    const a = await service.create(prisma, TENANT_ID, {
      code: "X",
      name: "X",
      pricingType: "HOURLY",
      hourlyRate: 50,
    })
    await expect(
      service.update(prisma, TENANT_ID, {
        id: a.id,
        pricingType: "FLAT_RATE",
        // omit flatRate → existing has no flatRate either → should fail
      }),
    ).rejects.toThrow(/FLAT_RATE/)
  })

  it("FIX-FORM-1: update merges name+pricing in single call atomically", async () => {
    const a = await service.create(prisma, TENANT_ID, {
      code: "X",
      name: "Old",
      pricingType: "HOURLY",
      hourlyRate: 50,
    })
    const u = await service.update(prisma, TENANT_ID, {
      id: a.id,
      name: "New",
      hourlyRate: 70,
    })
    expect(u.name).toBe("New")
    expect(u.pricingType).toBe("HOURLY")
    expect(Number(u.hourlyRate)).toBe(70)
  })
})
