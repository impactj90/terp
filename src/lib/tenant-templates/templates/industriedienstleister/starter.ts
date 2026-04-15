import type { TenantTemplate } from "../../types"
import { seedUniversalDefaults } from "../../seed-universal-defaults"
import { applyIndustriedienstleisterConfig } from "./shared-config"

/**
 * "Industriedienstleister — Starter" — production-ready initial state for
 * a brand-new customer tenant.
 *
 * Seeds the industry-typical master data (departments, tariffs, shift
 * plans, booking/absence types, accounts, warehouse groups) via the
 * shared config helper, plus the universal dunning/email defaults
 * (seedUniversalDefaults). No personnel, no bookings, no invoices, no
 * articles — those are expected to come from the customer.
 *
 * Holidays are NOT seeded here. The Bundesland is chosen per-tenant in
 * the `createFromTemplate` router body (Phase 6), which calls
 * holidayService.generate after this template's applyConfig completes.
 */
export const industriedienstleisterStarter: TenantTemplate = {
  key: "industriedienstleister_starter",
  label: "Industriedienstleister — Starter (leer)",
  description:
    "Branchen-typische Stammdaten ohne Mitarbeiter und Buchungen. Bereit für Kunden-Go-Live nach Vertragsabschluss.",
  industry: "industriedienstleister",
  kind: "starter",

  applyConfig: async (ctx) => {
    const config = await applyIndustriedienstleisterConfig(ctx)
    await seedUniversalDefaults(ctx.tx, ctx.tenantId)
    return config
  },
  // no applySeedData — starter templates never seed people or movement data
}
