import { describe, it, expect, vi } from "vitest"
import { createCallerFactory } from "@/trpc/init"
import { bookingTypeGroupsRouter } from "../bookingTypeGroups"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import {
  createMockContext,
  createMockSession,
  createUserWithPermissions,
  createMockUserTenant,
} from "./helpers"

// --- Constants ---

const BOOKING_TYPES_MANAGE = permissionIdByKey("booking_types.manage")!
const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const USER_ID = "a0000000-0000-4000-a000-000000000001"
const GROUP_ID = "a0000000-0000-4000-a000-000000001100"
const _GROUP_B_ID = "a0000000-0000-4000-a000-000000001101"
const BT_ID_1 = "a0000000-0000-4000-a000-000000000900"
const BT_ID_2 = "a0000000-0000-4000-a000-000000000901"
const MEMBER_ID_1 = "a0000000-0000-4000-a000-000000001200"
const MEMBER_ID_2 = "a0000000-0000-4000-a000-000000001201"

const createCaller = createCallerFactory(bookingTypeGroupsRouter)

// --- Helpers ---

function makeMember(
  overrides: Partial<{
    id: string
    bookingTypeId: string
    sortOrder: number
    bookingType: {
      id: string
      code: string
      name: string
      direction: string
      category: string
    }
  }> = {}
) {
  return {
    id: MEMBER_ID_1,
    bookingTypeId: BT_ID_1,
    sortOrder: 0,
    bookingType: {
      id: BT_ID_1,
      code: "COME",
      name: "Clock In",
      direction: "in",
      category: "work",
    },
    ...overrides,
  }
}

function makeGroup(
  overrides: Partial<{
    id: string
    tenantId: string
    code: string
    name: string
    description: string | null
    isActive: boolean
    createdAt: Date
    updatedAt: Date
    members: ReturnType<typeof makeMember>[]
  }> = {}
) {
  return {
    id: GROUP_ID,
    tenantId: TENANT_ID,
    code: "BTG001",
    name: "Work Types",
    description: null,
    isActive: true,
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
    members: [],
    ...overrides,
  }
}

function createTestContext(prisma: Record<string, unknown>) {
  return createMockContext({
    prisma: prisma as unknown as ReturnType<typeof createMockContext>["prisma"],
    authToken: "test-token",
    user: createUserWithPermissions([BOOKING_TYPES_MANAGE], {
      userTenants: [createMockUserTenant(USER_ID, TENANT_ID)],
    }),
    session: createMockSession(),
    tenantId: TENANT_ID,
  })
}

// --- bookingTypeGroups.list tests ---

describe("bookingTypeGroups.list", () => {
  it("returns groups with members for tenant", async () => {
    const groups = [
      makeGroup({
        id: GROUP_ID,
        code: "BTG001",
        members: [
          makeMember({ id: MEMBER_ID_1, bookingTypeId: BT_ID_1, sortOrder: 0 }),
          makeMember({
            id: MEMBER_ID_2,
            bookingTypeId: BT_ID_2,
            sortOrder: 1,
            bookingType: {
              id: BT_ID_2,
              code: "GO",
              name: "Clock Out",
              direction: "out",
              category: "work",
            },
          }),
        ],
      }),
    ]
    const mockPrisma = {
      bookingTypeGroup: {
        findMany: vi.fn().mockResolvedValue(groups),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.list()
    expect(result.data).toHaveLength(1)
    expect(result.data[0]!.members).toHaveLength(2)
    expect(result.data[0]!.members[0]!.bookingType.code).toBe("COME")
    expect(result.data[0]!.members[1]!.bookingType.code).toBe("GO")
  })
})

// --- bookingTypeGroups.getById tests ---

describe("bookingTypeGroups.getById", () => {
  it("returns group with members", async () => {
    const group = makeGroup({
      members: [makeMember()],
    })
    const mockPrisma = {
      bookingTypeGroup: {
        findFirst: vi.fn().mockResolvedValue(group),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.getById({ id: GROUP_ID })
    expect(result.id).toBe(GROUP_ID)
    expect(result.members).toHaveLength(1)
    expect(result.members[0]!.bookingType.code).toBe("COME")
  })

  it("throws NOT_FOUND for missing group", async () => {
    const mockPrisma = {
      bookingTypeGroup: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(caller.getById({ id: GROUP_ID })).rejects.toThrow(
      "Booking type group not found"
    )
  })
})

// --- bookingTypeGroups.create tests ---

describe("bookingTypeGroups.create", () => {
  it("creates without members", async () => {
    const created = makeGroup()
    const mockPrisma = {
      bookingTypeGroup: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(created),
        findUniqueOrThrow: vi.fn().mockResolvedValue(created),
      },
      bookingTypeGroupMember: {},
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.create({ code: "BTG001", name: "Work Types" })
    expect(result.code).toBe("BTG001")
    expect(result.members).toHaveLength(0)
  })

  it("creates with members", async () => {
    const created = makeGroup()
    const withMembers = makeGroup({
      members: [
        makeMember({ id: MEMBER_ID_1, bookingTypeId: BT_ID_1, sortOrder: 0 }),
        makeMember({
          id: MEMBER_ID_2,
          bookingTypeId: BT_ID_2,
          sortOrder: 1,
          bookingType: {
            id: BT_ID_2,
            code: "GO",
            name: "Clock Out",
            direction: "out",
            category: "work",
          },
        }),
      ],
    })
    const mockPrisma = {
      bookingTypeGroup: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(created),
        findUniqueOrThrow: vi.fn().mockResolvedValue(withMembers),
      },
      bookingTypeGroupMember: {
        createMany: vi.fn().mockResolvedValue({ count: 2 }),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.create({
      code: "BTG001",
      name: "Work Types",
      bookingTypeIds: [BT_ID_1, BT_ID_2],
    })
    expect(result.members).toHaveLength(2)
    expect(mockPrisma.bookingTypeGroupMember.createMany).toHaveBeenCalledWith({
      data: [
        { groupId: GROUP_ID, bookingTypeId: BT_ID_1, sortOrder: 0 },
        { groupId: GROUP_ID, bookingTypeId: BT_ID_2, sortOrder: 1 },
      ],
    })
  })

  it("validates code + name", async () => {
    const mockPrisma = {
      bookingTypeGroup: {},
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.create({ code: "   ", name: "Work Types" })
    ).rejects.toThrow("Booking type group code is required")
    await expect(
      caller.create({ code: "BTG001", name: "   " })
    ).rejects.toThrow("Booking type group name is required")
  })

  it("rejects duplicate code", async () => {
    const mockPrisma = {
      bookingTypeGroup: {
        findFirst: vi.fn().mockResolvedValue(makeGroup()),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.create({ code: "BTG001", name: "Work Types" })
    ).rejects.toThrow("Booking type group code already exists")
  })
})

// --- bookingTypeGroups.update tests ---

describe("bookingTypeGroups.update", () => {
  it("updates name, description, isActive", async () => {
    const existing = makeGroup()
    const updated = makeGroup({
      name: "Updated",
      description: "Desc",
      isActive: false,
    })
    const mockPrisma = {
      bookingTypeGroup: {
        findFirst: vi.fn().mockResolvedValue(existing),
        update: vi.fn().mockResolvedValue(updated),
        findUniqueOrThrow: vi.fn().mockResolvedValue(updated),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.update({
      id: GROUP_ID,
      name: "Updated",
      description: "Desc",
      isActive: false,
    })
    expect(result.name).toBe("Updated")
    expect(result.isActive).toBe(false)
  })

  it("replaces members when bookingTypeIds provided", async () => {
    const existing = makeGroup({
      members: [makeMember()],
    })
    const updated = makeGroup({
      members: [
        makeMember({
          id: MEMBER_ID_2,
          bookingTypeId: BT_ID_2,
          sortOrder: 0,
          bookingType: {
            id: BT_ID_2,
            code: "GO",
            name: "Clock Out",
            direction: "out",
            category: "work",
          },
        }),
      ],
    })
    const mockPrisma = {
      bookingTypeGroup: {
        findFirst: vi.fn().mockResolvedValue(existing),
        findUniqueOrThrow: vi.fn().mockResolvedValue(updated),
      },
      bookingTypeGroupMember: {
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
        createMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.update({
      id: GROUP_ID,
      bookingTypeIds: [BT_ID_2],
    })
    expect(result.members).toHaveLength(1)
    expect(result.members[0]!.bookingType.code).toBe("GO")
    expect(mockPrisma.bookingTypeGroupMember.deleteMany).toHaveBeenCalledWith({
      where: { groupId: GROUP_ID },
    })
    expect(mockPrisma.bookingTypeGroupMember.createMany).toHaveBeenCalledWith({
      data: [{ groupId: GROUP_ID, bookingTypeId: BT_ID_2, sortOrder: 0 }],
    })
  })

  it("keeps members when bookingTypeIds undefined", async () => {
    const existing = makeGroup({
      members: [makeMember()],
    })
    const updated = makeGroup({
      name: "Updated",
      members: [makeMember()],
    })
    const mockPrisma = {
      bookingTypeGroup: {
        findFirst: vi.fn().mockResolvedValue(existing),
        update: vi.fn().mockResolvedValue(updated),
        findUniqueOrThrow: vi.fn().mockResolvedValue(updated),
      },
      bookingTypeGroupMember: {
        deleteMany: vi.fn(),
        createMany: vi.fn(),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.update({
      id: GROUP_ID,
      name: "Updated",
    })
    expect(result.members).toHaveLength(1)
    // Member operations should NOT have been called
    expect(mockPrisma.bookingTypeGroupMember.deleteMany).not.toHaveBeenCalled()
    expect(mockPrisma.bookingTypeGroupMember.createMany).not.toHaveBeenCalled()
  })

  it("throws NOT_FOUND for missing group", async () => {
    const mockPrisma = {
      bookingTypeGroup: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.update({ id: GROUP_ID, name: "Updated" })
    ).rejects.toThrow("Booking type group not found")
  })
})

// --- bookingTypeGroups.delete tests ---

describe("bookingTypeGroups.delete", () => {
  it("deletes group successfully (members cascade)", async () => {
    const existing = makeGroup()
    const mockPrisma = {
      bookingTypeGroup: {
        findFirst: vi.fn().mockResolvedValue(existing),
        delete: vi.fn().mockResolvedValue(existing),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.delete({ id: GROUP_ID })
    expect(result.success).toBe(true)
    expect(mockPrisma.bookingTypeGroup.delete).toHaveBeenCalledWith({
      where: { id: GROUP_ID },
    })
  })

  it("throws NOT_FOUND for missing group", async () => {
    const mockPrisma = {
      bookingTypeGroup: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(caller.delete({ id: GROUP_ID })).rejects.toThrow(
      "Booking type group not found"
    )
  })
})
