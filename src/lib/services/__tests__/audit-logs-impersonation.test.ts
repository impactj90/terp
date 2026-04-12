/**
 * Tests the impersonation dual-write path of `audit-logs-service.log()` /
 * `logBulk()`.
 *
 * Plan: thoughts/shared/plans/2026-04-09-platform-admin-system.md (Phase 7.5)
 *
 * When `impersonationStorage` has an active store:
 *   - `repo.create` / `repo.createBulk` runs as before (tenant write).
 *   - `prisma.platformAuditLog.create` / `createMany` is called exactly
 *     once with the matching entity fields and
 *     `action = "impersonation.<original action>"`.
 *
 * Outside any impersonation store:
 *   - Only the tenant write happens — the platform table is untouched.
 *
 * If the tenant write succeeds but the platform write throws, the error
 * must be swallowed (audit failures must never break the business op).
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { log, logBulk } from "../audit-logs-service"
import * as repo from "../audit-logs-repository"
import type { PrismaClient } from "@/generated/prisma/client"
import type { AuditLogCreateInput } from "../audit-logs-repository"
import { impersonationStorage } from "@/lib/platform/impersonation-context"

vi.mock("../audit-logs-repository", () => ({
  create: vi.fn(),
  createBulk: vi.fn(),
}))

const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const SENTINEL_ID = "00000000-0000-0000-0000-00000000beef"
const ENTITY_ID = "e0000000-0000-4000-a000-000000000001"
const PLATFORM_USER_ID = "00000000-0000-4000-a000-000000000001"
const SUPPORT_SESSION_ID = "00000000-0000-4000-a000-0000000000cc"

const platformCreateMock = vi.fn()
const platformCreateManyMock = vi.fn()

const mockPrisma = {
  platformAuditLog: {
    create: platformCreateMock,
    createMany: platformCreateManyMock,
  },
} as unknown as PrismaClient

function validInput(
  overrides: Partial<AuditLogCreateInput> = {}
): AuditLogCreateInput {
  return {
    tenantId: TENANT_ID,
    userId: SENTINEL_ID,
    action: "UPDATE",
    entityType: "Employee",
    entityId: ENTITY_ID,
    entityName: "Max Mustermann",
    changes: { firstName: { old: "Max", new: "Moritz" } },
    metadata: null,
    ipAddress: "127.0.0.1",
    userAgent: "vitest",
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(repo.create).mockResolvedValue({ id: "log-1" } as never)
  vi.mocked(repo.createBulk).mockResolvedValue({ count: 1 } as never)
  platformCreateMock.mockResolvedValue({ id: "platform-log-1" })
  platformCreateManyMock.mockResolvedValue({ count: 1 })
})

describe("audit-logs-service.log — impersonation dual-write", () => {
  it("writes BOTH tenant row and platform row when impersonation is active", async () => {
    await impersonationStorage.run(
      {
        platformUserId: PLATFORM_USER_ID,
        supportSessionId: SUPPORT_SESSION_ID,
      },
      async () => {
        await log(mockPrisma, validInput())
      }
    )

    expect(repo.create).toHaveBeenCalledOnce()
    expect(platformCreateMock).toHaveBeenCalledOnce()
    expect(platformCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        platformUserId: PLATFORM_USER_ID,
        action: "impersonation.UPDATE",
        entityType: "Employee",
        entityId: ENTITY_ID,
        targetTenantId: TENANT_ID,
        supportSessionId: SUPPORT_SESSION_ID,
        ipAddress: "127.0.0.1",
        userAgent: "vitest",
        metadata: {
          entityName: "Max Mustermann",
          originalUserId: SENTINEL_ID,
        },
      }),
    })
  })

  it("writes only the tenant row when impersonation is absent", async () => {
    await log(mockPrisma, validInput())
    expect(repo.create).toHaveBeenCalledOnce()
    expect(platformCreateMock).not.toHaveBeenCalled()
  })

  it("swallows an error thrown by the platform write", async () => {
    platformCreateMock.mockRejectedValueOnce(new Error("DB exploded"))
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    await expect(
      impersonationStorage.run(
        {
          platformUserId: PLATFORM_USER_ID,
          supportSessionId: SUPPORT_SESSION_ID,
        },
        async () => log(mockPrisma, validInput())
      )
    ).resolves.toBeUndefined()

    expect(repo.create).toHaveBeenCalledOnce()
    expect(platformCreateMock).toHaveBeenCalledOnce()
    expect(consoleSpy).toHaveBeenCalled()
    consoleSpy.mockRestore()
  })

  it("namespaces the action consistently across call sites", async () => {
    await impersonationStorage.run(
      {
        platformUserId: PLATFORM_USER_ID,
        supportSessionId: SUPPORT_SESSION_ID,
      },
      async () => {
        await log(mockPrisma, validInput({ action: "DELETE" }))
      }
    )
    expect(platformCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: "impersonation.DELETE" }),
    })
  })
})

describe("audit-logs-service.logBulk — impersonation dual-write", () => {
  it("writes BOTH tenant bulk and platform bulk when impersonation is active", async () => {
    const inputs = [
      validInput({ action: "CREATE", entityId: ENTITY_ID }),
      validInput({
        action: "UPDATE",
        entityId: "e0000000-0000-4000-a000-000000000002",
      }),
    ]
    await impersonationStorage.run(
      {
        platformUserId: PLATFORM_USER_ID,
        supportSessionId: SUPPORT_SESSION_ID,
      },
      async () => {
        await logBulk(mockPrisma, inputs)
      }
    )

    expect(repo.createBulk).toHaveBeenCalledOnce()
    expect(platformCreateManyMock).toHaveBeenCalledOnce()
    const arg = platformCreateManyMock.mock.calls[0]?.[0] as {
      data: Array<Record<string, unknown>>
    }
    expect(arg.data).toHaveLength(2)
    expect(arg.data[0]).toMatchObject({
      action: "impersonation.CREATE",
      targetTenantId: TENANT_ID,
      supportSessionId: SUPPORT_SESSION_ID,
      platformUserId: PLATFORM_USER_ID,
    })
    expect(arg.data[1]).toMatchObject({
      action: "impersonation.UPDATE",
    })
  })

  it("writes only the tenant bulk when impersonation is absent", async () => {
    await logBulk(mockPrisma, [validInput(), validInput()])
    expect(repo.createBulk).toHaveBeenCalledOnce()
    expect(platformCreateManyMock).not.toHaveBeenCalled()
  })

  it("is a no-op when data is empty (no tenant write, no platform write)", async () => {
    await impersonationStorage.run(
      {
        platformUserId: PLATFORM_USER_ID,
        supportSessionId: SUPPORT_SESSION_ID,
      },
      async () => {
        await logBulk(mockPrisma, [])
      }
    )
    expect(repo.createBulk).not.toHaveBeenCalled()
    expect(platformCreateManyMock).not.toHaveBeenCalled()
  })
})
