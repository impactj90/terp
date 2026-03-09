# ZMI-TICKET-313: Extract Services — Tier 2 Batch 2 (Large Routers)

Status: Todo
Priority: P1
Depends on: ZMI-TICKET-303

## Goal
Extract service + repository layers for: users (624 lines), systemSettings (642 lines), evaluations (789 lines).

## Routers (3 total)

### users.ts (624 lines)
- Permission: `users.read`, `users.write`
- Model: `User`
- **Complex features:**
  - CRUD with relations (userGroup, employee, tenants)
  - Password change via Supabase Admin API
  - Self-update (users can update their own profile)
  - User-tenant assignment on creation
  - Search/filter with pagination
- **Repository:**
  - `findMany(prisma, tenantId, params)` — with search, active filter, includes
  - `findById(prisma, tenantId, id)` — with userGroup, employee relations
  - `create(prisma, tenantId, data)` — includes user_tenants entry
  - `update(prisma, tenantId, id, data)`
  - `delete(prisma, tenantId, id)`
- **Service:**
  - `createUser(prisma, tenantId, supabase, data)` — Supabase user creation + DB
  - `changePassword(supabase, userId, password)` — Supabase Admin API
  - `updateSelf(prisma, userId, data)` — limited self-update
  - Error classes: `UserNotFoundError`, `EmailAlreadyExistsError`

### systemSettings.ts (642 lines)
- Permission: `system_settings.read`, `system_settings.write`
- Model: `SystemSettings`
- **Complex features:**
  - Single settings object per tenant (upsert pattern)
  - Multiple setting categories (general, calculation, display, etc.)
  - Default values for unset settings
  - Nested JSON settings structure
- **Repository:**
  - `findByTenantId(prisma, tenantId)` — get or create defaults
  - `upsert(prisma, tenantId, data)` — update or create settings
- **Service:**
  - `getSettings(prisma, tenantId)` — returns settings with defaults merged
  - `updateSettings(prisma, tenantId, data)` — validates and saves
  - Settings schema validation

### evaluations.ts (789 lines)
- Permission: `evaluations.read`
- Model: Multiple (DailyValue, Booking, TerminalBooking + joins)
- **Complex features:**
  - Read-only query endpoints (no mutations)
  - Employee evaluation data (bookings, terminal bookings, daily values, log entries, workflow)
  - Date range queries with complex joins
  - Data formatted for evaluation UI display
- **Repository:**
  - `findBookings(prisma, tenantId, employeeId, dateRange)`
  - `findTerminalBookings(prisma, tenantId, employeeId, dateRange)`
  - `findDailyValues(prisma, tenantId, employeeId, dateRange)`
  - `findLogEntries(prisma, tenantId, employeeId, dateRange)`
  - `findWorkflowEntries(prisma, tenantId, employeeId, dateRange)`
- **Service:**
  - `getEvaluationData(prisma, tenantId, employeeId, dateRange)` — orchestrates all queries
  - Response formatting/mapping

## Files Created (~6)
- `src/lib/services/user-service.ts` + `user-repository.ts`
- `src/lib/services/system-settings-service.ts` + `system-settings-repository.ts`
- `src/lib/services/evaluation-service.ts` + `evaluation-repository.ts`

## Verification
```bash
make typecheck
make test
```
