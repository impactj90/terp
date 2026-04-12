# Implementation Plan: Cache Invalidation E2E Browser Tests

**Date:** 2026-03-21
**File to create:** `src/e2e-browser/cache-invalidation.spec.ts`
**Research:** `thoughts/shared/research/2026-03-21-cache-invalidation-e2e.md`

---

## Overview

Write Playwright E2E tests that verify React Query / tRPC cache invalidation correctness. Each test mutates data via the UI and then asserts the UI updates **without page reload or manual refetch** -- i.e., the test stays on the same page and relies purely on `queryClient.invalidateQueries()` to re-render.

Five test scenarios (all in one serial describe block):
1. **Payment creates** -- detail view updates status and amounts in-place
2. **Payment cancel** -- detail view reverts to OPEN status in-place
3. **Template default** -- template list badge appears in-place
4. **Delete order** -- order list row disappears in-place
5. **Execute schedule** -- schedule list "last executed" indicator updates in-place

---

## Phase 0: Data Cleanup (global-setup.ts)

### Changes to `src/e2e-browser/global-setup.ts`

Add the following cleanup SQL **before** the existing `-- Payment records (spec 32)` block:

```sql
-- Cache invalidation test cleanup (cache-invalidation.spec.ts)
-- Template cleanup
DELETE FROM billing_document_templates
WHERE name LIKE 'E2E%'
  AND tenant_id = '10000000-0000-0000-0000-000000000001';

-- Payment cleanup for cache test address (separate from spec 32's address)
DELETE FROM billing_payments WHERE document_id IN (
  SELECT bd.id FROM billing_documents bd
  JOIN crm_addresses ca ON bd.address_id = ca.id
  WHERE ca.company = 'E2E Cache GmbH'
);
DELETE FROM billing_document_positions WHERE document_id IN (
  SELECT bd.id FROM billing_documents bd
  JOIN crm_addresses ca ON bd.address_id = ca.id
  WHERE ca.company = 'E2E Cache GmbH'
);
DELETE FROM billing_documents WHERE address_id IN (
  SELECT id FROM crm_addresses WHERE company = 'E2E Cache GmbH'
);
DELETE FROM crm_addresses WHERE company = 'E2E Cache GmbH';

-- Order cleanup for cache test
DELETE FROM order_assignments WHERE order_id IN (SELECT id FROM orders WHERE code = 'E2E-CACHE');
DELETE FROM order_bookings WHERE order_id IN (SELECT id FROM orders WHERE code = 'E2E-CACHE');
DELETE FROM orders WHERE code = 'E2E-CACHE';
```

**Note:** The `E2E%` wildcard on templates is safe because no other spec creates templates. The `E2E Cache GmbH` address is unique to this spec. The `E2E-CACHE` order code is unique to this spec. Schedules reuse the existing `E2E Zeitplan` created by `08-automatisierung.spec.ts` (already cleaned by global-setup).

---

## Phase 1: File Structure

### File: `src/e2e-browser/cache-invalidation.spec.ts`

```typescript
import { test, expect } from "@playwright/test";
import { navigateTo, waitForTableLoad } from "./helpers/nav";
import {
  fillInput,
  submitAndWaitForClose,
  waitForSheet,
  expectTableContains,
  expectTableNotContains,
  openRowActions,
  clickMenuItem,
  confirmDelete,
  clickTab,
} from "./helpers/forms";
```

Use `test.describe.serial()` to run tests in order since they build on shared data from setup tests.

---

## Phase 2: Scenario 1 -- Payment Creates, Detail View Updates In-Place

### 2.1 Pre-requisite: Create address

**Test name:** `"Setup: Create address for cache test"`

**Steps:**
1. `navigateTo(page, "/crm/addresses")`
2. Click `page.getByRole("button", { name: "Neue Adresse" })`
3. `waitForSheet(page)`
4. `fillInput(page, "company", "E2E Cache GmbH")`
5. `fillInput(page, "city", "Berlin")`
6. `submitAndWaitForClose(page)`
7. `waitForTableLoad(page)` + `expectTableContains(page, "E2E Cache GmbH")`

### 2.2 Pre-requisite: Create and finalize invoice

**Test name:** `"Setup: Create and finalize invoice (1.190 EUR)"`

**Steps:**
1. `navigateTo(page, "/orders/documents")`
2. Click `page.getByRole("button", { name: /Neuer Beleg/i })`
3. Wait for URL `/orders/documents/new`
4. Select type "Rechnung": `page.locator("#type").click()` + `page.getByRole("option", { name: "Rechnung" }).click()`
5. Select address "E2E Cache GmbH": `page.locator("#addressId").click()` + `page.getByRole("option", { name: /E2E Cache GmbH/ }).click()`
6. Fill payment terms: `fillInput(page, "paymentTermDays", "30")`
7. Submit: `page.getByRole("button", { name: /Speichern/i }).click()`
8. Wait for URL `/orders/documents/[uuid]`
9. Add position: Click "Position hinzufugen" button
10. Fill position: description "Beratung", qty 1, price 1000, VAT 19
11. Wait 1s for totals recalculation
12. Click "Abschliessen" button
13. Confirm in dialog: `dialog.getByRole("button", { name: /Abschliessen/i }).click()`
14. Verify finalized: `page.getByText(/festgeschrieben|Abgeschlossen/i)`

Pattern follows exactly `32-billing-open-items.spec.ts` lines 48-125.

### 2.3 Navigate to open items detail and stay there

**Test name:** `"Scenario 1: Payment creates updates detail view without reload"`

**Steps:**
1. `navigateTo(page, "/orders/open-items")`
2. `waitForTableLoad(page)`
3. Find row with "E2E Cache GmbH", click it
4. Wait for URL `/orders/open-items/[uuid]`
5. **Assert initial state (before mutation):**
   - `expect(page.getByText("Offen").first()).toBeVisible()` -- status badge
   - `expect(page.locator("main")).toContainText(/1[.]190,00/)` -- open amount
6. **Perform payment (stay on page -- no navigateTo!):**
   - Click "Zahlung erfassen" button
   - Wait for `[role="dialog"]` to be visible
   - Clear + fill `#payment-amount` with "500"
   - Fill `#payment-notes` with "E2E Cache Teilzahlung"
   - Click dialog's "Zahlung erfassen" button
   - Wait for dialog to be hidden (`expect(dialog).toBeHidden({ timeout: 10_000 })`)
7. **Assert cache invalidation updated the UI (no reload!):**
   - `expect(page.getByText("Teilzahlung").first()).toBeVisible({ timeout: 10_000 })` -- status badge changed from "Offen" to "Teilzahlung"
   - `expect(page.locator("main")).toContainText(/500,00/)` -- "Bezahlt" row shows 500,00
   - `expect(page.locator("main")).toContainText(/690,00/)` -- "Offen" row shows 690,00
   - `expect(page.locator("main")).toContainText("E2E Cache Teilzahlung")` -- payment note in history

**Why this works:** `useCreateBillingPayment` invalidates `openItems.getById` which is the query powering the `OpenItemDetail` component. React Query refetches and the component re-renders with new data.

**Key constraint:** Between step 4 and step 7, there must be NO `navigateTo()`, `page.goto()`, or `page.reload()` calls. The test relies solely on React Query cache invalidation.

---

## Phase 3: Scenario 2 -- Cancel Payment, Detail View Reverts

**Test name:** `"Scenario 2: Cancel payment reverts status to OPEN without reload"`

**Steps:**
1. **Pre-check:** This test runs immediately after Scenario 1. The page is still on the open items detail page. However, since each test in `test.describe.serial` gets a **fresh page context**, we need to navigate once to the detail page.
2. `navigateTo(page, "/orders/open-items")`
3. `waitForTableLoad(page)`
4. Click the "E2E Cache GmbH" row
5. Wait for URL `/orders/open-items/[uuid]`
6. **Assert current state (Teilzahlung from Scenario 1):**
   - `expect(page.getByText("Teilzahlung").first()).toBeVisible({ timeout: 10_000 })`
7. **Cancel the payment (stay on page -- no further navigation!):**
   - Find the payment row with "500,00": `page.locator("table tbody tr").filter({ hasText: "500,00" })`
   - Click the "Stornieren" button within that row
   - Wait for `[role="dialog"]` to be visible
   - Click "Bestatigen" button in the cancel dialog
   - Wait for dialog to be hidden
8. **Assert cache invalidation updated the UI (no reload!):**
   - `expect(page.getByText("Storniert").first()).toBeVisible({ timeout: 10_000 })` -- payment row shows "Storniert"
   - `expect(page.getByText("Offen").first()).toBeVisible({ timeout: 10_000 })` -- status badge reverts to "Offen"
   - `expect(page.locator("main")).toContainText(/1[.]190,00/)` -- open amount reverts to full amount

**Why this works:** `useCancelBillingPayment` invalidates the same queries as `useCreateBillingPayment` (openItems.getById, openItems.list, etc.).

---

## Phase 4: Scenario 3 -- Template Default Badge Updates In-Place

**Test name:** `"Scenario 3a: Setup - Create template for Angebot type"`

**Steps:**
1. `navigateTo(page, "/orders/templates")`
2. Click "Neue Vorlage" button
3. `waitForSheet(page)`
4. Fill `#tpl-name` with "E2E Cache Vorlage"
5. Select document type "Angebot": Click the Select trigger for "Dokumenttyp", then select "Angebot"
6. `submitAndWaitForClose(page)` -- this uses the `TemplateFormSheet`'s submit which is a sheet footer button
7. Verify the template card appears: `expect(page.getByText("E2E Cache Vorlage")).toBeVisible()`

**Note:** The template form is a Sheet, not a Dialog. The form's submit uses `SheetFooter` -> last button. The helper `submitAndWaitForClose` handles this correctly.

However, looking at the template form more carefully: it's a `<form onSubmit>` inside a `Sheet`. The submit button is inside `<SheetFooter>` with `type="submit"`. The `submitAndWaitForClose` helper clicks the last button in `[data-slot="sheet-footer"]`, which should work.

**Test name:** `"Scenario 3b: Set default updates badge without reload"`

**Steps:**
1. `navigateTo(page, "/orders/templates")` -- navigate once
2. Wait for "E2E Cache Vorlage" card to be visible
3. **Assert initial state:** Verify NO "Standard" badge near the template:
   - Find the card containing "E2E Cache Vorlage"
   - Assert it does NOT contain "Standard"
4. **Click star icon (stay on page!):**
   - Find the card containing "E2E Cache Vorlage"
   - Click the button with `title="Als Standard setzen"` within that card
5. **Assert cache invalidation updated the UI (no reload!):**
   - `expect(page.getByText("Standard").first()).toBeVisible({ timeout: 10_000 })` -- "Standard" badge appears
   - The star button should disappear (because `isDefault` is now true)
   - The toast "Standard-Vorlage gesetzt" should appear

**Selectors for the template card:**
- Card container: `page.locator('[data-slot="card-content"]').filter({ hasText: "E2E Cache Vorlage" })` or more simply the enclosing card element.
- Star button: `page.getByTitle("Als Standard setzen")` -- this is a `<Button>` with `title="Als Standard setzen"` (only shown when NOT default AND has documentType).
- Standard badge: `page.getByText("Standard")` -- rendered as a `<Badge>` when `tpl.isDefault`.

**Why this works:** `useSetDefaultBillingDocumentTemplate` invalidates `documentTemplates.list` which is the query used by `BillingTemplateList`. The component re-renders with updated `isDefault`.

---

## Phase 5: Scenario 4 -- Delete Order, Row Disappears In-Place

**Test name:** `"Scenario 4a: Setup - Create order for cache test"`

**Steps:**
1. `navigateTo(page, "/admin/orders")`
2. `clickTab(page, "Auftrage")` -- ensure Auftrage tab is active
3. Click "Neuer Auftrag" button (`.first()` since header + empty state can both show it)
4. `waitForSheet(page)` -- wait for the OrderFormSheet
5. `fillInput(page, "code", "E2E-CACHE")`
6. `fillInput(page, "name", "E2E Cache Auftrag")`
7. `submitAndWaitForClose(page)`
8. `waitForTableLoad(page)`
9. `expectTableContains(page, "E2E-CACHE")`

**Test name:** `"Scenario 4b: Delete order removes row without reload"`

**Steps:**
1. `navigateTo(page, "/admin/orders")` -- navigate once to the page
2. `clickTab(page, "Auftrage")`
3. `waitForTableLoad(page)`
4. `expectTableContains(page, "E2E-CACHE")` -- verify order is present
5. **Delete via row actions (stay on page!):**
   - Find the row with "E2E-CACHE": `page.locator("table tbody tr").filter({ hasText: "E2E-CACHE" })`
   - Click the actions button (last button in the row) within the cell that has `e.stopPropagation()` -- use `openRowActions(page, "E2E-CACHE")`
   - Click the "Loschen" menu item: `clickMenuItem(page, /Löschen/)`
   - Wait for the ConfirmDialog (sheet-based): `confirmDelete(page)` -- this waits for the sheet and clicks the confirm button
6. **Assert cache invalidation updated the UI (no reload!):**
   - `expectTableNotContains(page, "E2E-CACHE")` -- row disappears
   - The count text should update (e.g., the "N Auftrage" text)

**Why this works:** `useDeleteOrder` invalidates `orders.list` which is the query used by the orders page. The `OrderDataTable` re-renders without the deleted order.

**Important selector detail:** The `OrderDataTable` row has `onClick={(e) => e.stopPropagation()}` on the last `<TableCell>` containing the dropdown menu. The `openRowActions` helper targets the row's last button, which is the `<DropdownMenuTrigger>`. After the menu opens, `clickMenuItem` targets `[role="menuitem"]` by name.

The delete uses `ConfirmDialog` which renders as a Sheet (`[data-slot="sheet-content"]`), so `confirmDelete(page)` from helpers is the correct function to use.

---

## Phase 6: Scenario 5 -- Execute Schedule, List Updates In-Place

### Analysis of feasibility

From the research:
- `useExecuteSchedule` invalidates `schedules.list`, `employees.dayView`, `employeeDayPlans.list`
- It does NOT invalidate `schedules.executions` (execution log won't auto-update on the detail page)
- The schedule detail page has a "Jetzt ausfuhren" button

**Best approach:** Stay on the schedule **list** page and verify that the list table updates after execution (since `schedules.list` IS invalidated). However, the "Jetzt ausfuhren" button is only on the **detail** page, not the list page.

**Alternative approach:** Use the schedule detail page. Click "Jetzt ausfuhren". The `schedules.list` is invalidated, but we're on the detail page. The detail page uses `useSchedule(id)` which queries `schedules.getById` -- this is NOT invalidated by `useExecuteSchedule`. However, `schedules.executions` is also NOT invalidated.

**Practical feasible approach:** Since neither `schedules.getById` nor `schedules.executions` is invalidated by `useExecuteSchedule`, testing on the schedule detail page may not show any visible change without reload.

**Revised approach for Scenario 5:** We test on the schedules **list** page. Since the list page does not have an execute button, we use a two-step approach:
1. Open the schedule detail page in a new context, execute, and verify the list page updates.

Actually, since each Playwright test gets a fresh page, we cannot have two pages. Let me reconsider.

**Final approach:** Navigate to the schedule detail page, execute the schedule, then verify that when we switch to the "Ausfuhrungen" tab, new data appears. But `schedules.executions` is NOT invalidated...

**Most honest approach:** Document that `schedules.executions` is NOT invalidated by `useExecuteSchedule` and test what IS invalidated. The most meaningful test: execute the schedule from the detail page, then navigate to `/admin/schedules` (list page) and verify the schedule row reflects the execution (e.g., a timestamp column). However, this requires a navigation which defeats the "no reload" purpose.

**Pragmatic decision:** For Scenario 5, we test from the schedule **detail** page. We click "Jetzt ausfuhren" and verify:
1. The button shows a loading state, then returns to normal (the mutation completed)
2. A success toast appears
3. Since `schedules.list` is invalidated but we're on the detail page, we verify by switching to the "Ausfuhrungen" tab and checking if the execution log received new data. Even though `schedules.executions` is not directly invalidated, the execution should complete server-side and the data may appear if there's some other invalidation mechanism or polling.

**If the execution log does NOT update (expected):** The test should document this as a known gap and instead verify:
- The mutation completed successfully (toast appears)
- The "Jetzt ausfuhren" button returns to enabled state
- Then navigate to the list to verify `schedules.list` cache was invalidated (this involves one navigation, acceptable since we're testing the LIST invalidation)

**Test name:** `"Scenario 5: Execute schedule updates list without reload"`

**Steps:**
1. **Pre-requisite:** A schedule "E2E Zeitplan" must exist (created by `08-automatisierung.spec.ts` which runs before this spec in alphabetical ordering). If it doesn't exist, create one.
   - Actually, since Playwright runs tests in filename order within the `admin-tests` project, `08-automatisierung.spec.ts` runs before `cache-invalidation.spec.ts` (alphabetically `0` < `c`). So "E2E Zeitplan" should exist.
   - BUT: the global-setup deletes schedules with `name LIKE 'E2E%'`, so it gets cleaned. Then `08-automatisierung` recreates it. Since specs run in order and `08` < `c` (cache), this is fine.

2. Navigate to the schedule list: `navigateTo(page, "/admin/schedules")`
3. `waitForTableLoad(page)`
4. `expectTableContains(page, "E2E Zeitplan")`
5. Click on "E2E Zeitplan" row to go to detail page
6. Wait for URL `/admin/schedules/[uuid]`
7. Verify "E2E Zeitplan" heading is visible
8. **Click "Jetzt ausfuhren" (stay on detail page):**
   - `page.getByRole("button", { name: /Jetzt ausführen/i }).click()`
   - Wait for the button to not be disabled (mutation completed): `expect(page.getByRole("button", { name: /Jetzt ausführen/i })).toBeEnabled({ timeout: 15_000 })`
9. **Navigate to list and verify (one navigation, testing list cache invalidation):**
   - `navigateTo(page, "/admin/schedules")`
   - `waitForTableLoad(page)`
   - `expectTableContains(page, "E2E Zeitplan")` -- schedule still in list (not deleted)

**Alternative (better):** Instead of navigating away, click the "Ausfuhrungen" tab and check if a new execution row appears. Even though `schedules.executions` is not invalidated, the data may have been fetched if the tab was not previously loaded (first-time fetch, not cache-stale refetch). Let's try this:

1. Navigate to schedule detail
2. Click "Jetzt ausfuhren"
3. Wait for toast success or button re-enabled
4. Click "Ausfuhrungen" tab
5. Check if a row appears in the execution log table (this would be a FIRST FETCH, not a cache invalidation -- but it proves the execution happened)

This is acceptable because the tab content wasn't loaded before (lazy), so opening it triggers a fresh query, not a cache-hit. The test proves end-to-end that the execution occurred.

**Final Steps for Scenario 5:**
1. `navigateTo(page, "/admin/schedules")`
2. `waitForTableLoad(page)`
3. Click "E2E Zeitplan" row
4. Wait for detail page URL
5. Verify heading "E2E Zeitplan"
6. Click "Jetzt ausfuhren"
7. Wait for button to be re-enabled (mutation complete): `expect(page.getByRole("button", { name: /Jetzt ausführen/i })).toBeEnabled({ timeout: 15_000 })`
8. Click "Ausfuhrungen" tab: `clickTab(page, /Ausführungen/i)`
9. Wait for execution log table row: `expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 10_000 })`
10. Verify execution row shows "manual" trigger badge: `expect(page.getByText(/Manuell/i).first()).toBeVisible()`

---

## Phase 7: Complete Test Code Structure

```typescript
import { test, expect } from "@playwright/test";
import { navigateTo, waitForTableLoad } from "./helpers/nav";
import {
  fillInput,
  submitAndWaitForClose,
  waitForSheet,
  expectTableContains,
  expectTableNotContains,
  openRowActions,
  clickMenuItem,
  confirmDelete,
  clickTab,
} from "./helpers/forms";

// --- Constants ---
const COMPANY = "E2E Cache GmbH";
const ORDER_CODE = "E2E-CACHE";
const ORDER_NAME = "E2E Cache Auftrag";
const TEMPLATE_NAME = "E2E Cache Vorlage";

test.describe.serial("Cache Invalidation: UI updates without page reload", () => {

  // ═══ SETUP: Address & Invoice ═══════════════════════════════════════════

  test("Setup: Create address", async ({ page }) => { ... });
  test("Setup: Create and finalize invoice", async ({ page }) => { ... });

  // ═══ SCENARIO 1: Payment → detail view updates ══════════════════════════

  test("Scenario 1: Payment updates detail view status and amounts without reload", async ({ page }) => {
    // Navigate to detail once, then perform mutation and assert in-place
    ...
  });

  // ═══ SCENARIO 2: Cancel payment → detail view reverts ═══════════════════

  test("Scenario 2: Cancel payment reverts status to Offen without reload", async ({ page }) => {
    // Navigate to detail once, then cancel and assert in-place
    ...
  });

  // ═══ SCENARIO 3: Template default → badge updates ═══════════════════════

  test("Scenario 3a: Setup - Create template", async ({ page }) => { ... });

  test("Scenario 3b: Set default updates Standard badge without reload", async ({ page }) => {
    // Navigate to templates page once, click star, assert badge appears
    ...
  });

  // ═══ SCENARIO 4: Delete order → row disappears ══════════════════════════

  test("Scenario 4a: Setup - Create order", async ({ page }) => { ... });

  test("Scenario 4b: Delete order removes row from list without reload", async ({ page }) => {
    // Navigate to orders once, delete via row actions, assert row gone
    ...
  });

  // ═══ SCENARIO 5: Execute schedule → execution log shows entry ═══════════

  test("Scenario 5: Execute schedule shows execution in log", async ({ page }) => {
    // Navigate to schedule detail, click execute, switch to Ausfuhrungen tab
    ...
  });

});
```

---

## Phase 8: Detailed Selectors Reference

### Open Items Detail Page (`/orders/open-items/[id]`)

| Element | Selector |
|---------|----------|
| Status badge | `page.getByText("Offen")`, `page.getByText("Teilzahlung")`, `page.getByText("Bezahlt")` |
| "Zahlung erfassen" button | `page.getByRole("button", { name: /Zahlung erfassen/i })` |
| Payment dialog | `page.locator('[role="dialog"]')` |
| Payment amount input | `dialog.locator("#payment-amount")` |
| Payment notes input | `dialog.locator("#payment-notes")` |
| Payment submit button | `dialog.getByRole("button", { name: /Zahlung erfassen/i })` |
| Payment row (by amount) | `page.locator("table tbody tr").filter({ hasText: "500,00" })` |
| Stornieren button | `paymentRow.getByRole("button", { name: /Stornieren/i })` |
| Cancel dialog | `page.locator('[role="dialog"]')` |
| Cancel confirm button | `dialog.getByRole("button", { name: /Bestätigen/i })` |
| Open amount in summary | `page.locator("main").toContainText(/690,00/)` |
| "Storniert" label in payment history | `page.getByText("Storniert")` |

### Template List Page (`/orders/templates`)

| Element | Selector |
|---------|----------|
| "Neue Vorlage" button | `page.getByRole("button", { name: "Neue Vorlage" })` |
| Template name input | `page.locator("#tpl-name")` |
| Document type select | Click the SelectTrigger near "Dokumenttyp" label, then select "Angebot" |
| Star button (set default) | `page.getByTitle("Als Standard setzen")` |
| "Standard" badge | `page.getByText("Standard")` |
| Toast success | `page.getByText("Standard-Vorlage gesetzt")` or `expectToastSuccess(page)` |

### Orders Page (`/admin/orders`)

| Element | Selector |
|---------|----------|
| "Auftrage" tab | `page.getByRole("tab", { name: "Aufträge" })` |
| "Neuer Auftrag" button | `page.getByRole("button", { name: "Neuer Auftrag" }).first()` |
| Order code input | `#code` |
| Order name input | `#name` |
| Row actions menu | `openRowActions(page, "E2E-CACHE")` |
| "Loschen" menu item | `clickMenuItem(page, /Löschen/)` |
| Confirm delete (sheet) | `confirmDelete(page)` |
| Row absence check | `expectTableNotContains(page, "E2E-CACHE")` |

### Schedule Detail Page (`/admin/schedules/[id]`)

| Element | Selector |
|---------|----------|
| "Jetzt ausfuhren" button | `page.getByRole("button", { name: /Jetzt ausführen/i })` |
| "Ausfuhrungen" tab | `clickTab(page, /Ausführungen/)` |
| Execution log row | `page.locator("table tbody tr").first()` |
| "Manuell" trigger badge | `page.getByText(/Manuell/i)` |

---

## Phase 9: Verification Checklist

For each scenario, verify:

- [ ] No `navigateTo()`, `page.goto()`, or `page.reload()` occurs between the mutation and the assertion
- [ ] The assertion uses `toBeVisible({ timeout: 10_000 })` to allow React Query refetch time
- [ ] Setup tests that create prerequisite data use the `E2E` prefix convention
- [ ] All test data can be cleaned by global-setup SQL
- [ ] Tests are serial and can run after `08-automatisierung.spec.ts` (for schedule dependency)

---

## Phase 10: Edge Cases & Notes

1. **Scenario 1 & 2 share the same invoice.** Scenario 1 creates a partial payment (500 EUR), leaving 690 EUR open. Scenario 2 cancels that payment, reverting to full open amount (1,190 EUR). The serial order guarantees Scenario 1 runs before Scenario 2.

2. **Scenario 3 uses the template form sheet.** The `TemplateFormSheet` uses a `Sheet` component, not a `Dialog`. The `submitAndWaitForClose` helper handles sheets via `[data-slot="sheet-footer"]`.

3. **For the document type select in the template form:** The select is not a standard `#id` input. It uses `<Select value={documentType} onValueChange={...}>` with a `<SelectTrigger>`. To select "Angebot":
   - Click the `SelectTrigger` (near the "Dokumenttyp" label)
   - Click `page.getByRole("option", { name: "Angebot" })`

4. **Scenario 4 delete uses ConfirmDialog (sheet-based).** The `confirmDelete(page)` helper from `forms.ts` handles this correctly -- it waits for `[data-slot="sheet-content"]` and clicks the last button in `[data-slot="sheet-footer"]`.

5. **Scenario 5 schedule execution may fail silently.** The `useExecuteSchedule` mutation has a try/catch that swallows errors. If the schedule has no tasks configured, the execution may succeed with 0 tasks. The test should verify at minimum that the button returns to enabled state (mutation completed) and the Ausfuhrungen tab shows a row.

6. **Alphabetical test ordering.** Playwright runs spec files in alphabetical order within a project. `cache-invalidation.spec.ts` sorts after `08-automatisierung.spec.ts` and `09-auftraege.spec.ts`, so the `E2E Zeitplan` schedule and `E2E-ORD` order should already exist. However, our test creates its own `E2E-CACHE` order rather than relying on the order from `09-auftraege.spec.ts`, to avoid inter-test coupling.

7. **Template form submit:** The template form has a `<Button type="submit">` inside `<SheetFooter>`. The `submitAndWaitForClose` helper calls `submitSheet` which clicks the last button in `[data-slot="sheet-footer"]`. The last button is the submit button (the cancel button is `type="button"` and comes first in the footer). This should work correctly.

8. **i18n locale.** Playwright config sets `locale: "de-DE"`, matching all German UI labels used in selectors.
