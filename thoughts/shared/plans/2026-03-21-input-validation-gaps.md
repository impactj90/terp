# Input Validation Gaps — Implementation Plan

Date: 2026-03-21

Research: `thoughts/shared/research/2026-03-21-input-validation-gaps.md`

---

## Phase 1: Simple Zod Schema Additions

These are all one-line or two-line changes in tRPC router input/output schemas. No logic changes, no new imports.

### Step 1.1 — corrections.ts: Add min/max to update schema

**File:** `src/trpc/routers/corrections.ts`

**Old code (lines 98-102):**

```ts
const updateInputSchema = z.object({
  id: z.string(),
  valueMinutes: z.number().int().optional(),
  reason: z.string().optional(),
})
```

**New code:**

```ts
const updateInputSchema = z.object({
  id: z.string(),
  valueMinutes: z.number().int().min(-10080).max(10080).optional(),
  reason: z.string().max(500).optional(),
})
```

**Rationale:** Matches the constraints already present on `createInputSchema` (line 94: `.min(-10080).max(10080)`, line 95: `.max(500)`).

---

### Step 1.2 — users.ts: Bound search string and limit

**File:** `src/trpc/routers/users.ts`

**Old code (lines 187-194):**

```ts
    .input(
      z
        .object({
          search: z.string().optional(),
          limit: z.number().optional(),
        })
        .optional()
    )
```

**New code:**

```ts
    .input(
      z
        .object({
          search: z.string().max(255).optional(),
          limit: z.number().int().min(1).max(500).optional(),
        })
        .optional()
    )
```

**Rationale:** `search` is passed to Prisma `contains` on multiple fields. `.max(255)` is defense-in-depth. `limit` gets `.int().min(1).max(500)` — the repository already clamps to 100, but the schema should reject obviously invalid values (negative, float, huge).

---

### Step 1.3 — payrollExports.ts: Constrain year and month

**File:** `src/trpc/routers/payrollExports.ts`

**Old code (lines 103-111):**

```ts
    .input(
      z.object({
        year: z.number().optional(),
        month: z.number().optional(),
        status: payrollExportStatusEnum.optional(),
        limit: z.number().int().min(1).max(100).default(20),
        cursor: z.string().optional(),
      }).optional()
    )
```

**New code:**

```ts
    .input(
      z.object({
        year: z.number().int().min(1).max(9999).optional(),
        month: z.number().int().min(1).max(12).optional(),
        status: payrollExportStatusEnum.optional(),
        limit: z.number().int().min(1).max(100).default(20),
        cursor: z.string().optional(),
      }).optional()
    )
```

**Rationale:** The `generate` procedure (line 167-170) already uses `.int().min(1)` and `.int().min(1).max(12)`. The `list` procedure should match.

---

### Step 1.4 — travelAllowancePreview.ts: Bound distanceKm

**File:** `src/trpc/routers/travelAllowancePreview.ts`

**Old code (line 49):**

```ts
  distanceKm: z.number().optional().default(0),
```

**New code:**

```ts
  distanceKm: z.number().min(0).max(100000).optional().default(0),
```

**Rationale:** Negative distances are nonsensical. 100,000 km is a generous upper bound (~2.5x Earth's circumference).

---

### Step 1.5 — bookings.ts: Replace z.any() with z.unknown()

**File:** `src/trpc/routers/bookings.ts`

**Old code (lines 442-443):**

```ts
            changes: z.any().nullable(),
            metadata: z.any().nullable(),
```

**New code:**

```ts
            changes: z.unknown().nullable(),
            metadata: z.unknown().nullable(),
```

**Rationale:** `z.unknown()` is the type-safe alternative: it still accepts any value from the database but forces consumers to narrow before use. This is an output schema, so no runtime risk.

---

### Phase 1 Verification

```bash
pnpm typecheck
pnpm vitest run src/trpc/routers/__tests__/corrections.test.ts
pnpm vitest run src/trpc/routers/__tests__/payrollExports-router.test.ts
pnpm vitest run src/trpc/routers/__tests__/travelAllowancePreview-router.test.ts
pnpm vitest run src/trpc/routers/__tests__/bookings-closed-month.test.ts
```

---

## Phase 2: SQL Injection Fix (reports-repository.ts)

### Step 2.1 — Replace $queryRawUnsafe with Prisma.sql tagged template

**File:** `src/lib/services/reports-repository.ts`

**Old import (line 7):**

```ts
import type { PrismaClient } from "@/generated/prisma/client"
```

**New import:**

```ts
import type { PrismaClient } from "@/generated/prisma/client"
import { Prisma } from "@/generated/prisma/client"
```

**Old code (lines 305-332):**

```ts
  const employeeFilter = params.employeeIds && params.employeeIds.length > 0
    ? `AND ad.employee_id = ANY($4::uuid[])`
    : ""

  const queryParams: unknown[] = [
    tenantId,
    params.from.toISOString().slice(0, 10),
    params.to.toISOString().slice(0, 10),
  ]
  if (params.employeeIds && params.employeeIds.length > 0) {
    queryParams.push(params.employeeIds)
  }

  return prisma.$queryRawUnsafe(
    `SELECT ad.absence_date, ad.employee_id, e.personnel_number,
            COALESCE(at.name, '') as absence_type_name,
            ad.status, ad.duration
     FROM absence_days ad
     JOIN employees e ON e.id = ad.employee_id
     LEFT JOIN absence_types at ON at.id = ad.absence_type_id
     WHERE ad.tenant_id = $1
       AND ad.absence_date >= $2
       AND ad.absence_date <= $3
       ${employeeFilter}
     ORDER BY ad.absence_date, e.personnel_number
     LIMIT 10000`,
    ...queryParams
  )
```

**New code:**

```ts
  const fromDate = params.from.toISOString().slice(0, 10)
  const toDate = params.to.toISOString().slice(0, 10)

  const employeeFilter = params.employeeIds && params.employeeIds.length > 0
    ? Prisma.sql`AND ad.employee_id = ANY(${params.employeeIds}::uuid[])`
    : Prisma.sql``

  return prisma.$queryRaw<AbsenceDayRow[]>`
    SELECT ad.absence_date, ad.employee_id, e.personnel_number,
            COALESCE(at.name, '') as absence_type_name,
            ad.status, ad.duration
     FROM absence_days ad
     JOIN employees e ON e.id = ad.employee_id
     LEFT JOIN absence_types at ON at.id = ad.absence_type_id
     WHERE ad.tenant_id = ${tenantId}::uuid
       AND ad.absence_date >= ${fromDate}::date
       AND ad.absence_date <= ${toDate}::date
       ${employeeFilter}
     ORDER BY ad.absence_date, e.personnel_number
     LIMIT 10000`
```

**Key details:**
- `Prisma.sql\`\`` (empty tagged template) produces an empty SQL fragment, matching the existing pattern in `crm-report-service.ts` line 330.
- The tagged template `prisma.$queryRaw<AbsenceDayRow[]>\`...\`` auto-parameterizes all `${...}` interpolations — no SQL injection possible.
- `${tenantId}::uuid` casts the string parameter to uuid at the Postgres level, matching the existing pattern in `account-repository.ts` line 117 and `daily-value-repository.ts` line 106.
- `${params.employeeIds}::uuid[]` passes the array as a parameter and casts to uuid[]. Prisma's tagged template will handle the array parameterization.
- `${fromDate}::date` and `${toDate}::date` cast the string dates at the Postgres level.

### Phase 2 Verification

```bash
pnpm typecheck
```

No existing test file for `reports-repository.ts`. The typecheck will verify the Prisma API usage is correct. Manual verification can be done by running the report generation flow if a dev environment is available.

---

## Phase 3: Pagination Refactor (correctionAssistant.ts)

### Step 3.1 — Add database-level pagination for the common case and cap the unbounded fetch

**File:** `src/trpc/routers/correctionAssistant.ts`

The `listItems` procedure currently fetches ALL matching `dailyValue` rows, processes them in memory to filter by `severity`/`errorCode`, then slices for pagination. This is fine for small datasets but unbounded.

**Approach:** Add a hard cap of `10000` rows to the unbounded `findMany` to prevent memory exhaustion. For the common case (no `severity` or `errorCode` filter), push `skip`/`take` down to Prisma. For the filtered case, keep in-memory pagination but with the cap.

**Old code (lines 414-429):**

```ts
        const rows = await ctx.prisma.dailyValue.findMany({
          where: dvWhere,
          include: {
            employee: {
              select: {
                firstName: true,
                lastName: true,
                departmentId: true,
                department: {
                  select: { name: true },
                },
              },
            },
          },
          orderBy: { valueDate: "asc" },
        })
```

**New code:**

```ts
        const needsPostFilter = !!(input?.severity || input?.errorCode)
        const limit = input?.limit ?? 50
        const offset = input?.offset ?? 0

        const rows = await ctx.prisma.dailyValue.findMany({
          where: dvWhere,
          include: {
            employee: {
              select: {
                firstName: true,
                lastName: true,
                departmentId: true,
                department: {
                  select: { name: true },
                },
              },
            },
          },
          orderBy: { valueDate: "asc" },
          // When no post-fetch filtering is needed, paginate at the DB level.
          // When post-fetch filtering is needed, cap at 10000 to prevent unbounded loads.
          ...(needsPostFilter ? { take: 10000 } : { skip: offset, take: limit }),
        })
```

Then update the pagination section at the bottom.

**Old code (lines 521-527):**

```ts
        const total = items.length
        const limit = input?.limit ?? 50
        const offset = input?.offset ?? 0

        // Apply pagination
        const paginatedItems = items.slice(offset, offset + limit)
        const hasMore = offset + limit < total
```

**New code:**

```ts
        let total: number
        let paginatedItems: CorrectionAssistantItem[]
        let hasMore: boolean

        if (needsPostFilter) {
          // Post-fetch filtering was applied — paginate in memory
          total = items.length
          paginatedItems = items.slice(offset, offset + limit)
          hasMore = offset + limit < total
        } else {
          // DB-level pagination was used — items ARE the page
          total = await ctx.prisma.dailyValue.count({ where: dvWhere })
          paginatedItems = items
          hasMore = offset + limit < total
        }
```

**Important note:** When `needsPostFilter` is false, the `items` array already IS the paginated result (because `skip`/`take` were passed to `findMany`). The loop that builds `items` from `rows` still runs, but it produces exactly one page of results. We need a separate `count` query for the total.

When `needsPostFilter` is true, the existing in-memory flow is preserved but capped at 10000 rows from the DB.

### Phase 3 Verification

```bash
pnpm typecheck
```

No existing test file for `correctionAssistant`. The typecheck confirms the code compiles. Manual verification: query the correctionAssistant.listItems endpoint with and without severity/errorCode filters.

---

## Full Verification (after all phases)

```bash
pnpm typecheck
pnpm test
```

---

## Summary of Changes

| Phase | File | Change |
|-------|------|--------|
| 1.1 | `src/trpc/routers/corrections.ts` | Add `.min(-10080).max(10080)` to `valueMinutes`, `.max(500)` to `reason` in update schema |
| 1.2 | `src/trpc/routers/users.ts` | Add `.max(255)` to `search`, `.int().min(1).max(500)` to `limit` |
| 1.3 | `src/trpc/routers/payrollExports.ts` | Add `.int().min(1).max(9999)` to `year`, `.int().min(1).max(12)` to `month` |
| 1.4 | `src/trpc/routers/travelAllowancePreview.ts` | Add `.min(0).max(100000)` to `distanceKm` |
| 1.5 | `src/trpc/routers/bookings.ts` | Replace `z.any()` with `z.unknown()` on `changes` and `metadata` |
| 2.1 | `src/lib/services/reports-repository.ts` | Replace `$queryRawUnsafe` with `$queryRaw` + `Prisma.sql` tagged template; add `Prisma` import |
| 3.1 | `src/trpc/routers/correctionAssistant.ts` | Add DB-level pagination when no post-filter needed; cap unbounded fetch at 10000 |
