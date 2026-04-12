import type { PrismaClient, BillingDocumentType } from "@/generated/prisma/client"
import * as repo from "./billing-document-template-repository"
import * as auditLog from "./audit-logs-service"
import type { AuditContext } from "./audit-logs-service"

// --- Audit ---

const TRACKED_FIELDS = [
  "name",
  "documentType",
  "headerText",
  "footerText",
  "isDefault",
]

// --- Error Classes ---

export class BillingDocumentTemplateNotFoundError extends Error {
  constructor(message = "Billing document template not found") {
    super(message)
    this.name = "BillingDocumentTemplateNotFoundError"
  }
}

export class BillingDocumentTemplateValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "BillingDocumentTemplateValidationError"
  }
}

// --- Service Functions ---

export async function list(
  prisma: PrismaClient,
  tenantId: string
) {
  return repo.findMany(prisma, tenantId)
}

export async function getById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  const template = await repo.findById(prisma, tenantId, id)
  if (!template) throw new BillingDocumentTemplateNotFoundError()
  return template
}

export async function listByType(
  prisma: PrismaClient,
  tenantId: string,
  documentType: BillingDocumentType
) {
  return repo.findByType(prisma, tenantId, documentType)
}

export async function getDefault(
  prisma: PrismaClient,
  tenantId: string,
  documentType: BillingDocumentType
) {
  return repo.findDefault(prisma, tenantId, documentType)
}

export async function create(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    name: string
    documentType?: BillingDocumentType | null
    headerText?: string | null
    footerText?: string | null
    isDefault?: boolean
  },
  createdById: string,
  audit?: AuditContext
) {
  if (!input.name.trim()) {
    throw new BillingDocumentTemplateValidationError("Template name is required")
  }

  // If setting as default, clear existing default for this type
  if (input.isDefault && input.documentType) {
    await repo.clearDefault(prisma, tenantId, input.documentType)
  }

  const created = await repo.create(prisma, {
    tenantId,
    name: input.name.trim(),
    documentType: input.documentType ?? null,
    headerText: input.headerText ?? null,
    footerText: input.footerText ?? null,
    isDefault: input.isDefault ?? false,
    createdById,
  })

  if (audit) {
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "create",
      entityType: "billing_document_template",
      entityId: created.id,
      entityName: created.name ?? null,
      changes: null,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  return created
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  input: {
    name?: string
    documentType?: BillingDocumentType | null
    headerText?: string | null
    footerText?: string | null
    isDefault?: boolean
  },
  audit?: AuditContext
) {
  const existing = await repo.findById(prisma, tenantId, id)
  if (!existing) throw new BillingDocumentTemplateNotFoundError()

  if (input.name !== undefined && !input.name.trim()) {
    throw new BillingDocumentTemplateValidationError("Template name is required")
  }

  // If setting as default, clear existing default for the target type
  if (input.isDefault) {
    const targetType = input.documentType !== undefined ? input.documentType : existing.documentType
    if (targetType) {
      await repo.clearDefault(prisma, tenantId, targetType)
    }
  }

  const data: Record<string, unknown> = {}
  if (input.name !== undefined) data.name = input.name.trim()
  if (input.documentType !== undefined) data.documentType = input.documentType
  if (input.headerText !== undefined) data.headerText = input.headerText
  if (input.footerText !== undefined) data.footerText = input.footerText
  if (input.isDefault !== undefined) data.isDefault = input.isDefault

  if (Object.keys(data).length === 0) return existing

  const updated = await repo.update(prisma, tenantId, id, data)

  if (audit) {
    const changes = auditLog.computeChanges(
      existing as unknown as Record<string, unknown>,
      updated as unknown as Record<string, unknown>,
      TRACKED_FIELDS
    )
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "update",
      entityType: "billing_document_template",
      entityId: id,
      entityName: (updated as unknown as Record<string, unknown>).name as string ?? null,
      changes,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  return updated
}

export async function remove(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  audit?: AuditContext
) {
  const existing = await repo.findById(prisma, tenantId, id)
  if (!existing) throw new BillingDocumentTemplateNotFoundError()

  const deleted = await repo.remove(prisma, tenantId, id)
  if (!deleted) throw new BillingDocumentTemplateNotFoundError()

  if (audit) {
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "delete",
      entityType: "billing_document_template",
      entityId: id,
      entityName: existing.name ?? null,
      changes: null,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }
}

export async function setDefault(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  const existing = await repo.findById(prisma, tenantId, id)
  if (!existing) throw new BillingDocumentTemplateNotFoundError()

  if (!existing.documentType) {
    throw new BillingDocumentTemplateValidationError(
      "Cannot set a generic template (no document type) as default"
    )
  }

  // Clear existing default for this type
  await repo.clearDefault(prisma, tenantId, existing.documentType)

  // Set this template as default
  return repo.update(prisma, tenantId, id, { isDefault: true })
}
