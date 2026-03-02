# ZMI-TICKET-134: Schlussrechnung — Verrechnung & MwSt-Korrektur

Status: Proposed
Priority: P2
Owner: TBD
Epic: Phase 4 — Auftragsdokumente
Source: plancraft-anforderungen.md.pdf, Abschnitt 3.6 Schlussrechnung (Detail)
Blocked by: ZMI-TICKET-133

## Goal
Schlussrechnung als Abschluss einer Abschlagsserie implementieren. Die Schlussrechnung zeigt die Gesamtleistung aller Positionen, listet alle vorherigen Abschlagsrechnungen mit Nummern/Daten/Beträgen auf, verrechnet alle geleisteten Zahlungen und berechnet den offenen Restbetrag. Besondere Beachtung: MwSt-Korrektur wenn sich der Steuersatz zwischen Abschlägen und Schlussrechnung geändert hat.

## Scope
- **In scope:** Schlussrechnungs-Erstellung aus Serie, Rechnungsaufstellung (alle Abschläge), Zahlungsverrechnung, MwSt-Korrektur, Gutschrift bei Überzahlung.
- **Out of scope:** PDF-Layout (ZMI-TICKET-140).

## Requirements

### Voraussetzungen
- Alle offenen Abschlagsrechnungen müssen bezahlt oder storniert sein
- Erstellung immer via "Zusammenhängend erstellen" aus der letzten Abschlagsrechnung
- Oder direkt über `POST /invoice-series/{id}/final`

### Inhalt der Schlussrechnung

1. **Gesamtleistung:** Alle Positionen mit Mengen und Preisen (wie Endabrechnung)
2. **Rechnungsaufstellung (automatisch generiert):**
   - Alle Abschlagsrechnungen: Nummer, Datum, Netto-Betrag, MwSt, Brutto
   - Zahlungsübersicht: Was wurde wann gezahlt (inkl. Skonto)
   - Unterschiedliche MwSt-Sätze berücksichtigen
3. **Offener Restbetrag:** Gesamtbetrag − Summe aller Zahlungen

### MwSt-Besonderheit

- Maßgeblich ist der Steuersatz zum Zeitpunkt der Leistungserbringung (= Bauabnahme)
- Abschläge können mit anderem MwSt-Satz gestellt worden sein (z.B. 16% vs. 19%)
- Schlussrechnung korrigiert die Steuer: Gesamt-MwSt − bereits in Abschlägen ausgewiesene MwSt

```
Beispiel:
Gesamtleistung netto:                50.000,00 €
MwSt 19% (aktueller Satz):            9.500,00 €
Gesamtbetrag brutto:                 59.500,00 €

Abschlagsrechnungen:
  AR-2026-0001: Netto 20.000, MwSt 16% = 3.200 (alter Satz!)
  AR-2026-0002: Netto 15.000, MwSt 19% = 2.850
Summe Abschläge brutto:              41.050,00 €

MwSt-Korrektur:
  Gesamt-MwSt (19%):                  9.500,00 €
  ./. MwSt aus Abschlägen:           -6.050,00 € (3.200 + 2.850)
  = MwSt Schlussrechnung:             3.450,00 €

Offener Restbetrag:
  Gesamtbetrag:                       59.500,00 €
  ./. Zahlungen:                     -41.050,00 €
  = Zu zahlen:                        18.450,00 €
```

### Datenmodell-Erweiterung

Auf `invoice_series_items` (Schlussrechnung):
- `is_final = true`
- `cumulative_net` = Gesamtleistung netto
- `previous_net` = Summe aller Abschlagsnetto
- `vat_correction` = MwSt-Differenz

#### Tabelle `final_invoice_settlement`
| Feld | Typ | Constraints | Beschreibung |
|------|-----|-------------|--------------|
| id | UUID | PK | |
| document_id | UUID | FK documents, NOT NULL | Die Schlussrechnung |
| tenant_id | UUID | FK tenants, NOT NULL | |
| partial_document_id | UUID | FK documents, NOT NULL | Die Abschlagsrechnung |
| partial_number | VARCHAR(50) | NOT NULL | Abschlagsnummer |
| partial_date | DATE | NOT NULL | Abschlagsdatum |
| partial_net | DECIMAL(14,2) | NOT NULL | Netto des Abschlags |
| partial_vat_rate | DECIMAL(5,2) | NOT NULL | MwSt-Satz des Abschlags |
| partial_vat | DECIMAL(14,2) | NOT NULL | MwSt-Betrag des Abschlags |
| partial_gross | DECIMAL(14,2) | NOT NULL | Brutto des Abschlags |
| total_paid | DECIMAL(14,2) | NOT NULL | Bereits gezahlter Betrag |
| created_at | TIMESTAMPTZ | NOT NULL | |

### Edge Cases

1. **Schlussrechnung < 0:** Überzahlung durch Abschläge → Gutschrift erstellen (credit_note).
2. **Teilleistungen vs. Abschlagsrechnungen:** Rechtlicher Unterschied! Abschlagsrechnungen sind Vorauszahlungen, Teilleistungen sind eigenständige Rechnungen.
3. **Bauabnahme fehlt:** Warnung, dass Schlussrechnung Abnahme voraussetzt.
4. **MwSt-Satzwechsel:** Automatische Verrechnung der Differenz.
5. **Nicht alle Abschläge bezahlt:** Warnung, trotzdem erstellbar.

### Business Rules
1. Schlussrechnung schließt die Serie (`invoice_series.status = 'closed'`).
2. Nach Schlussrechnung können keine weiteren Abschläge erstellt werden.
3. Schlussrechnung enthält IMMER die Rechnungsaufstellung.
4. MwSt-Korrektur wird automatisch berechnet.
5. Gutschrift bei Überzahlung muss manuell bestätigt werden.
6. Schlussrechnung hat eigenen Nummernkreis (SR-).

### API / OpenAPI

| Method | Path | Beschreibung |
|--------|------|--------------|
| POST | /invoice-series/{id}/final | Schlussrechnung erstellen |
| GET | /invoice-series/{id}/final/preview | Vorschau der Schlussrechnung mit Aufstellung |

#### POST /invoice-series/{id}/final Response
```json
{
  "document": { "...": "Schlussrechnung als document" },
  "settlement": {
    "total_net": 50000.00,
    "total_vat": 9500.00,
    "total_gross": 59500.00,
    "vat_rate": 19.00,
    "partials": [
      {
        "number": "AR-2026-0001",
        "date": "2026-01-15",
        "net": 20000.00,
        "vat_rate": 16.00,
        "vat": 3200.00,
        "gross": 23200.00,
        "paid": 23200.00
      },
      {
        "number": "AR-2026-0002",
        "date": "2026-06-01",
        "net": 15000.00,
        "vat_rate": 19.00,
        "vat": 2850.00,
        "gross": 17850.00,
        "paid": 17850.00
      }
    ],
    "total_partial_net": 35000.00,
    "total_partial_vat": 6050.00,
    "total_partial_gross": 41050.00,
    "total_paid": 41050.00,
    "vat_correction": 3450.00,
    "remaining_net": 15000.00,
    "remaining_gross": 18450.00,
    "is_credit_note": false
  }
}
```

### Permissions
- `documents.create` — (existiert)
- `invoice_series.manage` — (existiert aus ZMI-TICKET-133)

## Acceptance Criteria
1. Schlussrechnung aus Serie erstellbar.
2. Rechnungsaufstellung listet alle Abschläge korrekt.
3. Zahlungsverrechnung korrekt (Restbetrag berechnet).
4. MwSt-Korrektur bei unterschiedlichen Steuersätzen.
5. Serie wird nach Schlussrechnung geschlossen.
6. Gutschrift bei Überzahlung (negative Schlussrechnung).
7. Vorschau der Schlussrechnung möglich.

## Tests

### Unit Tests
- `TestFinalInvoice_Settlement_Simple`: 2 Abschläge à 10000€, Gesamt 30000€ → Rest 10000€.
- `TestFinalInvoice_Settlement_VatCorrection`: Abschlag mit 16%, Schluss mit 19% → Korrektur.
- `TestFinalInvoice_Settlement_MixedVat`: 1. Abschlag 16%, 2. Abschlag 19% → korrekte Verrechnung.
- `TestFinalInvoice_Settlement_CreditNote`: Abschläge > Gesamt → is_credit_note=true.
- `TestFinalInvoice_Settlement_PartialPayments`: Nicht alle Abschläge voll bezahlt → korrekte Verrechnung.
- `TestFinalInvoice_CloseSeries`: Serie status → 'closed' nach Schlussrechnung.
- `TestFinalInvoice_NoMorePartials`: Geschlossene Serie → Error bei neuem Abschlag.
- `TestFinalInvoice_AllPartialsRequired`: Stornierte Abschläge werden ausgelassen.
- `TestFinalInvoice_RemainingCalculation`: Brutto − bezahlt = Restbetrag.

### API Tests
- `TestFinalInvoiceHandler_Create_201`: Schlussrechnung erstellen.
- `TestFinalInvoiceHandler_Create_409_AlreadyClosed`: Serie geschlossen → 409.
- `TestFinalInvoiceHandler_Preview_200`: Vorschau mit Aufstellung.
- `TestFinalInvoiceHandler_TenantIsolation`: Fremde Serie → 404.

### Integration Tests
- `TestFinalInvoice_FullSeriesCycle`: 3 Abschläge → Zahlungen → Schlussrechnung → Serie closed.
- `TestFinalInvoice_VatCorrectionCycle`: Abschläge mit verschiedenen MwSt-Sätzen → Schlussrechnung korrigiert.

### Test Case Pack
1) **Standard-Schlussrechnung**: 2 Abschläge (20k + 15k netto), Gesamt 50k → Rest 15k netto.
2) **MwSt-Korrektur**: AR1 @16% (3200€ MwSt), AR2 @19% (2850€), Gesamt @19% (9500€) → Korrektur 3450€.
3) **Gutschrift**: Abschläge 60k, Gesamt nur 50k → negative Schlussrechnung → credit_note.
4) **Teilzahlungen**: Nicht alles bezahlt → Restbetrag höher.

## Verification Checklist
- [ ] Migration: final_invoice_settlement Tabelle
- [ ] Migration reversibel
- [ ] Schlussrechnung berechnet korrekte Restsumme
- [ ] MwSt-Korrektur bei verschiedenen Sätzen
- [ ] Rechnungsaufstellung listet alle Abschläge
- [ ] Serie wird geschlossen
- [ ] Keine neuen Abschläge nach Schlussrechnung
- [ ] Gutschrift bei Überzahlung
- [ ] Vorschau funktioniert
- [ ] Tenant-Isolation
- [ ] Alle Tests bestehen
- [ ] `make lint` keine neuen Issues

## Dependencies
- ZMI-TICKET-133 (Abschlagsrechnungen)
- ZMI-TICKET-132 (Zahlungsmodell)

## Notes
- Die MwSt-Korrektur ist steuerrechtlich komplex. Im Zweifel sollte ein Steuerberater konsultiert werden.
- Die Schlussrechnung ist im Handwerk der häufigste Streitpunkt zwischen Auftragnehmer und Auftraggeber.
- Gutschriften bei Überzahlung müssen als eigener Dokumententyp (credit_note) erstellt werden.
