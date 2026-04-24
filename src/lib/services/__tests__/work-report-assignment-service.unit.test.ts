/**
 * Unit tests for work-report-assignment-service (Phase 3).
 *
 * Uses a hand-rolled Prisma mock — no DB or storage.
 *
 * Plan: 2026-04-22-workreport-arbeitsschein-m1.md (Phase 3)
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { PrismaClient } from "@/generated/prisma/client"
import * as service from "../work-report-assignment-service"

const TENANT_A = "a0000000-0000-4000-a000-000000007801"
const TENANT_B = "a0000000-0000-4000-a000-000000007802"
const USER_ID = "a0000000-0000-4000-a000-000000007803"
const WORK_REPORT_ID = "a0000000-0000-4000-a000-000000007804"
const ASSIGNMENT_ID = "a0000000-0000-4000-a000-000000007805"
const EMPLOYEE_ID = "a0000000-0000-4000-a000-000000007806"

function makeReport(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: WORK_REPORT_ID,
    tenantId: TENANT_A,
    status: "DRAFT",
    code: "AS-1",
    ...overrides,
  }
}

function makeAssignment(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: ASSIGNMENT_ID,
    tenantId: TENANT_A,
    workReportId: WORK_REPORT_ID,
    employeeId: EMPLOYEE_ID,
    role: "worker",
    createdAt: new Date("2026-04-22T10:00:00Z"),
    workReport: { id: WORK_REPORT_ID, code: "AS-1", status: "DRAFT" },
    employee: {
      id: EMPLOYEE_ID,
      firstName: "Hans",
      lastName: "Meier",
      personnelNumber: "WR-001",
    },
    ...overrides,
  }
}

interface PrismaMocks {
  workReportFindFirst: ReturnType<typeof vi.fn>
  employeeFindFirst: ReturnType<typeof vi.fn>
  assignmentFindFirst: ReturnType<typeof vi.fn>
  assignmentFindMany: ReturnType<typeof vi.fn>
  assignmentCreate: ReturnType<typeof vi.fn>
  assignmentDeleteMany: ReturnType<typeof vi.fn>
  auditLogCreate: ReturnType<typeof vi.fn>
}

function makePrisma(): { prisma: PrismaClient; mocks: PrismaMocks } {
  const mocks: PrismaMocks = {
    workReportFindFirst: vi.fn().mockResolvedValue(makeReport()),
    employeeFindFirst: vi.fn().mockResolvedValue({ id: EMPLOYEE_ID }),
    assignmentFindFirst: vi.fn().mockResolvedValue(makeAssignment()),
    assignmentFindMany: vi.fn().mockResolvedValue([makeAssignment()]),
    assignmentCreate: vi.fn().mockResolvedValue(makeAssignment()),
    assignmentDeleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    auditLogCreate: vi.fn().mockResolvedValue({}),
  }

  const prisma = {
    workReport: { findFirst: mocks.workReportFindFirst },
    employee: { findFirst: mocks.employeeFindFirst },
    workReportAssignment: {
      findFirst: mocks.assignmentFindFirst,
      findMany: mocks.assignmentFindMany,
      create: mocks.assignmentCreate,
      deleteMany: mocks.assignmentDeleteMany,
    },
    auditLog: { create: mocks.auditLogCreate },
    platformAuditLog: { create: vi.fn().mockResolvedValue({}) },
  } as unknown as PrismaClient

  return { prisma, mocks }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("listByWorkReport", () => {
  it("lists assignments after verifying parent tenant ownership", async () => {
    const { prisma, mocks } = makePrisma()

    const result = await service.listByWorkReport(
      prisma,
      TENANT_A,
      WORK_REPORT_ID,
    )

    expect(result).toHaveLength(1)
    expect(mocks.workReportFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: WORK_REPORT_ID, tenantId: TENANT_A },
      }),
    )
    expect(mocks.assignmentFindMany.mock.calls[0]![0].where).toMatchObject({
      tenantId: TENANT_A,
      workReportId: WORK_REPORT_ID,
    })
  })

  it("maps a missing parent to WorkReportNotFoundError", async () => {
    const { prisma, mocks } = makePrisma()
    mocks.workReportFindFirst.mockResolvedValueOnce(null)

    await expect(
      service.listByWorkReport(prisma, TENANT_B, WORK_REPORT_ID),
    ).rejects.toMatchObject({ name: "WorkReportNotFoundError" })
  })
})

describe("add", () => {
  it("creates an assignment for a DRAFT WorkReport and writes a parent audit log", async () => {
    const { prisma, mocks } = makePrisma()

    const result = await service.add(
      prisma,
      TENANT_A,
      { workReportId: WORK_REPORT_ID, employeeId: EMPLOYEE_ID, role: " worker " },
      { userId: USER_ID },
    )

    expect(result.id).toBe(ASSIGNMENT_ID)
    expect(mocks.assignmentCreate).toHaveBeenCalledTimes(1)
    const createArgs = mocks.assignmentCreate.mock.calls[0]![0]
    expect(createArgs.data).toMatchObject({
      tenantId: TENANT_A,
      workReportId: WORK_REPORT_ID,
      employeeId: EMPLOYEE_ID,
      role: "worker",
    })

    expect(mocks.auditLogCreate).toHaveBeenCalledTimes(1)
    const auditArgs = mocks.auditLogCreate.mock.calls[0]![0].data
    expect(auditArgs.action).toBe("assignment_added")
    expect(auditArgs.entityType).toBe("work_report")
    expect(auditArgs.entityId).toBe(WORK_REPORT_ID)
    expect(auditArgs.metadata).toMatchObject({
      assignmentId: ASSIGNMENT_ID,
      employeeId: EMPLOYEE_ID,
      role: "worker",
    })
  })

  it("stores omitted or blank role as null", async () => {
    const { prisma, mocks } = makePrisma()

    await service.add(
      prisma,
      TENANT_A,
      { workReportId: WORK_REPORT_ID, employeeId: EMPLOYEE_ID, role: "   " },
      { userId: USER_ID },
    )

    expect(mocks.assignmentCreate.mock.calls[0]![0].data.role).toBeNull()
  })

  it("rejects SIGNED parent records with WorkReportValidationError", async () => {
    const { prisma, mocks } = makePrisma()
    mocks.workReportFindFirst.mockResolvedValueOnce(
      makeReport({ status: "SIGNED" }),
    )

    await expect(
      service.add(
        prisma,
        TENANT_A,
        { workReportId: WORK_REPORT_ID, employeeId: EMPLOYEE_ID },
        { userId: USER_ID },
      ),
    ).rejects.toMatchObject({ name: "WorkReportValidationError" })

    expect(mocks.employeeFindFirst).not.toHaveBeenCalled()
    expect(mocks.assignmentCreate).not.toHaveBeenCalled()
  })

  it("rejects missing or cross-tenant parents with WorkReportNotFoundError", async () => {
    const { prisma, mocks } = makePrisma()
    mocks.workReportFindFirst.mockResolvedValueOnce(null)

    await expect(
      service.add(
        prisma,
        TENANT_B,
        { workReportId: WORK_REPORT_ID, employeeId: EMPLOYEE_ID },
        { userId: USER_ID },
      ),
    ).rejects.toMatchObject({ name: "WorkReportNotFoundError" })
  })

  it("rejects cross-tenant employees with WorkReportValidationError", async () => {
    const { prisma, mocks } = makePrisma()
    mocks.employeeFindFirst.mockResolvedValueOnce(null)

    await expect(
      service.add(
        prisma,
        TENANT_A,
        { workReportId: WORK_REPORT_ID, employeeId: EMPLOYEE_ID },
        { userId: USER_ID },
      ),
    ).rejects.toMatchObject({ name: "WorkReportValidationError" })

    expect(mocks.assignmentCreate).not.toHaveBeenCalled()
  })

  it("maps P2002 to WorkReportAssignmentConflictError", async () => {
    const { prisma, mocks } = makePrisma()
    mocks.assignmentCreate.mockRejectedValueOnce({ code: "P2002" })

    await expect(
      service.add(
        prisma,
        TENANT_A,
        { workReportId: WORK_REPORT_ID, employeeId: EMPLOYEE_ID, role: "worker" },
        { userId: USER_ID },
      ),
    ).rejects.toMatchObject({ name: "WorkReportAssignmentConflictError" })
  })
})

describe("remove", () => {
  it("deletes an assignment from a DRAFT WorkReport and writes a parent audit log", async () => {
    const { prisma, mocks } = makePrisma()

    await service.remove(prisma, TENANT_A, ASSIGNMENT_ID, { userId: USER_ID })

    expect(mocks.assignmentDeleteMany).toHaveBeenCalledTimes(1)
    expect(mocks.assignmentDeleteMany.mock.calls[0]![0].where).toMatchObject({
      id: ASSIGNMENT_ID,
      tenantId: TENANT_A,
    })

    const auditArgs = mocks.auditLogCreate.mock.calls[0]![0].data
    expect(auditArgs.action).toBe("assignment_removed")
    expect(auditArgs.entityId).toBe(WORK_REPORT_ID)
    expect(auditArgs.metadata).toMatchObject({
      assignmentId: ASSIGNMENT_ID,
      employeeId: EMPLOYEE_ID,
      role: "worker",
    })
  })

  it("rejects missing assignments with WorkReportAssignmentNotFoundError", async () => {
    const { prisma, mocks } = makePrisma()
    mocks.assignmentFindFirst.mockResolvedValueOnce(null)

    await expect(
      service.remove(prisma, TENANT_A, ASSIGNMENT_ID, { userId: USER_ID }),
    ).rejects.toMatchObject({ name: "WorkReportAssignmentNotFoundError" })
  })

  it("rejects removal when the parent WorkReport is VOID", async () => {
    const { prisma, mocks } = makePrisma()
    mocks.assignmentFindFirst.mockResolvedValueOnce(makeAssignment())
    mocks.workReportFindFirst.mockResolvedValueOnce(makeReport({ status: "VOID" }))

    await expect(
      service.remove(prisma, TENANT_A, ASSIGNMENT_ID, { userId: USER_ID }),
    ).rejects.toMatchObject({ name: "WorkReportValidationError" })

    expect(mocks.assignmentDeleteMany).not.toHaveBeenCalled()
  })
})
