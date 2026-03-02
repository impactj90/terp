# ZMI-TICKET-242: Vacation Balance Router + Previews

Status: Proposed
Priority: P2
Owner: TBD

## Goal
tRPC-Router für Vacation Balances: Liste, Einzelansicht, Employee Balance, Initialisierung und Previews. Die Urlaubssalden-Verwaltung bietet Übersicht über Ansprüche, Verbrauch und Restanspruch pro Mitarbeiter.

## Scope
- **In scope:**
  - tRPC `vacationBalances` Router (CRUD + Initialize + Employee Balance)
  - Preview-Endpoints für Anspruch und Carryover
  - Frontend-Hooks Migration
- **Out of scope:**
  - Vacation-Berechnung (TICKET-241)
  - Vacation-Konfiguration (TICKET-220)

## Requirements

### tRPC Router: `vacationBalances`
- **Procedures:**
  - `vacationBalances.list` (query) — Paginiert, alle Mitarbeiter
    - Input: `{ page?, pageSize?, year, department_id? }`
    - Output: `{ items: VacationBalance[], total: number }`
    - Middleware: `tenantProcedure` + `requirePermission("vacation.read")` + `applyDataScope()`
  - `vacationBalances.getById` (query)
    - Input: `{ id }`
    - Output: `VacationBalance`
  - `vacationBalances.forEmployee` (query) — Balance eines Mitarbeiters
    - Input: `{ employeeId, year? }`
    - Output: `VacationBalance`
    - Middleware: `requireEmployeePermission("vacation.read_own", "vacation.read")`
  - `vacationBalances.create` (mutation) — Manuell erstellen
    - Input: `{ employee_id, year, entitlement, carried_over?, notes? }`
    - Middleware: `requirePermission("vacation.write")`
  - `vacationBalances.update` (mutation)
    - Input: `{ id, entitlement?, carried_over?, notes? }`
  - `vacationBalances.initialize` (mutation) — Für alle Mitarbeiter eines Jahres initialisieren
    - Input: `{ year }`
    - Output: `{ initialized: number }`
    - Logik: Für jeden aktiven Mitarbeiter VacationBalance erstellen (falls nicht vorhanden)
    - Middleware: `requirePermission("vacation.write")`

### Frontend Hook Migration
- `apps/web/src/hooks/api/use-vacation-balance.ts` → `trpc.vacationBalances.*`

### Business Logic (aus Go portiert)
- `apps/api/internal/service/vacationbalance.go` (127 Zeilen)
- `apps/api/internal/handler/vacation_balance.go` (314 Zeilen)

## Acceptance Criteria
- [ ] Vacation Balance pro Mitarbeiter/Jahr abrufbar
- [ ] Initialize erstellt Balances für alle aktiven Mitarbeiter
- [ ] Data-Scope-Filterung auf der Liste
- [ ] Manuelle Balance-Erstellung und -Update
- [ ] Frontend-Hooks nutzen tRPC statt fetch
- [ ] Bestehende Tests portiert

## Tests
- Unit-Test: Balance für Employee laden
- Unit-Test: Initialize für alle Mitarbeiter
- Unit-Test: Data-Scope-Filterung
- Integration-Test: Initialize → Balance prüfen → Update

## Dependencies
- ZMI-TICKET-241 (VacationService Port — Berechnung)
- ZMI-TICKET-237 (Prisma Schema: vacation_balances)
- ZMI-TICKET-203 (Authorization Middleware — Data Scope)

## Go-Dateien die ersetzt werden
- `apps/api/internal/service/vacationbalance.go` (127 Zeilen)
- `apps/api/internal/handler/vacation_balance.go` (314 Zeilen)
- `apps/api/internal/repository/vacationbalance.go` (150 Zeilen)
- `apps/web/src/hooks/api/use-vacation-balance.ts` (Frontend-Hook)
