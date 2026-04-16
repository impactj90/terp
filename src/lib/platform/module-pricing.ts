/**
 * Hardcoded module price catalog for platform subscription billing.
 *
 * Phase 10a intentionally does not use a DB-backed price list. At 0-5
 * customers with 1-2 price changes per year, the overhead of a price list
 * UI, migrations, and per-environment seeding is not worth it. Prices are
 * COPIED into `platform_subscriptions.unitPrice` at subscription start
 * time, so a later price change does not retroactively affect existing
 * subscriptions — each contract "freezes" the price it was signed at.
 *
 * To change prices: edit this file, commit, deploy. New subscriptions from
 * that deploy onward use the new price. Existing subscriptions are unaffected
 * unless the operator explicitly updates them (future feature).
 *
 * To migrate to a DB-backed price list later: replace `getModulePrice()`
 * with a query against whatever source of truth; the rest of the bridge
 * is unchanged.
 *
 * ## CONTRACT: `description` is a stable identifier — DO NOT CHANGE
 *
 * The `description` field on each module is used by `cancelSubscription`
 * Path B to identify which position to remove from a shared recurring
 * invoice's `positionTemplate` (see plan FLAG 9).
 *
 * Subscriptions created BEFORE a description change still carry the OLD
 * description in their recurring invoices' positionTemplate — cancelling
 * those subscriptions after the change will fail to find the position,
 * log a warning, and leave an orphan position that the operator must
 * remove manually via the tenant-side billing UI.
 *
 * If wording must change:
 *   1. Do it in a breaking deploy where all existing
 *      `billing_recurring_invoices.positionTemplate` JSONB rows in the
 *      operator tenant are manually migrated, OR
 *   2. Wait until all existing subscriptions have naturally ended.
 *
 * ADDING a new module is safe (new `description` string, no existing data).
 * DELETING a module requires ensuring no active subscriptions reference it.
 */
import type { ModuleId } from "@/lib/modules/constants"

export type BillingCycle = "MONTHLY" | "ANNUALLY"

type ModulePricing = {
  monthly: number
  annual: number
  vatRate: number
  description: string
}

export const MODULE_PRICES: Record<ModuleId, ModulePricing> = {
  core: {
    monthly: 8,
    annual: 80,
    vatRate: 19,
    description: "Terp Core — Benutzer, Mitarbeiter, Stammdaten",
  },
  crm: {
    monthly: 4,
    annual: 40,
    vatRate: 19,
    description: "Terp CRM — Adressen, Kontakte, Korrespondenz, Anfragen",
  },
  billing: {
    monthly: 4,
    annual: 40,
    vatRate: 19,
    description: "Terp Fakturierung — Angebote, Rechnungen, Zahlungen",
  },
  warehouse: {
    monthly: 4,
    annual: 40,
    vatRate: 19,
    description: "Terp Lager — Artikel, Bestand, Einkauf",
  },
  inbound_invoices: {
    monthly: 3,
    annual: 30,
    vatRate: 19,
    description: "Terp Eingangsrechnungen — Erfassung und Freigabe",
  },
  payment_runs: {
    monthly: 2,
    annual: 20,
    vatRate: 19,
    description: "Terp Zahlungsläufe — SEPA-Sammelüberweisungen (pain.001)",
  },
  bank_statements: {
    monthly: 2,
    annual: 20,
    vatRate: 19,
    description: "Terp Bankkontoauszüge — CAMT.053-Import und Auto-Matching",
  },
}

export function getModulePrice(
  module: ModuleId,
  cycle: BillingCycle,
): { unitPrice: number; vatRate: number; description: string } {
  const entry = MODULE_PRICES[module]
  return {
    unitPrice: cycle === "MONTHLY" ? entry.monthly : entry.annual,
    vatRate: entry.vatRate,
    description: entry.description,
  }
}
