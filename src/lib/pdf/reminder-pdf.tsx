import React from "react"
import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer"
import { RichTextPdf } from "./rich-text-pdf"
import { FusszeilePdf } from "./fusszeile-pdf"

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

  itemTable: { marginTop: 8, marginBottom: 8 },
  itemHeaderRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#999",
    paddingBottom: 3,
    marginBottom: 2,
  },
  itemRow: {
    flexDirection: "row",
    paddingVertical: 3,
    borderBottomWidth: 0.25,
    borderBottomColor: "#ddd",
  },
  colNumber: { width: "20%", fontSize: 9 },
  colDate: { width: "16%", fontSize: 9 },
  colDue: { width: "16%", fontSize: 9 },
  colAmount: { width: "18%", fontSize: 9, textAlign: "right" },
  colDays: { width: "12%", fontSize: 9, textAlign: "right" },
  colInterest: { width: "18%", fontSize: 9, textAlign: "right" },
  headerCell: { fontSize: 9, color: "#666" },

  totalsContainer: { alignItems: "flex-end", marginTop: 8 },
  totalsBlock: { width: 220 },
  totalsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 2,
  },
  totalsLabel: { fontSize: 9, color: "#666" },
  totalsValue: { fontSize: 9 },
  totalsRowFinal: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 3,
    borderTopWidth: 0.5,
    borderTopColor: "#999",
    marginTop: 2,
  },
  totalsLabelFinal: { fontSize: 10, fontFamily: "Helvetica-Bold" },
  totalsValueFinal: { fontSize: 10, fontFamily: "Helvetica-Bold" },
})

const LEVEL_LABELS: Record<number, string> = {
  1: "Zahlungserinnerung",
  2: "Mahnung — Stufe 2",
  3: "Letzte Mahnung — Stufe 3",
  4: "Mahnung — Stufe 4",
}

function formatDate(date: Date | string | null | undefined): string {
  if (!date) return ""
  return new Intl.DateTimeFormat("de-DE").format(new Date(date))
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(value)
}

export interface ReminderPdfItem {
  invoiceNumber: string
  invoiceDate: Date | string
  dueDate: Date | string
  openAmountAtReminder: number
  daysOverdue: number
  interestAmount: number
}

export interface ReminderPdfProps {
  reminder: {
    number: string
    level: number
    headerText: string
    footerText: string
    totalOpenAmount: number
    totalInterest: number
    totalFees: number
    totalDue: number
    createdAt: Date | string
  }
  items: ReminderPdfItem[]
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

export function ReminderPdf({ reminder, items, address, tenantConfig }: ReminderPdfProps) {
  const title = LEVEL_LABELS[reminder.level] ?? `Mahnung Stufe ${reminder.level}`

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {tenantConfig?.companyName && (
          <Text style={styles.senderLine}>
            {tenantConfig.companyName}
            {tenantConfig.companyAddress
              ? ` · ${tenantConfig.companyAddress.replace(/\n/g, " · ")}`
              : ""}
          </Text>
        )}

        {tenantConfig?.logoUrl && (
          <Image src={tenantConfig.logoUrl} style={styles.logo} />
        )}

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

        <View style={styles.docInfoBlock}>
          <Text style={styles.docTitle}>{title}</Text>
          <Text style={styles.docInfoText}>Nr.: {reminder.number}</Text>
          <Text style={styles.docInfoText}>Datum: {formatDate(reminder.createdAt)}</Text>
        </View>

        {reminder.headerText && (
          <View style={styles.headerText}>
            <RichTextPdf html={reminder.headerText} />
          </View>
        )}

        <View style={styles.itemTable}>
          <View style={styles.itemHeaderRow}>
            <Text style={[styles.colNumber, styles.headerCell]}>Rechnungsnr.</Text>
            <Text style={[styles.colDate, styles.headerCell]}>Datum</Text>
            <Text style={[styles.colDue, styles.headerCell]}>Fällig am</Text>
            <Text style={[styles.colAmount, styles.headerCell]}>Offen</Text>
            <Text style={[styles.colDays, styles.headerCell]}>Tage</Text>
            <Text style={[styles.colInterest, styles.headerCell]}>Zinsen</Text>
          </View>
          {items.map((item, idx) => (
            <View key={idx} style={styles.itemRow}>
              <Text style={styles.colNumber}>{item.invoiceNumber}</Text>
              <Text style={styles.colDate}>{formatDate(item.invoiceDate)}</Text>
              <Text style={styles.colDue}>{formatDate(item.dueDate)}</Text>
              <Text style={styles.colAmount}>
                {formatCurrency(item.openAmountAtReminder)}
              </Text>
              <Text style={styles.colDays}>{item.daysOverdue}</Text>
              <Text style={styles.colInterest}>
                {formatCurrency(item.interestAmount)}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.totalsContainer}>
          <View style={styles.totalsBlock}>
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>Offener Betrag</Text>
              <Text style={styles.totalsValue}>
                {formatCurrency(reminder.totalOpenAmount)}
              </Text>
            </View>
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>Verzugszinsen</Text>
              <Text style={styles.totalsValue}>
                {formatCurrency(reminder.totalInterest)}
              </Text>
            </View>
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>Mahngebühr</Text>
              <Text style={styles.totalsValue}>
                {formatCurrency(reminder.totalFees)}
              </Text>
            </View>
            <View style={styles.totalsRowFinal}>
              <Text style={styles.totalsLabelFinal}>Gesamtsumme</Text>
              <Text style={styles.totalsValueFinal}>
                {formatCurrency(reminder.totalDue)}
              </Text>
            </View>
          </View>
        </View>

        {reminder.footerText && (
          <View style={styles.footerText}>
            <RichTextPdf html={reminder.footerText} />
          </View>
        )}

        {tenantConfig && <FusszeilePdf config={tenantConfig} />}
      </Page>
    </Document>
  )
}
