# Implementation Plan: ZMI-TICKET-059 - Vacation Configuration UI

**Ticket**: ZMI-TICKET-059
**Date**: 2026-02-06
**Research**: thoughts/shared/research/2026-02-06-ZMI-TICKET-059-vacation-config-ui.md
**Reference**: thoughts/shared/reference/zmi-calculation-manual-reference.md (Sections 19-20)

## Overview

Build a 6-tab admin configuration page at `/admin/vacation-config` for managing vacation calculation settings: special calculations, calculation groups, capping rules, capping rule groups, employee capping exceptions, and entitlement/carryover previews.

## Architecture Decision

Each tab will be a self-contained component that manages its own CRUD state (data table, form sheet, delete dialog, filters). The page file orchestrates tabs and the header "New" button. This follows the existing tabbed page pattern (booking-types, accounts, absence-types) but scaled to 6 tabs.

Since VacationSpecialCalculation lacks `code`/`name` fields (uses `type`, `threshold`, `bonus_days` instead), its table and form differ from the standard code/name pattern. All other entities follow the standard code/name CRUD pattern.

## API Endpoints (Already Available in Generated Types)

| Entity | List | Create | Update | Delete |
|--------|------|--------|--------|--------|
| Special Calculations | `GET /vacation-special-calculations` | `POST /vacation-special-calculations` | `PATCH /vacation-special-calculations/{id}` | `DELETE /vacation-special-calculations/{id}` |
| Calculation Groups | `GET /vacation-calculation-groups` | `POST /vacation-calculation-groups` | `PATCH /vacation-calculation-groups/{id}` | `DELETE /vacation-calculation-groups/{id}` |
| Capping Rules | `GET /vacation-capping-rules` | `POST /vacation-capping-rules` | `PATCH /vacation-capping-rules/{id}` | `DELETE /vacation-capping-rules/{id}` |
| Capping Rule Groups | `GET /vacation-capping-rule-groups` | `POST /vacation-capping-rule-groups` | `PATCH /vacation-capping-rule-groups/{id}` | `DELETE /vacation-capping-rule-groups/{id}` |
| Employee Exceptions | `GET /employee-capping-exceptions` | `POST /employee-capping-exceptions` | `PATCH /employee-capping-exceptions/{id}` | `DELETE /employee-capping-exceptions/{id}` |
| Entitlement Preview | - | `POST /vacation-entitlement/preview` | - | - |
| Carryover Preview | - | `POST /vacation-carryover/preview` | - | - |

## Type Definitions (from `apps/web/src/lib/api/types.ts`)

Key schema types to import:
- `VacationSpecialCalculation` - type: age/tenure/disability, threshold, bonus_days, is_active
- `VacationCalculationGroup` - code, name, basis: calendar_year/entry_date, special_calculations[], is_active
- `VacationCappingRule` - code, name, rule_type: year_end/mid_year, cutoff_month, cutoff_day, cap_value, is_active
- `VacationCappingRuleGroup` - code, name, capping_rules[], is_active
- `EmployeeCappingException` - employee_id, capping_rule_id, exemption_type: full/partial, retain_days, year, notes, is_active
- `VacationEntitlementPreview` - detailed breakdown with base, pro_rated, bonuses, total
- `VacationCarryoverPreview` - available_days, capped_carryover, forfeited_days, rules_applied[]
- `CappingRuleApplication` - rule_id, rule_name, rule_type, cap_value, applied, exception_active

---

## Phase 1: API Hooks & Navigation Setup

**Goal**: Create all API hooks, add navigation entry, add breadcrumb mapping, add translation scaffolding.

### Step 1.1: Create API hooks file

**File**: `apps/web/src/hooks/api/use-vacation-config.ts`

Create a single hooks file with all vacation config hooks (following the pattern from `use-booking-type-groups.ts`):

```typescript
// Special Calculations
useVacationSpecialCalculations(options?) -> useApiQuery('/vacation-special-calculations', ...)
useVacationSpecialCalculation(id, enabled?) -> useApiQuery('/vacation-special-calculations/{id}', ...)
useCreateVacationSpecialCalculation() -> useApiMutation('/vacation-special-calculations', 'post', { invalidateKeys: [['/vacation-special-calculations']] })
useUpdateVacationSpecialCalculation() -> useApiMutation('/vacation-special-calculations/{id}', 'patch', { invalidateKeys: [['/vacation-special-calculations'], ['/vacation-special-calculations/{id}']] })
useDeleteVacationSpecialCalculation() -> useApiMutation('/vacation-special-calculations/{id}', 'delete', { invalidateKeys: [['/vacation-special-calculations'], ['/vacation-special-calculations/{id}']] })

// Calculation Groups
useVacationCalculationGroups(options?) -> useApiQuery('/vacation-calculation-groups', ...)
useVacationCalculationGroup(id, enabled?) -> useApiQuery('/vacation-calculation-groups/{id}', ...)
useCreateVacationCalculationGroup() -> useApiMutation('/vacation-calculation-groups', 'post', { invalidateKeys: [['/vacation-calculation-groups']] })
useUpdateVacationCalculationGroup() -> useApiMutation('/vacation-calculation-groups/{id}', 'patch', { invalidateKeys: [['/vacation-calculation-groups'], ['/vacation-calculation-groups/{id}']] })
useDeleteVacationCalculationGroup() -> useApiMutation('/vacation-calculation-groups/{id}', 'delete', { invalidateKeys: [['/vacation-calculation-groups'], ['/vacation-calculation-groups/{id}']] })

// Capping Rules
useVacationCappingRules(options?) -> useApiQuery('/vacation-capping-rules', ...)
useVacationCappingRule(id, enabled?) -> useApiQuery('/vacation-capping-rules/{id}', ...)
useCreateVacationCappingRule() -> useApiMutation('/vacation-capping-rules', 'post', { invalidateKeys: [['/vacation-capping-rules']] })
useUpdateVacationCappingRule() -> useApiMutation('/vacation-capping-rules/{id}', 'patch', { invalidateKeys: [['/vacation-capping-rules'], ['/vacation-capping-rules/{id}']] })
useDeleteVacationCappingRule() -> useApiMutation('/vacation-capping-rules/{id}', 'delete', { invalidateKeys: [['/vacation-capping-rules'], ['/vacation-capping-rules/{id}']] })

// Capping Rule Groups
useVacationCappingRuleGroups(options?) -> useApiQuery('/vacation-capping-rule-groups', ...)
useVacationCappingRuleGroup(id, enabled?) -> useApiQuery('/vacation-capping-rule-groups/{id}', ...)
useCreateVacationCappingRuleGroup() -> useApiMutation('/vacation-capping-rule-groups', 'post', { invalidateKeys: [['/vacation-capping-rule-groups']] })
useUpdateVacationCappingRuleGroup() -> useApiMutation('/vacation-capping-rule-groups/{id}', 'patch', { invalidateKeys: [['/vacation-capping-rule-groups'], ['/vacation-capping-rule-groups/{id}']] })
useDeleteVacationCappingRuleGroup() -> useApiMutation('/vacation-capping-rule-groups/{id}', 'delete', { invalidateKeys: [['/vacation-capping-rule-groups'], ['/vacation-capping-rule-groups/{id}']] })

// Employee Capping Exceptions
useEmployeeCappingExceptions(options?) -> useApiQuery('/employee-capping-exceptions', ...)
useEmployeeCappingException(id, enabled?) -> useApiQuery('/employee-capping-exceptions/{id}', ...)
useCreateEmployeeCappingException() -> useApiMutation('/employee-capping-exceptions', 'post', { invalidateKeys: [['/employee-capping-exceptions']] })
useUpdateEmployeeCappingException() -> useApiMutation('/employee-capping-exceptions/{id}', 'patch', { invalidateKeys: [['/employee-capping-exceptions'], ['/employee-capping-exceptions/{id}']] })
useDeleteEmployeeCappingException() -> useApiMutation('/employee-capping-exceptions/{id}', 'delete', { invalidateKeys: [['/employee-capping-exceptions'], ['/employee-capping-exceptions/{id}']] })

// Previews (POST mutations, not queries)
useVacationEntitlementPreview() -> useApiMutation('/vacation-entitlement/preview', 'post', { invalidateKeys: [] })
useVacationCarryoverPreview() -> useApiMutation('/vacation-carryover/preview', 'post', { invalidateKeys: [] })
```

### Step 1.2: Register hooks in barrel export

**File**: `apps/web/src/hooks/api/index.ts`

Add a new section at the end:

```typescript
// Vacation Config
export {
  useVacationSpecialCalculations,
  useVacationSpecialCalculation,
  useCreateVacationSpecialCalculation,
  useUpdateVacationSpecialCalculation,
  useDeleteVacationSpecialCalculation,
  useVacationCalculationGroups,
  useVacationCalculationGroup,
  useCreateVacationCalculationGroup,
  useUpdateVacationCalculationGroup,
  useDeleteVacationCalculationGroup,
  useVacationCappingRules,
  useVacationCappingRule,
  useCreateVacationCappingRule,
  useUpdateVacationCappingRule,
  useDeleteVacationCappingRule,
  useVacationCappingRuleGroups,
  useVacationCappingRuleGroup,
  useCreateVacationCappingRuleGroup,
  useUpdateVacationCappingRuleGroup,
  useDeleteVacationCappingRuleGroup,
  useEmployeeCappingExceptions,
  useEmployeeCappingException,
  useCreateEmployeeCappingException,
  useUpdateEmployeeCappingException,
  useDeleteEmployeeCappingException,
  useVacationEntitlementPreview,
  useVacationCarryoverPreview,
} from './use-vacation-config'
```

### Step 1.3: Add sidebar navigation entry

**File**: `apps/web/src/components/layout/sidebar/sidebar-nav-config.ts`

- Add `Umbrella` to the lucide-react import
- Add entry in the `management` section, after `vacationBalances`:
  ```typescript
  {
    titleKey: 'vacationConfig',
    href: '/admin/vacation-config',
    icon: Umbrella,
    roles: ['admin'],
  },
  ```

### Step 1.4: Add breadcrumb mapping

**File**: `apps/web/src/components/layout/breadcrumbs.tsx`

Add to `segmentToKey`:
```typescript
'vacation-config': 'vacationConfig',
```

### Step 1.5: Add translations

**Files**: `apps/web/messages/en.json`, `apps/web/messages/de.json`

Add to the `nav` namespace:
```json
"vacationConfig": "Vacation Config"
```

Add to the `breadcrumbs` namespace:
```json
"vacationConfig": "Vacation Config"
```

Add the `adminVacationConfig` namespace with key groups for the page, all 6 tabs, and each entity's CRUD strings. The full translation structure is:

```json
"adminVacationConfig": {
  "title": "Vacation Configuration",
  "subtitle": "Manage vacation calculation settings, capping rules, and preview entitlements",
  "tabSpecialCalculations": "Special Calculations",
  "tabCalculationGroups": "Calculation Groups",
  "tabCappingRules": "Capping Rules",
  "tabCappingRuleGroups": "Capping Rule Groups",
  "tabExceptions": "Employee Exceptions",
  "tabPreviews": "Previews",

  "specialCalc.new": "New Special Calculation",
  "specialCalc.edit": "Edit Special Calculation",
  "specialCalc.createDescription": "Add a new age, tenure, or disability bonus rule",
  "specialCalc.editDescription": "Update the special calculation settings",
  "specialCalc.searchPlaceholder": "Search special calculations...",
  "specialCalc.columnType": "Type",
  "specialCalc.columnThreshold": "Threshold",
  "specialCalc.columnBonusDays": "Bonus Days",
  "specialCalc.columnStatus": "Status",
  "specialCalc.fieldType": "Type",
  "specialCalc.fieldThreshold": "Threshold (years)",
  "specialCalc.fieldBonusDays": "Bonus Days",
  "specialCalc.fieldDescription": "Description",
  "specialCalc.fieldActive": "Active",
  "specialCalc.typeAge": "Age",
  "specialCalc.typeTenure": "Tenure",
  "specialCalc.typeDisability": "Disability",
  "specialCalc.filterAll": "All Types",
  "specialCalc.thresholdHint": "Age or tenure in years. Must be 0 for disability.",
  "specialCalc.deleteTitle": "Delete Special Calculation",
  "specialCalc.deleteDescription": "Are you sure you want to delete this {type} special calculation (threshold: {threshold})?",
  "specialCalc.count": "{count} special calculation",
  "specialCalc.countPlural": "{count} special calculations",
  "specialCalc.emptyTitle": "No special calculations found",
  "specialCalc.emptyGetStarted": "Get started by creating your first special calculation",
  "specialCalc.emptyFilterHint": "Try adjusting your filters",
  ... (standard CRUD keys: create, saveChanges, saving, cancel, close, validations, failedCreate, failedUpdate, statusActive, statusInactive, sectionBasicInfo, sectionStatus, fieldActiveDescription, delete)

  "calcGroup.new": "New Calculation Group",
  "calcGroup.edit": "Edit Calculation Group",
  ... (standard code/name CRUD keys)
  "calcGroup.fieldBasis": "Basis",
  "calcGroup.basisCalendarYear": "Calendar Year",
  "calcGroup.basisEntryDate": "Entry Date",
  "calcGroup.columnBasis": "Basis",
  "calcGroup.columnSpecialCalcs": "Special Calculations",
  "calcGroup.sectionMembers": "Special Calculations",
  "calcGroup.membersSearchPlaceholder": "Search special calculations...",
  "calcGroup.membersSelectAll": "Select all ({count})",
  "calcGroup.membersSelected": "{count} selected",
  "calcGroup.membersNone": "No special calculations available",
  "calcGroup.deleteInUse": "Cannot delete: this group is assigned to employment types",
  ...

  "cappingRule.new": "New Capping Rule",
  "cappingRule.edit": "Edit Capping Rule",
  ... (standard code/name CRUD keys)
  "cappingRule.fieldRuleType": "Rule Type",
  "cappingRule.ruleTypeYearEnd": "Year-End",
  "cappingRule.ruleTypeMidYear": "Mid-Year",
  "cappingRule.fieldCutoffMonth": "Cutoff Month",
  "cappingRule.fieldCutoffDay": "Cutoff Day",
  "cappingRule.fieldCapValue": "Cap Value (days)",
  "cappingRule.capValueHint": "Maximum days to carry over. 0 means forfeit all.",
  "cappingRule.columnRuleType": "Rule Type",
  "cappingRule.columnCutoffDate": "Cutoff Date",
  "cappingRule.columnCapValue": "Cap Value",
  ...

  "cappingRuleGroup.new": "New Capping Rule Group",
  "cappingRuleGroup.edit": "Edit Capping Rule Group",
  ... (standard code/name CRUD keys)
  "cappingRuleGroup.columnRules": "Rules",
  "cappingRuleGroup.sectionMembers": "Capping Rules",
  "cappingRuleGroup.membersSearchPlaceholder": "Search capping rules...",
  "cappingRuleGroup.deleteInUse": "Cannot delete: this group is assigned to tariffs",
  ...

  "exception.new": "New Exception",
  "exception.edit": "Edit Exception",
  ... (CRUD keys)
  "exception.fieldEmployee": "Employee",
  "exception.fieldCappingRule": "Capping Rule",
  "exception.fieldYear": "Year",
  "exception.fieldYearHint": "Leave empty for all years",
  "exception.fieldExemptionType": "Exemption Type",
  "exception.exemptionFull": "Full",
  "exception.exemptionPartial": "Partial",
  "exception.fieldRetainDays": "Retain Days",
  "exception.retainDaysHint": "Maximum days to keep despite capping",
  "exception.fieldNotes": "Notes",
  "exception.columnEmployee": "Employee",
  "exception.columnCappingRule": "Capping Rule",
  "exception.columnYear": "Year",
  "exception.columnExemptionType": "Exemption Type",
  "exception.columnRetainDays": "Retain Days",
  "exception.yearAll": "All Years",
  ...

  "preview.title": "Vacation Previews",
  "preview.entitlementTitle": "Entitlement Preview",
  "preview.entitlementDescription": "Calculate vacation entitlement breakdown for an employee",
  "preview.carryoverTitle": "Carryover Preview",
  "preview.carryoverDescription": "Preview how carryover capping would apply",
  "preview.fieldEmployee": "Employee",
  "preview.fieldYear": "Year",
  "preview.selectEmployee": "Select an employee...",
  "preview.calculate": "Calculate",
  "preview.calculating": "Calculating...",
  "preview.baseEntitlement": "Base Entitlement",
  "preview.proRatedEntitlement": "Pro-Rated Entitlement",
  "preview.partTimeAdjustment": "Part-Time Adjustment",
  "preview.ageBonus": "Age Bonus",
  "preview.tenureBonus": "Tenure Bonus",
  "preview.disabilityBonus": "Disability Bonus",
  "preview.totalEntitlement": "Total Entitlement",
  "preview.monthsEmployed": "Months Employed",
  "preview.ageAtReference": "Age at Reference",
  "preview.tenureYears": "Years of Service",
  "preview.weeklyHours": "Weekly Hours",
  "preview.standardWeeklyHours": "Standard Weekly Hours",
  "preview.partTimeFactor": "Part-Time Factor",
  "preview.calculationGroup": "Calculation Group",
  "preview.basis": "Basis",
  "preview.availableDays": "Available Days",
  "preview.cappedCarryover": "Capped Carryover",
  "preview.forfeitedDays": "Forfeited Days",
  "preview.rulesApplied": "Rules Applied",
  "preview.ruleApplied": "Applied",
  "preview.ruleNotApplied": "Not Applied",
  "preview.exceptionActive": "Exception Active",
  "preview.hasException": "Employee Has Exception",
  "preview.noResults": "Select an employee and year, then click Calculate",
  "preview.sectionBreakdown": "Breakdown",
  "preview.sectionDetails": "Employee Details",
  "preview.sectionRules": "Capping Rules Applied"
}
```

German translations (`de.json`) follow the same structure with German values.

### Phase 1 Verification

- [ ] `use-vacation-config.ts` created with all 27 hooks
- [ ] `index.ts` exports all hooks
- [ ] Sidebar shows "Vacation Config" entry (after Vacation Balances)
- [ ] Breadcrumb renders "Vacation Config" for the route
- [ ] Translation keys added in both `en.json` and `de.json`
- [ ] `npm run build` passes (no type errors)

---

## Phase 2: Page Shell & Tab 1 (Special Calculations)

**Goal**: Create the page with tab navigation and implement the first tab fully.

### Step 2.1: Create component directory structure

Create `apps/web/src/components/vacation-config/` with:
- `index.ts` (barrel export)
- `special-calculations-tab.tsx`

### Step 2.2: Create the page file

**File**: `apps/web/src/app/[locale]/(dashboard)/admin/vacation-config/page.tsx`

Follow the booking-types page pattern but with 6 tabs:

```typescript
'use client'

// Standard auth guard pattern
// Tab type: 'special-calculations' | 'calculation-groups' | 'capping-rules' | 'capping-rule-groups' | 'exceptions' | 'previews'
// Default tab: 'special-calculations'

// Header with "New" button that changes label based on active tab
// (No "New" button for the "previews" tab)

// Tabs component with 6 TabsTrigger items
// Each TabsContent renders the corresponding tab component
```

The page file should be thin -- all CRUD state lives in the tab components. The page only manages:
- Auth guard
- Active tab state
- The "New" button click routing to the correct tab's create handler
- A ref/callback pattern so the page's "New" button can trigger create in the active tab

**Design for "New" button communication**: Each tab component exposes an `onCreateClick` callback via a prop or the page uses conditional state:

```typescript
const [activeTab, setActiveTab] = React.useState('special-calculations')
// Each tab manages its own createOpen state
// The page header button calls a createFn based on activeTab

// Approach: Use refs or simple state lifting
// Simplest: Pass onNew callback down, each tab tracks its own open state
// Even simpler: Each tab has a "New" button in its filter bar (no page-level "New" button)

// Decision: Follow existing pattern -- page-level "New" button with tab-specific create state at page level
// But for 6 tabs this becomes unwieldy. Instead, each tab component has its own "New" button
// in the filter bar area. The page header only shows title/subtitle.
```

**Revised approach**: Since 6 separate create states in the page is unwieldy, and tabs are self-contained, each tab component will include its own "New" button in its toolbar. The page header shows only title + subtitle (no "New" button). This is cleaner for 6 tabs and the Previews tab needs no "New" button at all.

### Step 2.3: Special Calculations Tab

**File**: `apps/web/src/components/vacation-config/special-calculations-tab.tsx`

This is a self-contained CRUD component with:
1. **Toolbar**: "New Special Calculation" button + SearchInput + type filter (age/tenure/disability/all)
2. **Count**: `{count} special calculation(s)`
3. **Data Table**: Inline table (not a separate file, since it is specific to this tab)
   - Columns: Type (badge), Threshold, Bonus Days, Status (badge), Actions (dropdown)
   - Row click opens detail (optional -- can skip detail sheet for simplicity; just edit)
4. **Form Sheet**: Create/edit form
   - Fields: type (Select: age/tenure/disability), threshold (number input), bonus_days (number input), description (textarea), active (Switch, edit only)
   - Validation: type required, bonus_days > 0, threshold >= 0, threshold must be 0 when type is disability
5. **Delete Dialog**: ConfirmDialog with standard pattern
6. **Badges**: Inline badge rendering for type:
   - `age` -> blue badge "Age"
   - `tenure` -> green badge "Tenure"
   - `disability` -> purple badge "Disability"

**Note**: VacationSpecialCalculation has no `code` or `name` fields. The table identifier column shows `type` + `threshold` as the display, e.g., "Age >= 50 years" or "Disability".

The search filter will search within `type` and `description` fields.

### Step 2.4: Create barrel export

**File**: `apps/web/src/components/vacation-config/index.ts`

```typescript
export { SpecialCalculationsTab } from './special-calculations-tab'
```

### Phase 2 Verification

- [ ] Page renders at `/admin/vacation-config`
- [ ] All 6 tab triggers visible (only first tab functional)
- [ ] Special Calculations CRUD works: list, create, edit, delete
- [ ] Type badges render correctly (age=blue, tenure=green, disability=purple)
- [ ] Type filter dropdown works
- [ ] Search filters work
- [ ] Disability type forces threshold to 0
- [ ] Delete confirmation works
- [ ] `npm run build` passes

---

## Phase 3: Tab 2 (Calculation Groups) & Tab 3 (Capping Rules)

### Step 3.1: Calculation Groups Tab

**File**: `apps/web/src/components/vacation-config/calculation-groups-tab.tsx`

Self-contained CRUD with:
1. **Toolbar**: "New Group" button + SearchInput
2. **Data Table**: Code, Name, Basis (badge: calendar_year=blue/entry_date=green), Special Calculations (count), Status, Actions
3. **Form Sheet**: code (Input, disabled on edit), name (Input), basis (Select: calendar_year/entry_date), description (Textarea), special_calculation_ids (multi-select inline checkbox list following booking-type-group-form-sheet.tsx pattern), active (Switch, edit only)
   - Multi-select fetches `useVacationSpecialCalculations({ enabled: open })` to list available special calculations
   - Uses `Set<string>` for tracking selected IDs
   - ScrollArea with search, select-all checkbox, individual checkboxes
   - Display format for each item: badge for type + threshold + bonus_days, e.g., `[Age] >= 50 years -> +2 days`
4. **Delete Dialog**: 409 conflict handling with `deleteInUse` message (assigned to employment types)

**Basis badges**:
- `calendar_year` -> `bg-blue-100 text-blue-700` "Calendar Year"
- `entry_date` -> `bg-green-100 text-green-700` "Entry Date"

### Step 3.2: Capping Rules Tab

**File**: `apps/web/src/components/vacation-config/capping-rules-tab.tsx`

Self-contained CRUD with:
1. **Toolbar**: "New Capping Rule" button + SearchInput + rule_type filter (all/year_end/mid_year)
2. **Data Table**: Code, Name, Rule Type (badge), Cutoff Date (formatted as "March 31"), Cap Value, Status, Actions
3. **Form Sheet**: code, name, rule_type (Select), cutoff_month (Select 1-12 with month names), cutoff_day (Input number 1-31), cap_value (Input number), description, active
   - Cap value hint: "0 = forfeit all remaining vacation"
4. **Delete Dialog**: Standard pattern

**Cutoff date formatting**: Use a helper to format month+day as locale-friendly date string. Since months are 1-12, use a month name lookup:
```typescript
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const formatCutoffDate = (month: number, day: number) => `${MONTHS[month - 1]} ${day}`
```

**Rule type badges**:
- `year_end` -> `bg-orange-100 text-orange-700` "Year-End"
- `mid_year` -> `bg-cyan-100 text-cyan-700` "Mid-Year"

### Step 3.3: Update barrel export

Add exports for both new tab components.

### Phase 3 Verification

- [ ] Calculation Groups tab: full CRUD works
- [ ] Multi-select for special calculations works (search, select-all, individual toggle)
- [ ] Basis badges render correctly
- [ ] 409 delete conflict shows clear error message for calculation groups
- [ ] Capping Rules tab: full CRUD works
- [ ] Cutoff date displays as "March 31" format
- [ ] Rule type badges render correctly
- [ ] Cap value 0 hint displays correctly
- [ ] `npm run build` passes

---

## Phase 4: Tab 4 (Capping Rule Groups) & Tab 5 (Employee Exceptions)

### Step 4.1: Capping Rule Groups Tab

**File**: `apps/web/src/components/vacation-config/capping-rule-groups-tab.tsx`

Self-contained CRUD with:
1. **Toolbar**: "New Group" button + SearchInput
2. **Data Table**: Code, Name, Rules (count), Status, Actions
3. **Form Sheet**: code, name, capping_rule_ids (multi-select checkbox list), description, active
   - Multi-select fetches `useVacationCappingRules({ enabled: open })`
   - Display format: `[CODE] Name (Year-End, cap: 10)` or `[CODE] Name (Mid-Year, March 31)`
4. **Delete Dialog**: 409 conflict handling ("assigned to tariffs")

### Step 4.2: Employee Exceptions Tab

**File**: `apps/web/src/components/vacation-config/employee-exceptions-tab.tsx`

Self-contained CRUD with:
1. **Toolbar**: "New Exception" button + SearchInput + optional filters (employee, capping rule, year)
2. **Data Table**: Employee (name), Capping Rule (name), Year (or "All Years"), Exemption Type (badge), Retain Days (or "-"), Status, Actions
   - Needs to resolve employee_id and capping_rule_id to display names
   - Fetch `useEmployees` and `useVacationCappingRules` for name lookups
3. **Form Sheet**:
   - employee_id: Select dropdown (fetches `useEmployees({ limit: 200, active: true, enabled: open })`)
   - capping_rule_id: Select dropdown (fetches `useVacationCappingRules({ enabled: open })`)
   - year: Input number (optional, leave empty for all years)
   - exemption_type: Select (full/partial)
   - retain_days: Input number -- **only shown when exemption_type === 'partial'** (conditional field pattern from day-plan-form-sheet.tsx)
   - notes: Textarea
   - active: Switch (edit only)
   - Employee and capping rule selectors disabled when editing
4. **Delete Dialog**: Standard pattern

**Exemption type badges**:
- `full` -> `bg-green-100 text-green-700` "Full"
- `partial` -> `bg-yellow-100 text-yellow-700` "Partial"

**Conditional field pattern**:
```tsx
{form.exemptionType === 'partial' && (
  <div className="space-y-2">
    <Label htmlFor="retainDays">{t('exception.fieldRetainDays')}</Label>
    <Input type="number" id="retainDays" ... min={0} step={0.5} />
    <p className="text-xs text-muted-foreground">{t('exception.retainDaysHint')}</p>
  </div>
)}
```

**Name resolution**: The EmployeeCappingException response only contains `employee_id` and `capping_rule_id`, not names. We need lookup maps:
```typescript
const { data: employeesData } = useEmployees({ limit: 200, enabled: !authLoading && isAdmin })
const employees = employeesData?.data ?? []
const employeeMap = React.useMemo(() => new Map(employees.map(e => [e.id, e])), [employees])

const { data: cappingRulesData } = useVacationCappingRules({ enabled: !authLoading && isAdmin })
const cappingRules = cappingRulesData?.data ?? []
const cappingRuleMap = React.useMemo(() => new Map(cappingRules.map(r => [r.id, r])), [cappingRules])
```

Then in the table:
```tsx
const employee = employeeMap.get(item.employee_id)
const displayName = employee ? `${employee.first_name} ${employee.last_name}` : item.employee_id
```

### Step 4.3: Update barrel export

Add exports for both new tab components.

### Phase 4 Verification

- [ ] Capping Rule Groups tab: full CRUD works
- [ ] Multi-select for capping rules works
- [ ] 409 delete conflict shows clear error for capping rule groups
- [ ] Employee Exceptions tab: full CRUD works
- [ ] Employee and capping rule selectors populate correctly
- [ ] Conditional `retain_days` field shows only for `partial` exemption type
- [ ] Employee names and capping rule names display correctly in the table
- [ ] Year field empty = "All Years" display
- [ ] Exemption type badges render correctly
- [ ] `npm run build` passes

---

## Phase 5: Tab 6 (Previews)

### Step 5.1: Previews Tab

**File**: `apps/web/src/components/vacation-config/vacation-previews-tab.tsx`

This tab has NO data table and NO CRUD. Instead it has two calculator panels side by side (or stacked on mobile).

**Layout**: Two cards in a grid:
```tsx
<div className="grid gap-6 lg:grid-cols-2">
  {/* Entitlement Preview Card */}
  <Card>...</Card>
  {/* Carryover Preview Card */}
  <Card>...</Card>
</div>
```

#### Entitlement Preview Card

**Inputs**:
- Employee selector (Select dropdown, `useEmployees({ limit: 200, active: true })`)
- Year (number Input, default current year)
- "Calculate" button

**On Calculate**: Call `useVacationEntitlementPreview()` mutation:
```tsx
const entitlementMutation = useVacationEntitlementPreview()

const handleCalculateEntitlement = async () => {
  await entitlementMutation.mutateAsync({
    body: {
      employee_id: selectedEmployeeId,
      year: selectedYear,
    },
  })
}

const preview = entitlementMutation.data?.data // or however the response is structured
```

**Result Display**: Styled breakdown card (following vacation-balance-detail-sheet.tsx pattern):

```
Section: Calculation Details
  Calculation Group:  [name]
  Basis:              [Calendar Year / Entry Date]

Section: Employee Details
  Months Employed:    [12]
  Age at Reference:   [52]
  Years of Service:   [8]
  Weekly Hours:       [30.0]
  Standard Hours:     [40.0]
  Part-Time Factor:   [0.75]

Section: Entitlement Breakdown
  Base Entitlement:       30.0
  Pro-Rated Entitlement:  30.0
  Part-Time Adjustment:   22.5
  Age Bonus:              +2.0
  Tenure Bonus:           +1.0
  Disability Bonus:       +0.0
  ─────────────────────────────
  Total Entitlement:      25.5   (bold)
```

Use the `DetailRow` pattern from vacation-balance-detail-sheet.tsx. Highlight total with bold font.

#### Carryover Preview Card

**Inputs**:
- Employee selector (same pattern)
- Year (number Input)
- "Calculate" button

**On Calculate**: Call `useVacationCarryoverPreview()` mutation.

**Result Display**:

```
Section: Carryover Summary
  Available Days:     [15.0]
  Capped Carryover:   [10.0]
  Forfeited Days:     [5.0]   (red if > 0)

Section: Rules Applied
  [Table of CappingRuleApplication items]
  Rule Name | Type | Cap | Applied? | Exception?
  ...
```

Each rule application row shows:
- Rule name
- Rule type badge (year_end/mid_year)
- Cap value
- Applied: green checkmark or gray dash
- Exception active: yellow warning badge or dash

If `has_exception` is true on the preview, show a note at the top.

### Step 5.2: Update barrel export

Add `VacationPreviewsTab` export.

### Phase 5 Verification

- [ ] Previews tab renders two calculator cards side by side
- [ ] Entitlement preview: selecting employee + year and clicking Calculate sends POST request
- [ ] Entitlement breakdown displays all fields correctly
- [ ] Carryover preview: sends POST and displays results
- [ ] Capping rules applied table renders correctly
- [ ] Loading states show during calculation
- [ ] Error states handled (employee has no tariff, etc.)
- [ ] `npm run build` passes

---

## Phase 6: Polish & Final Verification

### Step 6.1: Review all tab interactions

- Tab switching preserves each tab's filter state (each tab manages its own state independently)
- No data fetching conflicts between tabs
- Consistent badge styling across all tabs

### Step 6.2: German translations

Ensure `de.json` has complete translations for all keys added.

### Step 6.3: Empty states

Each tab needs empty state rendering when no data exists:
- Icon (appropriate per entity)
- Title: "No {entities} found"
- Subtitle: "Get started by creating your first {entity}" or "Try adjusting your filters"
- "Add {entity}" button (when no filters active)

### Step 6.4: Tab overflow on small screens

The existing `TabsList` may not handle 6 tabs well on narrow screens. Review and add `className="flex-wrap"` or horizontal scrolling if needed:
```tsx
<TabsList className="h-auto flex-wrap gap-1">
```

### Phase 6 Verification

- [ ] All 6 tabs fully functional end-to-end
- [ ] German translations complete
- [ ] Empty states render correctly for each tab
- [ ] Tab layout works on narrow screens (no overflow issues)
- [ ] Delete conflict errors display clearly
- [ ] Conditional form fields work correctly
- [ ] Multi-select components work in both create and edit modes
- [ ] `npm run build` passes with no errors
- [ ] Manual smoke test of full workflow:
  1. Create special calculation (age, threshold=50, bonus=2)
  2. Create calculation group linking the special calculation
  3. Create capping rule (year_end, Dec 31, cap=10)
  4. Create capping rule group linking the rule
  5. Create employee exception (partial, retain_days=5)
  6. Preview entitlement for an employee
  7. Preview carryover for an employee

---

## File Summary

### New Files (10)

| File | Purpose |
|------|---------|
| `apps/web/src/hooks/api/use-vacation-config.ts` | All 27 API hooks |
| `apps/web/src/app/[locale]/(dashboard)/admin/vacation-config/page.tsx` | Page shell with 6 tabs |
| `apps/web/src/components/vacation-config/index.ts` | Barrel export |
| `apps/web/src/components/vacation-config/special-calculations-tab.tsx` | Tab 1: Special Calculations CRUD |
| `apps/web/src/components/vacation-config/calculation-groups-tab.tsx` | Tab 2: Calculation Groups CRUD with multi-select |
| `apps/web/src/components/vacation-config/capping-rules-tab.tsx` | Tab 3: Capping Rules CRUD |
| `apps/web/src/components/vacation-config/capping-rule-groups-tab.tsx` | Tab 4: Capping Rule Groups CRUD with multi-select |
| `apps/web/src/components/vacation-config/employee-exceptions-tab.tsx` | Tab 5: Employee Exceptions CRUD with conditional fields |
| `apps/web/src/components/vacation-config/vacation-previews-tab.tsx` | Tab 6: Entitlement + Carryover preview calculators |

### Modified Files (5)

| File | Change |
|------|--------|
| `apps/web/src/hooks/api/index.ts` | Add vacation config hook exports |
| `apps/web/src/components/layout/sidebar/sidebar-nav-config.ts` | Add Umbrella icon import + nav entry |
| `apps/web/src/components/layout/breadcrumbs.tsx` | Add `vacation-config` segment mapping |
| `apps/web/messages/en.json` | Add nav, breadcrumb, and adminVacationConfig translations |
| `apps/web/messages/de.json` | Add German translations |

### No Backend Changes

All API endpoints already exist (confirmed in generated types). No new migrations, handlers, services, or routes needed.
