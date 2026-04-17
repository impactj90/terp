import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { clickTab, submitAndWaitForClose, waitForSheet } from "./helpers/forms";
import { navigateTo } from "./helpers/nav";

const DATABASE_URL = "postgresql://postgres:postgres@localhost:54322/postgres";
const TENANT_ID = "10000000-0000-0000-0000-000000000001";
const ADMIN_USER_ID = "00000000-0000-0000-0000-000000000001";
const WEEK_PLAN_ID = "00000000-0000-0000-0000-000000000601";
const HR_DEPARTMENT_ID = "00000000-0000-0000-0000-000000000803";

const AUTO_TARIFF_ID = "67e20000-0000-4000-a000-000000000001";
const PENDING_TARIFF_ID = "67e20000-0000-4000-a000-000000000002";

const AUTO_EMPLOYEE_ID = "67e20100-0000-4000-a000-000000000001";
const APPROVE_EMPLOYEE_ID = "67e20100-0000-4000-a000-000000000002";
const REJECT_EMPLOYEE_ID = "67e20100-0000-4000-a000-000000000003";
const OVERRIDE_EMPLOYEE_ID = "67e20100-0000-4000-a000-000000000004";

const AUTO_PERSONNEL = "E2EOTP-AUTO";
const APPROVE_PERSONNEL = "E2EOTP-APP";
const REJECT_PERSONNEL = "E2EOTP-REJ";
const OVERRIDE_PERSONNEL = "E2EOTP-OVR";

const OVERTIME_MINUTES = 720; // 12h
const PAYOUT_MINUTES = 120; // 2h
const REMAINING_BALANCE = 600; // 10h
const THRESHOLD_VALUE = "10:00";
const REJECTION_REASON = "Ticket E2E Ablehnung";

function getTargetPeriod() {
  const now = new Date();
  const targetDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  return {
    year: targetDate.getFullYear(),
    month: targetDate.getMonth() + 1,
    labelDe: new Intl.DateTimeFormat("de-DE", {
      month: "long",
      year: "numeric",
    }).format(targetDate),
  };
}

const PERIOD = getTargetPeriod();

function runSql(query: string): string {
  return execFileSync(
    "psql",
    ["-d", DATABASE_URL, "-v", "ON_ERROR_STOP=1", "-t", "-A"],
    {
      input: query,
      encoding: "utf8",
    },
  ).trim();
}

function cleanupFixtures() {
  runSql(`
    DELETE FROM payroll_exports
    WHERE tenant_id = '${TENANT_ID}'
      AND (
        parameters::text LIKE '%${AUTO_EMPLOYEE_ID}%'
        OR parameters::text LIKE '%${APPROVE_EMPLOYEE_ID}%'
        OR parameters::text LIKE '%${REJECT_EMPLOYEE_ID}%'
        OR parameters::text LIKE '%${OVERRIDE_EMPLOYEE_ID}%'
      );

    DELETE FROM employee_overtime_payout_overrides
    WHERE tenant_id = '${TENANT_ID}'
      AND employee_id IN (
        '${AUTO_EMPLOYEE_ID}',
        '${APPROVE_EMPLOYEE_ID}',
        '${REJECT_EMPLOYEE_ID}',
        '${OVERRIDE_EMPLOYEE_ID}'
      );

    DELETE FROM overtime_payouts
    WHERE tenant_id = '${TENANT_ID}'
      AND employee_id IN (
        '${AUTO_EMPLOYEE_ID}',
        '${APPROVE_EMPLOYEE_ID}',
        '${REJECT_EMPLOYEE_ID}',
        '${OVERRIDE_EMPLOYEE_ID}'
      );

    DELETE FROM monthly_values
    WHERE tenant_id = '${TENANT_ID}'
      AND employee_id IN (
        '${AUTO_EMPLOYEE_ID}',
        '${APPROVE_EMPLOYEE_ID}',
        '${REJECT_EMPLOYEE_ID}',
        '${OVERRIDE_EMPLOYEE_ID}'
      )
      AND year = ${PERIOD.year}
      AND month = ${PERIOD.month};

    DELETE FROM employees
    WHERE tenant_id = '${TENANT_ID}'
      AND id IN (
        '${AUTO_EMPLOYEE_ID}',
        '${APPROVE_EMPLOYEE_ID}',
        '${REJECT_EMPLOYEE_ID}',
        '${OVERRIDE_EMPLOYEE_ID}'
      );

    DELETE FROM tariffs
    WHERE tenant_id = '${TENANT_ID}'
      AND id IN ('${AUTO_TARIFF_ID}', '${PENDING_TARIFF_ID}');
  `);
}

function seedFixtures() {
  cleanupFixtures();

  runSql(`
    INSERT INTO tenant_payroll_wages (
      id,
      tenant_id,
      code,
      name,
      terp_source,
      category,
      sort_order,
      is_active,
      created_at,
      updated_at
    ) VALUES (
      '67e20900-0000-4000-a000-000000000001',
      '${TENANT_ID}',
      '1010',
      'Überstunden-Auszahlung',
      'overtimePayoutHours',
      'time',
      35,
      true,
      NOW(),
      NOW()
    )
    ON CONFLICT (tenant_id, code) DO UPDATE
    SET
      name = EXCLUDED.name,
      terp_source = EXCLUDED.terp_source,
      category = EXCLUDED.category,
      is_active = true,
      updated_at = NOW();

    INSERT INTO tariffs (
      id,
      tenant_id,
      code,
      name,
      description,
      week_plan_id,
      is_active,
      annual_vacation_days,
      work_days_per_week,
      vacation_basis,
      daily_target_hours,
      weekly_target_hours,
      monthly_target_hours,
      max_flextime_per_month,
      upper_limit_annual,
      lower_limit_annual,
      flextime_threshold,
      credit_type,
      rhythm_type,
      overtime_payout_enabled,
      overtime_payout_threshold_minutes,
      overtime_payout_mode,
      overtime_payout_percentage,
      overtime_payout_fixed_minutes,
      overtime_payout_approval_required,
      created_at,
      updated_at
    ) VALUES
      (
        '${AUTO_TARIFF_ID}',
        '${TENANT_ID}',
        'E2E-OTP-AUTO',
        'E2E Overtime Auto',
        'Auto approval overtime payout fixture',
        '${WEEK_PLAN_ID}',
        true,
        30.00,
        5,
        'calendar_year',
        8.00,
        40.00,
        173.33,
        1800,
        3600,
        -1200,
        30,
        'no_evaluation',
        'weekly',
        false,
        NULL,
        NULL,
        NULL,
        NULL,
        false,
        NOW(),
        NOW()
      ),
      (
        '${PENDING_TARIFF_ID}',
        '${TENANT_ID}',
        'E2E-OTP-PENDING',
        'E2E Overtime Pending',
        'Pending approval overtime payout fixture',
        '${WEEK_PLAN_ID}',
        true,
        30.00,
        5,
        'calendar_year',
        8.00,
        40.00,
        173.33,
        1800,
        3600,
        -1200,
        30,
        'no_evaluation',
        'weekly',
        false,
        NULL,
        NULL,
        NULL,
        NULL,
        false,
        NOW(),
        NOW()
      );

    INSERT INTO employees (
      id,
      tenant_id,
      personnel_number,
      pin,
      first_name,
      last_name,
      entry_date,
      department_id,
      tariff_id,
      weekly_hours,
      vacation_days_per_year,
      is_active,
      created_at,
      updated_at
    ) VALUES
      (
        '${AUTO_EMPLOYEE_ID}',
        '${TENANT_ID}',
        '${AUTO_PERSONNEL}',
        '9101',
        'Auto',
        'E2E OTP',
        '2025-01-01',
        '${HR_DEPARTMENT_ID}',
        '${AUTO_TARIFF_ID}',
        40.00,
        30.00,
        true,
        NOW(),
        NOW()
      ),
      (
        '${APPROVE_EMPLOYEE_ID}',
        '${TENANT_ID}',
        '${APPROVE_PERSONNEL}',
        '9102',
        'Approve',
        'E2E OTP',
        '2025-01-01',
        '${HR_DEPARTMENT_ID}',
        '${PENDING_TARIFF_ID}',
        40.00,
        30.00,
        true,
        NOW(),
        NOW()
      ),
      (
        '${REJECT_EMPLOYEE_ID}',
        '${TENANT_ID}',
        '${REJECT_PERSONNEL}',
        '9103',
        'Reject',
        'E2E OTP',
        '2025-01-01',
        '${HR_DEPARTMENT_ID}',
        '${PENDING_TARIFF_ID}',
        40.00,
        30.00,
        true,
        NOW(),
        NOW()
      ),
      (
        '${OVERRIDE_EMPLOYEE_ID}',
        '${TENANT_ID}',
        '${OVERRIDE_PERSONNEL}',
        '9104',
        'Override',
        'E2E OTP',
        '2025-01-01',
        '${HR_DEPARTMENT_ID}',
        '${AUTO_TARIFF_ID}',
        40.00,
        30.00,
        true,
        NOW(),
        NOW()
      );

    INSERT INTO monthly_values (
      id,
      tenant_id,
      employee_id,
      year,
      month,
      total_gross_time,
      total_net_time,
      total_target_time,
      total_overtime,
      total_undertime,
      total_break_time,
      flextime_start,
      flextime_change,
      flextime_end,
      flextime_carryover,
      vacation_taken,
      sick_days,
      other_absence_days,
      work_days,
      days_with_errors,
      is_closed,
      created_at,
      updated_at
    ) VALUES
      (
        '67e20500-0000-4000-a000-000000000001',
        '${TENANT_ID}',
        '${AUTO_EMPLOYEE_ID}',
        ${PERIOD.year},
        ${PERIOD.month},
        10080,
        10080,
        9600,
        ${OVERTIME_MINUTES},
        0,
        0,
        0,
        ${OVERTIME_MINUTES},
        ${OVERTIME_MINUTES},
        ${OVERTIME_MINUTES},
        0,
        0,
        0,
        20,
        0,
        false,
        NOW(),
        NOW()
      ),
      (
        '67e20500-0000-4000-a000-000000000002',
        '${TENANT_ID}',
        '${APPROVE_EMPLOYEE_ID}',
        ${PERIOD.year},
        ${PERIOD.month},
        10080,
        10080,
        9600,
        ${OVERTIME_MINUTES},
        0,
        0,
        0,
        ${OVERTIME_MINUTES},
        ${OVERTIME_MINUTES},
        ${OVERTIME_MINUTES},
        0,
        0,
        0,
        20,
        0,
        false,
        NOW(),
        NOW()
      ),
      (
        '67e20500-0000-4000-a000-000000000003',
        '${TENANT_ID}',
        '${REJECT_EMPLOYEE_ID}',
        ${PERIOD.year},
        ${PERIOD.month},
        10080,
        10080,
        9600,
        ${OVERTIME_MINUTES},
        0,
        0,
        0,
        ${OVERTIME_MINUTES},
        ${OVERTIME_MINUTES},
        ${OVERTIME_MINUTES},
        0,
        0,
        0,
        20,
        0,
        false,
        NOW(),
        NOW()
      ),
      (
        '67e20500-0000-4000-a000-000000000004',
        '${TENANT_ID}',
        '${OVERRIDE_EMPLOYEE_ID}',
        ${PERIOD.year},
        ${PERIOD.month},
        10080,
        10080,
        9600,
        ${OVERTIME_MINUTES},
        0,
        0,
        0,
        ${OVERTIME_MINUTES},
        ${OVERTIME_MINUTES},
        ${OVERTIME_MINUTES},
        0,
        0,
        0,
        20,
        0,
        false,
        NOW(),
        NOW()
      );
  `);
}

function monthlyValuesRow(page: Page, personnelNumber: string): Locator {
  return page.locator("table tbody tr").filter({ hasText: personnelNumber }).first();
}

function overtimePayoutRow(page: Page, personnelNumber: string): Locator {
  return page.locator("table tbody tr").filter({ hasText: personnelNumber }).first();
}

async function openTariffEditor(page: Page, code: string) {
  await navigateTo(page, "/admin/tariffs");
  await page.locator("main").getByRole("searchbox").fill(code);

  const row = page.locator("table tbody tr").filter({ hasText: code }).first();
  await expect(row).toBeVisible({ timeout: 10000 });
  await row.getByRole("button").last().click();
  await page.getByRole("menuitem", { name: /bearbeiten|edit/i }).click();

  const sheet = await waitForSheet(page);
  await sheet.getByRole("tab", { name: /Auszahlung/i }).click();
  await expect(
    sheet.getByRole("tabpanel", { name: /Auszahlung/i }),
  ).toContainText(/Überstunden-Auszahlung aktivieren/i);
  return sheet;
}

async function setSwitchInRow(
  container: Locator,
  label: RegExp,
  desiredChecked: boolean,
) {
  const control = switchInRow(container, label);
  const desiredState = desiredChecked ? "checked" : "unchecked";
  const currentState = await control.getAttribute("data-state");

  if (currentState !== desiredState) {
    await control.scrollIntoViewIfNeeded();
    await control.focus();
    await control.press("Space");

    if ((await control.getAttribute("data-state")) !== desiredState) {
      await control.click({ force: true });
    }
  }

  await expect(control).toHaveAttribute("data-state", desiredState);
}

function switchInRow(container: Locator, label: RegExp) {
  return container.getByText(label).first().locator("..").getByRole("switch").first();
}

async function setThresholdValue(sheet: Locator, value: string) {
  const input = sheet
    .getByText(/^Schwellenwert/i)
    .first()
    .locator("..")
    .getByRole("textbox");
  await input.fill(value);
  await input.blur();
}

async function expectThresholdValue(sheet: Locator, value: string) {
  const input = sheet
    .getByText(/^Schwellenwert/i)
    .first()
    .locator("..")
    .getByRole("textbox");
  await expect(input).toHaveValue(value);
}

async function goToPreviousMonth(page: Page) {
  const currentLabel = page.locator("main").getByText(PERIOD.labelDe, { exact: false }).first();
  if (await currentLabel.isVisible().catch(() => false)) {
    return;
  }

  await page
    .locator("main")
    .locator("button")
    .filter({ has: page.locator("svg.lucide-chevron-left") })
    .first()
    .click();

  await expect(currentLabel).toBeVisible({
    timeout: 10000,
  });
}

async function closeSelectedMonth(page: Page) {
  await page.getByPlaceholder("Mitarbeiter suchen...").fill("E2EOTP-");
  await expect(monthlyValuesRow(page, AUTO_PERSONNEL)).toBeVisible();

  await page.getByRole("checkbox", { name: "Alle auswählen" }).click();
  await page.getByRole("button", { name: "Ausgewählte schließen" }).click();

  const dialog = await waitForSheet(page);
  const recalculate = dialog.getByRole("checkbox");
  if ((await recalculate.getAttribute("data-state")) === "checked") {
    await recalculate.click();
  }

  await dialog.getByRole("button", { name: "Monat schließen" }).click();
  await expect(dialog.getByText("Ergebnisse")).toBeVisible({ timeout: 15000 });
  await expect(dialog.getByText("Geschlossen: 4")).toBeVisible({ timeout: 15000 });
  await dialog.getByRole("button", { name: "Fertig" }).click();
  await expect(dialog).toHaveCount(0, { timeout: 10000 });
}

async function waitForMonthlyValuesState(
  page: Page,
  personnelNumber: string,
  expectedBalance: string,
  expectedPayoutText: RegExp,
) {
  const row = monthlyValuesRow(page, personnelNumber);
  await expect(row).toBeVisible({ timeout: 10000 });
  await expect(row.locator("td").nth(7)).toHaveText(expectedBalance, {
    timeout: 10000,
  });
  await expect(row.locator("td").nth(8)).toContainText(expectedPayoutText, {
    timeout: 10000,
  });
}

async function downloadLatestDatevExport(page: Page) {
  const row = page.locator("table tbody tr").first();
  await expect(row).toContainText("DATEV", { timeout: 20000 });
  await expect(row).toContainText("Abgeschlossen", { timeout: 20000 });

  const downloadPromise = page.waitForEvent("download");
  await row.getByRole("button").last().click();
  await page.getByRole("menuitem", { name: "Herunterladen" }).click();
  const download = await downloadPromise;

  const path = await download.path();
  if (!path) {
    throw new Error("Download path unavailable");
  }

  return readFileSync(path, "utf8");
}

test.describe.serial("Overtime payout ticket coverage", () => {
  test.beforeAll(() => {
    seedFixtures();
  });

  test.afterAll(() => {
    cleanupFixtures();
  });

  test("admin configures the auto-approve payout rule on the tariff", async ({
    page,
  }) => {
    const sheet = await openTariffEditor(page, "E2E-OTP-AUTO");

    await setSwitchInRow(sheet, /Überstunden-Auszahlung aktivieren/i, true);
    await sheet.getByText("Auszahlungsmodus").locator("..").getByRole("combobox").click();
    await page.getByRole("option", { name: "Alles über Schwellenwert" }).click();
    await setThresholdValue(sheet, THRESHOLD_VALUE);
    await setSwitchInRow(sheet, /Freigabe erforderlich/i, false);
    await submitAndWaitForClose(page);

    const reopenedSheet = await openTariffEditor(page, "E2E-OTP-AUTO");
    await expect(
      switchInRow(reopenedSheet, /Überstunden-Auszahlung aktivieren/i),
    ).toHaveAttribute("data-state", "checked");
    await expect(reopenedSheet.getByRole("combobox")).toContainText("Alles über Schwellenwert");
    await expectThresholdValue(reopenedSheet, THRESHOLD_VALUE);
    await expect(
      switchInRow(reopenedSheet, /Freigabe erforderlich/i),
    ).toHaveAttribute("data-state", "unchecked");
  });

  test("admin configures the approval-required payout tariff", async ({
    page,
  }) => {
    const sheet = await openTariffEditor(page, "E2E-OTP-PENDING");

    await setSwitchInRow(sheet, /Überstunden-Auszahlung aktivieren/i, true);
    await sheet.getByText("Auszahlungsmodus").locator("..").getByRole("combobox").click();
    await page.getByRole("option", { name: "Alles über Schwellenwert" }).click();
    await setThresholdValue(sheet, THRESHOLD_VALUE);
    await setSwitchInRow(sheet, /Freigabe erforderlich/i, true);
    await submitAndWaitForClose(page);

    const reopenedSheet = await openTariffEditor(page, "E2E-OTP-PENDING");
    await expect(reopenedSheet.getByRole("combobox")).toContainText("Alles über Schwellenwert");
    await expectThresholdValue(reopenedSheet, THRESHOLD_VALUE);
    await expect(
      switchInRow(reopenedSheet, /Freigabe erforderlich/i),
    ).toHaveAttribute("data-state", "checked");
  });

  test("employee override can disable payout creation for a single employee", async ({
    page,
  }) => {
    await navigateTo(page, `/admin/employees/${OVERRIDE_EMPLOYEE_ID}`);
    await clickTab(page, /Spezialfälle/i);

    const switchControl = page.locator("#overtime-payout-override-enabled");
    const currentEnabledField = page.getByText("Aktuelle Aktivierung").locator("..");

    await expect(page.getByText("Tarif-Regel wird angewendet")).toBeVisible();
    await expect(switchControl).toHaveAttribute("data-state", "checked");

    await switchControl.click();
    await page.getByRole("button", { name: /Speichern/i }).click();

    await expect(page.getByText("Override aktiv")).toBeVisible({ timeout: 10000 });
    await expect(switchControl).toHaveAttribute("data-state", "unchecked");
    await expect(currentEnabledField).toContainText("Deaktiviert");
  });

  test("batch close creates approved, pending, and skipped payout outcomes in monthly values", async ({
    page,
  }) => {
    await navigateTo(page, "/admin/monthly-values");
    await goToPreviousMonth(page);
    await closeSelectedMonth(page);

    await waitForMonthlyValuesState(
      page,
      AUTO_PERSONNEL,
      "+10:00",
      /2:00.*genehmigt/i,
    );
    await waitForMonthlyValuesState(
      page,
      APPROVE_PERSONNEL,
      "+12:00",
      /2:00.*ausstehend/i,
    );
    await waitForMonthlyValuesState(
      page,
      REJECT_PERSONNEL,
      "+12:00",
      /2:00.*ausstehend/i,
    );

    const overrideRow = monthlyValuesRow(page, OVERRIDE_PERSONNEL);
    await expect(overrideRow.locator("td").nth(7)).toHaveText("+12:00");
    await expect(overrideRow.locator("td").nth(8)).toHaveText("—");
  });

  test("hr can approve and reject pending payouts from the payout overview", async ({
    page,
  }) => {
    await navigateTo(page, "/admin/overtime-payouts");
    await goToPreviousMonth(page);

    const search = page.getByPlaceholder("Mitarbeiter suchen...");

    await search.fill(APPROVE_PERSONNEL);
    const approveRow = overtimePayoutRow(page, APPROVE_PERSONNEL);
    await expect(approveRow).toContainText("Ausstehend");
    await approveRow.locator("button").first().click();
    await expect(approveRow).toContainText("Genehmigt", { timeout: 10000 });

    await search.fill(REJECT_PERSONNEL);
    const rejectRow = overtimePayoutRow(page, REJECT_PERSONNEL);
    await expect(rejectRow).toContainText("Ausstehend");
    await rejectRow.locator("button").last().click();

    await page.getByPlaceholder("Begründung eingeben...").fill(REJECTION_REASON);
    await page.getByRole("button", { name: "Ablehnen" }).last().click();
    await expect(rejectRow).toContainText("Abgelehnt", { timeout: 10000 });
  });

  test("monthly balances update after manual decisions and DATEV export contains wage type 1010", async ({
    page,
  }) => {
    await navigateTo(page, "/admin/monthly-values");
    await goToPreviousMonth(page);
    await page.getByPlaceholder("Mitarbeiter suchen...").fill("E2EOTP-");

    await waitForMonthlyValuesState(
      page,
      AUTO_PERSONNEL,
      "+10:00",
      /2:00.*genehmigt/i,
    );
    await waitForMonthlyValuesState(
      page,
      APPROVE_PERSONNEL,
      "+10:00",
      /2:00.*genehmigt/i,
    );

    const rejectRow = monthlyValuesRow(page, REJECT_PERSONNEL);
    await expect(rejectRow.locator("td").nth(7)).toHaveText("+12:00");
    await expect(rejectRow.locator("td").nth(8)).toContainText(/abgelehnt/i);
    await expect(rejectRow.locator("td").nth(8)).not.toContainText("2:00");

    const overrideRow = monthlyValuesRow(page, OVERRIDE_PERSONNEL);
    await expect(overrideRow.locator("td").nth(7)).toHaveText("+12:00");
    await expect(overrideRow.locator("td").nth(8)).toHaveText("—");

    await navigateTo(page, "/admin/payroll-exports");
    await page.getByRole("button", { name: "Export erstellen" }).click();

    const sheet = await waitForSheet(page);
    await sheet.locator('input[type="number"]').fill(String(PERIOD.year));
    await sheet.getByText("Monat").locator("..").getByRole("combobox").click();
    await page
      .getByRole("option", {
        name: new Intl.DateTimeFormat("en", { month: "long" }).format(
          new Date(2000, PERIOD.month - 1, 1),
        ),
      })
      .click();

    await sheet.getByText("Exporttyp").locator("..").getByRole("combobox").click();
    await page.getByRole("option", { name: "DATEV" }).click();
    const advancedParametersButton = sheet.getByRole("button", {
      name: /Erweiterte Parameter/i,
    });
    await advancedParametersButton.scrollIntoViewIfNeeded();
    await advancedParametersButton.click();

    const employeeIdsInput = sheet
      .getByText(/Mitarbeiter-IDs/i)
      .locator("..")
      .locator("input");
    await expect(employeeIdsInput).toBeVisible({ timeout: 10000 });
    await employeeIdsInput.fill(`${AUTO_EMPLOYEE_ID},${APPROVE_EMPLOYEE_ID}`);

    await sheet.getByTestId("generate-export-submit").click();
    await expect(sheet).toHaveCount(0, { timeout: 10000 });

    const exportContent = await downloadLatestDatevExport(page);

    expect(exportContent).toContain(`${AUTO_PERSONNEL};E2E OTP;Auto;1002;12.00;`);
    expect(exportContent).toContain(`${AUTO_PERSONNEL};E2E OTP;Auto;1010;2.00;`);
    expect(exportContent).toContain(`${APPROVE_PERSONNEL};E2E OTP;Approve;1002;12.00;`);
    expect(exportContent).toContain(`${APPROVE_PERSONNEL};E2E OTP;Approve;1010;2.00;`);
  });
});
