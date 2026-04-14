/**
 * Phase 4: Mitarbeiter (Employees)
 *
 * Tests UC-019 through UC-026 against the real database.
 * Requires local Supabase running with seed data.
 *
 * @see docs/use-cases/04-mitarbeiter.md
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { createAdminCaller, prisma, SEED } from "../helpers"

type Caller = Awaited<ReturnType<typeof createAdminCaller>>

describe("Phase 4: Mitarbeiter", () => {
  let caller: Caller

  // Track created record IDs for cleanup
  const created = {
    employeeIds: [] as string[],
    contactIds: [] as string[],
    cardIds: [] as string[],
    tariffAssignmentIds: [] as string[],
    teamIds: [] as string[],
    teamMemberKeys: [] as { teamId: string; employeeId: string }[],
    vacationBalanceIds: [] as string[],
    employeeDayPlanIds: [] as string[],
  }

  // Shared state for cross-test references
  const state: Record<string, string> = {}

  beforeAll(async () => {
    caller = await createAdminCaller()

    // Clean up leftover test data from previous runs
    await prisma.employeeContact
      .deleteMany({
        where: {
          employee: { tenantId: SEED.TENANT_ID, personnelNumber: { startsWith: "E2E" } },
        },
      })
      .catch(() => {})

    await prisma.employeeCard
      .deleteMany({
        where: {
          tenantId: SEED.TENANT_ID,
          cardNumber: { startsWith: "E2E" },
        },
      })
      .catch(() => {})

    await prisma.employeeTariffAssignment
      .deleteMany({
        where: {
          tenantId: SEED.TENANT_ID,
          notes: "E2E test assignment",
        },
      })
      .catch(() => {})

    await prisma.vacationBalance
      .deleteMany({
        where: {
          tenantId: SEED.TENANT_ID,
          employee: { personnelNumber: { startsWith: "E2E" } },
        },
      })
      .catch(() => {})

    await prisma.employeeDayPlan
      .deleteMany({
        where: {
          tenantId: SEED.TENANT_ID,
          employee: { personnelNumber: { startsWith: "E2E" } },
        },
      })
      .catch(() => {})

    // Remove team members for E2E employees, then teams
    await prisma.teamMember
      .deleteMany({
        where: {
          team: { tenantId: SEED.TENANT_ID, name: { startsWith: "E2E" } },
        },
      })
      .catch(() => {})

    await prisma.team
      .deleteMany({
        where: {
          tenantId: SEED.TENANT_ID,
          name: { startsWith: "E2E" },
        },
      })
      .catch(() => {})

    await prisma.employee
      .deleteMany({
        where: {
          tenantId: SEED.TENANT_ID,
          personnelNumber: { startsWith: "E2E" },
        },
      })
      .catch(() => {})
  })

  afterAll(async () => {
    // Cleanup in reverse dependency order

    // Employee day plans
    if (created.employeeDayPlanIds.length > 0) {
      await prisma.employeeDayPlan
        .deleteMany({ where: { id: { in: created.employeeDayPlanIds } } })
        .catch(() => {})
    }

    // Vacation balances
    if (created.vacationBalanceIds.length > 0) {
      await prisma.vacationBalance
        .deleteMany({ where: { id: { in: created.vacationBalanceIds } } })
        .catch(() => {})
    }

    // Team members
    for (const { teamId, employeeId } of created.teamMemberKeys) {
      await prisma.teamMember
        .deleteMany({ where: { teamId, employeeId } })
        .catch(() => {})
    }

    // Teams
    if (created.teamIds.length > 0) {
      await prisma.team
        .deleteMany({ where: { id: { in: created.teamIds } } })
        .catch(() => {})
    }

    // Tariff assignments
    if (created.tariffAssignmentIds.length > 0) {
      await prisma.employeeTariffAssignment
        .deleteMany({ where: { id: { in: created.tariffAssignmentIds } } })
        .catch(() => {})
    }

    // Cards
    if (created.cardIds.length > 0) {
      await prisma.employeeCard
        .deleteMany({ where: { id: { in: created.cardIds } } })
        .catch(() => {})
    }

    // Contacts
    if (created.contactIds.length > 0) {
      await prisma.employeeContact
        .deleteMany({ where: { id: { in: created.contactIds } } })
        .catch(() => {})
    }

    // Employees
    if (created.employeeIds.length > 0) {
      await prisma.employee
        .deleteMany({ where: { id: { in: created.employeeIds } } })
        .catch(() => {})
    }
  })

  // =========================================================
  // UC-019: Mitarbeiter anlegen
  // =========================================================
  describe("UC-019: Mitarbeiter anlegen", () => {
    it("should create a new employee with all required fields", async () => {
      const result = await caller.employees.create({
        personnelNumber: "E2E-001",
        firstName: "E2E",
        lastName: "TestMitarbeiter",
        email: "e2e-employee@test.local",
        entryDate: new Date("2025-01-01"),
        weeklyHours: 40,
        vacationDaysPerYear: 30,
      })

      expect(result.id).toBeDefined()
      expect(result.tenantId).toBe(SEED.TENANT_ID)
      expect(result.personnelNumber).toBe("E2E-001")
      expect(result.firstName).toBe("E2E")
      expect(result.lastName).toBe("TestMitarbeiter")
      expect(result.email).toBe("e2e-employee@test.local")
      expect(result.isActive).toBe(true)
      expect(result.weeklyHours).toBe(40)
      expect(result.vacationDaysPerYear).toBe(30)
      expect(result.pin).toBeDefined() // auto-assigned

      state.employeeId = result.id
      created.employeeIds.push(result.id)
    })

    it("should reject duplicate personnel numbers within the tenant", async () => {
      await expect(
        caller.employees.create({
          personnelNumber: "E2E-001",
          firstName: "Duplicate",
          lastName: "Employee",
          entryDate: new Date("2025-01-01"),
        })
      ).rejects.toThrow()
    })

    it("should list employees and include the new one", async () => {
      const result = await caller.employees.list({
        search: "E2E-001",
      })

      expect(result.items.length).toBeGreaterThanOrEqual(1)
      const found = result.items.find((e) => e.personnelNumber === "E2E-001")
      expect(found).toBeDefined()
      expect(found!.firstName).toBe("E2E")
    })

    it("should get employee detail by ID with relations", async () => {
      const result = await caller.employees.getById({ id: state.employeeId! })

      expect(result.id).toBe(state.employeeId!)
      expect(result.personnelNumber).toBe("E2E-001")
      expect(result.contacts).toBeInstanceOf(Array)
      expect(result.cards).toBeInstanceOf(Array)
    })

    it("should search employees by name", async () => {
      const result = await caller.employees.search({
        query: "TestMitarbeiter",
      })

      expect(result.items.length).toBeGreaterThanOrEqual(1)
      const found = result.items.find((e) => e.personnelNumber === "E2E-001")
      expect(found).toBeDefined()
    })

    it("should create a second employee for team tests", async () => {
      const result = await caller.employees.create({
        personnelNumber: "E2E-002",
        firstName: "E2E",
        lastName: "ZweiterMitarbeiter",
        email: "e2e-employee2@test.local",
        entryDate: new Date("2025-06-01"),
        weeklyHours: 20,
        vacationDaysPerYear: 15,
      })

      expect(result.id).toBeDefined()
      state.employee2Id = result.id
      created.employeeIds.push(result.id)
    })
  })

  // =========================================================
  // UC-020: Kontakte zum Mitarbeiter hinzufuegen
  // =========================================================
  describe("UC-020: Kontakte zum Mitarbeiter hinzufuegen", () => {
    it("should add a contact to the employee", async () => {
      const result = await caller.employeeContacts.create({
        employeeId: state.employeeId!,
        contactType: "email",
        value: "e2e-private@test.local",
        label: "E2E Privat-Email",
        isPrimary: true,
      })

      expect(result.id).toBeDefined()
      expect(result.employeeId).toBe(state.employeeId!)
      expect(result.contactType).toBe("email")
      expect(result.value).toBe("e2e-private@test.local")
      expect(result.isPrimary).toBe(true)
      state.contactId = result.id
      created.contactIds.push(result.id)
    })

    it("should add a second contact (emergency phone)", async () => {
      const result = await caller.employeeContacts.create({
        employeeId: state.employeeId!,
        contactType: "phone",
        value: "+49 123 456789",
        label: "E2E Notfall",
        isPrimary: false,
      })

      expect(result.id).toBeDefined()
      state.contact2Id = result.id
      created.contactIds.push(result.id)
    })

    it("should list contacts for the employee", async () => {
      const { data } = await caller.employeeContacts.list({
        employeeId: state.employeeId!,
      })

      expect(data.length).toBeGreaterThanOrEqual(2)
      const emails = data.filter((c) => c.contactType === "email")
      expect(emails.length).toBeGreaterThanOrEqual(1)
    })

    it("should delete a contact", async () => {
      const result = await caller.employeeContacts.delete({
        id: state.contact2Id!,
      })

      expect(result.success).toBe(true)
      // Remove from cleanup since already deleted
      created.contactIds = created.contactIds.filter((id) => id !== state.contact2Id!)

      // Verify it was deleted
      const { data } = await caller.employeeContacts.list({
        employeeId: state.employeeId!,
      })
      const found = data.find((c) => c.id === state.contact2Id!)
      expect(found).toBeUndefined()
    })
  })

  // =========================================================
  // UC-021: Zutrittskarte zuweisen
  // =========================================================
  describe("UC-021: Zutrittskarte zuweisen", () => {
    it("should assign a card to the employee", async () => {
      const result = await caller.employeeCards.create({
        employeeId: state.employeeId!,
        cardNumber: "E2E-CARD-001",
        cardType: "rfid",
      })

      expect(result.id).toBeDefined()
      expect(result.employeeId).toBe(state.employeeId!)
      expect(result.cardNumber).toBe("E2E-CARD-001")
      expect(result.cardType).toBe("rfid")
      expect(result.isActive).toBe(true)
      state.cardId = result.id
      created.cardIds.push(result.id)
    })

    it("should reject duplicate card numbers within the tenant", async () => {
      await expect(
        caller.employeeCards.create({
          employeeId: state.employeeId!,
          cardNumber: "E2E-CARD-001",
        })
      ).rejects.toThrow()
    })

    it("should list cards for the employee", async () => {
      const { data } = await caller.employeeCards.list({
        employeeId: state.employeeId!,
      })

      expect(data.length).toBeGreaterThanOrEqual(1)
      const found = data.find((c) => c.cardNumber === "E2E-CARD-001")
      expect(found).toBeDefined()
      expect(found!.isActive).toBe(true)
    })

    it("should deactivate a card", async () => {
      const result = await caller.employeeCards.deactivate({
        id: state.cardId!,
        reason: "E2E test deactivation",
      })

      expect(result.isActive).toBe(false)
      expect(result.deactivatedAt).toBeDefined()
      expect(result.deactivationReason).toBe("E2E test deactivation")
    })
  })

  // =========================================================
  // UC-022: Tarif dem Mitarbeiter zuweisen
  // =========================================================
  describe("UC-022: Tarif dem Mitarbeiter zuweisen", () => {
    // Use the seed tariff IDs
    const TARIFF_40H = "00000000-0000-0000-0000-000000000701"
    const TARIFF_20H = "00000000-0000-0000-0000-000000000704"

    it(
      "should create a tariff assignment for the employee",
      async () => {
        const result = await caller.employeeTariffAssignments.create({
          employeeId: state.employeeId!,
          tariffId: TARIFF_40H,
          effectiveFrom: new Date("2025-01-01"),
          notes: "E2E test assignment",
        })

        expect(result.id).toBeDefined()
        expect(result.employeeId).toBe(state.employeeId!)
        expect(result.tariffId).toBe(TARIFF_40H)
        expect(result.isActive).toBe(true)
        expect(result.overwriteBehavior).toBe("preserve_manual")
        state.tariffAssignmentId = result.id
        created.tariffAssignmentIds.push(result.id)
      },
      // Extended timeout: assignment create triggers post-commit sync
      // (generateFromTariff + triggerRecalcRange) which can take several
      // seconds when the DB cache is cold.
      30_000,
    )

    it("should reject overlapping tariff assignments", async () => {
      await expect(
        caller.employeeTariffAssignments.create({
          employeeId: state.employeeId!,
          tariffId: TARIFF_20H,
          effectiveFrom: new Date("2025-06-01"),
          notes: "E2E test assignment",
        })
      ).rejects.toThrow(/[Oo]verlap/)
    })

    it("should list tariff assignments for the employee", async () => {
      const { data } = await caller.employeeTariffAssignments.list({
        employeeId: state.employeeId!,
      })

      expect(data.length).toBeGreaterThanOrEqual(1)
      const found = data.find((a) => a.id === state.tariffAssignmentId!)
      expect(found).toBeDefined()
      expect(found!.tariffId).toBe(TARIFF_40H)
    })

    it("should retrieve a tariff assignment by ID", async () => {
      const result = await caller.employeeTariffAssignments.getById({
        employeeId: state.employeeId!,
        id: state.tariffAssignmentId!,
      })

      expect(result.id).toBe(state.tariffAssignmentId!)
      expect(result.tariffId).toBe(TARIFF_40H)
    })

    it("should resolve effective tariff for a date within the assignment range", async () => {
      const result = await caller.employeeTariffAssignments.effective({
        employeeId: state.employeeId!,
        date: "2025-06-15",
      })

      expect(result.tariffId).toBe(TARIFF_40H)
      expect(result.source).toBe("assignment")
      expect(result.assignmentId).toBe(state.tariffAssignmentId!)
    })

    it("should reject effectiveTo before effectiveFrom", async () => {
      await expect(
        caller.employeeTariffAssignments.create({
          employeeId: state.employeeId!,
          tariffId: TARIFF_20H,
          effectiveFrom: new Date("2025-12-01"),
          effectiveTo: new Date("2025-01-01"),
          notes: "E2E test assignment",
        })
      ).rejects.toThrow()
    })

    it(
      "should allow a non-overlapping assignment after closing the first",
      async () => {
        // End the first assignment
        await caller.employeeTariffAssignments.update({
          employeeId: state.employeeId!,
          id: state.tariffAssignmentId!,
          effectiveTo: new Date("2025-12-31"),
        })

        // Create a new assignment starting after the first ends
        const result = await caller.employeeTariffAssignments.create({
          employeeId: state.employeeId!,
          tariffId: TARIFF_20H,
          effectiveFrom: new Date("2026-01-01"),
          notes: "E2E test assignment",
        })

        expect(result.id).toBeDefined()
        expect(result.tariffId).toBe(TARIFF_20H)
        state.tariffAssignment2Id = result.id
        created.tariffAssignmentIds.push(result.id)
      },
      30_000,
    )

    it("should resolve effective tariff to the newer assignment for a date in its range", async () => {
      const result = await caller.employeeTariffAssignments.effective({
        employeeId: state.employeeId!,
        date: "2026-06-15",
      })

      expect(result.tariffId).toBe(TARIFF_20H)
      expect(result.source).toBe("assignment")
      expect(result.assignmentId).toBe(state.tariffAssignment2Id!)
    })
  })

  // =========================================================
  // UC-023: Mitarbeiter einem Team zuweisen
  // =========================================================
  describe("UC-023: Mitarbeiter einem Team zuweisen", () => {
    it("should create a team", async () => {
      const result = await caller.teams.create({
        name: "E2E Test Team",
        description: "Team for E2E testing",
      })

      expect(result.id).toBeDefined()
      expect(result.name).toBe("E2E Test Team")
      expect(result.isActive).toBe(true)
      expect(result.memberCount).toBe(0)
      state.teamId = result.id
      created.teamIds.push(result.id)
    })

    it("should add employee as a team member", async () => {
      const result = await caller.teams.addMember({
        teamId: state.teamId!,
        employeeId: state.employeeId!,
        role: "member",
      })

      expect(result.teamId).toBe(state.teamId!)
      expect(result.employeeId).toBe(state.employeeId!)
      expect(result.role).toBe("member")
      created.teamMemberKeys.push({
        teamId: state.teamId!,
        employeeId: state.employeeId!,
      })
    })

    it("should add second employee as team leader", async () => {
      const result = await caller.teams.addMember({
        teamId: state.teamId!,
        employeeId: state.employee2Id!,
        role: "lead",
      })

      expect(result.role).toBe("lead")
      created.teamMemberKeys.push({
        teamId: state.teamId!,
        employeeId: state.employee2Id!,
      })
    })

    it("should reject adding the same employee to the same team again", async () => {
      await expect(
        caller.teams.addMember({
          teamId: state.teamId!,
          employeeId: state.employeeId!,
          role: "member",
        })
      ).rejects.toThrow()
    })

    it("should list team members", async () => {
      const { items } = await caller.teams.getMembers({
        teamId: state.teamId!,
      })

      expect(items.length).toBe(2)
      const roles = items.map((m) => m.role)
      expect(roles).toContain("member")
      expect(roles).toContain("lead")
    })

    it("should update a member's role", async () => {
      const result = await caller.teams.updateMemberRole({
        teamId: state.teamId!,
        employeeId: state.employeeId!,
        role: "deputy",
      })

      expect(result.role).toBe("deputy")
    })

    it("should get teams for an employee", async () => {
      const { items } = await caller.teams.getByEmployee({
        employeeId: state.employeeId!,
      })

      expect(items.length).toBeGreaterThanOrEqual(1)
      const found = items.find((t) => t.id === state.teamId!)
      expect(found).toBeDefined()
      expect(found!.name).toBe("E2E Test Team")
    })

    it("should remove a member from the team", async () => {
      const result = await caller.teams.removeMember({
        teamId: state.teamId!,
        employeeId: state.employee2Id!,
      })

      expect(result.success).toBe(true)
      created.teamMemberKeys = created.teamMemberKeys.filter(
        (k) => !(k.teamId === state.teamId! && k.employeeId === state.employee2Id!)
      )

      // Verify removal
      const { items } = await caller.teams.getMembers({
        teamId: state.teamId!,
      })
      expect(items.length).toBe(1)
    })
  })

  // =========================================================
  // UC-024: Benutzer mit Mitarbeiter verknuepfen
  // =========================================================
  describe("UC-024: Benutzer mit Mitarbeiter verknuepfen", () => {
    it("should verify seed admin user is linked to an employee", async () => {
      const user = await caller.users.getById({ id: SEED.ADMIN_USER_ID })

      expect(user.employeeId).toBe("00000000-0000-0000-0000-000000000011")
      expect(user.employee).toBeDefined()
      expect(user.employee!.firstName).toBe("Admin")
    })

    it("should verify seed regular user is linked to an employee", async () => {
      const user = await caller.users.getById({ id: SEED.REGULAR_USER_ID })

      expect(user.employeeId).toBe("00000000-0000-0000-0000-000000000012")
      expect(user.employee).toBeDefined()
      expect(user.employee!.firstName).toBe("Regular")
    })

    it("should update a user to link with the E2E employee", async () => {
      // Clean up any leftover user from previous test runs.
      // Must also delete the Supabase auth row — otherwise users.create
      // fails with "email already registered".
      const existingUser = await prisma.user.findFirst({
        where: { email: "e2e-link-test@test.local" },
      })
      if (existingUser) {
        await prisma.userTenant
          .deleteMany({ where: { userId: existingUser.id } })
          .catch(() => {})
        await prisma.user
          .deleteMany({ where: { id: existingUser.id } })
          .catch(() => {})
      }
      try {
        const { createAdminClient } = await import("@/lib/supabase/admin")
        const adminClient = createAdminClient()
        const { data } = await adminClient.auth.admin.listUsers()
        const authMatch = data.users.find(
          (u) => u.email === "e2e-link-test@test.local",
        )
        if (authMatch) {
          await adminClient.auth.admin.deleteUser(authMatch.id)
        }
      } catch {
        // best-effort
      }

      // Create a test user first
      const created = await caller.users.create({
        email: "e2e-link-test@test.local",
        displayName: "E2E Link Test",
      })
      const newUser = created.user

      state.linkTestUserId = newUser.id

      // Link the user to the E2E employee
      const updated = await caller.users.update({
        id: newUser.id,
        employeeId: state.employeeId!,
      })

      expect(updated.employeeId).toBe(state.employeeId!)

      // Verify via getById
      const verified = await caller.users.getById({ id: newUser.id })
      expect(verified.employeeId).toBe(state.employeeId!)
      expect(verified.employee).toBeDefined()
      expect(verified.employee!.firstName).toBe("E2E")

      // Clean up: delete user (DB + auth)
      await caller.users.delete({ id: newUser.id })
      await prisma.userTenant
        .deleteMany({ where: { userId: newUser.id } })
        .catch(() => {})
      await prisma.user
        .deleteMany({ where: { id: newUser.id } })
        .catch(() => {})
      try {
        const { createAdminClient } = await import("@/lib/supabase/admin")
        const adminClient = createAdminClient()
        await adminClient.auth.admin.deleteUser(newUser.id)
      } catch {
        // best-effort
      }
    })
  })

  // =========================================================
  // UC-025: Urlaubssaldo initialisieren
  // =========================================================
  describe("UC-025: Urlaubssaldo initialisieren", () => {
    it("should create a vacation balance for the E2E employee", async () => {
      const result = await caller.vacationBalances.create({
        employeeId: state.employeeId!,
        year: 2027,
        entitlement: 30,
        carryover: 5,
        adjustments: 0,
      })

      expect(result.id).toBeDefined()
      expect(result.employeeId).toBe(state.employeeId!)
      expect(result.year).toBe(2027)
      expect(result.entitlement).toBe(30)
      expect(result.carryover).toBe(5)
      expect(result.adjustments).toBe(0)
      expect(result.taken).toBe(0)
      expect(result.total).toBe(35) // entitlement + carryover + adjustments
      expect(result.available).toBe(35) // total - taken
      state.vacationBalanceId = result.id
      created.vacationBalanceIds.push(result.id)
    })

    it("should reject duplicate balance for the same employee and year", async () => {
      await expect(
        caller.vacationBalances.create({
          employeeId: state.employeeId!,
          year: 2027,
          entitlement: 20,
          carryover: 0,
          adjustments: 0,
        })
      ).rejects.toThrow()
    })

    it("should list vacation balances and include the new one", async () => {
      const result = await caller.vacationBalances.list({
        employeeId: state.employeeId!,
        year: 2027,
      })

      expect(result.items.length).toBeGreaterThanOrEqual(1)
      const found = result.items.find((b) => b.id === state.vacationBalanceId!)
      expect(found).toBeDefined()
      expect(found!.entitlement).toBe(30)
      expect(found!.total).toBe(35)
    })

    it("should get vacation balance by ID", async () => {
      const result = await caller.vacationBalances.getById({
        id: state.vacationBalanceId!,
      })

      expect(result.id).toBe(state.vacationBalanceId!)
      expect(result.year).toBe(2027)
      expect(result.available).toBe(35)
    })

    it("should update vacation balance adjustments", async () => {
      const result = await caller.vacationBalances.update({
        id: state.vacationBalanceId!,
        adjustments: 2,
      })

      expect(result.adjustments).toBe(2)
      expect(result.total).toBe(37) // 30 + 5 + 2
      expect(result.available).toBe(37) // 37 - 0
    })

    it("should verify seed vacation balances exist", async () => {
      // Admin employee has 2026 balance: entitlement=30, carryover=3, taken=3
      const result = await caller.vacationBalances.list({
        employeeId: "00000000-0000-0000-0000-000000000011",
        year: 2026,
      })

      expect(result.items.length).toBeGreaterThanOrEqual(1)
      const adminBalance = result.items.find(
        (b) => b.employeeId === "00000000-0000-0000-0000-000000000011"
      )
      expect(adminBalance).toBeDefined()
      expect(adminBalance!.entitlement).toBe(30)
      expect(adminBalance!.carryover).toBe(3)
    })
  })

  // =========================================================
  // UC-026: Tagesplaene fuer Mitarbeiter generieren
  // =========================================================
  describe("UC-026: Tagesplaene fuer Mitarbeiter generieren", () => {
    it("should create a single employee day plan manually", async () => {
      const result = await caller.employeeDayPlans.create({
        employeeId: state.employeeId!,
        planDate: "2027-01-04",
        source: "manual",
        notes: "E2E manual day plan",
      })

      expect(result.id).toBeDefined()
      expect(result.employeeId).toBe(state.employeeId!)
      expect(result.source).toBe("manual")
      state.dayPlanId = result.id
      created.employeeDayPlanIds.push(result.id)
    })

    it("should list employee day plans for a date range", async () => {
      const { data } = await caller.employeeDayPlans.list({
        employeeId: state.employeeId!,
        from: "2027-01-01",
        to: "2027-01-31",
      })

      expect(data.length).toBeGreaterThanOrEqual(1)
      const found = data.find((p) => p.id === state.dayPlanId!)
      expect(found).toBeDefined()
    })

    it("should list day plans for a specific employee", async () => {
      const { data } = await caller.employeeDayPlans.forEmployee({
        employeeId: state.employeeId!,
        from: "2027-01-01",
        to: "2027-01-31",
      })

      expect(data.length).toBeGreaterThanOrEqual(1)
    })

    it("should get employee day plan by ID", async () => {
      const result = await caller.employeeDayPlans.getById({
        id: state.dayPlanId!,
      })

      expect(result.id).toBe(state.dayPlanId!)
      expect(result.source).toBe("manual")
    })

    it("should update an employee day plan", async () => {
      const result = await caller.employeeDayPlans.update({
        id: state.dayPlanId!,
        notes: "E2E updated day plan",
      })

      expect(result.notes).toBe("E2E updated day plan")
    })

    it("should bulk create employee day plans (upsert)", async () => {
      const result = await caller.employeeDayPlans.bulkCreate({
        entries: [
          {
            employeeId: state.employeeId!,
            planDate: "2027-01-05",
            source: "tariff",
          },
          {
            employeeId: state.employeeId!,
            planDate: "2027-01-06",
            source: "tariff",
          },
          {
            employeeId: state.employeeId!,
            planDate: "2027-01-07",
            source: "tariff",
          },
        ],
      })

      expect(result.created).toBeGreaterThanOrEqual(3)

      // Track for cleanup
      const { data } = await caller.employeeDayPlans.forEmployee({
        employeeId: state.employeeId!,
        from: "2027-01-05",
        to: "2027-01-07",
      })
      data.forEach((p) => created.employeeDayPlanIds.push(p.id))
    })

    it("should delete a date range of employee day plans", async () => {
      const result = await caller.employeeDayPlans.deleteRange({
        employeeId: state.employeeId!,
        from: "2027-01-05",
        to: "2027-01-07",
      })

      expect(result.deleted).toBeGreaterThanOrEqual(3)

      // Remove from cleanup since already deleted
      const { data } = await caller.employeeDayPlans.forEmployee({
        employeeId: state.employeeId!,
        from: "2027-01-05",
        to: "2027-01-07",
      })
      expect(data.length).toBe(0)
    })

    it("should delete a single employee day plan", async () => {
      const result = await caller.employeeDayPlans.delete({
        id: state.dayPlanId!,
      })

      expect(result.success).toBe(true)
      created.employeeDayPlanIds = created.employeeDayPlanIds.filter(
        (id) => id !== state.dayPlanId!
      )
    })

    it("should generate day plans from tariff for seed employees", async () => {
      // This tests the tariff-based generation using the seed employee
      // with an existing tariff assignment
      const result = await caller.employeeDayPlans.generateFromTariff({
        employeeIds: ["00000000-0000-0000-0000-000000000011"],
        from: "2027-02-01",
        to: "2027-02-28",
        overwriteTariffSource: true,
      })

      expect(result.employeesProcessed).toBeGreaterThanOrEqual(1)
      // plansCreated may be 0 if the tariff generates no plans (depends on week plan config)
      // but the processing should succeed

      // Clean up the generated plans
      await prisma.employeeDayPlan
        .deleteMany({
          where: {
            tenantId: SEED.TENANT_ID,
            employeeId: "00000000-0000-0000-0000-000000000011",
            planDate: {
              gte: new Date("2027-02-01"),
              lte: new Date("2027-02-28"),
            },
          },
        })
        .catch(() => {})
    })
  })
})
