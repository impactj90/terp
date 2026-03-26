# WH_11 Research: Korrekturassistent fur Warenwirtschaft

**Date:** 2026-03-25
**Ticket:** WH_11
**Status:** Research complete

---

## 1. Existing Correction Assistant Pattern (Zeiterfassung)

The time-tracking correction assistant is the primary pattern to follow. It consists of:

### 1.1 Prisma Model: CorrectionMessage

**File:** `prisma/schema.prisma` (line 3640)

```prisma
model CorrectionMessage {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId    String   @map("tenant_id") @db.Uuid
  code        String   @db.VarChar(50)
  defaultText String   @map("default_text") @db.Text
  customText  String?  @map("custom_text") @db.Text
  severity    String   @default("error") @db.VarChar(10)
  description String?  @db.Text
  isActive    Boolean  @default(true) @map("is_active")
  createdAt   DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt   DateTime @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@unique([tenantId, code])
  @@index([tenantId], map: "idx_correction_messages_tenant")
  @@index([code], map: "idx_correction_messages_code")
  @@index([tenantId, severity], map: "idx_correction_messages_severity")
  @@map("correction_messages")
}
```

**Key pattern:** Message catalog per tenant with `code`, `defaultText`, `customText`, `severity`, `isActive`. Auto-seeded on first access via `ensureDefaults()`.

### 1.2 Service: correction-assistant-service.ts

**File:** `/home/tolga/projects/terp/src/lib/services/correction-assistant-service.ts`

Key patterns:
- **Error classes:** `CorrectionMessageNotFoundError extends Error` (name convention drives `handleServiceError` mapping)
- **Error code constants:** Static string constants for each error type
- **Error type mapping:** `mapCorrectionErrorType(code)` maps raw codes to categories
- **Default message seeding:** `defaultCorrectionMessages(tenantId)` returns array of `{tenantId, code, defaultText, severity, description}`
- **ensureDefaults:** Checks if messages exist, seeds missing ones
- **listMessages:** Seeds defaults, returns filtered messages
- **getMessage:** Finds by id+tenantId, throws NotFoundError
- **updateMessage:** Verifies exists, builds partial update, delegates to repo
- **listItems:** Main detection query -- joins daily values with errors, applies message catalog, builds structured items with pagination

### 1.3 Repository: correction-assistant-repository.ts

**File:** `/home/tolga/projects/terp/src/lib/services/correction-assistant-repository.ts`

Key patterns:
- Pure Prisma data access, no business logic
- `tenantScopedUpdate` from `prisma-helpers` for safe updates
- Functions: `countMessages`, `createManyMessages`, `findManyMessages`, `findMessageById`, `updateMessage`, `findActiveMessages`, `findDailyValuesWithErrors`

### 1.4 Router: correctionAssistant.ts

**File:** `/home/tolga/projects/terp/src/trpc/routers/correctionAssistant.ts`

Key patterns:
- `createTRPCRouter`, `tenantProcedure` from `@/trpc/init`
- Permission guards: `requirePermission(TIME_TRACKING_VIEW_ALL)` and `requirePermission(CORRECTIONS_MANAGE)`
- `handleServiceError(err)` in catch blocks
- Output schemas defined inline with `z.object()`
- Procedures: `listMessages` (query), `getMessage` (query), `updateMessage` (mutation), `listItems` (query)
- Helper: `mapMessage()` adds `effectiveText = customText || defaultText`

### 1.5 Hook: use-correction-assistant.ts

**File:** `/home/tolga/projects/terp/src/hooks/use-correction-assistant.ts`

Key patterns:
- Types exported: `CorrectionAssistantItem`, `CorrectionMessage`, `UpdateCorrectionMessageRequest`
- `useTRPC()` for client reference
- `useQuery(trpc.correctionAssistant.listItems.queryOptions(params, { enabled }))` pattern
- `useMutation({ ...trpc.correctionAssistant.updateMessage.mutationOptions(), onSuccess: invalidate queries })`
- Query invalidation pattern uses `queryKey()` from trpc

### 1.6 UI Components

**Directory:** `/home/tolga/projects/terp/src/components/correction-assistant/`
- `index.ts` -- barrel export
- `correction-assistant-data-table.tsx` -- Table component with `FlattenedCorrectionRow` type
- `correction-assistant-detail-sheet.tsx` -- Sheet for detail view
- `correction-assistant-filters.tsx` -- Filter bar (date range, department, severity, error code, employee search)
- `correction-assistant-skeleton.tsx` -- Loading skeleton
- `correction-message-data-table.tsx` -- Message catalog table
- `correction-message-edit-dialog.tsx` -- Edit dialog

### 1.7 Page

**File:** `/home/tolga/projects/terp/src/app/[locale]/(dashboard)/admin/correction-assistant/page.tsx`

Key patterns:
- `'use client'` directive
- `useAuth()`, `useHasPermission(['corrections.manage'])` for auth guard
- `Tabs` component with "corrections" and "messages" tabs
- Filters -> query -> data table -> pagination -> detail sheet
- `formatDate()` from `@/lib/time-utils`

---

## 2. Warehouse Models and Services

### 2.1 WhArticle Model

**File:** `prisma/schema.prisma` (line 4183)

Key fields for WH_11:
- `stockTracking: Boolean` -- whether stock is tracked
- `currentStock: Float` -- current stock level (can be negative)
- `minStock: Float?` -- minimum stock threshold
- `isActive: Boolean`
- `tenantId: String` -- tenant isolation

### 2.2 WhStockMovement Model

**File:** `prisma/schema.prisma` (line 4405)

Key fields for WH_11:
- `type: WhStockMovementType` -- enum: `GOODS_RECEIPT | WITHDRAWAL | ADJUSTMENT | INVENTORY | RETURN | DELIVERY_NOTE`
- `quantity: Float` -- movement quantity
- `previousStock: Float` -- stock before
- `newStock: Float` -- stock after
- `articleId: String` -- FK to WhArticle
- `purchaseOrderId: String?` -- optional FK

### 2.3 WhPurchaseOrder Model

**File:** `prisma/schema.prisma` (line 4332)

Key fields for WH_11:
- `status: WhPurchaseOrderStatus` -- enum: `DRAFT | ORDERED | PARTIALLY_RECEIVED | RECEIVED | CANCELLED`
- `requestedDelivery: DateTime?`
- `confirmedDelivery: DateTime?`
- `orderDate: DateTime?`
- `supplierId: String`

### 2.4 WhPurchaseOrderPosition Model

**File:** `prisma/schema.prisma` (line 4369)

Key fields for WH_11:
- `articleId: String?`
- `quantity: Float?`
- `receivedQuantity: Float` -- tracks received amount
- `confirmedDelivery: DateTime?`

### 2.5 No Reservation Model

There is **no** reservation model in the Prisma schema. `WH_10` (article reservations) has not been implemented yet. The "orphan reservations" check should be deferred or skipped.

### 2.6 Warehouse Services

| Service | File | Key for WH_11 |
|---------|------|---------------|
| Article Service | `src/lib/services/wh-article-service.ts` | `adjustStock()`, `getStockValueSummary()`, `list()` with `belowMinStock` filter |
| Article Repository | `src/lib/services/wh-article-repository.ts` | `findMany()`, `getStockValueSummary()` (raw SQL), `findArticlesBelowMinStock()` |
| Stock Movement Service | `src/lib/services/wh-stock-movement-service.ts` | `bookGoodsReceipt()`, `listMovements()` |
| Stock Movement Repository | `src/lib/services/wh-stock-movement-repository.ts` | `findMany()`, `findByArticle()`, `create()` |
| Purchase Order Service | `src/lib/services/wh-purchase-order-service.ts` | `list()`, `getById()`, `getReorderSuggestions()` |
| Purchase Order Repository | `src/lib/services/wh-purchase-order-repository.ts` | `findMany()`, `findArticlesBelowMinStock()` |
| Withdrawal Service | `src/lib/services/wh-withdrawal-service.ts` | Withdrawal patterns |

### 2.7 Stock Mismatch Detection Pattern

The article repository has `getStockValueSummary()` using raw SQL. For stock mismatch detection (currentStock != sum of movements), a similar raw SQL approach can be used:

```typescript
// From wh-article-repository.ts line 499
const result = await prisma.$queryRaw<Array<{...}>>`
  SELECT ...
  FROM wh_articles
  WHERE tenant_id = ${tenantId}::uuid
    AND stock_tracking = true
    AND is_active = true
`
```

---

## 3. Permission Catalog

**File:** `/home/tolga/projects/terp/src/lib/auth/permission-catalog.ts`

### Pattern to add new permissions:

```typescript
import { v5 as uuidv5 } from "uuid"
const PERMISSION_NAMESPACE = "f68a2ad7-6fd8-4d61-9b0e-0ea4a0d6c8a1"

function permissionId(key: string): string {
  return uuidv5(key, PERMISSION_NAMESPACE)
}

function p(key, resource, action, description): Permission {
  return { id: permissionId(key), key, resource, action, description }
}
```

### Current warehouse permissions (lines 276-299):

```typescript
// Warehouse Articles
p("wh_articles.view", "wh_articles", "view", "View warehouse articles"),
p("wh_articles.create", "wh_articles", "create", "Create warehouse articles"),
// ...

// Warehouse Stock / Goods Receipt
p("wh_stock.view", "wh_stock", "view", "View stock movements and goods receipts"),
p("wh_stock.manage", "wh_stock", "manage", "Manage goods receipts and stock bookings"),
```

### New permissions to add:

```typescript
// Warehouse Corrections
p("wh_corrections.view", "wh_corrections", "view", "View warehouse correction assistant"),
p("wh_corrections.manage", "wh_corrections", "manage", "Manage warehouse correction messages"),
p("wh_corrections.run", "wh_corrections", "run", "Run warehouse correction checks"),
```

Add these after the existing `wh_supplier_invoices` permissions (line 299).

**Comment in file:** `All 90 permissions` on line 43 -- update the count after adding.

---

## 4. Router Pattern (Warehouse)

### 4.1 Warehouse Router Index

**File:** `/home/tolga/projects/terp/src/trpc/routers/warehouse/index.ts`

```typescript
import { createTRPCRouter } from "@/trpc/init"
import { whArticlesRouter } from "./articles"
// ... other imports

export const warehouseRouter = createTRPCRouter({
  articles: whArticlesRouter,
  articlePrices: whArticlePricesRouter,
  purchaseOrders: whPurchaseOrdersRouter,
  stockMovements: whStockMovementsRouter,
  withdrawals: whWithdrawalsRouter,
  supplierInvoices: whSupplierInvoicesRouter,
})
```

**Add:** `corrections: whCorrectionsRouter`

### 4.2 Thin Wrapper Pattern (from stockMovements.ts)

**File:** `/home/tolga/projects/terp/src/trpc/routers/warehouse/stockMovements.ts`

```typescript
import { z } from "zod"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { handleServiceError } from "@/trpc/errors"
import { requirePermission } from "@/lib/auth/middleware"
import { requireModule } from "@/lib/modules"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import * as stockMovementService from "@/lib/services/wh-stock-movement-service"
import type { PrismaClient } from "@/generated/prisma/client"

const WH_STOCK_VIEW = permissionIdByKey("wh_stock.view")!
const WH_STOCK_MANAGE = permissionIdByKey("wh_stock.manage")!

const whProcedure = tenantProcedure.use(requireModule("warehouse"))

// Sub-routers can be nested:
const goodsReceiptRouter = createTRPCRouter({
  listPendingOrders: whProcedure
    .use(requirePermission(WH_STOCK_VIEW))
    .input(z.object({ supplierId: z.string().uuid().optional() }))
    .query(async ({ ctx, input }) => {
      try {
        return await stockMovementService.listPendingOrders(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.supplierId
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),
  // ...
})
```

### 4.3 _app.ts Registration

**File:** `/home/tolga/projects/terp/src/trpc/routers/_app.ts`

The warehouse router is already registered at line 161:
```typescript
warehouse: warehouseRouter,
```
No change needed here since `corrections` will be a sub-router of `warehouse`.

---

## 5. Cron Job Pattern

### 5.1 Existing Crons (vercel.json)

**File:** `/home/tolga/projects/terp/vercel.json`

```json
{
  "crons": [
    { "path": "/api/cron/calculate-days", "schedule": "0 2 * * *" },
    { "path": "/api/cron/calculate-months", "schedule": "0 3 2 * *" },
    { "path": "/api/cron/generate-day-plans", "schedule": "0 1 * * 0" },
    { "path": "/api/cron/execute-macros", "schedule": "*/15 * * * *" },
    { "path": "/api/cron/recurring-invoices", "schedule": "0 4 * * *" }
  ]
}
```

**Add:** `{ "path": "/api/cron/wh-corrections", "schedule": "0 6 * * *" }`

### 5.2 Cron Route Pattern (simpler version from recurring-invoices)

**File:** `/home/tolga/projects/terp/src/app/api/cron/recurring-invoices/route.ts`

```typescript
import { NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"

export const runtime = "nodejs"
export const maxDuration = 300

export async function GET(request: Request) {
  // 1. Validate CRON_SECRET
  const authHeader = request.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 })
  }
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    // 2. Process logic per tenant
    const tenants = await prisma.tenant.findMany({
      where: { isActive: true },
      select: { id: true },
    })

    // 3. Iterate tenants and run checks
    // 4. Return JSON summary
    return NextResponse.json({ ok: true, ... })
  } catch (err) {
    return NextResponse.json(
      { error: "Internal server error", message: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    )
  }
}
```

**Key patterns:**
- CRON_SECRET validation via Bearer token
- `prisma` singleton import from `@/lib/db/prisma`
- `runtime = "nodejs"` and `maxDuration = 300`
- CronCheckpoint support for idempotent re-runs
- Sequential tenant processing to avoid connection pool exhaustion

---

## 6. UI Patterns

### 6.1 Dashboard with KPI Cards

**File:** `/home/tolga/projects/terp/src/app/[locale]/(dashboard)/warehouse/page.tsx`

```tsx
<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
  <StockValueCard />
  <BelowMinStockCard />
  ...
</div>
```

### 6.2 StatsCard Component

**File:** `/home/tolga/projects/terp/src/components/dashboard/stats-card.tsx`

Props: `title, value, description, icon, trend, trendValue, isLoading, error, onRetry, className`

### 6.3 Dashboard Card Pattern

**File:** `/home/tolga/projects/terp/src/components/warehouse/dashboard/below-min-stock-card.tsx`

```tsx
'use client'

import { useTranslations } from 'next-intl'
import { StatsCard } from '@/components/dashboard/stats-card'
import { useWhStockValueSummary } from '@/hooks/use-wh-dashboard'
import { AlertTriangle } from 'lucide-react'

export function BelowMinStockCard() {
  const t = useTranslations('warehouseDashboard')
  const { data, isLoading, error, refetch } = useWhStockValueSummary()
  const count = data?.belowMinStockCount ?? 0

  return (
    <StatsCard
      title={t('belowMinStock')}
      value={data ? String(count) : '-'}
      description={count > 0 ? t('belowMinStockDesc') : t('allStockOk')}
      icon={AlertTriangle}
      trend={data ? (count > 0 ? 'down' : 'up') : undefined}
      trendValue={data ? (count > 0 ? t('actionRequired') : t('ok')) : undefined}
      isLoading={isLoading}
      error={error ? (error as unknown as Error) : undefined}
      onRetry={() => refetch()}
    />
  )
}
```

### 6.4 Table with Badge

**File:** `/home/tolga/projects/terp/src/components/correction-assistant/correction-assistant-data-table.tsx`

Uses: `Table, TableBody, TableCell, TableHead, TableHeader, TableRow` from `@/components/ui/table`, `Badge` from `@/components/ui/badge`, `Skeleton` from `@/components/ui/skeleton`.

```tsx
<Badge variant={item.severity === 'error' ? 'destructive' : 'secondary'}>
  {t(`severity.${item.severity}`)}
</Badge>
```

### 6.5 Barrel Export Pattern for Components

**File:** `/home/tolga/projects/terp/src/components/warehouse/dashboard/index.ts`

```typescript
export { StockValueCard } from "./stock-value-card"
export { BelowMinStockCard } from "./below-min-stock-card"
// ...
```

---

## 7. Test Pattern

### 7.1 Test Helpers

**File:** `/home/tolga/projects/terp/src/trpc/routers/__tests__/helpers.ts`

Key utilities:
- `autoMockPrisma(partial)` -- Proxy-based auto-mocker for Prisma
- `createMockUser(overrides)` -- Creates mock `ContextUser`
- `createMockContext({prisma, authToken, user, session, tenantId})` -- Creates `TRPCContext`
- `createMockSession()` -- Returns Supabase Session mock
- `createUserWithPermissions(permissionIds, overrides)` -- User with specific permissions
- `createMockUserTenant(userId, tenantId)` -- Creates UserTenant join entry

### 7.2 Warehouse Router Test Pattern

**File:** `/home/tolga/projects/terp/src/trpc/routers/__tests__/whArticles-router.test.ts`

```typescript
import { describe, it, expect, vi } from "vitest"
import { createCallerFactory } from "@/trpc/init"
import { whArticlesRouter } from "../warehouse/articles"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import { createMockContext, createMockSession, createUserWithPermissions, createMockUserTenant } from "./helpers"

// Mock the db module for requireModule middleware
vi.mock("@/lib/db", () => ({
  prisma: {
    tenantModule: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue({ id: "mock", module: "warehouse" }),
    },
  },
}))

const WH_VIEW = permissionIdByKey("wh_articles.view")!
const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const USER_ID = "a0000000-0000-4000-a000-000000000001"

const createCaller = createCallerFactory(whArticlesRouter)

const MODULE_MOCK = {
  tenantModule: {
    findMany: vi.fn().mockResolvedValue([]),
    findUnique: vi.fn().mockResolvedValue({ id: "mock", module: "warehouse" }),
  },
}

function withModuleMock(prisma: Record<string, unknown>) {
  return { ...MODULE_MOCK, ...prisma }
}

function createTestContext(prisma, permissions = [WH_VIEW]) {
  return createMockContext({
    prisma: withModuleMock(prisma),
    authToken: "test-token",
    user: createUserWithPermissions(permissions, {
      id: USER_ID,
      userTenants: [createMockUserTenant(USER_ID, TENANT_ID)],
    }),
    session: createMockSession(),
    tenantId: TENANT_ID,
  })
}

describe("warehouse.articles", () => {
  it("returns paginated articles", async () => {
    const prisma = {
      whArticle: {
        findMany: vi.fn().mockResolvedValue([mockArticle]),
        count: vi.fn().mockResolvedValue(1),
      },
    }
    const caller = createCaller(createTestContext(prisma))
    const result = await caller.list({ page: 1, pageSize: 10 })
    expect(result!.items).toHaveLength(1)
  })

  it("rejects without permission", async () => {
    const caller = createCaller(createNoPermContext({}))
    await expect(caller.list({ page: 1, pageSize: 10 })).rejects.toThrow()
  })
})
```

**Key patterns:**
- `vi.mock("@/lib/db", ...)` to mock the module check
- `MODULE_MOCK` pattern for `tenantModule.findUnique` returning the warehouse module
- `withModuleMock()` merges module mock with test prisma mock
- `createCallerFactory(router)` creates a caller for direct router testing

---

## 8. Hooks Pattern

**File:** `/home/tolga/projects/terp/src/hooks/use-wh-articles.ts`

```typescript
import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

export function useWhArticles(options = {}) {
  const { enabled = true, ...input } = options
  const trpc = useTRPC()
  return useQuery(
    trpc.warehouse.articles.list.queryOptions(
      { search: input.search, ... },
      { enabled }
    )
  )
}

export function useCreateWhArticle() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.warehouse.articles.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.articles.list.queryKey(),
      })
    },
  })
}
```

### Hook Barrel Export

**File:** `/home/tolga/projects/terp/src/hooks/index.ts`

Each module exports from its hook file in a grouped section with comment.

---

## 9. Navigation

**File:** `/home/tolga/projects/terp/src/components/layout/sidebar/sidebar-nav-config.ts`

Warehouse section (lines 366-424):

```typescript
{
  titleKey: 'warehouseSection',
  module: 'warehouse',
  items: [
    {
      titleKey: 'warehouseOverview',
      href: '/warehouse',
      icon: Warehouse,
      module: 'warehouse',
    },
    // ... other items
  ],
}
```

**Add new nav item:**
```typescript
{
  titleKey: 'warehouseCorrections',
  href: '/warehouse/corrections',
  icon: AlertTriangle, // already imported
  module: 'warehouse',
  permissions: ['wh_corrections.view'],
},
```

---

## 10. Error Handling via handleServiceError

**File:** `/home/tolga/projects/terp/src/trpc/errors.ts`

Convention-based mapping by error class name suffix:
- `*NotFoundError` -> `TRPCError({ code: "NOT_FOUND" })`
- `*ValidationError` / `*InvalidError` -> `TRPCError({ code: "BAD_REQUEST" })`
- `*ConflictError` / `*DuplicateError` -> `TRPCError({ code: "CONFLICT" })`
- `*ForbiddenError` / `*AccessDeniedError` -> `TRPCError({ code: "FORBIDDEN" })`

---

## 11. New Models for WH_11

### 11.1 WhCorrectionMessage

Analogous to `CorrectionMessage` but for warehouse domain. Per-tenant message catalog.

```prisma
model WhCorrectionMessage {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId    String   @map("tenant_id") @db.Uuid
  code        String   @db.VarChar(50)
  defaultText String   @map("default_text") @db.Text
  customText  String?  @map("custom_text") @db.Text
  severity    String   @default("error") @db.VarChar(10)
  description String?  @db.Text
  isActive    Boolean  @default(true) @map("is_active")
  createdAt   DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt   DateTime @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@unique([tenantId, code])
  @@index([tenantId])
  @@index([code])
  @@index([tenantId, severity])
  @@map("wh_correction_messages")
}
```

### 11.2 WhCorrectionRun

Stores results of each correction check run.

```prisma
model WhCorrectionRun {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId    String   @map("tenant_id") @db.Uuid
  trigger     String   @db.VarChar(20)  // 'cron' | 'manual'
  startedAt   DateTime @map("started_at") @db.Timestamptz(6)
  completedAt DateTime? @map("completed_at") @db.Timestamptz(6)
  status      String   @default("running") @db.VarChar(20)  // 'running' | 'completed' | 'failed'
  totalChecks Int      @default(0) @map("total_checks")
  totalIssues Int      @default(0) @map("total_issues")
  results     Json?    @db.JsonB
  error       String?  @db.Text
  createdById String?  @map("created_by_id") @db.Uuid
  createdAt   DateTime @default(now()) @map("created_at") @db.Timestamptz(6)

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@index([tenantId])
  @@index([tenantId, startedAt])
  @@map("wh_correction_runs")
}
```

---

## 12. Detection Check Patterns

Each check follows a pattern of: query DB -> detect issue -> return item with code + details.

### 12.1 NEGATIVE_STOCK
```sql
SELECT id, number, name, current_stock
FROM wh_articles
WHERE tenant_id = $1 AND stock_tracking = true AND is_active = true AND current_stock < 0
```

### 12.2 DUPLICATE_RECEIPT
Look for duplicate `GOODS_RECEIPT` stock movements for same article+PO+position:
```sql
SELECT article_id, purchase_order_id, purchase_order_position_id, COUNT(*) as cnt
FROM wh_stock_movements
WHERE tenant_id = $1 AND type = 'GOODS_RECEIPT'
GROUP BY article_id, purchase_order_id, purchase_order_position_id
HAVING COUNT(*) > 1
```

### 12.3 OVERDUE_ORDER
```sql
SELECT id, number, supplier_id, confirmed_delivery, requested_delivery
FROM wh_purchase_orders
WHERE tenant_id = $1
  AND status IN ('ORDERED', 'PARTIALLY_RECEIVED')
  AND COALESCE(confirmed_delivery, requested_delivery) < NOW()
```

### 12.4 UNMATCHED_RECEIPT
Stock movements of type `GOODS_RECEIPT` where `purchase_order_id IS NULL`.

### 12.5 STOCK_MISMATCH
Compare `currentStock` with sum of movements:
```sql
SELECT a.id, a.number, a.name, a.current_stock,
       COALESCE(SUM(m.quantity), 0) as sum_movements
FROM wh_articles a
LEFT JOIN wh_stock_movements m ON m.article_id = a.id AND m.tenant_id = a.tenant_id
WHERE a.tenant_id = $1 AND a.stock_tracking = true AND a.is_active = true
GROUP BY a.id
HAVING a.current_stock != COALESCE(SUM(m.quantity), 0)
```

### 12.6 LOW_STOCK_NO_ORDER
Articles where `currentStock < minStock` and no active PO exists:
```sql
SELECT a.id, a.number, a.name, a.current_stock, a.min_stock
FROM wh_articles a
WHERE a.tenant_id = $1 AND a.stock_tracking = true AND a.is_active = true
  AND a.min_stock IS NOT NULL AND a.current_stock < a.min_stock
  AND NOT EXISTS (
    SELECT 1 FROM wh_purchase_order_positions pop
    JOIN wh_purchase_orders po ON po.id = pop.purchase_order_id
    WHERE pop.article_id = a.id
      AND po.status IN ('DRAFT', 'ORDERED', 'PARTIALLY_RECEIVED')
      AND po.tenant_id = a.tenant_id
  )
```

### 12.7 ORPHAN_RESERVATION
**Deferred** -- no reservation model exists yet (WH_10 not implemented).

---

## 13. Files to Create/Modify

### New Files:
1. `supabase/migrations/XXXXXX_wh_correction_tables.sql` -- Migration for WhCorrectionMessage, WhCorrectionRun
2. `src/lib/services/wh-correction-service.ts` -- Business logic (checks, message catalog)
3. `src/lib/services/wh-correction-repository.ts` -- Prisma data access
4. `src/trpc/routers/warehouse/corrections.ts` -- tRPC router
5. `src/hooks/use-wh-corrections.ts` -- React hooks
6. `src/app/api/cron/wh-corrections/route.ts` -- Daily cron handler
7. `src/app/[locale]/(dashboard)/warehouse/corrections/page.tsx` -- UI page
8. `src/components/warehouse/corrections/` -- UI components directory
   - `index.ts`
   - `wh-correction-data-table.tsx`
   - `wh-correction-filters.tsx`
   - `wh-correction-detail-sheet.tsx`
   - `wh-correction-message-table.tsx`
   - `wh-correction-message-edit-dialog.tsx`
   - `wh-correction-run-history.tsx`
   - `wh-correction-kpi-cards.tsx`
9. `src/trpc/routers/__tests__/whCorrections-router.test.ts` -- Tests

### Files to Modify:
1. `prisma/schema.prisma` -- Add WhCorrectionMessage, WhCorrectionRun models + Tenant relations
2. `src/lib/auth/permission-catalog.ts` -- Add 3 new permissions
3. `src/trpc/routers/warehouse/index.ts` -- Add corrections sub-router
4. `src/hooks/index.ts` -- Export correction hooks
5. `src/components/layout/sidebar/sidebar-nav-config.ts` -- Add nav item
6. `vercel.json` -- Add cron entry

---

## 14. Implementation Order

1. **Migration + Schema** -- Add DB tables, update Prisma schema, regenerate client
2. **Permissions** -- Add 3 permissions to catalog
3. **Repository** -- Pure Prisma data access functions
4. **Service** -- Detection checks, message catalog management, run tracking
5. **Router** -- tRPC procedures (list items, messages, trigger run, run history)
6. **Cron** -- Daily cron route
7. **Hooks** -- React query/mutation hooks
8. **UI** -- Components, page, navigation
9. **Tests** -- Router tests with mocked Prisma
