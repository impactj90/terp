import { describe, it, expect, vi } from "vitest"
import { createCallerFactory } from "@/trpc/init"
import { auditLogsRouter } from "../auditLogs"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import {
  createMockContext,
  createMockSession,
  createUserWithPermissions,
  createMockUserTenant,
} from "./helpers"

// --- Constants ---

const USERS_MANAGE = permissionIdByKey("users.manage")!
const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const USER_ID = "a0000000-0000-4000-a000-000000000001"
const AUDIT_LOG_ID = "a0000000-0000-4000-a000-000000000810"
const TARGET_USER_ID = "a0000000-0000-4000-a000-000000000099"

const createCaller = createCallerFactory(auditLogsRouter)

// --- Helpers ---

function makeAuditLog(
  overrides: Partial<{
    id: string
    tenantId: string
    userId: string | null
    action: string
    entityType: string
    entityId: string
    entityName: string | null
    changes: unknown
    metadata: unknown
    ipAddress: string | null
    userAgent: string | null
    performedAt: Date
    user: { id: string; email: string; displayName: string } | null
  }> = {}
) {
  return {
    id: AUDIT_LOG_ID,
    tenantId: TENANT_ID,
    userId: TARGET_USER_ID,
    action: "update",
    entityType: "employee",
    entityId: "a0000000-0000-4000-a000-000000000050",
    entityName: "John Doe",
    changes: { name: { old: "John", new: "Johnny" } },
    metadata: null,
    ipAddress: "127.0.0.1",
    userAgent: "Mozilla/5.0",
    performedAt: new Date("2025-02-15T10:30:00Z"),
    user: {
      id: TARGET_USER_ID,
      email: "admin@example.com",
      displayName: "Admin User",
    },
    ...overrides,
  }
}

function createTestContext(prisma: Record<string, unknown>) {
  return createMockContext({
    prisma: prisma as unknown as ReturnType<typeof createMockContext>["prisma"],
    authToken: "test-token",
    user: createUserWithPermissions([USERS_MANAGE], {
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
      userTenants: [createMockUserTenant(USER_ID, TENANT_ID)],
    }),
    session: createMockSession(),
    tenantId: TENANT_ID,
  })
}

// --- auditLogs.list tests ---

describe("auditLogs.list", () => {
  it("returns paginated results with total", async () => {
    const logs = [makeAuditLog(), makeAuditLog({ id: "a0000000-0000-4000-a000-000000000811" })]
    const mockPrisma = {
      auditLog: {
        findMany: vi.fn().mockResolvedValue(logs),
        count: vi.fn().mockResolvedValue(2),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.list()

    expect(result.items).toHaveLength(2)
    expect(result.total).toBe(2)
    expect(result.items[0]!.id).toBe(AUDIT_LOG_ID)
    expect(result.items[0]!.user).toEqual({
      id: TARGET_USER_ID,
      email: "admin@example.com",
      displayName: "Admin User",
    })
  })

  it("applies filters (userId, entityType, action, date range)", async () => {
    const mockPrisma = {
      auditLog: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.list({
      userId: TARGET_USER_ID,
      entityType: "employee",
      action: "update",
      fromDate: "2025-01-01T00:00:00Z",
      toDate: "2025-12-31T23:59:59Z",
    })

    expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith({
      where: {
        tenantId: TENANT_ID,
        userId: TARGET_USER_ID,
        entityType: "employee",
        action: "update",
        performedAt: {
          gte: new Date("2025-01-01T00:00:00Z"),
          lte: new Date("2025-12-31T23:59:59Z"),
        },
      },
      include: {
        user: { select: { id: true, email: true, displayName: true } },
      },
      orderBy: { performedAt: "desc" },
      skip: 0,
      take: 20,
    })
  })

  it("uses default page and pageSize", async () => {
    const mockPrisma = {
      auditLog: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.list()

    expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 0,
        take: 20,
      })
    )
  })

  it("applies pagination correctly", async () => {
    const mockPrisma = {
      auditLog: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(50),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.list({ page: 3, pageSize: 10 })

    expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 20,
        take: 10,
      })
    )
  })

  it("denies access without users.manage permission", async () => {
    const mockPrisma = {
      auditLog: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
    }
    const caller = createCaller(createNoPermContext(mockPrisma))
    await expect(caller.list()).rejects.toThrow("Insufficient permissions")
  })
})

// --- auditLogs.getById tests ---

describe("auditLogs.getById", () => {
  it("returns audit log with user", async () => {
    const log = makeAuditLog()
    const mockPrisma = {
      auditLog: {
        findFirst: vi.fn().mockResolvedValue(log),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.getById({ id: AUDIT_LOG_ID })

    expect(result.id).toBe(AUDIT_LOG_ID)
    expect(result.action).toBe("update")
    expect(result.entityType).toBe("employee")
    expect(result.entityName).toBe("John Doe")
    expect(result.changes).toEqual({ name: { old: "John", new: "Johnny" } })
    expect(result.user).toEqual({
      id: TARGET_USER_ID,
      email: "admin@example.com",
      displayName: "Admin User",
    })
    expect(mockPrisma.auditLog.findFirst).toHaveBeenCalledWith({
      where: { id: AUDIT_LOG_ID, tenantId: TENANT_ID },
      include: {
        user: { select: { id: true, email: true, displayName: true } },
      },
    })
  })

  it("throws NOT_FOUND for missing ID", async () => {
    const mockPrisma = {
      auditLog: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.getById({ id: AUDIT_LOG_ID })
    ).rejects.toThrow("Audit log not found")
  })

  it("handles audit log with null user", async () => {
    const log = makeAuditLog({ userId: null, user: null })
    const mockPrisma = {
      auditLog: {
        findFirst: vi.fn().mockResolvedValue(log),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.getById({ id: AUDIT_LOG_ID })

    expect(result.userId).toBeNull()
    expect(result.user).toBeNull()
  })
})
