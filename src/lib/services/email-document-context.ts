/**
 * Document Context Builders for Email
 *
 * Extracts email-relevant data from different document types
 * so the email service deals with a single interface.
 */
import type { PrismaClient } from "@/generated/prisma/client"

export interface DocumentEmailData {
  documentId: string
  documentType: string
  documentNumber: string
  pdfStoragePath: string | null
  recipientEmail: string | null
  recipientName: string | null
  salutation: string | null
  grossAmount: string | null
  dueDate: string | null
  projectName: string | null
  tenantCompanyName: string
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(amount)
}

function formatDate(date: Date | null | undefined): string | null {
  if (!date) return null
  return new Intl.DateTimeFormat("de-DE").format(new Date(date))
}

function buildSalutation(
  contact: { salutation?: string | null; firstName?: string | null; lastName?: string | null } | null
): string | null {
  if (!contact) return null
  const parts: string[] = []
  if (contact.salutation) parts.push(contact.salutation)
  if (contact.lastName) parts.push(contact.lastName)
  return parts.length > 0 ? parts.join(" ") : null
}

export async function buildBillingDocumentEmailData(
  prisma: PrismaClient,
  tenantId: string,
  documentId: string
): Promise<DocumentEmailData> {
  const doc = await prisma.billingDocument.findFirst({
    where: { id: documentId, tenantId },
    include: {
      address: true,
      contact: true,
      order: { select: { name: true } },
    },
  })

  if (!doc) {
    throw new Error("Billing document not found")
  }

  // Get tenant config for company name
  const tenantConfig = await prisma.billingTenantConfig.findUnique({
    where: { tenantId },
  })
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { name: true },
  })

  // Calculate due date from document date + payment term days
  let dueDate: Date | null = null
  if (doc.paymentTermDays) {
    dueDate = new Date(doc.documentDate)
    dueDate.setDate(dueDate.getDate() + doc.paymentTermDays)
  }

  return {
    documentId: doc.id,
    documentType: doc.type,
    documentNumber: doc.number,
    pdfStoragePath: doc.pdfUrl,
    recipientEmail: doc.contact?.email ?? doc.address.email ?? null,
    recipientName: doc.address.company ?? null,
    salutation: buildSalutation(doc.contact),
    grossAmount: formatCurrency(doc.totalGross),
    dueDate: formatDate(dueDate),
    projectName: doc.order?.name ?? null,
    tenantCompanyName:
      tenantConfig?.companyName ?? tenant?.name ?? "",
  }
}

export async function buildPurchaseOrderEmailData(
  prisma: PrismaClient,
  tenantId: string,
  purchaseOrderId: string
): Promise<DocumentEmailData> {
  const order = await prisma.whPurchaseOrder.findFirst({
    where: { id: purchaseOrderId, tenantId },
    include: {
      supplier: true,
      contact: true,
    },
  })

  if (!order) {
    throw new Error("Purchase order not found")
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { name: true },
  })
  const tenantConfig = await prisma.billingTenantConfig.findUnique({
    where: { tenantId },
  })

  // Build storage path (same logic as wh-purchase-order-pdf-service.ts)
  const companyPart = order.supplier?.company
    ? `_${order.supplier.company}`
    : ""
  const raw = `${order.number}${companyPart}`
  const sanitized = raw
    .replace(
      /[äöüßÄÖÜ]/g,
      (ch) =>
        ({
          ä: "ae",
          ö: "oe",
          ü: "ue",
          ß: "ss",
          Ä: "Ae",
          Ö: "Oe",
          Ü: "Ue",
        })[ch] ?? ch
    )
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
  const pdfStoragePath = `bestellung/${sanitized}.pdf`

  return {
    documentId: order.id,
    documentType: "PURCHASE_ORDER",
    documentNumber: order.number,
    pdfStoragePath,
    recipientEmail: order.contact?.email ?? order.supplier.email ?? null,
    recipientName: order.supplier.company ?? null,
    salutation: buildSalutation(order.contact),
    grossAmount: formatCurrency(order.totalGross),
    dueDate: formatDate(order.requestedDelivery),
    projectName: null,
    tenantCompanyName:
      tenantConfig?.companyName ?? tenant?.name ?? "",
  }
}
