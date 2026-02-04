# ZMI-TICKET-056: Contact Type & Kind Configuration UI

Status: Proposed
Priority: P3
Owner: TBD
Backend tickets: ZMI-TICKET-025

## Goal
Provide a two-panel configuration page for managing contact types and their associated contact kinds, with data validation format configuration.

## Scope
- In scope: Contact types CRUD, contact kinds CRUD, two-panel layout (types → kinds), data type configuration.
- Out of scope: Employee contact management (done in employee detail), contact validation execution.

## Requirements

### Pages & routes
- **New page**: `apps/web/src/app/[locale]/(dashboard)/admin/contact-types/page.tsx`
  - Route: `/admin/contact-types`
  - Two-panel layout: left panel for types, right panel for kinds of selected type

### Components
- `apps/web/src/components/contact-types/contact-type-list-panel.tsx`
  - Left panel: list of contact types
  - Each item shows: code, name, data_type badge (text/email/phone/url), active badge
  - Click selects type and loads its kinds in right panel
  - "Add Type" button at top
  - Actions on each item: Edit, Delete
- `apps/web/src/components/contact-types/contact-type-form-dialog.tsx`
  - Dialog for create/edit contact type
  - Fields:
    - Code (text, required, unique)
    - Name (text, required)
    - Data Type (select: text | email | phone | url)
    - Sort Order (number, optional)
    - Active (switch, default true)
  - On 409: "Code already exists"
- `apps/web/src/components/contact-types/contact-kind-list-panel.tsx`
  - Right panel: list of contact kinds for selected type
  - Each item shows: code, name, sort_order, active badge
  - "Add Kind" button at top (disabled if no type selected)
  - Actions: Edit, Delete
- `apps/web/src/components/contact-types/contact-kind-form-dialog.tsx`
  - Dialog for create/edit contact kind
  - Fields:
    - Contact Type (pre-filled and locked to selected type)
    - Code (text, required, unique)
    - Name (text, required)
    - Sort Order (number, optional)
    - Active (switch, default true)
- `apps/web/src/components/contact-types/contact-type-skeleton.tsx`

### API hooks
- `apps/web/src/hooks/api/use-contact-types.ts`
  - `useContactTypes(params?)` — GET `/contact-types` with query params: `active`, `data_type`
  - `useContactType(id)` — GET `/contact-types/{id}`
  - `useCreateContactType()` — POST `/contact-types`, invalidates `[['/contact-types']]`
  - `useUpdateContactType()` — PATCH `/contact-types/{id}`, invalidates `[['/contact-types']]`
  - `useDeleteContactType()` — DELETE `/contact-types/{id}`, invalidates `[['/contact-types']]`
  - `useContactKinds(params?)` — GET `/contact-kinds` with query param: `contact_type_id`
  - `useCreateContactKind()` — POST `/contact-kinds`, invalidates `[['/contact-kinds']]`
  - `useUpdateContactKind()` — PATCH `/contact-kinds/{id}`, invalidates `[['/contact-kinds']]`
  - `useDeleteContactKind()` — DELETE `/contact-kinds/{id}`, invalidates `[['/contact-kinds']]`

### UI behavior
- Two-panel master-detail layout: selecting a type in the left panel loads its kinds in the right panel
- Data type badges: text=default, email=blue, phone=green, url=purple
- No type selected: right panel shows "Select a contact type to view its kinds"
- Active filter toggle applies to both panels
- Delete type: warn if kinds exist ("This type has X kinds that will also be affected")

### Navigation & translations
- Sidebar entry in "Management" section: `{ titleKey: 'nav.contact-types', href: '/admin/contact-types', icon: Contact, roles: ['admin'] }`
- Breadcrumb segment: `'contact-types': 'contact-types'`
- Translation namespace: `contact-types`
  - Key groups: `page.*`, `types.*`, `kinds.*`, `form.*`, `delete.*`, `empty.*`

## Acceptance criteria
- Admin can CRUD contact types with data type configuration
- Admin can CRUD contact kinds linked to a selected type
- Two-panel layout shows types on left and kinds on right
- Data type badges display correctly
- Code uniqueness enforced on both types and kinds

## Tests

### Component tests
- Type list panel renders with data type badges
- Selecting type loads kinds in right panel
- Type form validates code uniqueness
- Kind form pre-fills and locks contact_type_id

### Integration tests
- Create type, select it, create kind under it
- Edit type data_type, verify badge updates
- Delete type with kinds, verify warning

## Test case pack
1) Create contact type
   - Input: Code "EMAIL", name "Email Address", data_type "email"
   - Expected: Type created with email badge
2) Create contact kind
   - Input: Select "Email Address" type, add kind "Work Email"
   - Expected: Kind created under selected type
3) Delete type with kinds
   - Input: Delete type that has kinds
   - Expected: Warning shown about affected kinds

## Dependencies
- ZMI-TICKET-025 (Contact Management backend)
