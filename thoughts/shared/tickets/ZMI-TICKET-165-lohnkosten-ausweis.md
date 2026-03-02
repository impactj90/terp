# ZMI-TICKET-165: Lohnkosten-Ausweis (§35a EStG)

Status: Proposed
Priority: P4
Owner: TBD
Epic: Phase 7 — Finanzen & Kalkulation
Source: plancraft-anforderungen.md.pdf, Abschnitt 9.6 Lohnkosten-Ausweis
Blocked by: ZMI-TICKET-122, ZMI-TICKET-132

## Goal
Auf Rechnungen können Lohnkosten separat ausgewiesen werden, damit Privatkunden den steuerlichen Abzug nach §35a EStG (Handwerkerleistungen) geltend machen können. Automatische Berechnung aus Tiefenkalkulation.

## Scope
- **In scope:** Lohnkostenanteil aus Kalkulation berechnen, auf Rechnung/PDF separat ausweisen, Hinweistext.
- **Out of scope:** Steuerberater-Bescheinigung.

## Requirements

### Berechnung
```
Lohnkostenanteil = Summe aller Labor-CostBlocks (base_cost + surcharge_amount) × Menge
Steuerlicher Abzug: 20% der Lohnkosten, max. 1.200€/Jahr (Info-Text)
```

### Auf Rechnung ausweisen
- Zusätzlicher Block unter Summen: "Enthaltene Lohnkosten nach §35a EStG: X.XXX,XX € (inkl. MwSt)"
- Aktivierbar pro Dokument oder global als Default
- Hinweistext konfigurierbar

### API-Erweiterung
- Feld auf documents: `show_labor_cost_statement BOOLEAN DEFAULT false`
- GET /documents/{id}/labor-cost-statement → Berechnung

### Permissions
- `documents.edit` — (existiert)

## Acceptance Criteria
1. Lohnkostenanteil aus Kalkulation berechnet.
2. Auf Rechnung/PDF ausgewiesen.
3. Konfigurierbar (an/aus pro Dokument).

## Tests
### Unit Tests
- `TestLaborCost_Calculation`: Lohn-CostBlocks summiert × Menge.
- `TestLaborCost_InclVat`: Lohnkosten inkl. MwSt ausgewiesen.
- `TestLaborCost_NoCalc`: Ohne Kalkulation → nicht verfügbar.
- `TestLaborCost_MixedPositions`: Positionen mit/ohne Lohn → nur Lohnanteile.

### API Tests
- `TestLaborCostHandler_Statement_200`: Berechnung korrekt.

## Verification Checklist
- [ ] Feld show_labor_cost_statement auf documents
- [ ] Berechnung aus Kalkulation
- [ ] PDF-Ausweisung
- [ ] Alle Tests bestehen

## Dependencies
- ZMI-TICKET-122 (Kalkulation), ZMI-TICKET-132 (Rechnungen), ZMI-TICKET-140 (PDF)
