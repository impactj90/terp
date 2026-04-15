import type { Prisma, PrismaClient } from "@/generated/prisma/client"

import * as reminderTemplateService from "@/lib/services/reminder-template-service"
import * as reminderSettingsService from "@/lib/services/reminder-settings-service"
import {
  getAllDocumentTypes,
  getDefaultTemplate,
} from "@/lib/email/default-templates"

/**
 * Seed-of-three: ReminderTemplate defaults, EmailTemplate defaults, and
 * ReminderSettings flipped to the BGB §288 Abs. 2 B2B defaults
 * (maxLevel=3, gracePeriodDays=[7,14,21], interestRatePercent=9).
 *
 * Consumed by starter templates (Phase 5) to give a brand-new tenant a
 * usable dunning + email-template baseline out of the box. The showcase
 * path intentionally does NOT call this — its integration test pins
 * exact row counts and must not drift.
 *
 * Idempotency:
 *   - reminderTemplateService.seedDefaultsForTenant returns {seeded: 0}
 *     when any reminder template already exists for the tenant.
 *   - The email-template inline seed skips any documentType that
 *     already has a row for the tenant (fresh starter tenants never
 *     race on this; a second call is a defensive no-op).
 *   - reminderSettingsService.updateSettings does a lazy-create (via
 *     getSettings) + update; re-running with the same input is a no-op.
 *
 * Why not use emailTemplateService.seedDefaults?
 *   emailTemplateService.seedDefaults calls emailTemplateRepository.create
 *   with isDefault=true, which internally opens a nested `$transaction`
 *   (email-template-repository.ts:50, invoked via
 *   email-template-service.ts:181). Prisma's interactive TransactionClient
 *   does not expose `$transaction`, so calling the service from inside
 *   the platform create-tenant tx throws
 *   "TypeError: prisma.$transaction is not a function" at runtime.
 *
 *   We therefore inline the minimal email-template seed here: iterate
 *   `getAllDocumentTypes()` and call `tx.emailTemplate.create` once per
 *   type. Subject/bodyHtml come verbatim from the single source of
 *   truth in `src/lib/email/default-templates.ts` — no content is
 *   duplicated. Tracked for follow-up in the plan's backlog as "make
 *   emailTemplateService tx-safe and collapse this back to a pure
 *   service aggregator".
 *
 *   The other two services (reminder-template + reminder-settings) are
 *   tx-safe and are still called unchanged.
 */
export async function seedUniversalDefaults(
  tx: Prisma.TransactionClient,
  tenantId: string,
): Promise<void> {
  const client = tx as unknown as PrismaClient

  await reminderTemplateService.seedDefaultsForTenant(client, tenantId)

  await seedEmailTemplateDefaultsInline(tx, tenantId)

  await reminderSettingsService.updateSettings(client, tenantId, {
    enabled: true,
    maxLevel: 3,
    gracePeriodDays: [7, 14, 21],
    interestRatePercent: 9,
  })
}

async function seedEmailTemplateDefaultsInline(
  tx: Prisma.TransactionClient,
  tenantId: string,
): Promise<void> {
  const docTypes = getAllDocumentTypes()
  for (const docType of docTypes) {
    const existing = await tx.emailTemplate.findFirst({
      where: { tenantId, documentType: docType },
      select: { id: true },
    })
    if (existing) continue

    const fallback = getDefaultTemplate(docType)
    if (!fallback) continue

    await tx.emailTemplate.create({
      data: {
        tenant: { connect: { id: tenantId } },
        documentType: fallback.documentType,
        name: fallback.name,
        subject: fallback.subject,
        bodyHtml: fallback.bodyHtml,
        isDefault: true,
      },
    })
  }
}
