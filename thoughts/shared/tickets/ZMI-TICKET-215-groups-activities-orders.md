# ZMI-TICKET-215: Groups + Activities + Orders

Status: Proposed
Priority: P2
Owner: TBD

## Goal
tRPC-Router für Groups (3 Typen: Employee, Workflow, Activity), Activities, Orders und Order Assignments implementieren. Diese Entitäten bilden die Auftrags- und Gruppenverwaltung ab.

## Scope
- **In scope:**
  - tRPC `groups` Router (3 Gruppentypen: employee, workflow, activity)
  - tRPC `activities` Router (CRUD)
  - tRPC `orders` Router (CRUD)
  - tRPC `orderAssignments` Router (CRUD)
  - Frontend-Hooks Migration
- **Out of scope:**
  - Order Bookings (TICKET-250)
  - Gruppen-Referenzierung in Macros (TICKET-222)

## Requirements

### tRPC Router: `groups`
- **Procedures:**
  - `groups.list` (query) — Gefiltert nach Gruppentyp
    - Input: `{ type: "employee" | "workflow" | "activity" }`
    - Output: `Group[]` (mit Members)
    - Middleware: `tenantProcedure` + `requirePermission("groups.read")`
  - `groups.getById` (query)
    - Input: `{ id }`
    - Output: `Group` (mit Members + Typ-spezifische Details)
  - `groups.create` (mutation)
    - Input: `{ name, type, description?, member_ids? }`
    - Output: `Group`
    - Middleware: `requirePermission("groups.write")`
  - `groups.update` (mutation)
    - Input: `{ id, name?, description?, member_ids?, is_active? }`
  - `groups.delete` (mutation)

### tRPC Router: `activities`
- **Procedures:**
  - `activities.list/getById/create/update/delete`
  - Middleware: `tenantProcedure` + `requirePermission("activities.*")`

### tRPC Router: `orders`
- **Procedures:**
  - `orders.list` (query) — Paginated
    - Input: `{ page?, pageSize?, search?, is_active? }`
    - Output: `{ items: Order[], total: number }`
  - `orders.getById/create/update/delete`
  - Middleware: `tenantProcedure` + `requirePermission("orders.*")`

### tRPC Router: `orderAssignments`
- **Procedures:**
  - `orderAssignments.list` (query)
    - Input: `{ order_id? }`
  - `orderAssignments.byOrder` (query)
    - Input: `{ orderId }`
    - Output: `OrderAssignment[]` (mit Employee-Details)
  - `orderAssignments.create/update/delete`
  - Middleware: `tenantProcedure` + `requirePermission("orders.*")`

### Frontend Hook Migration
- `apps/web/src/hooks/api/use-activities.ts` → `trpc.activities.*`
- `apps/web/src/hooks/api/use-orders.ts` → `trpc.orders.*`
- `apps/web/src/hooks/api/use-order-assignments.ts` → `trpc.orderAssignments.*`
- Hinweis: `groups` Frontend-Hook existiert noch nicht, wird neu erstellt

### Business Logic (aus Go portiert)
- `apps/api/internal/service/group.go` (338 Zeilen) — 3 Gruppentypen mit Member-Management
- `apps/api/internal/service/activity.go` (155 Zeilen)
- `apps/api/internal/service/order.go` (220 Zeilen)
- `apps/api/internal/service/order_assignment.go` (155 Zeilen)

## Acceptance Criteria
- [ ] Groups unterstützen 3 Typen (employee, workflow, activity)
- [ ] Group Member-Management funktioniert
- [ ] Orders mit Assignments verknüpfbar
- [ ] Alle Frontend-Hooks nutzen tRPC statt fetch

## Tests
- Unit-Test: Group-Erstellung mit verschiedenen Typen
- Unit-Test: Order Assignment CRUD
- Integration-Test: CRUD-Flow für alle Entitäten

## Dependencies
- ZMI-TICKET-203 (Authorization Middleware)
- ZMI-TICKET-205 (Prisma Schema: Employee — für Group Members)
- ZMI-TICKET-210 (Tenants — tenantProcedure)

## Go-Dateien die ersetzt werden
- `apps/api/internal/service/group.go` (338 Zeilen)
- `apps/api/internal/handler/group.go` (345 Zeilen)
- `apps/api/internal/repository/group.go` (119 Zeilen)
- `apps/api/internal/service/activity.go` (155 Zeilen)
- `apps/api/internal/handler/activity.go` (178 Zeilen)
- `apps/api/internal/repository/activity.go` (109 Zeilen)
- `apps/api/internal/service/order.go` (220 Zeilen)
- `apps/api/internal/handler/order.go` (227 Zeilen)
- `apps/api/internal/repository/order.go` (156 Zeilen)
- `apps/api/internal/service/order_assignment.go` (155 Zeilen)
- `apps/api/internal/handler/order_assignment.go` (208 Zeilen)
- `apps/api/internal/repository/order_assignment.go` (113 Zeilen)
- `apps/web/src/hooks/api/use-activities.ts` (Frontend-Hook)
- `apps/web/src/hooks/api/use-orders.ts` (Frontend-Hook)
- `apps/web/src/hooks/api/use-order-assignments.ts` (Frontend-Hook)
