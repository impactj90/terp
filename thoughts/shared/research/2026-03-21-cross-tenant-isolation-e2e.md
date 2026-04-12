# Research: Cross-Tenant Isolation E2E Browser Tests

Date: 2026-03-21

---

## 1. Existing E2E Test Patterns

### Test Files
31 spec files exist in `src/e2e-browser/`:
- `01-grundeinrichtung.spec.ts` through `99-logout.spec.ts`
- Billing-specific: `30-billing-documents.spec.ts` through `35-billing-document-editor.spec.ts`
- CRM-specific: `20-crm-addresses.spec.ts` through `24-crm-reports.spec.ts`
- Data hydration: `13-data-hydration.spec.ts`

### Test Structure
All tests follow this pattern:
```ts
import { test, expect } from "@playwright/test";
import { navigateTo, waitForTableLoad, expectPageTitle } from "./helpers/nav";
import { fillInput, selectOption, submitAndWaitForClose, ... } from "./helpers/forms";

test.describe.serial("UC-XXX: Feature Name", () => {
  test("test name", async ({ page }) => {
    await navigateTo(page, "/admin/some-path");
    // ... UI interactions ...
  });
});
```

### Key Patterns Observed
- Tests are **UI-driven** via Playwright page interactions — no direct tRPC/API calls from tests.
- Serial test groups (`test.describe.serial`) are used when tests depend on each other.
- For shared browser contexts (e.g., SPA cache hydration tests), `test.beforeAll` creates a `BrowserContext` and `Page`, then `loginAsAdmin(page)` is called.
- E2E data is prefixed with `E2E` (e.g., personnel number `E2E-001`, company name `E2E Belegkette GmbH`) for cleanup identification.
- Tests rely on seeded data in `supabase/seed.sql` for pre-existing resources (employees, bookings, absences, billing documents).

### Authentication in Tests
- All admin-tests use the `storageState: ".auth/admin.json"` from the `setup` project (see playwright.config.ts).
- This means every spec file starts with an already-authenticated admin session.
- For tests needing fresh login, `loginAsAdmin(page)` from `helpers/auth.ts` is used explicitly.

---

## 2. Auth Setup

### File: `src/e2e-browser/auth.setup.ts`
Two setup tests:
1. **"authenticate as admin"**: Clicks "Login as Admin" button, saves storage state to `.auth/admin.json`.
2. **"authenticate as user"**: Clicks "Login as User" button, saves storage state to `.auth/user.json`.

### File: `src/e2e-browser/helpers/auth.ts`
Constants and helpers:
```ts
export const ADMIN_STORAGE = ".auth/admin.json";
export const USER_STORAGE = ".auth/user.json";

export const SEED = {
  TENANT_ID: "10000000-0000-0000-0000-000000000001",
  ADMIN_EMAIL: "admin@dev.local",
  ADMIN_PASSWORD: "dev-password-admin",
  USER_EMAIL: "user@dev.local",
  USER_PASSWORD: "dev-password-user",
} as const;
```

Functions:
- `loginAsAdmin(page)`: Navigates to `/login`, clicks quick-login button, waits for dashboard.
- `loginAsUser(page)`: Same pattern for user role.
- `login(page, email, password)`: Manual email/password login.

### Login Mechanism
The login page (`src/app/[locale]/(auth)/login/page.tsx`) has dev quick-login buttons that call `supabase.auth.signInWithPassword()` with hardcoded dev credentials.

### Tenant ID Selection
After login, the tenant ID is stored in `localStorage` under key `tenant_id` (via `src/lib/storage.ts` -> `tenantIdStorage`). The `TenantProvider` (`src/providers/tenant-provider.tsx`) auto-selects the single available tenant.

The tRPC client (`src/trpc/client.tsx`) reads `tenantIdStorage.getTenantId()` and passes it as `x-tenant-id` header on every request.

---

## 3. Tenant Isolation Mechanisms

### tRPC Context (src/trpc/init.ts)
The `createTRPCContext` function:
- Reads `x-tenant-id` from request headers and stores it as `tenantId` in context.
- Validates auth token with Supabase and loads user with `userTenants` relation.

### Procedure Chain
```
publicProcedure -> protectedProcedure -> tenantProcedure
```

**tenantProcedure** (`src/trpc/init.ts` line 210):
1. Requires `ctx.tenantId` to be non-null (else FORBIDDEN "Tenant ID required").
2. Validates `ctx.user.userTenants.some(ut => ut.tenantId === ctx.tenantId)` (else FORBIDDEN "Access to tenant denied").

### Auth Middleware (src/lib/auth/middleware.ts)
- `requirePermission(permId1, permId2)`: Checks user has ANY of the specified permissions (OR logic).
- `requireEmployeePermission(getter, ownPerm, allPerm)`: Own vs. all employee access pattern.
- `requireSelfOrPermission(getter, permId)`: Self-access or permission check.
- `applyDataScope()`: Adds DataScope to context for Prisma query filtering.

### Multi-Layer Protection
1. **Transport layer**: `tenantProcedure` validates user has access to the tenant via `userTenants` join table.
2. **Query layer**: Every repository function receives `tenantId` as a parameter and includes it in WHERE clauses.
3. **Update layer**: `tenantScopedUpdate()` uses `updateMany({ where: { id, tenantId } })` pattern to prevent cross-tenant writes.

---

## 4. Repository Patterns for Target Resources

### employees-repository.ts
- `findById(prisma, tenantId, id)`: Uses `findFirst({ where: { id, tenantId, deletedAt: null } })`.
- `findMany(prisma, tenantId, params)`: Includes `{ tenantId, ...params.where }`.
- `update(prisma, tenantId, id, data)`: Uses `tenantScopedUpdate(prisma.employee, { id, tenantId }, data, { entity: "Employee" })`.
- All queries scope by tenantId.

### bookings-repository.ts
- `findById(prisma, tenantId, id)`: Uses `findFirst({ where: { id, tenantId } })`.
- `findMany(prisma, tenantId, params)`: WHERE starts with `{ tenantId }`.
- `update(prisma, tenantId, id, data)`: Uses `tenantScopedUpdate(prisma.booking, { id, tenantId }, data, { include: ..., entity: "Booking" })`.
- `deleteWithDerived(prisma, tenantId, id)`: Uses `deleteMany({ where: { id, tenantId } })` in a transaction, checks count.

### absences-repository.ts
- `findById(prisma, tenantId, id)`: Uses `findFirst({ where: { id, tenantId } })`.
- `update(prisma, tenantId, id, data)`: Uses `tenantScopedUpdate(prisma.absenceDay, { id, tenantId }, data, { include: ..., entity: "AbsenceDay" })`.
- `updateIfStatus(prisma, tenantId, id, expectedStatus, data)`: Uses `updateMany({ where: { id, tenantId, status: expectedStatus } })`.
- `deleteById(prisma, tenantId, id)`: Uses `deleteMany({ where: { id, tenantId } })`, checks count.

### billing-document-repository.ts
- `findById(prisma, tenantId, id)`: Uses `findFirst({ where: { id, tenantId } })`.
- `update(prisma, tenantId, id, data)`: Uses `updateMany({ where: { id, tenantId } })` then `findFirst({ where: { id, tenantId } })`.
- `remove(prisma, tenantId, id)`: Uses `deleteMany({ where: { id, tenantId } })`.
- Position updates: `updatePosition` uses `updateMany({ where: { id, document: { tenantId } } })` (relation-scoped).

### prisma-helpers.ts (new file)
Two helpers for tenant-scoped updates:
1. `tenantScopedUpdate(delegate, where, data, opts)`: Uses `updateMany({ where: { id, tenantId } })`, checks `count === 0` and throws `TenantScopedNotFoundError`.
2. `relationScopedUpdate(delegate, where, data, opts)`: Same pattern but for models without direct tenantId (scopes via relation).

`TenantScopedNotFoundError` has name ending in "NotFoundError", which `handleServiceError` in `src/trpc/errors.ts` maps to tRPC `NOT_FOUND`.

---

## 5. tRPC Routers for Target Resources

### employees router (src/trpc/routers/employees.ts)
- All procedures use `tenantProcedure` as base.
- `update`: Input `{ id, ...fields }`. Uses `tenantProcedure.use(requirePermission(EMPLOYEES_EDIT)).use(applyDataScope())`. Calls `employeesService.update()`.
- `getById`: Input `{ id }`. Returns employee with relations or throws NOT_FOUND.
- Cross-tenant access: Service/repo throws `TenantScopedNotFoundError` -> mapped to tRPC `NOT_FOUND`.

### bookings router (src/trpc/routers/bookings.ts)
- All procedures use `tenantProcedure` as base.
- `update`: Input `{ id, time?, notes? }`. Uses `tenantProcedure.use(requirePermission(EDIT)).use(applyDataScope())`.
- `getById`: Input `{ id }`. Returns booking or throws NOT_FOUND.
- `create`: Input `{ employeeId, bookingTypeId, bookingDate, time }`.

### absences router (src/trpc/routers/absences.ts)
- All procedures use `tenantProcedure` as base.
- `update`: Input `{ id, duration?, halfDayPeriod?, notes? }`. Uses `requirePermission(ABSENCE_MANAGE)`.
- `getById`: Input `{ id }`.
- `approve`: Input `{ id }`. Uses `requirePermission(ABSENCE_APPROVE)`.

### billing documents router (src/trpc/routers/billing/documents.ts)
- All procedures use `billingProcedure = tenantProcedure.use(requireModule("billing"))`.
- `update`: Input `{ id: uuid, ...fields }`. Uses `requirePermission(BILLING_EDIT)`.
- `getById`: Input `{ id: uuid }`. Uses `requirePermission(BILLING_VIEW)`.
- The `requireModule("billing")` middleware checks `tenant_modules` table for the billing module.

### Error Behavior for Cross-Tenant Access
When a Tenant A user attempts to access a Tenant B resource:
1. If the user sends `x-tenant-id` header for Tenant B but doesn't have `userTenants` entry: **FORBIDDEN "Access to tenant denied"** at `tenantProcedure` level.
2. If the user sends `x-tenant-id` for Tenant A (their own tenant) but references a resource ID that belongs to Tenant B: **NOT_FOUND** because the `WHERE { id, tenantId }` clause won't find the record.

---

## 6. Global Setup / Cleanup

### File: `src/e2e-browser/global-setup.ts`
- Runs SQL cleanup via `psql` directly against `postgresql://postgres:postgres@127.0.0.1:54322/postgres`.
- Deletes E2E-prefixed records: employees with `personnel_number LIKE 'E2E%'`, orders with `code LIKE 'E2E%'`, etc.
- Handles FK cascades properly (child records first).
- Resets number sequences to safe values.
- Also cleans up `user_tenants` and `users` for `e2e-test@dev.local`.

---

## 7. Playwright Config

### File: `playwright.config.ts`
```ts
{
  globalSetup: "./src/e2e-browser/global-setup.ts",
  testDir: "src/e2e-browser",
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: "http://localhost:3001",
    locale: "de-DE",
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "admin-tests",
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 1080 },
        storageState: ".auth/admin.json",
      },
      testMatch: /.*\.spec\.ts/,
    },
  ],
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3001",
    reuseExistingServer: !process.env.CI,
  },
}
```

Key points:
- Single worker, sequential execution.
- All spec files run under the `admin-tests` project (use admin auth by default).
- Base URL: `http://localhost:3001`.

---

## 8. Prisma Schema (Relevant Models)

### Employee
```prisma
model Employee {
  id          String  @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId    String  @map("tenant_id") @db.Uuid
  personnelNumber String @map("personnel_number") @db.VarChar(50)
  ...
}
```

### Booking
```prisma
model Booking {
  id        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId  String   @map("tenant_id") @db.Uuid
  employeeId String  @map("employee_id") @db.Uuid
  ...
}
```

### AbsenceDay
```prisma
model AbsenceDay {
  id       String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId String @map("tenant_id") @db.Uuid
  employeeId String @map("employee_id") @db.Uuid
  ...
}
```

### BillingDocument
```prisma
model BillingDocument {
  id       String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId String @map("tenant_id") @db.Uuid
  number   String @db.VarChar(50)
  type     BillingDocumentType
  status   BillingDocumentStatus @default(DRAFT)
  ...
}
```

### UserTenant
```prisma
model UserTenant {
  userId   String @map("user_id") @db.Uuid
  tenantId String @map("tenant_id") @db.Uuid
  role     String @default("member") @db.VarChar(50)
  @@id([userId, tenantId])
}
```

All target models have a direct `tenantId` field.

---

## 9. Existing Test Data / Seeds

### Seed File: `supabase/seed.sql`
Single tenant only: `10000000-0000-0000-0000-000000000001` ("Dev Company").

**Users:**
- Admin: `00000000-0000-0000-0000-000000000001` (admin@dev.local)
- User: `00000000-0000-0000-0000-000000000002` (user@dev.local)

**User Groups:**
- Administrators (isAdmin=true): `20000000-0000-0000-0000-000000000001`
- Users: `20000000-0000-0000-0000-000000000002`

**Employees (all in tenant `10000000-...-001`):**
- Admin: `00000000-0000-0000-0000-000000000011`
- User: `00000000-0000-0000-0000-000000000012`
- Maria Schmidt: `00000000-0000-0000-0000-000000000013`
- Thomas Weber: `00000000-0000-0000-0000-000000000014`
- Anna Bauer: `00000000-0000-0000-0000-000000000015`
- + more (Sabine, Markus, Julia, Stefan, Petra)

**Bookings:** Extensive seeded bookings for Jan 2026 (IDs like `00000000-0000-0000-0000-000000001002`).

**Absence Days (known IDs):**
- `00000000-0000-0000-0000-000000015001` through `00000000-0000-0000-0000-000000015010`
- Plus dynamic `gen_random_uuid()` absences for Feb/Mar 2026.

**Billing Documents (known IDs):**
- `b1000000-0000-4000-a000-000000000001` (AG-1, OFFER)
- `b1000000-0000-4000-a000-000000000004` (RE-1, INVOICE, PRINTED)
- `b1000000-0000-4000-a000-000000000071` (AG-5, OFFER, DRAFT)
- Many more through `b1000000-0000-4000-a000-000000000099`.

**Tenant Modules:** Core, CRM, and Billing are enabled for the dev tenant.

**No second tenant exists in seed data.** Cross-tenant tests will need to create a Tenant B and its data.

---

## 10. The prisma-helpers.ts File

### File: `src/lib/services/prisma-helpers.ts`
Newly added (unstaged per git status). Contains two functions:

1. **`tenantScopedUpdate(delegate, where, data, opts)`**: Core pattern for tenant-safe updates.
   - Uses `delegate.updateMany({ where: { id, tenantId, ...extra } })`.
   - Checks `count === 0` -> throws `TenantScopedNotFoundError`.
   - Refetches via `delegate.findFirst({ where })` with optional `include`/`select`.

2. **`relationScopedUpdate(delegate, where, data, opts)`**: For models without direct `tenantId` (e.g., `BillingDocumentPosition` scoped via `document.tenantId`).

3. **`TenantScopedNotFoundError`**: Custom error class with name ending in "NotFoundError", which `handleServiceError` in `src/trpc/errors.ts` maps to tRPC `NOT_FOUND` code.

**Currently used by:** `employees-repository.ts`, `bookings-repository.ts`, `absences-repository.ts` (all in their `update()` functions).

**Billing document repository** uses the same pattern inline (`updateMany + findFirst`) but does NOT use the shared helper yet.

---

## Key Findings for Test Implementation

### How Browser E2E Tests Can Test Cross-Tenant Isolation

Since all existing E2E tests are UI-driven, cross-tenant isolation tests have two approaches:

**Approach A: Direct API calls via `page.request` (Playwright APIRequestContext)**
- Playwright's `page.request.post()` and `page.request.get()` can make direct HTTP requests.
- tRPC endpoint: `POST /api/trpc/<procedure>` with JSON body.
- Headers needed: `Authorization: Bearer <token>`, `x-tenant-id: <tenantId>`, `Content-Type: application/json`.
- The Supabase access token can be extracted from stored auth state or via `page.evaluate(() => localStorage.getItem('..'))`.

**Approach B: Via `page.evaluate` calling tRPC from browser context**
- Execute JavaScript in the browser that calls tRPC mutations directly.

Approach A is simpler and more direct for security tests.

### Test Data Requirements

Since only one tenant exists in the seed data, tests must:
1. Create a second tenant ("Tenant B") via SQL in globalSetup or test beforeAll.
2. Create a user in Tenant B (auth.users + users + user_tenants).
3. Create resources (employee, booking, absence, billing document) in Tenant B.
4. Attempt to access Tenant B resources while authenticated as a Tenant A admin user.

### Expected Error Behaviors
- **Read (getById)**: Returns tRPC `NOT_FOUND` because `findFirst({ where: { id, tenantId } })` won't match.
- **Update**: Returns tRPC `NOT_FOUND` because `tenantScopedUpdate` -> `updateMany` returns `count === 0` -> `TenantScopedNotFoundError`.
- **List with wrong ID**: Returns empty results (the ID simply won't match any records in Tenant A).

### tRPC Batch Request Format
tRPC uses batch HTTP calls. A single procedure call:
```
POST /api/trpc/employees.getById
Content-Type: application/json
{"0":{"json":{"id":"some-uuid"}}}
```
Response:
```json
[{"result":{"data":{"json":{...}}}}]
```
Or error:
```json
[{"error":{"json":{"message":"Employee not found","code":-32004,"data":{"code":"NOT_FOUND",...}}}}]
```

### Cleanup Requirements
Any data created for Tenant B must be cleaned up. The global-setup.ts pattern uses `psql` with `DELETE FROM` statements matching `LIKE 'E2E%'` patterns. A similar approach can clean up Tenant B data using a known tenant ID prefix.
