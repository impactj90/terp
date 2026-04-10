/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Phase 10: Zutrittskontrolle & Terminals
 *
 * Tests UC-059 through UC-062 against the real database.
 * Requires local Supabase running with seed data.
 *
 * @see docs/use-cases/10-zutrittskontrolle.md
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { createAdminCaller, prisma, SEED } from "../helpers"

type Caller = Awaited<ReturnType<typeof createAdminCaller>>

/** Seed employee IDs from supabase/seed.sql */
const SEED_EMPLOYEE_ID = "00000000-0000-0000-0000-000000000011"
const SEED_EMPLOYEE_PIN = "1001"

describe("Phase 10: Zutrittskontrolle & Terminals", () => {
  let caller: Caller

  // Track created record IDs for cleanup
  const created = {
    accessZoneIds: [] as string[],
    accessProfileIds: [] as string[],
    employeeAccessAssignmentIds: [] as string[],
    importBatchIds: [] as string[],
  }

  // Shared state for cross-test references
  const state: Record<string, string> = {}

  beforeAll(async () => {
    caller = await createAdminCaller()

    // Clean up leftover test data from previous runs
    await prisma.employeeAccessAssignment
      .deleteMany({
        where: {
          tenantId: SEED.TENANT_ID,
          accessProfile: { code: { startsWith: "E2E" } },
        },
      })
      .catch(() => {})

    await prisma.accessProfile
      .deleteMany({
        where: {
          tenantId: SEED.TENANT_ID,
          code: { startsWith: "E2E" },
        },
      })
      .catch(() => {})

    await prisma.accessZone
      .deleteMany({
        where: {
          tenantId: SEED.TENANT_ID,
          code: { startsWith: "E2E" },
        },
      })
      .catch(() => {})

    // Clean up terminal booking test data
    await prisma.rawTerminalBooking
      .deleteMany({
        where: {
          tenantId: SEED.TENANT_ID,
          importBatch: { batchReference: { startsWith: "E2E" } },
        },
      })
      .catch(() => {})

    await prisma.importBatch
      .deleteMany({
        where: {
          tenantId: SEED.TENANT_ID,
          batchReference: { startsWith: "E2E" },
        },
      })
      .catch(() => {})
  })

  afterAll(async () => {
    // Cleanup in reverse dependency order

    // Terminal bookings
    if (created.importBatchIds.length > 0) {
      await prisma.rawTerminalBooking
        .deleteMany({
          where: { importBatchId: { in: created.importBatchIds } },
        })
        .catch(() => {})
      await prisma.importBatch
        .deleteMany({
          where: { id: { in: created.importBatchIds } },
        })
        .catch(() => {})
    }

    // Employee access assignments
    if (created.employeeAccessAssignmentIds.length > 0) {
      await prisma.employeeAccessAssignment
        .deleteMany({
          where: { id: { in: created.employeeAccessAssignmentIds } },
        })
        .catch(() => {})
    }

    // Access profiles
    if (created.accessProfileIds.length > 0) {
      await prisma.accessProfile
        .deleteMany({
          where: { id: { in: created.accessProfileIds } },
        })
        .catch(() => {})
    }

    // Access zones
    if (created.accessZoneIds.length > 0) {
      await prisma.accessZone
        .deleteMany({
          where: { id: { in: created.accessZoneIds } },
        })
        .catch(() => {})
    }
  })

  // =========================================================
  // UC-059: Zutrittszonen anlegen
  // =========================================================
  describe("UC-059: Zutrittszonen anlegen", () => {
    it("should create an access zone", async () => {
      const result = await caller.accessZones.create({
        code: "E2E-MAIN",
        name: "E2E Hauptgebaeude",
        description: "Main building access zone",
      })

      expect(result.id).toBeDefined()
      expect(result.code).toBe("E2E-MAIN")
      expect(result.name).toBe("E2E Hauptgebaeude")
      expect(result.description).toBe("Main building access zone")
      expect(result.isActive).toBe(true)
      expect(result.tenantId).toBe(SEED.TENANT_ID)
      state.zoneId = result.id
      created.accessZoneIds.push(result.id)
    })

    it("should create a second access zone", async () => {
      const result = await caller.accessZones.create({
        code: "E2E-SERVER",
        name: "E2E Serverraum",
        description: "Server room - restricted access",
        sortOrder: 10,
      })

      expect(result.id).toBeDefined()
      expect(result.sortOrder).toBe(10)
      state.zone2Id = result.id
      created.accessZoneIds.push(result.id)
    })

    it("should create a parking zone", async () => {
      const result = await caller.accessZones.create({
        code: "E2E-PARK",
        name: "E2E Parkhaus",
      })

      expect(result.id).toBeDefined()
      state.zone3Id = result.id
      created.accessZoneIds.push(result.id)
    })

    it("should reject duplicate zone codes", async () => {
      await expect(
        caller.accessZones.create({
          code: "E2E-MAIN",
          name: "E2E Duplicate",
        })
      ).rejects.toThrow()
    })

    it("should list access zones including new ones", async () => {
      const { data } = await caller.accessZones.list()
      const codes = data.map((z: any) => z.code)
      expect(codes).toContain("E2E-MAIN")
      expect(codes).toContain("E2E-SERVER")
      expect(codes).toContain("E2E-PARK")
    })

    it("should retrieve an access zone by ID", async () => {
      const result = await caller.accessZones.getById({ id: state.zoneId! })
      expect(result.id).toBe(state.zoneId!)
      expect(result.code).toBe("E2E-MAIN")
    })

    it("should update an access zone", async () => {
      const result = await caller.accessZones.update({
        id: state.zoneId!,
        name: "E2E Hauptgebaeude Updated",
        description: "Updated main building zone",
      })

      expect(result.name).toBe("E2E Hauptgebaeude Updated")
      expect(result.description).toBe("Updated main building zone")
      // Code remains unchanged
      expect(result.code).toBe("E2E-MAIN")
    })
  })

  // =========================================================
  // UC-060: Zutrittsprofil erstellen
  // =========================================================
  describe("UC-060: Zutrittsprofil erstellen", () => {
    it("should create an access profile", async () => {
      const result = await caller.accessProfiles.create({
        code: "E2E-STANDARD",
        name: "E2E Standard-Mitarbeiter",
        description: "Standard employee access profile",
      })

      expect(result.id).toBeDefined()
      expect(result.code).toBe("E2E-STANDARD")
      expect(result.name).toBe("E2E Standard-Mitarbeiter")
      expect(result.isActive).toBe(true)
      state.profileId = result.id
      created.accessProfileIds.push(result.id)
    })

    it("should create a restricted access profile", async () => {
      const result = await caller.accessProfiles.create({
        code: "E2E-ADMIN-ACCESS",
        name: "E2E Admin-Zugang",
        description: "Full access to all zones",
      })

      expect(result.id).toBeDefined()
      state.profile2Id = result.id
      created.accessProfileIds.push(result.id)
    })

    it("should reject duplicate profile codes", async () => {
      await expect(
        caller.accessProfiles.create({
          code: "E2E-STANDARD",
          name: "E2E Duplicate Profile",
        })
      ).rejects.toThrow()
    })

    it("should list access profiles including new ones", async () => {
      const { data } = await caller.accessProfiles.list()
      const codes = data.map((p: any) => p.code)
      expect(codes).toContain("E2E-STANDARD")
      expect(codes).toContain("E2E-ADMIN-ACCESS")
    })

    it("should retrieve a profile by ID", async () => {
      const result = await caller.accessProfiles.getById({
        id: state.profileId!,
      })
      expect(result.id).toBe(state.profileId!)
      expect(result.code).toBe("E2E-STANDARD")
    })

    it("should update an access profile", async () => {
      const result = await caller.accessProfiles.update({
        id: state.profileId!,
        name: "E2E Standard-Mitarbeiter Updated",
        description: "Updated standard profile",
      })

      expect(result.name).toBe("E2E Standard-Mitarbeiter Updated")
    })
  })

  // =========================================================
  // UC-061: Mitarbeiter Zutrittsprofil zuweisen
  // =========================================================
  describe("UC-061: Mitarbeiter Zutrittsprofil zuweisen", () => {
    it("should assign an access profile to an employee", async () => {
      const result = await caller.employeeAccessAssignments.create({
        employeeId: SEED_EMPLOYEE_ID,
        accessProfileId: state.profileId!,
        validFrom: "2026-01-01",
        validTo: "2026-12-31",
      })

      expect(result.id).toBeDefined()
      expect(result.employeeId).toBe(SEED_EMPLOYEE_ID)
      expect(result.accessProfileId).toBe(state.profileId!)
      expect(result.isActive).toBe(true)
      expect(result.validFrom).toBeDefined()
      expect(result.validTo).toBeDefined()
      state.accessAssignmentId = result.id
      created.employeeAccessAssignmentIds.push(result.id)
    })

    it("should list employee access assignments with relations", async () => {
      const { data } = await caller.employeeAccessAssignments.list()
      expect(data.length).toBeGreaterThanOrEqual(1)

      const found = data.find(
        (a: any) => a.id === state.accessAssignmentId!
      )
      expect(found).toBeDefined()
      expect(found!.employee).toBeDefined()
      expect(found!.accessProfile).toBeDefined()
    })

    it("should retrieve an assignment by ID", async () => {
      const result = await caller.employeeAccessAssignments.getById({
        id: state.accessAssignmentId!,
      })
      expect(result.id).toBe(state.accessAssignmentId!)
      expect(result.employee).toBeDefined()
      expect(result.accessProfile).toBeDefined()
      expect(result.accessProfile!.code).toBe("E2E-STANDARD")
    })

    it("should update an assignment validity period", async () => {
      const result = await caller.employeeAccessAssignments.update({
        id: state.accessAssignmentId!,
        validTo: "2027-06-30",
      })

      expect(result.validTo).toBeDefined()
    })

    it("should deactivate an assignment", async () => {
      const result = await caller.employeeAccessAssignments.update({
        id: state.accessAssignmentId!,
        isActive: false,
      })

      expect(result.isActive).toBe(false)
    })

    it("should reactivate an assignment", async () => {
      const result = await caller.employeeAccessAssignments.update({
        id: state.accessAssignmentId!,
        isActive: true,
      })

      expect(result.isActive).toBe(true)
    })
  })

  // =========================================================
  // UC-062: Terminal-Buchungen importieren
  // =========================================================
  describe("UC-062: Terminal-Buchungen importieren", () => {
    it("should import terminal bookings in a batch", async () => {
      const result = await caller.terminalBookings.import({
        batchReference: "E2E-BATCH-001",
        terminalId: "TERMINAL-01",
        bookings: [
          {
            employeePin: SEED_EMPLOYEE_PIN,
            rawTimestamp: "2026-03-10T08:00:00Z",
            rawBookingCode: "K", // Kommen (in)
          },
          {
            employeePin: SEED_EMPLOYEE_PIN,
            rawTimestamp: "2026-03-10T16:30:00Z",
            rawBookingCode: "G", // Gehen (out)
          },
          {
            employeePin: "9999", // Unknown employee
            rawTimestamp: "2026-03-10T09:00:00Z",
            rawBookingCode: "K",
          },
        ],
      })

      expect(result.batch).toBeDefined()
      expect(result.batch.id).toBeDefined()
      expect(result.batch.batchReference).toBe("E2E-BATCH-001")
      expect(result.batch.source).toBe("terminal")
      expect(result.batch.terminalId).toBe("TERMINAL-01")
      expect(result.batch.recordsTotal).toBe(3)
      expect(result.batch.status).toBe("completed")
      expect(result.wasDuplicate).toBe(false)
      state.batchId = result.batch.id
      created.importBatchIds.push(result.batch.id)
    })

    it("should be idempotent for same batch reference", async () => {
      const result = await caller.terminalBookings.import({
        batchReference: "E2E-BATCH-001",
        terminalId: "TERMINAL-01",
        bookings: [
          {
            employeePin: SEED_EMPLOYEE_PIN,
            rawTimestamp: "2026-03-10T08:00:00Z",
            rawBookingCode: "K",
          },
        ],
      })

      expect(result.wasDuplicate).toBe(true)
      expect(result.batch.id).toBe(state.batchId!)
    })

    it("should import a second batch", async () => {
      const result = await caller.terminalBookings.import({
        batchReference: "E2E-BATCH-002",
        terminalId: "TERMINAL-02",
        bookings: [
          {
            employeePin: SEED_EMPLOYEE_PIN,
            rawTimestamp: "2026-03-11T07:55:00Z",
            rawBookingCode: "K",
          },
          {
            employeePin: SEED_EMPLOYEE_PIN,
            rawTimestamp: "2026-03-11T17:00:00Z",
            rawBookingCode: "G",
          },
        ],
      })

      expect(result.batch.status).toBe("completed")
      expect(result.batch.recordsTotal).toBe(2)
      expect(result.wasDuplicate).toBe(false)
      state.batch2Id = result.batch.id
      created.importBatchIds.push(result.batch.id)
    })

    it("should list import batches", async () => {
      const result = await caller.terminalBookings.batches({
        limit: 20,
        page: 1,
      })

      expect(result.data.length).toBeGreaterThanOrEqual(2)
      expect(result.meta).toBeDefined()
      expect(result.meta.total).toBeGreaterThanOrEqual(2)
    })

    it("should filter batches by status", async () => {
      const result = await caller.terminalBookings.batches({
        status: "completed",
        limit: 20,
        page: 1,
      })

      expect(result.data.length).toBeGreaterThanOrEqual(2)
      result.data.forEach((b: any) => {
        expect(b.status).toBe("completed")
      })
    })

    it("should filter batches by terminal ID", async () => {
      const result = await caller.terminalBookings.batches({
        terminalId: "TERMINAL-01",
        limit: 20,
        page: 1,
      })

      expect(result.data.length).toBeGreaterThanOrEqual(1)
      result.data.forEach((b: any) => {
        expect(b.terminalId).toBe("TERMINAL-01")
      })
    })

    it("should retrieve a single batch by ID", async () => {
      const result = await caller.terminalBookings.batch({
        id: state.batchId!,
      })

      expect(result.id).toBe(state.batchId!)
      expect(result.batchReference).toBe("E2E-BATCH-001")
      expect(result.recordsTotal).toBe(3)
    })

    it("should list raw terminal bookings", async () => {
      const result = await caller.terminalBookings.list({
        importBatchId: state.batchId!,
        limit: 50,
        page: 1,
      })

      expect(result.data.length).toBe(3)
      expect(result.meta.total).toBe(3)
    })

    it("should resolve known employee PINs", async () => {
      const result = await caller.terminalBookings.list({
        importBatchId: state.batchId!,
        limit: 50,
        page: 1,
      })

      // Two bookings should have the employee resolved
      const withEmployee = result.data.filter(
        (b: any) => b.employeeId === SEED_EMPLOYEE_ID
      )
      expect(withEmployee.length).toBe(2)

      // One booking with unknown PIN should have null employeeId
      const withoutEmployee = result.data.filter(
        (b: any) => b.employeeId === null
      )
      expect(withoutEmployee.length).toBe(1)
    })

    it("should filter terminal bookings by employee", async () => {
      const result = await caller.terminalBookings.list({
        employeeId: SEED_EMPLOYEE_ID,
        limit: 50,
        page: 1,
      })

      expect(result.data.length).toBeGreaterThanOrEqual(2)
      result.data.forEach((b: any) => {
        expect(b.employeeId).toBe(SEED_EMPLOYEE_ID)
      })
    })

    it("should reject import with empty bookings array", async () => {
      await expect(
        caller.terminalBookings.import({
          batchReference: "E2E-BATCH-EMPTY",
          terminalId: "TERMINAL-01",
          bookings: [],
        })
      ).rejects.toThrow()
    })
  })
})
