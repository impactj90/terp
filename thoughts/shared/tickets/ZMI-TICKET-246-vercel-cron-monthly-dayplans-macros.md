# ZMI-TICKET-246: Vercel Cron: calculate_months, generate_day_plans, execute_macros

Status: Completed
Priority: P2
Owner: TBD

## Goal
Drei weitere Go-Scheduler-Tasks als Vercel Cron Jobs implementieren: Monatsberechnung, automatische Tagesplan-Generierung und Macro-Ausführung.

## Scope
- **In scope:**
  - Vercel Cron: `api/cron/calculate-months` — Monatlich am 1.
  - Vercel Cron: `api/cron/generate-day-plans` — Wöchentlich/Monatlich
  - Vercel Cron: `api/cron/execute-macros` — Gemäß Macro-Schedule
  - Execution-Logging für alle 3 Tasks
- **Out of scope:**
  - calculate_days (TICKET-245)
  - Scheduler-UI (TICKET-247)

## Requirements

### Cron Route: `calculate-months`
```typescript
// app/api/cron/calculate-months/route.ts
// Schedule: Am 2. jedes Monats um 03:00 UTC
// Logik: MonthlyCalcService.calculateMonth() für den Vormonat
//        für alle aktiven Mitarbeiter aller Tenants
```

### Cron Route: `generate-day-plans`
```typescript
// app/api/cron/generate-day-plans/route.ts
// Schedule: Sonntags um 01:00 UTC
// Logik: Für alle Mitarbeiter mit aktivem Tarif:
//        EmployeeDayPlanService.generateFromTariff() für die nächste Woche
```

### Cron Route: `execute-macros`
```typescript
// app/api/cron/execute-macros/route.ts
// Schedule: Alle 15 Minuten
// Logik: Alle aktiven Macros prüfen, ob Ausführung fällig
//        MacroService.execute() für fällige Macros
```

### vercel.json (Erweiterung)
```json
{
  "crons": [
    { "path": "/api/cron/calculate-days", "schedule": "0 2 * * *" },
    { "path": "/api/cron/calculate-months", "schedule": "0 3 2 * *" },
    { "path": "/api/cron/generate-day-plans", "schedule": "0 1 * * 0" },
    { "path": "/api/cron/execute-macros", "schedule": "*/15 * * * *" }
  ]
}
```

### Business Logic (aus Go portiert)
- `apps/api/internal/service/scheduler_tasks.go` (355 Zeilen):
  - `calculate_months` Task
  - `generate_day_plans` Task
  - `execute_macros` Task
- `apps/api/internal/service/macro_task.go` (64 Zeilen)
- `apps/api/internal/service/scheduler_catalog.go` (143 Zeilen)

## Acceptance Criteria
- [ ] Monatliche Berechnung läuft für alle Mitarbeiter
- [ ] Tagesplan-Generierung erstellt Pläne für die nächste Woche
- [ ] Macro-Ausführung prüft und führt fällige Macros aus
- [ ] Execution-Logging für alle 3 Tasks
- [ ] Fehler bei einzelnen Operationen blockieren nicht den Rest
- [ ] Cron-Secret-Validierung

## Tests
- Unit-Test: calculate-months iteriert korrekt
- Unit-Test: generate-day-plans erstellt korrekte Pläne
- Unit-Test: execute-macros prüft Fälligkeit
- Integration-Test: Alle 3 Cron-Endpoints

## Dependencies
- ZMI-TICKET-238 (MonthlyCalcService — für calculate-months)
- ZMI-TICKET-229 (Employee Day Plans — für generate-day-plans)
- ZMI-TICKET-222 (Macros — für execute-macros)
- ZMI-TICKET-245 (Vercel Cron: calculate_days — Cron-Setup)
- ZMI-TICKET-244 (Prisma Schema: schedules — für Execution-Logging)

## Go-Dateien die ersetzt werden
- `apps/api/internal/service/scheduler_tasks.go` (355 Zeilen — restliche Tasks)
- `apps/api/internal/service/macro_task.go` (64 Zeilen)
- `apps/api/internal/service/scheduler_catalog.go` (143 Zeilen)
