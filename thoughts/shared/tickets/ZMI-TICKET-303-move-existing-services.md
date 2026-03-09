# ZMI-TICKET-303: Move Existing Services to src/lib/services/

Status: Todo
Priority: P0
Depends on: ZMI-TICKET-302

## Goal
Move the 10 existing service files from `src/server/services/` to `src/lib/services/`. These are the calculation engine, recalculation orchestration, macro executor, and cron logger.

## Scope
- **In scope:**
  - Move all service files and their tests
  - Update all imports
  - Delete empty `src/server/services/`
- **Out of scope:**
  - Creating new service files (Phase 1)
  - Moving routers (Phase 1)

## Implementation Steps

### 1. Move service files

| Source | Destination |
|--------|-------------|
| `src/server/services/daily-calc.ts` | `src/lib/services/daily-calc.ts` |
| `src/server/services/daily-calc.helpers.ts` | `src/lib/services/daily-calc.helpers.ts` |
| `src/server/services/daily-calc.types.ts` | `src/lib/services/daily-calc.types.ts` |
| `src/server/services/monthly-calc.ts` | `src/lib/services/monthly-calc.ts` |
| `src/server/services/monthly-calc.types.ts` | `src/lib/services/monthly-calc.types.ts` |
| `src/server/services/recalc.ts` | `src/lib/services/recalc.ts` |
| `src/server/services/recalc.types.ts` | `src/lib/services/recalc.types.ts` |
| `src/server/services/employee-day-plan-generator.ts` | `src/lib/services/employee-day-plan-generator.ts` |
| `src/server/services/macro-executor.ts` | `src/lib/services/macro-executor.ts` |
| `src/server/services/cron-execution-logger.ts` | `src/lib/services/cron-execution-logger.ts` |

### 2. Move test files
```
src/server/services/__tests__/ → src/lib/services/__tests__/
```

### 3. Update internal imports within service files
These services import from each other and from lib files:
```typescript
// Before (within daily-calc.ts):
import { DailyCalcInput } from './daily-calc.types'
import { getHolidaysForRange } from '../lib/holiday-calendar'

// After:
import { DailyCalcInput } from './daily-calc.types'  // Same (relative)
import { getHolidaysForRange } from './holiday-calendar'  // Now in same dir
```

### 4. Update consumer imports
Files that import these services:

**Routers that import DailyCalcService:**
- `src/server/routers/employees.ts` (calculateDay)
- `src/server/routers/bookings.ts` (recalc triggers)
- `src/server/routers/absences.ts` (recalc triggers)
- `src/server/routers/dailyValues.ts`

**Routers that import MonthlyCalcService:**
- `src/server/routers/monthlyValues.ts`
- `src/server/routers/employees.ts`

**Routers that import RecalcService:**
- `src/server/routers/bookings.ts`
- `src/server/routers/absences.ts`
- `src/server/routers/employeeDayPlans.ts`

**Routers that import MacroExecutor:**
- `src/server/routers/macros.ts`
- `src/server/routers/schedules.ts`

**Cron routes:**
- `src/app/api/cron/calculate-days/route.ts`
- `src/app/api/cron/calculate-months/route.ts`
- `src/app/api/cron/generate-day-plans/route.ts`
- `src/app/api/cron/execute-macros/route.ts`

```typescript
// Before:
import { DailyCalcService } from '@/server/services/daily-calc'
// After:
import { DailyCalcService } from '@/lib/services/daily-calc'
```

### 5. Delete empty directory
```
rm -rf src/server/services/
```

### 6. Check for remaining src/server/ contents
After this ticket, `src/server/` should only contain:
- `src/server/routers/` (moved in Phase 1)

## Verification
```bash
make typecheck
make lint
make test        # Especially the service tests
make build
```

## Files Moved
- 10 service files + their test files

## Files Modified (imports)
- ~15 router files
- 4 cron route files
- Service files (internal cross-references)
