# ZMI-TICKET-217: Day Plans + Week Plans

Status: Proposed
Priority: P2
Owner: TBD

## Goal
tRPC-Router für Day Plans (Tagespläne mit Pausen und Zuschlägen) und Week Plans (Wochenpläne) implementieren. Day Plans sind Vorlagen für die Arbeitszeit-Konfiguration und werden von Tarifen referenziert.

## Scope
- **In scope:**
  - tRPC `dayPlans` Router (CRUD + Breaks + Bonuses + Copy)
  - tRPC `weekPlans` Router (CRUD)
  - Frontend-Hooks Migration
- **Out of scope:**
  - Employee Day Plans (TICKET-228, 229)
  - Tariff-Zuordnung von DayPlans (TICKET-219)

## Requirements

### tRPC Router: `dayPlans`
- **Procedures:**
  - `dayPlans.list` (query)
    - Input: `{ is_active? }`
    - Output: `DayPlan[]`
    - Middleware: `tenantProcedure` + `requirePermission("day_plans.read")`
  - `dayPlans.getById` (query)
    - Input: `{ id }`
    - Output: `DayPlan` (mit Breaks + Bonuses)
  - `dayPlans.create` (mutation)
    - Input: `{ name, start_time, end_time, planned_hours, is_work_day, ... }`
    - Output: `DayPlan`
    - Middleware: `requirePermission("day_plans.write")`
  - `dayPlans.update` (mutation)
  - `dayPlans.delete` (mutation)
  - `dayPlans.copy` (mutation) — Kopiert DayPlan mit Breaks und Bonuses
    - Input: `{ id, name }`
    - Output: `DayPlan`
  - `dayPlans.createBreak` (mutation)
    - Input: `{ dayPlanId, start_time, end_time, is_paid, duration_minutes }`
    - Output: `DayPlanBreak`
  - `dayPlans.deleteBreak` (mutation)
    - Input: `{ dayPlanId, breakId }`
  - `dayPlans.createBonus` (mutation) — Zuschlag/Bonus hinzufügen
    - Input: `{ dayPlanId, name, type, value, start_time?, end_time?, account_id? }`
    - Output: `DayPlanBonus`
  - `dayPlans.deleteBonus` (mutation)
    - Input: `{ dayPlanId, bonusId }`

### tRPC Router: `weekPlans`
- **Procedures:**
  - `weekPlans.list` (query)
    - Output: `WeekPlan[]`
  - `weekPlans.getById` (query)
    - Output: `WeekPlan` (mit Tages-Zuordnungen)
  - `weekPlans.create` (mutation)
    - Input: `{ name, monday_day_plan_id?, tuesday_day_plan_id?, ... }`
  - `weekPlans.update` (mutation)
  - `weekPlans.delete` (mutation)
  - Middleware: `tenantProcedure` + `requirePermission("week_plans.*")`

### Frontend Hook Migration
- `apps/web/src/hooks/api/use-day-plans.ts` → `trpc.dayPlans.*`
- `apps/web/src/hooks/api/use-week-plans.ts` → `trpc.weekPlans.*`

### Business Logic (aus Go portiert)
- `apps/api/internal/service/dayplan.go` (684 Zeilen) — CRUD + Breaks + Bonuses + Copy
- `apps/api/internal/service/weekplan.go` (257 Zeilen)

## Acceptance Criteria
- [ ] DayPlan mit Breaks und Bonuses erstellen/bearbeiten
- [ ] DayPlan Copy kopiert inkl. Breaks und Bonuses
- [ ] WeekPlan verknüpft 7 DayPlans (Mo-So)
- [ ] Frontend-Hooks nutzen tRPC statt fetch
- [ ] Bestehende Tests portiert

## Tests
- Unit-Test: DayPlan Copy inkl. Breaks/Bonuses
- Unit-Test: WeekPlan mit DayPlan-Zuordnungen
- Integration-Test: CRUD-Flow mit Sub-Entitäten

## Dependencies
- ZMI-TICKET-203 (Authorization Middleware)
- ZMI-TICKET-204 (Prisma Schema: Org-Tabellen)
- ZMI-TICKET-210 (Tenants — tenantProcedure)

## Go-Dateien die ersetzt werden
- `apps/api/internal/service/dayplan.go` (684 Zeilen)
- `apps/api/internal/handler/dayplan.go` (558 Zeilen)
- `apps/api/internal/repository/dayplan.go` (226 Zeilen)
- `apps/api/internal/service/weekplan.go` (257 Zeilen)
- `apps/api/internal/handler/weekplan.go` (243 Zeilen)
- `apps/api/internal/repository/weekplan.go` (152 Zeilen)
- `apps/web/src/hooks/api/use-day-plans.ts` (Frontend-Hook)
- `apps/web/src/hooks/api/use-week-plans.ts` (Frontend-Hook)
