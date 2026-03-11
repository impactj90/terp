import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

/** Navigate to an admin page and wait for the main content to load */
export async function navigateTo(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await page.locator("main#main-content").waitFor({ state: "visible" });
}

/** Navigate to an admin page via sidebar link */
export async function navigateViaSidebar(
  page: Page,
  href: string,
): Promise<void> {
  await page
    .locator('nav[aria-label="Main navigation"]')
    .locator(`a[href*="${href}"]`)
    .click();
  await page.waitForURL(`**${href}`);
  await page.locator("main#main-content").waitFor({ state: "visible" });
}

/** Wait for data table to have at least one row */
export async function waitForTableLoad(page: Page): Promise<void> {
  await page
    .locator("table tbody tr")
    .first()
    .waitFor({ state: "visible", timeout: 10_000 });
}

/** Assert page heading text */
export async function expectPageTitle(
  page: Page,
  title: string | RegExp,
): Promise<void> {
  await expect(
    page.locator("main#main-content").getByRole("heading", { level: 1 }),
  ).toHaveText(title);
}
