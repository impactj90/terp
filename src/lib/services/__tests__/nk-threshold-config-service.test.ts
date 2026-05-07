/**
 * NK Threshold Config Service tests (NK-1, Phase 7, Decision 9)
 *
 * Covers:
 *   - getEffectiveThresholds with auto-init of default row
 *   - Override-takes-precedence-over-default lookup hierarchy
 *   - upsertDefault create + update + validation
 *   - upsertOverride with foreign-tenant orderType protection
 *   - removeOverride
 *   - classifyMargin / classifyProductivity boundary tests
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
import * as service from "../nk-threshold-config-service"
import {
  DEFAULT_THRESHOLDS,
  NkThresholdConfigNotFoundError,
  NkThresholdConfigValidationError,
  classifyMargin,
  classifyProductivity,
} from "../nk-threshold-config-service"

const TENANT_ID = "f0000000-0000-4000-a000-0000000a1701"
const TENANT_SLUG = "nk-thresh-test"
const OTHER_TENANT_ID = "f0000000-0000-4000-a000-0000000a17ff"
const OTHER_TENANT_SLUG = "nk-thresh-other"
const ORDER_TYPE_ID = "f0000000-0000-4000-a000-0000000a1702"
const OTHER_ORDER_TYPE_ID = "f0000000-0000-4000-a000-0000000a1703"

beforeAll(async () => {
  await prisma.tenant.upsert({
    where: { id: TENANT_ID },
    update: {},
    create: {
      id: TENANT_ID,
      name: "Threshold Test",
      slug: TENANT_SLUG,
      isActive: true,
    },
  })
  await prisma.tenant.upsert({
    where: { id: OTHER_TENANT_ID },
    update: {},
    create: {
      id: OTHER_TENANT_ID,
      name: "Other Threshold Test",
      slug: OTHER_TENANT_SLUG,
      isActive: true,
    },
  })

  await prisma.nkThresholdConfig.deleteMany({
    where: { tenantId: { in: [TENANT_ID, OTHER_TENANT_ID] } },
  })
  await prisma.orderType.deleteMany({
    where: { id: { in: [ORDER_TYPE_ID, OTHER_ORDER_TYPE_ID] } },
  })

  await prisma.orderType.create({
    data: {
      id: ORDER_TYPE_ID,
      tenantId: TENANT_ID,
      code: "NOTDIENST",
      name: "Notdienst",
    },
  })
  await prisma.orderType.create({
    data: {
      id: OTHER_ORDER_TYPE_ID,
      tenantId: OTHER_TENANT_ID,
      code: "WARTUNG",
      name: "Wartung",
    },
  })
})

afterAll(async () => {
  await prisma.nkThresholdConfig.deleteMany({
    where: { tenantId: { in: [TENANT_ID, OTHER_TENANT_ID] } },
  })
  await prisma.orderType.deleteMany({
    where: { id: { in: [ORDER_TYPE_ID, OTHER_ORDER_TYPE_ID] } },
  })
  await prisma.tenant.deleteMany({
    where: { id: { in: [TENANT_ID, OTHER_TENANT_ID] } },
  })
})

beforeEach(async () => {
  await prisma.nkThresholdConfig.deleteMany({
    where: { tenantId: { in: [TENANT_ID, OTHER_TENANT_ID] } },
  })
})

// ----------------------------------------------------------------------------
// getEffectiveThresholds
// ----------------------------------------------------------------------------

describe("nk-threshold-config-service.getEffectiveThresholds", () => {
  it("returns DEFAULT_THRESHOLDS and auto-creates default row when no config exists", async () => {
    const t = await service.getEffectiveThresholds(prisma, TENANT_ID, null)
    expect(t).toEqual(DEFAULT_THRESHOLDS)
    // Auto-init must have persisted a default row.
    const persisted = await prisma.nkThresholdConfig.findFirst({
      where: { tenantId: TENANT_ID, orderTypeId: null },
    })
    expect(persisted).not.toBeNull()
    expect(Number(persisted!.marginAmberFromPercent)).toBe(
      DEFAULT_THRESHOLDS.marginAmberFromPercent,
    )
  })

  it("returns custom default when tenant has set one", async () => {
    await prisma.nkThresholdConfig.create({
      data: {
        tenantId: TENANT_ID,
        orderTypeId: null,
        marginAmberFromPercent: 10,
        marginRedFromPercent: 2,
        productivityAmberFromPercent: 80,
        productivityRedFromPercent: 60,
      },
    })

    const t = await service.getEffectiveThresholds(prisma, TENANT_ID, null)
    expect(t.marginAmberFromPercent).toBe(10)
    expect(t.marginRedFromPercent).toBe(2)
    expect(t.productivityAmberFromPercent).toBe(80)
    expect(t.productivityRedFromPercent).toBe(60)
  })

  it("falls back to default when no override exists for orderTypeId", async () => {
    await prisma.nkThresholdConfig.create({
      data: {
        tenantId: TENANT_ID,
        orderTypeId: null,
        marginAmberFromPercent: 5,
        marginRedFromPercent: 0,
        productivityAmberFromPercent: 70,
        productivityRedFromPercent: 50,
      },
    })

    const t = await service.getEffectiveThresholds(
      prisma,
      TENANT_ID,
      ORDER_TYPE_ID,
    )
    expect(t.marginAmberFromPercent).toBe(5)
  })

  it("override beats default when both exist for the same orderTypeId", async () => {
    await prisma.nkThresholdConfig.create({
      data: {
        tenantId: TENANT_ID,
        orderTypeId: null,
        marginAmberFromPercent: 5,
        marginRedFromPercent: 0,
        productivityAmberFromPercent: 70,
        productivityRedFromPercent: 50,
      },
    })
    // Notdienst has a higher margin expectation
    await prisma.nkThresholdConfig.create({
      data: {
        tenantId: TENANT_ID,
        orderTypeId: ORDER_TYPE_ID,
        marginAmberFromPercent: 15,
        marginRedFromPercent: 5,
        productivityAmberFromPercent: 80,
        productivityRedFromPercent: 60,
      },
    })

    const t = await service.getEffectiveThresholds(
      prisma,
      TENANT_ID,
      ORDER_TYPE_ID,
    )
    expect(t.marginAmberFromPercent).toBe(15)
    expect(t.marginRedFromPercent).toBe(5)

    // Default still wins for unrelated orderTypeId
    const tDefault = await service.getEffectiveThresholds(
      prisma,
      TENANT_ID,
      null,
    )
    expect(tDefault.marginAmberFromPercent).toBe(5)
  })
})

// ----------------------------------------------------------------------------
// upsertDefault
// ----------------------------------------------------------------------------

describe("nk-threshold-config-service.upsertDefault", () => {
  it("creates a default row when none exists", async () => {
    const r = await service.upsertDefault(prisma, TENANT_ID, {
      marginAmberFromPercent: 12,
      marginRedFromPercent: 4,
      productivityAmberFromPercent: 75,
      productivityRedFromPercent: 55,
    })
    expect(r.orderTypeId).toBeNull()
    expect(Number(r.marginAmberFromPercent)).toBe(12)
  })

  it("updates the existing default row in place", async () => {
    const first = await service.upsertDefault(prisma, TENANT_ID, {
      marginAmberFromPercent: 10,
      marginRedFromPercent: 0,
      productivityAmberFromPercent: 70,
      productivityRedFromPercent: 50,
    })
    const second = await service.upsertDefault(prisma, TENANT_ID, {
      marginAmberFromPercent: 20,
      marginRedFromPercent: 5,
      productivityAmberFromPercent: 90,
      productivityRedFromPercent: 70,
    })
    expect(second.id).toBe(first.id)
    expect(Number(second.marginAmberFromPercent)).toBe(20)

    const all = await prisma.nkThresholdConfig.findMany({
      where: { tenantId: TENANT_ID, orderTypeId: null },
    })
    expect(all).toHaveLength(1)
  })

  it("rejects amber <= red on margin", async () => {
    await expect(
      service.upsertDefault(prisma, TENANT_ID, {
        marginAmberFromPercent: 0,
        marginRedFromPercent: 5,
        productivityAmberFromPercent: 70,
        productivityRedFromPercent: 50,
      }),
    ).rejects.toThrow(NkThresholdConfigValidationError)
  })

  it("rejects amber <= red on productivity", async () => {
    await expect(
      service.upsertDefault(prisma, TENANT_ID, {
        marginAmberFromPercent: 5,
        marginRedFromPercent: 0,
        productivityAmberFromPercent: 50,
        productivityRedFromPercent: 70,
      }),
    ).rejects.toThrow(NkThresholdConfigValidationError)
  })
})

// ----------------------------------------------------------------------------
// upsertOverride
// ----------------------------------------------------------------------------

describe("nk-threshold-config-service.upsertOverride", () => {
  it("creates an override for a tenant-owned orderType", async () => {
    const r = await service.upsertOverride(prisma, TENANT_ID, ORDER_TYPE_ID, {
      marginAmberFromPercent: 15,
      marginRedFromPercent: 5,
      productivityAmberFromPercent: 80,
      productivityRedFromPercent: 60,
    })
    expect(r.orderTypeId).toBe(ORDER_TYPE_ID)
  })

  it("rejects orderType belonging to another tenant", async () => {
    // OTHER_ORDER_TYPE_ID belongs to OTHER_TENANT_ID — caller passes TENANT_ID
    await expect(
      service.upsertOverride(prisma, TENANT_ID, OTHER_ORDER_TYPE_ID, {
        marginAmberFromPercent: 15,
        marginRedFromPercent: 5,
        productivityAmberFromPercent: 80,
        productivityRedFromPercent: 60,
      }),
    ).rejects.toThrow(NkThresholdConfigValidationError)
  })

  it("updates an existing override in place", async () => {
    const first = await service.upsertOverride(
      prisma,
      TENANT_ID,
      ORDER_TYPE_ID,
      {
        marginAmberFromPercent: 15,
        marginRedFromPercent: 5,
        productivityAmberFromPercent: 80,
        productivityRedFromPercent: 60,
      },
    )
    const second = await service.upsertOverride(
      prisma,
      TENANT_ID,
      ORDER_TYPE_ID,
      {
        marginAmberFromPercent: 25,
        marginRedFromPercent: 10,
        productivityAmberFromPercent: 90,
        productivityRedFromPercent: 70,
      },
    )
    expect(second.id).toBe(first.id)
    expect(Number(second.marginAmberFromPercent)).toBe(25)

    const all = await prisma.nkThresholdConfig.findMany({
      where: { tenantId: TENANT_ID, orderTypeId: ORDER_TYPE_ID },
    })
    expect(all).toHaveLength(1)
  })

  it("validates amber > red on overrides too", async () => {
    await expect(
      service.upsertOverride(prisma, TENANT_ID, ORDER_TYPE_ID, {
        marginAmberFromPercent: 5,
        marginRedFromPercent: 5, // equal, must fail (strictly greater)
        productivityAmberFromPercent: 70,
        productivityRedFromPercent: 50,
      }),
    ).rejects.toThrow(NkThresholdConfigValidationError)
  })
})

// ----------------------------------------------------------------------------
// removeOverride
// ----------------------------------------------------------------------------

describe("nk-threshold-config-service.removeOverride", () => {
  it("deletes the override row", async () => {
    await service.upsertOverride(prisma, TENANT_ID, ORDER_TYPE_ID, {
      marginAmberFromPercent: 15,
      marginRedFromPercent: 5,
      productivityAmberFromPercent: 80,
      productivityRedFromPercent: 60,
    })
    await service.removeOverride(prisma, TENANT_ID, ORDER_TYPE_ID)

    const remaining = await prisma.nkThresholdConfig.findFirst({
      where: { tenantId: TENANT_ID, orderTypeId: ORDER_TYPE_ID },
    })
    expect(remaining).toBeNull()
  })

  it("throws NkThresholdConfigNotFoundError when no override exists", async () => {
    await expect(
      service.removeOverride(prisma, TENANT_ID, ORDER_TYPE_ID),
    ).rejects.toThrow(NkThresholdConfigNotFoundError)
  })
})

// ----------------------------------------------------------------------------
// listConfigs
// ----------------------------------------------------------------------------

describe("nk-threshold-config-service.listConfigs", () => {
  it("returns all configs for tenant (default + overrides)", async () => {
    await service.upsertDefault(prisma, TENANT_ID, DEFAULT_THRESHOLDS)
    await service.upsertOverride(prisma, TENANT_ID, ORDER_TYPE_ID, {
      marginAmberFromPercent: 15,
      marginRedFromPercent: 5,
      productivityAmberFromPercent: 80,
      productivityRedFromPercent: 60,
    })

    const all = await service.listConfigs(prisma, TENANT_ID)
    expect(all).toHaveLength(2)
    expect(all.some((c) => c.orderTypeId === null)).toBe(true)
    expect(all.some((c) => c.orderTypeId === ORDER_TYPE_ID)).toBe(true)
  })

  it("does not leak configs from other tenants", async () => {
    await service.upsertDefault(prisma, TENANT_ID, DEFAULT_THRESHOLDS)
    await service.upsertDefault(prisma, OTHER_TENANT_ID, {
      marginAmberFromPercent: 99,
      marginRedFromPercent: 80,
      productivityAmberFromPercent: 99,
      productivityRedFromPercent: 80,
    })

    const all = await service.listConfigs(prisma, TENANT_ID)
    expect(all).toHaveLength(1)
    expect(Number(all[0]!.marginAmberFromPercent)).toBe(
      DEFAULT_THRESHOLDS.marginAmberFromPercent,
    )
  })
})

// ----------------------------------------------------------------------------
// classifyMargin / classifyProductivity (pure helpers, no DB)
// ----------------------------------------------------------------------------

describe("classifyMargin", () => {
  const t: service.ThresholdSet = {
    marginAmberFromPercent: 15,
    marginRedFromPercent: 5,
    productivityAmberFromPercent: 80,
    productivityRedFromPercent: 60,
  }

  it("classifies values below red as red", () => {
    expect(classifyMargin(0, t)).toBe("red")
    expect(classifyMargin(4.99, t)).toBe("red")
    expect(classifyMargin(-10, t)).toBe("red")
  })

  it("classifies values in [red, amber) as amber", () => {
    expect(classifyMargin(5, t)).toBe("amber")
    expect(classifyMargin(10, t)).toBe("amber")
    expect(classifyMargin(14.99, t)).toBe("amber")
  })

  it("classifies values >= amber as green", () => {
    expect(classifyMargin(15, t)).toBe("green")
    expect(classifyMargin(50, t)).toBe("green")
  })
})

describe("classifyProductivity", () => {
  const t: service.ThresholdSet = {
    marginAmberFromPercent: 15,
    marginRedFromPercent: 5,
    productivityAmberFromPercent: 80,
    productivityRedFromPercent: 60,
  }

  it("classifies values below red as red", () => {
    expect(classifyProductivity(0, t)).toBe("red")
    expect(classifyProductivity(59.99, t)).toBe("red")
  })

  it("classifies values in [red, amber) as amber", () => {
    expect(classifyProductivity(60, t)).toBe("amber")
    expect(classifyProductivity(75, t)).toBe("amber")
    expect(classifyProductivity(79.99, t)).toBe("amber")
  })

  it("classifies values >= amber as green", () => {
    expect(classifyProductivity(80, t)).toBe("green")
    expect(classifyProductivity(120, t)).toBe("green")
  })
})
