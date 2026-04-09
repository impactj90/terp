/**
 * Tests for the platform supportSessions router.
 *
 * Covers:
 *   - list scoping (pending visible to all, active/closed scoped to operator)
 *   - activate pending → active
 *   - activate already-active → CONFLICT
 *   - activate expired → CONFLICT
 *   - revoke → revoked
 */
import { describe, it, expect, vi } from "vitest"
import { createCallerFactory } from "../../init"
import { platformSupportSessionsRouter } from "../supportSessions"
import { createMockPlatformContext } from "../../__tests__/helpers"

const createCaller = createCallerFactory(platformSupportSessionsRouter)

const OPERATOR_ID = "00000000-0000-4000-a000-000000000001"
const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const SESSION_ID = "a0000000-0000-4000-a000-000000000500"

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    id: SESSION_ID,
    tenantId: TENANT_ID,
    platformUserId: null,
    requestedByUserId: "a0000000-0000-4000-a000-0000000000aa",
    reason: "Debug issue",
    consentReference: null,
    status: "pending",
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    activatedAt: null,
    revokedAt: null,
    createdAt: new Date(),
    ...overrides,
  }
}

describe("platform supportSessions.list", () => {
  it("scopes non-pending queries to the calling operator", async () => {
    const findMany = vi.fn().mockResolvedValue([])
    const ctx = createMockPlatformContext({
      prisma: { supportSession: { findMany } },
    })
    const caller = createCaller(ctx)
    await caller.list({ status: "active" })
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: "active",
          platformUserId: OPERATOR_ID,
        }),
      })
    )
  })

  it("without a status filter, returns pending (all) + operator's own rows", async () => {
    const findMany = vi.fn().mockResolvedValue([])
    const ctx = createMockPlatformContext({
      prisma: { supportSession: { findMany } },
    })
    const caller = createCaller(ctx)
    await caller.list()
    const call = findMany.mock.calls[0]![0]
    expect(call.where.OR).toEqual(
      expect.arrayContaining([
        { status: "pending" },
        { platformUserId: OPERATOR_ID },
      ])
    )
  })
})

describe("platform supportSessions.activate", () => {
  it("activates a pending session and binds the operator", async () => {
    const findUnique = vi.fn().mockResolvedValue(makeSession())
    const update = vi.fn().mockResolvedValue(
      makeSession({
        status: "active",
        platformUserId: OPERATOR_ID,
        activatedAt: new Date(),
      })
    )
    const platformAuditCreate = vi.fn().mockResolvedValue(null)

    const ctx = createMockPlatformContext({
      prisma: {
        supportSession: { findUnique, update },
        platformAuditLog: { create: platformAuditCreate },
      },
    })
    const caller = createCaller(ctx)
    const result = await caller.activate({ id: SESSION_ID })

    expect(result.status).toBe("active")
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: SESSION_ID },
        data: expect.objectContaining({
          status: "active",
          platformUserId: OPERATOR_ID,
        }),
      })
    )
    expect(platformAuditCreate).toHaveBeenCalled()
  })

  it("throws CONFLICT when the session is already active", async () => {
    const findUnique = vi.fn().mockResolvedValue(
      makeSession({ status: "active", platformUserId: OPERATOR_ID })
    )
    const ctx = createMockPlatformContext({
      prisma: { supportSession: { findUnique } },
    })
    const caller = createCaller(ctx)
    await expect(caller.activate({ id: SESSION_ID })).rejects.toMatchObject({
      code: "CONFLICT",
    })
  })

  it("throws CONFLICT when the session is already expired", async () => {
    const findUnique = vi.fn().mockResolvedValue(
      makeSession({ expiresAt: new Date(Date.now() - 1_000) })
    )
    const ctx = createMockPlatformContext({
      prisma: { supportSession: { findUnique } },
    })
    const caller = createCaller(ctx)
    await expect(caller.activate({ id: SESSION_ID })).rejects.toMatchObject({
      code: "CONFLICT",
    })
  })

  it("throws FORBIDDEN when the session is assigned to a different operator", async () => {
    const findUnique = vi.fn().mockResolvedValue(
      makeSession({
        platformUserId: "11111111-1111-4000-a000-000000000001",
      })
    )
    const ctx = createMockPlatformContext({
      prisma: { supportSession: { findUnique } },
    })
    const caller = createCaller(ctx)
    await expect(caller.activate({ id: SESSION_ID })).rejects.toMatchObject({
      code: "FORBIDDEN",
    })
  })

  it("throws NOT_FOUND when the session does not exist", async () => {
    const findUnique = vi.fn().mockResolvedValue(null)
    const ctx = createMockPlatformContext({
      prisma: { supportSession: { findUnique } },
    })
    const caller = createCaller(ctx)
    await expect(caller.activate({ id: SESSION_ID })).rejects.toMatchObject({
      code: "NOT_FOUND",
    })
  })
})

describe("platform supportSessions.revoke", () => {
  it("flips status to revoked and writes an audit entry", async () => {
    const findUnique = vi.fn().mockResolvedValue(
      makeSession({ status: "active", platformUserId: OPERATOR_ID })
    )
    const update = vi.fn().mockResolvedValue(
      makeSession({
        status: "revoked",
        platformUserId: OPERATOR_ID,
        revokedAt: new Date(),
      })
    )
    const auditCreate = vi.fn().mockResolvedValue(null)

    const ctx = createMockPlatformContext({
      prisma: {
        supportSession: { findUnique, update },
        platformAuditLog: { create: auditCreate },
      },
    })
    const caller = createCaller(ctx)
    const result = await caller.revoke({ id: SESSION_ID })
    expect(result.status).toBe("revoked")
    expect(auditCreate).toHaveBeenCalled()
  })

  it("throws CONFLICT when the session is already revoked", async () => {
    const findUnique = vi.fn().mockResolvedValue(
      makeSession({ status: "revoked", platformUserId: OPERATOR_ID })
    )
    const ctx = createMockPlatformContext({
      prisma: { supportSession: { findUnique } },
    })
    const caller = createCaller(ctx)
    await expect(caller.revoke({ id: SESSION_ID })).rejects.toMatchObject({
      code: "CONFLICT",
    })
  })
})
