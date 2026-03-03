# ZMI-TICKET-210: Tenants, Users, User Groups

Status: Done
Priority: P1
Owner: TBD

## Goal
tRPC-Router für Tenants, Users und User Groups implementieren. Ersetzt die Go-Services TenantService, UserService und UserGroupService inkl. aller CRUD-Operationen, Password-Management und Tenant-Zugriffskontrolle.

## Scope
- **In scope:**
  - tRPC `tenants` Router (CRUD + Deactivate)
  - tRPC `users` Router (CRUD + Password Change + List)
  - tRPC `userGroups` Router (CRUD + Permission Assignment)
  - Frontend-Hooks Migration auf tRPC
  - User-Tenant-Zuordnung bei User-Erstellung
- **Out of scope:**
  - Auth/Login (TICKET-202)
  - Permission-System (TICKET-203, bereits implementiert)

## Requirements

### tRPC Router: `tenants`
- **Procedures:**
  - `tenants.list` (query) — Nur Tenants des aktuellen Users
    - Output: `Tenant[]`
    - Middleware: `protectedProcedure`
  - `tenants.getById` (query)
    - Input: `{ id: string }`
    - Output: `Tenant`
    - Middleware: `tenantProcedure`
  - `tenants.create` (mutation)
    - Input: `{ name, subdomain, settings? }`
    - Output: `Tenant`
    - Middleware: `requirePermission("tenants.manage")`
  - `tenants.update` (mutation)
    - Input: `{ id, name?, subdomain?, settings?, is_active? }`
    - Output: `Tenant`
    - Middleware: `requirePermission("tenants.manage")`
  - `tenants.deactivate` (mutation)
    - Input: `{ id }`
    - Output: `{ success: boolean }`
    - Middleware: `requirePermission("tenants.manage")`

### tRPC Router: `users`
- **Procedures:**
  - `users.list` (query) — Paginated mit Filter
    - Input: `{ page?, pageSize?, search?, is_active? }`
    - Output: `{ items: User[], total: number }`
    - Middleware: `tenantProcedure` + `requirePermission("users.read")`
  - `users.getById` (query)
    - Input: `{ id }`
    - Output: `User` (mit UserGroup, Employee)
    - Middleware: `tenantProcedure` + `requirePermission("users.read")`
  - `users.create` (mutation)
    - Input: `{ username, email, display_name?, user_group_id?, employee_id? }`
    - Output: `User`
    - Middleware: `requirePermission("users.write")`
    - Logik: Auto-`user_tenants` Eintrag erstellen
  - `users.update` (mutation)
    - Input: `{ id, display_name?, avatar_url?, user_group_id?, employee_id?, is_active? }`
    - Output: `User`
    - Middleware: `requireSelfOrPermission("users.write")`
  - `users.delete` (mutation)
    - Input: `{ id }`
    - Middleware: `requirePermission("users.write")`
  - `users.changePassword` (mutation)
    - Input: `{ id, password }`
    - Middleware: `requirePermission("users.write")`
    - Logik: Supabase Admin API zum Password-Reset

### tRPC Router: `userGroups`
- **Procedures:**
  - `userGroups.list` (query)
    - Output: `UserGroup[]`
    - Middleware: `tenantProcedure` + `requirePermission("user_groups.read")`
  - `userGroups.getById` (query)
    - Input: `{ id }`
    - Output: `UserGroup` (mit Users Count)
    - Middleware: `tenantProcedure` + `requirePermission("user_groups.read")`
  - `userGroups.create` (mutation)
    - Input: `{ name, description?, permissions, is_admin?, data_scope? }`
    - Output: `UserGroup`
    - Middleware: `requirePermission("user_groups.write")`
  - `userGroups.update` (mutation)
    - Input: `{ id, name?, description?, permissions?, is_admin?, data_scope?, is_active? }`
    - Output: `UserGroup`
    - Middleware: `requirePermission("user_groups.write")`
  - `userGroups.delete` (mutation)
    - Input: `{ id }`
    - Middleware: `requirePermission("user_groups.write")`

### Frontend Hook Migration
- `apps/web/src/hooks/api/use-tenants.ts` → `trpc.tenants.*`
- `apps/web/src/hooks/api/use-user.ts` → `trpc.users.getById`, `trpc.users.update`
- `apps/web/src/hooks/api/use-users.ts` → `trpc.users.*`
- `apps/web/src/hooks/api/use-user-groups.ts` → `trpc.userGroups.*`

### Business Logic (aus Go portiert)
- `apps/api/internal/service/tenant.go` (271 Zeilen) — Tenant CRUD + List (nur autorisierte)
- `apps/api/internal/service/user.go` (527 Zeilen) — User CRUD + Password + Auto-UserTenant
- `apps/api/internal/service/usergroup.go` (288 Zeilen) — UserGroup CRUD + Permission-JSON

## Acceptance Criteria
- [ ] Alle Tenant CRUD-Operationen über tRPC verfügbar
- [ ] Tenant-Liste zeigt nur autorisierte Tenants (via `user_tenants`)
- [ ] User CRUD mit Auto-UserTenant-Eintrag bei Erstellung
- [ ] Password-Change über Supabase Admin API
- [ ] UserGroup CRUD mit Permission-JSON-Management
- [ ] Alle Frontend-Hooks nutzen tRPC statt fetch
- [ ] Bestehende Tests portiert
- [ ] Go-Endpunkte können deaktiviert werden

## Tests
- Unit-Test: Tenant-Liste filtert nach user_tenants
- Unit-Test: User-Erstellung erstellt user_tenants Eintrag
- Unit-Test: UserGroup-Update ändert Permissions korrekt
- Integration-Test: Kompletter CRUD-Flow für jeden Router
- E2E-Test: Frontend-Hooks funktionieren mit tRPC

## Dependencies
- ZMI-TICKET-200 (Prisma Schema: Core Foundation)
- ZMI-TICKET-201 (tRPC Server Setup)
- ZMI-TICKET-202 (Supabase Auth — für Password-Change)
- ZMI-TICKET-203 (Authorization Middleware — für Permissions)

## Go-Dateien die ersetzt werden
- `apps/api/internal/service/tenant.go` (271 Zeilen)
- `apps/api/internal/handler/tenant.go` (234 Zeilen)
- `apps/api/internal/repository/tenant.go` (106 Zeilen)
- `apps/api/internal/service/user.go` (527 Zeilen)
- `apps/api/internal/handler/user.go` (504 Zeilen)
- `apps/api/internal/repository/user.go` (223 Zeilen)
- `apps/api/internal/service/usergroup.go` (288 Zeilen)
- `apps/api/internal/handler/usergroup.go` (253 Zeilen)
- `apps/api/internal/repository/usergroup.go` (132 Zeilen)
- `apps/web/src/hooks/api/use-tenants.ts` (Frontend-Hook)
- `apps/web/src/hooks/api/use-user.ts` (Frontend-Hook)
- `apps/web/src/hooks/api/use-users.ts` (Frontend-Hook)
- `apps/web/src/hooks/api/use-user-groups.ts` (Frontend-Hook)
