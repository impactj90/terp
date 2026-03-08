# ZMI-TICKET-247: Schedules Router (CRUD + Execution Management)

Status: Completed
Priority: P2
Owner: TBD

## Goal
tRPC-Router für Schedule-Verwaltung: CRUD für Schedules und Tasks, manuelle Ausführung, Ausführungs-History und Task-Katalog.

## Scope
- **In scope:**
  - tRPC `schedules` Router (CRUD + Tasks + Execute + Executions)
  - Task-Katalog (verfügbare Task-Typen)
  - Frontend-Hooks Migration
- **Out of scope:**
  - Cron-Ausführung (TICKET-245, 246)

## Requirements

### tRPC Router: `schedules`
- **Procedures:**
  - `schedules.list` (query)
    - Output: `Schedule[]` (mit Tasks)
    - Middleware: `tenantProcedure` + `requirePermission("schedules.read")`
  - `schedules.getById` (query)
    - Input: `{ id }`
    - Output: `Schedule` (mit Tasks)
  - `schedules.create` (mutation)
    - Input: `{ name, description?, cron_expr?, is_active? }`
    - Middleware: `requirePermission("schedules.write")`
  - `schedules.update/delete`
  - `schedules.tasks` (query) — Tasks eines Schedules
    - Input: `{ scheduleId }`
  - `schedules.createTask` (mutation)
    - Input: `{ scheduleId, task_type, config?, sort_order? }`
  - `schedules.updateTask` (mutation)
  - `schedules.deleteTask` (mutation)
  - `schedules.execute` (mutation) — Manuelle Ausführung
    - Input: `{ scheduleId }`
    - Output: `ScheduleExecution`
    - Middleware: `requirePermission("schedules.execute")`
  - `schedules.executions` (query)
    - Input: `{ scheduleId, page?, pageSize? }`
    - Output: `{ items: ScheduleExecution[], total: number }`
  - `schedules.execution` (query) — Einzelne Ausführung
    - Input: `{ executionId }`
    - Output: `ScheduleExecution` (mit TaskExecutions)
  - `schedules.taskCatalog` (query) — Verfügbare Task-Typen
    - Output: `CatalogEntry[]`

### Frontend Hook Migration
- `apps/web/src/hooks/api/use-schedules.ts` → `trpc.schedules.*`

### Business Logic (aus Go portiert)
- `apps/api/internal/service/schedule.go` (533 Zeilen)
- `apps/api/internal/service/scheduler_catalog.go` (143 Zeilen)

## Acceptance Criteria
- [ ] Schedule CRUD mit Task-Management
- [ ] Manuelle Ausführung mit Execution-Protokoll
- [ ] Ausführungs-History abrufbar
- [ ] Task-Katalog listet verfügbare Typen
- [ ] Frontend-Hooks nutzen tRPC statt fetch
- [ ] Bestehende Tests portiert

## Tests
- Unit-Test: Schedule mit Tasks erstellen
- Unit-Test: Manuelle Ausführung erstellt Execution
- Unit-Test: Task-Katalog
- Integration-Test: Schedule → Execute → Execution History

## Dependencies
- ZMI-TICKET-244 (Prisma Schema: schedules, executions)
- ZMI-TICKET-245 (Vercel Cron: calculate_days — Cron-Job existiert)
- ZMI-TICKET-246 (Vercel Cron: weitere Tasks)
- ZMI-TICKET-203 (Authorization Middleware)

## Go-Dateien die ersetzt werden
- `apps/api/internal/service/schedule.go` (533 Zeilen)
- `apps/api/internal/handler/schedule.go` (630 Zeilen)
- `apps/api/internal/repository/schedule.go` (284 Zeilen)
- `apps/api/internal/service/scheduler_catalog.go` (143 Zeilen)
- `apps/web/src/hooks/api/use-schedules.ts` (Frontend-Hook)
