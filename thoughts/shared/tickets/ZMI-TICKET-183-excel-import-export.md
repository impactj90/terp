# ZMI-TICKET-183: Excel Import/Export

Status: Proposed
Priority: P3
Owner: TBD
Epic: Phase 9 — Schnittstellen
Source: plancraft-anforderungen.md.pdf, Abschnitt 10.5 Excel Import/Export
Blocked by: ZMI-TICKET-101, ZMI-TICKET-121

## Goal
Excel/CSV Import und Export für verschiedene Datentypen: Kontakte, Leistungen/Material (eigenes Template), Zeiterfassungsdaten, Rechnungslisten.

## Scope
- **In scope:** Excel-Template-basierter Import (Kontakte, Artikel), Rechnungslisten-Export, Zeiterfassungs-Export.
- **Out of scope:** Kontakte-CSV-Import (ZMI-TICKET-102), DATANORM (ZMI-TICKET-105).

## Requirements

### Import-Templates
1. **Artikel/Leistungen**: Eigenes Excel-Template mit Spalten: Artikelnr, Kurztext, Langtext, Einheit, EK, VK, Kostenart, Kategorie
2. **Dokumenten-Positionen**: Positionen aus Excel in Dokument importieren

### Export-Formate
1. **Rechnungslisten**: Alle Rechnungen mit Status, Beträgen, Zahlungen
2. **Zeiterfassungsdaten**: Stunden pro Mitarbeiter/Projekt/Zeitraum
3. **Kontakte**: Alle Kontakte als Excel

### API / OpenAPI
| Method | Path | Beschreibung |
|--------|------|--------------|
| GET | /export/excel/invoices | Rechnungsliste als Excel |
| GET | /export/excel/time-entries | Zeiterfassung als Excel |
| GET | /export/excel/contacts | Kontakte als Excel |
| POST | /import/excel/articles | Artikel aus Excel importieren |
| POST | /import/excel/document-items | Positionen aus Excel |
| GET | /import/excel/templates/{type} | Template-Download |

### Permissions
- `export.excel`, `import.excel`

## Acceptance Criteria
1. Excel-Templates downloadbar.
2. Artikel-Import aus Excel.
3. Rechnungslisten-Export.
4. Zeiterfassungs-Export.

## Tests
### Unit Tests
- `TestExcel_ArticleImport`: 10 Artikel aus Excel → importiert.
- `TestExcel_ArticleImport_InvalidRow`: Ungültige Zeile → Fehler gemeldet, Rest importiert.
- `TestExcel_InvoiceExport`: 5 Rechnungen → Excel mit 5 Zeilen.
- `TestExcel_TimeExport`: Zeiterfassung → Excel.

### API Tests
- `TestExcelHandler_ImportArticles_200`, `TestExcelHandler_ExportInvoices_200`

## Verification Checklist
- [ ] Excel-Templates
- [ ] Artikel-Import
- [ ] Export: Rechnungen, Zeiterfassung, Kontakte
- [ ] Fehlerhandling bei Import
- [ ] Alle Tests bestehen

## Dependencies
- ZMI-TICKET-101 (Kontakte), ZMI-TICKET-121 (Dokumenten-Editor), ZMI-TICKET-132 (Rechnungen)
