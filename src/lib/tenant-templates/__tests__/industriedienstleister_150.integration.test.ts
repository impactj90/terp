/**
 * Integration test for the "industriedienstleister_150" demo template.
 *
 * Requires a reachable DATABASE_URL (local Supabase via `pnpm db:start`).
 * The test wraps the template apply in a transaction that it always rolls
 * back via a sentinel error, so no data is persisted.
 */

import { describe, expect, test } from "vitest"

import { prisma } from "@/lib/db/prisma"
import { industriedienstleisterShowcase } from "../templates/industriedienstleister/showcase"

const ROLLBACK_SENTINEL = "DEMO_TEMPLATE_TEST_ROLLBACK"

// Skip when no DATABASE_URL is configured — e.g. in environments that only
// run pure unit tests.
const HAS_DB = Boolean(process.env.DATABASE_URL)

describe.skipIf(!HAS_DB)("industriedienstleister_150 template", () => {
  test(
    "seeds expected counts inside a rollback transaction",
    async () => {
      const started = Date.now()

      type Counts = {
        departments: number
        employees: number
        bookingTypes: number
        absenceTypes: number
        holidays: number
        dayPlans: number
        weekPlans: number
        tariffs: number
        billingDocs: number
        articles: number
        employeeDayPlans: number
      }
      let counts: Counts | null = null

      await prisma
        .$transaction(
          async (tx) => {
            const tenant = await tx.tenant.create({
              data: {
                name: "Demo Template Test",
                slug: `demo-tpl-test-${Date.now()}`,
                isActive: true,
                isDemo: true,
                demoExpiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
                demoTemplate: industriedienstleisterShowcase.key,
              },
            })

            // Admin user isn't required by the template helpers themselves, but
            // the context contract asks for one — create a lightweight user row
            // that also rolls back.
            const adminUser = await tx.user.create({
              data: {
                email: `demo-admin-${Date.now()}@test.local`,
                username: `demo-admin-${Date.now()}`,
                displayName: "Demo Admin Test",
                role: "admin",
                isActive: true,
              },
            })

            const templateCtx = {
              tx,
              tenantId: tenant.id,
              adminUserId: adminUser.id,
            }
            const config = await industriedienstleisterShowcase.applyConfig(
              templateCtx,
            )
            await industriedienstleisterShowcase.applySeedData!(
              templateCtx,
              config,
            )

            counts = {
              departments: await tx.department.count({ where: { tenantId: tenant.id } }),
              employees: await tx.employee.count({ where: { tenantId: tenant.id } }),
              bookingTypes: await tx.bookingType.count({ where: { tenantId: tenant.id } }),
              absenceTypes: await tx.absenceType.count({ where: { tenantId: tenant.id } }),
              holidays: await tx.holiday.count({ where: { tenantId: tenant.id } }),
              dayPlans: await tx.dayPlan.count({ where: { tenantId: tenant.id } }),
              weekPlans: await tx.weekPlan.count({ where: { tenantId: tenant.id } }),
              tariffs: await tx.tariff.count({ where: { tenantId: tenant.id } }),
              billingDocs: await tx.billingDocument.count({ where: { tenantId: tenant.id } }),
              articles: await tx.whArticle.count({ where: { tenantId: tenant.id } }),
              employeeDayPlans: await tx.employeeDayPlan.count({ where: { tenantId: tenant.id } }),
            }

            // Force rollback so nothing persists after the test.
            throw new Error(ROLLBACK_SENTINEL)
          },
          { timeout: 90_000 },
        )
        .catch((err: unknown) => {
          if (err instanceof Error && err.message === ROLLBACK_SENTINEL) return
          throw err
        })

      const elapsedMs = Date.now() - started
      // Wall-clock budget per plan success criteria.
      expect(elapsedMs).toBeLessThan(90_000)

      expect(counts).not.toBeNull()
      const c = counts as unknown as Counts

      expect(c.departments).toBe(4)
      expect(c.employees).toBe(150)
      expect(c.bookingTypes).toBe(8)
      expect(c.absenceTypes).toBe(6)
      expect(c.holidays).toBe(20)
      expect(c.dayPlans).toBe(3)
      expect(c.weekPlans).toBe(3)
      expect(c.tariffs).toBe(12)
      expect(c.billingDocs).toBe(5)
      expect(c.articles).toBe(30)
      // 150 employees × ~22 weekdays in a 30-day horizon = ~3300
      expect(c.employeeDayPlans).toBeGreaterThan(2000)
      expect(c.employeeDayPlans).toBeLessThan(5000)
    },
    120_000,
  )
})
