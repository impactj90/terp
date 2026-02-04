# ZMI-TICKET-059: Vacation Configuration UI

Status: Proposed
Priority: P3
Owner: TBD
Backend tickets: ZMI-TICKET-014, ZMI-TICKET-015

## Goal
Provide a multi-tab configuration page for vacation-related settings: special calculations, calculation groups, capping rules, capping rule groups, employee capping exceptions, and entitlement/carryover previews.

## Scope
- In scope: Six tabs of vacation configuration, all CRUD operations, entitlement preview calculator, carryover preview.
- Out of scope: Vacation balance management (ZMI-TICKET-049), absence tracking, vacation request workflow.

## Requirements

### Pages & routes
- **New page**: `apps/web/src/app/[locale]/(dashboard)/admin/vacation-config/page.tsx`
  - Route: `/admin/vacation-config`
  - Six tabs: Special Calculations, Calculation Groups, Capping Rules, Capping Rule Groups, Employee Exceptions, Previews

### Components
- `apps/web/src/components/vacation-config/special-calculations-tab.tsx`
  - CRUD table for vacation special calculations
  - Columns: Name, Type (badge: age/tenure/disability), Threshold, Bonus Days, Active, Actions
  - Form fields: name, code, type (select), threshold (years, 0 for disability), bonus_days (decimal), description, active
  - Type filter dropdown
- `apps/web/src/components/vacation-config/calculation-groups-tab.tsx`
  - CRUD table for vacation calculation groups
  - Columns: Name, Basis (badge: calendar_year/entry_date), Special Calculations (count), Active, Actions
  - Form fields: name, code, basis (select), special_calculation_ids (multi-select from special calculations), description, active
  - Delete conflict: 409 if assigned to employment types
- `apps/web/src/components/vacation-config/capping-rules-tab.tsx`
  - CRUD table for vacation capping rules
  - Columns: Name, Rule Type (badge: year_end/mid_year), Cutoff Date, Cap Value, Active, Actions
  - Form fields: name, code, rule_type (select), cutoff_month (1–12), cutoff_day (1–31), cap_value (decimal, 0=forfeit all), description, active
  - Cutoff date displayed as "March 31" format
- `apps/web/src/components/vacation-config/capping-rule-groups-tab.tsx`
  - CRUD table for capping rule groups
  - Columns: Name, Rules (count), Active, Actions
  - Form fields: name, code, capping_rule_ids (multi-select from capping rules), description, active
  - Delete conflict: 409 if assigned to tariffs
- `apps/web/src/components/vacation-config/employee-exceptions-tab.tsx`
  - CRUD table for employee capping exceptions
  - Columns: Employee, Capping Rule, Year, Exemption Type (badge: full/partial), Retain Days, Actions
  - Form fields: employee_id (select), capping_rule_id (select), year (number, nullable=all years), exemption_type (full/partial), retain_days (decimal, only for partial)
  - Filter: employee_id, capping_rule_id, year
- `apps/web/src/components/vacation-config/vacation-previews-tab.tsx`
  - Two preview calculators:
    1. **Entitlement Preview**: employee selector + year → POST `/vacation-entitlement/preview`
       - Shows breakdown: base_entitlement, pro_rated, part_time_adjustment, age/tenure/disability bonuses, total
    2. **Carryover Preview**: employee selector + year → POST `/vacation-carryover/preview`
       - Shows: previous_year_remaining, capping rules applied, final carryover amount
  - Read-only result displays with clear breakdown formatting

### API hooks
- `apps/web/src/hooks/api/use-vacation-config.ts`
  - Special Calculations: `useVacationSpecialCalculations()`, `useCreateVacationSpecialCalculation()`, `useUpdateVacationSpecialCalculation()`, `useDeleteVacationSpecialCalculation()`
  - Calculation Groups: `useVacationCalculationGroups()`, `useCreateVacationCalculationGroup()`, `useUpdateVacationCalculationGroup()`, `useDeleteVacationCalculationGroup()`
  - Capping Rules: `useVacationCappingRules()`, `useCreateVacationCappingRule()`, `useUpdateVacationCappingRule()`, `useDeleteVacationCappingRule()`
  - Capping Rule Groups: `useVacationCappingRuleGroups()`, `useCreateVacationCappingRuleGroup()`, `useUpdateVacationCappingRuleGroup()`, `useDeleteVacationCappingRuleGroup()`
  - Employee Exceptions: `useEmployeeCappingExceptions()`, `useCreateEmployeeCappingException()`, `useUpdateEmployeeCappingException()`, `useDeleteEmployeeCappingException()`
  - Previews: `useVacationEntitlementPreview()`, `useVacationCarryoverPreview()`

### UI behavior
- Six-tab layout with independent data per tab
- Tab switching preserves filter state within each tab
- Multi-select components for linking special calculations to groups and capping rules to groups
- Employee exceptions: "partial" exemption shows retain_days field; "full" exemption hides it
- Previews: read-only calculator; select employee + year, click "Calculate", see breakdown
- Delete conflicts: show which parent entities reference the item
- Entitlement preview breakdown: visual card with line items adding up to total

### Navigation & translations
- Sidebar entry in "Management" section: `{ titleKey: 'nav.vacation-config', href: '/admin/vacation-config', icon: Umbrella, roles: ['admin'] }`
- Breadcrumb: `'vacation-config': 'vacation-config'`
- Translation namespace: `vacation-config`
  - Key groups: `page.*`, `tabs.*`, `special-calculations.*`, `calculation-groups.*`, `capping-rules.*`, `capping-rule-groups.*`, `exceptions.*`, `previews.*`

## Acceptance criteria
- All six tabs functional with CRUD operations
- Special calculations correctly typed (age/tenure/disability)
- Calculation groups link to special calculations
- Capping rules display cutoff dates correctly
- Employee exceptions support full/partial exemption types
- Entitlement preview shows correct calculation breakdown
- Carryover preview shows capping rules applied
- Delete conflicts handled with clear error messages

## Tests

### Component tests
- Special calculation type badges render correctly
- Calculation group form links special calculations via multi-select
- Capping rule cutoff date formats correctly
- Employee exception form toggles retain_days based on exemption type
- Preview calculator sends correct request and displays breakdown

### Integration tests
- Full workflow: create special calculation → add to group → create capping rule → add to group
- Employee exception affects carryover preview
- Delete conflict prevents removal of linked entities

## Test case pack
1) Create age-based special calculation
   - Input: Type=age, threshold=50, bonus_days=2
   - Expected: Created with "Age" badge and "50 years → +2 days"
2) Create calculation group with special calculations
   - Input: Name "Standard", basis=calendar_year, link 2 special calculations
   - Expected: Group shows member count = 2
3) Entitlement preview
   - Input: Select employee, year 2026
   - Expected: Breakdown shows base + pro_rated + bonuses = total
4) Employee capping exception
   - Input: Employee, capping rule, exemption=partial, retain_days=5
   - Expected: Exception created, affects carryover preview

## Dependencies
- ZMI-TICKET-014 (Vacation Entitlement Calculation backend)
- ZMI-TICKET-015 (Vacation Carryover Capping backend)
- Employees API (for selectors)
