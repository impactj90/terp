/**
 * Demo convert-request service.
 *
 * CRUD for the `demo_convert_requests` inbox table. Writes from
 * `demo-tenant-service.requestConvertFromExpired` (insert) and from the
 * platform-admin inbox UI (list / resolve / dismiss).
 *
 * resolve/dismiss are pure status flips — no coupled side effects. The
 * operator navigates to `/platform/tenants/demo?highlight=<tenantId>` to
 * perform the actual convert/extend manually.
 */
import type { PrismaClient } from "@/generated/prisma/client"

export class DemoConvertRequestNotFoundError extends Error {
  constructor(id: string) {
    super(`Demo convert request not found: ${id}`)
    this.name = "DemoConvertRequestNotFoundError"
  }
}

export class DemoConvertRequestConflictError extends Error {
  constructor(status: string) {
    super(`Demo convert request is already ${status}`)
    this.name = "DemoConvertRequestConflictError"
  }
}

export type DemoConvertRequestStatus = "pending" | "resolved" | "dismissed"

export async function create(
  prisma: PrismaClient,
  input: { tenantId: string; requestedByUserId: string },
): Promise<{ id: string }> {
  const row = await prisma.demoConvertRequest.create({
    data: {
      tenantId: input.tenantId,
      requestedByUserId: input.requestedByUserId,
      status: "pending",
    },
    select: { id: true },
  })
  return row
}

export async function list(
  prisma: PrismaClient,
  params: {
    status?: DemoConvertRequestStatus
    page?: number
    pageSize?: number
  },
) {
  const page = params.page ?? 1
  const pageSize = params.pageSize ?? 20
  const where = params.status ? { status: params.status } : {}

  const [rows, total] = await Promise.all([
    prisma.demoConvertRequest.findMany({
      where,
      orderBy: { requestedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.demoConvertRequest.count({ where }),
  ])

  // Batch-fetch tenant info for display
  const tenantIds = Array.from(new Set(rows.map((r) => r.tenantId)))
  const tenants = tenantIds.length
    ? await prisma.tenant.findMany({
        where: { id: { in: tenantIds } },
        select: {
          id: true,
          name: true,
          slug: true,
          isDemo: true,
          demoExpiresAt: true,
        },
      })
    : []
  const byTenantId = new Map(tenants.map((t) => [t.id, t]))

  // Batch-fetch resolver info
  const resolverIds = Array.from(
    new Set(
      rows
        .map((r) => r.resolvedByPlatformUserId)
        .filter((id): id is string => id !== null),
    ),
  )
  const resolvers = resolverIds.length
    ? await prisma.platformUser.findMany({
        where: { id: { in: resolverIds } },
        select: { id: true, displayName: true, email: true },
      })
    : []
  const byResolverId = new Map(resolvers.map((u) => [u.id, u]))

  return {
    items: rows.map((r) => ({
      ...r,
      tenant: byTenantId.get(r.tenantId) ?? null,
      resolvedBy: r.resolvedByPlatformUserId
        ? byResolverId.get(r.resolvedByPlatformUserId) ?? null
        : null,
    })),
    total,
    page,
    pageSize,
  }
}

export async function resolve(
  prisma: PrismaClient,
  input: { id: string; note?: string | null },
  platformUserId: string,
): Promise<void> {
  const existing = await prisma.demoConvertRequest.findUnique({
    where: { id: input.id },
  })
  if (!existing) throw new DemoConvertRequestNotFoundError(input.id)
  if (existing.status !== "pending") {
    throw new DemoConvertRequestConflictError(existing.status)
  }
  await prisma.demoConvertRequest.update({
    where: { id: input.id },
    data: {
      status: "resolved",
      resolvedByPlatformUserId: platformUserId,
      resolvedAt: new Date(),
      resolutionNote: input.note ?? null,
    },
  })
}

export async function dismiss(
  prisma: PrismaClient,
  input: { id: string; note?: string | null },
  platformUserId: string,
): Promise<void> {
  const existing = await prisma.demoConvertRequest.findUnique({
    where: { id: input.id },
  })
  if (!existing) throw new DemoConvertRequestNotFoundError(input.id)
  if (existing.status !== "pending") {
    throw new DemoConvertRequestConflictError(existing.status)
  }
  await prisma.demoConvertRequest.update({
    where: { id: input.id },
    data: {
      status: "dismissed",
      resolvedByPlatformUserId: platformUserId,
      resolvedAt: new Date(),
      resolutionNote: input.note ?? null,
    },
  })
}

export async function countPending(prisma: PrismaClient): Promise<number> {
  return prisma.demoConvertRequest.count({ where: { status: "pending" } })
}
