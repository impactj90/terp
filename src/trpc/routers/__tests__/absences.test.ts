/**
 * Tests for absences tRPC Router
 *
 * Tests the helper functions (mapper, data scope, skip date logic) and
 * validates the router structure.
 */

import { describe, it, expect } from "vitest"
import { TRPCError } from "@trpc/server"
import { Decimal } from "@prisma/client/runtime/client"
import {
  mapAbsenceDayToOutput,
  buildAbsenceDataScopeWhere,
  checkAbsenceDataScope,
  shouldSkipDate,
} from "../absences"
import type { DataScope } from "@/lib/auth/middleware"

// --- Test Data Factories ---

const TENANT_ID = "t-00000000-0000-0000-0000-000000000001"
const EMPLOYEE_ID = "e-00000000-0000-0000-0000-000000000001"
const DEPT_ID = "d-00000000-0000-0000-0000-000000000001"
const ABSENCE_ID = "a-00000000-0000-0000-0000-000000000001"
const TYPE_ID = "at-0000000-0000-0000-0000-000000000001"
const USER_ID = "u-00000000-0000-0000-0000-000000000001"

function makeAbsenceDayRecord(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    id: ABSENCE_ID,
    tenantId: TENANT_ID,
    employeeId: EMPLOYEE_ID,
    absenceDate: new Date("2026-03-09T00:00:00Z"),
    absenceTypeId: TYPE_ID,
    duration: new Decimal("1.00"),
    halfDayPeriod: null,
    status: "pending",
    approvedBy: null,
    approvedAt: null,
    rejectionReason: null,
    notes: null,
    createdBy: USER_ID,
    createdAt: new Date("2026-03-08T12:00:00Z"),
    updatedAt: new Date("2026-03-08T12:00:00Z"),
    ...overrides,
  }
}

// Helper to build complete DataScope with required fields
function makeScope(
  overrides: Partial<DataScope> & { type: DataScope["type"] }
): DataScope {
  return {
    tenantIds: [],
    departmentIds: [],
    employeeIds: [],
    ...overrides,
  }
}

// --- mapAbsenceDayToOutput Tests ---

describe("mapAbsenceDayToOutput", () => {
  it("maps all core fields correctly", () => {
    const record = makeAbsenceDayRecord()
    const output = mapAbsenceDayToOutput(record)

    expect(output.id).toBe(ABSENCE_ID)
    expect(output.tenantId).toBe(TENANT_ID)
    expect(output.employeeId).toBe(EMPLOYEE_ID)
    expect(output.absenceTypeId).toBe(TYPE_ID)
    expect(output.status).toBe("pending")
    expect(output.createdBy).toBe(USER_ID)
    expect(output.createdAt).toEqual(new Date("2026-03-08T12:00:00Z"))
    expect(output.updatedAt).toEqual(new Date("2026-03-08T12:00:00Z"))
  })

  it("serializes Decimal duration as number", () => {
    const record = makeAbsenceDayRecord({
      duration: new Decimal("0.50"),
    })
    const output = mapAbsenceDayToOutput(record)
    expect(output.duration).toBe(0.5)
    expect(typeof output.duration).toBe("number")
  })

  it("handles numeric (non-Decimal) duration", () => {
    const record = makeAbsenceDayRecord({ duration: 1 })
    const output = mapAbsenceDayToOutput(record)
    expect(output.duration).toBe(1)
  })

  it("formats absenceDate as YYYY-MM-DD string", () => {
    const record = makeAbsenceDayRecord({
      absenceDate: new Date("2026-03-15T00:00:00Z"),
    })
    const output = mapAbsenceDayToOutput(record)
    expect(output.absenceDate).toBe("2026-03-15")
  })

  it("handles absenceDate that is already a string", () => {
    const record = makeAbsenceDayRecord({
      absenceDate: "2026-03-15",
    })
    const output = mapAbsenceDayToOutput(record)
    expect(output.absenceDate).toBe("2026-03-15")
  })

  it("includes employee when present", () => {
    const record = makeAbsenceDayRecord({
      employee: {
        id: EMPLOYEE_ID,
        firstName: "Max",
        lastName: "Mustermann",
        personnelNumber: "EMP001",
        isActive: true,
        departmentId: DEPT_ID,
      },
    })
    const output = mapAbsenceDayToOutput(record)
    expect(output.employee).toEqual({
      id: EMPLOYEE_ID,
      firstName: "Max",
      lastName: "Mustermann",
      personnelNumber: "EMP001",
      isActive: true,
      departmentId: DEPT_ID,
    })
  })

  it("includes absenceType when present", () => {
    const record = makeAbsenceDayRecord({
      absenceType: {
        id: TYPE_ID,
        code: "VAC",
        name: "Vacation",
        category: "vacation",
        color: "#4CAF50",
        deductsVacation: true,
      },
    })
    const output = mapAbsenceDayToOutput(record)
    expect(output.absenceType).toEqual({
      id: TYPE_ID,
      code: "VAC",
      name: "Vacation",
      category: "vacation",
      color: "#4CAF50",
      deductsVacation: true,
    })
  })

  it("handles null optional fields (approvedBy, approvedAt, rejectionReason, notes)", () => {
    const record = makeAbsenceDayRecord()
    const output = mapAbsenceDayToOutput(record)
    expect(output.approvedBy).toBeNull()
    expect(output.approvedAt).toBeNull()
    expect(output.rejectionReason).toBeNull()
    expect(output.notes).toBeNull()
  })

  it("sets employee to null when employee relation is null", () => {
    const record = makeAbsenceDayRecord({ employee: null })
    const output = mapAbsenceDayToOutput(record)
    expect(output.employee).toBeNull()
  })

  it("does not include employee key when employee is undefined", () => {
    const record = makeAbsenceDayRecord()
    // employee is not in the record (undefined)
    delete record.employee
    const output = mapAbsenceDayToOutput(record)
    expect(output.employee).toBeUndefined()
  })

  it("does not include absenceType key when absenceType is undefined", () => {
    const record = makeAbsenceDayRecord()
    delete record.absenceType
    const output = mapAbsenceDayToOutput(record)
    expect(output.absenceType).toBeUndefined()
  })

  it("maps approved absence with approvedBy and approvedAt", () => {
    const approvedAt = new Date("2026-03-09T10:00:00Z")
    const record = makeAbsenceDayRecord({
      status: "approved",
      approvedBy: USER_ID,
      approvedAt,
    })
    const output = mapAbsenceDayToOutput(record)
    expect(output.status).toBe("approved")
    expect(output.approvedBy).toBe(USER_ID)
    expect(output.approvedAt).toEqual(approvedAt)
  })
})

// --- buildAbsenceDataScopeWhere Tests ---

describe("buildAbsenceDataScopeWhere", () => {
  it("returns null for 'all' scope", () => {
    const scope = makeScope({ type: "all" })
    expect(buildAbsenceDataScopeWhere(scope)).toBeNull()
  })

  it("returns department filter for 'department' scope", () => {
    const scope = makeScope({
      type: "department",
      departmentIds: [DEPT_ID, "dept-2"],
    })
    const result = buildAbsenceDataScopeWhere(scope)
    expect(result).toEqual({
      employee: { departmentId: { in: [DEPT_ID, "dept-2"] } },
    })
  })

  it("returns employeeId filter for 'employee' scope", () => {
    const scope = makeScope({
      type: "employee",
      employeeIds: [EMPLOYEE_ID, "emp-2"],
    })
    const result = buildAbsenceDataScopeWhere(scope)
    expect(result).toEqual({
      employeeId: { in: [EMPLOYEE_ID, "emp-2"] },
    })
  })
})

// --- checkAbsenceDataScope Tests ---

describe("checkAbsenceDataScope", () => {
  it("passes silently for 'all' scope", () => {
    const scope = makeScope({ type: "all" })
    const item = { employeeId: EMPLOYEE_ID }
    expect(() => checkAbsenceDataScope(scope, item)).not.toThrow()
  })

  it("passes when employee is in department scope", () => {
    const scope = makeScope({
      type: "department",
      departmentIds: [DEPT_ID],
    })
    const item = {
      employeeId: EMPLOYEE_ID,
      employee: { departmentId: DEPT_ID },
    }
    expect(() => checkAbsenceDataScope(scope, item)).not.toThrow()
  })

  it("throws FORBIDDEN when employee is not in department scope", () => {
    const scope = makeScope({
      type: "department",
      departmentIds: [DEPT_ID],
    })
    const item = {
      employeeId: EMPLOYEE_ID,
      employee: { departmentId: "other-dept" },
    }
    expect(() => checkAbsenceDataScope(scope, item)).toThrow(TRPCError)
    try {
      checkAbsenceDataScope(scope, item)
    } catch (err) {
      expect((err as TRPCError).code).toBe("FORBIDDEN")
      expect((err as TRPCError).message).toBe(
        "Absence not within data scope"
      )
    }
  })

  it("throws FORBIDDEN when employee has no department in department scope", () => {
    const scope = makeScope({
      type: "department",
      departmentIds: [DEPT_ID],
    })
    const item = {
      employeeId: EMPLOYEE_ID,
      employee: { departmentId: null },
    }
    expect(() => checkAbsenceDataScope(scope, item)).toThrow(TRPCError)
  })

  it("throws FORBIDDEN when employee relation is missing in department scope", () => {
    const scope = makeScope({
      type: "department",
      departmentIds: [DEPT_ID],
    })
    const item = { employeeId: EMPLOYEE_ID }
    expect(() => checkAbsenceDataScope(scope, item)).toThrow(TRPCError)
  })

  it("passes when employee is in employee scope", () => {
    const scope = makeScope({
      type: "employee",
      employeeIds: [EMPLOYEE_ID],
    })
    const item = { employeeId: EMPLOYEE_ID }
    expect(() => checkAbsenceDataScope(scope, item)).not.toThrow()
  })

  it("throws FORBIDDEN when employee is not in employee scope", () => {
    const scope = makeScope({
      type: "employee",
      employeeIds: ["other-emp"],
    })
    const item = { employeeId: EMPLOYEE_ID }
    expect(() => checkAbsenceDataScope(scope, item)).toThrow(TRPCError)
    try {
      checkAbsenceDataScope(scope, item)
    } catch (err) {
      expect((err as TRPCError).code).toBe("FORBIDDEN")
    }
  })
})

// --- shouldSkipDate Tests ---

describe("shouldSkipDate", () => {
  // Build a dayPlanMap with entries for specific dates
  function makeDayPlanMap(
    entries: Array<{ date: string; dayPlanId: string | null }>
  ): Map<string, { dayPlanId: string | null }> {
    const map = new Map<string, { dayPlanId: string | null }>()
    for (const entry of entries) {
      map.set(entry.date, { dayPlanId: entry.dayPlanId })
    }
    return map
  }

  it("skips Saturday (getUTCDay() === 6)", () => {
    // 2026-03-07 is a Saturday
    const saturday = new Date(Date.UTC(2026, 2, 7))
    expect(saturday.getUTCDay()).toBe(6) // sanity check
    const dayPlanMap = makeDayPlanMap([
      { date: "2026-03-07", dayPlanId: "some-plan" },
    ])
    expect(shouldSkipDate(saturday, dayPlanMap)).toBe(true)
  })

  it("skips Sunday (getUTCDay() === 0)", () => {
    // 2026-03-08 is a Sunday
    const sunday = new Date(Date.UTC(2026, 2, 8))
    expect(sunday.getUTCDay()).toBe(0) // sanity check
    const dayPlanMap = makeDayPlanMap([
      { date: "2026-03-08", dayPlanId: "some-plan" },
    ])
    expect(shouldSkipDate(sunday, dayPlanMap)).toBe(true)
  })

  it("does not skip Monday-Friday with valid day plan", () => {
    // 2026-03-09 is a Monday
    const monday = new Date(Date.UTC(2026, 2, 9))
    expect(monday.getUTCDay()).toBe(1) // sanity check
    const dayPlanMap = makeDayPlanMap([
      { date: "2026-03-09", dayPlanId: "some-plan" },
    ])
    expect(shouldSkipDate(monday, dayPlanMap)).toBe(false)
  })

  it("skips when no day plan exists for date", () => {
    // 2026-03-10 is a Tuesday, but no day plan entry
    const tuesday = new Date(Date.UTC(2026, 2, 10))
    expect(tuesday.getUTCDay()).toBe(2) // sanity check
    const dayPlanMap = makeDayPlanMap([]) // empty map
    expect(shouldSkipDate(tuesday, dayPlanMap)).toBe(true)
  })

  it("skips when day plan exists but dayPlanId is null (off-day)", () => {
    // 2026-03-11 is a Wednesday with null dayPlanId (off-day)
    const wednesday = new Date(Date.UTC(2026, 2, 11))
    expect(wednesday.getUTCDay()).toBe(3) // sanity check
    const dayPlanMap = makeDayPlanMap([
      { date: "2026-03-11", dayPlanId: null },
    ])
    expect(shouldSkipDate(wednesday, dayPlanMap)).toBe(true)
  })

  it("does not skip when day plan exists with valid dayPlanId", () => {
    // 2026-03-12 is a Thursday with valid day plan
    const thursday = new Date(Date.UTC(2026, 2, 12))
    expect(thursday.getUTCDay()).toBe(4) // sanity check
    const dayPlanMap = makeDayPlanMap([
      { date: "2026-03-12", dayPlanId: "valid-plan-id" },
    ])
    expect(shouldSkipDate(thursday, dayPlanMap)).toBe(false)
  })

  it("does not skip Friday with valid day plan", () => {
    // 2026-03-13 is a Friday
    const friday = new Date(Date.UTC(2026, 2, 13))
    expect(friday.getUTCDay()).toBe(5) // sanity check
    const dayPlanMap = makeDayPlanMap([
      { date: "2026-03-13", dayPlanId: "valid-plan-id" },
    ])
    expect(shouldSkipDate(friday, dayPlanMap)).toBe(false)
  })
})
