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

// Silence unused-import lint — `SETTINGS_MANAGE` stays imported so the
// compile-time permission-id lookup still runs at test boot (catches a
// catalog typo at load, not at call time).
void SETTINGS_MANAGE

// --- tenantModules.list tests ---
//
// Phase 9: enable/disable procedures were removed from the tenant router;
// module booking happens through the platform-admin tenantManagement router
// now. See `tenant-modules-readonly.test.ts` for the contract lock.

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
