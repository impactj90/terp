import type { Page, Locator } from "@playwright/test";
import { expect } from "@playwright/test";

/** Click the create / "+" button in the page header */
export async function openCreateDialog(page: Page): Promise<void> {
  // Pages use a button with a Plus icon in the header area
  await page
    .locator("main#main-content")
    .getByRole("button")
    .filter({ has: page.locator('svg[class*="lucide-plus"]') })
    .first()
    .click();
  await page
    .locator('[data-slot="sheet-content"][data-state="open"]')
    .waitFor({ state: "visible" });
}

/** Wait for the sheet/dialog to be visible */
export async function waitForSheet(page: Page): Promise<Locator> {
  const sheet = page.locator(
    '[data-slot="sheet-content"][data-state="open"]',
  );
  await sheet.waitFor({ state: "visible" });
  return sheet;
}

/** Fill a text input by its ID */
export async function fillInput(
  page: Page,
  id: string,
  value: string,
): Promise<void> {
  await page.locator(`#${id}`).fill(value);
}

/** Select an option from a Radix Select/Combobox by clicking the trigger then the option */
export async function selectOption(
  page: Page,
  triggerLabel: string | RegExp,
  optionText: string | RegExp,
): Promise<void> {
  // Find the combobox near the label
  const label = page.getByText(triggerLabel);
  const container = label.locator("..");
  const trigger = container.locator('button[role="combobox"]');
  await trigger.click();
  await page
    .getByRole("option", { name: optionText })
    .first()
    .click();
}

/** Click a switch/toggle by its ID */
export async function toggleSwitch(page: Page, id: string): Promise<void> {
  await page.locator(`button[role="switch"]#${id}`).click();
}

/** Submit the form in the currently open sheet */
export async function submitSheet(page: Page): Promise<void> {
  const footer = page.locator('[data-slot="sheet-footer"]');
  const btn = footer.getByRole("button").last();
  await btn.scrollIntoViewIfNeeded();
  // Use evaluate to bypass viewport checks — sheet footers can be
  // positioned outside the scrollable area on tall forms
  await btn.evaluate((el) => (el as HTMLElement).click());
}

/** Wait for sheet to close (success indicator for most CRUD ops) */
export async function waitForSheetClose(page: Page): Promise<void> {
  await expect(
    page.locator('[data-slot="sheet-content"][data-state="open"]'),
  ).toHaveCount(0, { timeout: 10_000 });
}

/** Submit sheet and wait for it to close */
export async function submitAndWaitForClose(page: Page): Promise<void> {
  await submitSheet(page);
  await waitForSheetClose(page);
}

/** Open the row action menu for a table row containing the given text */
export async function openRowActions(
  page: Page,
  rowText: string,
): Promise<void> {
  const row = page.locator("table tbody tr").filter({ hasText: rowText });
  // The actions button is in the last cell, has sr-only "Actions" text
  await row.getByRole("button").last().click();
  await page.getByRole("menu").waitFor({ state: "visible" });
}

/** Click a menu item in the currently open dropdown */
export async function clickMenuItem(
  page: Page,
  text: string | RegExp,
): Promise<void> {
  await page.getByRole("menuitem", { name: text }).click();
}

/** Confirm a destructive action in the confirm dialog */
export async function confirmDelete(page: Page): Promise<void> {
  const sheet = page.locator(
    '[data-slot="sheet-content"][data-state="open"]',
  );
  await sheet.waitFor({ state: "visible" });
  await sheet
    .locator('[data-slot="sheet-footer"]')
    .getByRole("button")
    .last()
    .click();
  await waitForSheetClose(page);
}

/** Check that a table row with specific text exists */
export async function expectTableContains(
  page: Page,
  text: string,
): Promise<void> {
  await expect(
    page.locator("table tbody tr").filter({ hasText: text }).first(),
  ).toBeVisible();
}

/** Check that a table row with specific text does not exist */
export async function expectTableNotContains(
  page: Page,
  text: string,
): Promise<void> {
  await expect(
    page.locator("table tbody tr").filter({ hasText: text }),
  ).toHaveCount(0);
}

/** Wait for a success toast / status notification */
export async function expectToastSuccess(page: Page): Promise<void> {
  await expect(
    page.locator('[role="status"][aria-live="polite"]'),
  ).toBeVisible({ timeout: 5_000 });
}

/** Click a tab by name */
export async function clickTab(
  page: Page,
  name: string | RegExp,
): Promise<void> {
  await page.getByRole("tab", { name }).click();
}
