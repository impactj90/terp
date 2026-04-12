/**
 * Phase 6 — Support-access flow on the tenants router.
 *
 * Covers:
 *   - Permission enforcement on requestSupportAccess/revokeSupportAccess
 *   - Zod input validation (reason min length, ttl bounds)
 *   - Happy-path create → pending + double audit write
 *   - Revoke transitions + double audit write
 *   - Revoking a closed session → CONFLICT
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { TRPCError } from "@trpc/server"
import { createCallerFactory } from "@/trpc/init"
import { tenantsRouter } from "../tenants"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import {
  createMockContext,
  createMockSession,
  createUserWithPermissions,
  createMockUserTenant,
} from "./helpers"

const SUPPORT_ACCESS_GRANT = permissionIdByKey(
  "platform.support_access.grant"
)!
const TENANT_ID = "a0000000-0000-4000-a000-000000000200"
const USER_ID = "a0000000-0000-4000-a000-000000000010"
const SESSION_ID = "a0000000-0000-4000-a000-000000000300"

const createCaller = createCallerFactory(tenantsRouter)

interface PrismaShape {
  supportSession: {
    create?: ReturnType<typeof vi.fn>
    findFirst?: ReturnType<typeof vi.fn>
    findMany?: ReturnType<typeof vi.fn>
    update?: ReturnType<typeof vi.fn>
  }
  auditLog: { create: ReturnType<typeof vi.fn> }
  platformAuditLog: { create: ReturnType<typeof vi.fn> }
}

function buildPrisma(overrides: Partial<PrismaShape> = {}): PrismaShape {
  return {
    supportSession: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn(),
      ...overrides.supportSession,
    },
    auditLog: {
      create: vi.fn().mockResolvedValue({ id: "audit-1" }),
      ...overrides.auditLog,
    },
    platformAuditLog: {
      create: vi.fn().mockResolvedValue({ id: "platform-audit-1" }),
      ...overrides.platformAuditLog,
    },
  }
}

function grantedContext(prisma: PrismaShape) {
  return createMockContext({
    prisma: prisma as unknown as ReturnType<
      typeof createMockContext
    >["prisma"],
    authToken: "test-token",
    user: createUserWithPermissions([SUPPORT_ACCESS_GRANT], {
      id: USER_ID,
      userTenants: [createMockUserTenant(USER_ID, TENANT_ID)],
    }),
    session: createMockSession(),
    tenantId: TENANT_ID,
  })
}

function unprivilegedContext(prisma: PrismaShape) {
  return createMockContext({
    prisma: prisma as unknown as ReturnType<
      typeof createMockContext
    >["prisma"],
    authToken: "test-token",
    user: createUserWithPermissions([], {
      id: USER_ID,
      userTenants: [createMockUserTenant(USER_ID, TENANT_ID)],
    }),
    session: createMockSession(),
    tenantId: TENANT_ID,
  })
}

describe("tenantsRouter.requestSupportAccess", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("throws FORBIDDEN when the caller lacks the permission", async () => {
    const prisma = buildPrisma()
    const caller = createCaller(unprivilegedContext(prisma))

    await expect(
      caller.requestSupportAccess({
        reason: "Support needed for Bug #1234",
        ttlMinutes: 60,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" })

    expect(prisma.supportSession.create).not.toHaveBeenCalled()
  })

  it("rejects a reason shorter than 10 chars with BAD_REQUEST", async () => {
    const prisma = buildPrisma()
    const caller = createCaller(grantedContext(prisma))

    await expect(
      caller.requestSupportAccess({
        reason: "too short",
        ttlMinutes: 60,
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })

    expect(prisma.supportSession.create).not.toHaveBeenCalled()
  })

  it("rejects a TTL above 240 minutes with BAD_REQUEST", async () => {
    const prisma = buildPrisma()
    const caller = createCaller(grantedContext(prisma))

    await expect(
      caller.requestSupportAccess({
        reason: "Support needed for Bug #1234",
        ttlMinutes: 300,
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })

    expect(prisma.supportSession.create).not.toHaveBeenCalled()
  })

  it("creates a pending session and writes double audit entries", async () => {
    const now = Date.now()
    const createdSession = {
      id: SESSION_ID,
      tenantId: TENANT_ID,
      requestedByUserId: USER_ID,
      reason: "Support needed for vacation module bug",
      consentReference: "TICKET-5678",
      status: "pending",
      expiresAt: new Date(now + 60 * 60 * 1000),
      activatedAt: null,
      revokedAt: null,
      platformUserId: null,
      createdAt: new Date(now),
    }
    const prisma = buildPrisma({
      supportSession: {
        create: vi.fn().mockResolvedValue(createdSession),
      },
    })

    const caller = createCaller(grantedContext(prisma))
    const result = await caller.requestSupportAccess({
      reason: "Support needed for vacation module bug",
      ttlMinutes: 60,
      consentReference: "TICKET-5678",
    })

    expect(result.id).toBe(SESSION_ID)
    expect(result.status).toBe("pending")

    expect(prisma.supportSession.create).toHaveBeenCalledTimes(1)
    const createArgs = prisma.supportSession.create!.mock.calls[0]![0]
    expect(createArgs.data.tenantId).toBe(TENANT_ID)
    expect(createArgs.data.requestedByUserId).toBe(USER_ID)
    expect(createArgs.data.status).toBe("pending")
    expect(createArgs.data.consentReference).toBe("TICKET-5678")
    // expiresAt is now + 60min
    const delta = (createArgs.data.expiresAt as Date).getTime() - now
    expect(delta).toBeGreaterThanOrEqual(60 * 60 * 1000 - 2000)
    expect(delta).toBeLessThanOrEqual(60 * 60 * 1000 + 2000)

    // Tenant audit log
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1)
    const tenantAudit = prisma.auditLog.create.mock.calls[0]![0]
    expect(tenantAudit.data.tenantId).toBe(TENANT_ID)
    expect(tenantAudit.data.userId).toBe(USER_ID)
    expect(tenantAudit.data.action).toBe("create")
    expect(tenantAudit.data.entityType).toBe("support_session")
    expect(tenantAudit.data.entityId).toBe(SESSION_ID)

    // Platform audit log
    expect(prisma.platformAuditLog.create).toHaveBeenCalledTimes(1)
    const platformAudit = prisma.platformAuditLog.create.mock.calls[0]![0]
    expect(platformAudit.data.platformUserId).toBeNull()
    expect(platformAudit.data.action).toBe("support_session.requested")
    expect(platformAudit.data.targetTenantId).toBe(TENANT_ID)
    expect(platformAudit.data.supportSessionId).toBe(SESSION_ID)
  })
})

describe("tenantsRouter.revokeSupportAccess", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("throws NOT_FOUND when no matching session exists for this tenant", async () => {
    const prisma = buildPrisma({
      supportSession: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    })
    const caller = createCaller(grantedContext(prisma))

    await expect(
      caller.revokeSupportAccess({ id: SESSION_ID })
    ).rejects.toBeInstanceOf(TRPCError)
    await expect(
      caller.revokeSupportAccess({ id: SESSION_ID })
    ).rejects.toMatchObject({ code: "NOT_FOUND" })
  })

  it("throws CONFLICT when the session is already revoked", async () => {
    const prisma = buildPrisma({
      supportSession: {
        findFirst: vi.fn().mockResolvedValue({
          id: SESSION_ID,
          tenantId: TENANT_ID,
          status: "revoked",
          reason: "Bug",
          platformUserId: null,
        }),
      },
    })
    const caller = createCaller(grantedContext(prisma))

    await expect(
      caller.revokeSupportAccess({ id: SESSION_ID })
    ).rejects.toMatchObject({ code: "CONFLICT" })
  })

  it("revokes an active session and writes double audit entries", async () => {
    const existing = {
      id: SESSION_ID,
      tenantId: TENANT_ID,
      status: "active",
      reason: "Bug #1234",
      platformUserId: "platform-user-1",
    }
    const prisma = buildPrisma({
      supportSession: {
        findFirst: vi.fn().mockResolvedValue(existing),
        update: vi.fn().mockResolvedValue({
          ...existing,
          status: "revoked",
          revokedAt: new Date(),
        }),
      },
    })

    const caller = createCaller(grantedContext(prisma))
    const result = await caller.revokeSupportAccess({ id: SESSION_ID })

    expect(result.status).toBe("revoked")
    expect(prisma.supportSession.update).toHaveBeenCalledWith({
      where: { id: SESSION_ID },
      data: expect.objectContaining({ status: "revoked" }),
    })
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1)
    expect(prisma.platformAuditLog.create).toHaveBeenCalledTimes(1)

    const platformAudit = prisma.platformAuditLog.create.mock.calls[0]![0]
    expect(platformAudit.data.action).toBe("support_session.revoked")
    expect(platformAudit.data.targetTenantId).toBe(TENANT_ID)
    expect(platformAudit.data.supportSessionId).toBe(SESSION_ID)
    expect(platformAudit.data.platformUserId).toBe("platform-user-1")
  })
})
