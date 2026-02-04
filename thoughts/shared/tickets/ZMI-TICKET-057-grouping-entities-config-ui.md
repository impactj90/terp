# ZMI-TICKET-057: Grouping Entities Configuration UI

Status: Proposed
Priority: P3
Owner: TBD
Backend tickets: ZMI-TICKET-009, ZMI-TICKET-010, ZMI-TICKET-007

## Goal
Provide CRUD interfaces for account groups, booking type groups, and absence type groups, embedded as sections or tabs within their respective parent admin pages.

## Scope
- In scope: Account groups CRUD (embedded in accounts page), booking type groups CRUD (embedded in booking types page), absence type groups CRUD (embedded in absence types page).
- Out of scope: Modifying accounts/booking types/absence types themselves, group membership assignment in this ticket.

## Requirements

### Pages & routes
- **Extend existing pages** (no new routes):
  - `apps/web/src/app/[locale]/(dashboard)/admin/accounts/page.tsx` — add "Groups" tab
  - `apps/web/src/app/[locale]/(dashboard)/admin/booking-types/page.tsx` — add "Groups" tab
  - `apps/web/src/app/[locale]/(dashboard)/admin/absence-types/page.tsx` — add "Groups" tab

### Components
- `apps/web/src/components/account-groups/account-group-data-table.tsx`
  - Columns: Code, Name, Description, Sort Order, Active, Actions
  - Standard CRUD table pattern
- `apps/web/src/components/account-groups/account-group-form-sheet.tsx`
  - Fields: Code (required, unique), Name (required), Description (optional), Sort Order (number, optional), Active (switch)
- `apps/web/src/components/booking-type-groups/booking-type-group-data-table.tsx`
  - Columns: Code, Name, Description, Member Count, Active, Actions
  - Member count from booking_type_ids array length
- `apps/web/src/components/booking-type-groups/booking-type-group-form-sheet.tsx`
  - Fields: Code (required, unique), Name (required), Description (optional), Active (switch)
  - Booking Type Members: multi-select from useBookingTypes hook (shows code + name)
- `apps/web/src/components/absence-type-groups/absence-type-group-data-table.tsx`
  - Columns: Code, Name, Description, Active, Actions
- `apps/web/src/components/absence-type-groups/absence-type-group-form-sheet.tsx`
  - Fields: Code (required, unique), Name (required), Description (optional), Active (switch)

### API hooks
- `apps/web/src/hooks/api/use-account-groups.ts`
  - `useAccountGroups(params?)` — GET `/account-groups` with `active` filter
  - `useCreateAccountGroup()` — POST `/account-groups`, invalidates `[['/account-groups']]`
  - `useUpdateAccountGroup()` — PATCH `/account-groups/{id}`, invalidates `[['/account-groups']]`
  - `useDeleteAccountGroup()` — DELETE `/account-groups/{id}`, invalidates `[['/account-groups']]`
- `apps/web/src/hooks/api/use-booking-type-groups.ts`
  - `useBookingTypeGroups(params?)` — GET `/booking-type-groups` with `active` filter
  - `useCreateBookingTypeGroup()` — POST `/booking-type-groups`, invalidates `[['/booking-type-groups']]`
  - `useUpdateBookingTypeGroup()` — PATCH `/booking-type-groups/{id}`, invalidates `[['/booking-type-groups']]`
  - `useDeleteBookingTypeGroup()` — DELETE `/booking-type-groups/{id}`, invalidates `[['/booking-type-groups']]`
- `apps/web/src/hooks/api/use-absence-type-groups.ts`
  - `useAbsenceTypeGroups(params?)` — GET `/absence-type-groups` with `active` filter
  - `useCreateAbsenceTypeGroup()` — POST `/absence-type-groups`, invalidates `[['/absence-type-groups']]`
  - `useUpdateAbsenceTypeGroup()` — PATCH `/absence-type-groups/{id}`, invalidates `[['/absence-type-groups']]`
  - `useDeleteAbsenceTypeGroup()` — DELETE `/absence-type-groups/{id}`, invalidates `[['/absence-type-groups']]`

### UI behavior
- Groups tab within each parent page — tab switching preserves state
- Standard CRUD pattern for each group type
- Booking type groups include member assignment via multi-select
- Code uniqueness: 409 shows inline error
- Active filter toggle on each groups tab
- Delete confirmation dialog for all group types

### Navigation & translations
- No new sidebar entries (embedded as tabs in existing pages)
- Translation namespaces: `account-groups`, `booking-type-groups`, `absence-type-groups`
  - Each with: `table.*`, `form.*`, `delete.*`, `empty.*`

## Acceptance criteria
- Admin can CRUD account groups within the accounts page
- Admin can CRUD booking type groups with member assignment within booking types page
- Admin can CRUD absence type groups within absence types page
- Code uniqueness enforced for all three group types
- Groups tabs integrate seamlessly with existing parent pages

## Tests

### Component tests
- Each group table renders correct columns
- Forms validate code uniqueness
- Booking type group form includes member multi-select
- Delete confirmation works for each type

### Integration tests
- Create account group, verify in groups tab
- Create booking type group with members, verify member count
- Delete group, verify removed

## Test case pack
1) Create account group
   - Input: Code "OVERTIME", name "Overtime Accounts", sort_order 1
   - Expected: Group created in accounts page groups tab
2) Create booking type group with members
   - Input: Code "ENTRY", name "Entry Types", select 3 booking types
   - Expected: Group created with member count = 3
3) Delete absence type group
   - Input: Delete a group, confirm
   - Expected: Group removed from list

## Dependencies
- ZMI-TICKET-009 (Accounts and Groups backend)
- ZMI-TICKET-010 (Booking Types and Groups backend)
- ZMI-TICKET-007 (Absence Types backend)
