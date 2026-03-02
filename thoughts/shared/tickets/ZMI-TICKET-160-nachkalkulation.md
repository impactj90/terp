# ZMI-TICKET-160: Nachkalkulation — Plan vs. Ist Dashboard

Status: Proposed
Priority: P3
Owner: TBD
Epic: Phase 7 — Finanzen & Kalkulation
Source: plancraft-anforderungen.md.pdf, Abschnitt 9.1 Nachkalkulation
Blocked by: ZMI-TICKET-112, ZMI-TICKET-122, ZMI-TICKET-161

## Goal
Erweiterte Nachkalkulation als Ausbaustufe des Projekt-Dashboards (ZMI-TICKET-112). Detaillierter Vergleich Plan vs. Ist auf Positions-Ebene mit Daten aus Tiefenkalkulation (Plan), Zeiterfassung (Lohn-Ist), Eingangsrechnungen (Material-Ist) und Materialerfassung (Baustelle-Ist). Balkendiagramme pro Kostenart, Traffic-Light-System.

## Scope
- **In scope:** Positions-basierte Plan/Ist Auswertung, Integration aller Datenquellen, Detail-Dashboard mit Charts, Export.
- **Out of scope:** Frontend UI (Teil von Projekt-Dashboard), automatisierte Alerts.

## Requirements

### Datenquellen
| Kostenart | Plan (Quelle) | Ist (Quelle) |
|-----------|---------------|---------------|
| Lohn | Tiefenkalkulation (ZMI-TICKET-122) | Zeiterfassung × Stundensatz |
| Material | Tiefenkalkulation | Eingangsrechnungen + Materialerfassung |
| Geräte | Tiefenkalkulation | Eingangsrechnungen |
| Fremdleistungen | Tiefenkalkulation | Eingangsrechnungen |
| Gesamt | Summe Plan | Summe Ist |

### Nachkalkulationsebenen
1. **Projekt-Ebene:** Gesamtkosten Plan vs. Ist (bereits in ZMI-TICKET-112)
2. **Positions-Ebene:** Pro Position: Plan-EP × Menge vs. Ist-Kosten (NEU in diesem Ticket)
3. **Kostenarten-Ebene:** Pro Position pro Kostenart (NEU)

### API / OpenAPI
| Method | Path | Beschreibung |
|--------|------|--------------|
| GET | /projects/{id}/post-calculation | Nachkalkulation (Positions-Detail) |
| GET | /projects/{id}/post-calculation/export | CSV/Excel Export |

#### Response
```json
{
  "project_id": "...",
  "positions": [
    {
      "document_item_id": "...",
      "short_text": "Wand streichen",
      "planned": { "labor": 6750, "material": 3050, "equipment": 300, "total": 10100 },
      "actual": { "labor": 7200, "material": 2800, "equipment": 350, "total": 10350 },
      "deviation": { "labor": 6.7, "material": -8.2, "equipment": 16.7, "total": 2.5 },
      "status": { "labor": "yellow", "material": "green", "equipment": "yellow", "total": "green" }
    }
  ],
  "totals": {
    "planned": { "labor": 45000, "material": 22000, "total": 67000 },
    "actual": { "labor": 48000, "material": 19500, "total": 67500 },
    "deviation_percent": 0.7,
    "status": "green"
  }
}
```

### Permissions
- `projects.dashboard` — (existiert aus ZMI-TICKET-112)

## Acceptance Criteria
1. Positions-basierte Plan/Ist Auswertung.
2. Daten aus allen Quellen aggregiert (Kalkulation, Zeiterfassung, Eingangsrechnungen, Materialerfassung).
3. Traffic-Light pro Position und Kostenart.
4. Export als CSV/Excel.

## Tests
### Unit Tests
- `TestPostCalc_PositionLevel`: Plan und Ist pro Position berechnet.
- `TestPostCalc_CostTypeLevel`: Pro Kostenart aufgeschlüsselt.
- `TestPostCalc_Deviation`: Korrekte Prozent-Berechnung.
- `TestPostCalc_MissingActual`: Keine Ist-Daten → actual=0, status=gray.
- `TestPostCalc_NoPlan`: Keine Kalkulation → Plan null, nur Ist.

### API Tests
- `TestPostCalcHandler_Get_200`, `TestPostCalcHandler_Export_200`

### Integration Tests
- `TestPostCalc_EndToEnd`: Kalkulation → Zeiterfassung → Eingangsrechnung → Dashboard korrekt.

## Verification Checklist
- [ ] Positions-basierte Aggregation
- [ ] Alle Datenquellen integriert
- [ ] Traffic-Light pro Position/Kostenart
- [ ] CSV/Excel Export
- [ ] Alle Tests bestehen

## Dependencies
- ZMI-TICKET-112 (Dashboard), ZMI-TICKET-122 (Kalkulation), ZMI-TICKET-161 (Eingangsrechnungen), ZMI-TICKET-156 (Materialerfassung)
