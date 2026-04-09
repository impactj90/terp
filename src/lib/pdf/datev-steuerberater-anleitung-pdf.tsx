import React from "react"
import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer"

// 1mm = 2.835pt
const MM = 2.835

const styles = StyleSheet.create({
  page: {
    paddingTop: 18 * MM,
    paddingBottom: 18 * MM,
    paddingHorizontal: 18 * MM,
    fontFamily: "Helvetica",
    fontSize: 9,
    lineHeight: 1.4,
  },
  header: { marginBottom: 12 },
  title: { fontSize: 18, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  subtitle: { fontSize: 11, color: "#555" },
  sectionTitle: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    marginTop: 10,
    marginBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#333",
    paddingBottom: 2,
  },
  paragraph: { marginBottom: 4 },
  bullet: { marginLeft: 10, marginBottom: 2 },
  label: { fontFamily: "Helvetica-Bold", fontSize: 9 },
  tableHeader: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#333",
    paddingBottom: 2,
    marginTop: 4,
    marginBottom: 2,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#ddd",
    paddingVertical: 2,
  },
  col1: { width: "15%", fontSize: 8 },
  col2: { width: "30%", fontSize: 8 },
  col3: { width: "20%", fontSize: 8 },
  col4: { width: "35%", fontSize: 8 },
  infoBox: {
    marginTop: 6,
    padding: 6,
    backgroundColor: "#f4f6fa",
    borderLeftWidth: 2,
    borderLeftColor: "#3a5a9c",
  },
  pageNumber: {
    position: "absolute",
    bottom: 12 * MM,
    right: 18 * MM,
    fontSize: 8,
    color: "#888",
  },
})

export interface DatevSteuerberaterAnleitungPdfProps {
  tenantName: string
  beraterNr: string | null
  mandantNumber: string | null
  activeTemplateName: string | null
  targetSystem: string | null
  wages: Array<{
    code: string
    name: string
    category: string
    terpSource: string
  }>
  contactName?: string | null
  contactEmail?: string | null
  generatedAt: Date
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date)
}

const TARGET_LABEL: Record<string, string> = {
  datev_lodas: "DATEV LODAS (ASCII-Import)",
  datev_lug: "DATEV Lohn und Gehalt (LuG)",
  lexware: "Lexware Lohn+Gehalt",
  sage: "SAGE HR",
  custom: "Universelle CSV",
}

export function DatevSteuerberaterAnleitungPdf({
  tenantName,
  beraterNr,
  mandantNumber,
  activeTemplateName,
  targetSystem,
  wages,
  contactName,
  contactEmail,
  generatedAt,
}: DatevSteuerberaterAnleitungPdfProps) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>Anleitung DATEV-Import aus Terp</Text>
          <Text style={styles.subtitle}>
            Mandant: {tenantName} — Erstellt am {formatDate(generatedAt)}
          </Text>
        </View>

        <View>
          <Text style={styles.sectionTitle}>1. Einführung</Text>
          <Text style={styles.paragraph}>
            Terp liefert die monatlichen Lohndaten als vorkonfigurierte Datei
            für Ihr Lohnabrechnungssystem. Die Datei enthält keine fertigen
            Brutto-Netto-Werte — Terp ist ausschliesslich Datenlieferant. Die
            steuerliche Bewertung, SV-Beiträge und Lohnsteuer berechnet Ihr
            DATEV-System.
          </Text>
        </View>

        <View>
          <Text style={styles.sectionTitle}>2. Schnittstellen-Konfiguration</Text>
          <View style={styles.bullet}>
            <Text>
              <Text style={styles.label}>BeraterNr: </Text>
              {beraterNr ?? "— nicht konfiguriert —"}
            </Text>
          </View>
          <View style={styles.bullet}>
            <Text>
              <Text style={styles.label}>MandantenNr: </Text>
              {mandantNumber ?? "— nicht konfiguriert —"}
            </Text>
          </View>
          <View style={styles.bullet}>
            <Text>
              <Text style={styles.label}>Aktives Template: </Text>
              {activeTemplateName ?? "— kein Default gesetzt —"}
            </Text>
          </View>
          <View style={styles.bullet}>
            <Text>
              <Text style={styles.label}>Zielsystem: </Text>
              {targetSystem ? TARGET_LABEL[targetSystem] ?? targetSystem : "—"}
            </Text>
          </View>
        </View>

        <View>
          <Text style={styles.sectionTitle}>3. Template-Anpassung</Text>
          <Text style={styles.paragraph}>
            Das Export-Template ist eine Liquid-Vorlage im Bereich
            "Export-Templates" in Terp. Der Implementierungspartner oder der
            Steuerberater kann das Template ohne Software-Release anpassen:
            Spaltenreihenfolge, Feldlängen, Lohnart-Zuordnung, Kommentar-Zeilen.
            Jede Änderung erzeugt automatisch eine neue Version, ältere
            Versionen bleiben im Versionsarchiv lesbar.
          </Text>
          <View style={styles.infoBox}>
            <Text>
              Wichtig: Ändern Sie nie den Header [Allgemein] / Ziel=LODAS des
              Templates ohne Rücksprache — sonst wird die Datei von DATEV
              abgewiesen.
            </Text>
          </View>
        </View>

        <View>
          <Text style={styles.sectionTitle}>4. Schritt-für-Schritt Import in DATEV LODAS</Text>
          <View style={styles.bullet}>
            <Text>1. In Terp: Admin → Payroll-Exports → Monat wählen → "Export generieren" → Template auswählen → Datei herunterladen.</Text>
          </View>
          <View style={styles.bullet}>
            <Text>2. In DATEV LODAS öffnen: Mandant → Daten übernehmen → ASCII-Import.</Text>
          </View>
          <View style={styles.bullet}>
            <Text>3. Datei auswählen (.txt). LODAS prüft die Kopfsätze und meldet Fehler zeilenweise.</Text>
          </View>
          <View style={styles.bullet}>
            <Text>4. Probeimport durchführen, dann produktiv buchen.</Text>
          </View>
          <View style={styles.bullet}>
            <Text>5. Bei Fehlern: Zeile mit Personalnummer im Terp-Mitarbeiter öffnen, Feld korrigieren, Export neu generieren.</Text>
          </View>
        </View>

        <View>
          <Text style={styles.sectionTitle}>5. Lohnart-Mapping</Text>
          <Text style={styles.paragraph}>
            Die folgende Tabelle zeigt das aktuelle Lohnart-Mapping dieses
            Mandanten. Jede Zeile entspricht einer Lohnart in DATEV. Bei
            Abweichungen kann das Mapping in Terp unter "Lohnart-Mapping"
            angepasst werden.
          </Text>
          <View style={styles.tableHeader}>
            <Text style={[styles.col1, styles.label]}>Code</Text>
            <Text style={[styles.col2, styles.label]}>Bezeichnung</Text>
            <Text style={[styles.col3, styles.label]}>Kategorie</Text>
            <Text style={[styles.col4, styles.label]}>Terp-Quelle</Text>
          </View>
          {wages.map((w) => (
            <View key={w.code} style={styles.tableRow}>
              <Text style={styles.col1}>{w.code}</Text>
              <Text style={styles.col2}>{w.name}</Text>
              <Text style={styles.col3}>{w.category}</Text>
              <Text style={styles.col4}>{w.terpSource}</Text>
            </View>
          ))}
        </View>

        <View>
          <Text style={styles.sectionTitle}>6. Ansprechpartner</Text>
          <Text style={styles.paragraph}>
            {contactName ?? "— kein Ansprechpartner hinterlegt —"}
            {contactEmail ? ` — ${contactEmail}` : ""}
          </Text>
        </View>

        <Text
          style={styles.pageNumber}
          render={({ pageNumber, totalPages }) =>
            `Seite ${pageNumber} / ${totalPages}`
          }
          fixed
        />
      </Page>
    </Document>
  )
}
