/**
 * Payment Run XML Flow
 *
 * Integrates payment-run-service + payment-run-xml-generator with the
 * shared Supabase storage helper. Kept separate from the main
 * service so the Prisma-only unit tests don't need to mock storage.
 *
 * Plan: thoughts/shared/plans/2026-04-12-sepa-payment-runs.md Phase 2.3
 */
import type { PrismaClient } from "@/generated/prisma/client"
import * as paymentRunService from "./payment-run-service"
import { PaymentRunInvalidStateError } from "./payment-run-service"
import * as xmlGenerator from "./payment-run-xml-generator"
import type { XmlPaymentRun } from "./payment-run-xml-generator"
import * as billingTenantConfigService from "./billing-tenant-config-service"
import {
  createSignedReadUrl,
  fixSignedUrl,
  upload,
} from "@/lib/supabase/storage"
import type { AuditContext } from "./audit-logs-service"

export const PAYMENT_RUN_BUCKET = "payment-runs"
export const SIGNED_URL_EXPIRY_SECONDS = 600 // 10 minutes

export class PaymentRunXmlFlowError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "PaymentRunXmlFlowError"
  }
}

export interface GenerateAndGetSignedUrlResult {
  signedUrl: string
  filename: string
  alreadyExported: boolean
  storagePath: string
}

/**
 * Generate the pain.001.001.09 XML for a payment run (if not already
 * persisted), upload it to the private Supabase bucket, and return a
 * short-lived signed download URL.
 *
 * Idempotent — if the run is already EXPORTED with a storage path, the
 * stored file is served as-is without re-generation.
 */
export async function generateAndGetSignedUrl(
  prisma: PrismaClient,
  tenantId: string,
  paymentRunId: string,
  _userId: string,
  audit: AuditContext
): Promise<GenerateAndGetSignedUrlResult> {
  const run = await paymentRunService.getById(prisma, tenantId, paymentRunId)

  if (run.status === "CANCELLED") {
    throw new PaymentRunInvalidStateError(
      "Cannot export a cancelled payment run"
    )
  }

  const storagePath = `${tenantId}/${paymentRunId}.xml`
  const filename = `${run.number}.xml`

  // --- Fast path: re-use existing file on re-download ---
  if (run.status !== "DRAFT" && run.xmlStoragePath) {
    const signed = await createSignedReadUrl(
      PAYMENT_RUN_BUCKET,
      run.xmlStoragePath,
      SIGNED_URL_EXPIRY_SECONDS
    )
    if (!signed) {
      throw new PaymentRunXmlFlowError("Failed to create signed URL")
    }
    return {
      signedUrl: fixSignedUrl(signed),
      filename,
      alreadyExported: true,
      storagePath: run.xmlStoragePath,
    }
  }

  // --- First export: generate + upload + set EXPORTED ---
  const config = await billingTenantConfigService.get(prisma, tenantId)
  if (!config?.companyName || !config.iban) {
    throw new PaymentRunXmlFlowError(
      "Tenant billing config incomplete; cannot generate payment run XML"
    )
  }

  const xmlRun: XmlPaymentRun = {
    id: run.id,
    number: run.number,
    executionDate: run.executionDate,
    debtorName: run.debtorName,
    debtorIban: run.debtorIban,
    debtorBic: run.debtorBic,
    totalAmountCents: run.totalAmountCents,
    itemCount: run.itemCount,
    items: run.items.map((it) => ({
      id: it.id,
      endToEndId: it.endToEndId,
      effectiveCreditorName: it.effectiveCreditorName,
      effectiveIban: it.effectiveIban,
      effectiveBic: it.effectiveBic,
      effectiveStreet: it.effectiveStreet,
      effectiveZip: it.effectiveZip,
      effectiveCity: it.effectiveCity,
      effectiveCountry: it.effectiveCountry,
      effectiveAmountCents: it.effectiveAmountCents,
      effectiveCurrency: it.effectiveCurrency,
      effectiveRemittanceInfo: it.effectiveRemittanceInfo,
    })),
  }

  const { xml } = await xmlGenerator.generatePain001V09({
    paymentRun: xmlRun,
    msgId: run.number,
    creationDateTime: new Date(),
    initiatingPartyName: config.companyName,
    debtorIban: run.debtorIban,
    debtorBic: run.debtorBic,
    debtorName: run.debtorName,
    debtorStreet: config.companyStreet ?? null,
    debtorZip: config.companyZip ?? null,
    debtorCity: config.companyCity ?? null,
    debtorCountry: config.companyCountry ?? null,
  })

  await upload(PAYMENT_RUN_BUCKET, storagePath, Buffer.from(xml, "utf-8"), {
    contentType: "application/xml",
    upsert: true,
  })

  await paymentRunService.setExported(
    prisma,
    tenantId,
    paymentRunId,
    storagePath,
    audit
  )

  const signed = await createSignedReadUrl(
    PAYMENT_RUN_BUCKET,
    storagePath,
    SIGNED_URL_EXPIRY_SECONDS
  )
  if (!signed) {
    throw new PaymentRunXmlFlowError("Failed to create signed URL")
  }

  return {
    signedUrl: fixSignedUrl(signed),
    filename,
    alreadyExported: false,
    storagePath,
  }
}
