/**
 * Router tests for workReports.previewInvoiceGeneration and
 * workReports.generateInvoice.
 *
 * Plan: 2026-04-27-rechnungs-uebernahme-arbeitsschein-r1.md (Phase C)
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { createCallerFactory } from "@/trpc/init"
import { workReportsRouter } from "../workReports"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import {
  createMockContext,
  createMockSession,
  createUserWithPermissions,
  createMockUserTenant,
} from "./helpers"

// --- Permission Constants ---

const WR_VIEW = permissionIdByKey("work_reports.view")!
const BD_CREATE = permissionIdByKey("billing_documents.create")!

// --- Test Constants ---

const TENANT = "a0000000-0000-4000-a000-000000009901"
const USER_ID = "a0000000-0000-4000-a000-000000009902"
const WR_ID = "a0000000-0000-4000-a000-000000009903"
const ORDER_ID = "a0000000-0000-4000-a000-000000009904"
const SO_ID = "a0000000-0000-4000-a000-000000009905"
const ADDRESS_ID = "a0000000-0000-4000-a000-000000009906"
const EMP_ID = "a0000000-0000-4000-a000-00000000990a"
const BOOK_ID = "a0000000-0000-4000-a000-00000000990b"
const DOC_ID = "a0000000-0000-4000-a000-000000009920"

const createCaller = createCallerFactory(workReportsRouter)

// --- Prisma mock factory ---

interface MakePrismaOpts {
  reportStatus?: "DRAFT" | "SIGNED" | "VOID"
  reportExists?: boolean
  hasAddress?: boolean
  existingInvoice?: {
    id: string
    number: string
    status: string
  } | null
  bookings?: Array<{ id: string; timeMinutes: number; description?: string }>
  travelMinutes?: number | null
  orderRate?: number | null
  employeeRate?: number | null
}

function decimal(n: number | null) {
  return n === null ? null : { toNumber: () => n }
}

function makePrisma(opts: MakePrismaOpts = {}) {
  const reportExists = opts.reportExists !== false
  const wr = reportExists
    ? {
        id: WR_ID,
        tenantId: TENANT,
        orderId: ORDER_ID,
        serviceObjectId: opts.hasAddress === false ? null : SO_ID,
        code: "AS-9",
        visitDate: new Date("2026-04-22T00:00:00Z"),
        travelMinutes: opts.travelMinutes ?? null,
        workDescription: "Test",
        status: opts.reportStatus ?? "SIGNED",
        serviceObject:
          opts.hasAddress === false
            ? null
            : {
                id: SO_ID,
                customerAddressId: ADDRESS_ID,
                customerAddress: { id: ADDRESS_ID },
              },
        order: {
          id: ORDER_ID,
          tenantId: TENANT,
          billingRatePerHour: decimal(opts.orderRate ?? 75),
        },
        assignments: [
          {
            id: "assign-1",
            tenantId: TENANT,
            workReportId: WR_ID,
            employeeId: EMP_ID,
            role: null,
            employee: {
              id: EMP_ID,
              hourlyRate: decimal(opts.employeeRate ?? null),
            },
          },
        ],
      }
    : null

  const bookings = (opts.bookings ?? []).map((b) => ({
    id: b.id,
    tenantId: TENANT,
    employeeId: EMP_ID,
    orderId: ORDER_ID,
    activityId: null,
    workReportId: WR_ID,
    bookingDate: new Date("2026-04-22T00:00:00Z"),
    timeMinutes: b.timeMinutes,
    description: b.description ?? null,
    createdAt: new Date(),
    employee: {
      id: EMP_ID,
      tenantId: TENANT,
      hourlyRate: decimal(opts.employeeRate ?? null),
    },
    activity: null,
  }))

  let createdDoc: Record<string, unknown> | null = null
  const positionsAdded: Record<string, unknown>[] = []

  const prisma = {
    workReport: {
      findFirst: vi.fn().mockResolvedValue(wr),
    },
    orderBooking: {
      findMany: vi.fn().mockResolvedValue(bookings),
    },
    billingDocument: {
      // Smart findFirst: distinguishes idempotency-check (uses workReportId)
      // from addPosition's existence check (uses id).
      findFirst: vi
        .fn()
        .mockImplementation((args: { where: Record<string, unknown> }) => {
          if (args.where.id) {
            return Promise.resolve(createdDoc)
          }
          return Promise.resolve(opts.existingInvoice ?? null)
        }),
      create: vi.fn().mockImplementation((args: { data: Record<string, unknown> }) => {
        createdDoc = {
          id: DOC_ID,
          tenantId: args.data.tenantId,
          number: args.data.number,
          type: args.data.type,
          status: "DRAFT",
          addressId: args.data.addressId,
          contactId: null,
          deliveryAddressId: null,
          invoiceAddressId: null,
          inquiryId: null,
          orderId: args.data.orderId,
          workReportId: args.data.workReportId,
          parentDocumentId: null,
          documentDate: new Date(),
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
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    billingDocumentPosition: {
      create: vi.fn().mockImplementation((args: { data: Record<string, unknown> }) => {
        const pos = { id: `pos-${positionsAdded.length}`, ...args.data }
        positionsAdded.push(pos)
        return Promise.resolve(pos)
      }),
      findMany: vi.fn().mockImplementation(() => Promise.resolve(positionsAdded)),
      findFirst: vi.fn().mockResolvedValue(null),
      aggregate: vi.fn().mockResolvedValue({ _max: { sortOrder: null } }),
    },
    numberSequence: {
      upsert: vi.fn().mockResolvedValue({ prefix: "RE-", nextValue: 124 }),
    },
    billingDocumentTemplate: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
    crmAddress: {
      findFirst: vi.fn().mockResolvedValue({
        id: ADDRESS_ID,
        paymentTermDays: null,
        discountPercent: null,
        discountDays: null,
      }),
    },
    crmContact: { findFirst: vi.fn().mockResolvedValue(null) },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
    platformAuditLog: { create: vi.fn().mockResolvedValue({}) },
  }

  return prisma
}

function makeCtx(prisma: ReturnType<typeof makePrisma>, permissions: string[]) {
  return createMockContext({
    prisma: prisma as unknown as ReturnType<typeof createMockContext>["prisma"],
    authToken: "test-token",
    user: createUserWithPermissions(permissions, {
      id: USER_ID,
      userTenants: [createMockUserTenant(USER_ID, TENANT)],
    }),
    session: createMockSession(),
    tenantId: TENANT,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// previewInvoiceGeneration
// ---------------------------------------------------------------------------

describe("workReports.previewInvoiceGeneration", () => {
  it("rejects without work_reports.view permission with FORBIDDEN", async () => {
    const prisma = makePrisma({
      bookings: [{ id: BOOK_ID, timeMinutes: 60 }],
    })
    const caller = createCaller(makeCtx(prisma, []))
    await expect(
      caller.previewInvoiceGeneration({ workReportId: WR_ID }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
  })

  it("returns proposed positions and no warnings on happy path", async () => {
    const prisma = makePrisma({
      bookings: [{ id: BOOK_ID, timeMinutes: 60, description: "Work A" }],
      travelMinutes: 30,
    })
    const caller = createCaller(makeCtx(prisma, [WR_VIEW]))
    const result = await caller.previewInvoiceGeneration({ workReportId: WR_ID })

    expect(result.proposedPositions.length).toBe(2) // 1 labor + 1 travel
    expect(result.existingInvoice).toBeNull()
    expect(result.warnings).toEqual([])
  })

  it("populates existingInvoice when a non-CANCELLED doc exists", async () => {
    const prisma = makePrisma({
      bookings: [{ id: BOOK_ID, timeMinutes: 60 }],
      existingInvoice: { id: "existing-1", number: "RE-77", status: "DRAFT" },
    })
    const caller = createCaller(makeCtx(prisma, [WR_VIEW]))
    const result = await caller.previewInvoiceGeneration({ workReportId: WR_ID })

    expect(result.existingInvoice).toEqual({
      id: "existing-1",
      number: "RE-77",
      status: "DRAFT",
    })
  })

  it("returns 'noAddress' warning when ServiceObject has no customerAddressId", async () => {
    const prisma = makePrisma({
      hasAddress: false,
      bookings: [{ id: BOOK_ID, timeMinutes: 60 }],
    })
    const caller = createCaller(makeCtx(prisma, [WR_VIEW]))
    const result = await caller.previewInvoiceGeneration({ workReportId: WR_ID })

    expect(result.warnings).toContain("noAddress")
  })

  it("returns 'noEligibleBookings' warning when no bookings and no travel", async () => {
    const prisma = makePrisma({
      bookings: [],
      travelMinutes: 0,
    })
    const caller = createCaller(makeCtx(prisma, [WR_VIEW]))
    const result = await caller.previewInvoiceGeneration({ workReportId: WR_ID })

    expect(result.warnings).toContain("noEligibleBookings")
    expect(result.proposedPositions.length).toBe(0)
  })

  it("returns NOT_FOUND when WorkReport doesn't exist", async () => {
    const prisma = makePrisma({ reportExists: false })
    const caller = createCaller(makeCtx(prisma, [WR_VIEW]))
    await expect(
      caller.previewInvoiceGeneration({ workReportId: WR_ID }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" })
  })
})

// ---------------------------------------------------------------------------
// generateInvoice
// ---------------------------------------------------------------------------

describe("workReports.generateInvoice", () => {
  it("rejects without billing_documents.create with FORBIDDEN", async () => {
    const prisma = makePrisma({
      bookings: [{ id: BOOK_ID, timeMinutes: 60 }],
    })
    // Has WR_VIEW but missing BD_CREATE
    const caller = createCaller(makeCtx(prisma, [WR_VIEW]))
    await expect(
      caller.generateInvoice({ workReportId: WR_ID }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
  })

  it("rejects without work_reports.view with FORBIDDEN", async () => {
    const prisma = makePrisma({
      bookings: [{ id: BOOK_ID, timeMinutes: 60 }],
    })
    // Has BD_CREATE but missing WR_VIEW (the first .use check fires first)
    const caller = createCaller(makeCtx(prisma, [BD_CREATE]))
    await expect(
      caller.generateInvoice({ workReportId: WR_ID }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
  })

  it("creates invoice on happy path", async () => {
    const prisma = makePrisma({
      bookings: [{ id: BOOK_ID, timeMinutes: 60, description: "Work A" }],
      travelMinutes: 30,
    })
    const caller = createCaller(makeCtx(prisma, [WR_VIEW, BD_CREATE]))
    const result = await caller.generateInvoice({ workReportId: WR_ID })

    expect(result.billingDocumentId).toBe(DOC_ID)
    expect(result.billingDocumentNumber).toBe("RE-123")
  })

  it("uses position overrides when provided", async () => {
    const prisma = makePrisma({
      bookings: [{ id: BOOK_ID, timeMinutes: 60 }],
    })
    const caller = createCaller(makeCtx(prisma, [WR_VIEW, BD_CREATE]))
    await caller.generateInvoice({
      workReportId: WR_ID,
      positions: [
        {
          kind: "manual",
          description: "Sondermaterial",
          quantity: 1,
          unit: "Stk",
          unitPrice: 25,
          vatRate: 19,
        },
      ],
    })

    expect(prisma.billingDocumentPosition.create).toHaveBeenCalledTimes(1)
    const args = prisma.billingDocumentPosition.create.mock.calls[0]![0]
    expect(args.data.description).toBe("Sondermaterial")
  })

  it("returns PRECONDITION_FAILED for DRAFT WorkReport", async () => {
    const prisma = makePrisma({
      reportStatus: "DRAFT",
      bookings: [{ id: BOOK_ID, timeMinutes: 60 }],
    })
    const caller = createCaller(makeCtx(prisma, [WR_VIEW, BD_CREATE]))
    await expect(
      caller.generateInvoice({ workReportId: WR_ID }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" })
  })

  it("returns CONFLICT for SIGNED WorkReport with existing DRAFT invoice", async () => {
    const prisma = makePrisma({
      bookings: [{ id: BOOK_ID, timeMinutes: 60 }],
      existingInvoice: { id: "ex-1", number: "RE-77", status: "DRAFT" },
    })
    const caller = createCaller(makeCtx(prisma, [WR_VIEW, BD_CREATE]))
    await expect(
      caller.generateInvoice({ workReportId: WR_ID }),
    ).rejects.toMatchObject({ code: "CONFLICT" })
  })

  it("returns PRECONDITION_FAILED when ServiceObject is missing", async () => {
    const prisma = makePrisma({
      hasAddress: false,
      bookings: [{ id: BOOK_ID, timeMinutes: 60 }],
    })
    const caller = createCaller(makeCtx(prisma, [WR_VIEW, BD_CREATE]))
    await expect(
      caller.generateInvoice({ workReportId: WR_ID }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" })
  })

  it("returns NOT_FOUND when WorkReport doesn't exist", async () => {
    const prisma = makePrisma({ reportExists: false })
    const caller = createCaller(makeCtx(prisma, [WR_VIEW, BD_CREATE]))
    await expect(
      caller.generateInvoice({ workReportId: WR_ID }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" })
  })
})
