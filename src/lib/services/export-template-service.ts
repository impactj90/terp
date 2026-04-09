/**
 * Export Template Service (Phase 2)
 *
 * Business logic for managing per-tenant Liquid export templates.
 * Versioning: every update archives the previous body in
 * `export_template_versions` and bumps the template `version` counter.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import * as repo from "./export-template-repository"
import * as auditLog from "./audit-logs-service"
import type { AuditContext } from "./audit-logs-service"
import { createSandboxedEngine } from "./liquid-engine"

export class ExportTemplateNotFoundError extends Error {
  constructor() {
    super("Export template not found")
    this.name = "ExportTemplateNotFoundError"
  }
}

export class ExportTemplateValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ExportTemplateValidationError"
  }
}

export class ExportTemplateConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ExportTemplateConflictError"
  }
}

const VALID_TARGETS = new Set([
  "datev_lodas",
  "datev_lug",
  "lexware",
  "sage",
  "custom",
])
const VALID_ENCODINGS = new Set(["windows-1252", "utf-8", "utf-8-bom"])
const VALID_LINE_ENDINGS = new Set(["crlf", "lf"])

export interface CreateInput {
  name: string
  description?: string | null
  targetSystem: string
  templateBody: string
  outputFilename?: string
  encoding?: string
  lineEnding?: string
  fieldSeparator?: string
  decimalSeparator?: string
  dateFormat?: string
  isActive?: boolean
}

export interface UpdateInput {
  name?: string
  description?: string | null
  targetSystem?: string
  templateBody?: string
  outputFilename?: string
  encoding?: string
  lineEnding?: string
  fieldSeparator?: string
  decimalSeparator?: string
  dateFormat?: string
  isActive?: boolean
}

function validateTemplateBody(body: string): void {
  if (!body || body.trim().length === 0) {
    throw new ExportTemplateValidationError("Template body is required")
  }
  // Parse-only validation — does not render, so no context required.
  const engine = createSandboxedEngine()
  try {
    engine.parse(body)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new ExportTemplateValidationError(`Invalid Liquid syntax: ${msg}`)
  }
}

function validateEnums(
  targetSystem: string | undefined,
  encoding: string | undefined,
  lineEnding: string | undefined,
): void {
  if (targetSystem !== undefined && !VALID_TARGETS.has(targetSystem)) {
    throw new ExportTemplateValidationError(
      `Invalid target system: ${targetSystem}`,
    )
  }
  if (encoding !== undefined && !VALID_ENCODINGS.has(encoding)) {
    throw new ExportTemplateValidationError(`Invalid encoding: ${encoding}`)
  }
  if (lineEnding !== undefined && !VALID_LINE_ENDINGS.has(lineEnding)) {
    throw new ExportTemplateValidationError(
      `Invalid line ending: ${lineEnding}`,
    )
  }
}

export async function list(prisma: PrismaClient, tenantId: string) {
  return repo.listForTenant(prisma, tenantId)
}

export async function getById(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
) {
  const tpl = await repo.findById(prisma, tenantId, id)
  if (!tpl) throw new ExportTemplateNotFoundError()
  return tpl
}

export async function listVersions(
  prisma: PrismaClient,
  tenantId: string,
  templateId: string,
) {
  // Tenant ownership check
  await getById(prisma, tenantId, templateId)
  return repo.listVersions(prisma, templateId)
}

export async function create(
  prisma: PrismaClient,
  tenantId: string,
  input: CreateInput,
  audit?: AuditContext,
) {
  const name = input.name?.trim()
  if (!name) {
    throw new ExportTemplateValidationError("Name is required")
  }
  validateEnums(input.targetSystem, input.encoding, input.lineEnding)
  validateTemplateBody(input.templateBody)

  try {
    const created = await repo.create(prisma, {
      tenantId,
      name,
      description: input.description ?? null,
      targetSystem: input.targetSystem,
      templateBody: input.templateBody,
      outputFilename:
        input.outputFilename ?? "export_{{period.year}}{{period.monthPadded}}.txt",
      encoding: input.encoding ?? "windows-1252",
      lineEnding: input.lineEnding ?? "crlf",
      fieldSeparator: input.fieldSeparator ?? ";",
      decimalSeparator: input.decimalSeparator ?? ",",
      dateFormat: input.dateFormat ?? "TT.MM.JJJJ",
      version: 1,
      isActive: input.isActive ?? true,
      createdBy: audit?.userId ?? null,
      updatedBy: audit?.userId ?? null,
    })

    if (audit) {
      await auditLog
        .log(prisma, {
          tenantId,
          userId: audit.userId,
          action: "create",
          entityType: "export_template",
          entityId: created.id,
          entityName: created.name,
          ipAddress: audit.ipAddress,
          userAgent: audit.userAgent,
        })
        .catch((err) => console.error("[AuditLog] Failed:", err))
    }

    return created
  } catch (err) {
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code: string }).code === "P2002"
    ) {
      throw new ExportTemplateConflictError(
        `Export template with name "${name}" already exists`,
      )
    }
    throw err
  }
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  input: UpdateInput,
  audit?: AuditContext,
) {
  const existing = await repo.findById(prisma, tenantId, id)
  if (!existing) throw new ExportTemplateNotFoundError()

  validateEnums(input.targetSystem, input.encoding, input.lineEnding)
  if (input.templateBody !== undefined) {
    validateTemplateBody(input.templateBody)
  }
  if (input.name !== undefined && input.name.trim().length === 0) {
    throw new ExportTemplateValidationError("Name is required")
  }

  // If template body changed → archive previous version, bump counter.
  const bodyChanged =
    input.templateBody !== undefined &&
    input.templateBody !== existing.templateBody

  if (bodyChanged) {
    await repo.archiveVersion(
      prisma,
      existing.id,
      existing.version,
      existing.templateBody,
      audit?.userId ?? null,
    )
  }

  const data: Record<string, unknown> = { updatedBy: audit?.userId ?? null }
  if (input.name !== undefined) data.name = input.name.trim()
  if (input.description !== undefined) data.description = input.description
  if (input.targetSystem !== undefined) data.targetSystem = input.targetSystem
  if (input.templateBody !== undefined) data.templateBody = input.templateBody
  if (input.outputFilename !== undefined)
    data.outputFilename = input.outputFilename
  if (input.encoding !== undefined) data.encoding = input.encoding
  if (input.lineEnding !== undefined) data.lineEnding = input.lineEnding
  if (input.fieldSeparator !== undefined)
    data.fieldSeparator = input.fieldSeparator
  if (input.decimalSeparator !== undefined)
    data.decimalSeparator = input.decimalSeparator
  if (input.dateFormat !== undefined) data.dateFormat = input.dateFormat
  if (input.isActive !== undefined) data.isActive = input.isActive
  if (bodyChanged) data.version = existing.version + 1

  let updated
  try {
    updated = await repo.update(prisma, tenantId, id, data)
  } catch (err) {
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code: string }).code === "P2002"
    ) {
      throw new ExportTemplateConflictError(
        `Export template with name "${input.name}" already exists`,
      )
    }
    throw err
  }
  if (!updated) throw new ExportTemplateNotFoundError()

  if (audit) {
    await auditLog
      .log(prisma, {
        tenantId,
        userId: audit.userId,
        action: "update",
        entityType: "export_template",
        entityId: updated.id,
        entityName: updated.name,
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
      })
      .catch((err) => console.error("[AuditLog] Failed:", err))
  }

  return updated
}

export async function remove(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  audit?: AuditContext,
) {
  const existing = await repo.findById(prisma, tenantId, id)
  if (!existing) throw new ExportTemplateNotFoundError()

  await repo.remove(prisma, tenantId, id)

  if (audit) {
    await auditLog
      .log(prisma, {
        tenantId,
        userId: audit.userId,
        action: "delete",
        entityType: "export_template",
        entityId: id,
        entityName: existing.name,
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
      })
      .catch((err) => console.error("[AuditLog] Failed:", err))
  }

  return { success: true }
}
