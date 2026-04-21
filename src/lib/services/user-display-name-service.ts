/**
 * User Display Name Service
 *
 * Batch-resolves user display names for UUID-only FK columns that have
 * no Prisma @relation (e.g., WhStockMovement.createdById,
 * OrderBooking.createdBy). Tenant-scoped and deduplicated.
 *
 * Note: The User model has a single `displayName` column (+ `email`).
 * Fallback chain: displayName → email → "Unbekannt".
 */
import type { PrismaClient } from "@/generated/prisma/client"

export type UserDisplay = {
  userId: string
  email: string
  displayName: string
}

function buildDisplayName(u: { displayName: string | null; email: string }): string {
  const name = (u.displayName ?? "").trim()
  if (name.length > 0) return name
  if (u.email && u.email.trim().length > 0) return u.email
  return "Unbekannt"
}

export async function resolveMany(
  prisma: PrismaClient,
  tenantId: string,
  userIds: string[]
): Promise<Map<string, UserDisplay>> {
  const ids = Array.from(new Set(userIds.filter((x): x is string => !!x)))
  const map = new Map<string, UserDisplay>()
  if (ids.length === 0) return map

  const users = await prisma.user.findMany({
    where: { id: { in: ids }, tenantId },
    select: { id: true, displayName: true, email: true },
  })
  for (const u of users) {
    map.set(u.id, {
      userId: u.id,
      email: u.email,
      displayName: buildDisplayName(u),
    })
  }
  return map
}
