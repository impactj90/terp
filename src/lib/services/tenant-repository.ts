/**
 * Tenant Repository
 *
 * Pure Prisma data-access functions for the Tenant model.
 */
import type { PrismaClient } from "@/generated/prisma/client"

export async function findTenantsForUser(
  prisma: PrismaClient,
  userId: string
) {
  const userTenants = await prisma.userTenant.findMany({
    where: { userId },
    include: { tenant: true },
  })
  return userTenants.map((ut) => ut.tenant)
}

export async function findById(prisma: PrismaClient, id: string) {
  return prisma.tenant.findUnique({
    where: { id },
  })
}

export async function findBySlug(prisma: PrismaClient, slug: string) {
  return prisma.tenant.findUnique({
    where: { slug },
  })
}

export async function create(
  prisma: PrismaClient,
  data: {
    name: string
    slug: string
    addressStreet: string
    addressZip: string
    addressCity: string
    addressCountry: string
    phone: string | null
    email: string | null
    payrollExportBasePath: string | null
    notes: string | null
    vacationBasis: string
    isActive: boolean
  }
) {
  return prisma.tenant.create({ data })
}

export async function update(
  prisma: PrismaClient,
  id: string,
  data: Record<string, unknown>
) {
  return prisma.tenant.update({
    where: { id },
    data,
  })
}

export async function upsertUserTenant(
  prisma: PrismaClient,
  userId: string,
  tenantId: string,
  role: string
) {
  return prisma.userTenant.upsert({
    where: {
      userId_tenantId: {
        userId,
        tenantId,
      },
    },
    create: {
      userId,
      tenantId,
      role,
    },
    update: {},
  })
}
