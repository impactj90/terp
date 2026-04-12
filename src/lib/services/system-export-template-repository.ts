/**
 * System Export Template Repository (Phase 3)
 *
 * Pure Prisma data access for the global, read-only standard templates.
 */
import type { PrismaClient } from "@/generated/prisma/client"

export async function listAll(prisma: PrismaClient) {
  return prisma.systemExportTemplate.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  })
}

export async function findById(prisma: PrismaClient, id: string) {
  return prisma.systemExportTemplate.findUnique({ where: { id } })
}
