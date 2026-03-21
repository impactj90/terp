import { describe, it, expect, vi, beforeEach } from "vitest"
import { computeChanges, log } from "../audit-logs-service"
import * as repo from "../audit-logs-repository"
import type { PrismaClient } from "@/generated/prisma/client"
import type { AuditLogCreateInput } from "../audit-logs-repository"

vi.mock("../audit-logs-repository", () => ({
  create: vi.fn(),
}))

// --- Constants ---
const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const USER_ID = "a0000000-0000-4000-a000-000000000001"
const ENTITY_ID = "e0000000-0000-4000-a000-000000000001"

const mockPrisma = {} as unknown as PrismaClient

function validInput(
  overrides: Partial<AuditLogCreateInput> = {}
): AuditLogCreateInput {
  return {
    tenantId: TENANT_ID,
    userId: USER_ID,
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

// =============================================================================
// computeChanges
// =============================================================================

describe("computeChanges", () => {
  it("returns null when no fields changed", () => {
    const record = { name: "Alice", age: 30 }
    expect(computeChanges(record, { ...record })).toBeNull()
  })

  it("detects changed string fields", () => {
    const before = { name: "Alice", role: "user" }
    const after = { name: "Alice", role: "admin" }
    const result = computeChanges(before, after)

    expect(result).toEqual({
      role: { old: "user", new: "admin" },
    })
  })

  it("detects changed number fields", () => {
    const before = { salary: 50000 }
    const after = { salary: 55000 }
    const result = computeChanges(before, after)

    expect(result).toEqual({
      salary: { old: 50000, new: 55000 },
    })
  })

  it("handles Date values (normalized to ISO string)", () => {
    const d1 = new Date("2026-01-01T00:00:00.000Z")
    const d2 = new Date("2026-06-15T00:00:00.000Z")

    const result = computeChanges({ startDate: d1 }, { startDate: d2 })
    expect(result).toEqual({
      startDate: {
        old: "2026-01-01T00:00:00.000Z",
        new: "2026-06-15T00:00:00.000Z",
      },
    })
  })

  it("returns null when Date values are identical", () => {
    const d = new Date("2026-01-01T00:00:00.000Z")
    const dCopy = new Date("2026-01-01T00:00:00.000Z")
    expect(computeChanges({ startDate: d }, { startDate: dCopy })).toBeNull()
  })

  it("handles Decimal values (normalized via toNumber())", () => {
    const decimal1 = { toNumber: () => 100.5 }
    const decimal2 = { toNumber: () => 200.75 }

    const result = computeChanges({ amount: decimal1 }, { amount: decimal2 })
    expect(result).toEqual({
      amount: { old: 100.5, new: 200.75 },
    })
  })

  it("returns null when Decimal values are identical", () => {
    const decimal1 = { toNumber: () => 100.5 }
    const decimal2 = { toNumber: () => 100.5 }
    expect(
      computeChanges({ amount: decimal1 }, { amount: decimal2 })
    ).toBeNull()
  })

  it("handles null to value transitions", () => {
    const result = computeChanges({ email: null }, { email: "a@b.com" })
    expect(result).toEqual({
      email: { old: null, new: "a@b.com" },
    })
  })

  it("handles value to null transitions", () => {
    const result = computeChanges({ email: "a@b.com" }, { email: null })
    expect(result).toEqual({
      email: { old: "a@b.com", new: null },
    })
  })

  it("treats undefined and null as equivalent (no change)", () => {
    // undefined in before, null in after — both normalize to null
    expect(computeChanges({ email: undefined }, { email: null })).toBeNull()
    // null in before, undefined in after
    expect(computeChanges({ email: null }, { email: undefined })).toBeNull()
  })

  it("detects change from undefined to a value", () => {
    const result = computeChanges({ email: undefined }, { email: "a@b.com" })
    expect(result).toEqual({
      email: { old: null, new: "a@b.com" },
    })
  })

  it("respects fieldsToTrack whitelist — ignores unlisted fields", () => {
    const before = { name: "Alice", age: 30, role: "user" }
    const after = { name: "Bob", age: 31, role: "admin" }

    const result = computeChanges(before, after, ["name", "role"])
    expect(result).toEqual({
      name: { old: "Alice", new: "Bob" },
      role: { old: "user", new: "admin" },
    })
    // age changed but is not in fieldsToTrack
    expect(result).not.toHaveProperty("age")
  })

  it("returns correct { old, new } structure for multiple changes", () => {
    const before = { a: 1, b: "x", c: true }
    const after = { a: 2, b: "y", c: true }

    const result = computeChanges(before, after)
    expect(result).toEqual({
      a: { old: 1, new: 2 },
      b: { old: "x", new: "y" },
    })
    // c did not change
    expect(result).not.toHaveProperty("c")
  })

  it("detects fields added in after that are missing in before", () => {
    const before = { name: "Alice" }
    const after = { name: "Alice", email: "a@b.com" }

    const result = computeChanges(before, after)
    expect(result).toEqual({
      email: { old: null, new: "a@b.com" },
    })
  })

  it("detects fields present in before but missing in after", () => {
    const before = { name: "Alice", email: "a@b.com" }
    const after = { name: "Alice" }

    const result = computeChanges(before, after)
    expect(result).toEqual({
      email: { old: "a@b.com", new: null },
    })
  })
})

// =============================================================================
// log
// =============================================================================

describe("log", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("creates audit log entry via repository", async () => {
    vi.mocked(repo.create).mockResolvedValueOnce({ id: "log-1" } as never)

    await log(mockPrisma, validInput())

    expect(repo.create).toHaveBeenCalledOnce()
    expect(repo.create).toHaveBeenCalledWith(mockPrisma, validInput())
  })

  it("passes all fields correctly to repository create", async () => {
    const input = validInput({
      entityName: "Test Entity",
      changes: { status: { old: "ACTIVE", new: "INACTIVE" } },
      metadata: { reason: "requested by user" },
      ipAddress: "10.0.0.1",
      userAgent: "Mozilla/5.0",
    })

    vi.mocked(repo.create).mockResolvedValueOnce({ id: "log-2" } as never)

    await log(mockPrisma, input)

    expect(repo.create).toHaveBeenCalledWith(mockPrisma, input)
  })

  it("handles null userId gracefully", async () => {
    const input = validInput({ userId: null })
    vi.mocked(repo.create).mockResolvedValueOnce({ id: "log-3" } as never)

    await log(mockPrisma, input)

    expect(repo.create).toHaveBeenCalledWith(
      mockPrisma,
      expect.objectContaining({ userId: null })
    )
  })

  it("never throws when prisma.auditLog.create fails", async () => {
    vi.mocked(repo.create).mockRejectedValueOnce(
      new Error("DB connection lost")
    )
    const consoleSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {})

    // Should not throw
    await expect(log(mockPrisma, validInput())).resolves.toBeUndefined()

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("[AuditLog]"),
      expect.any(Error),
      expect.objectContaining({ action: "UPDATE" })
    )
    consoleSpy.mockRestore()
  })

  it("returns void on success", async () => {
    vi.mocked(repo.create).mockResolvedValueOnce({ id: "log-4" } as never)

    const result = await log(mockPrisma, validInput())
    expect(result).toBeUndefined()
  })
})
