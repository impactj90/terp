import { describe, it, expect, vi } from "vitest"
import {
  computePaymentStatus,
  computeDueDate,
  isOverdue,
  getApplicableDiscount,
  createPayment,
  cancelPayment,
  listOpenItems,
  getOpenItemById,
  getOpenItemsSummary,
  BillingPaymentNotFoundError,
  BillingPaymentValidationError,
} from "../billing-payment-service"

// --- Helper: mock Prisma ---
function mockPrisma(overrides: Record<string, unknown> = {}) {
  const prisma = {
    $transaction: vi.fn(),
    ...overrides,
  } as unknown as Parameters<typeof createPayment>[0]
  ;(prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
    (fnOrArr: unknown) => {
      if (typeof fnOrArr === "function") return (fnOrArr as (tx: unknown) => unknown)(prisma)
      return Promise.all(fnOrArr as unknown[])
    }
  )
  return prisma
}

// --- computePaymentStatus ---
describe("computePaymentStatus", () => {
  it("returns UNPAID when paidAmount is 0", () => {
    expect(computePaymentStatus(1000, 0)).toBe("UNPAID")
  })

  it("returns UNPAID when paidAmount is negative", () => {
    expect(computePaymentStatus(1000, -10)).toBe("UNPAID")
  })

  it("returns PARTIAL when paidAmount < totalGross", () => {
    expect(computePaymentStatus(1000, 500)).toBe("PARTIAL")
  })

  it("returns PAID when paidAmount equals totalGross", () => {
    expect(computePaymentStatus(1000, 1000)).toBe("PAID")
  })

  it("returns PAID for amounts within tolerance", () => {
    expect(computePaymentStatus(1000, 999.995)).toBe("PAID")
  })

  it("returns OVERPAID when paidAmount > totalGross", () => {
    expect(computePaymentStatus(1000, 1100)).toBe("OVERPAID")
  })
})

// --- computeDueDate ---
describe("computeDueDate", () => {
  it("returns null when paymentTermDays is null", () => {
    expect(computeDueDate(new Date("2026-01-01"), null)).toBeNull()
  })

  it("returns documentDate + paymentTermDays", () => {
    const result = computeDueDate(new Date("2026-01-01"), 30)
    expect(result).toEqual(new Date("2026-01-31"))
  })

  it("handles paymentTermDays = 0", () => {
    const result = computeDueDate(new Date("2026-03-15"), 0)
    expect(result).toEqual(new Date("2026-03-15"))
  })
})

// --- isOverdue ---
describe("isOverdue", () => {
  it("returns false when dueDate is null", () => {
    expect(isOverdue(null, "UNPAID")).toBe(false)
  })

  it("returns false when dueDate is in the future", () => {
    const future = new Date()
    future.setDate(future.getDate() + 30)
    expect(isOverdue(future, "UNPAID")).toBe(false)
  })

  it("returns true when dueDate is in the past and status is not PAID", () => {
    const past = new Date()
    past.setDate(past.getDate() - 10)
    expect(isOverdue(past, "UNPAID")).toBe(true)
    expect(isOverdue(past, "PARTIAL")).toBe(true)
  })

  it("returns false when status is PAID even if past due", () => {
    const past = new Date()
    past.setDate(past.getDate() - 10)
    expect(isOverdue(past, "PAID")).toBe(false)
  })

  it("returns false when status is OVERPAID even if past due", () => {
    const past = new Date()
    past.setDate(past.getDate() - 10)
    expect(isOverdue(past, "OVERPAID")).toBe(false)
  })

  it("returns false on the due day itself (customer still has the day to pay)", () => {
    // Regression: previously compared at millisecond granularity, so an
    // invoice whose dueDate was created earlier in the day would flip to
    // overdue as soon as the clock ticked past that time — e.g. docDate
    // 14.03 10:00 + 30d = dueDate 13.04 10:00, and at 13.04 14:00 it
    // would be marked overdue even though the customer still has the
    // whole business day to pay.
    const todayEarly = new Date()
    todayEarly.setHours(6, 0, 0, 0)
    expect(isOverdue(todayEarly, "UNPAID")).toBe(false)
    const todayLate = new Date()
    todayLate.setHours(23, 30, 0, 0)
    expect(isOverdue(todayLate, "UNPAID")).toBe(false)
  })

  it("returns true starting the day after the due date", () => {
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    yesterday.setHours(23, 59, 59, 999)
    expect(isOverdue(yesterday, "UNPAID")).toBe(true)
  })
})

// --- getApplicableDiscount ---
describe("getApplicableDiscount", () => {
  const doc = {
    documentDate: new Date("2026-01-01"),
    discountDays: 10,
    discountPercent: 3,
    discountDays2: 20,
    discountPercent2: 2,
  }

  it("returns tier 1 when within discountDays", () => {
    const paymentDate = new Date("2026-01-05") // 4 days after
    const result = getApplicableDiscount(doc, paymentDate)
    expect(result).toEqual({ percent: 3, tier: 1 })
  })

  it("returns tier 1 on exactly discountDays", () => {
    const paymentDate = new Date("2026-01-11") // 10 days after
    const result = getApplicableDiscount(doc, paymentDate)
    expect(result).toEqual({ percent: 3, tier: 1 })
  })

  it("returns tier 2 when past discountDays but within discountDays2", () => {
    const paymentDate = new Date("2026-01-15") // 14 days after
    const result = getApplicableDiscount(doc, paymentDate)
    expect(result).toEqual({ percent: 2, tier: 2 })
  })

  it("returns null when past both discount periods", () => {
    const paymentDate = new Date("2026-02-01") // 31 days after
    const result = getApplicableDiscount(doc, paymentDate)
    expect(result).toBeNull()
  })

  it("returns null when no discount configured", () => {
    const noDiscount = {
      documentDate: new Date("2026-01-01"),
      discountDays: null,
      discountPercent: null,
      discountDays2: null,
      discountPercent2: null,
    }
    const result = getApplicableDiscount(noDiscount, new Date("2026-01-05"))
    expect(result).toBeNull()
  })
})

// --- createPayment ---
describe("createPayment", () => {
  const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
  const DOC_ID = "d0000000-0000-4000-a000-000000000010"
  const USER_ID = "a0000000-0000-4000-a000-000000000001"
  const PAYMENT_ID = "e0000000-0000-4000-a000-000000000001"

  const mockDocument = {
    id: DOC_ID,
    tenantId: TENANT_ID,
    type: "INVOICE",
    status: "PRINTED",
    totalGross: 1190,
    documentDate: new Date("2026-01-01"),
    discountDays: 10,
    discountPercent: 3,
    discountDays2: 20,
    discountPercent2: 2,
    paymentTermDays: 30,
    payments: [] as Array<{ amount: number; status: string }>,
    childDocuments: [] as Array<{ totalGross: number }>,
  }

  const mockPaymentResult = {
    id: PAYMENT_ID,
    tenantId: TENANT_ID,
    documentId: DOC_ID,
    date: new Date("2026-01-05"),
    amount: 500,
    type: "BANK",
    status: "ACTIVE",
    isDiscount: false,
    notes: null,
    document: mockDocument,
  }

  it("records payment and returns created record", async () => {
    const prisma = mockPrisma({
      billingDocument: {
        findFirst: vi.fn().mockResolvedValue(mockDocument),
      },
      billingPayment: {
        create: vi.fn().mockResolvedValue(mockPaymentResult),
      },
    })

    const result = await createPayment(
      prisma,
      TENANT_ID,
      { documentId: DOC_ID, date: new Date("2026-01-05"), amount: 500, type: "BANK" },
      USER_ID
    )
    expect(result.amount).toBe(500)
  })

  it("rejects if document is not INVOICE type", async () => {
    const prisma = mockPrisma({
      billingDocument: {
        findFirst: vi.fn().mockResolvedValue({ ...mockDocument, type: "OFFER" }),
      },
    })

    await expect(
      createPayment(
        prisma,
        TENANT_ID,
        { documentId: DOC_ID, date: new Date(), amount: 100, type: "CASH" },
        USER_ID
      )
    ).rejects.toThrow(BillingPaymentValidationError)
  })

  it("rejects if document status is DRAFT", async () => {
    const prisma = mockPrisma({
      billingDocument: {
        findFirst: vi.fn().mockResolvedValue({ ...mockDocument, status: "DRAFT" }),
      },
    })

    await expect(
      createPayment(
        prisma,
        TENANT_ID,
        { documentId: DOC_ID, date: new Date(), amount: 100, type: "CASH" },
        USER_ID
      )
    ).rejects.toThrow(BillingPaymentValidationError)
  })

  it("rejects if document status is CANCELLED", async () => {
    const prisma = mockPrisma({
      billingDocument: {
        findFirst: vi.fn().mockResolvedValue({ ...mockDocument, status: "CANCELLED" }),
      },
    })

    await expect(
      createPayment(
        prisma,
        TENANT_ID,
        { documentId: DOC_ID, date: new Date(), amount: 100, type: "CASH" },
        USER_ID
      )
    ).rejects.toThrow(BillingPaymentValidationError)
  })

  it("rejects if amount exceeds open amount", async () => {
    const prisma = mockPrisma({
      billingDocument: {
        findFirst: vi.fn().mockResolvedValue({
          ...mockDocument,
          payments: [{ amount: 1000, status: "ACTIVE" }],
        }),
      },
    })

    await expect(
      createPayment(
        prisma,
        TENANT_ID,
        { documentId: DOC_ID, date: new Date(), amount: 500, type: "CASH" },
        USER_ID
      )
    ).rejects.toThrow(BillingPaymentValidationError)
  })

  it("allows partial payment", async () => {
    const prisma = mockPrisma({
      billingDocument: {
        findFirst: vi.fn().mockResolvedValue(mockDocument),
      },
      billingPayment: {
        create: vi.fn().mockResolvedValue({ ...mockPaymentResult, amount: 500 }),
      },
    })

    const result = await createPayment(
      prisma,
      TENANT_ID,
      { documentId: DOC_ID, date: new Date("2026-01-05"), amount: 500, type: "BANK" },
      USER_ID
    )
    expect(result.amount).toBe(500)
  })

  it("full payment - closes balance", async () => {
    const prisma = mockPrisma({
      billingDocument: {
        findFirst: vi.fn().mockResolvedValue(mockDocument),
      },
      billingPayment: {
        create: vi.fn().mockResolvedValue({ ...mockPaymentResult, amount: 1190 }),
      },
    })

    const result = await createPayment(
      prisma,
      TENANT_ID,
      { documentId: DOC_ID, date: new Date("2026-01-05"), amount: 1190, type: "BANK" },
      USER_ID
    )
    expect(result.amount).toBe(1190)
  })

  it("with discount - creates discount entry", async () => {
    const createMock = vi.fn()
      .mockResolvedValueOnce({ ...mockPaymentResult, amount: 1154.3 })
      .mockResolvedValueOnce({ ...mockPaymentResult, amount: 35.7, isDiscount: true })

    const prisma = mockPrisma({
      billingDocument: {
        findFirst: vi.fn().mockResolvedValue(mockDocument),
      },
      billingPayment: {
        create: createMock,
      },
    })

    await createPayment(
      prisma,
      TENANT_ID,
      {
        documentId: DOC_ID,
        date: new Date("2026-01-05"),
        amount: 1190,
        type: "BANK",
        isDiscount: true,
      },
      USER_ID
    )

    // Should have been called twice: once for payment, once for discount
    expect(createMock).toHaveBeenCalledTimes(2)
  })

  it("with discount - rejects if discount period expired", async () => {
    const prisma = mockPrisma({
      billingDocument: {
        findFirst: vi.fn().mockResolvedValue(mockDocument),
      },
    })

    await expect(
      createPayment(
        prisma,
        TENANT_ID,
        {
          documentId: DOC_ID,
          date: new Date("2026-03-01"), // way past discount periods
          amount: 1190,
          type: "BANK",
          isDiscount: true,
        },
        USER_ID
      )
    ).rejects.toThrow("Discount period expired")
  })

  it("accounts for credit notes when computing open amount", async () => {
    const prisma = mockPrisma({
      billingDocument: {
        findFirst: vi.fn().mockResolvedValue({
          ...mockDocument,
          childDocuments: [{ totalGross: 190 }],
        }),
      },
      billingPayment: {
        create: vi.fn().mockResolvedValue({ ...mockPaymentResult, amount: 1000 }),
      },
    })

    // Effective total = 1190 - 190 = 1000. Should accept 1000
    const result = await createPayment(
      prisma,
      TENANT_ID,
      { documentId: DOC_ID, date: new Date("2026-01-05"), amount: 1000, type: "BANK" },
      USER_ID
    )
    expect(result.amount).toBe(1000)
  })

  it("throws NotFoundError for missing document", async () => {
    const prisma = mockPrisma({
      billingDocument: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    })

    await expect(
      createPayment(
        prisma,
        TENANT_ID,
        { documentId: DOC_ID, date: new Date(), amount: 100, type: "CASH" },
        USER_ID
      )
    ).rejects.toThrow(BillingPaymentValidationError)
  })
})

// --- cancelPayment ---
describe("cancelPayment", () => {
  const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
  const PAYMENT_ID = "e0000000-0000-4000-a000-000000000001"
  const USER_ID = "a0000000-0000-4000-a000-000000000001"

  const mockPayment = {
    id: PAYMENT_ID,
    tenantId: TENANT_ID,
    status: "ACTIVE",
    isDiscount: false,
    notes: null,
    date: new Date("2026-03-01"),
    document: { id: "doc1" },
  }

  it("sets status to CANCELLED", async () => {
    const cancelledPayment = { ...mockPayment, status: "CANCELLED" }
    const prisma = mockPrisma({
      billingPayment: {
        findFirst: vi.fn()
          .mockResolvedValueOnce(mockPayment)
          .mockResolvedValueOnce(cancelledPayment),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findMany: vi.fn().mockResolvedValue([]),
      },
    })

    const result = await cancelPayment(prisma, TENANT_ID, PAYMENT_ID, USER_ID)
    expect(result?.status).toBe("CANCELLED")
  })

  it("rejects if payment already cancelled", async () => {
    const prisma = mockPrisma({
      billingPayment: {
        findFirst: vi.fn().mockResolvedValue({ ...mockPayment, status: "CANCELLED" }),
      },
    })

    await expect(
      cancelPayment(prisma, TENANT_ID, PAYMENT_ID, USER_ID)
    ).rejects.toThrow(BillingPaymentValidationError)
  })

  it("appends reason to notes", async () => {
    const cancelledPayment = {
      ...mockPayment,
      status: "CANCELLED",
      notes: "Storniert: Fehleingabe",
    }
    const prisma = mockPrisma({
      billingPayment: {
        findFirst: vi.fn()
          .mockResolvedValueOnce(mockPayment)
          .mockResolvedValueOnce(cancelledPayment),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findMany: vi.fn().mockResolvedValue([]),
      },
    })

    const result = await cancelPayment(prisma, TENANT_ID, PAYMENT_ID, USER_ID, "Fehleingabe")
    expect(result?.notes).toContain("Fehleingabe")
  })

  it("throws NotFoundError for non-existent payment", async () => {
    const prisma = mockPrisma({
      billingPayment: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    })

    await expect(
      cancelPayment(prisma, TENANT_ID, PAYMENT_ID, USER_ID)
    ).rejects.toThrow(BillingPaymentNotFoundError)
  })
})

// --- listOpenItems ---
describe("listOpenItems", () => {
  const TENANT_ID = "a0000000-0000-4000-a000-000000000100"

  it("returns only INVOICE documents with enriched data", async () => {
    const mockInvoice = {
      id: "inv1",
      tenantId: TENANT_ID,
      type: "INVOICE",
      status: "PRINTED",
      totalGross: 1000,
      documentDate: new Date("2026-01-01"),
      paymentTermDays: 30,
      payments: [{ amount: 300, status: "ACTIVE" }],
      childDocuments: [],
      address: { id: "a1", company: "Test GmbH" },
    }

    const prisma = mockPrisma({
      billingDocument: {
        findMany: vi.fn().mockResolvedValue([mockInvoice]),
        count: vi.fn().mockResolvedValue(1),
      },
    })

    const result = await listOpenItems(prisma, TENANT_ID, { page: 1, pageSize: 25 })
    expect(result.items).toHaveLength(1)
    expect(result.items[0].paymentStatus).toBe("PARTIAL")
    expect(result.items[0].paidAmount).toBe(300)
    expect(result.items[0].openAmount).toBe(700)
  })

  it("filters by status correctly", async () => {
    const paidInvoice = {
      id: "inv1",
      totalGross: 1000,
      documentDate: new Date("2026-01-01"),
      paymentTermDays: 30,
      payments: [{ amount: 1000, status: "ACTIVE" }],
      childDocuments: [],
    }
    const openInvoice = {
      id: "inv2",
      totalGross: 500,
      documentDate: new Date("2026-01-01"),
      paymentTermDays: 30,
      payments: [],
      childDocuments: [],
    }

    const prisma = mockPrisma({
      billingDocument: {
        findMany: vi.fn().mockResolvedValue([paidInvoice, openInvoice]),
        count: vi.fn().mockResolvedValue(2),
      },
    })

    const result = await listOpenItems(prisma, TENANT_ID, {
      status: "open",
      page: 1,
      pageSize: 25,
    })
    expect(result.items).toHaveLength(1)
    expect(result.items[0].paymentStatus).toBe("UNPAID")
  })

  it("paginates correctly", async () => {
    const prisma = mockPrisma({
      billingDocument: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(50),
      },
    })

    await listOpenItems(prisma, TENANT_ID, { page: 2, pageSize: 25 })
    expect(prisma.billingDocument.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 25, take: 25 })
    )
  })
})

// --- getOpenItemById ---
describe("getOpenItemById", () => {
  const TENANT_ID = "a0000000-0000-4000-a000-000000000100"

  it("returns enriched invoice", async () => {
    const mockInvoice = {
      id: "inv1",
      totalGross: 1190,
      documentDate: new Date("2026-01-01"),
      paymentTermDays: 30,
      payments: [{ amount: 500, status: "ACTIVE" }],
      childDocuments: [],
    }

    const prisma = mockPrisma({
      billingDocument: {
        findFirst: vi.fn().mockResolvedValue(mockInvoice),
      },
    })

    const result = await getOpenItemById(prisma, TENANT_ID, "inv1")
    expect(result.paidAmount).toBe(500)
    expect(result.openAmount).toBe(690)
    expect(result.paymentStatus).toBe("PARTIAL")
  })

  it("throws NotFoundError for missing invoice", async () => {
    const prisma = mockPrisma({
      billingDocument: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    })

    await expect(
      getOpenItemById(prisma, TENANT_ID, "non-existent")
    ).rejects.toThrow(BillingPaymentNotFoundError)
  })
})

// --- getOpenItemsSummary ---
describe("getOpenItemsSummary", () => {
  const TENANT_ID = "a0000000-0000-4000-a000-000000000100"

  it("calculates total open and overdue amounts", async () => {
    const past = new Date()
    past.setDate(past.getDate() - 60)

    const invoices = [
      {
        id: "inv1",
        totalGross: 1000,
        documentDate: past,
        paymentTermDays: 30,
        payments: [],
        childDocuments: [],
      },
      {
        id: "inv2",
        totalGross: 500,
        documentDate: new Date(),
        paymentTermDays: 30,
        payments: [{ amount: 500, status: "ACTIVE" }],
        childDocuments: [],
      },
    ]

    const prisma = mockPrisma({
      billingDocument: {
        findMany: vi.fn().mockResolvedValue(invoices),
      },
    })

    const result = await getOpenItemsSummary(prisma, TENANT_ID)
    expect(result.countOpen).toBe(1)
    expect(result.countPaid).toBe(1)
    expect(result.totalOpen).toBe(1000)
    expect(result.countOverdue).toBe(1)
    expect(result.totalOverdue).toBe(1000)
  })

  it("returns count by status", async () => {
    const prisma = mockPrisma({
      billingDocument: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    })

    const result = await getOpenItemsSummary(prisma, TENANT_ID)
    expect(result.countOpen).toBe(0)
    expect(result.countPartial).toBe(0)
    expect(result.countPaid).toBe(0)
    expect(result.countOverdue).toBe(0)
    expect(result.totalOpen).toBe(0)
    expect(result.totalOverdue).toBe(0)
  })
})
