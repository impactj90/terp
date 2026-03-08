# ZMI-TICKET-245: Vercel Cron: calculate_days Task

Status: Completed
Priority: P2
Owner: TBD

## Goal
Den Go-Scheduler-Task `calculate_days` als Vercel Cron Job implementieren. Dieser läuft täglich und berechnet die Tageswerte für den aktuellen Tag für alle aktiven Mitarbeiter aller Tenants.

## Scope
- **In scope:**
  - Vercel Cron Job: `api/cron/calculate-days`
  - Cron-Schedule: Täglich um 02:00 UTC
  - Iteriert über alle aktiven Tenants → alle aktiven Mitarbeiter
  - Ruft DailyCalcService.calculateDay() pro Mitarbeiter auf
  - Execution-Logging in ScheduleExecution Tabelle
- **Out of scope:**
  - Andere Cron-Tasks (TICKET-246)
  - Scheduler-UI (TICKET-247)

## Requirements

### Vercel Cron Route
```typescript
// app/api/cron/calculate-days/route.ts
export const runtime = 'nodejs'
export const maxDuration = 300 // 5 Minuten

export async function GET(request: Request) {
  // 1. Cron-Secret validieren
  // 2. Alle aktiven Tenants laden
  // 3. Pro Tenant: alle aktiven Mitarbeiter
  // 4. Pro Mitarbeiter: DailyCalcService.calculateDay(today)
  // 5. Execution-Log speichern
  // 6. Ergebnis zurückgeben
}
```

### vercel.json
```json
{
  "crons": [
    {
      "path": "/api/cron/calculate-days",
      "schedule": "0 2 * * *"
    }
  ]
}
```

### Execution-Logging
- ScheduleExecution erstellen mit Status "running"
- Pro Mitarbeiter: Ergebnis in result JSON
- Fehler werden geloggt, aber andere Mitarbeiter nicht blockiert
- Status am Ende: "completed" oder "failed"

### Business Logic (aus Go portiert)
- `apps/api/internal/service/scheduler_tasks.go` (355 Zeilen, calculate_days Task)
- `apps/api/internal/service/scheduler_executor.go` (209 Zeilen, Task-Ausführung)

## Acceptance Criteria
- [ ] Cron Job läuft täglich um 02:00 UTC
- [ ] Alle aktiven Mitarbeiter aller Tenants werden berechnet
- [ ] Fehler bei einzelnen Mitarbeitern blockieren nicht den Rest
- [ ] Execution-Log wird in DB gespeichert
- [ ] Maximal 5 Minuten Laufzeit
- [ ] Cron-Secret-Validierung verhindert unautorisierten Zugriff

## Tests
- Unit-Test: Task iteriert über alle Tenants/Mitarbeiter
- Unit-Test: Fehler-Handling bei einzelnen Berechnungen
- Integration-Test: Cron-Endpoint mit Test-Daten
- Unit-Test: Execution-Logging

## Dependencies
- ZMI-TICKET-234 (DailyCalcService Port)
- ZMI-TICKET-243 (RecalcService Port — für Cascade)
- ZMI-TICKET-244 (Prisma Schema: schedules — für Execution-Logging)

## Go-Dateien die ersetzt werden
- Teile von `apps/api/internal/service/scheduler_tasks.go` (calculate_days Task)
- `apps/api/internal/service/scheduler_executor.go` (209 Zeilen)
- `apps/api/internal/service/scheduler_engine.go` (100 Zeilen — Cron-Engine)
