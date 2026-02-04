# ZMI-TICKET-048: Absence Edit & Cancel UI

Status: Proposed
Priority: P2
Owner: TBD
Backend tickets: ZMI-TICKET-008

## Goal
Add edit (PATCH) and cancel workflow to the existing absences page, allowing users and admins to modify absence details and cancel approved/pending absences.

## Scope
- In scope: Edit absence form sheet, cancel confirmation dialog, status-based action availability, rejection reason display.
- Out of scope: Absence creation (existing), approval/rejection workflow (existing), bulk absence operations.

## Requirements

### Pages & routes
- **Extend existing page**: `apps/web/src/app/[locale]/(dashboard)/absences/page.tsx`
  - No new route — extends existing `/absences` page
  - Add "Edit" and "Cancel" to row actions (conditional on status)

### Components
- `apps/web/src/components/absences/absence-edit-form-sheet.tsx`
  - Sheet form for editing an existing absence
  - Fields:
    - Duration (select: 1.0 = Full day, 0.5 = Half day)
    - Notes (textarea, optional)
  - Non-editable display fields (shown but not editable): Employee, Absence Type, Date, Status
  - Editing rules:
    - Pending absences: duration and notes editable
    - Approved absences: only notes editable (duration locked after approval)
    - Rejected/Cancelled: not editable (edit button hidden)
  - Uses PATCH `/absences/{id}`, body: `{ duration?, notes? }`
- `apps/web/src/components/absences/absence-cancel-dialog.tsx`
  - Confirmation dialog for cancelling an absence
  - Shows: employee name, absence type, date, current status
  - Text: "Are you sure you want to cancel this absence for {employee_name} on {date}?"
  - Uses PATCH `/absences/{id}`, body: `{ status: 'cancelled' }`
  - Available for: pending and approved statuses only
- Extend existing `apps/web/src/components/absences/absence-detail-sheet.tsx`
  - Add "Edit" button (visible for pending/approved absences)
  - Add "Cancel" button (visible for pending/approved absences)
  - Display rejection_reason if status is "rejected"
  - Display cancellation info if status is "cancelled"

### API hooks
- `apps/web/src/hooks/api/use-absences.ts` (extend existing)
  - Add `useUpdateAbsence()` — PATCH `/absences/{id}`, body: `{ duration?, notes?, status? }`, invalidates `[['/absences']]`
  - Existing hooks: `useAbsences()`, `useAbsence()`, `useDeleteAbsence()` remain unchanged

### UI behavior
- Edit availability by status:
  - `pending`: Edit (duration + notes), Cancel
  - `approved`: Edit (notes only), Cancel
  - `rejected`: View only (show rejection_reason)
  - `cancelled`: View only
- Cancel flow: sends PATCH with `{ status: 'cancelled' }`, on success closes dialog and refreshes list
- Edit flow: on success, closes sheet and refreshes list; shows success toast
- Status badges in detail sheet: pending=outline/yellow, approved=default/green, rejected=destructive/red, cancelled=secondary/gray
- Rejection reason: displayed as an alert banner in the detail sheet when status is "rejected"
- Row actions in data table: dynamically show Edit/Cancel based on current absence status

### Navigation & translations
- No new sidebar entry or routes
- Translation namespace: `absences` (extend existing)
  - New key groups: `edit.*`, `cancel.*`, `status-info.*`

## Acceptance criteria
- User can edit duration and notes on pending absences
- User can edit only notes on approved absences
- Edit is not available for rejected or cancelled absences
- User/admin can cancel pending or approved absences
- Cancelled status persists and absence is no longer active
- Rejection reason is visible in detail sheet for rejected absences
- Row actions dynamically reflect available operations per status

## Tests

### Component tests
- Edit form shows duration field for pending, hides for approved
- Cancel dialog sends correct PATCH with status='cancelled'
- Detail sheet shows rejection_reason for rejected absences
- Edit/Cancel buttons hidden for rejected and cancelled statuses
- Row actions menu shows correct options per status

### Integration tests
- Edit pending absence duration, verify update
- Edit approved absence notes only, verify duration unchanged
- Cancel pending absence, verify status changes to "cancelled"
- Cancel approved absence, verify status changes to "cancelled"
- Verify edit button hidden after cancellation

## Test case pack
1) Edit pending absence duration
   - Input: Open pending absence, change duration from 1.0 to 0.5, save
   - Expected: Absence updated, duration shows "Half day"
2) Edit approved absence notes only
   - Input: Open approved absence, duration field disabled, edit notes, save
   - Expected: Notes updated, duration unchanged
3) Cancel pending absence
   - Input: Click Cancel on pending absence, confirm
   - Expected: Status changes to "cancelled", edit/cancel buttons disappear
4) Cancel approved absence
   - Input: Click Cancel on approved absence, confirm
   - Expected: Status changes to "cancelled"
5) View rejected absence
   - Input: Open detail sheet for rejected absence
   - Expected: Rejection reason displayed, no edit/cancel buttons

## Dependencies
- ZMI-TICKET-008 (Absence Days Lifecycle backend)
- ZMI-TICKET-007 (Absence Types — for type display)
