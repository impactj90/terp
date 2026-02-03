# ZMI-TICKET-045: Export Interface Configuration UI

Status: Proposed
Priority: P1
Owner: TBD
Backend tickets: ZMI-TICKET-021

## Goal
Provide an admin page for managing export interfaces with full CRUD plus an account mapping editor for configuring which accounts are included in each export interface.

## Scope
- In scope: Export interface CRUD table, account assignment editor (dual-list pattern), account mapping with payroll codes.
- Out of scope: Payroll export generation (ZMI-TICKET-044), export script execution, file path validation.

## Requirements

### Pages & routes
- **New page**: `apps/web/src/app/[locale]/(dashboard)/admin/export-interfaces/page.tsx`
  - Route: `/admin/export-interfaces`

### Components
- `apps/web/src/components/export-interfaces/export-interface-data-table.tsx`
  - Columns: Interface Number, Name, Mandant Number, Export Path, Active (badge), Account Count, Actions
  - Row click opens detail/edit sheet
  - Actions dropdown: Edit, Manage Accounts, Delete
  - Sortable by interface number and name
- `apps/web/src/components/export-interfaces/export-interface-form-sheet.tsx`
  - Sheet form for create/edit
  - Fields:
    - Interface Number (number input, min 1, required)
    - Name (text input, max 255, required)
    - Mandant Number (text input, max 50, optional)
    - Export Script (text input, max 255, optional)
    - Export Path (text input, max 500, optional)
    - Output Filename (text input, max 255, optional)
    - Active (switch, default true for create)
  - On 409 "Interface number already exists": show inline error
  - On 409 "Interface has generated exports" (delete attempt): show warning that interface cannot be deleted
- `apps/web/src/components/export-interfaces/export-interface-detail-sheet.tsx`
  - Shows all interface details
  - Sections: Basic Info, Export Configuration (script, path, filename), Assigned Accounts (list)
  - Actions: Edit, Manage Accounts, Delete
- `apps/web/src/components/export-interfaces/account-mapping-dialog.tsx`
  - Full-screen dialog or wide sheet for managing account assignments
  - Dual-list layout:
    - Left panel: "Available Accounts" — all accounts not yet assigned (from useAccounts hook)
    - Right panel: "Assigned Accounts" — accounts currently in this interface (from GET `/export-interfaces/{id}/accounts`)
  - Each account row shows: code, name, and (for assigned) editable payroll_code field
  - Transfer buttons: Add selected (→), Remove selected (←), Add all (⇒), Remove all (⇐)
  - Sort order: drag-and-drop reordering on assigned side, or up/down buttons
  - Search filter on both panels
  - Save button: calls PUT `/export-interfaces/{id}/accounts` with full account_ids array
  - Shows result: "Accounts updated successfully"
- `apps/web/src/components/export-interfaces/export-interface-delete-dialog.tsx`
  - Confirmation dialog: "Delete export interface '{name}' (#{interface_number})?"
  - Warning if interface has generated exports (409 will prevent deletion)
- `apps/web/src/components/export-interfaces/export-interface-skeleton.tsx`

### API hooks
- `apps/web/src/hooks/api/use-export-interfaces.ts`
  - `useExportInterfaces(params?)` — GET `/export-interfaces` with query param: `active_only`
  - `useExportInterface(id)` — GET `/export-interfaces/{id}`
  - `useCreateExportInterface()` — POST `/export-interfaces`, body: `{ interface_number, name, mandant_number?, export_script?, export_path?, output_filename? }`, invalidates `[['/export-interfaces']]`
  - `useUpdateExportInterface()` — PATCH `/export-interfaces/{id}`, body: partial fields, invalidates `[['/export-interfaces']]`
  - `useDeleteExportInterface()` — DELETE `/export-interfaces/{id}`, invalidates `[['/export-interfaces']]`
  - `useExportInterfaceAccounts(interfaceId)` — GET `/export-interfaces/{id}/accounts`
  - `useSetExportInterfaceAccounts(interfaceId)` — PUT `/export-interfaces/{id}/accounts`, body: `{ account_ids: [] }`, invalidates `[['/export-interfaces/{id}/accounts'], ['/export-interfaces']]`

### UI behavior
- Interface number uniqueness: 409 on create/update shows "Interface number already exists for this tenant"
- Delete prevention: 409 when interface has generated exports; show warning dialog instead of confirmation
- Account mapping dual-list: available accounts = all tenant accounts minus already-assigned; assigned accounts show in order with payroll_code editable inline
- Account save: sends the complete list of account_ids in the desired order; the PUT endpoint replaces all assignments
- Active filter toggle at top of table
- Empty state: "No export interfaces configured. Create your first interface to enable payroll exports."

### Navigation & translations
- Sidebar entry in "Administration" section: `{ titleKey: 'nav.export-interfaces', href: '/admin/export-interfaces', icon: Settings2, roles: ['admin'] }`
- Breadcrumb segment: `'export-interfaces': 'export-interfaces'` in segmentToKey mapping
- Translation namespace: `export-interfaces`
  - Key groups: `page.*`, `table.*`, `form.*`, `detail.*`, `accounts.*`, `delete.*`, `empty.*`, `errors.*`

## Acceptance criteria
- Admin can list, create, edit, and delete export interfaces
- Admin can manage account assignments for each interface via dual-list editor
- Interface number uniqueness enforced with clear error message
- Delete prevented for interfaces with generated exports
- Account assignment save replaces all accounts atomically
- Active filter shows/hides inactive interfaces
- Non-admin users cannot access the page

## Tests

### Component tests
- Data table renders interface details with account count
- Form validates required fields and handles 409 duplicate
- Account mapping dialog shows correct available/assigned accounts
- Transfer buttons move accounts between panels
- Delete dialog shows warning for interfaces with exports

### Integration tests
- Create interface, verify it appears in list
- Edit interface name, verify update persists
- Assign accounts to interface, verify they appear in detail view
- Remove accounts, verify assignment cleared
- Attempt delete of interface with exports, verify 409 handling

## Test case pack
1) Create export interface
   - Input: Interface #1, name "DATEV Standard", mandant "12345"
   - Expected: Interface created, appears in table
2) Duplicate interface number
   - Input: Create another interface with number 1
   - Expected: 409 error shown: "Interface number already exists"
3) Manage account assignments
   - Input: Open account mapping, add 5 accounts from available to assigned, save
   - Expected: PUT sends 5 account_ids, detail shows 5 assigned accounts
4) Reorder assigned accounts
   - Input: Drag account from position 3 to position 1 in assigned list, save
   - Expected: Sort order updated, reflected in next load
5) Delete interface without exports
   - Input: Delete interface with no generated exports
   - Expected: Interface deleted successfully
6) Delete interface with exports
   - Input: Attempt to delete interface that has generated exports
   - Expected: 409 error, warning dialog shown

## Dependencies
- ZMI-TICKET-021 (Data Exchange Exports backend)
- ZMI-TICKET-009 (Accounts — for account list in mapping)
