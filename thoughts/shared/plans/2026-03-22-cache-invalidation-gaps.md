# Implementation Plan: Cache Invalidation Gaps

**Date:** 2026-03-22
**Based on:** `thoughts/shared/research/2026-03-22-cache-invalidation-gaps.md`
**Scope:** 4 hook files, 8 mutation hooks, adding missing cross-router cache invalidation

---

## Phase 1: `src/hooks/use-billing-payments.ts`

### Hooks to modify

#### 1.1 `useCreateBillingPayment` (line 65)

**Current `onSuccess`** invalidates 4 queries (openItems.list, openItems.getById, openItems.summary, payments.list).

**Add after the existing invalidations (after line 82):**
```ts
queryClient.invalidateQueries({
  queryKey: trpc.billing.documents.list.queryKey(),
})
queryClient.invalidateQueries({
  queryKey: trpc.billing.documents.getById.queryKey(),
})
```

**Rationale:** Creating a payment changes the document's computed `paymentStatus` (UNPAID/PARTIAL/PAID/OVERPAID). Both the document list view (which shows status badges) and the document detail view (which shows payment totals) become stale.

#### 1.2 `useCancelBillingPayment` (line 87)

**Current `onSuccess`** invalidates the same 4 queries.

**Add after the existing invalidations (after line 103):**
```ts
queryClient.invalidateQueries({
  queryKey: trpc.billing.documents.list.queryKey(),
})
queryClient.invalidateQueries({
  queryKey: trpc.billing.documents.getById.queryKey(),
})
```

**Rationale:** Same as 1.1 -- cancelling a payment also changes the document's payment status.

### No import changes needed
The `trpc` object already provides access to `billing.documents` via the same `useTRPC()` hook.

---

## Phase 2: `src/hooks/use-billing-document-templates.ts`

### Hooks to modify

#### 2.1 `useCreateBillingDocumentTemplate` (line 32)

**Current `onSuccess`** invalidates only `billing.documentTemplates.list`.

**Add after the existing invalidation (after line 40):**
```ts
queryClient.invalidateQueries({
  queryKey: trpc.billing.documentTemplates.listByType.queryKey(),
})
queryClient.invalidateQueries({
  queryKey: trpc.billing.documentTemplates.getDefault.queryKey(),
})
```

**Rationale:** A new template with `isDefault: true` would change the default for its document type. The type-filtered list also becomes stale.

#### 2.2 `useUpdateBillingDocumentTemplate` (line 45)

**Current `onSuccess`** invalidates only `billing.documentTemplates.list`.

**Add after the existing invalidation (after line 53):**
```ts
queryClient.invalidateQueries({
  queryKey: trpc.billing.documentTemplates.listByType.queryKey(),
})
queryClient.invalidateQueries({
  queryKey: trpc.billing.documentTemplates.getDefault.queryKey(),
})
queryClient.invalidateQueries({
  queryKey: trpc.billing.documentTemplates.getById.queryKey(),
})
```

**Rationale:** Update can change name, content, `isDefault`, or `documentType`, affecting all three additional queries. The `getById` invalidation is needed so the detail view refreshes.

#### 2.3 `useDeleteBillingDocumentTemplate` (line 58)

**Current `onSuccess`** invalidates only `billing.documentTemplates.list`.

**Add after the existing invalidation (after line 66):**
```ts
queryClient.invalidateQueries({
  queryKey: trpc.billing.documentTemplates.listByType.queryKey(),
})
queryClient.invalidateQueries({
  queryKey: trpc.billing.documentTemplates.getDefault.queryKey(),
})
queryClient.invalidateQueries({
  queryKey: trpc.billing.documentTemplates.getById.queryKey(),
})
```

**Rationale:** Deleting a template that was the default changes the default for that type. The type-filtered list loses an entry. The `getById` cache for the deleted template should be cleared.

#### 2.4 `useSetDefaultBillingDocumentTemplate` (line 71)

**Current `onSuccess`** invalidates only `billing.documentTemplates.list`.

**Add after the existing invalidation (after line 79):**
```ts
queryClient.invalidateQueries({
  queryKey: trpc.billing.documentTemplates.listByType.queryKey(),
})
queryClient.invalidateQueries({
  queryKey: trpc.billing.documentTemplates.getDefault.queryKey(),
})
```

**Rationale:** Setting a new default removes `isDefault` from the previous default template and sets it on the new one, affecting the `getDefault` query and `listByType` (which may include the `isDefault` flag in its response).

### No import changes needed
All query keys are accessible through the existing `trpc` object.

---

## Phase 3: `src/hooks/use-orders.ts`

### Hook to modify

#### 3.1 `useDeleteOrder` (line 71)

**Current `onSuccess`** invalidates `orders.list` and `orders.getById`.

**Add after the existing invalidations (after line 82):**
```ts
queryClient.invalidateQueries({
  queryKey: trpc.orderAssignments.list.queryKey(),
})
queryClient.invalidateQueries({
  queryKey: trpc.orderAssignments.byOrder.queryKey(),
})
queryClient.invalidateQueries({
  queryKey: trpc.orderBookings.list.queryKey(),
})
```

**Rationale:** Deleting an order cascades to its assignments and bookings (either via Prisma cascade or by leaving them orphaned). The cached lists of order assignments and order bookings must be invalidated to avoid showing references to a deleted order. Note: the reverse direction (assignment/booking mutations invalidating orders) is already correctly implemented.

### No import changes needed
`orderAssignments` and `orderBookings` are top-level routers, accessible through the existing `trpc` object.

---

## Phase 4: `src/hooks/use-schedules.ts`

### Hook to modify

#### 4.1 `useExecuteSchedule` (line 168)

**Current `onSuccess`** invalidates `schedules.list`, `employees.dayView`, and `employeeDayPlans.list`.

**Change:** Replace the manual `employees.dayView` invalidation with `useTimeDataInvalidation()`, which covers `dayView` plus the 5 missing queries (dailyValues.list, dailyValues.listAll, monthlyValues.forEmployee, monthlyValues.yearOverview, monthlyValues.list).

**Step 1 - Add import (after line 2):**
```ts
import { useTimeDataInvalidation } from "./use-time-data-invalidation"
```

**Step 2 - Refactor the hook body.** Replace the entire `useExecuteSchedule` function with:
```ts
export function useExecuteSchedule() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const invalidateTimeData = useTimeDataInvalidation()
  return useMutation({
    ...trpc.schedules.execute.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.schedules.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.employeeDayPlans.list.queryKey(),
      })
      invalidateTimeData()
    },
  })
}
```

**What changes:**
- `const invalidateTimeData = useTimeDataInvalidation()` is added inside the hook
- The manual `queryClient.invalidateQueries({ queryKey: trpc.employees.dayView.queryKey() })` call is **removed** (it is already included in `invalidateTimeData()`)
- `invalidateTimeData()` is called, which invalidates:
  - `employees.dayView` (was already present, now via shared helper)
  - `dailyValues.list` (NEW)
  - `dailyValues.listAll` (NEW)
  - `monthlyValues.forEmployee` (NEW)
  - `monthlyValues.yearOverview` (NEW)
  - `monthlyValues.list` (NEW)
- `employeeDayPlans.list` invalidation is **kept** (not covered by `useTimeDataInvalidation()`)

**Rationale:** Schedule execution can run `calculate_days` and `calculate_months` tasks, which recalculate daily and monthly values. The `useTimeDataInvalidation()` pattern is used by `use-bookings.ts`, `use-daily-values.ts`, and `use-monthly-values.ts` for the same purpose.

---

## Verification Steps

### Step 1: TypeScript compilation
```bash
pnpm typecheck
```
**Expected result:** No NEW errors introduced. The baseline is ~1463 pre-existing errors. Verify by comparing the error count before and after changes. The key things to verify:
- `trpc.billing.documents.list.queryKey()` resolves (confirms router path is correct)
- `trpc.billing.documents.getById.queryKey()` resolves
- `trpc.billing.documentTemplates.listByType.queryKey()` resolves
- `trpc.billing.documentTemplates.getDefault.queryKey()` resolves
- `trpc.billing.documentTemplates.getById.queryKey()` resolves
- `trpc.orderAssignments.list.queryKey()` resolves
- `trpc.orderAssignments.byOrder.queryKey()` resolves
- `trpc.orderBookings.list.queryKey()` resolves
- `useTimeDataInvalidation` import resolves

### Step 2: Test execution
```bash
pnpm test
```
**Expected result:** All existing tests pass. No test changes required since these are frontend hooks with no unit tests of their own (they are integration-tested via E2E browser tests).

### Step 3: Lint check
```bash
pnpm lint
```
**Expected result:** No new lint errors.

### Step 4: Manual verification (optional)

For each file, the invalidation can be visually verified by:

1. **Billing payments:** Create a payment, then navigate to the document list/detail -- status should update immediately without page refresh.
2. **Document templates:** Create/update/delete a template, then check the type-filtered list and default template views.
3. **Orders:** Delete an order, then check the order assignments and order bookings lists -- they should no longer show the deleted order's data.
4. **Schedules:** Execute a schedule, then check daily values and monthly values views -- they should reflect any recalculations.

---

## Risk Assessment

### Low risk
- **All changes are additive** -- we are only adding more `invalidateQueries` calls to existing `onSuccess` handlers. No existing invalidations are removed (except `employees.dayView` in `use-schedules.ts`, which is replaced by `useTimeDataInvalidation()` that includes it).
- **Over-invalidation is safe** -- Calling `invalidateQueries` on a query key that has no cached data is a no-op. The worst case is slightly more refetching than necessary, which is the intended conservative pattern used throughout the codebase.
- **No data mutations** -- These changes only affect client-side cache invalidation. They do not modify any server-side behavior, database queries, or business logic.

### Edge cases to be aware of
1. **Template default cascading:** When `setDefault` is called on template A, the service removes `isDefault` from all other templates of the same type. Using `queryKey()` with no arguments invalidates ALL cached variants, so all type-filtered views are correctly refreshed.
2. **Order deletion cascade:** Whether Prisma cascades the delete or not, the client cache needs invalidation regardless. The server-side behavior is not affected.
3. **Schedule execution scope:** Not all schedules run `calculate_days` or `calculate_months` tasks, but since we cannot determine the task type at the hook level, we conservatively invalidate all time data. This matches the existing pattern.
4. **`useTimeDataInvalidation` hook rules compliance:** The `useTimeDataInvalidation()` hook must be called at the top level of the `useExecuteSchedule` hook (not inside `onSuccess`), which is correctly shown in the plan. The returned function is then called inside `onSuccess`.

---

## Summary of All Changes

| # | File | Hook | Change |
|---|------|------|--------|
| 1 | `use-billing-payments.ts` | `useCreateBillingPayment` | Add `billing.documents.list` + `billing.documents.getById` invalidation |
| 2 | `use-billing-payments.ts` | `useCancelBillingPayment` | Add `billing.documents.list` + `billing.documents.getById` invalidation |
| 3 | `use-billing-document-templates.ts` | `useCreateBillingDocumentTemplate` | Add `listByType` + `getDefault` invalidation |
| 4 | `use-billing-document-templates.ts` | `useUpdateBillingDocumentTemplate` | Add `listByType` + `getDefault` + `getById` invalidation |
| 5 | `use-billing-document-templates.ts` | `useDeleteBillingDocumentTemplate` | Add `listByType` + `getDefault` + `getById` invalidation |
| 6 | `use-billing-document-templates.ts` | `useSetDefaultBillingDocumentTemplate` | Add `listByType` + `getDefault` invalidation |
| 7 | `use-orders.ts` | `useDeleteOrder` | Add `orderAssignments.list` + `orderAssignments.byOrder` + `orderBookings.list` invalidation |
| 8 | `use-schedules.ts` | `useExecuteSchedule` | Add import for `useTimeDataInvalidation`, replace manual `dayView` invalidation with `invalidateTimeData()` |

**Total: 8 hooks modified across 4 files. 1 new import added.**
