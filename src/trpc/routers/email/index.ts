import { createTRPCRouter } from "@/trpc/init"
import { emailSmtpConfigRouter } from "./smtpConfig"
import { emailTemplateRouter } from "./templates"
import { emailSendRouter } from "./send"

export const emailRouter = createTRPCRouter({
  smtpConfig: emailSmtpConfigRouter,
  templates: emailTemplateRouter,
  send: emailSendRouter,
})
