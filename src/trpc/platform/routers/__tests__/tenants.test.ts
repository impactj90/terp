/**
 * Tests for the platform tenants router.
 *
 * The headline case from the Phase 3 plan: `tenants.detail` must throw
 * FORBIDDEN when no active SupportSession is attached to the request.
 * Also verifies that `tenants.list` works with only an authed operator.
 */
import { describe, it, expect, vi } from "vitest"
import { createCallerFactory } from "../../init"
import { platformTenantsRouter } from "../tenants"
import { createMockPlatformContext } from "../../__tests__/helpers"

const createCaller = createCallerFactory(platformTenantsRouter)

const TENANT_ID = "a0000000-0000-4000-a000-000000000100"

describe("platform tenants.list", () => {
  it("returns tenants without requiring a support session", async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        id: TENANT_ID,
        name: "Acme",
        slug: "acme",
        isActive: true,
        createdAt: new Date(),
      },
    ])
    const ctx = createMockPlatformContext({
      prisma: { tenant: { findMany } },
    })
    const caller = createCaller(ctx)
    const rows = await caller.list()
    expect(rows).toHaveLength(1)
    expect(rows[0]!.slug).toBe("acme")
  })
})

describe("platform tenants.detail", () => {
  it("throws FORBIDDEN when no activeSupportSessionId is attached", async () => {
    const ctx = createMockPlatformContext({
      activeSupportSessionId: null,
      prisma: {},
    })
    const caller = createCaller(ctx)
    await expect(caller.detail({ id: TENANT_ID })).rejects.toMatchObject({
      code: "FORBIDDEN",
    })
  })

  it("throws FORBIDDEN when the session exists but is not scoped to the tenant", async () => {
    // supportSession.findFirst is called twice in detail — once by the
    // impersonation middleware, once by the handler for the tenant check.
    // The middleware path must succeed (operator has an active session),
    // but the handler-side re-check must fail because the session is for
    // a different tenant.
    const findFirst = vi
      .fn()
      // middleware lookup — operator has an active session
      .mockResolvedValueOnce({
        id: "a0000000-0000-4000-a000-000000000500",
        tenantId: "00000000-0000-4000-a000-000000000999",
        platformUserId: "00000000-0000-4000-a000-000000000001",
        status: "active",
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      })
      // handler re-check scoped to TENANT_ID — no match
      .mockResolvedValueOnce(null)

    const ctx = createMockPlatformContext({
      activeSupportSessionId: "a0000000-0000-4000-a000-000000000500",
      prisma: { supportSession: { findFirst } },
    })
    const caller = createCaller(ctx)
    await expect(caller.detail({ id: TENANT_ID })).rejects.toMatchObject({
      code: "FORBIDDEN",
    })
  })

  it("returns tenant detail when an active session is scoped to that tenant", async () => {
    const session = {
      id: "a0000000-0000-4000-a000-000000000500",
      tenantId: TENANT_ID,
      platformUserId: "00000000-0000-4000-a000-000000000001",
      status: "active",
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    }
    const findFirst = vi
      .fn()
      .mockResolvedValueOnce(session)
      .mockResolvedValueOnce(session)
    const tenantFindUnique = vi.fn().mockResolvedValue({
      id: TENANT_ID,
      name: "Acme",
      slug: "acme",
      isActive: true,
      addressStreet: null,
      addressZip: null,
      addressCity: null,
      addressCountry: null,
      phone: null,
      email: null,
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const ctx = createMockPlatformContext({
      activeSupportSessionId: session.id,
      prisma: {
        supportSession: { findFirst },
        tenant: { findUnique: tenantFindUnique },
      },
    })
    const caller = createCaller(ctx)
    const result = await caller.detail({ id: TENANT_ID })
    expect(result?.slug).toBe("acme")
  })
})
