# ZMI-TICKET-238: MonthlyCalcService Port

Status: Proposed
Priority: P1
Owner: TBD

## Goal
Den MonthlyCalcService von Go nach TypeScript portieren. Der Service aggregiert Daily Values eines Monats zu einem Monthly Value — Summen für Arbeitszeit, Überstunden, Abwesenheiten, Urlaub und Kontowerte.

## Scope
- **In scope:**
  - `MonthlyCalcService` Portierung (Go → TypeScript)
  - Monatliche Aggregation aller Daily Values
  - Kontowert-Aggregation pro Monat
  - MonthlyValue Upsert
- **Out of scope:**
  - Monthly Values Router (TICKET-239)
  - Monthly Eval Templates (TICKET-227)

## Requirements

### Service-Struktur
```typescript
class MonthlyCalcService {
  constructor(private prisma: PrismaClient) {}

  // Monatswert berechnen
  async calculateMonth(
    tenantId: string,
    employeeId: string,
    year: number,
    month: number
  ): Promise<MonthlyValue>

  // Interne Methoden:
  private async loadDailyValues(tenantId, employeeId, year, month): Promise<DailyValue[]>
  private aggregateDailyValues(dailyValues: DailyValue[]): MonthlyAggregation
  private aggregateAccountValues(dailyValues: DailyValue[]): Record<string, Decimal>
  private async saveMonthlyValue(tenantId, employeeId, year, month, aggregation): Promise<MonthlyValue>
}
```

### Aggregations-Logik
- Arbeitstage zählen (`is_work_day === true`)
- Soll-Stunden summieren (`planned_hours`)
- Ist-Stunden summieren (`actual_hours`)
- Überstunden summieren (`overtime_hours`)
- Abwesenheitstage summieren (nach AbsenceType)
- Urlaubstage summieren
- Krankheitstage summieren
- Kontowerte pro Account summieren
- Status-Prüfung: Nur "calculated" oder "approved" Daily Values einbeziehen

### Business Logic (aus Go portiert)
- `apps/api/internal/service/monthlycalc.go` (203 Zeilen) — Vollständiger Port
- `apps/api/internal/service/monthlyeval.go` (502 Zeilen) — Evaluation-Logik

## Acceptance Criteria
- [ ] Monatswert wird korrekt aus Daily Values aggregiert
- [ ] Kontowerte werden pro Account summiert
- [ ] Status-Filter: Nur berechnete/genehmigte Tage einbezogen
- [ ] MonthlyValue Upsert (Update bei Neuberechnung)
- [ ] Identische Ergebnisse wie Go-Implementation
- [ ] Bestehende Tests portiert

## Tests
- Unit-Test: Aggregation eines Standard-Monats
- Unit-Test: Aggregation mit Abwesenheiten und Urlaub
- Unit-Test: Kontowert-Summierung
- Unit-Test: Monat ohne Daily Values
- Integration-Test: calculateMonth mit echten Daten
- Regression-Test: Go-Berechnungsergebnisse als Expected Values

## Dependencies
- ZMI-TICKET-236 (Daily Values Router — DailyValues müssen existieren)
- ZMI-TICKET-237 (Prisma Schema: monthly_values)
- ZMI-TICKET-235 (Calculate-Day — DailyValues müssen berechnet sein)

## Go-Dateien die ersetzt werden
- `apps/api/internal/service/monthlycalc.go` (203 Zeilen)
- `apps/api/internal/service/monthlyeval.go` (502 Zeilen)
- `apps/api/internal/repository/monthlyvalue.go` (242 Zeilen)
