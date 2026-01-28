# Timesheet Booking Integration Implementation Plan

## Overview

Finish the timesheet day view integration by switching it to the day-view endpoint, adding a full booking create dialog (optional notes), fixing booking edits to use the `time` payload, and wiring booking deletion with confirmation.

## Current State Analysis

- Timesheet day view “Add booking” is a TODO and does not open any dialog or call the bookings API. (`apps/web/src/app/[locale]/(dashboard)/timesheet/page.tsx:178-180`)
- Day view currently fetches bookings via `/bookings` and daily values via the monthly endpoint, then applies client-side shims. (`apps/web/src/components/timesheet/day-view.tsx:35-52`, `apps/web/src/hooks/api/use-daily-values.ts:84-118`)
- Booking edit dialog sends `edited_time` (minutes) but the API expects `time` as HH:MM. (`apps/web/src/components/timesheet/booking-edit-dialog.tsx:95-101`, `api/schemas/bookings.yaml:115-148`)
- Booking list supports add/edit/delete callbacks, but booking pair UI only exposes edit actions. (`apps/web/src/components/timesheet/booking-list.tsx:53-85`, `apps/web/src/components/timesheet/booking-pair.tsx:56-110`)
- Backend already supports bookings CRUD and the day-view endpoint. (`apps/api/internal/handler/booking.go:199-474`, `api/paths/bookings.yaml:1-144`)

## Desired End State

- Timesheet day view uses the `/employees/{id}/day/{date}` endpoint for bookings, daily value, day plan, and holiday metadata.
- Users can create a booking from the timesheet day view via a full dialog (booking type, time, optional notes).
- Users can edit a booking’s time using `time` (HH:MM) as required by the API.
- Users can delete a booking with confirmation.
- Error badges continue to show error counts for the day view.

### Key Discoveries:
- Day view currently loads bookings + daily values separately; the day-view endpoint exists but is unused. (`apps/web/src/components/timesheet/day-view.tsx:35-52`, `apps/web/src/hooks/api/use-employee-day.ts:20-33`)
- Booking edit dialog payload does not match the API’s `time` requirement. (`apps/web/src/components/timesheet/booking-edit-dialog.tsx:95-101`, `api/schemas/bookings.yaml:115-148`)
- Backend day view response currently maps only a subset of daily value fields. (`apps/api/internal/handler/booking.go:445-453`)

## What We’re NOT Doing

- Adding new booking types or changing booking type semantics.
- Implementing absence/holiday calculations beyond what the day-view endpoint already provides.
- Building new backend endpoints for timesheet summaries.

## Implementation Approach

- Replace day-view data fetching with `useEmployeeDayView` and adapt UI to use its top-level fields.
- Update backend day-view daily value mapping to include balance and error details so the UI can render error badges.
- Add a booking create dialog with booking type selection, time input, and optional notes.
- Fix booking edit payload to send `time` (HH:MM) and wire delete actions with confirmation.
- Ensure booking mutations invalidate the day-view query.

## Phase 1: Day View Integration (Backend + Frontend)

### Overview
Switch the timesheet day view to the day-view endpoint and ensure daily value metadata and errors are present for UI badges and summaries.

### Changes Required:

#### 1) Populate day-view daily value with balance + errors
**File**: `apps/api/internal/handler/booking.go`
**Changes**:
- Enhance `dailyValueToResponse` to include `BalanceMinutes` and a derived `Errors` list from `dailyValue.ErrorCodes` and `dailyValue.Warnings` (both in `model.DailyValue`). (`apps/api/internal/model/dailyvalue.go:30-45`)
- Use `dailyValueToResponse` inside `buildDayViewResponse` to populate `response.DailyValue` and mirror `response.Errors` for the day view.

```go
func (h *BookingHandler) dailyValueToResponse(dv *model.DailyValue) *models.DailyValue {
  // existing fields ...
  resp.BalanceMinutes = int64(dv.Balance())
  resp.Errors = buildDailyErrors(dv) // from ErrorCodes + Warnings
  return resp
}

func (h *BookingHandler) buildDayViewResponse(...) *models.DayView {
  // ...
  if dailyValue != nil {
    dvResp := h.dailyValueToResponse(dailyValue)
    response.DailyValue = struct{ models.DailyValue }{DailyValue: *dvResp}
    response.Errors = dvResp.Errors
  }
  // ...
}
```

#### 2) Switch timesheet day view to use `useEmployeeDayView`
**File**: `apps/web/src/components/timesheet/day-view.tsx`
**Changes**:
- Replace `useBookings`/`useDailyValues` with `useEmployeeDayView`.
- Pull bookings from `dayView.data?.bookings` and daily value from `dayView.data?.daily_value`.
- Use `dayView.data?.day_plan` and `dayView.data?.is_holiday` for badges/plan info.
- Pass `errors` to `ErrorBadge` from `dayView.data?.errors` (fallback to `daily_value?.errors` if present).

### Success Criteria:

#### Automated Verification:
- [ ] Go tests pass: `make test`

#### Manual Verification:
- [ ] Timesheet day view loads bookings + summary from the day-view endpoint.
- [ ] Holiday/day plan info displays when returned by the API.
- [ ] Error badge still appears for days with errors.

**Implementation Note**: After completing this phase and automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Booking Create/Edit/Delete UI

### Overview
Add the booking creation dialog, fix edit payload, and wire deletion with confirmation.

### Changes Required:

#### 1) Booking create dialog
**File**: `apps/web/src/components/timesheet/booking-create-dialog.tsx` (new)
**Changes**:
- Create a dialog using `Sheet` with fields:
  - Booking type (Select from `useBookingTypes({ active: true })`)
  - Time (HH:MM input)
  - Notes (optional)
- Prefill time with `getCurrentTimeString()`.
- On submit, call `useCreateBooking` with `{ employee_id, booking_date, booking_type_id, time, notes? }`.
- Surface API errors in-dialog (simple error text or `Alert`).

```tsx
await createBooking.mutateAsync({
  body: {
    employee_id: employeeId,
    booking_date: formatDate(date),
    booking_type_id: selectedTypeId,
    time,
    notes: notes || undefined,
  },
})
```

#### 2) Wire add dialog in timesheet page
**File**: `apps/web/src/app/[locale]/(dashboard)/timesheet/page.tsx`
**Changes**:
- Add state for create dialog open + draft booking date.
- Replace `handleAddBooking` TODO with open dialog.
- Render `BookingCreateDialog` with `employeeId` and `date`.

#### 3) Fix booking edit payload
**File**: `apps/web/src/components/timesheet/booking-edit-dialog.tsx`
**Changes**:
- Send `{ time: editedTime }` instead of `edited_time`.
- Keep time validation as HH:MM.

#### 4) Delete booking flow
**Files**:
- `apps/web/src/components/timesheet/booking-pair.tsx`
- `apps/web/src/components/timesheet/booking-list.tsx`
- `apps/web/src/app/[locale]/(dashboard)/timesheet/page.tsx`

**Changes**:
- Add delete buttons (e.g., Trash icon) next to edit buttons for in/out bookings.
- Pass `onDelete` from `BookingList` into `BookingPair`.
- Use `ConfirmDialog` in timesheet page to confirm deletion and call `useDeleteBooking`.

### Success Criteria:

#### Automated Verification:
- [x] Web lint passes: `pnpm -C apps/web lint`
- [ ] Web typecheck passes: `pnpm -C apps/web typecheck`

#### Manual Verification:
- [ ] “Add Booking” opens a dialog with booking type, time, and optional notes.
- [ ] Creating a booking updates the day view list.
- [ ] Editing a booking saves correctly (time in HH:MM).
- [ ] Deleting a booking requires confirmation and removes it from the list.

**Implementation Note**: After completing this phase and automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Invalidation + i18n

### Overview
Ensure mutations refresh the day view and add required translations for new UI strings.

### Changes Required:

#### 1) Invalidate day-view queries on booking mutations
**File**: `apps/web/src/hooks/api/use-bookings.ts`
**Changes**:
- Add `['/employees/{id}/day/{date}']` to `invalidateKeys` for create/update/delete.

#### 2) Add i18n strings
**Files**:
- `apps/web/messages/en.json`
- `apps/web/messages/de.json`

**Changes**:
- Add timesheet strings for create dialog labels, delete confirmation text, and any error text used in the new dialogs.

### Success Criteria:

#### Automated Verification:
- [x] Web lint passes: `pnpm -C apps/web lint`

#### Manual Verification:
- [ ] Booking create/edit/delete immediately refreshes the day view.
- [ ] All new UI text is translated in EN/DE.

**Implementation Note**: After completing this phase and automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:
- Not required unless adding new shared utilities.

### Integration Tests:
- Manual API verification for day view response fields if necessary.

### Manual Testing Steps:
1. Open `/timesheet` in day view for an employee.
2. Click “Add Booking,” choose a booking type, set time, and save.
3. Edit the created booking and verify the time updates.
4. Delete a booking and confirm it is removed after confirmation.
5. Verify daily summary and error badge still render correctly.

## Performance Considerations

- Day view now uses a single endpoint instead of two, reducing request overhead.

## Migration Notes

- No database migrations required.

## References

- Research: `thoughts/shared/research/2026-01-28-timesheet-booking-integration.md`
- Timesheet page TODO: `apps/web/src/app/[locale]/(dashboard)/timesheet/page.tsx:178-180`
- Day view component: `apps/web/src/components/timesheet/day-view.tsx:35-129`
- Booking edit dialog payload: `apps/web/src/components/timesheet/booking-edit-dialog.tsx:95-101`
- Day view endpoint: `apps/api/internal/handler/booking.go:363-474`
- Booking API schema: `api/schemas/bookings.yaml:115-148`
