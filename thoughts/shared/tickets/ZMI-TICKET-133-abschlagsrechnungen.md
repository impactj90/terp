# ZMI-TICKET-133: Abschlagsrechnungen — Pauschal & Kumulativ (VOB)

Status: Proposed
Priority: P2
Owner: TBD
Epic: Phase 4 — Auftragsdokumente
Source: plancraft-anforderungen.md.pdf, Abschnitt 3.5 Abschlagsrechnungen (Detail)
Blocked by: ZMI-TICKET-132
Blocks: ZMI-TICKET-134

## Goal
Abschlagsrechnungen (Teilrechnungen) in zwei Varianten implementieren: Pauschal (jede Abschlagsrechnung steht eigenständig) und Kumulativ nach VOB (jeder Abschlag zeigt die Gesamtleistung bis dato, vorherige Abschläge werden abgezogen). Die Abschlagsserie wird über ein Serien-Modell verwaltet und endet mit einer Schlussrechnung.

## Scope
- **In scope:** Abschlagsserie-Modell, Pauschal-Modus, Kumulativ-Modus (VOB), Prozentualer Abschlag, Zahlungszuordnung pro Abschlag, Serien-Verwaltung, Storno innerhalb einer Serie.
- **Out of scope:** Schlussrechnung (ZMI-TICKET-134), PDF-Layout (ZMI-TICKET-140).

## Requirements

### Datenmodell

#### Tabelle `invoice_series`
| Feld | Typ | Constraints | Beschreibung |
|------|-----|-------------|--------------|
| id | UUID | PK | |
| tenant_id | UUID | FK tenants, NOT NULL | |
| project_id | UUID | FK projects, NULL | |
| source_document_id | UUID | FK documents, NULL | Referenz auf Angebot/AB |
| series_type | VARCHAR(20) | NOT NULL | 'pauschal' oder 'cumulative' |
| status | VARCHAR(20) | NOT NULL, DEFAULT 'open' | 'open', 'closed' (nach Schlussrechnung) |
| created_at | TIMESTAMPTZ | NOT NULL | |
| updated_at | TIMESTAMPTZ | NOT NULL | |
| created_by | UUID | FK users | |

**Constraint:** series_type ist nach erstem Abschlag unveränderlich.

#### Tabelle `invoice_series_items`
| Feld | Typ | Constraints | Beschreibung |
|------|-----|-------------|--------------|
| id | UUID | PK | |
| series_id | UUID | FK invoice_series, NOT NULL | |
| document_id | UUID | FK documents, NOT NULL | Die Abschlagsrechnung |
| sequence_number | INT | NOT NULL | Laufende Nummer in der Serie (1, 2, 3...) |
| cumulative_net | DECIMAL(14,2) | NULL | Kumulativ: Gesamtleistung bis dato (netto) |
| cumulative_gross | DECIMAL(14,2) | NULL | Kumulativ: Gesamtleistung bis dato (brutto) |
| previous_net | DECIMAL(14,2) | NULL | Kumulativ: Summe vorheriger Abschläge (netto) |
| previous_gross | DECIMAL(14,2) | NULL | Kumulativ: Summe vorheriger Abschläge (brutto) |
| current_net | DECIMAL(14,2) | NOT NULL | Aktueller Abschlagsbetrag (netto) |
| current_gross | DECIMAL(14,2) | NOT NULL | Aktueller Abschlagsbetrag (brutto) |
| is_final | BOOLEAN | NOT NULL, DEFAULT false | Schlussrechnung-Flag |
| created_at | TIMESTAMPTZ | NOT NULL | |

**Constraint:** UNIQUE (series_id, sequence_number)

### Pauschal-Modus

- Jede Abschlagsrechnung steht eigenständig
- Zeigt nur den aktuellen Abschlagsbetrag
- Vorherige Abschläge werden NICHT aufgeführt
- Schlussrechnung verrechnet alle Zahlungen
- Geeignet für Privatkunden, einfache Projekte

**Erstellung:**
1. Prozentualer Abschlag: Menge=1, Einheit=psch., Betrag = X% der Gesamtsumme
2. Betraglicher Abschlag: Menge=1, freier Betrag

### Kumulativ-Modus (VOB)

- Jeder Abschlag zeigt die Gesamtleistung bis dato
- Vorherige Abschlagsbeträge werden ausgewiesen und abgezogen
- Zeigt Baufortschritt
- Von Architekten/Bauherren gefordert
- Standardmäßig in Einstellungen aktivierbar

**Aufbau einer kumulativen Abschlagsrechnung:**
```
Gesamtleistung bis dato (netto):     15.000,00 €
./. Bereits abgerechnete Leistung:    -8.000,00 €
= Abschlagsbetrag (netto):            7.000,00 €
+ MwSt 19%:                           1.330,00 €
= Abschlagsbetrag (brutto):           8.330,00 €
```

### Erstellungsprozess

1. Erste Abschlagsrechnung erstellen (Blanko / aus Angebot / aus AB)
2. Bearbeiten im Editor (Positionen mit Teilmengen)
3. Fertigstellen → Nummer vergeben (AR-{YYYY}-{####})
4. Zahlung(en) hinterlegen
5. "Zusammenhängend erstellen" → nächster Abschlag oder Schlussrechnung
6. Ab dem 2. Abschlag ist der Typ (pauschal/kumulativ) gesperrt

### Prozentualer Abschlag

- Menge = 1, Einheit = psch.
- Kalkulation: Kostenart = Sonstiges, Menge = 0.6 (für 60%), EK = Gesamtsumme
- Ergebnis: 60% der Gesamtsumme des Ursprungsdokuments

### Business Rules

1. **Serien-Typ gesperrt nach 1. Abschlag:** Wechsel pauschal ↔ kumulativ nicht möglich.
2. **Stornierung innerhalb Serie:** Storno-Dokument erstellen, Serie bleibt intakt.
3. **Zahlung mit Skonto:** Skonto-Betrag und -Datum separat erfassen.
4. **Teilzahlung:** Mehrere Zahlungen pro Abschlag möglich.
5. **Überzahlung:** Warnung, Gutschrift-Workflow.
6. **Kumulative Rechnung zu niedrig:** Wenn nicht alle bisherigen Leistungen enthalten → Benutzer-Warnung.
7. **Import alter Serie:** Abschlagsserie aus anderem System importieren (alte Abschläge nachträglich anlegen).
8. **Nummernkreis:** Abschlagsrechnungen haben eigenen Nummernkreis (AR-).
9. **MwSt-Satz:** Pro Abschlag gilt der aktuelle MwSt-Satz. Änderungen zwischen Abschlägen möglich.

### API / OpenAPI

| Method | Path | Beschreibung |
|--------|------|--------------|
| POST | /invoice-series | Neue Abschlagsserie starten |
| GET | /invoice-series | Serien auflisten |
| GET | /invoice-series/{id} | Serie mit allen Abschlägen |
| POST | /invoice-series/{id}/next | Nächsten Abschlag erstellen |
| POST | /invoice-series/{id}/final | Schlussrechnung erstellen (→ ZMI-TICKET-134) |
| GET | /invoice-series/{id}/summary | Serien-Übersicht (Gesamt, bezahlt, offen) |

#### POST /invoice-series Request
```json
{
  "project_id": "...",
  "source_document_id": "...",
  "series_type": "cumulative"
}
```

#### GET /invoice-series/{id}/summary Response
```json
{
  "id": "...",
  "series_type": "cumulative",
  "status": "open",
  "total_invoiced_net": 15000.00,
  "total_invoiced_gross": 17850.00,
  "total_paid": 12000.00,
  "total_outstanding": 5850.00,
  "items": [
    {
      "sequence_number": 1,
      "document_number": "AR-2026-0001",
      "current_net": 8000.00,
      "status": "paid"
    },
    {
      "sequence_number": 2,
      "document_number": "AR-2026-0002",
      "current_net": 7000.00,
      "status": "sent"
    }
  ]
}
```

### Permissions
- `documents.create` — Abschlagsrechnungen erstellen
- `invoice_series.manage` — Serien verwalten

## Acceptance Criteria
1. Pauschal-Modus: Eigenständige Abschlagsrechnungen erstellbar.
2. Kumulativ-Modus: Gesamtleistung bis dato und Abzug vorheriger Abschläge.
3. Serien-Typ nach 1. Abschlag gesperrt.
4. Prozentualer Abschlag korrekt berechnet.
5. Zahlungen pro Abschlag zuordenbar.
6. "Nächster Abschlag" erstellt korrekt vorbefülltes Dokument.
7. Serien-Übersicht zeigt alle Abschläge mit Zahlungsstatus.

## Tests

### Unit Tests
- `TestPartialInvoice_CreateSeries_Pauschal`: Serie vom Typ pauschal.
- `TestPartialInvoice_CreateSeries_Cumulative`: Serie vom Typ kumulativ.
- `TestPartialInvoice_TypeLocked`: Nach 1. Abschlag → Typ unveränderlich.
- `TestPartialInvoice_Pauschal_Standalone`: Betrag steht allein.
- `TestPartialInvoice_Cumulative_Calculation`: Gesamtleistung 15000, vorher 8000 → aktuell 7000.
- `TestPartialInvoice_Cumulative_FirstInvoice`: Erster Abschlag → previous=0.
- `TestPartialInvoice_Percentage_60`: 60% von 50000 → Betrag 30000.
- `TestPartialInvoice_NextInvoice_Cumulative`: Nächster Abschlag erbt vorherige Summen.
- `TestPartialInvoice_Storno_SeriesIntact`: Abschlag stornieren → Serie bleibt offen.
- `TestPartialInvoice_MixedVatRates`: Unterschiedliche MwSt pro Abschlag.
- `TestPartialInvoice_Summary_Totals`: Serien-Übersicht korrekt.

### API Tests
- `TestPartialInvoiceHandler_CreateSeries_201`: Serie erstellen.
- `TestPartialInvoiceHandler_Next_201`: Nächsten Abschlag erstellen.
- `TestPartialInvoiceHandler_Next_409_SeriesClosed`: Geschlossene Serie → 409.
- `TestPartialInvoiceHandler_Summary_200`: Übersicht.
- `TestPartialInvoiceHandler_TenantIsolation`: Fremde Serie → 404.

### Integration Tests
- `TestPartialInvoice_PauschalFullCycle`: Serie → 3 Abschläge → Zahlungen → Zusammenfassung.
- `TestPartialInvoice_CumulativeFullCycle`: Serie → 2 Abschläge (kumulativ) → Verify Beträge.
- `TestPartialInvoice_PercentageAbschlag`: 30% + 30% + 40% → Gesamt = 100%.

### Test Case Pack
1) **Pauschal 3 Abschläge**: Serie → 5000€, 5000€, 5000€ → Gesamt 15000€.
2) **Kumulativ VOB**: 1. Abschlag: bis dato 8000€, 2. Abschlag: bis dato 15000€ (./. 8000€ = 7000€).
3) **60% Prozentual**: Gesamtsumme 50000€, 60% → 30000€.
4) **Stornierung in Serie**: 3 Abschläge, 2. storniert → Serie weiterhin offen.

## Verification Checklist
- [ ] Migration: invoice_series Tabelle
- [ ] Migration: invoice_series_items Tabelle
- [ ] Migration reversibel
- [ ] Pauschal-Modus funktioniert
- [ ] Kumulativ-Modus berechnet korrekt
- [ ] Serien-Typ nach 1. Abschlag gesperrt
- [ ] Prozentualer Abschlag korrekt
- [ ] Zahlungen pro Abschlag
- [ ] "Nächster Abschlag" vorbefüllt
- [ ] Serien-Übersicht korrekt
- [ ] Stornierung innerhalb Serie
- [ ] Tenant-Isolation
- [ ] Alle Tests bestehen
- [ ] `make lint` keine neuen Issues

## Dependencies
- ZMI-TICKET-132 (Rechnungen — Zahlungsmodell)
- ZMI-TICKET-121 (Dokumenten-Editor)
- ZMI-TICKET-120 (Nummernkreise)

## Notes
- Abschlagsrechnungen sind im Handwerk extrem verbreitet, besonders bei größeren Projekten.
- Der VOB-kumulative Modus ist Standard bei öffentlichen Aufträgen und von Architekten gefordert.
- Die Unterscheidung pauschal/kumulativ pro Serie (nicht pro Tenant) erlaubt Flexibilität.
- MwSt-Satzänderungen zwischen Abschlägen sind ein reales Szenario (COVID-Absenkung 2020).
