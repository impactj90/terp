# ZMI-TICKET-063: Access Control & Terminal UI

Status: Proposed
Priority: P3
Owner: TBD
Backend tickets: ZMI-TICKET-028, ZMI-TICKET-027

## Goal
Provide admin pages for access zone/profile management, employee access assignments, and terminal booking import with status tracking.

## Scope
- In scope: Access zones CRUD, access profiles CRUD, employee access assignments, terminal bookings list, terminal import trigger, import batch status.
- Out of scope: Physical terminal configuration, access control hardware integration, real-time door status.

## Requirements

### Pages & routes
- **New page**: `apps/web/src/app/[locale]/(dashboard)/admin/access-control/page.tsx`
  - Route: `/admin/access-control`
  - Tabs: "Zones", "Profiles", "Assignments"
- **New page**: `apps/web/src/app/[locale]/(dashboard)/admin/terminal-bookings/page.tsx`
  - Route: `/admin/terminal-bookings`
  - Tabs: "Bookings", "Import Batches"

### Components

#### Access Control
- `apps/web/src/components/access-control/access-zone-data-table.tsx`
  - Columns: Code, Name, Sort Order, Active, Actions
- `apps/web/src/components/access-control/access-zone-form-sheet.tsx`
  - Fields: code (unique), name, description, sort_order, active
- `apps/web/src/components/access-control/access-profile-data-table.tsx`
  - Columns: Code, Name, Active, Actions
- `apps/web/src/components/access-control/access-profile-form-sheet.tsx`
  - Fields: code (unique), name, description, active
- `apps/web/src/components/access-control/employee-access-assignment-table.tsx`
  - Columns: Employee, Access Profile, Valid From, Valid To, Active, Actions
  - Filters: employee_id, profile_id
- `apps/web/src/components/access-control/employee-access-assignment-form-dialog.tsx`
  - Fields: employee_id (select), access_profile_id (select), valid_from, valid_to, active

#### Terminal Bookings
- `apps/web/src/components/terminal-bookings/terminal-booking-data-table.tsx`
  - Columns: Timestamp, Employee PIN, Terminal ID, Raw Booking Code, Status (badge: pending/processed/failed/skipped), Matched Employee, Actions
  - Status badges: pending=yellow, processed=green, failed=red, skipped=gray
- `apps/web/src/components/terminal-bookings/terminal-booking-filters.tsx`
  - Date range, terminal_id, employee_id, status filter, import_batch_id
- `apps/web/src/components/terminal-bookings/import-batch-data-table.tsx`
  - Columns: Batch Reference, Status (badge), Total/Processed/Failed/Skipped counts, Started At, Completed At
- `apps/web/src/components/terminal-bookings/trigger-import-dialog.tsx`
  - Dialog to trigger manual terminal import
  - Upload or paste terminal booking data
  - Uses POST `/terminal-bookings/import`
  - Shows import result summary

### API hooks
- `apps/web/src/hooks/api/use-access-control.ts`
  - Zones: `useAccessZones()`, `useCreateAccessZone()`, `useUpdateAccessZone()`, `useDeleteAccessZone()`
  - Profiles: `useAccessProfiles()`, `useCreateAccessProfile()`, `useUpdateAccessProfile()`, `useDeleteAccessProfile()`
  - Assignments: `useEmployeeAccessAssignments()`, `useCreateEmployeeAccessAssignment()`, `useUpdateEmployeeAccessAssignment()`, `useDeleteEmployeeAccessAssignment()`
- `apps/web/src/hooks/api/use-terminal-bookings.ts`
  - `useTerminalBookings(params)` — GET `/terminal-bookings`
  - `useTriggerTerminalImport()` — POST `/terminal-bookings/import`
  - `useImportBatches()` — GET `/import-batches`
  - `useImportBatch(id)` — GET `/import-batches/{id}`

### UI behavior
- Access control: standard CRUD pattern across three tabs
- Terminal bookings: read-only list with filters, import trigger as action button
- Import batch tracking: shows processing status and counts
- Booking code column: display raw code (e.g., "A1", "A2", "P1") with tooltip explanation

### Navigation & translations
- Sidebar entries in "Administration" section:
  - `{ titleKey: 'nav.access-control', href: '/admin/access-control', icon: Shield, roles: ['admin'] }`
  - `{ titleKey: 'nav.terminal-bookings', href: '/admin/terminal-bookings', icon: Terminal, roles: ['admin'] }`
- Translation namespaces: `access-control`, `terminal-bookings`

## Acceptance criteria
- Admin can CRUD access zones, profiles, and employee assignments
- Admin can view terminal bookings with status filters
- Admin can trigger terminal import and view batch status
- Import results show processed/failed/skipped counts

## Tests

### Component tests
- Access zone/profile tables render correctly
- Assignment form validates date ranges
- Terminal booking status badges display correctly
- Import dialog sends correct request

### Integration tests
- Create zone → create profile → assign to employee
- Trigger import, verify batch appears in list
- Filter terminal bookings by status

## Test case pack
1) Create access zone
   - Input: Code "MAIN", name "Main Building"
   - Expected: Zone created
2) Assign employee access
   - Input: Employee, profile, date range
   - Expected: Assignment created
3) Trigger terminal import
   - Input: Upload booking data
   - Expected: Import batch created with status tracking

## Dependencies
- ZMI-TICKET-028 (Zutritt Access Control backend)
- ZMI-TICKET-027 (Terminal Integration backend)
- Employees API (for selectors)
