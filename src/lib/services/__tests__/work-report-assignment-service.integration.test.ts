/**
 * Integration tests for work-report-assignment-service (Phase 3).
 *
 * Runs against the real Postgres dev DB via Prisma. Guarded by HAS_DB
 * so the suite skips cleanly when DATABASE_URL is unset.
 *
 * Plan: 2026-04-22-workreport-arbeitsschein-m1.md (Phase 3)
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { prisma } from "@/lib/db/prisma"
import * as workReportService from "../work-report-service"
import * as assignmentService from "../work-report-assignment-service"

const HAS_DB = Boolean(process.env.DATABASE_URL)

const TENANT_A = "78130000-0000-4000-a000-000000007801"
const TENANT_B = "78130000-0000-4000-a000-000000007802"
const USER_A = "78130000-0000-4000-a000-000000007803"
const ORDER_A = "78130000-0000-4000-a000-000000007804"
const ORDER_B = "78130000-0000-4000-a000-000000007805"
const EMPLOYEE_A = "78130000-0000-4000-a000-000000007806"
const EMPLOYEE_B = "78130000-0000-4000-a000-000000007807"

async function cleanupFixtures() {
  const tenantIds = { in: [TENANT_A, TENANT_B] }

  await prisma.workReportAttachment
    .deleteMany({ where: { tenantId: tenantIds } })
    .catch(() => {})
  await prisma.workReportAssignment
    .deleteMany({ where: { tenantId: tenantIds } })
    .catch(() => {})
  await prisma.workReport
    .deleteMany({ where: { tenantId: tenantIds } })
    .catch(() => {})
  await prisma.order.deleteMany({ where: { tenantId: tenantIds } }).catch(() => {})
  await prisma.employee
    .deleteMany({ where: { tenantId: tenantIds } })
    .catch(() => {})
  await prisma.numberSequence
    .deleteMany({ where: { tenantId: tenantIds } })
    .catch(() => {})
  await prisma.auditLog
    .deleteMany({ where: { tenantId: tenantIds } })
    .catch(() => {})
  await prisma.userTenant
    .deleteMany({ where: { tenantId: tenantIds } })
    .catch(() => {})
  await prisma.user.deleteMany({ where: { id: USER_A } }).catch(() => {})
  await prisma.tenant.deleteMany({ where: { id: tenantIds } }).catch(() => {})
}

async function seedFixtures() {
  await prisma.tenant.createMany({
    data: [
      { id: TENANT_A, name: "WR Assignment A", slug: "wr-assignment-a", isActive: true },
      { id: TENANT_B, name: "WR Assignment B", slug: "wr-assignment-b", isActive: true },
    ],
    skipDuplicates: true,
  })

  await prisma.user.upsert({
    where: { id: USER_A },
    update: {},
    create: {
      id: USER_A,
      email: "wr-assignment@test.local",
      displayName: "WR Assignment Tester",
      isActive: true,
    },
  })

  await prisma.order.createMany({
    data: [
      {
        id: ORDER_A,
        tenantId: TENANT_A,
        code: "A-WR-ASG-1",
        name: "Assignment Auftrag A",
        isActive: true,
        status: "active",
      },
      {
        id: ORDER_B,
        tenantId: TENANT_B,
        code: "A-WR-ASG-1",
        name: "Assignment Auftrag B",
        isActive: true,
        status: "active",
      },
    ],
    skipDuplicates: true,
  })

  await prisma.employee.createMany({
    data: [
      {
        id: EMPLOYEE_A,
        tenantId: TENANT_A,
        personnelNumber: "WR-ASG-001",
        pin: "asg01",
        firstName: "Hans",
        lastName: "Meier",
        entryDate: new Date("2025-01-01"),
      },
      {
        id: EMPLOYEE_B,
        tenantId: TENANT_B,
        personnelNumber: "WR-ASG-001",
        pin: "asg01",
        firstName: "Erika",
        lastName: "Schulz",
        entryDate: new Date("2025-01-01"),
      },
    ],
    skipDuplicates: true,
  })
}

async function createDraftReport(description = "Assignment test") {
  return workReportService.create(
    prisma,
    TENANT_A,
    {
      orderId: ORDER_A,
      visitDate: "2026-04-22",
      workDescription: description,
    },
    { userId: USER_A },
  )
}

describe.skipIf(!HAS_DB).sequential(
  "work-report-assignment-service integration",
  () => {
    beforeAll(async () => {
      await cleanupFixtures()
      await seedFixtures()
    })

    afterAll(async () => {
      await cleanupFixtures()
    })

    it("full add flow: Add → listByWorkReport contains Employee include", async () => {
      const report = await createDraftReport()

      const added = await assignmentService.add(
        prisma,
        TENANT_A,
        { workReportId: report.id, employeeId: EMPLOYEE_A, role: "Techniker" },
        { userId: USER_A },
      )

      expect(added.workReportId).toBe(report.id)
      expect(added.employeeId).toBe(EMPLOYEE_A)
      expect(added.role).toBe("Techniker")
      expect(added.employee.lastName).toBe("Meier")
      expect(added.workReport.code).toBe(report.code)

      const listed = await assignmentService.listByWorkReport(
        prisma,
        TENANT_A,
        report.id,
      )
      expect(listed).toHaveLength(1)
      expect(listed[0]?.id).toBe(added.id)
      expect(listed[0]?.employee.personnelNumber).toBe("WR-ASG-001")

      const audit = await prisma.auditLog.findFirst({
        where: {
          tenantId: TENANT_A,
          entityType: "work_report",
          entityId: report.id,
          action: "assignment_added",
        },
      })
      expect(audit).not.toBeNull()
      expect(audit?.entityName).toBe(report.code)
    })

    it("parallel identical adds resolve with one winner and one conflict", async () => {
      const report = await createDraftReport()

      const results = await Promise.allSettled([
        assignmentService.add(
          prisma,
          TENANT_A,
          { workReportId: report.id, employeeId: EMPLOYEE_A, role: null },
          { userId: USER_A },
        ),
        assignmentService.add(
          prisma,
          TENANT_A,
          { workReportId: report.id, employeeId: EMPLOYEE_A, role: null },
          { userId: USER_A },
        ),
      ])

      const fulfilled = results.filter((r) => r.status === "fulfilled")
      const rejected = results.filter((r) => r.status === "rejected")
      expect(fulfilled).toHaveLength(1)
      expect(rejected).toHaveLength(1)
      expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({
        name: "WorkReportAssignmentConflictError",
      })

      const count = await prisma.workReportAssignment.count({
        where: { workReportId: report.id, employeeId: EMPLOYEE_A },
      })
      expect(count).toBe(1)
    })

    it("rejects second add of same employee even when roles differ (role=X then role=null)", async () => {
      const report = await createDraftReport()

      await assignmentService.add(
        prisma,
        TENANT_A,
        { workReportId: report.id, employeeId: EMPLOYEE_A, role: "Werkmeister" },
        { userId: USER_A },
      )

      await expect(
        assignmentService.add(
          prisma,
          TENANT_A,
          { workReportId: report.id, employeeId: EMPLOYEE_A, role: null },
          { userId: USER_A },
        ),
      ).rejects.toMatchObject({ name: "WorkReportAssignmentConflictError" })

      const count = await prisma.workReportAssignment.count({
        where: { workReportId: report.id, employeeId: EMPLOYEE_A },
      })
      expect(count).toBe(1)
    })

    it("rejects second add of same employee with a different non-null role", async () => {
      const report = await createDraftReport()

      await assignmentService.add(
        prisma,
        TENANT_A,
        { workReportId: report.id, employeeId: EMPLOYEE_A, role: "Monteur" },
        { userId: USER_A },
      )

      await expect(
        assignmentService.add(
          prisma,
          TENANT_A,
          { workReportId: report.id, employeeId: EMPLOYEE_A, role: "Werkmeister" },
          { userId: USER_A },
        ),
      ).rejects.toMatchObject({ name: "WorkReportAssignmentConflictError" })

      const count = await prisma.workReportAssignment.count({
        where: { workReportId: report.id, employeeId: EMPLOYEE_A },
      })
      expect(count).toBe(1)
    })

    it("delete of the parent DRAFT WorkReport cascades assignments", async () => {
      const report = await createDraftReport()
      await assignmentService.add(
        prisma,
        TENANT_A,
        { workReportId: report.id, employeeId: EMPLOYEE_A, role: "worker" },
        { userId: USER_A },
      )

      expect(
        await prisma.workReportAssignment.count({
          where: { workReportId: report.id },
        }),
      ).toBe(1)

      await workReportService.remove(prisma, TENANT_A, report.id, {
        userId: USER_A,
      })

      expect(
        await prisma.workReportAssignment.count({
          where: { workReportId: report.id },
        }),
      ).toBe(0)
    })

    it("cross-tenant employee assignment is rejected", async () => {
      const report = await createDraftReport()

      await expect(
        assignmentService.add(
          prisma,
          TENANT_A,
          { workReportId: report.id, employeeId: EMPLOYEE_B, role: "worker" },
          { userId: USER_A },
        ),
      ).rejects.toMatchObject({ name: "WorkReportValidationError" })
    })

    it("add and remove are blocked when the parent WorkReport is SIGNED", async () => {
      const report = await createDraftReport()
      const added = await assignmentService.add(
        prisma,
        TENANT_A,
        { workReportId: report.id, employeeId: EMPLOYEE_A, role: "worker" },
        { userId: USER_A },
      )

      await prisma.workReport.update({
        where: { id: report.id },
        data: { status: "SIGNED", signedAt: new Date(), signerName: "Test" },
      })

      await expect(
        assignmentService.add(
          prisma,
          TENANT_A,
          { workReportId: report.id, employeeId: EMPLOYEE_A, role: "leader" },
          { userId: USER_A },
        ),
      ).rejects.toMatchObject({ name: "WorkReportValidationError" })

      await expect(
        assignmentService.remove(prisma, TENANT_A, added.id, { userId: USER_A }),
      ).rejects.toMatchObject({ name: "WorkReportValidationError" })
    })
  },
)
