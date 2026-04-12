# Input Validation Gaps Research

Date: 2026-03-21

## 1. corrections.ts:100-101 — Update schema missing min/max parity with create schema

**File:** `src/trpc/routers/corrections.ts`

### Current code (lines 89-102)

Create schema (lines 89-96):
```ts
const createInputSchema = z.object({
  employeeId: z.string(),
  correctionDate: z.string().date(), // YYYY-MM-DD
  correctionType: z.string().min(1),
  accountId: z.string().optional(),
  valueMinutes: z.number().int().min(-10080).max(10080),
  reason: z.string().max(500).optional().default(""),
})
```

Update schema (lines 98-102):
```ts
const updateInputSchema = z.object({
  id: z.string(),
  valueMinutes: z.number().int().optional(),
  reason: z.string().optional(),
})
```

### Gap

- **Line 100:** `valueMinutes` in the update schema is `z.number().int().optional()` with no `.min()` or `.max()`. The create schema constrains it to `min(-10080).max(10080)` (one week in minutes: 7 * 24 * 60 = 10080). The update schema allows any integer.
- **Line 101:** `reason` in the update schema is `z.string().optional()` with no `.max()`. The create schema constrains it to `.max(500)`.

### Fix

```ts
const updateInputSchema = z.object({
  id: z.string(),
  valueMinutes: z.number().int().min(-10080).max(10080).optional(),
  reason: z.string().max(500).optional(),
})
```

---

## 2. users.ts:190-191 — Unbounded search string and limit

**File:** `src/trpc/routers/users.ts`

### Current code (lines 187-194)

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

### Gap

- **Line 190:** `search` is `z.string().optional()` with no `.max()`. An attacker could send a very long string that gets passed into Prisma `contains` queries on `email`, `displayName`, and `username` fields (see `users-repository.ts` lines 29-34).
- **Line 191:** `limit` is `z.number().optional()` with no `.int()`, `.min()`, or `.max()`. The repository layer (line 25) does clamp it with `Math.min(Math.max(params?.limit ?? 20, 1), 100)`, but defense-in-depth at the input schema level is missing. A non-integer or negative number could pass through.

### Repository-level clamping (users-repository.ts line 25):
```ts
const limit = Math.min(Math.max(params?.limit ?? 20, 1), 100)
```

### Fix

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

Note: The ticket says `.max(500)` for limit, but the repository already clamps to 100. Using 500 at the schema level is a looser outer bound that still prevents absurd values while the repository enforces the tighter 100 limit.

---

## 3. reports-repository.ts:317 — $queryRawUnsafe with string interpolation

**File:** `src/lib/services/reports-repository.ts`

### Current code (lines 296-333)

```ts
export async function findAbsenceDays(
  prisma: PrismaClient,
  tenantId: string,
  params: {
    from: Date
    to: Date
    employeeIds?: string[]
  }
): Promise<AbsenceDayRow[]> {
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
}
```

### Gap

`$queryRawUnsafe` is used with string interpolation for the `${employeeFilter}` clause. Although the interpolated string is a constant (`AND ad.employee_id = ANY($4::uuid[])` or `""`), using `$queryRawUnsafe` is flagged as a security concern because:
1. It bypasses Prisma's tagged template SQL injection protection.
2. Any future modification could accidentally introduce user-controlled strings into the template.

The codebase already uses the `Prisma.sql` tagged template pattern elsewhere for conditional SQL fragments. See:
- `src/lib/services/crm-report-service.ts` lines 330-337: uses `Prisma.sql\`\`` for empty fragment and `Prisma.sql\`AND ...\`` for conditional clauses.
- `src/lib/services/account-repository.ts` line 114: uses `prisma.$queryRaw<...>\`...\`` tagged template.
- `src/lib/services/daily-calc.context.ts` line 141: uses `prisma.$queryRaw<...>\`...\`` tagged template.

### Fix

Replace `$queryRawUnsafe` with `$queryRaw` using `Prisma.sql` tagged templates:

```ts
import { Prisma } from "@/generated/prisma/client"

// ...

export async function findAbsenceDays(
  prisma: PrismaClient,
  tenantId: string,
  params: {
    from: Date
    to: Date
    employeeIds?: string[]
  }
): Promise<AbsenceDayRow[]> {
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
       AND ad.absence_date >= ${params.from.toISOString().slice(0, 10)}::date
       AND ad.absence_date <= ${params.to.toISOString().slice(0, 10)}::date
       ${employeeFilter}
     ORDER BY ad.absence_date, e.personnel_number
     LIMIT 10000
  `
}
```

The `Prisma` namespace must be added to the import (currently only `PrismaClient` is imported as a type).

---

## 4. correctionAssistant.ts:414 — In-memory pagination of all daily values

**File:** `src/trpc/routers/correctionAssistant.ts`

### Current code (lines 414-528)

The `listItems` procedure:
1. Queries ALL daily values matching filters with no `take`/`skip` (line 414-429):
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

2. Then processes ALL rows in memory to build items with error codes (lines 452-519).
3. Then applies in-memory pagination (lines 521-527):
```ts
const total = items.length
const limit = input?.limit ?? 50
const offset = input?.offset ?? 0

// Apply pagination
const paginatedItems = items.slice(offset, offset + limit)
const hasMore = offset + limit < total
```

### Gap

All matching daily values are fetched from the database and processed in memory before pagination is applied. If there are tens of thousands of daily values with errors in the date range, all are loaded into memory. The `where` clause already correctly filters by `tenantId`, `hasError: true`, date range, `employeeId`, and `departmentId`, but the `severity` and `errorCode` filters are applied in-memory after fetch.

### Fix

The issue is that `severity` and `errorCode` require inspecting the `errorCodes` and `warnings` arrays on each `DailyValue` row against the message catalog, so they cannot be purely translated to Prisma `where` filters. However, the improvement is to add Prisma `skip`/`take` for cases where severity/errorCode filters are NOT used, and to limit the unbounded fetch when they ARE used:

For the common case (no severity/errorCode filter), add `skip` and `take` to the Prisma query:
```ts
// When no post-fetch filtering needed, use Prisma pagination
if (!input?.severity && !input?.errorCode) {
  const rows = await ctx.prisma.dailyValue.findMany({
    where: dvWhere,
    include: { employee: { select: { ... } } },
    orderBy: { valueDate: "asc" },
    skip: offset,
    take: limit,
  })
  // Also need a count query for total
}
```

For the filtered case, the current approach must remain (fetch all, filter, paginate in memory) but should be bounded with a reasonable `take` limit to prevent unbounded fetches.

### Context: Input schema already has limit/offset validation (lines 346-354)

```ts
z.object({
  from: z.string().date().optional(),
  to: z.string().date().optional(),
  employeeId: z.string().optional(),
  departmentId: z.string().optional(),
  severity: z.enum(["error", "hint"]).optional(),
  errorCode: z.string().optional(),
  limit: z.number().int().min(1).max(500).optional(),
  offset: z.number().int().min(0).optional(),
}).optional()
```

The input validation for `limit` and `offset` is already present. The gap is purely in the data access pattern (no Prisma-level pagination).

---

## 5. payrollExports.ts:105-106 — Unbounded year and month in list filter

**File:** `src/trpc/routers/payrollExports.ts`

### Current code (lines 103-110)

List input:
```ts
z.object({
  year: z.number().optional(),
  month: z.number().optional(),
  status: payrollExportStatusEnum.optional(),
  limit: z.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
}).optional()
```

### Comparison: generate input (lines 167-170)

```ts
z.object({
  year: z.number().int().min(1),
  month: z.number().int().min(1).max(12),
  // ...
})
```

### Gap

- **Line 105:** `year` is `z.number().optional()` — no `.int()`, `.min()`, or `.max()`. Could accept floating point, negative, or absurdly large year values.
- **Line 106:** `month` is `z.number().optional()` — no `.int()`, `.min()`, or `.max()`. Could accept 0, 13, negative, or floating point months.

The `generate` procedure already validates these correctly with `.int().min(1)` and `.int().min(1).max(12)`.

### Fix

```ts
z.object({
  year: z.number().int().min(1).max(9999).optional(),
  month: z.number().int().min(1).max(12).optional(),
  status: payrollExportStatusEnum.optional(),
  limit: z.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
}).optional()
```

---

## 6. travelAllowancePreview.ts:49-50 — Unbounded distanceKm

**File:** `src/trpc/routers/travelAllowancePreview.ts`

### Current code (lines 46-54)

```ts
const previewInputSchema = z.object({
  ruleSetId: z.string(),
  tripType: z.enum(["local", "extended"]),
  distanceKm: z.number().optional().default(0),
  durationMinutes: z.number().int().optional().default(0),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  threeMonthActive: z.boolean().optional().default(false),
})
```

### Gap

- **Line 49:** `distanceKm` is `z.number().optional().default(0)` — no `.min()` or `.max()`. A negative distance or an absurdly large value (e.g., 1 billion km) could be passed.
- **Line 50:** `durationMinutes` also lacks `.min()` or `.max()` but is not called out in the ticket.

### Fix

```ts
distanceKm: z.number().min(0).max(100000).optional().default(0),
```

Note: 100,000 km is a generous upper bound (roughly 2.5x Earth's circumference).

---

## 7. bookings.ts:442-443 — z.any() in output schema

**File:** `src/trpc/routers/bookings.ts`

### Current code (lines 432-447)

```ts
    .output(
      z.object({
        items: z.array(
          z.object({
            id: z.string(),
            userId: z.string().nullable(),
            action: z.string(),
            entityType: z.string(),
            entityId: z.string(),
            entityName: z.string().nullable(),
            changes: z.any().nullable(),
            metadata: z.any().nullable(),
            performedAt: z.date(),
          })
        ),
      })
    )
```

### Gap

- **Line 442:** `changes: z.any().nullable()` — `z.any()` disables all type checking and validation for the field. While this is an output schema (data coming from the database, not from user input), using `z.any()` is inconsistent with best practices.
- **Line 443:** `metadata: z.any().nullable()` — same issue.

### Fix

Replace `z.any()` with `z.unknown()`:

```ts
changes: z.unknown().nullable(),
metadata: z.unknown().nullable(),
```

`z.unknown()` is the type-safe alternative: it still accepts any value but does not disable type narrowing. In tRPC output schemas, `z.unknown()` forces consumers to narrow the type before use, which is safer.

---

## Summary Table

| # | File | Line(s) | Issue | Severity |
|---|------|---------|-------|----------|
| 1 | corrections.ts | 100 | `valueMinutes` missing `.min(-10080).max(10080)` in update | Medium |
| 2 | corrections.ts | 101 | `reason` missing `.max(500)` in update | Low |
| 3 | users.ts | 190 | `search` missing `.max(255)` | Low |
| 4 | users.ts | 191 | `limit` missing `.int().min(1).max(500)` | Low |
| 5 | reports-repository.ts | 318 | `$queryRawUnsafe` with string interpolation | High |
| 6 | correctionAssistant.ts | 414 | In-memory pagination of all daily values | Medium |
| 7 | payrollExports.ts | 105 | `year` missing `.int().min(1).max(9999)` | Low |
| 8 | payrollExports.ts | 106 | `month` missing `.int().min(1).max(12)` | Low |
| 9 | travelAllowancePreview.ts | 49 | `distanceKm` missing `.min(0).max(100000)` | Low |
| 10 | bookings.ts | 442-443 | `z.any()` should be `z.unknown()` | Low |
