/**
 * Export Template Schedule Repository (Phase 4.4)
 *
 * Pure Prisma data access for cron-driven export schedules.
 */
import type { PrismaClient, Prisma } from "@/generated/prisma/client"

export async function listForTenant(prisma: PrismaClient, tenantId: string) {
  return prisma.exportTemplateSchedule.findMany({
    where: { tenantId },
    include: { template: { select: { id: true, name: true } } },
    orderBy: [{ name: "asc" }],
  })
}

export async function findById(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
) {
  return prisma.exportTemplateSchedule.findFirst({ where: { id, tenantId } })
}

export async function create(
  prisma: PrismaClient,
  data: Prisma.ExportTemplateScheduleUncheckedCreateInput,
) {
  return prisma.exportTemplateSchedule.create({ data })
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Prisma.ExportTemplateScheduleUncheckedUpdateInput,
) {
  const { count } = await prisma.exportTemplateSchedule.updateMany({
    where: { id, tenantId },
    data,
  })
  if (count === 0) return null
  return prisma.exportTemplateSchedule.findUnique({ where: { id } })
}

export async function remove(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
) {
  const { count } = await prisma.exportTemplateSchedule.deleteMany({
    where: { id, tenantId },
  })
  return count > 0
}

/**
 * Returns all active schedules whose `next_run_at` is at or before the
 * supplied instant. Used by the cron route.
 */
export async function findDue(prisma: PrismaClient, now: Date) {
  return prisma.exportTemplateSchedule.findMany({
    where: {
      isActive: true,
      nextRunAt: { lte: now },
    },
    include: {
      template: true,
    },
    orderBy: { nextRunAt: "asc" },
  })
}
