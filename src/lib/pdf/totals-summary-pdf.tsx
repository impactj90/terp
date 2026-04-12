import React from "react"
import { View, Text, StyleSheet } from "@react-pdf/renderer"

const styles = StyleSheet.create({
  container: { alignItems: "flex-end", marginTop: 8 },
  block: { width: 180 },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  label: { fontSize: 9, color: "#666" },
  value: { fontSize: 9 },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 3,
    borderTopWidth: 0.5,
    borderTopColor: "#999",
    marginTop: 2,
  },
  totalLabel: { fontSize: 10, fontFamily: "Helvetica-Bold" },
  totalValue: { fontSize: 10, fontFamily: "Helvetica-Bold" },
})

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(value)
}

interface TotalsSummaryPdfProps {
  subtotalNet: number
  totalVat: number
  totalGross: number
}

export function TotalsSummaryPdf({ subtotalNet, totalVat, totalGross }: TotalsSummaryPdfProps) {
  return (
    <View style={styles.container}>
      <View style={styles.block}>
        <View style={styles.row}>
          <Text style={styles.label}>Netto</Text>
          <Text style={styles.value}>{formatCurrency(subtotalNet)}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>MwSt</Text>
          <Text style={styles.value}>{formatCurrency(totalVat)}</Text>
        </View>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Brutto</Text>
          <Text style={styles.totalValue}>{formatCurrency(totalGross)}</Text>
        </View>
      </View>
    </View>
  )
}
