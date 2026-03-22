# Research: Cache Invalidation E2E Browser Tests

**Date:** 2026-03-21
**Purpose:** Document existing codebase patterns for writing browser E2E tests that verify React Query / tRPC cache invalidation correctness.

---

## 1. Existing E2E Browser Test Patterns

### File structure and configuration

- **Config:** `playwright.config.ts` -- workers: 1, fullyParallel: false, baseURL: `http://localhost:3001`, locale: `de-DE`, viewport: 1280x1080
- **Global setup:** `src/e2e-browser/global-setup.ts` -- runs SQL cleanup via psql to remove E2E-prefixed data and reset number sequences before suite
- **Auth setup:** `src/e2e-browser/auth.setup.ts` -- saves admin/user sessions to `.auth/admin.json` / `.auth/user.json`
- **Helpers:** `src/e2e-browser/helpers/auth.ts`, `nav.ts`, `forms.ts`
- **Test projects:** `setup` (auth), `admin-tests` (uses Desktop Chrome, admin storage state)

### Key helpers

| Helper | File | Purpose |
|--------|------|---------|
| `navigateTo(page, path)` | `nav.ts` | `page.goto(path)` + waits for `main#main-content` |
| `waitForTableLoad(page)` | `nav.ts` | Waits for first `table tbody tr` to be visible |
| `expectPageTitle(page, title)` | `nav.ts` | Asserts `h1` inside `main#main-content` |
| `openCreateDialog(page)` | `forms.ts` | Clicks `+` button, waits for sheet open |
| `waitForSheet(page)` | `forms.ts` | Returns locator for `[data-slot="sheet-content"][data-state="open"]` |
| `fillInput(page, id, value)` | `forms.ts` | `#${id}` fill |
| `selectOption(page, triggerLabel, optionText)` | `forms.ts` | Clicks combobox near label, selects option |
| `submitSheet(page)` / `submitAndWaitForClose(page)` | `forms.ts` | Clicks last button in sheet footer, waits for sheet close |
| `openRowActions(page, rowText)` | `forms.ts` | Opens dropdown menu on table row |
| `clickMenuItem(page, text)` | `forms.ts` | Clicks menu item in open dropdown |
| `confirmDelete(page)` | `forms.ts` | Confirms in sheet-based confirm dialog |
| `expectTableContains(page, text)` / `expectTableNotContains(page, text)` | `forms.ts` | Asserts table row presence |
| `expectToastSuccess(page)` | `forms.ts` | Asserts `[role="status"][aria-live="polite"]` is visible |
| `clickTab(page, name)` | `forms.ts` | Clicks tab by role |

### Common patterns

- All specs use `test.describe.serial()` -- tests run in order, share state via setup tests
- E2E data uses `E2E` prefix convention for easy cleanup
- Navigation always uses `navigateTo()` which waits for `main#main-content`
- Tests navigate fresh to each page (each test opens its own page)
- No assertions on page reload avoidance in existing tests (they navigate between tests)

### ConfirmDialog UI

The `ConfirmDialog` component (`src/components/ui/confirm-dialog.tsx`) uses a **Sheet** with `side="bottom"`, not a `[role="dialog"]` element. It has:
- `SheetContent` with `[data-slot="sheet-content"]`
- Confirm button is the last button in `SheetFooter`
- Labels: `confirmLabel` and `cancelLabel` props

**Important:** The billing payment dialogs (`PaymentFormDialog`, `PaymentCancelDialog`) use actual `Dialog` elements (`[role="dialog"]`), not sheets. The order deletion uses `ConfirmDialog` (sheet).

---

## 2. Billing Payment Flow (Scenarios 1 & 2)

### URLs

- List: `/orders/open-items`
- Detail: `/orders/open-items/[documentId]`

### Open Items List UI (`src/components/billing/open-item-list.tsx`)

- Table columns: Rechnungsnr., Kunde, Rechnungsdatum, Fallig am, Brutto, Bezahlt, Offen, Status
- Rows are clickable, navigate to `/orders/open-items/{doc.id}`
- Status shown via `PaymentStatusBadge` component
- Status labels: `UNPAID` -> "Offen", `PARTIAL` -> "Teilzahlung", `PAID` -> "Bezahlt", `OVERPAID` -> "Uberzahlt"
- Summary card `OpenItemsSummaryCard` at top (shows "Gesamt offen")

### Open Item Detail UI (`src/components/billing/open-item-detail.tsx`)

- Header: "Rechnung {number}" + `PaymentStatusBadge`
- "Zahlung erfassen" button (hidden when isPaid)
- Summary card: rows with label/value pairs including "Bezahlt" and "Offen" amounts
- Payment history table with columns: Datum, Betrag, Art, Skonto, Status, Notizen, Aktionen
- Each active payment row has "Stornieren" button (red)
- Payment status: "Aktiv" (green) or "Storniert" (red)

### Payment Form Dialog (`src/components/billing/payment-form-dialog.tsx`)

- `Dialog` element (role="dialog")
- Title: "Zahlung erfassen"
- Fields: `#payment-date`, `#payment-amount`, `#payment-type` (Select: Uberweisung/Bar), `#payment-discount` (Checkbox), `#payment-notes`
- Default amount: `openAmount.toFixed(2)` (pre-filled)
- Default type: "BANK" (Uberweisung)
- Submit button: "Zahlung erfassen"
- On success: calls `toast.success('Zahlung erfasst')` and closes dialog

### Payment Cancel Dialog (`src/components/billing/payment-cancel-dialog.tsx`)

- `Dialog` element (role="dialog")
- Title: "Zahlung stornieren"
- Description text about reverting to open amount
- Fields: `#cancel-reason` (optional textarea)
- Confirm button: "Bestatigen"
- On success: calls `toast.success('Zahlung storniert')` and closes dialog

### Cache Invalidation (hooks)

**`useCreateBillingPayment`** (`src/hooks/use-billing-payments.ts` lines 66-84):
- Invalidates: `openItems.list`, `openItems.getById`, `openItems.summary`, `payments.list`
- Does NOT invalidate: `billing.documents.list`, `billing.documents.getById`

**`useCancelBillingPayment`** (`src/hooks/use-billing-payments.ts` lines 87-107):
- Invalidates: same as create (openItems.list, openItems.getById, openItems.summary, payments.list)

### Existing E2E test coverage (`src/e2e-browser/32-billing-open-items.spec.ts`)

The existing test (`UC-ORD-03`) tests the full payment flow but navigates to the page fresh for each step. It does NOT test cache invalidation -- each step does a full `navigateTo()` to the detail page. The test:
1. Creates address + invoice (pre-conditions)
2. Navigates to open-items, verifies "Offen" status, 1.190,00 amount
3. Navigates to detail, records 500 partial payment, verifies "Teilzahlung" + 690,00 open
4. Navigates to detail again, records rest with Skonto, verifies "Bezahlt"
5. Navigates to detail again, cancels bar payment, verifies "Teilzahlung" reverted

**Gap for cache invalidation test:** Test must stay on the detail page after payment and verify status/amounts update WITHOUT re-navigating.

### Pre-requisite for payment test

Need a finalized invoice (PRINTED status) to appear in open items. Must:
1. Create CRM address (E2E prefix)
2. Create invoice document (type=INVOICE) via `/orders/documents/new`
3. Add a position to the invoice
4. Finalize the invoice (Abschliessen)
5. Navigate to `/orders/open-items` to see it

---

## 3. Billing Document Templates (Scenario 3)

### URLs

- Template list: `/orders/templates`
- Document creation: `/orders/documents/new`
- Document editor: `/orders/documents/[id]`

### Template List UI (`src/components/billing/template-list.tsx`)

- Page heading: "Dokumentvorlagen"
- "Neue Vorlage" button to create
- Each template rendered as a Card with:
  - Template name + "Standard" badge (if isDefault)
  - Document type label below name
  - Star icon button ("Als Standard setzen") -- visible only when NOT already default AND has documentType
  - Pencil icon button (edit)
  - Trash icon button (delete)
- Template form uses `TemplateFormSheet` component (sheet)

### Template Form Sheet (`src/components/billing/template-form-sheet.tsx`)

- Fields: name, documentType (Select), headerText (rich text), footerText (rich text), isDefault (Checkbox)
- DOCUMENT_TYPES: OFFER, ORDER_CONFIRMATION, DELIVERY_NOTE, SERVICE_NOTE, RETURN_DELIVERY, INVOICE, CREDIT_NOTE

### Document Creation UI (`src/components/billing/document-form.tsx`)

- **Templates are NOT used in the creation form.** The form has no template selector.
- The form is a standalone page at `/orders/documents/new` with type, addressId, payment terms, etc.

### Document Editor UI (`src/components/billing/document-editor.tsx`)

- Templates ARE used in the editor. When a document is in DRAFT status, a Select dropdown "Vorlage anwenden..." appears in the toolbar.
- Uses `useBillingDocumentTemplatesByType(doc.type)` to fetch templates filtered by document type.
- Applying a template calls `updateMutation.mutate({ id, headerText, footerText })`.

### Cache Invalidation (hooks)

**`useSetDefaultBillingDocumentTemplate`** (`src/hooks/use-billing-document-templates.ts` lines 71-82):
- Invalidates: `documentTemplates.list`
- Does NOT invalidate: `documentTemplates.getDefault`, `documentTemplates.listByType`

**Gap:** `setDefault` does not invalidate `getDefault` or `listByType`. However, since the document editor uses `listByType` (not `getDefault`), and the template list uses `list`, the template list WILL update via its invalidation. The "Standard" badge in the template list should refresh after setDefault.

### Feasible test scenario

Since the document creation form does NOT use templates, testing "template pre-selected in creation UI" is NOT feasible with the current codebase. Instead, we can test:
1. Create a template for OFFER type
2. Set it as default (click Star icon)
3. Verify the "Standard" badge appears on the template card WITHOUT reload
4. Open a draft OFFER document and verify the template appears in the "Vorlage anwenden..." dropdown

---

## 4. Order Deletion (Scenario 4)

### URLs

- Order list: `/admin/orders` (tab "Auftrage")
- Order detail: `/admin/orders/[id]` (tabs: Details, Zuweisungen, Buchungen)

### Order List UI (`src/app/[locale]/(dashboard)/admin/orders/page.tsx`)

- Uses `OrderDataTable` component for the table
- Delete via `ConfirmDialog` (sheet, bottom) with variant="destructive"
- Delete button visible in row actions menu

### Order Detail UI (`src/app/[locale]/(dashboard)/admin/orders/[id]/page.tsx`)

- Header: order name + status badge + code
- Trash icon button opens `ConfirmDialog` for order deletion
- On confirm delete: `deleteMutation.mutateAsync({ id })` then `router.push('/admin/orders')`
- Tabs: "Details", "Zuweisungen", "Buchungen"
- Zuweisungen tab: shows `OrderAssignmentDataTable` with assignments
- Buchungen tab: shows `OrderBookingDataTable` with bookings
- Empty state text: "emptyAssignments" / "emptyBookings" from translations

### Cache Invalidation (hooks)

**`useDeleteOrder`** (`src/hooks/use-orders.ts` lines 71-85):
- Invalidates: `orders.list`, `orders.getById`
- Does NOT invalidate: `orderAssignments.*`, `orderBookings.*`

**Issue for cache invalidation test:** When an order is deleted from the detail page, the code does `router.push('/admin/orders')` which triggers a full navigation. The order list will refetch via the query invalidation. The assignments/bookings are scoped to the order, so they don't need separate invalidation (the order detail page is left).

**Feasible test scenario:** Delete an order from the orders LIST page (via row actions) and verify the row disappears from the table without reload. The existing delete flow on the list page uses `ConfirmDialog` and after delete, `setDeleteOrder(null)` is called. The `orders.list` invalidation will cause the table to re-render.

---

## 5. Schedule Execution (Scenario 5)

### URLs

- Schedule list: `/admin/schedules`
- Schedule detail: `/admin/schedules/[id]`
- Timesheet: `/timesheet`

### Schedule Detail UI (`src/app/[locale]/(dashboard)/admin/schedules/[id]/page.tsx`)

- Header: schedule name + timing badge + enabled/disabled status
- "Jetzt ausfuhren" button (Play icon) triggers `executeMutation.mutateAsync({ scheduleId })`
- Tabs: "Aufgaben" (tasks) and "Ausfuhrungen" (executions)
- `ScheduleExecutionLog` component shows execution history
- `ScheduleTaskList` component shows tasks

### Cache Invalidation (hooks)

**`useExecuteSchedule`** (`src/hooks/use-schedules.ts` lines 168-184):
- Invalidates: `schedules.list`, `employees.dayView`, `employeeDayPlans.list`
- Does NOT invalidate: `schedules.executions`, `schedules.getById`

**`useTimeDataInvalidation`** is NOT used by `useExecuteSchedule` -- it invalidates `employees.dayView` and `employeeDayPlans.list` directly.

**Missing invalidation:** `schedules.executions` is not invalidated after execution. This means the execution log on the schedule detail page may not update automatically without a reload.

### Timesheet UI (`/timesheet`)

- Uses day/week/month tabs
- Day view uses `useEmployeeDayView` hook (queries `employees.dayView`)
- Since `useExecuteSchedule` invalidates `employees.dayView`, navigating to the timesheet after execution should show updated data

### Feasible test scenario

1. Navigate to a schedule detail page
2. Click "Jetzt ausfuhren"
3. Verify that the execution log (Ausfuhrungen tab) updates -- NOTE: this may NOT work because `schedules.executions` is not invalidated
4. Navigate to timesheet and verify day view reflects changes

**Alternative feasible scenario:** Since `employees.dayView` IS invalidated, we can:
1. Be on the timesheet day view
2. Execute a schedule (via API or navigation)
3. Verify the timesheet updates

However, since the execution button is on the schedule detail page and the timesheet is a separate page, testing "without reload" in a single view is only possible on the schedule detail page (checking execution log). But the executions query is NOT invalidated.

---

## 6. tRPC Cache Invalidation Patterns

### General pattern

All mutation hooks follow the same pattern:
```typescript
useMutation({
  ...trpc.entity.action.mutationOptions(),
  onSuccess: () => {
    queryClient.invalidateQueries({
      queryKey: trpc.entity.list.queryKey(),
    })
    // ... more invalidations
  },
})
```

### Key invalidation relationships

| Mutation | Invalidates |
|----------|-------------|
| `createBillingPayment` | `openItems.list`, `openItems.getById`, `openItems.summary`, `payments.list` |
| `cancelBillingPayment` | `openItems.list`, `openItems.getById`, `openItems.summary`, `payments.list` |
| `setDefaultTemplate` | `documentTemplates.list` (NOT `getDefault` or `listByType`) |
| `deleteOrder` | `orders.list`, `orders.getById` (NOT `orderAssignments.*` or `orderBookings.*`) |
| `executeSchedule` | `schedules.list`, `employees.dayView`, `employeeDayPlans.list` (NOT `schedules.executions`) |
| `finalizeBillingDocument` | `documents.list`, `documents.getById` |
| `forwardBillingDocument` | `documents.list`, `documents.getById` |

### Missing/incomplete invalidations noted

1. `useSetDefaultBillingDocumentTemplate` does not invalidate `getDefault` or `listByType`
2. `useDeleteOrder` does not invalidate `orderAssignments` or `orderBookings` (but page navigates away)
3. `useExecuteSchedule` does not invalidate `schedules.executions` (execution log won't auto-update)
4. `useCreateBillingPayment` does not invalidate `billing.documents.list` (document list status won't update)

---

## 7. Summary: Feasible E2E Test Scenarios

### Scenario 1: Payment creates => detail view updates in-place
**Feasible.** Stay on `/orders/open-items/[id]`, create payment via dialog, verify status badge and amounts update without `navigateTo()`. The `openItems.getById` invalidation ensures the detail re-renders.

### Scenario 2: Payment cancel => detail view reverts
**Feasible.** Stay on detail page, click "Stornieren" on a payment row, confirm, verify status reverts to previous state. Same invalidation as create.

### Scenario 3: Template default => template list badge updates
**Feasible, but modified.** Since document creation form does NOT use templates, test should verify the "Standard" badge appears on the template list card after clicking the star icon, without reload. The `documentTemplates.list` invalidation covers this. For the document editor template dropdown, we can verify the template appears in the "Vorlage anwenden..." dropdown when opening a draft document.

### Scenario 4: Delete order => list updates in-place
**Feasible.** Stay on `/admin/orders`, delete an order via row actions + ConfirmDialog, verify the row disappears from the table. The `orders.list` invalidation covers this. For assignments/bookings, since the order detail page navigates away on delete, we cannot test those on the same page. Alternative: navigate to the order detail, add an assignment, go back to list, delete the order, verify row is gone.

### Scenario 5: Execute schedule => dependent views update
**Partially feasible.** The execution log (`schedules.executions`) is NOT invalidated by `useExecuteSchedule`, so verifying the execution log update without reload may fail. However, `schedules.list` IS invalidated, so if the schedule list shows last execution time, that would update. The `employees.dayView` and `employeeDayPlans.list` invalidations mean timesheet data should update, but that's on a different page.

**Best approach for scenario 5:** Navigate to the schedule list page, note the "last executed" or similar indicator, trigger execution via the detail page's "Jetzt ausfuhren" button, navigate back and check the list. OR: stay on the schedule detail page and check if the execution log tab receives new data (may require fixing the missing `schedules.executions` invalidation first).

---

## 8. Data Cleanup Requirements

The new test file should:
1. Use `E2E` prefix for all created data (e.g., "E2E Cache GmbH" for addresses)
2. Add cleanup SQL to `global-setup.ts` for payment, template, order, and schedule records
3. Follow the serial test pattern (`test.describe.serial`)
