import { describe, it, expect, vi } from "vitest"
import { createCallerFactory } from "@/trpc/init"
import { tenantModulesRouter } from "../tenantModules"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import {
  createMockContext,
  createMockSession,
  createUserWithPermissions,
  createMockUserTenant,
} from "./helpers"

// Mock the db module used by requireModule middleware
vi.mock("@/lib/db", () => ({
  prisma: {
    tenantModule: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue({ id: "mock", module: "orders" }),
    },
  },
}))

// --- Constants ---

const SETTINGS_MANAGE = permissionIdByKey("settings.manage")!
const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const USER_ID = "a0000000-0000-4000-a000-000000000001"

const createCaller = createCallerFactory(tenantModulesRouter)

// --- Helpers ---

function createTestContext(prisma: Record<string, unknown>) {
  return createMockContext({
    prisma: prisma as unknown as ReturnType<typeof createMockContext>["prisma"],
    authToken: "test-token",
    user: createUserWithPermissions([SETTINGS_MANAGE], {
      id: USER_ID,
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
      id: USER_ID,
      userTenants: [createMockUserTenant(USER_ID, TENANT_ID)],
    }),
    session: createMockSession(),
    tenantId: TENANT_ID,
  })
}

// --- tenantModules.list tests ---

describe("tenantModules.list", () => {
  it("returns enabled modules", async () => {
    const prisma = {
      tenantModule: {
        findMany: vi.fn().mockResolvedValue([
          { module: "core", enabledAt: new Date("2026-01-01") },
          { module: "billing", enabledAt: new Date("2026-01-02") },
        ]),
      },
    }

    // list doesn't require settings.manage, just tenantProcedure
    const caller = createCaller(createNoPermContext(prisma))
    const result = await caller.list()

    expect(result.modules).toHaveLength(2)
    expect(result.modules[0]!.module).toBe("core")
    expect(result.modules[1]!.module).toBe("billing")
  })

  it("always includes 'core' even if not in DB", async () => {
    const prisma = {
      tenantModule: {
        findMany: vi.fn().mockResolvedValue([
          { module: "billing", enabledAt: new Date("2026-01-02") },
        ]),
      },
    }

    const caller = createCaller(createNoPermContext(prisma))
    const result = await caller.list()

    expect(result.modules.some((m) => m.module === "core")).toBe(true)
  })
})

// --- tenantModules.enable tests ---

describe("tenantModules.enable", () => {
  it("enables a module successfully", async () => {
    const prisma = {
      tenantModule: {
        upsert: vi.fn().mockResolvedValue({
          module: "crm",
          enabledAt: new Date("2026-03-16"),
        }),
      },
    }

    const caller = createCaller(createTestContext(prisma))
    const result = await caller.enable({ module: "crm" })

    expect(result.module).toBe("crm")
    expect(prisma.tenantModule.upsert).toHaveBeenCalledWith({
      where: {
        tenantId_module: { tenantId: TENANT_ID, module: "crm" },
      },
      update: {},
      create: {
        tenantId: TENANT_ID,
        module: "crm",
        enabledById: USER_ID,
      },
    })
  })

  it("rejects unknown module", async () => {
    const prisma = { tenantModule: {} }
    const caller = createCaller(createTestContext(prisma))

    await expect(caller.enable({ module: "invalid" })).rejects.toThrow(
      'Unknown module: "invalid"'
    )
  })

  it("non-admin cannot enable", async () => {
    const prisma = { tenantModule: {} }
    const caller = createCaller(createNoPermContext(prisma))

    await expect(caller.enable({ module: "crm" })).rejects.toThrow(
      "Insufficient permissions"
    )
  })
})

// --- tenantModules.disable tests ---

describe("tenantModules.disable", () => {
  it("disables a module successfully", async () => {
    const prisma = {
      tenantModule: {
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    }

    const caller = createCaller(createTestContext(prisma))
    const result = await caller.disable({ module: "crm" })

    expect(result.success).toBe(true)
    expect(prisma.tenantModule.deleteMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT_ID, module: "crm" },
    })
  })

  it("cannot disable 'core'", async () => {
    const prisma = { tenantModule: {} }
    const caller = createCaller(createTestContext(prisma))

    await expect(caller.disable({ module: "core" })).rejects.toThrow(
      '"core" module cannot be disabled'
    )
  })

  it("non-admin cannot disable", async () => {
    const prisma = { tenantModule: {} }
    const caller = createCaller(createNoPermContext(prisma))

    await expect(caller.disable({ module: "billing" })).rejects.toThrow(
      "Insufficient permissions"
    )
  })
})
