import { createTRPCRouter } from "@/trpc/init"
import { imapConfigRouter } from "./imapConfig"
import { inboundInvoiceRouter } from "./inbound"
import { approvalPolicyRouter } from "./approvalPolicy"
import { emailLogRouter } from "./emailLog"

export const invoicesRouter = createTRPCRouter({
  imapConfig: imapConfigRouter,
  inbound: inboundInvoiceRouter,
  approvalPolicy: approvalPolicyRouter,
  emailLog: emailLogRouter,
})
