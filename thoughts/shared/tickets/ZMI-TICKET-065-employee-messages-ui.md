# ZMI-TICKET-065: Employee Messages UI

Status: Proposed
Priority: P3
Owner: TBD
Backend tickets: ZMI-TICKET-026

## Goal
Provide an employee messaging interface for composing messages, selecting recipients, viewing message history, and tracking delivery status.

## Scope
- In scope: Message list, compose form, recipient selector (individual/department/all), send action, delivery status tracking.
- Out of scope: Real-time messaging/chat, push notifications, message templates, file attachments.

## Requirements

### Pages & routes
- **New page**: `apps/web/src/app/[locale]/(dashboard)/admin/employee-messages/page.tsx`
  - Route: `/admin/employee-messages`

### Components
- `apps/web/src/components/employee-messages/message-data-table.tsx`
  - Columns: Subject, Sender, Recipient Count, Status Summary (sent/pending/failed counts), Created At, Actions
  - Status summary: "5 sent, 0 pending, 1 failed" format
  - Row click opens detail sheet
- `apps/web/src/components/employee-messages/message-compose-sheet.tsx`
  - Sheet form for composing a new message
  - Fields:
    - Subject (text input, required)
    - Body (rich textarea / markdown input)
    - Recipients section:
      - Mode toggle: "Individual" | "Department" | "All Employees"
      - Individual: multi-select employees (searchable)
      - Department: multi-select departments (all employees in selected departments)
      - All: checkbox confirmation "Send to all active employees"
    - Preview: shows recipient count
  - Uses POST `/employee-messages`
- `apps/web/src/components/employee-messages/message-detail-sheet.tsx`
  - Shows: subject, body (rendered), sender info, created_at
  - Recipients table: Employee Name, Status (badge: pending/sent/failed), Sent At, Error Message (if failed)
  - "Send" action button if message has pending recipients (POST `/employee-messages/{id}/send`)
  - Recipient status badges: pending=yellow, sent=green, failed=red
- `apps/web/src/components/employee-messages/message-toolbar.tsx`
  - Status filter (pending/sent/failed)
  - Search by subject
  - "Compose Message" button
- `apps/web/src/components/employee-messages/send-confirmation-dialog.tsx`
  - Confirmation before sending: "Send message '{subject}' to {N} recipients?"
  - Shows result after send: "Sent: X, Failed: Y"
- `apps/web/src/components/employee-messages/message-skeleton.tsx`

### API hooks
- `apps/web/src/hooks/api/use-employee-messages.ts`
  - `useEmployeeMessages(params?)` — GET `/employee-messages` with query params: `status`, `limit`, `cursor`
  - `useEmployeeMessage(id)` — GET `/employee-messages/{id}`
  - `useCreateEmployeeMessage()` — POST `/employee-messages`, body: `{ subject, body, recipient_employee_ids }`, invalidates `[['/employee-messages']]`
  - `useSendEmployeeMessage()` — POST `/employee-messages/{id}/send`, invalidates `[['/employee-messages']]`
  - `useEmployeeMessagesForEmployee(employeeId)` — GET `/employees/{id}/messages`

### UI behavior
- Compose flow: fill subject + body → select recipients → preview count → create (saves as draft) → send
- Recipient resolution: department selection resolves to individual employee IDs before API call
- Send action: POST to /send endpoint, shows result with sent/failed counts
- Failed recipients: shown with error_message for debugging
- Message body: supports basic formatting (bold, italic, lists) via markdown
- Status filter: allows viewing messages by delivery status
- Empty state: "No messages sent yet. Compose your first message."
- Message detail: re-send option for failed recipients (send again to just failed ones)

### Navigation & translations
- Sidebar entry in "Administration" section: `{ titleKey: 'nav.employee-messages', href: '/admin/employee-messages', icon: Mail, roles: ['admin'] }`
- Breadcrumb: `'employee-messages': 'employee-messages'`
- Translation namespace: `employee-messages`
  - Key groups: `page.*`, `table.*`, `compose.*`, `detail.*`, `recipients.*`, `send.*`, `status.*`, `empty.*`

## Acceptance criteria
- Admin can compose and send messages to individual employees, departments, or all employees
- Recipient selector supports three modes (individual/department/all)
- Message delivery status tracked per recipient
- Failed deliveries show error message
- Admin can re-send to failed recipients
- Send confirmation shows recipient count before sending

## Tests

### Component tests
- Compose form validates subject required
- Recipient mode toggle changes selector component
- Department selection resolves to employee count preview
- Detail sheet shows per-recipient status badges
- Send confirmation dialog shows correct count

### Integration tests
- Compose message, select recipients, create, send
- View message detail, verify recipient statuses
- Re-send to failed recipients

## Test case pack
1) Send to individuals
   - Input: Subject "Meeting Update", body, select 3 employees, send
   - Expected: Message created with 3 recipients, send result: "Sent: 3, Failed: 0"
2) Send to department
   - Input: Select department with 10 employees, send
   - Expected: Resolved to 10 recipients, all sent
3) Failed delivery
   - Input: Send to employee that fails
   - Expected: Recipient status=failed with error_message, re-send option available
4) View message detail
   - Input: Click message in list
   - Expected: Detail sheet shows subject, body, recipient list with statuses

## Dependencies
- ZMI-TICKET-026 (Notifications and Messages backend)
- Employees API (for recipient selector)
- Departments API (for department-based recipient selection)
