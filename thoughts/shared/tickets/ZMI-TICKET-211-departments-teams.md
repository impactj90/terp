# ZMI-TICKET-211: Departments + Teams

Status: Done
Priority: P2
Owner: TBD

## Goal
tRPC-Router für Departments (mit Tree-Struktur) und Teams (mit Member-Management) implementieren. Ersetzt DepartmentService und TeamService aus dem Go-Backend.

## Scope
- **In scope:**
  - tRPC `departments` Router (CRUD + Tree-Query)
  - tRPC `teams` Router (CRUD + Member-Management)
  - Frontend-Hooks Migration auf tRPC
- **Out of scope:**
  - Department-basierte Data-Scope-Filterung (bereits in TICKET-203)

## Requirements

### tRPC Router: `departments`
- **Procedures:**
  - `departments.list` (query) — Flache Liste
    - Input: `{ is_active? }`
    - Output: `Department[]`
    - Middleware: `tenantProcedure` + `requirePermission("departments.read")`
  - `departments.tree` (query) — Hierarchische Baumstruktur
    - Output: `DepartmentTreeNode[]` (mit `children: DepartmentTreeNode[]`)
    - Middleware: `tenantProcedure` + `requirePermission("departments.read")`
  - `departments.getById` (query)
    - Input: `{ id }`
    - Output: `Department` (mit parent, children)
  - `departments.create` (mutation)
    - Input: `{ name, code?, parent_id?, sort_order? }`
    - Output: `Department`
    - Middleware: `requirePermission("departments.write")`
  - `departments.update` (mutation)
    - Input: `{ id, name?, code?, parent_id?, sort_order?, is_active? }`
    - Output: `Department`
    - Middleware: `requirePermission("departments.write")`
  - `departments.delete` (mutation)
    - Input: `{ id }`
    - Middleware: `requirePermission("departments.write")`
    - Logik: Prüfe ob Department Children oder Employees hat

### tRPC Router: `teams`
- **Procedures:**
  - `teams.list` (query) — Paginated
    - Input: `{ page?, pageSize?, search?, is_active? }`
    - Output: `{ items: Team[], total: number }`
    - Middleware: `tenantProcedure` + `requirePermission("teams.read")`
  - `teams.getById` (query)
    - Input: `{ id }`
    - Output: `Team` (mit Members + Employee-Details)
  - `teams.create` (mutation)
    - Input: `{ name, description? }`
    - Output: `Team`
    - Middleware: `requirePermission("teams.write")`
  - `teams.update` (mutation)
    - Input: `{ id, name?, description?, is_active? }`
    - Output: `Team`
  - `teams.delete` (mutation)
    - Input: `{ id }`
  - `teams.addMember` (mutation)
    - Input: `{ teamId, employeeId, role? }`
    - Output: `TeamMember`
  - `teams.updateMember` (mutation)
    - Input: `{ teamId, employeeId, role? }`
  - `teams.removeMember` (mutation)
    - Input: `{ teamId, employeeId }`
  - `teams.members` (query)
    - Input: `{ teamId }`
    - Output: `TeamMember[]` (mit Employee-Details)

### Frontend Hook Migration
- `apps/web/src/hooks/api/use-departments.ts` → `trpc.departments.*`
- `apps/web/src/hooks/api/use-teams.ts` → `trpc.teams.*`

### Business Logic (aus Go portiert)
- `apps/api/internal/service/department.go` (308 Zeilen) — CRUD + Tree-Building
- `apps/api/internal/service/team.go` (290 Zeilen) — CRUD + Member-Management

## Acceptance Criteria
- [ ] Department Tree-Query liefert hierarchische Struktur
- [ ] Department-Löschung verhindert bei Children/Employees
- [ ] Team Member-Management (Add/Update/Remove) funktioniert
- [ ] Alle Frontend-Hooks nutzen tRPC statt fetch
- [ ] Bestehende Tests portiert

## Tests
- Unit-Test: Department Tree wird korrekt aufgebaut
- Unit-Test: Department-Löschung mit Children wird verhindert
- Unit-Test: Team Member hinzufügen/entfernen
- Integration-Test: CRUD-Flow für Departments und Teams
- E2E-Test: Frontend Department-Tree-Anzeige

## Dependencies
- ZMI-TICKET-203 (Authorization Middleware)
- ZMI-TICKET-204 (Prisma Schema: Org-Tabellen — Department, Team Modelle)
- ZMI-TICKET-210 (Tenants, Users — tenantProcedure muss funktionieren)

## Go-Dateien die ersetzt werden
- `apps/api/internal/service/department.go` (308 Zeilen)
- `apps/api/internal/handler/department.go` (275 Zeilen)
- `apps/api/internal/repository/department.go` (176 Zeilen)
- `apps/api/internal/service/team.go` (290 Zeilen)
- `apps/api/internal/handler/team.go` (450 Zeilen)
- `apps/api/internal/repository/team.go` (300 Zeilen)
- `apps/web/src/hooks/api/use-departments.ts` (Frontend-Hook)
- `apps/web/src/hooks/api/use-teams.ts` (Frontend-Hook)
