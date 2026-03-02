# Employee Messages UI Implementation Plan

## Overview

Build the frontend UI for the employee messages feature at `/admin/employee-messages`. This provides an admin interface for composing messages, selecting recipients (individual employees, by department, or all employees), viewing message history, and tracking per-recipient delivery status. The backend API is fully implemented (ZMI-TICKET-026).

## Current State Analysis

**Backend (complete):**
- OpenAPI spec defined at `api/paths/employee-messages.yaml` and `api/schemas/employee-messages.yaml`
- Five endpoints: list messages, create message, get message by ID, send message, list messages for employee
- Handler at `apps/api/internal/handler/employee_message.go` with route registration at `apps/api/internal/handler/routes.go:1233-1258`
- Permission: `notifications.manage` for all employee-message routes
- TypeScript types generated at `apps/web/src/lib/api/types.ts` (schemas: `EmployeeMessage`, `EmployeeMessageRecipient`, `EmployeeMessageList`, `CreateEmployeeMessageRequest`, `SendEmployeeMessageResponse`)

**Frontend (not started):**
- No hooks, components, page, or translations exist for employee-messages
- No sidebar nav entry, no breadcrumb entry

### Key Discoveries:
- The API uses `offset`-based pagination (`limit` + `offset`), NOT cursor-based. The ticket mentions `cursor` but this is incorrect per the actual OpenAPI spec at `api/paths/employee-messages.yaml:26-28`.
- The `CreateEmployeeMessageRequest` body field is `employee_ids` (array of UUIDs), NOT `recipient_employee_ids` as mentioned in the ticket. Verified at `api/schemas/employee-messages.yaml:99-113` and `apps/web/src/lib/api/types.ts` line for `CreateEmployeeMessageRequest`.
- No markdown/rich text editor exists in the codebase. All existing forms use plain `Textarea`. We will use a plain `Textarea` for the message body.
- No reusable multi-select component exists. Employee/department selection uses `Select` + search patterns. We will build inline selection within the compose sheet.
- The `notifications.manage` permission is used on the backend (`apps/api/internal/handler/routes.go:1233-1258`). The frontend should use `useHasPermission(['notifications.manage'])`.
- Translation namespace convention for admin pages is `admin[FeatureName]` (e.g., `adminDepartments`). We will use `adminEmployeeMessages`.

## Desired End State

A fully functional `/admin/employee-messages` page where:
1. Admins see a list of all sent/pending/failed messages with status summary columns
2. A toolbar allows filtering by status and searching by subject, plus a "Compose Message" button
3. Clicking a row opens a detail sheet showing message content and per-recipient delivery status
4. The compose sheet supports three recipient modes (individual, department, all) with recipient count preview
5. A send confirmation dialog shows before sending, with result display after
6. Navigation sidebar includes an "Employee Messages" entry under the management section
7. Full EN/DE translations are provided

**Verification:** Navigate to `/admin/employee-messages`, compose a message to individual employees, send it, and verify delivery status in the detail view.

## What We're NOT Doing

- Real-time messaging/chat
- Push notifications
- Message templates
- File attachments
- Rich text / markdown editor (plain textarea only)
- Cursor-based pagination (using offset as the API provides)
- Re-send to failed recipients only (the API `POST /employee-messages/{id}/send` sends to ALL pending recipients; re-sending to just failed ones would require backend changes)

## Implementation Approach

Follow the established admin page pattern (departments as reference). Build incrementally: hooks first, then components, then page integration, then translations and navigation. Each phase is independently testable.

---

## Phase 1: API Hooks

### Overview
Create the `use-employee-messages.ts` hooks file and register exports in the barrel file.

### Changes Required:

#### 1. Create API hooks file
**File**: `apps/web/src/hooks/api/use-employee-messages.ts` (new)
**Changes**: Create all five hooks following the pattern from `apps/web/src/hooks/api/use-departments.ts`

```ts
import { useApiQuery, useApiMutation } from '@/hooks'

// ==================== Query Hooks ====================

interface UseEmployeeMessagesOptions {
  status?: 'pending' | 'sent' | 'failed'
  limit?: number
  offset?: number
  enabled?: boolean
}

/**
 * Hook to fetch paginated list of employee messages.
 *
 * @example
 * ```tsx
 * const { data, isLoading } = useEmployeeMessages({ status: 'sent' })
 * const messages = data?.data ?? []
 * ```
 */
export function useEmployeeMessages(options: UseEmployeeMessagesOptions = {}) {
  const { status, limit = 20, offset = 0, enabled = true } = options

  return useApiQuery('/employee-messages', {
    params: {
      status,
      limit,
      offset,
    },
    enabled,
  })
}

/**
 * Hook to fetch a single employee message by ID.
 *
 * @example
 * ```tsx
 * const { data: message, isLoading } = useEmployeeMessage(messageId)
 * ```
 */
export function useEmployeeMessage(id: string, enabled = true) {
  return useApiQuery('/employee-messages/{id}', {
    path: { id },
    enabled: enabled && !!id,
  })
}

/**
 * Hook to fetch messages for a specific employee.
 *
 * @example
 * ```tsx
 * const { data, isLoading } = useEmployeeMessagesForEmployee(employeeId)
 * ```
 */
export function useEmployeeMessagesForEmployee(
  employeeId: string,
  options: { limit?: number; offset?: number; enabled?: boolean } = {}
) {
  const { limit = 20, offset = 0, enabled = true } = options

  return useApiQuery('/employees/{id}/messages', {
    path: { id: employeeId },
    params: { limit, offset },
    enabled: enabled && !!employeeId,
  })
}

// ==================== Mutation Hooks ====================

/**
 * Hook to create a new employee message.
 *
 * @example
 * ```tsx
 * const createMessage = useCreateEmployeeMessage()
 * createMessage.mutate({
 *   body: { subject: 'Hello', body: 'Content', employee_ids: ['uuid1'] }
 * })
 * ```
 */
export function useCreateEmployeeMessage() {
  return useApiMutation('/employee-messages', 'post', {
    invalidateKeys: [['/employee-messages']],
  })
}

/**
 * Hook to send an employee message to all pending recipients.
 *
 * @example
 * ```tsx
 * const sendMessage = useSendEmployeeMessage()
 * sendMessage.mutate({ path: { id: messageId } })
 * ```
 */
export function useSendEmployeeMessage() {
  return useApiMutation('/employee-messages/{id}/send', 'post', {
    invalidateKeys: [['/employee-messages']],
  })
}
```

#### 2. Register hooks in barrel export
**File**: `apps/web/src/hooks/api/index.ts`
**Changes**: Add export block for Employee Messages at the end, before the last export group

```ts
// Employee Messages
export {
  useEmployeeMessages,
  useEmployeeMessage,
  useEmployeeMessagesForEmployee,
  useCreateEmployeeMessage,
  useSendEmployeeMessage,
} from './use-employee-messages'
```

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compiles without errors: `cd apps/web && npx tsc --noEmit`
- [ ] File exists: `apps/web/src/hooks/api/use-employee-messages.ts`
- [ ] Exports resolve: `cd apps/web && node -e "console.log('ok')"` (basic sanity)

#### Manual Verification:
- [ ] Hooks can be imported from `@/hooks/api` in a test component

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to the next phase.

---

## Phase 2: Data Table and Skeleton Components

### Overview
Create the message data table component showing message list with status summary, and a loading skeleton.

### Changes Required:

#### 1. Create component directory and barrel export
**File**: `apps/web/src/components/employee-messages/index.ts` (new)
**Changes**: Barrel export for all employee-messages components (will be updated in each phase)

```ts
export { MessageDataTable } from './message-data-table'
```

#### 2. Create data table component
**File**: `apps/web/src/components/employee-messages/message-data-table.tsx` (new)
**Changes**: Data table following the pattern from `apps/web/src/components/departments/department-data-table.tsx`

Key implementation details:
- Type: `type EmployeeMessage = components['schemas']['EmployeeMessage']`
- Props: `messages: EmployeeMessage[]`, `isLoading: boolean`, `onView: (msg) => void`
- Columns: Subject, Recipient Count, Status Summary, Created At, Actions (view only, no edit/delete for messages)
- Status summary column: compute `sent`, `pending`, `failed` counts from `message.recipients` array and display as `"5 sent, 2 pending, 1 failed"` format with color coding
- Row click: `onClick={() => onView(message)}`
- Actions: View only (Eye icon) in dropdown menu
- Translation namespace: `adminEmployeeMessages`
- Include `MessageDataTableSkeleton` function in same file
- Date formatting: `format(new Date(message.created_at), 'dd.MM.yyyy HH:mm')` from date-fns

#### 3. Update barrel export
**File**: `apps/web/src/components/employee-messages/index.ts`

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compiles: `cd apps/web && npx tsc --noEmit`
- [ ] File exists: `apps/web/src/components/employee-messages/message-data-table.tsx`
- [ ] File exists: `apps/web/src/components/employee-messages/index.ts`

#### Manual Verification:
- [ ] Component renders a table with correct columns when given mock data

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to the next phase.

---

## Phase 3: Message Toolbar Component

### Overview
Create a toolbar component with status filter, subject search, and "Compose Message" button.

### Changes Required:

#### 1. Create toolbar component
**File**: `apps/web/src/components/employee-messages/message-toolbar.tsx` (new)
**Changes**: Toolbar following the pattern from `apps/web/src/components/reports/report-toolbar.tsx` combined with `apps/web/src/components/vacation-balances/vacation-balance-toolbar.tsx`

Key implementation details:
- Props interface:
  ```ts
  interface MessageToolbarProps {
    search: string
    onSearchChange: (value: string) => void
    status: string
    onStatusChange: (value: string) => void
    onCompose: () => void
  }
  ```
- Layout: `<div className="flex flex-wrap items-center gap-4">`
- Elements:
  - `SearchInput` (from `@/components/ui/search-input`) with placeholder "Search by subject..."
  - Status `Select` with options: All, Pending, Sent, Failed
  - Clear filters button (conditionally shown when filters active)
  - "Compose Message" button with `Mail` icon (pushed right with `ml-auto`)
- Translation namespace: `adminEmployeeMessages`

#### 2. Update barrel export
**File**: `apps/web/src/components/employee-messages/index.ts`
**Changes**: Add `export { MessageToolbar } from './message-toolbar'`

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compiles: `cd apps/web && npx tsc --noEmit`
- [ ] File exists: `apps/web/src/components/employee-messages/message-toolbar.tsx`

#### Manual Verification:
- [ ] Toolbar renders with search input, status dropdown, and compose button

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to the next phase.

---

## Phase 4: Compose Sheet with Recipient Selector

### Overview
Create the compose sheet component with subject, body, and a three-mode recipient selector (individual employees, by department, all employees).

### Changes Required:

#### 1. Create compose sheet component
**File**: `apps/web/src/components/employee-messages/message-compose-sheet.tsx` (new)
**Changes**: Form sheet following the pattern from `apps/web/src/components/departments/department-form-sheet.tsx`

Key implementation details:
- Props:
  ```ts
  interface MessageComposeSheetProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    onSuccess?: (messageId: string) => void
  }
  ```
- Sheet: `side="right"`, `className="w-full sm:max-w-lg flex flex-col"`
- Form state via `React.useState`:
  ```ts
  interface ComposeFormState {
    subject: string
    body: string
    recipientMode: 'individual' | 'department' | 'all'
    selectedEmployeeIds: string[]
    selectedDepartmentIds: string[]
    allConfirmed: boolean
  }
  ```
- Fields:
  - Subject: `Input` (required, maxLength 255)
  - Body: `Textarea` (required, rows 6)
  - Recipient mode: Three-button toggle using `Tabs`/`TabsList`/`TabsTrigger` (Individual | Department | All)
  - Individual mode: `Select` dropdown listing employees from `useEmployees({ active: true, limit: 100 })`. Multi-selection tracked in state. Show selected employees as removable `Badge` chips below the selector.
  - Department mode: `Select` dropdown listing departments from `useDepartments({ active: true })`. Multi-selection tracked in state. Show selected departments as removable `Badge` chips. Use `useEmployees({ departmentId })` for each selected department to resolve employee counts.
  - All mode: Checkbox with "Send to all active employees" label. Uses `useEmployees({ active: true, limit: 1 })` to get the `total` count for preview.
  - Recipient count preview: `"N recipients selected"` line below the selector
- Validation function `validateForm()`:
  - Subject required and non-empty
  - Body required and non-empty
  - At least 1 recipient (resolved employee IDs must be >= 1)
- On submit:
  1. Resolve all employee IDs (for department mode, collect all employee IDs from the selected departments; for all mode, fetch all active employee IDs)
  2. Call `useCreateEmployeeMessage().mutateAsync({ body: { subject, body, employee_ids } })`
  3. On success, call `onSuccess(createdMessage.id)` so the page can prompt the send dialog
- Error display via `Alert variant="destructive"`
- Footer: Cancel + Create buttons with Loader2 spinner
- `useEffect` reset form on open/close

**Department-to-employee resolution approach:**
- When departments are selected, use multiple `useEmployees({ departmentId, active: true, limit: 100 })` calls (one per department) to resolve employee lists
- Simpler alternative: On submit, iterate selected department IDs and fetch employees via the hook, then deduplicate the IDs
- For the "All" mode, fetch employees with a high limit to get all IDs

**Important note on recipient resolution:** The resolution of department/all selections to individual employee IDs happens client-side before the API call, as the backend `CreateEmployeeMessageRequest` only accepts `employee_ids`.

#### 2. Update barrel export
**File**: `apps/web/src/components/employee-messages/index.ts`
**Changes**: Add `export { MessageComposeSheet } from './message-compose-sheet'`

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compiles: `cd apps/web && npx tsc --noEmit`
- [ ] File exists: `apps/web/src/components/employee-messages/message-compose-sheet.tsx`

#### Manual Verification:
- [ ] Compose sheet opens with subject and body fields
- [ ] Recipient mode toggle switches between Individual / Department / All
- [ ] Individual mode shows searchable employee list and selected chips
- [ ] Department mode shows department list and resolves to employee count
- [ ] All mode shows checkbox and total employee count
- [ ] Validation prevents submission without required fields
- [ ] Create button saves the message successfully

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to the next phase.

---

## Phase 5: Send Confirmation Dialog

### Overview
Create a confirmation dialog for sending a message, showing recipient count before sending and result after.

### Changes Required:

#### 1. Create send confirmation dialog
**File**: `apps/web/src/components/employee-messages/send-confirmation-dialog.tsx` (new)
**Changes**: Dialog component following patterns from `apps/web/src/components/ui/confirm-dialog.tsx` and `apps/web/src/components/employees/bulk-actions.tsx`

Key implementation details:
- Uses `Dialog` / `DialogContent` / `DialogHeader` / `DialogTitle` / `DialogDescription` / `DialogFooter` from `@/components/ui/dialog` (not the bottom Sheet ConfirmDialog, because we need to show send results inline)
- Props:
  ```ts
  interface SendConfirmationDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    messageId: string | null
    subject: string
    recipientCount: number
    onSendComplete?: () => void
  }
  ```
- Two states: "confirm" and "result"
  - Confirm state: Shows "Send message '{subject}' to {N} recipients?" with Cancel and Send buttons
  - Result state: After send completes, shows "Sent: X, Failed: Y" with a Close button
- Uses `useSendEmployeeMessage()` mutation
- On send: call `mutateAsync({ path: { id: messageId } })`, capture `SendEmployeeMessageResponse`, switch to result state
- Error handling: show error in Alert if send fails
- Translation namespace: `adminEmployeeMessages`

#### 2. Update barrel export
**File**: `apps/web/src/components/employee-messages/index.ts`
**Changes**: Add `export { SendConfirmationDialog } from './send-confirmation-dialog'`

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compiles: `cd apps/web && npx tsc --noEmit`
- [ ] File exists: `apps/web/src/components/employee-messages/send-confirmation-dialog.tsx`

#### Manual Verification:
- [ ] Dialog shows correct subject and recipient count
- [ ] Send button triggers the send API call
- [ ] Result view shows sent/failed counts
- [ ] Close button dismisses the dialog

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to the next phase.

---

## Phase 6: Detail Sheet with Recipient Status

### Overview
Create a detail sheet showing message content and per-recipient delivery status with badges.

### Changes Required:

#### 1. Create detail sheet component
**File**: `apps/web/src/components/employee-messages/message-detail-sheet.tsx` (new)
**Changes**: Detail sheet following the pattern from `apps/web/src/components/departments/department-detail-sheet.tsx`

Key implementation details:
- Props:
  ```ts
  interface MessageDetailSheetProps {
    messageId: string | null
    open: boolean
    onOpenChange: (open: boolean) => void
    onSend?: (messageId: string, subject: string, recipientCount: number) => void
  }
  ```
- Fetches message on open: `useEmployeeMessage(messageId, open && !!messageId)`
- Sheet: `side="right"`, `className="w-full sm:max-w-lg flex flex-col"`
- Sections:
  1. **Header**: Subject as title, sender info
  2. **Message Content**: Body text in a bordered section
  3. **Message Info**: Created date, updated date (using `DetailRow` pattern)
  4. **Recipients table**: Embedded `Table` within the sheet showing:
     - Employee ID (or name if we resolve it - see note below)
     - Status badge: `pending` = yellow/warning variant, `sent` = green/default variant, `failed` = red/destructive variant
     - Sent At (formatted date or "-")
     - Error Message (if failed, shown in red text)
  5. **Status summary**: "X sent, Y pending, Z failed" computed from recipients array
- Footer:
  - Close button
  - "Send" button (shown only if message has pending recipients) - calls `onSend(messageId, subject, pendingCount)`
- Loading state: Skeleton placeholders
- Date formatting: `format(new Date(date), 'dd.MM.yyyy HH:mm')` from date-fns

**Note on employee names in recipient table:** The `EmployeeMessageRecipient` schema only has `employee_id`, not employee name. To show names we would need to fetch each employee separately or have the backend include them. For now, show `employee_id` (truncated UUID). This can be improved in a future ticket by having the backend include employee details in the response.

#### 2. Update barrel export
**File**: `apps/web/src/components/employee-messages/index.ts`
**Changes**: Add `export { MessageDetailSheet } from './message-detail-sheet'`

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compiles: `cd apps/web && npx tsc --noEmit`
- [ ] File exists: `apps/web/src/components/employee-messages/message-detail-sheet.tsx`

#### Manual Verification:
- [ ] Detail sheet opens when clicking a message row
- [ ] Shows subject, body, sender, timestamps
- [ ] Recipients table shows per-recipient status with colored badges
- [ ] Send button appears when pending recipients exist
- [ ] Failed recipients show error messages

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to the next phase.

---

## Phase 7: Page Component, Navigation, and Translations

### Overview
Create the page component wiring all components together, add navigation entries, breadcrumb mapping, and full EN/DE translations.

### Changes Required:

#### 1. Add translations (English)
**File**: `apps/web/messages/en.json`
**Changes**: Add `adminEmployeeMessages` namespace with all translation keys. Also add `nav.employeeMessages`, `breadcrumbs.employeeMessages` keys.

Nav key to add:
```json
"employeeMessages": "Employee Messages"
```

Breadcrumbs key to add:
```json
"employeeMessages": "Employee Messages"
```

Main namespace `adminEmployeeMessages`:
```json
"adminEmployeeMessages": {
  "title": "Employee Messages",
  "subtitle": "Compose and send messages to employees, track delivery status",
  "composeMessage": "Compose Message",
  "searchPlaceholder": "Search by subject...",
  "allStatus": "All Status",
  "clearFilters": "Clear filters",
  "columnSubject": "Subject",
  "columnRecipients": "Recipients",
  "columnStatus": "Status",
  "columnCreatedAt": "Created",
  "columnActions": "Actions",
  "viewDetails": "View Details",
  "statusPending": "Pending",
  "statusSent": "Sent",
  "statusFailed": "Failed",
  "statusSummary": "{sent} sent, {pending} pending, {failed} failed",
  "emptyTitle": "No messages yet",
  "emptyDescription": "Get started by composing your first message",
  "emptyFilterHint": "No messages match your filters",
  "composeTitle": "Compose Message",
  "composeDescription": "Create a new message for employees",
  "fieldSubject": "Subject",
  "fieldSubjectPlaceholder": "Enter message subject...",
  "fieldBody": "Message Body",
  "fieldBodyPlaceholder": "Write your message...",
  "sectionRecipients": "Recipients",
  "recipientModeIndividual": "Individual",
  "recipientModeDepartment": "Department",
  "recipientModeAll": "All Employees",
  "selectEmployees": "Select employees...",
  "selectDepartments": "Select departments...",
  "allEmployeesConfirm": "Send to all active employees",
  "recipientCount": "{count} recipients selected",
  "recipientCountNone": "No recipients selected",
  "validationSubjectRequired": "Subject is required",
  "validationBodyRequired": "Message body is required",
  "validationRecipientsRequired": "At least one recipient is required",
  "validationAllConfirmRequired": "Please confirm sending to all employees",
  "cancel": "Cancel",
  "creating": "Creating...",
  "createMessage": "Create Message",
  "createError": "Failed to create message",
  "detailTitle": "Message Details",
  "detailDescription": "View message content and delivery status",
  "sectionContent": "Content",
  "sectionInfo": "Message Info",
  "sectionRecipientStatus": "Recipient Status",
  "fieldSender": "Sender",
  "fieldCreated": "Created",
  "fieldUpdated": "Last Updated",
  "recipientEmployee": "Employee",
  "recipientStatus": "Status",
  "recipientSentAt": "Sent At",
  "recipientError": "Error",
  "close": "Close",
  "sendMessage": "Send Message",
  "sendConfirmTitle": "Send Message",
  "sendConfirmDescription": "Send \"{subject}\" to {count} recipients?",
  "send": "Send",
  "sending": "Sending...",
  "sendResultTitle": "Send Complete",
  "sendResultSent": "Successfully sent: {count}",
  "sendResultFailed": "Failed: {count}",
  "sendError": "Failed to send message",
  "done": "Done"
}
```

#### 2. Add translations (German)
**File**: `apps/web/messages/de.json`
**Changes**: Add corresponding German translations for `nav.employeeMessages`, `breadcrumbs.employeeMessages`, and the full `adminEmployeeMessages` namespace.

Nav key:
```json
"employeeMessages": "Mitarbeiternachrichten"
```

Breadcrumbs key:
```json
"employeeMessages": "Mitarbeiternachrichten"
```

Main namespace:
```json
"adminEmployeeMessages": {
  "title": "Mitarbeiternachrichten",
  "subtitle": "Nachrichten an Mitarbeiter verfassen und senden, Zustellstatus verfolgen",
  "composeMessage": "Nachricht verfassen",
  "searchPlaceholder": "Nach Betreff suchen...",
  "allStatus": "Alle Status",
  "clearFilters": "Filter zurücksetzen",
  "columnSubject": "Betreff",
  "columnRecipients": "Empfänger",
  "columnStatus": "Status",
  "columnCreatedAt": "Erstellt",
  "columnActions": "Aktionen",
  "viewDetails": "Details anzeigen",
  "statusPending": "Ausstehend",
  "statusSent": "Gesendet",
  "statusFailed": "Fehlgeschlagen",
  "statusSummary": "{sent} gesendet, {pending} ausstehend, {failed} fehlgeschlagen",
  "emptyTitle": "Noch keine Nachrichten",
  "emptyDescription": "Verfassen Sie Ihre erste Nachricht",
  "emptyFilterHint": "Keine Nachrichten entsprechen Ihren Filtern",
  "composeTitle": "Nachricht verfassen",
  "composeDescription": "Erstellen Sie eine neue Nachricht für Mitarbeiter",
  "fieldSubject": "Betreff",
  "fieldSubjectPlaceholder": "Betreff eingeben...",
  "fieldBody": "Nachrichtentext",
  "fieldBodyPlaceholder": "Nachricht schreiben...",
  "sectionRecipients": "Empfänger",
  "recipientModeIndividual": "Einzeln",
  "recipientModeDepartment": "Abteilung",
  "recipientModeAll": "Alle Mitarbeiter",
  "selectEmployees": "Mitarbeiter auswählen...",
  "selectDepartments": "Abteilungen auswählen...",
  "allEmployeesConfirm": "An alle aktiven Mitarbeiter senden",
  "recipientCount": "{count} Empfänger ausgewählt",
  "recipientCountNone": "Keine Empfänger ausgewählt",
  "validationSubjectRequired": "Betreff ist erforderlich",
  "validationBodyRequired": "Nachrichtentext ist erforderlich",
  "validationRecipientsRequired": "Mindestens ein Empfänger ist erforderlich",
  "validationAllConfirmRequired": "Bitte bestätigen Sie das Senden an alle Mitarbeiter",
  "cancel": "Abbrechen",
  "creating": "Wird erstellt...",
  "createMessage": "Nachricht erstellen",
  "createError": "Nachricht konnte nicht erstellt werden",
  "detailTitle": "Nachrichtendetails",
  "detailDescription": "Nachrichteninhalt und Zustellstatus anzeigen",
  "sectionContent": "Inhalt",
  "sectionInfo": "Nachrichteninfo",
  "sectionRecipientStatus": "Empfängerstatus",
  "fieldSender": "Absender",
  "fieldCreated": "Erstellt",
  "fieldUpdated": "Zuletzt aktualisiert",
  "recipientEmployee": "Mitarbeiter",
  "recipientStatus": "Status",
  "recipientSentAt": "Gesendet am",
  "recipientError": "Fehler",
  "close": "Schließen",
  "sendMessage": "Nachricht senden",
  "sendConfirmTitle": "Nachricht senden",
  "sendConfirmDescription": "\"{subject}\" an {count} Empfänger senden?",
  "send": "Senden",
  "sending": "Wird gesendet...",
  "sendResultTitle": "Versand abgeschlossen",
  "sendResultSent": "Erfolgreich gesendet: {count}",
  "sendResultFailed": "Fehlgeschlagen: {count}",
  "sendError": "Nachricht konnte nicht gesendet werden",
  "done": "Fertig"
}
```

#### 3. Add sidebar navigation entry
**File**: `apps/web/src/components/layout/sidebar/sidebar-nav-config.ts`
**Changes**:
- Add `Mail` to the lucide-react import
- Add a new nav item in the `management` section (after `orders` or wherever messaging logically fits):
```ts
{
  titleKey: 'employeeMessages',
  href: '/admin/employee-messages',
  icon: Mail,
  permissions: ['notifications.manage'],
},
```

#### 4. Add breadcrumb mapping
**File**: `apps/web/src/components/layout/breadcrumbs.tsx`
**Changes**: Add entry to `segmentToKey` map:
```ts
'employee-messages': 'employeeMessages',
```

#### 5. Create page component
**File**: `apps/web/src/app/[locale]/(dashboard)/admin/employee-messages/page.tsx` (new)
**Changes**: Page component following the pattern from `apps/web/src/app/[locale]/(dashboard)/admin/departments/page.tsx`

Key implementation details:
- `'use client'` directive
- Permission check: `useHasPermission(['notifications.manage'])` with redirect on deny
- State:
  ```ts
  const [search, setSearch] = React.useState('')
  const [statusFilter, setStatusFilter] = React.useState<string>('all')
  const [composeOpen, setComposeOpen] = React.useState(false)
  const [viewMessageId, setViewMessageId] = React.useState<string | null>(null)
  const [sendDialogState, setSendDialogState] = React.useState<{
    messageId: string
    subject: string
    recipientCount: number
  } | null>(null)
  ```
- Data fetching: `useEmployeeMessages({ status: statusFilter !== 'all' ? statusFilter : undefined, enabled: canAccess })`
- Client-side search filter on subject field
- Page layout:
  1. Header: title + subtitle
  2. Toolbar: `MessageToolbar` with search, status filter, compose button
  3. Card wrapping `MessageDataTable` or empty state
  4. `MessageComposeSheet` - on success, open send confirmation dialog
  5. `MessageDetailSheet` - with onSend callback opening send dialog
  6. `SendConfirmationDialog`
- Empty state: Mail icon + "No messages yet" + "Compose your first message" button
- Loading skeleton: page-level skeleton component
- Compose flow: User clicks "Compose" -> sheet opens -> fills form -> clicks Create -> message created -> send confirmation dialog opens -> user clicks Send -> result shown

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compiles: `cd apps/web && npx tsc --noEmit`
- [ ] File exists: `apps/web/src/app/[locale]/(dashboard)/admin/employee-messages/page.tsx`
- [ ] Breadcrumb entry added to `segmentToKey` in `apps/web/src/components/layout/breadcrumbs.tsx`
- [ ] Sidebar entry added in `apps/web/src/components/layout/sidebar/sidebar-nav-config.ts`
- [ ] English translations added in `apps/web/messages/en.json` under `adminEmployeeMessages`
- [ ] German translations added in `apps/web/messages/de.json` under `adminEmployeeMessages`
- [ ] Lint passes: `cd apps/web && npx next lint`

#### Manual Verification:
- [ ] Navigate to `/admin/employee-messages` - page loads with correct title
- [ ] Sidebar shows "Employee Messages" link under Management with Mail icon
- [ ] Breadcrumbs show correctly: Home > Administration > Employee Messages
- [ ] Empty state displays when no messages exist
- [ ] Compose flow: create a message with individual recipients, send it
- [ ] Status filter works (filters list by pending/sent/failed)
- [ ] Search filters messages by subject
- [ ] Click a message row to open detail sheet
- [ ] Detail sheet shows message content and recipient statuses with badges
- [ ] Send button in detail sheet triggers send confirmation dialog
- [ ] Send confirmation shows correct count and displays results after sending
- [ ] Switch locale to German and verify all translations display correctly

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before considering the feature complete.

---

## Testing Strategy

### Unit Tests:
Not adding formal unit tests in this phase (consistent with existing codebase pattern where admin pages do not have component-level tests). Verification is done through TypeScript compilation and manual testing.

### Manual Testing Steps:
1. Navigate to `/admin/employee-messages` as admin user
2. Verify empty state with compose button
3. Click "Compose Message" - sheet opens
4. Enter subject "Test Message" and body "Hello employees"
5. Select "Individual" mode, pick 2-3 employees
6. Verify recipient count shows correctly
7. Click "Create Message"
8. Verify send confirmation dialog appears with correct count
9. Click "Send"
10. Verify result shows sent/failed counts
11. Close dialog, verify message appears in the list
12. Click on the message row, verify detail sheet opens
13. Verify recipient table shows per-recipient status badges
14. Test "Department" recipient mode - select a department, verify employee count
15. Test "All Employees" mode - confirm checkbox, verify total count
16. Test status filter - filter by "sent", verify only sent messages shown
17. Test subject search - type partial subject, verify filtering
18. Switch to German locale, verify all labels are translated

## Performance Considerations

- Employee list for recipient selector uses `limit: 100` which is adequate for most tenants. For very large organizations (hundreds of employees), the selector may need pagination/virtualization in a future iteration.
- Department-to-employee resolution on the client side requires one API call per selected department. For many departments, this could be slow. Acceptable for initial implementation; a server-side resolution endpoint could be added later.
- Message list pagination uses `offset`-based pagination with `limit: 20` default, which is efficient for typical message volumes.

## Migration Notes

No database migrations needed. The backend is fully implemented. This is a frontend-only change.

## References

- Original ticket: `thoughts/shared/tickets/ZMI-TICKET-065-employee-messages-ui.md`
- Research document: `thoughts/shared/research/2026-02-10-ZMI-TICKET-065-employee-messages-ui.md`
- Backend notification/messages plan: `thoughts/shared/plans/2026-01-30-ZMI-TICKET-026-notifications-and-messages.md`
- Reference page pattern: `apps/web/src/app/[locale]/(dashboard)/admin/departments/page.tsx`
- Reference data table: `apps/web/src/components/departments/department-data-table.tsx`
- Reference form sheet: `apps/web/src/components/departments/department-form-sheet.tsx`
- Reference detail sheet: `apps/web/src/components/departments/department-detail-sheet.tsx`
- Reference hooks: `apps/web/src/hooks/api/use-departments.ts`
- Reference toolbar: `apps/web/src/components/reports/report-toolbar.tsx`
- OpenAPI spec: `api/paths/employee-messages.yaml`
- Schema spec: `api/schemas/employee-messages.yaml`
- Generated types: `apps/web/src/lib/api/types.ts` (search for `EmployeeMessage`)
