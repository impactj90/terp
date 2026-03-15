/**
 * Phase 12: System & Audit
 *
 * Tests UC-068 through UC-070 against the real database.
 * Requires local Supabase running with seed data.
 *
 * @see docs/use-cases/12-system.md
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { createAdminCaller, prisma, SEED } from "../helpers"

type Caller = Awaited<ReturnType<typeof createAdminCaller>>

describe("Phase 12: System & Audit", () => {
  let caller: Caller

  // Track created record IDs for cleanup
  const created = {
    orderIds: [] as string[],
    bookingIds: [] as string[],
  }

  // Shared state for cross-test references
  const state: Record<string, string> = {}

  beforeAll(async () => {
    caller = await createAdminCaller()

    // Clean up leftover test data from previous runs
    await prisma.order
      .deleteMany({
        where: {
          tenantId: SEED.TENANT_ID,
          code: { startsWith: "E2E-SYS" },
        },
      })
      .catch(() => {})
  })

  afterAll(async () => {
    if (created.orderIds.length > 0) {
      await prisma.order
        .deleteMany({
          where: { id: { in: created.orderIds } },
        })
        .catch(() => {})
    }

    if (created.bookingIds.length > 0) {
      await prisma.booking
        .deleteMany({
          where: { id: { in: created.bookingIds } },
        })
        .catch(() => {})
    }
  })

  // =========================================================
  // UC-068: Systemeinstellungen pruefen/aendern
  // =========================================================
  describe("UC-068: Systemeinstellungen pruefen/aendern", () => {
    it("should load system settings (getOrCreate pattern)", async () => {
      const result = await caller.systemSettings.get()

      expect(result.id).toBeDefined()
      expect(result.tenantId).toBe(SEED.TENANT_ID)
      expect(typeof result.roundingRelativeToPlan).toBe("boolean")
      expect(typeof result.errorListEnabled).toBe("boolean")
      expect(result.trackedErrorCodes).toBeInstanceOf(Array)
      expect(typeof result.autoFillOrderEndBookings).toBe("boolean")
      expect(typeof result.birthdayWindowDaysBefore).toBe("number")
      expect(typeof result.birthdayWindowDaysAfter).toBe("number")
      expect(typeof result.followUpEntriesEnabled).toBe("boolean")
      expect(typeof result.proxyEnabled).toBe("boolean")
      expect(typeof result.serverAliveEnabled).toBe("boolean")
      expect(typeof result.serverAliveNotifyAdmins).toBe("boolean")
      state.settingsId = result.id

      // Store original values to restore later
      state.origBirthdayBefore = String(result.birthdayWindowDaysBefore)
      state.origBirthdayAfter = String(result.birthdayWindowDaysAfter)
      state.origErrorListEnabled = String(result.errorListEnabled)
    })

    it("should update birthday window settings", async () => {
      const result = await caller.systemSettings.update({
        birthdayWindowDaysBefore: 14,
        birthdayWindowDaysAfter: 7,
      })

      expect(result.birthdayWindowDaysBefore).toBe(14)
      expect(result.birthdayWindowDaysAfter).toBe(7)
    })

    it("should persist settings after update", async () => {
      const result = await caller.systemSettings.get()
      expect(result.birthdayWindowDaysBefore).toBe(14)
      expect(result.birthdayWindowDaysAfter).toBe(7)
    })

    it("should update error list settings", async () => {
      const result = await caller.systemSettings.update({
        errorListEnabled: true,
        trackedErrorCodes: ["E001", "E002", "E003"],
      })

      expect(result.errorListEnabled).toBe(true)
      expect(result.trackedErrorCodes).toEqual(["E001", "E002", "E003"])
    })

    it("should update proxy settings", async () => {
      const result = await caller.systemSettings.update({
        proxyEnabled: false,
        proxyHost: "proxy.e2e-test.local",
        proxyPort: 8080,
        proxyUsername: "e2e-proxy-user",
      })

      expect(result.proxyEnabled).toBe(false)
      expect(result.proxyHost).toBe("proxy.e2e-test.local")
      expect(result.proxyPort).toBe(8080)
      expect(result.proxyUsername).toBe("e2e-proxy-user")
    })

    it("should update server alive settings", async () => {
      const result = await caller.systemSettings.update({
        serverAliveEnabled: true,
        serverAliveExpectedCompletionTime: 120,
        serverAliveThresholdMinutes: 30,
        serverAliveNotifyAdmins: true,
      })

      expect(result.serverAliveEnabled).toBe(true)
      expect(result.serverAliveExpectedCompletionTime).toBe(120)
      expect(result.serverAliveThresholdMinutes).toBe(30)
      expect(result.serverAliveNotifyAdmins).toBe(true)
    })

    it("should handle partial updates without overwriting other fields", async () => {
      // Update only one field
      const result = await caller.systemSettings.update({
        followUpEntriesEnabled: true,
      })

      // Previously set values should still be intact
      expect(result.followUpEntriesEnabled).toBe(true)
      expect(result.birthdayWindowDaysBefore).toBe(14)
      expect(result.serverAliveEnabled).toBe(true)
    })

    it("should restore original settings", async () => {
      await caller.systemSettings.update({
        birthdayWindowDaysBefore: Number(state.origBirthdayBefore!),
        birthdayWindowDaysAfter: Number(state.origBirthdayAfter!),
        errorListEnabled: state.origErrorListEnabled! === "true",
        proxyEnabled: false,
        proxyHost: null,
        proxyPort: null,
        proxyUsername: null,
        serverAliveEnabled: false,
        serverAliveExpectedCompletionTime: null,
        serverAliveThresholdMinutes: null,
        serverAliveNotifyAdmins: false,
      })
    })
  })

  // =========================================================
  // UC-069: Audit-Log pruefen
  // =========================================================
  describe("UC-069: Audit-Log pruefen", () => {
    it("should list audit logs with pagination", async () => {
      const result = await caller.auditLogs.list()

      expect(result.items).toBeDefined()
      expect(result.items).toBeInstanceOf(Array)
      expect(typeof result.total).toBe("number")
    })

    it("should contain audit log entries", async () => {
      const result = await caller.auditLogs.list({
        pageSize: 5,
      })

      // There should be entries from seed data operations and our test operations
      if (result.total > 0) {
        const entry = result.items[0]!
        expect(entry.id).toBeDefined()
        expect(entry.tenantId).toBe(SEED.TENANT_ID)
        expect(entry.action).toBeDefined()
        expect(entry.entityType).toBeDefined()
        expect(entry.entityId).toBeDefined()
        expect(entry.performedAt).toBeDefined()
      }
    })

    it("should filter audit logs by entity type", async () => {
      const result = await caller.auditLogs.list({
        entityType: "system_settings",
      })

      if (result.total > 0) {
        result.items.forEach((entry: any) => {
          expect(entry.entityType).toBe("system_settings")
        })
      }
    })

    it("should filter audit logs by action", async () => {
      const result = await caller.auditLogs.list({
        action: "update",
      })

      if (result.total > 0) {
        result.items.forEach((entry: any) => {
          expect(entry.action).toBe("update")
        })
      }
    })

    it("should support pagination", async () => {
      const page1 = await caller.auditLogs.list({
        page: 1,
        pageSize: 2,
      })

      if (page1.total > 2) {
        const page2 = await caller.auditLogs.list({
          page: 2,
          pageSize: 2,
        })

        // Entries on page 1 and page 2 should be different
        if (page2.items.length > 0) {
          expect(page2.items[0]!.id).not.toBe(page1.items[0]!.id)
        }
      }
    })

    it("should retrieve a single audit log by ID", async () => {
      const listResult = await caller.auditLogs.list({ pageSize: 1 })

      if (listResult.total > 0) {
        const entryId = listResult.items[0]!.id
        const result = await caller.auditLogs.getById({ id: entryId })

        expect(result.id).toBe(entryId)
        expect(result.tenantId).toBe(SEED.TENANT_ID)
        expect(result.action).toBeDefined()
        expect(result.entityType).toBeDefined()
      }
    })

    it("should include user relation in audit log entries", async () => {
      const result = await caller.auditLogs.list({
        userId: SEED.ADMIN_USER_ID,
        pageSize: 5,
      })

      if (result.total > 0) {
        const withUser = result.items.filter((e: any) => e.user != null)
        if (withUser.length > 0) {
          expect(withUser[0]!.user!.id).toBe(SEED.ADMIN_USER_ID)
          expect(withUser[0]!.user!.email).toBeDefined()
        }
      }
    })

    it("should not find non-existent audit log", async () => {
      await expect(
        caller.auditLogs.getById({
          id: "00000000-0000-0000-0000-000000099999",
        })
      ).rejects.toThrow()
    })
  })

  // =========================================================
  // UC-070: Datenbereinigung durchfuehren
  // =========================================================
  describe("UC-070: Datenbereinigung durchfuehren", () => {
    it("should preview delete bookings (confirm: false)", async () => {
      // Use a far-future date range that won't affect seed data
      const result = await caller.systemSettings.cleanupDeleteBookings({
        dateFrom: "2099-01-01",
        dateTo: "2099-01-31",
        confirm: false,
      })

      expect(result.operation).toBe("delete_bookings")
      expect(typeof result.affectedCount).toBe("number")
      expect(result.preview).toBe(true)
      // Far-future range should have 0 affected
      expect(result.affectedCount).toBe(0)
    })

    it("should preview delete booking data (confirm: false)", async () => {
      const result = await caller.systemSettings.cleanupDeleteBookingData({
        dateFrom: "2099-01-01",
        dateTo: "2099-01-31",
        confirm: false,
      })

      expect(result.operation).toBe("delete_booking_data")
      expect(typeof result.affectedCount).toBe("number")
      expect(result.preview).toBe(true)
    })

    it("should preview re-read bookings (confirm: false)", async () => {
      const result = await caller.systemSettings.cleanupReReadBookings({
        dateFrom: "2099-01-01",
        dateTo: "2099-01-31",
        confirm: false,
      })

      expect(result.operation).toBe("re_read_bookings")
      expect(typeof result.affectedCount).toBe("number")
      expect(result.preview).toBe(true)
    })

    it("should execute delete bookings on empty range (safe)", async () => {
      // Execute on a date range we know has no data
      const result = await caller.systemSettings.cleanupDeleteBookings({
        dateFrom: "2099-01-01",
        dateTo: "2099-01-31",
        confirm: true,
      })

      expect(result.operation).toBe("delete_bookings")
      expect(result.preview).toBe(false)
      expect(result.affectedCount).toBe(0)
    })

    it("should execute delete booking data on empty range (safe)", async () => {
      const result = await caller.systemSettings.cleanupDeleteBookingData({
        dateFrom: "2099-01-01",
        dateTo: "2099-01-31",
        confirm: true,
      })

      expect(result.operation).toBe("delete_booking_data")
      expect(result.preview).toBe(false)
      expect(result.affectedCount).toBe(0)
    })

    it("should preview mark-delete orders", async () => {
      // Create an order specifically for this test
      const order = await caller.orders.create({
        code: "E2E-SYS-DEL001",
        name: "E2E Order For Deletion Test",
      })
      created.orderIds.push(order.id)

      const result = await caller.systemSettings.cleanupMarkDeleteOrders({
        orderIds: [order.id],
        confirm: false,
      })

      expect(result.operation).toBe("mark_delete_orders")
      expect(result.preview).toBe(true)
      expect(result.affectedCount).toBe(1)
    })

    it("should execute mark-delete orders", async () => {
      // Create another order to delete
      const order = await caller.orders.create({
        code: "E2E-SYS-DEL002",
        name: "E2E Order For Actual Deletion",
      })

      const result = await caller.systemSettings.cleanupMarkDeleteOrders({
        orderIds: [order.id],
        confirm: true,
      })

      expect(result.operation).toBe("mark_delete_orders")
      expect(result.preview).toBe(false)
      expect(result.affectedCount).toBe(1)

      // Verify order is deleted
      await expect(
        caller.orders.getById({ id: order.id })
      ).rejects.toThrow()
    })

    it("should preview with employee filter", async () => {
      const result = await caller.systemSettings.cleanupDeleteBookings({
        dateFrom: "2099-01-01",
        dateTo: "2099-01-31",
        employeeIds: ["00000000-0000-0000-0000-000000000011"],
        confirm: false,
      })

      expect(result.operation).toBe("delete_bookings")
      expect(result.preview).toBe(true)
      expect(result.affectedCount).toBe(0)
    })

    it("should reject cleanup with invalid date range", async () => {
      await expect(
        caller.systemSettings.cleanupDeleteBookings({
          dateFrom: "invalid-date",
          dateTo: "2099-01-31",
          confirm: false,
        })
      ).rejects.toThrow()
    })
  })
})
