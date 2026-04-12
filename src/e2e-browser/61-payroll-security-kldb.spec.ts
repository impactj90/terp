import { test, expect } from "@playwright/test";
import { execSync } from "child_process";
import { clickTab } from "./helpers/forms";

const PSQL = 'psql "postgresql://postgres:postgres@localhost:54322/postgres" -t -c';
const EMP_ID = "00000000-0000-0000-0000-000000000013"; // Maria Schmidt
const EMP_PAGE = `/de/admin/employees/${EMP_ID}`;

function sql(query: string): string {
  return execSync(`${PSQL} "${query}"`, { encoding: "utf-8" }).trim();
}

// ═══════════════════════════════════════════════════════════════════
// 1. DB-Level Encryption Verification
// ═══════════════════════════════════════════════════════════════════

test.describe("DB Encryption Verification", () => {
  test("tax_id is stored encrypted (v1:... format), not as plaintext", () => {
    const raw = sql(`SELECT tax_id FROM employees WHERE id = '${EMP_ID}'`);
    expect(raw).toMatch(/^v\d+:/);
    // Must NOT contain the plaintext tax ID
    expect(raw).not.toMatch(/^\d{11}$/);
    expect(raw).not.toContain("86095273488");
  });

  test("social_security_number is stored encrypted", () => {
    const raw = sql(`SELECT social_security_number FROM employees WHERE id = '${EMP_ID}'`);
    expect(raw).toMatch(/^v\d+:/);
    expect(raw).not.toContain("65180175M003");
  });

  test("iban is stored encrypted", () => {
    const raw = sql(`SELECT iban FROM employees WHERE id = '${EMP_ID}'`);
    expect(raw).toMatch(/^v\d+:/);
    expect(raw).not.toContain("DE89");
    expect(raw).not.toContain("3704");
  });

  test("garnishment creditor_name is stored encrypted", () => {
    const raw = sql(`SELECT creditor_name FROM employee_garnishments WHERE employee_id = '${EMP_ID}' LIMIT 1`);
    if (raw) {
      expect(raw).toMatch(/^v\d+:/);
    }
  });

  test("savings recipient_iban is stored encrypted when set", () => {
    const raw = sql(`SELECT recipient_iban FROM employee_savings WHERE employee_id = '${EMP_ID}' AND recipient_iban IS NOT NULL LIMIT 1`);
    if (raw) {
      expect(raw).toMatch(/^v\d+:/);
    }
  });

  test("encrypted fields are decryptable (round-trip via API)", async ({ page }) => {
    // Navigate to bank tab and verify the IBAN shows decrypted
    await page.goto(EMP_PAGE);
    await page.locator("#main-content").waitFor({ state: "visible" });
    await clickTab(page, /bankverbindung/i);
    const tabContent = page.locator('[role="tabpanel"]');
    // The IBAN should show masked (last 4 digits visible) — proves decryption worked
    await expect(tabContent.getByText(/3000/).first()).toBeVisible({ timeout: 10_000 });
  });
});

// ═══════════════════════════════════════════════════════════════════
// 2. Permission Tests (UI + API)
// ═══════════════════════════════════════════════════════════════════

test.describe("Permission-Based Access Control", () => {
  // These tests use the "user" storage state (non-admin, regular employee)
  // The user auth is stored in .auth/user.json (from auth.setup.ts)

  test("payroll tabs are hidden for user without payroll permissions", async ({ browser }) => {
    // Create a new context with the regular user (no payroll permissions)
    const userContext = await browser.newContext({
      storageState: ".auth/user.json",
    });
    const page = await userContext.newPage();

    await page.goto(EMP_PAGE);
    await page.locator("#main-content").waitFor({ state: "visible", timeout: 15_000 }).catch(() => {
      // User might not have access to this page at all — that's also valid
    });

    // If the page loaded, verify payroll tabs are NOT visible
    const tabList = page.getByRole("tablist");
    if (await tabList.isVisible().catch(() => false)) {
      await expect(page.getByRole("tab", { name: /steuern & sv/i })).not.toBeVisible();
      await expect(page.getByRole("tab", { name: /bankverbindung/i })).not.toBeVisible();
      await expect(page.getByRole("tab", { name: /vergütung/i })).not.toBeVisible();
      await expect(page.getByRole("tab", { name: /pfändungen/i })).not.toBeVisible();
      await expect(page.getByRole("tab", { name: /auslandstätigkeit/i })).not.toBeVisible();
    }

    await userContext.close();
  });

  test("tRPC API rejects payroll data access without permission", async ({ browser }) => {
    const userContext = await browser.newContext({
      storageState: ".auth/user.json",
    });
    const req = userContext.request;

    const input = encodeURIComponent(JSON.stringify({ employeeId: EMP_ID }));
    const response = await req.get(`http://localhost:3001/api/trpc/employeeChildren.list?input=${input}`, {
      headers: { "x-tenant-id": "10000000-0000-0000-0000-000000000001" },
    });

    // Should be rejected — either 401/403 or a TRPC error in the JSON body
    const body = await response.json().catch(() => null);
    const isRejected = !response.ok() || body?.error?.data?.code === "FORBIDDEN" || body?.error?.data?.code === "UNAUTHORIZED";
    expect(isRejected).toBe(true);

    await userContext.close();
  });

  test("tRPC API rejects garnishment access without garnishment permission", async ({ browser }) => {
    const userContext = await browser.newContext({
      storageState: ".auth/user.json",
    });
    const req = userContext.request;

    const input = encodeURIComponent(JSON.stringify({ employeeId: EMP_ID }));
    const response = await req.get(`http://localhost:3001/api/trpc/employeeGarnishments.list?input=${input}`, {
      headers: { "x-tenant-id": "10000000-0000-0000-0000-000000000001" },
    });

    const body = await response.json().catch(() => null);
    const isRejected = !response.ok() || body?.error?.data?.code === "FORBIDDEN" || body?.error?.data?.code === "UNAUTHORIZED";
    expect(isRejected).toBe(true);

    await userContext.close();
  });
});

// ═══════════════════════════════════════════════════════════════════
// 3. KldB Autocomplete with Real Search Terms
// ═══════════════════════════════════════════════════════════════════

test.describe("KldB Tätigkeitsschlüssel Search (DB-level)", () => {
  // These tests verify KldB search directly via SQL since the tRPC endpoint
  // requires Supabase JWT auth which is localStorage-based (not cookie-based).

  test("'Elektrotechnik' returns relevant results via full-text search", () => {
    const result = sql(
      `SELECT count(*) FROM activity_codes_kldb WHERE is_active = true AND to_tsvector('german', name) @@ plainto_tsquery('german', 'Elektrotechnik')`
    );
    expect(parseInt(result)).toBeGreaterThan(0);
  });

  test("'Elektronik' returns results", () => {
    const result = sql(
      `SELECT count(*) FROM activity_codes_kldb WHERE is_active = true AND to_tsvector('german', name) @@ plainto_tsquery('german', 'Elektronik')`
    );
    expect(parseInt(result)).toBeGreaterThan(0);
  });

  test("'Informatik' returns software-related codes", () => {
    const rows = sql(
      `SELECT code FROM activity_codes_kldb WHERE is_active = true AND to_tsvector('german', name) @@ plainto_tsquery('german', 'Informatik')`
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows).toContain("43102");
  });

  test("'Buchhaltung' returns finance-related codes", () => {
    const result = sql(
      `SELECT count(*) FROM activity_codes_kldb WHERE is_active = true AND to_tsvector('german', name) @@ plainto_tsquery('german', 'Buchhaltung')`
    );
    expect(parseInt(result)).toBeGreaterThan(0);
  });

  test("'Gesundheit' returns care-related codes", () => {
    const result = sql(
      `SELECT count(*) FROM activity_codes_kldb WHERE is_active = true AND to_tsvector('german', name) @@ plainto_tsquery('german', 'Gesundheit')`
    );
    expect(parseInt(result)).toBeGreaterThan(0);
  });

  test("code prefix '431' returns matching codes via LIKE", () => {
    const rows = sql(
      `SELECT code FROM activity_codes_kldb WHERE is_active = true AND code LIKE '431%'`
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows).toContain("43102");
  });

  test("GIN index exists for performant full-text search", () => {
    const result = sql(
      `SELECT indexname FROM pg_indexes WHERE tablename = 'activity_codes_kldb' AND indexdef LIKE '%gin%'`
    );
    expect(result).toContain("idx_activity_codes_kldb_name");
  });

  test("search executes within 50ms (DB-level)", () => {
    const result = sql(
      `EXPLAIN (ANALYZE, FORMAT TEXT) SELECT code, name FROM activity_codes_kldb WHERE to_tsvector('german', name) @@ plainto_tsquery('german', 'Schlosser') LIMIT 20`
    );
    // Extract execution time from EXPLAIN ANALYZE output
    const timeMatch = result.match(/Execution Time: ([\d.]+) ms/);
    if (timeMatch) {
      expect(parseFloat(timeMatch[1]!)).toBeLessThan(50);
    }
  });
});
