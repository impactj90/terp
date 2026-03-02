# ZMI-TICKET-156: Materialerfassung — Baustelle vs. Kalkulation

Status: Proposed
Priority: P3
Owner: TBD
Epic: Phase 6 — Baudokumentation & Aufmaß
Source: plancraft-anforderungen.md.pdf, Abschnitt 8.5 Materialerfassung
Blocked by: ZMI-TICKET-110, ZMI-TICKET-104

## Goal
Materialverbrauch auf der Baustelle erfassen und mit kalkulierten Mengen aus Dokumenten abgleichen. Fehlmengen und Überschüsse automatisch erkennen. Dient als Grundlage für Nachkalkulation und Lagerverwaltung.

## Scope
- **In scope:** Datenmodell (site_material_usage), Materialerfassung pro Projekt, Abgleich mit Kalkulation, Fehlmengen-/Überschuss-Erkennung.
- **Out of scope:** Lagerverwaltung (ZMI-TICKET-200+), Mobile App (ZMI-TICKET-193).

## Requirements

### Datenmodell

#### Tabelle `site_material_usage`
| Feld | Typ | Constraints | Beschreibung |
|------|-----|-------------|--------------|
| id | UUID | PK | |
| tenant_id | UUID | FK tenants, NOT NULL | |
| project_id | UUID | FK projects, NOT NULL | |
| article_id | UUID | FK articles, NULL | Artikelreferenz |
| description | VARCHAR(500) | NOT NULL | Material-Bezeichnung |
| unit | VARCHAR(20) | NOT NULL | |
| quantity_used | DECIMAL(14,4) | NOT NULL | Verbrauchte Menge |
| quantity_planned | DECIMAL(14,4) | NULL | Geplante Menge (aus Kalkulation) |
| usage_date | DATE | NOT NULL | Datum |
| recorded_by | UUID | FK users, NOT NULL | |
| notes | TEXT | | |
| created_at | TIMESTAMPTZ | NOT NULL | |

### Abgleich-Logik
```
Für jedes Material auf dem Projekt:
  Geplant = Summe aus Dokumenten-Kalkulation (quantity × Menge der Position)
  Verbraucht = Summe aus site_material_usage
  Differenz = Geplant - Verbraucht
  Status: OK (|Differenz| < 10%), Warnung (10-25%), Kritisch (>25%)
```

### API / OpenAPI
| Method | Path | Beschreibung |
|--------|------|--------------|
| GET | /projects/{id}/material-usage | Materialverbrauch des Projekts |
| POST | /projects/{id}/material-usage | Material erfassen |
| GET | /projects/{id}/material-comparison | Vergleich Plan vs. Ist |

### Permissions
- `material_usage.view`, `material_usage.edit`

## Acceptance Criteria
1. Materialverbrauch pro Projekt erfassbar.
2. Automatischer Abgleich mit Kalkulation.
3. Fehlmengen und Überschüsse erkannt.

## Tests
### Unit Tests
- `TestMaterialUsage_Comparison`: Planned=100, Used=85 → 15% unter Plan → OK.
- `TestMaterialUsage_Overuse`: Planned=100, Used=130 → 30% über → Kritisch.
- `TestMaterialUsage_NoPlan`: Kein Planwert → nur Ist-Verbrauch.

### API Tests
- `TestMaterialUsageHandler_Create_201`, `TestMaterialUsageHandler_Comparison_200`

## Verification Checklist
- [ ] Migration: site_material_usage
- [ ] Verbrauchs-Erfassung
- [ ] Plan/Ist Abgleich
- [ ] Fehlmengen-Erkennung
- [ ] Alle Tests bestehen

## Dependencies
- ZMI-TICKET-110 (Projekte), ZMI-TICKET-104 (Artikelstamm), ZMI-TICKET-122 (Kalkulation)
