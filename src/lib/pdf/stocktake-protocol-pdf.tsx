import React from "react"
import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer"
import { FusszeilePdf } from "./fusszeile-pdf"

// 1mm = 2.835pt
const MM = 2.835

const styles = StyleSheet.create({
  page: {
    paddingTop: 20 * MM,
    paddingBottom: 18 * MM,
    paddingHorizontal: 20 * MM,
    fontFamily: "Helvetica",
    fontSize: 9,
  },
  title: { fontSize: 16, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  subtitle: { fontSize: 10, color: "#666", marginBottom: 16 },
  metaBlock: { marginBottom: 12, flexDirection: "row", flexWrap: "wrap", gap: 10 },
  metaItem: { width: "45%" },
  metaLabel: { fontSize: 8, color: "#666", marginBottom: 1 },
  metaValue: { fontSize: 10 },
  summaryBlock: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 16,
    paddingVertical: 8,
    borderTopWidth: 0.5,
    borderBottomWidth: 0.5,
    borderColor: "#ccc",
  },
  summaryItem: { flex: 1, alignItems: "center" },
  summaryValue: { fontSize: 14, fontFamily: "Helvetica-Bold" },
  summaryLabel: { fontSize: 7, color: "#666", marginTop: 2 },
  tableHeader: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#333",
    paddingBottom: 3,
    marginBottom: 3,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#ddd",
    paddingVertical: 2,
    minHeight: 14,
  },
  tableRowDiff: {
    backgroundColor: "#fff3f3",
  },
  colNum: { width: "10%", fontSize: 8, fontFamily: "Helvetica-Bold" },
  colName: { width: "22%", fontSize: 8 },
  colUnit: { width: "6%", fontSize: 8, textAlign: "center" },
  colLocation: { width: "12%", fontSize: 8 },
  colExpected: { width: "10%", fontSize: 8, textAlign: "right" },
  colCounted: { width: "10%", fontSize: 8, textAlign: "right" },
  colDiff: { width: "10%", fontSize: 8, textAlign: "right" },
  colValue: { width: "10%", fontSize: 8, textAlign: "right" },
  colNote: { width: "10%", fontSize: 7 },
  headerText: { fontSize: 7, fontFamily: "Helvetica-Bold", color: "#666" },
  signatureBlock: {
    marginTop: 30,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  signatureItem: { width: "40%" },
  signatureLine: {
    borderBottomWidth: 0.5,
    borderBottomColor: "#333",
    marginBottom: 4,
    height: 30,
  },
  signatureLabel: { fontSize: 7, color: "#666" },
})

function formatDate(date: Date | string | null | undefined): string {
  if (!date) return ""
  return new Intl.DateTimeFormat("de-DE").format(new Date(date))
}

function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined) return "-"
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(value)
}

export interface StocktakeProtocolPdfProps {
  stocktake: {
    number: string
    name: string
    referenceDate: Date | string
    completedAt: Date | string | null
    notes: string | null
    createdBy?: string | null
    completedBy?: string | null
  }
  positions: Array<{
    articleNumber: string
    articleName: string
    unit: string
    warehouseLocation: string | null
    expectedQuantity: number
    countedQuantity: number | null
    difference: number | null
    valueDifference: number | null
    skipped: boolean
    skipReason: string | null
    note: string | null
  }>
  summary: {
    totalPositions: number
    countedPositions: number
    skippedPositions: number
    positionsWithDifference: number
    totalDifference: number
    totalValueDifference: number
  }
  tenantConfig: unknown
}

export function StocktakeProtocolPdf({
  stocktake,
  positions,
  summary,
  tenantConfig,
}: StocktakeProtocolPdfProps) {
  const config = (tenantConfig ?? {}) as Record<string, string | null>

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Title */}
        <Text style={styles.title}>Inventurprotokoll</Text>
        <Text style={styles.subtitle}>
          {stocktake.number} - {stocktake.name}
        </Text>

        {/* Meta */}
        <View style={styles.metaBlock}>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Inventur-Nr.</Text>
            <Text style={styles.metaValue}>{stocktake.number}</Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Bezeichnung</Text>
            <Text style={styles.metaValue}>{stocktake.name}</Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Stichtag</Text>
            <Text style={styles.metaValue}>
              {formatDate(stocktake.referenceDate)}
            </Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Abgeschlossen am</Text>
            <Text style={styles.metaValue}>
              {formatDate(stocktake.completedAt)}
            </Text>
          </View>
        </View>

        {/* Summary */}
        <View style={styles.summaryBlock}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>{summary.totalPositions}</Text>
            <Text style={styles.summaryLabel}>Positionen</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>{summary.countedPositions}</Text>
            <Text style={styles.summaryLabel}>Gezaehlt</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>{summary.skippedPositions}</Text>
            <Text style={styles.summaryLabel}>Uebersprungen</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>
              {summary.positionsWithDifference}
            </Text>
            <Text style={styles.summaryLabel}>Mit Differenz</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>
              {formatCurrency(summary.totalValueDifference)}
            </Text>
            <Text style={styles.summaryLabel}>Wertdifferenz</Text>
          </View>
        </View>

        {/* Position Table Header */}
        <View style={styles.tableHeader}>
          <Text style={[styles.colNum, styles.headerText]}>Art.-Nr.</Text>
          <Text style={[styles.colName, styles.headerText]}>Bezeichnung</Text>
          <Text style={[styles.colUnit, styles.headerText]}>Einh.</Text>
          <Text style={[styles.colLocation, styles.headerText]}>Lagerort</Text>
          <Text style={[styles.colExpected, styles.headerText]}>Soll</Text>
          <Text style={[styles.colCounted, styles.headerText]}>Ist</Text>
          <Text style={[styles.colDiff, styles.headerText]}>Diff.</Text>
          <Text style={[styles.colValue, styles.headerText]}>Wertdiff.</Text>
          <Text style={[styles.colNote, styles.headerText]}>Bemerkung</Text>
        </View>

        {/* Position Table Rows */}
        {positions.map((pos, i) => {
          const hasDiff = pos.difference !== null && pos.difference !== 0
          return (
            <View
              key={i}
              style={[styles.tableRow, hasDiff ? styles.tableRowDiff : {}]}
            >
              <Text style={styles.colNum}>{pos.articleNumber}</Text>
              <Text style={styles.colName}>{pos.articleName}</Text>
              <Text style={styles.colUnit}>{pos.unit}</Text>
              <Text style={styles.colLocation}>
                {pos.warehouseLocation ?? ""}
              </Text>
              <Text style={styles.colExpected}>
                {pos.expectedQuantity}
              </Text>
              <Text style={styles.colCounted}>
                {pos.skipped
                  ? "---"
                  : pos.countedQuantity !== null
                  ? String(pos.countedQuantity)
                  : "-"}
              </Text>
              <Text style={styles.colDiff}>
                {pos.difference !== null
                  ? (pos.difference > 0 ? "+" : "") + pos.difference
                  : "-"}
              </Text>
              <Text style={styles.colValue}>
                {formatCurrency(pos.valueDifference)}
              </Text>
              <Text style={styles.colNote}>
                {pos.skipped
                  ? pos.skipReason ?? "uebersprungen"
                  : pos.note ?? ""}
              </Text>
            </View>
          )
        })}

        {/* Notes */}
        {stocktake.notes && (
          <View style={{ marginTop: 12 }}>
            <Text
              style={{ fontSize: 8, fontFamily: "Helvetica-Bold", marginBottom: 3 }}
            >
              Anmerkungen
            </Text>
            <Text style={{ fontSize: 8 }}>{stocktake.notes}</Text>
          </View>
        )}

        {/* Signature Block */}
        <View style={styles.signatureBlock}>
          <View style={styles.signatureItem}>
            <View style={styles.signatureLine} />
            <Text style={styles.signatureLabel}>Erstellt von / Datum</Text>
          </View>
          <View style={styles.signatureItem}>
            <View style={styles.signatureLine} />
            <Text style={styles.signatureLabel}>Geprueft von / Datum</Text>
          </View>
        </View>

        {/* Footer */}
        <FusszeilePdf
          config={{
            companyName: config.companyName,
            companyAddress: config.companyAddress,
            phone: config.phone,
            email: config.email,
            bankName: config.bankName,
            iban: config.iban,
            bic: config.bic,
            taxId: config.taxId,
            commercialRegister: config.commercialRegister,
            managingDirector: config.managingDirector,
          }}
        />
      </Page>
    </Document>
  )
}
