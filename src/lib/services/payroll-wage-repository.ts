/**
 * Payroll Wage Repository
 *
 * Pure Prisma query functions for default and tenant-specific
 * payroll wage code (Lohnart) data access.
 */
import type { PrismaClient, Prisma } from "@/generated/prisma/client"

export async function listDefaults(prisma: PrismaClient) {
  return prisma.defaultPayrollWage.findMany({
    orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
  })
}

export async function listForTenant(prisma: PrismaClient, tenantId: string) {
  return prisma.tenantPayrollWage.findMany({
    where: { tenantId },
    orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
  })
}

export async function findByCode(
  prisma: PrismaClient,
  tenantId: string,
  code: string,
) {
  return prisma.tenantPayrollWage.findUnique({
    where: { tenantId_code: { tenantId, code } },
  })
}

export async function findById(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
) {
  return prisma.tenantPayrollWage.findFirst({
    where: { id, tenantId },
  })
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Prisma.TenantPayrollWageUpdateInput,
) {
  const { count } = await prisma.tenantPayrollWage.updateMany({
    where: { id, tenantId },
    data,
  })
  if (count === 0) return null
  return prisma.tenantPayrollWage.findUnique({ where: { id } })
}

export async function copyDefaultsToTenant(
  prisma: PrismaClient,
  tenantId: string,
): Promise<number> {
  const defaults = await prisma.defaultPayrollWage.findMany()
  if (defaults.length === 0) return 0

  // Skip those that already exist for this tenant
  const existing = await prisma.tenantPayrollWage.findMany({
    where: { tenantId },
    select: { code: true },
  })
  const existingCodes = new Set(existing.map((e) => e.code))

  const toInsert = defaults
    .filter((d) => !existingCodes.has(d.code))
    .map((d) => ({
      tenantId,
      code: d.code,
      name: d.name,
      terpSource: d.terpSource,
      category: d.category,
      description: d.description,
      sortOrder: d.sortOrder,
      isActive: true,
    }))

  if (toInsert.length === 0) return 0

  const result = await prisma.tenantPayrollWage.createMany({
    data: toInsert,
    skipDuplicates: true,
  })
  return result.count
}

export async function deleteAllForTenant(
  prisma: PrismaClient,
  tenantId: string,
): Promise<number> {
  const result = await prisma.tenantPayrollWage.deleteMany({
    where: { tenantId },
  })
  return result.count
}
