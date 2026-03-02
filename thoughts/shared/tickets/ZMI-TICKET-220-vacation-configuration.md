# ZMI-TICKET-220: Vacation Configuration

Status: Proposed
Priority: P2
Owner: TBD

## Goal
tRPC-Router für die vollständige Urlaubskonfiguration: VacationSpecialCalc, VacationCalcGroup, VacationCappingRule, VacationCappingRuleGroup und EmployeeCappingException. Diese Konfiguration steuert die Urlaubsanspruchs-Berechnung.

## Scope
- **In scope:**
  - tRPC `vacationSpecialCalcs` Router (CRUD)
  - tRPC `vacationCalcGroups` Router (CRUD)
  - tRPC `vacationCappingRules` Router (CRUD)
  - tRPC `vacationCappingRuleGroups` Router (CRUD)
  - tRPC `employeeCappingExceptions` Router (CRUD)
  - Vacation Entitlement Preview + Carryover Preview Endpoints
  - Frontend-Hooks Migration
- **Out of scope:**
  - Vacation Balance Berechnung (TICKET-241)
  - Vacation Balance Router (TICKET-242)

## Requirements

### tRPC Router: `vacationSpecialCalcs`
- **Procedures:**
  - `vacationSpecialCalcs.list/getById/create/update/delete`
  - Middleware: `tenantProcedure` + `requirePermission("vacation_config.*")`

### tRPC Router: `vacationCalcGroups`
- **Procedures:**
  - `vacationCalcGroups.list` (query)
    - Output: `VacationCalcGroup[]` (mit SpecialCalcs)
  - `vacationCalcGroups.getById/create/update/delete`
  - Middleware: `tenantProcedure` + `requirePermission("vacation_config.*")`

### tRPC Router: `vacationCappingRules`
- **Procedures:**
  - `vacationCappingRules.list/getById/create/update/delete`
  - Middleware: `tenantProcedure` + `requirePermission("vacation_config.*")`

### tRPC Router: `vacationCappingRuleGroups`
- **Procedures:**
  - `vacationCappingRuleGroups.list` (query)
    - Output: `VacationCappingRuleGroup[]` (mit Rules)
  - `vacationCappingRuleGroups.getById/create/update/delete`

### tRPC Router: `employeeCappingExceptions`
- **Procedures:**
  - `employeeCappingExceptions.list` (query)
    - Input: `{ employee_id? }`
  - `employeeCappingExceptions.getById/create/update/delete`

### tRPC Procedures (in `vacation` Router)
- `vacation.entitlementPreview` (mutation)
  - Input: `{ employee_id, year }`
  - Output: Preview der Urlaubsanspruch-Berechnung
- `vacation.carryoverPreview` (mutation)
  - Input: `{ employee_id, year }`
  - Output: Preview des Resturlaub-Übertrags

### Frontend Hook Migration
- `apps/web/src/hooks/api/use-vacation-config.ts` → alle 5 Sub-Router + Preview-Endpoints
  - 27 Hooks insgesamt werden migriert

### Business Logic (aus Go portiert)
- `apps/api/internal/service/vacationspecialcalc.go` (199 Zeilen)
- `apps/api/internal/service/vacationcalcgroup.go` (228 Zeilen)
- `apps/api/internal/service/vacationcappingrule.go` (238 Zeilen)
- `apps/api/internal/service/vacationcappingrulegroup.go` (205 Zeilen)
- `apps/api/internal/service/employeecappingexception.go` (200 Zeilen)
- `apps/api/internal/service/vacationcarryover.go` (193 Zeilen) — Carryover Preview

## Acceptance Criteria
- [ ] Alle 5 Vacation-Config-Entitäten haben CRUD
- [ ] CalcGroup verknüpft SpecialCalcs korrekt
- [ ] CappingRuleGroup verknüpft CappingRules korrekt
- [ ] EmployeeCappingExceptions filtern nach Employee
- [ ] Entitlement Preview und Carryover Preview funktionieren
- [ ] Alle 27 Frontend-Hooks nutzen tRPC statt fetch
- [ ] Bestehende Tests portiert

## Tests
- Unit-Test: VacationCalcGroup mit SpecialCalcs
- Unit-Test: CappingRuleGroup mit Rules
- Unit-Test: Entitlement Preview Berechnung
- Unit-Test: Carryover Preview Berechnung
- Integration-Test: CRUD-Flow für alle Entitäten

## Dependencies
- ZMI-TICKET-216 (Booking Types, Groups — für CalculationRule Referenz)
- ZMI-TICKET-210 (Tenants — tenantProcedure)
- ZMI-TICKET-214 (Employees — für EmployeeCappingException)

## Go-Dateien die ersetzt werden
- `apps/api/internal/service/vacationspecialcalc.go` (199 Zeilen)
- `apps/api/internal/handler/vacationspecialcalc.go` (260 Zeilen)
- `apps/api/internal/repository/vacationspecialcalc.go` (149 Zeilen)
- `apps/api/internal/service/vacationcalcgroup.go` (228 Zeilen)
- `apps/api/internal/handler/vacationcalcgroup.go` (295 Zeilen)
- `apps/api/internal/repository/vacationcalcgroup.go` (149 Zeilen)
- `apps/api/internal/service/vacationcappingrule.go` (238 Zeilen)
- `apps/api/internal/handler/vacationcappingrule.go` (283 Zeilen)
- `apps/api/internal/repository/vacationcappingrule.go` (149 Zeilen)
- `apps/api/internal/service/vacationcappingrulegroup.go` (205 Zeilen)
- `apps/api/internal/handler/vacationcappingrulegroup.go` (285 Zeilen)
- `apps/api/internal/repository/vacationcappingrulegroup.go` (149 Zeilen)
- `apps/api/internal/service/employeecappingexception.go` (200 Zeilen)
- `apps/api/internal/handler/employeecappingexception.go` (312 Zeilen)
- `apps/api/internal/repository/employeecappingexception.go` (132 Zeilen)
- `apps/api/internal/service/vacationcarryover.go` (193 Zeilen)
- `apps/api/internal/handler/vacationcarryover.go` (96 Zeilen)
- `apps/web/src/hooks/api/use-vacation-config.ts` (Frontend-Hook — 27 Hooks)
