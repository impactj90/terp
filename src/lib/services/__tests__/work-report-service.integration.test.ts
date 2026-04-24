/**
 * Integration tests for work-report-service (Phase 2: DRAFT CRUD).
 *
 * Runs against the real Postgres dev DB via Prisma. Guarded by HAS_DB
 * so the suite skips cleanly when DATABASE_URL is unset (CI without
 * `pnpm db:start`). Follows the seed/cleanup pattern established by
 * `service-schedule-service.integration.test.ts`.
 *
 * Plan: 2026-04-22-workreport-arbeitsschein-m1.md (Phase 2)
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { prisma } from "@/lib/db/prisma"
import * as service from "../work-report-service"

const HAS_DB = Boolean(process.env.DATABASE_URL)

// ---------------------------------------------------------------------------
// Fixture IDs — unique prefix `7707` (WR integration test 07) so cleanup
// can target them precisely even after a mid-test crash. All IDs are
// valid UUIDv4 (only hex characters).
// ---------------------------------------------------------------------------

const TENANT_A = "77070000-0000-4000-a000-000000007701"
const TENANT_B = "77070000-0000-4000-a000-000000007702"
const USER_A = "77070000-0000-4000-a000-000000007703"
const ORDER_A = "77070000-0000-4000-a000-000000007704"
const ORDER_B = "77070000-0000-4000-a000-000000007705"
const SO_A = "77070000-0000-4000-a000-000000007706"
const SO_B = "77070000-0000-4000-a000-000000007707"
const CUSTOMER_A = "77070000-0000-4000-a000-000000007708"
const CUSTOMER_B = "77070000-0000-4000-a000-000000007709"
const EMPLOYEE_A = "77070000-0000-4000-a000-00000000770a"

async function cleanupFixtures() {
  const ids = { in: [TENANT_A, TENANT_B] }

  // Delete child rows first, then parents. `.catch(() => {})` swallows
  // "relation does not exist" when migrations are still rolling back.
  await prisma.workReportAttachment
    .deleteMany({ where: { tenantId: ids } })
    .catch(() => {})
  await prisma.workReportAssignment
    .deleteMany({ where: { tenantId: ids } })
    .catch(() => {})
  await prisma.workReport.deleteMany({ where: { tenantId: ids } }).catch(() => {})
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
      { id: TENANT_A, name: "WR IT A", slug: "wr-it-a", isActive: true },
      { id: TENANT_B, name: "WR IT B", slug: "wr-it-b", isActive: true },
    ],
    skipDuplicates: true,
  })

  await prisma.user.upsert({
    where: { id: USER_A },
    update: {},
    create: {
      id: USER_A,
      email: "wr-it@test.local",
      displayName: "WR Tester",
      isActive: true,
    },
  })

  await prisma.crmAddress.createMany({
    data: [
      {
        id: CUSTOMER_A,
        tenantId: TENANT_A,
        number: "K-WR01",
        company: "WR IT Kunde A",
        type: "CUSTOMER",
      },
      {
        id: CUSTOMER_B,
        tenantId: TENANT_B,
        number: "K-WR01",
        company: "WR IT Kunde B",
        type: "CUSTOMER",
      },
    ],
    skipDuplicates: true,
  })

  await prisma.serviceObject.createMany({
    data: [
      {
        id: SO_A,
        tenantId: TENANT_A,
        number: "SO-WR01",
        name: "Kältemaschine A",
        kind: "EQUIPMENT",
        customerAddressId: CUSTOMER_A,
        status: "OPERATIONAL",
        isActive: true,
        qrCodePayload: `TERP:SO:${TENANT_A.substring(0, 6)}:SO-WR01`,
      },
      {
        id: SO_B,
        tenantId: TENANT_B,
        number: "SO-WR01",
        name: "Kältemaschine B",
        kind: "EQUIPMENT",
        customerAddressId: CUSTOMER_B,
        status: "OPERATIONAL",
        isActive: true,
        qrCodePayload: `TERP:SO:${TENANT_B.substring(0, 6)}:SO-WR01`,
      },
    ],
    skipDuplicates: true,
  })

  await prisma.order.createMany({
    data: [
      {
        id: ORDER_A,
        tenantId: TENANT_A,
        code: "A-WR01",
        name: "Auftrag A",
        isActive: true,
        status: "active",
        serviceObjectId: SO_A,
      },
      {
        id: ORDER_B,
        tenantId: TENANT_B,
        code: "A-WR01",
        name: "Auftrag B",
        isActive: true,
        status: "active",
        serviceObjectId: SO_B,
      },
    ],
    skipDuplicates: true,
  })

  await prisma.employee.create({
    data: {
      id: EMPLOYEE_A,
      tenantId: TENANT_A,
      personnelNumber: "WR-IT-001",
      pin: "wr01",
      firstName: "Hans",
      lastName: "Müller",
      entryDate: new Date("2025-01-01"),
    },
  })
}

describe.skipIf(!HAS_DB).sequential("work-report-service integration", () => {
  beforeAll(async () => {
    await cleanupFixtures()
    await seedFixtures()
  })

  afterAll(async () => {
    await cleanupFixtures()
  })

  // -------------------------------------------------------------------------
  // Full create flow
  // -------------------------------------------------------------------------
  it("Happy path: create → getById → listByOrder returns the new record", async () => {
    const created = await service.create(
      prisma,
      TENANT_A,
      {
        orderId: ORDER_A,
        serviceObjectId: SO_A,
        visitDate: "2026-04-22",
        workDescription: "Filter gewechselt",
      },
      { userId: USER_A },
    )

    expect(created.code).toMatch(/^AS-\d+$/)
    expect(created.status).toBe("DRAFT")
    expect(created.tenantId).toBe(TENANT_A)
    expect(created.orderId).toBe(ORDER_A)
    expect(created.serviceObjectId).toBe(SO_A)
    expect(created.workDescription).toBe("Filter gewechselt")
    expect(created.order?.code).toBe("A-WR01")
    expect(created.serviceObject?.number).toBe("SO-WR01")

    const byId = await service.getById(prisma, TENANT_A, created.id)
    expect(byId.id).toBe(created.id)

    const byOrder = await service.listByOrder(prisma, TENANT_A, ORDER_A)
    expect(byOrder.some((r) => r.id === created.id)).toBe(true)
  })

  // -------------------------------------------------------------------------
  // Numbering — sequence increments
  // -------------------------------------------------------------------------
  it("allocates sequential AS- codes on back-to-back creates", async () => {
    const first = await service.create(
      prisma,
      TENANT_A,
      { orderId: ORDER_A, visitDate: "2026-04-22" },
      { userId: USER_A },
    )
    const second = await service.create(
      prisma,
      TENANT_A,
      { orderId: ORDER_A, visitDate: "2026-04-22" },
      { userId: USER_A },
    )

    const firstNumber = Number(first.code.slice(3))
    const secondNumber = Number(second.code.slice(3))
    expect(Number.isNaN(firstNumber)).toBe(false)
    expect(Number.isNaN(secondNumber)).toBe(false)
    expect(secondNumber).toBe(firstNumber + 1)
  })

  // -------------------------------------------------------------------------
  // Update flow with audit changes
  // -------------------------------------------------------------------------
  it("update records change diff in audit log", async () => {
    const created = await service.create(
      prisma,
      TENANT_A,
      {
        orderId: ORDER_A,
        visitDate: "2026-04-22",
        workDescription: "Vor-Update-Beschreibung",
      },
      { userId: USER_A },
    )

    const updated = await service.update(
      prisma,
      TENANT_A,
      { id: created.id, workDescription: "Nach-Update-Beschreibung" },
      { userId: USER_A },
    )

    expect(updated.workDescription).toBe("Nach-Update-Beschreibung")

    // Allow the fire-and-forget audit write to flush (log is async but
    // triggered synchronously before return). We query all logs for this
    // entity and assert the update diff is present.
    const logs = await prisma.auditLog.findMany({
      where: {
        tenantId: TENANT_A,
        entityType: "work_report",
        entityId: created.id,
      },
      orderBy: { performedAt: "asc" },
    })
    expect(logs.length).toBeGreaterThanOrEqual(2)
    const update = logs.find((l) => l.action === "update")
    expect(update).toBeDefined()
    const changes = update?.changes as Record<string, { old: unknown; new: unknown }> | null
    expect(changes?.workDescription?.old).toBe("Vor-Update-Beschreibung")
    expect(changes?.workDescription?.new).toBe("Nach-Update-Beschreibung")
  })

  // -------------------------------------------------------------------------
  // Status guard — update blocked on SIGNED rows
  // -------------------------------------------------------------------------
  it("update on a SIGNED record is rejected as WorkReportValidationError", async () => {
    const created = await service.create(
      prisma,
      TENANT_A,
      { orderId: ORDER_A, visitDate: "2026-04-22" },
      { userId: USER_A },
    )

    // Force SIGNED directly in the DB — Phase 6 will introduce the
    // service-layer `sign()` method. We rely on a raw update here so the
    // Phase 2 test does not need to implement sign-time side effects.
    await prisma.workReport.update({
      where: { id: created.id },
      data: { status: "SIGNED", signedAt: new Date(), signerName: "Test" },
    })

    await expect(
      service.update(
        prisma,
        TENANT_A,
        { id: created.id, workDescription: "Änderung nach Sign" },
        { userId: USER_A },
      ),
    ).rejects.toMatchObject({ name: "WorkReportValidationError" })
  })

  // -------------------------------------------------------------------------
  // Status guard — delete blocked on SIGNED rows
  // -------------------------------------------------------------------------
  it("remove on a SIGNED record is rejected as WorkReportValidationError", async () => {
    const created = await service.create(
      prisma,
      TENANT_A,
      { orderId: ORDER_A, visitDate: "2026-04-22" },
      { userId: USER_A },
    )

    await prisma.workReport.update({
      where: { id: created.id },
      data: { status: "SIGNED", signedAt: new Date(), signerName: "Test" },
    })

    await expect(
      service.remove(prisma, TENANT_A, created.id, { userId: USER_A }),
    ).rejects.toMatchObject({ name: "WorkReportValidationError" })

    // DB row still exists.
    const still = await prisma.workReport.findUnique({
      where: { id: created.id },
    })
    expect(still).not.toBeNull()
  })

  // -------------------------------------------------------------------------
  // DELETE cascades to assignments + attachments (verifies Phase 1 migration)
  // -------------------------------------------------------------------------
  it("remove on a DRAFT record cascades to assignments and attachments", async () => {
    const created = await service.create(
      prisma,
      TENANT_A,
      { orderId: ORDER_A, visitDate: "2026-04-22" },
      { userId: USER_A },
    )

    // Seed one assignment + one attachment directly via Prisma (the
    // service paths live in Phase 3 / Phase 4).
    await prisma.workReportAssignment.create({
      data: {
        tenantId: TENANT_A,
        workReportId: created.id,
        employeeId: EMPLOYEE_A,
        role: "worker",
      },
    })
    await prisma.workReportAttachment.create({
      data: {
        tenantId: TENANT_A,
        workReportId: created.id,
        filename: "foto.jpg",
        storagePath: `${TENANT_A}/${created.id}/stub.jpg`,
        mimeType: "image/jpeg",
        sizeBytes: 1024,
      },
    })

    // Sanity-check that children exist before delete.
    expect(
      await prisma.workReportAssignment.count({
        where: { workReportId: created.id },
      }),
    ).toBe(1)
    expect(
      await prisma.workReportAttachment.count({
        where: { workReportId: created.id },
      }),
    ).toBe(1)

    await service.remove(prisma, TENANT_A, created.id, { userId: USER_A })

    expect(
      await prisma.workReport.count({ where: { id: created.id } }),
    ).toBe(0)
    expect(
      await prisma.workReportAssignment.count({
        where: { workReportId: created.id },
      }),
    ).toBe(0)
    expect(
      await prisma.workReportAttachment.count({
        where: { workReportId: created.id },
      }),
    ).toBe(0)
  })

  // -------------------------------------------------------------------------
  // Cross-tenant isolation
  // -------------------------------------------------------------------------
  it("Tenant-B caller cannot getById a Tenant-A record", async () => {
    const created = await service.create(
      prisma,
      TENANT_A,
      { orderId: ORDER_A, visitDate: "2026-04-22" },
      { userId: USER_A },
    )

    await expect(
      service.getById(prisma, TENANT_B, created.id),
    ).rejects.toMatchObject({ name: "WorkReportNotFoundError" })
  })

  it("create rejects when orderId belongs to another tenant", async () => {
    // Tenant-A caller, but orderId is Tenant-B's order.
    await expect(
      service.create(
        prisma,
        TENANT_A,
        { orderId: ORDER_B, visitDate: "2026-04-22" },
        { userId: USER_A },
      ),
    ).rejects.toMatchObject({ name: "WorkReportValidationError" })
  })

  it("create rejects when serviceObjectId belongs to another tenant", async () => {
    await expect(
      service.create(
        prisma,
        TENANT_A,
        {
          orderId: ORDER_A,
          serviceObjectId: SO_B, // Tenant-B
          visitDate: "2026-04-22",
        },
        { userId: USER_A },
      ),
    ).rejects.toMatchObject({ name: "WorkReportValidationError" })
  })

  // -------------------------------------------------------------------------
  // Parallel-update race-condition — exercises the atomic DRAFT guard
  // -------------------------------------------------------------------------
  it("parallel updates on the same DRAFT record resolve deterministically", async () => {
    const created = await service.create(
      prisma,
      TENANT_A,
      { orderId: ORDER_A, visitDate: "2026-04-22" },
      { userId: USER_A },
    )

    // Both updates target the same row; under the atomic DRAFT guard,
    // each individual updateMany with `{id, tenantId, status:"DRAFT"}`
    // matches exactly once per transaction. Postgres serializes the two
    // writes, so both should succeed (the second sees the post-first
    // row but is still in DRAFT). The important correctness property is
    // that neither throws a NotFound / Conflict error.
    const [a, b] = await Promise.all([
      service.update(
        prisma,
        TENANT_A,
        { id: created.id, workDescription: "A" },
        { userId: USER_A },
      ),
      service.update(
        prisma,
        TENANT_A,
        { id: created.id, workDescription: "B" },
        { userId: USER_A },
      ),
    ])

    // One of the two won the last write; the field is non-null.
    const winner = (await service.getById(prisma, TENANT_A, created.id))
      .workDescription
    expect(["A", "B"]).toContain(winner)
    expect([a.workDescription, b.workDescription]).toContain(winner)
  })

  // -------------------------------------------------------------------------
  // list filter — orderId + status
  // -------------------------------------------------------------------------
  it("list filters by orderId and by status", async () => {
    // Reset this portion of the tenant's WorkReports for a deterministic
    // count. We don't wipe `AuditLog` / other seed data.
    await prisma.workReportAttachment.deleteMany({
      where: { tenantId: TENANT_A },
    })
    await prisma.workReportAssignment.deleteMany({
      where: { tenantId: TENANT_A },
    })
    await prisma.workReport.deleteMany({ where: { tenantId: TENANT_A } })

    const draft = await service.create(
      prisma,
      TENANT_A,
      { orderId: ORDER_A, visitDate: "2026-04-22" },
      { userId: USER_A },
    )
    const draft2 = await service.create(
      prisma,
      TENANT_A,
      { orderId: ORDER_A, visitDate: "2026-04-23" },
      { userId: USER_A },
    )

    await prisma.workReport.update({
      where: { id: draft2.id },
      data: { status: "SIGNED", signedAt: new Date(), signerName: "Test" },
    })

    const draftsOnly = await service.list(prisma, TENANT_A, {
      orderId: ORDER_A,
      status: "DRAFT",
    })
    expect(draftsOnly.total).toBe(1)
    expect(draftsOnly.items[0]?.id).toBe(draft.id)

    const signedOnly = await service.list(prisma, TENANT_A, {
      orderId: ORDER_A,
      status: "SIGNED",
    })
    expect(signedOnly.total).toBe(1)
    expect(signedOnly.items[0]?.id).toBe(draft2.id)
  })
})
