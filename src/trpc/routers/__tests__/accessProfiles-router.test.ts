import { describe, it, expect, vi } from "vitest"
import { createCallerFactory } from "@/trpc/init"
import { accessProfilesRouter } from "../accessProfiles"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import {
  createMockContext,
  createMockSession,
  createUserWithPermissions,
  createMockUserTenant,
} from "./helpers"

// --- Constants ---

const ACCESS_CONTROL_MANAGE = permissionIdByKey("access_control.manage")!
const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const USER_ID = "a0000000-0000-4000-a000-000000000001"
const PROFILE_ID = "a0000000-0000-4000-a000-000000000300"

const createCaller = createCallerFactory(accessProfilesRouter)

// --- Helpers ---

function makeProfile(
  overrides: Partial<{
    id: string
    tenantId: string
    code: string
    name: string
    description: string | null
    isActive: boolean
    createdAt: Date
    updatedAt: Date
  }> = {}
) {
  return {
    id: PROFILE_ID,
    tenantId: TENANT_ID,
    code: "PROF-A",
    name: "Profile A",
    description: null,
    isActive: true,
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
    ...overrides,
  }
}

function createTestContext(prisma: Record<string, unknown>) {
  return createMockContext({
    prisma: prisma as unknown as ReturnType<typeof createMockContext>["prisma"],
    authToken: "test-token",
    user: createUserWithPermissions([ACCESS_CONTROL_MANAGE], {
      userTenants: [createMockUserTenant(USER_ID, TENANT_ID)],
    }),
    session: createMockSession(),
    tenantId: TENANT_ID,
  })
}

function createNoPermContext(prisma: Record<string, unknown>) {
  return createMockContext({
    prisma: prisma as unknown as ReturnType<typeof createMockContext>["prisma"],
    authToken: "test-token",
    user: createUserWithPermissions([], {
      userTenants: [createMockUserTenant(USER_ID, TENANT_ID)],
    }),
    session: createMockSession(),
    tenantId: TENANT_ID,
  })
}

// --- accessProfiles.list tests ---

describe("accessProfiles.list", () => {
  it("returns all profiles ordered by code", async () => {
    const profiles = [
      makeProfile({ code: "PROF-A" }),
      makeProfile({
        id: "a0000000-0000-4000-a000-000000000301",
        code: "PROF-B",
      }),
    ]
    const mockPrisma = {
      accessProfile: {
        findMany: vi.fn().mockResolvedValue(profiles),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.list()

    expect(result.data).toHaveLength(2)
    expect(result.data[0]!.code).toBe("PROF-A")
    expect(result.data[1]!.code).toBe("PROF-B")
    expect(mockPrisma.accessProfile.findMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT_ID },
      orderBy: { code: "asc" },
    })
  })

  it("denies access without permission", async () => {
    const mockPrisma = {
      accessProfile: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    }
    const caller = createCaller(createNoPermContext(mockPrisma))
    await expect(caller.list()).rejects.toThrow("Insufficient permissions")
  })
})

// --- accessProfiles.getById tests ---

describe("accessProfiles.getById", () => {
  it("returns profile by ID", async () => {
    const profile = makeProfile()
    const mockPrisma = {
      accessProfile: {
        findFirst: vi.fn().mockResolvedValue(profile),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.getById({ id: PROFILE_ID })

    expect(result.id).toBe(PROFILE_ID)
    expect(result.code).toBe("PROF-A")
    expect(result.name).toBe("Profile A")
    expect(mockPrisma.accessProfile.findFirst).toHaveBeenCalledWith({
      where: { id: PROFILE_ID, tenantId: TENANT_ID },
    })
  })

  it("throws NOT_FOUND for missing ID", async () => {
    const mockPrisma = {
      accessProfile: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(caller.getById({ id: PROFILE_ID })).rejects.toThrow(
      "Access profile not found"
    )
  })
})

// --- accessProfiles.create tests ---

describe("accessProfiles.create", () => {
  it("creates profile with valid input", async () => {
    const profile = makeProfile()
    const mockPrisma = {
      accessProfile: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(profile),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.create({
      code: "PROF-A",
      name: "Profile A",
      description: "A profile",
    })

    expect(result.id).toBe(PROFILE_ID)
    expect(result.code).toBe("PROF-A")
    expect(mockPrisma.accessProfile.create).toHaveBeenCalledWith({
      data: {
        tenantId: TENANT_ID,
        code: "PROF-A",
        name: "Profile A",
        description: "A profile",
        isActive: true,
      },
    })
  })

  it("validates code required", async () => {
    const mockPrisma = {
      accessProfile: {
        findFirst: vi.fn(),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.create({ code: "   ", name: "Profile A" })
    ).rejects.toThrow("Access profile code is required")
  })

  it("validates name required", async () => {
    const mockPrisma = {
      accessProfile: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.create({ code: "PROF-A", name: "   " })
    ).rejects.toThrow("Access profile name is required")
  })

  it("rejects duplicate code (CONFLICT)", async () => {
    const mockPrisma = {
      accessProfile: {
        findFirst: vi.fn().mockResolvedValue(makeProfile()),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.create({ code: "PROF-A", name: "Profile A" })
    ).rejects.toThrow("Access profile code already exists")
  })
})

// --- accessProfiles.update tests ---

describe("accessProfiles.update", () => {
  it("partial update succeeds", async () => {
    const existing = makeProfile()
    const updated = makeProfile({ name: "Profile A Updated" })
    const mockPrisma = {
      accessProfile: {
        findFirst: vi.fn().mockResolvedValue(existing),
        update: vi.fn().mockResolvedValue(updated),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.update({
      id: PROFILE_ID,
      name: "Profile A Updated",
    })

    expect(result.name).toBe("Profile A Updated")
    expect(mockPrisma.accessProfile.update).toHaveBeenCalledWith({
      where: { id: PROFILE_ID },
      data: { name: "Profile A Updated" },
    })
  })

  it("throws NOT_FOUND for missing profile", async () => {
    const mockPrisma = {
      accessProfile: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.update({ id: PROFILE_ID, name: "New Name" })
    ).rejects.toThrow("Access profile not found")
  })

  it("validates name non-empty when provided", async () => {
    const existing = makeProfile()
    const mockPrisma = {
      accessProfile: {
        findFirst: vi.fn().mockResolvedValue(existing),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.update({ id: PROFILE_ID, name: "   " })
    ).rejects.toThrow("Access profile name is required")
  })
})

// --- accessProfiles.delete tests ---

describe("accessProfiles.delete", () => {
  it("deletes profile with no assignments", async () => {
    const existing = makeProfile()
    const mockPrisma = {
      accessProfile: {
        findFirst: vi.fn().mockResolvedValue(existing),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      employeeAccessAssignment: {
        count: vi.fn().mockResolvedValue(0),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.delete({ id: PROFILE_ID })

    expect(result.success).toBe(true)
    expect(mockPrisma.employeeAccessAssignment.count).toHaveBeenCalledWith({
      where: { accessProfileId: PROFILE_ID },
    })
    expect(mockPrisma.accessProfile.deleteMany).toHaveBeenCalledWith({
      where: { id: PROFILE_ID, tenantId: TENANT_ID },
    })
  })

  it("throws NOT_FOUND for missing profile", async () => {
    const mockPrisma = {
      accessProfile: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(caller.delete({ id: PROFILE_ID })).rejects.toThrow(
      "Access profile not found"
    )
  })

  it("blocks deletion when profile is in use (CONFLICT)", async () => {
    const existing = makeProfile()
    const mockPrisma = {
      accessProfile: {
        findFirst: vi.fn().mockResolvedValue(existing),
      },
      employeeAccessAssignment: {
        count: vi.fn().mockResolvedValue(3),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(caller.delete({ id: PROFILE_ID })).rejects.toThrow(
      "Access profile is in use by employee assignments and cannot be deleted"
    )
  })
})
