/**
 * Billing Router
 *
 * Merges billing sub-routers: documents, serviceCases, payments.
 * All procedures are guarded by requireModule("billing").
 */
import { createTRPCRouter } from "@/trpc/init"
import { billingDocumentsRouter } from "./documents"
import { billingServiceCasesRouter } from "./serviceCases"
import { billingPaymentsRouter } from "./payments"

export const billingRouter = createTRPCRouter({
  documents: billingDocumentsRouter,
  serviceCases: billingServiceCasesRouter,
  payments: billingPaymentsRouter,
})
