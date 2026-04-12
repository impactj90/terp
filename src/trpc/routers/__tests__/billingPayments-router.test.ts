import { describe, it, expect, vi } from "vitest"
import { createCallerFactory } from "@/trpc/init"
import { billingPaymentsRouter } from "../billing/payments"
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

const PAY_VIEW = permissionIdByKey("billing_payments.view")!
const PAY_CREATE = permissionIdByKey("billing_payments.create")!
const PAY_CANCEL = permissionIdByKey("billing_payments.cancel")!
const ALL_PERMS = [PAY_VIEW, PAY_CREATE, PAY_CANCEL]

const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const USER_ID = "a0000000-0000-4000-a000-000000000001"
const DOC_ID = "d0000000-0000-4000-a000-000000000010"
const PAYMENT_ID = "e0000000-0000-4000-a000-000000000001"

const createCaller = createCallerFactory(billingPaymentsRouter)

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

const mockInvoice = {
  id: DOC_ID,
  tenantId: TENANT_ID,
  number: "RE-1",
  type: "INVOICE",
  status: "PRINTED",
  totalGross: 1190,
  documentDate: new Date("2026-01-01"),
  paymentTermDays: 30,
  payments: [],
  childDocuments: [],
  address: { id: "addr1", company: "Test GmbH" },
  contact: null,
}

const mockPayment = {
  id: PAYMENT_ID,
  tenantId: TENANT_ID,
  documentId: DOC_ID,
  date: new Date("2026-01-05"),
  amount: 500,
  type: "BANK",
  status: "ACTIVE",
  isDiscount: false,
  notes: null,
  document: mockInvoice,
}

// --- openItems.list ---
describe("billing.payments.openItems.list", () => {
  it("returns paginated open items", async () => {
    const prisma = {
      billingDocument: {
        findMany: vi.fn().mockResolvedValue([mockInvoice]),
        count: vi.fn().mockResolvedValue(1),
      },
    }
    const caller = createCaller(createTestContext(prisma))
    const result = await caller.openItems.list({ page: 1, pageSize: 25 })
    expect(result.items).toHaveLength(1)
    expect(result.total).toBe(1)
  })

  it("requires billing_payments.view permission", async () => {
    const prisma = {
      billingDocument: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
    }
    const caller = createCaller(createNoPermContext(prisma))
    await expect(
      caller.openItems.list({ page: 1, pageSize: 25 })
    ).rejects.toThrow("Insufficient permissions")
  })
})

// --- openItems.getById ---
describe("billing.payments.openItems.getById", () => {
  it("returns single open item with payments", async () => {
    const prisma = {
      billingDocument: {
        findFirst: vi.fn().mockResolvedValue(mockInvoice),
      },
    }
    const caller = createCaller(createTestContext(prisma))
    const result = await caller.openItems.getById({ documentId: DOC_ID })
    expect(result.id).toBe(DOC_ID)
    expect(result.paymentStatus).toBe("UNPAID")
  })

  it("requires billing_payments.view permission", async () => {
    const prisma = {}
    const caller = createCaller(createNoPermContext(prisma))
    await expect(
      caller.openItems.getById({ documentId: DOC_ID })
    ).rejects.toThrow("Insufficient permissions")
  })
})

// --- openItems.summary ---
describe("billing.payments.openItems.summary", () => {
  it("returns summary statistics", async () => {
    const prisma = {
      billingDocument: {
        findMany: vi.fn().mockResolvedValue([mockInvoice]),
      },
    }
    const caller = createCaller(createTestContext(prisma))
    const result = await caller.openItems.summary({})
    expect(result.countOpen).toBe(1)
    expect(result.totalOpen).toBe(1190)
  })
})

// --- payments.create ---
describe("billing.payments.create", () => {
  it("records payment and returns result", async () => {
    const prisma = {
      billingDocument: {
        findFirst: vi.fn().mockResolvedValue(mockInvoice),
      },
      billingPayment: {
        create: vi.fn().mockResolvedValue(mockPayment),
      },
    }
    const caller = createCaller(createTestContext(prisma))
    const result = await caller.create({
      documentId: DOC_ID,
      date: new Date("2026-01-05"),
      amount: 500,
      type: "BANK",
    })
    expect(result?.amount).toBe(500)
  })

  it("requires billing_payments.create permission", async () => {
    const prisma = {}
    const caller = createCaller(createTestContext(prisma, [PAY_VIEW]))
    await expect(
      caller.create({
        documentId: DOC_ID,
        date: new Date("2026-01-05"),
        amount: 500,
        type: "BANK",
      })
    ).rejects.toThrow("Insufficient permissions")
  })

  it("validates documentId is UUID", async () => {
    const prisma = {}
    const caller = createCaller(createTestContext(prisma))
    await expect(
      caller.create({
        documentId: "not-a-uuid",
        date: new Date(),
        amount: 100,
        type: "CASH",
      })
    ).rejects.toThrow()
  })

  it("validates amount is positive", async () => {
    const prisma = {}
    const caller = createCaller(createTestContext(prisma))
    await expect(
      caller.create({
        documentId: DOC_ID,
        date: new Date(),
        amount: -100,
        type: "CASH",
      })
    ).rejects.toThrow()
  })
})

// --- payments.cancel ---
describe("billing.payments.cancel", () => {
  it("cancels payment and returns result", async () => {
    const cancelledPayment = { ...mockPayment, status: "CANCELLED" }
    const prisma = {
      billingPayment: {
        findFirst: vi.fn()
          .mockResolvedValueOnce(mockPayment)
          .mockResolvedValueOnce(cancelledPayment),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    }
    const caller = createCaller(createTestContext(prisma))
    const result = await caller.cancel({ id: PAYMENT_ID })
    expect(result?.status).toBe("CANCELLED")
  })

  it("requires billing_payments.cancel permission", async () => {
    const prisma = {}
    const caller = createCaller(createTestContext(prisma, [PAY_VIEW]))
    await expect(
      caller.cancel({ id: PAYMENT_ID })
    ).rejects.toThrow("Insufficient permissions")
  })
})

// --- payments.list ---
describe("billing.payments.list", () => {
  it("returns payments for document", async () => {
    const prisma = {
      billingPayment: {
        findMany: vi.fn().mockResolvedValue([mockPayment]),
      },
    }
    const caller = createCaller(createTestContext(prisma))
    const result = await caller.list({ documentId: DOC_ID })
    expect(result).toHaveLength(1)
  })

  it("requires billing_payments.view permission", async () => {
    const prisma = {}
    const caller = createCaller(createNoPermContext(prisma))
    await expect(
      caller.list({ documentId: DOC_ID })
    ).rejects.toThrow("Insufficient permissions")
  })
})
