# ZMI-TICKET-044: Payroll Export UI - Implementation Plan

## Overview

Implement an admin page for generating, previewing, and downloading payroll export files. The page supports async export generation with status polling, multiple export formats (CSV, XLSX, XML, JSON), preview with dynamic account columns, and file download. This follows existing monthly-values patterns closely but introduces async workflow (202 responses, polling, blob downloads).

## Current State Analysis

- **Backend API**: Fully specified in OpenAPI -- endpoints for list, generate (202), get, delete, download (binary), preview (inline JSON). Schemas for `PayrollExport`, `GeneratePayrollExportRequest`, `PayrollExportList`, `ExportInterface` are generated as TypeScript types in `apps/web/src/lib/api/types.ts`.
- **No frontend exists** for payroll exports yet.
- **Export interface API** exists (`/export-interfaces`) with generated types but no frontend hooks.
- **Pattern references**: Monthly Values page is the closest reference for page structure, toolbar, detail sheet, and complex dialogs.

### Key Discoveries:
- `PayrollExportLine` is NOT a named schema -- it is inline in the preview endpoint response (`apps/web/src/lib/api/types.ts` line 15909). A local TypeScript interface must be defined.
- `generatePayrollExport` returns HTTP 202, not 200/201. The `useApiMutation` type helper only resolves return types from 200/201, so a custom `useMutation` hook is needed (same pattern as `useRecalculateMonthlyValues` in `apps/web/src/hooks/api/use-admin-monthly-values.ts` lines 87-105).
- Download endpoint returns binary data. The openapi-fetch client cannot handle blob responses. A custom fetch with `response.blob()` is needed.
- Sidebar nav config (`apps/web/src/components/layout/sidebar/sidebar-nav-config.ts`) places this in the `administration` section.

## Desired End State

An admin user can:
1. Navigate to `/admin/payroll-exports` via the Administration sidebar section
2. See a list of existing payroll exports with status badges (pending/generating/completed/failed)
3. Filter exports by year/month and status
4. Generate a new export via a dialog with format, type, interface selection, and optional parameter filters
5. See real-time status updates as exports transition from pending to generating to completed (3-second polling)
6. Preview completed exports in a table with dynamic account value columns
7. Download completed export files as the selected format
8. View export details in a side sheet with metadata, status timestamps, and error messages
9. Delete exports with confirmation dialog

### Verification:
- Page loads and shows exports list
- Generate dialog submits and polling starts
- Status badges animate during generation
- Preview shows dynamic account columns
- Download triggers browser file save
- 409 errors show friendly messages
- Navigation, breadcrumbs, and translations work in EN and DE

## What We're NOT Doing

- Export interface configuration (ZMI-TICKET-045)
- Monthly value closing workflow (ZMI-TICKET-043)
- Custom export script execution
- Employee/department multi-select pickers (use plain text ID input or omit advanced parameters section from v1 -- see note in Phase 3)
- Backend implementation (already done in ZMI-TICKET-021)

## Implementation Approach

5 phases, each independently verifiable:
1. **API Hooks** -- data access layer
2. **Navigation, Translations, Breadcrumbs** -- routing/i18n infrastructure
3. **Page + Skeleton + Toolbar** -- basic page with filters
4. **Data Table + Detail Sheet** -- list display and metadata view
5. **Generate Dialog + Preview + Download** -- the complex interactive components

---

## Phase 1: API Hooks

### Overview
Create the hooks file with all query and mutation hooks for payroll exports and export interfaces.

### Changes Required:

#### 1. Create API hooks file
**File**: `apps/web/src/hooks/api/use-payroll-exports.ts`

```ts
import { useApiQuery, useApiMutation } from '@/hooks'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, authStorage, tenantIdStorage } from '@/lib/api'
import { clientEnv } from '@/config/env'

// --- Interfaces ---

/**
 * PayrollExportLine - inline schema from preview endpoint.
 * Not generated as a named type, defined manually.
 */
export interface PayrollExportLine {
  employee_id: string
  personnel_number: string
  first_name?: string
  last_name?: string
  department_code?: string
  cost_center_code?: string
  target_hours?: number
  worked_hours?: number
  overtime_hours?: number
  account_values?: Record<string, number>
  vacation_days?: number
  sick_days?: number
  other_absence_days?: number
}

export interface PayrollExportPreview {
  lines: PayrollExportLine[]
  summary: {
    employee_count: number
    total_hours: number
    total_overtime: number
  }
}

interface UsePayrollExportsOptions {
  year?: number
  month?: number
  status?: string
  limit?: number
  cursor?: string
  enabled?: boolean
}

// --- Query Hooks ---

/**
 * List payroll exports with filters.
 * GET /payroll-exports
 */
export function usePayrollExports(options: UsePayrollExportsOptions = {}) {
  const { year, month, status, limit, cursor, enabled = true } = options
  return useApiQuery('/payroll-exports', {
    params: {
      year,
      month,
      status,
      limit,
      cursor,
    },
    enabled,
    // Poll list if any item is pending/generating
    refetchInterval: (query) => {
      const items = (query.state.data as { data?: Array<{ status?: string }> })?.data
      const hasInProgress = items?.some(
        (item) => item.status === 'pending' || item.status === 'generating'
      )
      return hasInProgress ? 3000 : false
    },
  })
}

/**
 * Get a single payroll export by ID.
 * GET /payroll-exports/{id}
 */
export function usePayrollExport(id: string | undefined) {
  return useApiQuery('/payroll-exports/{id}', {
    path: { id: id! },
    enabled: !!id,
    refetchInterval: (query) => {
      const status = (query.state.data as { status?: string })?.status
      return (status === 'pending' || status === 'generating') ? 3000 : false
    },
  })
}

/**
 * Preview payroll export data.
 * GET /payroll-exports/{id}/preview
 *
 * NOTE: Response type is inline in the OpenAPI spec.
 * Using manual useQuery with typed response.
 */
export function usePayrollExportPreview(id: string | undefined, enabled = true) {
  return useQuery<PayrollExportPreview>({
    queryKey: ['/payroll-exports/{id}/preview', { id }],
    queryFn: async () => {
      const { data, error } = await api.GET('/payroll-exports/{id}/preview' as never, {
        params: { path: { id } },
      } as never)
      if (error) throw error
      return data as PayrollExportPreview
    },
    enabled: enabled && !!id,
  })
}

/**
 * List export interfaces (for generate dialog dropdown).
 * GET /export-interfaces
 */
export function useExportInterfaces(enabled = true) {
  return useApiQuery('/export-interfaces', {
    params: { active_only: true },
    enabled,
  })
}

// --- Mutation Hooks ---

/**
 * Generate a new payroll export.
 * POST /payroll-exports -> returns 202 (Accepted)
 *
 * NOTE: useApiMutation only infers return types from 200/201.
 * Using custom useMutation with manual typing (same pattern as
 * useRecalculateMonthlyValues in use-admin-monthly-values.ts).
 */
export function useGeneratePayrollExport() {
  const queryClient = useQueryClient()
  return useMutation<
    {
      id?: string
      status?: string
      year?: number
      month?: number
    },
    Error,
    {
      body: {
        year: number
        month: number
        format: string
        export_type?: string
        export_interface_id?: string
        parameters?: {
          employee_ids?: string[]
          department_ids?: string[]
          include_accounts?: string[]
        }
      }
    }
  >({
    mutationFn: async (variables) => {
      const { data, error } = await api.POST('/payroll-exports' as never, {
        body: variables.body,
      } as never)
      if (error) throw error
      return data as { id?: string; status?: string; year?: number; month?: number }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/payroll-exports'] })
    },
  })
}

/**
 * Delete a payroll export.
 * DELETE /payroll-exports/{id}
 */
export function useDeletePayrollExport() {
  return useApiMutation('/payroll-exports/{id}', 'delete', {
    invalidateKeys: [['/payroll-exports']],
  })
}

/**
 * Download a payroll export file as a blob.
 * Custom hook using raw fetch (openapi-fetch cannot handle blob responses).
 */
export function useDownloadPayrollExport() {
  return useMutation<void, Error, { id: string; filename?: string }>({
    mutationFn: async ({ id, filename }) => {
      const token = authStorage.getToken()
      const tenantId = tenantIdStorage.getTenantId()
      const response = await fetch(
        `${clientEnv.apiUrl}/payroll-exports/${id}/download`,
        {
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(tenantId ? { 'X-Tenant-ID': tenantId } : {}),
          },
        }
      )
      if (!response.ok) {
        const errorData = await response.json().catch(() => null)
        throw new Error(
          errorData?.detail ?? errorData?.title ?? `Download failed (${response.status})`
        )
      }
      const blob = await response.blob()
      const disposition = response.headers.get('Content-Disposition')
      const extractedName = disposition?.match(/filename="?(.+?)"?$/)?.[1]
      const downloadName = extractedName ?? filename ?? 'export'
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = downloadName
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    },
  })
}
```

#### 2. Register hooks in barrel export
**File**: `apps/web/src/hooks/api/index.ts`
**Changes**: Add payroll export hook exports at the end of the file.

```ts
// Payroll Exports
export {
  usePayrollExports,
  usePayrollExport,
  usePayrollExportPreview,
  useExportInterfaces,
  useGeneratePayrollExport,
  useDeletePayrollExport,
  useDownloadPayrollExport,
  type PayrollExportLine,
  type PayrollExportPreview,
} from './use-payroll-exports'
```

### Success Criteria:

#### Automated Verification:
- [ ] File exists: `apps/web/src/hooks/api/use-payroll-exports.ts`
- [ ] TypeScript compilation passes: `cd apps/web && npx tsc --noEmit`
- [ ] No lint errors in the new file

#### Manual Verification:
- [ ] Hooks correctly reference OpenAPI typed paths
- [ ] Custom hooks for 202 and blob download follow existing patterns

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to Phase 2.

---

## Phase 2: Navigation, Translations & Breadcrumbs

### Overview
Add sidebar navigation entry, breadcrumb segment mapping, and all translation keys for both EN and DE.

### Changes Required:

#### 1. Add sidebar navigation item
**File**: `apps/web/src/components/layout/sidebar/sidebar-nav-config.ts`
**Changes**: Import `FileOutput` icon and add payroll exports to the administration section.

Add to the import statement:
```ts
import {
  // ... existing imports ...
  FileOutput,
} from 'lucide-react'
```

Add to the `administration` section items array (after `tenants` entry):
```ts
{
  titleKey: 'payrollExports',
  href: '/admin/payroll-exports',
  icon: FileOutput,
  roles: ['admin'],
},
```

#### 2. Add breadcrumb segment mapping
**File**: `apps/web/src/components/layout/breadcrumbs.tsx`
**Changes**: Add `'payroll-exports': 'payrollExports'` to the `segmentToKey` record.

```ts
const segmentToKey: Record<string, string> = {
  // ... existing entries ...
  'monthly-values': 'monthlyValues',
  'payroll-exports': 'payrollExports',  // <-- ADD THIS
}
```

#### 3. English translations
**File**: `apps/web/messages/en.json`
**Changes**: Add three entries:

1. In `nav` object, add:
```json
"payrollExports": "Payroll Exports"
```

2. In `breadcrumbs` object, add:
```json
"payrollExports": "Payroll Exports"
```

3. Add new top-level `payrollExports` namespace:
```json
"payrollExports": {
  "page": {
    "title": "Payroll Exports",
    "subtitle": "Generate, preview, and download payroll export files"
  },
  "toolbar": {
    "allStatuses": "All Statuses",
    "generateExport": "Generate Export"
  },
  "status": {
    "pending": "Pending",
    "generating": "Generating",
    "completed": "Completed",
    "failed": "Failed"
  },
  "table": {
    "yearMonth": "Period",
    "exportType": "Export Type",
    "format": "Format",
    "status": "Status",
    "employeeCount": "Employees",
    "totalHours": "Total Hours",
    "generatedAt": "Generated At",
    "actions": "Actions"
  },
  "exportType": {
    "standard": "Standard",
    "datev": "DATEV",
    "sage": "Sage",
    "custom": "Custom"
  },
  "format": {
    "csv": "CSV",
    "xlsx": "Excel",
    "xml": "XML",
    "json": "JSON"
  },
  "actions": {
    "preview": "Preview",
    "download": "Download",
    "delete": "Delete"
  },
  "generate": {
    "title": "Generate Payroll Export",
    "description": "Create a new payroll export for the selected period",
    "yearLabel": "Year",
    "monthLabel": "Month",
    "exportTypeLabel": "Export Type",
    "formatLabel": "Format",
    "interfaceLabel": "Export Interface",
    "interfacePlaceholder": "Select interface (optional)",
    "noInterface": "None",
    "advancedParameters": "Advanced Parameters",
    "employeeIdsLabel": "Employee IDs (comma-separated)",
    "employeeIdsPlaceholder": "Leave empty for all employees",
    "departmentIdsLabel": "Department IDs (comma-separated)",
    "departmentIdsPlaceholder": "Leave empty for all departments",
    "accountIdsLabel": "Account IDs (comma-separated)",
    "accountIdsPlaceholder": "Leave empty for all accounts",
    "submit": "Generate Export",
    "validationRequired": "Year, month, and format are required",
    "monthNotClosed": "All employees must have closed months before exporting. Please close all months first.",
    "monthNotClosedLink": "Go to Monthly Values",
    "error": "Failed to generate export"
  },
  "preview": {
    "title": "Export Preview",
    "description": "Preview of export data for {period}",
    "personnelNumber": "Pers. No.",
    "firstName": "First Name",
    "lastName": "Last Name",
    "department": "Department",
    "costCenter": "Cost Center",
    "targetHours": "Target",
    "workedHours": "Worked",
    "overtimeHours": "Overtime",
    "vacationDays": "Vacation",
    "sickDays": "Sick",
    "otherAbsenceDays": "Other Abs.",
    "summaryRow": "Total",
    "noData": "No preview data available",
    "notReady": "Export is not yet completed. Preview will be available once generation finishes.",
    "close": "Close"
  },
  "detail": {
    "title": "Export Details",
    "exportInfo": "Export Information",
    "type": "Type",
    "format": "Format",
    "period": "Period",
    "interface": "Interface",
    "statusInfo": "Status",
    "status": "Status",
    "requestedAt": "Requested At",
    "startedAt": "Started At",
    "completedAt": "Completed At",
    "summary": "Summary",
    "employeeCount": "Employees",
    "totalHours": "Total Hours",
    "totalOvertime": "Total Overtime",
    "rowCount": "Rows",
    "fileSize": "File Size",
    "errorMessage": "Error",
    "close": "Close",
    "preview": "Preview",
    "download": "Download",
    "delete": "Delete"
  },
  "delete": {
    "title": "Delete Export",
    "description": "Are you sure you want to delete this payroll export? This action cannot be undone.",
    "confirm": "Delete",
    "success": "Export deleted successfully"
  },
  "download": {
    "starting": "Starting download...",
    "error": "Failed to download export"
  },
  "empty": {
    "title": "No payroll exports",
    "description": "No payroll exports found for the selected filters.",
    "generateHint": "Generate your first export to get started.",
    "generateButton": "Generate Export"
  },
  "count": {
    "item": "{count} export",
    "items": "{count} exports"
  }
}
```

#### 4. German translations
**File**: `apps/web/messages/de.json`
**Changes**: Same three entries in German.

1. In `nav` object, add:
```json
"payrollExports": "Lohnexporte"
```

2. In `breadcrumbs` object, add:
```json
"payrollExports": "Lohnexporte"
```

3. Add new top-level `payrollExports` namespace:
```json
"payrollExports": {
  "page": {
    "title": "Lohnexporte",
    "subtitle": "Lohnexport-Dateien erstellen, vorschauen und herunterladen"
  },
  "toolbar": {
    "allStatuses": "Alle Status",
    "generateExport": "Export erstellen"
  },
  "status": {
    "pending": "Ausstehend",
    "generating": "Wird erstellt",
    "completed": "Abgeschlossen",
    "failed": "Fehlgeschlagen"
  },
  "table": {
    "yearMonth": "Zeitraum",
    "exportType": "Exporttyp",
    "format": "Format",
    "status": "Status",
    "employeeCount": "Mitarbeiter",
    "totalHours": "Gesamtstunden",
    "generatedAt": "Erstellt am",
    "actions": "Aktionen"
  },
  "exportType": {
    "standard": "Standard",
    "datev": "DATEV",
    "sage": "Sage",
    "custom": "Benutzerdefiniert"
  },
  "format": {
    "csv": "CSV",
    "xlsx": "Excel",
    "xml": "XML",
    "json": "JSON"
  },
  "actions": {
    "preview": "Vorschau",
    "download": "Herunterladen",
    "delete": "Löschen"
  },
  "generate": {
    "title": "Lohnexport erstellen",
    "description": "Neuen Lohnexport für den ausgewählten Zeitraum erstellen",
    "yearLabel": "Jahr",
    "monthLabel": "Monat",
    "exportTypeLabel": "Exporttyp",
    "formatLabel": "Format",
    "interfaceLabel": "Export-Schnittstelle",
    "interfacePlaceholder": "Schnittstelle auswählen (optional)",
    "noInterface": "Keine",
    "advancedParameters": "Erweiterte Parameter",
    "employeeIdsLabel": "Mitarbeiter-IDs (kommagetrennt)",
    "employeeIdsPlaceholder": "Leer lassen für alle Mitarbeiter",
    "departmentIdsLabel": "Abteilungs-IDs (kommagetrennt)",
    "departmentIdsPlaceholder": "Leer lassen für alle Abteilungen",
    "accountIdsLabel": "Konten-IDs (kommagetrennt)",
    "accountIdsPlaceholder": "Leer lassen für alle Konten",
    "submit": "Export erstellen",
    "validationRequired": "Jahr, Monat und Format sind erforderlich",
    "monthNotClosed": "Alle Mitarbeiter müssen geschlossene Monate haben, bevor exportiert werden kann. Bitte schließen Sie zuerst alle Monate ab.",
    "monthNotClosedLink": "Zu Monatswerten",
    "error": "Export konnte nicht erstellt werden"
  },
  "preview": {
    "title": "Export-Vorschau",
    "description": "Vorschau der Exportdaten für {period}",
    "personnelNumber": "Pers.-Nr.",
    "firstName": "Vorname",
    "lastName": "Nachname",
    "department": "Abteilung",
    "costCenter": "Kostenstelle",
    "targetHours": "Soll",
    "workedHours": "Ist",
    "overtimeHours": "Überstunden",
    "vacationDays": "Urlaub",
    "sickDays": "Krank",
    "otherAbsenceDays": "Sonst. Abw.",
    "summaryRow": "Gesamt",
    "noData": "Keine Vorschaudaten verfügbar",
    "notReady": "Der Export ist noch nicht abgeschlossen. Die Vorschau ist verfügbar, sobald die Erstellung abgeschlossen ist.",
    "close": "Schließen"
  },
  "detail": {
    "title": "Export-Details",
    "exportInfo": "Export-Informationen",
    "type": "Typ",
    "format": "Format",
    "period": "Zeitraum",
    "interface": "Schnittstelle",
    "statusInfo": "Status",
    "status": "Status",
    "requestedAt": "Angefordert am",
    "startedAt": "Gestartet am",
    "completedAt": "Abgeschlossen am",
    "summary": "Zusammenfassung",
    "employeeCount": "Mitarbeiter",
    "totalHours": "Gesamtstunden",
    "totalOvertime": "Überstunden gesamt",
    "rowCount": "Zeilen",
    "fileSize": "Dateigröße",
    "errorMessage": "Fehler",
    "close": "Schließen",
    "preview": "Vorschau",
    "download": "Herunterladen",
    "delete": "Löschen"
  },
  "delete": {
    "title": "Export löschen",
    "description": "Möchten Sie diesen Lohnexport wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.",
    "confirm": "Löschen",
    "success": "Export erfolgreich gelöscht"
  },
  "download": {
    "starting": "Download wird gestartet...",
    "error": "Export konnte nicht heruntergeladen werden"
  },
  "empty": {
    "title": "Keine Lohnexporte",
    "description": "Keine Lohnexporte für die ausgewählten Filter gefunden.",
    "generateHint": "Erstellen Sie Ihren ersten Export, um loszulegen.",
    "generateButton": "Export erstellen"
  },
  "count": {
    "item": "{count} Export",
    "items": "{count} Exporte"
  }
}
```

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compilation passes: `cd apps/web && npx tsc --noEmit`
- [ ] JSON files are valid (no trailing commas, proper structure)
- [ ] `FileOutput` icon import compiles without error

#### Manual Verification:
- [ ] Sidebar shows "Payroll Exports" in Administration section (EN)
- [ ] Sidebar shows "Lohnexporte" in Administration section (DE)
- [ ] Clicking nav item navigates to `/admin/payroll-exports` (404 is expected until page is created)
- [ ] Breadcrumb shows "Payroll Exports" segment

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to Phase 3.

---

## Phase 3: Page + Skeleton + Toolbar

### Overview
Create the page component, loading skeleton, and toolbar with year/month + status filters and generate button.

### Changes Required:

#### 1. Create page skeleton
**File**: `apps/web/src/components/payroll-exports/payroll-export-skeleton.tsx`

```tsx
import { Skeleton } from '@/components/ui/skeleton'

export function PayrollExportSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
      {/* Toolbar area */}
      <div className="grid gap-4 md:grid-cols-4">
        <Skeleton className="h-9" />
        <Skeleton className="h-9" />
        <Skeleton className="h-9" />
        <Skeleton className="h-9" />
      </div>
      {/* Table area */}
      <Skeleton className="h-[500px]" />
    </div>
  )
}
```

#### 2. Create toolbar component
**File**: `apps/web/src/components/payroll-exports/payroll-export-toolbar.tsx`

```tsx
'use client'

import * as React from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface PayrollExportToolbarProps {
  year: number
  month: number
  onYearChange: (year: number) => void
  onMonthChange: (month: number) => void
  status: string
  onStatusChange: (status: string) => void
  onGenerate: () => void
}

export function PayrollExportToolbar({
  year,
  month,
  onYearChange,
  onMonthChange,
  status,
  onStatusChange,
  onGenerate,
}: PayrollExportToolbarProps) {
  const t = useTranslations('payrollExports')
  const locale = useLocale()

  const monthLabel = React.useMemo(() => {
    const formatter = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' })
    return formatter.format(new Date(year, month - 1, 1))
  }, [year, month, locale])

  const navigatePrevious = () => {
    if (month === 1) {
      onMonthChange(12)
      onYearChange(year - 1)
    } else {
      onMonthChange(month - 1)
    }
  }

  const navigateNext = () => {
    if (month === 12) {
      onMonthChange(1)
      onYearChange(year + 1)
    } else {
      onMonthChange(month + 1)
    }
  }

  return (
    <div className="grid gap-4 md:grid-cols-4 md:items-end">
      {/* Month/Year navigator */}
      <div className="flex items-center rounded-md border">
        <Button variant="ghost" size="icon" onClick={navigatePrevious} className="h-9 w-9">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="flex-1 px-3 text-sm font-medium text-center capitalize">
          {monthLabel}
        </span>
        <Button variant="ghost" size="icon" onClick={navigateNext} className="h-9 w-9">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Status filter */}
      <Select value={status} onValueChange={onStatusChange}>
        <SelectTrigger>
          <SelectValue placeholder={t('toolbar.allStatuses')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('toolbar.allStatuses')}</SelectItem>
          <SelectItem value="pending">{t('status.pending')}</SelectItem>
          <SelectItem value="generating">{t('status.generating')}</SelectItem>
          <SelectItem value="completed">{t('status.completed')}</SelectItem>
          <SelectItem value="failed">{t('status.failed')}</SelectItem>
        </SelectContent>
      </Select>

      {/* Spacer */}
      <div />

      {/* Generate button */}
      <Button onClick={onGenerate}>
        <Plus className="mr-2 h-4 w-4" />
        {t('toolbar.generateExport')}
      </Button>
    </div>
  )
}
```

#### 3. Create barrel exports
**File**: `apps/web/src/components/payroll-exports/index.ts`

```ts
export { PayrollExportSkeleton } from './payroll-export-skeleton'
export { PayrollExportToolbar } from './payroll-export-toolbar'
```

Note: More exports will be added in subsequent phases.

#### 4. Create page component
**File**: `apps/web/src/app/[locale]/(dashboard)/admin/payroll-exports/page.tsx`

```tsx
'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useAuth } from '@/providers/auth-provider'
import { useHasRole } from '@/hooks'
import { usePayrollExports } from '@/hooks/api'
import { Card, CardContent } from '@/components/ui/card'
import {
  PayrollExportSkeleton,
  PayrollExportToolbar,
} from '@/components/payroll-exports'

export default function PayrollExportsPage() {
  const router = useRouter()
  const t = useTranslations('payrollExports')
  const { isLoading: authLoading } = useAuth()
  const isAdmin = useHasRole(['admin'])

  // Filters
  const [year, setYear] = React.useState(() => new Date().getFullYear())
  const [month, setMonth] = React.useState(() => new Date().getMonth() + 1)
  const [statusFilter, setStatusFilter] = React.useState<string>('all')

  // Dialog/sheet state (placeholders for Phase 4 & 5)
  const [generateOpen, setGenerateOpen] = React.useState(false)

  // Auth guard
  React.useEffect(() => {
    if (!authLoading && !isAdmin) {
      router.push('/dashboard')
    }
  }, [authLoading, isAdmin, router])

  const enabled = !authLoading && isAdmin

  // Payroll exports query
  const { data: exportsData, isLoading: exportsLoading } = usePayrollExports({
    year,
    month,
    status: statusFilter !== 'all' ? statusFilter : undefined,
    enabled,
  })

  const exports = exportsData?.data ?? []

  if (authLoading) {
    return <PayrollExportSkeleton />
  }

  if (!isAdmin) {
    return null
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('page.title')}</h1>
        <p className="text-muted-foreground">{t('page.subtitle')}</p>
      </div>

      <PayrollExportToolbar
        year={year}
        month={month}
        onYearChange={setYear}
        onMonthChange={setMonth}
        status={statusFilter}
        onStatusChange={setStatusFilter}
        onGenerate={() => setGenerateOpen(true)}
      />

      <div className="text-sm text-muted-foreground">
        {exports.length === 1
          ? t('count.item', { count: exports.length })
          : t('count.items', { count: exports.length })}
      </div>

      <Card>
        <CardContent className="p-0">
          {exportsLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading...</div>
          ) : exports.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <h3 className="text-lg font-medium">{t('empty.title')}</h3>
              <p className="text-sm text-muted-foreground mt-1">{t('empty.description')}</p>
              <p className="text-sm text-muted-foreground mt-1">{t('empty.generateHint')}</p>
            </div>
          ) : (
            <div className="p-4 text-sm text-muted-foreground">
              {/* Data table placeholder - Phase 4 */}
              {exports.length} exports loaded (table component coming in Phase 4)
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
```

### Success Criteria:

#### Automated Verification:
- [ ] All new files exist under `apps/web/src/components/payroll-exports/` and `apps/web/src/app/[locale]/(dashboard)/admin/payroll-exports/`
- [ ] TypeScript compilation passes: `cd apps/web && npx tsc --noEmit`
- [ ] No lint errors

#### Manual Verification:
- [ ] Navigate to `/admin/payroll-exports` -- page renders with title, subtitle, toolbar, empty state
- [ ] Month/year navigation works (chevron buttons)
- [ ] Status filter dropdown shows all statuses
- [ ] "Generate Export" button is visible
- [ ] Skeleton shows while auth is loading

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to Phase 4.

---

## Phase 4: Data Table + Detail Sheet + Delete

### Overview
Add the data table with status badges (including animation for generating), actions dropdown, detail sheet for metadata display, and delete confirmation.

### Changes Required:

#### 1. Create data table component
**File**: `apps/web/src/components/payroll-exports/payroll-export-data-table.tsx`

```tsx
'use client'

import * as React from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { MoreHorizontal, Eye, Download, Trash2, Loader2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'

export interface PayrollExportRow {
  id: string
  year: number
  month: number
  export_type?: string
  format?: string
  status: string
  employee_count?: number
  total_hours?: number
  requested_at?: string
  completed_at?: string
  error_message?: string | null
}

interface PayrollExportDataTableProps {
  items: PayrollExportRow[]
  isLoading: boolean
  onRowClick: (item: PayrollExportRow) => void
  onPreview: (item: PayrollExportRow) => void
  onDownload: (item: PayrollExportRow) => void
  onDelete: (item: PayrollExportRow) => void
}

function getStatusBadge(status: string, t: (key: string) => string) {
  const statusConfig = {
    pending: {
      labelKey: 'status.pending',
      variant: 'outline' as const,
      className: 'border-yellow-500 text-yellow-700',
    },
    generating: {
      labelKey: 'status.generating',
      variant: 'secondary' as const,
      className: 'animate-pulse',
    },
    completed: {
      labelKey: 'status.completed',
      variant: 'default' as const,
      className: 'bg-green-600 hover:bg-green-700',
    },
    failed: {
      labelKey: 'status.failed',
      variant: 'destructive' as const,
      className: '',
    },
  }
  const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.pending
  return (
    <Badge variant={config.variant} className={config.className}>
      {status === 'generating' && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
      {t(config.labelKey)}
    </Badge>
  )
}

export function PayrollExportDataTable({
  items,
  isLoading,
  onRowClick,
  onPreview,
  onDownload,
  onDelete,
}: PayrollExportDataTableProps) {
  const t = useTranslations('payrollExports')
  const locale = useLocale()

  const formatPeriod = (year: number, month: number) => {
    const formatter = new Intl.DateTimeFormat(locale, { month: 'short', year: 'numeric' })
    return formatter.format(new Date(year, month - 1, 1))
  }

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '-'
    try {
      return new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(dateStr))
    } catch {
      return dateStr
    }
  }

  const formatHours = (hours?: number) => {
    if (hours == null) return '-'
    return hours.toFixed(2)
  }

  if (isLoading) {
    return <PayrollExportDataTableSkeleton />
  }

  if (items.length === 0) {
    return null
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('table.yearMonth')}</TableHead>
          <TableHead className="w-28">{t('table.exportType')}</TableHead>
          <TableHead className="w-20">{t('table.format')}</TableHead>
          <TableHead className="w-32">{t('table.status')}</TableHead>
          <TableHead className="w-24 text-right">{t('table.employeeCount')}</TableHead>
          <TableHead className="w-28 text-right">{t('table.totalHours')}</TableHead>
          <TableHead className="w-36">{t('table.generatedAt')}</TableHead>
          <TableHead className="w-16">
            <span className="sr-only">{t('table.actions')}</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => {
          const isCompleted = item.status === 'completed'
          const isGenerating = item.status === 'generating' || item.status === 'pending'

          return (
            <TableRow
              key={item.id}
              className="cursor-pointer"
              onClick={() => onRowClick(item)}
            >
              <TableCell className="font-medium">
                {formatPeriod(item.year, item.month)}
              </TableCell>
              <TableCell>
                <Badge variant="outline">
                  {t(`exportType.${item.export_type ?? 'standard'}` as Parameters<typeof t>[0])}
                </Badge>
              </TableCell>
              <TableCell className="font-mono text-sm uppercase">
                {item.format ?? '-'}
              </TableCell>
              <TableCell>
                {getStatusBadge(item.status, t as unknown as (key: string) => string)}
              </TableCell>
              <TableCell className="text-right">
                {item.employee_count ?? '-'}
              </TableCell>
              <TableCell className="text-right">
                {formatHours(item.total_hours)}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {formatDate(item.completed_at ?? item.requested_at)}
              </TableCell>
              <TableCell onClick={(e) => e.stopPropagation()}>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-sm">
                      <MoreHorizontal className="h-4 w-4" />
                      <span className="sr-only">{t('table.actions')}</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() => onPreview(item)}
                      disabled={!isCompleted}
                    >
                      <Eye className="mr-2 h-4 w-4" />
                      {t('actions.preview')}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => onDownload(item)}
                      disabled={!isCompleted}
                    >
                      <Download className="mr-2 h-4 w-4" />
                      {t('actions.download')}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => onDelete(item)}
                      disabled={isGenerating}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      {t('actions.delete')}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}

function PayrollExportDataTableSkeleton() {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead><Skeleton className="h-4 w-24" /></TableHead>
          <TableHead className="w-28"><Skeleton className="h-4 w-20" /></TableHead>
          <TableHead className="w-20"><Skeleton className="h-4 w-12" /></TableHead>
          <TableHead className="w-32"><Skeleton className="h-4 w-20" /></TableHead>
          <TableHead className="w-24"><Skeleton className="h-4 w-12" /></TableHead>
          <TableHead className="w-28"><Skeleton className="h-4 w-16" /></TableHead>
          <TableHead className="w-36"><Skeleton className="h-4 w-24" /></TableHead>
          <TableHead className="w-16" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: 5 }).map((_, i) => (
          <TableRow key={i}>
            <TableCell><Skeleton className="h-4 w-24" /></TableCell>
            <TableCell><Skeleton className="h-5 w-20 rounded-full" /></TableCell>
            <TableCell><Skeleton className="h-4 w-12" /></TableCell>
            <TableCell><Skeleton className="h-5 w-24 rounded-full" /></TableCell>
            <TableCell><Skeleton className="h-4 w-12 ml-auto" /></TableCell>
            <TableCell><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
            <TableCell><Skeleton className="h-4 w-24" /></TableCell>
            <TableCell><Skeleton className="h-8 w-8" /></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
```

#### 2. Create detail sheet component
**File**: `apps/web/src/components/payroll-exports/payroll-export-detail-sheet.tsx`

```tsx
'use client'

import * as React from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { Eye, Download, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import type { PayrollExportRow } from './payroll-export-data-table'

interface PayrollExportDetailSheetProps {
  item: PayrollExportRow | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onPreview: (item: PayrollExportRow) => void
  onDownload: (item: PayrollExportRow) => void
  onDelete: (item: PayrollExportRow) => void
  /** Additional metadata loaded from usePayrollExport(id) */
  fullExport?: {
    export_interface_id?: string | null
    file_size?: number | null
    row_count?: number | null
    total_overtime?: number
    started_at?: string | null
    requested_at?: string
    parameters?: {
      employee_ids?: string[]
      department_ids?: string[]
      include_accounts?: string[]
    } | null
  } | null
}

function getStatusBadge(status: string, t: (key: string) => string) {
  const statusConfig = {
    pending: { labelKey: 'status.pending', variant: 'outline' as const, className: 'border-yellow-500 text-yellow-700' },
    generating: { labelKey: 'status.generating', variant: 'secondary' as const, className: 'animate-pulse' },
    completed: { labelKey: 'status.completed', variant: 'default' as const, className: 'bg-green-600 hover:bg-green-700' },
    failed: { labelKey: 'status.failed', variant: 'destructive' as const, className: '' },
  }
  const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.pending
  return (
    <Badge variant={config.variant} className={config.className}>
      {t(config.labelKey)}
    </Badge>
  )
}

export function PayrollExportDetailSheet({
  item,
  open,
  onOpenChange,
  onPreview,
  onDownload,
  onDelete,
  fullExport,
}: PayrollExportDetailSheetProps) {
  const t = useTranslations('payrollExports')
  const locale = useLocale()

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return '-'
    try {
      return new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(dateStr))
    } catch {
      return dateStr
    }
  }

  const formatPeriod = (year: number, month: number) => {
    const formatter = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' })
    return formatter.format(new Date(year, month - 1, 1))
  }

  const formatFileSize = (bytes?: number | null) => {
    if (bytes == null) return '-'
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const isCompleted = item?.status === 'completed'
  const isFailed = item?.status === 'failed'
  const isGenerating = item?.status === 'generating' || item?.status === 'pending'

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col">
        <SheetHeader>
          <SheetTitle>{t('detail.title')}</SheetTitle>
          <SheetDescription>
            {item ? formatPeriod(item.year, item.month) : ''}
          </SheetDescription>
        </SheetHeader>

        {item ? (
          <ScrollArea className="flex-1 -mx-4 px-4">
            <div className="space-y-6 py-4">
              {/* Error message for failed exports */}
              {isFailed && item.error_message && (
                <Alert variant="destructive">
                  <AlertDescription>{item.error_message}</AlertDescription>
                </Alert>
              )}

              {/* Export Info */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">
                  {t('detail.exportInfo')}
                </h4>
                <div className="rounded-lg border p-4 space-y-2">
                  <div className="flex justify-between py-1">
                    <span className="text-sm text-muted-foreground">{t('detail.type')}</span>
                    <span className="text-sm font-medium">
                      {t(`exportType.${item.export_type ?? 'standard'}` as Parameters<typeof t>[0])}
                    </span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-sm text-muted-foreground">{t('detail.format')}</span>
                    <span className="text-sm font-medium uppercase">{item.format ?? '-'}</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-sm text-muted-foreground">{t('detail.period')}</span>
                    <span className="text-sm font-medium">
                      {formatPeriod(item.year, item.month)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Status Info */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">
                  {t('detail.statusInfo')}
                </h4>
                <div className="rounded-lg border p-4 space-y-2">
                  <div className="flex justify-between py-1">
                    <span className="text-sm text-muted-foreground">{t('detail.status')}</span>
                    {getStatusBadge(item.status, t as unknown as (key: string) => string)}
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-sm text-muted-foreground">{t('detail.requestedAt')}</span>
                    <span className="text-sm font-medium">
                      {formatDate(item.requested_at ?? fullExport?.requested_at)}
                    </span>
                  </div>
                  {fullExport?.started_at && (
                    <div className="flex justify-between py-1">
                      <span className="text-sm text-muted-foreground">{t('detail.startedAt')}</span>
                      <span className="text-sm font-medium">{formatDate(fullExport.started_at)}</span>
                    </div>
                  )}
                  {item.completed_at && (
                    <div className="flex justify-between py-1">
                      <span className="text-sm text-muted-foreground">{t('detail.completedAt')}</span>
                      <span className="text-sm font-medium">{formatDate(item.completed_at)}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Summary */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">
                  {t('detail.summary')}
                </h4>
                <div className="rounded-lg border p-4 space-y-2">
                  <div className="flex justify-between py-1">
                    <span className="text-sm text-muted-foreground">{t('detail.employeeCount')}</span>
                    <span className="text-sm font-medium">{item.employee_count ?? '-'}</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-sm text-muted-foreground">{t('detail.totalHours')}</span>
                    <span className="text-sm font-medium">
                      {item.total_hours != null ? item.total_hours.toFixed(2) : '-'}
                    </span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-sm text-muted-foreground">{t('detail.totalOvertime')}</span>
                    <span className="text-sm font-medium">
                      {fullExport?.total_overtime != null ? fullExport.total_overtime.toFixed(2) : '-'}
                    </span>
                  </div>
                  {fullExport?.row_count != null && (
                    <div className="flex justify-between py-1">
                      <span className="text-sm text-muted-foreground">{t('detail.rowCount')}</span>
                      <span className="text-sm font-medium">{fullExport.row_count}</span>
                    </div>
                  )}
                  {fullExport?.file_size != null && (
                    <div className="flex justify-between py-1">
                      <span className="text-sm text-muted-foreground">{t('detail.fileSize')}</span>
                      <span className="text-sm font-medium">{formatFileSize(fullExport.file_size)}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </ScrollArea>
        ) : null}

        <SheetFooter className="flex-row gap-2 border-t pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
            {t('detail.close')}
          </Button>
          {isCompleted && (
            <>
              <Button
                variant="outline"
                onClick={() => item && onPreview(item)}
                className="flex-1"
              >
                <Eye className="mr-2 h-4 w-4" />
                {t('detail.preview')}
              </Button>
              <Button
                onClick={() => item && onDownload(item)}
                className="flex-1"
              >
                <Download className="mr-2 h-4 w-4" />
                {t('detail.download')}
              </Button>
            </>
          )}
          {!isGenerating && (
            <Button
              variant="destructive"
              onClick={() => item && onDelete(item)}
              className="flex-1"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {t('detail.delete')}
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
```

#### 3. Update barrel exports
**File**: `apps/web/src/components/payroll-exports/index.ts`
**Changes**: Add data table and detail sheet exports.

```ts
export { PayrollExportSkeleton } from './payroll-export-skeleton'
export { PayrollExportToolbar } from './payroll-export-toolbar'
export { PayrollExportDataTable } from './payroll-export-data-table'
export type { PayrollExportRow } from './payroll-export-data-table'
export { PayrollExportDetailSheet } from './payroll-export-detail-sheet'
```

#### 4. Update page component to integrate data table, detail sheet, and delete
**File**: `apps/web/src/app/[locale]/(dashboard)/admin/payroll-exports/page.tsx`
**Changes**: Replace the placeholder page with the full implementation including data table, detail sheet, and delete confirmation.

The page component gets the full update:
- Import `PayrollExportDataTable`, `PayrollExportDetailSheet`, `ConfirmDialog` from components
- Import `usePayrollExport`, `useDeletePayrollExport`, `useDownloadPayrollExport` from hooks
- Add `selectedItem` state for detail sheet (type `PayrollExportRow | null`)
- Add `deleteTarget` state for delete confirmation (type `PayrollExportRow | null`)
- Add `previewTarget` state (type `PayrollExportRow | null`, used in Phase 5)
- Wire `usePayrollExport(selectedItem?.id)` to load full export metadata for the detail sheet
- Wire `useDeletePayrollExport()` mutation with delete confirmation flow
- Wire `useDownloadPayrollExport()` mutation for download action
- Map `exportsData.data` items to `PayrollExportRow[]` (map API fields to the row interface)
- Replace placeholder content in Card with `PayrollExportDataTable`
- Add `PayrollExportDetailSheet` and `ConfirmDialog` overlays

The full updated page.tsx content:

```tsx
'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useAuth } from '@/providers/auth-provider'
import { useHasRole } from '@/hooks'
import {
  usePayrollExports,
  usePayrollExport,
  useDeletePayrollExport,
  useDownloadPayrollExport,
} from '@/hooks/api'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  PayrollExportSkeleton,
  PayrollExportToolbar,
  PayrollExportDataTable,
  PayrollExportDetailSheet,
} from '@/components/payroll-exports'
import type { PayrollExportRow } from '@/components/payroll-exports'

export default function PayrollExportsPage() {
  const router = useRouter()
  const t = useTranslations('payrollExports')
  const tc = useTranslations('common')
  const { isLoading: authLoading } = useAuth()
  const isAdmin = useHasRole(['admin'])

  // Filters
  const [year, setYear] = React.useState(() => new Date().getFullYear())
  const [month, setMonth] = React.useState(() => new Date().getMonth() + 1)
  const [statusFilter, setStatusFilter] = React.useState<string>('all')

  // Overlays
  const [generateOpen, setGenerateOpen] = React.useState(false)
  const [selectedItem, setSelectedItem] = React.useState<PayrollExportRow | null>(null)
  const [deleteTarget, setDeleteTarget] = React.useState<PayrollExportRow | null>(null)
  const [previewTarget, setPreviewTarget] = React.useState<PayrollExportRow | null>(null)

  // Auth guard
  React.useEffect(() => {
    if (!authLoading && !isAdmin) {
      router.push('/dashboard')
    }
  }, [authLoading, isAdmin, router])

  const enabled = !authLoading && isAdmin

  // Queries
  const { data: exportsData, isLoading: exportsLoading } = usePayrollExports({
    year,
    month,
    status: statusFilter !== 'all' ? statusFilter : undefined,
    enabled,
  })

  const { data: fullExportData } = usePayrollExport(selectedItem?.id)

  // Mutations
  const deleteMutation = useDeletePayrollExport()
  const downloadMutation = useDownloadPayrollExport()

  // Map API data to row type
  const exportRows: PayrollExportRow[] = React.useMemo(() => {
    const items = exportsData?.data ?? []
    return items.map((item) => ({
      id: item.id ?? '',
      year: item.year ?? year,
      month: item.month ?? month,
      export_type: item.export_type ?? 'standard',
      format: item.format ?? '',
      status: item.status ?? 'pending',
      employee_count: item.employee_count,
      total_hours: item.total_hours,
      requested_at: item.requested_at,
      completed_at: item.completed_at,
      error_message: item.error_message,
    }))
  }, [exportsData, year, month])

  // Handlers
  const handleDownload = (item: PayrollExportRow) => {
    downloadMutation.mutate({ id: item.id })
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await deleteMutation.mutateAsync({ path: { id: deleteTarget.id } })
      setDeleteTarget(null)
      if (selectedItem?.id === deleteTarget.id) {
        setSelectedItem(null)
      }
    } catch {
      // Error handled by mutation state
    }
  }

  const handlePreview = (item: PayrollExportRow) => {
    setPreviewTarget(item)
    setSelectedItem(null) // Close detail sheet if open
  }

  if (authLoading) {
    return <PayrollExportSkeleton />
  }

  if (!isAdmin) {
    return null
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('page.title')}</h1>
        <p className="text-muted-foreground">{t('page.subtitle')}</p>
      </div>

      <PayrollExportToolbar
        year={year}
        month={month}
        onYearChange={setYear}
        onMonthChange={setMonth}
        status={statusFilter}
        onStatusChange={setStatusFilter}
        onGenerate={() => setGenerateOpen(true)}
      />

      <div className="text-sm text-muted-foreground">
        {exportRows.length === 1
          ? t('count.item', { count: exportRows.length })
          : t('count.items', { count: exportRows.length })}
      </div>

      <Card>
        <CardContent className="p-0">
          {exportsLoading ? (
            <PayrollExportDataTable
              items={[]}
              isLoading={true}
              onRowClick={() => {}}
              onPreview={() => {}}
              onDownload={() => {}}
              onDelete={() => {}}
            />
          ) : exportRows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <h3 className="text-lg font-medium">{t('empty.title')}</h3>
              <p className="text-sm text-muted-foreground mt-1">{t('empty.description')}</p>
              <p className="text-sm text-muted-foreground mt-1">{t('empty.generateHint')}</p>
              <Button onClick={() => setGenerateOpen(true)} className="mt-4">
                <Plus className="mr-2 h-4 w-4" />
                {t('empty.generateButton')}
              </Button>
            </div>
          ) : (
            <PayrollExportDataTable
              items={exportRows}
              isLoading={false}
              onRowClick={setSelectedItem}
              onPreview={handlePreview}
              onDownload={handleDownload}
              onDelete={setDeleteTarget}
            />
          )}
        </CardContent>
      </Card>

      {/* Detail Sheet */}
      <PayrollExportDetailSheet
        item={selectedItem}
        open={!!selectedItem}
        onOpenChange={(open) => {
          if (!open) setSelectedItem(null)
        }}
        onPreview={handlePreview}
        onDownload={handleDownload}
        onDelete={(item) => {
          setSelectedItem(null)
          setDeleteTarget(item)
        }}
        fullExport={fullExportData ? {
          export_interface_id: fullExportData.export_interface_id,
          file_size: fullExportData.file_size,
          row_count: fullExportData.row_count,
          total_overtime: fullExportData.total_overtime,
          started_at: fullExportData.started_at,
          requested_at: fullExportData.requested_at,
          parameters: fullExportData.parameters,
        } : null}
      />

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        title={t('delete.title')}
        description={t('delete.description')}
        confirmLabel={t('delete.confirm')}
        cancelLabel={tc('cancel')}
        variant="destructive"
        isLoading={deleteMutation.isPending}
        onConfirm={handleDelete}
      />

      {/* Generate Dialog placeholder - Phase 5 */}
      {/* Preview component placeholder - Phase 5 */}
    </div>
  )
}
```

### Success Criteria:

#### Automated Verification:
- [ ] All new files exist
- [ ] TypeScript compilation passes: `cd apps/web && npx tsc --noEmit`
- [ ] No lint errors

#### Manual Verification:
- [ ] Data table renders with correct columns and status badges
- [ ] "Generating" status shows animated pulse badge with spinner icon
- [ ] Row click opens detail sheet with export metadata
- [ ] Actions dropdown shows Preview, Download, Delete
- [ ] Delete confirmation dialog appears and deletes on confirm
- [ ] Download triggers file save (if backend has completed exports)
- [ ] Empty state shows with "Generate Export" button

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to Phase 5.

---

## Phase 5: Generate Dialog + Preview Component

### Overview
Add the generate export dialog (with form, validation, and 409 handling) and the preview component (with dynamic account columns).

### Changes Required:

#### 1. Create generate export dialog
**File**: `apps/web/src/components/payroll-exports/generate-export-dialog.tsx`

```tsx
'use client'

import * as React from 'react'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Loader2, ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { useGeneratePayrollExport, useExportInterfaces } from '@/hooks/api'
import { parseApiError } from '@/lib/api/errors'
import { Link } from '@/i18n/navigation'

interface GenerateExportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultYear: number
  defaultMonth: number
}

export function GenerateExportDialog({
  open,
  onOpenChange,
  defaultYear,
  defaultMonth,
}: GenerateExportDialogProps) {
  const t = useTranslations('payrollExports')
  const tc = useTranslations('common')

  // Form state
  const [year, setYear] = useState(defaultYear)
  const [month, setMonth] = useState(defaultMonth)
  const [exportType, setExportType] = useState('standard')
  const [format, setFormat] = useState('csv')
  const [interfaceId, setInterfaceId] = useState<string | null>(null)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [employeeIds, setEmployeeIds] = useState('')
  const [departmentIds, setDepartmentIds] = useState('')
  const [accountIds, setAccountIds] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isMonthNotClosed, setIsMonthNotClosed] = useState(false)

  const generateMutation = useGeneratePayrollExport()
  const { data: interfacesData } = useExportInterfaces(open)
  const interfaces = interfacesData?.data ?? []

  // Reset form when opening
  React.useEffect(() => {
    if (open) {
      setYear(defaultYear)
      setMonth(defaultMonth)
      setExportType('standard')
      setFormat('csv')
      setInterfaceId(null)
      setShowAdvanced(false)
      setEmployeeIds('')
      setDepartmentIds('')
      setAccountIds('')
      setError(null)
      setIsMonthNotClosed(false)
    }
  }, [open, defaultYear, defaultMonth])

  const handleClose = () => {
    onOpenChange(false)
  }

  const parseIdList = (input: string): string[] => {
    return input
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  }

  const handleSubmit = async () => {
    setError(null)
    setIsMonthNotClosed(false)

    // Validation
    if (!year || !month || !format) {
      setError(t('generate.validationRequired'))
      return
    }

    const parameters: {
      employee_ids?: string[]
      department_ids?: string[]
      include_accounts?: string[]
    } = {}
    const empIds = parseIdList(employeeIds)
    const deptIds = parseIdList(departmentIds)
    const acctIds = parseIdList(accountIds)
    if (empIds.length > 0) parameters.employee_ids = empIds
    if (deptIds.length > 0) parameters.department_ids = deptIds
    if (acctIds.length > 0) parameters.include_accounts = acctIds

    try {
      await generateMutation.mutateAsync({
        body: {
          year,
          month,
          format,
          export_type: exportType,
          ...(interfaceId ? { export_interface_id: interfaceId } : {}),
          ...(Object.keys(parameters).length > 0 ? { parameters } : {}),
        },
      })
      handleClose()
    } catch (err) {
      const apiError = parseApiError(err)
      if (apiError.status === 409) {
        setIsMonthNotClosed(true)
        setError(t('generate.monthNotClosed'))
      } else {
        setError(apiError.message ?? t('generate.error'))
      }
    }
  }

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col">
        <SheetHeader>
          <SheetTitle>{t('generate.title')}</SheetTitle>
          <SheetDescription>{t('generate.description')}</SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 -mx-4 px-4">
          <div className="space-y-4 py-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>
                  {error}
                  {isMonthNotClosed && (
                    <Link
                      href="/admin/monthly-values"
                      className="block mt-2 underline text-sm"
                    >
                      {t('generate.monthNotClosedLink')}
                    </Link>
                  )}
                </AlertDescription>
              </Alert>
            )}

            {/* Year */}
            <div className="space-y-2">
              <Label>{t('generate.yearLabel')}</Label>
              <Input
                type="number"
                value={year}
                onChange={(e) => setYear(parseInt(e.target.value) || defaultYear)}
                min={2000}
                max={2100}
              />
            </div>

            {/* Month */}
            <div className="space-y-2">
              <Label>{t('generate.monthLabel')}</Label>
              <Select value={String(month)} onValueChange={(v) => setMonth(parseInt(v))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <SelectItem key={m} value={String(m)}>
                      {new Intl.DateTimeFormat('en', { month: 'long' }).format(new Date(2000, m - 1))}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Export Type */}
            <div className="space-y-2">
              <Label>{t('generate.exportTypeLabel')}</Label>
              <Select value={exportType} onValueChange={setExportType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="standard">{t('exportType.standard')}</SelectItem>
                  <SelectItem value="datev">{t('exportType.datev')}</SelectItem>
                  <SelectItem value="sage">{t('exportType.sage')}</SelectItem>
                  <SelectItem value="custom">{t('exportType.custom')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Format */}
            <div className="space-y-2">
              <Label>{t('generate.formatLabel')}</Label>
              <Select value={format} onValueChange={setFormat}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="csv">{t('format.csv')}</SelectItem>
                  <SelectItem value="xlsx">{t('format.xlsx')}</SelectItem>
                  <SelectItem value="xml">{t('format.xml')}</SelectItem>
                  <SelectItem value="json">{t('format.json')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Export Interface (optional) */}
            {interfaces.length > 0 && (
              <div className="space-y-2">
                <Label>{t('generate.interfaceLabel')}</Label>
                <Select
                  value={interfaceId ?? 'none'}
                  onValueChange={(v) => setInterfaceId(v === 'none' ? null : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('generate.interfacePlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t('generate.noInterface')}</SelectItem>
                    {interfaces.map((iface) => (
                      <SelectItem key={iface.id} value={iface.id ?? ''}>
                        {iface.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Advanced Parameters (collapsible) */}
            <div className="space-y-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full justify-between"
                onClick={() => setShowAdvanced(!showAdvanced)}
              >
                {t('generate.advancedParameters')}
                {showAdvanced ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </Button>

              {showAdvanced && (
                <div className="space-y-4 rounded-lg border p-4">
                  <div className="space-y-2">
                    <Label>{t('generate.employeeIdsLabel')}</Label>
                    <Input
                      value={employeeIds}
                      onChange={(e) => setEmployeeIds(e.target.value)}
                      placeholder={t('generate.employeeIdsPlaceholder')}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t('generate.departmentIdsLabel')}</Label>
                    <Input
                      value={departmentIds}
                      onChange={(e) => setDepartmentIds(e.target.value)}
                      placeholder={t('generate.departmentIdsPlaceholder')}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t('generate.accountIdsLabel')}</Label>
                    <Input
                      value={accountIds}
                      onChange={(e) => setAccountIds(e.target.value)}
                      placeholder={t('generate.accountIdsPlaceholder')}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </ScrollArea>

        <SheetFooter className="flex-row gap-2 border-t pt-4">
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={generateMutation.isPending}
            className="flex-1"
          >
            {tc('cancel')}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={generateMutation.isPending}
            className="flex-1"
          >
            {generateMutation.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            {t('generate.submit')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
```

#### 2. Create preview component
**File**: `apps/web/src/components/payroll-exports/payroll-export-preview.tsx`

```tsx
'use client'

import * as React from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from '@/components/ui/table'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { usePayrollExportPreview } from '@/hooks/api'
import type { PayrollExportLine } from '@/hooks/api'

interface PayrollExportPreviewProps {
  exportId: string | undefined
  exportYear?: number
  exportMonth?: number
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function PayrollExportPreview({
  exportId,
  exportYear,
  exportMonth,
  open,
  onOpenChange,
}: PayrollExportPreviewProps) {
  const t = useTranslations('payrollExports')
  const locale = useLocale()

  const { data: previewData, isLoading, error } = usePayrollExportPreview(
    exportId,
    open && !!exportId
  )

  const lines = previewData?.lines ?? []
  const summary = previewData?.summary

  // Collect all unique account codes from all lines
  const accountCodes = React.useMemo(() => {
    const codes = new Set<string>()
    for (const line of lines) {
      if (line.account_values) {
        Object.keys(line.account_values).forEach((code) => codes.add(code))
      }
    }
    return Array.from(codes).sort()
  }, [lines])

  const periodLabel = React.useMemo(() => {
    if (!exportYear || !exportMonth) return ''
    const formatter = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' })
    return formatter.format(new Date(exportYear, exportMonth - 1, 1))
  }, [exportYear, exportMonth, locale])

  const formatDecimal = (value?: number) => {
    if (value == null) return '-'
    return value.toFixed(2)
  }

  // Compute summary totals for the footer
  const totals = React.useMemo(() => {
    const result = {
      target_hours: 0,
      worked_hours: 0,
      overtime_hours: 0,
      vacation_days: 0,
      sick_days: 0,
      other_absence_days: 0,
      accounts: {} as Record<string, number>,
    }
    for (const line of lines) {
      result.target_hours += line.target_hours ?? 0
      result.worked_hours += line.worked_hours ?? 0
      result.overtime_hours += line.overtime_hours ?? 0
      result.vacation_days += line.vacation_days ?? 0
      result.sick_days += line.sick_days ?? 0
      result.other_absence_days += line.other_absence_days ?? 0
      if (line.account_values) {
        for (const [code, value] of Object.entries(line.account_values)) {
          result.accounts[code] = (result.accounts[code] ?? 0) + value
        }
      }
    }
    return result
  }, [lines])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-4xl flex flex-col">
        <SheetHeader>
          <SheetTitle>{t('preview.title')}</SheetTitle>
          <SheetDescription>
            {t('preview.description', { period: periodLabel })}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 -mx-4 px-4">
          {isLoading && (
            <div className="flex flex-col items-center justify-center py-8 gap-4">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          )}

          {error && (
            <Alert variant="destructive" className="my-4">
              <AlertDescription>{t('preview.notReady')}</AlertDescription>
            </Alert>
          )}

          {!isLoading && !error && lines.length === 0 && (
            <div className="py-8 text-center text-muted-foreground">
              {t('preview.noData')}
            </div>
          )}

          {!isLoading && lines.length > 0 && (
            <div className="overflow-x-auto py-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap">{t('preview.personnelNumber')}</TableHead>
                    <TableHead className="whitespace-nowrap">{t('preview.firstName')}</TableHead>
                    <TableHead className="whitespace-nowrap">{t('preview.lastName')}</TableHead>
                    <TableHead className="whitespace-nowrap">{t('preview.department')}</TableHead>
                    <TableHead className="whitespace-nowrap">{t('preview.costCenter')}</TableHead>
                    <TableHead className="whitespace-nowrap text-right">{t('preview.targetHours')}</TableHead>
                    <TableHead className="whitespace-nowrap text-right">{t('preview.workedHours')}</TableHead>
                    <TableHead className="whitespace-nowrap text-right">{t('preview.overtimeHours')}</TableHead>
                    <TableHead className="whitespace-nowrap text-right">{t('preview.vacationDays')}</TableHead>
                    <TableHead className="whitespace-nowrap text-right">{t('preview.sickDays')}</TableHead>
                    <TableHead className="whitespace-nowrap text-right">{t('preview.otherAbsenceDays')}</TableHead>
                    {accountCodes.map((code) => (
                      <TableHead key={code} className="whitespace-nowrap text-right">
                        {code}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((line, index) => (
                    <TableRow key={line.employee_id ?? index}>
                      <TableCell className="font-mono text-sm">{line.personnel_number}</TableCell>
                      <TableCell>{line.first_name ?? ''}</TableCell>
                      <TableCell>{line.last_name ?? ''}</TableCell>
                      <TableCell>{line.department_code ?? ''}</TableCell>
                      <TableCell>{line.cost_center_code ?? ''}</TableCell>
                      <TableCell className="text-right">{formatDecimal(line.target_hours)}</TableCell>
                      <TableCell className="text-right">{formatDecimal(line.worked_hours)}</TableCell>
                      <TableCell className="text-right">{formatDecimal(line.overtime_hours)}</TableCell>
                      <TableCell className="text-right">{formatDecimal(line.vacation_days)}</TableCell>
                      <TableCell className="text-right">{formatDecimal(line.sick_days)}</TableCell>
                      <TableCell className="text-right">{formatDecimal(line.other_absence_days)}</TableCell>
                      {accountCodes.map((code) => (
                        <TableCell key={code} className="text-right">
                          {formatDecimal(line.account_values?.[code])}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow className="font-medium">
                    <TableCell colSpan={5} className="text-right">
                      {t('preview.summaryRow')}
                    </TableCell>
                    <TableCell className="text-right">{formatDecimal(totals.target_hours)}</TableCell>
                    <TableCell className="text-right">{formatDecimal(totals.worked_hours)}</TableCell>
                    <TableCell className="text-right">{formatDecimal(totals.overtime_hours)}</TableCell>
                    <TableCell className="text-right">{formatDecimal(totals.vacation_days)}</TableCell>
                    <TableCell className="text-right">{formatDecimal(totals.sick_days)}</TableCell>
                    <TableCell className="text-right">{formatDecimal(totals.other_absence_days)}</TableCell>
                    {accountCodes.map((code) => (
                      <TableCell key={code} className="text-right">
                        {formatDecimal(totals.accounts[code])}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          )}
        </ScrollArea>

        <SheetFooter className="flex-row gap-2 border-t pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
            {t('preview.close')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
```

#### 3. Update barrel exports (final)
**File**: `apps/web/src/components/payroll-exports/index.ts`

```ts
export { PayrollExportSkeleton } from './payroll-export-skeleton'
export { PayrollExportToolbar } from './payroll-export-toolbar'
export { PayrollExportDataTable } from './payroll-export-data-table'
export type { PayrollExportRow } from './payroll-export-data-table'
export { PayrollExportDetailSheet } from './payroll-export-detail-sheet'
export { GenerateExportDialog } from './generate-export-dialog'
export { PayrollExportPreview } from './payroll-export-preview'
```

#### 4. Final page update -- integrate generate dialog and preview
**File**: `apps/web/src/app/[locale]/(dashboard)/admin/payroll-exports/page.tsx`
**Changes**: Add the two remaining imports and components.

Add to imports:
```tsx
import {
  // ... existing imports ...
  GenerateExportDialog,
  PayrollExportPreview,
} from '@/components/payroll-exports'
```

Add after the ConfirmDialog in the JSX return:
```tsx
{/* Generate Export Dialog */}
<GenerateExportDialog
  open={generateOpen}
  onOpenChange={setGenerateOpen}
  defaultYear={year}
  defaultMonth={month > 1 ? month - 1 : 12}
/>

{/* Preview */}
<PayrollExportPreview
  exportId={previewTarget?.id}
  exportYear={previewTarget?.year}
  exportMonth={previewTarget?.month}
  open={!!previewTarget}
  onOpenChange={(open) => {
    if (!open) setPreviewTarget(null)
  }}
/>
```

Note: `defaultMonth` for the generate dialog defaults to the previous month (common pattern for payroll exports -- you export last month's data).

### Success Criteria:

#### Automated Verification:
- [ ] All new files exist
- [ ] TypeScript compilation passes: `cd apps/web && npx tsc --noEmit`
- [ ] No lint errors
- [ ] Barrel exports include all components

#### Manual Verification:
- [ ] "Generate Export" button opens the generate dialog
- [ ] Generate dialog shows year, month, export type, format selects
- [ ] Export interface dropdown appears if interfaces exist
- [ ] "Advanced Parameters" section is collapsible
- [ ] Submitting generates an export (202 accepted)
- [ ] After generation, export appears in list with "Pending" status
- [ ] Status badge transitions from Pending to Generating (animated) to Completed via polling
- [ ] 409 error shows "month not closed" message with link to monthly values
- [ ] Preview opens for completed exports and shows data table with dynamic account columns
- [ ] Summary row at bottom shows totals
- [ ] Preview handles wide tables with horizontal scroll

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation. This completes the full implementation.

---

## File Summary

### New Files (9):

| File | Phase |
|------|-------|
| `apps/web/src/hooks/api/use-payroll-exports.ts` | 1 |
| `apps/web/src/components/payroll-exports/payroll-export-skeleton.tsx` | 3 |
| `apps/web/src/components/payroll-exports/payroll-export-toolbar.tsx` | 3 |
| `apps/web/src/components/payroll-exports/index.ts` | 3 (updated in 4, 5) |
| `apps/web/src/app/[locale]/(dashboard)/admin/payroll-exports/page.tsx` | 3 (updated in 4, 5) |
| `apps/web/src/components/payroll-exports/payroll-export-data-table.tsx` | 4 |
| `apps/web/src/components/payroll-exports/payroll-export-detail-sheet.tsx` | 4 |
| `apps/web/src/components/payroll-exports/generate-export-dialog.tsx` | 5 |
| `apps/web/src/components/payroll-exports/payroll-export-preview.tsx` | 5 |

### Modified Files (5):

| File | Phase | Change |
|------|-------|--------|
| `apps/web/src/hooks/api/index.ts` | 1 | Add payroll export hook re-exports |
| `apps/web/src/components/layout/sidebar/sidebar-nav-config.ts` | 2 | Add FileOutput import + admin nav item |
| `apps/web/src/components/layout/breadcrumbs.tsx` | 2 | Add payroll-exports segment mapping |
| `apps/web/messages/en.json` | 2 | Add nav, breadcrumb, payrollExports namespace |
| `apps/web/messages/de.json` | 2 | Add nav, breadcrumb, payrollExports namespace |

---

## Testing Strategy

### Manual Testing Steps:
1. Navigate to `/admin/payroll-exports` as admin -- page loads with empty state
2. Click "Generate Export" -- dialog opens with form
3. Fill in year=2026, month=1, format=CSV, type=standard, click Generate
4. Verify export appears in list with pending/generating status and animated badge
5. Wait for polling to transition status to completed
6. Click the completed export row -- detail sheet opens with all metadata
7. Click "Preview" -- preview sheet shows data table with employee rows
8. Click "Download" -- browser downloads the CSV file
9. Click "Delete" on an export -- confirmation appears, confirm deletes it
10. Attempt to generate for an unclosed month -- verify 409 error message with link
11. Switch locale to DE -- verify all text is translated
12. Verify breadcrumb shows "Payroll Exports" / "Lohnexporte"
13. Verify sidebar shows the entry in Administration section

### Edge Cases to Test:
- Export with no employee data (empty preview)
- Failed export with error_message displayed in detail sheet
- Multiple exports generating simultaneously (all show animated badges)
- Preview with many dynamic account columns (horizontal scroll)
- Delete while detail sheet is open (sheet closes)
- Generate dialog with export interfaces available vs. none

## References

- Original ticket: `thoughts/shared/tickets/ZMI-TICKET-044-payroll-export-ui.md`
- Research document: `thoughts/shared/research/2026-02-03-ZMI-TICKET-044-payroll-export-ui.md`
- Pattern reference (page): `apps/web/src/app/[locale]/(dashboard)/admin/monthly-values/page.tsx`
- Pattern reference (hooks): `apps/web/src/hooks/api/use-admin-monthly-values.ts`
- Pattern reference (data table): `apps/web/src/components/monthly-values/monthly-values-data-table.tsx`
- Pattern reference (toolbar): `apps/web/src/components/monthly-values/monthly-values-toolbar.tsx`
- Pattern reference (detail sheet): `apps/web/src/components/monthly-values/monthly-values-detail-sheet.tsx`
- Pattern reference (complex dialog): `apps/web/src/components/monthly-values/batch-close-dialog.tsx`
- Pattern reference (actions dropdown): `apps/web/src/components/booking-types/booking-type-data-table.tsx`
- Pattern reference (delete confirm): `apps/web/src/components/ui/confirm-dialog.tsx`
- Pattern reference (202 mutation): `apps/web/src/hooks/api/use-admin-monthly-values.ts` lines 87-105
