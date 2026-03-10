# Type and Lint Error Analysis

**Date**: 2026-03-09
**Branch**: staging
**Context**: Post-restructuring (TICKET-300 through TICKET-326)

---

## Summary

| Check      | Total Errors | Unique Files |
|------------|-------------|--------------|
| Typecheck  | 1,260       | 89           |
| Lint (src) | 53          | 29           |

The lint total reported by ESLint is 1,773, but 1,720 of those come from `apps/web/.next/` build artifacts that are incorrectly being linted (the `.next/` ignore pattern does not match `apps/web/.next/`).

---

## Typecheck Errors (1,260 total)

### Error Code Breakdown

| Code    | Count | Description                                             |
|---------|------:|---------------------------------------------------------|
| TS2551  |   363 | Property does not exist, "did you mean X?" (snake_case vs camelCase) |
| TS2304  |   363 | Cannot find name (all are `expect` in test files)       |
| TS2582  |   249 | Cannot find name `describe`/`it` (test runner globals)  |
| TS2353  |    89 | Object literal specifies unknown properties (`path`, `body`) |
| TS7006  |    68 | Parameter implicitly has `any` type                     |
| TS2345  |    39 | Argument type not assignable                            |
| TS2339  |    26 | Property does not exist (no suggestion)                 |
| TS2532  |    21 | Object is possibly `undefined`                          |
| TS2352  |    21 | Type conversion may be a mistake (snake_case vs camelCase cast) |
| TS2322  |     7 | Type not assignable                                     |
| TS2769  |     5 | No overload matches this call                           |
| TS2561  |     5 | Object literal has unknown property, "did you mean X?"  |
| TS2741  |     1 | Property missing in type                                |
| TS2740  |     1 | Type missing multiple properties                        |
| TS2739  |     1 | Type missing multiple properties                        |
| TS18046 |     1 | Value is of type `unknown`                              |

### Top Directories by Error Count

| Directory                          | Errors |
|------------------------------------|-------:|
| src/lib/calculation/__tests__/     |    424 |
| src/components/day-plans/          |    110 |
| src/components/tariffs/            |     94 |
| src/components/shift-planning/     |     39 |
| src/components/teams/              |     37 |
| src/components/employees/          |     33 |
| src/components/vacation-config/    |     29 |
| src/components/payroll-exports/    |     25 |
| src/trpc/routers/__tests__/        |     21 |
| src/components/export-interfaces/  |     21 |
| src/components/week-plans/         |     20 |
| src/components/employee-messages/  |     18 |
| src/components/departments/        |     15 |
| src/components/holidays/           |     14 |
| src/components/employees/tariff-assignments/ | 13 |
| src/components/employment-types/   |     12 |
| src/components/macros/             |     11 |
| src/components/calculation-rules/  |     11 |

### Top Files by Error Count

| File                                                     | Errors |
|----------------------------------------------------------|-------:|
| src/lib/calculation/__tests__/calculator.test.ts         |    145 |
| src/lib/calculation/__tests__/rounding.test.ts           |    111 |
| src/lib/calculation/__tests__/capping.test.ts            |    110 |
| src/lib/calculation/__tests__/surcharges.test.ts         |     92 |
| src/components/day-plans/day-plan-detail-sheet.tsx        |     76 |
| src/lib/calculation/__tests__/breaks.test.ts             |     74 |
| src/lib/calculation/__tests__/tolerance.test.ts          |     64 |
| src/components/tariffs/tariff-detail-sheet.tsx            |     58 |
| src/lib/calculation/__tests__/pairing.test.ts            |     50 |
| src/components/day-plans/day-plan-form-sheet.tsx          |     33 |
| src/components/tariffs/tariff-form-sheet.tsx              |     32 |
| src/components/employees/employee-detail-sheet.tsx        |     28 |
| src/lib/calculation/__tests__/time.test.ts               |     27 |
| src/components/payroll-exports/payroll-export-preview.tsx |     24 |

---

## Typecheck Error Pattern Analysis

### Pattern 1: Missing Test Runner Globals (612 errors, 8 files)

**Error codes**: TS2304 (363), TS2582 (249)

**Root cause**: The 8 test files in `src/lib/calculation/__tests__/` do not import `describe`, `it`, `expect` from `vitest`. Vitest is configured with `globals: true` in `vitest.config.ts`, but there is no `/// <reference types="vitest/globals" />` in the tsconfig or a `.d.ts` file, so `tsc` cannot find these names. Other test files (e.g., `src/trpc/routers/__tests__/`) explicitly import from `vitest` and do not have this issue.

**Affected files** (all 8 in `src/lib/calculation/__tests__/`):
- breaks.test.ts (74 errors)
- calculator.test.ts (145 errors)
- capping.test.ts (110 errors)
- pairing.test.ts (50 errors)
- rounding.test.ts (111 errors)
- surcharges.test.ts (92 errors)
- time.test.ts (27 errors)
- tolerance.test.ts (64 errors)

**Correct pattern** (used by working test files):
```ts
import { describe, it, expect, vi } from "vitest"
```

### Pattern 2: snake_case vs camelCase Property Access (363 errors, 33 files)

**Error code**: TS2551

**Root cause**: Components access tRPC response data using `snake_case` property names (e.g., `is_active`, `first_name`, `created_at`, `tenant_id`) while the tRPC routers return Prisma models in `camelCase` (e.g., `isActive`, `firstName`, `createdAt`, `tenantId`). This is a consequence of the migration from the Go backend (which used snake_case JSON) to tRPC + Prisma (which uses camelCase by default).

**Most common mismatched properties** (with occurrence counts):
- `first_name` -> `firstName` (18)
- `last_name` -> `lastName` (18)
- `personnel_number` -> `personnelNumber` (11)
- `rhythm_type` -> `rhythmType` (8)
- `employee_id` -> `employeeId` (7)
- `plan_type` -> `planType` (6)
- `is_active` -> `isActive` (many, across many files)
- `created_at` -> `createdAt` (many)
- `updated_at` -> `updatedAt` (many)
- `come_from` -> `comeFrom`, `come_to` -> `comeTo`, `go_from` -> `goFrom` (day plan fields)
- `account_id` -> `accountId`, `tariff_id` -> `tariffId` etc.

**Most affected files**:
- day-plan-detail-sheet.tsx (71 occurrences)
- tariff-detail-sheet.tsx (49)
- day-plan-form-sheet.tsx (31)
- employee-detail-sheet.tsx (26)
- tariff-form-sheet.tsx (25)
- payroll-export-preview.tsx (23)

### Pattern 3: Old REST API Call Shape - `path`/`body` (87 errors, 49 files)

**Error code**: TS2353

**Root cause**: Components call tRPC mutations using the old OpenAPI-generated client pattern `mutateAsync({ path: { id }, body: { ... } })`. The tRPC mutations expect a flat input object like `mutateAsync({ id, name, ... })` instead.

**Old pattern** (used by components):
```ts
await updateMutation.mutateAsync({
  path: { id: item.id },
  body: { name: "Updated" },
})
```

**Correct pattern** (expected by tRPC):
```ts
await updateMutation.mutateAsync({
  id: item.id,
  name: "Updated",
})
```

**Breakdown**: 50 occurrences of `path`, 37 occurrences of `body`.

**Affected**: 49 unique component files across most `src/components/` subdirectories.

### Pattern 4: Implicit `any` Parameters (68 errors, 6 files)

**Error code**: TS7006

**Root cause**: Callback parameters in `.map()`, `.filter()`, and similar array methods lack type annotations. Most are in test files (`src/lib/calculation/__tests__/`) and a few component files.

**Affected files**:
- src/lib/calculation/__tests__/breaks.test.ts (most errors)
- src/components/tariffs/tariff-detail-sheet.tsx
- src/components/tariffs/tariff-form-sheet.tsx
- src/components/departments/department-detail-sheet.tsx
- src/components/users/user-form-sheet.tsx

### Pattern 5: camelCase-to-snake_case Assignment Incompatibility (39 errors, 17 files)

**Error code**: TS2345

**Root cause**: Components pass tRPC response objects (camelCase) to functions/components that expect legacy snake_case typed objects. For example, passing a Prisma-shaped `{ tenantId, isActive }` object to a function typed as `{ tenant_id, is_active }`.

### Pattern 6: Legacy Type Cast Failures (21 errors, 14 files)

**Error code**: TS2352

**Root cause**: Components cast tRPC response arrays `as` the legacy OpenAPI type arrays. Since the tRPC response uses camelCase and the legacy types use snake_case, the type assertion fails.

**Example**:
```ts
// Component casts tRPC data (camelCase) to legacy type (snake_case)
const zones = data?.data as CostCenter[]  // CostCenter expects snake_case fields
```

**Affected files**: zones-tab.tsx, booking-type-group-form-sheet.tsx, shift-planning-board.tsx, terminal-bookings/bookings-tab.tsx, terminal-bookings/import-batches-tab.tsx, etc.

### Pattern 7: Properties Missing from Type (26 errors, 11 files)

**Error code**: TS2339

**Sub-patterns**:
- `children` property missing on Department type (5 occurrences in department-detail-sheet.tsx) -- the tRPC router does not include `children` relation in its response
- `data` property missing (4 occurrences) -- components expect `response.data` wrapper but tRPC returns `{ total, items }` or a bare array
- `remaining_days`, `used_days`, `planned_days` on `LegacyVacationBalance` (6 occurrences in vacation-balance-card.tsx and balance-breakdown.tsx) -- snake_case property names on a locally defined type
- `description` missing from EmploymentType (2 occurrences) -- Prisma model does not have this field
- `default_weekly_hours` missing from EmploymentType (2 occurrences) -- should be `weeklyHoursDefault`
- `category` missing from Holiday (2 occurrences) -- should be `holidayCategory`
- `apiUrl` missing from clientEnv (1 occurrence in `src/lib/api/client.ts`) -- this field was removed from config
- `department` missing from employee type (1 occurrence)
- `account_code`, `account_name`, `payroll_code` missing (1 each in export-interface-detail-sheet.tsx) -- nested relation field access using wrong names

### Pattern 8: Object Possibly Undefined (21 errors, 7 files)

**Error code**: TS2532

**Root cause**: Test assertions access array elements or optional properties without null-checking. All in `src/trpc/routers/__tests__/` test files.

**Affected files**: accessProfiles-router.test.ts, accessZones-router.test.ts, evaluations-router.test.ts, payrollExports-router.test.ts, tripRecords-router.test.ts.

### Pattern 9: Wrong Property Names in Mutation Inputs (5 errors, 5 files)

**Error code**: TS2561

**Root cause**: Components pass snake_case or wrong property names to tRPC mutations.

**Examples**:
- `active` instead of `isActive` (bulk-actions.tsx, employee-form-sheet.tsx, team-detail-sheet.tsx)
- `overwrite_tariff_source` instead of `overwriteTariffSource` (tariff-form-sheet.tsx)
- `terminal_id` instead of `terminalId` (bookings-tab.tsx)

### Pattern 10: Miscellaneous Type Errors (15 errors)

- TS2322 (7): Type assignment failures, mostly camelCase arrays assigned to snake_case typed variables
- TS2769 (5): No overload matches -- mostly in employee-messages components using old type signatures
- TS2741/TS2740/TS2739 (3): Missing properties in type -- camelCase types missing snake_case required fields
- TS18046 (1): `unknown` type access in payroll-export-preview.tsx

---

## Lint Errors (53 source code errors, 29 files)

### Lint Rule Breakdown

| Rule                                       | Count | Description                     |
|--------------------------------------------|------:|---------------------------------|
| @typescript-eslint/no-unused-vars          |    29 | Unused variables/imports        |
| @typescript-eslint/no-explicit-any         |    12 | Use of `any` type               |
| @typescript-eslint/consistent-type-imports |    10 | Missing `import type` syntax    |
| prefer-const                               |     1 | `let` that should be `const`    |
| @typescript-eslint/no-require-imports      |     1 | `require()` usage               |

### Lint Errors by File

| File                                                         | Errors |
|--------------------------------------------------------------|-------:|
| src/app/api/cron/calculate-days/__tests__/route.test.ts      |     10 |
| src/lib/services/group-repository.ts                         |      6 |
| src/lib/services/daily-calc.ts                               |      4 |
| src/lib/calculation/__tests__/calculator.test.ts             |      4 |
| src/trpc/routers/__tests__/vacation-helpers.test.ts          |      3 |
| src/trpc/routers/bookingTypes.ts                             |      2 |
| src/components/payroll-exports/payroll-export-preview.tsx    |      2 |
| All other files (22 files)                                   |     22 |

### Lint Error Details

**no-unused-vars (29 errors)**: Unused type imports, unused variables, and unused destructured values across 18 files. Examples:
- `AbsenceTypeGroup` in absence-types page
- `OrderBooking` in orders page
- `PayrollExportLine`, `summary` in payroll-export-preview
- `BookingInput` in breaks.test.ts
- `ToleranceConfig`, `RoundingConfig`, `BreakConfig` in calculator.test.ts
- `VALID_DIRECTIONS`, `VALID_CATEGORIES` in bookingTypes.ts router
- `createMockUser` in test files
- `DayPlanInput`, `isBreakBooking`, `bookingDirection`, `prisma` in daily-calc.ts

**no-explicit-any (12 errors)**: Use of `any` in:
- src/lib/services/group-repository.ts (6 occurrences)
- src/app/api/cron/calculate-days/__tests__/route.test.ts (5 occurrences)
- src/lib/services/employment-type-repository.ts (1 occurrence)

**consistent-type-imports (10 errors)**: Non-type imports used only as types:
- src/app/api/cron/calculate-days/__tests__/route.test.ts (5 occurrences) -- `import()` type annotations forbidden
- src/trpc/routers/__tests__/vacation-helpers.test.ts (3 occurrences) -- `import()` type annotations forbidden
- src/app/api/internal/notifications/publish/route.ts (1 occurrence) -- `NextRequest` should be type import
- src/lib/calculation/monthly.ts (1 occurrence) -- all imports only used as types

**prefer-const (1 error)**: `absenceCount` in team-stats-cards.tsx should be `const`.

**no-require-imports (1 error)**: `require()` in src/lib/pubsub/singleton.ts.

### Build Artifact Lint Errors (1,720 errors)

The ESLint config ignores `.next/` but not `apps/web/.next/`. The `apps/web/.next/` directory contains stale build artifacts from before the monorepo flattening. These 1,720 errors are all in generated JavaScript files and are not real source code issues. The ignore pattern needs to include `apps/web/.next/` or the directory should be deleted.

---

## Root Cause Summary

### Cause 1: Component-to-API Naming Convention Mismatch (approx. 536 errors)

The single largest source of errors. Components were written against the Go backend's REST API which used `snake_case` JSON field names (and OpenAPI-generated types in `src/types/legacy-api-types.ts`). After migrating to tRPC + Prisma, the API returns `camelCase` field names. Components still:
1. Access data using `snake_case` property names (TS2551, TS2339)
2. Cast tRPC responses to legacy `snake_case` types (TS2352)
3. Pass tRPC data to functions expecting legacy types (TS2345)
4. Send mutations with wrong property names (TS2561)
5. Use `{ path, body }` mutation input shape from old OpenAPI client (TS2353)

**Affected error codes**: TS2551, TS2353, TS2352, TS2345, TS2339, TS2561, TS2322, TS2741, TS2740, TS2739

### Cause 2: Missing Vitest Global Type Declarations (612 errors)

Test files in `src/lib/calculation/__tests__/` use Vitest globals (`describe`, `it`, `expect`) without importing them. Other test directories import them explicitly.

**Affected error codes**: TS2304, TS2582

### Cause 3: Implicit `any` in Test Files (68 errors)

Callback parameters in test files lack type annotations.

**Affected error code**: TS7006

### Cause 4: Unused Variables and Imports (29 lint errors)

Various files have unused imports, variables, and destructured values left from the restructuring.

### Cause 5: Object Possibly Undefined in Tests (21 errors)

Test assertions access potentially undefined array elements without guards.

---

## Correct Patterns (current codebase)

### Import Paths
```ts
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { handleServiceError } from "@/trpc/errors"
import { requirePermission } from "@/lib/auth/middleware"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import * as someService from "@/lib/services/some-service"
import type { PrismaClient } from "@/generated/prisma/client"
import { useSomething } from "@/hooks"
```

### Router Shape (camelCase output schemas)
```ts
const outputSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),     // camelCase
  isActive: z.boolean(),            // camelCase
  createdAt: z.date(),              // camelCase
  updatedAt: z.date(),              // camelCase
})
```

### Mutation Input Shape (flat, no path/body wrapper)
```ts
// Update input -- flat object with id
const updateInput = z.object({
  id: z.string().uuid(),
  name: z.string().optional(),
  isActive: z.boolean().optional(),   // camelCase
})

// Component usage
mutation.mutateAsync({ id: "...", name: "...", isActive: true })
```

### Hook Shape
```ts
import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

export function useItems(options = {}) {
  const trpc = useTRPC()
  return useQuery(trpc.items.list.queryOptions(input, { enabled }))
}

export function useUpdateItem() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.items.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.items.list.queryKey() })
    },
  })
}
```

### Test File Imports
```ts
import { describe, it, expect, vi } from "vitest"
```

### Data Access in Components (camelCase)
```ts
// Correct: use camelCase from tRPC/Prisma
costCenter.isActive      // not is_active
costCenter.createdAt     // not created_at
employee.firstName       // not first_name
employee.personnelNumber // not personnel_number
dayPlan.planType         // not plan_type
```

---

## Files Importing Legacy Types (149 files)

149 files across the codebase import from `@/types/legacy-api-types`. The most commonly used legacy schemas are:
- Employee (12 uses)
- Absence (11)
- Shift (8)
- AuditLog (8)
- Team (7)
- Department (7)
- DayPlan (7)
- WeekPlan (6)
- TeamMember (6)
- Tariff (5)

These legacy types use `snake_case` field names matching the old Go backend. Components that type their props/state with these legacy types then access response data using snake_case, causing the TS2551/TS2339 mismatches.
