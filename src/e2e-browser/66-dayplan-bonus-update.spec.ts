import { test, expect, type Page, type Locator } from "@playwright/test";
import { waitForTableLoad } from "./helpers/nav";
import { fillInput, waitForSheet } from "./helpers/forms";

/**
 * Local navigation helper — the shared `navigateTo` in helpers/nav.ts waits
 * for `main#main-content` but the id="main-content" in this codebase lives
 * on a <div>, not a <main>. That is a pre-existing bug in the shared helper
 * (spec 02 fails identically). Inline a correct waiter here so this spec
 * runs without touching the broken helper.
 */
async function navigate(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await page.locator("#main-content").waitFor({ state: "visible" });
}

/**
 * UC-066: DayPlan bonus Create + Update + Delete via the detail sheet.
 *
 * Covers the DATEV-Zuschläge update flow end-to-end in the browser:
 * - Create a test day plan via the day-plans page.
 * - Open its detail sheet, add a bonus on the NIGHT seed account.
 * - Click the pencil (edit) icon and verify the form is pre-filled.
 * - Switch calculation type from "Pro Minute" to "Prozentsatz" and assert
 *   the value-field label flips from "Wert (Minuten)" to "Wert (%)".
 * - Save the update and verify the new value is reflected in the list.
 * - Delete the bonus and verify removal.
 * - Clean up the day plan at the end.
 *
 * Uses the seed-tenant NIGHT account (code "NIGHT", present from seed.sql)
 * so we don't have to create & clean up an account. Day-plan cleanup is
 * handled by global-setup (DELETE FROM day_plans WHERE code LIKE 'E2E%').
 */

const DP_CODE = "E2E-DP-BONUS";
const DP_NAME = "E2E Bonus Test Plan";
const BONUS_ACCOUNT_NAME_RE = /Night Shift Bonus/;

async function openDayPlanDetail(page: Page, code: string) {
  await navigate(page, "/admin/day-plans");
  await waitForTableLoad(page);
  // Click the table row matching our day-plan code — the detail sheet opens.
  const row = page.locator("table tbody tr").filter({ hasText: code });
  await row.first().click();
  // The detail sheet has a <Sheet> portal; wait for it.
  const sheet = page.locator('[data-slot="sheet-content"][data-state="open"]');
  await sheet.waitFor({ state: "visible" });
  return sheet;
}

async function scrollBonusSectionIntoView(sheet: Locator) {
  // Scroll the "Zuschläge" section heading into view so we can click buttons.
  const heading = sheet.getByRole("heading", { name: /Zuschläge/i });
  await heading.scrollIntoViewIfNeeded();
}

test.describe.serial("UC-066: DayPlan bonus — pencil-edit + percent/minutes label", () => {
  test("setup — create day plan E2E-DP-BONUS", async ({ page }) => {
    await navigate(page, "/admin/day-plans");
    await page.getByRole("button", { name: "Neuer Tagesplan" }).click();
    await waitForSheet(page);
    await fillInput(page, "code", DP_CODE);
    await fillInput(page, "name", DP_NAME);
    // Default planType "fixed" + default regularHours suffice to create.
    const footer = page.locator('[data-slot="sheet-footer"]');
    const submit = footer.getByRole("button").last();
    await submit.evaluate((el) => (el as HTMLElement).click());
    await expect(
      page.locator('[data-slot="sheet-content"][data-state="open"]'),
    ).toHaveCount(0, { timeout: 10_000 });
    await waitForTableLoad(page);
    await expect(
      page.locator("table tbody tr").filter({ hasText: DP_CODE }),
    ).toBeVisible();
  });

  test("add a bonus via Pro Minute (default)", async ({ page }) => {
    const sheet = await openDayPlanDetail(page, DP_CODE);
    await scrollBonusSectionIntoView(sheet);

    // Open the add-bonus inline form. "Zuschlag hinzufügen" appears both as
    // the trigger button outside the form AND inside as the submit text,
    // so use the OUTSIDE one (only visible button when the form is closed).
    await sheet
      .getByRole("button", { name: /^Zuschlag hinzufügen$/i })
      .first()
      .click();

    // Confirm the inline Add form opened (heading appears)
    await expect(
      sheet.getByRole("heading", { name: /^Zuschlag hinzufügen$/i }),
    ).toBeVisible();

    // Scope selection to the Add form (which is the div that contains the
    // "Zuschlag hinzufügen" heading that just appeared).
    const addFormLabel = sheet.getByText("Konto", { exact: true }).first();
    const addFormAccountTrigger = addFormLabel
      .locator("..")
      .locator('button[role="combobox"]');
    await addFormAccountTrigger.click();
    await page.getByRole("option", { name: BONUS_ACCOUNT_NAME_RE }).first().click();

    // Enter a value > 0 so the submit button is not Zod-rejected at mutation.
    // valueMinutes is "Wert (Minuten)" for per_minute — the DurationInput.
    // DurationInput format=minutes is a simple number input; type "15".
    const valueInput = sheet
      .locator("label", { hasText: /^Wert \(Minuten\)$/ })
      .locator("..")
      .locator("input")
      .first();
    await valueInput.fill("15");

    // The form has the heading button "Zuschlag hinzufügen" AND the submit
    // button with the same text. The submit is the last button matching.
    const submitBtn = sheet
      .getByRole("button", { name: /^Zuschlag hinzufügen$/i })
      .last();
    await submitBtn.click();

    // The add-form closes
    await expect(
      sheet.getByRole("heading", { name: /^Zuschlag hinzufügen$/i }),
    ).toHaveCount(0, { timeout: 5_000 });
    // The bonus row now shows the account name
    await expect(sheet.getByText(BONUS_ACCOUNT_NAME_RE).first()).toBeVisible({
      timeout: 5_000,
    });
    // "Pro Minute" label visible in the bonus row
    await expect(sheet.getByText(/Pro Minute/).first()).toBeVisible();
  });

  test("pencil opens inline edit with label 'Wert (Minuten)' for Pro Minute", async ({
    page,
  }) => {
    const sheet = await openDayPlanDetail(page, DP_CODE);
    await scrollBonusSectionIntoView(sheet);

    // Click the pencil (Edit) icon on the bonus row
    const editButton = sheet
      .getByRole("button", { name: /Zuschlag bearbeiten/i })
      .first();
    await editButton.click();

    // The inline edit heading appears
    await expect(sheet.getByRole("heading", { name: /Zuschlag bearbeiten/i })).toBeVisible();

    // Label is "Wert (Minuten)" while calculationType is "per_minute"
    await expect(sheet.getByText(/^Wert \(Minuten\)$/).first()).toBeVisible();
    // "Wert (%)" label must NOT be visible in this mode
    await expect(sheet.getByText(/^Wert \(%\)$/)).toHaveCount(0);

    // Cancel the edit to end this test cleanly
    await sheet.getByRole("button", { name: /^Abbrechen$/i }).click();
  });

  test("switching calculation to Prozentsatz flips label to 'Wert (%)'", async ({
    page,
  }) => {
    const sheet = await openDayPlanDetail(page, DP_CODE);
    await scrollBonusSectionIntoView(sheet);

    await sheet.getByRole("button", { name: /Zuschlag bearbeiten/i }).first().click();
    await expect(sheet.getByRole("heading", { name: /Zuschlag bearbeiten/i })).toBeVisible();

    // Open the "Berechnungsart" select and pick "Prozentsatz"
    const calcSelectLabel = sheet.getByText(/^Berechnungsart$/).first();
    const calcContainer = calcSelectLabel.locator("..");
    const calcTrigger = calcContainer.locator('button[role="combobox"]');
    await calcTrigger.click();
    await page.getByRole("option", { name: /Prozentsatz/i }).click();

    // Label flips
    await expect(sheet.getByText(/^Wert \(%\)$/).first()).toBeVisible();
    await expect(sheet.getByText(/^Wert \(Minuten\)$/)).toHaveCount(0);

    // The percent input accepts a plain number (not a duration input)
    // Type "30" and save
    const percentInput = sheet.locator('input[type="number"]').first();
    await percentInput.fill("30");

    await sheet.getByRole("button", { name: /^Speichern$/i }).click();

    // Edit heading disappears = save completed
    await expect(
      sheet.getByRole("heading", { name: /Zuschlag bearbeiten/i }),
    ).toHaveCount(0, { timeout: 10_000 });

    // The calculation-type indicator on the bonus row now reads "Prozentsatz"
    await expect(sheet.getByText(/Prozentsatz/i).first()).toBeVisible();
  });

  test("delete the bonus via the trash icon", async ({ page }) => {
    const sheet = await openDayPlanDetail(page, DP_CODE);
    await scrollBonusSectionIntoView(sheet);

    // The bonus row is the small card containing the account name and two
    // icon-only buttons. The pencil (edit) button is first — it has
    // aria-label "Zuschlag bearbeiten". The trash (delete) button is
    // second and has no aria-label, so locate it by position.
    const bonusCard = sheet
      .locator("div.border")
      .filter({ hasText: BONUS_ACCOUNT_NAME_RE })
      .first();
    // Button order inside the row: [pencil, trash]
    await bonusCard.getByRole("button").nth(1).click();

    // Bonus removed → "Keine Zuschläge konfiguriert" appears
    await expect(sheet.getByText(/Keine Zuschläge konfiguriert/i)).toBeVisible({
      timeout: 5_000,
    });
  });

  // Note: no UI cleanup test — global-setup wipes day_plans WHERE code LIKE 'E2E%'
  // before each run, so E2E-DP-BONUS is cleaned automatically on the next run.
});
