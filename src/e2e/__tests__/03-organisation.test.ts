/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Phase 3: Organisationsstruktur (Organisation Structure)
 *
 * Tests UC-017 through UC-018 against the real database.
 * Requires local Supabase running with seed data.
 *
 * Covers:
 *   UC-017: Abteilung anlegen (Department)
 *   UC-018: Team anlegen (Team)
 *
 * @see docs/use-cases/03-organisation.md
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { createAdminCaller, prisma, SEED } from "../helpers"

type Caller = Awaited<ReturnType<typeof createAdminCaller>>

describe("Phase 3: Organisationsstruktur", () => {
  let caller: Caller

  // Track created record IDs for cleanup
  const created = {
    teamIds: [] as string[],
    departmentIds: [] as string[],
  }

  // Shared state for cross-test references
  const state: Record<string, string> = {}

  beforeAll(async () => {
    caller = await createAdminCaller()

    // Clean up leftover test data from previous runs (reverse dependency order)
    // Teams reference departments, so delete teams first
    await prisma.team
      .deleteMany({
        where: {
          tenantId: SEED.TENANT_ID,
          name: { startsWith: "E2E" },
        },
      })
      .catch(() => {})

    // Departments: delete children before parents
    // Delete child departments (those with a parent that is also E2E)
    await prisma.department
      .deleteMany({
        where: {
          tenantId: SEED.TENANT_ID,
          code: { startsWith: "E2E" },
          parentId: { not: null },
        },
      })
      .catch(() => {})
    // Delete top-level E2E departments
    await prisma.department
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

    // Teams first (they reference departments)
    if (created.teamIds.length > 0) {
      // Remove team members first (cascade may handle this, but be explicit)
      await prisma.teamMember
        .deleteMany({ where: { teamId: { in: created.teamIds } } })
        .catch(() => {})
      await prisma.team
        .deleteMany({ where: { id: { in: created.teamIds } } })
        .catch(() => {})
    }

    // Departments: delete children first, then parents
    // We reverse the array since children were added after parents
    const deptIds = [...created.departmentIds].reverse()
    for (const id of deptIds) {
      await prisma.department.delete({ where: { id } }).catch(() => {})
    }
  })

  // =========================================================
  // UC-017: Abteilung anlegen (Department)
  // =========================================================
  describe("UC-017: Abteilung anlegen", () => {
    it("should create a top-level department", async () => {
      const result = await caller.departments.create({
        code: "E2E-IT",
        name: "E2E IT-Abteilung",
        description: "E2E Information Technology",
      })

      expect(result.id).toBeDefined()
      expect(result.code).toBe("E2E-IT")
      expect(result.name).toBe("E2E IT-Abteilung")
      expect(result.description).toBe("E2E Information Technology")
      expect(result.tenantId).toBe(SEED.TENANT_ID)
      expect(result.parentId).toBeNull()
      expect(result.managerEmployeeId).toBeNull()
      expect(result.isActive).toBe(true)
      state.itDeptId = result.id
      created.departmentIds.push(result.id)
    })

    it("should create another top-level department", async () => {
      const result = await caller.departments.create({
        code: "E2E-HR",
        name: "E2E Personal",
      })

      expect(result.id).toBeDefined()
      expect(result.parentId).toBeNull()
      state.hrDeptId = result.id
      created.departmentIds.push(result.id)
    })

    it("should create a third top-level department", async () => {
      const result = await caller.departments.create({
        code: "E2E-SALES",
        name: "E2E Vertrieb",
      })

      expect(result.id).toBeDefined()
      state.salesDeptId = result.id
      created.departmentIds.push(result.id)
    })

    it("should create a child department under IT", async () => {
      const result = await caller.departments.create({
        code: "E2E-BE",
        name: "E2E Backend",
        parentId: state.itDeptId!,
      })

      expect(result.id).toBeDefined()
      expect(result.parentId).toBe(state.itDeptId!)
      state.backendDeptId = result.id
      created.departmentIds.push(result.id)
    })

    it("should create another child department under IT", async () => {
      const result = await caller.departments.create({
        code: "E2E-FE",
        name: "E2E Frontend",
        parentId: state.itDeptId!,
      })

      expect(result.id).toBeDefined()
      expect(result.parentId).toBe(state.itDeptId!)
      state.frontendDeptId = result.id
      created.departmentIds.push(result.id)
    })

    it("should reject duplicate department codes within tenant", async () => {
      await expect(
        caller.departments.create({
          code: "E2E-IT",
          name: "E2E Duplicate Code",
        })
      ).rejects.toThrow()
    })

    it("should list departments including the new ones", async () => {
      const { data } = await caller.departments.list()
      const e2eDepts = data.filter((d: any) => d.code.startsWith("E2E"))
      expect(e2eDepts.length).toBeGreaterThanOrEqual(5)

      const codes = e2eDepts.map((d: any) => d.code)
      expect(codes).toContain("E2E-IT")
      expect(codes).toContain("E2E-HR")
      expect(codes).toContain("E2E-SALES")
      expect(codes).toContain("E2E-BE")
      expect(codes).toContain("E2E-FE")
    })

    it("should get a department by ID", async () => {
      const result = await caller.departments.getById({ id: state.itDeptId! })

      expect(result.id).toBe(state.itDeptId!)
      expect(result.code).toBe("E2E-IT")
      expect(result.tenantId).toBe(SEED.TENANT_ID)
    })

    it("should show correct hierarchy in getTree", async () => {
      const tree = await caller.departments.getTree()

      // Find the E2E-IT department in the tree (it should be a root node)
      const itNode = tree.find(
        (node: any) => node.department.code === "E2E-IT"
      )
      expect(itNode).toBeDefined()
      expect(itNode!.department.name).toBe("E2E IT-Abteilung")

      // IT should have Backend and Frontend as children
      expect(itNode!.children.length).toBeGreaterThanOrEqual(2)
      const childCodes = itNode!.children.map(
        (c: any) => c.department.code
      )
      expect(childCodes).toContain("E2E-BE")
      expect(childCodes).toContain("E2E-FE")

      // HR should be a root node with no children
      const hrNode = tree.find(
        (node: any) => node.department.code === "E2E-HR"
      )
      expect(hrNode).toBeDefined()
      expect(hrNode!.children.length).toBe(0)
    })

    it("should filter departments by parentId", async () => {
      const { data } = await caller.departments.list({
        parentId: state.itDeptId!,
      })

      expect(data.length).toBeGreaterThanOrEqual(2)
      data.forEach((d: any) => {
        expect(d.parentId).toBe(state.itDeptId!)
      })
    })

    it("should update a department", async () => {
      const updated = await caller.departments.update({
        id: state.itDeptId!,
        name: "E2E IT-Abteilung (updated)",
        description: "Updated IT department",
      })

      expect(updated.name).toBe("E2E IT-Abteilung (updated)")
      expect(updated.description).toBe("Updated IT department")

      // Revert name for downstream tests
      await caller.departments.update({
        id: state.itDeptId!,
        name: "E2E IT-Abteilung",
      })
    })

    it("should prevent circular references (self-reference)", async () => {
      await expect(
        caller.departments.update({
          id: state.itDeptId!,
          parentId: state.itDeptId!,
        })
      ).rejects.toThrow()
    })

    it("should prevent circular references (indirect cycle)", async () => {
      // Attempt to make IT a child of Backend (which is already a child of IT)
      await expect(
        caller.departments.update({
          id: state.itDeptId!,
          parentId: state.backendDeptId!,
        })
      ).rejects.toThrow()
    })

    it("should prevent deletion of department with children", async () => {
      // IT has Backend and Frontend as children
      await expect(
        caller.departments.delete({ id: state.itDeptId! })
      ).rejects.toThrow()
    })

    it("should allow deletion of leaf department", async () => {
      // Create a department to delete
      const tempDept = await caller.departments.create({
        code: "E2E-TEMP",
        name: "E2E Temporary",
      })
      created.departmentIds.push(tempDept.id)

      const result = await caller.departments.delete({ id: tempDept.id })
      expect(result.success).toBe(true)

      // Remove from cleanup tracker since already deleted
      created.departmentIds = created.departmentIds.filter(
        (id) => id !== tempDept.id
      )

      // Verify it is gone
      await expect(
        caller.departments.getById({ id: tempDept.id })
      ).rejects.toThrow()
    })
  })

  // =========================================================
  // UC-018: Team anlegen (Team)
  // =========================================================
  describe("UC-018: Team anlegen", () => {
    it("should create a team linked to a department", async () => {
      const result = await caller.teams.create({
        name: "E2E Backend-Team",
        description: "E2E Backend development team",
        departmentId: state.backendDeptId!,
      })

      expect(result.id).toBeDefined()
      expect(result.name).toBe("E2E Backend-Team")
      expect(result.description).toBe("E2E Backend development team")
      expect(result.departmentId).toBe(state.backendDeptId!)
      expect(result.tenantId).toBe(SEED.TENANT_ID)
      expect(result.isActive).toBe(true)
      expect(result.memberCount).toBe(0)
      state.backendTeamId = result.id
      created.teamIds.push(result.id)
    })

    it("should create a team without a department", async () => {
      const result = await caller.teams.create({
        name: "E2E Projektteam Alpha",
        description: "Cross-departmental project team",
      })

      expect(result.id).toBeDefined()
      expect(result.departmentId).toBeNull()
      state.projectTeamId = result.id
      created.teamIds.push(result.id)
    })

    it("should create a team under Frontend department", async () => {
      const result = await caller.teams.create({
        name: "E2E Frontend-Team",
        departmentId: state.frontendDeptId!,
      })

      expect(result.id).toBeDefined()
      expect(result.departmentId).toBe(state.frontendDeptId!)
      state.frontendTeamId = result.id
      created.teamIds.push(result.id)
    })

    it("should reject duplicate team names within tenant", async () => {
      await expect(
        caller.teams.create({
          name: "E2E Backend-Team",
        })
      ).rejects.toThrow()
    })

    it("should list teams including the new ones", async () => {
      const result = await caller.teams.list()
      const e2eTeams = result.items.filter((t: any) =>
        t.name.startsWith("E2E")
      )
      expect(e2eTeams.length).toBeGreaterThanOrEqual(3)

      const names = e2eTeams.map((t: any) => t.name)
      expect(names).toContain("E2E Backend-Team")
      expect(names).toContain("E2E Frontend-Team")
      expect(names).toContain("E2E Projektteam Alpha")
    })

    it("should filter teams by departmentId", async () => {
      const result = await caller.teams.list({
        departmentId: state.backendDeptId!,
      })

      expect(result.items.length).toBeGreaterThanOrEqual(1)
      result.items.forEach((t: any) => {
        expect(t.departmentId).toBe(state.backendDeptId!)
      })
    })

    it("should include department info in team list", async () => {
      const result = await caller.teams.list()
      const backendTeam = result.items.find(
        (t: any) => t.id === state.backendTeamId!
      )
      expect(backendTeam).toBeDefined()
      expect(backendTeam!.department).toBeDefined()
      expect(backendTeam!.department!.code).toBe("E2E-BE")
    })

    it("should get a team by ID", async () => {
      const result = await caller.teams.getById({ id: state.backendTeamId! })

      expect(result.id).toBe(state.backendTeamId!)
      expect(result.name).toBe("E2E Backend-Team")
      expect(result.department).toBeDefined()
      expect(result.department!.code).toBe("E2E-BE")
    })

    it("should update a team", async () => {
      const updated = await caller.teams.update({
        id: state.backendTeamId!,
        name: "E2E Backend-Team (updated)",
        description: "Updated backend team description",
      })

      expect(updated.name).toBe("E2E Backend-Team (updated)")
      expect(updated.description).toBe("Updated backend team description")

      // Revert name for downstream tests
      await caller.teams.update({
        id: state.backendTeamId!,
        name: "E2E Backend-Team",
      })
    })

    it("should move a team to a different department", async () => {
      const updated = await caller.teams.update({
        id: state.projectTeamId!,
        departmentId: state.itDeptId!,
      })

      expect(updated.departmentId).toBe(state.itDeptId!)

      // Move it back to no department
      await caller.teams.update({
        id: state.projectTeamId!,
        departmentId: null,
      })
    })

    it("should search teams by name", async () => {
      const result = await caller.teams.list({ search: "E2E Backend" })

      expect(result.items.length).toBeGreaterThanOrEqual(1)
      expect(
        result.items.some((t: any) => t.name === "E2E Backend-Team")
      ).toBe(true)
    })

    it("should get team members (empty initially)", async () => {
      const result = await caller.teams.getMembers({
        teamId: state.backendTeamId!,
      })

      expect(result.items).toBeInstanceOf(Array)
      expect(result.items.length).toBe(0)
    })

    it("should delete a team", async () => {
      // Create a throwaway team to delete
      const tempTeam = await caller.teams.create({
        name: "E2E Team To Delete",
      })
      created.teamIds.push(tempTeam.id)

      const result = await caller.teams.delete({ id: tempTeam.id })
      expect(result.success).toBe(true)

      // Remove from cleanup tracker since already deleted
      created.teamIds = created.teamIds.filter((id) => id !== tempTeam.id)
    })

    it("should filter teams by isActive", async () => {
      const result = await caller.teams.list({ isActive: true })

      result.items.forEach((t: any) => {
        expect(t.isActive).toBe(true)
      })
    })

    it("should support pagination", async () => {
      const page1 = await caller.teams.list({ page: 1, pageSize: 2 })

      expect(page1.items.length).toBeLessThanOrEqual(2)
      expect(page1.total).toBeGreaterThanOrEqual(3) // We created 3 E2E teams
    })
  })
})
