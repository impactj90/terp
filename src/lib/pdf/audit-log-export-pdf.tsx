import React from "react"
import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer"
import { FusszeilePdf } from "./fusszeile-pdf"

// 1mm = 2.835pt
const MM = 2.835

const styles = StyleSheet.create({
  page: {
    paddingTop: 15 * MM,
    paddingBottom: 18 * MM,
    paddingHorizontal: 15 * MM,
    fontFamily: "Helvetica",
    fontSize: 7,
  },
  title: { fontSize: 14, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  filterBlock: {
    marginBottom: 10,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  filterItem: { width: "30%" },
  filterLabel: { fontSize: 7, color: "#666", marginBottom: 1 },
  filterValue: { fontSize: 8 },
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
  tableRowAlt: {
    backgroundColor: "#f9f9f9",
  },
  // Column widths (total = 100%)
  colTimestamp: { width: "12%", fontSize: 7 },
  colUser: { width: "13%", fontSize: 7 },
  colAction: { width: "8%", fontSize: 7 },
  colEntityType: { width: "10%", fontSize: 7 },
  colEntityId: { width: "12%", fontSize: 6 },
  colEntityName: { width: "15%", fontSize: 7 },
  colChanges: { width: "22%", fontSize: 6 },
  colIpAddress: { width: "8%", fontSize: 6 },
  headerText: { fontSize: 6, fontFamily: "Helvetica-Bold", color: "#666" },
  pageNumber: {
    position: "absolute",
    bottom: 12 * MM,
    right: 15 * MM,
    fontSize: 7,
    color: "#999",
  },
})

function formatDateTime(date: Date | string): string {
  const d = new Date(date)
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(d)
}

function formatDate(date: Date | string | undefined): string {
  if (!date) return ""
  return new Intl.DateTimeFormat("de-DE").format(new Date(date))
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text
  return text.slice(0, maxLen) + "..."
}

export interface AuditLogExportPdfProps {
  entries: Array<{
    performedAt: Date | string
    userName: string
    action: string
    entityType: string
    entityId: string
    entityName: string | null
    changes: string
    ipAddress: string | null
  }>
  filters: {
    fromDate?: string
    toDate?: string
    userId?: string
    userName?: string
    entityType?: string
    action?: string
  }
  exportedAt: Date
  exportedBy: string
  totalCount: number
  tenantConfig: unknown
}

export function AuditLogExportPdf({
  entries,
  filters,
  exportedAt,
  exportedBy,
  totalCount,
  tenantConfig,
}: AuditLogExportPdfProps) {
  const config = (tenantConfig ?? {}) as Record<string, string | null>

  const zeitraum =
    filters.fromDate || filters.toDate
      ? `${formatDate(filters.fromDate)} - ${formatDate(filters.toDate)}`
      : "Alle"

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        {/* Title */}
        <Text style={styles.title}>Audit-Log Export</Text>

        {/* Filter info */}
        <View style={styles.filterBlock}>
          <View style={styles.filterItem}>
            <Text style={styles.filterLabel}>Zeitraum</Text>
            <Text style={styles.filterValue}>{zeitraum}</Text>
          </View>
          <View style={styles.filterItem}>
            <Text style={styles.filterLabel}>Entitaetstyp</Text>
            <Text style={styles.filterValue}>
              {filters.entityType ?? "Alle"}
            </Text>
          </View>
          <View style={styles.filterItem}>
            <Text style={styles.filterLabel}>Aktion</Text>
            <Text style={styles.filterValue}>{filters.action ?? "Alle"}</Text>
          </View>
          <View style={styles.filterItem}>
            <Text style={styles.filterLabel}>Exportiert am</Text>
            <Text style={styles.filterValue}>{formatDateTime(exportedAt)}</Text>
          </View>
          <View style={styles.filterItem}>
            <Text style={styles.filterLabel}>Exportiert von</Text>
            <Text style={styles.filterValue}>{exportedBy}</Text>
          </View>
          <View style={styles.filterItem}>
            <Text style={styles.filterLabel}>Anzahl</Text>
            <Text style={styles.filterValue}>
              {totalCount.toLocaleString("de-DE")} Eintraege
            </Text>
          </View>
        </View>

        {/* Table Header */}
        <View style={styles.tableHeader}>
          <Text style={[styles.colTimestamp, styles.headerText]}>
            Zeitstempel
          </Text>
          <Text style={[styles.colUser, styles.headerText]}>Benutzer</Text>
          <Text style={[styles.colAction, styles.headerText]}>Aktion</Text>
          <Text style={[styles.colEntityType, styles.headerText]}>
            Entitaetstyp
          </Text>
          <Text style={[styles.colEntityId, styles.headerText]}>
            Entitaets-ID
          </Text>
          <Text style={[styles.colEntityName, styles.headerText]}>
            Entitaetsname
          </Text>
          <Text style={[styles.colChanges, styles.headerText]}>
            Aenderungen
          </Text>
          <Text style={[styles.colIpAddress, styles.headerText]}>
            IP-Adresse
          </Text>
        </View>

        {/* Table Rows */}
        {entries.map((entry, i) => (
          <View
            key={i}
            style={[styles.tableRow, i % 2 === 1 ? styles.tableRowAlt : {}]}
            wrap={false}
          >
            <Text style={styles.colTimestamp}>
              {formatDateTime(entry.performedAt)}
            </Text>
            <Text style={styles.colUser}>{entry.userName}</Text>
            <Text style={styles.colAction}>{entry.action}</Text>
            <Text style={styles.colEntityType}>{entry.entityType}</Text>
            <Text style={styles.colEntityId}>
              {truncate(entry.entityId, 20)}
            </Text>
            <Text style={styles.colEntityName}>
              {truncate(entry.entityName ?? "", 30)}
            </Text>
            <Text style={styles.colChanges}>
              {truncate(entry.changes, 100)}
            </Text>
            <Text style={styles.colIpAddress}>{entry.ipAddress ?? ""}</Text>
          </View>
        ))}

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

        {/* Page numbers */}
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
