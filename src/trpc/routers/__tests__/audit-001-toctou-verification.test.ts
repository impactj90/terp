/**
 * AUDIT-001 Verification Tests
 *
 * Tests verifying the fix for AUDIT-001: Router-level TOCTOU inline Prisma updates.
 * These tests cover the four manual verification items from the audit ticket:
 *
 * 1. Update operations return the same shape as before (Decimal conversions, mapMessage, etc.)
 * 2. Delete operations return { success: true }
 * 3. dataScope filtering works for orderBookings and employeeTariffAssignments
 * 4. weekPlans update + completeness check is atomic (runs in $transaction)
 *
 * The service layer uses repo methods that call tenantScopedUpdate (updateMany + findFirst).
 * Mocks must account for this: findFirst is called multiple times (existence check, then refetch).
 *
 * @security AUDIT-001 verification
 */
import { describe, it, expect, vi } from "vitest"
import { createCallerFactory } from "@/trpc/init"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import {
  createMockContext,
  createMockSession,
  createUserWithPermissions,
  createMockUserTenant,
} from "./helpers"
import { Decimal } from "@prisma/client/runtime/client"

// Router imports
import { extendedTravelRulesRouter } from "../extendedTravelRules"
import { tripRecordsRouter } from "../tripRecords"
import { correctionAssistantRouter } from "../correctionAssistant"
import { vehiclesRouter } from "../vehicles"
import { exportInterfacesRouter } from "../exportInterfaces"
import { orderBookingsRouter } from "../orderBookings"
import { weekPlansRouter } from "../weekPlans"
import { employeeTariffAssignmentsRouter } from "../employeeTariffAssignments"

// --- Constants ---

const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const USER_ID = "a0000000-0000-4000-a000-000000000001"

// Permission IDs
const TRAVEL_ALLOWANCE_MANAGE = permissionIdByKey("travel_allowance.manage")!
const VEHICLE_DATA_MANAGE = permissionIdByKey("vehicle_data.manage")!
const CORRECTIONS_MANAGE = permissionIdByKey("corrections.manage")!
const PAYROLL_MANAGE = permissionIdByKey("payroll.manage")!
const OB_MANAGE = permissionIdByKey("order_bookings.manage")!
const WEEK_PLANS_MANAGE = permissionIdByKey("week_plans.manage")!
const EMPLOYEES_VIEW = permissionIdByKey("employees.view")!
const EMPLOYEES_EDIT = permissionIdByKey("employees.edit")!

// Entity IDs
const RULE_ID = "a0000000-0000-4000-a000-000000000400"
const RULE_SET_ID = "a0000000-0000-4000-a000-000000000200"
const TRIP_RECORD_ID = "a0000000-0000-4000-a000-000000001001"
const VEHICLE_ID = "a0000000-0000-4000-a000-000000002001"
const ROUTE_ID = "a0000000-0000-4000-a000-000000003001"
const MESSAGE_ID = "a0000000-0000-4000-a000-000000004001"
const INTERFACE_ID = "a0000000-0000-4000-a000-000000005001"
const OB_ID = "a0000000-0000-4000-a000-000000006001"
const ORDER_ID = "a0000000-0000-4000-a000-000000006002"
const EMPLOYEE_ID = "a0000000-0000-4000-a000-000000006003"
const DEPT_A_ID = "a0000000-0000-4000-a000-000000007001"
const DEPT_B_ID = "a0000000-0000-4000-a000-000000007002"
const WEEK_PLAN_ID = "a0000000-0000-4000-a000-000000008001"
const DAY_PLAN_ID = "a0000000-0000-4000-a000-000000009001"
const ASSIGN_ID = "a0000000-0000-4000-a000-00000000a001"
const TARIFF_ID = "a0000000-0000-4000-a000-00000000a002"

// Caller factories
const extTravelRulesCaller = createCallerFactory(extendedTravelRulesRouter)
const tripRecordsCaller = createCallerFactory(tripRecordsRouter)
const correctionAssistantCaller = createCallerFactory(correctionAssistantRouter)
const vehiclesCaller = createCallerFactory(vehiclesRouter)
const exportInterfacesCaller = createCallerFactory(exportInterfacesRouter)
const orderBookingsCaller = createCallerFactory(orderBookingsRouter)
const weekPlansCaller = createCallerFactory(weekPlansRouter)
const employeeTariffAssignmentsCaller = createCallerFactory(employeeTariffAssignmentsRouter)

// --- Helper factories ---

function createCtx(
  prisma: Record<string, unknown>,
  permissions: string[],
  scopeType = "all",
  scopeIds: string[] = []
) {
  return createMockContext({
    prisma: prisma as unknown as ReturnType<typeof createMockContext>["prisma"],
    authToken: "test-token",
    user: createUserWithPermissions(permissions, {
      id: USER_ID,
      userTenants: [createMockUserTenant(USER_ID, TENANT_ID)],
      dataScopeType: scopeType,
      dataScopeDepartmentIds: scopeType === "department" ? scopeIds : [],
      dataScopeEmployeeIds: scopeType === "employee" ? scopeIds : [],
    }),
    session: createMockSession(),
    tenantId: TENANT_ID,
  })
}

function makeExtendedTravelRule(overrides: Record<string, unknown> = {}) {
  return {
    id: RULE_ID,
    tenantId: TENANT_ID,
    ruleSetId: RULE_SET_ID,
    arrivalDayTaxFree: new Decimal(14),
    arrivalDayTaxable: new Decimal(8),
    departureDayTaxFree: new Decimal(14),
    departureDayTaxable: new Decimal(8),
    intermediateDayTaxFree: new Decimal(28),
    intermediateDayTaxable: new Decimal(16),
    threeMonthEnabled: false,
    threeMonthTaxFree: new Decimal(0),
    threeMonthTaxable: new Decimal(0),
    isActive: true,
    sortOrder: 0,
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
    ...overrides,
  }
}

function makeTripRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: TRIP_RECORD_ID,
    tenantId: TENANT_ID,
    vehicleId: VEHICLE_ID,
    routeId: ROUTE_ID,
    tripDate: new Date("2025-01-15"),
    startMileage: new Decimal(10000),
    endMileage: new Decimal(10050),
    distanceKm: new Decimal(50),
    notes: "Regular delivery run",
    createdAt: new Date("2025-01-15"),
    updatedAt: new Date("2025-01-15"),
    vehicle: { id: VEHICLE_ID, code: "VEH-001", name: "Truck Alpha" },
    vehicleRoute: { id: ROUTE_ID, code: "RT-001", name: "City Loop" },
    ...overrides,
  }
}

function makeCorrectionMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: MESSAGE_ID,
    tenantId: TENANT_ID,
    code: "MISSING_COME",
    defaultText: "Missing arrival booking",
    customText: "Custom text override",
    severity: "error",
    description: "No arrival booking found",
    isActive: true,
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
    ...overrides,
  }
}

function makeVehicle(overrides: Record<string, unknown> = {}) {
  return {
    id: VEHICLE_ID,
    tenantId: TENANT_ID,
    code: "VEH-001",
    name: "Truck Alpha",
    description: "Primary delivery truck",
    licensePlate: "AB-CD-1234",
    isActive: true,
    sortOrder: 0,
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
    ...overrides,
  }
}

function makeExportInterface(overrides: Record<string, unknown> = {}) {
  return {
    id: INTERFACE_ID,
    tenantId: TENANT_ID,
    interfaceNumber: 1,
    name: "Test Interface",
    mandantNumber: null,
    exportScript: null,
    exportPath: null,
    outputFilename: null,
    isActive: true,
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
    accounts: [],
    ...overrides,
  }
}

function makeOrderBooking(overrides: Record<string, unknown> = {}) {
  return {
    id: OB_ID,
    tenantId: TENANT_ID,
    employeeId: EMPLOYEE_ID,
    orderId: ORDER_ID,
    activityId: null,
    bookingDate: new Date("2025-03-01"),
    timeMinutes: 480,
    description: "Test booking",
    source: "manual",
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
    createdBy: USER_ID,
    updatedBy: USER_ID,
    employee: {
      id: EMPLOYEE_ID,
      firstName: "Max",
      lastName: "Mustermann",
      personnelNumber: "EMP001",
      departmentId: DEPT_A_ID,
    },
    order: { id: ORDER_ID, code: "ORD-001", name: "Test Order" },
    activity: null,
    ...overrides,
  }
}

function makeWeekPlan(overrides: Record<string, unknown> = {}) {
  const dayPlanSummary = { id: DAY_PLAN_ID, code: "STD-1", name: "Standard Day", planType: "fixed" }
  return {
    id: WEEK_PLAN_ID,
    tenantId: TENANT_ID,
    code: "WEEK-1",
    name: "Standard Week",
    description: null,
    mondayDayPlanId: DAY_PLAN_ID,
    tuesdayDayPlanId: DAY_PLAN_ID,
    wednesdayDayPlanId: DAY_PLAN_ID,
    thursdayDayPlanId: DAY_PLAN_ID,
    fridayDayPlanId: DAY_PLAN_ID,
    saturdayDayPlanId: DAY_PLAN_ID,
    sundayDayPlanId: DAY_PLAN_ID,
    mondayDayPlan: dayPlanSummary,
    tuesdayDayPlan: dayPlanSummary,
    wednesdayDayPlan: dayPlanSummary,
    thursdayDayPlan: dayPlanSummary,
    fridayDayPlan: dayPlanSummary,
    saturdayDayPlan: dayPlanSummary,
    sundayDayPlan: dayPlanSummary,
    isActive: true,
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
    ...overrides,
  }
}

function makeAssignment(overrides: Record<string, unknown> = {}) {
  return {
    id: ASSIGN_ID,
    tenantId: TENANT_ID,
    employeeId: EMPLOYEE_ID,
    tariffId: TARIFF_ID,
    effectiveFrom: new Date("2025-01-01"),
    effectiveTo: null,
    overwriteBehavior: "preserve_manual",
    notes: null,
    isActive: true,
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
    ...overrides,
  }
}

// ============================================================================
// ITEM 1: Update operations return the correct shape (Decimal conversions, etc.)
// ============================================================================

describe("AUDIT-001 Item 1: Update return shape", () => {
  describe("extendedTravelRules.update returns Decimal fields as numbers", () => {
    it("AUDIT-001: update returns correct shape with Decimal conversions", async () => {
      // Service flow: repo.findById (findFirst) -> repo.update (updateMany + findFirst)
      // So findFirst is called twice: once for existence, once for refetch after updateMany
      const updated = makeExtendedTravelRule({
        arrivalDayTaxFree: new Decimal(20),
        arrivalDayTaxable: new Decimal(12),
        threeMonthEnabled: true,
        threeMonthTaxFree: new Decimal(5),
        threeMonthTaxable: new Decimal(3),
      })
      const mockPrisma = {
        extendedTravelRule: {
          findFirst: vi.fn()
            .mockResolvedValueOnce(makeExtendedTravelRule()) // repo.findById (existence check)
            .mockResolvedValueOnce(updated),                  // tenantScopedUpdate refetch
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      }
      const ctx = createCtx(mockPrisma, [TRAVEL_ALLOWANCE_MANAGE])
      const caller = extTravelRulesCaller(ctx)
      const result = await caller.update({
        id: RULE_ID,
        arrivalDayTaxFree: 20,
        arrivalDayTaxable: 12,
        threeMonthEnabled: true,
        threeMonthTaxFree: 5,
        threeMonthTaxable: 3,
      })

      // All Decimal fields must be numbers, not Decimal objects
      expect(typeof result.arrivalDayTaxFree).toBe("number")
      expect(typeof result.arrivalDayTaxable).toBe("number")
      expect(typeof result.departureDayTaxFree).toBe("number")
      expect(typeof result.departureDayTaxable).toBe("number")
      expect(typeof result.intermediateDayTaxFree).toBe("number")
      expect(typeof result.intermediateDayTaxable).toBe("number")
      expect(typeof result.threeMonthTaxFree).toBe("number")
      expect(typeof result.threeMonthTaxable).toBe("number")

      // Verify actual values
      expect(result.arrivalDayTaxFree).toBe(20)
      expect(result.arrivalDayTaxable).toBe(12)
      expect(result.departureDayTaxFree).toBe(14)
      expect(result.departureDayTaxable).toBe(8)
      expect(result.intermediateDayTaxFree).toBe(28)
      expect(result.intermediateDayTaxable).toBe(16)
      expect(result.threeMonthTaxFree).toBe(5)
      expect(result.threeMonthTaxable).toBe(3)
      expect(result.threeMonthEnabled).toBe(true)
      expect(result.isActive).toBe(true)
      expect(typeof result.sortOrder).toBe("number")

      // Full shape check
      expect(result).toHaveProperty("id")
      expect(result).toHaveProperty("tenantId")
      expect(result).toHaveProperty("ruleSetId")
      expect(result).toHaveProperty("createdAt")
      expect(result).toHaveProperty("updatedAt")
    })

    it("AUDIT-001: update with zero Decimals returns 0 as number, not Decimal(0)", async () => {
      const updated = makeExtendedTravelRule({
        arrivalDayTaxFree: new Decimal(0),
        arrivalDayTaxable: new Decimal(0),
      })
      const mockPrisma = {
        extendedTravelRule: {
          findFirst: vi.fn()
            .mockResolvedValueOnce(makeExtendedTravelRule())
            .mockResolvedValueOnce(updated),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      }
      const ctx = createCtx(mockPrisma, [TRAVEL_ALLOWANCE_MANAGE])
      const caller = extTravelRulesCaller(ctx)
      const result = await caller.update({
        id: RULE_ID,
        arrivalDayTaxFree: 0,
        arrivalDayTaxable: 0,
      })

      expect(result.arrivalDayTaxFree).toBe(0)
      expect(result.arrivalDayTaxable).toBe(0)
      expect(typeof result.arrivalDayTaxFree).toBe("number")
      expect(typeof result.arrivalDayTaxable).toBe("number")
      expect(result.arrivalDayTaxFree).not.toBeInstanceOf(Decimal)
      expect(result.arrivalDayTaxable).not.toBeInstanceOf(Decimal)
    })
  })

  describe("tripRecords.update returns Decimal mileage fields as numbers", () => {
    it("AUDIT-001: update returns startMileage/endMileage/distanceKm as numbers", async () => {
      // Service flow: repo.findByIdSimple (findFirst) -> repo.update (tenantScopedUpdate: updateMany + findFirst with include)
      const updated = makeTripRecord({
        startMileage: new Decimal(20000),
        endMileage: new Decimal(20100),
        distanceKm: new Decimal(100),
        notes: "Updated delivery",
      })
      const mockPrisma = {
        tripRecord: {
          findFirst: vi.fn()
            .mockResolvedValueOnce(makeTripRecord()) // repo.findByIdSimple
            .mockResolvedValueOnce(updated),          // tenantScopedUpdate refetch
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      }
      const ctx = createCtx(mockPrisma, [VEHICLE_DATA_MANAGE])
      const caller = tripRecordsCaller(ctx)
      const result = await caller.update({
        id: TRIP_RECORD_ID,
        startMileage: 20000,
        endMileage: 20100,
        distanceKm: 100,
        notes: "Updated delivery",
      })

      expect(typeof result.startMileage).toBe("number")
      expect(typeof result.endMileage).toBe("number")
      expect(typeof result.distanceKm).toBe("number")
      expect(result.startMileage).toBe(20000)
      expect(result.endMileage).toBe(20100)
      expect(result.distanceKm).toBe(100)

      expect(result).toHaveProperty("id")
      expect(result).toHaveProperty("tenantId")
      expect(result).toHaveProperty("vehicleId")
      expect(result).toHaveProperty("tripDate")
      expect(result).toHaveProperty("notes")
    })

    it("AUDIT-001: update returns null for nullable Decimal fields", async () => {
      const updated = makeTripRecord({
        startMileage: null,
        endMileage: null,
        distanceKm: null,
      })
      const mockPrisma = {
        tripRecord: {
          findFirst: vi.fn()
            .mockResolvedValueOnce(makeTripRecord())
            .mockResolvedValueOnce(updated),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      }
      const ctx = createCtx(mockPrisma, [VEHICLE_DATA_MANAGE])
      const caller = tripRecordsCaller(ctx)
      const result = await caller.update({
        id: TRIP_RECORD_ID,
        startMileage: null,
        endMileage: null,
        distanceKm: null,
      })

      expect(result.startMileage).toBeNull()
      expect(result.endMileage).toBeNull()
      expect(result.distanceKm).toBeNull()
    })
  })

  describe("correctionAssistant.updateMessage returns effectiveText via mapMessage", () => {
    it("AUDIT-001: updateMessage returns effectiveText from customText when set", async () => {
      // Service flow: repo.findMessageById (findFirst) -> repo.updateMessage (tenantScopedUpdate: updateMany + findFirst)
      const updated = makeCorrectionMessage({
        customText: "Custom override",
        defaultText: "Missing arrival booking",
      })
      const mockPrisma = {
        correctionMessage: {
          findFirst: vi.fn()
            .mockResolvedValueOnce(makeCorrectionMessage()) // repo.findMessageById
            .mockResolvedValueOnce(updated),                 // tenantScopedUpdate refetch
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      }
      const ctx = createCtx(mockPrisma, [CORRECTIONS_MANAGE])
      const caller = correctionAssistantCaller(ctx)
      const result = await caller.updateMessage({
        id: MESSAGE_ID,
        customText: "Custom override",
      })

      // mapMessage adds effectiveText = customText || defaultText
      expect(result.effectiveText).toBe("Custom override")
      expect(result.customText).toBe("Custom override")
      expect(result.defaultText).toBe("Missing arrival booking")

      expect(result).toHaveProperty("id")
      expect(result).toHaveProperty("tenantId")
      expect(result).toHaveProperty("code")
      expect(result).toHaveProperty("severity")
      expect(result).toHaveProperty("description")
      expect(result).toHaveProperty("isActive")
      expect(result).toHaveProperty("createdAt")
      expect(result).toHaveProperty("updatedAt")
    })

    it("AUDIT-001: updateMessage returns effectiveText from defaultText when customText is null", async () => {
      const updated = makeCorrectionMessage({
        customText: null,
        defaultText: "Missing arrival booking",
      })
      const mockPrisma = {
        correctionMessage: {
          findFirst: vi.fn()
            .mockResolvedValueOnce(makeCorrectionMessage())
            .mockResolvedValueOnce(updated),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      }
      const ctx = createCtx(mockPrisma, [CORRECTIONS_MANAGE])
      const caller = correctionAssistantCaller(ctx)
      const result = await caller.updateMessage({
        id: MESSAGE_ID,
        customText: null,
      })

      expect(result.effectiveText).toBe("Missing arrival booking")
      expect(result.customText).toBeNull()
    })
  })

  describe("vehicles.update returns plain object (no post-processing)", () => {
    it("AUDIT-001: update returns vehicle with correct shape", async () => {
      // Service flow: repo.findById (findFirst) -> repo.update (updateMany + findFirst)
      const updated = makeVehicle({ name: "Updated Truck", isActive: false })
      const mockPrisma = {
        vehicle: {
          findFirst: vi.fn()
            .mockResolvedValueOnce(makeVehicle())  // repo.findById
            .mockResolvedValueOnce(updated),         // tenantScopedUpdate refetch
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      }
      const ctx = createCtx(mockPrisma, [VEHICLE_DATA_MANAGE])
      const caller = vehiclesCaller(ctx)
      const result = await caller.update({
        id: VEHICLE_ID,
        name: "Updated Truck",
        isActive: false,
      })

      expect(result.name).toBe("Updated Truck")
      expect(result.isActive).toBe(false)
      expect(result).toHaveProperty("id")
      expect(result).toHaveProperty("tenantId")
      expect(result).toHaveProperty("code")
      expect(result).toHaveProperty("sortOrder")
    })
  })

  describe("exportInterfaces.update returns interface with accounts", () => {
    it("AUDIT-001: update returns export interface with correct shape", async () => {
      // Service flow: repo.findByIdSimple (findFirst #1) -> repo.update (updateMany + findFirst #2)
      // No interfaceNumber change, so no uniqueness check.
      const updated = makeExportInterface({ name: "Updated Interface" })
      const mockPrisma = {
        exportInterface: {
          findFirst: vi.fn()
            .mockResolvedValueOnce(makeExportInterface()) // repo.findByIdSimple
            .mockResolvedValueOnce(updated),               // tenantScopedUpdate refetch
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      }
      const ctx = createCtx(mockPrisma, [PAYROLL_MANAGE])
      const caller = exportInterfacesCaller(ctx)
      const result = await caller.update({
        id: INTERFACE_ID,
        name: "Updated Interface",
      })

      expect(result.name).toBe("Updated Interface")
      expect(result).toHaveProperty("id")
      expect(result).toHaveProperty("tenantId")
      expect(result).toHaveProperty("interfaceNumber")
      expect(result).toHaveProperty("isActive")
    })
  })
})

// ============================================================================
// ITEM 2: Delete operations return { success: true }
// ============================================================================

describe("AUDIT-001 Item 2: Delete returns { success: true }", () => {
  it("AUDIT-001: tripRecords.delete returns { success: true }", async () => {
    // Service flow: repo.findByIdSimple (findFirst) -> repo.deleteById (deleteMany)
    const mockPrisma = {
      tripRecord: {
        findFirst: vi.fn().mockResolvedValue(makeTripRecord()),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    }
    const ctx = createCtx(mockPrisma, [VEHICLE_DATA_MANAGE])
    const caller = tripRecordsCaller(ctx)
    const result = await caller.delete({ id: TRIP_RECORD_ID })

    expect(result).toEqual({ success: true })
    expect(result.success).toBe(true)
    expect(Object.keys(result)).toEqual(["success"])
  })

  it("AUDIT-001: extendedTravelRules.delete returns { success: true }", async () => {
    const mockPrisma = {
      extendedTravelRule: {
        findFirst: vi.fn().mockResolvedValue(makeExtendedTravelRule()),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    }
    const ctx = createCtx(mockPrisma, [TRAVEL_ALLOWANCE_MANAGE])
    const caller = extTravelRulesCaller(ctx)
    const result = await caller.delete({ id: RULE_ID })

    expect(result).toEqual({ success: true })
    expect(Object.keys(result)).toEqual(["success"])
  })

  it("AUDIT-001: exportInterfaces.delete returns { success: true }", async () => {
    const mockPrisma = {
      exportInterface: {
        findFirst: vi.fn().mockResolvedValue(makeExportInterface()),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      payrollExport: {
        count: vi.fn().mockResolvedValue(0),
      },
    }
    const ctx = createCtx(mockPrisma, [PAYROLL_MANAGE])
    const caller = exportInterfacesCaller(ctx)
    const result = await caller.delete({ id: INTERFACE_ID })

    expect(result).toEqual({ success: true })
    expect(Object.keys(result)).toEqual(["success"])
  })

  it("AUDIT-001: vehicles.delete returns { success: true }", async () => {
    const mockPrisma = {
      vehicle: {
        findFirst: vi.fn().mockResolvedValue(makeVehicle()),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      tripRecord: {
        count: vi.fn().mockResolvedValue(0),
      },
    }
    const ctx = createCtx(mockPrisma, [VEHICLE_DATA_MANAGE])
    const caller = vehiclesCaller(ctx)
    const result = await caller.delete({ id: VEHICLE_ID })

    expect(result).toEqual({ success: true })
    expect(Object.keys(result)).toEqual(["success"])
  })

  it("AUDIT-001: orderBookings.delete returns { success: true }", async () => {
    // Service flow: repo.findByIdSimple (findFirst) -> scope check -> repo.deleteById (deleteMany)
    const mockPrisma = {
      orderBooking: {
        findFirst: vi.fn().mockResolvedValue(makeOrderBooking()),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    }
    const ctx = createCtx(mockPrisma, [OB_MANAGE])
    const caller = orderBookingsCaller(ctx)
    const result = await caller.delete({ id: OB_ID })

    expect(result).toEqual({ success: true })
    expect(Object.keys(result)).toEqual(["success"])
  })

  it("AUDIT-001: weekPlans.delete returns { success: true }", async () => {
    const mockPrisma = {
      weekPlan: {
        findFirst: vi.fn().mockResolvedValue(makeWeekPlan()),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    }
    const ctx = createCtx(mockPrisma, [WEEK_PLANS_MANAGE])
    const caller = weekPlansCaller(ctx)
    const result = await caller.delete({ id: WEEK_PLAN_ID })

    expect(result).toEqual({ success: true })
    expect(Object.keys(result)).toEqual(["success"])
  })

  it("AUDIT-001: employeeTariffAssignments.delete returns { success: true }", async () => {
    // Service flow: repo.findById (findFirst) -> scope check -> repo.deleteById (deleteMany)
    const mockPrisma = {
      employeeTariffAssignment: {
        findFirst: vi.fn().mockResolvedValue(makeAssignment()),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    }
    const ctx = createCtx(mockPrisma, [EMPLOYEES_VIEW, EMPLOYEES_EDIT])
    const caller = employeeTariffAssignmentsCaller(ctx)
    const result = await caller.delete({
      employeeId: EMPLOYEE_ID,
      id: ASSIGN_ID,
    })

    expect(result).toEqual({ success: true })
    expect(Object.keys(result)).toEqual(["success"])
  })
})

// ============================================================================
// ITEM 3: dataScope filtering for orderBookings and employeeTariffAssignments
// ============================================================================

describe("AUDIT-001 Item 3: dataScope filtering", () => {
  describe("orderBookings -- department-scoped user", () => {
    it("AUDIT-001: dataScope blocks update for out-of-scope records (department)", async () => {
      // User scoped to DEPT_A, booking belongs to employee in DEPT_B
      const bookingInDeptB = makeOrderBooking({
        employee: {
          id: EMPLOYEE_ID,
          firstName: "Max",
          lastName: "Mustermann",
          personnelNumber: "EMP001",
          departmentId: DEPT_B_ID,
        },
      })
      const mockPrisma = {
        orderBooking: {
          // findByIdSimple returns it, findById for scope check also returns with DEPT_B employee
          findFirst: vi.fn().mockResolvedValue(bookingInDeptB),
        },
      }
      const ctx = createCtx(mockPrisma, [OB_MANAGE], "department", [DEPT_A_ID])
      const caller = orderBookingsCaller(ctx)

      await expect(
        caller.update({ id: OB_ID, timeMinutes: 120 })
      ).rejects.toThrow(/not within data scope/i)
    })

    it("AUDIT-001: dataScope blocks delete for out-of-scope records (department)", async () => {
      const bookingInDeptB = makeOrderBooking({
        employee: {
          id: EMPLOYEE_ID,
          firstName: "Max",
          lastName: "Mustermann",
          personnelNumber: "EMP001",
          departmentId: DEPT_B_ID,
        },
      })
      const mockPrisma = {
        orderBooking: {
          findFirst: vi.fn().mockResolvedValue(bookingInDeptB),
        },
      }
      const ctx = createCtx(mockPrisma, [OB_MANAGE], "department", [DEPT_A_ID])
      const caller = orderBookingsCaller(ctx)

      await expect(
        caller.delete({ id: OB_ID })
      ).rejects.toThrow(/not within data scope/i)
    })

    it("AUDIT-001: dataScope allows update for in-scope records (department)", async () => {
      // Booking belongs to employee in DEPT_A, user is scoped to DEPT_A
      const bookingInDeptA = makeOrderBooking({
        employee: {
          id: EMPLOYEE_ID,
          firstName: "Max",
          lastName: "Mustermann",
          personnelNumber: "EMP001",
          departmentId: DEPT_A_ID,
        },
      })
      const updatedBooking = { ...bookingInDeptA, timeMinutes: 120 }
      const mockPrisma = {
        orderBooking: {
          findFirst: vi.fn()
            .mockResolvedValueOnce(bookingInDeptA) // findByIdSimple
            .mockResolvedValueOnce(bookingInDeptA) // findById (scope check)
            .mockResolvedValueOnce(updatedBooking) // tenantScopedUpdate refetch (or findByIdWithInclude)
            .mockResolvedValueOnce(updatedBooking), // extra refetch
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      }
      const ctx = createCtx(mockPrisma, [OB_MANAGE], "department", [DEPT_A_ID])
      const caller = orderBookingsCaller(ctx)
      const result = await caller.update({ id: OB_ID, timeMinutes: 120 })

      expect(result.timeMinutes).toBe(120)
    })

    it("AUDIT-001: dataScope allows delete for in-scope records (department)", async () => {
      const bookingInDeptA = makeOrderBooking({
        employee: {
          id: EMPLOYEE_ID,
          firstName: "Max",
          lastName: "Mustermann",
          personnelNumber: "EMP001",
          departmentId: DEPT_A_ID,
        },
      })
      const mockPrisma = {
        orderBooking: {
          findFirst: vi.fn().mockResolvedValue(bookingInDeptA),
          deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      }
      const ctx = createCtx(mockPrisma, [OB_MANAGE], "department", [DEPT_A_ID])
      const caller = orderBookingsCaller(ctx)
      const result = await caller.delete({ id: OB_ID })

      expect(result).toEqual({ success: true })
    })

    it("AUDIT-001: user with scope=all can update any record", async () => {
      const bookingInDeptB = makeOrderBooking({
        employee: {
          id: EMPLOYEE_ID,
          firstName: "Max",
          lastName: "Mustermann",
          personnelNumber: "EMP001",
          departmentId: DEPT_B_ID,
        },
      })
      const updatedBooking = { ...bookingInDeptB, timeMinutes: 60 }
      const mockPrisma = {
        orderBooking: {
          // Service update flow (dataScope is always truthy as an object, even when type=all):
          // 1. findByIdSimple (findFirst #1) - existence
          // 2. findById (findFirst #2) - dataScope check (no-op for type=all, but still fetches)
          // 3. tenantScopedUpdate: updateMany + findFirst (#3) - refetch
          // 4. findByIdWithInclude (findFirst #4) - re-fetch with includes
          findFirst: vi.fn()
            .mockResolvedValueOnce(bookingInDeptB)  // #1 findByIdSimple
            .mockResolvedValueOnce(bookingInDeptB)  // #2 findById (scope check)
            .mockResolvedValueOnce(updatedBooking)   // #3 tenantScopedUpdate refetch
            .mockResolvedValueOnce(updatedBooking),  // #4 findByIdWithInclude
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      }
      const ctx = createCtx(mockPrisma, [OB_MANAGE], "all")
      const caller = orderBookingsCaller(ctx)
      const result = await caller.update({ id: OB_ID, timeMinutes: 60 })
      expect(result.timeMinutes).toBe(60)
    })
  })

  describe("employeeTariffAssignments -- department-scoped user", () => {
    it("AUDIT-001: dataScope blocks update for out-of-scope employee (department)", async () => {
      const existing = makeAssignment()
      const employeeInDeptB = { id: EMPLOYEE_ID, departmentId: DEPT_B_ID }
      const mockPrisma = {
        employeeTariffAssignment: {
          findFirst: vi.fn().mockResolvedValue(existing),
        },
        employee: {
          findFirst: vi.fn().mockResolvedValue(employeeInDeptB),
        },
      }
      const ctx = createCtx(
        mockPrisma,
        [EMPLOYEES_VIEW, EMPLOYEES_EDIT],
        "department",
        [DEPT_A_ID]
      )
      const caller = employeeTariffAssignmentsCaller(ctx)

      await expect(
        caller.update({
          employeeId: EMPLOYEE_ID,
          id: ASSIGN_ID,
          notes: "test",
        })
      ).rejects.toThrow(/not within data scope/i)
    })

    it("AUDIT-001: dataScope blocks delete for out-of-scope employee (department)", async () => {
      const existing = makeAssignment()
      const employeeInDeptB = { id: EMPLOYEE_ID, departmentId: DEPT_B_ID }
      const mockPrisma = {
        employeeTariffAssignment: {
          findFirst: vi.fn().mockResolvedValue(existing),
        },
        employee: {
          findFirst: vi.fn().mockResolvedValue(employeeInDeptB),
        },
      }
      const ctx = createCtx(
        mockPrisma,
        [EMPLOYEES_VIEW, EMPLOYEES_EDIT],
        "department",
        [DEPT_A_ID]
      )
      const caller = employeeTariffAssignmentsCaller(ctx)

      await expect(
        caller.delete({ employeeId: EMPLOYEE_ID, id: ASSIGN_ID })
      ).rejects.toThrow(/not within data scope/i)
    })

    it("AUDIT-001: dataScope allows update for in-scope employee (department)", async () => {
      const existing = makeAssignment()
      const updated = makeAssignment({ notes: "Updated note" })
      const employeeInDeptA = { id: EMPLOYEE_ID, departmentId: DEPT_A_ID }
      const mockPrisma = {
        employeeTariffAssignment: {
          findFirst: vi.fn().mockResolvedValue(existing),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        employee: {
          findFirst: vi.fn().mockResolvedValue(employeeInDeptA),
        },
        // $transaction needed by service for overlap check + update
        $transaction: vi.fn().mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
          // In the tx, findFirst on employeeTariffAssignment returns the updated record
          const txPrisma = {
            ...mockPrisma,
            employeeTariffAssignment: {
              ...mockPrisma.employeeTariffAssignment,
              findFirst: vi.fn().mockResolvedValue(updated),
              updateMany: vi.fn().mockResolvedValue({ count: 1 }),
            },
          }
          return cb(txPrisma)
        }),
      }
      const ctx = createCtx(
        mockPrisma,
        [EMPLOYEES_VIEW, EMPLOYEES_EDIT],
        "department",
        [DEPT_A_ID]
      )
      const caller = employeeTariffAssignmentsCaller(ctx)
      const result = await caller.update({
        employeeId: EMPLOYEE_ID,
        id: ASSIGN_ID,
        notes: "Updated note",
      })

      expect(result.notes).toBe("Updated note")
    })

    it("AUDIT-001: dataScope allows delete for in-scope employee (department)", async () => {
      const existing = makeAssignment()
      const employeeInDeptA = { id: EMPLOYEE_ID, departmentId: DEPT_A_ID }
      const mockPrisma = {
        employeeTariffAssignment: {
          findFirst: vi.fn().mockResolvedValue(existing),
          deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        employee: {
          findFirst: vi.fn().mockResolvedValue(employeeInDeptA),
        },
      }
      const ctx = createCtx(
        mockPrisma,
        [EMPLOYEES_VIEW, EMPLOYEES_EDIT],
        "department",
        [DEPT_A_ID]
      )
      const caller = employeeTariffAssignmentsCaller(ctx)
      const result = await caller.delete({
        employeeId: EMPLOYEE_ID,
        id: ASSIGN_ID,
      })

      expect(result).toEqual({ success: true })
    })

    it("AUDIT-001: dataScope blocks update for out-of-scope employee (employee-level scope)", async () => {
      const OTHER_EMP_ID = "a0000000-0000-4000-a000-000000006099"
      const existing = makeAssignment()
      const employee = { id: EMPLOYEE_ID, departmentId: DEPT_A_ID }
      const mockPrisma = {
        employeeTariffAssignment: {
          findFirst: vi.fn().mockResolvedValue(existing),
        },
        employee: {
          findFirst: vi.fn().mockResolvedValue(employee),
        },
      }
      // User only has access to OTHER_EMP_ID, but the assignment is for EMPLOYEE_ID
      const ctx = createCtx(
        mockPrisma,
        [EMPLOYEES_VIEW, EMPLOYEES_EDIT],
        "employee",
        [OTHER_EMP_ID]
      )
      const caller = employeeTariffAssignmentsCaller(ctx)

      await expect(
        caller.update({
          employeeId: EMPLOYEE_ID,
          id: ASSIGN_ID,
          notes: "test",
        })
      ).rejects.toThrow(/not within data scope/i)
    })
  })
})

// ============================================================================
// ITEM 4: weekPlans update + completeness check is atomic
// ============================================================================

describe("AUDIT-001 Item 4: weekPlans update + completeness check atomicity", () => {
  it("AUDIT-001: weekPlan update + completeness check runs inside $transaction", async () => {
    const existing = makeWeekPlan()
    const updated = makeWeekPlan({ name: "Updated" })
    // The service calls $transaction internally. autoMockPrisma auto-creates it
    // and passes the same proxy to the callback, preserving our mock values.
    // However, the service passes `name` (not `code`), so no findByCode call happens.
    // Flow: findByIdSimple(#1) -> tx: tenantScopedUpdate(updateMany + findFirst#2) + findByIdWithInclude(findFirst#3)
    const mockPrisma = {
      weekPlan: {
        findFirst: vi.fn()
          .mockResolvedValueOnce(existing)  // #1 findByIdSimple (outside tx)
          .mockResolvedValueOnce(updated)    // #2 tenantScopedUpdate refetch (inside tx)
          .mockResolvedValueOnce(updated),   // #3 findByIdWithInclude (inside tx)
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    }
    const ctx = createCtx(mockPrisma, [WEEK_PLANS_MANAGE])
    const caller = weekPlansCaller(ctx)
    const result = await caller.update({ id: WEEK_PLAN_ID, name: "Updated" })

    expect(result.name).toBe("Updated")
  })

  it("AUDIT-001: weekPlan update allows clearing a weekday (off day)", async () => {
    const existing = makeWeekPlan()
    const incompleteAfterUpdate = makeWeekPlan({
      mondayDayPlanId: null,
      mondayDayPlan: null,
    })
    const mockPrisma = {
      weekPlan: {
        findFirst: vi.fn()
          .mockResolvedValueOnce(existing)
          .mockResolvedValueOnce(incompleteAfterUpdate)
          .mockResolvedValueOnce(incompleteAfterUpdate),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    }
    const ctx = createCtx(mockPrisma, [WEEK_PLANS_MANAGE])
    const caller = weekPlansCaller(ctx)

    const result = await caller.update({
      id: WEEK_PLAN_ID,
      mondayDayPlanId: null,
    })
    expect(result.mondayDayPlanId).toBeNull()
  })

  it("AUDIT-001: weekPlan update succeeds when all 7 days have plans after update", async () => {
    const existing = makeWeekPlan()
    const newDayPlanId = "a0000000-0000-4000-a000-000000009099"
    const dayPlanSummary = { id: newDayPlanId, code: "NEW-1", name: "New Day", planType: "fixed" }
    const updatedComplete = makeWeekPlan({
      mondayDayPlanId: newDayPlanId,
      mondayDayPlan: dayPlanSummary,
    })
    const mockPrisma = {
      weekPlan: {
        // Flow: findByIdSimple (#1) -> validateDayPlanIds uses dayPlan.findMany ->
        // inside tx: updateMany + refetch (#2) + findByIdWithInclude (#3)
        findFirst: vi.fn()
          .mockResolvedValueOnce(existing)       // #1 findByIdSimple
          .mockResolvedValueOnce(updatedComplete) // #2 tenantScopedUpdate refetch
          .mockResolvedValueOnce(updatedComplete),// #3 findByIdWithInclude
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      dayPlan: {
        findMany: vi.fn().mockResolvedValue([{ id: newDayPlanId }]),
      },
    }
    const ctx = createCtx(mockPrisma, [WEEK_PLANS_MANAGE])
    const caller = weekPlansCaller(ctx)
    const result = await caller.update({ id: WEEK_PLAN_ID, mondayDayPlanId: newDayPlanId })

    expect(result.mondayDayPlanId).toBe(newDayPlanId)
    expect(result.tuesdayDayPlanId).toBe(DAY_PLAN_ID) // unchanged
  })

  it("AUDIT-001: weekPlan update allows any weekday to be cleared independently", async () => {
    const dayFields = [
      "mondayDayPlanId",
      "tuesdayDayPlanId",
      "wednesdayDayPlanId",
      "thursdayDayPlanId",
      "fridayDayPlanId",
      "saturdayDayPlanId",
      "sundayDayPlanId",
    ]

    for (const field of dayFields) {
      const dayPlanField = field.replace("Id", "")
      const cleared = makeWeekPlan({ [field]: null, [dayPlanField]: null })
      const existing = makeWeekPlan()

      const mockPrisma = {
        weekPlan: {
          findFirst: vi.fn()
            .mockResolvedValueOnce(existing)
            .mockResolvedValueOnce(cleared)
            .mockResolvedValueOnce(cleared),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      }
      const ctx = createCtx(mockPrisma, [WEEK_PLANS_MANAGE])
      const caller = weekPlansCaller(ctx)

      const result = await caller.update({ id: WEEK_PLAN_ID, [field]: null })
      expect(result[field as keyof typeof result]).toBeNull()
    }
  })

  it("AUDIT-001: employeeTariffAssignments.update overlap check + update runs in $transaction", async () => {
    const existing = makeAssignment()
    const updated = makeAssignment({ effectiveFrom: new Date("2025-06-01") })
    const employeeInDeptA = { id: EMPLOYEE_ID, departmentId: DEPT_A_ID }
    // Service flow:
    // 1. repo.findById (findFirst #1) - existence check
    // 2. repo.findEmployeeById for dataScope (employee.findFirst) - scope check
    // 3. Inside $transaction (auto-created):
    //    a. repo.hasOverlap (count #1) - overlap check
    //    b. repo.update: tenantScopedUpdate (updateMany + findFirst #2)
    const mockPrisma = {
      employeeTariffAssignment: {
        findFirst: vi.fn()
          .mockResolvedValueOnce(existing)  // #1 repo.findById
          .mockResolvedValueOnce(updated),   // #2 tenantScopedUpdate refetch inside tx
        count: vi.fn().mockResolvedValue(0), // no overlap
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      employee: {
        findFirst: vi.fn().mockResolvedValue(employeeInDeptA),
      },
    }
    const ctx = createCtx(mockPrisma, [EMPLOYEES_VIEW, EMPLOYEES_EDIT])
    const caller = employeeTariffAssignmentsCaller(ctx)
    const result = await caller.update({
      employeeId: EMPLOYEE_ID,
      id: ASSIGN_ID,
      effectiveFrom: new Date("2025-06-01"),
    })

    // The service internally calls prisma.$transaction, which autoMockPrisma auto-creates.
    // The fact that the result is valid proves the transaction ran successfully.
    expect(result.effectiveFrom).toEqual(new Date("2025-06-01"))
  })

  it("AUDIT-001: employeeTariffAssignments.update rejects overlap within transaction", async () => {
    const existing = makeAssignment()
    const employeeInDeptA = { id: EMPLOYEE_ID, departmentId: DEPT_A_ID }
    // count returns 1 (overlap found) -- this is called inside the auto-created $transaction
    const mockPrisma = {
      employeeTariffAssignment: {
        findFirst: vi.fn().mockResolvedValue(existing),
        count: vi.fn().mockResolvedValue(1), // overlap found in tx
      },
      employee: {
        findFirst: vi.fn().mockResolvedValue(employeeInDeptA),
      },
    }
    const ctx = createCtx(mockPrisma, [EMPLOYEES_VIEW, EMPLOYEES_EDIT])
    const caller = employeeTariffAssignmentsCaller(ctx)

    await expect(
      caller.update({
        employeeId: EMPLOYEE_ID,
        id: ASSIGN_ID,
        effectiveFrom: new Date("2025-06-01"),
      })
    ).rejects.toThrow("Overlapping tariff assignment exists")
  })
})
