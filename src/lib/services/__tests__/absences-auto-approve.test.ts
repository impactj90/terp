/**
 * Tests for auto-approve logic in absences service.
 *
 * When an AbsenceType has requiresApproval=false, createRange should
 * set status to "approved" with approvedBy/approvedAt immediately.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock the repository and recalc before importing the service
vi.mock("../absences-repository", () => ({
  findActiveAbsenceType: vi.fn(),
  findEmployeeDayPlans: vi.fn(),
  findExistingAbsences: vi.fn(),
  createMany: vi.fn(),
  findCreatedAbsences: vi.fn(),
  findVacationDeductingTypes: vi.fn(),
  findApprovedAbsenceDaysForYear: vi.fn(),
  findEmployeeDayPlansWithVacationDeduction: vi.fn(),
  upsertVacationBalance: vi.fn(),
}))

vi.mock("../audit-logs-service", () => ({
  log: vi.fn().mockResolvedValue(undefined),
  computeChanges: vi.fn().mockReturnValue(null),
}))

vi.mock("@/lib/services/recalc", () => ({
  RecalcService: class {
    async triggerRecalc() {}
    async triggerRecalcRange() {}
  },
}))

import * as repo from "../absences-repository"
import { createRange } from "../absences-service"

const mockedRepo = vi.mocked(repo)

// --- Constants ---

const TENANT_ID = "t-00000000-0000-0000-0000-000000000001"
const EMPLOYEE_ID = "e-00000000-0000-0000-0000-000000000001"
const TYPE_ID = "at-0000000-0000-0000-0000-000000000001"
const USER_ID = "u-00000000-0000-0000-0000-000000000001"
const AUDIT = { userId: USER_ID, ipAddress: "127.0.0.1", userAgent: "test" }

// --- Fake Prisma ---

function makeFakePrisma() {
  return {
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      return fn(fakePrisma)
    }),
  } as unknown as Parameters<typeof createRange>[0]
}

let fakePrisma: ReturnType<typeof makeFakePrisma>

// --- Helpers ---

function makeAbsenceType(overrides: Record<string, unknown> = {}) {
  return {
    id: TYPE_ID,
    tenantId: TENANT_ID,
    code: "U01",
    name: "Urlaub",
    description: null,
    category: "vacation",
    portion: 1,
    holidayCode: null,
    priority: 0,
    deductsVacation: false,
    requiresApproval: true,
    requiresDocument: false,
    color: "#4CAF50",
    sortOrder: 0,
    isSystem: false,
    isActive: true,
    absenceTypeGroupId: null,
    calculationRuleId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

function setupDayPlans(dates: string[]) {
  mockedRepo.findEmployeeDayPlans.mockResolvedValue(
    dates.map((d) => ({
      planDate: new Date(`${d}T00:00:00Z`),
      dayPlanId: "plan-1",
    }))
  )
}

function setupNoExistingAbsences() {
  mockedRepo.findExistingAbsences.mockResolvedValue([])
}

// --- Tests ---

beforeEach(() => {
  vi.clearAllMocks()
  fakePrisma = makeFakePrisma()
  mockedRepo.createMany.mockResolvedValue({ count: 1 })
  mockedRepo.findCreatedAbsences.mockResolvedValue([])
  setupNoExistingAbsences()
})

describe("createRange auto-approve", () => {
  it("creates absences with status 'approved' when requiresApproval=false", async () => {
    mockedRepo.findActiveAbsenceType.mockResolvedValue(
      makeAbsenceType({ requiresApproval: false })
    )
    setupDayPlans(["2026-03-16"]) // Monday

    await createRange(
      fakePrisma,
      TENANT_ID,
      {
        employeeId: EMPLOYEE_ID,
        absenceTypeId: TYPE_ID,
        fromDate: "2026-03-16",
        toDate: "2026-03-16",
        duration: 1,
      },
      AUDIT
    )

    expect(mockedRepo.createMany).toHaveBeenCalledTimes(1)
    const createData = mockedRepo.createMany.mock.calls[0]![1]
    expect(createData).toHaveLength(1)
    expect(createData[0]).toMatchObject({
      status: "approved",
      approvedBy: USER_ID,
    })
    expect(createData[0]!.approvedAt).toBeInstanceOf(Date)
  })

  it("creates absences with status 'pending' when requiresApproval=true", async () => {
    mockedRepo.findActiveAbsenceType.mockResolvedValue(
      makeAbsenceType({ requiresApproval: true })
    )
    setupDayPlans(["2026-03-16"])

    await createRange(
      fakePrisma,
      TENANT_ID,
      {
        employeeId: EMPLOYEE_ID,
        absenceTypeId: TYPE_ID,
        fromDate: "2026-03-16",
        toDate: "2026-03-16",
        duration: 1,
      },
      AUDIT
    )

    expect(mockedRepo.createMany).toHaveBeenCalledTimes(1)
    const createData = mockedRepo.createMany.mock.calls[0]![1]
    expect(createData[0]).toMatchObject({
      status: "pending",
      approvedBy: null,
      approvedAt: null,
    })
  })

  it("passes correct status to findCreatedAbsences for auto-approved", async () => {
    mockedRepo.findActiveAbsenceType.mockResolvedValue(
      makeAbsenceType({ requiresApproval: false })
    )
    setupDayPlans(["2026-03-16"])

    await createRange(
      fakePrisma,
      TENANT_ID,
      {
        employeeId: EMPLOYEE_ID,
        absenceTypeId: TYPE_ID,
        fromDate: "2026-03-16",
        toDate: "2026-03-16",
        duration: 1,
      },
      AUDIT
    )

    expect(mockedRepo.findCreatedAbsences).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_ID,
      expect.objectContaining({ status: "approved" })
    )
  })

  it("recalculates vacation balance when auto-approve + deductsVacation", async () => {
    mockedRepo.findActiveAbsenceType.mockResolvedValue(
      makeAbsenceType({ requiresApproval: false, deductsVacation: true })
    )
    setupDayPlans(["2026-03-16"])
    mockedRepo.findVacationDeductingTypes.mockResolvedValue([{ id: TYPE_ID }])
    mockedRepo.findApprovedAbsenceDaysForYear.mockResolvedValue([])
    mockedRepo.findEmployeeDayPlansWithVacationDeduction.mockResolvedValue([])

    await createRange(
      fakePrisma,
      TENANT_ID,
      {
        employeeId: EMPLOYEE_ID,
        absenceTypeId: TYPE_ID,
        fromDate: "2026-03-16",
        toDate: "2026-03-16",
        duration: 1,
      },
      AUDIT
    )

    expect(mockedRepo.upsertVacationBalance).toHaveBeenCalledTimes(1)
    expect(mockedRepo.upsertVacationBalance).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_ID,
      EMPLOYEE_ID,
      2026,
      expect.any(Number)
    )
  })

  it("does NOT recalculate vacation when requiresApproval=true (pending)", async () => {
    mockedRepo.findActiveAbsenceType.mockResolvedValue(
      makeAbsenceType({ requiresApproval: true, deductsVacation: true })
    )
    setupDayPlans(["2026-03-16"])

    await createRange(
      fakePrisma,
      TENANT_ID,
      {
        employeeId: EMPLOYEE_ID,
        absenceTypeId: TYPE_ID,
        fromDate: "2026-03-16",
        toDate: "2026-03-16",
        duration: 1,
      },
      AUDIT
    )

    expect(mockedRepo.upsertVacationBalance).not.toHaveBeenCalled()
  })

  it("does NOT recalculate vacation when auto-approve but deductsVacation=false", async () => {
    mockedRepo.findActiveAbsenceType.mockResolvedValue(
      makeAbsenceType({ requiresApproval: false, deductsVacation: false })
    )
    setupDayPlans(["2026-03-16"])

    await createRange(
      fakePrisma,
      TENANT_ID,
      {
        employeeId: EMPLOYEE_ID,
        absenceTypeId: TYPE_ID,
        fromDate: "2026-03-16",
        toDate: "2026-03-16",
        duration: 1,
      },
      AUDIT
    )

    expect(mockedRepo.upsertVacationBalance).not.toHaveBeenCalled()
  })
})
