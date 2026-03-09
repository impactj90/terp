# ZMI-TICKET-325: Flatten Hooks Directory

Status: Todo
Priority: P1
Depends on: ZMI-TICKET-300 (can run in parallel with Phase 1)

## Goal
Move all hook files from `src/hooks/api/` to `src/hooks/`, eliminating the `api/` subfolder to match workbook's flat hooks structure.

## Scope
- **In scope:**
  - Move all 65+ hook files to parent directory
  - Update barrel export (index.ts)
  - Update ALL component imports
- **Out of scope:**
  - Changing hook implementations
  - Adding/removing hooks

## Implementation Steps

### 1. Move files
```bash
mv src/hooks/api/*.ts src/hooks/
rm -rf src/hooks/api/
```

### 2. Update barrel export
Move `src/hooks/api/index.ts` contents to `src/hooks/index.ts` (or create if doesn't exist).

### 3. Update all imports
Search and replace across the entire codebase:
```typescript
// Before:
import { useEmployees } from '@/hooks/api/use-employees'
import { useBookings } from '@/hooks/api'

// After:
import { useEmployees } from '@/hooks/use-employees'
import { useBookings } from '@/hooks'
```

### Files to search for import updates
- All files in `src/components/` (~200+ files)
- All files in `src/app/` (page components)
- Any other files importing from `@/hooks/api/`

### Hook files being moved (65+)
```
use-absences.ts
use-absence-types.ts
use-absence-type-groups.ts
use-access-profiles.ts
use-access-zones.ts
use-accounts.ts
use-account-groups.ts
use-activities.ts
use-audit-logs.ts
use-auth.ts
use-booking-reasons.ts
use-bookings.ts
use-booking-types.ts
use-booking-type-groups.ts
use-calculation-rules.ts
use-contact-types.ts
use-corrections.ts
use-correction-assistant.ts
use-cost-centers.ts
use-daily-values.ts
use-day-plans.ts
use-departments.ts
use-employee-access-assignments.ts
use-employee-capping-exceptions.ts
use-employee-cards.ts
use-employee-contacts.ts
use-employee-day-plans.ts
use-employee-messages.ts
use-employees.ts
use-employee-tariff-assignments.ts
use-employment-types.ts
use-evaluations.ts
use-export-interfaces.ts
use-groups.ts
use-holidays.ts
use-locations.ts
use-macros.ts
use-monthly-eval-templates.ts
use-monthly-values.ts
use-notifications.ts
use-order-assignments.ts
use-order-bookings.ts
use-orders.ts
use-payroll-exports.ts
use-permissions.ts
use-reports.ts
use-schedules.ts
use-shifts.ts
use-system-settings.ts
use-tariffs.ts
use-teams.ts
use-tenants.ts
use-terminal-bookings.ts
use-travel-allowance-preview.ts
use-travel-allowance-rule-sets.ts
use-trip-records.ts
use-user-groups.ts
use-users.ts
use-vacation.ts
use-vacation-balances.ts
use-vacation-calc-groups.ts
use-vacation-capping-rule-groups.ts
use-vacation-capping-rules.ts
use-vacation-special-calcs.ts
use-vehicles.ts
use-vehicle-routes.ts
use-week-plans.ts
index.ts
```

## Verification
```bash
make typecheck   # All import paths resolve
make build       # Full build succeeds
```

## Files Modified
- 65+ hook files (moved)
- ~120+ component/page files (import updates)
