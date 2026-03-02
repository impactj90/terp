# ZMI-TICKET-226: Travel Allowance Rules

Status: Proposed
Priority: P2
Owner: TBD

## Goal
tRPC-Router für Reisekostenregeln: TravelAllowanceRuleSet, ExtendedTravelRule, LocalTravelRule und Preview-Service. Diese konfigurieren die automatische Berechnung von Reisekosten-Pauschalen.

## Scope
- **In scope:**
  - tRPC `travelAllowanceRuleSets` Router (CRUD)
  - tRPC `extendedTravelRules` Router (CRUD)
  - tRPC `localTravelRules` Router (CRUD)
  - tRPC `travelAllowancePreview` Router (Preview)
  - Frontend-Hooks Migration
- **Out of scope:**
  - Reisekosten-Berechnung in Tageswerten (TICKET-234)

## Requirements

### tRPC Router: `travelAllowanceRuleSets`
- **Procedures:**
  - `travelAllowanceRuleSets.list/getById/create/update/delete`
  - Middleware: `tenantProcedure` + `requirePermission("travel_allowance.*")`

### tRPC Router: `extendedTravelRules`
- **Procedures:**
  - `extendedTravelRules.list` (query)
    - Input: `{ rule_set_id? }`
  - `extendedTravelRules.getById/create/update/delete`
  - Middleware: `tenantProcedure` + `requirePermission("travel_allowance.*")`

### tRPC Router: `localTravelRules`
- **Procedures:**
  - `localTravelRules.list` (query)
    - Input: `{ rule_set_id? }`
  - `localTravelRules.getById/create/update/delete`
  - Middleware: `tenantProcedure` + `requirePermission("travel_allowance.*")`

### tRPC Router: `travelAllowancePreview`
- **Procedures:**
  - `travelAllowancePreview.preview` (query)
    - Input: `{ employee_id, date, rule_set_id }`
    - Output: Preview der Reisekosten-Berechnung
    - Middleware: `tenantProcedure` + `requirePermission("travel_allowance.read")`

### Frontend Hook Migration
- Hinweis: Travel Allowance Frontend-Hooks existieren noch nicht im Hook-Index — werden neu erstellt

### Business Logic (aus Go portiert)
- `apps/api/internal/service/travel_allowance_rule_set.go` (188 Zeilen)
- `apps/api/internal/service/extended_travel_rule.go` (193 Zeilen)
- `apps/api/internal/service/local_travel_rule.go` (168 Zeilen)
- `apps/api/internal/service/travel_allowance_preview.go` (245 Zeilen)

## Acceptance Criteria
- [ ] RuleSet CRUD mit Extended und Local Rules
- [ ] Preview berechnet Reisekosten für einen Tag korrekt
- [ ] Alle Frontend-Hooks nutzen tRPC
- [ ] Bestehende Tests portiert

## Tests
- Unit-Test: RuleSet mit Rules erstellen
- Unit-Test: Preview-Berechnung mit verschiedenen Regelkombinationen
- Integration-Test: CRUD-Flow für alle Entitäten

## Dependencies
- ZMI-TICKET-203 (Authorization Middleware)
- ZMI-TICKET-214 (Employees — für Preview Employee-Referenz)
- ZMI-TICKET-210 (Tenants — tenantProcedure)

## Go-Dateien die ersetzt werden
- `apps/api/internal/service/travel_allowance_rule_set.go` (188 Zeilen)
- `apps/api/internal/handler/travel_allowance_rule_set.go` (216 Zeilen)
- `apps/api/internal/repository/travel_allowance_rule_set.go` (79 Zeilen)
- `apps/api/internal/service/extended_travel_rule.go` (193 Zeilen)
- `apps/api/internal/handler/extended_travel_rule.go` (248 Zeilen)
- `apps/api/internal/repository/extended_travel_rule.go` (77 Zeilen)
- `apps/api/internal/service/local_travel_rule.go` (168 Zeilen)
- `apps/api/internal/handler/local_travel_rule.go` (236 Zeilen)
- `apps/api/internal/repository/local_travel_rule.go` (77 Zeilen)
- `apps/api/internal/service/travel_allowance_preview.go` (245 Zeilen)
- `apps/api/internal/handler/travel_allowance_preview.go` (129 Zeilen)
