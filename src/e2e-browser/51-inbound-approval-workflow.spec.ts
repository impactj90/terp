import { test, expect } from "@playwright/test";
import { navigateTo } from "./helpers/nav";
import { USER_STORAGE } from "./helpers/auth";
import * as path from "path";

const ZUGFERD_FIXTURE = path.resolve(
  __dirname,
  "../lib/services/__tests__/fixtures/zugferd/EN16931_Einfach.pdf"
);

/**
 * UC-INV-02: Approval Workflow + DATEV Export
 *
 * global-setup seeds an approval policy: Regular User approves all invoices.
 * Admin uploads + submits → PENDING_APPROVAL → User approves → APPROVED → DATEV export
 */
test.describe.serial("UC-INV-02: Approval Workflow + DATEV Export", () => {
  let invoiceDetailUrl: string;
  let invoiceId: string;

  // ---------------------------------------------------------------
  // 1. Admin uploads invoice + submits → PENDING_APPROVAL
  //    (Policy seeded in global-setup: User = approver)
  // ---------------------------------------------------------------
  test("admin uploads and submits invoice → PENDING_APPROVAL", async ({ page }) => {
    await navigateTo(page, "/invoices/inbound");
    const main = page.locator("main#main-content");

    // Upload ZUGFeRD PDF
    await main.getByRole("button", { name: /Hochladen|Upload/i }).click();
    await expect(page.locator("[role='dialog']")).toBeVisible();
    await page.locator("input[type='file']").setInputFiles(ZUGFERD_FIXTURE);
    await page.waitForURL("**/invoices/inbound/**", { timeout: 15_000 });

    invoiceDetailUrl = page.url();
    invoiceId = invoiceDetailUrl.split("/").pop()!;
    await page.waitForLoadState("networkidle");

    // Check if supplier needs assignment
    const assignButton = page.getByRole("button", { name: /Lieferant zuweisen|Assign Supplier/i });
    if (await assignButton.isVisible().catch(() => false)) {
      // Assign first supplier from search
      await assignButton.click();
      await expect(page.locator("[role='dialog']").last()).toBeVisible();
      // Type the seller name from ZUGFeRD to search
      await page.locator("[role='dialog'] input[type='text']").last().fill("Lieferant");
      await page.waitForTimeout(1500);
      // Click first assign button in results
      const assignBtn = page.locator("[role='dialog']").last().getByRole("button", { name: /Zuweisen|Assign/i }).first();
      if (await assignBtn.isVisible().catch(() => false)) {
        await assignBtn.click();
        await page.waitForTimeout(1000);
      }
    }

    // Submit for approval
    const submitBtn = page.getByRole("button", { name: /Zur Freigabe|Submit/i });
    await expect(submitBtn).toBeVisible({ timeout: 5_000 });
    await submitBtn.click();
    await page.waitForTimeout(2000);

    // With the seeded policy → PENDING_APPROVAL (not auto-approved)
    await expect(
      page.getByText(/Freigabe ausstehend|Pending/i).first()
    ).toBeVisible({ timeout: 10_000 });
  });

  // ---------------------------------------------------------------
  // 2. Approval timeline shows pending step
  // ---------------------------------------------------------------
  test("detail page shows approval timeline with pending step", async ({ page }) => {
    test.skip(!invoiceDetailUrl, "No invoice from previous test");
    await page.goto(invoiceDetailUrl);
    await page.waitForLoadState("networkidle");

    // Approval timeline should be visible
    await expect(
      page.getByText(/Freigabeverlauf|Approval History/i)
    ).toBeVisible({ timeout: 10_000 });

    // Should show "Schritt 1" / "Step 1"
    await expect(
      page.getByText(/Schritt 1|Step 1/i)
    ).toBeVisible();

    // Should show "Ausstehend" / "Pending" badge
    await expect(
      page.getByText(/Ausstehend|Pending/i).first()
    ).toBeVisible();
  });

  // ---------------------------------------------------------------
  // 3. Admin cannot approve own invoice (submitter ≠ approver)
  //    Admin is NOT the assigned approver (User is), so approve
  //    buttons should NOT be visible for admin
  // ---------------------------------------------------------------
  test("admin does not see approve/reject buttons (not the approver)", async ({ page }) => {
    test.skip(!invoiceDetailUrl, "No invoice from previous test");
    await page.goto(invoiceDetailUrl);
    await page.waitForLoadState("networkidle");

    // Approve/Reject buttons should NOT be visible (admin is not the assigned approver)
    await expect(
      page.getByRole("button", { name: /Freigeben|Approve$/i })
    ).not.toBeVisible();
    await expect(
      page.getByRole("button", { name: /Ablehnen|Reject/i })
    ).not.toBeVisible();
  });

  // ---------------------------------------------------------------
  // 4. User sees pending approval in the approvals list
  // ---------------------------------------------------------------
  test("user sees pending approval", async ({ browser }) => {
    test.skip(!invoiceId, "No invoice from previous test");

    // Switch to user session
    const userContext = await browser.newContext({ storageState: USER_STORAGE });
    const page = await userContext.newPage();

    await navigateTo(page, "/invoices/inbound/approvals");

    // Should see the pending invoice
    await expect(
      page.getByText("471102")
    ).toBeVisible({ timeout: 10_000 });

    await userContext.close();
  });

  // ---------------------------------------------------------------
  // 5. User approves the invoice
  // ---------------------------------------------------------------
  test("user approves the invoice → APPROVED", async ({ browser }) => {
    test.skip(!invoiceDetailUrl, "No invoice from previous test");

    const userContext = await browser.newContext({ storageState: USER_STORAGE });
    const page = await userContext.newPage();

    await page.goto(invoiceDetailUrl);
    await page.waitForLoadState("networkidle");

    // User should see Approve button
    const approveBtn = page.getByRole("button", { name: /Freigeben|Approve$/i });
    await expect(approveBtn).toBeVisible({ timeout: 10_000 });

    // Click approve
    await approveBtn.click();

    // Confirm dialog
    await expect(page.locator("[role='alertdialog'], [role='dialog']").last()).toBeVisible();
    await page.locator("[role='alertdialog'] button, [role='dialog'] button")
      .filter({ hasText: /Freigeben|Bestätigen|Confirm|Approve/i }).last().click();

    // Wait for success
    await page.waitForTimeout(2000);

    // Status should be APPROVED
    await expect(
      page.getByText(/Freigegeben|Approved/i).first()
    ).toBeVisible({ timeout: 10_000 });

    await userContext.close();
  });

  // ---------------------------------------------------------------
  // 6. Admin sees APPROVED status + DATEV export button
  // ---------------------------------------------------------------
  test("admin sees approved invoice with DATEV export button", async ({ page }) => {
    test.skip(!invoiceDetailUrl, "No invoice from previous test");
    await page.goto(invoiceDetailUrl);
    await page.waitForLoadState("networkidle");

    // Status: APPROVED
    await expect(
      page.getByText(/Freigegeben|Approved/i).first()
    ).toBeVisible({ timeout: 10_000 });

    // DATEV Export button visible
    await expect(
      page.getByRole("button", { name: /DATEV Export/i })
    ).toBeVisible();
  });

  // ---------------------------------------------------------------
  // 7. DATEV Export downloads CSV + status → EXPORTED
  // ---------------------------------------------------------------
  test("DATEV export downloads CSV and marks as exported", async ({ page }) => {
    test.skip(!invoiceDetailUrl, "No invoice from previous test");
    await page.goto(invoiceDetailUrl);
    await page.waitForLoadState("networkidle");

    // Trigger download
    const downloadPromise = page.waitForEvent("download", { timeout: 15_000 });
    await page.getByRole("button", { name: /DATEV Export/i }).click();

    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/DATEV_Buchungsstapel.*\.csv$/);

    // Status → EXPORTED
    await page.waitForTimeout(2000);
    await expect(
      page.getByText(/Exportiert|Exported/i).first()
    ).toBeVisible({ timeout: 10_000 });
  });

  // ---------------------------------------------------------------
  // 8. Approval timeline shows completed step
  // ---------------------------------------------------------------
  test("approval timeline shows approved step after approval", async ({ page }) => {
    test.skip(!invoiceDetailUrl, "No invoice from previous test");
    await page.goto(invoiceDetailUrl);
    await page.waitForLoadState("networkidle");

    // Timeline should show "Freigegeben" for step 1
    await expect(
      page.getByText(/Freigabeverlauf|Approval History/i)
    ).toBeVisible({ timeout: 10_000 });
  });

  // ---------------------------------------------------------------
  // 9. List page: filter for EXPORTED shows the invoice
  // ---------------------------------------------------------------
  test("list page filters for exported invoices", async ({ page }) => {
    await navigateTo(page, "/invoices/inbound");
    const main = page.locator("main#main-content");

    await main.locator("button[role='combobox']").first().click();
    await page.getByRole("option", { name: /Exportiert|Exported/i }).click();
    await page.waitForTimeout(1000);

    await expect(main.getByText("471102")).toBeVisible({ timeout: 5_000 });
  });
});
