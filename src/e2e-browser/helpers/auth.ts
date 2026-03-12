import type { Page } from "@playwright/test";

export const ADMIN_STORAGE = ".auth/admin.json";
export const USER_STORAGE = ".auth/user.json";

export const SEED = {
  TENANT_ID: "10000000-0000-0000-0000-000000000001",
  ADMIN_EMAIL: "admin@dev.local",
  ADMIN_PASSWORD: "dev-password-admin",
  USER_EMAIL: "user@dev.local",
  USER_PASSWORD: "dev-password-user",
} as const;

/** Login via the dev quick-login buttons (development mode only) */
export async function loginAsAdmin(page: Page): Promise<void> {
  await page.goto("/login");
  await page
    .getByRole("button", { name: /Login as Admin|Als Admin anmelden/i })
    .click();
  // Wait for dashboard to load (URL may include locale prefix)
  await page.waitForURL(/dashboard/, { timeout: 15_000 });
  await page.locator("main#main-content, main").first().waitFor({ state: "visible", timeout: 10_000 });
}

export async function loginAsUser(page: Page): Promise<void> {
  await page.goto("/login");
  await page
    .getByRole("button", { name: /Login as User|Als Benutzer anmelden/i })
    .click();
  await page.waitForURL("**/dashboard", { timeout: 15_000 });
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
  await page.getByRole("button", { name: /anmelden|sign in/i }).click();
  await page.waitForURL("**/dashboard", { timeout: 15_000 });
}
