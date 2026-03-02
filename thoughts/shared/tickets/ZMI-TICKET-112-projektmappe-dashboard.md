# ZMI-TICKET-112: Projektmappe — Dashboard (Plan vs. Ist)

Status: Proposed
Priority: P2
Owner: TBD
Epic: Phase 2 — Projektverwaltung
Source: plancraft-anforderungen.md.pdf, Abschnitt 4.2 Projekt-Dashboard, 9.1 Nachkalkulation
Blocked by: ZMI-TICKET-110

## Goal
Projekt-Dashboard mit Kosten-Übersicht (Plan vs. Ist), Zeitverbrauch, Rechnungsstatus und Fortschrittsbalken. Dient als zentrale Steuerungsansicht für die Projektrentabilität. Die Datenquellen sind zunächst auf bestehende Zeiterfassung beschränkt und werden schrittweise erweitert wenn weitere Module implementiert werden.

## Scope
- **In scope:** Dashboard-API mit berechneten Kennzahlen, Kosten-Aggregation, Zeitauswertung aus bestehender Zeiterfassung, Fortschrittsberechnung, Traffic-Light-System.
- **Out of scope:** Frontend UI (ZMI-TICKET-113), Eingangsrechnungen (ZMI-TICKET-161), volle Nachkalkulation (ZMI-TICKET-160).

## Requirements

### Kennzahlen-Modell

#### Datenquellen
| Kennzahl | Quelle Plan | Quelle Ist | Verfügbar ab |
|----------|------------|-----------|-------------|
| Lohnkosten | Tiefenkalkulation (h × Stundensatz) | Zeiterfassung × Stundensatz | Zeiterfassung existiert, Kalkulation ab ZMI-TICKET-122 |
| Materialkosten | Tiefenkalkulation | Eingangsrechnungen + Materialerfassung | ZMI-TICKET-161, ZMI-TICKET-156 |
| Gerätekosten | Tiefenkalkulation | Eingangsrechnungen | ZMI-TICKET-161 |
| Fremdleistungen | Tiefenkalkulation | Eingangsrechnungen | ZMI-TICKET-161 |
| Gesamtkosten | Summe Plan | Summe Ist | Teilweise sofort |
| Umsatz | Rechnungsbetrag(e) | Zahlungseingänge | ZMI-TICKET-130+ |
| Gewinn/Verlust | Umsatz − Plankosten | Umsatz − Ist-Kosten | ZMI-TICKET-130+ |

#### Dashboard-Response
```json
{
  "project_id": "...",
  "project_name": "Malerarbeiten Müller",
  "project_status": "in_progress",
  "time": {
    "planned_hours": 120.0,
    "actual_hours": 87.5,
    "remaining_hours": 32.5,
    "progress_percent": 72.9,
    "status": "green"
  },
  "costs": {
    "labor": {
      "planned": 5400.00,
      "actual": 3937.50,
      "deviation_percent": -27.1,
      "status": "green"
    },
    "material": {
      "planned": null,
      "actual": null,
      "deviation_percent": null,
      "status": "gray"
    },
    "equipment": {
      "planned": null,
      "actual": null,
      "deviation_percent": null,
      "status": "gray"
    },
    "subcontractor": {
      "planned": null,
      "actual": null,
      "deviation_percent": null,
      "status": "gray"
    },
    "total": {
      "planned": 5400.00,
      "actual": 3937.50,
      "deviation_percent": -27.1,
      "status": "green"
    }
  },
  "revenue": {
    "invoiced": null,
    "paid": null,
    "outstanding": null,
    "status": "gray"
  },
  "profit": {
    "planned": null,
    "actual": null,
    "status": "gray"
  },
  "progress": {
    "overall_percent": 65,
    "status": "green"
  },
  "warnings": [
    "Nicht alle Zeiten erfasst (2 Mitarbeiter ohne Buchung am 15.03.)"
  ],
  "last_updated": "2026-03-18T14:30:00Z"
}
```

### Traffic-Light-System
| Status | Bedingung | Farbe |
|--------|-----------|-------|
| `green` | Ist ≤ Plan (innerhalb 10% Toleranz) | Grün |
| `yellow` | Ist > Plan um 10-25% | Gelb |
| `red` | Ist > Plan um >25% | Rot |
| `gray` | Keine Daten vorhanden | Grau |

Toleranzen konfigurierbar pro Tenant (SystemSettings).

### Berechnung der Ist-Lohnkosten
```
Für jeden Mitarbeiter auf dem Projekt:
  Gebuchte Stunden (aus Zeiterfassung, orders mit project_id)
  × Stundenverrechnungssatz (aus Tenant default_hourly_rate oder Mitarbeiter-spezifisch)
  = Ist-Lohnkosten pro Mitarbeiter
Summe = Gesamt-Ist-Lohnkosten
```

### Berechnung Fortschritt
- Ohne Kalkulations-Daten: Zeitbasiert: actual_hours / planned_hours × 100
- Mit Kalkulations-Daten (Zukunft): Wertbasiert: Ist-Kosten / Plan-Kosten × 100
- Manueller Override möglich (project.progress_override)

### Business Rules
1. Dashboard-Daten werden bei jedem Abruf live berechnet (kein Caching in V1).
2. `null`-Werte bedeuten "Datenquelle noch nicht verfügbar" (Modul nicht implementiert).
3. Traffic-Light wird nur berechnet wenn sowohl Plan als auch Ist vorhanden.
4. Lohnkosten-Ist kommt aus gebuchten Stunden auf dem Projekt (Orders mit project_id).
5. Wenn keine planned_hours gesetzt → Fortschritt und Lohn-Plan = null.
6. planned_hours wird initial manuell auf dem Projekt gesetzt (Feld auf projects-Tabelle).
7. Wenn Kalkulations-Modul (ZMI-TICKET-122) implementiert: planned_hours/costs automatisch aus Dokumenten-Kalkulation.
8. Warnungen werden generiert für: fehlende Zeiteinträge, nicht zugeordnete Eingangsrechnungen, Kostenüberschreitung.

### Erweiterung der projects-Tabelle
| Feld | Typ | Constraints | Beschreibung |
|------|-----|-------------|--------------|
| planned_hours | DECIMAL(10,2) | | Geplante Gesamtstunden |
| planned_labor_cost | DECIMAL(12,2) | | Geplante Lohnkosten |
| planned_material_cost | DECIMAL(12,2) | | Geplante Materialkosten |
| planned_equipment_cost | DECIMAL(12,2) | | Geplante Gerätekosten |
| planned_subcontractor_cost | DECIMAL(12,2) | | Geplante Fremdleistungskosten |
| planned_revenue | DECIMAL(12,2) | | Geplanter Umsatz (Angebotssumme) |
| progress_override | INT | CHECK (0-100) | Manueller Fortschritts-Override |

### API / OpenAPI

| Method | Path | Beschreibung |
|--------|------|--------------|
| GET | /projects/{id}/dashboard | Dashboard-Kennzahlen abrufen |
| GET | /projects/{id}/dashboard/time-entries | Zeiteinträge-Übersicht für das Projekt |
| GET | /projects/{id}/dashboard/cost-breakdown | Kostenaufschlüsselung nach Kostenart |
| PATCH | /projects/{id}/planned-values | Planwerte setzen/aktualisieren |

### Permissions
- `projects.dashboard` — Dashboard anzeigen
- `projects.edit` — (existiert) Planwerte setzen

## Acceptance Criteria
1. Dashboard-API gibt alle Kennzahlen zurück.
2. Ist-Lohnkosten werden aus Zeiterfassung korrekt berechnet.
3. Traffic-Light-System funktioniert (grün/gelb/rot/grau).
4. Planwerte können manuell gesetzt werden.
5. Fortschritt wird korrekt berechnet (zeitbasiert).
6. Nicht verfügbare Datenquellen geben null zurück (kein Fehler).
7. Warnungen werden generiert bei Auffälligkeiten.
8. Dashboard-Daten werden live berechnet.

## Tests

### Unit Tests — Service

#### Kosten-Berechnung
- `TestDashboard_LaborCost_Actual`: 3 Mitarbeiter, je 20h → 60h × 45€ = 2700€.
- `TestDashboard_LaborCost_NoEntries`: Keine Zeiteinträge → actual=0.
- `TestDashboard_LaborCost_DifferentRates`: Mitarbeiter mit verschiedenen Stundensätzen.
- `TestDashboard_TotalCost`: Summe aller Kostenarten.
- `TestDashboard_TotalCost_PartialNull`: Nur Lohn hat Daten → total.planned = labor.planned.

#### Traffic-Light
- `TestDashboard_TrafficLight_Green`: Ist=90, Plan=100 (10% unter) → green.
- `TestDashboard_TrafficLight_Green_Exact`: Ist=100, Plan=100 → green.
- `TestDashboard_TrafficLight_Yellow`: Ist=115, Plan=100 (15% über) → yellow.
- `TestDashboard_TrafficLight_Red`: Ist=130, Plan=100 (30% über) → red.
- `TestDashboard_TrafficLight_Gray`: Plan=null → gray.
- `TestDashboard_TrafficLight_BothZero`: Plan=0, Ist=0 → green.
- `TestDashboard_TrafficLight_CustomThresholds`: Tenant-Toleranzen 5%/15% → yellow ab 105.

#### Fortschritt
- `TestDashboard_Progress_TimeBased`: actual_hours=60, planned_hours=120 → 50%.
- `TestDashboard_Progress_Exceeds100`: actual=130, planned=120 → 108% (erlaubt).
- `TestDashboard_Progress_NoPlan`: planned_hours=null → progress=null.
- `TestDashboard_Progress_Override`: progress_override=80 → 80% (ignoriert Berechnung).
- `TestDashboard_Progress_ZeroPlanned`: planned=0 → progress=null (Division durch 0 vermeiden).

#### Warnungen
- `TestDashboard_Warning_MissingTimeEntries`: Mitarbeiter gebucht aber keine Zeiteinträge → Warnung.
- `TestDashboard_Warning_CostOverrun`: Ist > Plan um >25% → Warnung.
- `TestDashboard_Warning_NoWarnings`: Alles im Rahmen → leere Warnungen-Liste.

#### Deviation
- `TestDashboard_Deviation_UnderBudget`: Plan=1000, Ist=800 → -20%.
- `TestDashboard_Deviation_OverBudget`: Plan=1000, Ist=1200 → +20%.
- `TestDashboard_Deviation_NoPlan`: Plan=null → deviation=null.

### API Tests
- `TestDashboardHandler_Get_200`: Dashboard mit vollständigen Kennzahlen.
- `TestDashboardHandler_Get_200_Empty`: Neues Projekt ohne Daten → alle Werte null/0.
- `TestDashboardHandler_Get_200_PartialData`: Nur Zeiteinträge vorhanden → Lohn ausgefüllt, Rest null.
- `TestDashboardHandler_Get_404`: Unbekanntes Projekt → 404.
- `TestDashboardHandler_Get_403`: Ohne projects.dashboard → 403.
- `TestDashboardHandler_TimeEntries_200`: Zeiteinträge-Aufschlüsselung.
- `TestDashboardHandler_CostBreakdown_200`: Kosten nach Kostenart.
- `TestDashboardHandler_PatchPlannedValues_200`: Planwerte setzen.
- `TestDashboardHandler_PatchPlannedValues_400`: Negative Werte → 400.

### Integration Tests
- `TestDashboard_EndToEnd_WithTimeEntries`: Projekt → Mitarbeiter zuordnen → Zeiteinträge buchen → Dashboard zeigt korrekte Ist-Stunden und Lohnkosten.
- `TestDashboard_PlannedVsActual`: Planwerte setzen → Zeiteinträge buchen → Deviation und Traffic-Light korrekt.
- `TestDashboard_TenantIsolation`: Dashboard von Projekt Tenant A nicht über Tenant B abrufbar.
- `TestDashboard_ProgressOverride`: Override setzen → Dashboard zeigt Override statt berechneten Wert.

### Test Case Pack
1) **Dashboard für aktives Projekt**
   - Setup: Projekt, planned_hours=120, planned_labor=5400, 2 Mitarbeiter, 60h gebucht, Stundensatz 45€
   - Expected: actual_hours=60, actual_labor=2700, progress=50%, status=green

2) **Kostenüberschreitung (rot)**
   - Setup: planned_labor=5000, actual=6500 (+30%)
   - Expected: labor.status=red, Warnung "Lohnkosten überschreiten Plan um 30%"

3) **Leichter Überschuss (gelb)**
   - Setup: planned_labor=5000, actual=5750 (+15%)
   - Expected: labor.status=yellow

4) **Kein Plan gesetzt**
   - Setup: Projekt ohne planned_hours/costs
   - Expected: Alle Plan-Werte null, Traffic-Light gray

5) **Manueller Fortschritt-Override**
   - Setup: planned_hours=100, actual_hours=30, progress_override=60
   - Expected: progress.overall_percent=60 (Override statt 30%)

6) **Warnung fehlende Zeiten**
   - Setup: Mitarbeiter auf Projekt gebucht, aber keine Zeiteinträge für heute
   - Expected: Warnung in warnings-Array

7) **Mehrere Stundensätze**
   - Setup: Mitarbeiter A (50€/h, 20h) + Mitarbeiter B (40€/h, 30h)
   - Expected: actual_labor = (50×20) + (40×30) = 2200

8) **Fortschritt >100%**
   - Setup: planned_hours=80, actual_hours=95
   - Expected: progress=118.8%, status=red

## Verification Checklist
- [ ] Migration: Neue Spalten auf projects (planned_hours, planned_*_cost, planned_revenue, progress_override)
- [ ] Migration reversibel
- [ ] Dashboard-Service berechnet alle Kennzahlen live
- [ ] Lohnkosten-Berechnung aus Zeiterfassung korrekt
- [ ] Traffic-Light-Logik implementiert (green/yellow/red/gray)
- [ ] Toleranz-Schwellen aus SystemSettings konfigurierbar
- [ ] Fortschritt: zeitbasiert + Override
- [ ] Division durch 0 wird abgefangen
- [ ] null-Handling für nicht verfügbare Datenquellen
- [ ] Warnungen werden generiert
- [ ] Planwerte können gesetzt werden
- [ ] GET /dashboard Response enthält alle Felder
- [ ] Permissions durchgesetzt
- [ ] Tenant-Isolation verifiziert
- [ ] Alle Unit Tests bestehen
- [ ] Alle API Tests bestehen
- [ ] Alle Integration Tests bestehen
- [ ] `make lint` keine neuen Issues

## Dependencies
- ZMI-TICKET-110 (Projekte)
- Bestehende Zeiterfassung (Orders + Bookings)
- ZMI-TICKET-107 (default_hourly_rate auf Tenant)

## Notes
- Das Dashboard wird schrittweise "intelligenter" wenn weitere Module implementiert werden. Die null-Werte werden dann durch echte Daten ersetzt.
- Material-, Geräte- und Fremdleistungskosten kommen erst mit ZMI-TICKET-161 (Eingangsrechnungen).
- Umsatz/Gewinn kommt erst mit ZMI-TICKET-130+ (Rechnungen/Zahlungen).
- Für Performance bei vielen Zeiteinträgen: Denormalisierte Summen in einer Cache-Tabelle `project_cost_summary` könnten in V2 eingeführt werden.
- Die Verknüpfung Zeiterfassung → Projekt läuft über: orders.project_id → order_bookings → bookings → Stunden.
