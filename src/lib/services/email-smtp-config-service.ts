import type { PrismaClient } from "@/generated/prisma/client"
import nodemailer from "nodemailer"
import type { Transporter } from "nodemailer"
import type { TenantSmtpConfig } from "@/generated/prisma/client"
import * as repo from "./email-smtp-config-repository"
import * as auditLog from "./audit-logs-service"
import type { AuditContext } from "./audit-logs-service"

// --- Error Classes ---

export class SmtpNotConfiguredError extends Error {
  constructor(message = "SMTP is not configured for this tenant") {
    super(message)
    this.name = "SmtpNotConfiguredError"
  }
}

export class SmtpConnectionError extends Error {
  constructor(message = "SMTP connection failed") {
    super(message)
    this.name = "SmtpConnectionError"
  }
}

// --- Helper ---

export function createTransporter(config: TenantSmtpConfig): Transporter {
  const secure = config.encryption === "SSL"
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure,
    ...(config.encryption === "NONE"
      ? { tls: { rejectUnauthorized: false } }
      : {}),
    ...(config.username
      ? { auth: { user: config.username, pass: config.password } }
      : {}),
  })
}

// --- Fields that should reset verification when changed ---
const CREDENTIAL_FIELDS = ["host", "port", "username", "password", "encryption"]

// --- Service Functions ---

export async function get(
  prisma: PrismaClient,
  tenantId: string
) {
  return repo.findByTenantId(prisma, tenantId)
}

export async function upsert(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    host: string
    port: number
    username: string
    password?: string
    encryption: string
    fromEmail: string
    fromName?: string | null
    replyToEmail?: string | null
  },
  audit?: AuditContext
) {
  // Check if credential fields changed — if so, reset verification
  const existing = await repo.findByTenantId(prisma, tenantId)
  let resetVerification = false

  if (existing) {
    for (const field of CREDENTIAL_FIELDS) {
      const inputVal = input[field as keyof typeof input]
      const existingVal = existing[field as keyof typeof existing]
      if (inputVal !== undefined && inputVal !== existingVal) {
        resetVerification = true
        break
      }
    }
  }

  const data = {
    host: input.host,
    port: input.port,
    username: input.username,
    ...(input.password !== undefined ? { password: input.password } : {}),
    encryption: input.encryption,
    fromEmail: input.fromEmail,
    fromName: input.fromName ?? null,
    replyToEmail: input.replyToEmail ?? null,
    ...(resetVerification ? { isVerified: false, verifiedAt: null } : {}),
  }

  const result = await repo.upsert(prisma, tenantId, {
    host: data.host,
    port: data.port,
    username: data.username,
    ...(data.password !== undefined ? { password: data.password } : {}),
    encryption: data.encryption,
    fromEmail: data.fromEmail,
    fromName: data.fromName,
    replyToEmail: data.replyToEmail,
    ...(resetVerification ? { isVerified: false, verifiedAt: null } : {}),
  })

  if (audit) {
    await auditLog
      .log(prisma, {
        tenantId,
        userId: audit.userId,
        action: "update",
        entityType: "tenant_smtp_config",
        entityId: result.id,
        entityName: result.host,
        changes: null,
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
      })
      .catch((err) => console.error("[AuditLog] Failed:", err))
  }

  return result
}

export async function testConnection(
  prisma: PrismaClient,
  tenantId: string
): Promise<{ success: boolean; message: string }> {
  const config = await repo.findByTenantId(prisma, tenantId)
  if (!config) {
    throw new SmtpNotConfiguredError()
  }

  const transporter = createTransporter(config)

  try {
    await transporter.verify()
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown connection error"
    throw new SmtpConnectionError(message)
  }

  // Send test email to the from_email
  try {
    await transporter.sendMail({
      from: config.fromName
        ? `"${config.fromName}" <${config.fromEmail}>`
        : config.fromEmail,
      to: config.fromEmail,
      subject: "SMTP Verbindungstest erfolgreich",
      text: "Diese E-Mail bestätigt, dass die SMTP-Konfiguration korrekt ist.",
    })
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to send test email"
    throw new SmtpConnectionError(message)
  }

  // Mark as verified
  await prisma.tenantSmtpConfig.update({
    where: { tenantId },
    data: { isVerified: true, verifiedAt: new Date() },
  })

  return { success: true, message: "SMTP connection verified successfully" }
}
