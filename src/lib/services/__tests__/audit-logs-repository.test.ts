import { describe, it, expect, vi } from "vitest"
import { create } from "../audit-logs-repository"
import type { PrismaClient } from "@/generated/prisma/client"
import type { AuditLogCreateInput } from "../audit-logs-repository"

// --- Constants ---
const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const USER_ID = "a0000000-0000-4000-a000-000000000001"
const ENTITY_ID = "e0000000-0000-4000-a000-000000000001"

const mockAuditLogRow = {
  id: "d0000000-0000-4000-a000-000000000001",
  tenantId: TENANT_ID,
  userId: USER_ID,
  action: "CREATE",
  entityType: "Employee",
  entityId: ENTITY_ID,
  entityName: "Max Mustermann",
  changes: { firstName: { old: null, new: "Max" } },
  metadata: { source: "import" },
  ipAddress: "127.0.0.1",
  userAgent: "vitest",
  performedAt: new Date(),
}

function createMockPrisma(
  createReturnValue: unknown = mockAuditLogRow
) {
  return {
    auditLog: {
      create: vi.fn().mockResolvedValue(createReturnValue),
    },
  } as unknown as PrismaClient
}

describe("audit-logs-repository create", () => {
  it("creates audit log with all fields", async () => {
    const mockPrisma = createMockPrisma()

    const input: AuditLogCreateInput = {
      tenantId: TENANT_ID,
      userId: USER_ID,
      action: "CREATE",
      entityType: "Employee",
      entityId: ENTITY_ID,
      entityName: "Max Mustermann",
      changes: { firstName: { old: null, new: "Max" } },
      metadata: { source: "import" },
      ipAddress: "127.0.0.1",
      userAgent: "vitest",
    }

    const result = await create(mockPrisma, input)

    expect(result).toEqual(mockAuditLogRow)

    const prismaCreate = vi.mocked(
      (mockPrisma as unknown as { auditLog: { create: ReturnType<typeof vi.fn> } })
        .auditLog.create
    )
    expect(prismaCreate).toHaveBeenCalledOnce()
    expect(prismaCreate).toHaveBeenCalledWith({
      data: {
        tenantId: TENANT_ID,
        userId: USER_ID,
        action: "CREATE",
        entityType: "Employee",
        entityId: ENTITY_ID,
        entityName: "Max Mustermann",
        changes: { firstName: { old: null, new: "Max" } },
        metadata: { source: "import" },
        ipAddress: "127.0.0.1",
        userAgent: "vitest",
      },
    })
  })

  it("creates audit log with minimal fields (optional fields null/undefined)", async () => {
    const mockPrisma = createMockPrisma({ id: "minimal-id" })

    const input: AuditLogCreateInput = {
      tenantId: TENANT_ID,
      userId: null,
      action: "DELETE",
      entityType: "Address",
      entityId: ENTITY_ID,
    }

    const result = await create(mockPrisma, input)

    expect(result).toEqual({ id: "minimal-id" })

    const prismaCreate = vi.mocked(
      (mockPrisma as unknown as { auditLog: { create: ReturnType<typeof vi.fn> } })
        .auditLog.create
    )
    expect(prismaCreate).toHaveBeenCalledWith({
      data: {
        tenantId: TENANT_ID,
        userId: null,
        action: "DELETE",
        entityType: "Address",
        entityId: ENTITY_ID,
        entityName: null,
        changes: undefined,
        metadata: undefined,
        ipAddress: null,
        userAgent: null,
      },
    })
  })

  it("handles JSONB changes and metadata correctly", async () => {
    const complexChanges = {
      status: { old: "ACTIVE", new: "INACTIVE" },
      salary: { old: 50000, new: 55000 },
      tags: { old: ["a", "b"], new: ["a", "b", "c"] },
    }
    const complexMetadata = {
      reason: "Annual review",
      approvedBy: USER_ID,
      nested: { level: 2, items: [1, 2, 3] },
    }

    const mockPrisma = createMockPrisma({
      id: "json-id",
      changes: complexChanges,
      metadata: complexMetadata,
    })

    const input: AuditLogCreateInput = {
      tenantId: TENANT_ID,
      userId: USER_ID,
      action: "UPDATE",
      entityType: "Employee",
      entityId: ENTITY_ID,
      changes: complexChanges,
      metadata: complexMetadata,
    }

    const result = await create(mockPrisma, input)

    expect(result).toEqual({
      id: "json-id",
      changes: complexChanges,
      metadata: complexMetadata,
    })

    const prismaCreate = vi.mocked(
      (mockPrisma as unknown as { auditLog: { create: ReturnType<typeof vi.fn> } })
        .auditLog.create
    )
    expect(prismaCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        changes: complexChanges,
        metadata: complexMetadata,
      }),
    })
  })
})
