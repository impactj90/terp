# ZMI-TICKET-161: Eingangsrechnungen — Upload, KI-Scan, Zuordnung

Status: Proposed
Priority: P3
Owner: TBD
Epic: Phase 7 — Finanzen & Kalkulation
Source: plancraft-anforderungen.md.pdf, Abschnitt 9.2 Eingangsrechnungen
Blocked by: ZMI-TICKET-110, ZMI-TICKET-111

## Goal
Eingangsrechnungen (Lieferantenrechnungen) digitalisieren: PDF/Foto hochladen, KI-gestützter Scan extrahiert automatisch Rechnungsdaten (Nummer, Datum, Beträge, Positionen), manuelle Korrektur, Projekt-Zuordnung. Fließt in Nachkalkulation ein.

## Scope
- **In scope:** Datenmodell (incoming_invoices), Upload (PDF/Foto), OCR/KI-Extraktion (Tesseract + strukturierte Extraktion), manuelle Korrektur, Projekt-Zuordnung, Positions-Splitting auf Projekte.
- **Out of scope:** Bankanbindung, automatischer Zahlungsabgleich.

## Requirements

### Datenmodell

#### Tabelle `incoming_invoices`
| Feld | Typ | Constraints | Beschreibung |
|------|-----|-------------|--------------|
| id | UUID | PK | |
| tenant_id | UUID | FK tenants, NOT NULL | |
| project_id | UUID | FK projects, NULL | Projekt-Zuordnung |
| supplier_name | VARCHAR(255) | | Lieferant |
| supplier_contact_id | UUID | FK contacts, NULL | Verknüpfung zu Kontakt |
| invoice_number | VARCHAR(100) | | Rechnungsnummer |
| invoice_date | DATE | | |
| due_date | DATE | | |
| net_amount | DECIMAL(14,2) | | Netto |
| vat_amount | DECIMAL(14,2) | | MwSt |
| gross_amount | DECIMAL(14,2) | | Brutto |
| currency | VARCHAR(3) | NOT NULL, DEFAULT 'EUR' | |
| cost_type | VARCHAR(20) | | 'material', 'equipment', 'subcontractor', 'other' |
| status | VARCHAR(20) | NOT NULL, DEFAULT 'pending' | 'pending', 'reviewed', 'approved', 'paid' |
| ocr_confidence | DECIMAL(5,2) | | OCR-Vertrauenswert (0-100) |
| ocr_raw_data | JSONB | | Rohdaten aus OCR |
| file_id | UUID | FK project_files, NULL | Hochgeladenes Dokument |
| notes | TEXT | | |
| created_at | TIMESTAMPTZ | NOT NULL | |
| reviewed_by | UUID | FK users, NULL | |
| approved_by | UUID | FK users, NULL | |

#### Tabelle `incoming_invoice_items`
| Feld | Typ | Constraints | Beschreibung |
|------|-----|-------------|--------------|
| id | UUID | PK | |
| invoice_id | UUID | FK incoming_invoices, NOT NULL | |
| description | VARCHAR(500) | | |
| quantity | DECIMAL(14,4) | | |
| unit_price | DECIMAL(14,4) | | |
| total_price | DECIMAL(14,2) | | |
| project_id | UUID | FK projects, NULL | Für Splitting auf Projekte |

### KI/OCR-Workflow
1. Foto/PDF hochladen
2. OCR extrahiert Text (Tesseract)
3. Strukturierte Extraktion: Rechnungsnummer, Datum, Lieferant, Beträge, Positionen
4. Automatische Projekt-Zuordnung (basierend auf Lieferant + Bestellnummer)
5. Manuelle Korrektur und Bestätigung
6. Genehmigung durch Admin

### Edge Cases
1. Unleserliches Foto → Manuelle Eingabe als Fallback.
2. KI erkennt MwSt falsch (Kleinunternehmer ohne MwSt) → Manuelle Korrektur.
3. Rechnung ohne Projekt-Zuordnung → "Allgemein"-Kategorie.
4. Splitting: Eine Rechnung auf mehrere Projekte → Positions-basiert.

### API / OpenAPI
| Method | Path | Beschreibung |
|--------|------|--------------|
| POST | /incoming-invoices | Upload + OCR starten |
| GET | /incoming-invoices | Liste |
| GET | /incoming-invoices/{id} | Detail mit OCR-Daten |
| PATCH | /incoming-invoices/{id} | Korrektur |
| POST | /incoming-invoices/{id}/approve | Genehmigen |
| GET | /projects/{id}/incoming-invoices | Projekt-bezogene Rechnungen |

### Permissions
- `incoming_invoices.view`, `incoming_invoices.create`, `incoming_invoices.approve`

## Acceptance Criteria
1. PDF/Foto Upload mit OCR-Extraktion.
2. Automatische Datenextraktion (Nummer, Datum, Beträge).
3. Manuelle Korrektur möglich.
4. Projekt-Zuordnung (automatisch + manuell).
5. Genehmigungsworkflow.
6. Daten fließen in Nachkalkulation ein.

## Tests
### Unit Tests
- `TestIncomingInvoice_OCR_ParseAmount`: "1.234,56 €" → 1234.56.
- `TestIncomingInvoice_OCR_ParseDate`: "18.03.2026" → 2026-03-18.
- `TestIncomingInvoice_AutoAssignProject`: Lieferant mit bekanntem Projekt → auto-assign.
- `TestIncomingInvoice_Splitting`: 1 Rechnung → 2 Projekte (positions-basiert).
- `TestIncomingInvoice_Approve`: Status → approved, approved_by gesetzt.

### API Tests
- `TestIncomingInvoiceHandler_Upload_201`, `TestIncomingInvoiceHandler_Approve_200`

### Integration Tests
- `TestIncomingInvoice_FullFlow`: Upload → OCR → Korrektur → Genehmigung → In Nachkalkulation.

### Test Case Pack
1) **Standard-Rechnung**: PDF Upload → OCR erkennt alles → Korrektur → Genehmigung.
2) **Splitting**: Rechnung 5000€ → 3000€ Projekt A, 2000€ Projekt B.

## Verification Checklist
- [ ] Migration: incoming_invoices, incoming_invoice_items
- [ ] Upload-Logik (PDF/Foto)
- [ ] OCR-Integration (Tesseract)
- [ ] Strukturierte Extraktion
- [ ] Projekt-Zuordnung
- [ ] Genehmigungsworkflow
- [ ] Alle Tests bestehen

## Dependencies
- ZMI-TICKET-110 (Projekte), ZMI-TICKET-111 (Dateiablage), ZMI-TICKET-101 (Kontakte)
