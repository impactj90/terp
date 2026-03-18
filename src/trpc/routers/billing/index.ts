/**
 * Billing Router
 *
 * Merges billing sub-routers: documents, serviceCases, payments, priceLists.
 * All procedures are guarded by requireModule("billing").
 */
import { createTRPCRouter } from "@/trpc/init"
import { billingDocumentsRouter } from "./documents"
import { billingServiceCasesRouter } from "./serviceCases"
import { billingPaymentsRouter } from "./payments"
import { billingPriceListsRouter } from "./priceLists"

export const billingRouter = createTRPCRouter({
  documents: billingDocumentsRouter,
  serviceCases: billingServiceCasesRouter,
  payments: billingPaymentsRouter,
  priceLists: billingPriceListsRouter,
})
