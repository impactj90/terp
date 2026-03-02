# ZMI-TICKET-203: Authorization Middleware

Status: Proposed
Priority: P1
Owner: TBD

## Goal
Permission-System und Data-Scope-Enforcement als tRPC-Middleware implementieren. Ersetzt das Go-basierte `PermissionChecker` und `RequirePermission`-Middleware-System. Unterstützt `isAdmin`-Bypass, Data-Scope-Typen (all/tenant/department/employee) und Self-Access-Patterns.

## Scope
- **In scope:**
  - `requirePermission()` tRPC-Middleware
  - `requireSelfOrPermission()` tRPC-Middleware
  - `requireEmployeePermission()` tRPC-Middleware (own vs all)
  - Data-Scope-Enforcement (all, department, employee)
  - Admin-Bypass-Logik
  - Permission-Laden aus `user_groups.permissions` JSON
  - Tenant-Isolation in Queries (Prisma `where: { tenant_id }`)
- **Out of scope:**
  - Konkrete Router-Implementierungen (ab TICKET-210)
  - Row-Level Security in Supabase (optional, späteres Ticket)

## Requirements

### tRPC Middleware
```typescript
// requirePermission — prüft ob User eine der angegebenen Permissions hat
const requirePermission = (...permissionIds: string[]) =>
  t.middleware(async ({ ctx, next }) => {
    // Admin-Bypass: wenn UserGroup.is_admin === true
    // Sonst: prüfe ob mindestens eine Permission in UserGroup.permissions
    // Wirft TRPCError FORBIDDEN wenn nicht autorisiert
  })

// requireSelfOrPermission — Self-Access oder Permission
const requireSelfOrPermission = (employeeIdGetter: (input) => string, permissionId: string) =>
  t.middleware(async ({ ctx, input, next }) => {
    // Erlaubt wenn ctx.user.employee_id === employeeIdGetter(input)
    // ODER wenn User die Permission hat
  })

// requireEmployeePermission — Own vs All Scope
const requireEmployeePermission = (
  employeeIdGetter: (input) => string,
  ownPermission: string,
  allPermission: string
) => t.middleware(...)

// Data-Scope Filter
const applyDataScope = () =>
  t.middleware(async ({ ctx, next }) => {
    // Liest data_scope aus UserGroup
    // Enriches ctx mit scopeFilter für Prisma-Queries
    // scope "all" → kein Filter
    // scope "department" → filter by departments des Users
    // scope "employee" → filter by employee_id des Users
  })
```

### Permission-Laden
- Permissions werden aus `user_groups.permissions` (JSON Array) geladen
- Caching im tRPC-Context (einmal pro Request laden)
- Format: `["employees.read", "employees.write", "bookings.manage", ...]`

### tRPC Router
- **Router-Name:** `permissions`
- **Procedures:**
  - `permissions.list` (query) — Alle verfügbaren Permissions auflisten
    - Input: keiner
    - Output: `{ permissions: { id: string, name: string, category: string }[] }`
    - Middleware: `protectedProcedure`

### Frontend Hook Migration
- `apps/web/src/hooks/api/use-permissions.ts` → `trpc.permissions.list.useQuery()`

### Business Logic (aus Go portiert)
- `apps/api/internal/middleware/authorization.go` (277 Zeilen)
  - `NewPermissionChecker()` → Context-basiertes Permission-Loading
  - `Has()` / `HasAny()` → Inline-Checks in Middleware
  - `RequirePermission()` → `requirePermission()` tRPC-Middleware
  - `RequireSelfOrPermission()` → `requireSelfOrPermission()` tRPC-Middleware
  - `RequireEmployeePermission()` → `requireEmployeePermission()` tRPC-Middleware
- `apps/api/internal/handler/permission.go` (39 Zeilen) — Permission List Handler

## Acceptance Criteria
- [ ] `requirePermission()` blockiert Zugriff ohne passende Permission
- [ ] Admin-Bypass funktioniert für UserGroups mit `is_admin: true`
- [ ] Data-Scope-Filter wird korrekt angewendet (all/department/employee)
- [ ] Self-Access-Pattern funktioniert (eigene Daten ohne Permission)
- [ ] Permissions werden aus `user_groups.permissions` JSON geladen
- [ ] `permissions.list` Endpoint gibt alle verfügbaren Permissions zurück
- [ ] Frontend-Hook nutzt tRPC statt fetch

## Tests
- Unit-Test: Admin-User bypassed alle Permission-Checks
- Unit-Test: User ohne Permission wird blockiert (FORBIDDEN)
- Unit-Test: Self-Access erlaubt Zugriff auf eigene Daten
- Unit-Test: Data-Scope "department" filtert korrekt
- Unit-Test: Data-Scope "employee" filtert auf eigene Daten
- Integration-Test: Permission-Check in tRPC-Procedure

## Dependencies
- ZMI-TICKET-200 (Prisma Schema: Core Foundation — UserGroup mit permissions JSON)
- ZMI-TICKET-201 (tRPC Server Setup — Procedure-Definitionen)
- ZMI-TICKET-202 (Supabase Auth — User-Context im tRPC)

## Go-Dateien die ersetzt werden
- `apps/api/internal/middleware/authorization.go` (277 Zeilen — PermissionChecker, RequirePermission, etc.)
- `apps/api/internal/handler/permission.go` (39 Zeilen — Permission List)
- `apps/api/internal/handler/scope.go` (17 Zeilen — scopeFromContext)
- `apps/web/src/hooks/api/use-permissions.ts` (Frontend-Hook)
