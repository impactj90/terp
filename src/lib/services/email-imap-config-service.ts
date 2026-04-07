import type { PrismaClient } from "@/generated/prisma/client"
import type { TenantImapConfig } from "@/generated/prisma/client"
import { ImapFlow } from "imapflow"
import * as repo from "./email-imap-config-repository"
import * as auditLog from "./audit-logs-service"
import type { AuditContext } from "./audit-logs-service"

// --- Error Classes ---

export class ImapConfigNotFoundError extends Error {
  constructor(message = "IMAP is not configured for this tenant") {
    super(message)
    this.name = "ImapConfigNotFoundError"
  }
}

export class ImapConnectionError extends Error {
  constructor(message = "IMAP connection failed") {
    super(message)
    this.name = "ImapConnectionError"
  }
}

// --- Helper ---

export function createImapClient(config: TenantImapConfig): ImapFlow {
  return new ImapFlow({
    host: config.host,
    port: config.port,
    secure: config.encryption === "SSL",
    auth: {
      user: config.username,
      pass: config.password,
    },
    ...(config.encryption === "NONE"
      ? { tls: { rejectUnauthorized: false } }
      : {}),
    logger: false,
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
    mailbox: string
  },
  audit?: AuditContext
) {
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

  const result = await repo.upsert(prisma, tenantId, {
    host: input.host,
    port: input.port,
    username: input.username,
    ...(input.password !== undefined ? { password: input.password } : {}),
    encryption: input.encryption,
    mailbox: input.mailbox,
    ...(resetVerification ? { isVerified: false, verifiedAt: null } : {}),
  })

  if (audit) {
    await auditLog
      .log(prisma, {
        tenantId,
        userId: audit.userId,
        action: "update",
        entityType: "tenant_imap_config",
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
): Promise<{ success: true; messageCount: number }> {
  const config = await repo.findByTenantId(prisma, tenantId)
  if (!config) {
    throw new ImapConfigNotFoundError()
  }

  const client = createImapClient(config)

  try {
    await client.connect()
    const mailbox = await client.getMailboxLock(config.mailbox)
    const mb = client.mailbox
    const messageCount = mb && typeof mb === "object" ? mb.exists : 0
    mailbox.release()
    await client.logout()

    // Mark as verified
    await prisma.tenantImapConfig.update({
      where: { tenantId },
      data: { isVerified: true, verifiedAt: new Date() },
    })

    return { success: true, messageCount }
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown IMAP connection error"
    throw new ImapConnectionError(message)
  }
}
