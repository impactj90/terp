# ZMI-TICKET-164: Rechnungslisten & Finanz-Dashboard

Status: Proposed
Priority: P3
Owner: TBD
Epic: Phase 7 — Finanzen & Kalkulation
Source: plancraft-anforderungen.md.pdf, Abschnitt 9.5 Rechnungslisten & Dashboard
Blocked by: ZMI-TICKET-132

## Goal
Finanz-Übersicht mit Rechnungslisten (alle Status), Umsatz-Übersichten (monatlich/quartalsweise/jährlich), Offene Posten Liste (OPOS) und Filter nach Zeitraum, Kunde, Status.

## Scope
- **In scope:** Rechnungsliste mit erweiterten Filtern, Umsatz-Aggregation, OPOS-Liste, Dashboard-Kennzahlen, Export.
- **Out of scope:** Banking-Integration, Steuerberater-Export (→ ZMI-TICKET-182).

## Requirements

### Rechnungsliste
- Alle Rechnungen (einfach + Abschlag + Schluss + Gutschrift)
- Filter: Status (Entwurf/Offen/Teilweise bezahlt/Bezahlt/Überfällig/Storniert), Zeitraum, Kunde, Projekt
- Sortierung: Datum, Nummer, Betrag, Fälligkeit
- Spalten: Nummer, Datum, Kunde, Netto, Brutto, Bezahlt, Offen, Status, Fällig am

### Umsatz-Übersicht
- Monatlich, Quartalsweise, Jährlich umschaltbar
- Netto-Umsatz (nur bezahlte/versendete Rechnungen)
- Grafik (Balkendiagramm)

### OPOS (Offene Posten Liste)
- Alle unbezahlten/teilbezahlten Rechnungen
- Sortiert nach Fälligkeit (älteste zuerst)
- Summe aller offenen Beträge

### Dashboard-Kennzahlen
```json
{
  "current_month": {
    "revenue": 45000.00,
    "invoiced": 52000.00,
    "outstanding": 18500.00,
    "overdue": 5200.00
  },
  "year_to_date": {
    "revenue": 380000.00,
    "invoiced": 420000.00
  },
  "opos_total": 35000.00,
  "opos_count": 12,
  "average_payment_days": 18.5
}
```

### API / OpenAPI
| Method | Path | Beschreibung |
|--------|------|--------------|
| GET | /finance/invoices | Erweiterte Rechnungsliste |
| GET | /finance/revenue | Umsatz-Übersicht |
| GET | /finance/opos | Offene Posten Liste |
| GET | /finance/dashboard | Finanz-Kennzahlen |
| GET | /finance/export | CSV/Excel Export |

### Permissions
- `finance.view` — Finanzübersicht
- `finance.export` — Export

## Acceptance Criteria
1. Rechnungsliste mit allen Filtern und Status.
2. Umsatz-Übersicht (monatlich/quartalsweise/jährlich).
3. OPOS-Liste korrekt.
4. Dashboard-Kennzahlen berechnet.
5. Export als CSV/Excel.

## Tests
### Unit Tests
- `TestFinance_Revenue_Monthly`: Monatlicher Umsatz korrekt aggregiert.
- `TestFinance_OPOS`: Nur unbezahlte Rechnungen, nach Fälligkeit sortiert.
- `TestFinance_Dashboard_Kennzahlen`: Alle Werte korrekt berechnet.
- `TestFinance_AveragePaymentDays`: Durchschnittliche Zahlungsdauer.
- `TestFinance_FilterByStatus`: Nur überfällige → korrekte Liste.

### API Tests
- `TestFinanceHandler_Invoices_200`, `TestFinanceHandler_Revenue_200`, `TestFinanceHandler_OPOS_200`, `TestFinanceHandler_Dashboard_200`

## Verification Checklist
- [ ] Rechnungsliste mit Filtern
- [ ] Umsatz-Aggregation (Monat/Quartal/Jahr)
- [ ] OPOS-Liste
- [ ] Dashboard-Kennzahlen
- [ ] CSV/Excel Export
- [ ] Alle Tests bestehen

## Dependencies
- ZMI-TICKET-132 (Rechnungen/Zahlungen)
