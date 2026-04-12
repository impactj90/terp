# Plan: Cross-Tenant Isolation E2E Browser Tests

Date: 2026-03-21

**Target file:** `src/e2e-browser/security-tenant-isolation.spec.ts`

---

## Overview

Browser E2E tests that verify cross-tenant data isolation. A Tenant A admin user attempts to read and mutate resources belonging to Tenant B, using direct tRPC HTTP calls via Playwright's `page.request` API. Every attempt must fail with NOT_FOUND (never return or modify Tenant B data).

---

## Phase 1: Test Infrastructure Setup

### 1.1 Tenant B Seed Data via Global Setup

Add Tenant B cleanup and creation SQL to `src/e2e-browser/global-setup.ts`. Use a fixed, deterministic UUID prefix (`e2e1soxx-...`) for Tenant B so cleanup is trivial.

**IDs to define:**

```
TENANT_B_ID   = "e2e1soxx-0000-4000-a000-000000000001"
EMPLOYEE_B_ID = "e2e1soxx-0000-4000-a000-000000000011"
BOOKING_B_ID  = "e2e1soxx-0000-4000-a000-000000000021"
ABSENCE_B_ID  = "e2e1soxx-0000-4000-a000-000000000031"
BILLING_DOC_B_ID = "e2e1soxx-0000-4000-a000-000000000041"
```

**Cleanup SQL** (add to top of existing `CLEANUP_SQL` in global-setup.ts):

```sql
-- Cross-tenant isolation test cleanup
DELETE FROM billing_document_positions WHERE document_id IN (
  SELECT id FROM billing_documents WHERE tenant_id = 'e2e1soxx-0000-4000-a000-000000000001'
);
DELETE FROM billing_documents WHERE tenant_id = 'e2e1soxx-0000-4000-a000-000000000001';
DELETE FROM absence_days WHERE tenant_id = 'e2e1soxx-0000-4000-a000-000000000001';
DELETE FROM bookings WHERE tenant_id = 'e2e1soxx-0000-4000-a000-000000000001';
DELETE FROM employees WHERE tenant_id = 'e2e1soxx-0000-4000-a000-000000000001';
DELETE FROM tenant_modules WHERE tenant_id = 'e2e1soxx-0000-4000-a000-000000000001';
DELETE FROM tenants WHERE id = 'e2e1soxx-0000-4000-a000-000000000001';
```

**Seed SQL** (add to end of cleanup SQL, after cleanup, so it runs every time as idempotent re-seed):

```sql
-- Cross-tenant isolation: Create Tenant B with minimal data
INSERT INTO tenants (id, name, slug, created_at, updated_at)
VALUES ('e2e1soxx-0000-4000-a000-000000000001', 'E2E Isolation Tenant B', 'e2e-iso-b', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- Enable billing module for Tenant B (needed for billing doc test)
INSERT INTO tenant_modules (tenant_id, module, enabled_at)
VALUES ('e2e1soxx-0000-4000-a000-000000000001', 'billing', NOW())
ON CONFLICT DO NOTHING;

-- Tenant B employee
INSERT INTO employees (id, tenant_id, personnel_number, first_name, last_name, entry_date, is_active, weekly_hours, vacation_days_per_year, created_at, updated_at)
VALUES ('e2e1soxx-0000-4000-a000-000000000011', 'e2e1soxx-0000-4000-a000-000000000001', 'ISO-B-001', 'Isolation', 'Employee', '2026-01-01', true, 40, 30, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- Tenant B booking (needs a booking type — use Tenant A's seeded "Kommen" type which is global,
-- OR create a Tenant B booking type; simpler: just insert with a dummy booking_type_id that
-- exists in Tenant B. We need to create one.)
INSERT INTO booking_types (id, tenant_id, code, name, direction, is_active, created_at, updated_at)
VALUES ('e2e1soxx-0000-4000-a000-000000000051', 'e2e1soxx-0000-4000-a000-000000000001', 'ISO-K', 'Kommen', 'in', true, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO bookings (id, tenant_id, employee_id, booking_type_id, booking_date, original_time, edited_time, source, created_at, updated_at)
VALUES ('e2e1soxx-0000-4000-a000-000000000021', 'e2e1soxx-0000-4000-a000-000000000001', 'e2e1soxx-0000-4000-a000-000000000011', 'e2e1soxx-0000-4000-a000-000000000051', '2026-01-15', 480, 480, 'web', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- Tenant B absence type
INSERT INTO absence_types (id, tenant_id, code, name, category, color, deducts_vacation, is_active, created_at, updated_at)
VALUES ('e2e1soxx-0000-4000-a000-000000000052', 'e2e1soxx-0000-4000-a000-000000000001', 'U-ISO', 'Urlaub ISO', 'vacation', '#4CAF50', true, true, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- Tenant B absence day
INSERT INTO absence_days (id, tenant_id, employee_id, absence_type_id, absence_date, duration, status, created_at, updated_at)
VALUES ('e2e1soxx-0000-4000-a000-000000000031', 'e2e1soxx-0000-4000-a000-000000000001', 'e2e1soxx-0000-4000-a000-000000000011', 'e2e1soxx-0000-4000-a000-000000000052', '2026-03-15', 1, 'pending', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- Tenant B CRM address (needed for billing document FK)
INSERT INTO crm_addresses (id, tenant_id, company, type, created_at, updated_at)
VALUES ('e2e1soxx-0000-4000-a000-000000000061', 'e2e1soxx-0000-4000-a000-000000000001', 'ISO GmbH', 'customer', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- Tenant B billing document
INSERT INTO billing_documents (id, tenant_id, number, type, status, address_id, document_date, created_at, updated_at)
VALUES ('e2e1soxx-0000-4000-a000-000000000041', 'e2e1soxx-0000-4000-a000-000000000001', 'ISO-RE-001', 'INVOICE', 'DRAFT', 'e2e1soxx-0000-4000-a000-000000000061', '2026-03-01', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;
```

### 1.2 Authentication Approach

The Tenant A admin user is already authenticated via `storageState: ".auth/admin.json"` (from `auth.setup.ts`). The admin user belongs to tenant `10000000-0000-0000-0000-000000000001` and does NOT have a `user_tenants` entry for Tenant B.

**No additional user creation needed.** The existing admin user will:
1. Authenticate with their normal session token
2. Send `x-tenant-id: 10000000-0000-0000-0000-000000000001` (their own tenant)
3. Reference resource IDs that belong to Tenant B

The tenant-scoped queries (`WHERE { id, tenantId }`) will fail to find the record, returning NOT_FOUND. This tests the **query-layer isolation** (Layer 2), which is the most critical layer.

### 1.3 How to Make tRPC Calls from Playwright

Use `page.request.post()` to call tRPC endpoints directly. Steps:

1. Extract the Supabase access token from the browser storage state:
   ```ts
   const supabaseToken = await page.evaluate(() => {
     // Supabase stores the session in localStorage
     const keys = Object.keys(localStorage);
     const sbKey = keys.find(k => k.startsWith("sb-") && k.endsWith("-auth-token"));
     if (!sbKey) return null;
     const data = JSON.parse(localStorage.getItem(sbKey) || "{}");
     return data?.access_token || null;
   });
   ```

2. Make tRPC HTTP requests:
   ```ts
   const response = await page.request.post("/api/trpc/employees.getById", {
     headers: {
       "content-type": "application/json",
       "authorization": `Bearer ${supabaseToken}`,
       "x-tenant-id": TENANT_A_ID,
     },
     data: { "0": { "json": { "id": EMPLOYEE_B_ID } } },
   });
   ```

3. Parse and assert the response:
   ```ts
   const body = await response.json();
   // tRPC batch response: [{ error: { json: { data: { code: "NOT_FOUND" } } } }]
   expect(body[0].error).toBeDefined();
   expect(body[0].error.json.data.code).toBe("NOT_FOUND");
   ```

### 1.4 Cleanup Strategy

The global-setup.ts cleanup SQL runs before every test suite execution. Since we use deterministic UUIDs for Tenant B, the cleanup is straightforward:
- Delete all Tenant B records by `tenant_id = 'e2e1soxx-...'`
- Re-insert them as seed data in the same SQL block

No additional afterAll cleanup is needed; the next run's global setup handles it.

---

## Phase 2: Test File Structure

### File: `src/e2e-browser/security-tenant-isolation.spec.ts`

```ts
import { test, expect, type Page } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";

// --- Constants ---
const TENANT_A_ID = "10000000-0000-0000-0000-000000000001";

// Tenant B resource IDs (seeded by global-setup.ts)
const TENANT_B = {
  EMPLOYEE_ID: "e2e1soxx-0000-4000-a000-000000000011",
  BOOKING_ID:  "e2e1soxx-0000-4000-a000-000000000021",
  ABSENCE_ID:  "e2e1soxx-0000-4000-a000-000000000031",
  BILLING_DOC_ID: "e2e1soxx-0000-4000-a000-000000000041",
} as const;

// --- Helper Functions ---

async function getSupabaseToken(page: Page): Promise<string> { ... }

async function trpcQuery(page: Page, procedure: string, input: unknown, token: string): Promise<unknown> { ... }

async function trpcMutate(page: Page, procedure: string, input: unknown, token: string): Promise<unknown> { ... }

function expectNotFound(body: unknown): void { ... }

// --- Test Groups ---

test.describe("Cross-Tenant Isolation", () => {
  let token: string;

  test.beforeAll(async ({ browser }) => {
    // Get auth token once for all tests
    ...
  });

  test.describe("Employee isolation", () => {
    test("cannot read Tenant B employee via getById");
    test("cannot update Tenant B employee");
  });

  test.describe("Booking isolation", () => {
    test("cannot read Tenant B booking via getById");
    test("cannot update Tenant B booking");
  });

  test.describe("Absence isolation", () => {
    test("cannot read Tenant B absence via getById");
    test("cannot update Tenant B absence");
  });

  test.describe("Billing document isolation", () => {
    test("cannot read Tenant B billing document via getById");
    test("cannot update Tenant B billing document");
  });
});
```

### Helper Functions Specification

#### `getSupabaseToken(page: Page): Promise<string>`
Extracts the Supabase access token from the page's localStorage. The auth.setup.ts saves the admin session to `.auth/admin.json`, and the browser context has the Supabase session in localStorage.

#### `trpcQuery(page, procedure, input, token): Promise<TRPCBatchResponse>`
Makes a `POST /api/trpc/{procedure}` request with the standard tRPC batch format:
- Body: `{ "0": { "json": input } }`
- Headers: `authorization: Bearer {token}`, `x-tenant-id: {TENANT_A_ID}`, `content-type: application/json`
- Returns the parsed JSON response array.

#### `trpcMutate(page, procedure, input, token): Promise<TRPCBatchResponse>`
Same as `trpcQuery` — tRPC mutations also use POST with the same batch format.

#### `expectNotFound(body: unknown): void`
Asserts the tRPC batch response contains an error with `code: "NOT_FOUND"`:
```ts
function expectNotFound(body: unknown) {
  const arr = body as Array<{ error?: { json?: { data?: { code?: string } } }; result?: unknown }>;
  expect(arr).toHaveLength(1);
  expect(arr[0].error).toBeDefined();
  expect(arr[0].result).toBeUndefined();
  expect(arr[0].error!.json!.data!.code).toBe("NOT_FOUND");
}
```

---

## Phase 3: Test Implementation Details

### 3.1 Employee Isolation

#### Test: "cannot read Tenant B employee via getById"

**Procedure:** `employees.getById`
**Input:** `{ id: TENANT_B.EMPLOYEE_ID }`
**Expected:** NOT_FOUND

The repository calls `findFirst({ where: { id, tenantId, deletedAt: null } })`. Since `tenantId` is Tenant A's but the employee belongs to Tenant B, no record is found.

```ts
test("cannot read Tenant B employee via getById", async ({ page }) => {
  const body = await trpcQuery(page, "employees.getById", { id: TENANT_B.EMPLOYEE_ID }, token);
  expectNotFound(body);
});
```

#### Test: "cannot update Tenant B employee"

**Procedure:** `employees.update`
**Input:** `{ id: TENANT_B.EMPLOYEE_ID, lastName: "HACKED" }`
**Expected:** NOT_FOUND

The service calls `tenantScopedUpdate(prisma.employee, { id, tenantId }, data)`. The `updateMany` with `{ id: TENANT_B.EMPLOYEE_ID, tenantId: TENANT_A_ID }` matches 0 rows, throwing `TenantScopedNotFoundError` -> tRPC `NOT_FOUND`.

```ts
test("cannot update Tenant B employee", async ({ page }) => {
  const body = await trpcMutate(page, "employees.update", {
    id: TENANT_B.EMPLOYEE_ID,
    lastName: "HACKED",
  }, token);
  expectNotFound(body);
});
```

**Verification:** After the test, the employee's lastName in Tenant B should still be "Employee" (not "HACKED"). This is implicitly verified because the mutation returns NOT_FOUND (it never executed). For extra safety, a SQL verification query could be added in an afterAll hook, but the NOT_FOUND response is sufficient proof.

### 3.2 Booking Isolation

#### Test: "cannot read Tenant B booking via getById"

**Procedure:** `bookings.getById`
**Input:** `{ id: TENANT_B.BOOKING_ID }`
**Expected:** NOT_FOUND

Repository: `findFirst({ where: { id, tenantId } })` — won't find a Tenant B booking when `tenantId` is Tenant A.

```ts
test("cannot read Tenant B booking via getById", async ({ page }) => {
  const body = await trpcQuery(page, "bookings.getById", { id: TENANT_B.BOOKING_ID }, token);
  expectNotFound(body);
});
```

#### Test: "cannot update Tenant B booking"

**Procedure:** `bookings.update`
**Input:** `{ id: TENANT_B.BOOKING_ID, time: "23:59" }`
**Expected:** NOT_FOUND

Repository: `tenantScopedUpdate(prisma.booking, { id, tenantId }, data)` — `updateMany` matches 0 rows.

```ts
test("cannot update Tenant B booking", async ({ page }) => {
  const body = await trpcMutate(page, "bookings.update", {
    id: TENANT_B.BOOKING_ID,
    time: "23:59",
  }, token);
  expectNotFound(body);
});
```

### 3.3 Absence Isolation

#### Test: "cannot read Tenant B absence via getById"

**Procedure:** `absences.getById`
**Input:** `{ id: TENANT_B.ABSENCE_ID }`
**Expected:** NOT_FOUND

Repository: `findFirst({ where: { id, tenantId } })`.

```ts
test("cannot read Tenant B absence via getById", async ({ page }) => {
  const body = await trpcQuery(page, "absences.getById", { id: TENANT_B.ABSENCE_ID }, token);
  expectNotFound(body);
});
```

#### Test: "cannot update Tenant B absence"

**Procedure:** `absences.update`
**Input:** `{ id: TENANT_B.ABSENCE_ID, notes: "HACKED" }`
**Expected:** NOT_FOUND

Repository: `tenantScopedUpdate(prisma.absenceDay, { id, tenantId }, data)` — `updateMany` matches 0 rows.

```ts
test("cannot update Tenant B absence", async ({ page }) => {
  const body = await trpcMutate(page, "absences.update", {
    id: TENANT_B.ABSENCE_ID,
    notes: "HACKED",
  }, token);
  expectNotFound(body);
});
```

### 3.4 Billing Document Isolation

#### Test: "cannot read Tenant B billing document via getById"

**Procedure:** `billing.documents.getById`
**Input:** `{ id: TENANT_B.BILLING_DOC_ID }`
**Expected:** NOT_FOUND

Repository: `findFirst({ where: { id, tenantId } })`.

```ts
test("cannot read Tenant B billing document via getById", async ({ page }) => {
  const body = await trpcQuery(page, "billing.documents.getById", { id: TENANT_B.BILLING_DOC_ID }, token);
  expectNotFound(body);
});
```

#### Test: "cannot update Tenant B billing document"

**Procedure:** `billing.documents.update`
**Input:** `{ id: TENANT_B.BILLING_DOC_ID, notes: "HACKED" }`
**Expected:** NOT_FOUND

Repository: `updateMany({ where: { id, tenantId } })` followed by count check — 0 rows matched.

```ts
test("cannot update Tenant B billing document via update", async ({ page }) => {
  const body = await trpcMutate(page, "billing.documents.update", {
    id: TENANT_B.BILLING_DOC_ID,
    notes: "HACKED",
  }, token);
  expectNotFound(body);
});
```

---

## Phase 4: Verification

### 4.1 Running the Tests

```bash
# Run only the isolation spec
pnpm vitest run src/e2e-browser/security-tenant-isolation.spec.ts
# OR via Playwright
npx playwright test security-tenant-isolation
```

The tests run within the existing `admin-tests` project (matches `*.spec.ts`). They use the admin storage state automatically.

### 4.2 Verifying Tests Actually Catch Tenant Leaks (Negative Testing)

To confirm the tests are meaningful (i.e., they would FAIL if isolation was broken), temporarily modify one repository to remove tenant scoping:

1. In `employees-repository.ts`, change `findById` to use `findFirst({ where: { id } })` (remove `tenantId` from the where clause).
2. Run the "cannot read Tenant B employee" test — it should **FAIL** because the query now returns the Tenant B employee.
3. Revert the change.

This one-time manual verification confirms the test assertions are correct.

### 4.3 Verification That Data Was Not Modified

For mutation tests, the NOT_FOUND response already proves the mutation did not execute (the `updateMany` matched 0 rows, so no data was changed). However, for defense-in-depth, the test file can include an optional SQL verification in `afterAll`:

```ts
test.afterAll(async () => {
  // Verify Tenant B data was not modified
  // Run psql to check employee lastName is still "Employee"
  const result = execSync(
    `psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -t -A -c "SELECT last_name FROM employees WHERE id = 'e2e1soxx-0000-4000-a000-000000000011'"`,
    { encoding: "utf8" }
  ).trim();
  expect(result).toBe("Employee");
});
```

This is optional but adds confidence.

---

## Implementation Checklist

1. [ ] Add Tenant B cleanup + seed SQL to `src/e2e-browser/global-setup.ts`
2. [ ] Create `src/e2e-browser/security-tenant-isolation.spec.ts` with:
   - [ ] Constants for Tenant A ID and Tenant B resource IDs
   - [ ] `getSupabaseToken()` helper
   - [ ] `trpcQuery()` / `trpcMutate()` helpers
   - [ ] `expectNotFound()` assertion helper
   - [ ] 8 tests across 4 resource types (read + write for each)
   - [ ] Optional `afterAll` SQL verification
3. [ ] Run the test suite and verify all 8 tests pass
4. [ ] Manual negative test: temporarily break isolation, verify test fails

---

## Risk Notes

- **Billing module guard**: The `billing.documents.*` procedures use `billingProcedure = tenantProcedure.use(requireModule("billing"))`. The billing module is enabled for Tenant A (the dev tenant). Since we send `x-tenant-id` for Tenant A, the module check passes. The isolation test then verifies that the query-layer scoping prevents access to Tenant B's billing document. This is correct — we are testing the data layer, not the module guard.

- **Data scope middleware**: Some procedures use `applyDataScope()` which may add department-level filtering. The admin user has `dataScope.type = "all"`, so this does not interfere.

- **Token extraction timing**: The Supabase token is stored in the browser localStorage after login. The `beforeAll` hook must navigate to the app (or load the page) before extracting the token. Since the test uses `storageState: ".auth/admin.json"`, the token is already present.

- **tRPC batch response format**: The tRPC httpBatchLink serializes responses as arrays. A single call produces `[{result:...}]` or `[{error:...}]`. The `expectNotFound` helper must index into `[0]`.
