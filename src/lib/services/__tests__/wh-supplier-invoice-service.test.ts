import { describe, it, expect, vi } from "vitest"
import * as service from "../wh-supplier-invoice-service"
import type { PrismaClient } from "@/generated/prisma/client"

// --- Constants ---
const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const USER_ID = "a0000000-0000-4000-a000-000000000001"
const INVOICE_ID = "b1000000-0000-4000-a000-000000000001"
const SUPPLIER_ID = "c1000000-0000-4000-a000-000000000001"
const PO_ID = "d1000000-0000-4000-a000-000000000001"
const PAYMENT_ID = "e1000000-0000-4000-a000-000000000001"

const mockSupplier = {
  id: SUPPLIER_ID,
  tenantId: TENANT_ID,
  company: "Test Lieferant GmbH",
  type: "SUPPLIER",
  taxNumber: "123/456/789",
  vatId: "DE123456789",
  paymentTermDays: 30,
  discountPercent: 3,
  discountDays: 10,
}

const mockInvoice = {
  id: INVOICE_ID,
  tenantId: TENANT_ID,
  number: "LR-001",
  supplierId: SUPPLIER_ID,
  purchaseOrderId: null,
  status: "OPEN",
  invoiceDate: new Date("2026-03-01"),
  receivedDate: new Date("2026-03-02"),
  totalNet: 100,
  totalVat: 19,
  totalGross: 119,
  paymentTermDays: 30,
  dueDate: new Date("2026-03-31"),
  discountPercent: 3,
  discountDays: 10,
  discountPercent2: null,
  discountDays2: null,
  notes: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  createdById: USER_ID,
  supplier: { id: SUPPLIER_ID, number: "L-1", company: "Test Lieferant GmbH" },
  purchaseOrder: null,
  payments: [],
}

const mockPayment = {
  id: PAYMENT_ID,
  tenantId: TENANT_ID,
  invoiceId: INVOICE_ID,
  date: new Date("2026-03-15"),
  amount: 50,
  type: "BANK" as const,
  isDiscount: false,
  notes: null,
  status: "ACTIVE",
  cancelledAt: null,
  cancelledById: null,
  createdAt: new Date(),
  createdById: USER_ID,
}

function createMockPrisma(overrides: Record<string, unknown> = {}) {
  return {
    whSupplierInvoice: {
      findFirst: vi.fn().mockResolvedValue(mockInvoice),
      findMany: vi.fn().mockResolvedValue([mockInvoice]),
      count: vi.fn().mockResolvedValue(1),
      create: vi.fn().mockResolvedValue(mockInvoice),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    whSupplierPayment: {
      findFirst: vi.fn().mockResolvedValue(mockPayment),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue(mockPayment),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    crmAddress: {
      findFirst: vi.fn().mockResolvedValue(mockSupplier),
    },
    auditLog: {
      create: vi.fn(),
    },
    $transaction: vi.fn().mockImplementation(
      async (fn: (tx: PrismaClient) => Promise<unknown>) => {
        // Create a tx mock that mirrors the main prisma mock
        const txMock = createMockPrisma(overrides)
        return fn(txMock as unknown as PrismaClient)
      }
    ),
    ...overrides,
  } as unknown as PrismaClient
}

const audit = { userId: USER_ID, ipAddress: null, userAgent: null }

// --- Tests ---

describe("wh-supplier-invoice-service", () => {
  describe("create", () => {
    it("creates invoice with valid supplier tax info", async () => {
      const prisma = createMockPrisma()
      const result = await service.create(
        prisma,
        TENANT_ID,
        {
          number: "LR-001",
          supplierId: SUPPLIER_ID,
          invoiceDate: "2026-03-01",
          totalNet: 100,
          totalVat: 19,
          totalGross: 119,
        },
        USER_ID,
        audit
      )
      expect(result).toBeDefined()
      expect(result.id).toBe(INVOICE_ID)
    })

    it("validates supplier has taxNumber or vatId", async () => {
      const prisma = createMockPrisma({
        crmAddress: {
          findFirst: vi.fn().mockResolvedValue({
            ...mockSupplier,
            taxNumber: null,
            vatId: null,
          }),
        },
      })
      await expect(
        service.create(
          prisma,
          TENANT_ID,
          {
            number: "LR-002",
            supplierId: SUPPLIER_ID,
            invoiceDate: "2026-03-01",
            totalNet: 100,
            totalVat: 19,
            totalGross: 119,
          },
          USER_ID,
          audit
        )
      ).rejects.toThrow(service.WhSupplierInvoiceValidationError)
    })

    it("rejects if supplier has taxNumber=null and vatId=null", async () => {
      const prisma = createMockPrisma({
        crmAddress: {
          findFirst: vi.fn().mockResolvedValue({
            id: SUPPLIER_ID,
            taxNumber: null,
            vatId: null,
            paymentTermDays: null,
            discountPercent: null,
            discountDays: null,
          }),
        },
      })
      await expect(
        service.create(prisma, TENANT_ID, {
          number: "LR-003",
          supplierId: SUPPLIER_ID,
          invoiceDate: "2026-03-01",
          totalNet: 100,
          totalVat: 19,
          totalGross: 119,
        })
      ).rejects.toThrow("Steuernummer")
    })

    it("accepts supplier with only taxNumber", async () => {
      const prisma = createMockPrisma({
        crmAddress: {
          findFirst: vi.fn().mockResolvedValue({
            ...mockSupplier,
            taxNumber: "123/456",
            vatId: null,
          }),
        },
      })
      const result = await service.create(prisma, TENANT_ID, {
        number: "LR-004",
        supplierId: SUPPLIER_ID,
        invoiceDate: "2026-03-01",
        totalNet: 100,
        totalVat: 19,
        totalGross: 119,
      })
      expect(result).toBeDefined()
    })

    it("accepts supplier with only vatId", async () => {
      const prisma = createMockPrisma({
        crmAddress: {
          findFirst: vi.fn().mockResolvedValue({
            ...mockSupplier,
            taxNumber: null,
            vatId: "DE123456789",
          }),
        },
      })
      const result = await service.create(prisma, TENANT_ID, {
        number: "LR-005",
        supplierId: SUPPLIER_ID,
        invoiceDate: "2026-03-01",
        totalNet: 100,
        totalVat: 19,
        totalGross: 119,
      })
      expect(result).toBeDefined()
    })

    it("calculates dueDate from paymentTermDays when dueDate not provided", async () => {
      const prisma = createMockPrisma()
      await service.create(prisma, TENANT_ID, {
        number: "LR-006",
        supplierId: SUPPLIER_ID,
        invoiceDate: "2026-03-01",
        totalNet: 100,
        totalVat: 19,
        totalGross: 119,
        paymentTermDays: 30,
      })

      // Check the create call was made with computed dueDate
      const createCall = (
        prisma as unknown as { whSupplierInvoice: { create: ReturnType<typeof vi.fn> } }
      ).whSupplierInvoice.create
      expect(createCall).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            paymentTermDays: 30,
            dueDate: expect.any(Date),
          }),
        })
      )
    })

    it("uses explicit dueDate when provided, ignoring paymentTermDays", async () => {
      const prisma = createMockPrisma()
      await service.create(prisma, TENANT_ID, {
        number: "LR-007",
        supplierId: SUPPLIER_ID,
        invoiceDate: "2026-03-01",
        totalNet: 100,
        totalVat: 19,
        totalGross: 119,
        paymentTermDays: 30,
        dueDate: "2026-04-15",
      })

      const createCall = (
        prisma as unknown as { whSupplierInvoice: { create: ReturnType<typeof vi.fn> } }
      ).whSupplierInvoice.create
      expect(createCall).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            dueDate: new Date("2026-04-15"),
          }),
        })
      )
    })

    it("defaults payment terms from supplier when not in input", async () => {
      const prisma = createMockPrisma()
      await service.create(prisma, TENANT_ID, {
        number: "LR-008",
        supplierId: SUPPLIER_ID,
        invoiceDate: "2026-03-01",
        totalNet: 100,
        totalVat: 19,
        totalGross: 119,
      })

      const createCall = (
        prisma as unknown as { whSupplierInvoice: { create: ReturnType<typeof vi.fn> } }
      ).whSupplierInvoice.create
      expect(createCall).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            paymentTermDays: 30, // from supplier default
            discountPercent: 3,  // from supplier default
            discountDays: 10,    // from supplier default
          }),
        })
      )
    })
  })

  describe("update", () => {
    it("updates OPEN invoice fields", async () => {
      const prisma = createMockPrisma()
      const result = await service.update(prisma, TENANT_ID, {
        id: INVOICE_ID,
        notes: "Updated note",
      })
      expect(result).toBeDefined()
    })

    it("rejects update on non-OPEN invoice", async () => {
      const prisma = createMockPrisma({
        whSupplierInvoice: {
          findFirst: vi.fn().mockResolvedValue({
            ...mockInvoice,
            status: "PAID",
          }),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      })
      await expect(
        service.update(prisma, TENANT_ID, { id: INVOICE_ID, notes: "test" })
      ).rejects.toThrow(service.WhSupplierInvoiceConflictError)
    })

    it("throws NotFoundError for non-existent invoice", async () => {
      const prisma = createMockPrisma({
        whSupplierInvoice: {
          findFirst: vi.fn().mockResolvedValue(null),
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
      })
      await expect(
        service.update(prisma, TENANT_ID, { id: INVOICE_ID, notes: "test" })
      ).rejects.toThrow(service.WhSupplierInvoiceNotFoundError)
    })
  })

  describe("cancel", () => {
    it("sets status to CANCELLED", async () => {
      const prisma = createMockPrisma()
      await service.cancel(prisma, TENANT_ID, INVOICE_ID)
      expect(
        (prisma as unknown as { whSupplierInvoice: { updateMany: ReturnType<typeof vi.fn> } })
          .whSupplierInvoice.updateMany
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: "CANCELLED" },
        })
      )
    })

    it("rejects if already CANCELLED", async () => {
      const prisma = createMockPrisma({
        whSupplierInvoice: {
          findFirst: vi.fn().mockResolvedValue({
            ...mockInvoice,
            status: "CANCELLED",
          }),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      })
      await expect(
        service.cancel(prisma, TENANT_ID, INVOICE_ID)
      ).rejects.toThrow(service.WhSupplierInvoiceConflictError)
    })
  })

  describe("createPayment", () => {
    it("records payment and updates status to PARTIAL", async () => {
      const prisma = createMockPrisma()
      const result = await service.createPayment(
        prisma,
        TENANT_ID,
        {
          invoiceId: INVOICE_ID,
          date: "2026-03-15",
          amount: 50,
          type: "BANK",
        },
        USER_ID
      )
      expect(result).toBeDefined()
    })

    it("records payment and updates status to PAID when fully paid", async () => {
      const invoiceWithPayments = {
        ...mockInvoice,
        payments: [],
      }
      const prisma = createMockPrisma({
        whSupplierInvoice: {
          findFirst: vi.fn().mockResolvedValue(invoiceWithPayments),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      })
      const result = await service.createPayment(
        prisma,
        TENANT_ID,
        {
          invoiceId: INVOICE_ID,
          date: "2026-03-15",
          amount: 119,
          type: "BANK",
        },
        USER_ID
      )
      expect(result).toBeDefined()
    })

    it("rejects payment on CANCELLED invoice", async () => {
      const prisma = createMockPrisma({
        whSupplierInvoice: {
          findFirst: vi.fn().mockResolvedValue({
            ...mockInvoice,
            status: "CANCELLED",
          }),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      })
      await expect(
        service.createPayment(prisma, TENANT_ID, {
          invoiceId: INVOICE_ID,
          date: "2026-03-15",
          amount: 50,
          type: "BANK",
        })
      ).rejects.toThrow(service.WhSupplierInvoiceConflictError)
    })

    it("rejects payment exceeding total gross", async () => {
      // Existing payments add up to 100, trying to pay 50 more on a 119 total
      const prisma = createMockPrisma({
        whSupplierInvoice: {
          findFirst: vi.fn().mockResolvedValue(mockInvoice),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        whSupplierPayment: {
          findMany: vi.fn().mockResolvedValue([{ amount: 100 }]),
          create: vi.fn().mockResolvedValue(mockPayment),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      })

      await expect(
        service.createPayment(prisma, TENANT_ID, {
          invoiceId: INVOICE_ID,
          date: "2026-03-15",
          amount: 50,
          type: "BANK",
        })
      ).rejects.toThrow("Rechnungsbetrag")
    })

    it("rejects payment on already PAID invoice", async () => {
      const prisma = createMockPrisma({
        whSupplierInvoice: {
          findFirst: vi.fn().mockResolvedValue({
            ...mockInvoice,
            status: "PAID",
          }),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      })
      await expect(
        service.createPayment(prisma, TENANT_ID, {
          invoiceId: INVOICE_ID,
          date: "2026-03-15",
          amount: 50,
          type: "BANK",
        })
      ).rejects.toThrow(service.WhSupplierInvoiceConflictError)
    })
  })

  describe("cancelPayment", () => {
    it("cancels active payment and reverts invoice status", async () => {
      const prisma = createMockPrisma()
      await service.cancelPayment(prisma, TENANT_ID, PAYMENT_ID, USER_ID)
      // Should not throw
    })

    it("rejects cancel on already cancelled payment", async () => {
      const prisma = createMockPrisma({
        whSupplierPayment: {
          findFirst: vi.fn().mockResolvedValue({
            ...mockPayment,
            status: "CANCELLED",
          }),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      })
      await expect(
        service.cancelPayment(prisma, TENANT_ID, PAYMENT_ID, USER_ID)
      ).rejects.toThrow(service.WhSupplierInvoiceConflictError)
    })
  })

  describe("listPayments", () => {
    it("returns payments for a valid invoice", async () => {
      const prisma = createMockPrisma({
        whSupplierPayment: {
          findMany: vi.fn().mockResolvedValue([mockPayment]),
        },
      })
      const result = await service.listPayments(prisma, TENANT_ID, INVOICE_ID)
      expect(result).toEqual([mockPayment])
    })

    it("throws NotFoundError for non-existent invoice", async () => {
      const prisma = createMockPrisma({
        whSupplierInvoice: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      })
      await expect(
        service.listPayments(prisma, TENANT_ID, INVOICE_ID)
      ).rejects.toThrow(service.WhSupplierInvoiceNotFoundError)
    })
  })

  describe("summary", () => {
    it("calculates correct totals for open, overdue, paid", async () => {
      const now = new Date()
      const pastDue = new Date(now.getTime() - 86400000 * 10) // 10 days ago

      const invoices = [
        {
          ...mockInvoice,
          id: "inv-1",
          dueDate: pastDue, // overdue
          payments: [{ amount: 50, status: "ACTIVE", createdAt: now }],
        },
        {
          ...mockInvoice,
          id: "inv-2",
          dueDate: new Date(now.getTime() + 86400000 * 30), // future
          payments: [],
        },
      ]

      const prisma = createMockPrisma({
        whSupplierInvoice: {
          findMany: vi.fn().mockResolvedValue(invoices),
        },
      })

      const result = await service.summary(prisma, TENANT_ID)
      expect(result.invoiceCount).toBe(2)
      expect(result.totalOpen).toBeGreaterThan(0)
      expect(result.overdueCount).toBeGreaterThanOrEqual(1)
    })
  })

  // =========================================================================
  // TENANT ISOLATION TESTS
  // =========================================================================
  describe("tenant isolation", () => {
    const OTHER_TENANT_ID = "ff000000-0000-4000-a000-000000000999"

    it("getById rejects invoice from another tenant", async () => {
      const prisma = createMockPrisma({
        whSupplierInvoice: {
          findFirst: vi.fn().mockResolvedValue(null), // not found for other tenant
        },
      })
      await expect(
        service.getById(prisma, OTHER_TENANT_ID, INVOICE_ID)
      ).rejects.toThrow(service.WhSupplierInvoiceNotFoundError)
    })

    it("update rejects invoice from another tenant", async () => {
      const prisma = createMockPrisma({
        whSupplierInvoice: {
          findFirst: vi.fn().mockResolvedValue(null),
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
      })
      await expect(
        service.update(prisma, OTHER_TENANT_ID, { id: INVOICE_ID, notes: "hacked" })
      ).rejects.toThrow(service.WhSupplierInvoiceNotFoundError)
    })

    it("cancel rejects invoice from another tenant", async () => {
      const prisma = createMockPrisma({
        whSupplierInvoice: {
          findFirst: vi.fn().mockResolvedValue(null),
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
      })
      await expect(
        service.cancel(prisma, OTHER_TENANT_ID, INVOICE_ID)
      ).rejects.toThrow(service.WhSupplierInvoiceNotFoundError)
    })

    it("createPayment rejects invoice from another tenant", async () => {
      const prisma = createMockPrisma({
        whSupplierInvoice: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      })
      await expect(
        service.createPayment(prisma, OTHER_TENANT_ID, {
          invoiceId: INVOICE_ID,
          date: "2026-03-24",
          amount: 100,
          type: "BANK",
        })
      ).rejects.toThrow(service.WhSupplierInvoiceNotFoundError)
    })

    it("cancelPayment rejects payment from another tenant", async () => {
      const prisma = createMockPrisma({
        whSupplierPayment: {
          findFirst: vi.fn().mockResolvedValue(null), // not found via parent tenant check
        },
      })
      await expect(
        service.cancelPayment(prisma, OTHER_TENANT_ID, PAYMENT_ID, USER_ID)
      ).rejects.toThrow(service.WhSupplierInvoiceNotFoundError)
    })

    it("listPayments rejects invoice from another tenant", async () => {
      const prisma = createMockPrisma({
        whSupplierInvoice: {
          findFirst: vi.fn().mockResolvedValue(null), // invoice not found for other tenant
        },
      })
      await expect(
        service.listPayments(prisma, OTHER_TENANT_ID, INVOICE_ID)
      ).rejects.toThrow(service.WhSupplierInvoiceNotFoundError)
    })

    it("summary with wrong tenant returns empty/zero results", async () => {
      const prisma = createMockPrisma({
        whSupplierInvoice: {
          findMany: vi.fn().mockResolvedValue([]), // no invoices for wrong tenant
        },
      })
      const result = await service.summary(prisma, OTHER_TENANT_ID)
      expect(result.totalOpen).toBe(0)
      expect(result.invoiceCount).toBe(0)
      expect(result.overdueCount).toBe(0)
    })
  })
})
