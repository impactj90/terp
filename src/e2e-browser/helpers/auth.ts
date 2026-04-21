import type { Page } from "@playwright/test";

export const ADMIN_STORAGE = ".auth/admin.json";
export const USER_STORAGE = ".auth/user.json";
export const APPROVER_STORAGE = ".auth/approver.json";
export const HR_STORAGE = ".auth/hr.json";

export const SEED = {
  TENANT_ID: "10000000-0000-0000-0000-000000000001",
  ADMIN_EMAIL: "admin@dev.local",
  ADMIN_PASSWORD: "dev-password-admin",
  USER_EMAIL: "user@dev.local",
  USER_PASSWORD: "dev-password-user",
  APPROVER_EMAIL: "approver@dev.local",
  APPROVER_PASSWORD: "dev-password-approver",
  HR_EMAIL: "hr@dev.local",
  HR_PASSWORD: "dev-password-hr",
  // Employee IDs (from seed.sql)
  ADMIN_EMPLOYEE_ID: "00000000-0000-0000-0000-000000000011",
  USER_EMPLOYEE_ID: "00000000-0000-0000-0000-000000000012",
  APPROVER_EMPLOYEE_ID: "00000000-0000-0000-0000-000000000017",
  HR_EMPLOYEE_ID: "00000000-0000-0000-0000-000000000018",
} as const;

async function loginWithDevButton(page: Page, label: RegExp): Promise<void> {
  await page.goto("/login");

  const button = page.getByRole("button", { name: label });
  await button.waitFor({ state: "visible", timeout: 30_000 });
  await button.waitFor({ state: "attached", timeout: 30_000 });

  await page.waitForFunction(
    (buttonText) => {
      const buttons = Array.from(document.querySelectorAll("button"));
      const match = buttons.find((candidate) =>
        candidate.textContent?.match(buttonText),
      );

      return Boolean(match && !match.hasAttribute("disabled"));
    },
    label.source,
    { timeout: 30_000 },
  );

  await button.click();
  await page.waitForURL(/dashboard/, { timeout: 30_000 });
  await page
    .locator("main#main-content, main")
    .first()
    .waitFor({ state: "visible", timeout: 15_000 });
}

/** Login via the dev quick-login buttons (development mode only) */
export async function loginAsAdmin(page: Page): Promise<void> {
  await loginWithDevButton(page, /Login as Admin|Als Admin anmelden/i);
}

export async function loginAsUser(page: Page): Promise<void> {
  await loginWithDevButton(page, /Login as User|Als Benutzer anmelden/i);
}

/** Login with manual email/password (used by UC-004 login/logout test) */
export async function login(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  // Submit button is the "Anmelden" (or "Sign in") submit; dev quick-login
  // buttons read "Als Admin anmelden" / "Als Benutzer anmelden" so we must
  // match exactly.
  await page
    .locator('button[type="submit"]')
    .filter({ hasText: /^(Anmelden|Sign in)$/i })
    .click();
  await page.waitForURL("**/dashboard", { timeout: 15_000 });
}

export async function loginAsApprover(page: Page): Promise<void> {
  await login(page, SEED.APPROVER_EMAIL, SEED.APPROVER_PASSWORD);
}

export async function loginAsHr(page: Page): Promise<void> {
  await login(page, SEED.HR_EMAIL, SEED.HR_PASSWORD);
}
