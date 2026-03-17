/**
 * CRM Router
 *
 * Merges CRM sub-routers: addresses, correspondence, inquiries, tasks, numberSequences.
 * All procedures are guarded by requireModule("crm").
 */
import { createTRPCRouter } from "@/trpc/init"
import { crmAddressesRouter } from "./addresses"
import { crmCorrespondenceRouter } from "./correspondence"
import { crmInquiriesRouter } from "./inquiries"
import { crmTasksRouter } from "./tasks"
import { crmReportsRouter } from "./reports"
import { numberSequencesRouter } from "./numberSequences"

export const crmRouter = createTRPCRouter({
  addresses: crmAddressesRouter,
  correspondence: crmCorrespondenceRouter,
  inquiries: crmInquiriesRouter,
  tasks: crmTasksRouter,
  reports: crmReportsRouter,
  numberSequences: numberSequencesRouter,
})
