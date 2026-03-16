/**
 * CRM Router
 *
 * Merges CRM sub-routers: addresses, numberSequences.
 * All address procedures are guarded by requireModule("crm").
 */
import { createTRPCRouter } from "@/trpc/init"
import { crmAddressesRouter } from "./addresses"
import { numberSequencesRouter } from "./numberSequences"

export const crmRouter = createTRPCRouter({
  addresses: crmAddressesRouter,
  numberSequences: numberSequencesRouter,
})
