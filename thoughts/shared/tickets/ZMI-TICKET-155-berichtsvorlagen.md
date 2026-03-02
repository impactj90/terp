# ZMI-TICKET-155: Berichtsvorlagen — Admin-Konfigurator

Status: Proposed
Priority: P4
Owner: TBD
Epic: Phase 6 — Baudokumentation & Aufmaß
Source: plancraft-anforderungen.md.pdf, Abschnitt 8.4 Berichtsvorlagen
Blocked by: ZMI-TICKET-151

## Goal
Admin-konfigurierbarer Vorlagen-Editor für Bautagesberichte, Regieberichte und Abnahmeprotokolle. Vorlagen definieren Felder (Textfelder, Checkboxen, Foto-Platzhalter, Unterschrift-Felder). Spezial: Berichtsheft für Auszubildende (Wochenberichte).

## Scope
- **In scope:** Vorlagen-Datenmodell (JSONB-basiert), Feldtypen (text, checkbox, photo, signature, date), Vorlage-Auswahl bei Berichterstellung, Berichtsheft-Template.
- **Out of scope:** Drag & Drop Vorlagen-Builder (Zukunft).

## Requirements

### Datenmodell

#### Tabelle `report_templates`
| Feld | Typ | Constraints | Beschreibung |
|------|-----|-------------|--------------|
| id | UUID | PK | |
| tenant_id | UUID | FK tenants, NOT NULL | |
| report_type | VARCHAR(30) | NOT NULL | 'daily_report', 'tm_report', 'acceptance', 'apprentice_log' |
| name | VARCHAR(255) | NOT NULL | |
| fields | JSONB | NOT NULL | Feld-Definitionen |
| is_default | BOOLEAN | NOT NULL, DEFAULT false | |
| is_active | BOOLEAN | NOT NULL, DEFAULT true | |
| created_at | TIMESTAMPTZ | NOT NULL | |
| updated_at | TIMESTAMPTZ | NOT NULL | |

### Feld-Definition (JSONB)
```json
{
  "fields": [
    { "id": "weather", "type": "select", "label": "Wetter", "options": ["sonnig", "bewölkt", "Regen"] },
    { "id": "progress", "type": "textarea", "label": "Baufortschritt", "required": true },
    { "id": "photos", "type": "photo_grid", "label": "Fotos", "max": 10 },
    { "id": "safety_check", "type": "checkbox", "label": "Sicherheitscheck durchgeführt" },
    { "id": "client_signature", "type": "signature", "label": "Unterschrift Auftraggeber" }
  ]
}
```

### API / OpenAPI
| Method | Path | Beschreibung |
|--------|------|--------------|
| GET | /report-templates | Vorlagen auflisten |
| POST | /report-templates | Vorlage erstellen |
| PATCH | /report-templates/{id} | Vorlage bearbeiten |
| DELETE | /report-templates/{id} | Vorlage löschen |

### Permissions
- `report_templates.manage` — Vorlagen verwalten

## Acceptance Criteria
1. Vorlagen mit verschiedenen Feldtypen erstellbar.
2. Vorlagen bei Berichterstellung auswählbar.
3. Bestehende Berichte behalten alte Vorlage (Template-Versionierung nicht nötig in V1).

## Tests
### Unit Tests
- `TestReportTemplate_Create`: Vorlage mit 5 Feldern → gespeichert.
- `TestReportTemplate_FieldTypes`: Alle Feldtypen validiert.
- `TestReportTemplate_Default`: Nur eine Default-Vorlage pro Typ.

### API Tests
- `TestReportTemplateHandler_CRUD`: Erstellen/Lesen/Aktualisieren/Löschen.

## Verification Checklist
- [ ] Migration: report_templates
- [ ] JSONB-Schema für Felder
- [ ] Alle Feldtypen unterstützt
- [ ] Default-Vorlage pro Typ
- [ ] Alle Tests bestehen

## Dependencies
- ZMI-TICKET-151 (Bautagesberichte)
