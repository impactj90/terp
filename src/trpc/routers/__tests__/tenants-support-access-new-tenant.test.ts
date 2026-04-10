/**
 * Regression test — Phase 6 — platform.support_access.grant for fresh tenants.
 *
 * Purpose: confirm that a brand-new tenant with no custom UserGroup still
 * grants its admin (user.role = 'admin') the support-access permission via
 * the isUserAdmin bypass in src/lib/auth/permissions.ts:73-93. This codifies
 * the invariant called out in the plan — if a future refactor of the bypass
 * logic removes the role-level shortcut, this test surfaces the regression
 * immediately so the default-permissions seeding can be patched before ship.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { createCallerFactory } from "@/trpc/init"
import { tenantsRouter } from "../tenants"
import {
  createMockContext,
  createMockSession,
  createMockUser,
  createMockUserTenant,
} from "./helpers"

const TENANT_ID = "a0000000-0000-4000-a000-000000000400"
const USER_ID = "a0000000-0000-4000-a000-000000000020"

const createCaller = createCallerFactory(tenantsRouter)

describe("requestSupportAccess (fresh tenant, user.role='admin', no UserGroup)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("succeeds via the isUserAdmin bypass without any JSONB permission", async () => {
    const createdSession = {
      id: "support-session-admin-bypass",
      tenantId: TENANT_ID,
      requestedByUserId: USER_ID,
      reason: "Initial support check after tenant creation",
      consentReference: null,
      status: "pending",
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      activatedAt: null,
      revokedAt: null,
      platformUserId: null,
      createdAt: new Date(),
    }
    const prisma = {
      supportSession: {
        create: vi.fn().mockResolvedValue(createdSession),
      },
      auditLog: { create: vi.fn().mockResolvedValue({ id: "audit-1" }) },
      platformAuditLog: {
        create: vi.fn().mockResolvedValue({ id: "platform-audit-1" }),
      },
    }

    // Fresh tenant: user has role='admin' but NO userGroup attached.
    // This matches tenant-service.ts creating a tenant without any
    // UserGroup and adding the creator to user_tenants as owner.
    const ctx = createMockContext({
      prisma: prisma as unknown as ReturnType<
        typeof createMockContext
      >["prisma"],
      authToken: "test-token",
      user: createMockUser({
        id: USER_ID,
        role: "admin",
        userGroup: null,
        userTenants: [createMockUserTenant(USER_ID, TENANT_ID)],
      }),
      session: createMockSession(),
      tenantId: TENANT_ID,
    })
    const caller = createCaller(ctx)

    const result = await caller.requestSupportAccess({
      reason: "Initial support check after tenant creation",
      ttlMinutes: 30,
    })

    expect(result.id).toBe("support-session-admin-bypass")
    expect(prisma.supportSession.create).toHaveBeenCalledTimes(1)
  })
})
