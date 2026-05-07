/**
 * NK-1 Migration Script — Employee.salaryGroup → wageGroupId
 *
 * Per Decision 2: bestehende `Employee.salaryGroup`-Freitext-Werte
 * werden via One-Off-Script gemappt — pro distinct `salaryGroup`-Wert
 * pro Tenant ein WageGroup-Eintrag mit Default-Sätzen, dann
 * `Employee.wageGroupId` gesetzt; nicht-zuordbare bleiben NULL.
 *
 * Idempotent:
 * - Skips employees that already have wageGroupId set
 * - WageGroup is upserted (no duplicates on retry)
 *
 * `Employee.salaryGroup` wird NICHT gelöscht — wird in DATEV-Export-
 * Templates verwendet.
 *
 * Run: pnpm tsx src/scripts/migrate-employee-salary-group-to-wage-group.ts
 */
import { prisma } from "@/lib/db/prisma"
import type { PrismaClient } from "@/generated/prisma/client"

interface TenantStats {
  tenantId: string
  wageGroupsCreated: number
  employeesAssigned: number
  employeesSkipped: number
}

export async function migrateEmployeeSalaryGroupToWageGroup(
  client: PrismaClient = prisma,
): Promise<TenantStats[]> {
  // 1. Find all distinct (tenantId, salaryGroup) tuples for employees that
  //    need migration (have salaryGroup set, do not have wageGroupId yet).
  const distinctRows = await client.$queryRaw<
    Array<{ tenant_id: string; salary_group: string }>
  >`
    SELECT DISTINCT tenant_id, salary_group
    FROM employees
    WHERE salary_group IS NOT NULL
      AND wage_group_id IS NULL
    ORDER BY tenant_id, salary_group
  `

  // Group by tenant
  const byTenant = new Map<string, string[]>()
  for (const row of distinctRows) {
    const list = byTenant.get(row.tenant_id) ?? []
    list.push(row.salary_group)
    byTenant.set(row.tenant_id, list)
  }

  const stats: TenantStats[] = []

  for (const [tenantId, groups] of byTenant.entries()) {
    let wageGroupsCreated = 0
    let employeesAssigned = 0
    let employeesSkipped = 0
    let sortOrder = 0

    for (const salaryGroup of groups) {
      // Skip empty/whitespace-only salary groups
      if (!salaryGroup || salaryGroup.trim().length === 0) continue

      const code = salaryGroup.trim()
      sortOrder += 10

      // Upsert WageGroup
      const wg = await client.wageGroup.upsert({
        where: {
          tenantId_code: { tenantId, code },
        } as never,
        update: {},
        create: {
          tenantId,
          code,
          name: code,
          internalHourlyRate: null,
          billingHourlyRate: null,
          sortOrder,
          isActive: true,
        },
      })
      wageGroupsCreated++

      // Assign employees referencing this salaryGroup
      const updateResult = await client.employee.updateMany({
        where: {
          tenantId,
          salaryGroup: code,
          wageGroupId: null,
        },
        data: { wageGroupId: wg.id },
      })
      employeesAssigned += updateResult.count
    }

    // Count skipped (employees in this tenant with NULL salaryGroup OR
    // already-assigned wageGroupId from previous run).
    employeesSkipped = await client.employee.count({
      where: {
        tenantId,
        OR: [{ salaryGroup: null }, { salaryGroup: "" }],
      },
    })

    stats.push({
      tenantId,
      wageGroupsCreated,
      employeesAssigned,
      employeesSkipped,
    })
  }

  return stats
}

if (require.main === module) {
  migrateEmployeeSalaryGroupToWageGroup()
    .then((stats) => {
      let totalCreated = 0
      let totalAssigned = 0
      console.log("[NK-1] Employee.salaryGroup → wageGroupId migration complete")
      for (const s of stats) {
        console.log(
          `  Tenant ${s.tenantId}: ${s.wageGroupsCreated} wage groups created, ${s.employeesAssigned} employees assigned, ${s.employeesSkipped} skipped (no salaryGroup)`,
        )
        totalCreated += s.wageGroupsCreated
        totalAssigned += s.employeesAssigned
      }
      console.log(
        `Total: ${totalCreated} wage groups, ${totalAssigned} employees assigned`,
      )
      process.exit(0)
    })
    .catch((err) => {
      console.error("[NK-1] Migration failed:", err)
      process.exit(1)
    })
}
