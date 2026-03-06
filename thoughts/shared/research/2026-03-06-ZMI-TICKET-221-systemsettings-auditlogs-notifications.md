# Research: ZMI-TICKET-221 -- System Settings + Audit Logs + Notifications CRUD

**Date:** 2026-03-06
**Ticket:** ZMI-TICKET-221
**Status:** Research Complete

---

## 1. Existing Go Code

### 1.1 System Settings

#### Model (`apps/api/internal/model/systemsettings.go`, 69 lines)
- `SystemSettings` struct with GORM tags
- Table: `system_settings` (singleton per tenant via unique index on `tenant_id`)
- Fields: `ID`, `TenantID`, `RoundingRelativeToPlan`, `ErrorListEnabled`, `TrackedErrorCodes` (pq.StringArray), `AutoFillOrderEndBookings`, `BirthdayWindowDaysBefore`, `BirthdayWindowDaysAfter`, `FollowUpEntriesEnabled`, `ProxyHost/Port/Username/Password/Enabled`, `ServerAliveEnabled/ExpectedCompletionTime/ThresholdMinutes/NotifyAdmins`, `CreatedAt`, `UpdatedAt`
- `ProxyPassword` has `json:"-"` (never serialized)
- `DefaultSettings(tenantID)` factory function returns defaults

#### Repository (`apps/api/internal/repository/systemsettings.go`, 76 lines)
- Methods: `GetByTenantID`, `Create`, `Update`, `GetOrCreate`
- `GetOrCreate` handles race condition: if create fails, tries GetByTenantID again
- Uses `*DB` wrapper with `db.GORM.WithContext(ctx)`

#### Service (`apps/api/internal/service/systemsettings.go`, 394 lines)
- `SystemSettingsService` depends on:
  - `systemSettingsRepository` interface
  - `systemSettingsBookingRepo` interface (DeleteByDateRange, CountByDateRange)
  - `systemSettingsDailyValueRepo` interface (DeleteByDateRange, CountByDateRange)
  - `systemSettingsEDPRepo` interface (DeleteByDateRange)
  - `systemSettingsOrderRepo` interface (BulkDelete, CountByIDs)
  - `systemSettingsRecalcService` interface (TriggerRecalcAll, TriggerRecalcBatch)
- `SystemSettingsLookup` interface with `IsRoundingRelativeToPlan` method (used by daily calc)
- `UpdateSystemSettingsInput` struct with all-optional pointer fields
- Validation: birthday window 0-90, server alive time 0-1439, threshold > 0
- Cleanup operations:
  - `DeleteBookings(tenantID, CleanupDateRangeInput)` -- preview (count) or execute (delete)
  - `DeleteBookingData(tenantID, CleanupDateRangeInput)` -- deletes bookings + daily values + EDPs
  - `ReReadBookings(tenantID, CleanupDateRangeInput)` -- triggers recalc all or batch
  - `MarkDeleteOrders(tenantID, CleanupOrdersInput)` -- deletes orders by IDs
- `CleanupDateRangeInput`: DateFrom, DateTo, EmployeeIDs, Confirm (preview vs execute)
- `CleanupOrdersInput`: OrderIDs, Confirm
- `CleanupResult`: Operation, AffectedCount, Preview, Details (map[string]any)
- `validateDateRange`: from <= to, range <= 366 days

#### Handler (`apps/api/internal/handler/systemsettings.go`, 421 lines)
- `SystemSettingsHandler` with `svc` and optional `auditService`
- Endpoints:
  - `GetSettings` (GET /system-settings)
  - `UpdateSettings` (PUT /system-settings) -- writes audit log on success
  - `CleanupDeleteBookings` (POST /system-settings/cleanup/delete-bookings) -- audit on confirmed
  - `CleanupDeleteBookingData` (POST /system-settings/cleanup/delete-booking-data) -- audit on confirmed
  - `CleanupReReadBookings` (POST /system-settings/cleanup/re-read-bookings) -- audit on confirmed
  - `CleanupMarkDeleteOrders` (POST /system-settings/cleanup/mark-delete-orders) -- audit on confirmed
- Uses generated models: `models.UpdateSystemSettingsRequest`, `models.CleanupDeleteBookingsRequest`, etc.
- Maps model to `models.SystemSettings` response via `mapSystemSettingsToResponse`
- Maps cleanup result to `models.CleanupResult` via `mapCleanupResult`

#### Route Registration (`apps/api/internal/handler/routes.go`, lines 1209-1231)
- Permission: `permissions.ID("system_settings.manage")` -- NOTE: this key is NOT in the Go permission catalog. The catalog has `settings.manage` (line 64). The route uses `system_settings.manage` which generates a different UUID. This appears to be a bug/inconsistency in the Go code.
- Routes: GET /, PUT /, POST /cleanup/* (all under /system-settings)

### 1.2 Audit Logs

#### Model (`apps/api/internal/model/auditlog.go`, 48 lines)
- `AuditAction` string type with constants: create, update, delete, approve, reject, close, reopen, export, import, login, logout, cleanup
- `AuditLog` struct: `ID`, `TenantID`, `UserID` (*uuid.UUID, optional), `Action`, `EntityType`, `EntityID`, `EntityName`, `Changes` (datatypes.JSON), `Metadata` (datatypes.JSON), `IPAddress`, `UserAgent`, `PerformedAt`
- Has `User *User` relation via `foreignKey:UserID`
- Table: `audit_logs`

#### Repository (`apps/api/internal/repository/auditlog.go`, 118 lines)
- `AuditLogFilter` struct: TenantID, UserID*, EntityType*, EntityTypes[], EntityID*, Action*, Actions[], DepartmentID*, From*, To*, Limit, Offset, Cursor*
- Methods: `Create`, `GetByID` (with User preload), `List` (with User preload, filters, count, pagination)
- Ordering: `performed_at DESC`
- Cursor-based pagination: `WHERE id > cursor`
- Offset/limit pagination also supported

#### Service (`apps/api/internal/service/auditlog.go`, 88 lines)
- `AuditLogService` with `repo *repository.AuditLogRepository`
- `LogEntry` struct: TenantID, Action, EntityType, EntityID, EntityName, Changes, Metadata
- `Log(ctx, http.Request, LogEntry)` -- fire-and-forget (errors swallowed), extracts user from context, IP/UA from request, marshals changes/metadata to JSON
- `List(ctx, filter)` and `GetByID(ctx, id)` are thin wrappers

#### Handler (`apps/api/internal/handler/auditlog.go`, 183 lines)
- `AuditLogHandler` with `auditService`
- `List` (GET /audit-logs) -- parses query params: limit, user_id, entity_type, entity_id, action, from, to, cursor
- `GetByID` (GET /audit-logs/{id})
- Maps to `models.AuditLog` and `models.AuditLogList` responses

#### Route Registration (`apps/api/internal/handler/routes.go`, lines 602-615)
- Permission: `permissions.ID("users.manage")`
- Routes: GET / and GET /{id} (under /audit-logs)

### 1.3 Notifications

#### Model (`apps/api/internal/model/notification.go`, 68 lines)
- `NotificationType` string: approvals, errors, reminders, system
- `Notification`: ID, TenantID, UserID, Type, Title, Message, Link*, ReadAt*, CreatedAt, UpdatedAt
- `NotificationPreferences`: ID, TenantID, UserID, ApprovalsEnabled, ErrorsEnabled, RemindersEnabled, SystemEnabled, CreatedAt, UpdatedAt
  - `AllowsType(NotificationType)` method
- Tables: `notifications`, `notification_preferences`

#### Repository (`apps/api/internal/repository/notification.go`, 172 lines)
- `NotificationRepository`:
  - `Create`, `List` (with filter: tenant+user, type, unread, from/to, limit/offset, count), `MarkRead`, `MarkAllRead`, `CountUnread`
- `NotificationPreferencesRepository`:
  - `GetByUser`, `Upsert` (FirstOrCreate with Assign)
- Error sentinels: `ErrNotificationNotFound`, `ErrNotificationPreferencesNotFound`

#### Service (`apps/api/internal/service/notification.go`, 330 lines)
- `NotificationService` depends on: notificationRepo, preferencesRepo, userRepo, employeeRepo, streamHub
- Methods:
  - `ListForUser(ctx, tenantID, userID, params)` -- returns notifications, total, unreadCount
  - `Create(ctx, input)` -- checks preferences, creates notification, publishes stream event
  - `CreateForTenantAdmins(ctx, tenantID, input)` -- creates for all admin users
  - `CreateForScopedAdmins(ctx, tenantID, employeeID, permissionID, input)` -- checks user group permissions + data scope
  - `CreateForEmployee(ctx, tenantID, employeeID, input)` -- creates for user linked to employee
  - `MarkRead(ctx, tenantID, userID, notificationID)` -- publishes stream event
  - `MarkAllRead(ctx, tenantID, userID)` -- publishes stream event
  - `GetPreferences(ctx, tenantID, userID)` -- getOrCreate defaults
  - `UpdatePreferences(ctx, tenantID, userID, prefs)`
- `NotificationListParams`: Type*, Unread*, From*, To*, Limit, Offset
- `CreateNotificationInput`: TenantID, UserID, Type, Title, Message, Link*
- Default preferences: all enabled (approvals, errors, reminders, system)

#### Stream Hub (`apps/api/internal/service/notification_stream.go`, 82 lines)
- SSE pub/sub per user ID
- `NotificationStreamEvent`: Event string, Data []byte
- `NotificationStreamClient`: Events channel (buffered 16)
- `Subscribe`, `Unsubscribe`, `Publish` methods
- NOTE: Out of scope for this ticket (SSE streaming deferred to TICKET-230)

#### Handler (`apps/api/internal/handler/notification.go`, 361 lines)
- Endpoints:
  - `List` (GET /notifications) -- parses type, unread, from, to, limit, offset
  - `MarkRead` (POST /notifications/{id}/read)
  - `MarkAllRead` (POST /notifications/read-all)
  - `GetPreferences` (GET /notification-preferences)
  - `UpdatePreferences` (PUT /notification-preferences)
  - `Stream` (GET /notifications/stream) -- SSE, out of scope
- Maps to `models.Notification`, `models.NotificationList`, `models.NotificationPreferences`

#### Route Registration (`apps/api/internal/handler/routes.go`, lines 617-642)
- Permission: `permissions.ID("notifications.manage")`
- Routes: /notifications (GET, POST /read-all, POST /{id}/read) + /notification-preferences (GET, PUT)
- SSE stream registered separately to avoid chi Timeout middleware

#### Tests (`apps/api/internal/service/notification_test.go`, 251 lines)
- Integration tests using `testutil.SetupTestDB` with transaction rollback
- Tests `CreateForScopedAdmins` with various scenarios (admin group, permission group, matching/different department, no permission, no user group, mixed users)
- Setup helpers: `setupNotificationTestData`, `createUserGroupWithPermissions`, `createUserInGroup`, `newNotificationService`

---

## 2. Database Schema

### 2.1 system_settings (`db/migrations/000067_create_system_settings.up.sql`)
```sql
CREATE TABLE system_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    rounding_relative_to_plan BOOLEAN NOT NULL DEFAULT false,
    error_list_enabled BOOLEAN NOT NULL DEFAULT true,
    tracked_error_codes TEXT[] DEFAULT '{}',
    auto_fill_order_end_bookings BOOLEAN NOT NULL DEFAULT false,
    birthday_window_days_before INT NOT NULL DEFAULT 7,
    birthday_window_days_after INT NOT NULL DEFAULT 7,
    follow_up_entries_enabled BOOLEAN NOT NULL DEFAULT false,
    proxy_host VARCHAR(255),
    proxy_port INT,
    proxy_username VARCHAR(255),
    proxy_password VARCHAR(255),
    proxy_enabled BOOLEAN NOT NULL DEFAULT false,
    server_alive_enabled BOOLEAN NOT NULL DEFAULT false,
    server_alive_expected_completion_time INT,
    server_alive_threshold_minutes INT DEFAULT 30,
    server_alive_notify_admins BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id)
);
```
- Has `update_updated_at_column()` trigger
- Has index on `tenant_id`

### 2.2 audit_logs (`db/migrations/000040_create_audit_logs.up.sql`)
```sql
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(20) NOT NULL,
    entity_type VARCHAR(100) NOT NULL,
    entity_id UUID NOT NULL,
    entity_name TEXT,
    changes JSONB,
    metadata JSONB,
    ip_address TEXT,
    user_agent TEXT,
    performed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```
- Indexes: tenant, user, (entity_type, entity_id), action, performed_at
- NOTE: `tenant_id` has NO foreign key constraint (unlike system_settings)

### 2.3 notifications + notification_preferences (`db/migrations/000035_create_notifications.up.sql`)
```sql
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(20) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    link TEXT,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE notification_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    approvals_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    errors_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    reminders_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    system_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (tenant_id, user_id)
);
```
- Has `update_updated_at_column()` triggers for both tables
- Indexes: `(user_id, read_at)`, `(user_id, created_at DESC)`, `(tenant_id, user_id, created_at DESC)`

---

## 3. Prisma Schema Status

**File:** `apps/web/prisma/schema.prisma` (1688 lines, ~66 models)

**None of the three domains have Prisma models yet.** The following models need to be added:
- `SystemSetting` (maps to `system_settings` table)
- `AuditLog` (maps to `audit_logs` table)
- `Notification` (maps to `notifications` table)
- `NotificationPreference` (maps to `notification_preferences` table)

---

## 4. Permission Catalog

### Go Permissions (`apps/api/internal/permissions/permissions.go`)
- `settings.manage` (line 64) -- "Manage settings"
- `notifications.manage` (line 58) -- "Manage notifications"
- `users.manage` (line 62) -- "Manage users" (used for audit logs)

### TypeScript Permissions (`apps/web/src/server/lib/permission-catalog.ts`)
- `settings.manage` (line 130) -- "Manage settings"
- `notifications.manage` (line 115) -- "Manage notifications"
- `users.manage` (line 128) -- "Manage users"

### Route Permission Mapping
| Domain | Go Route Permission Key | Catalog Key |
|--------|----------------------|-------------|
| System Settings | `system_settings.manage` | `settings.manage` |
| Audit Logs | `users.manage` | `users.manage` |
| Notifications | `notifications.manage` | `notifications.manage` |

**NOTE:** The Go system settings routes use `system_settings.manage` which does NOT match the catalog entry `settings.manage`. The ticket specifies `requirePermission("system_settings.read")` and `requirePermission("system_settings.write")` which also don't exist. The tRPC implementation should use the existing `settings.manage` permission from the catalog for consistency with the permission system, since admin users bypass permission checks anyway.

The ticket specifies `audit_logs.read` permission which doesn't exist either. The Go code uses `users.manage` for audit log access.

---

## 5. Existing tRPC Router Patterns

### Router Structure (`apps/web/src/server/routers/*.ts`)
35 routers exist. Registered in `apps/web/src/server/root.ts` via `createTRPCRouter({...})`.

### Canonical Pattern (from tariffs, absenceTypes, employees routers):

```typescript
// 1. Imports
import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { createTRPCRouter, tenantProcedure } from "../trpc"
import { requirePermission } from "../middleware/authorization"
import { permissionIdByKey } from "../lib/permission-catalog"

// 2. Permission constants
const PERM = permissionIdByKey("resource.action")!

// 3. Output schemas (Zod)
const outputSchema = z.object({ ... })

// 4. Input schemas (Zod)
const createInputSchema = z.object({ ... })

// 5. Helpers (mapToOutput, etc.)

// 6. Router definition
export const router = createTRPCRouter({
  list: tenantProcedure
    .use(requirePermission(PERM))
    .input(z.object({...}).optional())
    .output(z.object({ data: z.array(outputSchema) }))
    .query(async ({ ctx, input }) => { ... }),
  getById: tenantProcedure
    .use(requirePermission(PERM))
    .input(z.object({ id: z.string().uuid() }))
    .output(outputSchema)
    .query(async ({ ctx, input }) => { ... }),
  create: tenantProcedure
    .use(requirePermission(PERM))
    .input(createInputSchema)
    .output(outputSchema)
    .mutation(async ({ ctx, input }) => { ... }),
  // ...
})
```

### Procedure Types Available (`apps/web/src/server/trpc.ts`)
- `publicProcedure` -- no auth
- `protectedProcedure` -- requires auth (user + session non-null)
- `tenantProcedure` -- requires auth + tenant ID + user has tenant access

### Middleware (`apps/web/src/server/middleware/authorization.ts`)
- `requirePermission(...permissionIds: string[])` -- checks ANY of the permissions (OR logic)
- `requireSelfOrPermission(userIdGetter, permissionId)` -- self-access or permission
- `requireEmployeePermission(employeeIdGetter, ownPerm, allPerm)` -- own vs all
- `applyDataScope()` -- adds DataScope to context

### Context (`TRPCContext`)
- `prisma: PrismaClient`
- `authToken: string | null`
- `user: ContextUser | null`
- `session: Session | null`
- `tenantId: string | null`

After `tenantProcedure`, `user`, `session`, and `tenantId` are all guaranteed non-null.

---

## 6. Existing tRPC Test Patterns

### Test Infrastructure (`apps/web/src/server/__tests__/helpers.ts`)
- `createMockUser(overrides)` -- creates ContextUser
- `createMockSession()` -- creates Session
- `createMockContext(overrides)` -- creates TRPCContext
- `createMockUserGroup(overrides)` -- creates UserGroup
- `createAdminUser(overrides)` -- user with isAdmin group
- `createUserWithPermissions(permissionIds, overrides)` -- user with specific perms
- `createMockTenant(overrides)` -- creates Tenant
- `createMockUserTenant(userId, tenantId, tenant?)` -- creates UserTenant with included tenant

### Test Pattern (from `tariffs-router.test.ts`, 1160 lines)
```typescript
import { createCallerFactory } from "../trpc"
import { routerUnderTest } from "../routers/routerFile"
import { createMockContext, createMockSession, createUserWithPermissions, createMockUserTenant } from "./helpers"
import { permissionIdByKey } from "../lib/permission-catalog"

const PERM = permissionIdByKey("resource.action")!
const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const USER_ID = "a0000000-0000-4000-a000-000000000001"

const createCaller = createCallerFactory(routerUnderTest)

function createTestContext(prisma: Record<string, unknown>) {
  return createMockContext({
    prisma: prisma as unknown as ...,
    authToken: "test-token",
    user: createUserWithPermissions([PERM], {
      userTenants: [createMockUserTenant(USER_ID, TENANT_ID)],
    }),
    session: createMockSession(),
    tenantId: TENANT_ID,
  })
}

// Tests use mock Prisma with vi.fn()
describe("router.procedure", () => {
  it("description", async () => {
    const mockPrisma = {
      model: {
        findMany: vi.fn().mockResolvedValue([...]),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.procedureName(input)
    expect(result...).toBe(...)
    expect(mockPrisma.model.findMany).toHaveBeenCalledWith({...})
  })
})
```

---

## 7. Existing Frontend Hooks (to be replaced)

### `apps/web/src/hooks/api/use-system-settings.ts`
Uses `useApiQuery` / `useApiMutation` (REST fetch pattern):
- `useSystemSettings(enabled?)` -- GET /system-settings
- `useUpdateSystemSettings()` -- PUT /system-settings (invalidates /system-settings)
- `useCleanupDeleteBookings()` -- POST /system-settings/cleanup/delete-bookings
- `useCleanupDeleteBookingData()` -- POST /system-settings/cleanup/delete-booking-data
- `useCleanupReReadBookings()` -- POST /system-settings/cleanup/re-read-bookings
- `useCleanupMarkDeleteOrders()` -- POST /system-settings/cleanup/mark-delete-orders

### `apps/web/src/hooks/api/use-audit-logs.ts`
- `useAuditLogs(options?)` -- GET /audit-logs with filters
- `useAuditLog(id?)` -- GET /audit-logs/{id}

### `apps/web/src/hooks/api/use-notifications.ts`
- `useNotifications(options?)` -- GET /notifications with filters
- `useMarkNotificationRead()` -- POST /notifications/{id}/read (invalidates /notifications)
- `useMarkAllNotificationsRead()` -- POST /notifications/read-all (invalidates /notifications)
- `useNotificationPreferences(enabled?)` -- GET /notification-preferences
- `useUpdateNotificationPreferences()` -- PUT /notification-preferences (invalidates)

### Hook Migration Pattern (from `apps/web/src/hooks/api/use-tariffs.ts`)
tRPC hooks use `useTRPC()` from `@/trpc` + `useQuery`/`useMutation` from `@tanstack/react-query`:
```typescript
import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

export function useEntityList(options = {}) {
  const trpc = useTRPC()
  return useQuery(trpc.router.list.queryOptions(input, { enabled }))
}

export function useCreateEntity() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.router.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.router.list.queryKey() })
    },
  })
}
```

### Hooks Index (`apps/web/src/hooks/api/index.ts`)
Currently exports all three domains' hooks (lines 90-97, 328-342) from the REST-based implementations. These exports will need to be updated to re-export from the new tRPC-based hook files.

---

## 8. Root Router Registration

**File:** `apps/web/src/server/root.ts`

The three new routers need to be:
1. Imported at the top
2. Added to the `createTRPCRouter({...})` call

Current router count: 35 routers registered.

---

## 9. Key Implementation Considerations

### System Settings
- Singleton pattern: one row per tenant, created on first access (GetOrCreate)
- Cleanup operations depend on other repositories (bookings, daily values, employee day plans, orders) and the recalc service
- The cleanup operations use preview/confirm pattern (Confirm=false returns count, Confirm=true executes)
- The ticket says cleanup mutations need `before_date` and `date_range` inputs but the Go code uses `CleanupDateRangeInput` (date_from, date_to, employee_ids, confirm) and `CleanupOrdersInput` (order_ids, confirm)
- `TrackedErrorCodes` is a `TEXT[]` (Postgres array) -- Prisma maps this as `String[]`

### Audit Logs
- Read-only from tRPC perspective (no create/update/delete mutations)
- The `Log()` method is called by other services/handlers internally, not exposed via API
- `Changes` and `Metadata` are JSONB columns
- Has cursor-based AND offset/limit pagination in Go code
- The ticket specifies page-based pagination (page, pageSize) -- different from Go cursor pattern

### Notifications
- User-scoped: notifications belong to a specific user, not just a tenant
- The ticket says `protectedProcedure` for notifications (not tenantProcedure) but the Go code uses tenant+user context
- `Create`, `CreateForTenantAdmins`, `CreateForScopedAdmins`, `CreateForEmployee` are internal service methods (not exposed via API)
- Only listing, marking read, and preferences are exposed via API
- SSE streaming is explicitly out of scope (TICKET-230)
- Preferences use getOrCreate pattern with defaults (all enabled)

### Prisma Schema Gap
- All four tables (system_settings, audit_logs, notifications, notification_preferences) need Prisma models added to `apps/web/prisma/schema.prisma`
- `system_settings.tracked_error_codes` is `TEXT[]` -- use `String[]` in Prisma
- `audit_logs.changes` and `audit_logs.metadata` are `JSONB` -- use `Json?` in Prisma
- `audit_logs` has a relation to `User` via `user_id`
- `notification_preferences` has `UNIQUE(tenant_id, user_id)` -- use `@@unique([tenantId, userId])` in Prisma
- `system_settings` has `UNIQUE(tenant_id)` -- use `@@unique([tenantId])` in Prisma

### Permission Keys to Use in tRPC
| Domain | Ticket Specifies | Recommendation (catalog match) |
|--------|-----------------|-------------------------------|
| systemSettings.get | `system_settings.read` | `settings.manage` |
| systemSettings.update | `system_settings.write` | `settings.manage` |
| systemSettings.cleanup* | `system_settings.write` | `settings.manage` |
| auditLogs.list | `audit_logs.read` | `users.manage` |
| auditLogs.getById | `audit_logs.read` | `users.manage` |
| notifications.list | (protectedProcedure) | `notifications.manage` or protectedProcedure (see Go: uses notifications.manage) |
| notifications.markRead | (protectedProcedure) | Same as list |
| notifications.preferences | (protectedProcedure) | Same as list |

---

## 10. Files Referenced

### Go Source Files (being replaced)
- `/home/tolga/projects/terp/apps/api/internal/model/systemsettings.go`
- `/home/tolga/projects/terp/apps/api/internal/model/auditlog.go`
- `/home/tolga/projects/terp/apps/api/internal/model/notification.go`
- `/home/tolga/projects/terp/apps/api/internal/repository/systemsettings.go`
- `/home/tolga/projects/terp/apps/api/internal/repository/auditlog.go`
- `/home/tolga/projects/terp/apps/api/internal/repository/notification.go`
- `/home/tolga/projects/terp/apps/api/internal/service/systemsettings.go`
- `/home/tolga/projects/terp/apps/api/internal/service/auditlog.go`
- `/home/tolga/projects/terp/apps/api/internal/service/notification.go`
- `/home/tolga/projects/terp/apps/api/internal/service/notification_stream.go`
- `/home/tolga/projects/terp/apps/api/internal/service/notification_test.go`
- `/home/tolga/projects/terp/apps/api/internal/handler/systemsettings.go`
- `/home/tolga/projects/terp/apps/api/internal/handler/auditlog.go`
- `/home/tolga/projects/terp/apps/api/internal/handler/notification.go`
- `/home/tolga/projects/terp/apps/api/internal/handler/routes.go` (lines 602-647, 1209-1231)
- `/home/tolga/projects/terp/apps/api/cmd/server/main.go` (wiring)

### Database Migrations
- `/home/tolga/projects/terp/db/migrations/000067_create_system_settings.up.sql`
- `/home/tolga/projects/terp/db/migrations/000040_create_audit_logs.up.sql`
- `/home/tolga/projects/terp/db/migrations/000035_create_notifications.up.sql`

### tRPC Infrastructure
- `/home/tolga/projects/terp/apps/web/src/server/trpc.ts`
- `/home/tolga/projects/terp/apps/web/src/server/root.ts`
- `/home/tolga/projects/terp/apps/web/src/server/middleware/authorization.ts`
- `/home/tolga/projects/terp/apps/web/src/server/lib/permissions.ts`
- `/home/tolga/projects/terp/apps/web/src/server/lib/permission-catalog.ts`
- `/home/tolga/projects/terp/apps/web/src/server/__tests__/helpers.ts`

### Reference tRPC Routers (pattern examples)
- `/home/tolga/projects/terp/apps/web/src/server/routers/tariffs.ts`
- `/home/tolga/projects/terp/apps/web/src/server/routers/absenceTypes.ts`
- `/home/tolga/projects/terp/apps/web/src/server/routers/employees.ts`

### Reference tRPC Tests
- `/home/tolga/projects/terp/apps/web/src/server/__tests__/tariffs-router.test.ts`

### Frontend Hooks (to be migrated)
- `/home/tolga/projects/terp/apps/web/src/hooks/api/use-system-settings.ts`
- `/home/tolga/projects/terp/apps/web/src/hooks/api/use-audit-logs.ts`
- `/home/tolga/projects/terp/apps/web/src/hooks/api/use-notifications.ts`
- `/home/tolga/projects/terp/apps/web/src/hooks/api/index.ts`

### Reference tRPC Hooks
- `/home/tolga/projects/terp/apps/web/src/hooks/api/use-tariffs.ts`

### Prisma Schema (needs additions)
- `/home/tolga/projects/terp/apps/web/prisma/schema.prisma`
