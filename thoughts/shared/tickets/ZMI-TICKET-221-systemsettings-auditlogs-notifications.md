# ZMI-TICKET-221: System Settings + Audit Logs + Notifications CRUD

Status: Proposed
Priority: P2
Owner: TBD

## Goal
tRPC-Router für System Settings (Singleton-Konfiguration mit Cleanup-Aktionen), Audit Logs (Read-Only) und Notifications (CRUD ohne SSE-Streaming) implementieren.

## Scope
- **In scope:**
  - tRPC `systemSettings` Router (Get + Update + Cleanup-Aktionen)
  - tRPC `auditLogs` Router (List + GetById)
  - tRPC `notifications` Router (CRUD + Mark Read)
  - Frontend-Hooks Migration
- **Out of scope:**
  - Notification SSE Streaming (TICKET-230 — Supabase Realtime)

## Requirements

### tRPC Router: `systemSettings`
- **Procedures:**
  - `systemSettings.get` (query) — Singleton Settings laden
    - Output: `SystemSettings`
    - Middleware: `tenantProcedure` + `requirePermission("system_settings.read")`
  - `systemSettings.update` (mutation)
    - Input: SystemSettings-Felder (JSON-Konfiguration)
    - Output: `SystemSettings`
    - Middleware: `requirePermission("system_settings.write")`
  - `systemSettings.cleanupDeleteBookings` (mutation)
    - Input: `{ before_date }`
    - Middleware: `requirePermission("system_settings.write")`
  - `systemSettings.cleanupDeleteBookingData` (mutation)
    - Input: `{ before_date }`
  - `systemSettings.cleanupReReadBookings` (mutation)
    - Input: `{ date_range }`
  - `systemSettings.cleanupMarkDeleteOrders` (mutation)
    - Input: `{ before_date }`

### tRPC Router: `auditLogs`
- **Procedures:**
  - `auditLogs.list` (query) — Paginated mit Filtern
    - Input: `{ page?, pageSize?, entity_type?, entity_id?, user_id?, action?, from_date?, to_date? }`
    - Output: `{ items: AuditLog[], total: number }`
    - Middleware: `tenantProcedure` + `requirePermission("audit_logs.read")`
  - `auditLogs.getById` (query)
    - Input: `{ id }`
    - Output: `AuditLog` (mit Details/Diff)

### tRPC Router: `notifications`
- **Procedures:**
  - `notifications.list` (query)
    - Input: `{ page?, pageSize?, is_read? }`
    - Output: `{ items: Notification[], total: number, unread_count: number }`
    - Middleware: `protectedProcedure`
  - `notifications.markRead` (mutation)
    - Input: `{ id }`
  - `notifications.markAllRead` (mutation)
  - `notifications.preferences` (query)
    - Output: `NotificationPreferences`
  - `notifications.updatePreferences` (mutation)
    - Input: `NotificationPreferences`

### Frontend Hook Migration
- `apps/web/src/hooks/api/use-system-settings.ts` → `trpc.systemSettings.*`
- `apps/web/src/hooks/api/use-audit-logs.ts` → `trpc.auditLogs.*`
- `apps/web/src/hooks/api/use-notifications.ts` → `trpc.notifications.*`

### Business Logic (aus Go portiert)
- `apps/api/internal/service/systemsettings.go` (394 Zeilen) — Get/Update + Cleanup-Aktionen
- `apps/api/internal/service/auditlog.go` (88 Zeilen) — Log + List
- `apps/api/internal/service/notification.go` (330 Zeilen) — CRUD + Send + Preferences

## Acceptance Criteria
- [ ] SystemSettings Singleton CRUD funktioniert
- [ ] Cleanup-Aktionen werden ausgeführt
- [ ] AuditLogs sind filterbar und paginiert
- [ ] Notifications mit Read-Status-Management
- [ ] Notification Preferences speicherbar
- [ ] Alle Frontend-Hooks nutzen tRPC statt fetch
- [ ] Bestehende Tests portiert

## Tests
- Unit-Test: SystemSettings Update
- Unit-Test: AuditLog Filterung
- Unit-Test: Notification Mark Read / Mark All Read
- Integration-Test: Cleanup-Aktion durchführen
- Integration-Test: Notification Preferences Update

## Dependencies
- ZMI-TICKET-203 (Authorization Middleware)
- ZMI-TICKET-210 (Tenants — tenantProcedure)

## Go-Dateien die ersetzt werden
- `apps/api/internal/service/systemsettings.go` (394 Zeilen)
- `apps/api/internal/handler/systemsettings.go` (421 Zeilen)
- `apps/api/internal/repository/systemsettings.go` (76 Zeilen)
- `apps/api/internal/service/auditlog.go` (88 Zeilen)
- `apps/api/internal/handler/auditlog.go` (183 Zeilen)
- `apps/api/internal/repository/auditlog.go` (118 Zeilen)
- `apps/api/internal/service/notification.go` (330 Zeilen)
- `apps/api/internal/handler/notification.go` (361 Zeilen)
- `apps/api/internal/repository/notification.go` (172 Zeilen)
- `apps/web/src/hooks/api/use-system-settings.ts` (Frontend-Hook)
- `apps/web/src/hooks/api/use-audit-logs.ts` (Frontend-Hook)
- `apps/web/src/hooks/api/use-notifications.ts` (Frontend-Hook)
