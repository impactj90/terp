import { describe, it, expect, vi } from "vitest"
import * as service from "../billing-service-case-service"
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
const CASE_ID = "d0000000-0000-4000-a000-000000000010"
const ORDER_ID = "f0000000-0000-4000-a000-000000000001"
const INVOICE_ID = "d0000000-0000-4000-a000-000000000020"
const AUDIT = { userId: USER_ID, ipAddress: "127.0.0.1", userAgent: "test" }
const EMPLOYEE_ID = "e0000000-0000-4000-a000-000000000001"
const INQUIRY_ID = "c0000000-0000-4000-a000-000000000010"

const mockAddress = {
  id: ADDRESS_ID,
  tenantId: TENANT_ID,
  company: "Test GmbH",
}

const mockContact = {
  id: CONTACT_ID,
  tenantId: TENANT_ID,
  addressId: ADDRESS_ID,
  firstName: "Max",
  lastName: "Mustermann",
}

const mockInquiry = {
  id: INQUIRY_ID,
  tenantId: TENANT_ID,
  number: "V-1",
  title: "Test Inquiry",
}

const mockServiceCase = {
  id: CASE_ID,
  tenantId: TENANT_ID,
  number: "KD-1",
  title: "Heizungsreparatur",
  addressId: ADDRESS_ID,
  contactId: null,
  inquiryId: null,
  status: "OPEN" as const,
  reportedAt: new Date(),
  customerNotifiedCost: false,
  assignedToId: null,
  description: null,
  closingReason: null,
  closedAt: null,
  closedById: null,
  orderId: null,
  invoiceDocumentId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  createdById: USER_ID,
  address: mockAddress,
  contact: null,
  inquiry: null,
  assignedTo: null,
  order: null,
  invoiceDocument: null,
}

const mockInProgressCase = {
  ...mockServiceCase,
  status: "IN_PROGRESS" as const,
  assignedToId: EMPLOYEE_ID,
}

const mockClosedCase = {
  ...mockServiceCase,
  status: "CLOSED" as const,
  closingReason: "Reparatur abgeschlossen",
  closedAt: new Date(),
  closedById: USER_ID,
}

const mockInvoicedCase = {
  ...mockClosedCase,
  status: "INVOICED" as const,
  invoiceDocumentId: INVOICE_ID,
}

function createMockPrisma(overrides: Record<string, unknown> = {}) {
  const prisma = {
    crmAddress: { findFirst: vi.fn() },
    crmContact: { findFirst: vi.fn() },
    crmInquiry: { findFirst: vi.fn() },
    billingServiceCase: {
      findMany: vi.fn(),
      count: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    billingDocument: {
      findFirst: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
    billingDocumentPosition: {
      findFirst: vi.fn(),
      create: vi.fn(),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
      findMany: vi.fn(),
    },
    numberSequence: { upsert: vi.fn() },
    billingDocumentTemplate: { findFirst: vi.fn().mockResolvedValue(null) },
    $transaction: vi.fn(),
    order: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
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

describe("billing-service-case-service", () => {
  describe("create", () => {
    it("creates with auto-generated number", async () => {
      const prisma = createMockPrisma()
      ;(prisma.crmAddress.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(mockAddress)
      ;(prisma.numberSequence.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({
        prefix: "KD-",
        nextValue: 2,
      })
      ;(prisma.billingServiceCase.create as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...mockServiceCase,
        number: "KD-1",
      })

      const result = await service.create(
        prisma,
        TENANT_ID,
        { title: "Heizungsreparatur", addressId: ADDRESS_ID },
        USER_ID
      )
      expect(result.number).toBe("KD-1")
      expect(prisma.numberSequence.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId_key: { tenantId: TENANT_ID, key: "service_case" } },
        })
      )
    })

    it("initial status is OPEN", async () => {
      const prisma = createMockPrisma()
      ;(prisma.crmAddress.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(mockAddress)
      ;(prisma.numberSequence.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({
        prefix: "KD-",
        nextValue: 2,
      })
      ;(prisma.billingServiceCase.create as ReturnType<typeof vi.fn>).mockImplementation(
        ({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve({ ...mockServiceCase, ...data })
      )

      const result = await service.create(
        prisma,
        TENANT_ID,
        { title: "Test", addressId: ADDRESS_ID },
        USER_ID
      )
      expect(result.status).toBe("OPEN")
    })

    it("sets status to IN_PROGRESS when assignedToId provided", async () => {
      const prisma = createMockPrisma()
      ;(prisma.crmAddress.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(mockAddress)
      ;(prisma.numberSequence.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({
        prefix: "KD-",
        nextValue: 2,
      })
      ;(prisma.billingServiceCase.create as ReturnType<typeof vi.fn>).mockImplementation(
        ({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve({ ...mockServiceCase, ...data })
      )

      const result = await service.create(
        prisma,
        TENANT_ID,
        { title: "Test", addressId: ADDRESS_ID, assignedToId: EMPLOYEE_ID },
        USER_ID
      )
      expect(result.status).toBe("IN_PROGRESS")
    })

    it("rejects if address not in tenant", async () => {
      const prisma = createMockPrisma()
      ;(prisma.crmAddress.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null)

      await expect(
        service.create(prisma, TENANT_ID, { title: "Test", addressId: ADDRESS_ID }, USER_ID)
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
          { title: "Test", addressId: ADDRESS_ID, contactId: CONTACT_ID },
          USER_ID
        )
      ).rejects.toThrow("Contact not found for this address")
    })

    it("rejects if inquiry not found in tenant", async () => {
      const prisma = createMockPrisma()
      ;(prisma.crmAddress.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(mockAddress)
      ;(prisma.crmInquiry.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null)

      await expect(
        service.create(
          prisma,
          TENANT_ID,
          { title: "Test", addressId: ADDRESS_ID, inquiryId: INQUIRY_ID },
          USER_ID
        )
      ).rejects.toThrow("Inquiry not found in this tenant")
    })
  })

  describe("update", () => {
    it("updates OPEN service case fields", async () => {
      const prisma = createMockPrisma()
      ;(prisma.billingServiceCase.findFirst as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(mockServiceCase)
        .mockResolvedValueOnce({ ...mockServiceCase, title: "Updated", status: "IN_PROGRESS" })
      ;(prisma.billingServiceCase.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 })

      const result = await service.update(prisma, TENANT_ID, {
        id: CASE_ID,
        title: "Updated",
      })
      expect(result?.title).toBe("Updated")
    })

    it("auto-transitions OPEN to IN_PROGRESS on update", async () => {
      const prisma = createMockPrisma()
      ;(prisma.billingServiceCase.findFirst as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(mockServiceCase)
        .mockResolvedValueOnce({ ...mockServiceCase, status: "IN_PROGRESS" })
      ;(prisma.billingServiceCase.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 })

      await service.update(prisma, TENANT_ID, {
        id: CASE_ID,
        title: "Updated",
      })
      expect(prisma.billingServiceCase.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: "IN_PROGRESS" }),
        })
      )
    })

    it("rejects when status is CLOSED", async () => {
      const prisma = createMockPrisma()
      ;(prisma.billingServiceCase.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(mockClosedCase)

      await expect(
        service.update(prisma, TENANT_ID, { id: CASE_ID, title: "test" })
      ).rejects.toThrow("Service case cannot be modified in status CLOSED")
    })

    it("rejects when status is INVOICED", async () => {
      const prisma = createMockPrisma()
      ;(prisma.billingServiceCase.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(mockInvoicedCase)

      await expect(
        service.update(prisma, TENANT_ID, { id: CASE_ID, title: "test" })
      ).rejects.toThrow("Service case cannot be modified in status INVOICED")
    })
  })

  describe("close", () => {
    it("sets CLOSED, closedAt, closingReason", async () => {
      const prisma = createMockPrisma()
      ;(prisma.billingServiceCase.findFirst as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(mockServiceCase)
        .mockResolvedValueOnce(mockClosedCase)
      ;(prisma.billingServiceCase.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 })

      await service.close(prisma, TENANT_ID, CASE_ID, "Reparatur abgeschlossen", USER_ID)
      expect(prisma.billingServiceCase.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "CLOSED",
            closingReason: "Reparatur abgeschlossen",
            closedById: USER_ID,
          }),
        })
      )
    })

    it("rejects if already CLOSED", async () => {
      const prisma = createMockPrisma()
      ;(prisma.billingServiceCase.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(mockClosedCase)

      await expect(
        service.close(prisma, TENANT_ID, CASE_ID, "reason", USER_ID)
      ).rejects.toThrow("Service case is already closed or invoiced")
    })

    it("rejects if already INVOICED", async () => {
      const prisma = createMockPrisma()
      ;(prisma.billingServiceCase.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(mockInvoicedCase)

      await expect(
        service.close(prisma, TENANT_ID, CASE_ID, "reason", USER_ID)
      ).rejects.toThrow("Service case is already closed or invoiced")
    })
  })

  describe("createInvoice", () => {
    it("creates BillingDocument of type INVOICE", async () => {
      const prisma = createMockPrisma()
      ;(prisma.billingServiceCase.findFirst as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(mockClosedCase)
        .mockResolvedValueOnce(mockInvoicedCase)
      ;(prisma.billingServiceCase.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 })
      // Mock for billingDocService.create -> address validation + number seq + create
      ;(prisma.crmAddress.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(mockAddress)
      ;(prisma.numberSequence.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({
        prefix: "RE-",
        nextValue: 2,
      })
      ;(prisma.billingDocument.create as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: INVOICE_ID,
        type: "INVOICE",
        number: "RE-1",
        status: "DRAFT",
        addressId: ADDRESS_ID,
      })
      // Mock for addPosition -> findFirst (doc check), findFirst (maxSort), create, findMany (recalculate), updateMany
      ;(prisma.billingDocument.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: INVOICE_ID,
        tenantId: TENANT_ID,
        status: "DRAFT",
        positions: [],
      })
      ;(prisma.billingDocumentPosition.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null)
      ;(prisma.billingDocumentPosition.create as ReturnType<typeof vi.fn>).mockResolvedValue({})
      ;(prisma.billingDocumentPosition.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])
      ;(prisma.billingDocument.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 })

      const result = await service.createInvoice(
        prisma,
        TENANT_ID,
        CASE_ID,
        [{ description: "Arbeitszeit", quantity: 2, unitPrice: 85, vatRate: 19 }],
        USER_ID,
        AUDIT
      )

      expect(prisma.billingDocument.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: "INVOICE",
          }),
        })
      )
    })

    it("links invoice to service case and sets status to INVOICED", async () => {
      const prisma = createMockPrisma()
      ;(prisma.billingServiceCase.findFirst as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(mockClosedCase)
        .mockResolvedValueOnce(mockInvoicedCase)
      ;(prisma.billingServiceCase.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 })
      ;(prisma.crmAddress.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(mockAddress)
      ;(prisma.numberSequence.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({
        prefix: "RE-",
        nextValue: 2,
      })
      ;(prisma.billingDocument.create as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: INVOICE_ID,
        type: "INVOICE",
        number: "RE-1",
      })
      ;(prisma.billingDocument.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: INVOICE_ID,
        tenantId: TENANT_ID,
        status: "DRAFT",
        positions: [],
      })
      ;(prisma.billingDocumentPosition.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null)
      ;(prisma.billingDocumentPosition.create as ReturnType<typeof vi.fn>).mockResolvedValue({})
      ;(prisma.billingDocumentPosition.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])
      ;(prisma.billingDocument.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 })

      await service.createInvoice(
        prisma,
        TENANT_ID,
        CASE_ID,
        [{ description: "Arbeitszeit" }],
        USER_ID,
        AUDIT
      )

      // Verify updateMany was called with invoiceDocumentId and INVOICED status
      const updateCalls = (prisma.billingServiceCase.updateMany as ReturnType<typeof vi.fn>).mock.calls
      const invoicedCall = updateCalls.find(
        (call: Array<Record<string, unknown>>) => {
          const data = (call[0] as Record<string, Record<string, unknown>>)?.data
          return data?.status === "INVOICED" && data?.invoiceDocumentId === INVOICE_ID
        }
      )
      expect(invoicedCall).toBeDefined()
    })

    it("rejects if status is not CLOSED", async () => {
      const prisma = createMockPrisma()
      ;(prisma.billingServiceCase.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(mockServiceCase)

      await expect(
        service.createInvoice(prisma, TENANT_ID, CASE_ID, [{ description: "Test" }], USER_ID, AUDIT)
      ).rejects.toThrow("Invoice can only be created from a CLOSED service case")
    })

    it("rejects if invoice already exists", async () => {
      const prisma = createMockPrisma()
      ;(prisma.billingServiceCase.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...mockClosedCase,
        invoiceDocumentId: INVOICE_ID,
      })

      await expect(
        service.createInvoice(prisma, TENANT_ID, CASE_ID, [{ description: "Test" }], USER_ID, AUDIT)
      ).rejects.toThrow("Service case already has a linked invoice")
    })
  })

  describe("createOrder", () => {
    it("creates Terp Order and links", async () => {
      const prisma = createMockPrisma()
      ;(prisma.billingServiceCase.findFirst as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(mockServiceCase)
        .mockResolvedValueOnce({ ...mockServiceCase, orderId: ORDER_ID })
      ;(prisma.billingServiceCase.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 })
      ;(prisma.crmAddress.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(mockAddress)
      // Mock orderService.create -> repo.findByCode + repo.create + repo.findByIdWithInclude
      ;(prisma.order.findFirst as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(null) // findByCode returns null (no existing)
        .mockResolvedValueOnce({ id: ORDER_ID, code: "KD-1", name: "Heizungsreparatur" }) // findByIdWithInclude
      ;(prisma.order.create as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: ORDER_ID,
        code: "KD-1",
        name: "Heizungsreparatur",
      })

      const result = await service.createOrder(
        prisma,
        TENANT_ID,
        CASE_ID,
        { orderName: "Heizungsreparatur Mustermann" },
        USER_ID
      )

      expect(result?.orderId).toBe(ORDER_ID)
    })

    it("rejects if order already linked", async () => {
      const prisma = createMockPrisma()
      ;(prisma.billingServiceCase.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...mockServiceCase,
        orderId: ORDER_ID,
      })

      await expect(
        service.createOrder(prisma, TENANT_ID, CASE_ID, {}, USER_ID)
      ).rejects.toThrow("Service case already has a linked order")
    })

    it("rejects if status is CLOSED", async () => {
      const prisma = createMockPrisma()
      ;(prisma.billingServiceCase.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(mockClosedCase)

      await expect(
        service.createOrder(prisma, TENANT_ID, CASE_ID, {}, USER_ID)
      ).rejects.toThrow("Service case cannot be modified in status CLOSED")
    })
  })

  describe("remove", () => {
    it("deletes OPEN service case", async () => {
      const prisma = createMockPrisma()
      ;(prisma.billingServiceCase.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(mockServiceCase)
      ;(prisma.billingServiceCase.deleteMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 })

      await service.remove(prisma, TENANT_ID, CASE_ID)
      expect(prisma.billingServiceCase.deleteMany).toHaveBeenCalledWith({
        where: { id: CASE_ID, tenantId: TENANT_ID },
      })
    })

    it("rejects when CLOSED", async () => {
      const prisma = createMockPrisma()
      ;(prisma.billingServiceCase.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(mockClosedCase)

      await expect(
        service.remove(prisma, TENANT_ID, CASE_ID)
      ).rejects.toThrow("Service case cannot be modified in status CLOSED")
    })

    it("rejects when has linked invoice", async () => {
      const prisma = createMockPrisma()
      ;(prisma.billingServiceCase.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...mockInProgressCase,
        invoiceDocumentId: INVOICE_ID,
      })

      await expect(
        service.remove(prisma, TENANT_ID, CASE_ID)
      ).rejects.toThrow("Cannot delete service case with linked invoice")
    })
  })
})
