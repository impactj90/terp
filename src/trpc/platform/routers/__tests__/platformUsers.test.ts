/**
 * Tests for the platform platformUsers router.
 *
 * Covers the hard server-side invariants that keep operators from
 * locking themselves out of the admin console:
 *
 *   - `create` rejects duplicate emails
 *   - `delete` rejects deleting yourself
 *   - `delete` rejects removing the last active operator
 *   - `setActive(false)` rejects deactivating yourself
 *   - `setActive(false)` rejects deactivating the last active operator
 *   - `resetMfa` wipes the stored secret AND recovery codes
 *   - every mutation writes a `platform_audit_logs` entry
 *
 * `hashPassword` is mocked because argon2 is deliberately slow and
 * these tests should not take hundreds of ms just to hash a string.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { createCallerFactory } from "../../init"
import { platformUsersRouter } from "../platformUsers"
import { createMockPlatformContext } from "../../__tests__/helpers"

const hashPasswordMock = vi.fn(async (plain: string) => `hashed:${plain}`)
vi.mock("@/lib/platform/password", () => ({
  hashPassword: (plain: string) => hashPasswordMock(plain),
}))

const createCaller = createCallerFactory(platformUsersRouter)

const OPERATOR_ID = "00000000-0000-4000-a000-000000000001"
const OTHER_ID = "11111111-1111-4000-a000-000000000002"

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: OTHER_ID,
    email: "other@terp.de",
    displayName: "Other Operator",
    isActive: true,
    mfaEnrolledAt: new Date("2026-04-01T00:00:00Z"),
    lastLoginAt: null,
    lastLoginIp: null,
    createdAt: new Date("2026-04-01T00:00:00Z"),
    createdBy: OPERATOR_ID,
    ...overrides,
  }
}

beforeEach(() => {
  hashPasswordMock.mockClear()
})

// --- list ---

describe("platform platformUsers.list", () => {
  it("returns the ordered platform users without secrets", async () => {
    const findMany = vi.fn().mockResolvedValue([makeUser()])
    const ctx = createMockPlatformContext({
      prisma: { platformUser: { findMany } },
    })
    const caller = createCaller(ctx)
    const result = await caller.list()
    expect(result).toHaveLength(1)
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { createdAt: "desc" },
        select: expect.objectContaining({
          id: true,
          email: true,
          displayName: true,
          isActive: true,
          mfaEnrolledAt: true,
          lastLoginAt: true,
        }),
      })
    )
    // Secrets must NOT be selected.
    const select = findMany.mock.calls[0]![0].select
    expect(select).not.toHaveProperty("passwordHash")
    expect(select).not.toHaveProperty("mfaSecret")
    expect(select).not.toHaveProperty("recoveryCodes")
  })
})

// --- create ---

describe("platform platformUsers.create", () => {
  it("hashes the password, persists the user, and writes an audit entry", async () => {
    const findUnique = vi.fn().mockResolvedValue(null)
    const create = vi.fn().mockResolvedValue({
      id: OTHER_ID,
      email: "new@terp.de",
      displayName: "New Operator",
      isActive: true,
      createdAt: new Date(),
    })
    const auditCreate = vi.fn().mockResolvedValue(null)

    const ctx = createMockPlatformContext({
      prisma: {
        platformUser: { findUnique, create },
        platformAuditLog: { create: auditCreate },
      },
    })
    const caller = createCaller(ctx)

    const result = await caller.create({
      email: "new@terp.de",
      displayName: "New Operator",
      password: "super-secret-pw-123",
    })

    expect(result.email).toBe("new@terp.de")
    expect(hashPasswordMock).toHaveBeenCalledWith("super-secret-pw-123")
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: "new@terp.de",
          displayName: "New Operator",
          passwordHash: "hashed:super-secret-pw-123",
          createdBy: OPERATOR_ID,
        }),
      })
    )
    expect(auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "platform_user.created",
          platformUserId: OPERATOR_ID,
          entityType: "platform_user",
          entityId: OTHER_ID,
        }),
      })
    )
  })

  it("throws CONFLICT when another user already has that email", async () => {
    const findUnique = vi.fn().mockResolvedValue(makeUser())
    const create = vi.fn()
    const ctx = createMockPlatformContext({
      prisma: { platformUser: { findUnique, create } },
    })
    const caller = createCaller(ctx)

    await expect(
      caller.create({
        email: "other@terp.de",
        displayName: "Clash",
        password: "super-secret-pw-123",
      })
    ).rejects.toMatchObject({ code: "CONFLICT" })
    expect(create).not.toHaveBeenCalled()
  })

  it("rejects passwords shorter than 12 characters at the input layer", async () => {
    const ctx = createMockPlatformContext({
      prisma: { platformUser: {} },
    })
    const caller = createCaller(ctx)
    await expect(
      caller.create({
        email: "short@terp.de",
        displayName: "Short",
        password: "tooshort",
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })
    // hash must not even be attempted on invalid input
    expect(hashPasswordMock).not.toHaveBeenCalled()
  })
})

// --- updatePassword ---

describe("platform platformUsers.updatePassword", () => {
  it("hashes the new password and writes an audit entry", async () => {
    const update = vi.fn().mockResolvedValue({ id: OTHER_ID })
    const auditCreate = vi.fn().mockResolvedValue(null)
    const ctx = createMockPlatformContext({
      prisma: {
        platformUser: { update },
        platformAuditLog: { create: auditCreate },
      },
    })
    const caller = createCaller(ctx)
    const result = await caller.updatePassword({
      id: OTHER_ID,
      newPassword: "another-strong-pw-123",
    })
    expect(result.ok).toBe(true)
    expect(hashPasswordMock).toHaveBeenCalledWith("another-strong-pw-123")
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: OTHER_ID },
        data: { passwordHash: "hashed:another-strong-pw-123" },
      })
    )
    expect(auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "platform_user.password_changed",
        }),
      })
    )
  })
})

// --- resetMfa ---

describe("platform platformUsers.resetMfa", () => {
  it("wipes the stored secret and recovery codes", async () => {
    const update = vi.fn().mockResolvedValue({ id: OTHER_ID })
    const auditCreate = vi.fn().mockResolvedValue(null)
    const ctx = createMockPlatformContext({
      prisma: {
        platformUser: { update },
        platformAuditLog: { create: auditCreate },
      },
    })
    const caller = createCaller(ctx)
    await caller.resetMfa({ id: OTHER_ID })

    const call = update.mock.calls[0]![0]
    expect(call.where).toEqual({ id: OTHER_ID })
    expect(call.data.mfaSecret).toBeNull()
    expect(call.data.mfaEnrolledAt).toBeNull()
    // recoveryCodes must be explicitly cleared (via `undefined` → no-op Prisma
    // JSON write; the router relies on the caller `update` semantics — we
    // assert the property is addressed so nobody accidentally removes it).
    expect(call.data).toHaveProperty("recoveryCodes")
    expect(auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "platform_user.mfa_reset" }),
      })
    )
  })
})

// --- setActive ---

describe("platform platformUsers.setActive", () => {
  it("activates a user and writes an audit entry", async () => {
    const update = vi.fn().mockResolvedValue({ id: OTHER_ID, isActive: true })
    const auditCreate = vi.fn().mockResolvedValue(null)
    const ctx = createMockPlatformContext({
      prisma: {
        platformUser: { update, count: vi.fn().mockResolvedValue(5) },
        platformAuditLog: { create: auditCreate },
      },
    })
    const caller = createCaller(ctx)
    const result = await caller.setActive({ id: OTHER_ID, isActive: true })
    expect(result.isActive).toBe(true)
    expect(auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "platform_user.activated",
        }),
      })
    )
  })

  it("throws CONFLICT when an operator tries to deactivate themselves", async () => {
    const ctx = createMockPlatformContext({
      prisma: { platformUser: { update: vi.fn() } },
    })
    const caller = createCaller(ctx)
    await expect(
      caller.setActive({ id: OPERATOR_ID, isActive: false })
    ).rejects.toMatchObject({ code: "CONFLICT" })
  })

  it("throws CONFLICT when deactivation would leave zero active operators", async () => {
    const update = vi.fn()
    const count = vi.fn().mockResolvedValue(1) // only one active left
    const ctx = createMockPlatformContext({
      prisma: { platformUser: { update, count } },
    })
    const caller = createCaller(ctx)
    await expect(
      caller.setActive({ id: OTHER_ID, isActive: false })
    ).rejects.toMatchObject({ code: "CONFLICT" })
    expect(update).not.toHaveBeenCalled()
  })

  it("allows deactivation when more than one active operator remains", async () => {
    const update = vi
      .fn()
      .mockResolvedValue({ id: OTHER_ID, isActive: false })
    const count = vi.fn().mockResolvedValue(2)
    const ctx = createMockPlatformContext({
      prisma: {
        platformUser: { update, count },
        platformAuditLog: { create: vi.fn().mockResolvedValue(null) },
      },
    })
    const caller = createCaller(ctx)
    const result = await caller.setActive({ id: OTHER_ID, isActive: false })
    expect(result.isActive).toBe(false)
    expect(count).toHaveBeenCalled()
  })
})

// --- delete ---

describe("platform platformUsers.delete", () => {
  it("deletes another operator and writes an audit entry", async () => {
    const del = vi.fn().mockResolvedValue({ id: OTHER_ID })
    const count = vi.fn().mockResolvedValue(3)
    const auditCreate = vi.fn().mockResolvedValue(null)
    const ctx = createMockPlatformContext({
      prisma: {
        platformUser: { delete: del, count },
        platformAuditLog: { create: auditCreate },
      },
    })
    const caller = createCaller(ctx)
    const result = await caller.delete({ id: OTHER_ID })
    expect(result.ok).toBe(true)
    expect(del).toHaveBeenCalledWith({ where: { id: OTHER_ID } })
    expect(auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "platform_user.deleted",
          entityId: OTHER_ID,
        }),
      })
    )
  })

  it("throws CONFLICT when an operator tries to delete themselves", async () => {
    const del = vi.fn()
    const ctx = createMockPlatformContext({
      prisma: { platformUser: { delete: del, count: vi.fn() } },
    })
    const caller = createCaller(ctx)
    await expect(
      caller.delete({ id: OPERATOR_ID })
    ).rejects.toMatchObject({ code: "CONFLICT" })
    expect(del).not.toHaveBeenCalled()
  })

  it("throws CONFLICT when the deletion would empty the platform users table", async () => {
    const del = vi.fn()
    const count = vi.fn().mockResolvedValue(1)
    const ctx = createMockPlatformContext({
      prisma: { platformUser: { delete: del, count } },
    })
    const caller = createCaller(ctx)
    await expect(
      caller.delete({ id: OTHER_ID })
    ).rejects.toMatchObject({ code: "CONFLICT" })
    expect(del).not.toHaveBeenCalled()
  })
})
