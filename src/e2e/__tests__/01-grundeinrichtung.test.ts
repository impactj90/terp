/**
 * Phase 1: Grundeinrichtung (Basic Setup)
 *
 * Tests UC-001 through UC-011 against the real database.
 * Requires local Supabase running with seed data.
 *
 * @see docs/use-cases/01-grundeinrichtung.md
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { createAdminCaller, prisma, SEED } from "../helpers"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"

type Caller = Awaited<ReturnType<typeof createAdminCaller>>

describe("Phase 1: Grundeinrichtung", () => {
  let caller: Caller

  // Track created record IDs for cleanup
  const created = {
    tenantIds: [] as string[],
    userGroupIds: [] as string[],
    userIds: [] as string[],
    holidayIds: [] as string[],
    absenceTypeIds: [] as string[],
    bookingTypeIds: [] as string[],
    contactTypeIds: [] as string[],
    contactKindIds: [] as string[],
    employmentTypeIds: [] as string[],
    costCenterIds: [] as string[],
    locationIds: [] as string[],
  }

  // Shared state for cross-test references
  const state: Record<string, string> = {}

  beforeAll(async () => {
    caller = await createAdminCaller()

    // Clean up leftover test data from previous runs
    await prisma.holiday
      .deleteMany({
        where: {
          tenantId: SEED.TENANT_ID,
          holidayDate: {
            gte: new Date("2027-01-01"),
            lt: new Date("2028-01-01"),
          },
        },
      })
      .catch(() => {})
  })

  afterAll(async () => {
    // Cleanup in reverse dependency order
    const deletions: Array<{ model: string; ids: string[] }> = [
      { model: "contactKind", ids: created.contactKindIds },
      { model: "contactType", ids: created.contactTypeIds },
      { model: "location", ids: created.locationIds },
      { model: "costCenter", ids: created.costCenterIds },
      { model: "employmentType", ids: created.employmentTypeIds },
      { model: "bookingType", ids: created.bookingTypeIds },
      { model: "absenceType", ids: created.absenceTypeIds },
      { model: "holiday", ids: created.holidayIds },
    ]

    for (const { model, ids } of deletions) {
      if (ids.length > 0) {
        await (prisma[model as keyof typeof prisma] as any)
          .deleteMany({ where: { id: { in: ids } } })
          .catch(() => {})
      }
    }

    // Users need user_tenants cleaned up first
    if (created.userIds.length > 0) {
      await prisma.userTenant
        .deleteMany({ where: { userId: { in: created.userIds } } })
        .catch(() => {})
      await prisma.user
        .deleteMany({ where: { id: { in: created.userIds } } })
        .catch(() => {})
    }

    if (created.userGroupIds.length > 0) {
      await prisma.userGroup
        .deleteMany({ where: { id: { in: created.userGroupIds } } })
        .catch(() => {})
    }

    // Tenants: clean up user_tenant entries for test tenants, then tenants
    if (created.tenantIds.length > 0) {
      await prisma.userTenant
        .deleteMany({ where: { tenantId: { in: created.tenantIds } } })
        .catch(() => {})
      await prisma.tenant
        .deleteMany({ where: { id: { in: created.tenantIds } } })
        .catch(() => {})
    }
  })

  // =========================================================
  // UC-001: Mandant anlegen
  // =========================================================
  describe("UC-001: Mandant anlegen", () => {
    it("should create a new tenant with all required fields", async () => {
      const result = await caller.tenants.create({
        name: "E2E Test GmbH",
        slug: "e2e-test-gmbh",
        addressStreet: "Teststraße 1",
        addressZip: "80331",
        addressCity: "München",
        addressCountry: "DE",
        vacationBasis: "calendar_year",
      })

      expect(result.id).toBeDefined()
      expect(result.name).toBe("E2E Test GmbH")
      expect(result.slug).toBe("e2e-test-gmbh")
      expect(result.isActive).toBe(true)
      created.tenantIds.push(result.id)
    })

    it("should reject duplicate slugs", async () => {
      await expect(
        caller.tenants.create({
          name: "Duplicate Slug Test",
          slug: "e2e-test-gmbh",
          addressStreet: "Test",
          addressZip: "12345",
          addressCity: "Berlin",
          addressCountry: "DE",
        })
      ).rejects.toThrow()
    })

    it("should list tenants including the new one", async () => {
      const result = await caller.tenants.list()
      expect(result.some((t: any) => t.slug === "e2e-test-gmbh")).toBe(true)
    })
  })

  // =========================================================
  // UC-002: Benutzergruppe anlegen
  // =========================================================
  describe("UC-002: Benutzergruppe anlegen", () => {
    it("should create a user group with permissions", async () => {
      // Permissions must be UUIDs from the permission catalog
      const permIds = [
        permissionIdByKey("time_tracking.view_own"),
        permissionIdByKey("time_tracking.book_own"),
      ].filter(Boolean) as string[]

      const result = await caller.userGroups.create({
        name: "E2E Test Gruppe",
        code: "e2e-test-gruppe",
        permissions: permIds,
        isAdmin: false,
      })

      expect(result.id).toBeDefined()
      expect(result.name).toBe("E2E Test Gruppe")
      state.userGroupId = result.id
      created.userGroupIds.push(result.id)
    })

    it("should be visible in the list", async () => {
      const result = await caller.userGroups.list()
      // list may return { data: [...] } or array directly
      const list = Array.isArray(result) ? result : (result as any).data
      const found = list.find((g: any) => g.id === state.userGroupId!)
      expect(found).toBeDefined()
      expect(found!.name).toBe("E2E Test Gruppe")
    })

    it("should create an admin group with isAdmin=true", async () => {
      const result = await caller.userGroups.create({
        name: "E2E Admin Gruppe",
        code: "e2e-admin-gruppe",
        isAdmin: true,
      })

      expect(result.isAdmin).toBe(true)
      state.adminGroupId = result.id
      created.userGroupIds.push(result.id)
    })
  })

  // =========================================================
  // UC-003: Benutzer anlegen
  // =========================================================
  describe("UC-003: Benutzer anlegen", () => {
    it("should create a user with group assignment", async () => {
      const result = await caller.users.create({
        email: "e2e-test-user@example.com",
        displayName: "E2E Test User",
        userGroupId: state.userGroupId!,
      })

      expect(result.id).toBeDefined()
      expect(result.email).toBe("e2e-test-user@example.com")
      expect(result.displayName).toBe("E2E Test User")
      expect(result.isActive).toBe(true)
      state.userId = result.id
      created.userIds.push(result.id)
    })

    it("should have tenant_id set (not NULL)", async () => {
      const user = await caller.users.getById({ id: state.userId! })
      expect(user.tenantId).toBe(SEED.TENANT_ID)
    })

    it("should derive role='user' from non-admin group", async () => {
      const user = await caller.users.getById({ id: state.userId! })
      expect(user.role).toBe("user")
    })

    it("should derive role='admin' from admin group", async () => {
      const result = await caller.users.create({
        email: "e2e-admin-user@example.com",
        displayName: "E2E Admin User",
        userGroupId: state.adminGroupId!,
      })

      expect(result.role).toBe("admin")
      created.userIds.push(result.id)
    })

    it("should reject duplicate emails", async () => {
      await expect(
        caller.users.create({
          email: "e2e-test-user@example.com",
          displayName: "Duplicate User",
        })
      ).rejects.toThrow()
    })
  })

  // =========================================================
  // UC-004: Auth verifizieren (me + permissions endpoints)
  // =========================================================
  describe("UC-004: Auth verifizieren", () => {
    it("should return current user via auth.me", async () => {
      const result = await caller.auth.me()

      expect(result.user.id).toBe(SEED.ADMIN_USER_ID)
      expect(result.user.email).toBe(SEED.ADMIN_EMAIL)
      expect(result.tenants).toBeInstanceOf(Array)
      expect(result.tenants.length).toBeGreaterThan(0)
    })

    it("should return admin permissions via auth.permissions", async () => {
      const result = await caller.auth.permissions()

      expect(result.is_admin).toBe(true)
      expect(result.permission_ids).toBeInstanceOf(Array)
    })
  })

  // =========================================================
  // UC-005: Feiertage generieren
  // =========================================================
  describe("UC-005: Feiertage generieren", () => {
    it("should generate holidays for Bavaria 2027", async () => {
      // generate returns { created: Holiday[] }
      const result = await caller.holidays.generate({
        year: 2027,
        state: "BY",
      })

      expect(result.created).toBeInstanceOf(Array)
      expect(result.created.length).toBeGreaterThan(10) // Bavaria has 13+ holidays
      result.created.forEach((h: any) => created.holidayIds.push(h.id))
    })

    it("should list generated holidays sorted by date", async () => {
      // list returns { data: Holiday[] }
      const { data } = await caller.holidays.list({ year: 2027 })
      expect(data.length).toBeGreaterThan(10)

      // Verify sorted by date
      for (let i = 1; i < data.length; i++) {
        const prev = new Date(data[i - 1]!.holidayDate).getTime()
        const curr = new Date(data[i]!.holidayDate).getTime()
        expect(curr).toBeGreaterThanOrEqual(prev)
      }
    })

    it("should handle duplicate generation with skipExisting", async () => {
      const result = await caller.holidays.generate({
        year: 2027,
        state: "BY",
        skipExisting: true,
      })

      // Should not throw; may return empty or skip duplicates
      expect(result.created).toBeDefined()
      result.created.forEach((h: any) => {
        if (!created.holidayIds.includes(h.id)) {
          created.holidayIds.push(h.id)
        }
      })
    })
  })

  // =========================================================
  // UC-006: Abwesenheitsarten anlegen
  // =========================================================
  describe("UC-006: Abwesenheitsarten anlegen", () => {
    it("should create vacation type with deductsVacation=true", async () => {
      const result = await caller.absenceTypes.create({
        code: "U-E2E",
        name: "E2E Urlaub",
        category: "vacation",
        deductsVacation: true,
        requiresApproval: true,
        color: "#4CAF50",
      })

      expect(result.id).toBeDefined()
      expect(result.code).toBe("U-E2E")
      expect(result.deductsVacation).toBe(true)
      created.absenceTypeIds.push(result.id)
    })

    it("should create sick type with deductsVacation=false", async () => {
      const result = await caller.absenceTypes.create({
        code: "K-E2E",
        name: "E2E Krank",
        category: "illness",
        deductsVacation: false,
        requiresApproval: false,
        color: "#F44336",
      })

      expect(result.id).toBeDefined()
      expect(result.deductsVacation).toBe(false)
      created.absenceTypeIds.push(result.id)
    })

    it("should list absence types including new ones", async () => {
      // list returns { data: AbsenceType[] }
      const { data } = await caller.absenceTypes.list()
      const codes = data.map((t: any) => t.code)
      expect(codes).toContain("U-E2E")
      expect(codes).toContain("K-E2E")
    })
  })

  // =========================================================
  // UC-007: Buchungsarten prüfen/anlegen
  // =========================================================
  describe("UC-007: Buchungsarten prüfen/anlegen", () => {
    it("should have system booking types (in + out)", async () => {
      // list returns { data: BookingType[] }
      const { data } = await caller.bookingTypes.list()
      const systemTypes = data.filter((t: any) => t.isSystem === true)
      expect(systemTypes.length).toBeGreaterThanOrEqual(2)

      const directions = systemTypes.map((t: any) => t.direction)
      expect(directions).toContain("in")
      expect(directions).toContain("out")
    })

    it("should create a custom booking type", async () => {
      const result = await caller.bookingTypes.create({
        code: "E2E-DG",
        name: "E2E Dienstgang",
        direction: "out",
        category: "business_trip",
      })

      expect(result.id).toBeDefined()
      expect(result.direction).toBe("out")
      expect(result.isSystem).toBe(false)
      created.bookingTypeIds.push(result.id)
    })

    it("should not allow deleting system booking types", async () => {
      const { data } = await caller.bookingTypes.list()
      const systemType = data.find((t: any) => t.isSystem === true)
      expect(systemType).toBeDefined()

      await expect(
        caller.bookingTypes.delete({ id: systemType!.id })
      ).rejects.toThrow()
    })
  })

  // =========================================================
  // UC-008: Kontaktarten anlegen
  // =========================================================
  describe("UC-008: Kontaktarten anlegen", () => {
    it("should create a contact type", async () => {
      const result = await caller.contactTypes.create({
        code: "E2E-EMAIL",
        name: "E2E Email",
      })

      expect(result.id).toBeDefined()
      state.contactTypeId = result.id
      created.contactTypeIds.push(result.id)
    })

    it("should create a contact kind linked to the type", async () => {
      const result = await caller.contactKinds.create({
        contactTypeId: state.contactTypeId!,
        code: "E2E-PRIV-EMAIL",
        label: "E2E Privat-Email",
      })

      expect(result.id).toBeDefined()
      created.contactKindIds.push(result.id)
    })

    it("should list contact kinds for the type", async () => {
      // list returns { data: ContactKind[] }
      const { data } = await caller.contactKinds.list({
        contactTypeId: state.contactTypeId!,
      })
      expect(data.length).toBeGreaterThanOrEqual(1)
      expect(data.some((k: any) => k.code === "E2E-PRIV-EMAIL")).toBe(true)
    })
  })

  // =========================================================
  // UC-009: Beschäftigungsarten anlegen
  // =========================================================
  describe("UC-009: Beschäftigungsarten anlegen", () => {
    it("should create full-time and part-time employment types", async () => {
      const fulltime = await caller.employmentTypes.create({
        code: "E2E-VZ",
        name: "E2E Vollzeit",
        weeklyHoursDefault: 40,
      })
      expect(fulltime.id).toBeDefined()
      expect(fulltime.name).toBe("E2E Vollzeit")
      created.employmentTypeIds.push(fulltime.id)

      const parttime = await caller.employmentTypes.create({
        code: "E2E-TZ",
        name: "E2E Teilzeit",
        weeklyHoursDefault: 20,
      })
      expect(parttime.id).toBeDefined()
      created.employmentTypeIds.push(parttime.id)
    })

    it("should list employment types including new ones", async () => {
      // list returns { data: EmploymentType[] }
      const { data } = await caller.employmentTypes.list()
      const codes = data.map((t: any) => t.code)
      expect(codes).toContain("E2E-VZ")
      expect(codes).toContain("E2E-TZ")
    })
  })

  // =========================================================
  // UC-010: Kostenstellen anlegen
  // =========================================================
  describe("UC-010: Kostenstellen anlegen", () => {
    it("should create a cost center", async () => {
      const result = await caller.costCenters.create({
        code: "E2E-KST100",
        name: "E2E Verwaltung",
      })

      expect(result.id).toBeDefined()
      expect(result.code).toBe("E2E-KST100")
      created.costCenterIds.push(result.id)
    })

    it("should reject duplicate cost center codes", async () => {
      await expect(
        caller.costCenters.create({
          code: "E2E-KST100",
          name: "E2E Duplicate",
        })
      ).rejects.toThrow()
    })
  })

  // =========================================================
  // UC-011: Standorte anlegen
  // =========================================================
  describe("UC-011: Standorte anlegen", () => {
    it("should create a location", async () => {
      const result = await caller.locations.create({
        code: "E2E-MUC",
        name: "E2E München",
        address: "Marienplatz 1",
        city: "München",
        country: "DE",
      })

      expect(result.id).toBeDefined()
      expect(result.name).toBe("E2E München")
      created.locationIds.push(result.id)
    })

    it("should list locations including the new one", async () => {
      // list returns { data: Location[] }
      const { data } = await caller.locations.list()
      expect(data.some((l: any) => l.code === "E2E-MUC")).toBe(true)
    })
  })
})
