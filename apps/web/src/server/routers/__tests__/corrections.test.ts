/**
 * Tests for corrections tRPC Router
 *
 * Tests the mapToOutput helper function including field mapping,
 * null handling, optional relation handling, and status workflows.
 */

import { describe, it, expect } from "vitest"
import { mapToOutput } from "../corrections"

// --- Test Data Factories ---

const TENANT_ID = "t-00000000-0000-0000-0000-000000000001"
const EMPLOYEE_ID = "e-00000000-0000-0000-0000-000000000001"
const ACCOUNT_ID = "acc-0000000-0000-0000-0000-000000000001"
const CORRECTION_ID = "c-00000000-0000-0000-0000-000000000001"
const USER_ID = "u-00000000-0000-0000-0000-000000000001"
const APPROVER_ID = "u-00000000-0000-0000-0000-000000000002"
const DEPT_ID = "d-00000000-0000-0000-0000-000000000001"

function makeCorrectionRecord(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    id: CORRECTION_ID,
    tenantId: TENANT_ID,
    employeeId: EMPLOYEE_ID,
    correctionDate: new Date("2026-03-09T00:00:00Z"),
    correctionType: "time_adjustment",
    accountId: null,
    valueMinutes: 30,
    reason: "Late arrival correction",
    status: "pending",
    approvedBy: null,
    approvedAt: null,
    createdBy: USER_ID,
    createdAt: new Date("2026-03-08T12:00:00Z"),
    updatedAt: new Date("2026-03-08T12:00:00Z"),
    ...overrides,
  }
}

// --- mapToOutput Tests ---

describe("mapToOutput (corrections)", () => {
  it("maps all core fields correctly", () => {
    const record = makeCorrectionRecord()
    const output = mapToOutput(record)

    expect(output.id).toBe(CORRECTION_ID)
    expect(output.tenantId).toBe(TENANT_ID)
    expect(output.employeeId).toBe(EMPLOYEE_ID)
    expect(output.correctionDate).toEqual(new Date("2026-03-09T00:00:00Z"))
    expect(output.correctionType).toBe("time_adjustment")
    expect(output.accountId).toBeNull()
    expect(output.valueMinutes).toBe(30)
    expect(output.reason).toBe("Late arrival correction")
    expect(output.status).toBe("pending")
    expect(output.approvedBy).toBeNull()
    expect(output.approvedAt).toBeNull()
    expect(output.createdBy).toBe(USER_ID)
    expect(output.createdAt).toEqual(new Date("2026-03-08T12:00:00Z"))
    expect(output.updatedAt).toEqual(new Date("2026-03-08T12:00:00Z"))
  })

  it("handles non-null accountId", () => {
    const record = makeCorrectionRecord({ accountId: ACCOUNT_ID })
    const output = mapToOutput(record)
    expect(output.accountId).toBe(ACCOUNT_ID)
  })

  it("handles null accountId", () => {
    const record = makeCorrectionRecord({ accountId: null })
    const output = mapToOutput(record)
    expect(output.accountId).toBeNull()
  })

  it("handles nullable approvedBy and approvedAt (pending)", () => {
    const record = makeCorrectionRecord()
    const output = mapToOutput(record)
    expect(output.approvedBy).toBeNull()
    expect(output.approvedAt).toBeNull()
  })

  it("handles nullable createdBy (null)", () => {
    const record = makeCorrectionRecord({ createdBy: null })
    const output = mapToOutput(record)
    expect(output.createdBy).toBeNull()
  })

  it("handles nullable createdBy (present)", () => {
    const record = makeCorrectionRecord({ createdBy: USER_ID })
    const output = mapToOutput(record)
    expect(output.createdBy).toBe(USER_ID)
  })

  it("includes employee when present", () => {
    const record = makeCorrectionRecord({
      employee: {
        id: EMPLOYEE_ID,
        firstName: "Max",
        lastName: "Mustermann",
        personnelNumber: "EMP001",
        departmentId: DEPT_ID,
      },
    })
    const output = mapToOutput(record)
    expect(output.employee).toEqual({
      id: EMPLOYEE_ID,
      firstName: "Max",
      lastName: "Mustermann",
      personnelNumber: "EMP001",
      departmentId: DEPT_ID,
    })
  })

  it("includes account when present", () => {
    const record = makeCorrectionRecord({
      account: {
        id: ACCOUNT_ID,
        code: "OT",
        name: "Overtime Account",
      },
    })
    const output = mapToOutput(record)
    expect(output.account).toEqual({
      id: ACCOUNT_ID,
      code: "OT",
      name: "Overtime Account",
    })
  })

  it("sets employee to null when employee relation is null", () => {
    const record = makeCorrectionRecord({ employee: null })
    const output = mapToOutput(record)
    expect(output.employee).toBeNull()
  })

  it("sets account to null when account relation is null", () => {
    const record = makeCorrectionRecord({ account: null })
    const output = mapToOutput(record)
    expect(output.account).toBeNull()
  })

  it("does not include employee key when employee is undefined", () => {
    const record = makeCorrectionRecord()
    delete record.employee
    const output = mapToOutput(record)
    expect(output.employee).toBeUndefined()
  })

  it("does not include account key when account is undefined", () => {
    const record = makeCorrectionRecord()
    delete record.account
    const output = mapToOutput(record)
    expect(output.account).toBeUndefined()
  })

  it("maps approved correction with approvedBy and approvedAt", () => {
    const approvedAt = new Date("2026-03-09T10:00:00Z")
    const record = makeCorrectionRecord({
      status: "approved",
      approvedBy: APPROVER_ID,
      approvedAt,
    })
    const output = mapToOutput(record)
    expect(output.status).toBe("approved")
    expect(output.approvedBy).toBe(APPROVER_ID)
    expect(output.approvedAt).toEqual(approvedAt)
  })

  it("maps rejected correction with approvedBy (uses same field) and approvedAt", () => {
    const rejectedAt = new Date("2026-03-09T11:00:00Z")
    const record = makeCorrectionRecord({
      status: "rejected",
      approvedBy: APPROVER_ID,
      approvedAt: rejectedAt,
    })
    const output = mapToOutput(record)
    expect(output.status).toBe("rejected")
    expect(output.approvedBy).toBe(APPROVER_ID)
    expect(output.approvedAt).toEqual(rejectedAt)
  })

  it("handles employee with null departmentId", () => {
    const record = makeCorrectionRecord({
      employee: {
        id: EMPLOYEE_ID,
        firstName: "Max",
        lastName: "Mustermann",
        personnelNumber: "EMP001",
        departmentId: null,
      },
    })
    const output = mapToOutput(record)
    expect(output.employee?.departmentId).toBeNull()
  })

  it("maps different correction types", () => {
    const record1 = makeCorrectionRecord({ correctionType: "time_adjustment" })
    expect(mapToOutput(record1).correctionType).toBe("time_adjustment")

    const record2 = makeCorrectionRecord({ correctionType: "absence_correction" })
    expect(mapToOutput(record2).correctionType).toBe("absence_correction")
  })

  it("maps negative valueMinutes", () => {
    const record = makeCorrectionRecord({ valueMinutes: -60 })
    const output = mapToOutput(record)
    expect(output.valueMinutes).toBe(-60)
  })

  it("maps zero valueMinutes", () => {
    const record = makeCorrectionRecord({ valueMinutes: 0 })
    const output = mapToOutput(record)
    expect(output.valueMinutes).toBe(0)
  })

  it("maps empty reason", () => {
    const record = makeCorrectionRecord({ reason: "" })
    const output = mapToOutput(record)
    expect(output.reason).toBe("")
  })
})
