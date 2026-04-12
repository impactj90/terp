import React from "react"
import { View, Text, StyleSheet } from "@react-pdf/renderer"

// 1mm ≈ 2.835pt
const MM = 2.835

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 10 * MM,
    left: 25 * MM,
    right: 25 * MM,
    borderTopWidth: 0.5,
    borderTopColor: "#ccc",
    paddingTop: 6,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  column: { fontSize: 7, color: "#666" },
  bold: { fontFamily: "Helvetica-Bold", fontSize: 7, color: "#666" },
})

interface FusszeileConfig {
  companyName?: string | null
  companyAddress?: string | null
  phone?: string | null
  email?: string | null
  bankName?: string | null
  iban?: string | null
  bic?: string | null
  taxId?: string | null
  commercialRegister?: string | null
  managingDirector?: string | null
}

export function FusszeilePdf({ config }: { config: FusszeileConfig }) {
  return (
    <View style={styles.container}>
      <View>
        {config.companyName && <Text style={styles.bold}>{config.companyName}</Text>}
        {config.companyAddress?.split("\n").map((line, i) => (
          <Text key={i} style={styles.column}>{line}</Text>
        ))}
        {config.phone && <Text style={styles.column}>Tel: {config.phone}</Text>}
        {config.email && <Text style={styles.column}>{config.email}</Text>}
      </View>
      <View>
        {config.bankName && <Text style={styles.column}>{config.bankName}</Text>}
        {config.iban && <Text style={styles.column}>IBAN: {config.iban}</Text>}
        {config.bic && <Text style={styles.column}>BIC: {config.bic}</Text>}
      </View>
      <View>
        {config.taxId && <Text style={styles.column}>USt-IdNr.: {config.taxId}</Text>}
        {config.commercialRegister && <Text style={styles.column}>{config.commercialRegister}</Text>}
        {config.managingDirector && <Text style={styles.column}>GF: {config.managingDirector}</Text>}
      </View>
    </View>
  )
}
