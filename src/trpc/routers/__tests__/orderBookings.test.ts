/**
 * Tests for orderBookings tRPC Router
 *
 * Tests the mapToOutput helper function including field mapping,
 * null handling, and optional relation handling.
 */

import { describe, it, expect } from "vitest"
import { mapToOutput } from "../orderBookings"

// --- Test Data Factories ---

const TENANT_ID = "t-00000000-0000-0000-0000-000000000001"
const EMPLOYEE_ID = "e-00000000-0000-0000-0000-000000000001"
const ORDER_ID = "o-00000000-0000-0000-0000-000000000001"
const ACTIVITY_ID = "act-0000000-0000-0000-0000-000000000001"
const OB_ID = "ob-0000000-0000-0000-0000-000000000001"
const USER_ID = "u-00000000-0000-0000-0000-000000000001"
const DEPT_ID = "d-00000000-0000-0000-0000-000000000001"

function makeOrderBookingRecord(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    id: OB_ID,
    tenantId: TENANT_ID,
    employeeId: EMPLOYEE_ID,
    orderId: ORDER_ID,
    activityId: null,
    bookingDate: new Date("2026-03-09T00:00:00Z"),
    timeMinutes: 480,
    description: "Test booking",
    source: "manual",
    createdAt: new Date("2026-03-08T12:00:00Z"),
    updatedAt: new Date("2026-03-08T12:00:00Z"),
    createdBy: USER_ID,
    updatedBy: USER_ID,
    ...overrides,
  }
}

// --- mapToOutput Tests ---

describe("mapToOutput (orderBookings)", () => {
  it("maps all core fields correctly", () => {
    const record = makeOrderBookingRecord()
    const output = mapToOutput(record)

    expect(output.id).toBe(OB_ID)
    expect(output.tenantId).toBe(TENANT_ID)
    expect(output.employeeId).toBe(EMPLOYEE_ID)
    expect(output.orderId).toBe(ORDER_ID)
    expect(output.activityId).toBeNull()
    expect(output.bookingDate).toEqual(new Date("2026-03-09T00:00:00Z"))
    expect(output.timeMinutes).toBe(480)
    expect(output.description).toBe("Test booking")
    expect(output.source).toBe("manual")
    expect(output.createdAt).toEqual(new Date("2026-03-08T12:00:00Z"))
    expect(output.updatedAt).toEqual(new Date("2026-03-08T12:00:00Z"))
    expect(output.createdBy).toBe(USER_ID)
    expect(output.updatedBy).toBe(USER_ID)
  })

  it("handles non-null activityId", () => {
    const record = makeOrderBookingRecord({ activityId: ACTIVITY_ID })
    const output = mapToOutput(record)
    expect(output.activityId).toBe(ACTIVITY_ID)
  })

  it("handles null activityId", () => {
    const record = makeOrderBookingRecord({ activityId: null })
    const output = mapToOutput(record)
    expect(output.activityId).toBeNull()
  })

  it("handles nullable description (null)", () => {
    const record = makeOrderBookingRecord({ description: null })
    const output = mapToOutput(record)
    expect(output.description).toBeNull()
  })

  it("handles nullable description (present)", () => {
    const record = makeOrderBookingRecord({ description: "Some work" })
    const output = mapToOutput(record)
    expect(output.description).toBe("Some work")
  })

  it("handles nullable createdBy and updatedBy", () => {
    const record = makeOrderBookingRecord({
      createdBy: null,
      updatedBy: null,
    })
    const output = mapToOutput(record)
    expect(output.createdBy).toBeNull()
    expect(output.updatedBy).toBeNull()
  })

  it("includes employee when present", () => {
    const record = makeOrderBookingRecord({
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

  it("includes order when present", () => {
    const record = makeOrderBookingRecord({
      order: {
        id: ORDER_ID,
        code: "ORD-001",
        name: "Test Order",
      },
    })
    const output = mapToOutput(record)
    expect(output.order).toEqual({
      id: ORDER_ID,
      code: "ORD-001",
      name: "Test Order",
    })
  })

  it("includes activity when present", () => {
    const record = makeOrderBookingRecord({
      activity: {
        id: ACTIVITY_ID,
        code: "ACT-001",
        name: "Development",
      },
    })
    const output = mapToOutput(record)
    expect(output.activity).toEqual({
      id: ACTIVITY_ID,
      code: "ACT-001",
      name: "Development",
    })
  })

  it("sets employee to null when employee relation is null", () => {
    const record = makeOrderBookingRecord({ employee: null })
    const output = mapToOutput(record)
    expect(output.employee).toBeNull()
  })

  it("sets order to null when order relation is null", () => {
    const record = makeOrderBookingRecord({ order: null })
    const output = mapToOutput(record)
    expect(output.order).toBeNull()
  })

  it("sets activity to null when activity relation is null", () => {
    const record = makeOrderBookingRecord({ activity: null })
    const output = mapToOutput(record)
    expect(output.activity).toBeNull()
  })

  it("does not include employee key when employee is undefined", () => {
    const record = makeOrderBookingRecord()
    // employee is not in the record (undefined)
    delete record.employee
    const output = mapToOutput(record)
    expect(output.employee).toBeUndefined()
  })

  it("does not include order key when order is undefined", () => {
    const record = makeOrderBookingRecord()
    delete record.order
    const output = mapToOutput(record)
    expect(output.order).toBeUndefined()
  })

  it("does not include activity key when activity is undefined", () => {
    const record = makeOrderBookingRecord()
    delete record.activity
    const output = mapToOutput(record)
    expect(output.activity).toBeUndefined()
  })

  it("handles employee with null departmentId", () => {
    const record = makeOrderBookingRecord({
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

  it("maps different source values", () => {
    const autoRecord = makeOrderBookingRecord({ source: "auto" })
    expect(mapToOutput(autoRecord).source).toBe("auto")

    const importRecord = makeOrderBookingRecord({ source: "import" })
    expect(mapToOutput(importRecord).source).toBe("import")
  })
})
