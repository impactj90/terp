import type { PrismaClient } from "@/generated/prisma/client"
import * as repo from "./email-template-repository"
import * as auditLog from "./audit-logs-service"
import type { AuditContext } from "./audit-logs-service"
import { getDefaultTemplate } from "@/lib/email/default-templates"
import { resolvePlaceholders, type PlaceholderContext } from "./email-placeholder-resolver"

// --- Error Classes ---

export class EmailTemplateNotFoundError extends Error {
  constructor(message = "Email template not found") {
    super(message)
    this.name = "EmailTemplateNotFoundError"
  }
}

// --- Service Functions ---

export async function list(
  prisma: PrismaClient,
  tenantId: string,
  documentType?: string
) {
  return repo.findMany(prisma, tenantId, documentType)
}

export async function getById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  const template = await repo.findById(prisma, tenantId, id)
  if (!template) throw new EmailTemplateNotFoundError()
  return template
}

export async function getDefault(
  prisma: PrismaClient,
  tenantId: string,
  documentType: string
) {
  // Try DB first
  const dbTemplate = await repo.findDefault(prisma, tenantId, documentType)
  if (dbTemplate) return dbTemplate

  // Fall back to code-level default
  const fallback = getDefaultTemplate(documentType)
  if (!fallback) return null

  return {
    id: null as string | null,
    tenantId,
    documentType: fallback.documentType,
    name: fallback.name,
    subject: fallback.subject,
    bodyHtml: fallback.bodyHtml,
    isDefault: true,
    createdAt: null as Date | null,
    updatedAt: null as Date | null,
  }
}

export async function create(
  prisma: PrismaClient,
  tenantId: string,
  data: {
    documentType: string
    name: string
    subject: string
    bodyHtml: string
    isDefault?: boolean
  },
  audit?: AuditContext
) {
  const result = await repo.create(prisma, tenantId, data)

  if (audit) {
    await auditLog
      .log(prisma, {
        tenantId,
        userId: audit.userId,
        action: "create",
        entityType: "email_template",
        entityId: result.id,
        entityName: result.name,
        changes: null,
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
      })
      .catch((err) => console.error("[AuditLog] Failed:", err))
  }

  return result
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: {
    name?: string
    subject?: string
    bodyHtml?: string
    isDefault?: boolean
    documentType?: string
  },
  audit?: AuditContext
) {
  const result = await repo.update(prisma, tenantId, id, data)
  if (!result) throw new EmailTemplateNotFoundError()

  if (audit) {
    await auditLog
      .log(prisma, {
        tenantId,
        userId: audit.userId,
        action: "update",
        entityType: "email_template",
        entityId: result.id,
        entityName: result.name,
        changes: null,
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
      })
      .catch((err) => console.error("[AuditLog] Failed:", err))
  }

  return result
}

export async function remove(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  audit?: AuditContext
) {
  const result = await repo.remove(prisma, tenantId, id)
  if (!result) throw new EmailTemplateNotFoundError()

  if (audit) {
    await auditLog
      .log(prisma, {
        tenantId,
        userId: audit.userId,
        action: "delete",
        entityType: "email_template",
        entityId: result.id,
        entityName: result.name,
        changes: null,
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
      })
      .catch((err) => console.error("[AuditLog] Failed:", err))
  }

  return result
}

export async function seedDefaults(
  prisma: PrismaClient,
  tenantId: string
) {
  const { getAllDocumentTypes, getDefaultTemplate } = await import("@/lib/email/default-templates")
  const allTypes = getAllDocumentTypes()

  const created: Array<{ documentType: string; name: string }> = []

  for (const docType of allTypes) {
    // Skip if tenant already has a template for this type
    const existing = await repo.findMany(prisma, tenantId, docType)
    if (existing.length > 0) continue

    const fallback = getDefaultTemplate(docType)
    if (!fallback) continue

    await repo.create(prisma, tenantId, {
      documentType: fallback.documentType,
      name: fallback.name,
      subject: fallback.subject,
      bodyHtml: fallback.bodyHtml,
      isDefault: true,
    })
    created.push({ documentType: fallback.documentType, name: fallback.name })
  }

  return { created, count: created.length }
}

export function resolveTemplatePlaceholders(
  subject: string,
  bodyHtml: string,
  context: PlaceholderContext
) {
  return {
    subject: resolvePlaceholders(subject, context),
    bodyHtml: resolvePlaceholders(bodyHtml, context),
  }
}
