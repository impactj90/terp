import { test as setup } from "@playwright/test";
import {
  ADMIN_STORAGE,
  APPROVER_STORAGE,
  HR_STORAGE,
  SEED,
  USER_STORAGE,
  WR_MANAGER_STORAGE,
  WR_VIEWER_STORAGE,
  loginAsAdmin,
  loginAsApprover,
  loginAsHr,
  loginAsUser,
  loginAsWrManager,
  loginAsWrViewer,
} from "./helpers/auth";

async function persistTenant(page: { evaluate: (fn: (id: string) => void, arg: string) => Promise<void> }) {
  await page.evaluate((tenantId) => {
    window.localStorage.setItem("tenant_id", tenantId);
  }, SEED.TENANT_ID);
}

setup("authenticate as admin", async ({ page }) => {
  await loginAsAdmin(page);
  await persistTenant(page);
  await page.context().storageState({ path: ADMIN_STORAGE });
});

setup("authenticate as user", async ({ page }) => {
  await loginAsUser(page);
  await persistTenant(page);
  await page.context().storageState({ path: USER_STORAGE });
});

setup("authenticate as approver", async ({ page }) => {
  await loginAsApprover(page);
  await persistTenant(page);
  await page.context().storageState({ path: APPROVER_STORAGE });
});

setup("authenticate as hr", async ({ page }) => {
  await loginAsHr(page);
  await persistTenant(page);
  await page.context().storageState({ path: HR_STORAGE });
});

setup("authenticate as wr-viewer", async ({ page }) => {
  await loginAsWrViewer(page);
  await persistTenant(page);
  await page.context().storageState({ path: WR_VIEWER_STORAGE });
});

setup("authenticate as wr-manager", async ({ page }) => {
  await loginAsWrManager(page);
  await persistTenant(page);
  await page.context().storageState({ path: WR_MANAGER_STORAGE });
});
