/**
 * Integration test for the "industriedienstleister_starter" template.
 *
 * Requires a reachable DATABASE_URL (local Supabase via `pnpm db:start`).
 * Wraps the template apply in a transaction that always rolls back via
 * a sentinel error, so no data is persisted.
 *
 * Asserts the Phase 5 contract:
 *  - The industry-typical config (departments, tariffs, …) is seeded
 *    with the exact same counts as the showcase config path.
 *  - No employees, no employee day plans, no billing documents, no
 *    warehouse articles, no CRM addresses — starter templates never
 *    seed personnel/movement data.
 *  - No holidays — those come from the router body in Phase 6 with the
 *    operator-chosen Bundesland.
 *  - Universal defaults seeded: ≥3 reminder templates, ≥8 email
 *    templates, reminder settings with enabled=true and maxLevel=3.
 */
import { describe, expect, test } from "vitest"

import { prisma } from "@/lib/db/prisma"
import { getAllDocumentTypes } from "@/lib/email/default-templates"
import { industriedienstleisterStarter } from "../templates/industriedienstleister/starter"

const ROLLBACK_SENTINEL = "STARTER_TEMPLATE_TEST_ROLLBACK"

const HAS_DB = Boolean(process.env.DATABASE_URL)

describe.skipIf(!HAS_DB)("industriedienstleister_starter template", () => {
  test(
    "seeds config + universal defaults without personnel/movement data",
    async () => {
      const started = Date.now()

      type Counts = {
        departments: number
        tariffs: number
        dayPlans: number
        weekPlans: number
        bookingTypes: number
        absenceTypes: number
        whArticleGroups: number
        accounts: number
        accountGroups: number
        employees: number
        employeeDayPlans: number
        billingDocs: number
        articles: number
        crmAddresses: number
        holidays: number
        reminderTemplates: number
        emailTemplates: number
        emailTemplateDocTypes: string[]
        reminderSettings: {
          enabled: boolean
          maxLevel: number
          gracePeriodDays: number[]
          interestRatePercent: number
        } | null
      }
      let counts: Counts | null = null

      await prisma
        .$transaction(
          async (tx) => {
            const tenant = await tx.tenant.create({
              data: {
                name: "Starter Template Test",
                slug: `starter-tpl-test-${Date.now()}`,
                isActive: true,
                isDemo: false,
              },
            })

            const adminUser = await tx.user.create({
              data: {
                email: `starter-admin-${Date.now()}@test.local`,
                username: `starter-admin-${Date.now()}`,
                displayName: "Starter Admin Test",
                role: "admin",
                isActive: true,
              },
            })

            await industriedienstleisterStarter.applyConfig({
              tx,
              tenantId: tenant.id,
              adminUserId: adminUser.id,
            })

            const settingsRow = await tx.reminderSettings.findUnique({
              where: { tenantId: tenant.id },
            })

            const emailRows = await tx.emailTemplate.findMany({
              where: { tenantId: tenant.id },
              select: { documentType: true, isDefault: true },
            })

            counts = {
              departments: await tx.department.count({ where: { tenantId: tenant.id } }),
              tariffs: await tx.tariff.count({ where: { tenantId: tenant.id } }),
              dayPlans: await tx.dayPlan.count({ where: { tenantId: tenant.id } }),
              weekPlans: await tx.weekPlan.count({ where: { tenantId: tenant.id } }),
              bookingTypes: await tx.bookingType.count({ where: { tenantId: tenant.id } }),
              absenceTypes: await tx.absenceType.count({ where: { tenantId: tenant.id } }),
              whArticleGroups: await tx.whArticleGroup.count({ where: { tenantId: tenant.id } }),
              accounts: await tx.account.count({ where: { tenantId: tenant.id } }),
              accountGroups: await tx.accountGroup.count({ where: { tenantId: tenant.id } }),
              employees: await tx.employee.count({ where: { tenantId: tenant.id } }),
              employeeDayPlans: await tx.employeeDayPlan.count({ where: { tenantId: tenant.id } }),
              billingDocs: await tx.billingDocument.count({ where: { tenantId: tenant.id } }),
              articles: await tx.whArticle.count({ where: { tenantId: tenant.id } }),
              crmAddresses: await tx.crmAddress.count({ where: { tenantId: tenant.id } }),
              holidays: await tx.holiday.count({ where: { tenantId: tenant.id } }),
              reminderTemplates: await tx.reminderTemplate.count({ where: { tenantId: tenant.id } }),
              emailTemplates: emailRows.length,
              emailTemplateDocTypes: emailRows.map((r) => r.documentType),
              reminderSettings: settingsRow
                ? {
                    enabled: settingsRow.enabled,
                    maxLevel: settingsRow.maxLevel,
                    gracePeriodDays: settingsRow.gracePeriodDays,
                    interestRatePercent: Number(settingsRow.interestRatePercent),
                  }
                : null,
            }

            throw new Error(ROLLBACK_SENTINEL)
          },
          { timeout: 60_000 },
        )
        .catch((err: unknown) => {
          if (err instanceof Error && err.message === ROLLBACK_SENTINEL) return
          throw err
        })

      const elapsedMs = Date.now() - started
      expect(elapsedMs).toBeLessThan(30_000)

      expect(counts).not.toBeNull()
      const c = counts as unknown as Counts

      // --- Config counts (match the showcase config path) --------------------
      expect(c.departments).toBe(4)
      expect(c.tariffs).toBe(12)
      expect(c.dayPlans).toBe(3)
      expect(c.weekPlans).toBe(3)
      expect(c.bookingTypes).toBe(8)
      expect(c.absenceTypes).toBe(6)
      expect(c.whArticleGroups).toBe(2)
      expect(c.accountGroups).toBe(1)
      expect(c.accounts).toBe(10)

      // --- NO personnel/movement data ----------------------------------------
      expect(c.employees).toBe(0)
      expect(c.employeeDayPlans).toBe(0)
      expect(c.billingDocs).toBe(0)
      expect(c.articles).toBe(0)
      expect(c.crmAddresses).toBe(0)

      // --- NO holidays (Router body in Phase 6 handles this) -----------------
      expect(c.holidays).toBe(0)

      // --- Universal defaults -----------------------------------------------
      expect(c.reminderTemplates).toBeGreaterThanOrEqual(3)

      const expectedDocTypes = getAllDocumentTypes()
      expect(c.emailTemplates).toBeGreaterThanOrEqual(8)
      expect(c.emailTemplates).toBe(expectedDocTypes.length)
      // Exactly one default row per documentType.
      for (const docType of expectedDocTypes) {
        const matches = c.emailTemplateDocTypes.filter((d) => d === docType)
        expect(matches).toHaveLength(1)
      }

      expect(c.reminderSettings).not.toBeNull()
      expect(c.reminderSettings?.enabled).toBe(true)
      expect(c.reminderSettings?.maxLevel).toBe(3)
      expect(c.reminderSettings?.gracePeriodDays).toEqual([7, 14, 21])
      expect(c.reminderSettings?.interestRatePercent).toBe(9)
    },
    60_000,
  )
})
