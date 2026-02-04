# Implementation Plan: ZMI-TICKET-048 — Absence Edit & Cancel UI

**Ticket**: ZMI-TICKET-048
**Research**: `thoughts/shared/research/2026-02-03-ZMI-TICKET-048-absence-edit-cancel-ui.md`
**Date**: 2026-02-03

---

## Summary

Add edit and cancel workflows to the existing self-service absences page (`/absences`). This involves:
- A new `useUpdateAbsence` API hook (PATCH `/absences/{id}`)
- An edit form sheet for modifying duration and notes (status-dependent field availability)
- A cancel confirmation dialog using PATCH with `{ status: 'cancelled' }`
- A new detail sheet displaying absence info, rejection reason, and action buttons
- Extended absence card actions in the PendingRequests component
- Wiring everything together in the absences page

### Backend Prerequisites

The ticket specifies cancellation via `PATCH /absences/{id}` with `{ status: 'cancelled' }`. Currently:
- The backend PATCH handler (`UpdateAbsence`) only maps `duration` and `notes` to `UpdateAbsenceInput` -- it ignores the `status` field.
- The backend `Update` service only allows updates to **pending** absences, but the ticket wants notes-only editing for **approved** absences too.
- A dedicated `POST /absences/{id}/cancel` endpoint exists in the backend but is not in the OpenAPI spec.

These backend gaps are tracked under ZMI-TICKET-008. The UI will be built to the ticket's spec; backend changes may be needed for full functionality.

### Approach for Cancel

Use `PATCH /absences/{id}` with `{ status: 'cancelled' }` as specified in the ticket. The `UpdateAbsenceRequest` TypeScript type already includes the `status` field. If the backend does not yet support this, the dedicated cancel endpoint can be added later as an alternative.

---

## Phase 1: API Hook — `useUpdateAbsence`

**Goal**: Add the missing `useUpdateAbsence()` mutation hook.

### Files to modify

#### 1.1 `apps/web/src/hooks/api/use-absences.ts`

Add a new hook after `useDeleteAbsence`:

```ts
/**
 * Hook to update an absence (edit duration/notes, or cancel via status change).
 */
export function useUpdateAbsence() {
  return useApiMutation('/absences/{id}', 'patch', {
    invalidateKeys: [
      ['/absences'],
      ['/employees/{id}/absences'],
      ['/employees/{id}/vacation-balance'],
      ['/vacation-balances'],
    ],
  })
}
```

**Pattern reference**: Follows `useDeleteAbsence` and `useUpdateAbsenceType` patterns exactly. Uses `'patch'` method, returns mutation with path variable `{ id }` and body type inferred from `UpdateAbsenceRequest`.

**Invalidation keys**: Same set as `useDeleteAbsence` and `useCreateAbsenceRange` since editing/cancelling an absence affects the same data: absence lists, employee absences, and vacation balances.

#### 1.2 `apps/web/src/hooks/api/index.ts`

Add `useUpdateAbsence` to the absences export block:

```ts
// Absences
export {
  useAbsenceTypes,
  useAbsenceType,
  useAbsences,
  useEmployeeAbsences,
  useAbsence,
  useCreateAbsenceRange,
  useUpdateAbsence,      // <-- ADD
  useDeleteAbsence,
  useApproveAbsence,
  useRejectAbsence,
  useCreateAbsenceType,
  useUpdateAbsenceType,
  useDeleteAbsenceType,
} from './use-absences'
```

### Verification

- Confirm TypeScript compiles with no errors: `cd apps/web && npx tsc --noEmit`
- Confirm the hook is importable: `import { useUpdateAbsence } from '@/hooks/api'`

---

## Phase 2: Edit Form Sheet — `absence-edit-form-sheet.tsx`

**Goal**: Create a sheet form for editing an existing absence's duration and notes.

### File to create

#### 2.1 `apps/web/src/components/absences/absence-edit-form-sheet.tsx`

**Pattern reference**: `apps/web/src/components/absence-types/absence-type-form-sheet.tsx` (edit mode pattern), `apps/web/src/components/absences/absence-request-form.tsx` (field layout pattern).

**Component structure**:

```
AbsenceEditFormSheet
  Props:
    - absence: Absence | null       // the absence to edit (null = closed)
    - open: boolean
    - onOpenChange: (open: boolean) => void
    - onSuccess?: () => void

  State:
    - duration: '1' | '0.5'         // radio group value
    - notes: string                  // textarea value
    - error: string | null           // error message

  Hooks:
    - useUpdateAbsence()             // from Phase 1
    - useTranslations('absences')
    - useTranslations('common')
    - useLocale()                    // for date formatting
```

**Layout** (Sheet side="right", sm:max-w-lg):

1. **SheetHeader**: Title = `t('editAbsence')`, Description = `t('editDescription')`
2. **ScrollArea** (flex-1):
   - **Read-only info section** (rounded-lg border p-4, DetailRow pattern from absence-type-detail-sheet):
     - Absence Type: color dot + name
     - Date: formatted absence_date
     - Status: Badge with status color
   - **Duration field** (RadioGroup with "Full day" / "Half day"):
     - **Enabled** when `absence.status === 'pending'`
     - **Disabled** when `absence.status === 'approved'` (show explanatory text: `t('durationLockedApproved')`)
   - **Notes field** (Textarea):
     - Always editable for pending and approved
     - Pre-populated from `absence.notes`
   - **Error alert** (Alert variant="destructive")
3. **SheetFooter** (flex-row gap-2 border-t pt-4):
   - Cancel button (outline, flex-1)
   - Save button (primary, flex-1, with Loader2 spinner when submitting)

**Form reset logic** (useEffect on `open` and `absence`):

```ts
React.useEffect(() => {
  if (open && absence) {
    setDuration(absence.duration === 0.5 ? '0.5' : '1')
    setNotes(absence.notes ?? '')
    setError(null)
  }
}, [open, absence])
```

**Submit handler**:

```ts
const handleSubmit = async () => {
  if (!absence) return
  setError(null)

  try {
    const body: Record<string, unknown> = {}

    // Only send duration if status is pending and value changed
    if (absence.status === 'pending') {
      const newDuration = duration === '0.5' ? 0.5 : 1
      if (newDuration !== absence.duration) {
        body.duration = newDuration
      }
    }

    // Send notes if changed
    const newNotes = notes.trim()
    if (newNotes !== (absence.notes ?? '')) {
      body.notes = newNotes
    }

    // Only call API if something changed
    if (Object.keys(body).length === 0) {
      onOpenChange(false)
      return
    }

    await updateMutation.mutateAsync({
      path: { id: absence.id },
      body,
    })

    onOpenChange(false)
    onSuccess?.()
  } catch (err) {
    const apiError = err as { detail?: string; message?: string }
    setError(apiError.detail ?? apiError.message ?? t('failedToUpdate'))
  }
}
```

**Status-based behavior summary**:

| Status   | Duration field | Notes field | Edit button visible |
|----------|---------------|-------------|---------------------|
| pending  | Enabled       | Enabled     | Yes                 |
| approved | Disabled      | Enabled     | Yes                 |
| rejected | N/A           | N/A         | No (sheet not opened)|
| cancelled| N/A           | N/A         | No (sheet not opened)|

### Verification

- Component renders without errors
- Duration radio group is disabled when absence status is "approved"
- Duration radio group is enabled when absence status is "pending"
- Notes textarea is always editable
- Submitting calls `updateMutation.mutateAsync` with correct path and body
- Sheet closes on success

---

## Phase 3: Cancel Confirmation Dialog — `absence-cancel-dialog.tsx`

**Goal**: Create a confirmation dialog for cancelling an absence.

### File to create

#### 3.1 `apps/web/src/components/absences/absence-cancel-dialog.tsx`

**Pattern reference**: `apps/web/src/components/ui/confirm-dialog.tsx` (reusable ConfirmDialog component).

**Component structure**:

```
AbsenceCancelDialog
  Props:
    - absence: Absence | null       // the absence to cancel
    - open: boolean
    - onOpenChange: (open: boolean) => void
    - onSuccess?: () => void

  Hooks:
    - useUpdateAbsence()
    - useTranslations('absences')
    - useTranslations('common')
    - useLocale()
```

**Implementation approach**: Wrap the reusable `ConfirmDialog` component with absence-specific logic. This follows the `UserDeleteDialog` pattern.

```tsx
'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { useLocale } from 'next-intl'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useUpdateAbsence } from '@/hooks/api'
import { parseISODate } from '@/lib/time-utils'
import type { components } from '@/lib/api/types'

type Absence = components['schemas']['Absence']

interface AbsenceCancelDialogProps {
  absence: Absence | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

export function AbsenceCancelDialog({
  absence,
  open,
  onOpenChange,
  onSuccess,
}: AbsenceCancelDialogProps) {
  const t = useTranslations('absences')
  const tc = useTranslations('common')
  const locale = useLocale()
  const updateMutation = useUpdateAbsence()

  const formattedDate = absence
    ? parseISODate(absence.absence_date).toLocaleDateString(locale, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : ''

  const description = absence
    ? t('cancelConfirmation', {
        type: absence.absence_type?.name ?? t('unknownType'),
        date: formattedDate,
      })
    : ''

  const handleConfirm = async () => {
    if (!absence) return

    try {
      await updateMutation.mutateAsync({
        path: { id: absence.id },
        body: { status: 'cancelled' },
      })
      onOpenChange(false)
      onSuccess?.()
    } catch {
      // Error will be visible via ConfirmDialog loading state stopping
      // Could add toast notification here
    }
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('cancelAbsence')}
      description={description}
      confirmLabel={t('confirmCancel')}
      cancelLabel={tc('cancel')}
      variant="destructive"
      isLoading={updateMutation.isPending}
      onConfirm={handleConfirm}
    />
  )
}
```

**Key design decisions**:
- Uses the reusable `ConfirmDialog` component (Sheet side="bottom") for consistency
- `variant="destructive"` to show AlertTriangle icon and red confirm button
- Description includes absence type name and date for user context
- Cancel sends `PATCH /absences/{id}` with `{ status: 'cancelled' }` per ticket spec

### Verification

- Dialog renders with correct title, description, and destructive styling
- Confirm button calls `updateMutation.mutateAsync` with status: 'cancelled'
- Dialog closes on successful cancel
- Loading spinner shows during mutation

---

## Phase 4: Absence Detail Sheet — `absence-detail-sheet.tsx`

**Goal**: Create a read-only detail sheet for viewing absence information, with Edit/Cancel action buttons and rejection reason display.

### File to create

#### 4.1 `apps/web/src/components/absences/absence-detail-sheet.tsx`

**Pattern reference**: `apps/web/src/components/absence-types/absence-type-detail-sheet.tsx` (layout, DetailRow, action buttons in footer).

**Component structure**:

```
AbsenceDetailSheet
  Props:
    - absence: Absence | null
    - open: boolean
    - onOpenChange: (open: boolean) => void
    - onEdit: (absence: Absence) => void
    - onCancel: (absence: Absence) => void
    - onDelete: (absence: Absence) => void

  Hooks:
    - useTranslations('absences')
    - useTranslations('common')
    - useLocale()
```

**Layout** (Sheet side="right", sm:max-w-lg):

1. **SheetHeader**: Title = `t('absenceDetails')`, Description = `t('viewAbsenceInfo')`
2. **ScrollArea** (flex-1):
   - **Header area** (flex items-center gap-4):
     - Absence type color square (h-12 w-12 rounded-lg) with CalendarOff icon
     - Type name (h3 font-semibold)
     - Status Badge (color-coded)
   - **Rejection reason alert** (only when status === 'rejected' and rejection_reason exists):
     - `Alert variant="destructive"` with AlertCircle icon
     - Text: `t('rejectionReasonLabel')`: `absence.rejection_reason`
   - **Cancellation info** (only when status === 'cancelled'):
     - `Alert` (default variant) with Ban icon
     - Text: `t('absenceCancelled')`
   - **Details section** (rounded-lg border p-4, DetailRow pattern):
     - Date: formatted absence_date
     - Duration: "Full day" or "Half day" badge
     - Status: Badge
     - Notes: text or dash
   - **Timestamps section** (rounded-lg border p-4):
     - Created: formatted created_at
     - Last updated: formatted updated_at
3. **SheetFooter** (flex-row gap-2 border-t pt-4):
   - Close button (outline, flex-1)
   - Edit button (outline, with Edit icon) -- visible when `canEdit`
   - Cancel button (destructive, with Ban icon) -- visible when `canCancel`
   - Delete button (destructive, with Trash2 icon) -- visible when `canDelete`

**Status-based action visibility**:

```ts
const status = absence?.status ?? 'pending'
const canEdit = status === 'pending' || status === 'approved'
const canCancel = status === 'pending' || status === 'approved'
const canDelete = status === 'pending' || status === 'rejected'
```

**STATUS_BADGE_CONFIG** (shared with pending-requests):

```ts
const STATUS_BADGE_CONFIG: Record<string, {
  variant: 'default' | 'secondary' | 'destructive' | 'outline'
  labelKey: string
}> = {
  pending: { variant: 'secondary', labelKey: 'statusPending' },
  approved: { variant: 'default', labelKey: 'statusApproved' },
  rejected: { variant: 'destructive', labelKey: 'statusRejected' },
  cancelled: { variant: 'outline', labelKey: 'statusCancelled' },
}
```

**Rejection reason display**:

```tsx
{status === 'rejected' && absence.rejection_reason && (
  <Alert variant="destructive">
    <AlertCircle className="h-4 w-4" />
    <AlertDescription>
      <span className="font-medium">{t('rejectionReasonLabel')}:</span>{' '}
      {absence.rejection_reason}
    </AlertDescription>
  </Alert>
)}
```

### Verification

- Detail sheet shows all absence fields correctly
- Rejection reason is visible for rejected absences
- Cancellation info is visible for cancelled absences
- Edit button visible for pending and approved; hidden for rejected/cancelled
- Cancel button visible for pending and approved; hidden for rejected/cancelled
- Delete button visible for pending and rejected; hidden for approved/cancelled
- Clicking Edit/Cancel/Delete calls the appropriate callback

---

## Phase 5: Extend PendingRequests and Wire Up in Page

**Goal**: Add action buttons to absence cards, wire up the detail sheet, and connect all sheets in the page.

### Files to modify

#### 5.1 `apps/web/src/components/absences/pending-requests.tsx`

**Changes**:

1. **Add `cancelled` to `STATUS_COLORS` map**:

```ts
const STATUS_COLORS: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; labelKey: string }> = {
  pending: { variant: 'secondary', labelKey: 'statusPending' },
  approved: { variant: 'default', labelKey: 'statusApproved' },
  rejected: { variant: 'destructive', labelKey: 'statusRejected' },
  cancelled: { variant: 'outline', labelKey: 'statusCancelled' },  // ADD
}
```

2. **Add `cancelled` group to `groupedAbsences` memo**:

Add a `cancelled` array alongside `pending`, `approved`, `rejected`. Push absences with `status === 'cancelled'` into it. Sort by date. Return in grouped object.

3. **Render cancelled group section** after rejected group:

```tsx
{groupedAbsences.cancelled.length > 0 && (
  <AbsenceGroup
    title={t('statusCancelled')}
    count={groupedAbsences.cancelled.length}
    absences={groupedAbsences.cancelled}
    onSelect={onSelect}
    locale={locale}
  />
)}
```

4. **Add `onEdit` and `onCancel` props to `PendingRequestsProps`**:

```ts
interface PendingRequestsProps {
  employeeId?: string
  onSelect?: (absence: Absence) => void
  onEdit?: (absence: Absence) => void
  onCancel?: (absence: Absence) => void
  className?: string
}
```

5. **Add Edit and Cancel icon buttons to AbsenceCard**:

Extend `AbsenceCardProps`:

```ts
interface AbsenceCardProps {
  absence: Absence
  onClick?: () => void
  onEdit?: () => void
  onCancel?: () => void
  onDelete?: () => void
  locale: string
}
```

In the card actions area (alongside the existing delete button), add:

```tsx
{onEdit && (
  <Button
    variant="ghost"
    size="icon"
    className="h-8 w-8 shrink-0"
    onClick={(e) => {
      e.stopPropagation()
      onEdit()
    }}
  >
    <Edit className="h-4 w-4 text-muted-foreground" />
    <span className="sr-only">{tc('edit')}</span>
  </Button>
)}
{onCancel && (
  <Button
    variant="ghost"
    size="icon"
    className="h-8 w-8 shrink-0"
    onClick={(e) => {
      e.stopPropagation()
      onCancel()
    }}
  >
    <Ban className="h-4 w-4 text-muted-foreground" />
    <span className="sr-only">{t('cancelAbsence')}</span>
  </Button>
)}
```

6. **Pass callbacks through AbsenceGroup to AbsenceCard** with status-based logic:

In `AbsenceGroup`, add `onEdit` and `onCancel` optional props. In the `AbsenceCard` render, conditionally pass these based on absence status:

```tsx
<AbsenceCard
  key={absence.id}
  absence={absence}
  onClick={() => onSelect?.(absence)}
  onEdit={
    (absence.status === 'pending' || absence.status === 'approved')
      ? () => onEdit?.(absence)
      : undefined
  }
  onCancel={
    (absence.status === 'pending' || absence.status === 'approved')
      ? () => onCancel?.(absence)
      : undefined
  }
  onDelete={canDelete ? () => onDelete?.(absence.id) : undefined}
  locale={locale}
/>
```

**Import additions**: Add `Edit`, `Ban` from `lucide-react`.

#### 5.2 `apps/web/src/app/[locale]/(dashboard)/absences/page.tsx`

**Changes**:

1. **Add state for detail, edit, and cancel sheets**:

```ts
const [selectedAbsence, setSelectedAbsence] = useState<Absence | null>(null)
const [detailOpen, setDetailOpen] = useState(false)
const [editOpen, setEditOpen] = useState(false)
const [cancelOpen, setCancelOpen] = useState(false)
```

Add the `Absence` type import:

```ts
import type { components } from '@/lib/api/types'
type Absence = components['schemas']['Absence']
```

2. **Add handler functions**:

```ts
const handleAbsenceSelect = (absence: Absence) => {
  setSelectedAbsence(absence)
  setDetailOpen(true)
}

const handleEditFromDetail = (absence: Absence) => {
  setDetailOpen(false)
  setSelectedAbsence(absence)
  setEditOpen(true)
}

const handleCancelFromDetail = (absence: Absence) => {
  setDetailOpen(false)
  setSelectedAbsence(absence)
  setCancelOpen(true)
}

const handleDeleteFromDetail = (absence: Absence) => {
  setDetailOpen(false)
  // Reuse existing delete flow or add a new delete dialog
  // For now, this can trigger the PendingRequests delete mechanism
}

const handleEditClick = (absence: Absence) => {
  setSelectedAbsence(absence)
  setEditOpen(true)
}

const handleCancelClick = (absence: Absence) => {
  setSelectedAbsence(absence)
  setCancelOpen(true)
}
```

3. **Wire PendingRequests callbacks**:

```tsx
<PendingRequests
  employeeId={employeeId}
  onSelect={handleAbsenceSelect}
  onEdit={handleEditClick}
  onCancel={handleCancelClick}
/>
```

4. **Add sheet/dialog components at bottom of page**:

```tsx
{/* Absence detail sheet */}
<AbsenceDetailSheet
  absence={selectedAbsence}
  open={detailOpen}
  onOpenChange={setDetailOpen}
  onEdit={handleEditFromDetail}
  onCancel={handleCancelFromDetail}
  onDelete={handleDeleteFromDetail}
/>

{/* Absence edit form sheet */}
<AbsenceEditFormSheet
  absence={selectedAbsence}
  open={editOpen}
  onOpenChange={setEditOpen}
/>

{/* Absence cancel dialog */}
<AbsenceCancelDialog
  absence={selectedAbsence}
  open={cancelOpen}
  onOpenChange={setCancelOpen}
/>
```

5. **Add imports**:

```ts
import { AbsenceDetailSheet } from '@/components/absences/absence-detail-sheet'
import { AbsenceEditFormSheet } from '@/components/absences/absence-edit-form-sheet'
import { AbsenceCancelDialog } from '@/components/absences/absence-cancel-dialog'
```

### Verification

- Clicking an absence card opens the detail sheet
- Detail sheet shows Edit/Cancel/Delete buttons based on status
- Clicking Edit in detail sheet closes detail and opens edit form
- Clicking Cancel in detail sheet closes detail and opens cancel dialog
- Edit and Cancel icon buttons appear on absence cards for pending/approved
- Edit and Cancel icon buttons are hidden for rejected/cancelled absences
- Cancelled absences appear in their own group in PendingRequests
- The `cancelled` status badge renders with outline variant

---

## Phase 6: Translations

**Goal**: Add all new translation keys to both English and German files.

### Files to modify

#### 6.1 `apps/web/messages/en.json` — `"absences"` namespace

Add the following keys (insert after `"halfDayLabel"` at line 411, before `"vacationBalance"`):

```json
"statusCancelled": "Cancelled",
"editAbsence": "Edit Absence",
"editDescription": "Modify the details of this absence request.",
"durationLockedApproved": "Duration cannot be changed after approval.",
"failedToUpdate": "Failed to update absence",
"cancelAbsence": "Cancel Absence",
"cancelConfirmation": "Are you sure you want to cancel this {type} absence on {date}? This action cannot be undone.",
"confirmCancel": "Cancel Absence",
"failedToCancel": "Failed to cancel absence",
"absenceDetails": "Absence Details",
"viewAbsenceInfo": "View absence request information",
"rejectionReasonLabel": "Rejection reason",
"absenceCancelled": "This absence has been cancelled.",
"dateLabel": "Date",
"statusLabel": "Status",
"typeLabel": "Type"
```

#### 6.2 `apps/web/messages/de.json` — `"absences"` namespace

Add corresponding German translations:

```json
"statusCancelled": "Storniert",
"editAbsence": "Abwesenheit bearbeiten",
"editDescription": "Details dieses Abwesenheitsantrags bearbeiten.",
"durationLockedApproved": "Die Dauer kann nach der Genehmigung nicht mehr geaendert werden.",
"failedToUpdate": "Abwesenheit konnte nicht aktualisiert werden",
"cancelAbsence": "Abwesenheit stornieren",
"cancelConfirmation": "Moechten Sie diese {type}-Abwesenheit am {date} wirklich stornieren? Diese Aktion kann nicht rueckgaengig gemacht werden.",
"confirmCancel": "Abwesenheit stornieren",
"failedToCancel": "Abwesenheit konnte nicht storniert werden",
"absenceDetails": "Abwesenheitsdetails",
"viewAbsenceInfo": "Informationen zum Abwesenheitsantrag anzeigen",
"rejectionReasonLabel": "Ablehnungsgrund",
"absenceCancelled": "Diese Abwesenheit wurde storniert.",
"dateLabel": "Datum",
"statusLabel": "Status",
"typeLabel": "Art"
```

### Verification

- All new translation keys are present in both `en.json` and `de.json`
- JSON files are valid (no syntax errors)
- No translation key references in components produce missing-key warnings at runtime

---

## Phase 7: Integration and Verification

**Goal**: End-to-end verification of all features working together.

### 7.1 Full Flow Testing

Run the dev environment (`make dev`) and verify the following scenarios manually:

1. **View absence detail**:
   - Click any absence card in PendingRequests
   - Detail sheet opens with correct info (type, date, duration, notes, status)
   - Close button works

2. **Edit pending absence**:
   - Open a pending absence's edit form (via card icon or detail sheet Edit button)
   - Duration radio group is enabled
   - Change duration from Full to Half day
   - Edit notes
   - Submit -> absence updates, sheet closes, list refreshes

3. **Edit approved absence (notes only)**:
   - Open an approved absence's edit form
   - Duration radio group is disabled with explanatory text
   - Edit notes field
   - Submit -> notes update, sheet closes

4. **Cancel pending absence**:
   - Click Cancel on a pending absence card (or from detail sheet)
   - Confirmation dialog appears with destructive styling
   - Confirm -> status changes to "cancelled"
   - Absence moves to cancelled group, edit/cancel buttons disappear

5. **Cancel approved absence**:
   - Click Cancel on an approved absence
   - Confirmation dialog appears
   - Confirm -> status changes to "cancelled"

6. **View rejected absence**:
   - Open detail sheet for a rejected absence
   - Rejection reason alert is visible
   - No Edit or Cancel buttons in footer
   - Delete button is visible

7. **View cancelled absence**:
   - Open detail sheet for a cancelled absence
   - Cancellation info alert is visible
   - No Edit, Cancel, or Delete buttons in footer

8. **Status badge rendering**:
   - Pending: secondary (gray) badge
   - Approved: default (green) badge
   - Rejected: destructive (red) badge
   - Cancelled: outline badge

### 7.2 TypeScript Compilation

```bash
cd apps/web && npx tsc --noEmit
```

### 7.3 Build Verification

```bash
cd apps/web && npm run build
```

### 7.4 Lint Check

```bash
cd apps/web && npm run lint
```

---

## File Summary

### New files (3)
| File | Purpose |
|------|---------|
| `apps/web/src/components/absences/absence-edit-form-sheet.tsx` | Edit form sheet for duration + notes |
| `apps/web/src/components/absences/absence-cancel-dialog.tsx` | Cancel confirmation dialog |
| `apps/web/src/components/absences/absence-detail-sheet.tsx` | Read-only detail view with actions |

### Modified files (5)
| File | Changes |
|------|---------|
| `apps/web/src/hooks/api/use-absences.ts` | Add `useUpdateAbsence` hook |
| `apps/web/src/hooks/api/index.ts` | Export `useUpdateAbsence` |
| `apps/web/src/components/absences/pending-requests.tsx` | Add cancelled status, edit/cancel buttons, wire callbacks |
| `apps/web/src/app/[locale]/(dashboard)/absences/page.tsx` | Wire detail/edit/cancel sheets with state management |
| `apps/web/messages/en.json` | Add ~16 new translation keys in absences namespace |
| `apps/web/messages/de.json` | Add ~16 new German translation keys in absences namespace |

### Component dependency graph

```
absences/page.tsx
  +-- PendingRequests (extended with onSelect, onEdit, onCancel)
  +-- AbsenceDetailSheet (NEW)
  |     +-- onEdit -> opens AbsenceEditFormSheet
  |     +-- onCancel -> opens AbsenceCancelDialog
  |     +-- onDelete -> triggers delete flow
  +-- AbsenceEditFormSheet (NEW)
  |     +-- useUpdateAbsence (NEW hook)
  +-- AbsenceCancelDialog (NEW)
  |     +-- ConfirmDialog (existing reusable)
  |     +-- useUpdateAbsence (NEW hook)
  +-- AbsenceRequestForm (existing, unchanged)
```
