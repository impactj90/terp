/**
 * Unit tests for work-report-invoice-bridge-service.
 *
 * Hand-rolled Prisma mock — no real DB. Integration coverage lives in
 * `work-report-invoice-bridge-service.integration.test.ts`.
 *
 * Plan: 2026-04-27-rechnungs-uebernahme-arbeitsschein-r1.md (Phase B)
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import type { PrismaClient } from "@/generated/prisma/client"
import * as bridgeService from "../work-report-invoice-bridge-service"

// --- Constants ---

const TENANT = "a0000000-0000-4000-a000-000000008801"
const USER_ID = "a0000000-0000-4000-a000-000000008802"
const WR_ID = "a0000000-0000-4000-a000-000000008803"
const ORDER_ID = "a0000000-0000-4000-a000-000000008804"
const SO_ID = "a0000000-0000-4000-a000-000000008805"
const ADDRESS_ID = "a0000000-0000-4000-a000-000000008806"
const EMP_A = "a0000000-0000-4000-a000-00000000880a"
const EMP_B = "a0000000-0000-4000-a000-00000000880b"
const ACT_ID = "a0000000-0000-4000-a000-000000008807"
const BOOK_1 = "a0000000-0000-4000-a000-000000008811"
const BOOK_2 = "a0000000-0000-4000-a000-000000008812"
const _BOOK_3 = "a0000000-0000-4000-a000-000000008813"
const DOC_ID = "a0000000-0000-4000-a000-000000008820"

// --- Helpers ---

interface MakeWorkReportOpts {
  status?: "DRAFT" | "SIGNED" | "VOID"
  travelMinutes?: number | null
  orderRate?: number | null
  serviceObject?: { customerAddressId: string | null } | null
  assignments?: Array<{ employeeId: string; hourlyRate: number | null }>
}

function decimalLike(n: number | null) {
  if (n === null) return null
  return { toNumber: () => n }
}

function makeWorkReport(opts: MakeWorkReportOpts = {}) {
  return {
    id: WR_ID,
    tenantId: TENANT,
    orderId: ORDER_ID,
    serviceObjectId: opts.serviceObject ? SO_ID : null,
    code: "AS-1",
    visitDate: new Date("2026-04-22T00:00:00Z"),
    travelMinutes: opts.travelMinutes ?? null,
    workDescription: "Filter gewechselt",
    status: opts.status ?? "SIGNED",
    serviceObject: opts.serviceObject
      ? {
          id: SO_ID,
          customerAddressId: opts.serviceObject.customerAddressId,
          customerAddress: opts.serviceObject.customerAddressId
            ? { id: opts.serviceObject.customerAddressId }
            : null,
        }
      : null,
    order: {
      id: ORDER_ID,
      tenantId: TENANT,
      billingRatePerHour: decimalLike(opts.orderRate ?? null),
    },
    assignments: (opts.assignments ?? []).map((a, i) => ({
      id: `assign-${i}`,
      tenantId: TENANT,
      workReportId: WR_ID,
      employeeId: a.employeeId,
      role: null,
      employee: {
        id: a.employeeId,
        hourlyRate: decimalLike(a.hourlyRate),
      },
    })),
  }
}

interface MakeBookingOpts {
  id: string
  employeeId: string
  employeeRate: number | null
  timeMinutes: number
  description?: string | null
  activity?: { name: string } | null
  bookingDate?: Date
  createdAt?: Date
}

function makeBooking(opts: MakeBookingOpts) {
  return {
    id: opts.id,
    tenantId: TENANT,
    employeeId: opts.employeeId,
    orderId: ORDER_ID,
    activityId: opts.activity ? ACT_ID : null,
    workReportId: WR_ID,
    bookingDate: opts.bookingDate ?? new Date("2026-04-22T00:00:00Z"),
    timeMinutes: opts.timeMinutes,
    description: opts.description ?? null,
    createdAt: opts.createdAt ?? new Date(),
    employee: {
      id: opts.employeeId,
      tenantId: TENANT,
      hourlyRate: decimalLike(opts.employeeRate),
    },
    activity: opts.activity ? { id: ACT_ID, name: opts.activity.name } : null,
  }
}

// --- Mock Prisma factory ---

interface PrismaMocks {
  workReportFindFirst: ReturnType<typeof vi.fn>
  orderBookingFindMany: ReturnType<typeof vi.fn>
  billingDocumentFindFirst: ReturnType<typeof vi.fn>
  billingDocumentCreate: ReturnType<typeof vi.fn>
  billingDocumentPositionCreate: ReturnType<typeof vi.fn>
  billingDocumentUpdateMany: ReturnType<typeof vi.fn>
  billingDocumentPositionFindMany: ReturnType<typeof vi.fn>
  numberSequenceUpsert: ReturnType<typeof vi.fn>
  templateFindFirst: ReturnType<typeof vi.fn>
  crmAddressFindFirst: ReturnType<typeof vi.fn>
  crmContactFindFirst: ReturnType<typeof vi.fn>
  auditLogCreate: ReturnType<typeof vi.fn>
  positionGetMaxSortOrder: ReturnType<typeof vi.fn>
}

function makePrisma(): { prisma: PrismaClient; mocks: PrismaMocks } {
  const createdDocId = DOC_ID
  const positionsAdded: unknown[] = []
  let createdDoc: Record<string, unknown> | null = null

  const mocks: PrismaMocks = {
    workReportFindFirst: vi.fn(),
    orderBookingFindMany: vi.fn().mockResolvedValue([]),
    // billingDocument.findFirst is called twice during generate:
    //   1. Idempotency check by `{ tenantId, workReportId, status: !CANCELLED }`
    //      → must return null on default (no existing invoice)
    //   2. Inside addPosition's repo.findById by `{ id, tenantId }`
    //      → must return the just-created DRAFT doc so the DRAFT guard passes
    billingDocumentFindFirst: vi
      .fn()
      .mockImplementation((args: { where: Record<string, unknown> }) => {
        // addPosition uses findFirst with `{ id, tenantId }` and includes
        if (args.where.id) {
          return Promise.resolve(createdDoc)
        }
        // idempotency check uses `{ tenantId, workReportId, status: ... }`
        return Promise.resolve(null)
      }),
    billingDocumentCreate: vi
      .fn()
      .mockImplementation((args: { data: Record<string, unknown> }) => {
        createdDoc = {
          id: createdDocId,
          tenantId: args.data.tenantId,
          number: args.data.number,
          type: args.data.type,
          status: "DRAFT",
          addressId: args.data.addressId,
          contactId: args.data.contactId ?? null,
          deliveryAddressId: args.data.deliveryAddressId ?? null,
          invoiceAddressId: args.data.invoiceAddressId ?? null,
          inquiryId: args.data.inquiryId ?? null,
          orderId: args.data.orderId ?? null,
          workReportId: args.data.workReportId ?? null,
          parentDocumentId: null,
          documentDate: args.data.documentDate ?? new Date(),
          servicePeriodFrom: args.data.servicePeriodFrom ?? null,
          servicePeriodTo: args.data.servicePeriodTo ?? null,
          subtotalNet: 0,
          totalVat: 0,
          totalGross: 0,
          positions: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        }
        return Promise.resolve(createdDoc)
      }),
    billingDocumentPositionCreate: vi
      .fn()
      .mockImplementation((args: { data: Record<string, unknown> }) => {
        const pos = { id: `pos-${positionsAdded.length}`, ...args.data }
        positionsAdded.push(pos)
        return Promise.resolve(pos)
      }),
    billingDocumentUpdateMany: vi.fn().mockResolvedValue({ count: 1 }),
    billingDocumentPositionFindMany: vi
      .fn()
      .mockImplementation(() => Promise.resolve(positionsAdded)),
    numberSequenceUpsert: vi
      .fn()
      .mockResolvedValue({ prefix: "RE-", nextValue: 124 }),
    templateFindFirst: vi.fn().mockResolvedValue(null),
    crmAddressFindFirst: vi.fn().mockResolvedValue({
      id: ADDRESS_ID,
      paymentTermDays: null,
      discountPercent: null,
      discountDays: null,
    }),
    crmContactFindFirst: vi.fn().mockResolvedValue(null),
    auditLogCreate: vi.fn().mockResolvedValue({}),
    positionGetMaxSortOrder: vi.fn().mockImplementation(() =>
      Promise.resolve(positionsAdded.length === 0 ? 0 : positionsAdded.length),
    ),
  }

  const prisma = {
    workReport: {
      findFirst: mocks.workReportFindFirst,
    },
    orderBooking: {
      findMany: mocks.orderBookingFindMany,
    },
    billingDocument: {
      findFirst: mocks.billingDocumentFindFirst,
      create: mocks.billingDocumentCreate,
      updateMany: mocks.billingDocumentUpdateMany,
    },
    billingDocumentPosition: {
      create: mocks.billingDocumentPositionCreate,
      findMany: mocks.billingDocumentPositionFindMany,
      // getMaxSortOrder uses findFirst with orderBy desc
      findFirst: vi.fn().mockResolvedValue(null),
      aggregate: vi.fn().mockResolvedValue({ _max: { sortOrder: null } }),
    },
    numberSequence: {
      upsert: mocks.numberSequenceUpsert,
    },
    billingDocumentTemplate: {
      findFirst: mocks.templateFindFirst,
    },
    crmAddress: {
      findFirst: mocks.crmAddressFindFirst,
    },
    crmContact: {
      findFirst: mocks.crmContactFindFirst,
    },
    auditLog: { create: mocks.auditLogCreate },
    platformAuditLog: { create: vi.fn().mockResolvedValue({}) },
    $transaction: vi.fn(),
  } as unknown as PrismaClient

  ;(prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
    (fnOrArr: unknown) => {
      if (typeof fnOrArr === "function") {
        return (fnOrArr as (tx: unknown) => unknown)(prisma)
      }
      return Promise.all(fnOrArr as unknown[])
    },
  )

  return { prisma, mocks }
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// computeProposedPositions
// ---------------------------------------------------------------------------

describe("computeProposedPositions", () => {
  it("uses Order.billingRatePerHour when present", async () => {
    const { prisma, mocks } = makePrisma()
    mocks.workReportFindFirst.mockResolvedValueOnce(
      makeWorkReport({ orderRate: 75, travelMinutes: 0 }),
    )
    mocks.orderBookingFindMany.mockResolvedValueOnce([
      makeBooking({
        id: BOOK_1,
        employeeId: EMP_A,
        employeeRate: 99, // ignored — Order rate wins
        timeMinutes: 120,
      }),
    ])

    const positions = await bridgeService.computeProposedPositions(
      prisma,
      TENANT,
      WR_ID,
    )

    expect(positions).toHaveLength(1)
    expect(positions[0]).toMatchObject({
      kind: "labor",
      unitPrice: 75,
      requiresManualPrice: false,
      quantity: 2,
      unit: "h",
      vatRate: 19,
      sourceBookingId: BOOK_1,
      employeeId: EMP_A,
    })
  })

  it("falls back to Employee.hourlyRate when Order has no rate", async () => {
    const { prisma, mocks } = makePrisma()
    mocks.workReportFindFirst.mockResolvedValueOnce(
      makeWorkReport({ orderRate: null, travelMinutes: 0 }),
    )
    mocks.orderBookingFindMany.mockResolvedValueOnce([
      makeBooking({
        id: BOOK_1,
        employeeId: EMP_A,
        employeeRate: 50,
        timeMinutes: 60,
      }),
    ])

    const positions = await bridgeService.computeProposedPositions(
      prisma,
      TENANT,
      WR_ID,
    )

    expect(positions[0]?.unitPrice).toBe(50)
    expect(positions[0]?.requiresManualPrice).toBe(false)
  })

  it("flags requiresManualPrice when neither Order nor Employee have a rate", async () => {
    const { prisma, mocks } = makePrisma()
    mocks.workReportFindFirst.mockResolvedValueOnce(
      makeWorkReport({ orderRate: null, travelMinutes: 0 }),
    )
    mocks.orderBookingFindMany.mockResolvedValueOnce([
      makeBooking({
        id: BOOK_1,
        employeeId: EMP_A,
        employeeRate: null,
        timeMinutes: 60,
      }),
    ])

    const positions = await bridgeService.computeProposedPositions(
      prisma,
      TENANT,
      WR_ID,
    )

    expect(positions[0]?.unitPrice).toBe(0)
    expect(positions[0]?.requiresManualPrice).toBe(true)
  })

  // ---------------------------------------------------------------------
  // toPositiveRate contract — `<= 0 → null` so a 0,00 EUR rate behaves
  // identically to "rate not set". Sealed by manual-verification 2026-04-28
  // where `decimalToNumber(0) === 0` was leaking through and producing
  // 0-EUR positions silently. CI-level guard against regression of the
  // bridge-service `toPositiveRate()` helper.
  // ---------------------------------------------------------------------

  it("treats Order.billingRatePerHour = 0 as no-rate (falls back to Employee)", async () => {
    const { prisma, mocks } = makePrisma()
    mocks.workReportFindFirst.mockResolvedValueOnce(
      makeWorkReport({ orderRate: 0, travelMinutes: 0 }),
    )
    mocks.orderBookingFindMany.mockResolvedValueOnce([
      makeBooking({
        id: BOOK_1,
        employeeId: EMP_A,
        employeeRate: 50,
        timeMinutes: 60,
      }),
    ])

    const positions = await bridgeService.computeProposedPositions(
      prisma,
      TENANT,
      WR_ID,
    )

    expect(positions[0]?.unitPrice).toBe(50)
    expect(positions[0]?.requiresManualPrice).toBe(false)
  })

  it("treats Employee.hourlyRate = 0 as no-rate (requires manual price)", async () => {
    const { prisma, mocks } = makePrisma()
    mocks.workReportFindFirst.mockResolvedValueOnce(
      makeWorkReport({ orderRate: null, travelMinutes: 0 }),
    )
    mocks.orderBookingFindMany.mockResolvedValueOnce([
      makeBooking({
        id: BOOK_1,
        employeeId: EMP_A,
        employeeRate: 0,
        timeMinutes: 60,
      }),
    ])

    const positions = await bridgeService.computeProposedPositions(
      prisma,
      TENANT,
      WR_ID,
    )

    expect(positions[0]?.unitPrice).toBe(0)
    expect(positions[0]?.requiresManualPrice).toBe(true)
  })

  it("treats both Order.rate=0 AND Employee.rate=0 as requires-manual", async () => {
    const { prisma, mocks } = makePrisma()
    mocks.workReportFindFirst.mockResolvedValueOnce(
      makeWorkReport({ orderRate: 0, travelMinutes: 0 }),
    )
    mocks.orderBookingFindMany.mockResolvedValueOnce([
      makeBooking({
        id: BOOK_1,
        employeeId: EMP_A,
        employeeRate: 0,
        timeMinutes: 60,
      }),
    ])

    const positions = await bridgeService.computeProposedPositions(
      prisma,
      TENANT,
      WR_ID,
    )

    expect(positions[0]?.unitPrice).toBe(0)
    expect(positions[0]?.requiresManualPrice).toBe(true)
  })

  it("sorts labor first chronologically, then travel last", async () => {
    const { prisma, mocks } = makePrisma()
    mocks.workReportFindFirst.mockResolvedValueOnce(
      makeWorkReport({
        orderRate: 60,
        travelMinutes: 30,
        assignments: [{ employeeId: EMP_A, hourlyRate: 80 }],
      }),
    )
    mocks.orderBookingFindMany.mockResolvedValueOnce([
      makeBooking({
        id: BOOK_1,
        employeeId: EMP_A,
        employeeRate: null,
        timeMinutes: 60,
        bookingDate: new Date("2026-04-20T00:00:00Z"),
      }),
      makeBooking({
        id: BOOK_2,
        employeeId: EMP_A,
        employeeRate: null,
        timeMinutes: 90,
        bookingDate: new Date("2026-04-22T00:00:00Z"),
      }),
    ])

    const positions = await bridgeService.computeProposedPositions(
      prisma,
      TENANT,
      WR_ID,
    )

    expect(positions).toHaveLength(3)
    expect(positions[0]?.kind).toBe("labor")
    expect(positions[0]?.sourceBookingId).toBe(BOOK_1)
    expect(positions[1]?.kind).toBe("labor")
    expect(positions[1]?.sourceBookingId).toBe(BOOK_2)
    expect(positions[2]?.kind).toBe("travel")
  })

  it("uses Maximum employee hourlyRate for the travel position", async () => {
    const { prisma, mocks } = makePrisma()
    mocks.workReportFindFirst.mockResolvedValueOnce(
      makeWorkReport({
        orderRate: null,
        travelMinutes: 45,
        assignments: [
          { employeeId: EMP_A, hourlyRate: 50 },
          { employeeId: EMP_B, hourlyRate: 75 },
        ],
      }),
    )
    mocks.orderBookingFindMany.mockResolvedValueOnce([])

    const positions = await bridgeService.computeProposedPositions(
      prisma,
      TENANT,
      WR_ID,
    )

    expect(positions).toHaveLength(1)
    expect(positions[0]?.kind).toBe("travel")
    expect(positions[0]?.unitPrice).toBe(75) // max of 50, 75
    expect(positions[0]?.quantity).toBe(0.75) // 45 / 60
  })

  it("Order rate overrides Maximum employee rate for travel", async () => {
    const { prisma, mocks } = makePrisma()
    mocks.workReportFindFirst.mockResolvedValueOnce(
      makeWorkReport({
        orderRate: 100,
        travelMinutes: 45,
        assignments: [
          { employeeId: EMP_A, hourlyRate: 50 },
          { employeeId: EMP_B, hourlyRate: 75 },
        ],
      }),
    )
    mocks.orderBookingFindMany.mockResolvedValueOnce([])

    const positions = await bridgeService.computeProposedPositions(
      prisma,
      TENANT,
      WR_ID,
    )

    expect(positions[0]?.unitPrice).toBe(100)
  })

  it("emits no travel position when travelMinutes is 0 or null", async () => {
    const { prisma, mocks } = makePrisma()
    mocks.workReportFindFirst.mockResolvedValueOnce(
      makeWorkReport({ orderRate: 60, travelMinutes: 0 }),
    )
    mocks.orderBookingFindMany.mockResolvedValueOnce([
      makeBooking({
        id: BOOK_1,
        employeeId: EMP_A,
        employeeRate: 50,
        timeMinutes: 60,
      }),
    ])

    const positions = await bridgeService.computeProposedPositions(
      prisma,
      TENANT,
      WR_ID,
    )
    expect(positions).toHaveLength(1)
    expect(positions[0]?.kind).toBe("labor")
  })

  it("includes a single travel position when travelMinutes > 0 and no bookings", async () => {
    const { prisma, mocks } = makePrisma()
    mocks.workReportFindFirst.mockResolvedValueOnce(
      makeWorkReport({
        orderRate: 60,
        travelMinutes: 30,
        assignments: [{ employeeId: EMP_A, hourlyRate: null }],
      }),
    )
    mocks.orderBookingFindMany.mockResolvedValueOnce([])

    const positions = await bridgeService.computeProposedPositions(
      prisma,
      TENANT,
      WR_ID,
    )
    expect(positions).toHaveLength(1)
    expect(positions[0]?.kind).toBe("travel")
    expect(positions[0]?.quantity).toBe(0.5) // 30/60
  })

  it("composes description as `${activity.name}: ${booking.description}` when both present", async () => {
    const { prisma, mocks } = makePrisma()
    mocks.workReportFindFirst.mockResolvedValueOnce(
      makeWorkReport({ orderRate: 60, travelMinutes: 0 }),
    )
    mocks.orderBookingFindMany.mockResolvedValueOnce([
      makeBooking({
        id: BOOK_1,
        employeeId: EMP_A,
        employeeRate: null,
        timeMinutes: 60,
        description: "Filter A1 erneuert",
        activity: { name: "Wartung" },
      }),
    ])

    const positions = await bridgeService.computeProposedPositions(
      prisma,
      TENANT,
      WR_ID,
    )
    expect(positions[0]?.description).toBe("Wartung: Filter A1 erneuert")
  })

  it("falls back to 'Arbeitsleistung' when no description and no activity", async () => {
    const { prisma, mocks } = makePrisma()
    mocks.workReportFindFirst.mockResolvedValueOnce(
      makeWorkReport({ orderRate: 60, travelMinutes: 0 }),
    )
    mocks.orderBookingFindMany.mockResolvedValueOnce([
      makeBooking({
        id: BOOK_1,
        employeeId: EMP_A,
        employeeRate: null,
        timeMinutes: 60,
      }),
    ])

    const positions = await bridgeService.computeProposedPositions(
      prisma,
      TENANT,
      WR_ID,
    )
    expect(positions[0]?.description).toBe("Arbeitsleistung")
  })

  it("throws WorkReportNotFoundError when the report is missing", async () => {
    const { prisma, mocks } = makePrisma()
    mocks.workReportFindFirst.mockResolvedValueOnce(null)

    await expect(
      bridgeService.computeProposedPositions(prisma, TENANT, WR_ID),
    ).rejects.toMatchObject({ name: "WorkReportNotFoundError" })
  })
})

// ---------------------------------------------------------------------------
// generateInvoiceFromWorkReport
// ---------------------------------------------------------------------------

describe("generateInvoiceFromWorkReport", () => {
  function setupForGenerate(
    mocks: PrismaMocks,
    opts: {
      reportStatus?: "DRAFT" | "SIGNED" | "VOID"
      hasAddress?: boolean
      existingInvoice?: {
        id: string
        number: string
        status: string
      } | null
      bookings?: Array<ReturnType<typeof makeBooking>>
      travelMinutes?: number | null
    } = {},
  ) {
    const wr = makeWorkReport({
      status: opts.reportStatus ?? "SIGNED",
      orderRate: 75,
      travelMinutes: opts.travelMinutes ?? 0,
      serviceObject:
        opts.hasAddress === false
          ? { customerAddressId: null }
          : { customerAddressId: ADDRESS_ID },
      assignments: [{ employeeId: EMP_A, hourlyRate: 50 }],
    })
    mocks.workReportFindFirst.mockResolvedValue(wr)
    // Preserve the smart `findFirst` mock from makePrisma — replacing with
    // `mockResolvedValue` would break addPosition's document existence check.
    // Override only the idempotency-check branch (no `id` in where clause).
    const existingInvoice = opts.existingInvoice ?? null
    mocks.billingDocumentFindFirst.mockImplementation(
      (args: { where: Record<string, unknown> }) => {
        if (args.where.id) {
          // addPosition's repo.findById — must return the just-created doc.
          // We re-look-up the in-memory state via createCallback.
          const created = mocks.billingDocumentCreate.mock.results[0]?.value
          if (created && typeof created === "object" && "then" in created) {
            return (created as Promise<unknown>).then((v) => v)
          }
          return Promise.resolve(created ?? null)
        }
        return Promise.resolve(existingInvoice)
      },
    )
    mocks.orderBookingFindMany.mockResolvedValue(opts.bookings ?? [])
  }

  it("creates a DRAFT INVOICE with workReportId set on happy path", async () => {
    const { prisma, mocks } = makePrisma()
    setupForGenerate(mocks, {
      bookings: [
        makeBooking({
          id: BOOK_1,
          employeeId: EMP_A,
          employeeRate: null,
          timeMinutes: 120,
        }),
      ],
      travelMinutes: 30,
    })

    const result = await bridgeService.generateInvoiceFromWorkReport(
      prisma,
      TENANT,
      WR_ID,
      USER_ID,
    )

    expect(result.id).toBe(DOC_ID)
    expect(result.number).toBe("RE-123")
    // Document was created with workReportId + addressId from ServiceObject
    const docCreate = mocks.billingDocumentCreate.mock.calls[0]![0]
    expect(docCreate.data.workReportId).toBe(WR_ID)
    expect(docCreate.data.addressId).toBe(ADDRESS_ID)
    expect(docCreate.data.type).toBe("INVOICE")
    expect(docCreate.data.orderId).toBe(ORDER_ID)
  })

  it("rejects DRAFT WorkReport with PreconditionFailed error", async () => {
    const { prisma, mocks } = makePrisma()
    setupForGenerate(mocks, { reportStatus: "DRAFT" })

    await expect(
      bridgeService.generateInvoiceFromWorkReport(
        prisma,
        TENANT,
        WR_ID,
        USER_ID,
      ),
    ).rejects.toMatchObject({
      name: "WorkReportNotEligibleForInvoicePreconditionFailedError",
    })
    expect(mocks.billingDocumentCreate).not.toHaveBeenCalled()
  })

  it("rejects VOID WorkReport with PreconditionFailed error", async () => {
    const { prisma, mocks } = makePrisma()
    setupForGenerate(mocks, { reportStatus: "VOID" })

    await expect(
      bridgeService.generateInvoiceFromWorkReport(
        prisma,
        TENANT,
        WR_ID,
        USER_ID,
      ),
    ).rejects.toMatchObject({
      name: "WorkReportNotEligibleForInvoicePreconditionFailedError",
    })
  })

  it("throws WorkReportAlreadyInvoicedConflictError when non-CANCELLED doc exists", async () => {
    const { prisma, mocks } = makePrisma()
    setupForGenerate(mocks, {
      existingInvoice: { id: "existing-1", number: "RE-99", status: "DRAFT" },
    })

    await expect(
      bridgeService.generateInvoiceFromWorkReport(
        prisma,
        TENANT,
        WR_ID,
        USER_ID,
      ),
    ).rejects.toMatchObject({
      name: "WorkReportAlreadyInvoicedConflictError",
      existingDocumentId: "existing-1",
      existingDocumentNumber: "RE-99",
      existingDocumentStatus: "DRAFT",
    })
    expect(mocks.billingDocumentCreate).not.toHaveBeenCalled()
  })

  it("succeeds when only a CANCELLED doc exists (re-generate after storno)", async () => {
    const { prisma, mocks } = makePrisma()
    setupForGenerate(mocks, {
      existingInvoice: null, // findFirst with status != CANCELLED returns null
    })

    const result = await bridgeService.generateInvoiceFromWorkReport(
      prisma,
      TENANT,
      WR_ID,
      USER_ID,
    )
    expect(result.id).toBe(DOC_ID)
  })

  it("throws WorkReportNoAddressPreconditionFailedError when serviceObject has no customerAddressId", async () => {
    const { prisma, mocks } = makePrisma()
    setupForGenerate(mocks, { hasAddress: false })

    await expect(
      bridgeService.generateInvoiceFromWorkReport(
        prisma,
        TENANT,
        WR_ID,
        USER_ID,
      ),
    ).rejects.toMatchObject({
      name: "WorkReportNoAddressPreconditionFailedError",
    })
    expect(mocks.billingDocumentCreate).not.toHaveBeenCalled()
  })

  it("throws WorkReportNoAddressPreconditionFailedError when serviceObject is null", async () => {
    const { prisma, mocks } = makePrisma()
    const wr = makeWorkReport({
      status: "SIGNED",
      orderRate: 75,
      serviceObject: null,
    })
    mocks.workReportFindFirst.mockResolvedValue(wr)
    mocks.billingDocumentFindFirst.mockResolvedValue(null)

    await expect(
      bridgeService.generateInvoiceFromWorkReport(
        prisma,
        TENANT,
        WR_ID,
        USER_ID,
      ),
    ).rejects.toMatchObject({
      name: "WorkReportNoAddressPreconditionFailedError",
    })
  })

  it("uses positionsOverride when provided (operator-edited)", async () => {
    const { prisma, mocks } = makePrisma()
    setupForGenerate(mocks)
    const overrides = [
      {
        kind: "manual" as const,
        description: "Sondermaterial",
        quantity: 1,
        unit: "Stk",
        unitPrice: 25,
        vatRate: 19,
      },
    ]
    await bridgeService.generateInvoiceFromWorkReport(
      prisma,
      TENANT,
      WR_ID,
      USER_ID,
      { positionsOverride: overrides },
    )
    expect(mocks.billingDocumentPositionCreate).toHaveBeenCalledTimes(1)
    const posCreate = mocks.billingDocumentPositionCreate.mock.calls[0]![0]
    expect(posCreate.data.description).toBe("Sondermaterial")
    expect(posCreate.data.unitPrice).toBe(25)
    expect(posCreate.data.unit).toBe("Stk")
    expect(posCreate.data.type).toBe("FREE")
  })

  it("emits two cross-link audit_logs entries (work_report + billing_document)", async () => {
    const { prisma, mocks } = makePrisma()
    setupForGenerate(mocks, {
      bookings: [
        makeBooking({
          id: BOOK_1,
          employeeId: EMP_A,
          employeeRate: null,
          timeMinutes: 60,
        }),
      ],
    })

    await bridgeService.generateInvoiceFromWorkReport(
      prisma,
      TENANT,
      WR_ID,
      USER_ID,
      undefined,
      { userId: USER_ID, ipAddress: "1.2.3.4", userAgent: "test" },
    )

    // The bridge writes 2 cross-link audit rows. The document and
    // position creates each emit their own audit rows via the existing
    // billing-document-service. We assert on the bridge's two via metadata.
    const calls = mocks.auditLogCreate.mock.calls.map((c) => c[0].data)
    const generateCall = calls.find(
      (c: Record<string, unknown>) => c.action === "generate_invoice",
    ) as Record<string, unknown> | undefined
    const createFromCall = calls.find(
      (c: Record<string, unknown>) => c.action === "create_from_wr",
    ) as Record<string, unknown> | undefined

    expect(generateCall).toBeTruthy()
    expect(generateCall?.entityType).toBe("work_report")
    expect(generateCall?.entityId).toBe(WR_ID)
    expect(generateCall?.metadata).toMatchObject({
      generatedDocumentId: DOC_ID,
      generatedDocumentNumber: "RE-123",
    })

    expect(createFromCall).toBeTruthy()
    expect(createFromCall?.entityType).toBe("billing_document")
    expect(createFromCall?.entityId).toBe(DOC_ID)
    expect(createFromCall?.metadata).toMatchObject({
      sourceWorkReportId: WR_ID,
      sourceWorkReportCode: "AS-1",
    })
  })
})
