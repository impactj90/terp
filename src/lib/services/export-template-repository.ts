/**
 * Export Template Repository (Phase 2)
 *
 * Pure Prisma data access for export templates and version history.
 */
import type { PrismaClient, Prisma } from "@/generated/prisma/client"

export async function listForTenant(prisma: PrismaClient, tenantId: string) {
  return prisma.exportTemplate.findMany({
    where: { tenantId },
    orderBy: [{ name: "asc" }],
  })
}

export async function findById(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
) {
  return prisma.exportTemplate.findFirst({ where: { id, tenantId } })
}

export async function create(
  prisma: PrismaClient,
  data: Prisma.ExportTemplateUncheckedCreateInput,
) {
  return prisma.exportTemplate.create({ data })
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Prisma.ExportTemplateUpdateInput,
) {
  const { count } = await prisma.exportTemplate.updateMany({
    where: { id, tenantId },
    data,
  })
  if (count === 0) return null
  return prisma.exportTemplate.findUnique({ where: { id } })
}

export async function remove(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
) {
  const { count } = await prisma.exportTemplate.deleteMany({
    where: { id, tenantId },
  })
  return count > 0
}

export async function archiveVersion(
  prisma: PrismaClient,
  templateId: string,
  version: number,
  templateBody: string,
  changedBy: string | null,
) {
  return prisma.exportTemplateVersion.create({
    data: { templateId, version, templateBody, changedBy },
  })
}

export async function listVersions(prisma: PrismaClient, templateId: string) {
  return prisma.exportTemplateVersion.findMany({
    where: { templateId },
    orderBy: { version: "desc" },
  })
}

export async function findVersion(
  prisma: PrismaClient,
  templateId: string,
  version: number,
) {
  return prisma.exportTemplateVersion.findUnique({
    where: { templateId_version: { templateId, version } },
  })
}
