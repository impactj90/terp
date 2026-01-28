---
date: 2026-01-28T15:14:59+01:00
researcher: tolga
git_commit: 994711f4a4b748c33c999da406df02cf6783b4db
branch: master
repository: terp
topic: "Timesheet page booking integration and data flow"
tags: [research, codebase, timesheet, bookings, time-clock, daily-values]
status: complete
last_updated: 2026-01-28
last_updated_by: tolga
---

# Research: Timesheet page booking integration and data flow

**Date**: 2026-01-28T15:14:59+01:00
**Researcher**: tolga
**Git Commit**: 994711f4a4b748c33c999da406df02cf6783b4db
**Branch**: master
**Repository**: terp

## Research Question

"It seems like the timesheet page is not fully done and well integrated. For example I can't create a booking there. Make sure that everything is integrated into the whole system."

## Summary

The timesheet UI is implemented with day/week/month views and pulls bookings and daily values, but the day view’s “add booking” path is only a placeholder handler and does not call the booking creation API. The bookings API is fully implemented in the backend (CRUD + day view endpoint) and is already used by the Time Clock flow and dashboard quick actions to create bookings. The timesheet day view currently uses the bookings list endpoint plus the monthly daily-values endpoint (with client-side field shims) rather than the dedicated day-view endpoint that includes day plan and holiday data.

## Detailed Findings

### Timesheet page UI wiring

- The timesheet page uses day/week/month views and passes `onAddBooking`/`onEditBooking` into the day view; the add handler currently only logs a TODO to the console. (`apps/web/src/app/[locale]/(dashboard)/timesheet/page.tsx:173-181`)
- The day view fetches bookings via `useBookings` and daily values via `useDailyValues`, then passes `onAdd` through to `BookingList` and `onEdit` to open the edit dialog. (`apps/web/src/components/timesheet/day-view.tsx:35-129`)
- `BookingList` renders “Add booking” buttons (empty state and footer) only when `onAdd` is provided and `isEditable` is true. (`apps/web/src/components/timesheet/booking-list.tsx:53-85`)
- The edit dialog uses `useUpdateBooking` and builds a payload with `edited_time` (minutes) and `notes`. (`apps/web/src/components/timesheet/booking-edit-dialog.tsx:85-101`)

### Booking creation flows outside timesheet

- The Time Clock flow creates bookings via `useCreateBooking`, using booking type codes and `time` as a HH:MM string, then invalidates the day view. (`apps/web/src/hooks/use-clock-state.ts:96-128`)
- The dashboard quick actions also call `useCreateBooking` to clock in/out using booking types and `time` strings. (`apps/web/src/components/dashboard/quick-actions.tsx:55-85`)

### Daily values data sources used by timesheet

- `useDailyValues` calls the monthly breakdown endpoint (`/employees/{id}/months/{year}/{month}/days`) and maps response fields into legacy aliases; some fields (holiday/absence/day plan/locked/calculated_at) are filled with defaults in the transform. (`apps/web/src/hooks/api/use-daily-values.ts:122-154`, `apps/web/src/hooks/api/use-daily-values.ts:84-118`)
- There is a separate day view hook that calls `/employees/{id}/day/{date}` and returns bookings, daily value, day plan, holiday, and errors. (`apps/web/src/hooks/api/use-employee-day.ts:10-33`)

### Backend bookings API and storage

- The OpenAPI spec defines `/bookings` list/create and `/bookings/{id}` get/update/delete endpoints. (`api/paths/bookings.yaml:1-144`)
- The booking schema defines `CreateBookingRequest.time` and `UpdateBookingRequest.time` as HH:MM strings (with `notes` optional). (`api/schemas/bookings.yaml:115-148`)
- The booking handler parses `time` strings on create/update and converts them to minutes, then delegates to the booking service. (`apps/api/internal/handler/booking.go:199-336`)
- The booking service validates time, checks month-closed state (if available), validates booking type, writes bookings, and triggers recalculation. (`apps/api/internal/service/booking.go:91-188`)
- The bookings table stores minutes-from-midnight fields, pairing via `pair_id`, and metadata (source, notes, audit). (`db/migrations/000022_create_bookings.up.sql:4-34`)

### Day view endpoint

- The backend day view endpoint `/employees/{id}/day/{date}` aggregates bookings, daily value, day plan, and holiday into a single response. (`apps/api/internal/handler/booking.go:363-474`)

## Code References

- `apps/web/src/app/[locale]/(dashboard)/timesheet/page.tsx:173-181` - `handleAddBooking` placeholder logging TODO.
- `apps/web/src/components/timesheet/day-view.tsx:35-129` - day view fetches bookings + daily values and forwards add/edit callbacks.
- `apps/web/src/components/timesheet/booking-list.tsx:53-85` - Add booking buttons rendered when `onAdd` is present.
- `apps/web/src/components/timesheet/booking-edit-dialog.tsx:85-101` - update payload uses `edited_time` and `notes`.
- `apps/web/src/hooks/use-clock-state.ts:96-128` - time clock creates bookings with `time` strings.
- `apps/web/src/components/dashboard/quick-actions.tsx:55-85` - quick actions create clock in/out bookings.
- `apps/web/src/hooks/api/use-daily-values.ts:122-154` - monthly daily-values endpoint usage.
- `apps/web/src/hooks/api/use-daily-values.ts:84-118` - daily value transform adds legacy fields/defaults.
- `apps/web/src/hooks/api/use-employee-day.ts:10-33` - day view API hook.
- `api/paths/bookings.yaml:1-144` - bookings API endpoints.
- `api/schemas/bookings.yaml:115-148` - create/update booking request schema expects `time`.
- `apps/api/internal/handler/booking.go:199-336` - create/update handlers parse `time` strings.
- `apps/api/internal/service/booking.go:91-188` - booking creation/update business logic.
- `db/migrations/000022_create_bookings.up.sql:4-34` - bookings table schema.

## Architecture Documentation

- **Bookings storage model**: bookings are persisted with `original_time`, `edited_time`, and optional `calculated_time` as minutes-from-midnight; `pair_id` links in/out pairs and `source` tracks origin. (`db/migrations/000022_create_bookings.up.sql:4-34`)
- **Frontend pairing for display**: the timesheet UI groups bookings into in/out pairs using `pair_id` first, then sequential matching, to display durations. (`apps/web/src/components/timesheet/booking-list.tsx:99-170`)
- **Daily values sourcing in timesheet views**: the timesheet week/month/day views use the monthly daily-values endpoint and a client-side transform that supplies legacy fields and default flags. (`apps/web/src/hooks/api/use-daily-values.ts:84-154`)

## Historical Context (from thoughts/)

- `thoughts/shared/research/2026-01-18-TICKET-052-create-bookings-migration.md` documents early work on booking migrations and noted missing booking implementation at that time.
- `thoughts/shared/plans/2026-01-28-team-dashboard-enhancements.md` references the day view endpoint and derives attendance data from bookings + daily values.
- `thoughts/shared/plans/2026-01-28-manager-approvals-dashboard.md` outlines daily value approval work and references booking/day-view handler updates.

## Related Research

- `thoughts/shared/research/2026-01-18-TICKET-052-create-bookings-migration.md`

## Open Questions

- None noted from the current code paths reviewed.
