# ZMI-TICKET-132: Rechnungen — Einfache Rechnung & Lieferschein

Status: Proposed
Priority: P2
Owner: TBD
Epic: Phase 4 — Auftragsdokumente
Source: plancraft-anforderungen.md.pdf, Abschnitt 3.1 Dokumententypen (Rechnung, Lieferschein)
Blocked by: ZMI-TICKET-121, ZMI-TICKET-123, ZMI-TICKET-120
Blocks: ZMI-TICKET-133, ZMI-TICKET-162, ZMI-TICKET-164, ZMI-TICKET-165

## Goal
Einfache Rechnungen (ohne Abschlagsserie) und Lieferscheine implementieren. Rechnungen müssen alle §14 UStG Pflichtangaben enthalten. Lieferscheine können mit oder ohne Preise erstellt werden. Zahlungsverfolgung (Teilzahlung, Vollzahlung) gehört ebenfalls zum Scope.

## Scope
- **In scope:** Rechnungs-Erstellung (aus AB oder standalone), Pflichtfeld-Validierung (§14 UStG), Zahlungszuordnung, Zahlungsstatus-Tracking, Lieferschein (mit/ohne Preise), Fälligkeitsberechnung, Skonto.
- **Out of scope:** Abschlagsrechnungen (ZMI-TICKET-133), Schlussrechnung (ZMI-TICKET-134), Mahnwesen (ZMI-TICKET-162), PDF (ZMI-TICKET-140).

## Requirements

### Datenmodell

#### Tabelle `document_payments`
| Feld | Typ | Constraints | Beschreibung |
|------|-----|-------------|--------------|
| id | UUID | PK | |
| document_id | UUID | FK documents, NOT NULL | |
| tenant_id | UUID | FK tenants, NOT NULL | |
| payment_date | DATE | NOT NULL | Zahlungsdatum |
| amount | DECIMAL(14,2) | NOT NULL | Zahlungsbetrag |
| payment_method | VARCHAR(30) | | 'bank_transfer', 'cash', 'credit_card', 'check', 'other' |
| reference | VARCHAR(100) | | Verwendungszweck / Referenz |
| discount_applied | BOOLEAN | NOT NULL, DEFAULT false | Skonto in Anspruch genommen |
| discount_amount | DECIMAL(14,2) | | Skonto-Betrag |
| notes | TEXT | | |
| created_at | TIMESTAMPTZ | NOT NULL | |
| created_by | UUID | FK users | |

### Rechnungs-Pflichtfelder (§14 UStG)

Bei Fertigstellung einer Rechnung werden zusätzlich geprüft:
1. Vollständiger Name und Anschrift des leistenden Unternehmers (Tenant)
2. Vollständiger Name und Anschrift des Leistungsempfängers (Kontakt)
3. Steuernummer oder USt-IdNr. des Tenants
4. Ausstellungsdatum
5. Fortlaufende Rechnungsnummer (aus Nummernkreis)
6. Menge und Art der Leistung
7. Zeitpunkt der Leistung / Lieferung
8. Netto-Entgelt
9. MwSt-Satz und -Betrag
10. Brutto-Betrag

### Zahlungsstatus

| Status | Bedingung |
|--------|-----------|
| `unpaid` | Keine Zahlungen zugeordnet |
| `partially_paid` | Summe Zahlungen < Brutto-Betrag |
| `paid` | Summe Zahlungen ≥ Brutto-Betrag |
| `overpaid` | Summe Zahlungen > Brutto-Betrag |

Zahlungsstatus wird berechnet, nicht gespeichert (aus Summe der Zahlungen).

### Fälligkeitsberechnung
```
due_date = document_date + payment_days
is_overdue = today > due_date AND payment_status != 'paid'
discount_due_date = document_date + discount_days
discount_valid = today <= discount_due_date
```

### Skonto-Berechnung
```
Bei Zahlung mit Skonto:
  Erwarteter Zahlungsbetrag = gross_total × (1 - discount_percent/100)
  discount_amount = gross_total - erwarteter Betrag
```

### Lieferschein-Besonderheiten
- Kann mit oder ohne Preise erstellt werden (Konfigurationsoption `show_prices`)
- Wird aus AB oder Rechnung generiert
- Hat eigenen Nummernkreis (LS-{YYYY}-{####})
- Keine Zahlungen zuordnenbar

### Business Rules
1. Rechnung ohne Kontakt → Validierung Error (§14 UStG).
2. Rechnung ohne Tenant-Steuerdaten → Validierung Error.
3. Zahlungen können nur auf finalisierte/gesendete Rechnungen gebucht werden.
4. Überzahlung → Warnung, Gutschrift-Workflow (Zukunft).
5. Rechnung mit Zahlungen → nicht löschbar, nicht wiederöffenbar.
6. Lieferschein hat keine Zahlungen.
7. Skonto wird nur innerhalb der Skonto-Frist gewährt (bei Verletzung → Warnung).

### API / OpenAPI

| Method | Path | Beschreibung |
|--------|------|--------------|
| POST | /documents/{id}/payments | Zahlung zuordnen |
| GET | /documents/{id}/payments | Zahlungen einer Rechnung |
| DELETE | /documents/{id}/payments/{paymentId} | Zahlung entfernen |
| GET | /documents/{id}/payment-status | Zahlungsstatus berechnen |

#### POST /documents/{id}/payments Request
```json
{
  "payment_date": "2026-04-01",
  "amount": 6241.31,
  "payment_method": "bank_transfer",
  "reference": "RE-2026-0042",
  "discount_applied": true,
  "discount_amount": 124.83
}
```

#### GET /documents/{id}/payment-status Response
```json
{
  "gross_total": 6241.31,
  "total_paid": 6116.48,
  "remaining": 0,
  "status": "paid",
  "due_date": "2026-04-01",
  "is_overdue": false,
  "discount_due_date": "2026-03-25",
  "discount_valid": false,
  "discount_amount_possible": 124.83,
  "payments": [
    {
      "id": "...",
      "date": "2026-03-22",
      "amount": 6116.48,
      "discount_applied": true,
      "discount_amount": 124.83
    }
  ]
}
```

### Permissions
- `documents.create` — (existiert) Rechnungen erstellen
- `payments.create` — Zahlungen buchen
- `payments.delete` — Zahlungen entfernen

## Acceptance Criteria
1. Rechnungen mit §14 UStG Pflichtfeldvalidierung.
2. Zahlungen zuordenbar mit Skonto-Berechnung.
3. Zahlungsstatus korrekt berechnet (unpaid/partially_paid/paid/overpaid).
4. Fälligkeitsdatum und Überfälligkeits-Check.
5. Lieferschein mit/ohne Preise.
6. Rechnung mit Zahlungen nicht löschbar/wiederöffenbar.

## Tests

### Unit Tests
- `TestInvoice_Validate_AllRequired`: Alle §14-Felder vorhanden → valid.
- `TestInvoice_Validate_NoContact`: Kein Kontakt → Error.
- `TestInvoice_Validate_NoTaxData`: Keine Steuernummer → Error.
- `TestInvoice_PaymentStatus_Unpaid`: Keine Zahlungen → unpaid.
- `TestInvoice_PaymentStatus_Partial`: 3000€ von 6000€ → partially_paid.
- `TestInvoice_PaymentStatus_Paid`: Voller Betrag → paid.
- `TestInvoice_PaymentStatus_Overpaid`: Mehr als Betrag → overpaid.
- `TestInvoice_PaymentStatus_WithDiscount`: Skonto-Zahlung → paid (obwohl weniger).
- `TestInvoice_DueDate`: payment_days=14, doc_date=2026-03-18 → due_date=2026-04-01.
- `TestInvoice_IsOverdue`: due_date < today, unpaid → is_overdue=true.
- `TestInvoice_Discount_Valid`: Innerhalb Frist → discount_valid=true.
- `TestInvoice_Discount_Expired`: Außerhalb Frist → discount_valid=false.
- `TestInvoice_Discount_Amount`: gross=6241.31, discount=2% → discount_amount=124.83.
- `TestInvoice_CannotDeleteWithPayments`: Zahlung vorhanden → Error.
- `TestInvoice_CannotReopenWithPayments`: Zahlung vorhanden → Error.
- `TestDeliveryNote_NoPayments`: Zahlung buchen → Error "delivery notes don't accept payments".
- `TestDeliveryNote_WithoutPrices`: show_prices=false → unit_price und total_price = null in Response.

### API Tests
- `TestInvoiceHandler_CreatePayment_201`: Zahlung buchen.
- `TestInvoiceHandler_CreatePayment_400_NegativeAmount`: Negativer Betrag → 400.
- `TestInvoiceHandler_CreatePayment_409_Draft`: Entwurf → 409.
- `TestInvoiceHandler_PaymentStatus_200`: Status korrekt.
- `TestInvoiceHandler_DeletePayment_200`: Zahlung entfernen.
- `TestInvoiceHandler_DeletePayment_403`: Ohne payments.delete → 403.
- `TestInvoiceHandler_TenantIsolation`: Zahlung auf fremde Rechnung → 404.

### Integration Tests
- `TestInvoice_FullPaymentCycle`: Rechnung → Senden → Zahlung buchen → Status paid.
- `TestInvoice_PartialPayments`: 2 Teilzahlungen → partially_paid → Restzahlung → paid.
- `TestInvoice_DiscountPayment`: Rechnung 1000€ brutto, 2% Skonto → Zahlung 980€ → paid.

### Test Case Pack
1) **Einfache Rechnung**: Erstellen → Fertigstellen (RE-2026-0001) → Zahlung 100% → paid.
2) **Teilzahlung**: Rechnung 6000€ → 3000€ gezahlt → partially_paid, remaining=3000.
3) **Skonto**: Rechnung 10000€, Skonto 3%/7 Tage → Innerhalb 7 Tagen 9700€ → paid.
4) **Lieferschein ohne Preise**: show_prices=false → Keine Beträge auf Dokument.

## Verification Checklist
- [ ] Migration: document_payments Tabelle
- [ ] Migration reversibel
- [ ] §14 UStG Validierung bei Rechnung
- [ ] Zahlungsstatus korrekt berechnet
- [ ] Skonto-Berechnung korrekt
- [ ] Fälligkeitsberechnung korrekt
- [ ] Lieferschein mit/ohne Preise
- [ ] Zahlung nur auf finalisierte Rechnungen
- [ ] Rechnung mit Zahlungen nicht lösch-/wiederöffenbar
- [ ] Tenant-Isolation
- [ ] Alle Tests bestehen
- [ ] `make lint` keine neuen Issues

## Dependencies
- ZMI-TICKET-121 (Dokumenten-Editor Datenmodell)
- ZMI-TICKET-123 (Dokumenten-Workflow)
- ZMI-TICKET-120 (Nummernkreise)
- ZMI-TICKET-107 (Unternehmensdaten — §14 Validierung)

## Notes
- Einfache Rechnungen sind für kleinere Aufträge ohne Abschlagsserie gedacht.
- Die Zahlungsverfolgung ist bewusst einfach gehalten. Komplexe Bankanbindung (HBCI, etc.) ist nicht in Scope.
- Skonto-Berechnung: Der volle Betrag wird in der Rechnung ausgewiesen, der Skonto-Abzug erfolgt bei der Zahlungsbuchung.
