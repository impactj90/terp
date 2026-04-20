import type { PrismaClient, BillingTenantConfig, BillingDocument, BillingDocumentPosition, CrmAddress } from "@/generated/prisma/client"
import { InvoiceService } from "@e-invoice-eu/core"
import type { Invoice, InvoiceServiceOptions } from "@e-invoice-eu/core"
import * as storage from "@/lib/supabase/storage"
import { getXmlStoragePath, getStoragePath } from "@/lib/pdf/pdf-storage"
import * as billingDocService from "./billing-document-service"
import * as billingDocRepo from "./billing-document-repository"
import * as billingTenantConfigRepo from "./billing-tenant-config-repository"
import * as billingPdfService from "./billing-document-pdf-service"
import * as auditLog from "./audit-logs-service"
import type { AuditContext } from "./audit-logs-service"

// --- Error Classes ---

export class EInvoiceError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "EInvoiceError"
  }
}

export class EInvoiceValidationError extends Error {
  missingFields: string[]
  constructor(missingFields: string[]) {
    super(`E-Invoice validation failed. Missing: ${missingFields.join(", ")}`)
    this.name = "EInvoiceValidationError"
    this.missingFields = missingFields
  }
}

// --- Constants ---

const BUCKET = "documents"
const SIGNED_URL_EXPIRY_SECONDS = 60

const UNIT_MAPPING: Record<string, string> = {
  "Stk": "C62",   // Piece/Unit
  "Std": "HUR",   // Hour
  "kg": "KGM",    // Kilogram
  "m": "MTR",     // Metre
  "m²": "MTK",    // Square metre
  "m³": "MTQ",    // Cubic metre
  "l": "LTR",     // Litre
  "t": "TNE",     // Tonne
  "Psch": "LS",   // Lump sum
  "km": "KMT",    // Kilometre
}

// --- Validation ---

export function validateEInvoiceRequirements(
  tenantConfig: BillingTenantConfig,
  document: BillingDocument & { positions: BillingDocumentPosition[] },
  address: CrmAddress
): string[] {
  const missing: string[] = []

  // Seller checks
  if (!tenantConfig.companyName) missing.push("Firmenname (Einstellungen)")
  if (!tenantConfig.companyStreet) missing.push("Firmen-Straße (Einstellungen)")
  if (!tenantConfig.companyZip) missing.push("Firmen-PLZ (Einstellungen)")
  if (!tenantConfig.companyCity) missing.push("Firmen-Ort (Einstellungen)")
  if (!tenantConfig.taxId && !tenantConfig.taxNumber) {
    missing.push("USt-IdNr. oder Steuernummer (Einstellungen)")
  }

  // Buyer checks
  if (!address.company) missing.push("Kundenname (Adresse)")
  if (!address.street) missing.push("Straße (Adresse)")
  if (!address.zip) missing.push("PLZ (Adresse)")
  if (!address.city) missing.push("Ort (Adresse)")
  if (!address.country) missing.push("Land (Adresse)")

  // Document checks
  const hasLineItems = document.positions.some(
    (p) => p.type === "ARTICLE" || p.type === "FREE"
  )
  if (!hasLineItems) missing.push("Mindestens eine Artikelposition")

  return missing
}

// --- XML Generation ---

function formatAmount(value: number): string {
  return value.toFixed(2)
}

function formatDate(date: Date): string {
  const d = new Date(date)
  return d.toISOString().slice(0, 10) // YYYY-MM-DD
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

function buildPaymentTermsNote(
  paymentTermDays: number | null,
  discountPercent: number | null,
  discountDays: number | null
): string {
  const parts: string[] = []
  if (paymentTermDays) {
    parts.push(`Zahlbar innerhalb ${paymentTermDays} Tagen`)
  }
  if (discountPercent && discountDays) {
    parts.push(`${discountPercent}% Skonto innerhalb ${discountDays} Tagen`)
  }
  return parts.join(". ") || "Zahlbar sofort"
}

// Build the UBL-namespaced JSON that @e-invoice-eu/core expects
export function buildInvoiceData(
  doc: BillingDocument & { positions: BillingDocumentPosition[] },
  tenantConfig: BillingTenantConfig,
  address: CrmAddress
): Invoice {
  // Note: We build the data structure manually and cast to Invoice because
  // the library uses extremely strict literal union types for currency codes,
  // country codes, unit codes etc. that don't align with our dynamic data.
  const typeCode = doc.type === "CREDIT_NOTE" ? "381" : "380"
  const dueDate = addDays(doc.documentDate, doc.paymentTermDays ?? 30)

  // Seller tax schemes
  const sellerTaxSchemes: Record<string, unknown>[] = []
  if (tenantConfig.taxId) {
    sellerTaxSchemes.push({
      "cbc:CompanyID": tenantConfig.taxId,
      "cac:TaxScheme": { "cbc:ID": "VAT" },
    })
  }
  if (tenantConfig.taxNumber) {
    sellerTaxSchemes.push({
      "cbc:CompanyID": tenantConfig.taxNumber,
      "cac:TaxScheme": { "cbc:ID": "FC" },
    })
  }

  // Buyer tax scheme
  const buyerTaxScheme = address.vatId
    ? {
        "cbc:CompanyID": address.vatId,
        "cac:TaxScheme": { "cbc:ID": "VAT" },
      }
    : undefined

  // Line items: only ARTICLE and FREE positions
  const lineItems = doc.positions
    .filter((p) => p.type === "ARTICLE" || p.type === "FREE")
    .map((pos) => {
      const vatRate = pos.vatRate ?? 19
      const vatCategory = vatRate === 0 ? "E" : "S"
      const unitCode = UNIT_MAPPING[pos.unit ?? "Stk"] ?? "C62"

      return {
        "cbc:ID": String(pos.sortOrder),
        "cbc:InvoicedQuantity": String(pos.quantity ?? 1),
        "cbc:InvoicedQuantity@unitCode": unitCode,
        "cbc:LineExtensionAmount": formatAmount(pos.totalPrice ?? 0),
        "cbc:LineExtensionAmount@currencyID": "EUR",
        "cac:Item": {
          "cbc:Name": pos.description ?? "Position",
          "cac:ClassifiedTaxCategory": {
            "cbc:ID": vatCategory,
            "cbc:Percent": String(vatRate),
            "cac:TaxScheme": { "cbc:ID": "VAT" },
          },
        },
        "cac:Price": {
          "cbc:PriceAmount": formatAmount(pos.unitPrice ?? 0),
          "cbc:PriceAmount@currencyID": "EUR",
        },
      }
    })

  // Group tax subtotals by VAT rate
  const taxByRate = new Map<number, { taxable: number; tax: number }>()
  for (const pos of doc.positions) {
    if (pos.type !== "ARTICLE" && pos.type !== "FREE") continue
    const rate = pos.vatRate ?? 19
    const existing = taxByRate.get(rate) ?? { taxable: 0, tax: 0 }
    existing.taxable += pos.totalPrice ?? 0
    existing.tax += ((pos.totalPrice ?? 0) * rate) / 100
    taxByRate.set(rate, existing)
  }

  const taxSubtotals = Array.from(taxByRate.entries()).map(([rate, amounts]) => ({
    "cbc:TaxableAmount": formatAmount(amounts.taxable),
    "cbc:TaxableAmount@currencyID": "EUR",
    "cbc:TaxAmount": formatAmount(amounts.tax),
    "cbc:TaxAmount@currencyID": "EUR",
    "cac:TaxCategory": {
      "cbc:ID": rate === 0 ? "E" : "S",
      "cbc:Percent": String(rate),
      "cac:TaxScheme": { "cbc:ID": "VAT" },
    },
  }))

  // Payment means
  const paymentMeans: Record<string, unknown> = {
    "cbc:PaymentMeansCode": "30", // Bank transfer
    "cbc:PaymentMeansCode@name": "Überweisung",
  }
  if (tenantConfig.iban) {
    const account: Record<string, unknown> = {
      "cbc:ID": tenantConfig.iban,
    }
    if (tenantConfig.bankName) {
      account["cbc:Name"] = tenantConfig.bankName
    }
    if (tenantConfig.bic) {
      account["cac:FinancialInstitutionBranch"] = { "cbc:ID": tenantConfig.bic }
    }
    paymentMeans["cac:PayeeFinancialAccount"] = account
  }

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const invoice = {
    "ubl:Invoice": {
      "cbc:ID": doc.number,
      "cbc:IssueDate": formatDate(doc.documentDate),
      "cbc:DueDate": formatDate(dueDate),
      "cbc:InvoiceTypeCode": typeCode,
      "cbc:DocumentCurrencyCode": "EUR",
      ...(address.leitwegId ? { "cbc:BuyerReference": address.leitwegId } : {}),

      // §14 UStG Leistungszeitraum — BT-73 (StartDate) / BT-74 (EndDate).
      // Only emitted when at least one of the two is set; each sub-tag is
      // conditionally included so the EN16931 schema stays happy.
      ...(doc.servicePeriodFrom || doc.servicePeriodTo
        ? {
            "cac:InvoicePeriod": {
              ...(doc.servicePeriodFrom
                ? { "cbc:StartDate": formatDate(doc.servicePeriodFrom) }
                : {}),
              ...(doc.servicePeriodTo
                ? { "cbc:EndDate": formatDate(doc.servicePeriodTo) }
                : {}),
            },
          }
        : {}),

      "cac:AccountingSupplierParty": {
        "cac:Party": {
          "cac:PartyName": { "cbc:Name": tenantConfig.companyName },
          "cac:PostalAddress": {
            "cbc:StreetName": tenantConfig.companyStreet,
            "cbc:CityName": tenantConfig.companyCity,
            "cbc:PostalZone": tenantConfig.companyZip,
            "cac:Country": { "cbc:IdentificationCode": tenantConfig.companyCountry || "DE" },
          },
          "cac:PartyTaxScheme": sellerTaxSchemes.length === 1 ? sellerTaxSchemes[0] : sellerTaxSchemes,
          "cac:PartyLegalEntity": { "cbc:RegistrationName": tenantConfig.companyName },
          ...(tenantConfig.email || tenantConfig.phone
            ? {
                "cac:Contact": {
                  ...(tenantConfig.phone ? { "cbc:Telephone": tenantConfig.phone } : {}),
                  ...(tenantConfig.email ? { "cbc:ElectronicMail": tenantConfig.email } : {}),
                },
              }
            : {}),
        },
      },

      "cac:AccountingCustomerParty": {
        "cac:Party": {
          "cac:PartyName": { "cbc:Name": address.company },
          "cac:PostalAddress": {
            "cbc:StreetName": address.street,
            "cbc:CityName": address.city,
            "cbc:PostalZone": address.zip,
            "cac:Country": { "cbc:IdentificationCode": address.country || "DE" },
          },
          ...(buyerTaxScheme ? { "cac:PartyTaxScheme": buyerTaxScheme } : {}),
          "cac:PartyLegalEntity": { "cbc:RegistrationName": address.company },
        },
      },

      "cac:Delivery": {
        "cbc:ActualDeliveryDate": formatDate(doc.deliveryDate ?? doc.documentDate),
      },

      "cac:PaymentMeans": [paymentMeans],

      "cac:PaymentTerms": {
        "cbc:Note": buildPaymentTermsNote(
          doc.paymentTermDays,
          doc.discountPercent,
          doc.discountDays
        ),
      },

      "cac:TaxTotal": [
        {
          "cbc:TaxAmount": formatAmount(doc.totalVat),
          "cbc:TaxAmount@currencyID": "EUR",
          "cac:TaxSubtotal": taxSubtotals,
        },
      ],

      "cac:LegalMonetaryTotal": {
        "cbc:LineExtensionAmount": formatAmount(doc.subtotalNet),
        "cbc:LineExtensionAmount@currencyID": "EUR",
        "cbc:TaxExclusiveAmount": formatAmount(doc.subtotalNet),
        "cbc:TaxExclusiveAmount@currencyID": "EUR",
        "cbc:TaxInclusiveAmount": formatAmount(doc.totalGross),
        "cbc:TaxInclusiveAmount@currencyID": "EUR",
        "cbc:PayableAmount": formatAmount(doc.totalGross),
        "cbc:PayableAmount@currencyID": "EUR",
      },

      "cac:InvoiceLine": lineItems,
    },
  } as any as Invoice
  /* eslint-enable @typescript-eslint/no-explicit-any */

  return invoice
}

// --- XML Generation (public) ---

export async function generateXml(
  prisma: PrismaClient,
  tenantId: string,
  documentId: string
): Promise<Buffer> {
  const doc = await billingDocService.getById(prisma, tenantId, documentId)
  const address = await prisma.crmAddress.findFirstOrThrow({
    where: { id: doc.addressId, tenantId },
  })
  const tenantConfig = await billingTenantConfigRepo.findByTenantId(prisma, tenantId)
  if (!tenantConfig) {
    throw new EInvoiceError("Billing tenant config not found")
  }

  const docWithPositions = doc as unknown as BillingDocument & { positions: BillingDocumentPosition[] }
  const invoiceData = buildInvoiceData(docWithPositions, tenantConfig, address)

  const invoiceService = new InvoiceService(console)
  const xml = await invoiceService.generate(invoiceData, {
    format: "CII",
    lang: "de-de",
  } as InvoiceServiceOptions)

  return Buffer.from(xml as string, "utf-8")
}

// --- PDF/A-3 Embedding ---

export async function embedXmlInPdf(
  pdfBuffer: Buffer,
  invoiceData: Invoice,
  filename: string
): Promise<Buffer> {
  const invoiceService = new InvoiceService(console)
  const result = await invoiceService.generate(invoiceData, {
    format: "Factur-X-EN16931",
    lang: "de-de",
    pdf: {
      buffer: new Uint8Array(pdfBuffer),
      filename,
      mimetype: "application/pdf",
    },
  } as InvoiceServiceOptions)

  return Buffer.from(result as Uint8Array)
}

// --- Main Orchestrator ---

export async function generateAndStoreEInvoice(
  prisma: PrismaClient,
  tenantId: string,
  documentId: string,
  audit?: AuditContext
): Promise<{ xmlStoragePath: string }> {
  // 1. Load document, address, tenantConfig
  const doc = await billingDocService.getById(prisma, tenantId, documentId)
  const address = await prisma.crmAddress.findFirstOrThrow({
    where: { id: doc.addressId, tenantId },
  })
  const tenantConfig = await billingTenantConfigRepo.findByTenantId(prisma, tenantId)
  if (!tenantConfig) {
    throw new EInvoiceError("Billing tenant config not found")
  }

  const docWithPositions = doc as unknown as BillingDocument & { positions: BillingDocumentPosition[] }

  // 2. Validate
  const missingFields = validateEInvoiceRequirements(tenantConfig, docWithPositions, address)
  if (missingFields.length > 0) {
    throw new EInvoiceValidationError(missingFields)
  }

  // 3. Build invoice data for @e-invoice-eu/core
  const invoiceData = buildInvoiceData(docWithPositions, tenantConfig, address)

  // 4. Generate standalone CII XML
  const invoiceService = new InvoiceService(console)
  const xmlString = await invoiceService.generate(invoiceData, {
    format: "CII",
    lang: "de-de",
  } as InvoiceServiceOptions) as string
  const xmlBuffer = Buffer.from(xmlString, "utf-8")

  // 5. Download existing PDF from Supabase Storage (regenerate if missing)
  const pdfStoragePath = getStoragePath({ type: doc.type, tenantId, id: doc.id, number: doc.number, company: address.company })
  let pdfData = await storage.download(BUCKET, pdfStoragePath)

  if (!pdfData) {
    // PDF missing — regenerate it first
    await billingPdfService.generateAndStorePdf(prisma, tenantId, documentId)
    pdfData = await storage.download(BUCKET, pdfStoragePath)
  }

  if (!pdfData) {
    throw new EInvoiceError("Failed to download PDF")
  }
  const pdfBuffer = Buffer.from(await pdfData.arrayBuffer())

  // 6. Embed XML into PDF as PDF/A-3
  const zugferdPdfBuffer = await embedXmlInPdf(pdfBuffer, invoiceData, `${doc.number}.pdf`)

  // 7. Upload XML to Supabase Storage
  const xmlStoragePath = getXmlStoragePath({ type: doc.type, tenantId, id: doc.id, number: doc.number, company: address.company })
  try {
    await storage.upload(BUCKET, xmlStoragePath, xmlBuffer, { contentType: "text/xml", upsert: true })
  } catch (err) {
    throw new EInvoiceError(`XML upload failed: ${err instanceof Error ? err.message : "unknown"}`)
  }

  // 8. Upload replaced PDF/A-3 (overwrites original PDF)
  try {
    await storage.upload(BUCKET, pdfStoragePath, zugferdPdfBuffer, { contentType: "application/pdf", upsert: true })
  } catch (err) {
    throw new EInvoiceError(`PDF/A-3 upload failed: ${err instanceof Error ? err.message : "unknown"}`)
  }

  // 9. Update eInvoiceXmlUrl on document
  await billingDocRepo.update(prisma, tenantId, documentId, {
    eInvoiceXmlUrl: xmlStoragePath,
  })

  if (audit) {
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "generate_einvoice",
      entityType: "billing_document",
      entityId: documentId,
      entityName: doc.number ?? null,
      changes: null,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  return { xmlStoragePath }
}

// --- Signed Download URL ---

export async function getSignedXmlDownloadUrl(
  prisma: PrismaClient,
  tenantId: string,
  documentId: string
): Promise<{ signedUrl: string; filename: string } | null> {
  const doc = await billingDocService.getById(prisma, tenantId, documentId)
  const xmlUrl = (doc as Record<string, unknown>).eInvoiceXmlUrl as string | null

  if (!xmlUrl) return null

  const signedUrl = await storage.createSignedReadUrl(BUCKET, xmlUrl, SIGNED_URL_EXPIRY_SECONDS)
  if (!signedUrl) return null

  const filename = `${doc.number.replace(/[/\\]/g, "_")}.xml`

  return { signedUrl, filename }
}
