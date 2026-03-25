import React from "react"
import { View, Text, StyleSheet } from "@react-pdf/renderer"

const styles = StyleSheet.create({
  table: { marginBottom: 8 },
  headerRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#999",
    paddingBottom: 4,
    marginBottom: 4,
  },
  row: {
    flexDirection: "row",
    paddingVertical: 2,
    borderBottomWidth: 0.25,
    borderBottomColor: "#eee",
  },
  textRow: {
    paddingVertical: 2,
  },
  colPos: { width: "5%", fontSize: 8 },
  colArtNr: { width: "12%", fontSize: 8 },
  colDesc: { width: "27%", fontSize: 8 },
  colQty: { width: "8%", fontSize: 8, textAlign: "right" },
  colUnit: { width: "7%", fontSize: 8, textAlign: "center" },
  colPrice: { width: "14%", fontSize: 8, textAlign: "right" },
  colFlat: { width: "12%", fontSize: 8, textAlign: "right" },
  colTotal: { width: "15%", fontSize: 8, textAlign: "right" },
  headerText: { fontSize: 7, fontFamily: "Helvetica-Bold", color: "#666" },
})

function formatCurrency(value: number | null | undefined): string {
  if (value == null) return ""
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(value)
}

function formatNumber(value: number | null | undefined): string {
  if (value == null) return ""
  return new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value)
}

export interface PurchaseOrderPosition {
  sortOrder: number
  positionType: string
  supplierArticleNumber: string | null
  description: string | null
  freeText: string | null
  quantity: number | null
  unit: string | null
  unitPrice: number | null
  flatCosts: number | null
  totalPrice: number | null
}

export function PurchaseOrderPositionTablePdf({
  positions,
}: {
  positions: PurchaseOrderPosition[]
}) {
  return (
    <View style={styles.table}>
      {/* Header row */}
      <View style={styles.headerRow}>
        <Text style={[styles.colPos, styles.headerText]}>Pos</Text>
        <Text style={[styles.colArtNr, styles.headerText]}>Art.-Nr. (Lief.)</Text>
        <Text style={[styles.colDesc, styles.headerText]}>Bezeichnung</Text>
        <Text style={[styles.colQty, styles.headerText]}>Menge</Text>
        <Text style={[styles.colUnit, styles.headerText]}>Einheit</Text>
        <Text style={[styles.colPrice, styles.headerText]}>Einzelpreis</Text>
        <Text style={[styles.colFlat, styles.headerText]}>Fixkosten</Text>
        <Text style={[styles.colTotal, styles.headerText]}>Gesamtpreis</Text>
      </View>

      {positions.map((pos, idx) => {
        if (pos.positionType === "TEXT") {
          return (
            <View key={idx} style={styles.textRow}>
              <Text style={{ fontSize: 8, color: "#666" }}>
                {pos.freeText || pos.description}
              </Text>
            </View>
          )
        }

        return (
          <View key={idx} style={styles.row}>
            <Text style={styles.colPos}>{pos.sortOrder + 1}</Text>
            <Text style={styles.colArtNr}>{pos.supplierArticleNumber ?? ""}</Text>
            <Text style={styles.colDesc}>
              {pos.description || pos.freeText || ""}
            </Text>
            <Text style={styles.colQty}>{formatNumber(pos.quantity)}</Text>
            <Text style={styles.colUnit}>{pos.unit ?? ""}</Text>
            <Text style={styles.colPrice}>{formatCurrency(pos.unitPrice)}</Text>
            <Text style={styles.colFlat}>{formatCurrency(pos.flatCosts)}</Text>
            <Text style={styles.colTotal}>{formatCurrency(pos.totalPrice)}</Text>
          </View>
        )
      })}
    </View>
  )
}
