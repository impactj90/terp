import { describe, it, expect, vi } from "vitest"
import { createCallerFactory } from "../trpc"
import { contactTypesRouter } from "../routers/contactTypes"
import { permissionIdByKey } from "../lib/permission-catalog"
import {
  createMockContext,
  createMockSession,
  createUserWithPermissions,
  createMockUserTenant,
} from "./helpers"

// --- Constants ---

const CONTACT_MANAGEMENT_MANAGE = permissionIdByKey("contact_management.manage")!
const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const USER_ID = "a0000000-0000-4000-a000-000000000001"
const CT_ID = "a0000000-0000-4000-a000-000000000500"
const CT_B_ID = "a0000000-0000-4000-a000-000000000501"

const createCaller = createCallerFactory(contactTypesRouter)

// --- Helpers ---

function makeContactType(
  overrides: Partial<{
    id: string
    tenantId: string
    code: string
    name: string
    dataType: string
    description: string | null
    isActive: boolean
    sortOrder: number
    createdAt: Date
    updatedAt: Date
  }> = {}
) {
  return {
    id: CT_ID,
    tenantId: TENANT_ID,
    code: "EMAIL",
    name: "Email",
    dataType: "email",
    description: null,
    isActive: true,
    sortOrder: 0,
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
    ...overrides,
  }
}

function createTestContext(prisma: Record<string, unknown>) {
  return createMockContext({
    prisma: prisma as unknown as ReturnType<typeof createMockContext>["prisma"],
    authToken: "test-token",
    user: createUserWithPermissions([CONTACT_MANAGEMENT_MANAGE], {
      userTenants: [createMockUserTenant(USER_ID, TENANT_ID)],
    }),
    session: createMockSession(),
    tenantId: TENANT_ID,
  })
}

// --- contactTypes.list tests ---

describe("contactTypes.list", () => {
  it("returns contact types for tenant", async () => {
    const types = [
      makeContactType({ id: CT_ID, code: "EMAIL", name: "Email" }),
      makeContactType({ id: CT_B_ID, code: "PHONE", name: "Phone", dataType: "phone" }),
    ]
    const mockPrisma = {
      contactType: {
        findMany: vi.fn().mockResolvedValue(types),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.list()
    expect(result.data).toHaveLength(2)
    expect(result.data[0]!.code).toBe("EMAIL")
    expect(mockPrisma.contactType.findMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT_ID },
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
    })
  })

  it("filters by isActive when provided", async () => {
    const mockPrisma = {
      contactType: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.list({ isActive: true })
    expect(mockPrisma.contactType.findMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT_ID, isActive: true },
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
    })
  })
})

// --- contactTypes.getById tests ---

describe("contactTypes.getById", () => {
  it("returns contact type when found", async () => {
    const ct = makeContactType()
    const mockPrisma = {
      contactType: {
        findFirst: vi.fn().mockResolvedValue(ct),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.getById({ id: CT_ID })
    expect(result.id).toBe(CT_ID)
    expect(result.dataType).toBe("email")
  })

  it("throws NOT_FOUND for missing contact type", async () => {
    const mockPrisma = {
      contactType: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(caller.getById({ id: CT_ID })).rejects.toThrow(
      "Contact type not found"
    )
  })
})

// --- contactTypes.create tests ---

describe("contactTypes.create", () => {
  it("creates contact type successfully", async () => {
    const created = makeContactType()
    const mockPrisma = {
      contactType: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(created),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.create({
      code: "EMAIL",
      name: "Email",
      dataType: "email",
    })
    expect(result.code).toBe("EMAIL")
    expect(result.dataType).toBe("email")
  })

  it("rejects invalid dataType", async () => {
    const mockPrisma = {
      contactType: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.create({
        code: "INVALID",
        name: "Invalid",
        dataType: "invalid" as "text",
      })
    ).rejects.toThrow()
  })

  it("rejects duplicate code with CONFLICT", async () => {
    const mockPrisma = {
      contactType: {
        findFirst: vi.fn().mockResolvedValue(makeContactType()),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.create({ code: "EMAIL", name: "Email", dataType: "email" })
    ).rejects.toThrow("Contact type code already exists")
  })

  it("trims code and name", async () => {
    const created = makeContactType()
    const mockPrisma = {
      contactType: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(created),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.create({
      code: "  EMAIL  ",
      name: "  Email  ",
      dataType: "email",
    })
    const createCall = mockPrisma.contactType.create.mock.calls[0]![0]
    expect(createCall.data.code).toBe("EMAIL")
    expect(createCall.data.name).toBe("Email")
  })
})

// --- contactTypes.update tests ---

describe("contactTypes.update", () => {
  it("updates name and description", async () => {
    const existing = makeContactType()
    const updated = makeContactType({
      name: "Updated Email",
      description: "Updated desc",
    })
    const mockPrisma = {
      contactType: {
        findFirst: vi.fn().mockResolvedValue(existing),
        update: vi.fn().mockResolvedValue(updated),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.update({
      id: CT_ID,
      name: "Updated Email",
      description: "Updated desc",
    })
    expect(result.name).toBe("Updated Email")
  })

  it("rejects empty name with BAD_REQUEST", async () => {
    const existing = makeContactType()
    const mockPrisma = {
      contactType: {
        findFirst: vi.fn().mockResolvedValue(existing),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.update({ id: CT_ID, name: "   " })
    ).rejects.toThrow("Contact type name is required")
  })

  it("updates isActive and sortOrder", async () => {
    const existing = makeContactType()
    const updated = makeContactType({ isActive: false, sortOrder: 5 })
    const mockPrisma = {
      contactType: {
        findFirst: vi.fn().mockResolvedValue(existing),
        update: vi.fn().mockResolvedValue(updated),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.update({
      id: CT_ID,
      isActive: false,
      sortOrder: 5,
    })
    expect(result.isActive).toBe(false)
    expect(result.sortOrder).toBe(5)
  })
})

// --- contactTypes.delete tests ---

describe("contactTypes.delete", () => {
  it("deletes contact type successfully", async () => {
    const existing = makeContactType()
    const mockPrisma = {
      contactType: {
        findFirst: vi.fn().mockResolvedValue(existing),
        delete: vi.fn().mockResolvedValue(existing),
      },
      contactKind: {
        count: vi.fn().mockResolvedValue(0),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.delete({ id: CT_ID })
    expect(result.success).toBe(true)
  })

  it("throws NOT_FOUND for missing contact type", async () => {
    const mockPrisma = {
      contactType: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(caller.delete({ id: CT_ID })).rejects.toThrow(
      "Contact type not found"
    )
  })

  it("rejects deletion when contact kinds exist", async () => {
    const existing = makeContactType()
    const mockPrisma = {
      contactType: {
        findFirst: vi.fn().mockResolvedValue(existing),
      },
      contactKind: {
        count: vi.fn().mockResolvedValue(2),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(caller.delete({ id: CT_ID })).rejects.toThrow(
      "Cannot delete contact type that has contact kinds"
    )
  })
})
