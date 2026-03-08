# ZMI-TICKET-236: Daily Values Router (List, Approve, Recalculate)

Status: Completed
Priority: P1
Owner: TBD

## Goal
tRPC-Router für Daily Values (Tageswerte) mit Liste, Genehmigung und Neuberechnung. Daily Values sind die berechneten Tagesergebnisse für Arbeitszeit, Überstunden, Pausen etc.

## Scope
- **In scope:**
  - tRPC `dailyValues` Router (List + Approve)
  - tRPC `dailyAccountValues` Router (List by DailyValue)
  - Admin-Ansicht: Alle Tageswerte mit Filtern
  - Genehmigungs-Workflow (Approve)
  - Frontend-Hooks Migration
- **Out of scope:**
  - Tagesberechnung (TICKET-234, 235)
  - Monthly Aggregation (TICKET-238)

## Requirements

### tRPC Router: `dailyValues`
- **Procedures:**
  - `dailyValues.list` (query) — Tageswerte eines Mitarbeiters für einen Monat
    - Input: `{ employeeId, year, month }`
    - Output: `DailyValue[]` (mit AccountValues)
    - Middleware: `tenantProcedure` + `requireEmployeePermission("daily_values.read_own", "daily_values.read")`
  - `dailyValues.listAll` (query) — Admin-Ansicht, paginiert
    - Input: `{ page?, pageSize?, employee_id?, from_date?, to_date?, status?, department_id? }`
    - Output: `{ items: DailyValue[], total: number }`
    - Middleware: `tenantProcedure` + `requirePermission("daily_values.read")` + `applyDataScope()`
  - `dailyValues.approve` (mutation) — Tag genehmigen
    - Input: `{ id }`
    - Output: `DailyValue`
    - Middleware: `requirePermission("daily_values.approve")`
    - Logik: Status → "approved", approved_at + approved_by setzen

### tRPC Router: `dailyAccountValues`
- **Procedures:**
  - `dailyAccountValues.list` (query)
    - Input: `{ dailyValueId }`
    - Output: `DailyAccountValue[]` (mit Account-Details)

### Frontend Hook Migration
- `apps/web/src/hooks/api/use-daily-values.ts` → `trpc.dailyValues.*`
- `apps/web/src/hooks/api/use-team-daily-values.ts` → Parallel tRPC Queries

### Business Logic (aus Go portiert)
- `apps/api/internal/service/dailyvalue.go` (101 Zeilen) — Get/List
- `apps/api/internal/service/daily_account_value.go` (44 Zeilen)

## Acceptance Criteria
- [ ] Tageswerte pro Mitarbeiter/Monat abrufbar
- [ ] Admin-Liste mit Filtern und Data-Scope
- [ ] Genehmigungs-Workflow funktioniert (Status-Transition)
- [ ] AccountValues pro Tag abrufbar
- [ ] Frontend-Hooks nutzen tRPC statt fetch
- [ ] Bestehende Tests portiert

## Tests
- Unit-Test: Daily Values für einen Monat laden
- Unit-Test: Approve setzt Status und Timestamp
- Unit-Test: Data-Scope-Filterung
- Integration-Test: DailyValue List + Approve Flow

## Dependencies
- ZMI-TICKET-231 (Prisma Schema: daily_values, daily_account_values)
- ZMI-TICKET-235 (Calculate-Day — DailyValues müssen existieren)
- ZMI-TICKET-203 (Authorization Middleware — Data Scope)

## Go-Dateien die ersetzt werden
- `apps/api/internal/service/dailyvalue.go` (101 Zeilen)
- `apps/api/internal/handler/dailyvalue.go` (383 Zeilen)
- `apps/api/internal/repository/dailyvalue.go` (299 Zeilen)
- `apps/api/internal/service/daily_account_value.go` (44 Zeilen)
- `apps/api/internal/handler/daily_account_value.go` (88 Zeilen)
- `apps/api/internal/repository/daily_account_value.go` (149 Zeilen)
- `apps/web/src/hooks/api/use-daily-values.ts` (Frontend-Hook)
- `apps/web/src/hooks/api/use-team-daily-values.ts` (Frontend-Hook)
