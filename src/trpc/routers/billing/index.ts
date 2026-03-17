/**
 * Billing Router
 *
 * Merges billing sub-routers: documents.
 * All procedures are guarded by requireModule("billing").
 */
import { createTRPCRouter } from "@/trpc/init"
import { billingDocumentsRouter } from "./documents"

export const billingRouter = createTRPCRouter({
  documents: billingDocumentsRouter,
})
