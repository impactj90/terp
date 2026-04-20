import React from "react"
import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer"
import { RichTextPdf } from "./rich-text-pdf"
import { PositionTablePdf } from "./position-table-pdf"
import { TotalsSummaryPdf } from "./totals-summary-pdf"
import { FusszeilePdf } from "./fusszeile-pdf"

// 1mm ≈ 2.835pt
const MM = 2.835

const styles = StyleSheet.create({
  page: {
    paddingTop: 20 * MM,
    paddingBottom: 15 * MM,
    paddingHorizontal: 25 * MM,
    fontFamily: "Helvetica",
    fontSize: 10,
  },
  senderLine: { fontSize: 7, color: "#666", marginBottom: 4 },
  logo: {
    position: "absolute",
    top: 20 * MM,
    right: 25 * MM,
    maxHeight: 50,
    maxWidth: 150,
  },
  recipientBlock: { marginBottom: 20, maxWidth: 250 },
  recipientText: { fontSize: 10 },
  docInfoBlock: { marginBottom: 16 },
  docTitle: { fontSize: 14, fontFamily: "Helvetica-Bold", marginBottom: 6 },
  docInfoText: { fontSize: 9, marginBottom: 2 },
  headerText: { marginBottom: 12 },
  footerText: { marginTop: 12, marginBottom: 20 },
})

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  OFFER: "Angebot",
  ORDER_CONFIRMATION: "Auftragsbestätigung",
  DELIVERY_NOTE: "Lieferschein",
  SERVICE_NOTE: "Leistungsschein",
  RETURN_DELIVERY: "Rücklieferschein",
  INVOICE: "Rechnung",
  CREDIT_NOTE: "Gutschrift",
}

function formatDate(date: Date | string | null | undefined): string {
  if (!date) return ""
  return new Intl.DateTimeFormat("de-DE").format(new Date(date))
}

interface BillingDocumentPdfProps {
  document: {
    id: string
    number: string
    type: string
    documentDate: Date | string
    deliveryDate?: Date | string | null
    orderDate?: Date | string | null
    servicePeriodFrom?: Date | string | null
    servicePeriodTo?: Date | string | null
    headerText?: string | null
    footerText?: string | null
    subtotalNet: number
    totalVat: number
    totalGross: number
    positions: Array<{
      sortOrder: number
      type: string
      description?: string | null
      quantity?: number | null
      unit?: string | null
      unitPrice?: number | null
      totalPrice?: number | null
      vatRate?: number | null
    }>
  }
  address: {
    company?: string | null
    street?: string | null
    zip?: string | null
    city?: string | null
  } | null
  tenantConfig: {
    companyName?: string | null
    companyAddress?: string | null
    logoUrl?: string | null
    bankName?: string | null
    iban?: string | null
    bic?: string | null
    taxId?: string | null
    commercialRegister?: string | null
    managingDirector?: string | null
    phone?: string | null
    email?: string | null
  } | null
}

export function BillingDocumentPdf({ document: doc, address, tenantConfig }: BillingDocumentPdfProps) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Absender-Zeile */}
        {tenantConfig?.companyName && (
          <Text style={styles.senderLine}>
            {tenantConfig.companyName}
            {tenantConfig.companyAddress ? ` · ${tenantConfig.companyAddress.replace(/\n/g, " · ")}` : ""}
          </Text>
        )}

        {/* Logo (top-right) */}
        {tenantConfig?.logoUrl && (
          <Image src={tenantConfig.logoUrl} style={styles.logo} />
        )}

        {/* Empfänger */}
        {address && (
          <View style={styles.recipientBlock}>
            {address.company && <Text style={styles.recipientText}>{address.company}</Text>}
            {address.street && <Text style={styles.recipientText}>{address.street}</Text>}
            {(address.zip || address.city) && (
              <Text style={styles.recipientText}>
                {[address.zip, address.city].filter(Boolean).join(" ")}
              </Text>
            )}
          </View>
        )}

        {/* Beleg-Info */}
        <View style={styles.docInfoBlock}>
          <Text style={styles.docTitle}>
            {DOCUMENT_TYPE_LABELS[doc.type] ?? doc.type}
          </Text>
          <Text style={styles.docInfoText}>Nr.: {doc.number}</Text>
          <Text style={styles.docInfoText}>Datum: {formatDate(doc.documentDate)}</Text>
          {doc.deliveryDate && (
            <Text style={styles.docInfoText}>Liefertermin: {formatDate(doc.deliveryDate)}</Text>
          )}
          {doc.orderDate && (
            <Text style={styles.docInfoText}>Auftragsdatum: {formatDate(doc.orderDate)}</Text>
          )}
          {(doc.type === "INVOICE" || doc.type === "CREDIT_NOTE") &&
            (doc.servicePeriodFrom || doc.servicePeriodTo) && (
              <Text style={styles.docInfoText}>
                Leistungszeitraum: {doc.servicePeriodFrom ? formatDate(doc.servicePeriodFrom) : "—"}
                {" – "}
                {doc.servicePeriodTo ? formatDate(doc.servicePeriodTo) : "—"}
              </Text>
            )}
        </View>

        {/* Header Text */}
        {doc.headerText && (
          <View style={styles.headerText}>
            <RichTextPdf html={doc.headerText} />
          </View>
        )}

        {/* Positionstabelle */}
        <PositionTablePdf positions={doc.positions} />

        {/* Summenblock */}
        <TotalsSummaryPdf
          subtotalNet={doc.subtotalNet}
          totalVat={doc.totalVat}
          totalGross={doc.totalGross}
        />

        {/* Footer Text */}
        {doc.footerText && (
          <View style={styles.footerText}>
            <RichTextPdf html={doc.footerText} />
          </View>
        )}

        {/* Fußzeile (tenant config, absolute-positioned at bottom) */}
        {tenantConfig && <FusszeilePdf config={tenantConfig} />}
      </Page>
    </Document>
  )
}
