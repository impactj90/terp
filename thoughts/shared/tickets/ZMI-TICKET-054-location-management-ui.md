# ZMI-TICKET-054: Location Management UI

Status: Proposed
Priority: P2
Owner: TBD
Backend tickets: ZMI-TICKET-001

## Goal
Provide a standard CRUD admin page for managing work locations with code, name, address, timezone, and active status.

## Scope
- In scope: Location list, create/edit form, detail view, delete with confirmation, timezone selector.
- Out of scope: Map integration, geofencing, terminal assignment to locations.

## Requirements

### Pages & routes
- **New page**: `apps/web/src/app/[locale]/(dashboard)/admin/locations/page.tsx`
  - Route: `/admin/locations`

### Components
- `apps/web/src/components/locations/location-data-table.tsx`
  - Columns: Code, Name, City, Country, Timezone, Active (badge), Actions
  - Row click opens detail sheet
  - Actions dropdown: Edit, Delete
  - Sortable by code and name
- `apps/web/src/components/locations/location-form-sheet.tsx`
  - Sheet form for create/edit
  - Fields:
    - Code (text input, required, max 20, unique)
    - Name (text input, required, max 255)
    - Description (textarea, optional)
    - Address (text input, optional)
    - City (text input, optional)
    - Country (text input, optional)
    - Timezone (searchable select with common timezones, e.g., "Europe/Berlin", optional)
    - Active (switch, default true, edit only)
  - On 409 "Code already exists": show inline error
  - Uses POST `/locations` for create, PATCH `/locations/{id}` for edit
- `apps/web/src/components/locations/location-detail-sheet.tsx`
  - Shows: code, name, description, full address, timezone, active status, timestamps
  - Timezone displayed with current UTC offset (e.g., "Europe/Berlin (UTC+1)")
  - Actions: Edit, Delete
- `apps/web/src/components/locations/location-delete-dialog.tsx`
  - Confirmation: "Delete location '{name}' ({code})?"
- `apps/web/src/components/locations/location-skeleton.tsx`

### API hooks
- `apps/web/src/hooks/api/use-locations.ts`
  - `useLocations(params?)` — GET `/locations` with query param: `active`
  - `useLocation(id)` — GET `/locations/{id}`
  - `useCreateLocation()` — POST `/locations`, body: `{ name, code, description?, address?, city?, country?, timezone? }`, invalidates `[['/locations']]`
  - `useUpdateLocation()` — PATCH `/locations/{id}`, body: partial fields, invalidates `[['/locations']]`
  - `useDeleteLocation()` — DELETE `/locations/{id}`, invalidates `[['/locations']]`

### UI behavior
- Standard CRUD pattern following holidays page
- Active filter toggle
- Timezone selector: searchable dropdown with IANA timezone names grouped by region
- Code uniqueness: 409 on create shows inline error
- Search: filter table by code, name, or city
- Empty state: "No locations configured. Create your first work location."

### Navigation & translations
- Sidebar entry in "Management" section: `{ titleKey: 'nav.locations', href: '/admin/locations', icon: MapPin, roles: ['admin'] }`
- Breadcrumb segment: `'locations': 'locations'` in segmentToKey mapping
- Translation namespace: `locations`
  - Key groups: `page.*`, `table.*`, `form.*`, `detail.*`, `delete.*`, `empty.*`

## Acceptance criteria
- Admin can list, create, edit, and delete locations
- Code uniqueness enforced with clear error
- Timezone selection from standard IANA list
- Active filter works correctly
- Non-admin users cannot access the page

## Tests

### Component tests
- Form validates code and name required
- Timezone selector is searchable
- 409 duplicate code shows inline error
- Detail sheet shows timezone with UTC offset

### Integration tests
- Create location, verify in list
- Edit location address, verify update
- Delete location, verify removed
- Filter by active status

## Test case pack
1) Create location
   - Input: Code "HQ", name "Headquarters", city "Berlin", timezone "Europe/Berlin"
   - Expected: Location created, timezone shown with UTC offset
2) Duplicate code
   - Input: Create location with existing code "HQ"
   - Expected: 409 error inline
3) Edit location
   - Input: Change address and city
   - Expected: Updated in list and detail
4) Delete location
   - Input: Delete location, confirm
   - Expected: Location removed from list

## Dependencies
- ZMI-TICKET-001 (Mandant — locations are tenant-scoped)
