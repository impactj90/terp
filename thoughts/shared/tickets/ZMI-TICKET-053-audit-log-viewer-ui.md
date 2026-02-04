# ZMI-TICKET-053: Audit Log Viewer UI

Status: Proposed
Priority: P2
Owner: TBD
Backend tickets: ZMI-TICKET-034

## Goal
Provide a read-only audit log viewer with advanced filters for compliance review and debugging, including a detail sheet with before/after JSON diff visualization.

## Scope
- In scope: Audit log list with filters (date range, user, entity type, action), detail sheet with JSON diff, cursor-based pagination.
- Out of scope: Audit log export (use reports), audit log deletion, real-time streaming.

## Requirements

### Pages & routes
- **New page**: `apps/web/src/app/[locale]/(dashboard)/admin/audit-logs/page.tsx`
  - Route: `/admin/audit-logs`

### Components
- `apps/web/src/components/audit-logs/audit-log-data-table.tsx`
  - Columns: Timestamp, User, Action (badge), Entity Type, Entity Name, IP Address, Details
  - Action badges: create=green, update=blue, delete=red, approve=green/outline, reject=red/outline, close=purple, reopen=orange, export=cyan, import=teal, login=gray, logout=gray
  - Entity type displayed as formatted label (e.g., "booking" → "Booking", "monthly_value" → "Monthly Value")
  - Row click opens detail sheet
  - Timestamp formatted as "YYYY-MM-DD HH:mm:ss"
  - User column shows display_name with avatar if available
- `apps/web/src/components/audit-logs/audit-log-detail-sheet.tsx`
  - Full audit log entry details
  - Sections:
    - Event Info: action badge, entity type, entity name, entity ID (copyable)
    - User Info: display name, avatar, user ID
    - Request Info: IP address, user agent
    - Timestamps: performed_at
    - Changes: before/after JSON diff view
      - Side-by-side or unified diff view toggle
      - Changed fields highlighted: removed (red), added (green), modified (yellow before → green after)
      - Nested object support (flatten dotted paths)
    - Metadata: additional context as formatted JSON
- `apps/web/src/components/audit-logs/audit-log-filters.tsx`
  - Date range picker (from/to datetime, defaults to last 24 hours)
  - User selector (searchable dropdown from useUsers)
  - Entity Type selector (from known types: booking, employee, absence, monthly_value, etc.)
  - Entity ID text input (UUID format)
  - Action selector (multi-select: create, update, delete, approve, reject, close, reopen, export, import, login, logout)
  - Clear all filters button
- `apps/web/src/components/audit-logs/audit-log-json-diff.tsx`
  - Reusable JSON diff component
  - Props: before (object), after (object)
  - Displays: field name, old value (red strikethrough), new value (green)
  - Handles: nested objects, arrays, null values, type changes
  - Toggle: side-by-side vs unified view
- `apps/web/src/components/audit-logs/audit-log-skeleton.tsx`

### API hooks
- `apps/web/src/hooks/api/use-audit-logs.ts`
  - `useAuditLogs(params?)` — GET `/audit-logs` with query params: `user_id`, `entity_type`, `entity_id`, `action`, `from`, `to`, `limit`, `cursor`
  - `useAuditLog(id)` — GET `/audit-logs/{id}`

### UI behavior
- Read-only: no create/edit/delete actions (audit logs are system-generated)
- Default date range: last 24 hours
- Cursor-based pagination: "Load More" button at bottom (append results)
- Filter persistence: filters stored in URL search params for bookmarking
- JSON diff component: handles nested changes gracefully; shows "No changes recorded" when changes is null
- Entity type labels: maintain a lookup map of entity_type string → display label
- IP address column: show "System" when ip_address is null (automated actions)
- Performance: limit=50 default, avoid loading full history at once
- Empty state: "No audit log entries found for the selected filters"

### Navigation & translations
- Sidebar entry in "Administration" section: `{ titleKey: 'nav.audit-logs', href: '/admin/audit-logs', icon: ScrollText, roles: ['admin'] }`
- Breadcrumb segment: `'audit-logs': 'audit-logs'` in segmentToKey mapping
- Translation namespace: `audit-logs`
  - Key groups: `page.*`, `table.*`, `filters.*`, `detail.*`, `actions.*` (action labels), `entity-types.*`, `diff.*`, `empty.*`

## Acceptance criteria
- Admin can view audit log entries with timestamp, user, action, and entity details
- Admin can filter by date range, user, entity type, entity ID, and action
- Detail sheet shows before/after JSON diff for change events
- Cursor-based pagination loads more entries on demand
- Non-admin users cannot access the page (403)
- Filters persist in URL for bookmarkability

## Tests

### Component tests
- Data table renders action badges with correct colors
- JSON diff component correctly highlights changes
- Filter changes trigger refetch with correct parameters
- Detail sheet shows all sections including changes
- Cursor pagination appends new results

### Integration tests
- Load audit logs for last 24 hours
- Filter by user, verify results
- Filter by entity type and action, verify results
- Open detail for update action, verify diff shows
- Load more pages via cursor

## Test case pack
1) View recent audit logs
   - Input: Navigate to audit logs page (default: last 24 hours)
   - Expected: Table shows recent entries sorted by timestamp descending
2) Filter by action
   - Input: Select action=update
   - Expected: Only update actions shown
3) View change diff
   - Input: Click an update audit log entry
   - Expected: Detail sheet shows before/after values with color coding
4) Filter by entity type
   - Input: Select entity_type=booking
   - Expected: Only booking-related entries shown
5) Load more entries
   - Input: Scroll to bottom, click "Load More"
   - Expected: Next page of results appended to table

## Dependencies
- ZMI-TICKET-034 (Audit Logging backend)
- Users API (for user filter dropdown)
