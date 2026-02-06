# Implementation Plan: ZMI-TICKET-054 - Location Management UI

## Overview

Implement a standard CRUD admin page for managing work locations. The backend API is fully implemented. This plan follows the exact pattern established by the cost-centers page, extended with location-specific fields (address, city, country, timezone).

**Reference implementation**: Cost Centers (`apps/web/src/app/[locale]/(dashboard)/admin/cost-centers/page.tsx` and its associated components)

---

## Phase 1: Translation Files

Add all translation keys needed for the locations feature in both English and German.

### File 1: `apps/web/messages/en.json`

**Changes**:

1. Add `"locations": "Locations"` to the `nav` object (after `"costCenters": "Cost Centers"`, around line 70)
2. Add `"locations": "Locations"` to the `breadcrumbs` object (after `"costCenters": "Cost Centers"`, around line 164)
3. Add new `adminLocations` namespace object (after the `adminCostCenters` block, which ends at line 2910). Insert the entire block:

```json
"adminLocations": {
  "title": "Locations",
  "subtitle": "Manage work locations with addresses and timezones",
  "newLocation": "New Location",
  "searchPlaceholder": "Search locations...",
  "clearFilters": "Clear filters",

  "columnCode": "Code",
  "columnName": "Name",
  "columnCity": "City",
  "columnCountry": "Country",
  "columnTimezone": "Timezone",
  "columnStatus": "Status",
  "columnActions": "Actions",

  "statusActive": "Active",
  "statusInactive": "Inactive",

  "viewDetails": "View Details",
  "edit": "Edit",
  "delete": "Delete",

  "editLocation": "Edit Location",
  "createDescription": "Add a new work location.",
  "editDescription": "Modify location details.",
  "locationDetails": "Location Details",
  "viewLocationInfo": "View location information.",

  "sectionBasicInfo": "Basic Information",
  "sectionAddress": "Address",
  "sectionConfiguration": "Configuration",
  "sectionStatus": "Status",

  "fieldCode": "Code",
  "fieldName": "Name",
  "fieldDescription": "Description",
  "fieldAddress": "Address",
  "fieldCity": "City",
  "fieldCountry": "Country",
  "fieldTimezone": "Timezone",
  "fieldActive": "Active",
  "fieldActiveDescription": "Inactive locations are hidden from dropdowns",

  "codePlaceholder": "e.g. HQ",
  "codeHint": "Unique code (uppercase, max 20 chars)",
  "namePlaceholder": "e.g. Headquarters",
  "descriptionPlaceholder": "Optional description...",
  "addressPlaceholder": "e.g. 123 Main Street",
  "cityPlaceholder": "e.g. Berlin",
  "countryPlaceholder": "e.g. Germany",
  "timezonePlaceholder": "Select timezone...",
  "timezoneSearchPlaceholder": "Search timezones...",
  "timezoneNoResults": "No timezone found",

  "validationCodeRequired": "Code is required",
  "validationNameRequired": "Name is required",
  "validationCodeMaxLength": "Code must be at most 20 characters",

  "cancel": "Cancel",
  "close": "Close",
  "saveChanges": "Save Changes",
  "create": "Create",
  "saving": "Saving...",
  "failedCreate": "Failed to create location",
  "failedUpdate": "Failed to update location",

  "deleteLocation": "Delete Location",
  "deleteDescription": "Are you sure you want to delete \"{name}\"? This action cannot be undone. If employees are assigned to this location, consider deactivating instead.",

  "detailsSection": "Details",
  "addressSection": "Address",
  "configurationSection": "Configuration",
  "timestampsSection": "Timestamps",
  "labelCreated": "Created",
  "labelLastUpdated": "Last Updated",

  "emptyTitle": "No locations found",
  "emptyFilterHint": "Try adjusting your search",
  "emptyGetStarted": "No locations configured. Create your first work location.",
  "addLocation": "Add Location",

  "countSingular": "{count} location",
  "countPlural": "{count} locations"
}
```

### File 2: `apps/web/messages/de.json`

**Changes** (same structure as en.json, with German translations):

1. Add `"locations": "Standorte"` to the `nav` object
2. Add `"locations": "Standorte"` to the `breadcrumbs` object
3. Add `adminLocations` namespace:

```json
"adminLocations": {
  "title": "Standorte",
  "subtitle": "Arbeitsorte mit Adressen und Zeitzonen verwalten",
  "newLocation": "Neuer Standort",
  "searchPlaceholder": "Standorte suchen...",
  "clearFilters": "Filter zurücksetzen",

  "columnCode": "Code",
  "columnName": "Name",
  "columnCity": "Stadt",
  "columnCountry": "Land",
  "columnTimezone": "Zeitzone",
  "columnStatus": "Status",
  "columnActions": "Aktionen",

  "statusActive": "Aktiv",
  "statusInactive": "Inaktiv",

  "viewDetails": "Details anzeigen",
  "edit": "Bearbeiten",
  "delete": "Löschen",

  "editLocation": "Standort bearbeiten",
  "createDescription": "Neuen Arbeitsort hinzufügen.",
  "editDescription": "Standortdetails ändern.",
  "locationDetails": "Standortdetails",
  "viewLocationInfo": "Standortinformationen anzeigen.",

  "sectionBasicInfo": "Grundinformationen",
  "sectionAddress": "Adresse",
  "sectionConfiguration": "Konfiguration",
  "sectionStatus": "Status",

  "fieldCode": "Code",
  "fieldName": "Name",
  "fieldDescription": "Beschreibung",
  "fieldAddress": "Adresse",
  "fieldCity": "Stadt",
  "fieldCountry": "Land",
  "fieldTimezone": "Zeitzone",
  "fieldActive": "Aktiv",
  "fieldActiveDescription": "Inaktive Standorte werden in Auswahlfeldern ausgeblendet",

  "codePlaceholder": "z.B. HQ",
  "codeHint": "Eindeutiger Code (Großbuchstaben, max. 20 Zeichen)",
  "namePlaceholder": "z.B. Hauptsitz",
  "descriptionPlaceholder": "Optionale Beschreibung...",
  "addressPlaceholder": "z.B. Hauptstraße 123",
  "cityPlaceholder": "z.B. Berlin",
  "countryPlaceholder": "z.B. Deutschland",
  "timezonePlaceholder": "Zeitzone auswählen...",
  "timezoneSearchPlaceholder": "Zeitzonen suchen...",
  "timezoneNoResults": "Keine Zeitzone gefunden",

  "validationCodeRequired": "Code ist erforderlich",
  "validationNameRequired": "Name ist erforderlich",
  "validationCodeMaxLength": "Code darf maximal 20 Zeichen lang sein",

  "cancel": "Abbrechen",
  "close": "Schließen",
  "saveChanges": "Änderungen speichern",
  "create": "Erstellen",
  "saving": "Speichern...",
  "failedCreate": "Standort konnte nicht erstellt werden",
  "failedUpdate": "Standort konnte nicht aktualisiert werden",

  "deleteLocation": "Standort löschen",
  "deleteDescription": "Möchten Sie \"{name}\" wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden. Falls Mitarbeiter diesem Standort zugeordnet sind, erwägen Sie stattdessen die Deaktivierung.",

  "detailsSection": "Details",
  "addressSection": "Adresse",
  "configurationSection": "Konfiguration",
  "timestampsSection": "Zeitstempel",
  "labelCreated": "Erstellt",
  "labelLastUpdated": "Zuletzt aktualisiert",

  "emptyTitle": "Keine Standorte gefunden",
  "emptyFilterHint": "Versuchen Sie, Ihre Suche anzupassen",
  "emptyGetStarted": "Keine Standorte konfiguriert. Erstellen Sie Ihren ersten Arbeitsort.",
  "addLocation": "Standort hinzufügen",

  "countSingular": "{count} Standort",
  "countPlural": "{count} Standorte"
}
```

### Verification
- The app should compile without translation key errors
- Confirm key counts match between en.json and de.json for the `adminLocations` namespace

---

## Phase 2: API Hooks

### File 3: Create `apps/web/src/hooks/api/use-locations.ts`

**Template**: `apps/web/src/hooks/api/use-cost-centers.ts`

```typescript
import { useApiQuery, useApiMutation } from '@/hooks'

interface UseLocationsOptions {
  enabled?: boolean
}

/**
 * Hook to fetch list of locations.
 */
export function useLocations(options: UseLocationsOptions = {}) {
  const { enabled = true } = options

  return useApiQuery('/locations', {
    enabled,
  })
}

/**
 * Hook to fetch a single location by ID.
 */
export function useLocation(id: string, enabled = true) {
  return useApiQuery('/locations/{id}', {
    path: { id },
    enabled: enabled && !!id,
  })
}

export function useCreateLocation() {
  return useApiMutation('/locations', 'post', {
    invalidateKeys: [['/locations']],
  })
}

export function useUpdateLocation() {
  return useApiMutation('/locations/{id}', 'patch', {
    invalidateKeys: [['/locations']],
  })
}

export function useDeleteLocation() {
  return useApiMutation('/locations/{id}', 'delete', {
    invalidateKeys: [['/locations']],
  })
}
```

### File 4: Modify `apps/web/src/hooks/api/index.ts`

**Change**: Add location hook exports after the Cost Centers section (around line 143):

```typescript
// Locations
export {
  useLocations,
  useLocation,
  useCreateLocation,
  useUpdateLocation,
  useDeleteLocation,
} from './use-locations'
```

### Verification
- TypeScript compiles without errors
- Import `useLocations` from `@/hooks/api` works

---

## Phase 3: Components

### File 5: Create `apps/web/src/components/locations/location-data-table.tsx`

**Template**: `apps/web/src/components/cost-centers/cost-center-data-table.tsx`

**Key differences from cost centers**:
- Use `MapPin` icon instead of `Landmark`
- Columns: Code (w-24), Name (with MapPin icon), City, Country, Timezone, Status (w-24), Actions (w-16)
- Translation namespace: `adminLocations`
- Type: `Location` from `components['schemas']['Location']`

**Structure**:
```tsx
'use client'

import * as React from 'react'
import { MoreHorizontal, Eye, Edit, MapPin, Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import type { components } from '@/lib/api/types'

type Location = components['schemas']['Location']

interface LocationDataTableProps {
  items: Location[]
  isLoading: boolean
  onView: (item: Location) => void
  onEdit: (item: Location) => void
  onDelete: (item: Location) => void
}

export function LocationDataTable({ items, isLoading, onView, onEdit, onDelete }: LocationDataTableProps) {
  const t = useTranslations('adminLocations')

  if (isLoading) return <LocationDataTableSkeleton />
  if (items.length === 0) return null

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-24">{t('columnCode')}</TableHead>
          <TableHead>{t('columnName')}</TableHead>
          <TableHead>{t('columnCity')}</TableHead>
          <TableHead>{t('columnCountry')}</TableHead>
          <TableHead>{t('columnTimezone')}</TableHead>
          <TableHead className="w-24">{t('columnStatus')}</TableHead>
          <TableHead className="w-16">
            <span className="sr-only">{t('columnActions')}</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => (
          <TableRow key={item.id} className="cursor-pointer" onClick={() => onView(item)}>
            <TableCell className="font-mono text-sm">{item.code}</TableCell>
            <TableCell>
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted">
                  <MapPin className="h-4 w-4" />
                </div>
                <span className="font-medium">{item.name}</span>
              </div>
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">{item.city || '-'}</TableCell>
            <TableCell className="text-sm text-muted-foreground">{item.country || '-'}</TableCell>
            <TableCell className="text-sm text-muted-foreground">{item.timezone || '-'}</TableCell>
            <TableCell>
              <Badge variant={item.is_active ? 'default' : 'secondary'}>
                {item.is_active ? t('statusActive') : t('statusInactive')}
              </Badge>
            </TableCell>
            <TableCell onClick={(e) => e.stopPropagation()}>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm">
                    <MoreHorizontal className="h-4 w-4" />
                    <span className="sr-only">{t('columnActions')}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onView(item)}>
                    <Eye className="mr-2 h-4 w-4" />
                    {t('viewDetails')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onEdit(item)}>
                    <Edit className="mr-2 h-4 w-4" />
                    {t('edit')}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onClick={() => onDelete(item)}>
                    <Trash2 className="mr-2 h-4 w-4" />
                    {t('delete')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

// Skeleton with 7 columns matching the table layout
function LocationDataTableSkeleton() {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-24"><Skeleton className="h-4 w-12" /></TableHead>
          <TableHead><Skeleton className="h-4 w-16" /></TableHead>
          <TableHead><Skeleton className="h-4 w-12" /></TableHead>
          <TableHead><Skeleton className="h-4 w-14" /></TableHead>
          <TableHead><Skeleton className="h-4 w-20" /></TableHead>
          <TableHead className="w-24"><Skeleton className="h-4 w-12" /></TableHead>
          <TableHead className="w-16" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: 5 }).map((_, i) => (
          <TableRow key={i}>
            <TableCell><Skeleton className="h-4 w-12" /></TableCell>
            <TableCell>
              <div className="flex items-center gap-3">
                <Skeleton className="h-8 w-8 rounded-md" />
                <Skeleton className="h-4 w-32" />
              </div>
            </TableCell>
            <TableCell><Skeleton className="h-4 w-20" /></TableCell>
            <TableCell><Skeleton className="h-4 w-18" /></TableCell>
            <TableCell><Skeleton className="h-4 w-28" /></TableCell>
            <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
            <TableCell><Skeleton className="h-8 w-8" /></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
```

### File 6: Create `apps/web/src/components/locations/location-form-sheet.tsx`

**Template**: `apps/web/src/components/cost-centers/cost-center-form-sheet.tsx`

**Key differences from cost centers**:
- Additional form fields: address, city, country, timezone
- Code max length is 20 (not 50)
- Timezone field uses a Combobox/searchable select with common IANA timezones
- Three form sections: Basic Information, Address, Configuration (timezone)
- Status section for edit mode (same as cost centers)

**FormState interface**:
```typescript
interface FormState {
  code: string
  name: string
  description: string
  address: string
  city: string
  country: string
  timezone: string
  isActive: boolean
}

const INITIAL_STATE: FormState = {
  code: '',
  name: '',
  description: '',
  address: '',
  city: '',
  country: '',
  timezone: '',
  isActive: true,
}
```

**Timezone selector approach**: Use a standard Combobox pattern with Popover + Command from shadcn/ui. Include a curated list of common IANA timezones grouped by region. The list should include at minimum:
- Europe: Europe/London, Europe/Berlin, Europe/Paris, Europe/Madrid, Europe/Rome, Europe/Amsterdam, Europe/Brussels, Europe/Vienna, Europe/Zurich, Europe/Warsaw, Europe/Prague, Europe/Stockholm, Europe/Helsinki, Europe/Athens, Europe/Istanbul, Europe/Moscow, Europe/Lisbon, Europe/Dublin, Europe/Copenhagen, Europe/Oslo, Europe/Bucharest, Europe/Budapest, Europe/Kiev
- Americas: America/New_York, America/Chicago, America/Denver, America/Los_Angeles, America/Toronto, America/Vancouver, America/Sao_Paulo, America/Mexico_City, America/Buenos_Aires, America/Bogota, America/Lima
- Asia: Asia/Tokyo, Asia/Shanghai, Asia/Hong_Kong, Asia/Singapore, Asia/Seoul, Asia/Mumbai, Asia/Dubai, Asia/Bangkok, Asia/Kolkata, Asia/Jakarta
- Pacific: Pacific/Auckland, Pacific/Sydney, Australia/Sydney, Australia/Melbourne, Pacific/Honolulu
- Africa: Africa/Cairo, Africa/Johannesburg, Africa/Lagos, Africa/Nairobi

Check if `@/components/ui/command` (Command, CommandInput, CommandEmpty, CommandGroup, CommandItem) and `@/components/ui/popover` (Popover, PopoverTrigger, PopoverContent) exist. These are standard shadcn/ui components. If they exist, use them for the timezone selector. If not, fall back to a simple `<Input>` with datalist.

**Implementation note**: Before implementing, check if there is already a Combobox component or similar pattern used elsewhere in the codebase (search for `Command` or `Combobox` in the components directory). Follow existing patterns.

**Form sections in the sheet**:
1. **Basic Information**: Code (uppercase, max 20, disabled in edit), Name (max 255), Description (textarea)
2. **Address**: Address, City, Country (all optional text inputs)
3. **Configuration**: Timezone (searchable select, optional)
4. **Status** (edit only): Active switch

**Submit handler**: Same pattern as cost centers. On create, send all non-empty fields. On update, send changed fields + is_active. Error handling catches `apiError.detail` for 409 conflicts.

**Imports needed beyond cost center pattern**:
```tsx
import { MapPin, Loader2, ChevronsUpDown, Check } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { cn } from '@/lib/utils'
```

### File 7: Create `apps/web/src/components/locations/location-detail-sheet.tsx`

**Template**: `apps/web/src/components/cost-centers/cost-center-detail-sheet.tsx`

**Key differences from cost centers**:
- Use `MapPin` icon instead of `Landmark`
- Additional detail sections for address and timezone
- Timezone displayed with UTC offset info (e.g., "Europe/Berlin (UTC+1)")
- Translation namespace: `adminLocations`

**Detail sections**:
1. **Header**: MapPin icon, name, code (mono), active badge
2. **Description** (if present)
3. **Details**: Code, Name
4. **Address**: Address, City, Country (shown in a section only if at least one field has a value)
5. **Configuration**: Timezone (with UTC offset)
6. **Timestamps**: Created, Last Updated

**UTC offset display**: Use `Intl.DateTimeFormat` to get the current UTC offset for the timezone:
```typescript
const getTimezoneOffset = (tz: string): string => {
  try {
    const now = new Date()
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      timeZoneName: 'shortOffset',
    })
    const parts = formatter.formatToParts(now)
    const offset = parts.find(p => p.type === 'timeZoneName')?.value || ''
    return `${tz} (${offset})`
  } catch {
    return tz
  }
}
```

### File 8: Create `apps/web/src/components/locations/index.ts`

**Template**: `apps/web/src/components/cost-centers/index.ts`

```typescript
export { LocationDataTable } from './location-data-table'
export { LocationFormSheet } from './location-form-sheet'
export { LocationDetailSheet } from './location-detail-sheet'
```

### Verification
- All component files compile without TypeScript errors
- Imports resolve correctly

---

## Phase 4: Page and Navigation

### File 9: Create `apps/web/src/app/[locale]/(dashboard)/admin/locations/page.tsx`

**Template**: `apps/web/src/app/[locale]/(dashboard)/admin/cost-centers/page.tsx` (copy and adapt)

**Key differences from cost centers**:
- Use `MapPin` icon instead of `Landmark`
- Import from `@/components/locations` instead of `@/components/cost-centers`
- Use `useLocations` / `useDeleteLocation` hooks
- Translation namespace: `adminLocations`
- Type: `Location` from `components['schemas']['Location']`
- Search filter includes code, name, and city (not just code and name)
- Empty state icon: `MapPin`

**Search filter logic**:
```typescript
const filteredItems = React.useMemo(() => {
  if (!search.trim()) return locations
  const searchLower = search.toLowerCase()
  return locations.filter(
    (loc) =>
      loc.code.toLowerCase().includes(searchLower) ||
      loc.name.toLowerCase().includes(searchLower) ||
      (loc.city && loc.city.toLowerCase().includes(searchLower))
  )
}, [locations, search])
```

**Full structure** (follows cost centers page exactly):
1. Auth check with `useAuth()` and `useHasRole(['admin'])`
2. State: search, createOpen, editItem, viewItem, deleteItem
3. Data fetching: `useLocations({ enabled: !authLoading && isAdmin })`
4. Delete mutation: `useDeleteLocation()`
5. Auth redirect effect
6. Filtered items memo (search by code, name, city)
7. Handlers: handleView, handleEdit, handleDelete, handleConfirmDelete, handleFormSuccess
8. Render: skeleton -> null if not admin -> main layout
9. EmptyState component (local function, uses MapPin icon)
10. LocationsPageSkeleton component (local function)

### File 10: Modify `apps/web/src/components/layout/sidebar/sidebar-nav-config.ts`

**Change**: Add `MapPin` to the lucide-react imports, then add the locations nav item to the `management` section.

1. Add `MapPin` to the import statement (line 1-32)
2. Add location nav item after `costCenters` (line 146) in the management section:

```typescript
{
  titleKey: 'locations',
  href: '/admin/locations',
  icon: MapPin,
  roles: ['admin'],
},
```

This places it logically after cost centers and before employment types.

### File 11: Modify `apps/web/src/components/layout/breadcrumbs.tsx`

**Change**: Add `locations: 'locations'` to the `segmentToKey` mapping (around line 30, after `'cost-centers': 'costCenters'`):

```typescript
locations: 'locations',
```

### Verification
- Navigate to `/admin/locations` and see the page
- Sidebar shows "Locations" with MapPin icon in the Management section
- Breadcrumbs show "Home > Administration > Locations"
- Empty state displays correctly with MapPin icon and "Add Location" button
- Create form sheet opens and closes
- All form fields render correctly
- Timezone selector is searchable
- CRUD operations work end-to-end

---

## Phase 5: Pre-implementation Checks

Before implementing, verify these files exist (used as imports):

1. `apps/web/src/components/ui/command.tsx` - For Combobox timezone selector
2. `apps/web/src/components/ui/popover.tsx` - For Combobox timezone selector
3. `apps/web/src/components/ui/sheet.tsx` - For form and detail sheets
4. `apps/web/src/components/ui/scroll-area.tsx` - For scrollable sheet content
5. `apps/web/src/components/ui/search-input.tsx` - For the search bar
6. `apps/web/src/components/ui/confirm-dialog.tsx` - For delete confirmation
7. `apps/web/src/lib/utils.ts` - For `cn()` utility

If `command.tsx` or `popover.tsx` do not exist, fall back to a plain text `<Input>` for the timezone field instead of a Combobox.

---

## Decisions and Assumptions

1. **Translation namespace**: Using `adminLocations` (matching the `admin<EntityPascal>` pattern from `adminCostCenters`), NOT `locations` as the ticket suggested.
2. **Sidebar placement**: Locations added after cost centers in the management section. This is a logical grouping since both are organizational entities.
3. **No separate delete dialog component**: The ticket mentions `location-delete-dialog.tsx` but the codebase pattern uses the shared `ConfirmDialog` component. Following the established pattern (no custom delete dialog needed).
4. **No separate skeleton component**: The ticket mentions `location-skeleton.tsx` but the codebase pattern defines skeletons as local functions within the page and data table files. Following the established pattern.
5. **Timezone selector**: Using a Combobox (Popover + Command) with a curated list of IANA timezones. This is searchable and matches the ticket requirement for "searchable select with IANA timezone names."
6. **Search includes city**: The search filter checks code, name, and city fields (ticket says "filter table by code, name, or city").
7. **Code max length**: 20 characters (from the API schema), NOT 50 (which is the cost center code max).

---

## Files Summary

### Files to Create (6)

| # | File | Template |
|---|------|----------|
| 1 | `apps/web/src/hooks/api/use-locations.ts` | `use-cost-centers.ts` |
| 2 | `apps/web/src/components/locations/location-data-table.tsx` | `cost-center-data-table.tsx` |
| 3 | `apps/web/src/components/locations/location-form-sheet.tsx` | `cost-center-form-sheet.tsx` |
| 4 | `apps/web/src/components/locations/location-detail-sheet.tsx` | `cost-center-detail-sheet.tsx` |
| 5 | `apps/web/src/components/locations/index.ts` | `cost-centers/index.ts` |
| 6 | `apps/web/src/app/[locale]/(dashboard)/admin/locations/page.tsx` | `cost-centers/page.tsx` |

### Files to Modify (5)

| # | File | Change |
|---|------|--------|
| 1 | `apps/web/messages/en.json` | Add nav.locations, breadcrumbs.locations, adminLocations namespace |
| 2 | `apps/web/messages/de.json` | Add nav.locations, breadcrumbs.locations, adminLocations namespace |
| 3 | `apps/web/src/hooks/api/index.ts` | Add location hook exports |
| 4 | `apps/web/src/components/layout/sidebar/sidebar-nav-config.ts` | Add MapPin import + locations nav item |
| 5 | `apps/web/src/components/layout/breadcrumbs.tsx` | Add locations to segmentToKey |

---

## Success Criteria

1. Admin users can navigate to `/admin/locations` via the sidebar
2. The page shows a list of locations with code, name, city, country, timezone, and active status
3. Search filters by code, name, or city
4. Creating a location with code, name, and optional fields works
5. Code field converts to uppercase and is disabled in edit mode
6. Duplicate code returns a 409 error displayed inline
7. Timezone field is a searchable dropdown with IANA timezone names
8. Detail sheet shows all fields including timezone with UTC offset
9. Edit and delete operations work correctly
10. Non-admin users are redirected to /dashboard
11. Breadcrumbs display correctly
12. Both English and German translations are complete
13. Loading skeletons display while data is fetching
14. Empty state shows when no locations exist

---

## Implementation Order

Execute phases in order: 1 -> 2 -> 3 -> 4. Within Phase 3, implement in order: data table -> form sheet -> detail sheet -> barrel export. This ensures each component's dependencies exist when it is created.
