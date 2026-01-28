# Booking Types Configuration Implementation Plan

## Overview

Implement admin booking type configuration with list, creation/editing, activation toggles, usage counts, and system-type protections across API and web UI.

## Current State Analysis

- Booking types exist in the API with CRUD endpoints, validation, and system-type protections, but list responses currently filter to active types even without the `active` query param. (`apps/api/internal/service/bookingtype.go:180-193`, `apps/api/internal/repository/bookingtype.go:99-111`)
- Booking type schema supports code/name/description/direction/is_active, but the list response does not include usage counts. (`api/schemas/booking-types.yaml:2-113`)
- The web app uses booking types in time clock/timesheet flows, but there is no admin booking types page yet. (`apps/web/src/hooks/api/use-booking-types.ts:1-43`)
- Admin list/table patterns with usage counts and activation toggles exist for accounts and absence types. (`apps/web/src/components/accounts/account-data-table.tsx:87-231`, `apps/web/src/app/[locale]/(dashboard)/admin/absence-types/page.tsx:155-301`)

## Desired End State

- Admins can view all booking types (system + custom, active + inactive) in a list page with direction icons, usage counts, and activation toggles.
- System booking types are visible but not editable or deletable.
- Custom booking types can be created with required direction, optional description, and code/name validation.
- Deletion is blocked when a booking type is referenced by bookings.
- In/Out filter toggle works in the UI; usage count column displays per type.

### Key Discoveries:
- The list endpoint currently returns only active booking types by default. (`apps/api/internal/repository/bookingtype.go:99-111`)
- Dev-mode seeding already defines A1/A2/P1/P2/D1/D2 as system types. (`apps/api/internal/auth/devbookingtypes.go:15-66`)
- Account list UI already demonstrates usage count + activation toggle patterns. (`apps/web/src/components/accounts/account-data-table.tsx:87-231`)

## What We're NOT Doing

- No changes to booking calculation logic or booking type semantics.
- No changes to booking type seed data or code mappings beyond the admin UI.
- No new API endpoints beyond enhancing the existing list/delete behaviors.

## Implementation Approach

- Extend the booking type model/repository to include usage counts via a left-join aggregation on bookings.
- Update the booking type service and handler to enforce “in use” deletion restrictions and return a clear error.
- Build a new admin booking types page reusing existing admin patterns (table + sheet form), with direction filter tabs, lock indicators, and toggles.
- Add create/update/delete booking type hooks to the web API layer and wire them into the UI.
- Update navigation and translations to surface the new page.

## Phase 1: Backend — Usage Counts + Delete Guard

### Overview
Expose usage counts in list results, include inactive types by default, and prevent deletion of types referenced by bookings.

### Changes Required:

#### 1. Booking Type Model
**File**: `apps/api/internal/model/bookingtype.go`
**Changes**: Add a `UsageCount` field (gorm ignored) to serialize usage counts in list responses.

#### 2. Booking Type Repository
**File**: `apps/api/internal/repository/bookingtype.go`
**Changes**:
- Add a list method (or enhance `ListWithSystem`) to left-join booking usage counts scoped to tenant and include inactive types.
- Add a `CountUsage` method for deletion checks.
- Ensure ordering remains system-first, then code.

#### 3. Booking Type Service + Handler
**Files**: `apps/api/internal/service/bookingtype.go`, `apps/api/internal/handler/bookingtype.go`
**Changes**:
- Add `ErrCannotDeleteBookingTypeInUse` and return it when usage count > 0.
- Map the new error to a conflict (409) or bad request response in the handler.
- Use the new repository list method to return usage counts in list responses.

#### 4. Tests
**Files**: `apps/api/internal/service/bookingtype_test.go`, `apps/api/internal/handler/bookingtype_test.go`
**Changes**:
- Add test coverage for delete when bookings exist.
- Update list-related tests if list behavior changes (inactive inclusion, usage count presence).

### Success Criteria:

#### Automated Verification:
- [ ] Go tests for booking type service/handler pass: `go test ./apps/api/internal/service -run BookingType` and `go test ./apps/api/internal/handler -run BookingType`

#### Manual Verification:
- [ ] GET `/api/v1/booking-types` returns system + custom types, including inactive, with `usage_count`.
- [ ] DELETE `/api/v1/booking-types/{id}` returns conflict when bookings exist for that type.

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation if additional phases depend on API changes.

---

## Phase 2: Frontend — Booking Type API Hooks

### Overview
Expose create/update/delete booking type mutations in the web layer and ensure active-only consumers request active types.

### Changes Required:

#### 1. Booking Type Hooks
**File**: `apps/web/src/hooks/api/use-booking-types.ts`
**Changes**:
- Add `useCreateBookingType`, `useUpdateBookingType`, `useDeleteBookingType` using `useApiMutation`.

#### 2. Hook Exports
**File**: `apps/web/src/hooks/api/index.ts`
**Changes**:
- Export the new booking type mutation hooks.

#### 3. Existing Consumers
**File**: `apps/web/src/components/dashboard/quick-actions.tsx`
**Changes**:
- Ensure active-only booking types are requested to avoid inactive types.

### Success Criteria:

#### Automated Verification:
- [ ] Typecheck passes for the web app: `pnpm -C apps/web typecheck`

#### Manual Verification:
- [ ] Booking type hooks can create/update/delete and invalidate list queries as expected.

---

## Phase 3: Frontend — Admin Booking Types UI

### Overview
Create admin booking types page with list, filters, usage count column, and a simple create/edit form.

### Changes Required:

#### 1. Booking Types Components
**Files**:
- `apps/web/src/components/booking-types/booking-type-data-table.tsx`
- `apps/web/src/components/booking-types/booking-type-form-sheet.tsx`
- `apps/web/src/components/booking-types/index.ts`
**Changes**:
- Data table with columns: code, name, direction icon, usage count, status (system/active), and actions.
- Lock icon and disabled actions for system types.
- Disable delete action for types with `usage_count > 0` and show tooltip.
- Include activation toggle (disabled for system types).
- Form sheet for create/edit with required direction selector and optional description; lock code/direction on edit.

#### 2. Admin Page
**File**: `apps/web/src/app/[locale]/(dashboard)/admin/booking-types/page.tsx`
**Changes**:
- Page layout consistent with other admin sections (header, filters, list, empty state).
- Filters: search by code/name + direction tabs (All/In/Out).
- Wire up create/edit/delete dialogs and activation toggle.

#### 3. Navigation + Breadcrumbs + Translations
**Files**:
- `apps/web/src/components/layout/sidebar/sidebar-nav-config.ts`
- `apps/web/src/components/layout/breadcrumbs.tsx`
- `apps/web/messages/en.json`
- `apps/web/messages/de.json`
**Changes**:
- Add `bookingTypes` nav entry and breadcrumb label.
- Add `adminBookingTypes` copy for UI labels, placeholders, and validation messages.

### Success Criteria:

#### Automated Verification:
- [ ] Web typecheck passes: `pnpm -C apps/web typecheck`
- [ ] Web lint passes: `pnpm -C apps/web lint`

#### Manual Verification:
- [ ] Admins can view booking types list with direction icons, usage counts, and system locks.
- [ ] In/Out filter toggle updates the list client-side.
- [ ] Creating a custom booking type requires direction, shows in list, and is editable/deletable.
- [ ] Activation toggle updates `is_active` and reflects in the UI.
- [ ] Delete is disabled (and rejected by API) for types in use.

---

## Testing Strategy

### Unit Tests:
- Booking type service delete guard when usage count > 0.
- Handler delete response for “in use” types.

### Integration Tests:
- Booking type list response includes usage count and inactive types.

### Manual Testing Steps:
1. Navigate to Admin → Booking Types.
2. Create a custom booking type with direction `in` and description.
3. Toggle its active status off and back on.
4. Attempt to delete a type referenced by bookings (expect disabled UI + 409 response).
5. Verify system types show lock icon and cannot be edited or deleted.

## Performance Considerations

- Usage counts are fetched via a single aggregated query for the list endpoint, avoiding per-type queries.

## Migration Notes

- No database schema migrations required; usage counts are computed dynamically from bookings.

## References

- Research doc: `thoughts/shared/research/2026-01-28-booking-types-configuration.md`
- Booking type API handler: `apps/api/internal/handler/bookingtype.go`
- Booking type repository: `apps/api/internal/repository/bookingtype.go`
- Admin absence types page: `apps/web/src/app/[locale]/(dashboard)/admin/absence-types/page.tsx`
- Account data table usage-count pattern: `apps/web/src/components/accounts/account-data-table.tsx`
