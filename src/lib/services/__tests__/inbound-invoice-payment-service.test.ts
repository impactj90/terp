import { describe, it, expect, vi } from "vitest"
import {
  computeInboundPaymentStatus,
  createPayment,
  cancelPayment,
  consistencyCheckPaymentStatus,
  markInvoicesPaidFromPaymentRun,
  InboundInvoicePaymentNotFoundError,
  InboundInvoicePaymentValidationError,
} from "../inbound-invoice-payment-service"

// --- audit-logs-service mock (shared across tests) ---
vi.mock("../audit-logs-service", () => ({
  log: vi.fn().mockResolvedValue(undefined),
  logBulk: vi.fn().mockResolvedValue(undefined),
}))

import * as auditLog from "../audit-logs-service"

// --- mock Prisma helper ---
function mockPrisma(overrides: Record<string, unknown> = {}) {
  const prisma = {
    $transaction: vi.fn(),
    ...overrides,
  } as unknown as Parameters<typeof createPayment>[0]
  ;(prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
    (fnOrArr: unknown) => {
      if (typeof fnOrArr === "function") {
        return (fnOrArr as (tx: unknown) => unknown)(prisma)
      }
      return Promise.all(fnOrArr as unknown[])
    }
  )
  return prisma
}

// --- computeInboundPaymentStatus ---
describe("computeInboundPaymentStatus", () => {
  it("returns UNPAID when paidAmount is 0", () => {
    expect(computeInboundPaymentStatus(1000, 0)).toBe("UNPAID")
  })

  it("returns UNPAID when paidAmount is negative", () => {
    expect(computeInboundPaymentStatus(1000, -10)).toBe("UNPAID")
  })

  it("returns PARTIAL when paidAmount < totalGross", () => {
    expect(computeInboundPaymentStatus(1000, 500)).toBe("PARTIAL")
  })

  it("returns PAID when paidAmount equals totalGross", () => {
    expect(computeInboundPaymentStatus(1000, 1000)).toBe("PAID")
  })

  it("returns PAID for amounts within tolerance", () => {
    expect(computeInboundPaymentStatus(1000, 999.995)).toBe("PAID")
  })

  it("clamps overpayment to PAID (no OVERPAID state)", () => {
    expect(computeInboundPaymentStatus(1000, 1100)).toBe("PAID")
  })
})

// --- createPayment ---
describe("createPayment", () => {
  const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
  const INVOICE_ID = "d0000000-0000-4000-a000-000000000010"
  const USER_ID = "a0000000-0000-4000-a000-000000000001"
  const PAYMENT_ID = "e0000000-0000-4000-a000-000000000001"

  const mockInvoice = {
    id: INVOICE_ID,
    tenantId: TENANT_ID,
    status: "APPROVED",
    totalGross: 1000,
    paidAt: null,
    inboundPayments: [] as Array<{ amount: number }>,
  }

  const mockPaymentResult = {
    id: PAYMENT_ID,
    tenantId: TENANT_ID,
    invoiceId: INVOICE_ID,
    date: new Date("2026-04-05"),
    amount: 500,
    type: "BANK",
    status: "ACTIVE",
    notes: null,
    invoice: { id: INVOICE_ID, totalGross: 1000 },
  }

  function makePrisma(
    invoiceFindFirst: unknown,
    paymentCreateResult: unknown = mockPaymentResult,
    activePaymentsForRecompute: Array<{ amount: number }> = []
  ) {
    const updateMock = vi.fn().mockResolvedValue({ id: INVOICE_ID })
    return mockPrisma({
      inboundInvoice: {
        findFirst: vi
          .fn()
          // 1st call: createPayment guard
          .mockResolvedValueOnce(invoiceFindFirst)
          // 2nd call: recomputeInvoicePaymentStatus
          .mockResolvedValue({ id: INVOICE_ID, totalGross: 1000, paidAt: null }),
        update: updateMock,
      },
      inboundInvoicePayment: {
        create: vi.fn().mockResolvedValue(paymentCreateResult),
        findMany: vi.fn().mockResolvedValue(activePaymentsForRecompute),
      },
    })
  }

  it("creates a partial payment and stamps PARTIAL on the invoice", async () => {
    const prisma = makePrisma(mockInvoice, mockPaymentResult, [{ amount: 500 }])

    const result = await createPayment(
      prisma,
      TENANT_ID,
      {
        invoiceId: INVOICE_ID,
        date: new Date("2026-04-05"),
        amount: 500,
        type: "BANK",
      },
      USER_ID
    )

    expect(result.id).toBe(PAYMENT_ID)

    const updateCall = (prisma as unknown as { inboundInvoice: { update: ReturnType<typeof vi.fn> } })
      .inboundInvoice.update.mock.calls[0]?.[0]
    expect(updateCall.data.paymentStatus).toBe("PARTIAL")
    expect(updateCall.data.paidAmount).toBe(500)
    expect(updateCall.data.paidAt).toBeNull()
  })

  it("creates a full payment, sets PAID and stamps paidAt", async () => {
    const prisma = makePrisma(mockInvoice, mockPaymentResult, [{ amount: 1000 }])

    await createPayment(
      prisma,
      TENANT_ID,
      {
        invoiceId: INVOICE_ID,
        date: new Date("2026-04-05"),
        amount: 1000,
        type: "BANK",
      },
      USER_ID
    )

    const updateCall = (prisma as unknown as { inboundInvoice: { update: ReturnType<typeof vi.fn> } })
      .inboundInvoice.update.mock.calls[0]?.[0]
    expect(updateCall.data.paymentStatus).toBe("PAID")
    expect(updateCall.data.paidAmount).toBe(1000)
    expect(updateCall.data.paidAt).toBeInstanceOf(Date)
  })

  it("rejects when amount exceeds open amount", async () => {
    const invoiceWithExisting = {
      ...mockInvoice,
      inboundPayments: [{ amount: 600 }],
    }
    const prisma = makePrisma(invoiceWithExisting)

    await expect(
      createPayment(
        prisma,
        TENANT_ID,
        {
          invoiceId: INVOICE_ID,
          date: new Date(),
          amount: 500,
          type: "CASH",
        },
        USER_ID
      )
    ).rejects.toThrow(InboundInvoicePaymentValidationError)
  })

  it("rejects when invoice status is DRAFT", async () => {
    const prisma = makePrisma({ ...mockInvoice, status: "DRAFT" })

    await expect(
      createPayment(
        prisma,
        TENANT_ID,
        {
          invoiceId: INVOICE_ID,
          date: new Date(),
          amount: 100,
          type: "CASH",
        },
        USER_ID
      )
    ).rejects.toThrow(InboundInvoicePaymentValidationError)
  })

  it("rejects when invoice does not exist", async () => {
    const prisma = makePrisma(null)

    await expect(
      createPayment(
        prisma,
        TENANT_ID,
        {
          invoiceId: INVOICE_ID,
          date: new Date(),
          amount: 100,
          type: "CASH",
        },
        USER_ID
      )
    ).rejects.toThrow(InboundInvoicePaymentValidationError)
  })

  it("rejects non-positive amounts before touching the DB", async () => {
    const prisma = makePrisma(mockInvoice)

    await expect(
      createPayment(
        prisma,
        TENANT_ID,
        {
          invoiceId: INVOICE_ID,
          date: new Date(),
          amount: 0,
          type: "CASH",
        },
        USER_ID
      )
    ).rejects.toThrow(InboundInvoicePaymentValidationError)
  })

  it("writes a fire-and-forget audit log entry when audit ctx is supplied", async () => {
    const prisma = makePrisma(mockInvoice, mockPaymentResult, [{ amount: 1000 }])
    ;(auditLog.log as ReturnType<typeof vi.fn>).mockClear()

    await createPayment(
      prisma,
      TENANT_ID,
      {
        invoiceId: INVOICE_ID,
        date: new Date("2026-04-05"),
        amount: 1000,
        type: "BANK",
      },
      USER_ID,
      { userId: USER_ID, ipAddress: "1.2.3.4", userAgent: "ua" }
    )

    expect(auditLog.log).toHaveBeenCalledTimes(1)
    expect(auditLog.log).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({
        action: "create",
        entityType: "inbound_invoice_payment",
        userId: USER_ID,
      })
    )
  })
})

// --- cancelPayment ---
describe("cancelPayment", () => {
  const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
  const INVOICE_ID = "d0000000-0000-4000-a000-000000000010"
  const PAYMENT_ID = "e0000000-0000-4000-a000-000000000001"
  const PAYMENT_ID_2 = "e0000000-0000-4000-a000-000000000002"
  const USER_ID = "a0000000-0000-4000-a000-000000000001"

  const activePayment = {
    id: PAYMENT_ID,
    tenantId: TENANT_ID,
    invoiceId: INVOICE_ID,
    amount: 500,
    status: "ACTIVE",
    notes: null,
    date: new Date("2026-04-05"),
  }

  it("cancels the payment, recomputes status to PARTIAL when other active payments remain", async () => {
    const cancelled = { ...activePayment, status: "CANCELLED" }
    const updateMock = vi.fn().mockResolvedValue({ id: INVOICE_ID })
    const prisma = mockPrisma({
      inboundInvoicePayment: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(activePayment)
          .mockResolvedValueOnce(cancelled),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findMany: vi.fn().mockResolvedValue([{ amount: 200 }]),
      },
      inboundInvoice: {
        findFirst: vi.fn().mockResolvedValue({
          id: INVOICE_ID,
          totalGross: 1000,
          paidAt: new Date("2026-04-05"),
        }),
        update: updateMock,
      },
    })

    const result = await cancelPayment(prisma, TENANT_ID, PAYMENT_ID, USER_ID)
    expect(result?.status).toBe("CANCELLED")

    const updateCall = updateMock.mock.calls[0]?.[0]
    expect(updateCall.data.paymentStatus).toBe("PARTIAL")
    expect(updateCall.data.paidAmount).toBe(200)
    expect(updateCall.data.paidAt).toBeNull()
  })

  it("cancels the only active payment and recomputes status back to UNPAID", async () => {
    const cancelled = { ...activePayment, status: "CANCELLED" }
    const updateMock = vi.fn().mockResolvedValue({ id: INVOICE_ID })
    const prisma = mockPrisma({
      inboundInvoicePayment: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(activePayment)
          .mockResolvedValueOnce(cancelled),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findMany: vi.fn().mockResolvedValue([]),
      },
      inboundInvoice: {
        findFirst: vi.fn().mockResolvedValue({
          id: INVOICE_ID,
          totalGross: 1000,
          paidAt: new Date("2026-04-05"),
        }),
        update: updateMock,
      },
    })

    await cancelPayment(prisma, TENANT_ID, PAYMENT_ID, USER_ID)

    const updateCall = updateMock.mock.calls[0]?.[0]
    expect(updateCall.data.paymentStatus).toBe("UNPAID")
    expect(updateCall.data.paidAmount).toBe(0)
    expect(updateCall.data.paidAt).toBeNull()
  })

  it("rejects when payment is already CANCELLED", async () => {
    const prisma = mockPrisma({
      inboundInvoicePayment: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ ...activePayment, status: "CANCELLED" }),
      },
    })

    await expect(
      cancelPayment(prisma, TENANT_ID, PAYMENT_ID, USER_ID)
    ).rejects.toThrow(InboundInvoicePaymentValidationError)
  })

  it("throws NotFound when payment id does not exist", async () => {
    const prisma = mockPrisma({
      inboundInvoicePayment: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    })

    await expect(
      cancelPayment(prisma, TENANT_ID, PAYMENT_ID_2, USER_ID)
    ).rejects.toThrow(InboundInvoicePaymentNotFoundError)
  })

  it("logs an audit entry on cancellation when audit ctx is supplied", async () => {
    const cancelled = { ...activePayment, status: "CANCELLED" }
    const prisma = mockPrisma({
      inboundInvoicePayment: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(activePayment)
          .mockResolvedValueOnce(cancelled),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findMany: vi.fn().mockResolvedValue([]),
      },
      inboundInvoice: {
        findFirst: vi.fn().mockResolvedValue({
          id: INVOICE_ID,
          totalGross: 1000,
          paidAt: null,
        }),
        update: vi.fn().mockResolvedValue({ id: INVOICE_ID }),
      },
    })
    ;(auditLog.log as ReturnType<typeof vi.fn>).mockClear()

    await cancelPayment(prisma, TENANT_ID, PAYMENT_ID, USER_ID, "test", {
      userId: USER_ID,
      ipAddress: null,
      userAgent: null,
    })

    expect(auditLog.log).toHaveBeenCalledTimes(1)
    expect(auditLog.log).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({
        action: "delete",
        entityType: "inbound_invoice_payment",
      })
    )
  })
})

// --- markInvoicesPaidFromPaymentRun ---
describe("markInvoicesPaidFromPaymentRun", () => {
  const TENANT_ID = "a0000000-0000-4000-a000-000000000100"

  it("no-ops on empty input", async () => {
    const tx = {
      inboundInvoice: {
        findMany: vi.fn(),
        update: vi.fn(),
      },
    } as unknown as Parameters<typeof markInvoicesPaidFromPaymentRun>[0]

    await markInvoicesPaidFromPaymentRun(tx, TENANT_ID, [], new Date())
    expect(
      (tx as unknown as { inboundInvoice: { findMany: ReturnType<typeof vi.fn> } })
        .inboundInvoice.findMany
    ).not.toHaveBeenCalled()
  })

  it("updates each invoice with its own totalGross as paidAmount", async () => {
    const bookedAt = new Date("2026-04-10T10:00:00Z")
    const updateMock = vi.fn().mockResolvedValue({})
    const tx = {
      inboundInvoice: {
        findMany: vi.fn().mockResolvedValue([
          { id: "inv1", totalGross: 500 },
          { id: "inv2", totalGross: 1234.5 },
        ]),
        update: updateMock,
      },
    } as unknown as Parameters<typeof markInvoicesPaidFromPaymentRun>[0]

    await markInvoicesPaidFromPaymentRun(tx, TENANT_ID, ["inv1", "inv2"], bookedAt)

    expect(updateMock).toHaveBeenCalledTimes(2)
    expect(updateMock).toHaveBeenNthCalledWith(1, {
      where: { id: "inv1" },
      data: { paymentStatus: "PAID", paidAmount: 500, paidAt: bookedAt },
    })
    expect(updateMock).toHaveBeenNthCalledWith(2, {
      where: { id: "inv2" },
      data: { paymentStatus: "PAID", paidAmount: 1234.5, paidAt: bookedAt },
    })
  })
})

// --- consistencyCheckPaymentStatus ---
describe("consistencyCheckPaymentStatus", () => {
  const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
  const INVOICE_ID = "d0000000-0000-4000-a000-000000000010"

  it("does not warn when stored matches derived (PAID)", async () => {
    ;(auditLog.log as ReturnType<typeof vi.fn>).mockClear()

    await consistencyCheckPaymentStatus(
      mockPrisma() as never,
      { id: INVOICE_ID, tenantId: TENANT_ID, paymentStatus: "PAID" },
      [{ paymentRun: { status: "BOOKED" } }]
    )

    expect(auditLog.log).not.toHaveBeenCalled()
  })

  it("does not warn for IN_PAYMENT_RUN (still in flight)", async () => {
    ;(auditLog.log as ReturnType<typeof vi.fn>).mockClear()

    await consistencyCheckPaymentStatus(
      mockPrisma() as never,
      { id: INVOICE_ID, tenantId: TENANT_ID, paymentStatus: "PARTIAL" },
      [{ paymentRun: { status: "EXPORTED" } }]
    )

    expect(auditLog.log).not.toHaveBeenCalled()
  })

  it("warns when derived=PAID but stored=UNPAID", async () => {
    ;(auditLog.log as ReturnType<typeof vi.fn>).mockClear()

    await consistencyCheckPaymentStatus(
      mockPrisma() as never,
      { id: INVOICE_ID, tenantId: TENANT_ID, paymentStatus: "UNPAID" },
      [{ paymentRun: { status: "BOOKED" } }]
    )

    expect(auditLog.log).toHaveBeenCalledTimes(1)
    expect(auditLog.log).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "consistency_warning",
        entityType: "inbound_invoice",
        entityId: INVOICE_ID,
        changes: { stored: "UNPAID", derived: "PAID" },
      })
    )
  })

  it("warns when derived=UNPAID but stored=PAID (manually broken state)", async () => {
    ;(auditLog.log as ReturnType<typeof vi.fn>).mockClear()

    await consistencyCheckPaymentStatus(
      mockPrisma() as never,
      { id: INVOICE_ID, tenantId: TENANT_ID, paymentStatus: "PAID" },
      []
    )

    expect(auditLog.log).toHaveBeenCalledTimes(1)
  })
})
