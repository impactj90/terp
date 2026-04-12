/**
 * AUDIT-005 verification tests — direct repository/helper tenant scoping
 *
 * Verifies that:
 * 1. vacation-helpers.resolveTariff includes tenantId in employeeTariffAssignment lookup
 * 2. bookings-repository.findEmployeeDayPlan includes tenantId in where clause
 * 3. System-level assignments (tenantId=null) are excluded by tenant filter
 * 4. Cross-tenant data is excluded by tenant filter
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import type { PrismaClient } from "@/generated/prisma/client"
import { resolveTariff } from "../vacation-helpers"
import { findEmployeeDayPlan } from "../bookings-repository"

// --- Constants ---

const TENANT_A = "a0000000-0000-4000-a000-000000000001"
const TENANT_B = "b0000000-0000-4000-a000-000000000002"
const EMPLOYEE_ID = "e0000000-0000-4000-a000-000000000001"
const TARIFF_ID = "t0000000-0000-4000-a000-000000000001"

// ============================================================================
// Test 1 — resolveTariff includes tenantId in assignment lookup
// ============================================================================

describe("AUDIT-005: resolveTariff tenant scoping", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("AUDIT-005: employeeTariffAssignment.findFirst includes tenantId in where clause", async () => {
    const findFirstMock = vi.fn().mockResolvedValue(null)
    const tariffFindFirstMock = vi.fn().mockResolvedValue({
      id: TARIFF_ID,
      tenantId: TENANT_A,
      name: "Fallback Tariff",
    })

    const prisma = {
      employeeTariffAssignment: {
        findFirst: findFirstMock,
      },
      tariff: {
        findFirst: tariffFindFirstMock,
      },
    } as unknown as PrismaClient

    await resolveTariff(
      prisma,
      { id: EMPLOYEE_ID, tariffId: TARIFF_ID },
      2026,
      TENANT_A
    )

    // Verify findFirst was called
    expect(findFirstMock).toHaveBeenCalledTimes(1)

    // Extract the where clause from the call
    const callArgs = findFirstMock.mock.calls[0]![0]
    const where = callArgs.where

    // tenantId MUST be present in the where clause
    expect(where).toHaveProperty("tenantId", TENANT_A)
    expect(where).toHaveProperty("employeeId", EMPLOYEE_ID)
    expect(where).toHaveProperty("isActive", true)
  })

  it("AUDIT-005: resolveTariff passes correct tenantId (not a different one)", async () => {
    const findFirstMock = vi.fn().mockResolvedValue(null)
    const tariffFindFirstMock = vi.fn().mockResolvedValue(null)

    const prisma = {
      employeeTariffAssignment: {
        findFirst: findFirstMock,
      },
      tariff: {
        findFirst: tariffFindFirstMock,
      },
    } as unknown as PrismaClient

    await resolveTariff(
      prisma,
      { id: EMPLOYEE_ID, tariffId: null },
      2026,
      TENANT_B
    )

    const where = findFirstMock.mock.calls[0]![0].where
    expect(where.tenantId).toBe(TENANT_B)
    // Ensure it is NOT some other tenant
    expect(where.tenantId).not.toBe(TENANT_A)
  })

  it("AUDIT-005: system-level assignments (tenantId=null) are excluded by tenant filter", async () => {
    // If the DB had an assignment with tenantId=null, the where clause
    // { tenantId: TENANT_A } would exclude it because null !== TENANT_A.
    // We verify this by returning an assignment only when tenantId is NOT
    // in the where clause, and null otherwise.
    const findFirstMock = vi.fn().mockImplementation((args: { where: Record<string, unknown> }) => {
      // Simulate: if tenantId is in where, the system-level row (tenantId=null)
      // does NOT match -- return null. This is the correct behavior.
      if (args.where.tenantId) {
        return Promise.resolve(null)
      }
      // If tenantId were missing from where, the system-level row WOULD match
      return Promise.resolve({
        id: "system-assignment",
        tenantId: null,
        employeeId: EMPLOYEE_ID,
        tariff: { id: "system-tariff", tenantId: null, name: "System Tariff" },
      })
    })

    const prisma = {
      employeeTariffAssignment: {
        findFirst: findFirstMock,
      },
      tariff: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    } as unknown as PrismaClient

    const result = await resolveTariff(
      prisma,
      { id: EMPLOYEE_ID, tariffId: null },
      2026,
      TENANT_A
    )

    // The system-level assignment should NOT be returned because tenantId
    // is in the where clause, causing the findFirst to return null
    expect(result).toBeNull()

    // Verify tenantId was indeed in the where clause
    const where = findFirstMock.mock.calls[0]![0].where
    expect(where).toHaveProperty("tenantId", TENANT_A)
  })
})

// ============================================================================
// Test 2 — findEmployeeDayPlan includes tenantId
// ============================================================================

describe("AUDIT-005: findEmployeeDayPlan tenant scoping", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("AUDIT-005: employeeDayPlan.findFirst includes tenantId in where clause", async () => {
    const findFirstMock = vi.fn().mockResolvedValue({
      id: "edp-1",
      tenantId: TENANT_A,
      employeeId: EMPLOYEE_ID,
      planDate: new Date("2026-03-23"),
      dayPlan: { comeFrom: 480, goFrom: 1020 },
    })

    const prisma = {
      employeeDayPlan: {
        findFirst: findFirstMock,
      },
    } as unknown as PrismaClient

    const planDate = new Date("2026-03-23")
    await findEmployeeDayPlan(prisma, TENANT_A, EMPLOYEE_ID, planDate)

    expect(findFirstMock).toHaveBeenCalledTimes(1)

    const callArgs = findFirstMock.mock.calls[0]![0]
    const where = callArgs.where

    // tenantId MUST be present in the where clause
    expect(where).toHaveProperty("tenantId", TENANT_A)
    expect(where).toHaveProperty("employeeId", EMPLOYEE_ID)
    expect(where).toHaveProperty("planDate", planDate)
  })

  it("AUDIT-005: findEmployeeDayPlan requires tenantId parameter (not optional)", async () => {
    const findFirstMock = vi.fn().mockResolvedValue(null)

    const prisma = {
      employeeDayPlan: {
        findFirst: findFirstMock,
      },
    } as unknown as PrismaClient

    // Call with TENANT_B — verify it's passed through
    const planDate = new Date("2026-03-23")
    await findEmployeeDayPlan(prisma, TENANT_B, EMPLOYEE_ID, planDate)

    const where = findFirstMock.mock.calls[0]![0].where
    expect(where.tenantId).toBe(TENANT_B)
    expect(where.tenantId).not.toBe(TENANT_A)
  })

  it("AUDIT-005: cross-tenant day plan excluded — mismatched tenantId returns null", async () => {
    // Simulate: DB only has a day plan for TENANT_A, but query uses TENANT_B
    const findFirstMock = vi.fn().mockImplementation((args: { where: Record<string, unknown> }) => {
      // Only return a result when tenantId matches TENANT_A
      if (args.where.tenantId === TENANT_A) {
        return Promise.resolve({
          id: "edp-1",
          tenantId: TENANT_A,
          employeeId: EMPLOYEE_ID,
          dayPlan: { comeFrom: 480, goFrom: 1020 },
        })
      }
      return Promise.resolve(null)
    })

    const prisma = {
      employeeDayPlan: {
        findFirst: findFirstMock,
      },
    } as unknown as PrismaClient

    // Query with TENANT_B should NOT return TENANT_A's day plan
    const result = await findEmployeeDayPlan(
      prisma,
      TENANT_B,
      EMPLOYEE_ID,
      new Date("2026-03-23")
    )

    expect(result).toBeNull()
  })
})
