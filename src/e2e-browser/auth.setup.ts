import { test as setup } from "@playwright/test";
import {
  ADMIN_STORAGE,
  SEED,
  USER_STORAGE,
  loginAsAdmin,
  loginAsUser,
} from "./helpers/auth";

setup("authenticate as admin", async ({ page }) => {
  await loginAsAdmin(page);
  await page.evaluate((tenantId) => {
    window.localStorage.setItem("tenant_id", tenantId);
  }, SEED.TENANT_ID);
  await page.context().storageState({ path: ADMIN_STORAGE });
});

setup("authenticate as user", async ({ page }) => {
  await loginAsUser(page);
  await page.evaluate((tenantId) => {
    window.localStorage.setItem("tenant_id", tenantId);
  }, SEED.TENANT_ID);
  await page.context().storageState({ path: USER_STORAGE });
});
