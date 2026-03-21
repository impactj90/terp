/**
 * security-tenant-isolation.spec.ts
 *
 * Cross-tenant data isolation E2E tests.
 *
 * A Tenant A admin user (the normal dev admin) attempts to read and mutate
 * resources that belong to Tenant B via direct tRPC HTTP calls. Every attempt
 * must fail with NOT_FOUND — the query-layer tenant scoping must prevent any
 * cross-tenant data access.
 *
 * Tenant B is seeded by global-setup.ts with deterministic UUIDs.
 */
import { test, expect, type Page } from "@playwright/test";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { ADMIN_STORAGE } from "./helpers/auth";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Tenant A — the dev tenant the admin user belongs to */
const TENANT_A_ID = "10000000-0000-0000-0000-000000000001";

/** Tenant B resource IDs (seeded by global-setup.ts) — valid hex UUIDs */
const TENANT_B = {
  TENANT_ID: "e2e150ff-0000-4000-a000-000000000001",
  EMPLOYEE_ID: "e2e150ff-0000-4000-a000-000000000011",
  BOOKING_ID: "e2e150ff-0000-4000-a000-000000000021",
  ABSENCE_ID: "e2e150ff-0000-4000-a000-000000000031",
  BILLING_DOC_ID: "e2e150ff-0000-4000-a000-000000000041",
} as const;

const DB_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

// ---------------------------------------------------------------------------
// Helper: Extract Supabase access token from stored auth cookie
// ---------------------------------------------------------------------------

function getSupabaseToken(): string {
  const state = JSON.parse(readFileSync(ADMIN_STORAGE, "utf8"));
  const cookie = state.cookies?.find(
    (c: { name: string; value: string }) =>
      c.name.startsWith("sb-") && c.name.endsWith("-auth-token"),
  );
  if (!cookie) {
    throw new Error("No Supabase auth cookie found in admin storage state");
  }
  const raw = cookie.value.replace(/^base64-/, "");
  const decoded = JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
  const token = decoded?.access_token;
  if (!token) {
    throw new Error("No access_token in Supabase auth cookie");
  }
  return token;
}

// ---------------------------------------------------------------------------
// Helper: tRPC request helpers (raw HTTP, no superjson transformer)
// ---------------------------------------------------------------------------

const authHeaders = (token: string) => ({
  authorization: `Bearer ${token}`,
  "x-tenant-id": TENANT_A_ID,
});

/** tRPC batch query (GET) */
async function trpcQuery(
  page: Page,
  procedure: string,
  input: unknown,
  token: string,
): Promise<unknown> {
  const encoded = encodeURIComponent(JSON.stringify({ "0": input }));
  const response = await page.request.get(
    `/api/trpc/${procedure}?batch=1&input=${encoded}`,
    { headers: authHeaders(token) },
  );
  return response.json();
}

/** tRPC batch mutation (POST) */
async function trpcMutation(
  page: Page,
  procedure: string,
  input: unknown,
  token: string,
): Promise<unknown> {
  const response = await page.request.post(
    `/api/trpc/${procedure}?batch=1`,
    {
      headers: { "content-type": "application/json", ...authHeaders(token) },
      data: { "0": input },
    },
  );
  return response.json();
}

// ---------------------------------------------------------------------------
// Helper: Assert tRPC error responses
// ---------------------------------------------------------------------------

type BatchResult = Array<{
  error?: { data?: { code?: string } };
  result?: unknown;
}>;

function expectNotFound(body: unknown): void {
  const arr = body as BatchResult;
  expect(arr).toHaveLength(1);
  expect(arr[0].error).toBeDefined();
  expect(arr[0].result).toBeUndefined();
  expect(arr[0].error!.data!.code).toBe("NOT_FOUND");
}

/**
 * Accept NOT_FOUND or FORBIDDEN — either is valid proof that cross-tenant
 * access was denied.
 */
function expectDenied(body: unknown): void {
  const arr = body as BatchResult;
  expect(arr).toHaveLength(1);
  expect(arr[0].error).toBeDefined();
  expect(arr[0].result).toBeUndefined();
  const code = arr[0].error!.data!.code;
  expect(["NOT_FOUND", "FORBIDDEN"]).toContain(code);
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

test.describe("Cross-Tenant Isolation", () => {
  let token: string;

  test.beforeAll(async () => {
    token = getSupabaseToken();
  });

  // --- Employee isolation ---

  test.describe("Employee isolation", () => {
    test("cannot read Tenant B employee via getById", async ({ page }) => {
      const body = await trpcQuery(
        page,
        "employees.getById",
        { id: TENANT_B.EMPLOYEE_ID },
        token,
      );
      expectNotFound(body);
    });

    test("cannot update Tenant B employee", async ({ page }) => {
      const body = await trpcMutation(
        page,
        "employees.update",
        { id: TENANT_B.EMPLOYEE_ID, lastName: "HACKED" },
        token,
      );
      expectNotFound(body);
    });
  });

  // --- Booking isolation ---

  test.describe("Booking isolation", () => {
    test("cannot read Tenant B booking via getById", async ({ page }) => {
      const body = await trpcQuery(
        page,
        "bookings.getById",
        { id: TENANT_B.BOOKING_ID },
        token,
      );
      expectNotFound(body);
    });

    test("cannot update Tenant B booking", async ({ page }) => {
      const body = await trpcMutation(
        page,
        "bookings.update",
        { id: TENANT_B.BOOKING_ID, time: "23:59" },
        token,
      );
      expectNotFound(body);
    });
  });

  // --- Absence isolation ---

  test.describe("Absence isolation", () => {
    test("cannot read Tenant B absence via getById", async ({ page }) => {
      const body = await trpcQuery(
        page,
        "absences.getById",
        { id: TENANT_B.ABSENCE_ID },
        token,
      );
      expectNotFound(body);
    });

    test("cannot update Tenant B absence", async ({ page }) => {
      const body = await trpcMutation(
        page,
        "absences.update",
        { id: TENANT_B.ABSENCE_ID, notes: "HACKED" },
        token,
      );
      expectDenied(body);
    });
  });

  // --- Billing document isolation ---

  test.describe("Billing document isolation", () => {
    test("cannot read Tenant B billing document via getById", async ({
      page,
    }) => {
      const body = await trpcQuery(
        page,
        "billing.documents.getById",
        { id: TENANT_B.BILLING_DOC_ID },
        token,
      );
      expectNotFound(body);
    });

    test("cannot update Tenant B billing document", async ({ page }) => {
      const body = await trpcMutation(
        page,
        "billing.documents.update",
        { id: TENANT_B.BILLING_DOC_ID, notes: "HACKED" },
        token,
      );
      expectNotFound(body);
    });
  });

  // --- Post-test verification: Tenant B data unchanged ---

  test.describe("Verification: Tenant B data was not modified", () => {
    test("Tenant B employee lastName unchanged", () => {
      const result = execSync(
        `psql "${DB_URL}" -t -A -c "SELECT last_name FROM employees WHERE id = '${TENANT_B.EMPLOYEE_ID}'"`,
        { encoding: "utf8" },
      ).trim();
      expect(result).toBe("Employee");
    });

    test("Tenant B booking editedTime unchanged", () => {
      const result = execSync(
        `psql "${DB_URL}" -t -A -c "SELECT edited_time FROM bookings WHERE id = '${TENANT_B.BOOKING_ID}'"`,
        { encoding: "utf8" },
      ).trim();
      expect(result).toBe("480");
    });

    test("Tenant B absence notes unchanged", () => {
      const result = execSync(
        `psql "${DB_URL}" -t -A -c "SELECT COALESCE(notes, '') FROM absence_days WHERE id = '${TENANT_B.ABSENCE_ID}'"`,
        { encoding: "utf8" },
      ).trim();
      expect(result).not.toBe("HACKED");
    });

    test("Tenant B billing document notes unchanged", () => {
      const result = execSync(
        `psql "${DB_URL}" -t -A -c "SELECT COALESCE(notes, '') FROM billing_documents WHERE id = '${TENANT_B.BILLING_DOC_ID}'"`,
        { encoding: "utf8" },
      ).trim();
      expect(result).not.toBe("HACKED");
    });
  });
});
