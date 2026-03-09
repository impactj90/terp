/**
 * Tests for monthlyValues tRPC Router
 *
 * Tests the helper functions (mappers, data scope, error mapping) and
 * validates the router structure.
 */

import { describe, it, expect } from "vitest"
import { TRPCError } from "@trpc/server"
import { Decimal } from "@prisma/client/runtime/client"
import {
  mapMonthlyValueToOutput,
  mapMonthSummaryToOutput,
  buildMonthlyValueDataScopeWhere,
  checkMonthlyValueDataScope,
  mapServiceError,
} from "../monthlyValues"
import type { DataScope } from "@/lib/auth/middleware"
import type { MonthSummary } from "@/lib/services/monthly-calc.types"
import {
  ERR_FUTURE_MONTH,
  ERR_MONTH_CLOSED,
  ERR_MONTH_NOT_CLOSED,
  ERR_INVALID_MONTH,
  ERR_INVALID_YEAR_MONTH,
  ERR_MONTHLY_VALUE_NOT_FOUND,
  ERR_EMPLOYEE_NOT_FOUND,
} from "@/lib/services/monthly-calc.types"

// --- Test Data Factories ---

const TENANT_ID = "t-00000000-0000-0000-0000-000000000001"
const EMPLOYEE_ID = "e-00000000-0000-0000-0000-000000000001"
const DEPT_ID = "d-00000000-0000-0000-0000-000000000001"
const MV_ID = "mv-0000000-0000-0000-0000-000000000001"
const USER_ID = "u-00000000-0000-0000-0000-000000000001"

function makeMonthlyValueRecord(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    id: MV_ID,
    tenantId: TENANT_ID,
    employeeId: EMPLOYEE_ID,
    year: 2026,
    month: 1,
    totalGrossTime: 9600,
    totalNetTime: 9000,
    totalTargetTime: 9600,
    totalOvertime: 120,
    totalUndertime: 60,
    totalBreakTime: 600,
    flextimeStart: 0,
    flextimeChange: 60,
    flextimeEnd: 60,
    flextimeCarryover: 60,
    vacationTaken: new Decimal("2.5"),
    sickDays: 1,
    otherAbsenceDays: 0,
    workDays: 20,
    daysWithErrors: 0,
    isClosed: false,
    closedAt: null,
    closedBy: null,
    reopenedAt: null,
    reopenedBy: null,
    createdAt: new Date("2026-01-31T12:00:00Z"),
    updatedAt: new Date("2026-01-31T12:00:00Z"),
    ...overrides,
  }
}

function makeMonthSummary(
  overrides: Partial<MonthSummary> = {}
): MonthSummary {
  return {
    employeeId: EMPLOYEE_ID,
    year: 2026,
    month: 1,
    totalGrossTime: 9600,
    totalNetTime: 9000,
    totalTargetTime: 9600,
    totalOvertime: 120,
    totalUndertime: 60,
    totalBreakTime: 600,
    flextimeStart: 0,
    flextimeChange: 60,
    flextimeEnd: 60,
    flextimeCarryover: 60,
    vacationTaken: new Decimal("2.5"),
    sickDays: 1,
    otherAbsenceDays: 0,
    workDays: 20,
    daysWithErrors: 0,
    isClosed: false,
    closedAt: null,
    closedBy: null,
    reopenedAt: null,
    reopenedBy: null,
    warnings: ["some warning"],
    ...overrides,
  }
}

// --- mapMonthlyValueToOutput Tests ---

describe("mapMonthlyValueToOutput", () => {
  it("computes status as 'calculated' when isClosed is false", () => {
    const record = makeMonthlyValueRecord({ isClosed: false })
    const output = mapMonthlyValueToOutput(record)
    expect(output.status).toBe("calculated")
  })

  it("computes status as 'closed' when isClosed is true", () => {
    const closedAt = new Date("2026-02-01T10:00:00Z")
    const record = makeMonthlyValueRecord({
      isClosed: true,
      closedAt,
      closedBy: USER_ID,
    })
    const output = mapMonthlyValueToOutput(record)
    expect(output.status).toBe("closed")
    expect(output.closedAt).toEqual(closedAt)
    expect(output.closedBy).toBe(USER_ID)
  })

  it("computes balanceMinutes as overtime - undertime", () => {
    const record = makeMonthlyValueRecord({
      totalOvertime: 300,
      totalUndertime: 100,
    })
    const output = mapMonthlyValueToOutput(record)
    expect(output.balanceMinutes).toBe(200)
  })

  it("handles negative balance (undertime > overtime)", () => {
    const record = makeMonthlyValueRecord({
      totalOvertime: 50,
      totalUndertime: 200,
    })
    const output = mapMonthlyValueToOutput(record)
    expect(output.balanceMinutes).toBe(-150)
  })

  it("serializes Decimal vacationTaken as number", () => {
    const record = makeMonthlyValueRecord({
      vacationTaken: new Decimal("3.5"),
    })
    const output = mapMonthlyValueToOutput(record)
    expect(output.vacationTaken).toBe(3.5)
    expect(typeof output.vacationTaken).toBe("number")
  })

  it("handles numeric vacationTaken (non-Decimal)", () => {
    const record = makeMonthlyValueRecord({ vacationTaken: 4 })
    const output = mapMonthlyValueToOutput(record)
    expect(output.vacationTaken).toBe(4)
  })

  it("includes employee when present in record", () => {
    const record = makeMonthlyValueRecord({
      employee: {
        id: EMPLOYEE_ID,
        firstName: "Max",
        lastName: "Mustermann",
        personnelNumber: "EMP001",
        isActive: true,
        departmentId: DEPT_ID,
      },
    })
    const output = mapMonthlyValueToOutput(record)
    expect(output.employee).toEqual({
      id: EMPLOYEE_ID,
      firstName: "Max",
      lastName: "Mustermann",
      personnelNumber: "EMP001",
      isActive: true,
      departmentId: DEPT_ID,
    })
  })

  it("sets employee to null when employee relation is null", () => {
    const record = makeMonthlyValueRecord({ employee: null })
    const output = mapMonthlyValueToOutput(record)
    expect(output.employee).toBeNull()
  })

  it("does not include employee key when employee is undefined", () => {
    const record = makeMonthlyValueRecord()
    // employee is not in the record (undefined)
    delete record.employee
    const output = mapMonthlyValueToOutput(record)
    expect(output.employee).toBeUndefined()
  })

  it("maps all core fields correctly", () => {
    const record = makeMonthlyValueRecord()
    const output = mapMonthlyValueToOutput(record)

    expect(output.id).toBe(MV_ID)
    expect(output.tenantId).toBe(TENANT_ID)
    expect(output.employeeId).toBe(EMPLOYEE_ID)
    expect(output.year).toBe(2026)
    expect(output.month).toBe(1)
    expect(output.totalGrossTime).toBe(9600)
    expect(output.totalNetTime).toBe(9000)
    expect(output.totalTargetTime).toBe(9600)
    expect(output.totalBreakTime).toBe(600)
    expect(output.flextimeStart).toBe(0)
    expect(output.flextimeChange).toBe(60)
    expect(output.flextimeEnd).toBe(60)
    expect(output.flextimeCarryover).toBe(60)
    expect(output.sickDays).toBe(1)
    expect(output.otherAbsenceDays).toBe(0)
    expect(output.workDays).toBe(20)
    expect(output.daysWithErrors).toBe(0)
  })

  it("handles null closedAt/closedBy/reopenedAt/reopenedBy", () => {
    const record = makeMonthlyValueRecord()
    const output = mapMonthlyValueToOutput(record)
    expect(output.closedAt).toBeNull()
    expect(output.closedBy).toBeNull()
    expect(output.reopenedAt).toBeNull()
    expect(output.reopenedBy).toBeNull()
  })
})

// --- mapMonthSummaryToOutput Tests ---

describe("mapMonthSummaryToOutput", () => {
  it("maps all fields from MonthSummary correctly", () => {
    const summary = makeMonthSummary()
    const output = mapMonthSummaryToOutput(summary)

    expect(output.employeeId).toBe(EMPLOYEE_ID)
    expect(output.year).toBe(2026)
    expect(output.month).toBe(1)
    expect(output.totalGrossTime).toBe(9600)
    expect(output.totalNetTime).toBe(9000)
    expect(output.totalTargetTime).toBe(9600)
    expect(output.totalOvertime).toBe(120)
    expect(output.totalUndertime).toBe(60)
    expect(output.totalBreakTime).toBe(600)
    expect(output.flextimeStart).toBe(0)
    expect(output.flextimeChange).toBe(60)
    expect(output.flextimeEnd).toBe(60)
    expect(output.flextimeCarryover).toBe(60)
    expect(output.sickDays).toBe(1)
    expect(output.otherAbsenceDays).toBe(0)
    expect(output.workDays).toBe(20)
    expect(output.daysWithErrors).toBe(0)
    expect(output.isClosed).toBe(false)
    expect(output.closedAt).toBeNull()
    expect(output.closedBy).toBeNull()
    expect(output.reopenedAt).toBeNull()
    expect(output.reopenedBy).toBeNull()
    expect(output.warnings).toEqual(["some warning"])
  })

  it("serializes Decimal vacationTaken as number", () => {
    const summary = makeMonthSummary({ vacationTaken: new Decimal("5.0") })
    const output = mapMonthSummaryToOutput(summary)
    expect(output.vacationTaken).toBe(5)
    expect(typeof output.vacationTaken).toBe("number")
  })

  it("handles zero Decimal vacationTaken", () => {
    const summary = makeMonthSummary({ vacationTaken: new Decimal(0) })
    const output = mapMonthSummaryToOutput(summary)
    expect(output.vacationTaken).toBe(0)
  })

  it("preserves closed state", () => {
    const closedAt = new Date("2026-02-01T10:00:00Z")
    const summary = makeMonthSummary({
      isClosed: true,
      closedAt,
      closedBy: USER_ID,
    })
    const output = mapMonthSummaryToOutput(summary)
    expect(output.isClosed).toBe(true)
    expect(output.closedAt).toEqual(closedAt)
    expect(output.closedBy).toBe(USER_ID)
  })
})

// --- buildMonthlyValueDataScopeWhere Tests ---

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

describe("buildMonthlyValueDataScopeWhere", () => {
  it("returns null for 'all' scope", () => {
    const scope = makeScope({ type: "all" })
    expect(buildMonthlyValueDataScopeWhere(scope)).toBeNull()
  })

  it("returns department filter for 'department' scope", () => {
    const scope = makeScope({
      type: "department",
      departmentIds: [DEPT_ID, "dept-2"],
    })
    const result = buildMonthlyValueDataScopeWhere(scope)
    expect(result).toEqual({
      employee: { departmentId: { in: [DEPT_ID, "dept-2"] } },
    })
  })

  it("returns employeeId filter for 'employee' scope", () => {
    const scope = makeScope({
      type: "employee",
      employeeIds: [EMPLOYEE_ID, "emp-2"],
    })
    const result = buildMonthlyValueDataScopeWhere(scope)
    expect(result).toEqual({
      employeeId: { in: [EMPLOYEE_ID, "emp-2"] },
    })
  })
})

// --- checkMonthlyValueDataScope Tests ---

describe("checkMonthlyValueDataScope", () => {
  it("passes silently for 'all' scope", () => {
    const scope = makeScope({ type: "all" })
    const item = { employeeId: EMPLOYEE_ID }
    expect(() => checkMonthlyValueDataScope(scope, item)).not.toThrow()
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
    expect(() => checkMonthlyValueDataScope(scope, item)).not.toThrow()
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
    expect(() => checkMonthlyValueDataScope(scope, item)).toThrow(TRPCError)
    try {
      checkMonthlyValueDataScope(scope, item)
    } catch (err) {
      expect((err as TRPCError).code).toBe("FORBIDDEN")
      expect((err as TRPCError).message).toBe(
        "Monthly value not within data scope"
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
    expect(() => checkMonthlyValueDataScope(scope, item)).toThrow(TRPCError)
  })

  it("throws FORBIDDEN when employee relation is missing in department scope", () => {
    const scope = makeScope({
      type: "department",
      departmentIds: [DEPT_ID],
    })
    const item = { employeeId: EMPLOYEE_ID }
    expect(() => checkMonthlyValueDataScope(scope, item)).toThrow(TRPCError)
  })

  it("passes when employee is in employee scope", () => {
    const scope = makeScope({
      type: "employee",
      employeeIds: [EMPLOYEE_ID],
    })
    const item = { employeeId: EMPLOYEE_ID }
    expect(() => checkMonthlyValueDataScope(scope, item)).not.toThrow()
  })

  it("throws FORBIDDEN when employee is not in employee scope", () => {
    const scope = makeScope({
      type: "employee",
      employeeIds: ["other-emp"],
    })
    const item = { employeeId: EMPLOYEE_ID }
    expect(() => checkMonthlyValueDataScope(scope, item)).toThrow(TRPCError)
    try {
      checkMonthlyValueDataScope(scope, item)
    } catch (err) {
      expect((err as TRPCError).code).toBe("FORBIDDEN")
    }
  })
})

// --- mapServiceError Tests ---

describe("mapServiceError", () => {
  it("maps ERR_MONTHLY_VALUE_NOT_FOUND to NOT_FOUND", () => {
    expect(() =>
      mapServiceError(new Error(ERR_MONTHLY_VALUE_NOT_FOUND))
    ).toThrow(TRPCError)
    try {
      mapServiceError(new Error(ERR_MONTHLY_VALUE_NOT_FOUND))
    } catch (err) {
      expect((err as TRPCError).code).toBe("NOT_FOUND")
      expect((err as TRPCError).message).toBe("Monthly value not found")
    }
  })

  it("maps ERR_EMPLOYEE_NOT_FOUND to NOT_FOUND", () => {
    try {
      mapServiceError(new Error(ERR_EMPLOYEE_NOT_FOUND))
    } catch (err) {
      expect((err as TRPCError).code).toBe("NOT_FOUND")
      expect((err as TRPCError).message).toBe("Employee not found")
    }
  })

  it("maps ERR_MONTH_CLOSED to BAD_REQUEST", () => {
    try {
      mapServiceError(new Error(ERR_MONTH_CLOSED))
    } catch (err) {
      expect((err as TRPCError).code).toBe("BAD_REQUEST")
      expect((err as TRPCError).message).toBe("Month is closed")
    }
  })

  it("maps ERR_MONTH_NOT_CLOSED to BAD_REQUEST", () => {
    try {
      mapServiceError(new Error(ERR_MONTH_NOT_CLOSED))
    } catch (err) {
      expect((err as TRPCError).code).toBe("BAD_REQUEST")
      expect((err as TRPCError).message).toBe("Month is not closed")
    }
  })

  it("maps ERR_INVALID_MONTH to BAD_REQUEST", () => {
    try {
      mapServiceError(new Error(ERR_INVALID_MONTH))
    } catch (err) {
      expect((err as TRPCError).code).toBe("BAD_REQUEST")
      expect((err as TRPCError).message).toBe("Invalid month")
    }
  })

  it("maps ERR_INVALID_YEAR_MONTH to BAD_REQUEST", () => {
    try {
      mapServiceError(new Error(ERR_INVALID_YEAR_MONTH))
    } catch (err) {
      expect((err as TRPCError).code).toBe("BAD_REQUEST")
      expect((err as TRPCError).message).toBe("Invalid year or month")
    }
  })

  it("maps ERR_FUTURE_MONTH to BAD_REQUEST", () => {
    try {
      mapServiceError(new Error(ERR_FUTURE_MONTH))
    } catch (err) {
      expect((err as TRPCError).code).toBe("BAD_REQUEST")
      expect((err as TRPCError).message).toBe("Cannot calculate future month")
    }
  })

  it("maps unknown errors to INTERNAL_SERVER_ERROR", () => {
    try {
      mapServiceError(new Error("something unexpected"))
    } catch (err) {
      expect((err as TRPCError).code).toBe("INTERNAL_SERVER_ERROR")
      expect((err as TRPCError).message).toBe("something unexpected")
    }
  })

  it("handles non-Error values (string)", () => {
    try {
      mapServiceError("raw string error")
    } catch (err) {
      expect((err as TRPCError).code).toBe("INTERNAL_SERVER_ERROR")
      expect((err as TRPCError).message).toBe("raw string error")
    }
  })

  it("always throws (never returns)", () => {
    expect(() => mapServiceError(new Error("test"))).toThrow()
  })
})
