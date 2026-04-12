import { describe, it, expect, vi } from "vitest"
import * as service from "../billing-document-service"
import type { PrismaClient } from "@/generated/prisma/client"

vi.mock("../audit-logs-service", () => ({
  log: vi.fn().mockResolvedValue(undefined),
  computeChanges: vi.fn().mockReturnValue(null),
}))

// --- Constants ---
const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const USER_ID = "a0000000-0000-4000-a000-000000000001"
const ADDRESS_ID = "b0000000-0000-4000-b000-000000000001"
const CONTACT_ID = "c0000000-0000-4000-a000-000000000001"
const DOC_ID = "d0000000-0000-4000-a000-000000000001"
const DOC_ID_2 = "d0000000-0000-4000-a000-000000000002"
const POS_ID = "e0000000-0000-4000-a000-000000000001"

const AUDIT = { userId: USER_ID, ipAddress: "127.0.0.1", userAgent: "test" }

const mockAddress = {
  id: ADDRESS_ID,
  tenantId: TENANT_ID,
  company: "Test GmbH",
  paymentTermDays: 30,
  discountPercent: 2.0,
  discountDays: 10,
}

const mockDocument = {
  id: DOC_ID,
  tenantId: TENANT_ID,
  number: "A-1",
  type: "OFFER" as const,
  status: "DRAFT" as const,
  addressId: ADDRESS_ID,
  contactId: null,
  deliveryAddressId: null,
  invoiceAddressId: null,
  inquiryId: null,
  orderId: null,
  parentDocumentId: null,
  orderDate: null,
  documentDate: new Date(),
  deliveryDate: null,
  deliveryType: null,
  deliveryTerms: null,
  paymentTermDays: 30,
  discountPercent: 2.0,
  discountDays: 10,
  discountPercent2: null,
  discountDays2: null,
  shippingCostNet: null,
  shippingCostVatRate: null,
  subtotalNet: 0,
  totalVat: 0,
  totalGross: 0,
  notes: null,
  internalNotes: null,
  printedAt: null,
  printedById: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  createdById: USER_ID,
  address: mockAddress,
  contact: null,
  deliveryAddress: null,
  invoiceAddress: null,
  inquiry: null,
  order: null,
  parentDocument: null,
  childDocuments: [],
  positions: [],
}

const mockPrintedDocument = {
  ...mockDocument,
  status: "PRINTED" as const,
  printedAt: new Date(),
  printedById: USER_ID,
  positions: [
    {
      id: POS_ID,
      documentId: DOC_ID,
      sortOrder: 1,
      type: "FREE",
      articleId: null,
      articleNumber: null,
      description: "Test Position",
      quantity: 10,
      unit: "Stk",
      unitPrice: 5,
      flatCosts: null,
      totalPrice: 50,
      priceType: "STANDARD",
      vatRate: 19,
      deliveryDate: null,
      confirmedDate: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ],
}

const mockPosition = {
  id: POS_ID,
  documentId: DOC_ID,
  sortOrder: 1,
  type: "FREE",
  articleId: null,
  articleNumber: null,
  description: "Test Position",
  quantity: 10,
  unit: "Stk",
  unitPrice: 5,
  flatCosts: null,
  totalPrice: 50,
  priceType: "STANDARD",
  vatRate: 19,
  deliveryDate: null,
  confirmedDate: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  document: { id: DOC_ID, tenantId: TENANT_ID, status: "DRAFT" },
}

function createMockPrisma(overrides: Record<string, unknown> = {}) {
  const prisma = {
    crmAddress: { findFirst: vi.fn() },
    crmContact: { findFirst: vi.fn() },
    billingDocument: {
      findMany: vi.fn(),
      count: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    billingDocumentPosition: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
      update: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    numberSequence: { upsert: vi.fn() },
    $transaction: vi.fn(),
    billingDocumentTemplate: { findFirst: vi.fn().mockResolvedValue(null) },
    ...overrides,
  } as unknown as PrismaClient
  ;(prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
    (fnOrArr: unknown) => {
      if (typeof fnOrArr === "function") return (fnOrArr as (tx: unknown) => unknown)(prisma)
      return Promise.all(fnOrArr as unknown[])
    }
  )
  return prisma
}

describe("billing-document-service", () => {
  describe("create", () => {
    it("creates with auto-generated number per document type", async () => {
      const prisma = createMockPrisma()
      ;(prisma.crmAddress.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(mockAddress)
      ;(prisma.numberSequence.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({
        prefix: "A-",
        nextValue: 2,
      })
      ;(prisma.billingDocument.create as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...mockDocument,
        number: "A-1",
      })

      const result = await service.create(
        prisma,
        TENANT_ID,
        { type: "OFFER", addressId: ADDRESS_ID },
        USER_ID,
        AUDIT
      )
      expect(result.number).toBe("A-1")
      expect(prisma.numberSequence.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId_key: { tenantId: TENANT_ID, key: "offer" } },
        })
      )
    })

    it("populates payment terms from customer address defaults", async () => {
      const prisma = createMockPrisma()
      ;(prisma.crmAddress.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...mockAddress,
        paymentTermDays: 30,
        discountPercent: 2,
        discountDays: 10,
      })
      ;(prisma.numberSequence.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({
        prefix: "A-",
        nextValue: 2,
      })
      ;(prisma.billingDocument.create as ReturnType<typeof vi.fn>).mockImplementation(
        ({ data }: { data: Record<string, unknown> }) => Promise.resolve({ ...mockDocument, ...data })
      )

      const result = await service.create(
        prisma,
        TENANT_ID,
        { type: "OFFER", addressId: ADDRESS_ID },
        USER_ID,
        AUDIT
      )

      expect(result.paymentTermDays).toBe(30)
      expect(result.discountPercent).toBe(2)
      expect(result.discountDays).toBe(10)
    })

    it("rejects if address not in tenant", async () => {
      const prisma = createMockPrisma()
      ;(prisma.crmAddress.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null)

      await expect(
        service.create(prisma, TENANT_ID, { type: "OFFER", addressId: ADDRESS_ID }, USER_ID, AUDIT)
      ).rejects.toThrow("Address not found in this tenant")
    })

    it("rejects if contact not found for address", async () => {
      const prisma = createMockPrisma()
      ;(prisma.crmAddress.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(mockAddress)
      ;(prisma.crmContact.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null)

      await expect(
        service.create(
          prisma,
          TENANT_ID,
          { type: "OFFER", addressId: ADDRESS_ID, contactId: CONTACT_ID },
          USER_ID,
          AUDIT
        )
      ).rejects.toThrow("Contact not found for this address")
    })
  })

  describe("update", () => {
    it("updates draft document fields", async () => {
      const prisma = createMockPrisma()
      ;(prisma.billingDocument.findFirst as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(mockDocument)
        .mockResolvedValueOnce({ ...mockDocument, notes: "Updated" })
      ;(prisma.billingDocument.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 })

      const result = await service.update(prisma, TENANT_ID, {
        id: DOC_ID,
        notes: "Updated",
      }, AUDIT)
      expect(result?.notes).toBe("Updated")
    })

    it("rejects when status is not DRAFT", async () => {
      const prisma = createMockPrisma()
      // findFirst returns the PRINTED doc (used by pre-fetch and re-check after count === 0)
      ;(prisma.billingDocument.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...mockDocument,
        status: "PRINTED",
      })
      // Atomic updateMany with status: "DRAFT" in where clause finds no match
      ;(prisma.billingDocument.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 0 })

      await expect(
        service.update(prisma, TENANT_ID, { id: DOC_ID, notes: "test" }, AUDIT)
      ).rejects.toThrow("Document can only be modified in DRAFT status")
    })
  })

  describe("finalize", () => {
    it("sets status to PRINTED and records printedAt/printedById", async () => {
      const prisma = createMockPrisma()
      const docWithPositions = {
        ...mockDocument,
        positions: [mockPosition],
      }
      ;(prisma.billingDocument.findFirst as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(docWithPositions)
        .mockResolvedValueOnce({ ...docWithPositions, status: "PRINTED" })
      ;(prisma.billingDocument.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 })

      await service.finalize(prisma, TENANT_ID, DOC_ID, USER_ID)
      expect(prisma.billingDocument.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "PRINTED",
            printedById: USER_ID,
          }),
        })
      )
    })

    it("rejects if not DRAFT", async () => {
      const prisma = createMockPrisma()
      ;(prisma.billingDocument.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...mockDocument,
        status: "PRINTED",
      })

      await expect(
        service.finalize(prisma, TENANT_ID, DOC_ID, USER_ID)
      ).rejects.toThrow("Only DRAFT documents can be finalized")
    })

    it("rejects if no positions", async () => {
      const prisma = createMockPrisma()
      ;(prisma.billingDocument.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...mockDocument,
        positions: [],
      })

      await expect(
        service.finalize(prisma, TENANT_ID, DOC_ID, USER_ID)
      ).rejects.toThrow("Document must have at least one position before finalizing")
    })
  })

  describe("forward", () => {
    it("OFFER can forward to ORDER_CONFIRMATION", async () => {
      const prisma = createMockPrisma()
      ;(prisma.billingDocument.findFirst as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(mockPrintedDocument)
        .mockResolvedValueOnce({ ...mockPrintedDocument, status: "FORWARDED" })
        .mockResolvedValueOnce({
          ...mockDocument,
          id: DOC_ID_2,
          type: "ORDER_CONFIRMATION",
          number: "AB-1",
          parentDocumentId: DOC_ID,
        })
      ;(prisma.numberSequence.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({
        prefix: "AB-",
        nextValue: 2,
      })
      ;(prisma.billingDocument.create as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...mockDocument,
        id: DOC_ID_2,
        type: "ORDER_CONFIRMATION",
        number: "AB-1",
      })
      ;(prisma.billingDocumentPosition.create as ReturnType<typeof vi.fn>).mockResolvedValue({})
      ;(prisma.billingDocumentPosition.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockPrintedDocument.positions
      )
      ;(prisma.billingDocument.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 })

      await service.forward(
        prisma,
        TENANT_ID,
        DOC_ID,
        "ORDER_CONFIRMATION",
        USER_ID,
        AUDIT
      )

      expect(prisma.billingDocument.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: "ORDER_CONFIRMATION",
            parentDocumentId: DOC_ID,
          }),
        })
      )
    })

    it("INVOICE cannot be forwarded (end of chain)", async () => {
      const prisma = createMockPrisma()
      ;(prisma.billingDocument.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...mockPrintedDocument,
        type: "INVOICE",
      })

      await expect(
        service.forward(prisma, TENANT_ID, DOC_ID, "ORDER_CONFIRMATION", USER_ID, AUDIT)
      ).rejects.toThrow("Cannot forward INVOICE to ORDER_CONFIRMATION")
    })

    it("rejects if source status is not finalized", async () => {
      const prisma = createMockPrisma()
      ;(prisma.billingDocument.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(mockDocument)

      await expect(
        service.forward(prisma, TENANT_ID, DOC_ID, "ORDER_CONFIRMATION", USER_ID, AUDIT)
      ).rejects.toThrow("Only finalized or partially forwarded documents can be forwarded")
    })

    it("copies all positions to new document", async () => {
      const prisma = createMockPrisma()
      const docWith2Positions = {
        ...mockPrintedDocument,
        positions: [
          { ...mockPrintedDocument.positions[0] },
          { ...mockPrintedDocument.positions[0], id: "e0000000-0000-4000-a000-000000000002", sortOrder: 2 },
        ],
      }
      ;(prisma.billingDocument.findFirst as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(docWith2Positions)
        .mockResolvedValueOnce({ ...docWith2Positions, status: "FORWARDED" })
        .mockResolvedValueOnce({ ...mockDocument, id: DOC_ID_2, type: "ORDER_CONFIRMATION" })
      ;(prisma.numberSequence.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({
        prefix: "AB-",
        nextValue: 2,
      })
      ;(prisma.billingDocument.create as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...mockDocument,
        id: DOC_ID_2,
      })
      ;(prisma.billingDocumentPosition.create as ReturnType<typeof vi.fn>).mockResolvedValue({})
      ;(prisma.billingDocumentPosition.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(
        docWith2Positions.positions
      )
      ;(prisma.billingDocument.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 })

      await service.forward(prisma, TENANT_ID, DOC_ID, "ORDER_CONFIRMATION", USER_ID, AUDIT)

      expect(prisma.billingDocumentPosition.createMany).toHaveBeenCalledTimes(1)
    })

    it("sets parent document status to FORWARDED", async () => {
      const prisma = createMockPrisma()
      ;(prisma.billingDocument.findFirst as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(mockPrintedDocument)
        .mockResolvedValueOnce({ ...mockPrintedDocument, status: "FORWARDED" })
        .mockResolvedValueOnce({ ...mockDocument, id: DOC_ID_2 })
      ;(prisma.numberSequence.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({
        prefix: "AB-",
        nextValue: 2,
      })
      ;(prisma.billingDocument.create as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...mockDocument,
        id: DOC_ID_2,
      })
      ;(prisma.billingDocumentPosition.create as ReturnType<typeof vi.fn>).mockResolvedValue({})
      ;(prisma.billingDocumentPosition.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockPrintedDocument.positions
      )
      ;(prisma.billingDocument.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 })

      await service.forward(prisma, TENANT_ID, DOC_ID, "ORDER_CONFIRMATION", USER_ID, AUDIT)

      // updateMany should be called: once for recalculateTotals, once for FORWARDED status, once for update return
      const updateCalls = (prisma.billingDocument.updateMany as ReturnType<typeof vi.fn>).mock.calls
      const forwardedCall = updateCalls.find(
        (call: Array<Record<string, unknown>>) =>
          (call[0] as Record<string, unknown>).data &&
          ((call[0] as Record<string, Record<string, unknown>>).data as Record<string, unknown>).status === "FORWARDED"
      )
      expect(forwardedCall).toBeDefined()
    })
  })

  describe("cancel", () => {
    it("sets status to CANCELLED", async () => {
      const prisma = createMockPrisma()
      ;(prisma.billingDocument.findFirst as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(mockDocument)
        .mockResolvedValueOnce({ ...mockDocument, status: "CANCELLED" })
      ;(prisma.billingDocument.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 })

      await service.cancel(prisma, TENANT_ID, DOC_ID)
      expect(prisma.billingDocument.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: "CANCELLED" }),
        })
      )
    })

    it("rejects if already cancelled", async () => {
      const prisma = createMockPrisma()
      ;(prisma.billingDocument.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 0 })
      ;(prisma.billingDocument.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
        status: "CANCELLED",
      })

      await expect(
        service.cancel(prisma, TENANT_ID, DOC_ID)
      ).rejects.toThrow("Document is already cancelled")
    })

    it("rejects if fully forwarded", async () => {
      const prisma = createMockPrisma()
      ;(prisma.billingDocument.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 0 })
      ;(prisma.billingDocument.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
        status: "FORWARDED",
      })

      await expect(
        service.cancel(prisma, TENANT_ID, DOC_ID)
      ).rejects.toThrow("Cannot cancel a fully forwarded document")
    })
  })

  describe("duplicate", () => {
    it("creates DRAFT copy with new number", async () => {
      const prisma = createMockPrisma()
      ;(prisma.billingDocument.findFirst as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(mockPrintedDocument)
        .mockResolvedValueOnce({ ...mockDocument, id: DOC_ID_2, number: "A-2" })
      ;(prisma.numberSequence.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({
        prefix: "A-",
        nextValue: 3,
      })
      ;(prisma.billingDocument.create as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...mockDocument,
        id: DOC_ID_2,
        number: "A-2",
      })
      ;(prisma.billingDocumentPosition.create as ReturnType<typeof vi.fn>).mockResolvedValue({})
      ;(prisma.billingDocumentPosition.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockPrintedDocument.positions
      )
      ;(prisma.billingDocument.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 })

      await service.duplicate(prisma, TENANT_ID, DOC_ID, USER_ID, AUDIT)
      expect(prisma.billingDocument.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: "OFFER",
            parentDocumentId: null,
          }),
        })
      )
    })
  })

  describe("addPosition", () => {
    it("adds position with calculated totalPrice", async () => {
      const prisma = createMockPrisma()
      ;(prisma.billingDocument.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(mockDocument)
      ;(prisma.billingDocumentPosition.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null)
      ;(prisma.billingDocumentPosition.create as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...mockPosition,
        quantity: 10,
        unitPrice: 5,
        totalPrice: 50,
      })
      ;(prisma.billingDocumentPosition.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        { ...mockPosition, totalPrice: 50, vatRate: 19 },
      ])
      ;(prisma.billingDocument.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 })

      await service.addPosition(prisma, TENANT_ID, {
        documentId: DOC_ID,
        type: "FREE",
        quantity: 10,
        unitPrice: 5,
        vatRate: 19,
      }, AUDIT)

      expect(prisma.billingDocumentPosition.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            totalPrice: 50,
          }),
        })
      )
    })

    it("rejects if document is not DRAFT", async () => {
      const prisma = createMockPrisma()
      ;(prisma.billingDocument.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...mockDocument,
        status: "PRINTED",
      })

      await expect(
        service.addPosition(prisma, TENANT_ID, {
          documentId: DOC_ID,
          type: "FREE",
        }, AUDIT)
      ).rejects.toThrow("Document can only be modified in DRAFT status")
    })
  })

  describe("updatePosition", () => {
    it("recalculates totalPrice on quantity/price change", async () => {
      const prisma = createMockPrisma()
      ;(prisma.billingDocumentPosition.findFirst as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(mockPosition)
        .mockResolvedValueOnce({ ...mockPosition, quantity: 20, totalPrice: 100 })
      ;(prisma.billingDocumentPosition.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 })
      ;(prisma.billingDocumentPosition.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        { ...mockPosition, totalPrice: 100, vatRate: 19 },
      ])
      ;(prisma.billingDocument.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 })

      await service.updatePosition(prisma, TENANT_ID, {
        id: POS_ID,
        quantity: 20,
      }, AUDIT)

      expect(prisma.billingDocumentPosition.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            totalPrice: 100,
          }),
        })
      )
    })
  })

  describe("deletePosition", () => {
    it("removes position and recalculates totals", async () => {
      const prisma = createMockPrisma()
      ;(prisma.billingDocumentPosition.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockPosition
      )
      ;(prisma.billingDocumentPosition.deleteMany as ReturnType<typeof vi.fn>).mockResolvedValue({
        count: 1,
      })
      ;(prisma.billingDocumentPosition.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])
      ;(prisma.billingDocument.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 })

      await service.deletePosition(prisma, TENANT_ID, POS_ID, AUDIT)

      expect(prisma.billingDocumentPosition.deleteMany).toHaveBeenCalledWith({
        where: { id: POS_ID, document: { tenantId: TENANT_ID } },
      })
    })

    it("rejects if document is not DRAFT", async () => {
      const prisma = createMockPrisma()
      // Pre-fetch position succeeds (needed for early validation)
      ;(prisma.billingDocumentPosition.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...mockPosition,
        document: { id: DOC_ID, tenantId: TENANT_ID, status: "PRINTED" },
      })
      // Atomic DRAFT guard inside transaction: updateMany with status: "DRAFT" finds no match
      ;(prisma.billingDocument.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 0 })

      await expect(
        service.deletePosition(prisma, TENANT_ID, POS_ID, AUDIT)
      ).rejects.toThrow("Document can only be modified in DRAFT status")
    })
  })

  describe("reorderPositions", () => {
    it("updates sortOrder for all positions", async () => {
      const prisma = createMockPrisma()
      ;(prisma.billingDocument.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(mockDocument)
      ;(prisma.billingDocumentPosition.findMany as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce([{ id: "id-a" }, { id: "id-b" }, { id: "id-c" }]) // validation
        .mockResolvedValue([]) // findPositions return
      ;(prisma.billingDocumentPosition.update as ReturnType<typeof vi.fn>).mockResolvedValue({})
      ;(prisma.$transaction as ReturnType<typeof vi.fn>).mockResolvedValue([{}, {}, {}])

      const ids = ["id-a", "id-b", "id-c"]
      await service.reorderPositions(prisma, TENANT_ID, DOC_ID, ids)

      // $transaction called once with batch of updates
      expect(prisma.$transaction).toHaveBeenCalledTimes(1)
    })
  })

  describe("recalculateTotals", () => {
    it("sums position totals correctly and groups VAT by rate", async () => {
      const prisma = createMockPrisma()
      ;(prisma.billingDocumentPosition.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        { totalPrice: 100, vatRate: 19 },
        { totalPrice: 50, vatRate: 7 },
        { totalPrice: 200, vatRate: 19 },
      ])
      ;(prisma.billingDocument.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 })

      const result = await service.recalculateTotals(prisma, TENANT_ID, DOC_ID)

      expect(result.subtotalNet).toBe(350)
      // 19% on 300 = 57, 7% on 50 = 3.5
      expect(result.totalVat).toBe(60.5)
      expect(result.totalGross).toBe(410.5)
    })
  })
})
