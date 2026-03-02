# ZMI-TICKET-142: E-Rechnung (XRechnung) — XML-Generierung & Validierung

Status: Proposed
Priority: P3
Owner: TBD
Epic: Phase 5 — PDF & Versand
Source: plancraft-anforderungen.md.pdf, Abschnitt 3.7 E-Rechnung (XRechnung)
Blocked by: ZMI-TICKET-140, ZMI-TICKET-132

## Goal
E-Rechnung nach XRechnung-Standard (EN 16931) implementieren. Seit 2025 Pflicht für B2B in der EU. Generierung von maschinenlesbarem XML, Validierung gegen XRechnung-Schema, Hybrid-PDF (XML eingebettet in PDF). Unterstützung für Leitweg-ID (öffentliche Auftraggeber).

## Scope
- **In scope:** XRechnung XML-Generierung (UBL 2.1 / CII), Schema-Validierung, Leitweg-ID-Feld, Hybrid-PDF (ZUGFeRD/Factur-X), §14 UStG Pflichtfelder.
- **Out of scope:** Empfang/Import von E-Rechnungen (Zukunft), PEPPOL-Netzwerk.

## Requirements

### XRechnung-Pflichtfelder
- Rechnungsnummer, Rechnungsdatum
- Verkäufer: Name, Adresse, Steuernummer/USt-IdNr.
- Käufer: Name, Adresse, Leitweg-ID (bei öffentlichen)
- Positionen: Bezeichnung, Menge, Einheit, EP, GP, MwSt-Satz
- Summen: Netto, MwSt (pro Satz), Brutto
- Zahlungsbedingungen: Zahlungsziel, Skonto, Bankverbindung

### Leitweg-ID
- Pflicht bei öffentlichen Auftraggebern
- Format: XX-XXXXXXXXXX-XX (Bundesland-Kennung)
- Feld auf `contacts`: `routing_id VARCHAR(30)`
- Validierung: Regex-Pattern

### Generierung
1. Dokument fertigstellen (Rechnung)
2. System generiert automatisch XML (parallel zum PDF)
3. XML wird in PDF eingebettet (ZUGFeRD/Factur-X Profil EN16931)
4. Oder separates XML zum Download

### Validierung
- Gegen XRechnung-Schema (Schematron-Regeln)
- Vor Versand validieren, Fehler anzeigen
- Häufige Fehler: fehlende USt-IdNr., falsche Einheiten-Codes (UN/ECE Empfehlung 20)

### Edge Cases
1. Empfänger unterstützt kein XRechnung → Fallback auf normales PDF.
2. Leitweg-ID fehlt bei öffentlichem Auftraggeber → Warnung.
3. Einheiten-Mapping: "m²" → "MTK" (UN/ECE Rec 20 Code).

### API / OpenAPI

| Method | Path | Beschreibung |
|--------|------|--------------|
| GET | /documents/{id}/xrechnung | XRechnung-XML herunterladen |
| POST | /documents/{id}/xrechnung/validate | XML validieren |
| GET | /documents/{id}/xrechnung/preview | XML-Vorschau (human-readable) |

### Permissions
- `documents.view` — XRechnung herunterladen

## Acceptance Criteria
1. XRechnung-XML wird bei Rechnungsfertigstellung generiert.
2. XML validiert gegen XRechnung-Schema.
3. Leitweg-ID wird korrekt eingebettet.
4. Hybrid-PDF (ZUGFeRD) generierbar.
5. Einheiten-Mapping (DE → UN/ECE).
6. Fallback auf normales PDF wenn nicht unterstützt.

## Tests

### Unit Tests
- `TestXRechnung_Generate_Valid`: Vollständige Rechnung → valides XML.
- `TestXRechnung_Generate_WithRoutingID`: Leitweg-ID eingebettet.
- `TestXRechnung_Generate_MixedVat`: 19% + 7% → korrekte XML-Struktur.
- `TestXRechnung_UnitMapping`: "m²" → "MTK", "Stk" → "C62", "h" → "HUR".
- `TestXRechnung_Validate_Valid`: Valides XML → no errors.
- `TestXRechnung_Validate_MissingVatID`: Fehlende USt-IdNr. → validation error.
- `TestXRechnung_Validate_MissingRoutingID`: Öffentlicher AG ohne Leitweg-ID → warning.
- `TestXRechnung_RoutingID_Format`: Gültige/ungültige Formate.
- `TestXRechnung_PaymentTerms`: Zahlungsziel + Skonto korrekt im XML.

### API Tests
- `TestXRechnungHandler_Download_200`: XML download.
- `TestXRechnungHandler_Download_404_NotInvoice`: Angebot → 404 (nur Rechnungen).
- `TestXRechnungHandler_Validate_200`: Validierung erfolgreich.
- `TestXRechnungHandler_Validate_200_WithErrors`: Validierungsfehler angezeigt.

### Integration Tests
- `TestXRechnung_EndToEnd`: Rechnung erstellen → Fertigstellen → XML generiert → Validierung bestanden.
- `TestXRechnung_HybridPDF`: PDF enthält eingebettetes XML.

### Test Case Pack
1) **Standard B2B Rechnung**: Rechnung mit USt-IdNr. → valides XRechnung-XML.
2) **Öffentlicher Auftraggeber**: Mit Leitweg-ID → im XML enthalten.
3) **Gemischte MwSt**: 19% + 7% → korrekte TaxTotal im XML.
4) **Einheiten**: m², Stk, h, psch. → korrekte UN/ECE Codes.

## Verification Checklist
- [ ] XRechnung XML-Generator implementiert
- [ ] UBL 2.1 oder CII Format
- [ ] Schema-Validierung
- [ ] Leitweg-ID-Feld auf contacts
- [ ] Einheiten-Mapping (DE → UN/ECE Rec 20)
- [ ] Hybrid-PDF (ZUGFeRD)
- [ ] Pflichtfeld-Prüfung
- [ ] Fallback auf normales PDF
- [ ] Tenant-Isolation
- [ ] Alle Tests bestehen

## Dependencies
- ZMI-TICKET-140 (PDF-Generierung)
- ZMI-TICKET-132 (Rechnungen)
- ZMI-TICKET-107 (Unternehmensdaten — USt-IdNr.)

## Notes
- XRechnung ist seit 2025 B2B-Pflicht in der EU. Wird immer wichtiger.
- Go-Bibliotheken: `github.com/nickvdyck/ubl-go` oder eigene XML-Generierung via encoding/xml.
- UN/ECE Recommendation 20: Einheiten-Code-Tabelle muss als Mapping implementiert werden.
- ZUGFeRD/Factur-X: PDF/A-3 mit eingebettetem XML. Bibliothek: `pdfcpu` für PDF/A-Konvertierung.
