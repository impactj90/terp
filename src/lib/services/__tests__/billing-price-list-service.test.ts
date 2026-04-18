import { describe, it, expect, vi } from "vitest"
import * as service from "../billing-price-list-service"
import type { PrismaClient } from "@/generated/prisma/client"

// --- Constants ---
const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const USER_ID = "a0000000-0000-4000-a000-000000000001"
const PL_ID = "c0000000-0000-4000-a000-000000000010"
const PL_ID_2 = "c0000000-0000-4000-a000-000000000011"
const ENTRY_ID = "c0000000-0000-4000-a000-000000000020"
const ENTRY_ID_2 = "c0000000-0000-4000-a000-000000000021"
const ADDRESS_ID = "b0000000-0000-4000-b000-000000000001"

const mockPriceList = {
  id: PL_ID,
  tenantId: TENANT_ID,
  name: "Standardpreisliste",
  description: "Standard",
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

const mockEntryVolume100 = {
  ...mockEntry,
  id: ENTRY_ID_2,
  unitPrice: 100,
  minQuantity: 10,
}

// --- Helper: create mock prisma ---
function createMockPrisma(overrides: Record<string, Record<string, unknown>> = {}) {
  return {
    billingPriceList: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockResolvedValue(mockPriceList),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      ...overrides.billingPriceList,
    },
    billingPriceListEntry: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue(mockEntry),
      update: vi.fn().mockResolvedValue(mockEntry),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      ...overrides.billingPriceListEntry,
    },
    crmAddress: {
      findFirst: vi.fn().mockResolvedValue(null),
      count: vi.fn().mockResolvedValue(0),
      ...overrides.crmAddress,
    },
    $transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      // Run with the same mock prisma as tx
      return fn(createMockPrisma(overrides))
    }),
  } as unknown as PrismaClient
}

describe("billing-price-list-service", () => {
  describe("lookupPrice", () => {
    it("returns customer-specific price when customer has assigned price list", async () => {
      const prisma = createMockPrisma({
        crmAddress: {
          findFirst: vi.fn().mockResolvedValue({ salesPriceListId: PL_ID, purchasePriceListId: null }),
        },
        billingPriceListEntry: {
          findMany: vi.fn().mockResolvedValue([mockEntry]),
        },
      })

      const result = await service.lookupPrice(prisma, TENANT_ID, {
        addressId: ADDRESS_ID,
        itemKey: "beratung_std",
      })

      expect(result).not.toBeNull()
      expect(result!.unitPrice).toBe(120)
      expect(result!.source).toBe("customer_list")
    })

    it("falls back to default price list when customer has no assigned list", async () => {
      const prisma = createMockPrisma({
        crmAddress: {
          findFirst: vi.fn().mockResolvedValue({ salesPriceListId: null, purchasePriceListId: null }),
        },
        billingPriceList: {
          findFirst: vi.fn().mockResolvedValue(mockPriceList),
        },
        billingPriceListEntry: {
          findMany: vi.fn().mockResolvedValue([mockEntry]),
        },
      })

      const result = await service.lookupPrice(prisma, TENANT_ID, {
        addressId: ADDRESS_ID,
        itemKey: "beratung_std",
      })

      expect(result).not.toBeNull()
      expect(result!.unitPrice).toBe(120)
      expect(result!.source).toBe("default_list")
    })

    it("falls back to default price list when customer list has no matching entry", async () => {
      const prisma = createMockPrisma({
        crmAddress: {
          findFirst: vi.fn().mockResolvedValue({ salesPriceListId: PL_ID_2, purchasePriceListId: null }),
        },
        billingPriceList: {
          findFirst: vi.fn().mockResolvedValue(mockPriceList),
        },
        billingPriceListEntry: {
          findMany: vi.fn()
            .mockResolvedValueOnce([]) // customer list: no match
            .mockResolvedValueOnce([mockEntry]), // default list: match
        },
      })

      const result = await service.lookupPrice(prisma, TENANT_ID, {
        addressId: ADDRESS_ID,
        itemKey: "beratung_std",
      })

      expect(result).not.toBeNull()
      expect(result!.source).toBe("default_list")
    })

    it("returns null if no match in customer list or default list", async () => {
      const prisma = createMockPrisma({
        crmAddress: {
          findFirst: vi.fn().mockResolvedValue({ salesPriceListId: null, purchasePriceListId: null }),
        },
        billingPriceList: {
          findFirst: vi.fn().mockResolvedValue(null), // no default list
        },
      })

      const result = await service.lookupPrice(prisma, TENANT_ID, {
        addressId: ADDRESS_ID,
        itemKey: "beratung_std",
      })

      expect(result).toBeNull()
    })

    it("selects best volume price for given quantity (highest minQuantity <= qty)", async () => {
      const baseEntry = { ...mockEntry, minQuantity: null, unitPrice: 120 }
      const volumeEntry = { ...mockEntryVolume100, minQuantity: 10, unitPrice: 100 }

      const prisma = createMockPrisma({
        crmAddress: {
          findFirst: vi.fn().mockResolvedValue({ salesPriceListId: PL_ID, purchasePriceListId: null }),
        },
        billingPriceListEntry: {
          findMany: vi.fn().mockResolvedValue([volumeEntry, baseEntry]),
        },
      })

      const result = await service.lookupPrice(prisma, TENANT_ID, {
        addressId: ADDRESS_ID,
        itemKey: "beratung_std",
        quantity: 20,
      })

      expect(result).not.toBeNull()
      expect(result!.unitPrice).toBe(100) // volume price
    })

    it("returns base price (no minQuantity) when quantity not provided", async () => {
      const baseEntry = { ...mockEntry, minQuantity: null, unitPrice: 120 }
      const volumeEntry = { ...mockEntryVolume100, minQuantity: 10, unitPrice: 100 }

      const prisma = createMockPrisma({
        crmAddress: {
          findFirst: vi.fn().mockResolvedValue({ salesPriceListId: PL_ID, purchasePriceListId: null }),
        },
        billingPriceListEntry: {
          findMany: vi.fn().mockResolvedValue([volumeEntry, baseEntry]),
        },
      })

      const result = await service.lookupPrice(prisma, TENANT_ID, {
        addressId: ADDRESS_ID,
        itemKey: "beratung_std",
      })

      expect(result).not.toBeNull()
      expect(result!.unitPrice).toBe(120) // base price
    })

    it("throws validation error when address not found", async () => {
      const prisma = createMockPrisma({
        crmAddress: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      })

      await expect(
        service.lookupPrice(prisma, TENANT_ID, {
          addressId: ADDRESS_ID,
          itemKey: "beratung_std",
        })
      ).rejects.toThrow("Address not found")
    })
  })

  describe("setDefault", () => {
    it("unsets previous default and sets new one", async () => {
      const updated = { ...mockPriceList, isDefault: true }
      const prisma = createMockPrisma({
        billingPriceList: {
          findFirst: vi.fn()
            .mockResolvedValueOnce({ ...mockPriceList, isDefault: false })
            .mockResolvedValueOnce(updated),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      })

      const result = await service.setDefault(prisma, TENANT_ID, PL_ID)
      expect(result!.isDefault).toBe(true)
      // Verify unsetDefault was called (updateMany with isDefault: false)
      expect((prisma.billingPriceList.updateMany as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: TENANT_ID, isDefault: true }),
          data: { isDefault: false },
        })
      )
    })

    it("throws not-found when price list does not exist", async () => {
      const prisma = createMockPrisma({
        billingPriceList: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      })

      await expect(
        service.setDefault(prisma, TENANT_ID, PL_ID)
      ).rejects.toThrow("Price list not found")
    })
  })

  describe("remove", () => {
    it("deletes price list when not assigned to any customer", async () => {
      const prisma = createMockPrisma({
        billingPriceList: {
          findFirst: vi.fn().mockResolvedValue(mockPriceList),
          deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        crmAddress: {
          count: vi.fn().mockResolvedValue(0),
        },
      })

      // Should not throw
      await service.remove(prisma, TENANT_ID, PL_ID)
    })

    it("throws conflict error when assigned to customers", async () => {
      const prisma = createMockPrisma({
        billingPriceList: {
          findFirst: vi.fn().mockResolvedValue(mockPriceList),
        },
        crmAddress: {
          count: vi.fn().mockResolvedValue(5),
        },
      })

      await expect(
        service.remove(prisma, TENANT_ID, PL_ID)
      ).rejects.toThrow(/Cannot delete price list assigned to 10 customer/)
    })

    it("throws not-found when price list does not exist", async () => {
      const prisma = createMockPrisma({
        billingPriceList: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      })

      await expect(
        service.remove(prisma, TENANT_ID, PL_ID)
      ).rejects.toThrow("Price list not found")
    })
  })

  describe("bulkImport", () => {
    it("creates new entries for items not in list", async () => {
      const prisma = createMockPrisma({
        billingPriceList: {
          findFirst: vi.fn().mockResolvedValue(mockPriceList),
        },
        billingPriceListEntry: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue(mockEntry),
        },
      })

      const result = await service.bulkImport(prisma, TENANT_ID, PL_ID, [
        { itemKey: "beratung_std", unitPrice: 120, unit: "Std" },
      ])

      expect(result.created).toBe(1)
      expect(result.updated).toBe(0)
    })

    it("updates existing entries when itemKey already present", async () => {
      const prisma = createMockPrisma({
        billingPriceList: {
          findFirst: vi.fn().mockResolvedValue(mockPriceList),
        },
        billingPriceListEntry: {
          findFirst: vi.fn().mockResolvedValue(mockEntry),
          update: vi.fn().mockResolvedValue({ ...mockEntry, unitPrice: 150 }),
        },
      })

      const result = await service.bulkImport(prisma, TENANT_ID, PL_ID, [
        { itemKey: "beratung_std", unitPrice: 150 },
      ])

      expect(result.created).toBe(0)
      expect(result.updated).toBe(1)
    })

    it("throws not-found when price list does not exist", async () => {
      const prisma = createMockPrisma({
        billingPriceList: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      })

      await expect(
        service.bulkImport(prisma, TENANT_ID, PL_ID, [
          { itemKey: "test", unitPrice: 100 },
        ])
      ).rejects.toThrow("Price list not found")
    })
  })

  describe("create", () => {
    it("creates price list and returns it", async () => {
      const prisma = createMockPrisma({
        billingPriceList: {
          create: vi.fn().mockResolvedValue(mockPriceList),
        },
      })

      const result = await service.create(prisma, TENANT_ID, {
        name: "Standardpreisliste",
        description: "Standard",
      }, USER_ID)

      expect(result.name).toBe("Standardpreisliste")
    })

    it("unsets other defaults when isDefault=true", async () => {
      const prisma = createMockPrisma({
        billingPriceList: {
          create: vi.fn().mockResolvedValue(mockPriceList),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      })

      await service.create(prisma, TENANT_ID, {
        name: "Standard",
        isDefault: true,
      }, USER_ID)

      // Verify unsetDefault was called
      expect((prisma.billingPriceList.updateMany as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: TENANT_ID, isDefault: true }),
          data: { isDefault: false },
        })
      )
    })
  })

  describe("adjustPrices", () => {
    const ARTICLE_ID = "d0000000-0000-4000-a000-000000000001"

    const mockArticleEntry = {
      id: ENTRY_ID,
      priceListId: PL_ID,
      articleId: ARTICLE_ID,
      itemKey: null,
      description: null,
      unitPrice: 100,
      minQuantity: null,
      unit: "Stk",
      validFrom: null,
      validTo: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    const mockFreetextEntry = {
      id: ENTRY_ID_2,
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

    it("adjusts by positive percentage (+5%)", async () => {
      const txUpdateMock = vi.fn().mockResolvedValue({ ...mockArticleEntry, unitPrice: 105 })
      const prisma = createMockPrisma({
        billingPriceList: { findFirst: vi.fn().mockResolvedValue(mockPriceList) },
        billingPriceListEntry: {
          findMany: vi.fn().mockResolvedValue([mockArticleEntry]),
          update: txUpdateMock,
        },
      })

      const result = await service.adjustPrices(prisma, TENANT_ID, {
        priceListId: PL_ID,
        adjustmentPercent: 5,
      }, { userId: USER_ID, ipAddress: null, userAgent: null })

      expect(result).toEqual({ adjustedCount: 1 })
      expect(txUpdateMock).toHaveBeenCalledWith(
        expect.objectContaining({ data: { unitPrice: 105 } })
      )
    })

    it("adjusts by negative percentage (-3%)", async () => {
      const txUpdateMock = vi.fn().mockResolvedValue({ ...mockArticleEntry, unitPrice: 97 })
      const prisma = createMockPrisma({
        billingPriceList: { findFirst: vi.fn().mockResolvedValue(mockPriceList) },
        billingPriceListEntry: {
          findMany: vi.fn().mockResolvedValue([mockArticleEntry]),
          update: txUpdateMock,
        },
      })

      const result = await service.adjustPrices(prisma, TENANT_ID, {
        priceListId: PL_ID,
        adjustmentPercent: -3,
      })

      expect(result).toEqual({ adjustedCount: 1 })
      expect(txUpdateMock).toHaveBeenCalledWith(
        expect.objectContaining({ data: { unitPrice: 97 } })
      )
    })

    it("rounds adjusted prices to 2 decimal places", async () => {
      // 33.33 * 1.10 = 36.663 -> should round to 36.66
      const entry = { ...mockArticleEntry, unitPrice: 33.33 }
      const txUpdateMock = vi.fn().mockResolvedValue(entry)
      const prisma = createMockPrisma({
        billingPriceList: { findFirst: vi.fn().mockResolvedValue(mockPriceList) },
        billingPriceListEntry: {
          findMany: vi.fn().mockResolvedValue([entry]),
          update: txUpdateMock,
        },
      })

      await service.adjustPrices(prisma, TENANT_ID, {
        priceListId: PL_ID,
        adjustmentPercent: 10,
      })

      expect(txUpdateMock).toHaveBeenCalledWith(
        expect.objectContaining({ data: { unitPrice: 36.66 } })
      )
    })

    it("adjusts both article-bound and itemKey-only (freetext) entries", async () => {
      const txUpdateMock = vi.fn().mockResolvedValue(mockFreetextEntry)
      const findManyMock = vi.fn().mockResolvedValue([mockArticleEntry, mockFreetextEntry])
      const prisma = createMockPrisma({
        billingPriceList: { findFirst: vi.fn().mockResolvedValue(mockPriceList) },
        billingPriceListEntry: {
          findMany: findManyMock,
          update: txUpdateMock,
        },
      })

      const result = await service.adjustPrices(prisma, TENANT_ID, {
        priceListId: PL_ID,
        adjustmentPercent: 10,
      })

      expect(result).toEqual({ adjustedCount: 2 })
      // Entry query must not filter on articleId — freetext entries are included
      expect(findManyMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { priceListId: PL_ID },
        })
      )
      // Freetext entry: 120 * 1.10 = 132
      expect(txUpdateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: ENTRY_ID_2 },
          data: { unitPrice: 132 },
        })
      )
    })

    it("rejects price list from another tenant", async () => {
      const prisma = createMockPrisma({
        billingPriceList: { findFirst: vi.fn().mockResolvedValue(null) },
      })

      await expect(
        service.adjustPrices(prisma, TENANT_ID, {
          priceListId: PL_ID,
          adjustmentPercent: 5,
        })
      ).rejects.toThrow(service.BillingPriceListNotFoundError)
    })
  })

  describe("copyPriceList", () => {
    const ARTICLE_ID = "d0000000-0000-4000-a000-000000000001"
    const targetList = { ...mockPriceList, id: PL_ID_2, name: "Zielliste" }

    const articleEntry = {
      id: ENTRY_ID,
      priceListId: PL_ID,
      articleId: ARTICLE_ID,
      itemKey: null,
      description: null,
      unitPrice: 100,
      minQuantity: null,
      unit: "Stk",
      validFrom: null,
      validTo: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    const freetextEntry = {
      ...articleEntry,
      id: ENTRY_ID_2,
      articleId: null,
      itemKey: "beratung_std",
      description: "Beratung pro Stunde",
      unitPrice: 120,
      unit: "Std",
    }

    it("copies both article and itemKey-only entries", async () => {
      const createMock = vi.fn().mockResolvedValue(articleEntry)
      const findFirstEntryMock = vi.fn().mockResolvedValue(null)
      const prisma = createMockPrisma({
        billingPriceList: {
          findFirst: vi.fn()
            .mockResolvedValueOnce(mockPriceList)
            .mockResolvedValueOnce(targetList),
        },
        billingPriceListEntry: {
          findMany: vi.fn().mockResolvedValue([articleEntry, freetextEntry]),
          findFirst: findFirstEntryMock,
          create: createMock,
        },
      })

      const result = await service.copyPriceList(prisma, TENANT_ID, {
        sourceId: PL_ID,
        targetId: PL_ID_2,
      })

      expect(result).toEqual({ copied: 2, skipped: 0 })
      expect(createMock).toHaveBeenCalledTimes(2)
      // Freetext entry carries itemKey through
      expect(createMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            priceListId: PL_ID_2,
            itemKey: "beratung_std",
            articleId: null,
            unitPrice: 120,
          }),
        })
      )
    })

    it("skips entries that already exist in target when overwrite=false", async () => {
      const createMock = vi.fn().mockResolvedValue(articleEntry)
      // First entry: already exists; second: not
      const findFirstEntryMock = vi.fn()
        .mockResolvedValueOnce({ id: "existing" })
        .mockResolvedValueOnce(null)

      const prisma = createMockPrisma({
        billingPriceList: {
          findFirst: vi.fn()
            .mockResolvedValueOnce(mockPriceList)
            .mockResolvedValueOnce(targetList),
        },
        billingPriceListEntry: {
          findMany: vi.fn().mockResolvedValue([articleEntry, freetextEntry]),
          findFirst: findFirstEntryMock,
          create: createMock,
        },
      })

      const result = await service.copyPriceList(prisma, TENANT_ID, {
        sourceId: PL_ID,
        targetId: PL_ID_2,
      })

      expect(result).toEqual({ copied: 1, skipped: 1 })
      expect(createMock).toHaveBeenCalledTimes(1)
    })

    it("deletes target entries when overwrite=true", async () => {
      const deleteManyMock = vi.fn().mockResolvedValue({ count: 3 })
      const prisma = createMockPrisma({
        billingPriceList: {
          findFirst: vi.fn()
            .mockResolvedValueOnce(mockPriceList)
            .mockResolvedValueOnce(targetList),
        },
        billingPriceListEntry: {
          findMany: vi.fn().mockResolvedValue([articleEntry]),
          deleteMany: deleteManyMock,
          create: vi.fn().mockResolvedValue(articleEntry),
        },
      })

      await service.copyPriceList(prisma, TENANT_ID, {
        sourceId: PL_ID,
        targetId: PL_ID_2,
        overwrite: true,
      })

      expect(deleteManyMock).toHaveBeenCalledWith(
        expect.objectContaining({ where: { priceListId: PL_ID_2 } })
      )
    })

    it("rejects when source and target are identical", async () => {
      const prisma = createMockPrisma({
        billingPriceList: {
          findFirst: vi.fn().mockResolvedValue(mockPriceList),
        },
      })

      await expect(
        service.copyPriceList(prisma, TENANT_ID, {
          sourceId: PL_ID,
          targetId: PL_ID,
        })
      ).rejects.toThrow(service.BillingPriceListValidationError)
    })

    it("rejects when source price list is from another tenant", async () => {
      const prisma = createMockPrisma({
        billingPriceList: { findFirst: vi.fn().mockResolvedValue(null) },
      })

      await expect(
        service.copyPriceList(prisma, TENANT_ID, {
          sourceId: PL_ID,
          targetId: PL_ID_2,
        })
      ).rejects.toThrow(service.BillingPriceListNotFoundError)
    })

    it("rejects when target price list is from another tenant", async () => {
      const prisma = createMockPrisma({
        billingPriceList: {
          findFirst: vi.fn()
            .mockResolvedValueOnce(mockPriceList)
            .mockResolvedValueOnce(null),
        },
      })

      await expect(
        service.copyPriceList(prisma, TENANT_ID, {
          sourceId: PL_ID,
          targetId: PL_ID_2,
        })
      ).rejects.toThrow(service.BillingPriceListNotFoundError)
    })
  })
})
