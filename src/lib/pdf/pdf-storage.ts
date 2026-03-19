import type { BillingDocumentType } from "@/generated/prisma/client"

const DOCUMENT_TYPE_PATHS: Record<BillingDocumentType, string> = {
  OFFER: "angebot",
  ORDER_CONFIRMATION: "auftragsbestaetigung",
  DELIVERY_NOTE: "lieferschein",
  SERVICE_NOTE: "serviceschein",
  RETURN_DELIVERY: "ruecklieferschein",
  INVOICE: "rechnung",
  CREDIT_NOTE: "gutschrift",
}

export function getStoragePath(doc: {
  type: BillingDocumentType
  tenantId: string
  id: string
}): string {
  return `${DOCUMENT_TYPE_PATHS[doc.type]}/${doc.tenantId}_${doc.id}.pdf`
}
