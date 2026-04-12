/**
 * Tests for the platform auditLogs router.
 *
 * The router is a thin wrapper over `src/lib/platform/audit-service.ts`,
 * so these tests assert that:
 *
 *   - `list` forwards every filter (action, targetTenantId, platformUserId,
 *     fromDate/toDate) to the service unchanged,
 *   - pagination params are respected and results are shaped as
 *     `{ items, total }`,
 *   - `getById` returns the row on hit and surfaces
 *     `PlatformAuditLogNotFoundError` as a tRPC `NOT_FOUND`.
 *
 * The underlying service is mocked so these tests stay pure unit — the
 * integration between the service and Prisma lives in the service's own
 * test file.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { createCallerFactory } from "../../init"
import { platformAuditLogsRouter } from "../auditLogs"
import { createMockPlatformContext } from "../../__tests__/helpers"
import { PlatformAuditLogNotFoundError } from "@/lib/platform/audit-service"
import type * as PlatformAuditService from "@/lib/platform/audit-service"

const listMock = vi.fn()
const getByIdMock = vi.fn()

vi.mock("@/lib/platform/audit-service", async () => {
  const actual = await vi.importActual<typeof PlatformAuditService>(
    "@/lib/platform/audit-service"
  )
  return {
    ...actual,
    list: (...args: unknown[]) => listMock(...args),
    getById: (...args: unknown[]) => getByIdMock(...args),
  }
})

const createCaller = createCallerFactory(platformAuditLogsRouter)

const ENTRY_ID = "00000000-0000-4000-a000-000000000009"
const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const OPERATOR_ID = "00000000-0000-4000-a000-000000000001"

function makeEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: ENTRY_ID,
    platformUserId: OPERATOR_ID,
    action: "support_session.activated",
    entityType: "support_session",
    entityId: "a0000000-0000-4000-a000-000000000500",
    targetTenantId: TENANT_ID,
    supportSessionId: "a0000000-0000-4000-a000-000000000500",
    changes: null,
    metadata: null,
    ipAddress: "10.0.0.1",
    userAgent: "vitest",
    performedAt: new Date("2026-04-09T12:00:00Z"),
    ...overrides,
  }
}

beforeEach(() => {
  listMock.mockReset()
  getByIdMock.mockReset()
})

// --- list ---

describe("platform auditLogs.list", () => {
  // Helper — the mocked prisma context is an auto-mocking Proxy that does
  // not play well with `toHaveBeenCalledWith` deep equality. We only care
  // about the second argument (the list params) anyway.
  function capturedParams(call: unknown[]): Record<string, unknown> {
    return call[1] as Record<string, unknown>
  }

  it("returns items and total, forwarding default pagination", async () => {
    listMock.mockResolvedValue({ items: [makeEntry()], total: 1 })
    const ctx = createMockPlatformContext({ prisma: { platformAuditLog: {} } })
    const caller = createCaller(ctx)

    const result = await caller.list({ page: 1, pageSize: 20 })
    expect(result).toEqual({
      items: [expect.objectContaining({ id: ENTRY_ID })],
      total: 1,
    })
    const params = capturedParams(listMock.mock.calls[0]!)
    expect(params).toMatchObject({ page: 1, pageSize: 20 })
  })

  it("forwards action and targetTenantId filters", async () => {
    listMock.mockResolvedValue({ items: [], total: 0 })
    const ctx = createMockPlatformContext({ prisma: { platformAuditLog: {} } })
    const caller = createCaller(ctx)

    await caller.list({
      page: 1,
      pageSize: 20,
      action: "support_session.activated",
      targetTenantId: TENANT_ID,
    })

    expect(capturedParams(listMock.mock.calls[0]!)).toMatchObject({
      action: "support_session.activated",
      targetTenantId: TENANT_ID,
    })
  })

  it("forwards platformUserId, fromDate and toDate filters", async () => {
    listMock.mockResolvedValue({ items: [], total: 0 })
    const ctx = createMockPlatformContext({ prisma: { platformAuditLog: {} } })
    const caller = createCaller(ctx)

    const fromDate = "2026-04-01T00:00:00.000Z"
    const toDate = "2026-04-09T23:59:59.000Z"
    await caller.list({
      page: 2,
      pageSize: 50,
      platformUserId: OPERATOR_ID,
      fromDate,
      toDate,
    })

    expect(capturedParams(listMock.mock.calls[0]!)).toMatchObject({
      page: 2,
      pageSize: 50,
      platformUserId: OPERATOR_ID,
      fromDate,
      toDate,
    })
  })

  it("rejects pageSize above the hard maximum at the input layer", async () => {
    const ctx = createMockPlatformContext({ prisma: { platformAuditLog: {} } })
    const caller = createCaller(ctx)
    await expect(
      caller.list({ page: 1, pageSize: 9999 })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })
    expect(listMock).not.toHaveBeenCalled()
  })

  it("rejects a non-UUID targetTenantId at the input layer", async () => {
    const ctx = createMockPlatformContext({ prisma: { platformAuditLog: {} } })
    const caller = createCaller(ctx)
    await expect(
      caller.list({
        page: 1,
        pageSize: 20,
        targetTenantId: "not-a-uuid",
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })
    expect(listMock).not.toHaveBeenCalled()
  })
})

// --- getById ---

describe("platform auditLogs.getById", () => {
  it("returns the entry when found", async () => {
    getByIdMock.mockResolvedValue(makeEntry())
    const ctx = createMockPlatformContext({ prisma: { platformAuditLog: {} } })
    const caller = createCaller(ctx)
    const result = await caller.getById({ id: ENTRY_ID })
    expect(result).toMatchObject({ id: ENTRY_ID })
    // Second argument is the id; first is the auto-mocked prisma Proxy,
    // which does not play well with deep equality.
    expect(getByIdMock.mock.calls[0]![1]).toBe(ENTRY_ID)
  })

  it("maps PlatformAuditLogNotFoundError to tRPC NOT_FOUND", async () => {
    getByIdMock.mockRejectedValue(new PlatformAuditLogNotFoundError(ENTRY_ID))
    const ctx = createMockPlatformContext({ prisma: { platformAuditLog: {} } })
    const caller = createCaller(ctx)
    await expect(
      caller.getById({ id: ENTRY_ID })
    ).rejects.toMatchObject({ code: "NOT_FOUND" })
  })
})
