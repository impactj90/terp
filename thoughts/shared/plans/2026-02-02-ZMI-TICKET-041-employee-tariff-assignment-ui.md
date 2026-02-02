# Employee Tariff Assignment UI Implementation Plan

## Overview

Implement a tariff assignment management interface embedded within a new employee detail page. This provides admins with the ability to view, create, edit, and delete tariff assignments (with effective date ranges) for individual employees, plus preview which tariff is effective on any given date.

The backend API is fully implemented (ZMI-TICKET-018). This plan covers the frontend: API hooks, components, translations, and the employee detail page that hosts the tariff assignment tab.

## Current State Analysis

### What Exists
- **Backend**: Full CRUD endpoints for employee tariff assignments + effective tariff preview (`apps/api/internal/handler/employeetariffassignment.go`). Routes registered at lines 930-956 of `routes.go`.
- **OpenAPI spec**: Paths in `api/paths/employee-tariff-assignments.yaml`, schemas in `api/schemas/employee-tariff-assignments.yaml`. Referenced in `api/openapi.yaml`.
- **Employee list page**: `apps/web/src/app/[locale]/(dashboard)/admin/employees/page.tsx` with data table, quick-view detail sheet, form sheet, and delete dialog.
- **Employee detail sheet**: `apps/web/src/components/employees/employee-detail-sheet.tsx` -- a side sheet showing employee info sections (Contact, Employment, Contract, Access Cards, Contacts).
- **Tariff hooks**: `apps/web/src/hooks/api/use-tariffs.ts` -- `useTariffs({ active: true })` available for the tariff selector dropdown.
- **UI components**: Sheet, Button, Badge, Calendar, Popover, Select, Input, Textarea, Label, Alert, ScrollArea, Skeleton, Tabs, Table, ConfirmDialog, Switch, DropdownMenu.

### What Is Missing
- **Frontend types**: `apps/web/src/lib/api/types.ts` does NOT include tariff-assignment paths. Running `make generate-web` is required.
- **Employee detail page**: Route `apps/web/src/app/[locale]/(dashboard)/admin/employees/[id]/page.tsx` does not exist. No `[id]` detail pages exist anywhere in the app.
- **Tariff assignment hooks**: No hooks for employee tariff assignment CRUD or effective tariff.
- **Tariff assignment components**: No list, form, delete dialog, or preview components.
- **Translation keys**: No `employeeTariffAssignments` namespace in `en.json` / `de.json`.

### Key Discoveries
- Hook pattern for employee sub-resources: `apps/web/src/hooks/api/use-employee-contacts.ts` (line 11-16, 30-34)
- Form sheet pattern: `apps/web/src/components/tariffs/tariff-form-sheet.tsx` (full file -- Sheet/ScrollArea/SheetFooter, useState, useEffect reset, error catch)
- Date picker pattern: Popover + Calendar in `tariff-form-sheet.tsx` (lines 500-527)
- Delete dialog: `apps/web/src/components/ui/confirm-dialog.tsx` -- reusable ConfirmDialog with `variant="destructive"`
- Error handling: `apps/web/src/lib/api/errors.ts` -- `parseApiError()`, `isHttpStatus()`, `getErrorMessage(409)` returns conflict message
- Translations: Single flat JSON per locale, camelCase namespace keys, `useTranslations('namespace')` pattern
- Tab pattern: `apps/web/src/app/[locale]/(dashboard)/admin/approvals/page.tsx` uses Tabs/TabsList/TabsTrigger/TabsContent
- Row click navigates to detail in employee data table: `onClick={() => onView(employee)}` at line 133

## Desired End State

After implementation, an admin navigating to `/admin/employees/{id}` sees a full detail page with two tabs:

1. **Overview tab**: Employee information (personal, employment, contract, access cards, contacts) -- same content currently in the detail sheet.
2. **Tariff Assignments tab**: Timeline-style list of all tariff assignments, effective tariff preview card, and actions to create/edit/delete assignments.

### Verification
- Navigating from employee list to employee detail page works
- Overview tab shows all employee information
- Tariff assignment list displays assignments in timeline order
- Create form submits and new assignment appears in list
- Edit form updates an existing assignment
- Delete dialog removes an assignment
- 409 overlap error shows inline in form
- Effective tariff preview resolves correct tariff for any date
- All text uses translation keys (EN and DE both work)

## What We Are NOT Doing

- Tariff CRUD (separate existing page at `/admin/tariffs`)
- Employee creation/editing (existing `EmployeeFormSheet`)
- Bulk tariff assignment across multiple employees (existing `BulkActions` component)
- Modifying any backend API endpoints
- Adding new sidebar navigation entries (the detail page is accessed via the employee list)

## Implementation Approach

Five phases, each independently testable:

1. **Foundation**: Generate frontend types, create API hooks, add all translation keys
2. **Employee Detail Page**: Create the `[id]` route with tabbed layout and Overview tab
3. **Tariff Assignment List**: Build the timeline-style list component for the Tariff Assignments tab
4. **Form Sheet + Delete Dialog**: Build create/edit form and delete confirmation
5. **Effective Tariff Preview + Wiring**: Build the preview card and integrate everything

---

## Phase 1: Foundation (Types, Hooks, Translations)

### Overview
Generate TypeScript types from the OpenAPI spec, create API hooks for all tariff assignment endpoints, and add all translation keys needed by the UI.

### Changes Required

#### 1. Generate Frontend Types
**Action**: Run `make generate-web` from the project root.
This bundles the OpenAPI spec and generates `apps/web/src/lib/api/types.ts` with paths for:
- `GET /employees/{id}/tariff-assignments`
- `POST /employees/{id}/tariff-assignments`
- `GET /employees/{id}/tariff-assignments/{assignmentId}`
- `PUT /employees/{id}/tariff-assignments/{assignmentId}`
- `DELETE /employees/{id}/tariff-assignments/{assignmentId}`
- `GET /employees/{id}/effective-tariff`

#### 2. API Hooks
**File**: `apps/web/src/hooks/api/use-employee-tariff-assignments.ts` (new)

Follow the pattern from `use-employee-contacts.ts` and `use-absences.ts`:

```tsx
import { useApiQuery, useApiMutation } from '@/hooks'

/**
 * Hook to fetch all tariff assignments for an employee.
 */
export function useEmployeeTariffAssignments(
  employeeId: string,
  options?: { active?: boolean; enabled?: boolean }
) {
  return useApiQuery('/employees/{id}/tariff-assignments', {
    path: { id: employeeId },
    params: { active: options?.active },
    enabled: (options?.enabled ?? true) && !!employeeId,
  })
}

/**
 * Hook to fetch a single tariff assignment.
 */
export function useEmployeeTariffAssignment(
  employeeId: string,
  assignmentId: string,
  enabled = true
) {
  return useApiQuery('/employees/{id}/tariff-assignments/{assignmentId}', {
    path: { id: employeeId, assignmentId },
    enabled: enabled && !!employeeId && !!assignmentId,
  })
}

/**
 * Hook to create a tariff assignment for an employee.
 */
export function useCreateEmployeeTariffAssignment() {
  return useApiMutation('/employees/{id}/tariff-assignments', 'post', {
    invalidateKeys: [
      ['/employees/{id}/tariff-assignments'],
      ['/employees/{id}/effective-tariff'],
      ['/employees'],
    ],
  })
}

/**
 * Hook to update a tariff assignment.
 */
export function useUpdateEmployeeTariffAssignment() {
  return useApiMutation('/employees/{id}/tariff-assignments/{assignmentId}', 'put', {
    invalidateKeys: [
      ['/employees/{id}/tariff-assignments'],
      ['/employees/{id}/effective-tariff'],
      ['/employees'],
    ],
  })
}

/**
 * Hook to delete a tariff assignment.
 */
export function useDeleteEmployeeTariffAssignment() {
  return useApiMutation('/employees/{id}/tariff-assignments/{assignmentId}', 'delete', {
    invalidateKeys: [
      ['/employees/{id}/tariff-assignments'],
      ['/employees/{id}/effective-tariff'],
      ['/employees'],
    ],
  })
}

/**
 * Hook to get the effective tariff for an employee on a specific date.
 */
export function useEffectiveTariff(
  employeeId: string,
  date: string,
  enabled = true
) {
  return useApiQuery('/employees/{id}/effective-tariff', {
    path: { id: employeeId },
    params: { date },
    enabled: enabled && !!employeeId && !!date,
  })
}
```

#### 3. Export Hooks from Index
**File**: `apps/web/src/hooks/api/index.ts`

Add after the existing Tariffs export block:

```tsx
// Employee Tariff Assignments
export {
  useEmployeeTariffAssignments,
  useEmployeeTariffAssignment,
  useCreateEmployeeTariffAssignment,
  useUpdateEmployeeTariffAssignment,
  useDeleteEmployeeTariffAssignment,
  useEffectiveTariff,
} from './use-employee-tariff-assignments'
```

#### 4. Translation Keys
**File**: `apps/web/messages/en.json`

Add the `employeeTariffAssignments` namespace (insert after `adminEmployees` section):

```json
"employeeTariffAssignments": {
  "tabLabel": "Tariff Assignments",
  "tabOverview": "Overview",
  "listTitle": "Tariff Assignments",
  "addAssignment": "Add Assignment",
  "filterAll": "All",
  "filterActive": "Active",
  "filterInactive": "Inactive",
  "emptyTitle": "No tariff assignments",
  "emptyDescription": "This employee uses the default tariff. Add an assignment to override the tariff for specific date ranges.",
  "emptyViewEffective": "View effective tariff",
  "currentAssignment": "Current",
  "openEnded": "Open-ended",
  "overwriteBehaviorOverwrite": "Overwrite",
  "overwriteBehaviorPreserveManual": "Preserve Manual",
  "sourceAssignment": "Assignment",
  "sourceDefault": "Default",
  "sourceNone": "None",
  "editAction": "Edit",
  "deleteAction": "Delete",
  "formCreateTitle": "New Tariff Assignment",
  "formCreateDescription": "Assign a tariff to this employee for a specific date range.",
  "formEditTitle": "Edit Tariff Assignment",
  "formEditDescription": "Modify the tariff assignment dates, behavior, or notes.",
  "fieldTariff": "Tariff",
  "fieldTariffPlaceholder": "Select a tariff",
  "fieldEffectiveFrom": "Effective From",
  "fieldEffectiveTo": "Effective To",
  "fieldEffectiveToHelp": "Leave empty for an open-ended assignment",
  "fieldOverwriteBehavior": "Overwrite Behavior",
  "fieldOverwriteBehaviorHelp": "Controls whether manual day-plan edits are preserved when syncing",
  "fieldNotes": "Notes",
  "fieldNotesPlaceholder": "Optional notes about this assignment",
  "pickDate": "Pick a date",
  "cancel": "Cancel",
  "create": "Create Assignment",
  "saveChanges": "Save Changes",
  "creating": "Creating...",
  "saving": "Saving...",
  "validationTariffRequired": "Please select a tariff",
  "validationEffectiveFromRequired": "Effective from date is required",
  "validationDateOrder": "Effective to must be on or after effective from",
  "errorCreateFailed": "Failed to create tariff assignment",
  "errorUpdateFailed": "Failed to update tariff assignment",
  "errorOverlap": "Date range overlaps with an existing assignment. Please adjust the dates.",
  "deleteTitle": "Delete Tariff Assignment",
  "deleteDescription": "Are you sure you want to delete the tariff assignment for {tariffName} ({dateRange})?",
  "deleteConfirm": "Delete",
  "errorDeleteFailed": "Failed to delete tariff assignment",
  "previewTitle": "Effective Tariff",
  "previewDateLabel": "Date",
  "previewTariffLabel": "Tariff",
  "previewSourceLabel": "Source",
  "previewNoTariff": "No tariff assigned for this date",
  "previewDateRange": "Date Range",
  "backToList": "Back to Employees"
}
```

**File**: `apps/web/messages/de.json`

Add the equivalent German translations:

```json
"employeeTariffAssignments": {
  "tabLabel": "Tarifzuweisungen",
  "tabOverview": "Uebersicht",
  "listTitle": "Tarifzuweisungen",
  "addAssignment": "Zuweisung hinzufuegen",
  "filterAll": "Alle",
  "filterActive": "Aktiv",
  "filterInactive": "Inaktiv",
  "emptyTitle": "Keine Tarifzuweisungen",
  "emptyDescription": "Dieser Mitarbeiter verwendet den Standardtarif. Fuegen Sie eine Zuweisung hinzu, um den Tarif fuer bestimmte Zeitraeume zu ueberschreiben.",
  "emptyViewEffective": "Effektiven Tarif anzeigen",
  "currentAssignment": "Aktuell",
  "openEnded": "Unbefristet",
  "overwriteBehaviorOverwrite": "Ueberschreiben",
  "overwriteBehaviorPreserveManual": "Manuell beibehalten",
  "sourceAssignment": "Zuweisung",
  "sourceDefault": "Standard",
  "sourceNone": "Kein Tarif",
  "editAction": "Bearbeiten",
  "deleteAction": "Loeschen",
  "formCreateTitle": "Neue Tarifzuweisung",
  "formCreateDescription": "Weisen Sie diesem Mitarbeiter einen Tarif fuer einen bestimmten Zeitraum zu.",
  "formEditTitle": "Tarifzuweisung bearbeiten",
  "formEditDescription": "Aendern Sie Zeitraum, Verhalten oder Notizen der Tarifzuweisung.",
  "fieldTariff": "Tarif",
  "fieldTariffPlaceholder": "Tarif auswaehlen",
  "fieldEffectiveFrom": "Gueltig ab",
  "fieldEffectiveTo": "Gueltig bis",
  "fieldEffectiveToHelp": "Leer lassen fuer unbefristete Zuweisung",
  "fieldOverwriteBehavior": "Ueberschreibverhalten",
  "fieldOverwriteBehaviorHelp": "Legt fest, ob manuelle Tagesplan-Aenderungen beim Synchronisieren beibehalten werden",
  "fieldNotes": "Notizen",
  "fieldNotesPlaceholder": "Optionale Notizen zu dieser Zuweisung",
  "pickDate": "Datum waehlen",
  "cancel": "Abbrechen",
  "create": "Zuweisung erstellen",
  "saveChanges": "Aenderungen speichern",
  "creating": "Wird erstellt...",
  "saving": "Wird gespeichert...",
  "validationTariffRequired": "Bitte waehlen Sie einen Tarif aus",
  "validationEffectiveFromRequired": "Gueltig-ab-Datum ist erforderlich",
  "validationDateOrder": "Gueltig-bis muss gleich oder nach Gueltig-ab liegen",
  "errorCreateFailed": "Tarifzuweisung konnte nicht erstellt werden",
  "errorUpdateFailed": "Tarifzuweisung konnte nicht aktualisiert werden",
  "errorOverlap": "Der Zeitraum ueberschneidet sich mit einer bestehenden Zuweisung. Bitte passen Sie die Daten an.",
  "deleteTitle": "Tarifzuweisung loeschen",
  "deleteDescription": "Sind Sie sicher, dass Sie die Tarifzuweisung fuer {tariffName} ({dateRange}) loeschen moechten?",
  "deleteConfirm": "Loeschen",
  "errorDeleteFailed": "Tarifzuweisung konnte nicht geloescht werden",
  "previewTitle": "Effektiver Tarif",
  "previewDateLabel": "Datum",
  "previewTariffLabel": "Tarif",
  "previewSourceLabel": "Quelle",
  "previewNoTariff": "Kein Tarif fuer dieses Datum zugewiesen",
  "previewDateRange": "Zeitraum",
  "backToList": "Zurueck zur Mitarbeiterliste"
}
```

### Success Criteria

#### Automated Verification:
- [ ] `make generate-web` completes without errors
- [ ] `grep -c "tariff-assignments" apps/web/src/lib/api/types.ts` returns >0 (types exist)
- [ ] TypeScript compilation passes: `cd apps/web && pnpm run typecheck` (if available) or `pnpm run build`
- [ ] No linting errors in new hook file: `cd apps/web && pnpm run lint`

#### Manual Verification:
- [ ] Confirm the six hooks are exported from `apps/web/src/hooks/api/index.ts`
- [ ] Confirm translation keys are present in both `en.json` and `de.json`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to Phase 2.

---

## Phase 2: Employee Detail Page with Tabbed Layout

### Overview
Create the employee detail page at `/admin/employees/[id]` with a tabbed layout. The Overview tab displays all employee information currently shown in the detail sheet. The Tariff Assignments tab is a placeholder for Phase 3. Update the employee list page to navigate to this detail page.

### Changes Required

#### 1. Employee Detail Page
**File**: `apps/web/src/app/[locale]/(dashboard)/admin/employees/[id]/page.tsx` (new)

This is the first `[id]` detail page in the app. Structure:

```tsx
'use client'

import * as React from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { ArrowLeft, Edit, UserX, Clock, Mail, Phone } from 'lucide-react'
import { format } from 'date-fns'
import { useAuth } from '@/providers/auth-provider'
import { useHasRole } from '@/hooks'
import { useEmployee } from '@/hooks/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { StatusBadge } from '@/components/employees/status-badge'
import { EmployeeFormSheet } from '@/components/employees/employee-form-sheet'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useDeleteEmployee } from '@/hooks/api'
import type { components } from '@/lib/api/types'

type Employee = components['schemas']['Employee']

export default function EmployeeDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const { isLoading: authLoading } = useAuth()
  const isAdmin = useHasRole(['admin'])
  const t = useTranslations('adminEmployees')
  const ta = useTranslations('employeeTariffAssignments')

  const employeeId = params.id
  const { data: employee, isLoading } = useEmployee(employeeId, !authLoading && isAdmin)

  // Edit / delete state
  const [editOpen, setEditOpen] = React.useState(false)
  const [deleteOpen, setDeleteOpen] = React.useState(false)
  const deleteMutation = useDeleteEmployee()

  // Redirect if not admin
  React.useEffect(() => {
    if (!authLoading && !isAdmin) {
      router.push('/dashboard')
    }
  }, [authLoading, isAdmin, router])

  const handleConfirmDelete = async () => {
    if (!employee) return
    try {
      await deleteMutation.mutateAsync({ path: { id: employee.id } })
      router.push('/admin/employees')
    } catch {
      // Error handled by mutation
    }
  }

  const formatDate = (date: string | undefined | null) => {
    if (!date) return '-'
    return format(new Date(date), 'dd.MM.yyyy')
  }

  if (authLoading || isLoading) {
    return <DetailPageSkeleton />
  }

  if (!employee) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">{t('employeeNotFound')}</p>
        <Button variant="outline" className="mt-4" onClick={() => router.push('/admin/employees')}>
          {ta('backToList')}
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push('/admin/employees')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-4 flex-1">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-lg font-medium">
            {employee.first_name[0]}{employee.last_name[0]}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">
                {employee.first_name} {employee.last_name}
              </h1>
              <StatusBadge isActive={employee.is_active} exitDate={employee.exit_date} />
            </div>
            <p className="text-muted-foreground">{employee.personnel_number}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => router.push(`/timesheet?employee=${employee.id}`)}>
              <Clock className="mr-2 h-4 w-4" />
              {t('viewTimesheet')}
            </Button>
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              <Edit className="mr-2 h-4 w-4" />
              {t('edit')}
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setDeleteOpen(true)}>
              <UserX className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        </div>
      </div>

      {/* Tabbed content */}
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">{ta('tabOverview')}</TabsTrigger>
          <TabsTrigger value="tariff-assignments">{ta('tabLabel')}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6">
          {/* Overview content -- same sections as employee-detail-sheet */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Contact Information */}
            <Card>
              <CardContent className="pt-6">
                <h3 className="text-sm font-medium text-muted-foreground mb-4">{t('sectionContact')}</h3>
                <div className="space-y-3">
                  <DetailRow icon={<Mail className="h-4 w-4" />} label={t('labelEmail')} value={employee.email} />
                  <DetailRow icon={<Phone className="h-4 w-4" />} label={t('labelPhone')} value={employee.phone} />
                </div>
              </CardContent>
            </Card>

            {/* Employment Details */}
            <Card>
              <CardContent className="pt-6">
                <h3 className="text-sm font-medium text-muted-foreground mb-4">{t('sectionEmployment')}</h3>
                <div className="space-y-3">
                  <DetailRow label={t('labelDepartment')} value={employee.department?.name} />
                  <DetailRow label={t('labelCostCenter')} value={employee.cost_center ? `${employee.cost_center.name} (${employee.cost_center.code})` : undefined} />
                  <DetailRow label={t('labelEmploymentType')} value={employee.employment_type?.name} />
                  <DetailRow label={t('labelTariff')} value={employee.tariff ? `${employee.tariff.code} - ${employee.tariff.name}` : undefined} />
                  <DetailRow label={t('labelEntryDate')} value={formatDate(employee.entry_date)} />
                  <DetailRow label={t('labelExitDate')} value={formatDate(employee.exit_date)} />
                </div>
              </CardContent>
            </Card>

            {/* Contract Details */}
            <Card>
              <CardContent className="pt-6">
                <h3 className="text-sm font-medium text-muted-foreground mb-4">{t('sectionContract')}</h3>
                <div className="space-y-3">
                  <DetailRow label={t('labelWeeklyHours')} value={employee.weekly_hours ? t('weeklyHoursValue', { hours: employee.weekly_hours }) : undefined} />
                  <DetailRow label={t('labelVacationDays')} value={employee.vacation_days_per_year ? t('vacationDaysValue', { days: employee.vacation_days_per_year }) : undefined} />
                </div>
              </CardContent>
            </Card>

            {/* Access Cards */}
            {employee.cards && employee.cards.length > 0 && (
              <Card>
                <CardContent className="pt-6">
                  <h3 className="text-sm font-medium text-muted-foreground mb-4">{t('sectionAccessCards')}</h3>
                  <div className="space-y-2">
                    {employee.cards.map((card) => (
                      <div key={card.id} className="flex items-center justify-between p-2 rounded-md bg-muted/50">
                        <div>
                          <p className="text-sm font-medium">{card.card_number}</p>
                          <p className="text-xs text-muted-foreground capitalize">{card.card_type}</p>
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${card.is_active ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'}`}>
                          {card.is_active ? t('statusActive') : t('statusInactive')}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="tariff-assignments" className="mt-6">
          {/* Tariff Assignments tab -- filled in Phase 3 */}
          <p className="text-muted-foreground">{ta('emptyTitle')}</p>
        </TabsContent>
      </Tabs>

      {/* Edit Sheet */}
      <EmployeeFormSheet
        open={editOpen}
        onOpenChange={setEditOpen}
        employee={employee}
        onSuccess={() => setEditOpen(false)}
      />

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={t('deactivateEmployee')}
        description={t('deactivateDescription', { firstName: employee.first_name, lastName: employee.last_name })}
        confirmLabel={t('deactivate')}
        variant="destructive"
        isLoading={deleteMutation.isPending}
        onConfirm={handleConfirmDelete}
      />
    </div>
  )
}

function DetailRow({ icon, label, value }: { icon?: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      {icon && <div className="text-muted-foreground mt-0.5">{icon}</div>}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-sm font-medium truncate">{value || '-'}</p>
      </div>
    </div>
  )
}

function DetailPageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Skeleton className="h-10 w-10 rounded" />
        <Skeleton className="h-12 w-12 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-24" />
        </div>
      </div>
      <Skeleton className="h-10 w-64" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
      </div>
    </div>
  )
}
```

#### 2. Update Employee List Page Navigation
**File**: `apps/web/src/app/[locale]/(dashboard)/admin/employees/page.tsx`

Update the `handleView` function (around line 88) to navigate to the detail page instead of opening the detail sheet:

```tsx
// Change from:
const handleView = (employee: Employee) => {
  setViewEmployee(employee)
}

// Change to:
const handleView = (employee: Employee) => {
  router.push(`/admin/employees/${employee.id}`)
}
```

The existing `viewEmployee` state, `EmployeeDetailSheet`, and related handlers can remain for now (they will simply no longer be triggered from the data table). This keeps the change minimal and non-breaking.

### Success Criteria

#### Automated Verification:
- [ ] Build passes: `cd apps/web && pnpm run build`
- [ ] No linting errors: `cd apps/web && pnpm run lint`
- [ ] Page file exists: `ls apps/web/src/app/\[locale\]/(dashboard)/admin/employees/\[id\]/page.tsx`

#### Manual Verification:
- [ ] Navigating to `/admin/employees/{valid-id}` shows the detail page with two tabs
- [ ] Overview tab displays employee info in card layout
- [ ] Tariff Assignments tab shows placeholder text
- [ ] Back button returns to employee list
- [ ] Edit button opens form sheet, Delete button opens confirmation
- [ ] Clicking an employee row in the list navigates to the detail page

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to Phase 3.

---

## Phase 3: Tariff Assignment List Component

### Overview
Build the timeline-style list of tariff assignments. This component displays assignments ordered by `effective_from` descending, highlights the current assignment, supports active/inactive filtering, and provides row actions for edit and delete.

### Changes Required

#### 1. Tariff Assignment List Component
**File**: `apps/web/src/components/employees/tariff-assignments/tariff-assignment-list.tsx` (new)

```tsx
'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { format } from 'date-fns'
import { Plus, Edit, Trash2, Calendar } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { MoreHorizontal } from 'lucide-react'
import { useEmployeeTariffAssignments } from '@/hooks/api'
import type { components } from '@/lib/api/types'

type TariffAssignment = components['schemas']['EmployeeTariffAssignment']

interface TariffAssignmentListProps {
  employeeId: string
  onAdd: () => void
  onEdit: (assignment: TariffAssignment) => void
  onDelete: (assignment: TariffAssignment) => void
}
```

Key design decisions:
- **Timeline style**: Each assignment rendered as a card with left border accent. Current assignment gets `border-l-primary` and a "Current" badge.
- **Active filter**: Three toggle buttons at the top (All / Active / Inactive) using `activeFilter` state.
- **Current detection**: Compare today's date against each assignment's `effective_from` / `effective_to` range.
- **Sort order**: `effective_from` descending (most recent first) -- the API returns them in this order.
- **Row actions**: DropdownMenu with Edit and Delete items.
- **Empty state**: Shows message about default tariff with "Add Assignment" button.

The component fetches data using `useEmployeeTariffAssignments(employeeId, { active: activeFilter })`.

Each timeline item:
```
[Left accent border] [Tariff code - name]
                      [effective_from -> effective_to or "Open-ended"]
                      [Overwrite behavior badge] [Active/Inactive badge]
                      [...actions dropdown]
```

#### 2. Barrel Export
**File**: `apps/web/src/components/employees/tariff-assignments/index.ts` (new)

```tsx
export { TariffAssignmentList } from './tariff-assignment-list'
```

#### 3. Integrate into Detail Page
**File**: `apps/web/src/app/[locale]/(dashboard)/admin/employees/[id]/page.tsx`

Replace the placeholder in the Tariff Assignments TabsContent with:

```tsx
import { TariffAssignmentList } from '@/components/employees/tariff-assignments'

// In the component, add state for managing form/delete sheets:
const [formOpen, setFormOpen] = React.useState(false)
const [editAssignment, setEditAssignment] = React.useState<TariffAssignment | null>(null)
const [deleteAssignment, setDeleteAssignment] = React.useState<TariffAssignment | null>(null)

// In the TabsContent:
<TabsContent value="tariff-assignments" className="mt-6">
  <TariffAssignmentList
    employeeId={employeeId}
    onAdd={() => { setEditAssignment(null); setFormOpen(true) }}
    onEdit={(a) => { setEditAssignment(a); setFormOpen(true) }}
    onDelete={(a) => setDeleteAssignment(a)}
  />
</TabsContent>
```

### Success Criteria

#### Automated Verification:
- [ ] Build passes: `cd apps/web && pnpm run build`
- [ ] No linting errors: `cd apps/web && pnpm run lint`

#### Manual Verification:
- [ ] Tariff Assignments tab shows the list (or empty state if no assignments)
- [ ] Active/Inactive filter toggles work
- [ ] Current assignment has visual highlight and "Current" badge
- [ ] Add Assignment button is visible at top
- [ ] Row action menu shows Edit and Delete options
- [ ] Timeline ordering is `effective_from` descending

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to Phase 4.

---

## Phase 4: Form Sheet + Delete Dialog

### Overview
Build the create/edit form sheet for tariff assignments with tariff selector, date pickers, overwrite behavior select, and notes. Also build the delete confirmation dialog. Handle 409 conflict errors specifically.

### Changes Required

#### 1. Tariff Assignment Form Sheet
**File**: `apps/web/src/components/employees/tariff-assignments/tariff-assignment-form-sheet.tsx` (new)

Follow the pattern from `apps/web/src/components/tariffs/tariff-form-sheet.tsx`:

**Props interface:**
```tsx
interface TariffAssignmentFormSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  employeeId: string
  assignment?: TariffAssignment | null  // null/undefined = create mode
  onSuccess?: () => void
}
```

**Form state:**
```tsx
interface FormState {
  tariffId: string
  effectiveFrom: Date | undefined
  effectiveTo: Date | undefined
  overwriteBehavior: 'overwrite' | 'preserve_manual'
  notes: string
}

const INITIAL_STATE: FormState = {
  tariffId: '',
  effectiveFrom: undefined,
  effectiveTo: undefined,
  overwriteBehavior: 'preserve_manual',
  notes: '',
}
```

**Form fields (top to bottom):**
1. **Tariff selector** -- Select dropdown populated by `useTariffs({ active: true })`. Shows `code - name`. Disabled in edit mode (cannot change tariff after creation -- or allow it if the schema permits... checking the `UpdateEmployeeTariffAssignmentRequest` schema: it does NOT include `tariff_id`, so tariff cannot be changed after creation). **The tariff field is disabled in edit mode.**
2. **Effective From** -- Date picker (Popover + Calendar), required
3. **Effective To** -- Date picker (Popover + Calendar), optional. Helper text: "Leave empty for an open-ended assignment". Include a clear button to set back to undefined.
4. **Overwrite Behavior** -- Select with two options: "overwrite" and "preserve_manual". Default: "preserve_manual".
5. **Notes** -- Textarea, optional

**Validation:**
```tsx
function validateForm(form: FormState, isEdit: boolean): string[] {
  const errors: string[] = []
  if (!isEdit && !form.tariffId) errors.push(t('validationTariffRequired'))
  if (!form.effectiveFrom) errors.push(t('validationEffectiveFromRequired'))
  if (form.effectiveFrom && form.effectiveTo && form.effectiveTo < form.effectiveFrom) {
    errors.push(t('validationDateOrder'))
  }
  return errors
}
```

**Submit handler:**
```tsx
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault()
  setError(null)

  const errors = validateForm(form, isEdit)
  if (errors.length > 0) {
    setError(errors.join('. '))
    return
  }

  try {
    if (isEdit && assignment) {
      await updateMutation.mutateAsync({
        path: { id: employeeId, assignmentId: assignment.id },
        body: {
          effective_from: format(form.effectiveFrom!, 'yyyy-MM-dd'),
          effective_to: form.effectiveTo ? format(form.effectiveTo, 'yyyy-MM-dd') : undefined,
          overwrite_behavior: form.overwriteBehavior,
          notes: form.notes || undefined,
        },
      })
    } else {
      await createMutation.mutateAsync({
        path: { id: employeeId },
        body: {
          tariff_id: form.tariffId,
          effective_from: format(form.effectiveFrom!, 'yyyy-MM-dd'),
          effective_to: form.effectiveTo ? format(form.effectiveTo, 'yyyy-MM-dd') : undefined,
          overwrite_behavior: form.overwriteBehavior,
          notes: form.notes || undefined,
        },
      })
    }
    onSuccess?.()
  } catch (err) {
    // 409 Conflict: overlapping assignment
    const apiError = err as { status?: number; detail?: string; message?: string }
    if (apiError.status === 409) {
      setError(t('errorOverlap'))
    } else {
      setError(apiError.detail ?? apiError.message ?? t(isEdit ? 'errorUpdateFailed' : 'errorCreateFailed'))
    }
  }
}
```

**Layout**: Same Sheet/ScrollArea/SheetFooter pattern as tariff-form-sheet.

#### 2. Delete Confirmation Dialog
**File**: `apps/web/src/components/employees/tariff-assignments/tariff-assignment-delete-dialog.tsx` (new)

This is a thin wrapper around `ConfirmDialog`:

```tsx
'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { format } from 'date-fns'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useDeleteEmployeeTariffAssignment } from '@/hooks/api'
import type { components } from '@/lib/api/types'

type TariffAssignment = components['schemas']['EmployeeTariffAssignment']

interface TariffAssignmentDeleteDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  employeeId: string
  assignment: TariffAssignment | null
  onSuccess?: () => void
}

export function TariffAssignmentDeleteDialog({
  open,
  onOpenChange,
  employeeId,
  assignment,
  onSuccess,
}: TariffAssignmentDeleteDialogProps) {
  const t = useTranslations('employeeTariffAssignments')
  const deleteMutation = useDeleteEmployeeTariffAssignment()

  const tariffName = assignment?.tariff
    ? `${assignment.tariff.code} - ${assignment.tariff.name}`
    : '—'

  const dateRange = assignment
    ? `${format(new Date(assignment.effective_from), 'dd.MM.yyyy')} – ${
        assignment.effective_to
          ? format(new Date(assignment.effective_to), 'dd.MM.yyyy')
          : t('openEnded')
      }`
    : ''

  const handleConfirm = async () => {
    if (!assignment) return
    try {
      await deleteMutation.mutateAsync({
        path: { id: employeeId, assignmentId: assignment.id },
      })
      onOpenChange(false)
      onSuccess?.()
    } catch {
      // Error handled by mutation
    }
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('deleteTitle')}
      description={t('deleteDescription', { tariffName, dateRange })}
      confirmLabel={t('deleteConfirm')}
      variant="destructive"
      isLoading={deleteMutation.isPending}
      onConfirm={handleConfirm}
    />
  )
}
```

#### 3. Update Barrel Export
**File**: `apps/web/src/components/employees/tariff-assignments/index.ts`

```tsx
export { TariffAssignmentList } from './tariff-assignment-list'
export { TariffAssignmentFormSheet } from './tariff-assignment-form-sheet'
export { TariffAssignmentDeleteDialog } from './tariff-assignment-delete-dialog'
```

#### 4. Wire into Employee Detail Page
**File**: `apps/web/src/app/[locale]/(dashboard)/admin/employees/[id]/page.tsx`

Import and render the form sheet and delete dialog:

```tsx
import {
  TariffAssignmentList,
  TariffAssignmentFormSheet,
  TariffAssignmentDeleteDialog,
} from '@/components/employees/tariff-assignments'

// After the Tabs close and before the existing EmployeeFormSheet:
<TariffAssignmentFormSheet
  open={formOpen}
  onOpenChange={(open) => {
    if (!open) {
      setFormOpen(false)
      setEditAssignment(null)
    }
  }}
  employeeId={employeeId}
  assignment={editAssignment}
  onSuccess={() => {
    setFormOpen(false)
    setEditAssignment(null)
  }}
/>

<TariffAssignmentDeleteDialog
  open={!!deleteAssignment}
  onOpenChange={(open) => {
    if (!open) setDeleteAssignment(null)
  }}
  employeeId={employeeId}
  assignment={deleteAssignment}
  onSuccess={() => setDeleteAssignment(null)}
/>
```

### Success Criteria

#### Automated Verification:
- [ ] Build passes: `cd apps/web && pnpm run build`
- [ ] No linting errors: `cd apps/web && pnpm run lint`

#### Manual Verification:
- [ ] Click "Add Assignment" opens the form sheet with all fields
- [ ] Tariff dropdown shows active tariffs with code and name
- [ ] Date pickers work for both Effective From and Effective To
- [ ] Overwrite Behavior defaults to "Preserve Manual"
- [ ] Submit creates a new assignment and it appears in the list
- [ ] Click Edit on an existing assignment opens form with pre-filled data
- [ ] Tariff field is disabled in edit mode
- [ ] Update saves changes correctly
- [ ] Creating an overlapping assignment shows "Date range overlaps..." error inline
- [ ] Click Delete opens confirmation dialog with assignment details
- [ ] Confirming delete removes the assignment from the list

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to Phase 5.

---

## Phase 5: Effective Tariff Preview + Final Integration

### Overview
Build the effective tariff preview component that shows which tariff applies for an employee on a given date, and integrate it into the Tariff Assignments tab. Add final polish and ensure all empty states work.

### Changes Required

#### 1. Effective Tariff Preview Component
**File**: `apps/web/src/components/employees/tariff-assignments/effective-tariff-preview.tsx` (new)

```tsx
'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { format } from 'date-fns'
import { CalendarIcon, Info } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { useEffectiveTariff } from '@/hooks/api'

interface EffectiveTariffPreviewProps {
  employeeId: string
}
```

Design:
- Card with title "Effective Tariff"
- Date picker defaulting to today (using `format(new Date(), 'yyyy-MM-dd')` as initial value)
- Debounced query: When date changes, debounce 300ms before calling `useEffectiveTariff`
- Display:
  - **Source badge**: Color-coded -- "Assignment" (primary), "Default" (secondary), "None" (outline)
  - **Tariff name**: `code - name` if tariff exists, otherwise "No tariff assigned for this date"
  - **Date range**: If source is "assignment", show `effective_from` - `effective_to` from the assignment
- Loading state: Skeleton while fetching

Implementation for debounce:
```tsx
const [selectedDate, setSelectedDate] = React.useState<Date>(new Date())
const [debouncedDate, setDebouncedDate] = React.useState(format(new Date(), 'yyyy-MM-dd'))

React.useEffect(() => {
  const timer = setTimeout(() => {
    setDebouncedDate(format(selectedDate, 'yyyy-MM-dd'))
  }, 300)
  return () => clearTimeout(timer)
}, [selectedDate])

const { data, isLoading } = useEffectiveTariff(employeeId, debouncedDate)
```

Source badge variants:
```tsx
function sourceBadgeVariant(source: string) {
  switch (source) {
    case 'assignment': return 'default'   // primary color
    case 'default': return 'secondary'
    case 'none': return 'outline'
    default: return 'outline'
  }
}
```

#### 2. Update Barrel Export
**File**: `apps/web/src/components/employees/tariff-assignments/index.ts`

```tsx
export { TariffAssignmentList } from './tariff-assignment-list'
export { TariffAssignmentFormSheet } from './tariff-assignment-form-sheet'
export { TariffAssignmentDeleteDialog } from './tariff-assignment-delete-dialog'
export { EffectiveTariffPreview } from './effective-tariff-preview'
```

#### 3. Integrate Preview into Tariff Assignments Tab
**File**: `apps/web/src/app/[locale]/(dashboard)/admin/employees/[id]/page.tsx`

Update the Tariff Assignments TabsContent to include the preview above the list:

```tsx
import {
  TariffAssignmentList,
  TariffAssignmentFormSheet,
  TariffAssignmentDeleteDialog,
  EffectiveTariffPreview,
} from '@/components/employees/tariff-assignments'

<TabsContent value="tariff-assignments" className="mt-6 space-y-6">
  <EffectiveTariffPreview employeeId={employeeId} />
  <TariffAssignmentList
    employeeId={employeeId}
    onAdd={() => { setEditAssignment(null); setFormOpen(true) }}
    onEdit={(a) => { setEditAssignment(a); setFormOpen(true) }}
    onDelete={(a) => setDeleteAssignment(a)}
  />
</TabsContent>
```

### Success Criteria

#### Automated Verification:
- [ ] Build passes: `cd apps/web && pnpm run build`
- [ ] No linting errors: `cd apps/web && pnpm run lint`

#### Manual Verification:
- [ ] Effective tariff preview card is visible at top of Tariff Assignments tab
- [ ] Default date is today
- [ ] Changing date updates the preview after a short debounce
- [ ] Source badge correctly shows "Assignment" / "Default" / "None"
- [ ] When source is "assignment", tariff name and date range are displayed
- [ ] When source is "none", message "No tariff assigned for this date" is shown
- [ ] When source is "default", tariff name is shown without assignment date range
- [ ] Creating/editing/deleting an assignment auto-refreshes the preview (due to query invalidation)
- [ ] Switching locales (EN/DE) shows correct translations throughout

**Implementation Note**: After completing this phase and all verification passes, the feature is complete.

---

## Testing Strategy

### Unit Tests (Future)
- Tariff assignment list renders timeline items in correct order
- Form validates required fields (tariff, effective_from)
- Form validates date order (effective_to >= effective_from)
- 409 error displays the overlap message
- Effective tariff preview shows correct source badge
- Delete dialog displays assignment details

### Integration Tests (Future)
- Create assignment flow: open form, fill fields, submit, verify appears in list
- Edit assignment flow: click edit, modify dates, submit, verify changes
- Delete assignment flow: click delete, confirm, verify removed
- Effective tariff preview updates after assignment changes
- Active/inactive filter shows correct assignments

### Manual Testing Steps
1. Navigate to employee detail page, switch to Tariff Assignments tab
2. Verify empty state message when no assignments exist
3. Create a new tariff assignment with open-ended date range
4. Verify it appears in the list as the current assignment (highlighted)
5. Create a second assignment with specific date range - verify ordering
6. Try creating an overlapping assignment - verify 409 error message
7. Edit an assignment's dates and notes - verify changes saved
8. Delete an assignment - verify it disappears
9. Check effective tariff preview for dates inside and outside assignment ranges
10. Switch to German locale and verify all labels are translated

## Performance Considerations

- The effective tariff preview uses a 300ms debounce to avoid excessive API calls while picking dates
- Tariff assignment list fetches are scoped to a single employee (small dataset)
- Query invalidation is scoped to the employee's assignments, not the global tariff list
- The tariff selector dropdown queries `useTariffs({ active: true })` only when the form sheet opens

## References

- Original ticket: `thoughts/shared/tickets/ZMI-TICKET-041-employee-tariff-assignment-ui.md`
- Research document: `thoughts/shared/research/2026-02-02-employee-tariff-assignment-ui-codebase-research.md`
- Hook pattern reference: `apps/web/src/hooks/api/use-employee-contacts.ts`
- Form sheet pattern reference: `apps/web/src/components/tariffs/tariff-form-sheet.tsx`
- Delete dialog reference: `apps/web/src/components/ui/confirm-dialog.tsx`
- Error handling reference: `apps/web/src/lib/api/errors.ts`
- Backend handler: `apps/api/internal/handler/employeetariffassignment.go`
- OpenAPI paths: `api/paths/employee-tariff-assignments.yaml`
- OpenAPI schemas: `api/schemas/employee-tariff-assignments.yaml`
