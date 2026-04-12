import { test as setup } from "@playwright/test";
import { ADMIN_STORAGE, USER_STORAGE } from "./helpers/auth";

setup("authenticate as admin", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: /Login as Admin|Als Admin anmelden/i }).click();
  await page.waitForURL("**/dashboard", { timeout: 15_000 });
  await page.context().storageState({ path: ADMIN_STORAGE });
});

setup("authenticate as user", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: /Login as User|Als Benutzer anmelden/i }).click();
  await page.waitForURL("**/dashboard", { timeout: 15_000 });
  await page.context().storageState({ path: USER_STORAGE });
});
