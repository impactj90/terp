# ZMI-TICKET-151: Bautagesbericht — Datenmodell & Workflow

Status: Proposed
Priority: P3
Owner: TBD
Epic: Phase 6 — Baudokumentation & Aufmaß
Source: plancraft-anforderungen.md.pdf, Abschnitt 8.2 Bautagesbericht
Blocked by: ZMI-TICKET-110, ZMI-TICKET-154

## Goal
Digitale Bautagesberichte für die tägliche Dokumentation auf der Baustelle. Enthält Wetter, anwesende Mitarbeiter (automatisch aus Zeiterfassung), Baufortschritt mit Fotos, verwendete Materialien, Behinderungen. PDF-Generierung mit Fotos und optionaler digitaler Unterschrift.

## Scope
- **In scope:** Datenmodell, Erstellung (Web + Mobile-ready API), Mitarbeiter aus Zeiterfassung, Foto-Upload, PDF-Generierung, Vorlage-basiert.
- **Out of scope:** Mobile App UI (ZMI-TICKET-193), Offline-Fähigkeit (ZMI-TICKET-194).

## Requirements

### Datenmodell

#### Tabelle `daily_reports`
| Feld | Typ | Constraints | Beschreibung |
|------|-----|-------------|--------------|
| id | UUID | PK | |
| tenant_id | UUID | FK tenants, NOT NULL | |
| project_id | UUID | FK projects, NOT NULL | |
| report_date | DATE | NOT NULL | Berichtsdatum |
| weather | VARCHAR(50) | | sonnig, bewölkt, Regen, Schnee, etc. |
| temperature_min | DECIMAL(4,1) | | Min-Temperatur °C |
| temperature_max | DECIMAL(4,1) | | Max-Temperatur °C |
| work_description | TEXT | | Baufortschritt (Freitext) |
| materials_used | TEXT | | Verwendete Materialien |
| special_events | TEXT | | Besondere Vorkommnisse |
| disruptions | TEXT | | Behinderungen/Unterbrechungen |
| status | VARCHAR(20) | NOT NULL, DEFAULT 'draft' | 'draft', 'finalized', 'signed' |
| signature_id | UUID | FK signatures, NULL | Digitale Unterschrift |
| pdf_file_id | UUID | FK project_files, NULL | |
| finalized_at | TIMESTAMPTZ | NULL | |
| created_at | TIMESTAMPTZ | NOT NULL | |
| updated_at | TIMESTAMPTZ | NOT NULL | |
| created_by | UUID | FK users | |

**Constraint:** UNIQUE (tenant_id, project_id, report_date)

#### Tabelle `daily_report_workers`
| Feld | Typ | Constraints | Beschreibung |
|------|-----|-------------|--------------|
| id | UUID | PK | |
| report_id | UUID | FK daily_reports, NOT NULL | |
| employee_id | UUID | FK employees, NOT NULL | |
| hours | DECIMAL(4,2) | | Arbeitsstunden |
| auto_detected | BOOLEAN | NOT NULL, DEFAULT false | Aus Zeiterfassung erkannt |

#### Tabelle `daily_report_photos`
| Feld | Typ | Constraints | Beschreibung |
|------|-----|-------------|--------------|
| id | UUID | PK | |
| report_id | UUID | FK daily_reports, NOT NULL | |
| file_id | UUID | FK project_files, NOT NULL | |
| caption | VARCHAR(255) | | Beschreibung |
| sort_order | INT | NOT NULL, DEFAULT 0 | |

### Business Rules
1. Ein Bericht pro Projekt pro Tag (unique constraint).
2. Anwesende Mitarbeiter können automatisch aus Zeiterfassung übernommen werden.
3. Fotos werden in der Projekt-Dateiablage gespeichert.
4. PDF-Generierung bei Fertigstellung.
5. Nach Unterschrift nicht mehr bearbeitbar.

### API / OpenAPI
| Method | Path | Beschreibung |
|--------|------|--------------|
| GET | /projects/{id}/daily-reports | Berichte des Projekts |
| POST | /projects/{id}/daily-reports | Neuen Bericht erstellen |
| GET | /daily-reports/{id} | Bericht abrufen |
| PATCH | /daily-reports/{id} | Bericht bearbeiten |
| POST | /daily-reports/{id}/finalize | Fertigstellen |
| POST | /daily-reports/{id}/detect-workers | Mitarbeiter aus Zeiterfassung erkennen |
| POST | /daily-reports/{id}/photos | Foto hinzufügen |
| GET | /daily-reports/{id}/pdf | PDF herunterladen |

### Permissions
- `daily_reports.view` — Berichte anzeigen
- `daily_reports.edit` — Berichte bearbeiten
- `daily_reports.finalize` — Berichte fertigstellen

## Acceptance Criteria
1. Bautagesbericht pro Projekt/Tag erstellbar.
2. Mitarbeiter aus Zeiterfassung automatisch erkannt.
3. Fotos hochladbar und im Bericht angezeigt.
4. PDF-Generierung mit allen Daten und Fotos.
5. Workflow: draft → finalized → signed.

## Tests

### Unit Tests
- `TestDailyReport_Create`: Bericht erstellen.
- `TestDailyReport_UniquePerDay`: 2 Berichte am gleichen Tag → Error.
- `TestDailyReport_DetectWorkers`: Zeiterfassungsdaten → Mitarbeiterliste.
- `TestDailyReport_Finalize`: Status → finalized, PDF generiert.
- `TestDailyReport_Signed_ReadOnly`: Nach Unterschrift → kein Bearbeiten.

### API Tests
- `TestDailyReportHandler_Create_201`: Bericht erstellen.
- `TestDailyReportHandler_DetectWorkers_200`: Mitarbeiter erkannt.
- `TestDailyReportHandler_AddPhoto_201`: Foto hinzufügen.
- `TestDailyReportHandler_PDF_200`: PDF download.

### Integration Tests
- `TestDailyReport_FullFlow`: Erstellen → Mitarbeiter → Fotos → Fertigstellen → PDF.

### Test Case Pack
1) **Standard-Bautagesbericht**: Datum, Wetter, 3 Mitarbeiter, 2 Fotos → PDF.
2) **Auto-Detect Workers**: Zeiterfassung buchen → Bericht erstellen → Mitarbeiter automatisch.

## Verification Checklist
- [ ] Migration: daily_reports, daily_report_workers, daily_report_photos
- [ ] Ein Bericht pro Projekt/Tag
- [ ] Mitarbeiter-Erkennung aus Zeiterfassung
- [ ] Foto-Upload
- [ ] PDF-Generierung
- [ ] Workflow (draft → finalized → signed)
- [ ] Tenant-Isolation
- [ ] Alle Tests bestehen

## Dependencies
- ZMI-TICKET-110 (Projekte)
- ZMI-TICKET-154 (Digitale Unterschriften)
- ZMI-TICKET-111 (Dateiablage — Fotos)
- Bestehende Zeiterfassung (für Mitarbeiter-Erkennung)
