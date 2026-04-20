import { describe, it, expect, vi, beforeEach } from "vitest"
import type { PrismaClient } from "@/generated/prisma/client"

// Mock the repository module
vi.mock("../audit-logs-repository", () => ({
  countForExport: vi.fn(),
  findAllForExport: vi.fn(),
  create: vi.fn(),
}))

// Mock the audit-logs-service (for log function)
vi.mock("../audit-logs-service", () => ({
  log: vi.fn().mockResolvedValue(undefined),
}))

import * as repo from "../audit-logs-repository"
import * as auditLog from "../audit-logs-service"
import {
  exportCsv,
  AuditLogExportValidationError,
} from "../audit-log-export-service"

// --- Constants ---
const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const USER_ID = "a0000000-0000-4000-a000-000000000001"

const mockPrisma = {} as unknown as PrismaClient

function makeRecord(
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
    id: "a0000000-0000-4000-a000-000000000810",
    tenantId: TENANT_ID,
    userId: USER_ID,
    action: "update",
    entityType: "employee",
    entityId: "e0000000-0000-4000-a000-000000000050",
    entityName: "John Doe",
    changes: { name: { old: "John", new: "Johnny" } },
    metadata: null,
    ipAddress: "127.0.0.1",
    userAgent: "Mozilla/5.0",
    performedAt: new Date("2026-04-08T10:30:00Z"),
    user: {
      id: USER_ID,
      email: "admin@example.com",
      displayName: "Admin User",
    },
    ...overrides,
  }
}

// =============================================================================
// exportCsv
// =============================================================================

describe("exportCsv", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("generates CSV with BOM, headers, and data rows", async () => {
    const records = [
      makeRecord(),
      makeRecord({
        id: "a0000000-0000-4000-a000-000000000811",
        action: "create",
        entityName: "Jane Doe",
        changes: null,
      }),
    ]
    vi.mocked(repo.countForExport).mockResolvedValue(2)
    vi.mocked(repo.findAllForExport).mockResolvedValue(records as never)

    const result = await exportCsv(mockPrisma, TENANT_ID, {})

    // Starts with UTF-8 BOM
    expect(result.csv.startsWith("\uFEFF")).toBe(true)

    // Has 3 lines (header + 2 data rows)
    const lines = result.csv.replace("\uFEFF", "").split("\n")
    expect(lines).toHaveLength(3)

    // Header has semicolons and German labels
    expect(lines[0]).toContain("Zeitstempel")
    expect(lines[0]).toContain("Benutzer")
    expect(lines[0]).toContain("Aktion")
    expect(lines[0]).toContain("Entitaetstyp")
    expect(lines[0]).toContain(";")

    // Data rows use semicolons
    expect(lines[1]).toContain(";")
    expect(lines[2]).toContain(";")

    // All cells are quoted
    const cells = lines[0]!.split(";")
    for (const cell of cells) {
      expect(cell.startsWith('"')).toBe(true)
      expect(cell.endsWith('"')).toBe(true)
    }

    // Filename matches pattern
    expect(result.filename).toMatch(/^Audit-Log_\d{8}\.csv$/)

    // Count is correct
    expect(result.count).toBe(2)
  })

  it("formats changes column correctly", async () => {
    const records = [
      makeRecord({ changes: { name: { old: "Alice", new: "Bob" } } }),
    ]
    vi.mocked(repo.countForExport).mockResolvedValue(1)
    vi.mocked(repo.findAllForExport).mockResolvedValue(records as never)

    const result = await exportCsv(mockPrisma, TENANT_ID, {})

    const lines = result.csv.replace("\uFEFF", "").split("\n")
    // The changes column in the data row should contain the formatted diff
    // (double-quotes are escaped as "" inside CSV cells)
    expect(lines[1]).toContain('name: ""Alice"" -> ""Bob""')
  })

  it("shows 'System' for null user", async () => {
    const records = [makeRecord({ userId: null, user: null })]
    vi.mocked(repo.countForExport).mockResolvedValue(1)
    vi.mocked(repo.findAllForExport).mockResolvedValue(records as never)

    const result = await exportCsv(mockPrisma, TENANT_ID, {})

    const lines = result.csv.replace("\uFEFF", "").split("\n")
    expect(lines[1]).toContain('"System"')
  })

  it("throws validation error when limit exceeded", async () => {
    vi.mocked(repo.countForExport).mockResolvedValue(10001)

    await expect(exportCsv(mockPrisma, TENANT_ID, {})).rejects.toThrow(
      AuditLogExportValidationError
    )
    await expect(exportCsv(mockPrisma, TENANT_ID, {})).rejects.toThrow(
      /Export-Limit ueberschritten/
    )
  })

  it("throws validation error when no entries match", async () => {
    vi.mocked(repo.countForExport).mockResolvedValue(0)

    await expect(exportCsv(mockPrisma, TENANT_ID, {})).rejects.toThrow(
      AuditLogExportValidationError
    )
    await expect(exportCsv(mockPrisma, TENANT_ID, {})).rejects.toThrow(
      /Keine Audit-Protokolleintraege/
    )
  })

  it("logs audit entry when audit context provided", async () => {
    const records = [makeRecord()]
    vi.mocked(repo.countForExport).mockResolvedValue(1)
    vi.mocked(repo.findAllForExport).mockResolvedValue(records as never)

    const audit = {
      userId: USER_ID,
      ipAddress: "10.0.0.1",
      userAgent: "test-agent",
    }

    await exportCsv(mockPrisma, TENANT_ID, {}, audit)

    expect(auditLog.log).toHaveBeenCalledWith(
      mockPrisma,
      expect.objectContaining({
        tenantId: TENANT_ID,
        userId: USER_ID,
        action: "export",
        entityType: "audit_log",
        // Synthetic batch UUID (randomUUID) — audit_logs.entity_id is
        // UUID NOT NULL in Postgres, so a string literal like "batch"
        // would be rejected and the write silently swallowed by the
        // service's .catch().
        entityId: expect.stringMatching(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
        ),
      })
    )
  })

  it("does not log audit entry when no audit context", async () => {
    const records = [makeRecord()]
    vi.mocked(repo.countForExport).mockResolvedValue(1)
    vi.mocked(repo.findAllForExport).mockResolvedValue(records as never)

    await exportCsv(mockPrisma, TENANT_ID, {})

    expect(auditLog.log).not.toHaveBeenCalled()
  })

  it("handles empty changes gracefully", async () => {
    const records = [makeRecord({ changes: null })]
    vi.mocked(repo.countForExport).mockResolvedValue(1)
    vi.mocked(repo.findAllForExport).mockResolvedValue(records as never)

    const result = await exportCsv(mockPrisma, TENANT_ID, {})

    const lines = result.csv.replace("\uFEFF", "").split("\n")
    // Changes column should be empty (quoted empty string)
    expect(lines[1]).toContain('""')
    expect(result.count).toBe(1)
  })

  it("escapes double-quotes in cell values", async () => {
    const records = [
      makeRecord({ entityName: 'John "The Boss" Doe' }),
    ]
    vi.mocked(repo.countForExport).mockResolvedValue(1)
    vi.mocked(repo.findAllForExport).mockResolvedValue(records as never)

    const result = await exportCsv(mockPrisma, TENANT_ID, {})

    const lines = result.csv.replace("\uFEFF", "").split("\n")
    // Double-quotes should be escaped as ""
    expect(lines[1]).toContain('John ""The Boss"" Doe')
  })
})
