import { test, expect } from "@playwright/test";

// ---------------------------------------------------------------------------
// Phase 8.5: Tenant-side support consent flow (/admin/settings/support-access)
//
// Covers the tenant admin's side of the platform-admin support session
// lifecycle. The cross-domain platform side (operator login, MFA, activate,
// revoke from /platform/*) is covered by Vitest in Phases 2-3.
// ---------------------------------------------------------------------------

const E2E_REASON = `E2E support consent flow ${Date.now()}`;

test.describe("Platform support consent flow", () => {
  test("create, list, and revoke a support session", async ({ page }) => {
    await page.goto("/admin/settings/support-access");
    await page
      .locator("#main-content")
      .waitFor({ state: "visible", timeout: 15_000 });
    await expect(
      page.getByRole("heading", { level: 1, name: /Support-Zugriff/i }),
    ).toBeVisible();

    // No banner should be visible — no active session yet.
    await expect(
      page.getByRole("status").filter({ hasText: /Support-Zugriff aktiv/i }),
    ).toHaveCount(0);

    // 1. Open the request form
    await page
      .getByRole("button", { name: /Support-Zugriff anfordern/i })
      .first()
      .click();

    // 2. Fill the form
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    await dialog.getByPlaceholder(/Fehler #1234/i).fill(E2E_REASON);
    // TTL defaults to 1 hour — change to 30 minutes via the Select.
    await dialog.getByRole("combobox").click();
    await page.getByRole("option", { name: "30 Minuten" }).click();

    // 3. Submit
    await dialog.getByRole("button", { name: /^Anfordern$/ }).click();

    // Sheet should close on success
    await expect(dialog).toBeHidden({ timeout: 10_000 });

    // 4. Row appears in the table with status "pending" + our reason
    const row = page
      .locator("table tbody tr")
      .filter({ hasText: E2E_REASON });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(/Wartet auf Aktivierung/i);

    // 5. Revoke
    await row.getByRole("button", { name: /Zugriff entziehen/i }).click();

    const confirm = page
      .getByRole("dialog")
      .filter({ hasText: /Support-Zugriff entziehen/i });
    await expect(confirm).toBeVisible();
    await confirm
      .getByRole("button", { name: /^Zugriff entziehen$/ })
      .click();

    // 6. Row status flips to "Widerrufen"
    await expect(row).toContainText(/Widerrufen/i, { timeout: 10_000 });

    // 7. Banner is still gone (pending → revoked never activates the
    //    impersonation banner, but assert explicitly so a regression that
    //    leaks an active session would fail this test).
    await expect(
      page.getByRole("status").filter({ hasText: /Support-Zugriff aktiv/i }),
    ).toHaveCount(0);
  });
});
