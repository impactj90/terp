# ZMI-TICKET-229: Employee Day Plans Router (Bulk, Generate from Tariff)

Status: Proposed
Priority: P2
Owner: TBD

## Goal
tRPC-Router für Employee Day Plans mit Bulk-Operationen und Tarif-basierter Generierung. Employee Day Plans definieren die täglichen Soll-Arbeitszeiten pro Mitarbeiter und können manuell, in Bulk oder automatisch aus dem Tarif generiert werden.

## Scope
- **In scope:**
  - tRPC `employeeDayPlans` Router (CRUD + Bulk + Generate + Delete Range)
  - Generierung aus Tarif (Tariff → WeekPlan → DayPlan Zuordnung)
  - Frontend-Hooks Migration
- **Out of scope:**
  - Tagesberechnung basierend auf EmployeeDayPlan (TICKET-234)
  - Scheduler-basierte Auto-Generierung (TICKET-246)

## Requirements

### tRPC Router: `employeeDayPlans`
- **Procedures:**
  - `employeeDayPlans.list` (query) — Paginated
    - Input: `{ page?, pageSize?, employee_id?, from_date?, to_date? }`
    - Output: `{ items: EmployeeDayPlan[], total: number }`
    - Middleware: `tenantProcedure` + `requirePermission("employee_day_plans.read")`
  - `employeeDayPlans.forEmployee` (query) — Pläne eines Mitarbeiters
    - Input: `{ employeeId, from_date, to_date }`
    - Output: `EmployeeDayPlan[]` (mit DayPlan/Shift Details)
  - `employeeDayPlans.create` (mutation)
    - Input: `{ employee_id, date, day_plan_id?, shift_id?, is_work_day?, start_time?, end_time?, planned_hours?, notes? }`
    - Output: `EmployeeDayPlan`
    - Middleware: `requirePermission("employee_day_plans.write")`
  - `employeeDayPlans.update` (mutation)
  - `employeeDayPlans.delete` (mutation)
  - `employeeDayPlans.bulkCreate` (mutation) — Mehrere Pläne gleichzeitig erstellen
    - Input: `{ plans: CreateEmployeeDayPlanInput[] }`
    - Output: `{ created: number }`
    - Middleware: `requirePermission("employee_day_plans.write")`
  - `employeeDayPlans.deleteRange` (mutation) — Pläne in Datumsbereich löschen
    - Input: `{ employee_id, from_date, to_date }`
    - Output: `{ deleted: number }`
  - `employeeDayPlans.generateFromTariff` (mutation) — Aus Tarif generieren
    - Input: `{ employee_id, from_date, to_date }`
    - Output: `{ generated: number }`
    - Logik: Lade aktiven Tarif → WeekPlan → DayPlan-Zuordnungen → Erstelle EmployeeDayPlans
    - Middleware: `requirePermission("employee_day_plans.write")`

### Frontend Hook Migration
- `apps/web/src/hooks/api/use-employee-day-plans.ts` → `trpc.employeeDayPlans.*`

### Business Logic (aus Go portiert)
- `apps/api/internal/service/employeedayplan.go` (568 Zeilen) — CRUD + Bulk + Generate + Delete Range
- Generierungs-Logik: Tariff → TariffWeekPlan → WeekPlan → DayOfWeek-Zuordnung

## Acceptance Criteria
- [ ] Einzelne EmployeeDayPlan CRUD funktioniert
- [ ] Bulk-Create erstellt mehrere Pläne in einer Transaktion
- [ ] Delete Range löscht Pläne im angegebenen Zeitraum
- [ ] Generate from Tariff erzeugt korrekte DayPlans basierend auf WeekPlan-Rhythmus
- [ ] Unique-Constraint auf [employee_id, date] wird bei Konflikten korrekt behandelt
- [ ] Frontend-Hooks nutzen tRPC statt fetch
- [ ] Bestehende Tests portiert

## Tests
- Unit-Test: Generate from Tariff mit verschiedenen WeekPlan-Konfigurationen
- Unit-Test: Bulk-Create mit Konflikt-Handling
- Unit-Test: Delete Range
- Integration-Test: Kompletter Flow (Generate → Modify → Delete Range)
- E2E-Test: Frontend Employee Day Plan Ansicht

## Dependencies
- ZMI-TICKET-228 (Prisma Schema: employee_day_plans)
- ZMI-TICKET-219 (Tariff Configuration — für Generate from Tariff)
- ZMI-TICKET-214 (Employees — Employee-Referenz)
- ZMI-TICKET-203 (Authorization Middleware)

## Go-Dateien die ersetzt werden
- `apps/api/internal/service/employeedayplan.go` (568 Zeilen)
- `apps/api/internal/handler/employeedayplan.go` (398 Zeilen)
- `apps/api/internal/repository/employeedayplan.go` (192 Zeilen)
- `apps/web/src/hooks/api/use-employee-day-plans.ts` (Frontend-Hook)
