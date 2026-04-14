/**
 * Module constants — safe for both client and server imports.
 *
 * Separated from index.ts because index.ts imports server-only
 * dependencies (createMiddleware, PrismaClient) that crash
 * client-side bundles.
 */

export const AVAILABLE_MODULES = [
  "core",
  "crm",
  "billing",
  "warehouse",
  "inbound_invoices",
  "payment_runs",
  "bank_statements",
] as const
export type ModuleId = (typeof AVAILABLE_MODULES)[number]
