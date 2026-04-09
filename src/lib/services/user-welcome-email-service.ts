/**
 * User Welcome Email Service
 *
 * Sends a branded welcome email to a newly created user, containing a
 * Supabase password-recovery link the user can click to set their initial
 * password and log in.
 *
 * Design:
 *   - Reuses the existing per-tenant SMTP infrastructure
 *     (`email-smtp-config-service`) so the "from" address reflects the
 *     tenant's brand (fromName/fromEmail) rather than a generic sender.
 *   - Logs every attempt into `email_send_log` with
 *     `documentType = 'user_welcome'` and `documentId = null`. The existing
 *     `/api/cron/email-retry` handles rows with null documentId gracefully
 *     (it skips PDF attachment building).
 *   - On missing SMTP config → returns `{ sent: false, fallbackLink }`
 *     WITHOUT writing a log row, so the admin UI can surface the link in
 *     a fallback dialog.
 *
 * Phase 0 login-gap fix — see
 * thoughts/shared/plans/2026-04-09-demo-tenant-system.md.
 */

import type { PrismaClient } from "@/generated/prisma/client"
import * as smtpConfigService from "./email-smtp-config-service"
import * as sendLogRepo from "./email-send-log-repository"

// --- Types ---

export interface SendUserWelcomeEmailInput {
  /** Recipient email — the user who was just created. */
  toEmail: string
  /** Display name for the salutation. */
  displayName: string
  /** Supabase recovery action_link produced by `generateLink({type:'recovery'})`. */
  recoveryLink: string
  /** Tenant display name — used in subject line and body. */
  tenantName: string
  /** Base app URL — used for the fallback login URL in the email footer. */
  appUrl: string
  /** User id of the admin who created the account (for audit). */
  sentBy: string
}

export interface SendUserWelcomeEmailResult {
  /** True if SMTP was configured and sendMail() succeeded. */
  sent: boolean
  /**
   * Populated when `sent === false`. The admin UI uses this to let the
   * admin manually share the link (e.g. via chat) when SMTP is missing
   * or the send failed.
   */
  fallbackLink: string | null
}

// --- HTML template ---

/**
 * Renders a minimal, inline-styled welcome email body. Inline CSS because
 * many email clients strip <style> blocks. Kept intentionally simple — no
 * tenant logo, no external images, no template engine.
 */
function buildWelcomeEmailHtml(ctx: {
  displayName: string
  tenantName: string
  recoveryLink: string
  appUrl: string
}): { subject: string; html: string } {
  const subject = `Willkommen bei ${ctx.tenantName} — Passwort setzen`

  const html = `<!doctype html>
<html lang="de">
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; margin: 0; padding: 24px;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 8px; padding: 32px;">
      <tr>
        <td>
          <h1 style="margin: 0 0 16px; font-size: 20px; color: #111;">Willkommen bei ${escapeHtml(ctx.tenantName)}</h1>
          <p style="margin: 0 0 16px; color: #333; line-height: 1.5;">
            Hallo ${escapeHtml(ctx.displayName)},
          </p>
          <p style="margin: 0 0 16px; color: #333; line-height: 1.5;">
            Ihr Benutzerkonto wurde angelegt. Klicken Sie auf den folgenden Link,
            um Ihr Passwort zu setzen und sich anschließend einzuloggen:
          </p>
          <p style="margin: 24px 0;">
            <a href="${escapeAttr(ctx.recoveryLink)}" style="display: inline-block; padding: 12px 24px; background: #2563eb; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 500;">
              Passwort setzen und einloggen
            </a>
          </p>
          <p style="margin: 16px 0; color: #666; font-size: 13px; line-height: 1.5;">
            Falls der Button nicht funktioniert, kopieren Sie diesen Link in Ihren Browser:<br />
            <code style="display: block; padding: 8px; background: #f5f5f5; border-radius: 4px; font-size: 12px; word-break: break-all; margin-top: 8px;">${escapeHtml(ctx.recoveryLink)}</code>
          </p>
          <p style="margin: 16px 0; color: #666; font-size: 13px; line-height: 1.5;">
            Der Link ist zeitlich begrenzt gültig. Bei Fragen wenden Sie sich an
            Ihren Administrator.
          </p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
          <p style="margin: 0; color: #888; font-size: 12px;">
            Anmelde-URL: <a href="${escapeAttr(ctx.appUrl)}/login" style="color: #2563eb;">${escapeHtml(ctx.appUrl)}/login</a>
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`

  return { subject, html }
}

// Minimal escaping helpers — the only user-controlled fields here are
// displayName, tenantName and the recovery link (which comes from Supabase
// and is URL-safe). Still, defence in depth: escape everything rendered
// into the HTML body.
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function escapeAttr(value: string): string {
  return escapeHtml(value)
}

// --- Service function ---

/**
 * Sends a welcome email to a newly-created user.
 *
 * Returns `{ sent: true, fallbackLink: null }` on success.
 * Returns `{ sent: false, fallbackLink: recoveryLink }` when:
 *   - The tenant has no SMTP config (graceful fallback; the admin will
 *     share the link manually via the UI fallback dialog)
 *   - The SMTP send failed (logged and the admin gets the link anyway)
 *
 * Never throws — welcome email delivery must not block user creation.
 */
export async function sendUserWelcomeEmail(
  prisma: PrismaClient,
  tenantId: string,
  input: SendUserWelcomeEmailInput,
): Promise<SendUserWelcomeEmailResult> {
  // 1. Load SMTP config — if missing, bail out with fallback.
  const smtpConfig = await smtpConfigService.get(prisma, tenantId)
  if (!smtpConfig) {
    return { sent: false, fallbackLink: input.recoveryLink }
  }

  // 2. Render the email body.
  const { subject, html } = buildWelcomeEmailHtml({
    displayName: input.displayName,
    tenantName: input.tenantName,
    recoveryLink: input.recoveryLink,
    appUrl: input.appUrl,
  })

  // 3. Create the log entry in "pending" state BEFORE attempting to send,
  //    so we have an audit row even if sendMail throws. documentId/
  //    documentType remain null-ish per the email_send_log schema
  //    (verified in prisma/schema.prisma and migration 20260411100000).
  const logEntry = await sendLogRepo.create(prisma, tenantId, {
    documentId: null,
    documentType: "user_welcome",
    toEmail: input.toEmail,
    subject,
    bodyHtml: html,
    status: "pending",
    sentBy: input.sentBy,
  })

  // 4. Build transporter and send. Reuses the helper the document-email
  //    flow uses so SMTP behavior (auth, TLS, connection reuse) stays
  //    identical.
  try {
    const transporter = smtpConfigService.createTransporter(smtpConfig)
    const from = smtpConfig.fromName
      ? `"${smtpConfig.fromName}" <${smtpConfig.fromEmail}>`
      : smtpConfig.fromEmail

    await transporter.sendMail({
      from,
      to: input.toEmail,
      replyTo: smtpConfig.replyToEmail ?? undefined,
      subject,
      html,
    })

    await sendLogRepo.markSent(prisma, logEntry.id)
    return { sent: true, fallbackLink: null }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown SMTP error"
    console.error(
      `[user-welcome-email] sendMail failed for ${input.toEmail}:`,
      errorMessage,
    )
    await sendLogRepo
      .markFailed(prisma, logEntry.id, errorMessage)
      .catch((logErr) =>
        console.error("[user-welcome-email] markFailed failed:", logErr),
      )
    // Admin still gets the link via the fallback path, so they can share
    // it manually. Non-throwing by design.
    return { sent: false, fallbackLink: input.recoveryLink }
  }
}
