/**
 * Billing Router
 *
 * Merges billing sub-routers: documents, documentTemplates, tenantConfig,
 * serviceCases, payments, priceLists, recurringInvoices, reminders.
 * All procedures are guarded by requireModule("billing").
 */
import { createTRPCRouter } from "@/trpc/init"
import { billingDocumentsRouter } from "./documents"
import { billingDocumentTemplatesRouter } from "./documentTemplates"
import { billingTenantConfigRouter } from "./tenantConfig"
import { billingServiceCasesRouter } from "./serviceCases"
import { billingPaymentsRouter } from "./payments"
import { billingPriceListsRouter } from "./priceLists"
import { billingRecurringInvoicesRouter } from "./recurringInvoices"
import { remindersRouter } from "./reminders"

export const billingRouter = createTRPCRouter({
  documents: billingDocumentsRouter,
  documentTemplates: billingDocumentTemplatesRouter,
  tenantConfig: billingTenantConfigRouter,
  serviceCases: billingServiceCasesRouter,
  payments: billingPaymentsRouter,
  priceLists: billingPriceListsRouter,
  recurringInvoices: billingRecurringInvoicesRouter,
  reminders: remindersRouter,
})
