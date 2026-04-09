/**
 * Demo Tenant Repository
 *
 * Pure Prisma data-access functions for the demo-tenant flow.
 * See thoughts/shared/plans/2026-04-09-demo-tenant-system.md (Phase 3).
 */
import type { PrismaClient, Prisma } from "@/generated/prisma/client"

type Tx = PrismaClient | Prisma.TransactionClient

/**
 * Stable id of the system-wide "Demo Admin" user group.
 * Seeded once by migration 20260420100002_seed_demo_admin_group.sql.
 */
export const DEMO_ADMIN_GROUP_ID = "dd000000-0000-0000-0000-000000000001"

export interface CreateDemoTenantData {
  name: string
  slug: string
  addressStreet: string
  addressZip: string
  addressCity: string
  addressCountry: string
  notes: string | null
  demoExpiresAt: Date
  demoTemplate: string
  demoCreatedById: string
  demoNotes: string | null
}

export async function createDemoTenant(tx: Tx, data: CreateDemoTenantData) {
  return tx.tenant.create({
    data: {
      name: data.name,
      slug: data.slug,
      addressStreet: data.addressStreet,
      addressZip: data.addressZip,
      addressCity: data.addressCity,
      addressCountry: data.addressCountry,
      notes: data.notes,
      isActive: true,
      isDemo: true,
      demoExpiresAt: data.demoExpiresAt,
      demoTemplate: data.demoTemplate,
      demoCreatedById: data.demoCreatedById,
      demoNotes: data.demoNotes,
    },
  })
}

export async function findActiveDemos(prisma: PrismaClient) {
  return prisma.tenant.findMany({
    where: { isDemo: true, isActive: true },
    orderBy: { demoExpiresAt: "asc" },
    include: {
      demoCreatedBy: {
        select: { id: true, email: true, displayName: true },
      },
    },
  })
}

export async function findExpiredActiveDemos(
  prisma: PrismaClient,
  cutoff: Date,
) {
  return prisma.tenant.findMany({
    where: {
      isDemo: true,
      isActive: true,
      demoExpiresAt: { lt: cutoff },
    },
    select: { id: true, name: true, demoExpiresAt: true },
  })
}

export async function extendDemoExpiration(
  prisma: PrismaClient,
  tenantId: string,
  newExpiresAt: Date,
  reactivate: boolean,
) {
  return prisma.tenant.update({
    where: { id: tenantId },
    data: {
      demoExpiresAt: newExpiresAt,
      ...(reactivate ? { isActive: true } : {}),
    },
  })
}

export async function markDemoExpired(
  prisma: PrismaClient,
  tenantId: string,
  expiresAt?: Date,
) {
  return prisma.tenant.update({
    where: { id: tenantId },
    data: {
      isActive: false,
      ...(expiresAt ? { demoExpiresAt: expiresAt } : {}),
    },
  })
}

/** Convert: keep data — strip demo flags only. */
export async function convertDemoKeepData(tx: Tx, tenantId: string) {
  return tx.tenant.update({
    where: { id: tenantId },
    data: {
      isDemo: false,
      demoExpiresAt: null,
      demoTemplate: null,
      demoCreatedById: null,
      demoNotes: null,
    },
  })
}

/**
 * Resolves the system-wide "Demo Admin" user group. Throws a descriptive
 * error if the seed migration has not been applied.
 */
export async function findSystemDemoAdminGroup(tx: Tx) {
  const group = await tx.userGroup.findUnique({
    where: { id: DEMO_ADMIN_GROUP_ID },
  })
  if (!group) {
    throw new Error(
      "System 'Demo Admin' user group not found — migration 20260420100002_seed_demo_admin_group.sql has not been applied",
    )
  }
  return group
}
