# ZMI-TICKET-055: System Settings & Tenant Admin UI

Status: Proposed
Priority: P2
Owner: TBD
Backend tickets: ZMI-TICKET-023, ZMI-TICKET-001

## Goal
Provide a system settings form with grouped configuration sections plus dangerous cleanup tools with double confirmation, and a separate tenant CRUD page.

## Scope
- In scope: System settings form (grouped sections), cleanup tools (delete bookings, delete booking data, re-read bookings, mark/delete orders), tenant CRUD page.
- Out of scope: Tenant creation wizard, data migration tools, backup/restore.

## Requirements

### Pages & routes
- **Extend existing page**: `apps/web/src/app/[locale]/(dashboard)/admin/settings/page.tsx`
  - Existing route: `/admin/settings`
  - Add grouped settings form and cleanup tools section
- **Extend existing page**: `apps/web/src/app/[locale]/(dashboard)/admin/tenants/page.tsx`
  - Existing route: `/admin/tenants`
  - Add full CRUD with create, edit, delete

### Components

#### System Settings
- `apps/web/src/components/settings/system-settings-form.tsx`
  - Grouped sections with collapsible cards:
    - **Calculation Settings**: rounding_relative_to_plan (switch), error_list_enabled (switch), tracked_error_codes (tag input)
    - **Order Settings**: auto_fill_order_end_bookings (switch), follow_up_entries_enabled (switch)
    - **Birthday Settings**: birthday_window_days_before (number 0–90), birthday_window_days_after (number 0–90)
    - **Proxy Settings**: proxy_enabled (switch), proxy_host (text), proxy_port (number), proxy_username (text), proxy_password (password, write-only)
    - **Server Monitoring**: server_alive_enabled (switch), server_alive_expected_completion_time (time picker, stored as minutes from midnight), server_alive_threshold_minutes (number), server_alive_notify_admins (switch)
  - Save button at bottom (saves all sections at once)
  - Uses GET `/system-settings` to load, PUT `/system-settings` to save
  - Unsaved changes warning on navigation away
- `apps/web/src/components/settings/cleanup-tools-section.tsx`
  - Section with destructive action cards, visually separated from settings
  - Warning banner: "These operations are destructive and cannot be undone."
  - Four cleanup tools, each as a card with description and action button:
    1. **Delete Bookings**: date range + optional employee filter
    2. **Delete Booking Data**: date range + optional employee filter (deletes bookings, daily values, employee day plans)
    3. **Re-Read Bookings**: date range + optional employee filter (re-triggers calculation)
    4. **Mark & Delete Orders**: order multi-select
- `apps/web/src/components/settings/cleanup-dialog.tsx`
  - Two-step dialog for each cleanup operation:
    - Step 1 (Preview): sends request with `confirm: false` → shows affected_count and preview=true
      - "This will affect {affected_count} records. Are you sure?"
    - Step 2 (Confirm): sends request with `confirm: true` → executes cleanup
      - Result: shows operation name, affected_count, performed_at
  - Double confirmation: user must type "DELETE" or similar confirmation phrase
  - Different dialog content per cleanup type (different input fields)

#### Tenant Management
- `apps/web/src/components/tenants/tenant-data-table.tsx`
  - Columns: Name, Slug, City, Country, Vacation Basis (badge), Active (badge), Actions
  - Row click opens detail sheet
  - Actions: Edit, Deactivate
- `apps/web/src/components/tenants/tenant-form-sheet.tsx`
  - Sheet form for create/edit
  - Fields:
    - Name (text, required, max 255)
    - Slug (text, required for create, pattern: lowercase letters/numbers/hyphens, min 3, max 100)
    - Address Street (text, required)
    - Address ZIP (text, required, max 20)
    - Address City (text, required, max 100)
    - Address Country (text, required, max 100)
    - Phone (text, optional, max 50)
    - Email (email input, optional, max 255)
    - Payroll Export Base Path (text, optional)
    - Notes (textarea, optional)
    - Vacation Basis (select: calendar_year | entry_date)
    - Active (switch, edit only)
  - Uses POST `/tenants` for create, PATCH `/tenants/{id}` for edit
- `apps/web/src/components/tenants/tenant-detail-sheet.tsx`
  - Shows all tenant fields grouped by section: Identity, Address, Contact, Settings
  - Actions: Edit, Deactivate
- `apps/web/src/components/tenants/tenant-deactivate-dialog.tsx`
  - Confirmation: "Deactivate tenant '{name}'? Users will no longer be able to access this tenant's data."
  - Uses DELETE `/tenants/{id}` (which sets is_active=false per API docs)

### API hooks
- `apps/web/src/hooks/api/use-system-settings.ts`
  - `useSystemSettings()` — GET `/system-settings`
  - `useUpdateSystemSettings()` — PUT `/system-settings`, body: partial settings, invalidates `[['/system-settings']]`
  - `useCleanupDeleteBookings()` — POST `/system-settings/cleanup/delete-bookings`
  - `useCleanupDeleteBookingData()` — POST `/system-settings/cleanup/delete-booking-data`
  - `useCleanupReReadBookings()` — POST `/system-settings/cleanup/re-read-bookings`
  - `useCleanupMarkDeleteOrders()` — POST `/system-settings/cleanup/mark-delete-orders`
- `apps/web/src/hooks/api/use-tenants.ts`
  - `useTenants(params?)` — GET `/tenants` with query params: `active`, `include_inactive`, `name`
  - `useTenant(id)` — GET `/tenants/{id}`
  - `useCreateTenant()` — POST `/tenants`, invalidates `[['/tenants']]`
  - `useUpdateTenant()` — PATCH `/tenants/{id}`, invalidates `[['/tenants']]`
  - `useDeactivateTenant()` — DELETE `/tenants/{id}`, invalidates `[['/tenants']]`

### UI behavior
- Settings form: load current settings on mount, track dirty state, warn on unsaved navigation
- Cleanup tools: visually separated with destructive styling (red borders/buttons)
- Double confirmation: Step 1 shows preview count, Step 2 requires typing confirmation phrase
- Password field: write-only, never pre-filled, show "Change password" placeholder
- Server alive time: displayed as HH:MM, stored as minutes from midnight (e.g., 300 = "05:00")
- Tracked error codes: tag input component (type code, press Enter to add, click X to remove)
- Tenant slug: auto-generated from name on create (user can override), locked on edit
- Active filter on tenant list: shows only active by default
- Empty state for tenants: "No tenants configured. Create your first tenant."

### Navigation & translations
- Settings already has sidebar entry at `/admin/settings`
- Tenants already has sidebar entry at `/admin/tenants`
- Translation namespaces:
  - `settings`: `page.*`, `sections.*`, `fields.*`, `cleanup.*`, `cleanup-dialog.*`
  - `tenants`: `page.*`, `table.*`, `form.*`, `detail.*`, `deactivate.*`, `empty.*`

## Acceptance criteria
- Admin can view and update all system settings grouped by section
- Settings save is atomic (all sections at once) with dirty state tracking
- Cleanup tools show preview count before executing
- Cleanup requires double confirmation (preview + type confirmation)
- Admin can list, create, edit, and deactivate tenants
- Tenant slug is auto-generated and unique
- Non-admin users cannot access settings or tenant pages

## Tests

### Component tests
- Settings form loads current values and tracks dirty state
- Cleanup dialog shows preview count in step 1
- Cleanup dialog requires confirmation phrase in step 2
- Tenant form auto-generates slug from name
- Tenant deactivate dialog sends DELETE request

### Integration tests
- Update settings, verify persisted on refresh
- Run cleanup preview, verify affected count
- Run cleanup with confirmation, verify success
- Create tenant, verify in list
- Deactivate tenant, verify status change

## Test case pack
1) Update calculation settings
   - Input: Toggle rounding_relative_to_plan, add tracked error code "MISSING_COME", save
   - Expected: Settings saved, values persist on refresh
2) Cleanup preview
   - Input: Open "Delete Bookings" cleanup, set date range, click "Preview"
   - Expected: Shows "This will affect X records" with preview=true
3) Cleanup execution
   - Input: After preview, type "DELETE" in confirmation, click "Confirm"
   - Expected: Cleanup executed, affected_count shown
4) Create tenant
   - Input: Name "Test Corp", auto-slug "test-corp", address fields
   - Expected: Tenant created with slug "test-corp"
5) Deactivate tenant
   - Input: Click Deactivate on tenant, confirm
   - Expected: Tenant marked inactive, hidden from default list

## Dependencies
- ZMI-TICKET-023 (System Settings backend)
- ZMI-TICKET-001 (Mandant/Tenant backend)
- Orders API (for cleanup mark/delete orders selector)
