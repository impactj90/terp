# ZMI-TICKET-172: Arbeitsanweisungen & Materiallisten

Status: Proposed
Priority: P3
Owner: TBD
Epic: Phase 8 — Kommunikation
Source: plancraft-anforderungen.md.pdf, Abschnitt 3.9 Arbeitsanweisungen & Materiallisten
Blocked by: ZMI-TICKET-131, ZMI-TICKET-122

## Goal
Automatische Generierung von Arbeitsanweisungen und Materiallisten aus Auftragsbestätigungen. Sichtbar für gebuchte Mitarbeiter. Zeigen: Was ist zu tun (Positionen, Mengen, Hinweise) und welche Materialien werden benötigt.

## Scope
- **In scope:** Arbeitsanweisungen-Generierung aus AB, Materiallisten-Generierung aus Kalkulation, API für Mitarbeiter, Dokumentauswahl.
- **Out of scope:** Mobile App (ZMI-TICKET-193).

## Requirements

### Arbeitsanweisung
Automatisch generiert aus AB-Positionen:
- Was ist zu tun: Positionsbezeichnung, Langtext
- Mengen und Einheiten
- Hinweise: "alternativ" / "Bedarfsposition"
- Kein Preis (nur Leistungsbeschreibung)

### Materialliste
Automatisch generiert aus Kalkulation (Material-CostBlocks):
- Artikel-Name, Menge (aggregiert über alle Positionen), Einheit
- Sortiert nach Kostenart
- Auswählbar: Aus welchem Dokument (AB oder Angebot)

### Datenmodell
Keine eigene Tabelle — werden on-the-fly aus Dokumenten berechnet.

### API / OpenAPI
| Method | Path | Beschreibung |
|--------|------|--------------|
| GET | /documents/{id}/work-instructions | Arbeitsanweisung generieren |
| GET | /documents/{id}/material-list | Materialliste generieren |
| GET | /documents/{id}/work-instructions/pdf | Als PDF |
| GET | /documents/{id}/material-list/pdf | Als PDF |

### Permissions
- `documents.view` — (existiert)

## Acceptance Criteria
1. Arbeitsanweisung aus AB generiert (ohne Preise).
2. Materialliste aus Kalkulation aggregiert.
3. PDF-Export.

## Tests
### Unit Tests
- `TestWorkInstruction_Generate`: AB mit 5 Positionen → 5 Anweisungen.
- `TestWorkInstruction_NoPrices`: Keine Preise in Output.
- `TestWorkInstruction_AlternativeHint`: Alternative Position → Hinweis.
- `TestMaterialList_Aggregated`: 3 Positionen mit gleicher Farbe → 1 Eintrag, Menge summiert.
- `TestMaterialList_FromCalc`: Material aus Kalkulation extrahiert.

### API Tests
- `TestWorkInstructionHandler_Get_200`, `TestMaterialListHandler_Get_200`

## Verification Checklist
- [ ] Arbeitsanweisung-Generierung
- [ ] Kein Preis in Arbeitsanweisung
- [ ] Materialliste aus Kalkulation
- [ ] Mengen-Aggregation
- [ ] PDF-Export
- [ ] Alle Tests bestehen

## Dependencies
- ZMI-TICKET-131 (Auftragsbestätigung), ZMI-TICKET-122 (Kalkulation)
