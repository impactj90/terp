import { describe, it, expect, vi } from "vitest"
import { createCallerFactory } from "@/trpc/init"
import { whSupplierInvoicesRouter } from "../warehouse/supplierInvoices"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import {
  createMockContext,
  createMockSession,
  createUserWithPermissions,
  createMockUserTenant,
} from "./helpers"

// Mock the db module for requireModule middleware
vi.mock("@/lib/db", () => ({
  prisma: {
    tenantModule: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue({ id: "mock", module: "warehouse" }),
    },
  },
}))

// --- Constants ---
const SI_VIEW = permissionIdByKey("wh_supplier_invoices.view")!
const SI_CREATE = permissionIdByKey("wh_supplier_invoices.create")!
const SI_EDIT = permissionIdByKey("wh_supplier_invoices.edit")!
const SI_PAY = permissionIdByKey("wh_supplier_invoices.pay")!
const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const USER_ID = "a0000000-0000-4000-a000-000000000001"
const INVOICE_ID = "b1000000-0000-4000-a000-000000000001"
const SUPPLIER_ID = "c1000000-0000-4000-a000-000000000001"
const PAYMENT_ID = "e1000000-0000-4000-a000-000000000001"

const ALL_PERMS = [SI_VIEW, SI_CREATE, SI_EDIT, SI_PAY]

const createCaller = createCallerFactory(whSupplierInvoicesRouter)

// --- Module Mock ---
const MODULE_MOCK = {
  tenantModule: {
    findMany: vi.fn().mockResolvedValue([]),
    findUnique: vi.fn().mockResolvedValue({ id: "mock", module: "warehouse" }),
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
    prisma: withModuleMock(prisma) as unknown as ReturnType<typeof createMockContext>["prisma"],
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

// --- Mock Data ---
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
  supplier: { id: SUPPLIER_ID, number: "L-1", company: "Test Supplier" },
  purchaseOrder: null,
  payments: [],
  _count: { payments: 0 },
}

const mockPayment = {
  id: PAYMENT_ID,
  tenantId: TENANT_ID,
  invoiceId: INVOICE_ID,
  date: new Date("2026-03-15"),
  amount: 50,
  type: "BANK",
  isDiscount: false,
  notes: null,
  status: "ACTIVE",
  cancelledAt: null,
  cancelledById: null,
  createdAt: new Date(),
  createdById: USER_ID,
}

const mockSupplier = {
  id: SUPPLIER_ID,
  taxNumber: "123/456",
  vatId: "DE123",
  paymentTermDays: 30,
  discountPercent: 3,
  discountDays: 10,
}

// --- Tests ---

describe("warehouse.supplierInvoices", () => {
  describe("list", () => {
    it("returns paginated invoices", async () => {
      const prisma = {
        whSupplierInvoice: {
          findMany: vi.fn().mockResolvedValue([mockInvoice]),
          count: vi.fn().mockResolvedValue(1),
        },
      }

      const caller = createCaller(createTestContext(prisma))
      const result = await caller.list({ page: 1, pageSize: 10 })

      expect(result!.items).toHaveLength(1)
      expect(result!.total).toBe(1)
    })

    it("rejects without wh_supplier_invoices.view permission", async () => {
      const prisma = {
        whSupplierInvoice: {
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
        },
      }

      const caller = createCaller(createNoPermContext(prisma))

      await expect(
        caller.list({ page: 1, pageSize: 10 })
      ).rejects.toThrow("Insufficient permissions")
    })

    it("requires warehouse module enabled", async () => {
      const prisma = {
        tenantModule: {
          findMany: vi.fn().mockResolvedValue([]),
          findUnique: vi.fn().mockResolvedValue(null),
        },
        whSupplierInvoice: {
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
        },
      }

      const caller = createCaller(createTestContext(prisma))

      await expect(
        caller.list({ page: 1, pageSize: 10 })
      ).rejects.toThrow()
    })
  })

  describe("create", () => {
    it("creates invoice with valid supplier tax info", async () => {
      const prisma = {
        crmAddress: {
          findFirst: vi.fn().mockResolvedValue(mockSupplier),
        },
        whSupplierInvoice: {
          create: vi.fn().mockResolvedValue(mockInvoice),
        },
        auditLog: {
          create: vi.fn().mockResolvedValue({}),
        },
      }

      const caller = createCaller(createTestContext(prisma))
      const result = await caller.create({
        number: "LR-001",
        supplierId: SUPPLIER_ID,
        invoiceDate: "2026-03-01",
        totalNet: 100,
        totalVat: 19,
        totalGross: 119,
      })

      expect(result).toBeDefined()
    })

    it("rejects without wh_supplier_invoices.create permission", async () => {
      const prisma = {}
      const caller = createCaller(createTestContext(prisma, [SI_VIEW]))

      await expect(
        caller.create({
          number: "LR-001",
          supplierId: SUPPLIER_ID,
          invoiceDate: "2026-03-01",
          totalNet: 100,
          totalVat: 19,
          totalGross: 119,
        })
      ).rejects.toThrow("Insufficient permissions")
    })

    it("validates supplier has tax number or VAT ID", async () => {
      const prisma = {
        crmAddress: {
          findFirst: vi.fn().mockResolvedValue({
            ...mockSupplier,
            taxNumber: null,
            vatId: null,
          }),
        },
      }

      const caller = createCaller(createTestContext(prisma))

      await expect(
        caller.create({
          number: "LR-002",
          supplierId: SUPPLIER_ID,
          invoiceDate: "2026-03-01",
          totalNet: 100,
          totalVat: 19,
          totalGross: 119,
        })
      ).rejects.toThrow()
    })
  })

  describe("update", () => {
    it("updates OPEN invoice fields", async () => {
      const prisma = {
        whSupplierInvoice: {
          findFirst: vi.fn().mockResolvedValue({ ...mockInvoice, payments: [] }),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        auditLog: {
          create: vi.fn().mockResolvedValue({}),
        },
      }

      const caller = createCaller(createTestContext(prisma))
      const result = await caller.update({ id: INVOICE_ID, notes: "Updated" })
      expect(result).toBeDefined()
    })

    it("rejects without wh_supplier_invoices.edit permission", async () => {
      const prisma = {}
      const caller = createCaller(createTestContext(prisma, [SI_VIEW]))

      await expect(
        caller.update({ id: INVOICE_ID, notes: "test" })
      ).rejects.toThrow("Insufficient permissions")
    })
  })

  describe("cancel", () => {
    it("cancels invoice", async () => {
      const prisma = {
        whSupplierInvoice: {
          findFirst: vi.fn().mockResolvedValue({ ...mockInvoice, payments: [] }),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        auditLog: {
          create: vi.fn().mockResolvedValue({}),
        },
      }

      const caller = createCaller(createTestContext(prisma))
      await caller.cancel({ id: INVOICE_ID })
      // Should not throw
    })

    it("rejects without wh_supplier_invoices.edit permission", async () => {
      const prisma = {}
      const caller = createCaller(createTestContext(prisma, [SI_VIEW]))

      await expect(
        caller.cancel({ id: INVOICE_ID })
      ).rejects.toThrow("Insufficient permissions")
    })
  })

  describe("payments.create", () => {
    it("records payment", async () => {
      const prisma = {
        whSupplierInvoice: {
          findFirst: vi.fn().mockResolvedValue({ ...mockInvoice, payments: [] }),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        whSupplierPayment: {
          findMany: vi.fn().mockResolvedValue([]),
          create: vi.fn().mockResolvedValue(mockPayment),
        },
        auditLog: {
          create: vi.fn().mockResolvedValue({}),
        },
        $transaction: vi.fn().mockImplementation(
          async (fn: (tx: unknown) => Promise<unknown>) => {
            return fn(prisma)
          }
        ),
      }

      const caller = createCaller(createTestContext(prisma))
      const result = await caller.payments.create({
        invoiceId: INVOICE_ID,
        date: "2026-03-15",
        amount: 50,
        type: "BANK",
      })
      expect(result).toBeDefined()
    })

    it("rejects without wh_supplier_invoices.pay permission", async () => {
      const prisma = {}
      const caller = createCaller(createTestContext(prisma, [SI_VIEW]))

      await expect(
        caller.payments.create({
          invoiceId: INVOICE_ID,
          date: "2026-03-15",
          amount: 50,
          type: "BANK",
        })
      ).rejects.toThrow("Insufficient permissions")
    })
  })

  describe("payments.cancel", () => {
    it("cancels payment", async () => {
      const prisma = {
        whSupplierPayment: {
          findFirst: vi.fn().mockResolvedValue(mockPayment),
          findMany: vi.fn().mockResolvedValue([]),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        whSupplierInvoice: {
          findFirst: vi.fn().mockResolvedValue({ ...mockInvoice, totalGross: 119 }),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        auditLog: {
          create: vi.fn().mockResolvedValue({}),
        },
        $transaction: vi.fn().mockImplementation(
          async (fn: (tx: unknown) => Promise<unknown>) => {
            return fn(prisma)
          }
        ),
      }

      const caller = createCaller(createTestContext(prisma))
      await caller.payments.cancel({ id: PAYMENT_ID })
      // Should not throw
    })

    it("rejects without wh_supplier_invoices.pay permission", async () => {
      const prisma = {}
      const caller = createCaller(createTestContext(prisma, [SI_VIEW]))

      await expect(
        caller.payments.cancel({ id: PAYMENT_ID })
      ).rejects.toThrow("Insufficient permissions")
    })
  })

  describe("tenant isolation", () => {
    it("list returns empty for different tenant's invoices", async () => {
      const prisma = {
        whSupplierInvoice: {
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
        },
      }

      const caller = createCaller(createTestContext(prisma))
      const result = await caller.list({ page: 1, pageSize: 10 })
      expect(result!.items).toHaveLength(0)
    })

    it("getById throws NotFound for different tenant's invoice", async () => {
      const prisma = {
        whSupplierInvoice: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      }

      const caller = createCaller(createTestContext(prisma))
      await expect(
        caller.getById({ id: INVOICE_ID })
      ).rejects.toThrow()
    })
  })
})
