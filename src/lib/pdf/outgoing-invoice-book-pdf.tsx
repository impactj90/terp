import React from "react"
import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer"
import { FusszeilePdf } from "./fusszeile-pdf"
import type {
  OutgoingInvoiceBookEntry,
  VatSummary,
} from "@/lib/services/outgoing-invoice-book-service"

const MM = 2.835

const styles = StyleSheet.create({
  page: {
    paddingTop: 15 * MM,
    paddingBottom: 18 * MM,
    paddingHorizontal: 15 * MM,
    fontFamily: "Helvetica",
    fontSize: 8,
  },
  senderLine: { fontSize: 7, color: "#666", marginBottom: 4 },
  logo: {
    position: "absolute",
    top: 15 * MM,
    right: 15 * MM,
    maxHeight: 40,
    maxWidth: 120,
  },
  title: { fontSize: 14, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  subtitle: { fontSize: 9, color: "#555", marginBottom: 10 },
  tableHeader: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#333",
    paddingBottom: 3,
    marginBottom: 2,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#ddd",
    paddingVertical: 2,
    minHeight: 12,
  },
  tableRowAlt: { backgroundColor: "#f9f9f9" },
  colDate: { width: "10%" },
  colNumber: { width: "10%" },
  colCustomer: { width: "22%" },
  colServicePeriod: { width: "16%" },
  colNet: { width: "12%", textAlign: "right" },
  colVatRate: { width: "8%", textAlign: "right" },
  colVat: { width: "10%", textAlign: "right" },
  colGross: { width: "12%", textAlign: "right" },
  headerText: { fontFamily: "Helvetica-Bold", color: "#333" },
  summaryBlock: {
    marginTop: 12,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: "#333",
  },
  summaryRow: {
    flexDirection: "row",
    paddingVertical: 2,
  },
  summaryLabel: { width: "50%", fontSize: 8 },
  summaryNet: { width: "17%", fontSize: 8, textAlign: "right" },
  summaryVat: { width: "16%", fontSize: 8, textAlign: "right" },
  summaryGross: { width: "17%", fontSize: 8, textAlign: "right" },
  summaryTotalRow: {
    flexDirection: "row",
    paddingTop: 4,
    marginTop: 2,
    borderTopWidth: 1,
    borderTopColor: "#333",
  },
  summaryTotalLabel: {
    width: "50%",
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
  },
  summaryTotalValue: {
    width: "17%",
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    textAlign: "right",
  },
  summaryTotalVat: {
    width: "16%",
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    textAlign: "right",
  },
  pageNumber: {
    position: "absolute",
    bottom: 12 * MM,
    right: 15 * MM,
    fontSize: 7,
    color: "#999",
  },
})

function formatCurrency(v: number): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(v)
}

function formatDate(d: Date | string | null | undefined): string {
  if (!d) return ""
  return new Intl.DateTimeFormat("de-DE").format(new Date(d))
}

function formatPercent(v: number): string {
  return `${new Intl.NumberFormat("de-DE", {
    maximumFractionDigits: 2,
  }).format(v)} %`
}

function formatServicePeriod(
  from: Date | string | null,
  to: Date | string | null
): string {
  if (!from && !to) return "—"
  return `${from ? formatDate(from) : "—"} – ${to ? formatDate(to) : "—"}`
}

export interface OutgoingInvoiceBookPdfProps {
  entries: OutgoingInvoiceBookEntry[]
  summary: VatSummary
  dateFrom: Date
  dateTo: Date
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

export function OutgoingInvoiceBookPdf({
  entries,
  summary,
  dateFrom,
  dateTo,
  tenantConfig,
}: OutgoingInvoiceBookPdfProps) {
  // Flatten entries × vatBreakdown to row-list; entries without any
  // revenue positions (shouldn't happen for PRINTED invoices but guard
  // anyway) render as one dash-row.
  const rows: Array<{
    date: string
    number: string
    type: "INVOICE" | "CREDIT_NOTE"
    customer: string
    servicePeriod: string
    net: number | null
    vatRate: number | null
    vat: number | null
    gross: number | null
    groupIndex: number
  }> = []
  entries.forEach((entry, groupIndex) => {
    if (entry.vatBreakdown.length === 0) {
      rows.push({
        date: formatDate(entry.documentDate),
        number: entry.number,
        type: entry.type,
        customer: entry.customerName,
        servicePeriod: formatServicePeriod(
          entry.servicePeriodFrom,
          entry.servicePeriodTo
        ),
        net: null,
        vatRate: null,
        vat: null,
        gross: null,
        groupIndex,
      })
      return
    }
    entry.vatBreakdown.forEach((b, i) => {
      rows.push({
        date: i === 0 ? formatDate(entry.documentDate) : "",
        number: i === 0 ? entry.number : "",
        type: entry.type,
        customer: i === 0 ? entry.customerName : "",
        servicePeriod:
          i === 0
            ? formatServicePeriod(
                entry.servicePeriodFrom,
                entry.servicePeriodTo
              )
            : "",
        net: b.net,
        vatRate: b.vatRate,
        vat: b.vat,
        gross: b.gross,
        groupIndex,
      })
    })
  })

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        {/* Absender-Zeile */}
        {tenantConfig?.companyName && (
          <Text style={styles.senderLine}>
            {tenantConfig.companyName}
            {tenantConfig.companyAddress
              ? ` · ${tenantConfig.companyAddress.replace(/\n/g, " · ")}`
              : ""}
          </Text>
        )}

        {/* Logo top-right */}
        {tenantConfig?.logoUrl && (
          <Image src={tenantConfig.logoUrl} style={styles.logo} />
        )}

        <Text style={styles.title}>Rechnungsausgangsbuch</Text>
        <Text style={styles.subtitle}>
          {tenantConfig?.companyName ?? ""} · {formatDate(dateFrom)} bis{" "}
          {formatDate(dateTo)} · {entries.length} Belege
        </Text>

        {/* Table Header */}
        <View style={styles.tableHeader} fixed>
          <Text style={[styles.colDate, styles.headerText]}>Datum</Text>
          <Text style={[styles.colNumber, styles.headerText]}>Nr.</Text>
          <Text style={[styles.colCustomer, styles.headerText]}>Kunde</Text>
          <Text style={[styles.colServicePeriod, styles.headerText]}>
            Leistungszeitraum
          </Text>
          <Text style={[styles.colNet, styles.headerText]}>Netto</Text>
          <Text style={[styles.colVatRate, styles.headerText]}>USt-Satz</Text>
          <Text style={[styles.colVat, styles.headerText]}>USt</Text>
          <Text style={[styles.colGross, styles.headerText]}>Brutto</Text>
        </View>

        {/* Rows */}
        {rows.map((r, i) => (
          <View
            key={i}
            style={[
              styles.tableRow,
              r.groupIndex % 2 === 1 ? styles.tableRowAlt : {},
            ]}
            wrap={false}
          >
            <Text style={styles.colDate}>{r.date}</Text>
            <Text style={styles.colNumber}>{r.number}</Text>
            <Text style={styles.colCustomer}>{r.customer}</Text>
            <Text style={styles.colServicePeriod}>{r.servicePeriod}</Text>
            <Text style={styles.colNet}>
              {r.net !== null ? formatCurrency(r.net) : "—"}
            </Text>
            <Text style={styles.colVatRate}>
              {r.vatRate !== null ? formatPercent(r.vatRate) : "—"}
            </Text>
            <Text style={styles.colVat}>
              {r.vat !== null ? formatCurrency(r.vat) : "—"}
            </Text>
            <Text style={styles.colGross}>
              {r.gross !== null ? formatCurrency(r.gross) : "—"}
            </Text>
          </View>
        ))}

        {/* Summary */}
        <View style={styles.summaryBlock} wrap={false}>
          {summary.perRate.map((s) => (
            <View key={s.vatRate} style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>
                Summe {formatPercent(s.vatRate)}
              </Text>
              <Text style={styles.summaryNet}>{formatCurrency(s.net)}</Text>
              <Text style={styles.summaryVat}>{formatCurrency(s.vat)}</Text>
              <Text style={styles.summaryGross}>
                {formatCurrency(s.gross)}
              </Text>
            </View>
          ))}
          <View style={styles.summaryTotalRow}>
            <Text style={styles.summaryTotalLabel}>Gesamt</Text>
            <Text style={styles.summaryTotalValue}>
              {formatCurrency(summary.totalNet)}
            </Text>
            <Text style={styles.summaryTotalVat}>
              {formatCurrency(summary.totalVat)}
            </Text>
            <Text style={styles.summaryTotalValue}>
              {formatCurrency(summary.totalGross)}
            </Text>
          </View>
        </View>

        {/* Footer */}
        {tenantConfig && <FusszeilePdf config={tenantConfig} />}

        <Text
          style={styles.pageNumber}
          render={({ pageNumber, totalPages }) =>
            `Seite ${pageNumber} von ${totalPages}`
          }
          fixed
        />
      </Page>
    </Document>
  )
}
