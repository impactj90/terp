/**
 * Export Template Snapshot Repository (Phase 4.2)
 *
 * Pure Prisma data access for template snapshots (golden-file tests).
 */
import type { PrismaClient, Prisma } from "@/generated/prisma/client"

export async function listForTemplate(
  prisma: PrismaClient,
  tenantId: string,
  templateId: string,
) {
  return prisma.exportTemplateSnapshot.findMany({
    where: { tenantId, templateId },
    orderBy: [{ createdAt: "asc" }],
  })
}

export async function listForTenant(prisma: PrismaClient, tenantId: string) {
  return prisma.exportTemplateSnapshot.findMany({
    where: { tenantId },
    include: {
      template: { select: { id: true, name: true } },
    },
    orderBy: [{ createdAt: "asc" }],
  })
}

export async function findById(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
) {
  return prisma.exportTemplateSnapshot.findFirst({
    where: { id, tenantId },
  })
}

export async function create(
  prisma: PrismaClient,
  data: Prisma.ExportTemplateSnapshotUncheckedCreateInput,
) {
  return prisma.exportTemplateSnapshot.create({ data })
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Prisma.ExportTemplateSnapshotUncheckedUpdateInput,
) {
  const { count } = await prisma.exportTemplateSnapshot.updateMany({
    where: { id, tenantId },
    data,
  })
  if (count === 0) return null
  return prisma.exportTemplateSnapshot.findUnique({ where: { id } })
}

export async function remove(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
) {
  const { count } = await prisma.exportTemplateSnapshot.deleteMany({
    where: { id, tenantId },
  })
  return count > 0
}
