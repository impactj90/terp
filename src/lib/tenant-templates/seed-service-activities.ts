import type { Prisma, PrismaClient } from "@/generated/prisma/client"

type Tx = PrismaClient | Prisma.TransactionClient

/**
 * Optional seed helper that upserts the four baseline service activities
 * (WARTUNG / REPARATUR / INSPEKTION / STÖRUNG) that maintenance-plan-driven
 * orders typically book against.
 *
 * NOT auto-invoked by `seedUniversalDefaults`. Operators call this manually
 * for Pro-Di-style service-delivery tenants; a future branch-profile
 * ticket will wire it into the template registry.
 *
 * Plan: 2026-04-22-serviceobjekte-wartungsintervalle.md
 */
export async function seedServiceActivities(
  prisma: Tx,
  tenantId: string,
): Promise<void> {
  const activities = [
    { code: "WARTUNG", name: "Wartung" },
    { code: "REPARATUR", name: "Reparatur" },
    { code: "INSPEKTION", name: "Inspektion" },
    { code: "STÖRUNG", name: "Störungsbehebung" },
  ] as const

  for (const a of activities) {
    await prisma.activity.upsert({
      where: { tenantId_code: { tenantId, code: a.code } },
      create: { ...a, tenantId, isActive: true },
      update: {},
    })
  }
}
