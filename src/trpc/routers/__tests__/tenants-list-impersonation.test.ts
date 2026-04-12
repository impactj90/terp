/**
 * Phase 1 of the platform impersonation UI bridge plan
 * (thoughts/shared/plans/2026-04-10-platform-impersonation-ui-bridge.md).
 *
 * Verifies that `tenants.list`:
 *   - Normal path: queries `ctx.prisma.userTenant.findMany` as before.
 *   - Impersonation path: reads from the synthesized
 *     `ctx.user.userTenants` array (Phase 7 of the platform-admin plan)
 *     and does NOT touch the DB, because the sentinel user has zero
 *     user_tenants rows.
 *   - Filters (`name`, `active`) apply uniformly to both paths.
 */
import { describe, it, expect, vi } from "vitest"
import { createCallerFactory } from "@/trpc/init"
import { tenantsRouter } from "../tenants"
import {
  createMockContext,
  createMockSession,
  createMockTenant,
  createMockUser,
  createMockUserTenant,
} from "./helpers"
import type { Tenant } from "@/generated/prisma/client"

const createCaller = createCallerFactory(tenantsRouter)

const USER_ID = "a0000000-0000-4000-a000-000000000010"
const TENANT_A = "a0000000-0000-4000-a000-0000000000a0"
const TENANT_B = "a0000000-0000-4000-a000-0000000000b0"
const PLATFORM_USER_ID = "a0000000-0000-4000-a000-0000000000ff"
const SUPPORT_SESSION_ID = "a0000000-0000-4000-a000-0000000000cc"
const SENTINEL_ID = "00000000-0000-0000-0000-00000000beef"

function makeTenant(overrides: Partial<Tenant> = {}): Tenant {
  return createMockTenant({
    isDemo: false,
    demoExpiresAt: null,
    demoTemplate: null,
    demoCreatedById: null,
    demoNotes: null,
    ...overrides,
  } as Partial<Tenant>)
}

describe("tenants.list — normal (non-impersonation) path", () => {
  it("queries userTenant.findMany and returns the user's tenants", async () => {
    const tenantA = makeTenant({
      id: TENANT_A,
      name: "Alpha GmbH",
      slug: "alpha",
      isActive: true,
    })
    const tenantB = makeTenant({
      id: TENANT_B,
      name: "Beta AG",
      slug: "beta",
      isActive: false,
    })

    const findMany = vi.fn().mockResolvedValue([
      { userId: USER_ID, tenantId: TENANT_A, role: "member", tenant: tenantA },
      { userId: USER_ID, tenantId: TENANT_B, role: "member", tenant: tenantB },
    ])

    const ctx = createMockContext({
      prisma: {
        userTenant: { findMany },
      } as unknown as ReturnType<typeof createMockContext>["prisma"],
      authToken: "test-token",
      user: createMockUser({
        id: USER_ID,
        userTenants: [
          createMockUserTenant(USER_ID, TENANT_A),
          createMockUserTenant(USER_ID, TENANT_B),
        ],
      }),
      session: createMockSession(),
    })

    const caller = createCaller(ctx)
    const result = await caller.list()

    expect(findMany).toHaveBeenCalledTimes(1)
    expect(findMany).toHaveBeenCalledWith({
      where: { userId: USER_ID },
      include: { tenant: true },
    })
    expect(result.map((r) => r.id)).toEqual([TENANT_A, TENANT_B])
  })

  it("applies name filter on the DB-backed path", async () => {
    const tenantA = makeTenant({ id: TENANT_A, name: "Alpha GmbH" })
    const tenantB = makeTenant({ id: TENANT_B, name: "Beta AG" })

    const findMany = vi.fn().mockResolvedValue([
      { tenant: tenantA },
      { tenant: tenantB },
    ])

    const ctx = createMockContext({
      prisma: {
        userTenant: { findMany },
      } as unknown as ReturnType<typeof createMockContext>["prisma"],
      authToken: "test-token",
      user: createMockUser({ id: USER_ID }),
      session: createMockSession(),
    })

    const result = await createCaller(ctx).list({ name: "alpha" })
    expect(result.map((r) => r.id)).toEqual([TENANT_A])
  })
})

describe("tenants.list — impersonation path", () => {
  it("reads from ctx.user.userTenants and does NOT touch the DB", async () => {
    const tenantA = makeTenant({
      id: TENANT_A,
      name: "Target Tenant",
      slug: "target",
      isActive: true,
    })

    const findMany = vi.fn() // should never be called

    const ctx = createMockContext({
      prisma: {
        userTenant: { findMany },
      } as unknown as ReturnType<typeof createMockContext>["prisma"],
      authToken: null,
      user: createMockUser({
        id: SENTINEL_ID,
        userTenants: [
          {
            userId: SENTINEL_ID,
            tenantId: TENANT_A,
            role: "support",
            createdAt: new Date(),
            tenant: tenantA,
          },
        ],
      }),
      session: createMockSession(),
      tenantId: TENANT_A,
      impersonation: {
        platformUserId: PLATFORM_USER_ID,
        supportSessionId: SUPPORT_SESSION_ID,
      },
    })

    const result = await createCaller(ctx).list()

    expect(findMany).not.toHaveBeenCalled()
    expect(result).toHaveLength(1)
    expect(result[0]?.id).toBe(TENANT_A)
    expect(result[0]?.name).toBe("Target Tenant")
  })

  it("applies name filter on the impersonation path", async () => {
    const tenantA = makeTenant({ id: TENANT_A, name: "Alpha GmbH" })
    const tenantB = makeTenant({ id: TENANT_B, name: "Beta AG" })

    const findMany = vi.fn()

    const ctx = createMockContext({
      prisma: {
        userTenant: { findMany },
      } as unknown as ReturnType<typeof createMockContext>["prisma"],
      authToken: null,
      user: createMockUser({
        id: SENTINEL_ID,
        userTenants: [
          {
            userId: SENTINEL_ID,
            tenantId: TENANT_A,
            role: "support",
            createdAt: new Date(),
            tenant: tenantA,
          },
          {
            userId: SENTINEL_ID,
            tenantId: TENANT_B,
            role: "support",
            createdAt: new Date(),
            tenant: tenantB,
          },
        ],
      }),
      session: createMockSession(),
      tenantId: TENANT_A,
      impersonation: {
        platformUserId: PLATFORM_USER_ID,
        supportSessionId: SUPPORT_SESSION_ID,
      },
    })

    const filtered = await createCaller(ctx).list({ name: "beta" })
    expect(findMany).not.toHaveBeenCalled()
    expect(filtered.map((r) => r.id)).toEqual([TENANT_B])
  })

  it("applies active filter on the impersonation path", async () => {
    const tenantA = makeTenant({
      id: TENANT_A,
      name: "Alpha",
      isActive: true,
    })
    const tenantB = makeTenant({
      id: TENANT_B,
      name: "Beta",
      isActive: false,
    })

    const findMany = vi.fn()

    const ctx = createMockContext({
      prisma: {
        userTenant: { findMany },
      } as unknown as ReturnType<typeof createMockContext>["prisma"],
      authToken: null,
      user: createMockUser({
        id: SENTINEL_ID,
        userTenants: [
          {
            userId: SENTINEL_ID,
            tenantId: TENANT_A,
            role: "support",
            createdAt: new Date(),
            tenant: tenantA,
          },
          {
            userId: SENTINEL_ID,
            tenantId: TENANT_B,
            role: "support",
            createdAt: new Date(),
            tenant: tenantB,
          },
        ],
      }),
      session: createMockSession(),
      tenantId: TENANT_A,
      impersonation: {
        platformUserId: PLATFORM_USER_ID,
        supportSessionId: SUPPORT_SESSION_ID,
      },
    })

    const activeOnly = await createCaller(ctx).list({ active: true })
    expect(activeOnly.map((r) => r.id)).toEqual([TENANT_A])
    expect(findMany).not.toHaveBeenCalled()
  })
})
