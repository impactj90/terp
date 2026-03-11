/**
 * Phase 9: Auftraege & Projekte
 *
 * Tests UC-056 through UC-058 against the real database.
 * Requires local Supabase running with seed data.
 *
 * @see docs/use-cases/09-auftraege.md
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { createAdminCaller, prisma, SEED } from "../helpers"

type Caller = Awaited<ReturnType<typeof createAdminCaller>>

/** Seed employee IDs from supabase/seed.sql */
const SEED_EMPLOYEE_ID_1 = "00000000-0000-0000-0000-000000000011" // Admin
const SEED_EMPLOYEE_ID_2 = "00000000-0000-0000-0000-000000000012" // Regular

describe("Phase 9: Auftraege & Projekte", () => {
  let caller: Caller

  // Track created record IDs for cleanup
  const created = {
    orderIds: [] as string[],
    orderAssignmentIds: [] as string[],
    orderBookingIds: [] as string[],
  }

  // Shared state for cross-test references
  const state: Record<string, string> = {}

  beforeAll(async () => {
    caller = await createAdminCaller()

    // Clean up leftover test data from previous runs
    await prisma.orderBooking
      .deleteMany({
        where: {
          tenantId: SEED.TENANT_ID,
          description: { startsWith: "E2E" },
        },
      })
      .catch(() => {})

    await prisma.orderAssignment
      .deleteMany({
        where: {
          tenantId: SEED.TENANT_ID,
          order: { code: { startsWith: "E2E" } },
        },
      })
      .catch(() => {})

    await prisma.order
      .deleteMany({
        where: {
          tenantId: SEED.TENANT_ID,
          code: { startsWith: "E2E" },
        },
      })
      .catch(() => {})
  })

  afterAll(async () => {
    // Cleanup in reverse dependency order
    if (created.orderBookingIds.length > 0) {
      await prisma.orderBooking
        .deleteMany({
          where: { id: { in: created.orderBookingIds } },
        })
        .catch(() => {})
    }

    if (created.orderAssignmentIds.length > 0) {
      await prisma.orderAssignment
        .deleteMany({
          where: { id: { in: created.orderAssignmentIds } },
        })
        .catch(() => {})
    }

    if (created.orderIds.length > 0) {
      await prisma.order
        .deleteMany({
          where: { id: { in: created.orderIds } },
        })
        .catch(() => {})
    }
  })

  // =========================================================
  // UC-056: Auftrag anlegen
  // =========================================================
  describe("UC-056: Auftrag anlegen", () => {
    it("should create an order with required fields", async () => {
      const result = await caller.orders.create({
        code: "E2E-ORD001",
        name: "E2E Project Alpha",
        description: "End-to-end test order",
        customer: "E2E Customer GmbH",
        validFrom: "2026-01-01",
        validTo: "2026-12-31",
      })

      expect(result.id).toBeDefined()
      expect(result.code).toBe("E2E-ORD001")
      expect(result.name).toBe("E2E Project Alpha")
      expect(result.description).toBe("End-to-end test order")
      expect(result.customer).toBe("E2E Customer GmbH")
      expect(result.status).toBe("active")
      expect(result.isActive).toBe(true)
      expect(result.tenantId).toBe(SEED.TENANT_ID)
      state.orderId = result.id
      created.orderIds.push(result.id)
    })

    it("should create an order with billing rate", async () => {
      const result = await caller.orders.create({
        code: "E2E-ORD002",
        name: "E2E Project Beta",
        billingRatePerHour: 95.5,
      })

      expect(result.id).toBeDefined()
      expect(result.billingRatePerHour).toBe(95.5)
      state.order2Id = result.id
      created.orderIds.push(result.id)
    })

    it("should reject duplicate order codes", async () => {
      await expect(
        caller.orders.create({
          code: "E2E-ORD001",
          name: "E2E Duplicate",
        })
      ).rejects.toThrow()
    })

    it("should list orders including new ones", async () => {
      const { data } = await caller.orders.list()
      const codes = data.map((o: any) => o.code)
      expect(codes).toContain("E2E-ORD001")
      expect(codes).toContain("E2E-ORD002")
    })

    it("should retrieve an order by ID", async () => {
      const result = await caller.orders.getById({ id: state.orderId })
      expect(result.id).toBe(state.orderId)
      expect(result.code).toBe("E2E-ORD001")
      expect(result.customer).toBe("E2E Customer GmbH")
    })

    it("should update an order", async () => {
      const result = await caller.orders.update({
        id: state.orderId,
        name: "E2E Project Alpha Updated",
        status: "planned",
      })

      expect(result.name).toBe("E2E Project Alpha Updated")
      expect(result.status).toBe("planned")
    })

    it("should filter orders by active status", async () => {
      const { data } = await caller.orders.list({ isActive: true })
      const found = data.find((o: any) => o.id === state.orderId)
      expect(found).toBeDefined()
    })
  })

  // =========================================================
  // UC-057: Mitarbeiter dem Auftrag zuweisen
  // =========================================================
  describe("UC-057: Mitarbeiter dem Auftrag zuweisen", () => {
    it("should assign an employee to the order", async () => {
      const result = await caller.orderAssignments.create({
        orderId: state.orderId,
        employeeId: SEED_EMPLOYEE_ID_1,
        role: "leader",
      })

      expect(result.id).toBeDefined()
      expect(result.orderId).toBe(state.orderId)
      expect(result.employeeId).toBe(SEED_EMPLOYEE_ID_1)
      expect(result.role).toBe("leader")
      expect(result.isActive).toBe(true)
      expect(result.order).toBeDefined()
      expect(result.employee).toBeDefined()
      state.assignmentId = result.id
      created.orderAssignmentIds.push(result.id)
    })

    it("should assign a second employee as worker", async () => {
      const result = await caller.orderAssignments.create({
        orderId: state.orderId,
        employeeId: SEED_EMPLOYEE_ID_2,
      })

      expect(result.id).toBeDefined()
      expect(result.role).toBe("worker") // Default role
      expect(result.employee.personnelNumber).toBe("EMP002")
      state.assignment2Id = result.id
      created.orderAssignmentIds.push(result.id)
    })

    it("should reject duplicate employee-order-role assignment", async () => {
      await expect(
        caller.orderAssignments.create({
          orderId: state.orderId,
          employeeId: SEED_EMPLOYEE_ID_1,
          role: "leader",
        })
      ).rejects.toThrow()
    })

    it("should list assignments for an order", async () => {
      const { data } = await caller.orderAssignments.byOrder({
        orderId: state.orderId,
      })
      expect(data.length).toBe(2)
      const roles = data.map((a: any) => a.role)
      expect(roles).toContain("leader")
      expect(roles).toContain("worker")
    })

    it("should list all assignments with optional filter", async () => {
      const { data } = await caller.orderAssignments.list({
        employeeId: SEED_EMPLOYEE_ID_1,
      })
      expect(data.length).toBeGreaterThanOrEqual(1)
      const found = data.find((a: any) => a.id === state.assignmentId)
      expect(found).toBeDefined()
    })

    it("should retrieve an assignment by ID", async () => {
      const result = await caller.orderAssignments.getById({
        id: state.assignmentId,
      })
      expect(result.id).toBe(state.assignmentId)
      expect(result.order.code).toBe("E2E-ORD001")
      expect(result.employee.personnelNumber).toBe("EMP001")
    })

    it("should update an assignment", async () => {
      const result = await caller.orderAssignments.update({
        id: state.assignmentId,
        validFrom: "2026-02-01",
        validTo: "2026-06-30",
      })

      expect(result.validFrom).toBeDefined()
      expect(result.validTo).toBeDefined()
    })

    it("should delete an assignment", async () => {
      const result = await caller.orderAssignments.delete({
        id: state.assignment2Id,
      })
      expect(result.success).toBe(true)

      // Remove from cleanup list since already deleted
      created.orderAssignmentIds = created.orderAssignmentIds.filter(
        (id) => id !== state.assignment2Id
      )
    })
  })

  // =========================================================
  // UC-058: Auftragsbuchung erfassen
  // =========================================================
  describe("UC-058: Auftragsbuchung erfassen", () => {
    it("should create an order booking", async () => {
      const result = await caller.orderBookings.create({
        employeeId: SEED_EMPLOYEE_ID_1,
        orderId: state.orderId,
        bookingDate: "2026-03-10",
        timeMinutes: 480, // 8 hours
        description: "E2E Development work on project Alpha",
      })

      expect(result.id).toBeDefined()
      expect(result.employeeId).toBe(SEED_EMPLOYEE_ID_1)
      expect(result.orderId).toBe(state.orderId)
      expect(result.timeMinutes).toBe(480)
      expect(result.source).toBe("manual")
      expect(result.description).toBe("E2E Development work on project Alpha")
      expect(result.createdBy).toBe(SEED.ADMIN_USER_ID)
      state.bookingId = result.id
      created.orderBookingIds.push(result.id)
    })

    it("should create a second booking on a different date", async () => {
      const result = await caller.orderBookings.create({
        employeeId: SEED_EMPLOYEE_ID_1,
        orderId: state.orderId,
        bookingDate: "2026-03-11",
        timeMinutes: 240, // 4 hours
        description: "E2E Afternoon session",
      })

      expect(result.id).toBeDefined()
      expect(result.timeMinutes).toBe(240)
      state.booking2Id = result.id
      created.orderBookingIds.push(result.id)
    })

    it("should reject booking with zero or negative time", async () => {
      await expect(
        caller.orderBookings.create({
          employeeId: SEED_EMPLOYEE_ID_1,
          orderId: state.orderId,
          bookingDate: "2026-03-12",
          timeMinutes: 0,
        })
      ).rejects.toThrow()
    })

    it("should reject booking with non-existent order", async () => {
      await expect(
        caller.orderBookings.create({
          employeeId: SEED_EMPLOYEE_ID_1,
          orderId: "00000000-0000-0000-0000-000000099999",
          bookingDate: "2026-03-12",
          timeMinutes: 60,
        })
      ).rejects.toThrow()
    })

    it("should list order bookings with pagination", async () => {
      const result = await caller.orderBookings.list({
        orderId: state.orderId,
      })
      expect(result.items.length).toBeGreaterThanOrEqual(2)
      expect(result.total).toBeGreaterThanOrEqual(2)
    })

    it("should filter bookings by date range", async () => {
      const result = await caller.orderBookings.list({
        orderId: state.orderId,
        fromDate: "2026-03-10",
        toDate: "2026-03-10",
      })
      expect(result.items.length).toBeGreaterThanOrEqual(1)
      const found = result.items.find((b: any) => b.id === state.bookingId)
      expect(found).toBeDefined()
    })

    it("should filter bookings by employee", async () => {
      const result = await caller.orderBookings.list({
        employeeId: SEED_EMPLOYEE_ID_1,
      })
      expect(result.items.length).toBeGreaterThanOrEqual(2)
    })

    it("should retrieve a booking by ID with relations", async () => {
      const result = await caller.orderBookings.getById({
        id: state.bookingId,
      })
      expect(result.id).toBe(state.bookingId)
      expect(result.employee).toBeDefined()
      expect(result.order).toBeDefined()
      expect(result.order!.code).toBe("E2E-ORD001")
    })

    it("should update a booking", async () => {
      const result = await caller.orderBookings.update({
        id: state.bookingId,
        timeMinutes: 510, // 8.5 hours
        description: "E2E Updated description",
      })

      expect(result.timeMinutes).toBe(510)
      expect(result.description).toBe("E2E Updated description")
      expect(result.updatedBy).toBe(SEED.ADMIN_USER_ID)
    })

    it("should delete a booking", async () => {
      const result = await caller.orderBookings.delete({
        id: state.booking2Id,
      })
      expect(result.success).toBe(true)

      // Remove from cleanup list since already deleted
      created.orderBookingIds = created.orderBookingIds.filter(
        (id) => id !== state.booking2Id
      )
    })

    it("should not find deleted booking", async () => {
      await expect(
        caller.orderBookings.getById({ id: state.booking2Id })
      ).rejects.toThrow()
    })
  })
})
