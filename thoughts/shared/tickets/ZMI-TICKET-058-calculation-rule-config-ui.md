# ZMI-TICKET-058: Calculation Rule Configuration UI

Status: Proposed
Priority: P3
Owner: TBD
Backend tickets: ZMI-TICKET-013

## Goal
Provide a CRUD page for calculation rules used in absence deduction, with rule value, factor, and account assignment configuration.

## Scope
- In scope: Calculation rules list, create/edit form with value/factor/account, delete with conflict handling.
- Out of scope: Absence type assignment of rules (done in absence type form), rule execution engine.

## Requirements

### Pages & routes
- **New page**: `apps/web/src/app/[locale]/(dashboard)/admin/calculation-rules/page.tsx`
  - Route: `/admin/calculation-rules`

### Components
- `apps/web/src/components/calculation-rules/calculation-rule-data-table.tsx`
  - Columns: Name, Value (formatted), Factor, Account, Active, Actions
  - Value displayed: "X minutes" or "Use daily target" when value=0
  - Factor displayed as multiplier (e.g., "1.5x")
  - Account column shows account name from expanded relation
- `apps/web/src/components/calculation-rules/calculation-rule-form-sheet.tsx`
  - Fields:
    - Name (text, required)
    - Code (text, required, unique)
    - Description (textarea, optional)
    - Value (number input, minutes — 0 = use daily target time)
    - Factor (decimal input, default 1.0, e.g., 1.5 for 150%)
    - Account (select from useAccounts hook, optional)
    - Active (switch, default true)
  - Helper text for value: "Set to 0 to use the employee's daily target time"
  - Factor helper: "Multiplier applied to the value (e.g., 1.0 = 100%, 0.5 = 50%)"
- `apps/web/src/components/calculation-rules/calculation-rule-detail-sheet.tsx`
  - Shows all fields with formatted values
  - Effective calculation display: "Value × Factor = X minutes"
- `apps/web/src/components/calculation-rules/calculation-rule-delete-dialog.tsx`
  - Confirmation dialog
  - On 409 "Rule assigned to absence types": show error with list of affected absence types

### API hooks
- `apps/web/src/hooks/api/use-calculation-rules.ts`
  - `useCalculationRules(params?)` — GET `/calculation-rules` with `active_only` filter
  - `useCalculationRule(id)` — GET `/calculation-rules/{id}`
  - `useCreateCalculationRule()` — POST `/calculation-rules`, invalidates `[['/calculation-rules']]`
  - `useUpdateCalculationRule()` — PATCH `/calculation-rules/{id}`, invalidates `[['/calculation-rules']]`
  - `useDeleteCalculationRule()` — DELETE `/calculation-rules/{id}`, invalidates `[['/calculation-rules']]`

### UI behavior
- Standard CRUD pattern
- Value=0 special display: "Use daily target time" instead of "0 minutes"
- Factor formatting: shown as "X.Xx" multiplier
- Delete conflict: 409 when rule is assigned to absence types, show which types use it
- Active filter toggle

### Navigation & translations
- Sidebar entry in "Management" section: `{ titleKey: 'nav.calculation-rules', href: '/admin/calculation-rules', icon: Calculator, roles: ['admin'] }`
- Breadcrumb: `'calculation-rules': 'calculation-rules'`
- Translation namespace: `calculation-rules`

## Acceptance criteria
- Admin can CRUD calculation rules with value, factor, and account
- Value=0 correctly displays as "Use daily target time"
- Delete prevented when rule is assigned to absence types
- Active filter works

## Tests

### Component tests
- Table displays "Use daily target" for value=0
- Factor shown as multiplier format
- Delete 409 shows affected absence types

### Integration tests
- Create rule, verify in list
- Edit rule factor, verify update
- Attempt delete of assigned rule, verify 409

## Test case pack
1) Create calculation rule
   - Input: Name "Full Day", value=0, factor=1.0
   - Expected: Created with display "Use daily target time × 1.0x"
2) Create half-day rule
   - Input: Name "Half Day", value=0, factor=0.5
   - Expected: Created with display "Use daily target time × 0.5x"
3) Delete assigned rule
   - Input: Delete rule assigned to "Vacation" absence type
   - Expected: 409 error showing "Used by: Vacation"

## Dependencies
- ZMI-TICKET-013 (Absence Calculation Rules backend)
- ZMI-TICKET-009 (Accounts — for account selector)
