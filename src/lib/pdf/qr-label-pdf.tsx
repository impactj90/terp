/**
 * QR Label PDF Component
 *
 * Renders A4 pages filled with QR code labels in Avery Zweckform format.
 * Each label contains: QR code image + article number + name + unit.
 *
 * Supported formats:
 * - AVERY_L4736: 45.7 x 21.2mm, 4 columns x 12 rows = 48 per page
 * - AVERY_L4731: 25.4 x 10mm, 7 columns x 27 rows = 189 per page
 */
import React from "react"
import {
  Document,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
} from "@react-pdf/renderer"

// 1mm = 2.835pt
const MM = 2.835

// --- Label Format Definitions ---

const LABEL_FORMATS = {
  AVERY_L4736: {
    // Avery Zweckform L4736REV: 45.7 x 21.2mm, 4 columns x 12 rows = 48 per page
    pageWidth: 210,
    pageHeight: 297,
    labelWidth: 45.7,
    labelHeight: 21.2,
    cols: 4,
    rows: 12,
    marginTop: 10.7,
    marginLeft: 9.7,
    spacingX: 2.5,
    spacingY: 0,
    fontSize: 6,
    qrSize: 15, // mm
  },
  AVERY_L4731: {
    // Avery Zweckform L4731: 25.4 x 10mm, 7 columns x 27 rows = 189 per page
    pageWidth: 210,
    pageHeight: 297,
    labelWidth: 25.4,
    labelHeight: 10,
    cols: 7,
    rows: 27,
    marginTop: 13.5,
    marginLeft: 9.0,
    spacingX: 2.5,
    spacingY: 0,
    fontSize: 4,
    qrSize: 7, // mm
  },
} as const

export type LabelFormat = keyof typeof LABEL_FORMATS

export interface LabelData {
  qrDataUrl: string
  articleNumber: string
  articleName: string
  unit: string
}

interface QrLabelPdfProps {
  labels: LabelData[]
  format: LabelFormat
}

/**
 * QR Label PDF Document
 *
 * Renders A4 pages with QR code labels in a grid layout.
 */
export function QrLabelPdf({ labels, format }: QrLabelPdfProps) {
  const fmt = LABEL_FORMATS[format]
  const labelsPerPage = fmt.cols * fmt.rows

  // Split labels into pages
  const pages: LabelData[][] = []
  for (let i = 0; i < labels.length; i += labelsPerPage) {
    pages.push(labels.slice(i, i + labelsPerPage))
  }

  const styles = StyleSheet.create({
    page: {
      width: fmt.pageWidth * MM,
      height: fmt.pageHeight * MM,
      fontFamily: "Helvetica",
      fontSize: fmt.fontSize,
    },
    labelGrid: {
      position: "absolute",
      top: fmt.marginTop * MM,
      left: fmt.marginLeft * MM,
    },
    row: {
      flexDirection: "row",
      height: fmt.labelHeight * MM,
      marginBottom: fmt.spacingY * MM,
    },
    label: {
      width: fmt.labelWidth * MM,
      height: fmt.labelHeight * MM,
      marginRight: fmt.spacingX * MM,
      flexDirection: "row",
      alignItems: "center",
      overflow: "hidden",
      paddingHorizontal: 1 * MM,
      paddingVertical: 0.5 * MM,
    },
    qrImage: {
      width: fmt.qrSize * MM,
      height: fmt.qrSize * MM,
      marginRight: 1 * MM,
    },
    textBlock: {
      flex: 1,
      justifyContent: "center",
      overflow: "hidden",
    },
    articleNumber: {
      fontFamily: "Helvetica-Bold",
      fontSize: fmt.fontSize + 1,
      marginBottom: 0.5,
    },
    articleName: {
      fontSize: fmt.fontSize,
      color: "#333",
      marginBottom: 0.5,
    },
    unit: {
      fontSize: fmt.fontSize - 0.5,
      color: "#666",
    },
  })

  return (
    <Document>
      {pages.map((pageLabels, pageIndex) => (
        <Page key={pageIndex} size="A4" style={styles.page}>
          <View style={styles.labelGrid}>
            {Array.from({ length: fmt.rows }, (_, rowIndex) => {
              const rowLabels = pageLabels.slice(
                rowIndex * fmt.cols,
                (rowIndex + 1) * fmt.cols
              )
              if (rowLabels.length === 0) return null
              return (
                <View key={rowIndex} style={styles.row}>
                  {rowLabels.map((label, colIndex) => (
                    <View key={colIndex} style={styles.label}>
                      <Image src={label.qrDataUrl} style={styles.qrImage} />
                      <View style={styles.textBlock}>
                        <Text style={styles.articleNumber}>
                          {label.articleNumber}
                        </Text>
                        <Text style={styles.articleName}>
                          {label.articleName.length > 30
                            ? label.articleName.substring(0, 27) + "..."
                            : label.articleName}
                        </Text>
                        <Text style={styles.unit}>{label.unit}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              )
            })}
          </View>
        </Page>
      ))}
    </Document>
  )
}
