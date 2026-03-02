# ZMI-TICKET-150: Aufmaß — Formelbasierte Erfassung & Integration

Status: Proposed
Priority: P3
Owner: TBD
Epic: Phase 6 — Baudokumentation & Aufmaß
Source: plancraft-anforderungen.md.pdf, Abschnitt 3.8 Aufmaß
Blocked by: ZMI-TICKET-121
Blocks: ZMI-TICKET-124

## Goal
Formelbasiertes Aufmaß-System für die Vor-Ort-Erfassung von Flächen, Längen und Volumina. Aufmaß-Werte fließen direkt in Dokumenten-Positionen ein und aktualisieren Mengen automatisch. Separates Aufmaßblatt als PDF exportierbar.

## Scope
- **In scope:** Datenmodell (measurements, measurement_entries), Formelberechnung (L×B, Abzüge für Fenster/Türen), geometrische Formeln (Rechteck, Dreieck, Kreis, Trapez), Integration mit Dokumenten-Positionen, Aufmaßblatt-PDF.
- **Out of scope:** Mobile App (ZMI-TICKET-193), Frontend UI (Teil von ZMI-TICKET-124).

## Requirements

### Datenmodell

#### Tabelle `measurements`
| Feld | Typ | Constraints | Beschreibung |
|------|-----|-------------|--------------|
| id | UUID | PK | |
| tenant_id | UUID | FK tenants, NOT NULL | |
| project_id | UUID | FK projects, NOT NULL | Immer projektgebunden |
| document_item_id | UUID | FK document_items, NULL | Verknüpfung zu Position |
| name | VARCHAR(255) | NOT NULL | Bezeichnung (z.B. "Wohnzimmer Wände") |
| unit | VARCHAR(20) | NOT NULL | Ergebnis-Einheit (m², m, m³) |
| total_value | DECIMAL(14,4) | NOT NULL, DEFAULT 0 | Berechneter Gesamtwert |
| notes | TEXT | | |
| created_at | TIMESTAMPTZ | NOT NULL | |
| updated_at | TIMESTAMPTZ | NOT NULL | |
| created_by | UUID | FK users | |

#### Tabelle `measurement_entries`
| Feld | Typ | Constraints | Beschreibung |
|------|-----|-------------|--------------|
| id | UUID | PK | |
| measurement_id | UUID | FK measurements, NOT NULL, ON DELETE CASCADE | |
| description | VARCHAR(255) | | Beschreibung (z.B. "Nordwand", "Fenster links") |
| formula_type | VARCHAR(20) | NOT NULL | 'rectangle', 'triangle', 'circle', 'trapezoid', 'custom' |
| dimension_a | DECIMAL(10,4) | | Länge / Seite A / Radius |
| dimension_b | DECIMAL(10,4) | | Breite / Seite B / Höhe |
| dimension_c | DECIMAL(10,4) | | Höhe / Seite C (bei Trapez) |
| quantity | DECIMAL(10,4) | NOT NULL, DEFAULT 1 | Anzahl (z.B. 3 gleiche Fenster) |
| is_deduction | BOOLEAN | NOT NULL, DEFAULT false | Abzug (Fenster, Türen) |
| calculated_value | DECIMAL(14,4) | NOT NULL | Berechneter Wert |
| sort_order | INT | NOT NULL, DEFAULT 0 | |

### Formeln
| Typ | Formel | Beispiel |
|-----|--------|---------|
| rectangle | A × B × Qty | 4.5m × 2.8m × 1 = 12.60 m² |
| triangle | (A × B / 2) × Qty | (3m × 2m / 2) × 1 = 3.00 m² |
| circle | (π × A²) × Qty | (π × 1.5²) × 1 = 7.07 m² |
| trapezoid | ((A + C) / 2 × B) × Qty | ((3 + 5)/2 × 2) × 1 = 8.00 m² |
| custom | Manueller Wert | 15.50 m² |

### Business Rules
1. Aufmaß immer projektgebunden (kein Aufmaß ohne Projekt).
2. Aufmaß-Wert fließt als Menge in verknüpfte Position.
3. Automatische Neuberechnung bei Änderung.
4. Negative Aufmaße nicht erlaubt (Abzüge > Grundfläche → Error).
5. Nachträgliche Änderung → Neuberechnung aller abhängigen Positionen, Warnung wenn Dokument finalisiert.

### API / OpenAPI
| Method | Path | Beschreibung |
|--------|------|--------------|
| GET | /projects/{id}/measurements | Aufmaße des Projekts |
| POST | /projects/{id}/measurements | Neues Aufmaß |
| GET | /measurements/{id} | Aufmaß mit Einträgen |
| PATCH | /measurements/{id} | Aufmaß aktualisieren |
| DELETE | /measurements/{id} | Aufmaß löschen |
| POST | /measurements/{id}/entries | Eintrag hinzufügen |
| PATCH | /measurements/{id}/entries/{entryId} | Eintrag aktualisieren |
| DELETE | /measurements/{id}/entries/{entryId} | Eintrag löschen |
| POST | /measurements/{id}/link-item | Mit Dokumentenposition verknüpfen |
| GET | /measurements/{id}/pdf | Aufmaßblatt als PDF |

### Permissions
- `measurements.view` — Aufmaße anzeigen
- `measurements.edit` — Aufmaße bearbeiten

## Acceptance Criteria
1. Formelbasierte Aufmaß-Erfassung für alle geometrischen Grundformen.
2. Abzüge (Fenster, Türen) werden subtrahiert.
3. Integration mit Dokumenten-Positionen (Menge wird aktualisiert).
4. Negative Ergebnisse werden verhindert.
5. Aufmaßblatt als PDF exportierbar.

## Tests

### Unit Tests
- `TestMeasurement_Rectangle`: 4.5 × 2.8 = 12.60.
- `TestMeasurement_Triangle`: (3 × 2 / 2) = 3.00.
- `TestMeasurement_Circle`: π × 1.5² = 7.07.
- `TestMeasurement_Trapezoid`: ((3+5)/2 × 2) = 8.00.
- `TestMeasurement_WithDeductions`: 50m² - 2 Fenster (1.2×1.0) - 1 Tür (0.9×2.1) = 50 - 2.4 - 1.89 = 45.71.
- `TestMeasurement_NegativeResult`: Abzüge > Grundfläche → Error.
- `TestMeasurement_LinkToPosition`: Verknüpfung → Position.quantity aktualisiert.
- `TestMeasurement_UpdatePropagates`: Aufmaß ändern → Position.quantity neuberechnet.
- `TestMeasurement_Quantity`: 3 gleiche Fenster → Einzelwert × 3.
- `TestMeasurement_Custom`: Manueller Wert 15.50 → gespeichert.

### API Tests
- `TestMeasurementHandler_Create_201`: Neues Aufmaß.
- `TestMeasurementHandler_AddEntry_201`: Eintrag hinzufügen.
- `TestMeasurementHandler_LinkItem_200`: Verknüpfung.
- `TestMeasurementHandler_PDF_200`: PDF-Export.
- `TestMeasurementHandler_NoProject_400`: Ohne Projekt → 400.

### Integration Tests
- `TestMeasurement_FullFlow`: Aufmaß → Einträge mit Abzügen → Verknüpfung → Position hat korrekte Menge.
- `TestMeasurement_ChangeUpdateDocument`: Aufmaß ändern → Position und Dokumentsummen aktualisiert.

### Test Case Pack
1) **Wohnzimmer Wände**: 4 Wände (4.5×2.8, 3.8×2.8, 4.5×2.8, 3.8×2.8) - 2 Fenster - 1 Tür = Aufmaß.
2) **Kreisförmige Fläche**: Radius 2.5m → 19.63 m².

## Verification Checklist
- [ ] Migration: measurements, measurement_entries
- [ ] Alle Formeln implementiert (Rechteck, Dreieck, Kreis, Trapez)
- [ ] Abzüge korrekt
- [ ] Negative Ergebnisse verhindert
- [ ] Integration mit Dokumenten-Positionen
- [ ] PDF-Export
- [ ] Tenant-Isolation
- [ ] Alle Tests bestehen

## Dependencies
- ZMI-TICKET-121 (Dokumenten-Editor — für document_items)
- ZMI-TICKET-110 (Projekte)
