# Cache Invalidation Gaps Research

**Date:** 2026-03-22
**Scope:** 4 hook files with missing cross-router cache invalidation

---

## 1. Established Invalidation Pattern

The codebase uses a consistent pattern for cache invalidation in mutation hooks:

```ts
export function useSomeMutation() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.router.procedure.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.router.query.queryKey(),
      })
    },
  })
}
```

**Key conventions observed:**
- `queryKey()` called with no arguments invalidates ALL cached variants of that query (all filter combinations)
- Cross-router invalidation is expected when a mutation in router A affects data served by router B
- The `useTimeDataInvalidation()` shared hook centralizes invalidation of time-tracking related data (dayView, dailyValues.list, dailyValues.listAll, monthlyValues.forEmployee, monthlyValues.yearOverview, monthlyValues.list)

**Well-implemented examples:**

1. **`use-bookings.ts`** -- `useCreateBooking`, `useUpdateBooking`, `useDeleteBooking` all call `invalidateTimeData()` to invalidate dailyValues and monthlyValues, since bookings feed into day calculations.

2. **`use-order-assignments.ts`** -- `useCreateOrderAssignment` invalidates `trpc.orders.list.queryKey()` in addition to its own queries, because assignment counts affect order list display.

3. **`use-monthly-values.ts`** -- `useRecalculateMonth` invalidates 4 monthlyValues queries AND calls `invalidateTimeData()` for dailyValues, since recalculation regenerates daily aggregates.

---

## 2. Gap Analysis: File by File

### 2.1 `src/hooks/use-billing-payments.ts` (lines 65-107)

**Affected hooks:** `useCreateBillingPayment`, `useCancelBillingPayment`

**Current invalidations (both hooks invalidate the same set):**
- `trpc.billing.payments.openItems.list.queryKey()`
- `trpc.billing.payments.openItems.getById.queryKey()`
- `trpc.billing.payments.openItems.summary.queryKey()`
- `trpc.billing.payments.list.queryKey()`

**Missing invalidations:**
- `trpc.billing.documents.list.queryKey()` -- Document list shows status/totals that change when payments are created/cancelled. The `billing-payment-service.ts` computes `paymentStatus` (UNPAID/PARTIAL/PAID/OVERPAID) from payment amounts. Document list views typically show payment status badges.
- `trpc.billing.documents.getById.queryKey()` -- Document detail view shows payment totals, paid amounts, and status. After creating/cancelling a payment, the document detail view goes stale.

**Router paths confirmed:**
- `billing` -> `documents` -> `list` (query) -- from `src/trpc/routers/billing/documents.ts` line 148
- `billing` -> `documents` -> `getById` (query) -- from `src/trpc/routers/billing/documents.ts` line 163
- Both are registered in `src/trpc/routers/billing/index.ts` as `documents: billingDocumentsRouter`

**Exact invalidation calls to add (same for both `useCreateBillingPayment` and `useCancelBillingPayment`):**
```ts
queryClient.invalidateQueries({
  queryKey: trpc.billing.documents.list.queryKey(),
})
queryClient.invalidateQueries({
  queryKey: trpc.billing.documents.getById.queryKey(),
})
```

---

### 2.2 `src/hooks/use-billing-document-templates.ts` (lines 32-82)

**Affected hooks (all 5 mutation hooks):**
- `useCreateBillingDocumentTemplate` (line 32)
- `useUpdateBillingDocumentTemplate` (line 45)
- `useDeleteBillingDocumentTemplate` (line 58)
- `useSetDefaultBillingDocumentTemplate` (line 71)
- (implicit: all 4 above share the same gap)

**Current invalidations (all 5 hooks):**
- `trpc.billing.documentTemplates.list.queryKey()` -- only the general list

**Missing invalidations (all 5 hooks):**
- `trpc.billing.documentTemplates.listByType.queryKey()` -- This query returns templates filtered by document type (OFFER, INVOICE, etc.). When a template is created/updated/deleted, this filtered list goes stale. The `listByType` procedure exists at `src/trpc/routers/billing/documentTemplates.ts` line 72.
- `trpc.billing.documentTemplates.getDefault.queryKey()` -- This query returns the default template for a given document type. When `setDefault` is called, or when a template marked `isDefault` is created/updated/deleted, this query goes stale. The `getDefault` procedure exists at `src/trpc/routers/billing/documentTemplates.ts` line 87.

**Additionally for `useUpdateBillingDocumentTemplate` and `useDeleteBillingDocumentTemplate`:**
- `trpc.billing.documentTemplates.getById.queryKey()` -- The detail view should also be invalidated on update/delete. Currently only `list` is invalidated.

**Router paths confirmed:**
- `billing` -> `documentTemplates` -> `listByType` (query with `{ documentType }` input)
- `billing` -> `documentTemplates` -> `getDefault` (query with `{ documentType }` input)
- `billing` -> `documentTemplates` -> `getById` (query with `{ id }` input)

**Exact invalidation calls to add:**

For ALL 5 mutation hooks, add:
```ts
queryClient.invalidateQueries({
  queryKey: trpc.billing.documentTemplates.listByType.queryKey(),
})
queryClient.invalidateQueries({
  queryKey: trpc.billing.documentTemplates.getDefault.queryKey(),
})
```

For `useUpdateBillingDocumentTemplate` and `useDeleteBillingDocumentTemplate`, additionally add:
```ts
queryClient.invalidateQueries({
  queryKey: trpc.billing.documentTemplates.getById.queryKey(),
})
```

---

### 2.3 `src/hooks/use-orders.ts` (lines 71-85)

**Affected hook:** `useDeleteOrder`

**Current invalidations:**
- `trpc.orders.list.queryKey()`
- `trpc.orders.getById.queryKey()`

**Missing invalidations:**
- `trpc.orderAssignments.list.queryKey()` -- When an order is deleted, its assignments become orphaned. The order assignments list view would still show assignments referencing the deleted order. The `orderAssignments.list` procedure exists at `src/trpc/routers/orderAssignments.ts` line 132.
- `trpc.orderAssignments.byOrder.queryKey()` -- Same reasoning; the per-order assignment view also needs refresh.
- `trpc.orderBookings.list.queryKey()` -- When an order is deleted, its bookings become orphaned. The order bookings list view would still show bookings for the deleted order. The `orderBookings.list` procedure exists at `src/trpc/routers/orderBookings.ts` line 226.

**Note:** The reverse invalidation is already implemented correctly. In `use-order-assignments.ts`, create/update/delete of assignments invalidates `trpc.orders.list.queryKey()`. Similarly in `use-order-bookings.ts`, mutations invalidate `trpc.orders.list.queryKey()`. The gap is only in the other direction (order deletion not invalidating child resources).

**Router paths confirmed:**
- `orderAssignments` -> `list` (top-level router, not nested)
- `orderAssignments` -> `byOrder` (top-level router)
- `orderBookings` -> `list` (top-level router)

**Exact invalidation calls to add to `useDeleteOrder`:**
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

---

### 2.4 `src/hooks/use-schedules.ts` (lines 168-185)

**Affected hook:** `useExecuteSchedule`

**Current invalidations:**
- `trpc.schedules.list.queryKey()`
- `trpc.employees.dayView.queryKey()`
- `trpc.employeeDayPlans.list.queryKey()`

**Missing invalidations:**
- `trpc.dailyValues.list.queryKey()` -- Schedule execution with `calculate_days` task recalculates daily values. The daily values list view (month view, week view) goes stale. The `dailyValues.list` procedure exists at `src/trpc/routers/dailyValues.ts` line 173.
- `trpc.dailyValues.listAll.queryKey()` -- The admin daily values view also goes stale. The `dailyValues.listAll` procedure exists at `src/trpc/routers/dailyValues.ts` line 212.
- `trpc.monthlyValues.forEmployee.queryKey()` -- Schedule execution with `calculate_months` task recalculates monthly values. The `monthlyValues.forEmployee` procedure exists at `src/trpc/routers/monthlyValues.ts` line 352.
- `trpc.monthlyValues.yearOverview.queryKey()` -- Year overview also goes stale after monthly recalculation. The `monthlyValues.yearOverview` procedure exists at `src/trpc/routers/monthlyValues.ts` line 385.
- `trpc.monthlyValues.list.queryKey()` -- Admin monthly values list also goes stale. The `monthlyValues.list` procedure exists at `src/trpc/routers/monthlyValues.ts` line 421.

**Alternative approach:** The codebase has `useTimeDataInvalidation()` in `src/hooks/use-time-data-invalidation.ts` which invalidates exactly the right set:
- `trpc.employees.dayView.queryKey()` (already done manually)
- `trpc.dailyValues.list.queryKey()` (MISSING)
- `trpc.dailyValues.listAll.queryKey()` (MISSING)
- `trpc.monthlyValues.forEmployee.queryKey()` (MISSING)
- `trpc.monthlyValues.yearOverview.queryKey()` (MISSING)
- `trpc.monthlyValues.list.queryKey()` (MISSING)

**Recommended approach:** Replace the manual `employees.dayView` invalidation with `useTimeDataInvalidation()` (which already includes dayView). This follows the same pattern used by `useCreateBooking`, `useApproveDailyValue`, and `useRecalculateMonth`.

**Exact changes to `useExecuteSchedule`:**

Replace:
```ts
queryClient.invalidateQueries({
  queryKey: trpc.employees.dayView.queryKey(),
})
```

With `invalidateTimeData()` call (which covers dayView + dailyValues + monthlyValues), plus keep the `employeeDayPlans.list` invalidation.

The refactored hook:
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

---

## 3. Edge Cases and Considerations

### 3.1 Billing Payments -> Documents
- The `billing-payment-service.ts` creates/cancels payment records and modifies `paymentStatus` which is derived data (UNPAID/PARTIAL/PAID/OVERPAID). The document's own record in `BillingDocument` table is not directly updated; rather, the payment status is computed from joined payment records. However, `billing.documents.getById` includes payment data, so it must be invalidated.

### 3.2 Template Default Cascading
- When `setDefault` is called on template A, the service likely removes `isDefault` from all other templates of the same type and sets it on A. This means both `list`, `listByType`, AND `getDefault` all need invalidation because multiple templates are affected.

### 3.3 Order Deletion Cascade
- Prisma's cascade behavior (if configured) may automatically delete OrderAssignments and OrderBookings when an Order is deleted. Even so, the cached query data on the client is stale and needs invalidation regardless of server-side cascade behavior.

### 3.4 Schedule Execution Scope
- Not all schedules have `calculate_days` or `calculate_months` tasks. Some may have other task types. However, since we cannot know at the hook level which task types a schedule contains, the safest approach is to always invalidate daily/monthly values on any schedule execution. This matches the existing conservative invalidation pattern in the codebase.

### 3.5 Import Consideration for `use-schedules.ts`
- Using `useTimeDataInvalidation()` requires adding the import: `import { useTimeDataInvalidation } from "./use-time-data-invalidation"`. This import pattern is already used in `use-bookings.ts`, `use-daily-values.ts`, and `use-monthly-values.ts`.

---

## 4. Summary of All Changes

| File | Hook | Missing Invalidation Keys |
|------|------|--------------------------|
| `use-billing-payments.ts` | `useCreateBillingPayment` | `billing.documents.list`, `billing.documents.getById` |
| `use-billing-payments.ts` | `useCancelBillingPayment` | `billing.documents.list`, `billing.documents.getById` |
| `use-billing-document-templates.ts` | `useCreateBillingDocumentTemplate` | `billing.documentTemplates.listByType`, `billing.documentTemplates.getDefault` |
| `use-billing-document-templates.ts` | `useUpdateBillingDocumentTemplate` | `billing.documentTemplates.listByType`, `billing.documentTemplates.getDefault`, `billing.documentTemplates.getById` |
| `use-billing-document-templates.ts` | `useDeleteBillingDocumentTemplate` | `billing.documentTemplates.listByType`, `billing.documentTemplates.getDefault`, `billing.documentTemplates.getById` |
| `use-billing-document-templates.ts` | `useSetDefaultBillingDocumentTemplate` | `billing.documentTemplates.listByType`, `billing.documentTemplates.getDefault` |
| `use-orders.ts` | `useDeleteOrder` | `orderAssignments.list`, `orderAssignments.byOrder`, `orderBookings.list` |
| `use-schedules.ts` | `useExecuteSchedule` | `dailyValues.list`, `dailyValues.listAll`, `monthlyValues.forEmployee`, `monthlyValues.yearOverview`, `monthlyValues.list` (use `useTimeDataInvalidation()`) |

**Total: 8 hooks need changes across 4 files.**
