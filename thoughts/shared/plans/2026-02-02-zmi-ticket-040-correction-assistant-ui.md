# ZMI-TICKET-040: Correction Assistant UI - Implementation Plan

## Overview

Build the admin Correction Assistant page in the Next.js frontend, providing two tabs: a **Corrections** list view with filtering and detail sheet, and a **Message Catalog** management tab with inline editing. The backend (ZMI-TICKET-012) is already implemented; this ticket wires the frontend to the existing `/correction-assistant` and `/correction-messages` endpoints.

## Current State Analysis

### Backend (Complete)
- **Handler**: `apps/api/internal/handler/correction_assistant.go` - 4 endpoints (ListItems, ListMessages, GetMessage, UpdateMessage)
- **Service**: `apps/api/internal/service/correction_assistant.go` - Full business logic with 23 seeded default messages
- **Routes**: Registered in `apps/api/internal/handler/routes.go` (lines 904-928)
- **Model**: `apps/api/internal/model/correction_message.go` - GORM model + filters
- **Repository**: `apps/api/internal/repository/correction_message.go` - Full CRUD + listing
- **Migration**: `db/migrations/000045_create_correction_messages.up.sql`

### Frontend (Nothing Exists)
- No page, components, hooks, translations, or navigation entry exist
- **Critical gap**: The v3 OpenAPI spec (`api/openapi.bundled.v3.yaml`) does NOT include `/correction-assistant` or `/correction-messages` endpoints, so auto-generated TypeScript types are unavailable
- Workaround pattern exists: `apps/web/src/hooks/api/use-daily-values.ts` and `apps/web/src/hooks/api/use-monthly-values.ts` use manual `apiRequest()` with raw `fetch()` + `@tanstack/react-query`

### Key Discoveries
- Two-tab layout pattern: `apps/web/src/app/[locale]/(dashboard)/admin/approvals/page.tsx` (Tabs + TabsContent)
- Data table pattern: `apps/web/src/components/absence-types/absence-type-data-table.tsx`
- Detail sheet pattern: `apps/web/src/components/absence-types/absence-type-detail-sheet.tsx`
- Filters pattern: `apps/web/src/components/approvals/approval-filters.tsx` (grid layout with Select/DateRangePicker)
- API hooks manual fetch pattern: `apps/web/src/hooks/api/use-monthly-values.ts` (supports `apiRequest(url, options?)` with method/body for mutations)
- Navigation config: `apps/web/src/components/layout/sidebar/sidebar-nav-config.ts` - Management section
- Breadcrumbs: `apps/web/src/components/layout/breadcrumbs.tsx` - `segmentToKey` mapping
- Translations: `apps/web/messages/en.json` and `apps/web/messages/de.json` - namespace pattern `admin{Domain}`
- Pagination component: `apps/web/src/components/ui/pagination.tsx` (page-based, 1-indexed)
- Barrel export pattern: `apps/web/src/hooks/api/index.ts` and `apps/web/src/components/absence-types/index.ts`

## Desired End State

After implementation:
1. Admin users see "Correction Assistant" in the sidebar Management section (AlertTriangle icon)
2. Navigating to `/admin/correction-assistant` shows a two-tab page
3. **Corrections tab**: Filterable, paginated table of correction items (one row per error per employee-date) with date range, department, severity, error code, and employee filters; clicking a row opens a detail sheet showing all errors for that employee-date
4. **Message Catalog tab**: Table of correction messages with inline editing for custom_text, severity badge, active toggle switch; clicking a row opens an edit dialog
5. All text is translated (English + German)
6. Non-admin users are redirected to dashboard

### Verification
- Page loads at `/admin/correction-assistant` with default date range (previous month start to current month end)
- Filters narrow the correction items list
- Detail sheet shows employee info and all errors
- Message catalog inline edit saves via PATCH on blur/Enter
- Active toggle sends PATCH immediately
- Edit dialog allows editing custom_text, severity, is_active, and "Reset to Default"
- Pagination works with limit/offset
- Breadcrumbs show correctly
- Both English and German translations render

## What We're NOT Doing

- **Not modifying the backend** - All endpoints already exist and are tested
- **Not updating the v3 OpenAPI spec** - We use the manual fetch pattern (same as daily-values/monthly-values)
- **Not implementing correction creation/approval** - That is covered by the existing corrections UI
- **Not implementing recalculation triggers**
- **Not writing component tests in this ticket** - Tests are specified but implementation is deferred

## Implementation Approach

We follow the established codebase patterns exactly. The work is split into 5 phases:

1. **API Hooks** - Foundation layer using manual fetch pattern
2. **Components** - Data tables, filters, detail sheet, edit dialog, skeleton
3. **Page** - Two-tab layout wiring everything together
4. **Navigation & Breadcrumbs** - Sidebar entry + breadcrumb segment
5. **Translations** - English + German strings

Each phase builds on the previous and can be verified independently.

---

## Phase 1: API Hooks

### Overview
Create the API hook file for correction assistant and message catalog endpoints using the manual `apiRequest()` pattern (since endpoints are not in the v3 spec). Register exports in the barrel file.

### Changes Required:

#### 1. Create API Hooks File
**File**: `apps/web/src/hooks/api/use-correction-assistant.ts`

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { authStorage, tenantIdStorage } from '@/lib/api'
import { clientEnv } from '@/config/env'

// --- Manual fetch helper (same pattern as use-monthly-values.ts) ---

async function apiRequest(url: string, options?: RequestInit) {
  const token = authStorage.getToken()
  const tenantId = tenantIdStorage.getTenantId()

  const response = await fetch(`${clientEnv.apiUrl}${url}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(tenantId ? { 'X-Tenant-ID': tenantId } : {}),
      ...options?.headers,
    },
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Request failed' }))
    throw new Error(error.message || 'Request failed')
  }

  return response.json()
}

// --- TypeScript Interfaces (matching backend schema definitions) ---

export interface CorrectionAssistantError {
  code: string
  severity: 'error' | 'hint'
  message: string
  error_type: string
}

export interface CorrectionAssistantItem {
  daily_value_id: string
  employee_id: string
  employee_name: string
  department_id: string | null
  department_name: string | null
  value_date: string
  errors: CorrectionAssistantError[]
}

export interface CorrectionAssistantList {
  data: CorrectionAssistantItem[]
  meta: {
    total: number
    limit: number
    offset: number
    has_more: boolean
  }
}

export interface CorrectionMessage {
  id: string
  tenant_id: string
  code: string
  default_text: string
  custom_text: string | null
  effective_text: string
  severity: 'error' | 'hint'
  description: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface CorrectionMessageList {
  data: CorrectionMessage[]
  meta?: {
    total: number
    limit: number
    offset: number
    has_more: boolean
  }
}

export interface UpdateCorrectionMessageRequest {
  custom_text?: string | null
  severity?: 'error' | 'hint'
  is_active?: boolean
}

// --- Query Hooks ---

interface UseCorrectionAssistantItemsOptions {
  from?: string
  to?: string
  employee_id?: string
  department_id?: string
  severity?: 'error' | 'hint'
  error_code?: string
  limit?: number
  offset?: number
  enabled?: boolean
}

export function useCorrectionAssistantItems(options: UseCorrectionAssistantItemsOptions = {}) {
  const { enabled = true, ...params } = options

  const queryParams = new URLSearchParams()
  if (params.from) queryParams.set('from', params.from)
  if (params.to) queryParams.set('to', params.to)
  if (params.employee_id) queryParams.set('employee_id', params.employee_id)
  if (params.department_id) queryParams.set('department_id', params.department_id)
  if (params.severity) queryParams.set('severity', params.severity)
  if (params.error_code) queryParams.set('error_code', params.error_code)
  if (params.limit !== undefined) queryParams.set('limit', String(params.limit))
  if (params.offset !== undefined) queryParams.set('offset', String(params.offset))

  const qs = queryParams.toString()
  const url = `/correction-assistant${qs ? `?${qs}` : ''}`

  return useQuery<CorrectionAssistantList>({
    queryKey: ['correction-assistant', params],
    queryFn: () => apiRequest(url),
    enabled,
  })
}

interface UseCorrectionMessagesOptions {
  severity?: 'error' | 'hint'
  is_active?: boolean
  code?: string
  enabled?: boolean
}

export function useCorrectionMessages(options: UseCorrectionMessagesOptions = {}) {
  const { enabled = true, ...params } = options

  const queryParams = new URLSearchParams()
  if (params.severity) queryParams.set('severity', params.severity)
  if (params.is_active !== undefined) queryParams.set('is_active', String(params.is_active))
  if (params.code) queryParams.set('code', params.code)

  const qs = queryParams.toString()
  const url = `/correction-messages${qs ? `?${qs}` : ''}`

  return useQuery<CorrectionMessageList>({
    queryKey: ['correction-messages', params],
    queryFn: () => apiRequest(url),
    enabled,
  })
}

export function useCorrectionMessage(id: string, enabled = true) {
  return useQuery<CorrectionMessage>({
    queryKey: ['correction-messages', id],
    queryFn: () => apiRequest(`/correction-messages/${id}`),
    enabled: enabled && !!id,
  })
}

// --- Mutation Hooks ---

export function useUpdateCorrectionMessage() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, ...body }: UpdateCorrectionMessageRequest & { id: string }) =>
      apiRequest(`/correction-messages/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['correction-messages'] })
      queryClient.invalidateQueries({ queryKey: ['correction-assistant'] })
    },
  })
}
```

#### 2. Register Hooks in Barrel File
**File**: `apps/web/src/hooks/api/index.ts`

Add at the end of the file:

```typescript
// Correction Assistant
export {
  useCorrectionAssistantItems,
  useCorrectionMessages,
  useCorrectionMessage,
  useUpdateCorrectionMessage,
  type CorrectionAssistantItem,
  type CorrectionAssistantError,
  type CorrectionAssistantList,
  type CorrectionMessage,
  type CorrectionMessageList,
  type UpdateCorrectionMessageRequest,
} from './use-correction-assistant'
```

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compiles without errors: `cd apps/web && npx tsc --noEmit`
- [ ] File exists at correct path: `apps/web/src/hooks/api/use-correction-assistant.ts`
- [ ] Exports are registered in `apps/web/src/hooks/api/index.ts`

#### Manual Verification:
- [ ] Hooks can be imported in a test component and invoked against the running API

**Implementation Note**: After completing this phase and all automated verification passes, proceed to Phase 2.

---

## Phase 2: Components

### Overview
Create all component files for the correction assistant: data tables (corrections + messages), filters, detail sheet, edit dialog, skeleton, and barrel exports.

### Changes Required:

#### 1. Barrel Exports
**File**: `apps/web/src/components/correction-assistant/index.ts`

```typescript
export { CorrectionAssistantDataTable } from './correction-assistant-data-table'
export { CorrectionAssistantDetailSheet } from './correction-assistant-detail-sheet'
export { CorrectionAssistantFilters } from './correction-assistant-filters'
export { CorrectionMessageDataTable } from './correction-message-data-table'
export { CorrectionMessageEditDialog } from './correction-message-edit-dialog'
export { CorrectionAssistantSkeleton } from './correction-assistant-skeleton'
```

#### 2. Correction Assistant Data Table
**File**: `apps/web/src/components/correction-assistant/correction-assistant-data-table.tsx`

Pattern: Follow `absence-type-data-table.tsx` structure.

Props interface:
```typescript
interface CorrectionAssistantDataTableProps {
  items: FlattenedCorrectionRow[]
  isLoading: boolean
  onRowClick: (item: FlattenedCorrectionRow) => void
}
```

Key implementation details:
- **Flatten the data**: The API returns `CorrectionAssistantItem` with nested `errors[]`. The page component will flatten these into individual rows (`FlattenedCorrectionRow`), one per error. Each row has: `daily_value_id`, `employee_id`, `employee_name`, `department_name`, `value_date`, `code`, `severity`, `message`, `error_type`.
- Export a `FlattenedCorrectionRow` type from this file for reuse.
- Columns: Employee Name, Department, Date, Error Code (mono font), Severity (Badge), Message
- Severity badge mapping: `error` = `destructive` variant, `hint` = `secondary` variant
- Row click calls `onRowClick`
- Include a `CorrectionAssistantDataTableSkeleton` function (5 skeleton rows)

```typescript
export interface FlattenedCorrectionRow {
  daily_value_id: string
  employee_id: string
  employee_name: string
  department_id: string | null
  department_name: string | null
  value_date: string
  code: string
  severity: 'error' | 'hint'
  message: string
  error_type: string
}
```

Table columns (using translation keys from `correctionAssistant` namespace):
| Column | Header Key | Width | Content |
|--------|-----------|-------|---------|
| Employee | `table.employee` | auto | `employee_name` |
| Department | `table.department` | auto | `department_name` or '-' |
| Date | `table.date` | w-28 | `value_date` formatted as `dd.MM.yyyy` |
| Error Code | `table.errorCode` | w-40 | `code` in mono font |
| Severity | `table.severity` | w-24 | Badge (destructive/secondary) |
| Message | `table.message` | auto | `message` |

#### 3. Correction Assistant Filters
**File**: `apps/web/src/components/correction-assistant/correction-assistant-filters.tsx`

Pattern: Follow `approval-filters.tsx` grid layout.

Props:
```typescript
interface CorrectionAssistantFiltersProps {
  dateRange: DateRange | undefined
  onDateRangeChange: (range: DateRange | undefined) => void
  departments: Array<{ id: string; name: string }>
  selectedDepartmentId: string | null
  onDepartmentChange: (id: string | null) => void
  severity: string
  onSeverityChange: (severity: string) => void
  errorCode: string
  onErrorCodeChange: (code: string) => void
  employeeSearch: string
  onEmployeeSearchChange: (search: string) => void
  isLoadingDepartments?: boolean
  onClearFilters: () => void
  hasFilters: boolean
}
```

Layout: `grid gap-4 md:grid-cols-3 lg:grid-cols-4 md:items-end` with:
- DateRangePicker (from/to)
- Department Select (with "All Departments" option, uses `useDepartments` data passed as prop)
- Severity Select: All / Error / Hint
- Error Code SearchInput (text input, debounced)
- Employee SearchInput (text input, debounced) -- placed on next row
- Clear Filters Button (ghost variant, X icon) -- shown only when `hasFilters` is true

Use `useTranslations('correctionAssistant')` with keys from `filters.*` group.

#### 4. Correction Assistant Detail Sheet
**File**: `apps/web/src/components/correction-assistant/correction-assistant-detail-sheet.tsx`

Pattern: Follow `absence-type-detail-sheet.tsx` structure.

Props:
```typescript
interface CorrectionAssistantDetailSheetProps {
  item: CorrectionAssistantItem | null
  open: boolean
  onOpenChange: (open: boolean) => void
}
```

Content:
- SheetHeader: employee_name + formatted value_date
- SheetDescription: department_name or empty
- Content: List of all errors for this employee-date (from `item.errors`)
  - Each error rendered as a card/section with: code (mono), severity badge, message, error_type badge
- SheetFooter:
  - "Close" button (variant outline)
  - "Go to Employee" button (navigates to `/admin/employees/{employee_id}` using `useRouter`)

Use `useTranslations('correctionAssistant')` with `detail.*` keys.

#### 5. Correction Message Data Table
**File**: `apps/web/src/components/correction-assistant/correction-message-data-table.tsx`

This is the most complex component -- it implements **inline editing**.

Props:
```typescript
interface CorrectionMessageDataTableProps {
  messages: CorrectionMessage[]
  isLoading: boolean
  onUpdateMessage: (id: string, data: UpdateCorrectionMessageRequest) => Promise<void>
  onEditMessage: (message: CorrectionMessage) => void
  isUpdating: boolean
}
```

Columns:
| Column | Header Key | Width | Content |
|--------|-----------|-------|---------|
| Code | `messages.columnCode` | w-40 | `code` in mono font |
| Default Text | `messages.columnDefaultText` | auto | `default_text` |
| Custom Text | `messages.columnCustomText` | auto | **Editable cell** (see below) |
| Effective Text | `messages.columnEffectiveText` | auto | `effective_text` (computed, read-only) |
| Severity | `messages.columnSeverity` | w-24 | Badge (destructive for error, secondary for hint) |
| Active | `messages.columnActive` | w-20 | Switch toggle |
| Actions | - | w-16 | DropdownMenu with "Edit" option |

**Inline editing for Custom Text cell**:
- Normal state: Show `custom_text` value or a faded placeholder ("Click to customize...")
- Click state: Render an `<Input>` in the cell
- Manage via local state: `editingId: string | null` + `editValue: string`
- On cell click: set `editingId` to message ID, populate `editValue` with current `custom_text ?? ''`
- On blur or Enter key: call `onUpdateMessage(id, { custom_text: editValue || null })` then clear `editingId`
- On Escape: clear `editingId` without saving

**Active toggle Switch**:
- Render `<Switch>` component (size "sm")
- On change: immediately call `onUpdateMessage(id, { is_active: !current_is_active })`

**Row actions (DropdownMenu)**:
- "Edit" option opens the edit dialog (calls `onEditMessage`)

Include a `CorrectionMessageDataTableSkeleton` function.

#### 6. Correction Message Edit Dialog
**File**: `apps/web/src/components/correction-assistant/correction-message-edit-dialog.tsx`

Pattern: Adapted from `absence-type-form-sheet.tsx` but using a Dialog (not Sheet).

Props:
```typescript
interface CorrectionMessageEditDialogProps {
  message: CorrectionMessage | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onUpdate: (id: string, data: UpdateCorrectionMessageRequest) => Promise<void>
  isUpdating: boolean
}
```

Content:
- DialogHeader: "Edit Message" + message code
- Form fields:
  - **Custom Text**: Textarea with label, pre-filled from `message.custom_text`
  - **Severity**: Select (error / hint)
  - **Active**: Switch toggle
- DialogFooter:
  - "Reset to Default" button (variant ghost) -- sends `{ custom_text: null }` via `onUpdate`
  - "Cancel" button (variant outline)
  - "Save Changes" button (variant default, with loading state)

State management:
- `customText: string` (from message.custom_text ?? '')
- `severity: 'error' | 'hint'` (from message.severity)
- `isActive: boolean` (from message.is_active)
- `useEffect` to reset form when `message` changes or dialog opens

Use `useTranslations('correctionAssistant')` with `messages.*` keys.

#### 7. Correction Assistant Skeleton
**File**: `apps/web/src/components/correction-assistant/correction-assistant-skeleton.tsx`

Pattern: Follow `ApprovalsPageSkeleton` from approvals page.

```typescript
export function CorrectionAssistantSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
      <Skeleton className="h-9 w-72" /> {/* Tab bar */}
      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4">
        <Skeleton className="h-9" />
        <Skeleton className="h-9" />
        <Skeleton className="h-9" />
      </div>
      <Skeleton className="h-96" /> {/* Table area */}
    </div>
  )
}
```

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compiles without errors: `cd apps/web && npx tsc --noEmit`
- [ ] All 7 component files created in `apps/web/src/components/correction-assistant/`
- [ ] Barrel file exports all components

#### Manual Verification:
- [ ] Components can be imported and render without errors in isolation

**Implementation Note**: After completing this phase and all automated verification passes, proceed to Phase 3.

---

## Phase 3: Page

### Overview
Create the main correction assistant page with two-tab layout, wiring all components together with state management, data fetching, and pagination.

### Changes Required:

#### 1. Page Component
**File**: `apps/web/src/app/[locale]/(dashboard)/admin/correction-assistant/page.tsx`

Pattern: Combine the two-tab pattern from `approvals/page.tsx` with the filters/table/sheet pattern from `absence-types/page.tsx`.

```typescript
'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useAuth } from '@/providers/auth-provider'
import { useHasRole } from '@/hooks'
import {
  useCorrectionAssistantItems,
  useCorrectionMessages,
  useUpdateCorrectionMessage,
  useDepartments,
} from '@/hooks/api'
import type {
  CorrectionAssistantItem,
  CorrectionMessage,
  UpdateCorrectionMessageRequest,
} from '@/hooks/api/use-correction-assistant'
import type { FlattenedCorrectionRow } from '@/components/correction-assistant/correction-assistant-data-table'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Pagination } from '@/components/ui/pagination'
import {
  CorrectionAssistantDataTable,
  CorrectionAssistantDetailSheet,
  CorrectionAssistantFilters,
  CorrectionMessageDataTable,
  CorrectionMessageEditDialog,
  CorrectionAssistantSkeleton,
} from '@/components/correction-assistant'
import { formatDate } from '@/lib/time-utils'
import type { DateRange } from '@/components/ui/date-range-picker'
```

Key state variables:
```typescript
// Tab state
const [activeTab, setActiveTab] = React.useState<'corrections' | 'messages'>('corrections')

// Correction list filters
const [dateRange, setDateRange] = React.useState<DateRange | undefined>(() => {
  // Default: first of previous month to last of current month
  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  return { from, to }
})
const [departmentId, setDepartmentId] = React.useState<string | null>(null)
const [severity, setSeverity] = React.useState<string>('all')
const [errorCode, setErrorCode] = React.useState('')
const [employeeSearch, setEmployeeSearch] = React.useState('')

// Correction list pagination
const [page, setPage] = React.useState(1)
const [limit, setLimit] = React.useState(50)

// Detail sheet
const [selectedItem, setSelectedItem] = React.useState<CorrectionAssistantItem | null>(null)

// Message catalog filters (client-side)
const [messageSeverityFilter, setMessageSeverityFilter] = React.useState<string>('all')

// Message edit dialog
const [editMessage, setEditMessage] = React.useState<CorrectionMessage | null>(null)
```

Data fetching:
```typescript
const enabled = !authLoading && isAdmin

// Departments for filter dropdown
const { data: departmentsData, isLoading: departmentsLoading } = useDepartments({ enabled })
const departments = (departmentsData?.data ?? []).map(d => ({ id: d.id, name: d.name }))

// Correction items (server-side filtered + paginated)
const offset = (page - 1) * limit
const from = dateRange?.from ? formatDate(dateRange.from) : undefined
const to = dateRange?.to ? formatDate(dateRange.to) : undefined

const { data: correctionData, isLoading: correctionsLoading } = useCorrectionAssistantItems({
  from,
  to,
  department_id: departmentId ?? undefined,
  severity: severity !== 'all' ? severity as 'error' | 'hint' : undefined,
  error_code: errorCode || undefined,
  limit,
  offset,
  enabled,
})

// Message catalog (full list, filter client-side)
const { data: messagesData, isLoading: messagesLoading } = useCorrectionMessages({ enabled })
const updateMessage = useUpdateCorrectionMessage()
```

Data transformation:
```typescript
// Flatten correction items: one row per error per employee-date
const flattenedRows: FlattenedCorrectionRow[] = React.useMemo(() => {
  const items = correctionData?.data ?? []
  const rows: FlattenedCorrectionRow[] = []
  for (const item of items) {
    for (const err of item.errors) {
      rows.push({
        daily_value_id: item.daily_value_id,
        employee_id: item.employee_id,
        employee_name: item.employee_name,
        department_id: item.department_id,
        department_name: item.department_name,
        value_date: item.value_date,
        code: err.code,
        severity: err.severity,
        message: err.message,
        error_type: err.error_type,
      })
    }
  }
  // Client-side employee name filter
  if (employeeSearch) {
    const searchLower = employeeSearch.toLowerCase()
    return rows.filter(r => r.employee_name.toLowerCase().includes(searchLower))
  }
  return rows
}, [correctionData, employeeSearch])

// Pagination calculations
const total = correctionData?.meta?.total ?? 0
const totalPages = Math.ceil(total / limit)

// Client-side message filtering
const filteredMessages = React.useMemo(() => {
  const msgs = messagesData?.data ?? []
  if (messageSeverityFilter === 'all') return msgs
  return msgs.filter(m => m.severity === messageSeverityFilter)
}, [messagesData, messageSeverityFilter])
```

Handler for message update:
```typescript
const handleUpdateMessage = async (id: string, data: UpdateCorrectionMessageRequest) => {
  await updateMessage.mutateAsync({ id, ...data })
}
```

Detail sheet: When a flattened row is clicked, find the original `CorrectionAssistantItem` from `correctionData.data` matching `daily_value_id` and set it as `selectedItem`.

Clear filters handler:
```typescript
const clearFilters = () => {
  const now = new Date()
  setDateRange({
    from: new Date(now.getFullYear(), now.getMonth() - 1, 1),
    to: new Date(now.getFullYear(), now.getMonth() + 1, 0),
  })
  setDepartmentId(null)
  setSeverity('all')
  setErrorCode('')
  setEmployeeSearch('')
  setPage(1)
}
```

Pagination: Reset page to 1 when any filter changes (useEffect on filter deps).

JSX structure:
```
<div className="space-y-6">
  {/* Page header */}
  <div>
    <h1>{t('page.title')}</h1>
    <p>{t('page.description')}</p>
  </div>

  <Tabs value={activeTab} onValueChange={...}>
    <TabsList>
      <TabsTrigger value="corrections">{t('page.tabCorrections')}</TabsTrigger>
      <TabsTrigger value="messages">{t('page.tabMessages')} {badge?}</TabsTrigger>
    </TabsList>

    <TabsContent value="corrections" className="space-y-4">
      <CorrectionAssistantFilters ... />
      <div className="text-sm text-muted-foreground">{count display}</div>
      <Card><CardContent className="p-0">
        {loading ? skeleton : empty ? emptyState : <CorrectionAssistantDataTable />}
      </CardContent></Card>
      {total > 0 && <Pagination ... />}
    </TabsContent>

    <TabsContent value="messages" className="space-y-4">
      {/* Simple severity filter for messages tab */}
      <div className="flex items-center gap-4">
        <Select ... severity filter ... />
      </div>
      <Card><CardContent className="p-0">
        {loading ? skeleton : <CorrectionMessageDataTable />}
      </CardContent></Card>
    </TabsContent>
  </Tabs>

  <CorrectionAssistantDetailSheet ... />
  <CorrectionMessageEditDialog ... />
</div>
```

Auth guard (same as approvals):
```typescript
React.useEffect(() => {
  if (!authLoading && !isAdmin) {
    router.push('/dashboard')
  }
}, [authLoading, isAdmin, router])

if (authLoading) return <CorrectionAssistantSkeleton />
if (!isAdmin) return null
```

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compiles without errors: `cd apps/web && npx tsc --noEmit`
- [ ] Page file exists at `apps/web/src/app/[locale]/(dashboard)/admin/correction-assistant/page.tsx`

#### Manual Verification:
- [ ] Page loads at `/admin/correction-assistant` (after nav is wired in Phase 4)
- [ ] Both tabs render and switch correctly
- [ ] Correction list shows data with default date range
- [ ] Filters narrow results
- [ ] Pagination navigates between pages
- [ ] Detail sheet opens on row click
- [ ] Message catalog shows all messages
- [ ] Inline edit works (click, type, blur/Enter saves)
- [ ] Active toggle saves immediately
- [ ] Edit dialog opens from row action menu

**Implementation Note**: After completing this phase and all automated verification passes, proceed to Phase 4.

---

## Phase 4: Navigation & Breadcrumbs

### Overview
Add the correction assistant entry to the sidebar navigation and breadcrumb mapping.

### Changes Required:

#### 1. Sidebar Navigation
**File**: `apps/web/src/components/layout/sidebar/sidebar-nav-config.ts`

Add import for `AlertTriangle` icon:
```typescript
import {
  // ... existing imports ...
  AlertTriangle,
} from 'lucide-react'
```

Add entry to the "Management" section `items` array, after the `accounts` entry (last in the management section):
```typescript
{
  titleKey: 'correctionAssistant',
  href: '/admin/correction-assistant',
  icon: AlertTriangle,
  roles: ['admin'],
},
```

#### 2. Breadcrumb Mapping
**File**: `apps/web/src/components/layout/breadcrumbs.tsx`

Add to the `segmentToKey` object:
```typescript
'correction-assistant': 'correctionAssistant',
```

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compiles without errors: `cd apps/web && npx tsc --noEmit`
- [ ] `AlertTriangle` is imported in sidebar-nav-config.ts
- [ ] `'correction-assistant'` key exists in segmentToKey

#### Manual Verification:
- [ ] "Correction Assistant" appears in the sidebar Management section with AlertTriangle icon
- [ ] Clicking it navigates to `/admin/correction-assistant`
- [ ] Breadcrumbs show "Home > Administration > Correction Assistant" correctly
- [ ] Non-admin users do not see the sidebar entry

**Implementation Note**: After completing this phase and all automated verification passes, proceed to Phase 5.

---

## Phase 5: Translations

### Overview
Add translation keys for both English and German in the respective message files, plus nav and breadcrumb entries.

### Changes Required:

#### 1. English Translations
**File**: `apps/web/messages/en.json`

Add to `nav` namespace:
```json
"correctionAssistant": "Correction Assistant"
```

Add to `breadcrumbs` namespace:
```json
"correctionAssistant": "Correction Assistant"
```

Add new top-level namespace `correctionAssistant`:
```json
"correctionAssistant": {
  "page": {
    "title": "Correction Assistant",
    "description": "View calculation errors and hints, manage error message catalog",
    "tabCorrections": "Corrections",
    "tabMessages": "Message Catalog"
  },
  "table": {
    "employee": "Employee",
    "department": "Department",
    "date": "Date",
    "errorCode": "Error Code",
    "severity": "Severity",
    "message": "Message"
  },
  "filters": {
    "dateRange": "Date Range",
    "department": "Department",
    "allDepartments": "All Departments",
    "severity": "Severity",
    "allSeverities": "All",
    "error": "Error",
    "hint": "Hint",
    "errorCode": "Error Code",
    "errorCodePlaceholder": "Filter by error code...",
    "employeeSearch": "Employee",
    "employeeSearchPlaceholder": "Search by employee name...",
    "clearFilters": "Clear filters"
  },
  "detail": {
    "title": "Correction Details",
    "description": "All errors and hints for this employee on this date",
    "employee": "Employee",
    "department": "Department",
    "date": "Date",
    "errorsTitle": "Errors & Hints",
    "errorType": "Type",
    "close": "Close",
    "goToEmployee": "Go to Employee"
  },
  "messages": {
    "columnCode": "Code",
    "columnDefaultText": "Default Text",
    "columnCustomText": "Custom Text",
    "columnEffectiveText": "Effective Text",
    "columnSeverity": "Severity",
    "columnActive": "Active",
    "clickToCustomize": "Click to customize...",
    "editMessage": "Edit Message",
    "editMessageDescription": "Customize the error message text, severity, and active status",
    "customText": "Custom Text",
    "customTextPlaceholder": "Enter custom message text...",
    "customTextHint": "Leave empty to use the default text",
    "severityLabel": "Severity",
    "activeLabel": "Active",
    "activeDescription": "Inactive messages will not appear in correction results",
    "resetToDefault": "Reset to Default",
    "cancel": "Cancel",
    "saveChanges": "Save Changes",
    "saving": "Saving...",
    "edit": "Edit",
    "actions": "Actions"
  },
  "empty": {
    "title": "No errors or hints found",
    "description": "No errors or hints found for the selected period",
    "messagesTitle": "No messages found",
    "messagesDescription": "No correction messages match the current filter"
  },
  "count": {
    "items": "{count} items",
    "item": "{count} item"
  },
  "severity": {
    "error": "Error",
    "hint": "Hint"
  },
  "toast": {
    "updateSuccess": "Message updated",
    "updateFailed": "Failed to update message",
    "resetSuccess": "Message reset to default"
  }
}
```

#### 2. German Translations
**File**: `apps/web/messages/de.json`

Add to `nav` namespace:
```json
"correctionAssistant": "Korrekturassistent"
```

Add to `breadcrumbs` namespace:
```json
"correctionAssistant": "Korrekturassistent"
```

Add new top-level namespace `correctionAssistant`:
```json
"correctionAssistant": {
  "page": {
    "title": "Korrekturassistent",
    "description": "Berechnungsfehler und Hinweise anzeigen, Fehlermeldungskatalog verwalten",
    "tabCorrections": "Korrekturen",
    "tabMessages": "Meldungskatalog"
  },
  "table": {
    "employee": "Mitarbeiter",
    "department": "Abteilung",
    "date": "Datum",
    "errorCode": "Fehlercode",
    "severity": "Schweregrad",
    "message": "Meldung"
  },
  "filters": {
    "dateRange": "Zeitraum",
    "department": "Abteilung",
    "allDepartments": "Alle Abteilungen",
    "severity": "Schweregrad",
    "allSeverities": "Alle",
    "error": "Fehler",
    "hint": "Hinweis",
    "errorCode": "Fehlercode",
    "errorCodePlaceholder": "Nach Fehlercode filtern...",
    "employeeSearch": "Mitarbeiter",
    "employeeSearchPlaceholder": "Nach Mitarbeitername suchen...",
    "clearFilters": "Filter zurücksetzen"
  },
  "detail": {
    "title": "Korrekturdetails",
    "description": "Alle Fehler und Hinweise für diesen Mitarbeiter an diesem Datum",
    "employee": "Mitarbeiter",
    "department": "Abteilung",
    "date": "Datum",
    "errorsTitle": "Fehler & Hinweise",
    "errorType": "Typ",
    "close": "Schließen",
    "goToEmployee": "Zum Mitarbeiter"
  },
  "messages": {
    "columnCode": "Code",
    "columnDefaultText": "Standardtext",
    "columnCustomText": "Benutzerdefinierter Text",
    "columnEffectiveText": "Effektiver Text",
    "columnSeverity": "Schweregrad",
    "columnActive": "Aktiv",
    "clickToCustomize": "Klicken zum Anpassen...",
    "editMessage": "Meldung bearbeiten",
    "editMessageDescription": "Meldungstext, Schweregrad und Aktivstatus anpassen",
    "customText": "Benutzerdefinierter Text",
    "customTextPlaceholder": "Benutzerdefinierten Meldungstext eingeben...",
    "customTextHint": "Leer lassen, um den Standardtext zu verwenden",
    "severityLabel": "Schweregrad",
    "activeLabel": "Aktiv",
    "activeDescription": "Inaktive Meldungen erscheinen nicht in Korrekturergebnissen",
    "resetToDefault": "Auf Standard zurücksetzen",
    "cancel": "Abbrechen",
    "saveChanges": "Änderungen speichern",
    "saving": "Speichern...",
    "edit": "Bearbeiten",
    "actions": "Aktionen"
  },
  "empty": {
    "title": "Keine Fehler oder Hinweise gefunden",
    "description": "Keine Fehler oder Hinweise für den gewählten Zeitraum gefunden",
    "messagesTitle": "Keine Meldungen gefunden",
    "messagesDescription": "Keine Korrekturmeldungen entsprechen dem aktuellen Filter"
  },
  "count": {
    "items": "{count} Einträge",
    "item": "{count} Eintrag"
  },
  "severity": {
    "error": "Fehler",
    "hint": "Hinweis"
  },
  "toast": {
    "updateSuccess": "Meldung aktualisiert",
    "updateFailed": "Meldung konnte nicht aktualisiert werden",
    "resetSuccess": "Meldung auf Standard zurückgesetzt"
  }
}
```

### Success Criteria:

#### Automated Verification:
- [ ] JSON is valid in both files: `cd apps/web && node -e "JSON.parse(require('fs').readFileSync('messages/en.json','utf8'))" && node -e "JSON.parse(require('fs').readFileSync('messages/de.json','utf8'))"`
- [ ] Both `nav.correctionAssistant` keys exist
- [ ] Both `breadcrumbs.correctionAssistant` keys exist
- [ ] Both `correctionAssistant` namespaces exist with matching key structure

#### Manual Verification:
- [ ] Page renders with English text when locale is 'en'
- [ ] Page renders with German text when locale is 'de'
- [ ] All filter labels, table headers, button text, and empty states display correctly
- [ ] Sidebar nav item shows translated text in both languages
- [ ] Breadcrumbs show translated text in both languages

**Implementation Note**: After completing this phase and all verification passes, the feature is complete.

---

## File Summary

All files to be created or modified:

### New Files (8)
| # | File | Description |
|---|------|-------------|
| 1 | `apps/web/src/hooks/api/use-correction-assistant.ts` | API hooks with manual fetch |
| 2 | `apps/web/src/components/correction-assistant/index.ts` | Barrel exports |
| 3 | `apps/web/src/components/correction-assistant/correction-assistant-data-table.tsx` | Corrections data table |
| 4 | `apps/web/src/components/correction-assistant/correction-assistant-filters.tsx` | Filter controls |
| 5 | `apps/web/src/components/correction-assistant/correction-assistant-detail-sheet.tsx` | Detail side sheet |
| 6 | `apps/web/src/components/correction-assistant/correction-message-data-table.tsx` | Message catalog table with inline edit |
| 7 | `apps/web/src/components/correction-assistant/correction-message-edit-dialog.tsx` | Message edit dialog |
| 8 | `apps/web/src/components/correction-assistant/correction-assistant-skeleton.tsx` | Loading skeleton |
| 9 | `apps/web/src/app/[locale]/(dashboard)/admin/correction-assistant/page.tsx` | Main page component |

### Modified Files (5)
| # | File | Change |
|---|------|--------|
| 1 | `apps/web/src/hooks/api/index.ts` | Add correction assistant hook exports |
| 2 | `apps/web/src/components/layout/sidebar/sidebar-nav-config.ts` | Add nav entry + AlertTriangle import |
| 3 | `apps/web/src/components/layout/breadcrumbs.tsx` | Add segmentToKey mapping |
| 4 | `apps/web/messages/en.json` | Add nav, breadcrumb, and correctionAssistant translations |
| 5 | `apps/web/messages/de.json` | Add nav, breadcrumb, and correctionAssistant translations |

## Testing Strategy

### Component Tests (deferred, specified in ticket):
- Data table renders rows with correct severity badges
- Filters update parameters and trigger refetch
- Inline edit saves on blur and shows optimistic update
- Active toggle sends PATCH
- Reset to default sends null custom_text
- Detail sheet displays all errors for an employee-date

### Manual Testing Steps:
1. Log in as admin, navigate to `/admin/correction-assistant`
2. Verify default date range shows correction items
3. Change date range filter -- list updates
4. Select department filter -- list narrows
5. Select severity=error -- only errors shown
6. Type error code -- list filters
7. Type employee name -- list filters
8. Click "Clear filters" -- all reset to defaults
9. Click a correction row -- detail sheet opens with employee info and all errors
10. Click "Go to Employee" in detail sheet -- navigates to employee page
11. Switch to "Message Catalog" tab
12. Click a custom text cell -- inline editor appears
13. Type new text, press Enter -- PATCH sent, cell updates
14. Click active switch -- PATCH sent, toggle updates
15. Click row "Edit" menu item -- edit dialog opens
16. Change severity and text, save -- PATCH sent
17. Click "Reset to Default" in edit dialog -- custom_text cleared
18. Use pagination controls -- navigate between pages
19. Switch locale to German -- all text renders in German
20. Log in as non-admin -- redirected to dashboard

## Performance Considerations

- Message catalog is typically <100 entries, so client-side filtering is fine
- Correction items use server-side pagination (limit/offset) to handle large datasets
- Inline editing uses optimistic UI pattern for responsiveness
- Query invalidation scoped to `['correction-messages']` and `['correction-assistant']` keys only

## References

- Ticket: `thoughts/shared/tickets/ZMI-TICKET-040-correction-assistant-ui.md`
- Research: `thoughts/shared/research/2026-02-02-zmi-ticket-040-correction-assistant-ui.md`
- Backend plan: `thoughts/shared/plans/2026-01-29-ZMI-TICKET-012-correction-assistant-and-errors.md`
- Pattern reference (tabs): `apps/web/src/app/[locale]/(dashboard)/admin/approvals/page.tsx`
- Pattern reference (data table): `apps/web/src/components/absence-types/absence-type-data-table.tsx`
- Pattern reference (detail sheet): `apps/web/src/components/absence-types/absence-type-detail-sheet.tsx`
- Pattern reference (filters): `apps/web/src/components/approvals/approval-filters.tsx`
- Pattern reference (manual fetch hooks): `apps/web/src/hooks/api/use-monthly-values.ts`
