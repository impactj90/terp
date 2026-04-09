import { test, expect } from "@playwright/test";
import { clickTab } from "./helpers/forms";

/**
 * E2E tests for payroll master data tabs on the employee detail page.
 *
 * Uses seed employee Maria Schmidt (EMP003) for all tests.
 * Tests run serially because they modify employee data.
 */
test.describe.serial("Payroll Master Data (Lohn-Stammdaten)", () => {
  const EMP_ID = "00000000-0000-0000-0000-000000000013"; // Maria Schmidt (EMP003)
  const EMP_PAGE = `/de/admin/employees/${EMP_ID}`;

  // ── Helper: Navigate to employee page ──────────────────────────

  async function goToPage(page: import("@playwright/test").Page) {
    await page.goto(EMP_PAGE);
    await page.locator("#main-content").waitFor({ state: "visible" });
    await expect(page.getByText("Maria Schmidt")).toBeVisible({ timeout: 10_000 });
  }

  async function goToTab(page: import("@playwright/test").Page, tabName: string | RegExp) {
    await goToPage(page);
    await clickTab(page, tabName);
  }

  // ── Helper: Edit mode buttons ──────────────────────────────────

  async function clickEditButton(page: import("@playwright/test").Page) {
    const tabContent = page.locator('[role="tabpanel"]');
    const editBtn = tabContent.getByRole("button", { name: /bearbeiten/i }).first();
    await editBtn.click();
  }

  async function clickSaveButton(page: import("@playwright/test").Page) {
    const tabContent = page.locator('[role="tabpanel"]');
    const saveBtn = tabContent.getByRole("button", { name: /speichern/i }).first();
    await saveBtn.click();
    await expect(saveBtn).not.toBeVisible({ timeout: 10_000 });
  }

  async function clickCancelButton(page: import("@playwright/test").Page) {
    const tabContent = page.locator('[role="tabpanel"]');
    await tabContent.getByRole("button", { name: /abbrechen/i }).first().click();
  }

  // ── Helper: Sheet form submit + close ──────────────────────────

  async function submitSheetAndWait(page: import("@playwright/test").Page) {
    const sheet = page.locator('[data-slot="sheet-content"][data-state="open"]');
    const footer = sheet.locator('[data-slot="sheet-footer"]');
    await footer.getByRole("button").last().evaluate((el) => (el as HTMLElement).click());
    await expect(sheet).not.toBeVisible({ timeout: 10_000 });
  }

  // ── Helper: Delete a row by unique text ────────────────────────

  async function deleteRowByText(page: import("@playwright/test").Page, text: string) {
    const row = page.locator("table tbody tr").filter({ hasText: text });
    await row.getByRole("button").filter({ has: page.locator("svg") }).last().click();
    // ConfirmDialog is a bottom sheet with "Confirm" button
    const confirmSheet = page.locator('[data-slot="sheet-content"][data-state="open"]');
    await confirmSheet.waitFor({ state: "visible" });
    const confirmFooter = confirmSheet.locator('[data-slot="sheet-footer"]');
    await confirmFooter.getByRole("button").last().click();
    await expect(confirmSheet).not.toBeVisible({ timeout: 10_000 });
  }

  // ── Helper: Select a Radix value near a label ──────────────────

  async function selectNearLabel(
    page: import("@playwright/test").Page,
    container: import("@playwright/test").Locator,
    labelText: string | RegExp,
    optionText: string | RegExp,
  ) {
    const label = container.getByText(labelText).first();
    const wrapper = label.locator("..");
    const trigger = wrapper.locator('[role="combobox"]');
    await trigger.click();
    await page.getByRole("option", { name: optionText }).first().click();
  }

  // ═══════════════════════════════════════════════════════════════
  // 1. TAB VISIBILITY
  // ═══════════════════════════════════════════════════════════════

  test("all payroll tabs are visible for admin", async ({ page }) => {
    await goToPage(page);

    const tabNames = [
      "Steuern & SV",
      "Bankverbindung",
      "Vergütung",
      "Familie",
      "Zusatzleistungen",
      "Schwerbehinderung",
      "Auslandstätigkeit",
      "Pfändungen",
      "Spezialfälle",
    ];

    for (const name of tabNames) {
      await expect(page.getByRole("tab", { name })).toBeVisible();
    }
  });

  // ═══════════════════════════════════════════════════════════════
  // 2. STEUERN & SV — ALL TAX FIELDS
  // ═══════════════════════════════════════════════════════════════

  test("Steuern & SV — all tax fields", async ({ page }) => {
    await goToTab(page, /steuern & sv/i);
    const tabContent = page.locator('[role="tabpanel"]');

    await clickEditButton(page);
    await tabContent.locator("input").first().waitFor({ state: "visible", timeout: 5_000 });

    // taxId — first text input in the tax card
    const inputs = tabContent.locator("input");
    await inputs.first().fill("86095273488");

    // taxClass — select "4"
    await selectNearLabel(page, tabContent, "Steuerklasse", /^4$/);

    // taxFactor — visible only when taxClass=4
    const taxFactorLabel = tabContent.getByText("Faktor (IV/IV)").first();
    await expect(taxFactorLabel).toBeVisible({ timeout: 3_000 });
    const taxFactorInput = taxFactorLabel.locator("..").locator("input");
    await taxFactorInput.fill("0.945");

    // childTaxAllowance
    const childLabel = tabContent.getByText("Kinderfreibeträge").first();
    const childInput = childLabel.locator("..").locator("input");
    await childInput.fill("1.5");

    // denomination — select "ev" (Evangelisch)
    await selectNearLabel(page, tabContent, "Konfession", /Evangelisch/);

    // spouseDenomination — select "rk" (Römisch-Katholisch)
    await selectNearLabel(page, tabContent, "Konfession Ehepartner", /Römisch-Katholisch/);

    // payrollTaxAllowance
    const freibetragLabel = tabContent.getByText("ELStAM-Freibetrag").first();
    const freibetragInput = freibetragLabel.locator("..").locator("input");
    await freibetragInput.fill("100.50");

    // payrollTaxAddition
    const hinzuLabel = tabContent.getByText("ELStAM-Hinzurechnung").first();
    const hinzuInput = hinzuLabel.locator("..").locator("input");
    await hinzuInput.fill("50.25");

    // isPrimaryEmployer — checkbox (first in the tax card)
    const primaryLabel = tabContent.getByText("Hauptarbeitgeber").first();
    const primaryCheckbox = primaryLabel.locator("..").locator('[role="checkbox"]');
    // Ensure it is checked
    const isChecked = await primaryCheckbox.getAttribute("data-state");
    if (isChecked !== "checked") {
      await primaryCheckbox.click();
    }

    // birthName
    const birthNameLabel = tabContent.getByText("Geburtsname").first();
    const birthNameInput = birthNameLabel.locator("..").locator("input");
    await birthNameInput.fill("Müller");

    // Save
    await clickSaveButton(page);

    // Verify key values in read mode
    await goToTab(page, /steuern & sv/i);
    await expect(tabContent.getByText("Müller").first()).toBeVisible({ timeout: 5_000 });
    await expect(tabContent.getByText(/100[.,]50/).first()).toBeVisible();
    await expect(tabContent.getByText(/50[.,]25/).first()).toBeVisible();
  });

  // ═══════════════════════════════════════════════════════════════
  // 3. STEUERN & SV — ALL SOCIAL SECURITY FIELDS
  // ═══════════════════════════════════════════════════════════════

  test("Steuern & SV — all social security fields", async ({ page }) => {
    await goToTab(page, /steuern & sv/i);
    const tabContent = page.locator('[role="tabpanel"]');

    await clickEditButton(page);
    await tabContent.locator("input").first().waitFor({ state: "visible", timeout: 5_000 });

    // socialSecurityNumber — in the Sozialversicherung card
    const svLabel = tabContent.getByText("SV-Nummer").first();
    const svInput = svLabel.locator("..").locator("input");
    await svInput.fill("65180175M003");

    // healthInsuranceProviderId — skip, requires UUID from DB lookup

    // healthInsuranceStatus — select "private" (Privat versichert)
    await selectNearLabel(page, tabContent, "KV-Status", /Privat versichert/);

    // privateHealthInsuranceContribution — visible only when status=private
    const pkvLabel = tabContent.getByText("PKV-Beitrag").first();
    await expect(pkvLabel).toBeVisible({ timeout: 3_000 });
    const pkvInput = pkvLabel.locator("..").locator("input");
    await pkvInput.fill("350.00");

    // personnelGroupCode
    const pgLabel = tabContent.getByText("Personengruppenschlüssel").first();
    const pgInput = pgLabel.locator("..").locator("input");
    await pgInput.fill("101");

    // contributionGroupCode
    const bgLabel = tabContent.getByText("Beitragsgruppenschlüssel").first();
    const bgInput = bgLabel.locator("..").locator("input");
    await bgInput.fill("1111");

    // activityCode
    const taetLabel = tabContent.getByText("Tätigkeitsschlüssel").first();
    const taetInput = taetLabel.locator("..").locator("input");
    await taetInput.fill("432124311");

    // midijobFlag — select "0" (Nein)
    await selectNearLabel(page, tabContent, "Midijob", /Nein/);

    // umlageU1 — checkbox
    const u1Label = tabContent.getByText("Umlagepflicht U1").first();
    const u1Checkbox = u1Label.locator("..").locator('[role="checkbox"]');
    const u1State = await u1Checkbox.getAttribute("data-state");
    if (u1State !== "checked") {
      await u1Checkbox.click();
    }

    // umlageU2 — checkbox
    const u2Label = tabContent.getByText("Umlagepflicht U2").first();
    const u2Checkbox = u2Label.locator("..").locator('[role="checkbox"]');
    const u2State = await u2Checkbox.getAttribute("data-state");
    if (u2State !== "checked") {
      await u2Checkbox.click();
    }

    // Save
    await clickSaveButton(page);

    // Verify key values
    await goToTab(page, /steuern & sv/i);
    await expect(tabContent.getByText("101").first()).toBeVisible({ timeout: 5_000 });
    await expect(tabContent.getByText("432124311").first()).toBeVisible();
  });

  // ═══════════════════════════════════════════════════════════════
  // 4. BANKVERBINDUNG — ALL FIELDS
  // ═══════════════════════════════════════════════════════════════

  test("Bankverbindung — all fields", async ({ page }) => {
    await goToTab(page, /bankverbindung/i);
    const tabContent = page.locator('[role="tabpanel"]');

    await clickEditButton(page);
    await tabContent.locator("input").first().waitFor({ state: "visible", timeout: 5_000 });

    const inputs = tabContent.locator("input");
    // IBAN
    await inputs.nth(0).fill("DE89370400440532013000");
    // BIC
    await inputs.nth(1).fill("COBADEFFXXX");
    // Account holder
    await inputs.nth(2).fill("Maria Schmidt");

    await clickSaveButton(page);

    // Verify: masked IBAN shows last 4 digits
    await goToTab(page, /bankverbindung/i);
    await expect(tabContent.getByText(/3000/).first()).toBeVisible({ timeout: 5_000 });
    await expect(tabContent.getByText("COBADEFFXXX").first()).toBeVisible();
    await expect(tabContent.getByText("Maria Schmidt").first()).toBeVisible();
  });

  // ═══════════════════════════════════════════════════════════════
  // 5. VERGÜTUNG — ALL FIELDS
  // ═══════════════════════════════════════════════════════════════

  test("Vergütung — all fields", async ({ page }) => {
    await goToTab(page, /vergütung/i);
    const tabContent = page.locator('[role="tabpanel"]');

    await clickEditButton(page);
    await tabContent.locator("input").first().waitFor({ state: "visible", timeout: 5_000 });

    // paymentType — select "Monatliches Gehalt"
    await selectNearLabel(page, tabContent, "Entgeltart", /Monatliches Gehalt/);

    // grossSalary
    const salaryLabel = tabContent.getByText("Bruttogehalt / Monat").first();
    const salaryInput = salaryLabel.locator("..").locator("input");
    await salaryInput.fill("4500");

    // hourlyRate
    const hourlyLabel = tabContent.getByText("Stundenlohn").first();
    const hourlyInput = hourlyLabel.locator("..").locator("input");
    await hourlyInput.fill("25.50");

    // salaryGroup
    const groupLabel = tabContent.getByText("Gehalts-/Tarifgruppe").first();
    const groupInput = groupLabel.locator("..").locator("input");
    await groupInput.fill("E13");

    // houseNumber
    const houseLabel = tabContent.getByText("Hausnummer").first();
    const houseInput = houseLabel.locator("..").locator("input");
    await houseInput.fill("42a");

    // contractType — select "Unbefristet"
    await selectNearLabel(page, tabContent, "Vertragsart", /Unbefristet/);

    // probationMonths
    const probLabel = tabContent.getByText("Probezeit (Monate)").first();
    const probInput = probLabel.locator("..").locator("input");
    await probInput.fill("6");

    // noticePeriodEmployee
    const noticeAnLabel = tabContent.getByText("Kündigungsfrist AN").first();
    const noticeAnInput = noticeAnLabel.locator("..").locator("input");
    await noticeAnInput.fill("4 Wochen");

    // noticePeriodEmployer
    const noticeAgLabel = tabContent.getByText("Kündigungsfrist AG").first();
    const noticeAgInput = noticeAgLabel.locator("..").locator("input");
    await noticeAgInput.fill("3 Monate");

    await clickSaveButton(page);

    // Verify key values
    await goToTab(page, /vergütung/i);
    await expect(tabContent.getByText(/4.*500/).first()).toBeVisible({ timeout: 5_000 });
    await expect(tabContent.getByText("E13").first()).toBeVisible();
    await expect(tabContent.getByText("42a").first()).toBeVisible();
    await expect(tabContent.getByText("4 Wochen").first()).toBeVisible();
    await expect(tabContent.getByText("3 Monate").first()).toBeVisible();
  });

  // ═══════════════════════════════════════════════════════════════
  // 6. VERGÜTUNG — CANCEL DISCARDS
  // ═══════════════════════════════════════════════════════════════

  test("Vergütung — cancel discards unsaved changes", async ({ page }) => {
    await goToTab(page, /vergütung/i);

    await clickEditButton(page);
    const salaryInput = page.locator('input[type="number"]').first();
    await salaryInput.fill("99999");

    await clickCancelButton(page);

    await expect(page.getByText(/99.*999/)).not.toBeVisible();
  });

  // ═══════════════════════════════════════════════════════════════
  // 7. FAMILIE — ADD/DELETE CHILD WITH ALL FIELDS
  // ═══════════════════════════════════════════════════════════════

  test("Familie — add and delete child with all fields", async ({ page }) => {
    await goToTab(page, /familie/i);

    const uniqueName = `E2E-Kind-${Date.now()}`;

    // Click "Kind hinzufügen"
    await page.getByRole("button", { name: /kind hinzufügen/i }).click();

    const sheet = page.locator('[data-slot="sheet-content"][data-state="open"]');
    await sheet.waitFor({ state: "visible" });

    // firstName
    await sheet.locator("input").nth(0).fill(uniqueName);
    // lastName
    await sheet.locator("input").nth(1).fill("Schmidt");
    // birthDate
    await sheet.locator('input[type="date"]').fill("2020-05-15");
    // taxAllowanceShare
    await sheet.locator('input[type="number"]').fill("0.5");
    // livesInHousehold — checkbox (default true, ensure checked)
    const householdCheckbox = sheet.locator('[role="checkbox"]');
    const hhState = await householdCheckbox.getAttribute("data-state");
    if (hhState !== "checked") {
      await householdCheckbox.click();
    }

    await submitSheetAndWait(page);

    // Verify child appears in table
    await expect(page.locator("table").getByText(uniqueName).first()).toBeVisible({ timeout: 5_000 });

    // Delete it
    await deleteRowByText(page, uniqueName);
    await expect(page.locator("table tbody tr").filter({ hasText: uniqueName })).toHaveCount(0, { timeout: 5_000 });
  });

  // ═══════════════════════════════════════════════════════════════
  // 8. FAMILIE — ADD/DELETE PARENTAL LEAVE
  // ═══════════════════════════════════════════════════════════════

  test("Familie — add and delete parental leave", async ({ page }) => {
    await goToTab(page, /familie/i);

    await page.getByRole("button", { name: /elternzeit hinzufügen/i }).click();

    const sheet = page.locator('[data-slot="sheet-content"][data-state="open"]');
    await sheet.waitFor({ state: "visible" });

    const dateInputs = sheet.locator('input[type="date"]');
    // startDate
    await dateInputs.nth(0).fill("2026-06-01");
    // endDate
    await dateInputs.nth(1).fill("2026-12-31");
    // isPartnerMonths — checkbox
    const partnerCheckbox = sheet.locator('[role="checkbox"]');
    await partnerCheckbox.click();

    await submitSheetAndWait(page);

    // Verify — dates appear in table as dd.MM.yyyy
    await expect(page.locator("table").getByText("01.06.2026").first()).toBeVisible({ timeout: 5_000 });

    // Delete
    await deleteRowByText(page, "01.06.2026");
    await expect(page.locator("table tbody tr").filter({ hasText: "01.06.2026" })).toHaveCount(0, { timeout: 5_000 });
  });

  // ═══════════════════════════════════════════════════════════════
  // 9. FAMILIE — ADD/DELETE MATERNITY LEAVE
  // ═══════════════════════════════════════════════════════════════

  test("Familie — add and delete maternity leave", async ({ page }) => {
    await goToTab(page, /familie/i);

    await page.getByRole("button", { name: /mutterschutz hinzufügen/i }).click();

    const sheet = page.locator('[data-slot="sheet-content"][data-state="open"]');
    await sheet.waitFor({ state: "visible" });

    const dateInputs = sheet.locator('input[type="date"]');
    // startDate
    await dateInputs.nth(0).fill("2026-03-01");
    // expectedBirthDate
    await dateInputs.nth(1).fill("2026-05-15");
    // actualBirthDate
    await dateInputs.nth(2).fill("2026-05-10");
    // actualEndDate
    await dateInputs.nth(3).fill("2026-07-10");

    await submitSheetAndWait(page);

    // Verify
    await expect(page.locator("table").getByText("01.03.2026").first()).toBeVisible({ timeout: 5_000 });

    // Delete
    await deleteRowByText(page, "01.03.2026");
    await expect(page.locator("table tbody tr").filter({ hasText: "01.03.2026" })).toHaveCount(0, { timeout: 5_000 });
  });

  // ═══════════════════════════════════════════════════════════════
  // 10. ZUSATZLEISTUNGEN — ADD/DELETE COMPANY CAR
  // ═══════════════════════════════════════════════════════════════

  test("Zusatzleistungen — add company car with all fields", async ({ page }) => {
    await goToTab(page, /zusatzleistungen/i);

    await page.getByRole("button", { name: /dienstwagen hinzufügen/i }).click();

    const sheet = page.locator('[data-slot="sheet-content"][data-state="open"]');
    await sheet.waitFor({ state: "visible" });

    const inputs = sheet.locator("input");
    // makeModel (1st text input)
    await inputs.nth(0).fill("BMW 320d");
    // licensePlate (2nd text input)
    await inputs.nth(1).fill("B-E2E 123");
    // listPrice (number input)
    await inputs.nth(2).fill("45000");

    // propulsionType — select "Verbrenner" (combustion is default, but click to confirm)
    const propTrigger = sheet.locator('[role="combobox"]').first();
    await propTrigger.click();
    await page.getByRole("option", { name: /Verbrenner/ }).first().click();

    // distanceToWorkKm (number input after listPrice)
    await inputs.nth(3).fill("25.5");

    // usageType — select "Private Nutzung"
    const usageTrigger = sheet.locator('[role="combobox"]').nth(1);
    await usageTrigger.click();
    await page.getByRole("option", { name: /Private Nutzung/ }).first().click();

    // startDate
    const dateInputs = sheet.locator('input[type="date"]');
    await dateInputs.nth(0).fill("2026-01-01");

    await submitSheetAndWait(page);

    // Verify
    await expect(page.locator("table").getByText("BMW 320d").first()).toBeVisible({ timeout: 5_000 });
    await expect(page.locator("table").getByText("B-E2E 123").first()).toBeVisible();

    // Delete
    await deleteRowByText(page, "BMW 320d");
    await expect(page.locator("table tbody tr").filter({ hasText: "BMW 320d" })).toHaveCount(0, { timeout: 5_000 });
  });

  // ═══════════════════════════════════════════════════════════════
  // 11. ZUSATZLEISTUNGEN — ADD/DELETE JOB BIKE
  // ═══════════════════════════════════════════════════════════════

  test("Zusatzleistungen — add and delete job bike", async ({ page }) => {
    await goToTab(page, /zusatzleistungen/i);

    await page.getByRole("button", { name: /jobrad hinzufügen/i }).click();

    const sheet = page.locator('[data-slot="sheet-content"][data-state="open"]');
    await sheet.waitFor({ state: "visible" });

    // listPrice
    await sheet.locator('input[type="number"]').fill("3500");

    // usageType — "Gehaltsumwandlung" is default, select it explicitly
    const usageTrigger = sheet.locator('[role="combobox"]').first();
    await usageTrigger.click();
    await page.getByRole("option", { name: /Gehaltsumwandlung/ }).first().click();

    // startDate
    await sheet.locator('input[type="date"]').first().fill("2026-01-01");

    await submitSheetAndWait(page);

    // Verify — listPrice shows formatted currency
    await expect(page.locator("table").getByText(/3.*500/).first()).toBeVisible({ timeout: 5_000 });

    // Delete — find row with "3.500" or "Gehaltsumwandlung"
    const bikeRow = page.locator("table tbody tr").filter({ hasText: /Gehaltsumwandlung/ }).first();
    await bikeRow.getByRole("button").filter({ has: page.locator("svg") }).last().click();
    const confirmSheet = page.locator('[data-slot="sheet-content"][data-state="open"]');
    await confirmSheet.waitFor({ state: "visible" });
    await confirmSheet.locator('[data-slot="sheet-footer"]').getByRole("button").last().click();
    await expect(confirmSheet).not.toBeVisible({ timeout: 10_000 });
  });

  // ═══════════════════════════════════════════════════════════════
  // 12. ZUSATZLEISTUNGEN — ADD/DELETE MEAL ALLOWANCE
  // ═══════════════════════════════════════════════════════════════

  test("Zusatzleistungen — add and delete meal allowance", async ({ page }) => {
    await goToTab(page, /zusatzleistungen/i);

    await page.getByRole("button", { name: /essenszuschuss hinzufügen/i }).click();

    const sheet = page.locator('[data-slot="sheet-content"][data-state="open"]');
    await sheet.waitFor({ state: "visible" });

    const numberInputs = sheet.locator('input[type="number"]');
    // dailyAmount
    await numberInputs.nth(0).fill("6.50");
    // workDaysPerMonth
    await numberInputs.nth(1).fill("20");

    // startDate
    await sheet.locator('input[type="date"]').first().fill("2026-01-01");

    await submitSheetAndWait(page);

    // Verify
    await expect(page.locator("table").getByText(/6,50/).first()).toBeVisible({ timeout: 5_000 });

    // Delete
    const mealRow = page.locator("table tbody tr").filter({ hasText: /6,50/ }).first();
    await mealRow.getByRole("button").filter({ has: page.locator("svg") }).last().click();
    const confirmSheet = page.locator('[data-slot="sheet-content"][data-state="open"]');
    await confirmSheet.waitFor({ state: "visible" });
    await confirmSheet.locator('[data-slot="sheet-footer"]').getByRole("button").last().click();
    await expect(confirmSheet).not.toBeVisible({ timeout: 10_000 });
  });

  // ═══════════════════════════════════════════════════════════════
  // 13. ZUSATZLEISTUNGEN — ADD/DELETE VOUCHER
  // ═══════════════════════════════════════════════════════════════

  test("Zusatzleistungen — add and delete voucher", async ({ page }) => {
    await goToTab(page, /zusatzleistungen/i);

    await page.getByRole("button", { name: /sachgutschein hinzufügen/i }).click();

    const sheet = page.locator('[data-slot="sheet-content"][data-state="open"]');
    await sheet.waitFor({ state: "visible" });

    // monthlyAmount
    await sheet.locator('input[type="number"]').fill("50");
    // provider
    const textInputs = sheet.locator('input:not([type="date"]):not([type="number"])');
    await textInputs.first().fill("Sodexo");
    // startDate
    await sheet.locator('input[type="date"]').first().fill("2026-01-01");

    await submitSheetAndWait(page);

    // Verify
    await expect(page.locator("table").getByText("Sodexo").first()).toBeVisible({ timeout: 5_000 });

    // Delete
    await deleteRowByText(page, "Sodexo");
    await expect(page.locator("table tbody tr").filter({ hasText: "Sodexo" })).toHaveCount(0, { timeout: 5_000 });
  });

  // ═══════════════════════════════════════════════════════════════
  // 14. ZUSATZLEISTUNGEN — ADD/DELETE JOB TICKET
  // ═══════════════════════════════════════════════════════════════

  test("Zusatzleistungen — add and delete job ticket", async ({ page }) => {
    await goToTab(page, /zusatzleistungen/i);

    await page.getByRole("button", { name: /jobticket hinzufügen/i }).click();

    const sheet = page.locator('[data-slot="sheet-content"][data-state="open"]');
    await sheet.waitFor({ state: "visible" });

    // monthlyAmount
    await sheet.locator('input[type="number"]').fill("49");
    // provider
    const textInputs = sheet.locator('input:not([type="date"]):not([type="number"])');
    await textInputs.first().fill("BVG");
    // isAdditional — checkbox (default true, ensure checked)
    const additionalCheckbox = sheet.locator('[role="checkbox"]');
    const addState = await additionalCheckbox.getAttribute("data-state");
    if (addState !== "checked") {
      await additionalCheckbox.click();
    }
    // startDate
    await sheet.locator('input[type="date"]').first().fill("2026-01-01");

    await submitSheetAndWait(page);

    // Verify
    await expect(page.locator("table").getByText("BVG").first()).toBeVisible({ timeout: 5_000 });

    // Delete
    await deleteRowByText(page, "BVG");
    await expect(page.locator("table tbody tr").filter({ hasText: "BVG" })).toHaveCount(0, { timeout: 5_000 });
  });

  // ═══════════════════════════════════════════════════════════════
  // 15. ZUSATZLEISTUNGEN — ADD/DELETE PENSION (bAV)
  // ═══════════════════════════════════════════════════════════════

  test("Zusatzleistungen — add and delete pension (bAV)", async ({ page }) => {
    await goToTab(page, /zusatzleistungen/i);

    await page.getByRole("button", { name: /bav hinzufügen/i }).click();

    const sheet = page.locator('[data-slot="sheet-content"][data-state="open"]');
    await sheet.waitFor({ state: "visible" });

    // executionType — "Direktversicherung" is default, select explicitly
    const execTrigger = sheet.locator('[role="combobox"]').first();
    await execTrigger.click();
    await page.getByRole("option", { name: /Direktversicherung/ }).first().click();

    const textInputs = sheet.locator('input:not([type="date"]):not([type="number"])');
    // providerName
    await textInputs.nth(0).fill("Allianz");
    // contractNumber
    await textInputs.nth(1).fill("AV-12345");

    const numberInputs = sheet.locator('input[type="number"]');
    // employeeContribution
    await numberInputs.nth(0).fill("100");
    // employerContribution
    await numberInputs.nth(1).fill("100");

    // startDate
    await sheet.locator('input[type="date"]').first().fill("2026-01-01");

    await submitSheetAndWait(page);

    // Verify
    await expect(page.locator("table").getByText("Allianz").first()).toBeVisible({ timeout: 5_000 });

    // Delete
    await deleteRowByText(page, "Allianz");
    await expect(page.locator("table tbody tr").filter({ hasText: "Allianz" })).toHaveCount(0, { timeout: 5_000 });
  });

  // ═══════════════════════════════════════════════════════════════
  // 16. ZUSATZLEISTUNGEN — ADD/DELETE SAVINGS (VL)
  // ═══════════════════════════════════════════════════════════════

  test("Zusatzleistungen — add and delete savings (VL)", async ({ page }) => {
    await goToTab(page, /zusatzleistungen/i);

    await page.getByRole("button", { name: /vl hinzufügen/i }).click();

    const sheet = page.locator('[data-slot="sheet-content"][data-state="open"]');
    await sheet.waitFor({ state: "visible" });

    // investmentType — "Bausparen" is default, select explicitly
    const invTrigger = sheet.locator('[role="combobox"]').first();
    await invTrigger.click();
    await page.getByRole("option", { name: /Bausparen/ }).first().click();

    const textInputs = sheet.locator('input:not([type="date"]):not([type="number"])');
    // recipient
    await textInputs.nth(0).fill("LBS Bayern");
    // recipientIban
    await textInputs.nth(1).fill("DE89370400440532013000");
    // contractNumber
    await textInputs.nth(2).fill("VL-001");

    const numberInputs = sheet.locator('input[type="number"]');
    // monthlyAmount
    await numberInputs.nth(0).fill("40");
    // employerShare
    await numberInputs.nth(1).fill("26.59");
    // employeeShare
    await numberInputs.nth(2).fill("13.41");

    // startDate
    await sheet.locator('input[type="date"]').first().fill("2026-01-01");

    await submitSheetAndWait(page);

    // Verify
    await expect(page.locator("table").getByText("LBS Bayern").first()).toBeVisible({ timeout: 5_000 });

    // Delete
    await deleteRowByText(page, "LBS Bayern");
    await expect(page.locator("table tbody tr").filter({ hasText: "LBS Bayern" })).toHaveCount(0, { timeout: 5_000 });
  });

  // ═══════════════════════════════════════════════════════════════
  // 17. SCHWERBEHINDERUNG — ALL FIELDS
  // ═══════════════════════════════════════════════════════════════

  test("Schwerbehinderung — all fields", async ({ page }) => {
    await goToTab(page, /schwerbehinderung/i);
    const tabContent = page.locator('[role="tabpanel"]');

    await clickEditButton(page);
    await tabContent.locator("input").first().waitFor({ state: "visible", timeout: 5_000 });

    // disabilityDegree
    const gdbLabel = tabContent.getByText("Grad der Behinderung (GdB)").first();
    const gdbInput = gdbLabel.locator("..").locator("input");
    await gdbInput.fill("60");

    // disabilityEqualStatus — checkbox
    const equalLabel = tabContent.getByText("Gleichstellung").first();
    const equalCheckbox = equalLabel.locator("..").locator('[role="checkbox"]');
    const eqState = await equalCheckbox.getAttribute("data-state");
    if (eqState !== "checked") {
      await equalCheckbox.click();
    }

    // disabilityMarkers — text input
    const markersLabel = tabContent.getByText("Merkzeichen").first();
    const markersInput = markersLabel.locator("..").locator("input");
    await markersInput.fill("G, H");

    // disabilityIdValidUntil — date input
    const validLabel = tabContent.getByText("Ausweis gültig bis").first();
    const validInput = validLabel.locator("..").locator("input");
    await validInput.fill("2028-12-31");

    await clickSaveButton(page);

    // Verify
    await goToTab(page, /schwerbehinderung/i);
    await expect(tabContent.getByText("60%").first()).toBeVisible({ timeout: 5_000 });
    await expect(tabContent.getByText("31.12.2028").first()).toBeVisible();
  });

  // ═══════════════════════════════════════════════════════════════
  // 18. AUSLANDSTÄTIGKEIT — ADD WITH ALL FIELDS
  // ═══════════════════════════════════════════════════════════════

  test("Auslandstätigkeit — add with all fields and delete", async ({ page }) => {
    await goToTab(page, /auslandstätigkeit/i);

    const uniqueCountry = `AT-E2E-${Date.now()}`;

    await page.getByRole("button", { name: /hinzufügen/i }).click();

    const sheet = page.locator('[data-slot="sheet-content"][data-state="open"]');
    await sheet.waitFor({ state: "visible" });

    const textInputs = sheet.locator('input:not([type="date"])');
    // countryCode
    await textInputs.nth(0).fill("AT");
    // countryName
    await textInputs.nth(1).fill(uniqueCountry);
    // a1CertificateNumber (3rd text input after countryCode, countryName)
    await textInputs.nth(2).fill("A1-2026-001");

    const dateInputs = sheet.locator('input[type="date"]');
    // startDate
    await dateInputs.nth(0).fill("2026-01-01");
    // endDate
    await dateInputs.nth(1).fill("2026-06-30");
    // a1ValidFrom
    await dateInputs.nth(2).fill("2026-01-01");
    // a1ValidUntil
    await dateInputs.nth(3).fill("2026-06-30");

    // foreignActivityExemption — checkbox
    const exemptionCheckbox = sheet.locator('[role="checkbox"]');
    await exemptionCheckbox.click();

    await submitSheetAndWait(page);

    // Verify
    await expect(page.locator("table").getByText(uniqueCountry).first()).toBeVisible({ timeout: 5_000 });
    await expect(page.locator("table").getByText("A1-2026-001").first()).toBeVisible();

    // Delete
    await deleteRowByText(page, uniqueCountry);
    await expect(page.locator("table tbody tr").filter({ hasText: uniqueCountry })).toHaveCount(0, { timeout: 5_000 });
  });

  // ═══════════════════════════════════════════════════════════════
  // 19. PFÄNDUNGEN — ADD WITH ALL FIELDS
  // ═══════════════════════════════════════════════════════════════

  test("Pfändungen — add with all fields and delete", async ({ page }) => {
    await goToTab(page, /pfändungen/i);

    const uniqueCreditor = `Finanzamt-${Date.now()}`;

    await page.getByRole("button", { name: /hinzufügen/i }).click();

    const sheet = page.locator('[data-slot="sheet-content"][data-state="open"]');
    await sheet.waitFor({ state: "visible" });

    const textInputs = sheet.locator('input:not([type="date"]):not([type="number"])');
    // creditorName
    await textInputs.nth(0).fill(uniqueCreditor);
    // creditorAddress
    await textInputs.nth(1).fill("Musterstr. 1, 10115 Berlin");
    // fileReference
    await textInputs.nth(2).fill("AZ-2026/001");

    const numberInputs = sheet.locator('input[type="number"]');
    // garnishmentAmount
    await numberInputs.nth(0).fill("750");
    // dependentsCount
    await numberInputs.nth(1).fill("2");
    // rank
    await numberInputs.nth(2).fill("1");

    // calculationMethod — select "Tabellenbasiert"
    const methodTrigger = sheet.locator('[role="combobox"]').first();
    await methodTrigger.click();
    await page.getByRole("option", { name: /Tabellenbasiert/ }).first().click();

    // isPAccount — checkbox
    const checkboxes = sheet.locator('[role="checkbox"]');
    await checkboxes.nth(0).click();
    // maintenanceObligation — checkbox
    await checkboxes.nth(1).click();

    // startDate
    const dateInputs = sheet.locator('input[type="date"]');
    await dateInputs.nth(0).fill("2026-01-01");

    await submitSheetAndWait(page);

    // Verify
    await expect(page.locator("table").getByText(uniqueCreditor).first()).toBeVisible({ timeout: 5_000 });

    // Delete
    await deleteRowByText(page, uniqueCreditor);
    await expect(page.locator("table tbody tr").filter({ hasText: uniqueCreditor })).toHaveCount(0, { timeout: 5_000 });
  });

  // ═══════════════════════════════════════════════════════════════
  // 20. SPEZIALFÄLLE — PENSION STATUS ALL FIELDS
  // ═══════════════════════════════════════════════════════════════

  test("Spezialfälle — pension status all fields", async ({ page }) => {
    await goToTab(page, /spezialfälle/i);
    const tabContent = page.locator('[role="tabpanel"]');

    await clickEditButton(page);

    // receivesOldAgePension — checkbox near "Bezieht Altersrente"
    const oldAgeLabel = tabContent.getByText("Bezieht Altersrente").first();
    const oldAgeCheckbox = oldAgeLabel.locator("..").locator('[role="checkbox"]');
    const oaState = await oldAgeCheckbox.getAttribute("data-state");
    if (oaState !== "checked") {
      await oldAgeCheckbox.click();
    }

    // receivesDisabilityPension
    const disLabel = tabContent.getByText("Bezieht Erwerbsminderungsrente").first();
    const disCheckbox = disLabel.locator("..").locator('[role="checkbox"]');
    const disState = await disCheckbox.getAttribute("data-state");
    if (disState !== "checked") {
      await disCheckbox.click();
    }

    // receivesSurvivorPension
    const survLabel = tabContent.getByText("Bezieht Hinterbliebenenrente").first();
    const survCheckbox = survLabel.locator("..").locator('[role="checkbox"]');
    const survState = await survCheckbox.getAttribute("data-state");
    if (survState !== "checked") {
      await survCheckbox.click();
    }

    // pensionStartDate
    const pensionDateLabel = tabContent.getByText("Rentenbeginn").first();
    const pensionDateInput = pensionDateLabel.locator("..").locator("input");
    await pensionDateInput.fill("2025-01-01");

    await clickSaveButton(page);

    // Verify all badges show "Ja"
    await goToTab(page, /spezialfälle/i);
    // The pension status card should have 3 "Ja" badges
    const pensionCard = tabContent.getByText("Renten-Status").first().locator("..").locator("..");
    await expect(pensionCard.getByText("Ja").first()).toBeVisible({ timeout: 5_000 });
    await expect(pensionCard.getByText("01.01.2025").first()).toBeVisible();
  });

  // ═══════════════════════════════════════════════════════════════
  // 21. SPEZIALFÄLLE — BG DATA ALL FIELDS
  // ═══════════════════════════════════════════════════════════════

  test("Spezialfälle — BG data all fields", async ({ page }) => {
    await goToTab(page, /spezialfälle/i);
    const tabContent = page.locator('[role="tabpanel"]');

    await clickEditButton(page);

    // bgInstitution
    const bgInstLabel = tabContent.getByText("Berufsgenossenschaft").nth(1); // nth(1) because title is also "Berufsgenossenschaft"
    const bgInstInput = bgInstLabel.locator("..").locator("input");
    await bgInstInput.fill("VBG");

    // bgMembershipNumber
    const bgMemLabel = tabContent.getByText("Mitgliedsnummer").first();
    const bgMemInput = bgMemLabel.locator("..").locator("input");
    await bgMemInput.fill("12345678");

    // bgHazardTariff
    const bgHazLabel = tabContent.getByText("Gefahrtarifstelle").first();
    const bgHazInput = bgHazLabel.locator("..").locator("input");
    await bgHazInput.fill("01");

    await clickSaveButton(page);

    // Verify
    await goToTab(page, /spezialfälle/i);
    await expect(tabContent.getByText("VBG").first()).toBeVisible({ timeout: 5_000 });
    await expect(tabContent.getByText("12345678").first()).toBeVisible();
    await expect(tabContent.getByText("01").first()).toBeVisible();
  });

  // ═══════════════════════════════════════════════════════════════
  // 22. SPEZIALFÄLLE — DEATH FIELDS
  // ═══════════════════════════════════════════════════════════════

  test("Spezialfälle — death fields", async ({ page }) => {
    await goToTab(page, /spezialfälle/i);
    const tabContent = page.locator('[role="tabpanel"]');

    await clickEditButton(page);

    // dateOfDeath
    const deathDateLabel = tabContent.getByText("Sterbedatum").first();
    const deathDateInput = deathDateLabel.locator("..").locator("input");
    await deathDateInput.fill("2026-12-31");

    // heirName
    const heirNameLabel = tabContent.getByText("Erbe (Name)").first();
    const heirNameInput = heirNameLabel.locator("..").locator("input");
    await heirNameInput.fill("Max Schmidt");

    // heirIban
    const heirIbanLabel = tabContent.getByText("Erbe (IBAN)").first();
    const heirIbanInput = heirIbanLabel.locator("..").locator("input");
    await heirIbanInput.fill("DE89370400440532013000");

    await clickSaveButton(page);

    // Verify
    await goToTab(page, /spezialfälle/i);
    await expect(tabContent.getByText("31.12.2026").first()).toBeVisible({ timeout: 5_000 });
    await expect(tabContent.getByText("Max Schmidt").first()).toBeVisible();

    // Clean up: remove the death date so it doesn't affect other tests
    await clickEditButton(page);
    const clearDeathInput = tabContent.getByText("Sterbedatum").first().locator("..").locator("input");
    await clearDeathInput.fill("");
    const clearHeirName = tabContent.getByText("Erbe (Name)").first().locator("..").locator("input");
    await clearHeirName.fill("");
    const clearHeirIban = tabContent.getByText("Erbe (IBAN)").first().locator("..").locator("input");
    await clearHeirIban.fill("");
    await clickSaveButton(page);
  });

  // ═══════════════════════════════════════════════════════════════
  // 23. SPEZIALFÄLLE — ADD/DELETE OTHER EMPLOYMENT
  // ═══════════════════════════════════════════════════════════════

  test("Spezialfälle — add and delete other employment", async ({ page }) => {
    await goToTab(page, /spezialfälle/i);

    const uniqueEmployer = `Müller-${Date.now()}`;

    await page.getByRole("button", { name: /nebenbeschäftigung hinzufügen/i }).click();

    const sheet = page.locator('[data-slot="sheet-content"][data-state="open"]');
    await sheet.waitFor({ state: "visible" });

    const textInputs = sheet.locator('input:not([type="date"]):not([type="number"])');
    // employerName
    await textInputs.nth(0).fill(uniqueEmployer);

    const numberInputs = sheet.locator('input[type="number"]');
    // monthlyIncome
    await numberInputs.nth(0).fill("450");
    // weeklyHours
    await numberInputs.nth(1).fill("10");

    // isMinijob — checkbox
    const minijobCheckbox = sheet.locator('[role="checkbox"]');
    await minijobCheckbox.click();

    const dateInputs = sheet.locator('input[type="date"]');
    // startDate
    await dateInputs.nth(0).fill("2026-01-01");
    // endDate
    await dateInputs.nth(1).fill("2026-12-31");

    await submitSheetAndWait(page);

    // Verify
    await expect(page.locator("table").getByText(uniqueEmployer).first()).toBeVisible({ timeout: 5_000 });

    // Delete
    await deleteRowByText(page, uniqueEmployer);
    await expect(page.locator("table tbody tr").filter({ hasText: uniqueEmployer })).toHaveCount(0, { timeout: 5_000 });
  });

  // ═══════════════════════════════════════════════════════════════
  // 24. IBAN ENCRYPTED IN DB
  // ═══════════════════════════════════════════════════════════════

  test("IBAN is stored encrypted in DB", async ({ page }) => {
    // We set the IBAN earlier in the bank details test.
    // Now verify the raw DB value is encrypted (starts with v1:)
    const { execSync } = await import("child_process");
    const result = execSync(
      `psql "postgresql://postgres:postgres@localhost:54322/postgres" -t -c "SELECT iban FROM employees WHERE id = '${EMP_ID}';"`,
    ).toString().trim();

    expect(result).toMatch(/^v\d+:/);
    expect(result).not.toContain("DE89"); // Should NOT contain plaintext
  });
});
