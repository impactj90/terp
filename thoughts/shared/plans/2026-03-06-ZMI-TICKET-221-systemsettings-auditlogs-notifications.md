# ZMI-TICKET-221: System Settings + Audit Logs + Notifications Implementation Plan

## Overview

Implement tRPC routers for three domains -- System Settings (singleton configuration with cleanup actions), Audit Logs (read-only list/detail), and Notifications (list, mark read, preferences) -- along with Prisma schema additions and frontend hook migration. These replace the existing Go backend handlers/services/repositories and REST-based frontend hooks.

## Current State Analysis

### What Exists
- **Go backend**: Full CRUD for all three domains (model, repository, service, handler layers).
- **Database tables**: `system_settings` (migration 000067), `audit_logs` (migration 000040), `notifications` + `notification_preferences` (migration 000035). All tables exist and are populated.
- **REST frontend hooks**: `use-system-settings.ts`, `use-audit-logs.ts`, `use-notifications.ts` use `useApiQuery`/`useApiMutation` against the Go API.
- **Prisma schema**: None of the four tables have Prisma models yet (`apps/web/prisma/schema.prisma`, 1688 lines, ~66 models).
- **tRPC infrastructure**: 35 routers registered in `root.ts`. Pattern is well-established via tariffs, absenceTypes, employees routers.

### Key Discoveries
- **Permission mismatch**: The ticket specifies `system_settings.read`, `system_settings.write`, `audit_logs.read` -- none of these exist in the permission catalog. The Go code uses `system_settings.manage` (also not in catalog, likely a bug) and `users.manage` for audit logs. The actual catalog (`apps/web/src/server/lib/permission-catalog.ts`) has `settings.manage` (line 130), `users.manage` (line 128), `notifications.manage` (line 115). We will use these catalog-matching keys.
- **Cleanup operations**: The Go service uses `CleanupDateRangeInput` (dateFrom, dateTo, employeeIDs, confirm) and `CleanupOrdersInput` (orderIDs, confirm) -- not `before_date` as the ticket suggests. These depend on booking, daily value, employee day plan, and order repositories plus a recalc service.
- **Cleanup complexity**: Cleanup operations require tables not yet in Prisma (bookings, daily_values, employee_day_plans). The tRPC cleanup mutations will use raw SQL via `prisma.$queryRaw` / `prisma.$executeRaw` since these tables lack Prisma models.
- **Notifications are user-scoped**: The Go code uses tenant + user context. The ticket says `protectedProcedure` but notifications still need `tenantId` for the database query. We will use `tenantProcedure` for consistency with the Go behavior, but filter by `ctx.user.id` for user-scoped data.
- **SSE streaming explicitly out of scope** (deferred to TICKET-230).
- **Audit logs are read-only** from the tRPC perspective; the `Log()` method is internal only.
- **System settings uses singleton pattern**: one row per tenant, created on first access via `GetOrCreate` (upsert).

## Desired End State

After this plan is complete:
1. Prisma schema has models for `SystemSetting`, `AuditLog`, `Notification`, `NotificationPreference`.
2. Three tRPC routers (`systemSettings`, `auditLogs`, `notifications`) are registered and functional.
3. Frontend hooks use tRPC instead of REST fetch.
4. All hooks in `index.ts` re-export from the new tRPC-based files.
5. Tests cover core procedures for each router.
6. `npx prisma generate` succeeds, `npx vitest run` passes.

## What We're NOT Doing

- **SSE/WebSocket notification streaming** (TICKET-230)
- **Notification creation API** (internal service only, called by other services)
- **Audit log creation API** (internal service only)
- **New permission catalog entries** -- using existing `settings.manage`, `users.manage`, `notifications.manage`
- **New SQL migrations** -- all tables already exist
- **Prisma models for bookings/daily_values/employee_day_plans** -- cleanup operations will use raw SQL

## Implementation Approach

Follow the established pattern from existing routers (tariffs, absenceTypes). Each phase builds incrementally: Prisma schema first (so types are available), then routers, then hooks, then tests.

---

## Phase 1: Prisma Schema Additions

### Overview
Add four Prisma models mapping to the existing database tables. This phase generates the TypeScript types used by all subsequent phases.

### Changes Required:

#### 1. Prisma Schema
**File**: `apps/web/prisma/schema.prisma`
**Changes**: Add `SystemSetting`, `AuditLog`, `Notification`, `NotificationPreference` models at the end of the file (before closing). Also add reverse relations on `User` and `Tenant` models.

```prisma
// -----------------------------------------------------------------------------
// SystemSetting
// -----------------------------------------------------------------------------
// Migration: 000067
//
// Singleton per tenant via UNIQUE(tenant_id).
// Trigger: update_updated_at_column() auto-sets updated_at on UPDATE
model SystemSetting {
  id                                String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId                          String   @map("tenant_id") @db.Uuid
  roundingRelativeToPlan            Boolean  @default(false) @map("rounding_relative_to_plan")
  errorListEnabled                  Boolean  @default(true) @map("error_list_enabled")
  trackedErrorCodes                 String[] @default([]) @map("tracked_error_codes") @db.Text
  autoFillOrderEndBookings          Boolean  @default(false) @map("auto_fill_order_end_bookings")
  birthdayWindowDaysBefore          Int      @default(7) @map("birthday_window_days_before")
  birthdayWindowDaysAfter           Int      @default(7) @map("birthday_window_days_after")
  followUpEntriesEnabled            Boolean  @default(false) @map("follow_up_entries_enabled")
  proxyHost                         String?  @map("proxy_host") @db.VarChar(255)
  proxyPort                         Int?     @map("proxy_port")
  proxyUsername                     String?  @map("proxy_username") @db.VarChar(255)
  proxyPassword                     String?  @map("proxy_password") @db.VarChar(255)
  proxyEnabled                      Boolean  @default(false) @map("proxy_enabled")
  serverAliveEnabled                Boolean  @default(false) @map("server_alive_enabled")
  serverAliveExpectedCompletionTime Int?     @map("server_alive_expected_completion_time")
  serverAliveThresholdMinutes       Int?     @default(30) @map("server_alive_threshold_minutes")
  serverAliveNotifyAdmins           Boolean  @default(true) @map("server_alive_notify_admins")
  createdAt                         DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt                         DateTime @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)

  // Relations
  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  // Indexes
  @@unique([tenantId], map: "system_settings_tenant_id_key")
  @@index([tenantId], map: "idx_system_settings_tenant_id")
  @@map("system_settings")
}

// -----------------------------------------------------------------------------
// AuditLog
// -----------------------------------------------------------------------------
// Migration: 000040
//
// Note: tenant_id has NO foreign key constraint in the DB (unlike other tables).
// user_id FK references users(id) ON DELETE SET NULL.
model AuditLog {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId    String   @map("tenant_id") @db.Uuid
  userId      String?  @map("user_id") @db.Uuid
  action      String   @db.VarChar(20)
  entityType  String   @map("entity_type") @db.VarChar(100)
  entityId    String   @map("entity_id") @db.Uuid
  entityName  String?  @map("entity_name") @db.Text
  changes     Json?    @db.JsonB
  metadata    Json?    @db.JsonB
  ipAddress   String?  @map("ip_address") @db.Text
  userAgent   String?  @map("user_agent") @db.Text
  performedAt DateTime @default(now()) @map("performed_at") @db.Timestamptz(6)

  // Relations
  user User? @relation(fields: [userId], references: [id], onDelete: SetNull)

  // Indexes
  @@index([tenantId], map: "idx_audit_logs_tenant")
  @@index([userId], map: "idx_audit_logs_user")
  @@index([entityType, entityId], map: "idx_audit_logs_entity")
  @@index([action], map: "idx_audit_logs_action")
  @@index([performedAt], map: "idx_audit_logs_performed_at")
  @@map("audit_logs")
}

// -----------------------------------------------------------------------------
// Notification
// -----------------------------------------------------------------------------
// Migration: 000035
//
// User-scoped notifications with read status.
// Trigger: update_updated_at_column() auto-sets updated_at on UPDATE
model Notification {
  id        String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId  String    @map("tenant_id") @db.Uuid
  userId    String    @map("user_id") @db.Uuid
  type      String    @db.VarChar(20)
  title     String    @db.VarChar(255)
  message   String    @db.Text
  link      String?   @db.Text
  readAt    DateTime? @map("read_at") @db.Timestamptz(6)
  createdAt DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt DateTime  @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)

  // Relations
  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)

  // Indexes
  @@index([userId, readAt], map: "idx_notifications_user_read")
  @@index([userId, createdAt(sort: Desc)], map: "idx_notifications_user_created")
  @@index([tenantId, userId, createdAt(sort: Desc)], map: "idx_notifications_tenant_user_created")
  @@map("notifications")
}

// -----------------------------------------------------------------------------
// NotificationPreference
// -----------------------------------------------------------------------------
// Migration: 000035
//
// Per-user notification settings (getOrCreate with defaults).
// Trigger: update_updated_at_column() auto-sets updated_at on UPDATE
model NotificationPreference {
  id               String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId         String   @map("tenant_id") @db.Uuid
  userId           String   @map("user_id") @db.Uuid
  approvalsEnabled Boolean  @default(true) @map("approvals_enabled")
  errorsEnabled    Boolean  @default(true) @map("errors_enabled")
  remindersEnabled Boolean  @default(true) @map("reminders_enabled")
  systemEnabled    Boolean  @default(true) @map("system_enabled")
  createdAt        DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt        DateTime @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)

  // Relations
  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)

  // Indexes
  @@unique([tenantId, userId], map: "notification_preferences_tenant_id_user_id_key")
  @@map("notification_preferences")
}
```

#### 2. Add Reverse Relations on User Model
**File**: `apps/web/prisma/schema.prisma` (User model, around line 54)
**Changes**: Add these lines after `userTenants UserTenant[]`:

```prisma
  auditLogs               AuditLog[]
  notifications           Notification[]
  notificationPreferences NotificationPreference[]
```

#### 3. Add Reverse Relations on Tenant Model
**File**: `apps/web/prisma/schema.prisma` (Tenant model, around line 129)
**Changes**: Add these lines before the Indexes section:

```prisma
  systemSettings          SystemSetting[]
  auditLogs               AuditLog[]       // Note: no FK constraint in DB, but Prisma needs the relation
  notifications           Notification[]
  notificationPreferences NotificationPreference[]
```

**IMPORTANT NOTE on AuditLog tenant relation**: The `audit_logs` table has `tenant_id UUID NOT NULL` but **no foreign key constraint** to tenants. Prisma will generate a relation field but will not enforce it at the schema level. If `prisma db pull` or validation complains, we may need to omit the `tenant` relation on `AuditLog` and keep `tenantId` as a bare field without `@relation`. We should test this during implementation and remove the relation if needed.

### Success Criteria:

#### Automated Verification:
- [x] `cd /home/tolga/projects/terp/apps/web && npx prisma generate` succeeds without errors
- [x] `cd /home/tolga/projects/terp/apps/web && npx prisma validate` succeeds
- [x] TypeScript types for `SystemSetting`, `AuditLog`, `Notification`, `NotificationPreference` are available in `@/generated/prisma/client`
- [x] Existing tests still pass: `cd /home/tolga/projects/terp/apps/web && npx vitest run`

#### Manual Verification:
- [ ] Confirm `prisma studio` can browse the four new tables

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: tRPC systemSettings Router

### Overview
Create the system settings tRPC router with singleton get/update and cleanup mutations. This is the most complex router due to the cleanup operations that touch tables without Prisma models.

### Changes Required:

#### 1. System Settings Router
**File**: `apps/web/src/server/routers/systemSettings.ts` (NEW)
**Changes**: Create router following tariffs pattern.

**Structure**:
```typescript
import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { createTRPCRouter, tenantProcedure } from "../trpc"
import { requirePermission } from "../middleware/authorization"
import { permissionIdByKey } from "../lib/permission-catalog"

const SETTINGS_MANAGE = permissionIdByKey("settings.manage")!
```

**Procedures**:

1. **`systemSettings.get`** (query)
   - `tenantProcedure` + `requirePermission(SETTINGS_MANAGE)`
   - Uses `prisma.systemSetting.findUnique({ where: { tenantId } })`
   - If not found, creates with defaults via `prisma.systemSetting.create()`
   - Output schema: all SystemSetting fields (excluding `proxyPassword`)
   - Maps to output with `proxyPassword` omitted (matches Go `json:"-"` behavior)

2. **`systemSettings.update`** (mutation)
   - `tenantProcedure` + `requirePermission(SETTINGS_MANAGE)`
   - Input: all fields optional (partial update like Go `UpdateSystemSettingsInput`)
   - Validation: `birthdayWindowDaysBefore/After` 0-90, `serverAliveExpectedCompletionTime` 0-1439, `serverAliveThresholdMinutes` > 0
   - Uses getOrCreate pattern then `prisma.systemSetting.update()`
   - Output: updated settings (excluding `proxyPassword`)

3. **`systemSettings.cleanupDeleteBookings`** (mutation)
   - Input: `{ dateFrom: string (ISO date), dateTo: string (ISO date), employeeIds?: string[], confirm: boolean }`
   - Validation: dateFrom <= dateTo, range <= 366 days
   - Preview mode (`confirm: false`): count via raw SQL `SELECT COUNT(*) FROM bookings WHERE tenant_id = $1 AND booking_date BETWEEN $2 AND $3 [AND employee_id = ANY($4)]`
   - Execute mode (`confirm: true`): delete via raw SQL `DELETE FROM bookings WHERE ...`
   - Output: `{ operation: string, affectedCount: number, preview: boolean, details?: Record<string, unknown> }`

4. **`systemSettings.cleanupDeleteBookingData`** (mutation)
   - Same input as cleanupDeleteBookings
   - Preview: count bookings + daily_values
   - Execute: delete bookings + daily_values + employee_day_plans
   - Uses raw SQL for all three tables

5. **`systemSettings.cleanupReReadBookings`** (mutation)
   - Same date range input
   - Preview: count bookings
   - Execute: This triggers recalculation. Since the recalc service is a Go concept not yet ported, the initial implementation will return a NOT_IMPLEMENTED error or count only. The recalc service port is a separate ticket.
   - **Decision**: For now, implement preview mode only. Execute mode throws `TRPCError({ code: "PRECONDITION_FAILED", message: "Recalculation service not yet available" })`.

6. **`systemSettings.cleanupMarkDeleteOrders`** (mutation)
   - Input: `{ orderIds: string[], confirm: boolean }`
   - Validation: at least one order ID required
   - Preview: `prisma.order.count({ where: { id: { in: orderIds }, tenantId } })`
   - Execute: `prisma.order.deleteMany({ where: { id: { in: orderIds }, tenantId } })`
   - Output: same cleanup result schema

**Output schema** (shared for settings):
```typescript
const systemSettingsOutputSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  roundingRelativeToPlan: z.boolean(),
  errorListEnabled: z.boolean(),
  trackedErrorCodes: z.array(z.string()),
  autoFillOrderEndBookings: z.boolean(),
  birthdayWindowDaysBefore: z.number(),
  birthdayWindowDaysAfter: z.number(),
  followUpEntriesEnabled: z.boolean(),
  proxyHost: z.string().nullable(),
  proxyPort: z.number().nullable(),
  proxyUsername: z.string().nullable(),
  proxyEnabled: z.boolean(),
  serverAliveEnabled: z.boolean(),
  serverAliveExpectedCompletionTime: z.number().nullable(),
  serverAliveThresholdMinutes: z.number().nullable(),
  serverAliveNotifyAdmins: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
})
```

**Cleanup result schema** (shared):
```typescript
const cleanupResultSchema = z.object({
  operation: z.string(),
  affectedCount: z.number(),
  preview: z.boolean(),
  details: z.record(z.unknown()).optional(),
})
```

**Helper**: `getOrCreateSettings(prisma, tenantId)` function that implements the singleton pattern:
```typescript
async function getOrCreateSettings(prisma: PrismaClient, tenantId: string) {
  const existing = await prisma.systemSetting.findUnique({
    where: { tenantId }
  })
  if (existing) return existing

  // Create with defaults
  return prisma.systemSetting.create({
    data: { tenantId }  // all defaults come from Prisma schema
  })
}
```

Note: The `findUnique` on `tenantId` requires the `@@unique([tenantId])` constraint which we add in Phase 1.

#### 2. Register in Root Router
**File**: `apps/web/src/server/root.ts`
**Changes**:
- Add import: `import { systemSettingsRouter } from "./routers/systemSettings"`
- Add to `createTRPCRouter({})`: `systemSettings: systemSettingsRouter,`

### Success Criteria:

#### Automated Verification:
- [x] TypeScript compiles without errors: `cd /home/tolga/projects/terp/apps/web && npx tsc --noEmit`
- [x] Existing tests still pass: `cd /home/tolga/projects/terp/apps/web && npx vitest run`

#### Manual Verification:
- [ ] Using tRPC playground or curl, `systemSettings.get` returns settings for a tenant
- [ ] `systemSettings.update` modifies settings and returns updated values
- [ ] `systemSettings.cleanupMarkDeleteOrders` preview returns count, execute deletes

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation.

---

## Phase 3: tRPC auditLogs Router

### Overview
Create the read-only audit logs tRPC router with list (paginated with filters) and getById procedures.

### Changes Required:

#### 1. Audit Logs Router
**File**: `apps/web/src/server/routers/auditLogs.ts` (NEW)
**Changes**: Create router following the established pattern.

**Structure**:
```typescript
import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { createTRPCRouter, tenantProcedure } from "../trpc"
import { requirePermission } from "../middleware/authorization"
import { permissionIdByKey } from "../lib/permission-catalog"

const USERS_MANAGE = permissionIdByKey("users.manage")!
```

**Procedures**:

1. **`auditLogs.list`** (query)
   - `tenantProcedure` + `requirePermission(USERS_MANAGE)` (matches Go behavior)
   - Input schema:
     ```typescript
     z.object({
       page: z.number().int().min(1).optional().default(1),
       pageSize: z.number().int().min(1).max(100).optional().default(20),
       userId: z.string().uuid().optional(),
       entityType: z.string().optional(),
       entityId: z.string().uuid().optional(),
       action: z.string().optional(),
       fromDate: z.string().datetime().optional(),
       toDate: z.string().datetime().optional(),
     }).optional()
     ```
   - Builds `where` clause dynamically based on filters (tenantId always required)
   - Uses `prisma.auditLog.findMany()` with `skip`/`take` for pagination, `orderBy: { performedAt: "desc" }`
   - Includes `user` relation (select: id, email, displayName)
   - Returns `{ items: AuditLog[], total: number }`

2. **`auditLogs.getById`** (query)
   - `tenantProcedure` + `requirePermission(USERS_MANAGE)`
   - Input: `z.object({ id: z.string().uuid() })`
   - Uses `prisma.auditLog.findFirst({ where: { id, tenantId }, include: { user: ... } })`
   - Throws NOT_FOUND if missing
   - Returns full audit log with user info

**Output schemas**:
```typescript
const auditLogUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string(),
  displayName: z.string(),
}).nullable()

const auditLogOutputSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  userId: z.string().uuid().nullable(),
  action: z.string(),
  entityType: z.string(),
  entityId: z.string().uuid(),
  entityName: z.string().nullable(),
  changes: z.unknown().nullable(),
  metadata: z.unknown().nullable(),
  ipAddress: z.string().nullable(),
  userAgent: z.string().nullable(),
  performedAt: z.date(),
  user: auditLogUserSchema.optional(),
})
```

#### 2. Register in Root Router
**File**: `apps/web/src/server/root.ts`
**Changes**:
- Add import: `import { auditLogsRouter } from "./routers/auditLogs"`
- Add to `createTRPCRouter({})`: `auditLogs: auditLogsRouter,`

### Success Criteria:

#### Automated Verification:
- [x] TypeScript compiles without errors: `cd /home/tolga/projects/terp/apps/web && npx tsc --noEmit`
- [x] Existing tests still pass: `cd /home/tolga/projects/terp/apps/web && npx vitest run`

#### Manual Verification:
- [ ] `auditLogs.list` returns paginated results with user info
- [ ] `auditLogs.list` filters work (by userId, entityType, action, date range)
- [ ] `auditLogs.getById` returns full audit log detail

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation.

---

## Phase 4: tRPC notifications Router

### Overview
Create the notifications tRPC router with list, markRead, markAllRead, preferences, and updatePreferences procedures.

### Changes Required:

#### 1. Notifications Router
**File**: `apps/web/src/server/routers/notifications.ts` (NEW)
**Changes**: Create router.

**Design decision**: Use `tenantProcedure` (not `protectedProcedure`) because the Go code requires both tenant ID and user ID for all notification queries. User-scoped filtering uses `ctx.user.id`.

**Structure**:
```typescript
import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { createTRPCRouter, tenantProcedure } from "../trpc"

// No permission middleware -- notifications are user-scoped (any authenticated user can manage their own)
// The Go code uses notifications.manage permission on the route, but since all
// notification operations are self-scoped (user can only see/manage their own),
// we don't require an additional permission beyond authentication + tenant access.
```

**Procedures**:

1. **`notifications.list`** (query)
   - `tenantProcedure` (no additional permission -- user-scoped)
   - Input:
     ```typescript
     z.object({
       page: z.number().int().min(1).optional().default(1),
       pageSize: z.number().int().min(1).max(100).optional().default(20),
       type: z.enum(["approvals", "errors", "reminders", "system"]).optional(),
       unread: z.boolean().optional(),
       fromDate: z.string().datetime().optional(),
       toDate: z.string().datetime().optional(),
     }).optional()
     ```
   - Where clause: `tenantId` + `userId: ctx.user.id` + optional filters
   - `unread: true` -> `readAt: null`; `unread: false` -> `readAt: { not: null }`
   - Parallel queries: `findMany` (with skip/take, orderBy createdAt desc) + `count` (total) + `count` (where readAt is null, for unreadCount)
   - Output: `{ items: Notification[], total: number, unreadCount: number }`

2. **`notifications.markRead`** (mutation)
   - `tenantProcedure`
   - Input: `z.object({ id: z.string().uuid() })`
   - Verify notification exists with `tenantId` + `userId: ctx.user.id` + `id`
   - Update: `prisma.notification.update({ where: { id }, data: { readAt: new Date() } })`
   - Output: `{ success: boolean }`

3. **`notifications.markAllRead`** (mutation)
   - `tenantProcedure`
   - No input required
   - `prisma.notification.updateMany({ where: { tenantId, userId: ctx.user.id, readAt: null }, data: { readAt: new Date() } })`
   - Output: `{ success: boolean, count: number }`

4. **`notifications.preferences`** (query)
   - `tenantProcedure`
   - getOrCreate pattern: find by `tenantId` + `userId`, create with defaults if not found
   - Output: NotificationPreference fields

5. **`notifications.updatePreferences`** (mutation)
   - `tenantProcedure`
   - Input:
     ```typescript
     z.object({
       approvalsEnabled: z.boolean().optional(),
       errorsEnabled: z.boolean().optional(),
       remindersEnabled: z.boolean().optional(),
       systemEnabled: z.boolean().optional(),
     })
     ```
   - Uses `prisma.notificationPreference.upsert()` with `tenantId` + `userId` as unique key
   - Output: updated preferences

**Output schemas**:
```typescript
const notificationOutputSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  userId: z.string().uuid(),
  type: z.string(),
  title: z.string(),
  message: z.string(),
  link: z.string().nullable(),
  readAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

const notificationPreferencesOutputSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  userId: z.string().uuid(),
  approvalsEnabled: z.boolean(),
  errorsEnabled: z.boolean(),
  remindersEnabled: z.boolean(),
  systemEnabled: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
})
```

#### 2. Register in Root Router
**File**: `apps/web/src/server/root.ts`
**Changes**:
- Add import: `import { notificationsRouter } from "./routers/notifications"`
- Add to `createTRPCRouter({})`: `notifications: notificationsRouter,`

### Success Criteria:

#### Automated Verification:
- [x] TypeScript compiles without errors: `cd /home/tolga/projects/terp/apps/web && npx tsc --noEmit`
- [x] Existing tests still pass: `cd /home/tolga/projects/terp/apps/web && npx vitest run`

#### Manual Verification:
- [ ] `notifications.list` returns user-scoped notifications with unreadCount
- [ ] `notifications.markRead` sets readAt timestamp
- [ ] `notifications.markAllRead` marks all unread as read
- [ ] `notifications.preferences` returns defaults on first call
- [ ] `notifications.updatePreferences` persists changes

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation.

---

## Phase 5: Frontend Hooks Migration

### Overview
Replace REST-based hooks with tRPC-based hooks following the pattern from `use-tariffs.ts`.

### Changes Required:

#### 1. System Settings Hooks
**File**: `apps/web/src/hooks/api/use-system-settings.ts` (REWRITE)
**Changes**: Replace all hooks with tRPC versions.

```typescript
import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

export function useSystemSettings(enabled = true) {
  const trpc = useTRPC()
  return useQuery(trpc.systemSettings.get.queryOptions(undefined, { enabled }))
}

export function useUpdateSystemSettings() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.systemSettings.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.systemSettings.get.queryKey() })
    },
  })
}

export function useCleanupDeleteBookings() {
  const trpc = useTRPC()
  return useMutation(trpc.systemSettings.cleanupDeleteBookings.mutationOptions())
}

export function useCleanupDeleteBookingData() {
  const trpc = useTRPC()
  return useMutation(trpc.systemSettings.cleanupDeleteBookingData.mutationOptions())
}

export function useCleanupReReadBookings() {
  const trpc = useTRPC()
  return useMutation(trpc.systemSettings.cleanupReReadBookings.mutationOptions())
}

export function useCleanupMarkDeleteOrders() {
  const trpc = useTRPC()
  return useMutation(trpc.systemSettings.cleanupMarkDeleteOrders.mutationOptions())
}
```

#### 2. Audit Logs Hooks
**File**: `apps/web/src/hooks/api/use-audit-logs.ts` (REWRITE)
**Changes**: Replace all hooks with tRPC versions.

```typescript
import { useTRPC } from "@/trpc"
import { useQuery } from "@tanstack/react-query"

interface UseAuditLogsOptions {
  userId?: string
  entityType?: string
  entityId?: string
  action?: string
  fromDate?: string
  toDate?: string
  page?: number
  pageSize?: number
  enabled?: boolean
}

export function useAuditLogs(options: UseAuditLogsOptions = {}) {
  const { enabled = true, ...input } = options
  const trpc = useTRPC()
  return useQuery(
    trpc.auditLogs.list.queryOptions(
      Object.keys(input).length > 0 ? input : undefined,
      { enabled }
    )
  )
}

export function useAuditLog(id: string | undefined) {
  const trpc = useTRPC()
  return useQuery(
    trpc.auditLogs.getById.queryOptions(
      { id: id! },
      { enabled: !!id }
    )
  )
}
```

#### 3. Notifications Hooks
**File**: `apps/web/src/hooks/api/use-notifications.ts` (REWRITE)
**Changes**: Replace all hooks with tRPC versions.

```typescript
import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

type NotificationType = "approvals" | "errors" | "reminders" | "system"

interface UseNotificationsOptions {
  type?: NotificationType
  unread?: boolean
  fromDate?: string
  toDate?: string
  page?: number
  pageSize?: number
  enabled?: boolean
}

export function useNotifications(options: UseNotificationsOptions = {}) {
  const { enabled = true, ...input } = options
  const trpc = useTRPC()
  return useQuery(
    trpc.notifications.list.queryOptions(
      Object.keys(input).length > 0 ? input : undefined,
      { enabled }
    )
  )
}

export function useMarkNotificationRead() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.notifications.markRead.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.notifications.list.queryKey() })
    },
  })
}

export function useMarkAllNotificationsRead() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.notifications.markAllRead.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.notifications.list.queryKey() })
    },
  })
}

export function useNotificationPreferences(enabled = true) {
  const trpc = useTRPC()
  return useQuery(trpc.notifications.preferences.queryOptions(undefined, { enabled }))
}

export function useUpdateNotificationPreferences() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.notifications.updatePreferences.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.notifications.preferences.queryKey() })
    },
  })
}
```

#### 4. Hooks Index
**File**: `apps/web/src/hooks/api/index.ts`
**Changes**: The existing exports (lines 90-97 for notifications, 328-342 for audit logs and system settings) already re-export from the correct files. Since we are rewriting the hook files in place with the same export names, no changes to index.ts should be needed. Verify this during implementation.

### Success Criteria:

#### Automated Verification:
- [x] TypeScript compiles without errors: `cd /home/tolga/projects/terp/apps/web && npx tsc --noEmit`
- [x] No import errors in consuming components
- [x] Existing tests still pass: `cd /home/tolga/projects/terp/apps/web && npx vitest run`

#### Manual Verification:
- [ ] System settings page loads and saves correctly
- [ ] Audit log viewer displays paginated, filterable results
- [ ] Notification bell/panel shows notifications with unread count
- [ ] Mark read / mark all read works in the UI
- [ ] Notification preferences save and load correctly

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation.

---

## Phase 6: Tests

### Overview
Write unit tests for all three routers following the tariffs router test pattern using mock Prisma.

### Changes Required:

#### 1. System Settings Router Tests
**File**: `apps/web/src/server/__tests__/systemSettings-router.test.ts` (NEW)

**Test cases**:
- `systemSettings.get` -- returns existing settings
- `systemSettings.get` -- creates defaults when no settings exist
- `systemSettings.update` -- partial update succeeds
- `systemSettings.update` -- validates birthday window range (0-90)
- `systemSettings.update` -- validates server alive time range (0-1439)
- `systemSettings.update` -- validates server alive threshold > 0
- `systemSettings.cleanupMarkDeleteOrders` -- preview returns count
- `systemSettings.cleanupMarkDeleteOrders` -- execute deletes orders
- `systemSettings.cleanupMarkDeleteOrders` -- fails without order IDs
- `systemSettings.cleanupDeleteBookings` -- preview returns count (via raw SQL mock)
- `systemSettings.cleanupDeleteBookings` -- validates date range
- Permission denied test: user without `settings.manage` gets FORBIDDEN

**Pattern** (from `tariffs-router.test.ts`):
```typescript
import { describe, it, expect, vi } from "vitest"
import { createCallerFactory } from "../trpc"
import { systemSettingsRouter } from "../routers/systemSettings"
import { permissionIdByKey } from "../lib/permission-catalog"
import { createMockContext, createMockSession, createUserWithPermissions, createMockUserTenant } from "./helpers"

const SETTINGS_MANAGE = permissionIdByKey("settings.manage")!
const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const USER_ID = "a0000000-0000-4000-a000-000000000001"

const createCaller = createCallerFactory(systemSettingsRouter)

function createTestContext(prisma: Record<string, unknown>) {
  return createMockContext({
    prisma: prisma as unknown as TRPCContext["prisma"],
    authToken: "test-token",
    user: createUserWithPermissions([SETTINGS_MANAGE], {
      userTenants: [createMockUserTenant(USER_ID, TENANT_ID)],
    }),
    session: createMockSession(),
    tenantId: TENANT_ID,
  })
}
```

#### 2. Audit Logs Router Tests
**File**: `apps/web/src/server/__tests__/auditLogs-router.test.ts` (NEW)

**Test cases**:
- `auditLogs.list` -- returns paginated results with total
- `auditLogs.list` -- applies filters (userId, entityType, action, date range)
- `auditLogs.list` -- default page and pageSize
- `auditLogs.getById` -- returns audit log with user
- `auditLogs.getById` -- NOT_FOUND for missing ID
- Permission denied test: user without `users.manage` gets FORBIDDEN

#### 3. Notifications Router Tests
**File**: `apps/web/src/server/__tests__/notifications-router.test.ts` (NEW)

**Test cases**:
- `notifications.list` -- returns user-scoped notifications with total and unreadCount
- `notifications.list` -- filters by type and unread status
- `notifications.markRead` -- sets readAt on notification
- `notifications.markRead` -- NOT_FOUND for wrong user's notification
- `notifications.markAllRead` -- updates all unread to read
- `notifications.preferences` -- returns existing preferences
- `notifications.preferences` -- creates defaults when none exist
- `notifications.updatePreferences` -- upserts preferences
- Authentication test: unauthenticated request gets UNAUTHORIZED

### Success Criteria:

#### Automated Verification:
- [x] All new tests pass: `cd /home/tolga/projects/terp/apps/web && npx vitest run src/server/__tests__/systemSettings-router.test.ts`
- [x] All new tests pass: `cd /home/tolga/projects/terp/apps/web && npx vitest run src/server/__tests__/auditLogs-router.test.ts`
- [x] All new tests pass: `cd /home/tolga/projects/terp/apps/web && npx vitest run src/server/__tests__/notifications-router.test.ts`
- [x] Full test suite passes: `cd /home/tolga/projects/terp/apps/web && npx vitest run`

#### Manual Verification:
- [ ] Review test coverage -- all major code paths tested
- [ ] Confirm mock patterns are consistent with existing test files

**Implementation Note**: After completing this phase and all automated verification passes, the ticket is complete.

---

## Testing Strategy

### Unit Tests (Phase 6):
- Mock Prisma client with `vi.fn()` for each model method
- Test each procedure independently via `createCallerFactory`
- Cover: happy path, validation errors, NOT_FOUND, permission denied
- For raw SQL cleanup operations, mock `prisma.$queryRaw` and `prisma.$executeRaw`

### Key Edge Cases:
- System settings singleton: concurrent getOrCreate (handled by DB unique constraint)
- Audit log JSONB fields: null vs empty object
- Notification unread count: parallel count query accuracy
- Cleanup date range validation: boundary values (exactly 366 days)
- Notification markRead: user can only mark their own notifications

### Manual Testing Steps:
1. Navigate to System Settings page, verify settings load
2. Change a setting, save, refresh -- verify persistence
3. Open Audit Log viewer, verify entries appear with user names
4. Filter audit logs by entity type and date range
5. Click a notification, verify markRead updates the UI
6. Click "Mark All Read", verify all notifications update
7. Open notification preferences, toggle a setting, save, reload

## Performance Considerations

- **Audit logs pagination**: The `auditLogs.list` query runs a `COUNT(*)` alongside `findMany`. For large audit_logs tables, this could be slow. The existing indexes (`idx_audit_logs_tenant`, `idx_audit_logs_performed_at`) should handle this. If performance is an issue, consider cursor-based pagination later.
- **Notification unread count**: Running three queries in parallel (`findMany`, `count` total, `count` unread) is acceptable for normal load. Could optimize with a single aggregation query if needed.
- **System settings singleton**: The getOrCreate pattern with upsert is safe for concurrent access.

## Migration Notes

- No new SQL migrations needed -- all tables exist.
- Prisma schema is read-only (no `prisma db push`). We only add model definitions.
- Frontend hooks maintain the same export names, so consuming components need no changes.
- The `AuditLog` tenant relation may need adjustment if Prisma validation fails due to missing FK constraint. Fallback: omit the `tenant` relation field, keep `tenantId` as a bare column.

## References

- Original ticket: `thoughts/shared/tickets/ZMI-TICKET-221-systemsettings-auditlogs-notifications.md`
- Research document: `thoughts/shared/research/2026-03-06-ZMI-TICKET-221-systemsettings-auditlogs-notifications.md`
- Reference tRPC router: `apps/web/src/server/routers/tariffs.ts`
- Reference tRPC test: `apps/web/src/server/__tests__/tariffs-router.test.ts`
- Reference tRPC hooks: `apps/web/src/hooks/api/use-tariffs.ts`
- Prisma schema: `apps/web/prisma/schema.prisma`
- Root router: `apps/web/src/server/root.ts`
- Permission catalog: `apps/web/src/server/lib/permission-catalog.ts`
- Go system settings service: `apps/api/internal/service/systemsettings.go`
- Go audit log service: `apps/api/internal/service/auditlog.go`
- Go notification service: `apps/api/internal/service/notification.go`
- Go system settings model: `apps/api/internal/model/systemsettings.go`
- Go notification model: `apps/api/internal/model/notification.go`
- Go audit log model: `apps/api/internal/model/auditlog.go`
- DB migration (system_settings): `db/migrations/000067_create_system_settings.up.sql`
- DB migration (audit_logs): `db/migrations/000040_create_audit_logs.up.sql`
- DB migration (notifications): `db/migrations/000035_create_notifications.up.sql`
