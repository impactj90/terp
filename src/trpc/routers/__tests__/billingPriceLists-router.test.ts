import { describe, it, expect, vi } from "vitest"
import { createCallerFactory } from "@/trpc/init"
import { billingPriceListsRouter } from "../billing/priceLists"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import {
  createMockContext,
  createMockSession,
  createUserWithPermissions,
  createMockUserTenant,
} from "./helpers"

// Mock the db module used by requireModule middleware
vi.mock("@/lib/db", () => ({
  prisma: {
    tenantModule: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi
        .fn()
        .mockResolvedValue({ id: "mock", module: "billing" }),
    },
  },
}))

const PL_VIEW = permissionIdByKey("billing_price_lists.view")!
const PL_MANAGE = permissionIdByKey("billing_price_lists.manage")!
const ALL_PERMS = [PL_VIEW, PL_MANAGE]

const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const USER_ID = "a0000000-0000-4000-a000-000000000001"
const PL_ID = "c0000000-0000-4000-a000-000000000010"
const ENTRY_ID = "c0000000-0000-4000-a000-000000000020"
const ADDRESS_ID = "b0000000-0000-4000-b000-000000000001"

const createCaller = createCallerFactory(billingPriceListsRouter)

const MODULE_MOCK = {
  tenantModule: {
    findMany: vi.fn().mockResolvedValue([]),
    findUnique: vi
      .fn()
      .mockResolvedValue({ id: "mock", module: "billing" }),
  },
}

function withModuleMock(prisma: Record<string, unknown>) {
  return { ...MODULE_MOCK, ...prisma }
}

function createTestContext(
  prisma: Record<string, unknown>,
  permissions: string[] = ALL_PERMS
) {
  return createMockContext({
    prisma: withModuleMock(prisma) as unknown as ReturnType<
      typeof createMockContext
    >["prisma"],
    authToken: "test-token",
    user: createUserWithPermissions(permissions, {
      id: USER_ID,
      userTenants: [createMockUserTenant(USER_ID, TENANT_ID)],
    }),
    session: createMockSession(),
    tenantId: TENANT_ID,
  })
}

function createNoPermContext(prisma: Record<string, unknown>) {
  return createTestContext(prisma, [])
}

const mockPriceList = {
  id: PL_ID,
  tenantId: TENANT_ID,
  name: "Standardpreisliste",
  description: "Preise für Standardkunden",
  isDefault: true,
  validFrom: null,
  validTo: null,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  createdById: USER_ID,
  entries: [],
  addresses: [],
}

const mockPriceListWithCount = {
  ...mockPriceList,
  _count: { entries: 2, addresses: 1 },
}

const mockEntry = {
  id: ENTRY_ID,
  priceListId: PL_ID,
  articleId: null,
  itemKey: "beratung_std",
  description: "Beratung pro Stunde",
  unitPrice: 120,
  minQuantity: null,
  unit: "Std",
  validFrom: null,
  validTo: null,
  createdAt: new Date(),
  updatedAt: new Date(),
}

describe("billing.priceLists.list", () => {
  it("returns paginated list", async () => {
    const prisma = {
      billingPriceList: {
        findMany: vi.fn().mockResolvedValue([mockPriceListWithCount]),
        count: vi.fn().mockResolvedValue(1),
      },
    }
    const caller = createCaller(createTestContext(prisma))
    const result = await caller.list({ page: 1, pageSize: 10 })
    expect(result.items).toHaveLength(1)
    expect(result.total).toBe(1)
  })

  it("requires billing_price_lists.view permission", async () => {
    const prisma = {
      billingPriceList: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
    }
    const caller = createCaller(createNoPermContext(prisma))
    await expect(
      caller.list({ page: 1, pageSize: 10 })
    ).rejects.toThrow("Insufficient permissions")
  })
})

describe("billing.priceLists.getById", () => {
  it("returns price list with entries", async () => {
    const prisma = {
      billingPriceList: {
        findFirst: vi.fn().mockResolvedValue(mockPriceList),
      },
    }
    const caller = createCaller(createTestContext(prisma))
    const result = await caller.getById({ id: PL_ID })
    expect(result.id).toBe(PL_ID)
    expect(result.name).toBe("Standardpreisliste")
  })

  it("throws NOT_FOUND for missing price list", async () => {
    const prisma = {
      billingPriceList: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(prisma))
    await expect(caller.getById({ id: PL_ID })).rejects.toThrow()
  })
})

describe("billing.priceLists.create", () => {
  it("creates price list", async () => {
    const prisma = {
      billingPriceList: {
        create: vi.fn().mockResolvedValue(mockPriceList),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    }
    const caller = createCaller(createTestContext(prisma))
    const result = await caller.create({
      name: "Standardpreisliste",
      description: "Preise für Standardkunden",
      isDefault: true,
    })
    expect(result.name).toBe("Standardpreisliste")
  })

  it("requires billing_price_lists.manage permission", async () => {
    const prisma = {}
    const caller = createCaller(createTestContext(prisma, [PL_VIEW]))
    await expect(
      caller.create({ name: "Test" })
    ).rejects.toThrow("Insufficient permissions")
  })
})

describe("billing.priceLists.update", () => {
  it("updates price list fields", async () => {
    const updated = { ...mockPriceList, name: "Neuer Name" }
    const prisma = {
      billingPriceList: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(mockPriceList)
          .mockResolvedValueOnce(updated),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    }
    const caller = createCaller(createTestContext(prisma))
    const result = await caller.update({ id: PL_ID, name: "Neuer Name" })
    expect(result?.name).toBe("Neuer Name")
  })
})

describe("billing.priceLists.delete", () => {
  it("deletes price list", async () => {
    const prisma = {
      billingPriceList: {
        findFirst: vi.fn().mockResolvedValue(mockPriceList),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      crmAddress: {
        count: vi.fn().mockResolvedValue(0),
      },
    }
    const caller = createCaller(createTestContext(prisma))
    const result = await caller.delete({ id: PL_ID })
    expect(result).toEqual({ success: true })
  })

  it("returns CONFLICT when assigned to customers", async () => {
    const prisma = {
      billingPriceList: {
        findFirst: vi.fn().mockResolvedValue(mockPriceList),
      },
      crmAddress: {
        count: vi.fn().mockResolvedValue(3),
      },
    }
    const caller = createCaller(createTestContext(prisma))
    await expect(caller.delete({ id: PL_ID })).rejects.toThrow(
      /assigned to 3 customer/
    )
  })
})

describe("billing.priceLists.setDefault", () => {
  it("sets price list as default, unsets others", async () => {
    const updated = { ...mockPriceList, isDefault: true }
    const prisma = {
      billingPriceList: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce({ ...mockPriceList, isDefault: false })
          .mockResolvedValueOnce(updated),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    }
    const caller = createCaller(createTestContext(prisma))
    const result = await caller.setDefault({ id: PL_ID })
    expect(result?.isDefault).toBe(true)
  })
})

describe("billing.priceLists.entries.create", () => {
  it("adds entry to price list", async () => {
    const prisma = {
      billingPriceList: {
        findFirst: vi.fn().mockResolvedValue(mockPriceList),
      },
      billingPriceListEntry: {
        create: vi.fn().mockResolvedValue(mockEntry),
      },
    }
    const caller = createCaller(createTestContext(prisma))
    const result = await caller.entries.create({
      priceListId: PL_ID,
      itemKey: "beratung_std",
      description: "Beratung pro Stunde",
      unitPrice: 120,
      unit: "Std",
    })
    expect(result.unitPrice).toBe(120)
  })

  it("requires manage permission", async () => {
    const prisma = {}
    const caller = createCaller(createTestContext(prisma, [PL_VIEW]))
    await expect(
      caller.entries.create({
        priceListId: PL_ID,
        unitPrice: 100,
      })
    ).rejects.toThrow("Insufficient permissions")
  })
})

describe("billing.priceLists.entries.bulkImport", () => {
  it("bulk imports entries", async () => {
    const prisma = {
      billingPriceList: {
        findFirst: vi.fn().mockResolvedValue(mockPriceList),
      },
      billingPriceListEntry: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(mockEntry),
      },
    }
    const caller = createCaller(createTestContext(prisma))
    const result = await caller.entries.bulkImport({
      priceListId: PL_ID,
      entries: [
        { itemKey: "beratung_std", unitPrice: 120, unit: "Std" },
        { itemKey: "montage", unitPrice: 85, unit: "Std" },
      ],
    })
    expect(result.created).toBe(2)
    expect(result.updated).toBe(0)
  })
})

describe("billing.priceLists.lookupPrice", () => {
  it("returns correct price for customer with assigned list", async () => {
    const prisma = {
      crmAddress: {
        findFirst: vi.fn().mockResolvedValue({ salesPriceListId: PL_ID, purchasePriceListId: null }),
      },
      billingPriceListEntry: {
        findMany: vi.fn().mockResolvedValue([mockEntry]),
      },
    }
    const caller = createCaller(createTestContext(prisma))
    const result = await caller.lookupPrice({
      addressId: ADDRESS_ID,
      itemKey: "beratung_std",
    })
    expect(result?.unitPrice).toBe(120)
    expect(result?.source).toBe("customer_list")
  })

  it("falls back to default list when customer has no list", async () => {
    const defaultList = { ...mockPriceList, id: "d0000000-0000-4000-a000-000000000099" }
    const prisma = {
      crmAddress: {
        findFirst: vi.fn().mockResolvedValue({ salesPriceListId: null, purchasePriceListId: null }),
      },
      billingPriceList: {
        findFirst: vi.fn().mockResolvedValue(defaultList),
      },
      billingPriceListEntry: {
        findMany: vi.fn().mockResolvedValue([mockEntry]),
      },
    }
    const caller = createCaller(createTestContext(prisma))
    const result = await caller.lookupPrice({
      addressId: ADDRESS_ID,
      itemKey: "beratung_std",
    })
    expect(result?.unitPrice).toBe(120)
    expect(result?.source).toBe("default_list")
  })

  it("returns null when no match found", async () => {
    const prisma = {
      crmAddress: {
        findFirst: vi.fn().mockResolvedValue({ salesPriceListId: null, purchasePriceListId: null }),
      },
      billingPriceList: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(prisma))
    const result = await caller.lookupPrice({
      addressId: ADDRESS_ID,
      itemKey: "nonexistent",
    })
    expect(result).toBeNull()
  })
})
