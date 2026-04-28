/**
 * Integration tests for work-report-invoice-bridge-service.
 *
 * Runs against the real Postgres dev DB via Prisma. Guarded by HAS_DB
 * so the suite skips cleanly when DATABASE_URL is unset.
 *
 * Plan: 2026-04-27-rechnungs-uebernahme-arbeitsschein-r1.md (Phase B)
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { prisma } from "@/lib/db/prisma"
import * as bridgeService from "../work-report-invoice-bridge-service"

const HAS_DB = Boolean(process.env.DATABASE_URL)

// ---------------------------------------------------------------------------
// Fixture IDs — unique prefix `8807` (R-1 bridge IT 07).
// ---------------------------------------------------------------------------

const TENANT_A = "88070000-0000-4000-a000-000000008701"
const TENANT_B = "88070000-0000-4000-a000-000000008702"
const USER_A = "88070000-0000-4000-a000-000000008703"
const ORDER_A = "88070000-0000-4000-a000-000000008704"
const SO_A = "88070000-0000-4000-a000-000000008706"
const ADDRESS_A = "88070000-0000-4000-a000-000000008708"
const EMPLOYEE_A = "88070000-0000-4000-a000-00000000870a"
const EMPLOYEE_B = "88070000-0000-4000-a000-00000000870b"
const ACTIVITY_A = "88070000-0000-4000-a000-00000000870c"

async function cleanupFixtures() {
  const ids = { in: [TENANT_A, TENANT_B] }

  // Order matters: delete children before parents.
  await prisma.billingDocumentPosition
    .deleteMany({ where: { document: { tenantId: ids } } })
    .catch(() => {})
  await prisma.billingDocument
    .deleteMany({ where: { tenantId: ids } })
    .catch(() => {})
  await prisma.orderBooking.deleteMany({ where: { tenantId: ids } }).catch(() => {})
  await prisma.workReportAttachment
    .deleteMany({ where: { tenantId: ids } })
    .catch(() => {})
  await prisma.workReportAssignment
    .deleteMany({ where: { tenantId: ids } })
    .catch(() => {})
  await prisma.workReport.deleteMany({ where: { tenantId: ids } }).catch(() => {})
  await prisma.activity.deleteMany({ where: { tenantId: ids } }).catch(() => {})
  await prisma.order.deleteMany({ where: { tenantId: ids } }).catch(() => {})
  await prisma.serviceObject
    .deleteMany({ where: { tenantId: ids } })
    .catch(() => {})
  await prisma.crmAddress.deleteMany({ where: { tenantId: ids } }).catch(() => {})
  await prisma.employee.deleteMany({ where: { tenantId: ids } }).catch(() => {})
  await prisma.numberSequence
    .deleteMany({ where: { tenantId: ids } })
    .catch(() => {})
  await prisma.auditLog.deleteMany({ where: { tenantId: ids } }).catch(() => {})
  await prisma.userTenant.deleteMany({ where: { tenantId: ids } }).catch(() => {})
  await prisma.user.deleteMany({ where: { id: USER_A } }).catch(() => {})
  await prisma.tenant.deleteMany({ where: { id: ids } }).catch(() => {})
}

async function seedFixtures() {
  await prisma.tenant.createMany({
    data: [
      { id: TENANT_A, name: "BR IT A", slug: "br-it-a", isActive: true },
      { id: TENANT_B, name: "BR IT B", slug: "br-it-b", isActive: true },
    ],
    skipDuplicates: true,
  })

  await prisma.user.upsert({
    where: { id: USER_A },
    update: {},
    create: {
      id: USER_A,
      email: "br-it@test.local",
      displayName: "Bridge Tester",
      isActive: true,
    },
  })

  await prisma.crmAddress.create({
    data: {
      id: ADDRESS_A,
      tenantId: TENANT_A,
      number: "K-BR01",
      company: "Bridge IT Kunde A",
      type: "CUSTOMER",
    },
  })

  await prisma.serviceObject.create({
    data: {
      id: SO_A,
      tenantId: TENANT_A,
      number: "SO-BR01",
      name: "Anlage A",
      kind: "EQUIPMENT",
      customerAddressId: ADDRESS_A,
      status: "OPERATIONAL",
      isActive: true,
      qrCodePayload: `TERP:SO:${TENANT_A.substring(0, 6)}:SO-BR01`,
    },
  })

  await prisma.order.create({
    data: {
      id: ORDER_A,
      tenantId: TENANT_A,
      code: "A-BR01",
      name: "Auftrag A",
      isActive: true,
      status: "active",
      serviceObjectId: SO_A,
      billingRatePerHour: 75.0,
    },
  })

  await prisma.employee.createMany({
    data: [
      {
        id: EMPLOYEE_A,
        tenantId: TENANT_A,
        personnelNumber: "BR-001",
        pin: "br01",
        firstName: "Anna",
        lastName: "Schmidt",
        entryDate: new Date("2025-01-01"),
        hourlyRate: 50.0,
      },
      {
        id: EMPLOYEE_B,
        tenantId: TENANT_A,
        personnelNumber: "BR-002",
        pin: "br02",
        firstName: "Bert",
        lastName: "Meier",
        entryDate: new Date("2025-01-01"),
        hourlyRate: 80.0,
      },
    ],
    skipDuplicates: true,
  })

  await prisma.activity.create({
    data: {
      id: ACTIVITY_A,
      tenantId: TENANT_A,
      code: "WART",
      name: "Wartung",
    },
  })
}

async function createSignedWorkReport(opts: {
  travelMinutes?: number | null
  bookings?: Array<{
    employeeId: string
    timeMinutes: number
    description?: string
  }>
}) {
  const wr = await prisma.workReport.create({
    data: {
      tenantId: TENANT_A,
      orderId: ORDER_A,
      serviceObjectId: SO_A,
      code: `AS-IT-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      visitDate: new Date("2026-04-22T00:00:00Z"),
      travelMinutes: opts.travelMinutes ?? null,
      workDescription: "IT-Test-Arbeit",
      status: "SIGNED",
      signedAt: new Date(),
      signerName: "Kunde",
      signerRole: "Hausmeister",
      createdById: USER_A,
    },
  })

  await prisma.workReportAssignment.create({
    data: {
      tenantId: TENANT_A,
      workReportId: wr.id,
      employeeId: EMPLOYEE_A,
    },
  })
  if ((opts.bookings ?? []).some((b) => b.employeeId === EMPLOYEE_B)) {
    await prisma.workReportAssignment.create({
      data: {
        tenantId: TENANT_A,
        workReportId: wr.id,
        employeeId: EMPLOYEE_B,
      },
    })
  }

  for (const b of opts.bookings ?? []) {
    await prisma.orderBooking.create({
      data: {
        tenantId: TENANT_A,
        orderId: ORDER_A,
        employeeId: b.employeeId,
        activityId: ACTIVITY_A,
        bookingDate: new Date("2026-04-22T00:00:00Z"),
        timeMinutes: b.timeMinutes,
        description: b.description ?? null,
        workReportId: wr.id,
        source: "manual",
        createdBy: USER_A,
        updatedBy: USER_A,
      },
    })
  }

  return wr
}

describe.skipIf(!HAS_DB).sequential(
  "work-report-invoice-bridge-service integration",
  () => {
    beforeAll(async () => {
      await cleanupFixtures()
      await seedFixtures()
    })

    afterAll(async () => {
      await cleanupFixtures()
    })

    // -----------------------------------------------------------------
    // Happy path: full document + positions + audit-log dual write
    // -----------------------------------------------------------------
    it("creates a DRAFT BillingDocument with workReportId, all positions, and dual audit logs", async () => {
      const wr = await createSignedWorkReport({
        travelMinutes: 45,
        bookings: [
          { employeeId: EMPLOYEE_A, timeMinutes: 60, description: "Filter A" },
          { employeeId: EMPLOYEE_A, timeMinutes: 90, description: "Filter B" },
        ],
      })

      const result = await bridgeService.generateInvoiceFromWorkReport(
        prisma,
        TENANT_A,
        wr.id,
        USER_A,
        undefined,
        { userId: USER_A, ipAddress: null, userAgent: null },
      )

      expect(result.id).toBeTruthy()
      expect(result.number).toMatch(/^RE-\d+$/)

      const doc = await prisma.billingDocument.findUnique({
        where: { id: result.id },
        include: { positions: { orderBy: { sortOrder: "asc" } } },
      })
      expect(doc).toBeTruthy()
      expect(doc!.workReportId).toBe(wr.id)
      expect(doc!.addressId).toBe(ADDRESS_A)
      expect(doc!.orderId).toBe(ORDER_A)
      expect(doc!.type).toBe("INVOICE")
      expect(doc!.status).toBe("DRAFT")
      // 2 labor + 1 travel = 3 positions
      expect(doc!.positions.length).toBe(3)
      const labor = doc!.positions.filter((p) => p.description?.includes("Filter"))
      expect(labor.length).toBe(2)
      const travel = doc!.positions.find((p) =>
        p.description?.startsWith("Anfahrt"),
      )
      expect(travel).toBeTruthy()
      expect(travel!.unitPrice).toBe(75) // Order rate wins

      // Dual cross-link audit logs.
      const logs = await prisma.auditLog.findMany({
        where: {
          tenantId: TENANT_A,
          OR: [
            { entityType: "work_report", entityId: wr.id, action: "generate_invoice" },
            { entityType: "billing_document", entityId: result.id, action: "create_from_wr" },
          ],
        },
      })
      expect(logs.length).toBe(2)
      const generateLog = logs.find((l) => l.action === "generate_invoice")
      expect(generateLog).toBeTruthy()
      expect(
        (generateLog?.metadata as { generatedDocumentId: string } | null)
          ?.generatedDocumentId,
      ).toBe(result.id)
      const createLog = logs.find((l) => l.action === "create_from_wr")
      expect(createLog).toBeTruthy()
      expect(
        (createLog?.metadata as { sourceWorkReportId: string } | null)
          ?.sourceWorkReportId,
      ).toBe(wr.id)
    })

    // -----------------------------------------------------------------
    // Idempotency: second call throws AlreadyInvoicedConflictError
    // -----------------------------------------------------------------
    it("rejects a second generate with WorkReportAlreadyInvoicedConflictError", async () => {
      const wr = await createSignedWorkReport({
        travelMinutes: 0,
        bookings: [{ employeeId: EMPLOYEE_A, timeMinutes: 60 }],
      })

      const first = await bridgeService.generateInvoiceFromWorkReport(
        prisma,
        TENANT_A,
        wr.id,
        USER_A,
      )
      expect(first.id).toBeTruthy()

      await expect(
        bridgeService.generateInvoiceFromWorkReport(
          prisma,
          TENANT_A,
          wr.id,
          USER_A,
        ),
      ).rejects.toMatchObject({
        name: "WorkReportAlreadyInvoicedConflictError",
        existingDocumentNumber: first.number,
      })
    })

    // -----------------------------------------------------------------
    // Re-generate after CANCELLED: succeeds, leaves history intact
    // -----------------------------------------------------------------
    it("succeeds on re-generate after first invoice is CANCELLED", async () => {
      const wr = await createSignedWorkReport({
        travelMinutes: 0,
        bookings: [{ employeeId: EMPLOYEE_A, timeMinutes: 60 }],
      })

      const first = await bridgeService.generateInvoiceFromWorkReport(
        prisma,
        TENANT_A,
        wr.id,
        USER_A,
      )

      // Manually cancel the first.
      await prisma.billingDocument.update({
        where: { id: first.id },
        data: { status: "CANCELLED" },
      })

      const second = await bridgeService.generateInvoiceFromWorkReport(
        prisma,
        TENANT_A,
        wr.id,
        USER_A,
      )

      expect(second.id).not.toBe(first.id)
      expect(second.number).not.toBe(first.number)

      // Both docs still reference the WorkReport (historical link).
      const docs = await prisma.billingDocument.findMany({
        where: { workReportId: wr.id, tenantId: TENANT_A },
      })
      expect(docs.length).toBe(2)
      const cancelled = docs.find((d) => d.id === first.id)
      const fresh = docs.find((d) => d.id === second.id)
      expect(cancelled?.status).toBe("CANCELLED")
      expect(fresh?.status).toBe("DRAFT")
    })

    // -----------------------------------------------------------------
    // Cross-tenant isolation: throws WorkReportNotFoundError
    // -----------------------------------------------------------------
    it("returns WorkReportNotFoundError when called from a different tenant", async () => {
      const wr = await createSignedWorkReport({
        travelMinutes: 0,
        bookings: [{ employeeId: EMPLOYEE_A, timeMinutes: 60 }],
      })

      await expect(
        bridgeService.generateInvoiceFromWorkReport(
          prisma,
          TENANT_B,
          wr.id,
          USER_A,
        ),
      ).rejects.toMatchObject({ name: "WorkReportNotFoundError" })
    })

    // -----------------------------------------------------------------
    // Missing address: throws WorkReportNoAddressPreconditionFailedError
    // -----------------------------------------------------------------
    it("throws WorkReportNoAddressPreconditionFailedError when ServiceObject is null", async () => {
      const wr = await prisma.workReport.create({
        data: {
          tenantId: TENANT_A,
          orderId: ORDER_A,
          serviceObjectId: null, // <-- no ServiceObject -> no address
          code: `AS-IT-NO-ADDR-${Date.now()}`,
          visitDate: new Date("2026-04-22T00:00:00Z"),
          travelMinutes: 30,
          workDescription: "ohne Adresse",
          status: "SIGNED",
          signedAt: new Date(),
          signerName: "Kunde",
          signerRole: "X",
          createdById: USER_A,
        },
      })
      await prisma.workReportAssignment.create({
        data: {
          tenantId: TENANT_A,
          workReportId: wr.id,
          employeeId: EMPLOYEE_A,
        },
      })

      await expect(
        bridgeService.generateInvoiceFromWorkReport(
          prisma,
          TENANT_A,
          wr.id,
          USER_A,
        ),
      ).rejects.toMatchObject({
        name: "WorkReportNoAddressPreconditionFailedError",
      })
    })

    // -----------------------------------------------------------------
    // Position override: only passed positions land in DB
    // -----------------------------------------------------------------
    it("uses positionsOverride when provided (manual + override editing)", async () => {
      const wr = await createSignedWorkReport({
        travelMinutes: 30, // would normally produce 1 travel position
        bookings: [
          { employeeId: EMPLOYEE_A, timeMinutes: 60 }, // would produce 1 labor
        ],
      })

      // Override: only 1 manual position.
      await bridgeService.generateInvoiceFromWorkReport(
        prisma,
        TENANT_A,
        wr.id,
        USER_A,
        {
          positionsOverride: [
            {
              kind: "manual",
              description: "Sondermaterial",
              quantity: 1,
              unit: "Stk",
              unitPrice: 25,
              vatRate: 19,
            },
          ],
        },
      )

      const doc = await prisma.billingDocument.findFirst({
        where: { tenantId: TENANT_A, workReportId: wr.id },
        include: { positions: true },
      })
      expect(doc?.positions.length).toBe(1)
      expect(doc?.positions[0]?.description).toBe("Sondermaterial")
      expect(doc?.positions[0]?.unitPrice).toBe(25)
    })
  },
)
