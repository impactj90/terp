# Research: ZMI-TICKET-048 — Absence Edit & Cancel UI

## 1. Existing Absences Page and Components

### Page: `apps/web/src/app/[locale]/(dashboard)/absences/page.tsx`

The absences page is a **self-service employee page** (not an admin page). It:
- Uses `useAuth()` to get the current user's `employee_id`
- Has a 2-column layout: left (VacationBalanceCard + PendingRequests), right (AbsenceCalendarView)
- Has a "Request Absence" button that opens `AbsenceRequestForm` sheet
- Calendar date clicks also open the request form with pre-filled dates
- Uses `useTranslations('absences')` namespace

### Components in `apps/web/src/components/absences/`:

| File | Purpose |
|------|---------|
| `absence-request-form.tsx` | Sheet form for creating new absence requests. Uses `Sheet` with `SheetContent side="right"`. Contains absence type selector, date range picker, duration (full/half day), notes. |
| `absence-calendar-view.tsx` | Month calendar showing holidays and absences. Uses `useEmployeeAbsences` and `useHolidays`. |
| `pending-requests.tsx` | Lists absences grouped by status (pending, approved, rejected). Has delete functionality for pending absences. Uses `useEmployeeAbsences` and `useDeleteAbsence`. |
| `vacation-balance-card.tsx` | Shows vacation balance with progress bar. Uses `useEmployeeVacationBalance`. |
| `absence-type-selector.tsx` | Grid selector for choosing absence type. Shows color, name, badges. |
| `vacation-impact-preview.tsx` | Shows vacation balance impact preview with progress bar. |

### PendingRequests Component — Key Details

The `PendingRequests` component (`pending-requests.tsx`) is the most relevant to this ticket:

- **Status grouping**: Groups absences into `pending`, `approved`, `rejected` arrays
- **Delete support**: Only pending absences show a delete (Trash2) icon button
- **Delete confirmation**: Uses a Sheet-based confirmation dialog (`Sheet` with `side="bottom"`)
- **AbsenceCard sub-component**: Renders each absence with type color dot, name, date, duration badge ("half day"), notes, and status badge
- **STATUS_COLORS map**:
  ```ts
  const STATUS_COLORS = {
    pending: { variant: 'secondary', labelKey: 'statusPending' },
    approved: { variant: 'default', labelKey: 'statusApproved' },
    rejected: { variant: 'destructive', labelKey: 'statusRejected' },
  }
  ```
  Note: `cancelled` status is NOT in this map currently.
- **No detail sheet**: Clicking an absence card triggers `onSelect` callback, but this prop is not wired up on the main page — `onSelect` is never passed to `PendingRequests`.
- **No edit functionality**: There is no edit button or edit sheet in the current implementation.

### Absence Schema (from API types)

The `Absence` type from `components['schemas']['Absence']` includes:
- `id`, `tenant_id`, `employee_id`, `absence_type_id`
- `absence_date` (string, format: date)
- `duration` (number, decimal — 1.0 or 0.5)
- `status` ("pending" | "approved" | "rejected" | "cancelled")
- `notes` (string, nullable)
- `rejection_reason` (string, nullable)
- `approved_by`, `approved_at`
- `created_at`, `updated_at`, `created_by`
- `employee` (EmployeeSummary, nullable)
- `absence_type` (AbsenceTypeSummary, nullable)

---

## 2. API Hooks Pattern

### File: `apps/web/src/hooks/api/use-absences.ts`

**Existing hooks:**

| Hook | Method | Path | Purpose |
|------|--------|------|---------|
| `useAbsenceTypes(enabled)` | GET | `/absence-types` | List active absence types |
| `useAbsenceType(id, enabled)` | GET | `/absence-types/{id}` | Get single absence type |
| `useAbsences(options)` | GET | `/absences` | List absences with filters (employeeId, from, to, status) |
| `useEmployeeAbsences(employeeId, options)` | GET | `/employees/{id}/absences` | Get employee absences with date range |
| `useAbsence(id, enabled)` | GET | `/absences/{id}` | Get single absence |
| `useCreateAbsenceRange()` | POST | `/employees/{id}/absences` | Create absence range |
| `useDeleteAbsence()` | DELETE | `/absences/{id}` | Delete absence |
| `useApproveAbsence()` | POST | `/absences/{id}/approve` | Approve absence |
| `useRejectAbsence()` | POST | `/absences/{id}/reject` | Reject absence |
| `useCreateAbsenceType()` | POST | `/absence-types` | Create absence type |
| `useUpdateAbsenceType()` | PATCH | `/absence-types/{id}` | Update absence type |
| `useDeleteAbsenceType()` | DELETE | `/absence-types/{id}` | Delete absence type |

**Missing hook**: `useUpdateAbsence()` — PATCH `/absences/{id}` — does NOT exist yet.

### Hook Pattern

All hooks use `useApiQuery` or `useApiMutation` from `@/hooks`:

```ts
// Query pattern:
export function useAbsence(id: string, enabled = true) {
  return useApiQuery('/absences/{id}', {
    path: { id },
    enabled: enabled && !!id,
  })
}

// Mutation pattern:
export function useDeleteAbsence() {
  return useApiMutation('/absences/{id}', 'delete', {
    invalidateKeys: [
      ['/absences'],
      ['/employees/{id}/absences'],
      ['/employees/{id}/vacation-balance'],
      ['/vacation-balances'],
    ],
  })
}
```

### `useApiMutation` internals (`apps/web/src/hooks/use-api-mutation.ts`)

- Wraps TanStack Query's `useMutation`
- Accepts `path` (OpenAPI path), `method` ('post' | 'put' | 'patch' | 'delete'), and options
- Variables shape: `{ body?: ..., path?: ... }`
- Options include `invalidateKeys` (array of query keys to invalidate on success) and `onSuccess` callback
- Fully type-safe — infers request/response types from OpenAPI generated types

### `useApiQuery` internals (`apps/web/src/hooks/use-api-query.ts`)

- Wraps TanStack Query's `useQuery`
- Accepts `path` (OpenAPI path) and options with `params`, `path`, and standard query options
- Query key is `[path, params, pathParams]`

### Hooks index (`apps/web/src/hooks/api/index.ts`)

Currently exports from `use-absences.ts`:
```ts
export {
  useAbsenceTypes, useAbsenceType, useAbsences, useEmployeeAbsences,
  useAbsence, useCreateAbsenceRange, useDeleteAbsence,
  useApproveAbsence, useRejectAbsence,
  useCreateAbsenceType, useUpdateAbsenceType, useDeleteAbsenceType,
} from './use-absences'
```

---

## 3. Backend PATCH Endpoint

### Handler: `apps/api/internal/handler/absence.go` — `UpdateAbsence` (line 598)

```go
func (h *AbsenceHandler) UpdateAbsence(w http.ResponseWriter, r *http.Request) {
    // Parses ID from URL path
    // Calls ensureAbsenceScope for authorization
    // Decodes models.UpdateAbsenceRequest from body
    // Maps to service.UpdateAbsenceInput:
    //   - Duration (decimal, optional)
    //   - Notes (string, optional)
    // Does NOT handle status changes (status field in UpdateAbsenceRequest is ignored in handler)
    // Calls absenceService.Update()
    // Returns 200 with updated Absence
}
```

**Important**: The handler does NOT pass the `status` field from `UpdateAbsenceRequest` to the service layer. Only `duration` and `notes` are mapped.

### Cancel Handler: `apps/api/internal/handler/absence.go` — `Cancel` (line 482)

```go
func (h *AbsenceHandler) Cancel(w http.ResponseWriter, r *http.Request) {
    // POST /absences/{id}/cancel
    // Only cancels APPROVED absences (returns 400 if not approved)
    // Sets status to "cancelled"
    // Returns 200 with updated Absence
}
```

### Service Layer: `apps/api/internal/service/absence.go`

**`UpdateAbsenceInput`**:
```go
type UpdateAbsenceInput struct {
    Duration      *decimal.Decimal
    HalfDayPeriod *model.HalfDayPeriod
    Notes         *string
}
```

**`Update` function** (line 310):
- Only allows updates to **pending** absences (`ErrAbsenceNotPending` if not pending)
- Applies duration, half_day_period, and notes changes
- Triggers recalculation after update

**`Cancel` function** (line 214):
- Only allows cancellation of **approved** absences (`ErrAbsenceNotApproved` if not approved)
- Sets status to `AbsenceStatusCancelled`
- Triggers recalculation

### Route Registration: `apps/api/internal/handler/routes.go` (line 512)

```go
// With authz:
r.With(authz.RequirePermission(managePerm)).Patch("/absences/{id}", h.UpdateAbsence)
r.With(authz.RequirePermission(approvePerm)).Post("/absences/{id}/cancel", h.Cancel)
```

Permissions:
- PATCH update requires `absences.manage` permission
- Cancel requires `absences.approve` permission

### Status Transition Rules (Backend)

| From Status | Allowed Actions |
|-------------|----------------|
| pending | Edit (PATCH), Delete, Approve, Reject |
| approved | Cancel |
| rejected | Delete |
| cancelled | (none — terminal state) |

---

## 4. OpenAPI Spec

### PATCH `/absences/{id}` — Defined in `api/paths/absences.yaml` (line 71)

```yaml
patch:
  summary: Update absence
  operationId: updateAbsence
  parameters:
    - name: id (path, required, uuid)
    - name: body (body, required, $ref: UpdateAbsenceRequest)
  responses:
    200: Updated absence ($ref: Absence)
    400: BadRequest
    401: Unauthorized
    404: NotFound
```

### `UpdateAbsenceRequest` schema — `api/schemas/absences.yaml` (line 124)

```yaml
UpdateAbsenceRequest:
  type: object
  properties:
    duration:
      type: number
      format: decimal
    notes:
      type: string
    status:
      type: string
      enum: [pending, approved, rejected, cancelled]
```

All fields are optional (no `required` array).

### Cancel endpoint — NOT in OpenAPI spec

The `POST /absences/{id}/cancel` endpoint exists in Go routes but is NOT defined in the OpenAPI spec. It is therefore NOT available in the generated TypeScript types.

**Approach for cancel**: Two options exist:
1. Use `PATCH /absences/{id}` with `{ status: "cancelled" }` — this is available in the types
2. Add the cancel endpoint to the OpenAPI spec and regenerate types

Note: The backend handler for PATCH does NOT currently pass the status field to the service layer, so option 1 would require a backend change. The dedicated cancel endpoint (option 2) is already implemented in Go but needs OpenAPI spec addition.

### Generated TypeScript types (`apps/web/src/lib/api/types.ts`)

`UpdateAbsenceRequest` at line 7750:
```ts
UpdateAbsenceRequest: {
    duration?: number;
    notes?: string;
    status?: "pending" | "approved" | "rejected" | "cancelled";
}
```

The path `/absences/{id}` supports: `get` (getAbsence), `delete` (deleteAbsence), `patch` (updateAbsence).

No `/absences/{id}/cancel` path exists in the generated types.

---

## 5. Similar Patterns in Codebase

### Edit Form Sheet Pattern

The project consistently uses `Sheet` with `side="right"` for create/edit forms. Key example:

**`apps/web/src/components/absence-types/absence-type-form-sheet.tsx`**:
- Accepts `absenceType?: AbsenceType | null` prop — null means create, non-null means edit
- `const isEdit = !!absenceType`
- `React.useEffect` resets form state when `open` changes, populating from the entity for edit mode
- Uses both `createMutation` and `updateMutation`, selects based on `isEdit`
- Footer pattern: Cancel button (outline) + Submit button (primary), both `className="flex-1"`
- Error display via `Alert variant="destructive"`

**`apps/web/src/components/employees/employee-form-sheet.tsx`**:
- Same create/edit pattern with `employee?: Employee | null`
- Submit handler selects between `createMutation.mutateAsync` and `updateMutation.mutateAsync`

### Detail Sheet Pattern

**`apps/web/src/components/absence-types/absence-type-detail-sheet.tsx`**:
- Read-only view of entity details
- Has action buttons in `SheetFooter`: Close, Edit, Delete
- Edit/Delete buttons are conditionally disabled (for system types)
- Uses `Tooltip` for disabled button explanations
- `onEdit` and `onDelete` callbacks passed from parent
- Fetches data using `useAbsenceType(id, open && !!id)` — enabled only when sheet is open

### Confirm Dialog Pattern

**`apps/web/src/components/ui/confirm-dialog.tsx`**:
- Reusable component using `Sheet` with `side="bottom"`
- Props: `open`, `onOpenChange`, `title`, `description`, `confirmLabel`, `cancelLabel`, `variant` ('default' | 'destructive'), `isLoading`, `onConfirm`
- Has destructive variant with `AlertTriangle` icon
- Used by `UserDeleteDialog` and similar components

**`apps/web/src/components/users/user-delete-dialog.tsx`**:
- Wraps `ConfirmDialog` with mutation logic
- Calls `deleteMutation.mutateAsync` on confirm
- Passes `isLoading={deleteMutation.isPending}`

### Row Actions / Dropdown Menu Pattern

**`apps/web/src/components/absence-types/absence-type-data-table.tsx`**:
- Uses `DropdownMenu` with `MoreHorizontal` trigger button
- Items: View (Eye icon), Edit (Edit icon), Delete (Trash2 icon) with separator
- Conditionally disables/enables items based on state (e.g., `type.is_system`)
- Uses `DropdownMenuItem variant="destructive"` for delete
- Table row has `onClick={() => onView(type)}` for row click
- Actions cell has `onClick={(e) => e.stopPropagation()}` to prevent row click

### Delete Confirmation in PendingRequests

The `PendingRequests` component already implements a delete confirmation pattern using `Sheet side="bottom"` with confirm/cancel buttons. This is inline (not using the reusable `ConfirmDialog`).

---

## 6. Translation Keys

### English (`apps/web/messages/en.json`) — `"absences"` namespace (line 372-438)

Existing relevant keys:
```json
{
  "statusPending": "Pending",
  "statusApproved": "Approved",
  "statusRejected": "Rejected",
  "deleteRequest": "Delete Absence Request",
  "deleteConfirmation": "Are you sure you want to delete this absence request? This action cannot be undone.",
  "duration": "Duration",
  "fullDay": "Full day",
  "halfDay": "Half day",
  "notesLabel": "Notes",
  "optional": "(optional)",
  "notesPlaceholder": "Add any additional information...",
  "halfDayLabel": "(half day)",
  "unknownType": "Unknown type"
}
```

Missing keys needed for this ticket:
- `statusCancelled` — "Cancelled"
- Edit-related keys (editAbsence, editDescription, saveChanges, failedToUpdate, etc.)
- Cancel-related keys (cancelAbsence, cancelConfirmation, etc.)
- Rejection reason display key
- Detail sheet keys

### German (`apps/web/messages/de.json`) — `"absences"` namespace (line 372-438)

Same structure as English with German translations. Will need corresponding new keys.

---

## 7. Data Model Summary

### AbsenceDay Model (`apps/api/internal/model/absenceday.go`)

```go
type AbsenceDay struct {
    ID            uuid.UUID
    TenantID      uuid.UUID
    EmployeeID    uuid.UUID
    AbsenceDate   time.Time       // date type
    AbsenceTypeID uuid.UUID
    Duration      decimal.Decimal // 1.00 = full day, 0.50 = half day
    HalfDayPeriod *HalfDayPeriod  // "morning" | "afternoon"
    Status        AbsenceStatus   // "pending" | "approved" | "rejected" | "cancelled"
    ApprovedBy    *uuid.UUID
    ApprovedAt    *time.Time
    RejectionReason *string
    Notes         *string
    CreatedBy     *uuid.UUID
    Employee      *Employee       // relation
    AbsenceType   *AbsenceType    // relation
}
```

### Status Constants:
```go
AbsenceStatusPending   = "pending"
AbsenceStatusApproved  = "approved"
AbsenceStatusRejected  = "rejected"
AbsenceStatusCancelled = "cancelled"
```

---

## 8. Key Findings and Gaps

### What exists:
1. Absences page with request form, calendar, pending requests list, vacation balance
2. PATCH `/absences/{id}` endpoint in OpenAPI spec (UpdateAbsenceRequest: duration, notes, status)
3. Backend handler for PATCH that updates duration and notes (NOT status)
4. Dedicated `POST /absences/{id}/cancel` backend handler (NOT in OpenAPI spec)
5. AbsenceCard component showing type, date, duration, notes, status badge
6. Delete confirmation dialog for pending absences
7. Reusable `ConfirmDialog` component
8. Detail sheet pattern with action buttons (absence-type-detail-sheet)
9. Form sheet pattern for edit (absence-type-form-sheet, employee-form-sheet)
10. Dropdown menu row actions pattern (absence-type-data-table)

### What does NOT exist:
1. `useUpdateAbsence()` hook — needs to be created
2. No cancel hook — the `/absences/{id}/cancel` endpoint is not in OpenAPI spec
3. `cancelled` status not in `STATUS_COLORS` map in pending-requests.tsx
4. No detail/view sheet for individual absences
5. No edit form sheet for absences
6. No cancel confirmation dialog for absences
7. `rejection_reason` is never displayed in the UI
8. The `onSelect` callback in `PendingRequests` is never wired up on the page
9. No admin absences page (only admin absence-types page exists)

### Backend considerations:
- **Edit**: Only pending absences can be edited (backend enforces this)
- **Cancel**: Only approved absences can be cancelled (backend enforces this)
- **Cancel route**: `POST /absences/{id}/cancel` is available but needs OpenAPI spec addition, OR the cancel can be done via PATCH with status field if the handler is updated
- **Permissions**: PATCH requires `absences.manage`, Cancel requires `absences.approve`
