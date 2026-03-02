# ZMI-TICKET-152: Regiebericht — Zusatzarbeiten & Abzeichnung

Status: Proposed
Priority: P3
Owner: TBD
Epic: Phase 6 — Baudokumentation & Aufmaß
Source: plancraft-anforderungen.md.pdf, Abschnitt 8.3 Regiebericht
Blocked by: ZMI-TICKET-110, ZMI-TICKET-154

## Goal
Regieberichte für Zusatzarbeiten (nicht im Angebot enthalten) mit Arbeitsstunden, Materialverbrauch, Geräten und Kostenaufstellung. Abzeichnung durch Auftraggeber per digitaler Unterschrift. PDF-Generierung für Dokumentation und Rechnungsgrundlage.

## Scope
- **In scope:** Datenmodell, Regiearbeits-Erfassung, Kostenaufstellung, Abzeichnung durch Auftraggeber, PDF.
- **Out of scope:** Mobile App (ZMI-TICKET-193), automatische Rechnungserstellung aus Regiebericht.

## Requirements

### Datenmodell

#### Tabelle `time_and_material_reports`
| Feld | Typ | Constraints | Beschreibung |
|------|-----|-------------|--------------|
| id | UUID | PK | |
| tenant_id | UUID | FK tenants, NOT NULL | |
| project_id | UUID | FK projects, NOT NULL | |
| report_number | VARCHAR(50) | | Fortlaufende Nummer |
| report_date | DATE | NOT NULL | |
| reason | TEXT | NOT NULL | Grund der Regiearbeit |
| status | VARCHAR(20) | NOT NULL, DEFAULT 'draft' | 'draft', 'finalized', 'signed', 'invoiced' |
| client_signature_id | UUID | FK signatures, NULL | Auftraggeber-Unterschrift |
| contractor_signature_id | UUID | FK signatures, NULL | Auftragnehmer-Unterschrift |
| total_labor_cost | DECIMAL(14,2) | NOT NULL, DEFAULT 0 | |
| total_material_cost | DECIMAL(14,2) | NOT NULL, DEFAULT 0 | |
| total_equipment_cost | DECIMAL(14,2) | NOT NULL, DEFAULT 0 | |
| total_cost | DECIMAL(14,2) | NOT NULL, DEFAULT 0 | |
| pdf_file_id | UUID | FK project_files, NULL | |
| created_at | TIMESTAMPTZ | NOT NULL | |
| updated_at | TIMESTAMPTZ | NOT NULL | |
| created_by | UUID | FK users | |

#### Tabelle `time_and_material_entries`
| Feld | Typ | Constraints | Beschreibung |
|------|-----|-------------|--------------|
| id | UUID | PK | |
| report_id | UUID | FK time_and_material_reports, NOT NULL | |
| entry_type | VARCHAR(20) | NOT NULL | 'labor', 'material', 'equipment' |
| description | VARCHAR(500) | NOT NULL | |
| employee_id | UUID | FK employees, NULL | Bei Lohn |
| quantity | DECIMAL(10,4) | NOT NULL | Stunden / Menge |
| unit | VARCHAR(20) | | h, Stk, etc. |
| unit_cost | DECIMAL(14,4) | NOT NULL | |
| total_cost | DECIMAL(14,2) | NOT NULL | |
| sort_order | INT | NOT NULL, DEFAULT 0 | |

### Business Rules
1. Regieberichte sind immer projektgebunden.
2. Abzeichnung durch Auftraggeber bestätigt die Zusatzarbeiten.
3. Ohne Unterschrift trotzdem speicherbar (Status "Nicht unterschrieben").
4. Bei Abzeichnung: PDF automatisch generiert und in Projektmappe gespeichert.
5. Regiebericht kann als Grundlage für Rechnung dienen (manuell).

### API / OpenAPI
| Method | Path | Beschreibung |
|--------|------|--------------|
| GET | /projects/{id}/tm-reports | Regieberichte des Projekts |
| POST | /projects/{id}/tm-reports | Neuen Bericht erstellen |
| GET | /tm-reports/{id} | Bericht abrufen |
| PATCH | /tm-reports/{id} | Bericht bearbeiten |
| POST | /tm-reports/{id}/entries | Eintrag hinzufügen |
| POST | /tm-reports/{id}/finalize | Fertigstellen |
| POST | /tm-reports/{id}/sign | Unterschrift hinzufügen |
| GET | /tm-reports/{id}/pdf | PDF |

### Permissions
- `tm_reports.view`, `tm_reports.edit`, `tm_reports.finalize`

## Acceptance Criteria
1. Regieberichte mit Lohn, Material, Geräte erfassbar.
2. Kostenaufstellung automatisch berechnet.
3. Abzeichnung durch beide Parteien.
4. PDF-Generierung.

## Tests
### Unit Tests
- `TestTMReport_CostCalculation`: 3 Einträge → Summen korrekt.
- `TestTMReport_Sign_Client`: Auftraggeber-Unterschrift → Status signed.
- `TestTMReport_NoSign_Allowed`: Ohne Unterschrift → trotzdem finalisierbar.

### API Tests
- `TestTMReportHandler_Create_201`, `TestTMReportHandler_AddEntry_201`, `TestTMReportHandler_Sign_200`

### Test Case Pack
1) **Standard-Regiebericht**: 2h Lohn + Material → Kostenaufstellung → Unterschrift → PDF.

## Verification Checklist
- [ ] Migration: time_and_material_reports, time_and_material_entries
- [ ] Kostenberechnung korrekt
- [ ] Unterschrift-Workflow
- [ ] PDF-Generierung
- [ ] Alle Tests bestehen

## Dependencies
- ZMI-TICKET-110 (Projekte), ZMI-TICKET-154 (Digitale Unterschriften)
