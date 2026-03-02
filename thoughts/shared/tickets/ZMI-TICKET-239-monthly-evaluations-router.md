# ZMI-TICKET-239: Monthly Evaluations Router

Status: Proposed
Priority: P2
Owner: TBD

## Goal
tRPC-Router für Monatsauswertungen: Monthly Values (List, Close, Reopen, Recalculate) und Admin-Ansicht mit Batch-Operationen.

## Scope
- **In scope:**
  - tRPC `monthlyValues` Router (List + Close + Reopen + Recalculate + Batch)
  - Employee Monthly Summary
  - Year Overview
  - Admin-Ansicht mit Filtern
  - Frontend-Hooks Migration
- **Out of scope:**
  - Monatliche Berechnung (TICKET-238)
  - Monthly Eval Templates (TICKET-227)

## Requirements

### tRPC Router: `monthlyValues`
- **Procedures:**
  - `monthlyValues.forEmployee` (query) — Monatswert eines Mitarbeiters
    - Input: `{ employeeId, year, month }`
    - Output: `MonthlyValue` (mit Account Values)
    - Middleware: `requireEmployeePermission("monthly_values.read_own", "monthly_values.read")`
  - `monthlyValues.yearOverview` (query) — Jahresübersicht
    - Input: `{ employeeId, year }`
    - Output: `MonthlyValue[]` (12 Einträge)
  - `monthlyValues.list` (query) — Admin-Ansicht, paginiert
    - Input: `{ page?, pageSize?, year, month, status?, department_id? }`
    - Output: `{ items: MonthlyValue[], total: number }`
    - Middleware: `tenantProcedure` + `requirePermission("monthly_values.read")` + `applyDataScope()`
  - `monthlyValues.getById` (query)
    - Input: `{ id }`
    - Output: `MonthlyValue`
  - `monthlyValues.close` (mutation) — Monat abschließen
    - Input: `{ id }`
    - Logik: Status → "closed", closed_at + closed_by setzen
    - Middleware: `requirePermission("monthly_values.close")`
  - `monthlyValues.reopen` (mutation) — Monat wieder öffnen
    - Input: `{ id }`
    - Logik: Status → "open"
    - Middleware: `requirePermission("monthly_values.close")`
  - `monthlyValues.closeBatch` (mutation) — Mehrere Monate abschließen
    - Input: `{ ids: string[] }`
    - Output: `{ closed: number }`
  - `monthlyValues.recalculate` (mutation) — Neuberechnung anstoßen (async)
    - Input: `{ employee_id, year, month }`
    - Output: `{ status: "accepted" }` (HTTP 202 Pattern)
    - Middleware: `requirePermission("monthly_values.write")`

### Frontend Hook Migration
- `apps/web/src/hooks/api/use-monthly-values.ts` → `trpc.monthlyValues.forEmployee`, `yearOverview`, `close`, `reopen`, `recalculate`
- `apps/web/src/hooks/api/use-admin-monthly-values.ts` → `trpc.monthlyValues.list`, `getById`, `close`, `closeBatch`, `recalculate`

### Business Logic (aus Go portiert)
- `apps/api/internal/service/monthlyeval.go` (502 Zeilen, Router-Teile)
- `apps/api/internal/service/monthlyvalue.go` (94 Zeilen)

## Acceptance Criteria
- [ ] Monthly Values pro Mitarbeiter/Monat abrufbar
- [ ] Year Overview für alle 12 Monate
- [ ] Admin-Liste mit Filtern und Data-Scope
- [ ] Close/Reopen Workflow funktioniert
- [ ] Batch Close für mehrere Mitarbeiter
- [ ] Async Recalculate mit Status
- [ ] Frontend-Hooks nutzen tRPC statt fetch
- [ ] Bestehende Tests portiert

## Tests
- Unit-Test: Monthly Value Close/Reopen Status-Transitions
- Unit-Test: Year Overview lädt alle 12 Monate
- Unit-Test: Batch Close
- Integration-Test: Kompletter Close/Reopen Flow
- E2E-Test: Monthly Values Admin-Ansicht

## Dependencies
- ZMI-TICKET-238 (MonthlyCalcService — MonthlyValues müssen berechnet sein)
- ZMI-TICKET-236 (Daily Values — für Recalculation-Trigger)
- ZMI-TICKET-203 (Authorization Middleware — Data Scope)

## Go-Dateien die ersetzt werden
- `apps/api/internal/service/monthlyvalue.go` (94 Zeilen)
- `apps/api/internal/handler/monthly_value.go` (405 Zeilen)
- `apps/api/internal/handler/monthlyeval.go` (461 Zeilen)
- `apps/api/internal/repository/monthlyvalue.go` (242 Zeilen)
- `apps/web/src/hooks/api/use-monthly-values.ts` (Frontend-Hook)
- `apps/web/src/hooks/api/use-admin-monthly-values.ts` (Frontend-Hook)
