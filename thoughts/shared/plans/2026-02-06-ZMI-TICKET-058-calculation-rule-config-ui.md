# Calculation Rule Configuration UI Implementation Plan

## Overview

Implement a standard CRUD admin page for calculation rules used in absence deduction configuration. Calculation rules define how absence time is deducted: a **value** in minutes (0 meaning "use daily target time"), a **factor** (multiplier), and an optional **account** assignment. The UI follows the established patterns from locations, account-groups, and contact-types pages.

Backend is already complete (ZMI-TICKET-013). Account dependency (ZMI-TICKET-009) is also complete.

## Current State Analysis

- Backend CRUD endpoints exist at `/calculation-rules` and `/calculation-rules/{id}` with full handler, service, and repository layers
- TypeScript types are already generated in `apps/web/src/lib/api/types.ts` (schemas: `CalculationRule`, `CreateCalculationRuleRequest`, `UpdateCalculationRuleRequest`, `CalculationRuleList`)
- No frontend components, hooks, page, or translations exist for calculation rules
- The `useAccounts` hook already exists for the account selector dependency

### Key Discoveries:
- OpenAPI paths are defined: `"/calculation-rules"` (GET list, POST create) and `"/calculation-rules/{id}"` (GET, PATCH, DELETE) -- see `apps/web/src/lib/api/types.ts:2924-2960`
- List endpoint supports `active_only` query parameter -- see `apps/web/src/lib/api/types.ts:17648-17671`
- Delete returns 409 when rule is assigned to absence types (handler: `"Calculation rule is still assigned to absence types"`) -- see `apps/api/internal/handler/calculationrule.go`
- Create returns 409 on duplicate code (`"A calculation rule with this code already exists"`)
- Factor defaults to 1.0 on create, must be > 0; Value must be >= 0
- The `Calculator` icon from lucide-react is available and not currently in use in sidebar -- see `apps/web/src/components/layout/sidebar/sidebar-nav-config.ts`
- All existing CRUD pages follow the same structural pattern: page.tsx + data-table + form-sheet + detail-sheet + barrel index -- see `apps/web/src/components/locations/`
- 409 conflict handling pattern established in contact-types page with `deleteTypeError` state -- see `apps/web/src/app/[locale]/(dashboard)/admin/contact-types/page.tsx:81-98`
- Account selector uses `useAccounts()` hook from `apps/web/src/hooks/api/use-accounts.ts`

## Desired End State

A fully functional Calculation Rules admin page at `/admin/calculation-rules` with:
- Data table listing all rules with columns: Code, Name, Value (with "Daily target" display for 0), Factor (with "x" suffix), Account, Status
- Create/edit form sheet with fields: code, name, description, value, factor, account (dropdown from accounts list), active toggle (edit only)
- Detail view sheet showing all rule fields including timestamps
- Delete confirmation with 409 conflict handling (rule in use by absence types)
- Active-only filter toggle (client-side filtering consistent with other pages)
- Search filtering by code/name
- Sidebar navigation entry with Calculator icon in the "management" section
- Full English and German translations

### Verification:
- Navigate to `/admin/calculation-rules` from sidebar
- Create, view, edit, and delete calculation rules
- Value=0 displays "Daily target" text
- Factor displays with "x" suffix (e.g., "1.0x")
- Account selector shows available accounts
- Delete of in-use rule shows 409 error message
- TypeScript compiles without errors

## What We're NOT Doing

- Server-side filtering with `active_only` query parameter (following existing pattern of client-side filtering)
- Inline active toggle in data table (keeping simpler pattern like locations)
- Hours/minutes conversion display for value (showing raw minutes with special 0 handling)
- Any backend changes (backend is complete)
- Tests (frontend test infrastructure not established for admin pages)

## Implementation Approach

Follow the established CRUD page pattern exactly as implemented in locations and account-groups. Create all files in a single phase since the components are tightly coupled and the pattern is well-established. The account selector in the form will use the existing `useAccounts` hook with a Select dropdown.

## Phase 1: API Hooks

### Overview
Create the calculation rules API hooks file and register exports in the barrel index.

### Changes Required:

#### 1. Calculation Rules API Hooks
**File**: `apps/web/src/hooks/api/use-calculation-rules.ts` (new)
**Changes**: Create all five standard CRUD hooks following the pattern from `apps/web/src/hooks/api/use-account-groups.ts`

```typescript
import { useApiQuery, useApiMutation } from '@/hooks'

interface UseCalculationRulesOptions {
  enabled?: boolean
}

/**
 * Hook to fetch calculation rules.
 */
export function useCalculationRules(options: UseCalculationRulesOptions = {}) {
  const { enabled = true } = options

  return useApiQuery('/calculation-rules', {
    enabled,
  })
}

/**
 * Hook to fetch a single calculation rule by ID.
 */
export function useCalculationRule(id: string, enabled = true) {
  return useApiQuery('/calculation-rules/{id}', {
    path: { id },
    enabled: enabled && !!id,
  })
}

// ==================== Mutation Hooks ====================

/**
 * Hook to create a new calculation rule.
 */
export function useCreateCalculationRule() {
  return useApiMutation('/calculation-rules', 'post', {
    invalidateKeys: [['/calculation-rules']],
  })
}

/**
 * Hook to update an existing calculation rule.
 */
export function useUpdateCalculationRule() {
  return useApiMutation('/calculation-rules/{id}', 'patch', {
    invalidateKeys: [['/calculation-rules'], ['/calculation-rules/{id}']],
  })
}

/**
 * Hook to delete a calculation rule.
 */
export function useDeleteCalculationRule() {
  return useApiMutation('/calculation-rules/{id}', 'delete', {
    invalidateKeys: [['/calculation-rules'], ['/calculation-rules/{id}']],
  })
}
```

#### 2. Register in Hook Index
**File**: `apps/web/src/hooks/api/index.ts`
**Changes**: Add calculation rules export block at the end of file, before the closing, following the existing grouping pattern

```typescript
// Calculation Rules
export {
  useCalculationRules,
  useCalculationRule,
  useCreateCalculationRule,
  useUpdateCalculationRule,
  useDeleteCalculationRule,
} from './use-calculation-rules'
```

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compiles: `cd apps/web && npx tsc --noEmit`
- [ ] Hook file exists and follows pattern

#### Manual Verification:
- [ ] Hooks can be imported from `@/hooks/api`

---

## Phase 2: Translations

### Overview
Add English and German translations for navigation entry and all admin page strings.

### Changes Required:

#### 1. English Translations
**File**: `apps/web/messages/en.json`
**Changes**:
- Add `"calculationRules": "Calculation Rules"` to the `nav` section (after `contactTypes`)
- Add new `adminCalculationRules` namespace

Nav entry to add (in `nav` object):
```json
"calculationRules": "Calculation Rules"
```

New namespace to add:
```json
"adminCalculationRules": {
  "title": "Calculation Rules",
  "subtitle": "Manage calculation rules for absence deductions",
  "newRule": "New Rule",
  "searchPlaceholder": "Search by code or name...",
  "clearFilters": "Clear filters",
  "ruleCount": "{count} rule",
  "rulesCount": "{count} rules",
  "deleteRule": "Delete Calculation Rule",
  "deleteDescription": "Are you sure you want to delete \"{name}\" ({code})? This action cannot be undone.",
  "deleteInUse": "This calculation rule is still assigned to absence types and cannot be deleted.",
  "delete": "Delete",
  "failedDelete": "Failed to delete calculation rule",
  "emptyTitle": "No calculation rules found",
  "emptyFilterHint": "Try adjusting your filters",
  "emptyGetStarted": "Get started by creating your first calculation rule",
  "addRule": "Add Rule",
  "actions": "Actions",
  "cancel": "Cancel",
  "close": "Close",
  "codeHint": "Unique code (uppercase, max 50 chars)",
  "codePlaceholder": "e.g. FULL_DAY",
  "columnCode": "Code",
  "columnName": "Name",
  "columnValue": "Value",
  "columnFactor": "Factor",
  "columnAccount": "Account",
  "columnStatus": "Status",
  "create": "Create",
  "createDescription": "Add a new calculation rule for absence deductions.",
  "descriptionPlaceholder": "Optional description...",
  "edit": "Edit",
  "editRule": "Edit Calculation Rule",
  "editDescription": "Modify the selected calculation rule.",
  "viewDetails": "View Details",
  "ruleDetails": "Calculation Rule Details",
  "viewRuleInfo": "View calculation rule information",
  "failedCreate": "Failed to create calculation rule",
  "failedUpdate": "Failed to update calculation rule",
  "fieldActive": "Active",
  "fieldActiveDescription": "Inactive rules are hidden from selections",
  "fieldCode": "Code",
  "fieldDescription": "Description",
  "fieldName": "Name",
  "fieldValue": "Value (minutes)",
  "fieldFactor": "Factor (multiplier)",
  "fieldAccount": "Account",
  "namePlaceholder": "e.g. Full Day Absence",
  "valuePlaceholder": "0",
  "valueHint": "Minutes to deduct. 0 = use daily target time.",
  "factorPlaceholder": "1.0",
  "factorHint": "Multiplier applied to the value (must be > 0)",
  "accountPlaceholder": "Select an account...",
  "accountNone": "None",
  "saveChanges": "Save Changes",
  "saving": "Saving...",
  "sectionBasicInfo": "Basic Information",
  "sectionCalculation": "Calculation Settings",
  "sectionAccount": "Account Assignment",
  "sectionStatus": "Status",
  "detailsSection": "Details",
  "calculationSection": "Calculation",
  "accountSection": "Account",
  "timestampsSection": "Timestamps",
  "statusActive": "Active",
  "statusInactive": "Inactive",
  "valueDailyTarget": "Daily target",
  "valueMinutes": "{value} min",
  "factorDisplay": "{value}x",
  "labelCreated": "Created",
  "labelLastUpdated": "Last Updated",
  "validationCodeRequired": "Code is required",
  "validationCodeMaxLength": "Code must be at most 50 characters",
  "validationNameRequired": "Name is required",
  "validationFactorRequired": "Factor must be greater than 0",
  "validationValueRequired": "Value must be 0 or greater",
  "showActiveOnly": "Active only",
  "showAll": "Show all"
}
```

#### 2. German Translations
**File**: `apps/web/messages/de.json`
**Changes**: Same structure with German text

Nav entry to add (in `nav` object):
```json
"calculationRules": "Berechnungsregeln"
```

New namespace to add:
```json
"adminCalculationRules": {
  "title": "Berechnungsregeln",
  "subtitle": "Berechnungsregeln für Abwesenheitsabzüge verwalten",
  "newRule": "Neue Regel",
  "searchPlaceholder": "Nach Code oder Name suchen...",
  "clearFilters": "Filter zurücksetzen",
  "ruleCount": "{count} Regel",
  "rulesCount": "{count} Regeln",
  "deleteRule": "Berechnungsregel löschen",
  "deleteDescription": "Sind Sie sicher, dass Sie \"{name}\" ({code}) löschen möchten? Diese Aktion kann nicht rückgängig gemacht werden.",
  "deleteInUse": "Diese Berechnungsregel ist noch Abwesenheitsarten zugeordnet und kann nicht gelöscht werden.",
  "delete": "Löschen",
  "failedDelete": "Berechnungsregel konnte nicht gelöscht werden",
  "emptyTitle": "Keine Berechnungsregeln gefunden",
  "emptyFilterHint": "Versuchen Sie, Ihre Filter anzupassen",
  "emptyGetStarted": "Beginnen Sie mit der Erstellung Ihrer ersten Berechnungsregel",
  "addRule": "Regel hinzufügen",
  "actions": "Aktionen",
  "cancel": "Abbrechen",
  "close": "Schließen",
  "codeHint": "Eindeutiger Code (Großbuchstaben, max. 50 Zeichen)",
  "codePlaceholder": "z.B. GANZTAG",
  "columnCode": "Code",
  "columnName": "Name",
  "columnValue": "Wert",
  "columnFactor": "Faktor",
  "columnAccount": "Konto",
  "columnStatus": "Status",
  "create": "Erstellen",
  "createDescription": "Neue Berechnungsregel für Abwesenheitsabzüge hinzufügen.",
  "descriptionPlaceholder": "Optionale Beschreibung...",
  "edit": "Bearbeiten",
  "editRule": "Berechnungsregel bearbeiten",
  "editDescription": "Ausgewählte Berechnungsregel bearbeiten.",
  "viewDetails": "Details anzeigen",
  "ruleDetails": "Berechnungsregel-Details",
  "viewRuleInfo": "Informationen zur Berechnungsregel anzeigen",
  "failedCreate": "Berechnungsregel konnte nicht erstellt werden",
  "failedUpdate": "Berechnungsregel konnte nicht aktualisiert werden",
  "fieldActive": "Aktiv",
  "fieldActiveDescription": "Inaktive Regeln werden in Auswahlen ausgeblendet",
  "fieldCode": "Code",
  "fieldDescription": "Beschreibung",
  "fieldName": "Name",
  "fieldValue": "Wert (Minuten)",
  "fieldFactor": "Faktor (Multiplikator)",
  "fieldAccount": "Konto",
  "namePlaceholder": "z.B. Ganztägige Abwesenheit",
  "valuePlaceholder": "0",
  "valueHint": "Abzuziehende Minuten. 0 = Tagessollzeit verwenden.",
  "factorPlaceholder": "1.0",
  "factorHint": "Multiplikator für den Wert (muss > 0 sein)",
  "accountPlaceholder": "Konto auswählen...",
  "accountNone": "Keins",
  "saveChanges": "Änderungen speichern",
  "saving": "Speichern...",
  "sectionBasicInfo": "Grundinformationen",
  "sectionCalculation": "Berechnungseinstellungen",
  "sectionAccount": "Kontozuordnung",
  "sectionStatus": "Status",
  "detailsSection": "Details",
  "calculationSection": "Berechnung",
  "accountSection": "Konto",
  "timestampsSection": "Zeitstempel",
  "statusActive": "Aktiv",
  "statusInactive": "Inaktiv",
  "valueDailyTarget": "Tagessollzeit",
  "valueMinutes": "{value} Min.",
  "factorDisplay": "{value}x",
  "labelCreated": "Erstellt",
  "labelLastUpdated": "Zuletzt aktualisiert",
  "validationCodeRequired": "Code ist erforderlich",
  "validationCodeMaxLength": "Code darf maximal 50 Zeichen lang sein",
  "validationNameRequired": "Name ist erforderlich",
  "validationFactorRequired": "Faktor muss größer als 0 sein",
  "validationValueRequired": "Wert muss 0 oder größer sein",
  "showActiveOnly": "Nur aktive",
  "showAll": "Alle anzeigen"
}
```

### Success Criteria:

#### Automated Verification:
- [ ] JSON files are valid: `cd apps/web && node -e "require('./messages/en.json'); require('./messages/de.json'); console.log('OK')"`
- [ ] Both language files have matching keys in the new namespace

#### Manual Verification:
- [ ] Translation keys cover all UI strings needed

---

## Phase 3: Data Table Component

### Overview
Create the data table component for listing calculation rules with columns for code, name, value (with daily target display), factor (with x suffix), account name, and status.

### Changes Required:

#### 1. Data Table Component
**File**: `apps/web/src/components/calculation-rules/calculation-rule-data-table.tsx` (new)
**Changes**: Create data table following `apps/web/src/components/locations/location-data-table.tsx` pattern

Key behaviors:
- Props: `rules: CalculationRule[]`, `isLoading: boolean`, `onView`, `onEdit`, `onDelete` callbacks
- Type alias: `type CalculationRule = components['schemas']['CalculationRule']`
- Translation namespace: `useTranslations('adminCalculationRules')`
- Loading state renders skeleton table
- Empty returns `null` (parent handles empty state)
- Row click triggers `onView`
- Columns: Code (mono font), Name, Value, Factor, Account, Status, Actions
- **Value column**: if `value === 0` display `t('valueDailyTarget')` with muted text; otherwise display `t('valueMinutes', { value })`
- **Factor column**: display `{factor}x` formatted (e.g. "1.0x", "0.5x")
- **Account column**: Display `-` (account name resolution deferred to detail/form; list only shows account_id presence indicator or dash)
- **Status column**: Badge with default/secondary variant
- Actions dropdown: View, Edit, separator, Delete (destructive)
- Actions cell uses `onClick={(e) => e.stopPropagation()}` to prevent row click

Skeleton table with 6 columns matching the layout.

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compiles: `cd apps/web && npx tsc --noEmit`
- [ ] File follows existing data table patterns

#### Manual Verification:
- [ ] Value=0 shows "Daily target" text
- [ ] Factor shows with "x" suffix
- [ ] Row click opens detail view
- [ ] Dropdown actions work correctly

---

## Phase 4: Form Sheet Component

### Overview
Create the create/edit form sheet with code, name, description, value, factor, account selector, and active toggle.

### Changes Required:

#### 1. Form Sheet Component
**File**: `apps/web/src/components/calculation-rules/calculation-rule-form-sheet.tsx` (new)
**Changes**: Create form sheet following `apps/web/src/components/account-groups/account-group-form-sheet.tsx` pattern

Key behaviors:
- Props: `open`, `onOpenChange`, `rule?: CalculationRule | null`, `onSuccess?`
- `isEdit = !!rule` determines create vs edit mode
- FormState interface:
  ```typescript
  interface FormState {
    code: string
    name: string
    description: string
    value: number
    factor: number
    accountId: string   // empty string = no account
    isActive: boolean
  }
  ```
- INITIAL_STATE: `{ code: '', name: '', description: '', value: 0, factor: 1.0, accountId: '', isActive: true }`
- `useEffect` on `[open, rule]` to populate form from rule or reset to initial
- Uses `useCreateCalculationRule()` and `useUpdateCalculationRule()` mutations
- Uses `useAccounts({ active: true })` for account dropdown (only fetch when form is open)
- Validation:
  - Code required, max 50 chars
  - Name required
  - Factor must be > 0
  - Value must be >= 0 (integer)
- Sections:
  1. **Basic Information**: code (uppercase, disabled on edit), name, description
  2. **Calculation Settings**: value (number input, min=0), factor (number input, step=0.1, min=0.01)
  3. **Account Assignment**: Select dropdown with "None" option + active accounts list
  4. **Status** (edit only): Active toggle switch
- Submit:
  - Create: `{ code, name, description?, value, factor, account_id? }`
  - Update: `{ name, description?, value, factor, account_id (null to clear), is_active }`
  - On update, send `account_id: null` when accountId is empty string (to clear); send `account_id: <uuid>` when set
- Error handling: same pattern as account-groups with `apiError.detail ?? apiError.message`
- Account selector: Use `Select` component from `@/components/ui/select` with SelectTrigger/SelectContent/SelectItem pattern

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compiles: `cd apps/web && npx tsc --noEmit`
- [ ] File follows existing form sheet patterns

#### Manual Verification:
- [ ] Create mode shows empty form with defaults (value=0, factor=1.0)
- [ ] Edit mode populates all fields from existing rule
- [ ] Code field is disabled in edit mode
- [ ] Account dropdown shows active accounts
- [ ] Validation errors display correctly
- [ ] Submit creates/updates rule successfully
- [ ] Duplicate code on create shows 409 error message

---

## Phase 5: Detail Sheet Component

### Overview
Create the detail view sheet for viewing a single calculation rule's full details.

### Changes Required:

#### 1. Detail Sheet Component
**File**: `apps/web/src/components/calculation-rules/calculation-rule-detail-sheet.tsx` (new)
**Changes**: Create detail sheet following `apps/web/src/components/locations/location-detail-sheet.tsx` pattern

Key behaviors:
- Props: `ruleId: string | null`, `open`, `onOpenChange`, `onEdit`, `onDelete`
- Fetches single rule: `useCalculationRule(ruleId || '', open && !!ruleId)`
- Also fetch account details if `account_id` is set: use `useAccount(rule.account_id || '', open && !!rule?.account_id)` to show account name
- DetailRow helper component (label + value flex row)
- Loading skeleton when fetching
- Sections:
  1. **Header**: Calculator icon + name + code + status badge
  2. **Description** (if present)
  3. **Details**: Code, Name rows
  4. **Calculation**: Value (with daily target display for 0, or `{value} min`), Factor (`{factor}x`)
  5. **Account**: Account name if linked, or "None"
  6. **Timestamps**: Created, Last Updated (formatted as `dd.MM.yyyy HH:mm`)
- Footer: Close + Edit + Delete buttons

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compiles: `cd apps/web && npx tsc --noEmit`

#### Manual Verification:
- [ ] Detail sheet shows all rule fields
- [ ] Value=0 shows "Daily target" text
- [ ] Factor shows with "x" suffix
- [ ] Account name is resolved and shown
- [ ] Edit/Delete buttons work correctly

---

## Phase 6: Barrel Exports

### Overview
Create the component barrel file for clean imports.

### Changes Required:

#### 1. Barrel Export File
**File**: `apps/web/src/components/calculation-rules/index.ts` (new)
**Changes**: Export all three components following `apps/web/src/components/locations/index.ts` pattern

```typescript
export { CalculationRuleDataTable } from './calculation-rule-data-table'
export { CalculationRuleFormSheet } from './calculation-rule-form-sheet'
export { CalculationRuleDetailSheet } from './calculation-rule-detail-sheet'
```

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compiles: `cd apps/web && npx tsc --noEmit`

---

## Phase 7: Page Component

### Overview
Create the main page component at the admin route with search, active filter, data table, form sheet, detail sheet, and delete dialog with 409 handling.

### Changes Required:

#### 1. Page Component
**File**: `apps/web/src/app/[locale]/(dashboard)/admin/calculation-rules/page.tsx` (new)
**Changes**: Create page following `apps/web/src/app/[locale]/(dashboard)/admin/locations/page.tsx` pattern with 409 handling from `apps/web/src/app/[locale]/(dashboard)/admin/contact-types/page.tsx`

Key behaviors:
- Type alias: `type CalculationRule = components['schemas']['CalculationRule']`
- State: `search`, `createOpen`, `editItem`, `viewItem`, `deleteItem`, `deleteError` (for 409)
- Auth guard: redirect to `/dashboard` if not admin
- Data fetching: `useCalculationRules({ enabled: !authLoading && isAdmin })`
- Delete mutation: `useDeleteCalculationRule()`
- Client-side filtering:
  - Search: filter by code or name (case-insensitive)
  - Active filter: optional `Switch` or checkbox to show active-only (default: show all, client-side filter)
- Item count display with singular/plural
- **409 Conflict handling** (from contact-types pattern):
  ```typescript
  const [deleteError, setDeleteError] = React.useState<string | null>(null)

  const handleConfirmDelete = async () => {
    if (!deleteItem) return
    setDeleteError(null)
    try {
      await deleteMutation.mutateAsync({ path: { id: deleteItem.id } })
      setDeleteItem(null)
    } catch (err) {
      const apiError = err as { status?: number; detail?: string; message?: string }
      if (apiError.status === 409) {
        setDeleteError(t('deleteInUse'))
      } else {
        setDeleteError(apiError.detail ?? apiError.message ?? t('failedDelete'))
      }
    }
  }
  ```
- ConfirmDialog description conditionally shows error or normal confirmation text
- Clear deleteError when dialog closes
- Layout:
  1. Header: title + subtitle + "New Rule" button
  2. Filters bar: SearchInput + active-only Switch + clear filters button
  3. Item count
  4. Card with DataTable or EmptyState
  5. FormSheet (create/edit)
  6. DetailSheet (view)
  7. ConfirmDialog (delete with 409 handling)
- Icon for empty state: `Calculator` from lucide-react
- EmptyState component: icon, title, hint text, optional create button
- PageSkeleton component: header + filters + content skeleton

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compiles: `cd apps/web && npx tsc --noEmit`
- [ ] Page file exists at correct route path

#### Manual Verification:
- [ ] Page loads and shows calculation rules
- [ ] Search filters by code and name
- [ ] Active-only filter works
- [ ] Create new rule works
- [ ] Edit existing rule works
- [ ] View detail sheet works
- [ ] Delete rule works
- [ ] Delete of in-use rule shows 409 error in dialog
- [ ] Empty state shows correctly when no rules exist
- [ ] Loading skeleton shows during data fetch

---

## Phase 8: Sidebar Navigation

### Overview
Add calculation rules entry to the sidebar navigation in the management section.

### Changes Required:

#### 1. Sidebar Nav Config
**File**: `apps/web/src/components/layout/sidebar/sidebar-nav-config.ts`
**Changes**:
- Add `Calculator` to lucide-react imports (line 1-34)
- Add nav item in the "management" section, after the `contactTypes` entry (around line 208):

```typescript
{
  titleKey: 'calculationRules',
  href: '/admin/calculation-rules',
  icon: Calculator,
  roles: ['admin'],
},
```

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compiles: `cd apps/web && npx tsc --noEmit`

#### Manual Verification:
- [ ] "Calculation Rules" appears in sidebar under Management section
- [ ] Clicking navigates to `/admin/calculation-rules`
- [ ] Calculator icon displays correctly
- [ ] Only visible to admin users

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that all functionality works correctly.

---

## Testing Strategy

### Unit Tests:
- Not applicable (frontend test infrastructure not established for admin CRUD pages)

### Manual Testing Steps:
1. Navigate to admin sidebar -- verify "Calculation Rules" appears with Calculator icon
2. Click to navigate to the page -- verify page loads with title and empty state (if no rules)
3. Create a new rule with value=0, factor=1.0, no account -- verify "Daily target" display in table
4. Create a rule with value=480, factor=0.5, linked account -- verify "480 min" and "0.5x" display
5. Attempt to create duplicate code -- verify 409 error message in form
6. Click a row -- verify detail sheet opens with all fields
7. Edit a rule -- verify form populates, code is disabled, submit updates
8. Clear account on edit (set to None) -- verify account_id is nulled
9. Delete a rule not in use -- verify successful deletion
10. Delete a rule assigned to absence types -- verify 409 error message in confirm dialog
11. Test search filter -- verify filtering by code and name
12. Test active-only filter -- verify inactive rules are hidden when toggled
13. Switch locale to German -- verify all text is translated

## Performance Considerations

- Client-side filtering is acceptable since calculation rules are a small dataset (typically < 50 rules)
- Account list for selector is fetched only when form sheet opens (controlled via enabled flag)
- Single rule fetch in detail sheet uses React Query caching

## References

- Research document: `thoughts/shared/research/2026-02-06-ZMI-TICKET-058-calculation-rule-config-ui.md`
- Backend ticket: ZMI-TICKET-013 (calculation rules CRUD backend)
- Account dependency: ZMI-TICKET-009
- Location page pattern: `apps/web/src/app/[locale]/(dashboard)/admin/locations/page.tsx`
- Account groups form pattern: `apps/web/src/components/account-groups/account-group-form-sheet.tsx`
- Location detail sheet pattern: `apps/web/src/components/locations/location-detail-sheet.tsx`
- 409 handling pattern: `apps/web/src/app/[locale]/(dashboard)/admin/contact-types/page.tsx:81-98`
- Sidebar config: `apps/web/src/components/layout/sidebar/sidebar-nav-config.ts`
- API hooks pattern: `apps/web/src/hooks/api/use-account-groups.ts`
- Generated types: `apps/web/src/lib/api/types.ts:2924-2960` (paths), `17648-17671` (operations)
