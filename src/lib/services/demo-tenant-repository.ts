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
  /**
   * Parallel column — platform operator who created the demo. All new
   * platform-initiated creates set this; the legacy `demoCreatedById`
   * (tenant-user FK) is always left at its default NULL.
   */
  demoCreatedByPlatformUserId: string | null
  demoNotes: string | null
}

export async function createDemoTenant(tx: Tx, data: CreateDemoTenantData) {
  // Note: legacy `demoCreatedById` is omitted entirely. Prisma's relation-
  // aware input for `@relation(fields: [demoCreatedById])` rejects the
  // scalar as an unknown argument — the relation `demoCreatedBy` is the
  // only settable surface. Since platform-initiated creates always leave
  // the legacy column NULL, we skip it and rely on the column default.
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
      demoCreatedByPlatformUserId: data.demoCreatedByPlatformUserId,
      demoNotes: data.demoNotes,
    },
  })
}

export type PlatformCreatorMini = {
  id: string
  displayName: string
  email: string
}

export type DemoWithCreators = Awaited<
  ReturnType<typeof findDemosRaw>
>[number] & {
  demoCreatedByPlatformUser: PlatformCreatorMini | null
}

async function findDemosRaw(prisma: PrismaClient) {
  return prisma.tenant.findMany({
    where: { isDemo: true },
    orderBy: { createdAt: "desc" },
    include: {
      demoCreatedBy: {
        select: { id: true, email: true, displayName: true },
      },
    },
  })
}

/**
 * Returns ALL demo tenants (active + expired) with creator info merged from
 * both the legacy `demoCreatedBy` (tenant user) relation AND a batched
 * lookup of platform users for the `demoCreatedByPlatformUserId` column.
 *
 * Mirrors the manual-join pattern used in
 * `platform/routers/tenantManagement.listModules` at lines 410–425.
 */
export async function findDemos(
  prisma: PrismaClient,
): Promise<DemoWithCreators[]> {
  const demos = await findDemosRaw(prisma)

  const platformIds = Array.from(
    new Set(
      demos
        .map((d) => d.demoCreatedByPlatformUserId)
        .filter((id): id is string => id !== null),
    ),
  )
  const platformUsers =
    platformIds.length > 0
      ? await prisma.platformUser.findMany({
          where: { id: { in: platformIds } },
          select: { id: true, displayName: true, email: true },
        })
      : []
  const byPlatformId = new Map(platformUsers.map((u) => [u.id, u]))

  return demos.map((d) => ({
    ...d,
    demoCreatedByPlatformUser: d.demoCreatedByPlatformUserId
      ? byPlatformId.get(d.demoCreatedByPlatformUserId) ?? null
      : null,
  }))
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
  // For the legacy `demoCreatedBy` relation, use `disconnect` instead of
  // `demoCreatedById: null` — Prisma's relation-aware input rejects the
  // scalar directly. For `demoCreatedByPlatformUserId` (no @relation), the
  // plain scalar-null assignment works.
  return tx.tenant.update({
    where: { id: tenantId },
    data: {
      isDemo: false,
      demoExpiresAt: null,
      demoTemplate: null,
      demoCreatedBy: { disconnect: true },
      demoCreatedByPlatformUserId: null,
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
