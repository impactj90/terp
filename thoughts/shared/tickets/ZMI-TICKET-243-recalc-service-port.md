# ZMI-TICKET-243: RecalcService Port (Forward Cascade)

Status: Done
Priority: P1
Owner: TBD

## Goal
Den RecalcService von Go nach TypeScript portieren. Der Service implementiert die Forward-Recalculation-Cascade: Wenn ein Tag neu berechnet wird, werden alle abhängigen Folgetage und der Monatswert ebenfalls neu berechnet. Dies ist essentiell für die Konsistenz von Überstunden-Konten und Gleitzeitguthaben.

## Scope
- **In scope:**
  - `RecalcService` Portierung (Forward Cascade)
  - Trigger: Tag-Änderung → Folgetage → Monatswert
  - Queue-basierte Verarbeitung (um Endlos-Loops zu vermeiden)
  - Integration mit DailyCalcService und MonthlyCalcService
- **Out of scope:**
  - Daily/Monthly Calc Services (TICKET-234, 238)
  - Background Job Scheduling (TICKET-245)

## Requirements

### Service-Struktur
```typescript
class RecalcService {
  constructor(
    private prisma: PrismaClient,
    private dailyCalcService: DailyCalcService,
    private monthlyCalcService: MonthlyCalcService
  ) {}

  // Forward Recalculation auslösen
  async triggerRecalc(
    tenantId: string,
    employeeId: string,
    fromDate: Date,
    toDate?: Date
  ): Promise<RecalcResult>

  // Interne Methoden:
  private async recalcDays(tenantId, employeeId, dates: Date[]): Promise<void>
  private async recalcAffectedMonths(tenantId, employeeId, dates: Date[]): Promise<void>
  private findAffectedDateRange(fromDate: Date, toDate?: Date): Date[]
}
```

### Forward Cascade Logik
1. **Trigger** — Ein oder mehrere Tage werden als "dirty" markiert
2. **Day Recalc** — Alle betroffenen Tage werden per DailyCalcService neu berechnet
3. **Month Recalc** — Alle betroffenen Monate werden per MonthlyCalcService neu berechnet
4. **Cascade Detection** — Wenn ein Tageswert sich ändert, werden Folgetage geprüft:
   - Überstunden-Saldo ändert sich → Folgetage mit Überstunden-Konto betroffen
   - Gleitzeit-Saldo ändert sich → alle Folgetage bis Monatsende
5. **Loop Prevention** — Bereits berechnete Tage werden nicht erneut berechnet

### Business Logic (aus Go portiert)
- `apps/api/internal/service/recalc.go` (146 Zeilen) — Forward Cascade:
  - `TriggerRecalc()` — Hauptmethode
  - Date-Range-Bestimmung
  - Cascade-Detection
  - Month-Aggregation-Trigger

## Acceptance Criteria
- [ ] Forward Cascade berechnet alle betroffenen Folgetage
- [ ] Monats-Aggregation wird nach Day-Recalc ausgelöst
- [ ] Keine Endlos-Loops bei zirkulären Abhängigkeiten
- [ ] Performance: Cascade für einen Monat < 5 Sekunden
- [ ] Identische Ergebnisse wie Go-Implementation

## Tests
- Unit-Test: Single Day Recalc
- Unit-Test: Forward Cascade über mehrere Tage
- Unit-Test: Month Recalc nach Day Cascade
- Unit-Test: Loop Prevention
- Integration-Test: Buchung ändern → Cascade → alle Werte konsistent
- Performance-Test: Cascade für einen vollen Monat

## Dependencies
- ZMI-TICKET-234 (DailyCalcService — für Tagesberechnung)
- ZMI-TICKET-238 (MonthlyCalcService — für Monatsberechnung)
- ZMI-TICKET-235 (Calculate-Day Endpoint — Recalc-Trigger)

## Go-Dateien die ersetzt werden
- `apps/api/internal/service/recalc.go` (146 Zeilen)
