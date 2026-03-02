# ZMI-TICKET-153: Abnahmeprotokoll — Mängelliste & Unterschriften

Status: Proposed
Priority: P3
Owner: TBD
Epic: Phase 6 — Baudokumentation & Aufmaß
Source: plancraft-anforderungen.md.pdf, Abschnitt 8.1 Abnahmeprotokoll
Blocked by: ZMI-TICKET-110, ZMI-TICKET-154

## Goal
Digitale Abnahmeprotokolle für die Bauabnahme. Enthält Mängelliste mit Fotos und Fristen, Vorbehaltserklärungen, Status (Ohne Mängel / Mit Mängeln / Verweigert). Digitale Unterschrift beider Parteien. PDF-Generierung.

## Scope
- **In scope:** Datenmodell (acceptance_reports, defects), Mängelverwaltung mit Fotos/Fristen, Unterschriften-Workflow, Vorbehaltserklärungen, PDF-Generierung.
- **Out of scope:** Mobile App (ZMI-TICKET-193).

## Requirements

### Datenmodell

#### Tabelle `acceptance_reports`
| Feld | Typ | Constraints | Beschreibung |
|------|-----|-------------|--------------|
| id | UUID | PK | |
| tenant_id | UUID | FK tenants, NOT NULL | |
| project_id | UUID | FK projects, NOT NULL | |
| report_date | DATE | NOT NULL | Abnahmedatum |
| location | VARCHAR(500) | | Ort der Abnahme |
| result | VARCHAR(30) | NOT NULL, DEFAULT 'pending' | 'pending', 'accepted', 'accepted_with_defects', 'rejected' |
| reservations | TEXT | | Vorbehaltserklärungen |
| notes | TEXT | | |
| client_signature_id | UUID | FK signatures, NULL | |
| contractor_signature_id | UUID | FK signatures, NULL | |
| status | VARCHAR(20) | NOT NULL, DEFAULT 'draft' | 'draft', 'finalized', 'signed' |
| pdf_file_id | UUID | FK project_files, NULL | |
| created_at | TIMESTAMPTZ | NOT NULL | |
| created_by | UUID | FK users | |

#### Tabelle `acceptance_defects`
| Feld | Typ | Constraints | Beschreibung |
|------|-----|-------------|--------------|
| id | UUID | PK | |
| report_id | UUID | FK acceptance_reports, NOT NULL | |
| defect_number | INT | NOT NULL | Mangel-Nr. |
| description | TEXT | NOT NULL | Beschreibung |
| location | VARCHAR(255) | | Ort des Mangels |
| deadline | DATE | NULL | Nachbesserungsfrist |
| status | VARCHAR(20) | NOT NULL, DEFAULT 'open' | 'open', 'in_progress', 'resolved' |

#### Tabelle `acceptance_defect_photos`
| Feld | Typ | Constraints | Beschreibung |
|------|-----|-------------|--------------|
| id | UUID | PK | |
| defect_id | UUID | FK acceptance_defects, NOT NULL | |
| file_id | UUID | FK project_files, NOT NULL | |
| caption | VARCHAR(255) | | |

### Business Rules
1. Abnahme setzt Projekt-Status auf "completed" (optional, konfigurierbar).
2. Bei Mängeln: Fristen müssen gesetzt werden.
3. Unterschrift auch bei Ablehnung möglich (dokumentiert die Verweigerung).
4. Mängel können nachverfolgt und als erledigt markiert werden.
5. Abnahme ist Voraussetzung für Schlussrechnung (Warnung, wenn nicht vorhanden).

### API / OpenAPI
| Method | Path | Beschreibung |
|--------|------|--------------|
| GET | /projects/{id}/acceptance-reports | Abnahmeprotokolle |
| POST | /projects/{id}/acceptance-reports | Neues Protokoll |
| GET | /acceptance-reports/{id} | Protokoll abrufen |
| PATCH | /acceptance-reports/{id} | Bearbeiten |
| POST | /acceptance-reports/{id}/defects | Mangel hinzufügen |
| PATCH | /acceptance-reports/{id}/defects/{defectId} | Mangel aktualisieren |
| POST | /acceptance-reports/{id}/finalize | Fertigstellen |
| POST | /acceptance-reports/{id}/sign | Unterschrift |
| GET | /acceptance-reports/{id}/pdf | PDF |

### Permissions
- `acceptance_reports.view`, `acceptance_reports.edit`, `acceptance_reports.finalize`

## Acceptance Criteria
1. Abnahmeprotokoll mit 3 Ergebnis-Typen (akzeptiert/mit Mängeln/verweigert).
2. Mängelliste mit Fotos und Fristen.
3. Mängel-Tracking (Status: offen/in Arbeit/erledigt).
4. Duale Unterschrift.
5. PDF-Generierung.

## Tests
### Unit Tests
- `TestAcceptance_NoDefects`: Ergebnis=accepted, keine Mängel.
- `TestAcceptance_WithDefects`: 3 Mängel → accepted_with_defects.
- `TestAcceptance_Rejected`: Verweigerung trotzdem speicherbar.
- `TestAcceptance_DefectTracking`: Mangel open → resolved.
- `TestAcceptance_DeadlineRequired`: Mangel ohne Frist → Warning.

### API Tests
- `TestAcceptanceHandler_Create_201`, `TestAcceptanceHandler_AddDefect_201`, `TestAcceptanceHandler_Sign_200`

### Integration Tests
- `TestAcceptance_FullFlow`: Protokoll → Mängel → Fotos → Unterschriften → PDF.

### Test Case Pack
1) **Abnahme ohne Mängel**: Datum, Ort, Ergebnis=accepted, 2 Unterschriften → PDF.
2) **Abnahme mit 3 Mängeln**: Mängel mit Fotos und Fristen → PDF, Mängel-Tracking.

## Verification Checklist
- [ ] Migration: acceptance_reports, acceptance_defects, acceptance_defect_photos
- [ ] 3 Ergebnis-Typen
- [ ] Mängelliste CRUD
- [ ] Foto-Upload pro Mangel
- [ ] Fristen-Tracking
- [ ] Unterschriften-Workflow
- [ ] PDF-Generierung
- [ ] Alle Tests bestehen

## Dependencies
- ZMI-TICKET-110 (Projekte), ZMI-TICKET-154 (Digitale Unterschriften), ZMI-TICKET-111 (Dateiablage)
