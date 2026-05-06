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
        // NK-1 Stammdaten (closing-pass)
        wageGroups: number
        orderTypes: number
        nkThresholdConfigs: number
        // NK-1 Bewegungsdaten (closing-pass)
        serviceObjects: number
        orders: number
        orderTargets: number
        orderTargetsActive: number
        orderTargetsClosed: number
        orderBookings: number
        orderBookingsWithSnapshot: number
        orderBookingsPerUnit: number
        workReportsSigned: number
        workReportsDraft: number
        workReportsWithTravelSnapshot: number
        movementsWithSnapshot: number
        inboundInvoiceLineItemsWithOrder: number
        employeesWithWageGroup: number
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
              // NK-1 Stammdaten
              wageGroups: await tx.wageGroup.count({ where: { tenantId: tenant.id } }),
              orderTypes: await tx.orderType.count({ where: { tenantId: tenant.id } }),
              nkThresholdConfigs: await tx.nkThresholdConfig.count({
                where: { tenantId: tenant.id },
              }),
              // NK-1 Bewegungsdaten
              serviceObjects: await tx.serviceObject.count({ where: { tenantId: tenant.id } }),
              orders: await tx.order.count({ where: { tenantId: tenant.id } }),
              orderTargets: await tx.orderTarget.count({ where: { tenantId: tenant.id } }),
              orderTargetsActive: await tx.orderTarget.count({
                where: { tenantId: tenant.id, validTo: null },
              }),
              orderTargetsClosed: await tx.orderTarget.count({
                where: { tenantId: tenant.id, validTo: { not: null } },
              }),
              orderBookings: await tx.orderBooking.count({ where: { tenantId: tenant.id } }),
              orderBookingsWithSnapshot: await tx.orderBooking.count({
                where: { tenantId: tenant.id, hourlyRateAtBooking: { not: null } },
              }),
              orderBookingsPerUnit: await tx.orderBooking.count({
                where: { tenantId: tenant.id, quantity: { not: null } },
              }),
              workReportsSigned: await tx.workReport.count({
                where: { tenantId: tenant.id, status: "SIGNED" },
              }),
              workReportsDraft: await tx.workReport.count({
                where: { tenantId: tenant.id, status: "DRAFT" },
              }),
              workReportsWithTravelSnapshot: await tx.workReport.count({
                where: { tenantId: tenant.id, travelRateAtSign: { not: null } },
              }),
              movementsWithSnapshot: await tx.whStockMovement.count({
                where: { tenantId: tenant.id, unitCostAtMovement: { not: null } },
              }),
              inboundInvoiceLineItemsWithOrder: await tx.inboundInvoiceLineItem.count({
                where: { tenantId: tenant.id, orderId: { not: null } },
              }),
              employeesWithWageGroup: await tx.employee.count({
                where: { tenantId: tenant.id, wageGroupId: { not: null } },
              }),
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

      // NK-1 Stammdaten (Decision 17)
      expect(c.wageGroups).toBe(5)
      expect(c.orderTypes).toBe(5)
      // 1 default config + 1 Notdienst override
      expect(c.nkThresholdConfigs).toBe(2)

      // NK-1 Bewegungsdaten (closing-pass)
      expect(c.serviceObjects).toBe(3) // Bohrmaschine, Förderband, Schweißroboter
      expect(c.orders).toBe(5) // 1× je OrderType
      expect(c.orderTargets).toBe(6) // 5× v1 + 1× v2 (Notdienst-Re-Plan)
      expect(c.orderTargetsActive).toBe(5) // immer max 1 active per Auftrag
      expect(c.orderTargetsClosed).toBe(1) // O2 v1 wurde durch v2 geschlossen
      expect(c.orderBookings).toBe(24)
      // alle Bookings ausser den 2 Edge-Case-Buchungen mit empl ohne WG
      // bekommen einen Snapshot (über Lohngruppe / Order-Rate / Activity)
      expect(c.orderBookingsWithSnapshot).toBeGreaterThanOrEqual(20)
      // 3 PER_UNIT-Buchungen mit quantity (12, 8, 6 lfm)
      expect(c.orderBookingsPerUnit).toBe(3)
      expect(c.workReportsSigned).toBe(5)
      expect(c.workReportsDraft).toBe(1)
      // alle 5 SIGNED-Reports tragen einen travel-rate-snapshot
      expect(c.workReportsWithTravelSnapshot).toBe(5)
      // alle 12 Material-Bewegungen tragen unitCostAtMovement
      expect(c.movementsWithSnapshot).toBe(12)
      // 2 von 3 Line-Items im InboundInvoice sind orderId-verlinkt
      expect(c.inboundInvoiceLineItemsWithOrder).toBe(2)
      // 20 Mitarbeiter Round-Robin Lohngruppe (5 wg × 4 emp)
      expect(c.employeesWithWageGroup).toBe(20)
    },
    120_000,
  )
})
