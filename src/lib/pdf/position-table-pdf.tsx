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
  subtotalRow: {
    flexDirection: "row",
    paddingVertical: 3,
    borderTopWidth: 0.5,
    borderTopColor: "#999",
    marginTop: 2,
  },
  textRow: {
    paddingVertical: 2,
  },
  colPos: { width: "6%", fontSize: 8 },
  colDesc: { width: "40%", fontSize: 8 },
  colQty: { width: "10%", fontSize: 8, textAlign: "right" },
  colUnit: { width: "8%", fontSize: 8, textAlign: "center" },
  colPrice: { width: "16%", fontSize: 8, textAlign: "right" },
  colTotal: { width: "20%", fontSize: 8, textAlign: "right" },
  headerText: { fontSize: 7, fontFamily: "Helvetica-Bold", color: "#666" },
  bold: { fontFamily: "Helvetica-Bold" },
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

interface Position {
  sortOrder: number
  type: string
  description?: string | null
  quantity?: number | null
  unit?: string | null
  unitPrice?: number | null
  totalPrice?: number | null
  vatRate?: number | null
}

export function PositionTablePdf({ positions }: { positions: Position[] }) {
  return (
    <View style={styles.table}>
      {/* Header row */}
      <View style={styles.headerRow}>
        <Text style={[styles.colPos, styles.headerText]}>Pos</Text>
        <Text style={[styles.colDesc, styles.headerText]}>Beschreibung</Text>
        <Text style={[styles.colQty, styles.headerText]}>Menge</Text>
        <Text style={[styles.colUnit, styles.headerText]}>Einheit</Text>
        <Text style={[styles.colPrice, styles.headerText]}>Einzelpreis</Text>
        <Text style={[styles.colTotal, styles.headerText]}>Gesamt</Text>
      </View>

      {positions.map((pos, idx) => {
        if (pos.type === "PAGE_BREAK") return null

        if (pos.type === "TEXT") {
          return (
            <View key={idx} style={styles.textRow}>
              <Text style={{ fontSize: 8, color: "#666" }}>{pos.description}</Text>
            </View>
          )
        }

        if (pos.type === "SUBTOTAL") {
          return (
            <View key={idx} style={styles.subtotalRow}>
              <Text style={[styles.colPos, styles.bold]}></Text>
              <Text style={[styles.colDesc, styles.bold]}>Zwischensumme</Text>
              <Text style={styles.colQty}></Text>
              <Text style={styles.colUnit}></Text>
              <Text style={styles.colPrice}></Text>
              <Text style={[styles.colTotal, styles.bold]}>{formatCurrency(pos.totalPrice)}</Text>
            </View>
          )
        }

        return (
          <View key={idx} style={styles.row}>
            <Text style={styles.colPos}>{pos.sortOrder}</Text>
            <Text style={styles.colDesc}>{pos.description}</Text>
            <Text style={styles.colQty}>{formatNumber(pos.quantity)}</Text>
            <Text style={styles.colUnit}>{pos.unit ?? ""}</Text>
            <Text style={styles.colPrice}>{formatCurrency(pos.unitPrice)}</Text>
            <Text style={styles.colTotal}>{formatCurrency(pos.totalPrice)}</Text>
          </View>
        )
      })}
    </View>
  )
}
