import { createTRPCRouter } from "@/trpc/init"
import { imapConfigRouter } from "./imapConfig"
import { inboundInvoiceRouter } from "./inbound"
import { approvalPolicyRouter } from "./approvalPolicy"
import { emailLogRouter } from "./emailLog"
import { paymentRunsRouter } from "./payment-runs"
import { inboundInvoicePaymentsRouter } from "./inbound-invoice-payments"

export const invoicesRouter = createTRPCRouter({
  imapConfig: imapConfigRouter,
  inbound: inboundInvoiceRouter,
  approvalPolicy: approvalPolicyRouter,
  emailLog: emailLogRouter,
  paymentRuns: paymentRunsRouter,
  inboundPayments: inboundInvoicePaymentsRouter,
})
