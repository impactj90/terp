# Implementation Plan: ZMI-TICKET-053 - Audit Log Viewer UI

## Overview

Read-only audit log viewer page at `/admin/audit-logs` with filters (date range, user, entity type, action), a data table with cursor-based "Load More" pagination, and a detail sheet with before/after JSON diff visualization. Admin-only access.

---

## Phase 1: API Hooks & Types

### File: `apps/web/src/hooks/api/use-audit-logs.ts` (CREATE)

Follow the pattern from `use-reports.ts` and `use-evaluations.ts`.

```ts
import { useApiQuery } from '@/hooks'
import type { components } from '@/lib/api/types'

// --- Types ---

type AuditAction = components['schemas']['AuditLog']['action']

interface UseAuditLogsOptions {
  userId?: string
  entityType?: string
  entityId?: string
  action?: AuditAction
  from?: string
  to?: string
  limit?: number
  cursor?: string
  enabled?: boolean
}

// --- Query Hooks ---

/**
 * List audit logs with filters.
 * GET /audit-logs
 */
export function useAuditLogs(options: UseAuditLogsOptions = {}) {
  const { userId, entityType, entityId, action, from, to, limit, cursor, enabled = true } = options
  return useApiQuery('/audit-logs', {
    params: {
      user_id: userId,
      entity_type: entityType,
      entity_id: entityId,
      action,
      from,
      to,
      limit,
      cursor,
    },
    enabled,
  })
}

/**
 * Get a single audit log by ID.
 * GET /audit-logs/{id}
 */
export function useAuditLog(id: string | undefined) {
  return useApiQuery('/audit-logs/{id}', {
    path: { id: id! },
    enabled: !!id,
  })
}
```

**Key details:**
- `useAuditLogs` wraps `useApiQuery('/audit-logs', ...)` with all filter params matching the OpenAPI spec query parameters: `user_id`, `entity_type`, `entity_id`, `action`, `from`, `to`, `limit`, `cursor`.
- `useAuditLog` wraps `useApiQuery('/audit-logs/{id}', ...)` with path param `id`, only enabled when `id` is truthy.
- `AuditAction` type is derived from the generated schema to stay in sync.
- No mutations needed (audit logs are read-only).

### File: `apps/web/src/hooks/api/index.ts` (MODIFY)

Add at the bottom, before the closing of the file, following the existing section comment pattern:

```ts
// Audit Logs
export {
  useAuditLogs,
  useAuditLog,
} from './use-audit-logs'
```

### Verification

```bash
cd /home/tolga/projects/terp/apps/web && npx tsc --noEmit --pretty 2>&1 | head -30
```

Confirm no type errors in `use-audit-logs.ts` or `index.ts`.

---

## Phase 2: Translation Files

### File: `apps/web/messages/en.json` (MODIFY)

**Add to `nav` object** (after `"evaluations": "Evaluations"`):
```json
"auditLogs": "Audit Logs"
```

**Add to `breadcrumbs` object** (after `"evaluations": "Evaluations"`):
```json
"auditLogs": "Audit Logs"
```

**Add new top-level namespace** `"auditLogs"` (place after `"evaluations"` namespace block):
```json
"auditLogs": {
  "page": {
    "title": "Audit Logs",
    "subtitle": "Review system activity, changes, and user actions for compliance and debugging"
  },
  "filters": {
    "dateRange": "Date Range",
    "user": "User",
    "allUsers": "All Users",
    "entityType": "Entity Type",
    "allEntityTypes": "All Entity Types",
    "entityId": "Entity ID",
    "entityIdPlaceholder": "Enter entity UUID...",
    "action": "Action",
    "allActions": "All Actions",
    "clearFilters": "Clear filters"
  },
  "table": {
    "timestamp": "Timestamp",
    "user": "User",
    "action": "Action",
    "entityType": "Entity Type",
    "entityName": "Entity Name",
    "ipAddress": "IP Address",
    "details": "Details"
  },
  "actions": {
    "create": "Create",
    "update": "Update",
    "delete": "Delete",
    "approve": "Approve",
    "reject": "Reject",
    "close": "Close",
    "reopen": "Reopen",
    "export": "Export",
    "import": "Import",
    "login": "Login",
    "logout": "Logout"
  },
  "entityTypes": {
    "booking": "Booking",
    "absence": "Absence",
    "monthly_value": "Monthly Value",
    "daily_value": "Daily Value",
    "employee": "Employee",
    "user": "User",
    "department": "Department",
    "team": "Team",
    "cost_center": "Cost Center",
    "employment_type": "Employment Type",
    "day_plan": "Day Plan",
    "week_plan": "Week Plan",
    "tariff": "Tariff",
    "holiday": "Holiday",
    "absence_type": "Absence Type",
    "booking_type": "Booking Type",
    "account": "Account",
    "vacation_balance": "Vacation Balance",
    "report": "Report",
    "tenant": "Tenant",
    "user_group": "User Group",
    "notification_preference": "Notification Preference",
    "employee_tariff_assignment": "Tariff Assignment",
    "employee_day_plan": "Employee Day Plan",
    "payroll_export": "Payroll Export",
    "export_interface": "Export Interface",
    "monthly_evaluation": "Evaluation Template",
    "correction_message": "Correction Message"
  },
  "detail": {
    "title": "Audit Log Details",
    "eventInfo": "Event Information",
    "userInfo": "User Information",
    "requestInfo": "Request Information",
    "timestamps": "Timestamps",
    "changesSection": "Changes",
    "metadataSection": "Metadata",
    "entityType": "Entity Type",
    "entityName": "Entity Name",
    "entityId": "Entity ID",
    "action": "Action",
    "user": "User",
    "userId": "User ID",
    "ipAddress": "IP Address",
    "userAgent": "User Agent",
    "performedAt": "Performed At",
    "close": "Close",
    "copied": "Copied!",
    "copyId": "Copy ID"
  },
  "diff": {
    "field": "Field",
    "before": "Before",
    "after": "After",
    "noChanges": "No changes recorded",
    "added": "Added",
    "removed": "Removed",
    "modified": "Modified"
  },
  "metadata": {
    "noMetadata": "No additional metadata"
  },
  "empty": {
    "title": "No audit log entries found",
    "description": "No audit log entries match the selected filters. Try adjusting your filter criteria."
  },
  "count": {
    "items": "{count} results",
    "item": "{count} result"
  },
  "pagination": {
    "loadMore": "Load More",
    "loading": "Loading...",
    "allLoaded": "All entries loaded"
  },
  "system": "System"
}
```

### File: `apps/web/messages/de.json` (MODIFY)

**Add to `nav` object** (after `"evaluations": "Auswertungen"`):
```json
"auditLogs": "Audit-Protokoll"
```

**Add to `breadcrumbs` object** (after `"evaluations": "Auswertungen"`):
```json
"auditLogs": "Audit-Protokoll"
```

**Add new top-level namespace** `"auditLogs"`:
```json
"auditLogs": {
  "page": {
    "title": "Audit-Protokoll",
    "subtitle": "Systemaktivitaeten, Aenderungen und Benutzeraktionen fuer Compliance und Fehlersuche ueberpruefen"
  },
  "filters": {
    "dateRange": "Zeitraum",
    "user": "Benutzer",
    "allUsers": "Alle Benutzer",
    "entityType": "Entitaetstyp",
    "allEntityTypes": "Alle Entitaetstypen",
    "entityId": "Entitaets-ID",
    "entityIdPlaceholder": "Entitaets-UUID eingeben...",
    "action": "Aktion",
    "allActions": "Alle Aktionen",
    "clearFilters": "Filter zuruecksetzen"
  },
  "table": {
    "timestamp": "Zeitstempel",
    "user": "Benutzer",
    "action": "Aktion",
    "entityType": "Entitaetstyp",
    "entityName": "Entitaetsname",
    "ipAddress": "IP-Adresse",
    "details": "Details"
  },
  "actions": {
    "create": "Erstellen",
    "update": "Aktualisieren",
    "delete": "Loeschen",
    "approve": "Genehmigen",
    "reject": "Ablehnen",
    "close": "Schliessen",
    "reopen": "Wiedereroeffnen",
    "export": "Exportieren",
    "import": "Importieren",
    "login": "Anmeldung",
    "logout": "Abmeldung"
  },
  "entityTypes": {
    "booking": "Buchung",
    "absence": "Abwesenheit",
    "monthly_value": "Monatswert",
    "daily_value": "Tageswert",
    "employee": "Mitarbeiter",
    "user": "Benutzer",
    "department": "Abteilung",
    "team": "Team",
    "cost_center": "Kostenstelle",
    "employment_type": "Beschaeftigungsart",
    "day_plan": "Tagesplan",
    "week_plan": "Wochenplan",
    "tariff": "Tarif",
    "holiday": "Feiertag",
    "absence_type": "Abwesenheitsart",
    "booking_type": "Buchungstyp",
    "account": "Konto",
    "vacation_balance": "Urlaubskonto",
    "report": "Bericht",
    "tenant": "Mandant",
    "user_group": "Benutzergruppe",
    "notification_preference": "Benachrichtigungseinstellung",
    "employee_tariff_assignment": "Tarifzuweisung",
    "employee_day_plan": "Mitarbeiter-Tagesplan",
    "payroll_export": "Lohnexport",
    "export_interface": "Exportschnittstelle",
    "monthly_evaluation": "Auswertungsvorlage",
    "correction_message": "Korrekturmeldung"
  },
  "detail": {
    "title": "Audit-Protokoll Details",
    "eventInfo": "Ereignisinformationen",
    "userInfo": "Benutzerinformationen",
    "requestInfo": "Anfrageinformationen",
    "timestamps": "Zeitstempel",
    "changesSection": "Aenderungen",
    "metadataSection": "Metadaten",
    "entityType": "Entitaetstyp",
    "entityName": "Entitaetsname",
    "entityId": "Entitaets-ID",
    "action": "Aktion",
    "user": "Benutzer",
    "userId": "Benutzer-ID",
    "ipAddress": "IP-Adresse",
    "userAgent": "User Agent",
    "performedAt": "Durchgefuehrt am",
    "close": "Schliessen",
    "copied": "Kopiert!",
    "copyId": "ID kopieren"
  },
  "diff": {
    "field": "Feld",
    "before": "Vorher",
    "after": "Nachher",
    "noChanges": "Keine Aenderungen aufgezeichnet",
    "added": "Hinzugefuegt",
    "removed": "Entfernt",
    "modified": "Geaendert"
  },
  "metadata": {
    "noMetadata": "Keine zusaetzlichen Metadaten"
  },
  "empty": {
    "title": "Keine Audit-Protokolleintraege gefunden",
    "description": "Keine Audit-Protokolleintraege entsprechen den ausgewaehlten Filtern. Versuchen Sie, Ihre Filterkriterien anzupassen."
  },
  "count": {
    "items": "{count} Ergebnisse",
    "item": "{count} Ergebnis"
  },
  "pagination": {
    "loadMore": "Mehr laden",
    "loading": "Laden...",
    "allLoaded": "Alle Eintraege geladen"
  },
  "system": "System"
}
```

### Verification

```bash
cd /home/tolga/projects/terp/apps/web && node -e "const en=require('./messages/en.json'); const de=require('./messages/de.json'); console.log('EN auditLogs:', !!en.auditLogs); console.log('DE auditLogs:', !!de.auditLogs); console.log('EN nav.auditLogs:', en.nav.auditLogs); console.log('DE nav.auditLogs:', de.nav.auditLogs); console.log('EN breadcrumbs.auditLogs:', en.breadcrumbs.auditLogs); console.log('DE breadcrumbs.auditLogs:', de.breadcrumbs.auditLogs);"
```

---

## Phase 3: Core Components

All new components go in `apps/web/src/components/audit-logs/`.

### 3.1: File: `apps/web/src/components/audit-logs/audit-log-json-diff.tsx` (CREATE)

Reusable JSON diff component. Enhanced version of the `renderChanges()` function from `evaluation-detail-sheet.tsx`.

```tsx
'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'

interface AuditLogJsonDiffProps {
  before: Record<string, unknown> | null | undefined
  after: Record<string, unknown> | null | undefined
}
```

**Key implementation details:**
- Accept `before` and `after` as props (extracted from `changes.before` / `changes.after` by the caller).
- Compute `allKeys` from union of both objects' keys.
- For each key, compare `JSON.stringify(before[key])` vs `JSON.stringify(after[key])`:
  - If only in `after` -> "added" (green background)
  - If only in `before` -> "removed" (red background)
  - If different -> "modified" (red before, green after)
- Render as a 3-column grid: `Field | Before | After` (matching the existing pattern from `evaluation-detail-sheet.tsx`).
- Grid header: `<div className="grid grid-cols-3 gap-2 text-xs font-medium text-muted-foreground border-b pb-1">`
- Before value: `<span className="bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200 px-1 rounded truncate">`
- After value: `<span className="bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200 px-1 rounded truncate">`
- Handle nested objects by flattening with dotted paths (e.g., `address.city`). Write a recursive `flattenObject(obj, prefix)` helper.
- Handle arrays by JSON.stringify comparison.
- Handle null/undefined values gracefully (display as `null` or `-`).
- When `before` and `after` are both null/empty, show `t('diff.noChanges')`.
- When changes don't have before/after structure, fall back to raw JSON: `<pre className="text-xs font-mono whitespace-pre-wrap break-words overflow-auto max-h-64 bg-muted p-2 rounded">`

### 3.2: File: `apps/web/src/components/audit-logs/audit-log-filters.tsx` (CREATE)

Follow the pattern from `evaluations-shared-filters.tsx` and `logs-tab.tsx` inline filters.

```tsx
'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { X } from 'lucide-react'
import { DateRangePicker, type DateRange } from '@/components/ui/date-range-picker'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

interface AuditLogFiltersProps {
  dateRange: DateRange | undefined
  onDateRangeChange: (range: DateRange | undefined) => void
  userId: string | null
  onUserChange: (id: string | null) => void
  entityType: string | null
  onEntityTypeChange: (type: string | null) => void
  entityId: string
  onEntityIdChange: (id: string) => void
  action: string | null
  onActionChange: (action: string | null) => void
  users: Array<{ id: string; display_name: string }>
  isLoadingUsers?: boolean
  onClearFilters: () => void
  hasFilters: boolean
}
```

**Key implementation details:**
- 5-column grid layout: `className="grid gap-4 md:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 md:items-end"`
- Date Range: `DateRangePicker` component (same as evaluations).
- User: `Select` with "all" sentinel, populated from `useUsers` passed as prop.
- Entity Type: `Select` with "all" sentinel. Hardcoded array of known entity types: `['booking', 'absence', 'monthly_value', 'daily_value', 'employee', 'user', 'department', 'team', 'cost_center', 'employment_type', 'day_plan', 'week_plan', 'tariff', 'holiday', 'absence_type', 'booking_type', 'account', 'vacation_balance', 'report']`. Display labels from `t('entityTypes.${type}')`.
- Action: `Select` with "all" sentinel. Actions from API enum: `['create', 'update', 'delete', 'approve', 'reject', 'close', 'reopen', 'export', 'import', 'login', 'logout']`. Labels from `t('actions.${action}')`.
- Entity ID: `Input` for UUID text input with placeholder from `t('filters.entityIdPlaceholder')`.
- Clear button: Show when `hasFilters` is true. `<Button variant="ghost" onClick={onClearFilters} size="sm"><X className="mr-2 h-4 w-4" />{t('filters.clearFilters')}</Button>`
- Note: The API only accepts a single `action` value, so use a single Select (not multi-select). This matches the API spec constraint.

### 3.3: File: `apps/web/src/components/audit-logs/audit-log-detail-sheet.tsx` (CREATE)

Follow pattern from `evaluation-detail-sheet.tsx` and `report-detail-sheet.tsx`.

```tsx
'use client'

import { useTranslations, useLocale } from 'next-intl'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { AuditLogJsonDiff } from './audit-log-json-diff'
import type { components } from '@/lib/api/types'
```

**Props:**
```tsx
interface AuditLogDetailSheetProps {
  entry: components['schemas']['AuditLog'] | null
  open: boolean
  onOpenChange: (open: boolean) => void
}
```

**Key implementation details:**
- Use `Sheet` / `SheetContent side="right" className="w-full sm:max-w-lg flex flex-col"` (exact same as evaluations).
- `ScrollArea className="flex-1 -mx-4 px-4"` for scrollable content.
- **Sections** (each with `<h4 className="text-sm font-medium text-muted-foreground">` header and `<div className="rounded-lg border p-4 space-y-2">` content):
  1. **Event Info**: Action badge, entity type (translated), entity name, entity ID (with copy-to-clipboard button using `navigator.clipboard.writeText`).
  2. **User Info**: Display name with avatar (`Avatar` + `AvatarImage` + `AvatarFallback`), user ID.
  3. **Request Info**: IP address (show `t('system')` when null), user agent.
  4. **Timestamps**: `performed_at` formatted with `Intl.DateTimeFormat(locale, { dateStyle: 'full', timeStyle: 'medium' })`.
  5. **Changes**: Use `AuditLogJsonDiff` component. Extract `before`/`after` from `entry.changes`. If changes exist but don't have before/after structure, show raw JSON.
  6. **Metadata**: Key-value display (same pattern as `renderMetadata` from evaluation detail sheet). Show `t('metadata.noMetadata')` when empty.
- Action badge config: Extended version with all audit log actions:
```tsx
const actionBadgeConfig: Record<string, { variant: 'default' | 'destructive' | 'outline'; className: string }> = {
  create:  { variant: 'default',     className: 'bg-green-600 hover:bg-green-700' },
  update:  { variant: 'outline',     className: 'border-blue-500 text-blue-700' },
  delete:  { variant: 'destructive', className: '' },
  approve: { variant: 'default',     className: 'bg-green-600 hover:bg-green-700' },
  reject:  { variant: 'destructive', className: '' },
  close:   { variant: 'outline',     className: 'border-purple-500 text-purple-700' },
  reopen:  { variant: 'outline',     className: 'border-orange-500 text-orange-700' },
  export:  { variant: 'outline',     className: 'border-cyan-500 text-cyan-700' },
  import:  { variant: 'outline',     className: 'border-teal-500 text-teal-700' },
  login:   { variant: 'outline',     className: '' },
  logout:  { variant: 'outline',     className: '' },
}
```
- `SheetFooter` with Close button: `<Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">`
- Format date using `useLocale()` and `Intl.DateTimeFormat`.

### 3.4: File: `apps/web/src/components/audit-logs/audit-log-data-table.tsx` (CREATE)

Follow pattern from `report-data-table.tsx` and `logs-tab.tsx`.

```tsx
'use client'

import * as React from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { Eye } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { components } from '@/lib/api/types'
```

**Props:**
```tsx
type AuditLogEntry = components['schemas']['AuditLog']

interface AuditLogDataTableProps {
  items: AuditLogEntry[]
  isLoading: boolean
  onRowClick: (item: AuditLogEntry) => void
}
```

**Key implementation details:**
- Same `actionBadgeConfig` as detail sheet (define once, export from a shared `audit-log-utils.ts` or define in both files).
- **Columns**: Timestamp, User, Action (badge), Entity Type, Entity Name, IP Address, Details button.
- Timestamp: `Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' })` -- same as other tables.
- User column: Avatar (small, `size="sm"`) + display_name. Show `-` for null user (system actions).
- Action: Badge with translated label from `t('actions.${action}')`.
- Entity Type: Translated label from `t('entityTypes.${entity_type}')` with fallback to formatting the raw string.
- Entity Name: Truncated with `className="max-w-[150px] truncate"`.
- IP Address: Show `t('system')` when `ip_address` is null.
- Details: `<Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); onRowClick(item) }}><Eye className="h-4 w-4" /></Button>`
- Row click: `<TableRow className="cursor-pointer" onClick={() => onRowClick(item)}>`.
- Loading state: Inline `AuditLogDataTableSkeleton` function (same pattern as `ReportDataTableSkeleton` / `LogsDataTableSkeleton`).
- When `isLoading` is true, render skeleton. When `items.length === 0`, return `null` (empty state handled by parent).

### 3.5: File: `apps/web/src/components/audit-logs/audit-log-skeleton.tsx` (CREATE)

Follow pattern from `report-skeleton.tsx`.

```tsx
import { Skeleton } from '@/components/ui/skeleton'

export function AuditLogSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-96" />
      </div>
      {/* Filter area */}
      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-5">
        <Skeleton className="h-9" />
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

### 3.6: File: `apps/web/src/components/audit-logs/index.ts` (CREATE)

Barrel exports following `reports/index.ts` pattern:

```ts
export { AuditLogSkeleton } from './audit-log-skeleton'
export { AuditLogFilters } from './audit-log-filters'
export { AuditLogDataTable } from './audit-log-data-table'
export { AuditLogDetailSheet } from './audit-log-detail-sheet'
export { AuditLogJsonDiff } from './audit-log-json-diff'
```

### Verification

```bash
cd /home/tolga/projects/terp/apps/web && npx tsc --noEmit --pretty 2>&1 | head -50
```

---

## Phase 4: Page & Navigation

### 4.1: File: `apps/web/src/app/[locale]/(dashboard)/admin/audit-logs/page.tsx` (CREATE)

Follow the pattern from `evaluations/page.tsx` (most similar: read-only with filters, URL sync, detail sheet, no tabs).

```tsx
'use client'

import * as React from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useAuth } from '@/providers/auth-provider'
import { useHasRole } from '@/hooks'
import { useAuditLogs } from '@/hooks/api'
import { useUsers } from '@/hooks/api'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'
import {
  AuditLogSkeleton,
  AuditLogFilters,
  AuditLogDataTable,
  AuditLogDetailSheet,
} from '@/components/audit-logs'
import type { DateRange } from '@/components/ui/date-range-picker'
import type { components } from '@/lib/api/types'
```

**Key implementation details:**

1. **Auth guard** (exact same pattern as evaluations/reports):
```tsx
const { isLoading: authLoading } = useAuth()
const isAdmin = useHasRole(['admin'])

React.useEffect(() => {
  if (!authLoading && !isAdmin) {
    router.push('/dashboard')
  }
}, [authLoading, isAdmin, router])
```

2. **Filter state from URL** (read `searchParams` on mount, sync changes back):
   - `from`, `to` (date range, default: last 24 hours as ISO datetime strings)
   - `user_id`
   - `entity_type`
   - `entity_id`
   - `action`
   - Use the `syncToUrl` pattern with `useRef` from evaluations page to avoid infinite loops.

3. **Default date range**: Last 24 hours.
```tsx
const [dateRange, setDateRange] = React.useState<DateRange | undefined>(() => {
  if (initialFrom && initialTo) {
    return { from: new Date(initialFrom), to: new Date(initialTo) }
  }
  const now = new Date()
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  return { from: yesterday, to: now }
})
```

4. **Cursor-based pagination with "Load More"**:
   - Maintain `allItems` state array (accumulated entries).
   - Maintain `cursors` state: `{ current: string | undefined }`.
   - When `useAuditLogs` returns data, append new items to `allItems`.
   - "Load More" button sets cursor to last item's ID.
   - When filters change, reset `allItems` to `[]` and `cursor` to `undefined`.
   - Use `React.useEffect` watching `data` to append results.
   - Track `hasMore` by checking if `data?.data?.length === limit`.

```tsx
const [allItems, setAllItems] = React.useState<components['schemas']['AuditLog'][]>([])
const [cursor, setCursor] = React.useState<string | undefined>(undefined)
const [limit] = React.useState(50)

// Convert dateRange to ISO strings for API
const fromStr = dateRange?.from?.toISOString()
const toStr = dateRange?.to?.toISOString()

const { data, isLoading, isFetching } = useAuditLogs({
  userId: userId ?? undefined,
  entityType: entityType ?? undefined,
  entityId: entityId || undefined,
  action: action as components['schemas']['AuditLog']['action'] | undefined,
  from: fromStr,
  to: toStr,
  limit,
  cursor,
  enabled: !authLoading && isAdmin,
})

// Append new data when it arrives
React.useEffect(() => {
  if (data?.data) {
    if (cursor) {
      // Appending: add new items
      setAllItems(prev => [...prev, ...data.data])
    } else {
      // Fresh load: replace items
      setAllItems(data.data)
    }
  }
}, [data, cursor])

// Reset when filters change
React.useEffect(() => {
  setAllItems([])
  setCursor(undefined)
}, [userId, entityType, entityId, action, fromStr, toStr])

const hasMore = (data?.data?.length ?? 0) === limit
const total = data?.meta?.total ?? allItems.length

const handleLoadMore = () => {
  const lastItem = allItems[allItems.length - 1]
  if (lastItem) {
    setCursor(lastItem.id)
  }
}
```

5. **Users for filter dropdown**:
```tsx
const { data: usersData, isLoading: usersLoading } = useUsers({ enabled: !authLoading && isAdmin })
const users = (usersData as { data?: Array<{ id: string; display_name: string }> })?.data ?? []
```

6. **Detail sheet state**:
```tsx
const [selectedEntry, setSelectedEntry] = React.useState<components['schemas']['AuditLog'] | null>(null)
```

7. **Render structure** (follows reports/evaluations pattern):
```tsx
return (
  <div className="space-y-6">
    {/* Page header */}
    <div>
      <h1 className="text-2xl font-bold tracking-tight">{t('page.title')}</h1>
      <p className="text-muted-foreground">{t('page.subtitle')}</p>
    </div>

    {/* Filters */}
    <AuditLogFilters
      dateRange={dateRange}
      onDateRangeChange={handleDateRangeChange}
      userId={userId}
      onUserChange={handleUserChange}
      entityType={entityType}
      onEntityTypeChange={handleEntityTypeChange}
      entityId={entityId}
      onEntityIdChange={handleEntityIdChange}
      action={action}
      onActionChange={handleActionChange}
      users={users}
      isLoadingUsers={usersLoading}
      onClearFilters={clearFilters}
      hasFilters={hasFilters}
    />

    {/* Result count */}
    <div className="text-sm text-muted-foreground">
      {total === 1
        ? t('count.item', { count: total })
        : t('count.items', { count: total })}
    </div>

    {/* Table */}
    <Card>
      <CardContent className="p-0">
        {isLoading && allItems.length === 0 ? (
          <AuditLogDataTable items={[]} isLoading={true} onRowClick={() => {}} />
        ) : allItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <h3 className="text-lg font-medium">{t('empty.title')}</h3>
            <p className="text-sm text-muted-foreground mt-1">{t('empty.description')}</p>
          </div>
        ) : (
          <AuditLogDataTable
            items={allItems}
            isLoading={false}
            onRowClick={setSelectedEntry}
          />
        )}
      </CardContent>
    </Card>

    {/* Load More */}
    {hasMore && allItems.length > 0 && (
      <div className="flex justify-center">
        <Button
          variant="outline"
          onClick={handleLoadMore}
          disabled={isFetching}
        >
          {isFetching ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t('pagination.loading')}</>
          ) : (
            t('pagination.loadMore')
          )}
        </Button>
      </div>
    )}

    {/* Detail Sheet */}
    <AuditLogDetailSheet
      entry={selectedEntry}
      open={!!selectedEntry}
      onOpenChange={(open) => { if (!open) setSelectedEntry(null) }}
    />
  </div>
)
```

### 4.2: File: `apps/web/src/components/layout/sidebar/sidebar-nav-config.ts` (MODIFY)

Add audit logs entry to the `administration` section. Place it after `reports` (logically related). The `ScrollText` icon is already imported but currently used by `tariffs`. Use `FileText` which is also already imported, or better yet, use a different icon. Looking at the imports, `ClipboardList` is used by monthlyEvaluations. We should import `FileSearch` from lucide-react for audit logs -- but wait, the ticket spec mentions `ScrollText`. Since `ScrollText` is already imported and used for tariffs, we need a different icon.

**Decision**: Import `FileClock` from lucide-react as it represents timestamped file activity, which matches audit logs well.

Add to imports:
```ts
import { ..., FileClock } from 'lucide-react'
```

Add to the `administration` section items array (after `reports`):
```ts
{
  titleKey: 'auditLogs',
  href: '/admin/audit-logs',
  icon: FileClock,
  roles: ['admin'],
},
```

### 4.3: File: `apps/web/src/components/layout/breadcrumbs.tsx` (MODIFY)

Add to the `segmentToKey` record (after `'vacation-balances': 'vacationBalances'`):
```ts
'audit-logs': 'auditLogs',
```

### Verification

```bash
cd /home/tolga/projects/terp/apps/web && npx tsc --noEmit --pretty 2>&1 | head -50
```

Then verify the build:
```bash
cd /home/tolga/projects/terp/apps/web && npx next build 2>&1 | tail -30
```

---

## Phase 5: Verification

### 5.1: Build Check

```bash
cd /home/tolga/projects/terp/apps/web && npx tsc --noEmit --pretty
```

Must pass with zero errors.

```bash
cd /home/tolga/projects/terp/apps/web && npx next build
```

Must build successfully.

### 5.2: Manual Verification Checklist

- [ ] Navigate to `/admin/audit-logs` as admin user.
- [ ] Page header shows "Audit Logs" title and subtitle.
- [ ] Sidebar shows "Audit Logs" entry in "Administration" section with icon.
- [ ] Breadcrumb shows: Home > Administration > Audit Logs.
- [ ] Date range defaults to last 24 hours.
- [ ] User filter dropdown populated with users.
- [ ] Entity type filter shows all known entity types with translated labels.
- [ ] Action filter shows all 11 action types with translated labels.
- [ ] Table displays columns: Timestamp, User, Action (badge), Entity Type, Entity Name, IP Address, Details.
- [ ] Action badges have correct colors (green=create/approve, blue=update, red=delete/reject, purple=close, orange=reopen, cyan=export, teal=import, default=login/logout).
- [ ] Clicking a row opens the detail sheet.
- [ ] Detail sheet shows Event Info, User Info, Request Info, Timestamps, Changes, and Metadata sections.
- [ ] Changes section shows before/after diff with red/green coloring for update actions.
- [ ] Changes section shows "No changes recorded" when null.
- [ ] IP Address shows "System" when null (system-generated entries).
- [ ] "Load More" button appears when more results are available.
- [ ] Clicking "Load More" appends new entries to the existing table.
- [ ] Changing any filter resets the list and cursor.
- [ ] Filter values persist in URL query params.
- [ ] Refreshing page preserves filter state from URL.
- [ ] Clear filters button resets all filters to defaults.
- [ ] Non-admin user is redirected to `/dashboard`.
- [ ] German translations display correctly when locale is `de`.

---

## File Summary

### New Files (8)
| # | File | Description |
|---|------|-------------|
| 1 | `apps/web/src/hooks/api/use-audit-logs.ts` | API hooks: `useAuditLogs`, `useAuditLog` |
| 2 | `apps/web/src/components/audit-logs/audit-log-json-diff.tsx` | Reusable before/after JSON diff |
| 3 | `apps/web/src/components/audit-logs/audit-log-filters.tsx` | Filter bar component |
| 4 | `apps/web/src/components/audit-logs/audit-log-detail-sheet.tsx` | Detail side sheet |
| 5 | `apps/web/src/components/audit-logs/audit-log-data-table.tsx` | Data table with inline skeleton |
| 6 | `apps/web/src/components/audit-logs/audit-log-skeleton.tsx` | Page-level skeleton |
| 7 | `apps/web/src/components/audit-logs/index.ts` | Barrel exports |
| 8 | `apps/web/src/app/[locale]/(dashboard)/admin/audit-logs/page.tsx` | Page component |

### Modified Files (5)
| # | File | Change |
|---|------|--------|
| 1 | `apps/web/src/hooks/api/index.ts` | Export `useAuditLogs`, `useAuditLog` |
| 2 | `apps/web/messages/en.json` | Add `nav.auditLogs`, `breadcrumbs.auditLogs`, `auditLogs` namespace |
| 3 | `apps/web/messages/de.json` | Add German translations for same keys |
| 4 | `apps/web/src/components/layout/sidebar/sidebar-nav-config.ts` | Add audit-logs nav item + `FileClock` import |
| 5 | `apps/web/src/components/layout/breadcrumbs.tsx` | Add `'audit-logs': 'auditLogs'` to `segmentToKey` |

---

## Design Decisions & Notes

1. **Single action filter (not multi-select)**: The OpenAPI spec and handler accept a single `action` query param. Using a single `Select` matches the API constraint. If multi-action filtering is needed later, the backend handler must be updated first to accept comma-separated values or multiple params.

2. **Cursor-based pagination with "Load More"**: The API uses cursor-based pagination (last item ID). Instead of adapting the page-based `Pagination` UI component, we use a simpler "Load More" button that appends results, which is the natural fit for cursor pagination and matches the ticket spec.

3. **No Turkish translations**: Only `en.json` and `de.json` exist in the project. No `tr.json` file exists.

4. **Icon choice**: The ticket mentions `ScrollText` but it is already used by tariffs. Using `FileClock` (timestamped file) as it semantically represents audit logging. If `FileClock` is not available in the project's lucide-react version, fall back to `FileSearch` or `ListOrdered`.

5. **Entity type list**: Hardcoded in filters as the API does not provide a separate endpoint for entity types. The list covers all known entity types from the backend model. New entity types will need to be added manually.

6. **Shared `actionBadgeConfig`**: Defined in both the data table and detail sheet. Could be extracted to a shared utility file if desired, but keeping it inline follows the existing pattern in `logs-tab.tsx` and `evaluation-detail-sheet.tsx` which both define their own copy.
