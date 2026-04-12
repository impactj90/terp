/**
 * System Export Template Service (Phase 3)
 *
 * Read-only access to the global standard-template catalogue + a
 * copy-to-tenant operation that materialises a chosen system template
 * as a regular, editable per-tenant `ExportTemplate`.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import * as repo from "./system-export-template-repository"
import * as templateService from "./export-template-service"
import type { AuditContext } from "./audit-logs-service"

export class SystemExportTemplateNotFoundError extends Error {
  constructor() {
    super("System export template not found")
    this.name = "SystemExportTemplateNotFoundError"
  }
}

export async function list(prisma: PrismaClient) {
  return repo.listAll(prisma)
}

export async function getById(prisma: PrismaClient, id: string) {
  const tpl = await repo.findById(prisma, id)
  if (!tpl) throw new SystemExportTemplateNotFoundError()
  return tpl
}

/**
 * Copies a system template into the tenant's own export_templates.
 * A suffix `(Kopie)` is appended if a template with the same name
 * already exists for the tenant — same scheme OS dialogs use.
 *
 * Returns the newly created tenant template.
 */
export async function copyToTenant(
  prisma: PrismaClient,
  tenantId: string,
  systemTemplateId: string,
  audit?: AuditContext,
  opts?: { nameOverride?: string },
) {
  const source = await getById(prisma, systemTemplateId)

  let name = opts?.nameOverride?.trim() || source.name
  const existing = await prisma.exportTemplate.findFirst({
    where: { tenantId, name },
    select: { id: true },
  })
  if (existing) {
    // Find an available suffix: "(Kopie)", "(Kopie 2)", "(Kopie 3)", ...
    let suffix = 1
    let candidate = `${name} (Kopie)`
    while (
      await prisma.exportTemplate.findFirst({
        where: { tenantId, name: candidate },
        select: { id: true },
      })
    ) {
      suffix += 1
      candidate = `${name} (Kopie ${suffix})`
    }
    name = candidate
  }

  return templateService.create(
    prisma,
    tenantId,
    {
      name,
      description: source.description ?? undefined,
      targetSystem: source.targetSystem,
      templateBody: source.templateBody,
      outputFilename: source.outputFilename,
      encoding: source.encoding,
      lineEnding: source.lineEnding,
      fieldSeparator: source.fieldSeparator,
      decimalSeparator: source.decimalSeparator,
      dateFormat: source.dateFormat,
      isActive: true,
    },
    audit,
  )
}
