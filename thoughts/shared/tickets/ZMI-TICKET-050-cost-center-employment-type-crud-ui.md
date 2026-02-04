# ZMI-TICKET-050: Cost Center & Employment Type CRUD UI

Status: Proposed
Priority: P2
Owner: TBD
Backend tickets: ZMI-TICKET-001, ZMI-TICKET-004

## Goal
Add a full CRUD admin page for cost centers and extend the existing employment types page with complete CRUD functionality (create, edit, delete).

## Scope
- In scope: New cost centers admin page with full CRUD, extend employment types page with create/edit/delete.
- Out of scope: Cost center assignment to employees (done in employee form), employment type assignment to employees, budget tracking.

## Requirements

### Pages & routes
- **New page**: `apps/web/src/app/[locale]/(dashboard)/admin/cost-centers/page.tsx`
  - Route: `/admin/cost-centers`
- **Extend existing page**: `apps/web/src/app/[locale]/(dashboard)/admin/employment-types/page.tsx`
  - Existing route: `/admin/employment-types`

### Components

#### Cost Centers
- `apps/web/src/components/cost-centers/cost-center-data-table.tsx`
  - Columns: Code, Name, Description, Active (badge), Actions
  - Row click opens detail sheet
  - Actions dropdown: Edit, Delete
  - Sortable by code and name
- `apps/web/src/components/cost-centers/cost-center-form-sheet.tsx`
  - Sheet form for create/edit
  - Fields:
    - Code (text input, required, max 50, unique)
    - Name (text input, required, max 255)
    - Description (textarea, optional)
    - Active (switch, default true, edit only)
  - On 409 "Code already exists": show inline error
  - Uses POST `/cost-centers` for create, PATCH `/cost-centers/{id}` for edit
- `apps/web/src/components/cost-centers/cost-center-detail-sheet.tsx`
  - Shows: code, name, description, active status, timestamps
  - Actions: Edit, Delete
- `apps/web/src/components/cost-centers/cost-center-delete-dialog.tsx`
  - Confirmation: "Delete cost center '{name}' ({code})?"
  - Warning: "If employees are assigned to this cost center, deletion may fail. Consider deactivating instead."
- `apps/web/src/components/cost-centers/cost-center-skeleton.tsx`

#### Employment Types (extend existing)
- `apps/web/src/components/employment-types/employment-type-form-sheet.tsx`
  - Sheet form for create/edit
  - Fields:
    - Code (text input, required, max 20, unique)
    - Name (text input, required, max 255)
    - Description (textarea, optional)
    - Default Weekly Hours (decimal input, optional, e.g., 40.00)
    - Active (switch, default true, edit only)
  - On 409 "Code already exists": show inline error
  - Uses POST `/employment-types` for create, PATCH `/employment-types/{id}` for edit
- `apps/web/src/components/employment-types/employment-type-delete-dialog.tsx`
  - Confirmation: "Delete employment type '{name}' ({code})?"
  - Warning: "If employees are assigned to this type, deletion may fail. Consider deactivating instead."

### API hooks
- `apps/web/src/hooks/api/use-cost-centers.ts`
  - `useCostCenters(params?)` — GET `/cost-centers` with query param: `active`
  - `useCostCenter(id)` — GET `/cost-centers/{id}`
  - `useCreateCostCenter()` — POST `/cost-centers`, body: `{ name, code, description? }`, invalidates `[['/cost-centers']]`
  - `useUpdateCostCenter()` — PATCH `/cost-centers/{id}`, body: partial fields, invalidates `[['/cost-centers']]`
  - `useDeleteCostCenter()` — DELETE `/cost-centers/{id}`, invalidates `[['/cost-centers']]`
- `apps/web/src/hooks/api/use-employment-types.ts` (extend existing)
  - Add `useCreateEmploymentType()` — POST `/employment-types`, body: `{ name, code, description?, default_weekly_hours? }`, invalidates `[['/employment-types']]`
  - Add `useUpdateEmploymentType()` — PATCH `/employment-types/{id}`, body: partial fields, invalidates `[['/employment-types']]`
  - Add `useDeleteEmploymentType()` — DELETE `/employment-types/{id}`, invalidates `[['/employment-types']]`

### UI behavior
- Cost centers page: standard CRUD pattern following holidays page pattern
- Active filter toggle on both pages
- Code uniqueness: 409 on create shows "Code already exists" inline
- Delete with assigned employees: if backend returns error, show message "Cannot delete: employees are assigned to this cost center/employment type"
- Deactivation recommended over deletion: delete dialog includes recommendation text
- Employment type weekly hours: displayed as decimal with 2 places (e.g., "40.00 hrs/week")
- Search/filter: text search on code and name fields
- Empty states: "No cost centers configured" / "No employment types configured"

### Navigation & translations
- Sidebar entry for cost centers in "Management" section: `{ titleKey: 'nav.cost-centers', href: '/admin/cost-centers', icon: Building2, roles: ['admin'] }`
- Employment types already has sidebar entry — no change needed
- Breadcrumb segment: `'cost-centers': 'cost-centers'` in segmentToKey mapping
- Translation namespaces:
  - `cost-centers`: `page.*`, `table.*`, `form.*`, `detail.*`, `delete.*`, `empty.*`, `errors.*`
  - `employment-types` (extend): `form.*`, `delete.*`, `errors.*`

## Acceptance criteria
- Admin can list, create, edit, and delete cost centers
- Admin can create, edit, and delete employment types
- Code uniqueness enforced with clear error on both entities
- Active/inactive filter works on both pages
- Delete shows warning about assigned employees
- Employment types display default weekly hours
- Non-admin users cannot access cost centers page

## Tests

### Component tests
- Cost center form validates code and name required
- Employment type form validates code and name required
- 409 duplicate code shows inline error
- Delete dialog shows deactivation recommendation
- Weekly hours displayed with correct formatting

### Integration tests
- Create cost center, verify in list
- Edit cost center name, verify update
- Delete cost center, verify removed
- Create employment type, verify in list
- Edit employment type weekly hours, verify update
- Delete employment type, verify removed

## Test case pack
1) Create cost center
   - Input: Code "DEV-001", name "Development", description "Software development team"
   - Expected: Cost center created, appears in table
2) Duplicate cost center code
   - Input: Create another cost center with code "DEV-001"
   - Expected: 409 error: "Code already exists"
3) Delete cost center with employees
   - Input: Delete cost center that has assigned employees
   - Expected: Error from backend, message shown to user
4) Create employment type
   - Input: Code "PT", name "Part-time", default_weekly_hours 20.0
   - Expected: Employment type created, weekly hours shown as "20.00 hrs/week"
5) Deactivate cost center
   - Input: Edit cost center, toggle active to false
   - Expected: Cost center shown with inactive badge, hidden by default in active filter

## Dependencies
- ZMI-TICKET-001 (Mandant/Tenant — cost centers are tenant-scoped)
- ZMI-TICKET-004 (Personnel Master Data — employment types used in employee records)
