# ZMI-TICKET-214: Employees CRUD

Status: Done
Priority: P1
Owner: TBD

## Goal
tRPC-Router für Employee Master Data implementieren inkl. Contacts, Cards, Search und Bulk-Tariff-Assignment. Der Employee-Service ist mit 888 Zeilen einer der größten Services und wird von vielen anderen Domains referenziert.

## Scope
- **In scope:**
  - tRPC `employees` Router (CRUD + Search + Bulk-Tariff)
  - tRPC `employeeContacts` Sub-Router
  - tRPC `employeeCards` Sub-Router
  - tRPC `employeeTariffAssignments` Router
  - Frontend-Hooks Migration
- **Out of scope:**
  - Employee Day Plans (TICKET-229)
  - Employee Bookings (TICKET-232)
  - Employee Absences (TICKET-240)
  - Employee Vacation Balances (TICKET-242)

## Requirements

### tRPC Router: `employees`
- **Procedures:**
  - `employees.list` (query) — Paginated mit umfangreichen Filtern
    - Input: `{ page?, pageSize?, search?, department_id?, cost_center_id?, location_id?, employment_type_id?, is_active?, sort_by?, sort_order? }`
    - Output: `{ items: Employee[], total: number }`
    - Middleware: `tenantProcedure` + `requirePermission("employees.read")` + `applyDataScope()`
  - `employees.getById` (query)
    - Input: `{ id }`
    - Output: `Employee` (mit Department, CostCenter, Location, EmploymentType, Contacts, Cards)
    - Middleware: `requireEmployeePermission("employees.read_own", "employees.read")`
  - `employees.create` (mutation)
    - Input: alle Employee-Felder
    - Output: `Employee`
    - Middleware: `requirePermission("employees.write")`
    - Logik: Validierung personnel_number Uniqueness pro Tenant
  - `employees.update` (mutation)
    - Input: `{ id, ...partialFields }`
    - Middleware: `requireSelfOrPermission("employees.write")`
  - `employees.delete` (mutation) — Soft-Delete
    - Input: `{ id }`
    - Middleware: `requirePermission("employees.write")`
  - `employees.bulkAssignTariff` (mutation)
    - Input: `{ employee_ids: string[], tariff_id, valid_from }`
    - Middleware: `requirePermission("employees.write")`

### tRPC Router: `employeeContacts`
- **Procedures:**
  - `employeeContacts.list` (query) — `{ employeeId }`
  - `employeeContacts.create` (mutation)
  - `employeeContacts.delete` (mutation)

### tRPC Router: `employeeCards`
- **Procedures:**
  - `employeeCards.list` (query) — `{ employeeId }`
  - `employeeCards.create` (mutation)
  - `employeeCards.deactivate` (mutation)

### tRPC Router: `employeeTariffAssignments`
- **Procedures:**
  - `employeeTariffAssignments.list` (query)
    - Input: `{ employeeId }`
  - `employeeTariffAssignments.getById` (query)
  - `employeeTariffAssignments.create` (mutation)
    - Input: `{ employeeId, tariff_id, valid_from, valid_until? }`
  - `employeeTariffAssignments.update` (mutation)
  - `employeeTariffAssignments.delete` (mutation)
  - `employeeTariffAssignments.effective` (query) — Aktive Assignment an einem Datum
    - Input: `{ employeeId, date }`
    - Output: `EmployeeTariffAssignment` (mit Tariff-Details)

### Frontend Hook Migration
- `apps/web/src/hooks/api/use-employees.ts` → `trpc.employees.*`
- `apps/web/src/hooks/api/use-employee-contacts.ts` → `trpc.employeeContacts.*`
- `apps/web/src/hooks/api/use-employee-cards.ts` → `trpc.employeeCards.*`
- `apps/web/src/hooks/api/use-employee-tariff-assignments.ts` → `trpc.employeeTariffAssignments.*`

### Business Logic (aus Go portiert)
- `apps/api/internal/service/employee.go` (888 Zeilen) — CRUD + Search + Bulk-Tariff
- `apps/api/internal/service/employeetariffassignment.go` (648 Zeilen) — Assignment CRUD + Effective Query

## Acceptance Criteria
- [ ] Employee-Liste mit Pagination, Filtern und Data-Scope
- [ ] Employee-Erstellung validiert personnel_number Uniqueness
- [ ] Bulk-Tariff-Assignment für mehrere Mitarbeiter
- [ ] Contacts und Cards Sub-Entitäten CRUD
- [ ] Effective Tariff Query gibt aktive Assignment zurück
- [ ] Alle Frontend-Hooks nutzen tRPC statt fetch
- [ ] Bestehende Tests portiert

## Tests
- Unit-Test: Personnel Number Uniqueness pro Tenant
- Unit-Test: Data-Scope-Filterung (department/employee)
- Unit-Test: Effective Tariff an verschiedenen Daten
- Unit-Test: Bulk-Tariff-Assignment
- Integration-Test: Kompletter Employee CRUD-Flow
- E2E-Test: Employee-Liste und Detail-Ansicht

## Dependencies
- ZMI-TICKET-203 (Authorization Middleware — Data Scope)
- ZMI-TICKET-205 (Prisma Schema: Employee)
- ZMI-TICKET-210 (Tenants, Users — tenantProcedure)

## Go-Dateien die ersetzt werden
- `apps/api/internal/service/employee.go` (888 Zeilen)
- `apps/api/internal/handler/employee.go` (1170 Zeilen)
- `apps/api/internal/repository/employee.go` (378 Zeilen)
- `apps/api/internal/service/employeetariffassignment.go` (648 Zeilen)
- `apps/api/internal/handler/employeetariffassignment.go` (263 Zeilen)
- `apps/api/internal/repository/employeetariffassignment.go` (172 Zeilen)
- `apps/web/src/hooks/api/use-employees.ts` (Frontend-Hook)
- `apps/web/src/hooks/api/use-employee-contacts.ts` (Frontend-Hook)
- `apps/web/src/hooks/api/use-employee-cards.ts` (Frontend-Hook)
- `apps/web/src/hooks/api/use-employee-tariff-assignments.ts` (Frontend-Hook)
