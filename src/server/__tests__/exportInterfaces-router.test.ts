import { describe, it, expect, vi } from "vitest"
import { createCallerFactory } from "@/trpc/init"
import { exportInterfacesRouter } from "../routers/exportInterfaces"
import {
  createMockContext,
  createMockSession,
  createMockUser,
  createMockUserTenant,
  createUserWithPermissions,
} from "./helpers"
import { permissionIdByKey } from "../lib/permission-catalog"

// --- Constants ---

const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const USER_ID = "a0000000-0000-4000-a000-000000000001"
const INTERFACE_ID = "a0000000-0000-4000-a000-000000001001"
const INTERFACE_ID_2 = "a0000000-0000-4000-a000-000000001002"
const ACCOUNT_ID_1 = "a0000000-0000-4000-a000-000000002001"
const ACCOUNT_ID_2 = "a0000000-0000-4000-a000-000000002002"

const PAYROLL_MANAGE = permissionIdByKey("payroll.manage")!

const createCaller = createCallerFactory(exportInterfacesRouter)

// --- Helpers ---

function makeExportInterface(overrides: Record<string, unknown> = {}) {
  return {
    id: INTERFACE_ID,
    tenantId: TENANT_ID,
    interfaceNumber: 1,
    name: "Test Interface",
    mandantNumber: null,
    exportScript: null,
    exportPath: null,
    outputFilename: null,
    isActive: true,
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
    accounts: [],
    ...overrides,
  }
}

function makeAccount(overrides: Record<string, unknown> = {}) {
  return {
    id: "a0000000-0000-4000-a000-000000003001",
    exportInterfaceId: INTERFACE_ID,
    accountId: ACCOUNT_ID_1,
    sortOrder: 0,
    createdAt: new Date("2025-01-01"),
    account: {
      id: ACCOUNT_ID_1,
      code: "ACC001",
      name: "Account One",
      payrollCode: "P001",
    },
    ...overrides,
  }
}

function createTestContext(prisma: Record<string, unknown>) {
  return createMockContext({
    prisma: prisma as unknown as ReturnType<typeof createMockContext>["prisma"],
    authToken: "test-token",
    user: createUserWithPermissions([PAYROLL_MANAGE], {
      id: USER_ID,
      userTenants: [createMockUserTenant(USER_ID, TENANT_ID)],
    }),
    session: createMockSession(),
    tenantId: TENANT_ID,
  })
}

// --- exportInterfaces.list tests ---

describe("exportInterfaces.list", () => {
  it("returns tenant-scoped interfaces", async () => {
    const interfaces = [makeExportInterface(), makeExportInterface({ id: INTERFACE_ID_2, interfaceNumber: 2 })]
    const mockPrisma = {
      exportInterface: {
        findMany: vi.fn().mockResolvedValue(interfaces),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.list()

    expect(result.data).toHaveLength(2)
    expect(mockPrisma.exportInterface.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: TENANT_ID },
      })
    )
  })

  it("respects activeOnly filter", async () => {
    const mockPrisma = {
      exportInterface: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.list({ activeOnly: true })

    expect(mockPrisma.exportInterface.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: TENANT_ID, isActive: true },
      })
    )
  })
})

// --- exportInterfaces.getById tests ---

describe("exportInterfaces.getById", () => {
  it("returns interface with accounts", async () => {
    const iface = makeExportInterface({ accounts: [makeAccount()] })
    const mockPrisma = {
      exportInterface: {
        findFirst: vi.fn().mockResolvedValue(iface),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.getById({ id: INTERFACE_ID })

    expect(result.id).toBe(INTERFACE_ID)
    expect(result.accounts).toHaveLength(1)
    expect(mockPrisma.exportInterface.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: INTERFACE_ID, tenantId: TENANT_ID },
      })
    )
  })

  it("throws NOT_FOUND for missing interface", async () => {
    const mockPrisma = {
      exportInterface: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.getById({ id: INTERFACE_ID })
    ).rejects.toThrow("Export interface not found")
  })
})

// --- exportInterfaces.create tests ---

describe("exportInterfaces.create", () => {
  it("creates with valid input", async () => {
    const created = makeExportInterface()
    const mockPrisma = {
      exportInterface: {
        findFirst: vi.fn().mockResolvedValue(null), // no conflict
        create: vi.fn().mockResolvedValue(created),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.create({
      interfaceNumber: 1,
      name: "Test Interface",
    })

    expect(result.name).toBe("Test Interface")
    expect(mockPrisma.exportInterface.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: TENANT_ID,
          interfaceNumber: 1,
          name: "Test Interface",
          isActive: true,
        }),
      })
    )
  })

  it("throws CONFLICT when interfaceNumber exists", async () => {
    const mockPrisma = {
      exportInterface: {
        findFirst: vi.fn().mockResolvedValue(makeExportInterface()), // conflict
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.create({ interfaceNumber: 1, name: "Test" })
    ).rejects.toThrow("Export interface number already exists")
  })
})

// --- exportInterfaces.update tests ---

describe("exportInterfaces.update", () => {
  it("updates with partial data", async () => {
    const existing = makeExportInterface()
    const updated = makeExportInterface({ name: "Updated Name", accounts: [] })
    const mockPrisma = {
      exportInterface: {
        findFirst: vi.fn().mockResolvedValue(existing),
        update: vi.fn().mockResolvedValue(updated),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.update({ id: INTERFACE_ID, name: "Updated Name" })

    expect(result.name).toBe("Updated Name")
  })

  it("throws NOT_FOUND for missing interface", async () => {
    const mockPrisma = {
      exportInterface: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.update({ id: INTERFACE_ID, name: "Updated" })
    ).rejects.toThrow("Export interface not found")
  })

  it("checks uniqueness when interfaceNumber changes", async () => {
    const existing = makeExportInterface({ interfaceNumber: 1 })
    const conflict = makeExportInterface({ id: INTERFACE_ID_2, interfaceNumber: 2 })
    const mockPrisma = {
      exportInterface: {
        findFirst: vi.fn()
          .mockResolvedValueOnce(existing) // exists check
          .mockResolvedValueOnce(conflict), // uniqueness check
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.update({ id: INTERFACE_ID, interfaceNumber: 2 })
    ).rejects.toThrow("Export interface number already exists")
  })
})

// --- exportInterfaces.delete tests ---

describe("exportInterfaces.delete", () => {
  it("deletes when not in use", async () => {
    const existing = makeExportInterface()
    const mockPrisma = {
      exportInterface: {
        findFirst: vi.fn().mockResolvedValue(existing),
        delete: vi.fn().mockResolvedValue(existing),
      },
      payrollExport: {
        count: vi.fn().mockResolvedValue(0),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.delete({ id: INTERFACE_ID })

    expect(result.success).toBe(true)
    expect(mockPrisma.exportInterface.delete).toHaveBeenCalledWith({
      where: { id: INTERFACE_ID },
    })
  })

  it("throws BAD_REQUEST when interface has exports", async () => {
    const existing = makeExportInterface()
    const mockPrisma = {
      exportInterface: {
        findFirst: vi.fn().mockResolvedValue(existing),
      },
      payrollExport: {
        count: vi.fn().mockResolvedValue(3),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.delete({ id: INTERFACE_ID })
    ).rejects.toThrow("Cannot delete export interface that has generated exports")
  })

  it("throws NOT_FOUND for missing interface", async () => {
    const mockPrisma = {
      exportInterface: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.delete({ id: INTERFACE_ID })
    ).rejects.toThrow("Export interface not found")
  })
})

// --- exportInterfaces.listAccounts tests ---

describe("exportInterfaces.listAccounts", () => {
  it("returns accounts with sort order", async () => {
    const iface = makeExportInterface()
    const accounts = [
      makeAccount({ sortOrder: 0 }),
      makeAccount({ id: "a0000000-0000-4000-a000-000000003002", accountId: ACCOUNT_ID_2, sortOrder: 1 }),
    ]
    const mockPrisma = {
      exportInterface: {
        findFirst: vi.fn().mockResolvedValue(iface),
      },
      exportInterfaceAccount: {
        findMany: vi.fn().mockResolvedValue(accounts),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.listAccounts({ id: INTERFACE_ID })

    expect(result.data).toHaveLength(2)
    expect(mockPrisma.exportInterfaceAccount.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { exportInterfaceId: INTERFACE_ID },
        orderBy: { sortOrder: "asc" },
      })
    )
  })
})

// --- exportInterfaces.setAccounts tests ---

describe("exportInterfaces.setAccounts", () => {
  it("bulk replaces accounts", async () => {
    const iface = makeExportInterface()
    const newAccounts = [
      makeAccount({ accountId: ACCOUNT_ID_1, sortOrder: 0 }),
      makeAccount({ id: "a0000000-0000-4000-a000-000000003002", accountId: ACCOUNT_ID_2, sortOrder: 1 }),
    ]
    const mockPrisma = {
      exportInterface: {
        findFirst: vi.fn().mockResolvedValue(iface),
      },
      exportInterfaceAccount: {
        findMany: vi.fn().mockResolvedValue(newAccounts),
      },
      $transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<void>) => {
        await fn({
          exportInterfaceAccount: {
            deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
            createMany: vi.fn().mockResolvedValue({ count: 2 }),
          },
        })
      }),
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.setAccounts({
      id: INTERFACE_ID,
      accountIds: [ACCOUNT_ID_1, ACCOUNT_ID_2],
    })

    expect(result.data).toHaveLength(2)
    expect(mockPrisma.$transaction).toHaveBeenCalled()
  })
})

// --- Authentication test ---

describe("authentication", () => {
  it("throws UNAUTHORIZED for unauthenticated request", async () => {
    const mockPrisma = {}
    const ctx = createMockContext({
      prisma: mockPrisma as unknown as ReturnType<typeof createMockContext>["prisma"],
      authToken: null,
      user: null,
      session: null,
      tenantId: TENANT_ID,
    })
    const caller = createCaller(ctx)
    await expect(caller.list()).rejects.toThrow("Authentication required")
  })
})
