import React from "react"
import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer"
import {
  PurchaseOrderPositionTablePdf,
  type PurchaseOrderPosition,
} from "./purchase-order-position-table-pdf"
import { TotalsSummaryPdf } from "./totals-summary-pdf"
import { FusszeilePdf } from "./fusszeile-pdf"

// 1mm = 2.835pt
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
  notesBlock: { marginTop: 16 },
  notesLabel: { fontSize: 9, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  notesText: { fontSize: 9 },
  signatureBlock: {
    position: "absolute",
    bottom: 22 * MM,
    left: 25 * MM,
  },
  signatureLine: {
    borderBottomWidth: 0.5,
    borderBottomColor: "#333",
    marginBottom: 4,
    width: 250,
  },
  signatureLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: 250,
  },
  signatureLabel: { fontSize: 7, color: "#666" },
})

function formatDate(date: Date | string | null | undefined): string {
  if (!date) return ""
  return new Intl.DateTimeFormat("de-DE").format(new Date(date))
}

export interface PurchaseOrderPdfProps {
  order: {
    number: string
    orderDate: Date | string | null
    requestedDelivery: Date | string | null
    confirmedDelivery: Date | string | null
    notes: string | null
    subtotalNet: number
    totalVat: number
    totalGross: number
  }
  supplier: {
    company: string | null
    street: string | null
    zip: string | null
    city: string | null
    ourCustomerNumber: string | null
  } | null
  contact: {
    firstName: string | null
    lastName: string | null
  } | null
  positions: PurchaseOrderPosition[]
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

export function PurchaseOrderPdf({
  order,
  supplier,
  contact,
  positions,
  tenantConfig,
}: PurchaseOrderPdfProps) {
  const contactName = contact
    ? [contact.firstName, contact.lastName].filter(Boolean).join(" ")
    : null

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Absender-Zeile */}
        {tenantConfig?.companyName && (
          <Text style={styles.senderLine}>
            {tenantConfig.companyName}
            {tenantConfig.companyAddress
              ? ` \u00B7 ${tenantConfig.companyAddress.replace(/\n/g, " \u00B7 ")}`
              : ""}
          </Text>
        )}

        {/* Logo (top-right) */}
        {tenantConfig?.logoUrl && (
          <Image src={tenantConfig.logoUrl} style={styles.logo} />
        )}

        {/* Lieferant (Empfaenger) */}
        {supplier && (
          <View style={styles.recipientBlock}>
            {supplier.company && (
              <Text style={styles.recipientText}>{supplier.company}</Text>
            )}
            {supplier.street && (
              <Text style={styles.recipientText}>{supplier.street}</Text>
            )}
            {(supplier.zip || supplier.city) && (
              <Text style={styles.recipientText}>
                {[supplier.zip, supplier.city].filter(Boolean).join(" ")}
              </Text>
            )}
          </View>
        )}

        {/* Beleg-Info */}
        <View style={styles.docInfoBlock}>
          <Text style={styles.docTitle}>BESTELLUNG</Text>
          <Text style={styles.docInfoText}>Nr.: {order.number}</Text>
          {order.orderDate && (
            <Text style={styles.docInfoText}>
              Bestelldatum: {formatDate(order.orderDate)}
            </Text>
          )}
          {order.requestedDelivery && (
            <Text style={styles.docInfoText}>
              Gewünschter Liefertermin: {formatDate(order.requestedDelivery)}
            </Text>
          )}
          {order.confirmedDelivery && (
            <Text style={styles.docInfoText}>
              Bestätigter Liefertermin: {formatDate(order.confirmedDelivery)}
            </Text>
          )}
          {supplier?.ourCustomerNumber && (
            <Text style={styles.docInfoText}>
              Unsere Kundennr.: {supplier.ourCustomerNumber}
            </Text>
          )}
          {contactName && (
            <Text style={styles.docInfoText}>
              Ansprechpartner: {contactName}
            </Text>
          )}
        </View>

        {/* Positionstabelle */}
        <PurchaseOrderPositionTablePdf positions={positions} />

        {/* Summenblock */}
        <TotalsSummaryPdf
          subtotalNet={order.subtotalNet}
          totalVat={order.totalVat}
          totalGross={order.totalGross}
        />

        {/* Bemerkungen */}
        {order.notes && (
          <View style={styles.notesBlock}>
            <Text style={styles.notesLabel}>Bemerkungen:</Text>
            <Text style={styles.notesText}>{order.notes}</Text>
          </View>
        )}

        {/* Unterschriftenzeile */}
        <View style={styles.signatureBlock}>
          <View style={styles.signatureLine} />
          <View style={styles.signatureLabels}>
            <Text style={styles.signatureLabel}>Ort, Datum</Text>
            <Text style={styles.signatureLabel}>Unterschrift</Text>
          </View>
        </View>

        {/* Fusszeile (tenant config, absolute-positioned at bottom) */}
        {tenantConfig && <FusszeilePdf config={tenantConfig} />}
      </Page>
    </Document>
  )
}
