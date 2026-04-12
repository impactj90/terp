/**
 * Tenant Module Repository
 *
 * Pure Prisma queries for the tenant_modules table.
 * Follows the repository pattern used throughout src/lib/services/.
 */
import type { PrismaClient } from "@/generated/prisma/client"

export async function findByTenant(prisma: PrismaClient, tenantId: string) {
  return prisma.tenantModule.findMany({
    where: { tenantId },
    select: { module: true, enabledAt: true },
    orderBy: { enabledAt: "asc" },
  })
}

export async function findByTenantAndModule(
  prisma: PrismaClient,
  tenantId: string,
  module: string
) {
  return prisma.tenantModule.findUnique({
    where: { tenantId_module: { tenantId, module } },
  })
}

export async function create(
  prisma: PrismaClient,
  tenantId: string,
  module: string,
  enabledById?: string
) {
  return prisma.tenantModule.upsert({
    where: { tenantId_module: { tenantId, module } },
    update: {},
    create: { tenantId, module, enabledById },
  })
}

export async function remove(
  prisma: PrismaClient,
  tenantId: string,
  module: string
) {
  return prisma.tenantModule.deleteMany({
    where: { tenantId, module },
  })
}
