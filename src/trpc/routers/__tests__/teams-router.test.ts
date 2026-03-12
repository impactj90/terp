import { describe, it, expect, vi } from "vitest"
import { createCallerFactory } from "@/trpc/init"
import { teamsRouter } from "../teams"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import {
  createMockContext,
  createMockSession,
  createUserWithPermissions,
  createMockUserTenant,
} from "./helpers"

// --- Constants ---

const TEAMS_MANAGE = permissionIdByKey("teams.manage")!
const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const USER_ID = "a0000000-0000-4000-a000-000000000001"
const TEAM_ID = "a0000000-0000-4000-a000-000000000300"
const TEAM_A_ID = "a0000000-0000-4000-a000-000000000301"
const TEAM_B_ID = "a0000000-0000-4000-a000-000000000302"
const EMPLOYEE_ID = "a0000000-0000-4000-a000-000000000400"
const EMPLOYEE_B_ID = "a0000000-0000-4000-a000-000000000401"
const DEPT_ID = "a0000000-0000-4000-a000-000000000200"

const createCaller = createCallerFactory(teamsRouter)

// --- Helpers ---

function makeTeam(overrides: Record<string, unknown> = {}) {
  return {
    id: TEAM_ID,
    tenantId: TENANT_ID,
    departmentId: null,
    name: "Frontend Team",
    description: null,
    leaderEmployeeId: null,
    isActive: true,
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
    department: null,
    leader: null,
    _count: { members: 0 },
    ...overrides,
  }
}

function makeMember(overrides: Record<string, unknown> = {}) {
  return {
    teamId: TEAM_ID,
    employeeId: EMPLOYEE_ID,
    role: "member",
    joinedAt: new Date("2025-01-01"),
    employee: {
      id: EMPLOYEE_ID,
      firstName: "John",
      lastName: "Doe",
    },
    ...overrides,
  }
}

function createTestContext(prisma: Record<string, unknown>) {
  return createMockContext({
    prisma: prisma as unknown as ReturnType<typeof createMockContext>["prisma"],
    authToken: "test-token",
    user: createUserWithPermissions([TEAMS_MANAGE], {
      userTenants: [createMockUserTenant(USER_ID, TENANT_ID)],
    }),
    session: createMockSession(),
    tenantId: TENANT_ID,
  })
}

// --- teams.list tests ---

describe("teams.list", () => {
  it("returns teams with member counts", async () => {
    const teams = [
      makeTeam({ id: TEAM_A_ID, name: "Team A", _count: { members: 3 } }),
      makeTeam({ id: TEAM_B_ID, name: "Team B", _count: { members: 5 } }),
    ]
    const mockPrisma = {
      team: {
        findMany: vi.fn().mockResolvedValue(teams),
        count: vi.fn().mockResolvedValue(2),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.list()
    expect(result.items).toHaveLength(2)
    expect(result.items[0]!.memberCount).toBe(3)
    expect(result.items[1]!.memberCount).toBe(5)
    expect(result.total).toBe(2)
  })

  it("filters by isActive", async () => {
    const mockPrisma = {
      team: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.list({ isActive: true })
    const findCall = mockPrisma.team.findMany.mock.calls[0]![0]
    expect(findCall.where.isActive).toBe(true)
  })

  it("filters by departmentId", async () => {
    const mockPrisma = {
      team: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.list({ departmentId: DEPT_ID })
    const findCall = mockPrisma.team.findMany.mock.calls[0]![0]
    expect(findCall.where.departmentId).toBe(DEPT_ID)
  })

  it("returns total count for pagination", async () => {
    const mockPrisma = {
      team: {
        findMany: vi.fn().mockResolvedValue([makeTeam()]),
        count: vi.fn().mockResolvedValue(42),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.list()
    expect(result.total).toBe(42)
  })
})

// --- teams.getById tests ---

describe("teams.getById", () => {
  it("returns team with relations", async () => {
    const team = makeTeam({
      department: { id: DEPT_ID, name: "Engineering", code: "ENG" },
    })
    const mockPrisma = {
      team: {
        findFirst: vi.fn().mockResolvedValue(team),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.getById({ id: TEAM_ID })
    expect(result.id).toBe(TEAM_ID)
    expect(result.department?.name).toBe("Engineering")
  })

  it("returns team with members when includeMembers=true", async () => {
    const team = {
      ...makeTeam(),
      members: [makeMember()],
    }
    const mockPrisma = {
      team: {
        findFirst: vi.fn().mockResolvedValue(team),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.getById({
      id: TEAM_ID,
      includeMembers: true,
    })
    expect(result.members).toHaveLength(1)
    expect(result.members![0]!.employeeId).toBe(EMPLOYEE_ID)
  })

  it("throws NOT_FOUND for missing team", async () => {
    const mockPrisma = {
      team: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(caller.getById({ id: TEAM_ID })).rejects.toThrow(
      "Team not found"
    )
  })
})

// --- teams.create tests ---

describe("teams.create", () => {
  it("creates team successfully", async () => {
    const created = makeTeam()
    const mockPrisma = {
      team: {
        findFirst: vi.fn().mockResolvedValue(null), // no existing
        create: vi.fn().mockResolvedValue(created),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.create({ name: "Frontend Team" })
    expect(result.name).toBe("Frontend Team")
    expect(result.memberCount).toBe(0)
  })

  it("trims whitespace from name, description", async () => {
    const created = makeTeam({ description: "Cool team" })
    const mockPrisma = {
      team: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(created),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.create({
      name: "  Frontend Team  ",
      description: "  Cool team  ",
    })
    const createCall = mockPrisma.team.create.mock.calls[0]![0]
    expect(createCall.data.name).toBe("Frontend Team")
    expect(createCall.data.description).toBe("Cool team")
  })

  it("rejects empty name with BAD_REQUEST", async () => {
    const mockPrisma = {
      team: {},
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(caller.create({ name: "   " })).rejects.toThrow(
      "Team name is required"
    )
  })

  it("rejects duplicate name with CONFLICT", async () => {
    const mockPrisma = {
      team: {
        findFirst: vi.fn().mockResolvedValue(makeTeam()), // existing found
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.create({ name: "Frontend Team" })
    ).rejects.toThrow("Team name already exists")
  })

  it("creates with department assignment", async () => {
    const created = makeTeam({ departmentId: DEPT_ID })
    const mockPrisma = {
      team: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(created),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.create({
      name: "Backend Team",
      departmentId: DEPT_ID,
    })
    expect(result.departmentId).toBe(DEPT_ID)
  })

  it("sets isActive true by default", async () => {
    const created = makeTeam({ isActive: true })
    const mockPrisma = {
      team: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(created),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.create({ name: "Team" })
    const createCall = mockPrisma.team.create.mock.calls[0]![0]
    expect(createCall.data.isActive).toBe(true)
  })
})

// --- teams.update tests ---

describe("teams.update", () => {
  it("updates name, description, isActive", async () => {
    const existing = makeTeam()
    const updated = makeTeam({
      name: "Updated",
      description: "New desc",
      isActive: false,
      _count: { members: 2 },
    })
    const mockPrisma = {
      team: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(existing) // exists check
          .mockResolvedValueOnce(null), // name uniqueness check
        update: vi.fn().mockResolvedValue(updated),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.update({
      id: TEAM_ID,
      name: "Updated",
      description: "New desc",
      isActive: false,
    })
    expect(result.name).toBe("Updated")
  })

  it("rejects empty name with BAD_REQUEST", async () => {
    const existing = makeTeam()
    const mockPrisma = {
      team: {
        findFirst: vi.fn().mockResolvedValue(existing),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.update({ id: TEAM_ID, name: "   " })
    ).rejects.toThrow("Team name is required")
  })

  it("rejects duplicate name with CONFLICT", async () => {
    const existing = makeTeam({ name: "Old Name" })
    const conflicting = makeTeam({ id: TEAM_B_ID, name: "New Name" })
    const mockPrisma = {
      team: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(existing) // exists check
          .mockResolvedValueOnce(conflicting), // uniqueness check -> conflict
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.update({ id: TEAM_ID, name: "New Name" })
    ).rejects.toThrow("Team name already exists")
  })

  it("allows same name (no false conflict)", async () => {
    const existing = makeTeam({ name: "Frontend Team" })
    const updated = makeTeam({ name: "Frontend Team", _count: { members: 0 } })
    const mockPrisma = {
      team: {
        findFirst: vi.fn().mockResolvedValue(existing),
        update: vi.fn().mockResolvedValue(updated),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.update({
      id: TEAM_ID,
      name: "Frontend Team",
    })
    expect(result.name).toBe("Frontend Team")
    // Should NOT do uniqueness check when name hasn't changed
    expect(mockPrisma.team.findFirst).toHaveBeenCalledTimes(1)
  })

  it("clears department when departmentId is null", async () => {
    const existing = makeTeam({ departmentId: DEPT_ID })
    const updated = makeTeam({ departmentId: null, _count: { members: 0 } })
    const mockPrisma = {
      team: {
        findFirst: vi.fn().mockResolvedValue(existing),
        update: vi.fn().mockResolvedValue(updated),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.update({
      id: TEAM_ID,
      departmentId: null,
    })
    expect(result.departmentId).toBeNull()
    const updateCall = mockPrisma.team.update.mock.calls[0]![0]
    expect(updateCall.data.departmentId).toBeNull()
  })

  it("clears leader when leaderEmployeeId is null", async () => {
    const existing = makeTeam({ leaderEmployeeId: EMPLOYEE_ID })
    const updated = makeTeam({
      leaderEmployeeId: null,
      _count: { members: 0 },
    })
    const mockPrisma = {
      team: {
        findFirst: vi.fn().mockResolvedValue(existing),
        update: vi.fn().mockResolvedValue(updated),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.update({
      id: TEAM_ID,
      leaderEmployeeId: null,
    })
    expect(result.leaderEmployeeId).toBeNull()
  })

  it("throws NOT_FOUND for missing team", async () => {
    const mockPrisma = {
      team: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.update({ id: TEAM_ID, name: "Updated" })
    ).rejects.toThrow("Team not found")
  })
})

// --- teams.delete tests ---

describe("teams.delete", () => {
  it("deletes team successfully", async () => {
    const existing = makeTeam()
    const mockPrisma = {
      team: {
        findFirst: vi.fn().mockResolvedValue(existing),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.delete({ id: TEAM_ID })
    expect(result.success).toBe(true)
    expect(mockPrisma.team.deleteMany).toHaveBeenCalledWith({
      where: { id: TEAM_ID, tenantId: TENANT_ID },
    })
  })

  it("throws NOT_FOUND for missing team", async () => {
    const mockPrisma = {
      team: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(caller.delete({ id: TEAM_ID })).rejects.toThrow(
      "Team not found"
    )
  })
})

// --- teams.addMember tests ---

describe("teams.addMember", () => {
  it("adds member successfully with default role member", async () => {
    const team = makeTeam()
    const member = makeMember()
    const mockPrisma = {
      team: {
        findFirst: vi.fn().mockResolvedValue(team),
      },
      teamMember: {
        findUnique: vi.fn().mockResolvedValue(null), // not existing
        create: vi.fn().mockResolvedValue(member),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.addMember({
      teamId: TEAM_ID,
      employeeId: EMPLOYEE_ID,
    })
    expect(result.teamId).toBe(TEAM_ID)
    expect(result.employeeId).toBe(EMPLOYEE_ID)
    expect(result.role).toBe("member")
  })

  it("adds member with specified role", async () => {
    const team = makeTeam()
    const member = makeMember({ role: "lead" })
    const mockPrisma = {
      team: {
        findFirst: vi.fn().mockResolvedValue(team),
      },
      teamMember: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(member),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.addMember({
      teamId: TEAM_ID,
      employeeId: EMPLOYEE_ID,
      role: "lead",
    })
    expect(result.role).toBe("lead")
  })

  it("rejects duplicate member with CONFLICT", async () => {
    const team = makeTeam()
    const existingMember = makeMember()
    const mockPrisma = {
      team: {
        findFirst: vi.fn().mockResolvedValue(team),
      },
      teamMember: {
        findUnique: vi.fn().mockResolvedValue(existingMember), // already exists
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.addMember({ teamId: TEAM_ID, employeeId: EMPLOYEE_ID })
    ).rejects.toThrow("Employee is already a team member")
  })

  it("throws NOT_FOUND for missing team", async () => {
    const mockPrisma = {
      team: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.addMember({ teamId: TEAM_ID, employeeId: EMPLOYEE_ID })
    ).rejects.toThrow("Team not found")
  })
})

// --- teams.updateMemberRole tests ---

describe("teams.updateMemberRole", () => {
  it("updates role successfully", async () => {
    const team = makeTeam()
    const updated = makeMember({ role: "lead" })
    const mockPrisma = {
      team: {
        findFirst: vi.fn().mockResolvedValue(team),
      },
      teamMember: {
        update: vi.fn().mockResolvedValue(updated),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.updateMemberRole({
      teamId: TEAM_ID,
      employeeId: EMPLOYEE_ID,
      role: "lead",
    })
    expect(result.role).toBe("lead")
  })

  it("throws NOT_FOUND for missing team", async () => {
    const mockPrisma = {
      team: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.updateMemberRole({
        teamId: TEAM_ID,
        employeeId: EMPLOYEE_ID,
        role: "lead",
      })
    ).rejects.toThrow("Team not found")
  })

  it("throws NOT_FOUND for non-member employee", async () => {
    const team = makeTeam()
    const mockPrisma = {
      team: {
        findFirst: vi.fn().mockResolvedValue(team),
      },
      teamMember: {
        update: vi.fn().mockRejectedValue(new Error("Record not found")),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.updateMemberRole({
        teamId: TEAM_ID,
        employeeId: EMPLOYEE_ID,
        role: "lead",
      })
    ).rejects.toThrow("Team member not found")
  })
})

// --- teams.removeMember tests ---

describe("teams.removeMember", () => {
  it("removes member successfully", async () => {
    const team = makeTeam()
    const mockPrisma = {
      team: {
        findFirst: vi.fn().mockResolvedValue(team),
      },
      teamMember: {
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.removeMember({
      teamId: TEAM_ID,
      employeeId: EMPLOYEE_ID,
    })
    expect(result.success).toBe(true)
  })

  it("throws NOT_FOUND for missing team", async () => {
    const mockPrisma = {
      team: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.removeMember({ teamId: TEAM_ID, employeeId: EMPLOYEE_ID })
    ).rejects.toThrow("Team not found")
  })

  it("throws NOT_FOUND for non-member employee", async () => {
    const team = makeTeam()
    const mockPrisma = {
      team: {
        findFirst: vi.fn().mockResolvedValue(team),
      },
      teamMember: {
        delete: vi.fn().mockRejectedValue(new Error("Record not found")),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.removeMember({ teamId: TEAM_ID, employeeId: EMPLOYEE_ID })
    ).rejects.toThrow("Team member not found")
  })
})

// --- teams.getMembers tests ---

describe("teams.getMembers", () => {
  it("returns members ordered by joinedAt", async () => {
    const team = makeTeam()
    const members = [
      makeMember({ employeeId: EMPLOYEE_ID, joinedAt: new Date("2025-01-01") }),
      makeMember({ employeeId: EMPLOYEE_B_ID, joinedAt: new Date("2025-06-01"), employee: { id: EMPLOYEE_B_ID, firstName: "Jane", lastName: "Smith" } }),
    ]
    const mockPrisma = {
      team: {
        findFirst: vi.fn().mockResolvedValue(team),
      },
      teamMember: {
        findMany: vi.fn().mockResolvedValue(members),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.getMembers({ teamId: TEAM_ID })
    expect(result.items).toHaveLength(2)
    expect(mockPrisma.teamMember.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { joinedAt: "asc" },
      })
    )
  })

  it("throws NOT_FOUND for missing team", async () => {
    const mockPrisma = {
      team: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.getMembers({ teamId: TEAM_ID })
    ).rejects.toThrow("Team not found")
  })

  it("returns empty array for team with no members", async () => {
    const team = makeTeam()
    const mockPrisma = {
      team: {
        findFirst: vi.fn().mockResolvedValue(team),
      },
      teamMember: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.getMembers({ teamId: TEAM_ID })
    expect(result.items).toEqual([])
  })
})

// --- teams.getByEmployee tests ---

describe("teams.getByEmployee", () => {
  it("returns teams for an employee", async () => {
    const memberships = [
      {
        teamId: TEAM_A_ID,
        employeeId: EMPLOYEE_ID,
        role: "member",
        joinedAt: new Date(),
        team: makeTeam({ id: TEAM_A_ID, name: "Team A" }),
      },
      {
        teamId: TEAM_B_ID,
        employeeId: EMPLOYEE_ID,
        role: "lead",
        joinedAt: new Date(),
        team: makeTeam({ id: TEAM_B_ID, name: "Team B" }),
      },
    ]
    const mockPrisma = {
      teamMember: {
        findMany: vi.fn().mockResolvedValue(memberships),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.getByEmployee({
      employeeId: EMPLOYEE_ID,
    })
    expect(result.items).toHaveLength(2)
    expect(result.items[0]!.name).toBe("Team A")
  })

  it("returns empty array for employee with no teams", async () => {
    const mockPrisma = {
      teamMember: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.getByEmployee({
      employeeId: EMPLOYEE_ID,
    })
    expect(result.items).toEqual([])
  })
})
