import { describe, it, expect, vi } from "vitest"
import { createCallerFactory } from "../trpc"
import { contactKindsRouter } from "../routers/contactKinds"
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
const CK_ID = "a0000000-0000-4000-a000-000000000600"
const CK_B_ID = "a0000000-0000-4000-a000-000000000601"
const CT_ID = "a0000000-0000-4000-a000-000000000500"

const createCaller = createCallerFactory(contactKindsRouter)

// --- Helpers ---

function makeContactKind(
  overrides: Partial<{
    id: string
    tenantId: string
    contactTypeId: string
    code: string
    label: string
    isActive: boolean
    sortOrder: number
    createdAt: Date
    updatedAt: Date
  }> = {}
) {
  return {
    id: CK_ID,
    tenantId: TENANT_ID,
    contactTypeId: CT_ID,
    code: "WORK",
    label: "Work",
    isActive: true,
    sortOrder: 0,
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
    ...overrides,
  }
}

function makeContactType() {
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

// --- contactKinds.list tests ---

describe("contactKinds.list", () => {
  it("returns contact kinds for tenant", async () => {
    const kinds = [
      makeContactKind({ id: CK_ID, code: "WORK", label: "Work" }),
      makeContactKind({ id: CK_B_ID, code: "PERSONAL", label: "Personal" }),
    ]
    const mockPrisma = {
      contactKind: {
        findMany: vi.fn().mockResolvedValue(kinds),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.list()
    expect(result.data).toHaveLength(2)
    expect(result.data[0]!.code).toBe("WORK")
  })

  it("filters by contactTypeId when provided", async () => {
    const mockPrisma = {
      contactKind: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.list({ contactTypeId: CT_ID })
    expect(mockPrisma.contactKind.findMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT_ID, contactTypeId: CT_ID },
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
    })
  })

  it("filters by isActive when provided", async () => {
    const mockPrisma = {
      contactKind: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.list({ isActive: true })
    expect(mockPrisma.contactKind.findMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT_ID, isActive: true },
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
    })
  })
})

// --- contactKinds.getById tests ---

describe("contactKinds.getById", () => {
  it("returns contact kind when found", async () => {
    const ck = makeContactKind()
    const mockPrisma = {
      contactKind: {
        findFirst: vi.fn().mockResolvedValue(ck),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.getById({ id: CK_ID })
    expect(result.id).toBe(CK_ID)
    expect(result.label).toBe("Work")
  })

  it("throws NOT_FOUND for missing contact kind", async () => {
    const mockPrisma = {
      contactKind: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(caller.getById({ id: CK_ID })).rejects.toThrow(
      "Contact kind not found"
    )
  })
})

// --- contactKinds.create tests ---

describe("contactKinds.create", () => {
  it("creates contact kind successfully", async () => {
    const created = makeContactKind()
    const mockPrisma = {
      contactType: {
        findFirst: vi.fn().mockResolvedValue(makeContactType()),
      },
      contactKind: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(created),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.create({
      contactTypeId: CT_ID,
      code: "WORK",
      label: "Work",
    })
    expect(result.code).toBe("WORK")
    expect(result.contactTypeId).toBe(CT_ID)
  })

  it("rejects when contact type not found", async () => {
    const mockPrisma = {
      contactType: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      contactKind: {
        findFirst: vi.fn(),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.create({ contactTypeId: CT_ID, code: "WORK", label: "Work" })
    ).rejects.toThrow("Contact type not found")
  })

  it("rejects duplicate code with CONFLICT", async () => {
    const mockPrisma = {
      contactType: {
        findFirst: vi.fn().mockResolvedValue(makeContactType()),
      },
      contactKind: {
        findFirst: vi.fn().mockResolvedValue(makeContactKind()),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.create({ contactTypeId: CT_ID, code: "WORK", label: "Work" })
    ).rejects.toThrow("Contact kind code already exists")
  })

  it("trims label", async () => {
    const created = makeContactKind()
    const mockPrisma = {
      contactType: {
        findFirst: vi.fn().mockResolvedValue(makeContactType()),
      },
      contactKind: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(created),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.create({
      contactTypeId: CT_ID,
      code: "WORK",
      label: "  Work  ",
    })
    const createCall = mockPrisma.contactKind.create.mock.calls[0]![0]
    expect(createCall.data.label).toBe("Work")
  })
})

// --- contactKinds.update tests ---

describe("contactKinds.update", () => {
  it("updates label and isActive", async () => {
    const existing = makeContactKind()
    const updated = makeContactKind({ label: "Updated", isActive: false })
    const mockPrisma = {
      contactKind: {
        findFirst: vi.fn().mockResolvedValue(existing),
        update: vi.fn().mockResolvedValue(updated),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.update({
      id: CK_ID,
      label: "Updated",
      isActive: false,
    })
    expect(result.label).toBe("Updated")
    expect(result.isActive).toBe(false)
  })

  it("rejects empty label with BAD_REQUEST", async () => {
    const existing = makeContactKind()
    const mockPrisma = {
      contactKind: {
        findFirst: vi.fn().mockResolvedValue(existing),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.update({ id: CK_ID, label: "   " })
    ).rejects.toThrow("Contact kind label is required")
  })

  it("throws NOT_FOUND for missing contact kind", async () => {
    const mockPrisma = {
      contactKind: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.update({ id: CK_ID, label: "Updated" })
    ).rejects.toThrow("Contact kind not found")
  })
})

// --- contactKinds.delete tests ---

describe("contactKinds.delete", () => {
  it("deletes contact kind successfully", async () => {
    const existing = makeContactKind()
    const mockPrisma = {
      contactKind: {
        findFirst: vi.fn().mockResolvedValue(existing),
        delete: vi.fn().mockResolvedValue(existing),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.delete({ id: CK_ID })
    expect(result.success).toBe(true)
    expect(mockPrisma.contactKind.delete).toHaveBeenCalledWith({
      where: { id: CK_ID },
    })
  })

  it("throws NOT_FOUND for missing contact kind", async () => {
    const mockPrisma = {
      contactKind: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(caller.delete({ id: CK_ID })).rejects.toThrow(
      "Contact kind not found"
    )
  })
})
