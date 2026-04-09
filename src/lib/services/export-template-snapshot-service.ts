/**
 * Export Template Snapshot Service (Phase 4.2)
 *
 * Golden-file tests for export templates. A snapshot captures the
 * encoded bytes produced by a template + period combination at the
 * time of recording, together with a SHA-256 hash of those bytes.
 *
 * Workflow:
 *   1. User records a snapshot: we render the template for the given
 *      period, store `expectedBody` (the rendered string) +
 *      `expectedHash` (SHA-256 of encoded bytes).
 *   2. On later verification, we re-render for the same period and
 *      compare the new hash to the stored one. Any unintended template
 *      change surfaces as `last_verified_status = "mismatch"`.
 *
 * Snapshots do NOT replace unit tests. They catch drift when the
 * template body, the underlying data model, or a custom filter change
 * in ways that affect the rendered output.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import * as repo from "./export-template-snapshot-repository"
import * as auditLog from "./audit-logs-service"
import type { AuditContext } from "./audit-logs-service"
import { generateExport } from "./export-engine-service"
import * as templateRepo from "./export-template-repository"

export class SnapshotNotFoundError extends Error {
  constructor() {
    super("Snapshot not found")
    this.name = "SnapshotNotFoundError"
  }
}

export class SnapshotValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "SnapshotValidationError"
  }
}

export class SnapshotConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "SnapshotConflictError"
  }
}

export interface RecordInput {
  templateId: string
  name: string
  description?: string | null
  year: number
  month: number
}

export interface VerifyResult {
  status: "match" | "mismatch"
  expectedHash: string
  actualHash: string
  expectedByteSize: number
  actualByteSize: number
  /** Unified-diff-style hints (simple line-by-line on the rendered body). */
  diff: Array<{ type: "equal" | "add" | "remove"; text: string }>
}

function validateName(name: string) {
  if (!name || name.trim().length === 0) {
    throw new SnapshotValidationError("Snapshot name is required")
  }
}

function validatePeriod(year: number, month: number) {
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new SnapshotValidationError("Invalid year")
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new SnapshotValidationError("Invalid month")
  }
}

export async function list(
  prisma: PrismaClient,
  tenantId: string,
  templateId?: string,
) {
  if (templateId) {
    return repo.listForTemplate(prisma, tenantId, templateId)
  }
  return repo.listForTenant(prisma, tenantId)
}

export async function getById(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
) {
  const snap = await repo.findById(prisma, tenantId, id)
  if (!snap) throw new SnapshotNotFoundError()
  return snap
}

/**
 * Renders the template for the given period and creates a new snapshot.
 * Re-recording an existing snapshot name overwrites the stored bytes
 * (used by "Snapshot aktualisieren" in the UI).
 */
export async function record(
  prisma: PrismaClient,
  tenantId: string,
  input: RecordInput,
  audit: AuditContext,
) {
  validateName(input.name)
  validatePeriod(input.year, input.month)

  const tpl = await templateRepo.findById(prisma, tenantId, input.templateId)
  if (!tpl) throw new SnapshotNotFoundError()

  const result = await generateExport(
    prisma,
    tenantId,
    { templateId: input.templateId, year: input.year, month: input.month },
    audit,
    { isTest: true },
  )
  const renderedBody = result.file.toString("binary")

  // Upsert by (templateId, name)
  const existing = await prisma.exportTemplateSnapshot.findUnique({
    where: {
      templateId_name: { templateId: input.templateId, name: input.name.trim() },
    },
  })

  let snapshot
  if (existing) {
    snapshot = await repo.update(prisma, tenantId, existing.id, {
      periodYear: input.year,
      periodMonth: input.month,
      expectedHash: result.fileHash,
      expectedBody: renderedBody,
      expectedByteSize: result.byteSize,
      lastVerifiedAt: new Date(),
      lastVerifiedStatus: "match",
      lastVerifiedHash: result.fileHash,
      lastVerifiedMessage: "Snapshot re-recorded",
      description: input.description ?? null,
    })
  } else {
    snapshot = await repo.create(prisma, {
      tenantId,
      templateId: input.templateId,
      name: input.name.trim(),
      description: input.description ?? null,
      periodYear: input.year,
      periodMonth: input.month,
      expectedHash: result.fileHash,
      expectedBody: renderedBody,
      expectedByteSize: result.byteSize,
      lastVerifiedAt: new Date(),
      lastVerifiedStatus: "match",
      lastVerifiedHash: result.fileHash,
      createdBy: audit.userId ?? null,
    })
  }

  await auditLog
    .log(prisma, {
      tenantId,
      userId: audit.userId,
      action: existing ? "update" : "create",
      entityType: "export_template_snapshot",
      entityId: snapshot!.id,
      entityName: snapshot!.name,
      metadata: { templateId: input.templateId, hash: result.fileHash },
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    })
    .catch((err) => console.error("[AuditLog] Failed:", err))

  return snapshot!
}

/**
 * Re-renders the template for the snapshot's period and compares the
 * new hash to the stored expected hash. Persists the verification
 * result on the snapshot row.
 */
export async function verify(
  prisma: PrismaClient,
  tenantId: string,
  snapshotId: string,
  audit: AuditContext,
): Promise<VerifyResult> {
  const snap = await getById(prisma, tenantId, snapshotId)

  const result = await generateExport(
    prisma,
    tenantId,
    {
      templateId: snap.templateId,
      year: snap.periodYear,
      month: snap.periodMonth,
    },
    audit,
    { isTest: true },
  )
  const actualBody = result.file.toString("binary")
  const match = result.fileHash === snap.expectedHash
  const status: "match" | "mismatch" = match ? "match" : "mismatch"

  await repo.update(prisma, tenantId, snapshotId, {
    lastVerifiedAt: new Date(),
    lastVerifiedStatus: status,
    lastVerifiedHash: result.fileHash,
    lastVerifiedMessage: match ? "Hash matches" : "Hash mismatch",
  })

  return {
    status,
    expectedHash: snap.expectedHash,
    actualHash: result.fileHash,
    expectedByteSize: snap.expectedByteSize,
    actualByteSize: result.byteSize,
    diff: match ? [] : buildLineDiff(snap.expectedBody, actualBody),
  }
}

export async function remove(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  audit: AuditContext,
) {
  const existing = await getById(prisma, tenantId, id)
  await repo.remove(prisma, tenantId, id)

  await auditLog
    .log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "delete",
      entityType: "export_template_snapshot",
      entityId: id,
      entityName: existing.name,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    })
    .catch((err) => console.error("[AuditLog] Failed:", err))

  return { success: true }
}

/**
 * Minimal line-based diff. Returns an array describing lines that are
 * equal, added (present in `after` only) or removed (present in
 * `before` only). Good enough for a human-readable side-by-side view
 * — not a full Myers diff.
 */
export function buildLineDiff(before: string, after: string) {
  const a = before.split(/\r?\n/)
  const b = after.split(/\r?\n/)
  const bSet = new Set(b)
  const aSet = new Set(a)

  // Walk both arrays simultaneously — emit equal lines when they match,
  // otherwise emit remove/add for the mismatching pair.
  const result: Array<{ type: "equal" | "add" | "remove"; text: string }> = []
  let i = 0
  let j = 0
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      result.push({ type: "equal", text: a[i]! })
      i++
      j++
      continue
    }
    // Prefer deleting lines that no longer exist
    if (i < a.length && !bSet.has(a[i]!)) {
      result.push({ type: "remove", text: a[i]! })
      i++
      continue
    }
    if (j < b.length && !aSet.has(b[j]!)) {
      result.push({ type: "add", text: b[j]! })
      j++
      continue
    }
    // Fallback — advance both as a mismatched pair
    if (i < a.length) {
      result.push({ type: "remove", text: a[i]! })
      i++
    }
    if (j < b.length) {
      result.push({ type: "add", text: b[j]! })
      j++
    }
  }
  return result
}
