import React from "react"
import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer"
import { FusszeilePdf } from "./fusszeile-pdf"

// 1mm ≈ 2.835pt
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

  sectionBlock: { marginTop: 12, marginBottom: 8 },
  sectionLabel: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    marginBottom: 4,
    color: "#333",
  },
  sectionText: { fontSize: 9, lineHeight: 1.4 },

  assignmentRow: {
    flexDirection: "row",
    paddingVertical: 2,
    borderBottomWidth: 0.25,
    borderBottomColor: "#ddd",
  },
  assignmentHeaderRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#999",
    paddingBottom: 3,
    marginBottom: 2,
  },
  colName: { width: "45%", fontSize: 9 },
  colPersonnel: { width: "25%", fontSize: 9 },
  colRole: { width: "30%", fontSize: 9 },
  headerCell: { fontSize: 9, color: "#666" },

  signatureBlock: {
    position: "absolute",
    bottom: 45 * MM,
    left: 25 * MM,
    right: 25 * MM,
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
  signatureImage: {
    maxHeight: 40,
    maxWidth: 250,
    marginBottom: 4,
  },
  signatureMeta: { marginTop: 6, fontSize: 8, color: "#333" },
  signatureMetaText: { marginBottom: 2 },

  voidOverlay: {
    position: "absolute",
    top: "30%",
    left: 0,
    right: 0,
    fontSize: 48,
    color: "#dc2626",
    opacity: 0.5,
    textAlign: "center",
    transform: "rotate(-30deg)",
    fontFamily: "Helvetica-Bold",
  },
  voidReasonBlock: {
    position: "absolute",
    top: "50%",
    left: 25 * MM,
    right: 25 * MM,
    padding: 8,
    backgroundColor: "#fff7f7",
    borderWidth: 1,
    borderColor: "#dc2626",
    opacity: 0.95,
  },
  voidReasonLabel: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: "#dc2626",
    marginBottom: 4,
  },
  voidReasonText: { fontSize: 9, color: "#333" },
})

function formatDate(date: Date | string | null | undefined): string {
  if (!date) return ""
  return new Intl.DateTimeFormat("de-DE").format(new Date(date))
}

function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return ""
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date))
}

export interface WorkReportPdfProps {
  report: {
    code: string
    visitDate: Date | string
    travelMinutes: number | null
    workDescription: string | null
    status: "DRAFT" | "SIGNED" | "VOID"
    signedAt: Date | string | null
    signerName: string | null
    signerRole: string | null
    signerIpHash: string | null
    voidedAt: Date | string | null
    voidReason: string | null
  }
  order: {
    code: string
    name: string
    customer: string | null
  } | null
  serviceObject: {
    number: string
    name: string
    kind: string
  } | null
  assignments: {
    firstName: string
    lastName: string
    personnelNumber: string | null
    role: string | null
  }[]
  /**
   * Base64-encoded PNG data URL (e.g. "data:image/png;base64,...") used by
   * the SIGNED renderer. Ignored when status !== "SIGNED".
   */
  signatureDataUrl: string | null
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

export function WorkReportPdf({
  report,
  order,
  serviceObject,
  assignments,
  signatureDataUrl,
  tenantConfig,
}: WorkReportPdfProps) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Absender-Zeile */}
        {tenantConfig?.companyName && (
          <Text style={styles.senderLine}>
            {tenantConfig.companyName}
            {tenantConfig.companyAddress
              ? ` · ${tenantConfig.companyAddress.replace(/\n/g, " · ")}`
              : ""}
          </Text>
        )}

        {/* Logo (top-right) */}
        {tenantConfig?.logoUrl && (
          <Image src={tenantConfig.logoUrl} style={styles.logo} />
        )}

        {/* Kunde (Empfänger) */}
        {order?.customer && (
          <View style={styles.recipientBlock}>
            <Text style={styles.recipientText}>{order.customer}</Text>
          </View>
        )}

        {/* Beleg-Info */}
        <View style={styles.docInfoBlock}>
          <Text style={styles.docTitle}>ARBEITSSCHEIN</Text>
          <Text style={styles.docInfoText}>Nr.: {report.code}</Text>
          <Text style={styles.docInfoText}>
            Einsatzdatum: {formatDate(report.visitDate)}
          </Text>
          {order && (
            <Text style={styles.docInfoText}>
              Auftrag: {order.code} — {order.name}
            </Text>
          )}
          {serviceObject && (
            <Text style={styles.docInfoText}>
              Serviceobjekt: {serviceObject.number} — {serviceObject.name}
            </Text>
          )}
          {report.travelMinutes !== null && (
            <Text style={styles.docInfoText}>
              Anfahrtszeit: {report.travelMinutes} Minuten
            </Text>
          )}
        </View>

        {/* Mitarbeiter */}
        {assignments.length > 0 && (
          <View style={styles.sectionBlock}>
            <Text style={styles.sectionLabel}>Mitarbeiter</Text>
            <View style={styles.assignmentHeaderRow}>
              <Text style={[styles.colName, styles.headerCell]}>Name</Text>
              <Text style={[styles.colPersonnel, styles.headerCell]}>
                Personalnummer
              </Text>
              <Text style={[styles.colRole, styles.headerCell]}>Rolle</Text>
            </View>
            {assignments.map((a, idx) => (
              <View key={idx} style={styles.assignmentRow}>
                <Text style={styles.colName}>
                  {[a.firstName, a.lastName].filter(Boolean).join(" ")}
                </Text>
                <Text style={styles.colPersonnel}>
                  {a.personnelNumber ?? ""}
                </Text>
                <Text style={styles.colRole}>{a.role ?? ""}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Arbeitsbeschreibung */}
        {report.workDescription && (
          <View style={styles.sectionBlock}>
            <Text style={styles.sectionLabel}>Arbeitsbeschreibung</Text>
            <Text style={styles.sectionText}>{report.workDescription}</Text>
          </View>
        )}

        {/* Signatur-Block */}
        <View style={styles.signatureBlock}>
          {report.status === "SIGNED" && signatureDataUrl ? (
            <>
              <Image src={signatureDataUrl} style={styles.signatureImage} />
              <View style={styles.signatureLine} />
              <View style={styles.signatureLabels}>
                <Text style={styles.signatureLabel}>Ort, Datum</Text>
                <Text style={styles.signatureLabel}>Unterschrift</Text>
              </View>
              <View style={styles.signatureMeta}>
                {report.signerName && (
                  <Text style={styles.signatureMetaText}>
                    Unterzeichner: {report.signerName}
                    {report.signerRole ? ` (${report.signerRole})` : ""}
                  </Text>
                )}
                {report.signedAt && (
                  <Text style={styles.signatureMetaText}>
                    Signiert am: {formatDateTime(report.signedAt)}
                  </Text>
                )}
                {report.signerIpHash && (
                  <Text style={styles.signatureMetaText}>
                    Signatur erfasst von Gerät mit IP-Hash{" "}
                    {report.signerIpHash.slice(0, 8)}…
                  </Text>
                )}
              </View>
            </>
          ) : (
            <>
              <View style={styles.signatureLine} />
              <View style={styles.signatureLabels}>
                <Text style={styles.signatureLabel}>Ort, Datum</Text>
                <Text style={styles.signatureLabel}>Unterschrift</Text>
              </View>
            </>
          )}
        </View>

        {/* Storno-Overlay (VOID) */}
        {report.status === "VOID" && (
          <>
            <Text style={styles.voidOverlay}>STORNIERT</Text>
            <View style={styles.voidReasonBlock}>
              <Text style={styles.voidReasonLabel}>
                Storniert{" "}
                {report.voidedAt ? `am ${formatDateTime(report.voidedAt)}` : ""}
              </Text>
              {report.voidReason && (
                <Text style={styles.voidReasonText}>
                  Grund: {report.voidReason}
                </Text>
              )}
            </View>
          </>
        )}

        {/* Fußzeile (tenant config, absolute-positioned at bottom) */}
        {tenantConfig && <FusszeilePdf config={tenantConfig} />}
      </Page>
    </Document>
  )
}
