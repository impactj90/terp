# ZMI-TICKET-223: Access Profiles, Zones, Assignments

Status: Completed
Priority: P2
Owner: TBD

## Goal
tRPC-Router für Zutrittskontrolle: Access Profiles, Access Zones und Employee Access Assignments. Diese steuern die physische Zutrittsberechtigung von Mitarbeitern zu verschiedenen Zonen/Bereichen.

## Scope
- **In scope:**
  - tRPC `accessProfiles` Router (CRUD)
  - tRPC `accessZones` Router (CRUD)
  - tRPC `employeeAccessAssignments` Router (CRUD)
  - Frontend-Hooks Migration
- **Out of scope:**
  - Terminal-Integration (TICKET-225)

## Requirements

### tRPC Router: `accessProfiles`
- **Procedures:**
  - `accessProfiles.list` (query)
    - Output: `AccessProfile[]`
    - Middleware: `tenantProcedure` + `requirePermission("access_profiles.read")`
  - `accessProfiles.getById` (query)
    - Input: `{ id }`
    - Output: `AccessProfile`
  - `accessProfiles.create` (mutation)
    - Input: `{ name, code, description?, zone_ids? }`
    - Middleware: `requirePermission("access_profiles.write")`
  - `accessProfiles.update/delete`

### tRPC Router: `accessZones`
- **Procedures:**
  - `accessZones.list/getById/create/update/delete`
  - Middleware: `tenantProcedure` + `requirePermission("access_zones.*")`

### tRPC Router: `employeeAccessAssignments`
- **Procedures:**
  - `employeeAccessAssignments.list` (query)
    - Input: `{ employee_id?, access_profile_id? }`
    - Output: `EmployeeAccessAssignment[]`
    - Middleware: `tenantProcedure` + `requirePermission("access_assignments.read")`
  - `employeeAccessAssignments.create` (mutation)
    - Input: `{ employee_id, access_profile_id, valid_from?, valid_until? }`
    - Middleware: `requirePermission("access_assignments.write")`
  - `employeeAccessAssignments.update/delete`

### Frontend Hook Migration
- `apps/web/src/hooks/api/use-access-control.ts` → `trpc.accessProfiles.*`, `trpc.accessZones.*`, `trpc.employeeAccessAssignments.*`

### Business Logic (aus Go portiert)
- `apps/api/internal/service/access_profile.go` (143 Zeilen)
- `apps/api/internal/service/access_zone.go` (141 Zeilen)
- `apps/api/internal/service/employee_access_assignment.go` (121 Zeilen)

## Acceptance Criteria
- [ ] Access Profiles mit Zone-Zuordnung
- [ ] Employee Access Assignments mit Gültigkeitszeitraum
- [ ] Alle Frontend-Hooks nutzen tRPC statt fetch
- [ ] Bestehende Tests portiert

## Tests
- Unit-Test: AccessProfile mit Zones erstellen
- Unit-Test: Employee Assignment mit Validity-Range
- Integration-Test: CRUD-Flow für alle 3 Entitäten

## Dependencies
- ZMI-TICKET-203 (Authorization Middleware)
- ZMI-TICKET-214 (Employees CRUD — für Employee-Referenz)
- ZMI-TICKET-210 (Tenants — tenantProcedure)

## Go-Dateien die ersetzt werden
- `apps/api/internal/service/access_profile.go` (143 Zeilen)
- `apps/api/internal/handler/access_profile.go` (178 Zeilen)
- `apps/api/internal/repository/access_profile.go` (91 Zeilen)
- `apps/api/internal/service/access_zone.go` (141 Zeilen)
- `apps/api/internal/handler/access_zone.go` (185 Zeilen)
- `apps/api/internal/repository/access_zone.go` (79 Zeilen)
- `apps/api/internal/service/employee_access_assignment.go` (121 Zeilen)
- `apps/api/internal/handler/employee_access_assignment.go` (208 Zeilen)
- `apps/api/internal/repository/employee_access_assignment.go` (70 Zeilen)
- `apps/web/src/hooks/api/use-access-control.ts` (Frontend-Hook)
