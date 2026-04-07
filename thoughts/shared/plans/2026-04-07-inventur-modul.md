---
title: Implementation Plan — Inventur-Modul (Stocktake Module)
date: 2026-04-07
status: ready
research: thoughts/shared/research/2026-04-07-inventur-modul.md
---

# Implementation Plan: Inventur-Modul (Stocktake Module)

## Overview

Add a full stocktake (Inventur) module to the Terp warehouse system. Users create a stocktake that freezes expected quantities (Sollbestand), count articles via mobile QR scanner or desktop UI, review differences (Soll vs Ist), then complete the stocktake which creates INVENTORY stock movements and adjusts article stock levels. A formal PDF protocol is generated on completion.

## Phase 1: Database Schema & Migration

**Dependencies**: None (foundation for all other phases)

### 1A. Prisma Schema — New Models

**File**: `prisma/schema.prisma` (append after line 4695, before HrPersonnelFileCategory)

Add enum and two new models:

```prisma
// -----------------------------------------------------------------------------
// WhStocktake (Inventur)
// -----------------------------------------------------------------------------
// Migration: 20260414100000
//
// Stocktake session. Freezes expected quantities at creation time.
// Workflow: DRAFT -> IN_PROGRESS -> COMPLETED | CANCELLED

enum WhStocktakeStatus {
  DRAFT
  IN_PROGRESS
  COMPLETED
  CANCELLED

  @@map("wh_stocktake_status")
}

model WhStocktake {
  id             String             @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId       String             @map("tenant_id") @db.Uuid
  number         String             @db.VarChar(50)
  name           String             @db.VarChar(255)
  description    String?            @db.Text
  status         WhStocktakeStatus  @default(DRAFT)
  referenceDate  DateTime           @default(now()) @map("reference_date") @db.Timestamptz(6)
  scope          String?            @db.VarChar(50)    // "ALL", "GROUP", "LOCATION", etc.
  scopeFilter    Json?              @map("scope_filter") @db.JsonB  // { groupId?, location?, articleIds? }
  notes          String?            @db.Text
  printedAt      DateTime?          @map("printed_at") @db.Timestamptz(6)
  completedAt    DateTime?          @map("completed_at") @db.Timestamptz(6)
  cancelledAt    DateTime?          @map("cancelled_at") @db.Timestamptz(6)
  createdAt      DateTime           @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt      DateTime           @updatedAt @map("updated_at") @db.Timestamptz(6)
  createdById    String?            @map("created_by_id") @db.Uuid
  completedById  String?            @map("completed_by_id") @db.Uuid

  tenant    Tenant                @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  positions WhStocktakePosition[]

  @@unique([tenantId, number], map: "uq_wh_stocktakes_tenant_number")
  @@index([tenantId, status])
  @@index([tenantId, referenceDate(sort: Desc)])
  @@map("wh_stocktakes")
}

model WhStocktakePosition {
  id               String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  stocktakeId      String    @map("stocktake_id") @db.Uuid
  articleId        String    @map("article_id") @db.Uuid
  articleNumber    String    @map("article_number") @db.VarChar(50)
  articleName      String    @map("article_name") @db.VarChar(255)
  unit             String    @db.VarChar(20)
  warehouseLocation String?  @map("warehouse_location") @db.VarChar(255)
  expectedQuantity Float     @map("expected_quantity")          // Frozen Sollbestand
  countedQuantity  Float?    @map("counted_quantity")           // Istbestand (NULL = not yet counted)
  difference       Float?                                       // Computed: counted - expected
  valueDifference  Float?    @map("value_difference")           // difference * buyPrice (if available)
  buyPrice         Float?    @map("buy_price")                  // Frozen buy price at snapshot time
  note             String?   @db.Text
  reviewed         Boolean   @default(false)
  skipped          Boolean   @default(false)
  skipReason       String?   @map("skip_reason") @db.Text
  countedById      String?   @map("counted_by_id") @db.Uuid
  countedAt        DateTime? @map("counted_at") @db.Timestamptz(6)
  createdAt        DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt        DateTime  @updatedAt @map("updated_at") @db.Timestamptz(6)

  stocktake WhStocktake @relation(fields: [stocktakeId], references: [id], onDelete: Cascade)

  @@unique([stocktakeId, articleId], map: "uq_wh_stocktake_positions_article")
  @@index([stocktakeId])
  @@index([articleId])
  @@map("wh_stocktake_positions")
}
```

Also add the `WhStocktake` relation to the `Tenant` model and the `WhStockMovement.stocktake` relation:

**File**: `prisma/schema.prisma` — Tenant model (add relation field):
```
stocktakes WhStocktake[]
```

**File**: `prisma/schema.prisma` — WhStockMovement model (add relation to stocktake):
```
stocktake WhStocktake? @relation(fields: [inventorySessionId], references: [id], onDelete: SetNull)
```
Then add `stockMovements WhStockMovement[]` to WhStocktake model.

### 1B. Supabase Migration — Tables

**File**: `supabase/migrations/20260414100000_create_wh_stocktake_tables.sql`

```sql
-- =============================================================
-- Create stocktake (Inventur) tables
-- Tables: wh_stocktakes, wh_stocktake_positions
-- =============================================================

-- Stocktake status enum
CREATE TYPE wh_stocktake_status AS ENUM ('DRAFT', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- wh_stocktakes: Main stocktake session header
CREATE TABLE wh_stocktakes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  number VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  status wh_stocktake_status NOT NULL DEFAULT 'DRAFT',
  reference_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  scope VARCHAR(50),
  scope_filter JSONB,
  notes TEXT,
  printed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_id UUID,
  completed_by_id UUID,
  UNIQUE(tenant_id, number)
);

CREATE INDEX idx_wh_stocktakes_tenant_status ON wh_stocktakes(tenant_id, status);
CREATE INDEX idx_wh_stocktakes_tenant_date ON wh_stocktakes(tenant_id, reference_date DESC);

-- wh_stocktake_positions: Per-article expected/counted quantities
CREATE TABLE wh_stocktake_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stocktake_id UUID NOT NULL REFERENCES wh_stocktakes(id) ON DELETE CASCADE,
  article_id UUID NOT NULL,
  article_number VARCHAR(50) NOT NULL,
  article_name VARCHAR(255) NOT NULL,
  unit VARCHAR(20) NOT NULL,
  warehouse_location VARCHAR(255),
  expected_quantity FLOAT NOT NULL,
  counted_quantity FLOAT,
  difference FLOAT,
  value_difference FLOAT,
  buy_price FLOAT,
  note TEXT,
  reviewed BOOLEAN NOT NULL DEFAULT false,
  skipped BOOLEAN NOT NULL DEFAULT false,
  skip_reason TEXT,
  counted_by_id UUID,
  counted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(stocktake_id, article_id)
);

CREATE INDEX idx_wh_stocktake_positions_stocktake ON wh_stocktake_positions(stocktake_id);
CREATE INDEX idx_wh_stocktake_positions_article ON wh_stocktake_positions(article_id);
```

### 1C. Supabase Migration — Permissions & Number Sequence

**File**: `supabase/migrations/20260414100001_add_wh_stocktake_permissions.sql`

```sql
-- =============================================================
-- Add stocktake permissions + number sequence
-- =============================================================

-- Add number sequence default prefix for stocktakes
INSERT INTO number_sequences (tenant_id, key, prefix, next_value)
SELECT t.id, 'stocktake', 'INV-', 1
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM number_sequences ns WHERE ns.tenant_id = t.id AND ns.key = 'stocktake'
);

-- Permission UUIDs (UUIDv5 with namespace f68a2ad7-6fd8-4d61-9b0e-0ea4a0d6c8a1):
--   wh_stocktake.view     = 4605f897-34e0-58f0-b458-667f5cd2cfe9
--   wh_stocktake.create   = 5253510c-4885-57ce-be62-2673e9a46ad3
--   wh_stocktake.count    = 90ec6dad-7406-54a2-b080-a904f276713e
--   wh_stocktake.complete = 5b3b5833-85db-5ae7-b9de-9fe18ea306b5
--   wh_stocktake.delete   = cc2d8846-5cd3-55a1-a566-3d9b921cceed

-- ADMIN: all 5 permissions
UPDATE user_groups SET permissions = (
  SELECT jsonb_agg(DISTINCT val) FROM (
    SELECT jsonb_array_elements(permissions) AS val
    UNION ALL SELECT '"4605f897-34e0-58f0-b458-667f5cd2cfe9"'::jsonb  -- wh_stocktake.view
    UNION ALL SELECT '"5253510c-4885-57ce-be62-2673e9a46ad3"'::jsonb  -- wh_stocktake.create
    UNION ALL SELECT '"90ec6dad-7406-54a2-b080-a904f276713e"'::jsonb  -- wh_stocktake.count
    UNION ALL SELECT '"5b3b5833-85db-5ae7-b9de-9fe18ea306b5"'::jsonb  -- wh_stocktake.complete
    UNION ALL SELECT '"cc2d8846-5cd3-55a1-a566-3d9b921cceed"'::jsonb  -- wh_stocktake.delete
  ) sub
) WHERE code = 'ADMIN' AND tenant_id IS NULL;

-- LAGER: view, create, count, complete
UPDATE user_groups SET permissions = (
  SELECT jsonb_agg(DISTINCT val) FROM (
    SELECT jsonb_array_elements(permissions) AS val
    UNION ALL SELECT '"4605f897-34e0-58f0-b458-667f5cd2cfe9"'::jsonb  -- wh_stocktake.view
    UNION ALL SELECT '"5253510c-4885-57ce-be62-2673e9a46ad3"'::jsonb  -- wh_stocktake.create
    UNION ALL SELECT '"90ec6dad-7406-54a2-b080-a904f276713e"'::jsonb  -- wh_stocktake.count
    UNION ALL SELECT '"5b3b5833-85db-5ae7-b9de-9fe18ea306b5"'::jsonb  -- wh_stocktake.complete
  ) sub
) WHERE code = 'LAGER' AND tenant_id IS NULL;

-- VORGESETZTER: view only
UPDATE user_groups SET permissions = (
  SELECT jsonb_agg(DISTINCT val) FROM (
    SELECT jsonb_array_elements(permissions) AS val
    UNION ALL SELECT '"4605f897-34e0-58f0-b458-667f5cd2cfe9"'::jsonb  -- wh_stocktake.view
  ) sub
) WHERE code = 'VORGESETZTER' AND tenant_id IS NULL;
```

### 1D. Number Sequence Default Prefix

**File**: `src/lib/services/number-sequence-service.ts`

Add to `DEFAULT_PREFIXES` map:
```typescript
// Warehouse stocktakes
stocktake: "INV-",
```

### 1E. Verification

- [ ] Run `pnpm db:reset` — migration applies cleanly
- [ ] Run `pnpm db:generate` — Prisma client regenerates with new types
- [ ] Run `pnpm typecheck` — no new type errors from schema changes


---

## Phase 2: Backend Services

**Dependencies**: Phase 1 (schema + migrations)

### 2A. Stocktake Repository

**File**: `src/lib/services/wh-stocktake-repository.ts` (NEW)

Pattern: follows `wh-stock-movement-repository.ts`

```typescript
import type { PrismaClient, Prisma } from "@/generated/prisma/client"

// --- Stocktake Queries ---

export async function findMany(
  prisma: PrismaClient,
  tenantId: string,
  params: {
    status?: string
    search?: string
    page: number
    pageSize: number
  }
): Promise<{ items: unknown[]; total: number }>

export async function findById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
): Promise<unknown | null>
// Include: positions with article summary, _count

export async function create(
  prisma: PrismaClient | Prisma.TransactionClient,
  data: {
    tenantId: string
    number: string
    name: string
    description?: string | null
    referenceDate?: Date
    scope?: string | null
    scopeFilter?: unknown
    notes?: string | null
    createdById?: string | null
  }
): Promise<unknown>

export async function updateStatus(
  prisma: PrismaClient | Prisma.TransactionClient,
  id: string,
  data: {
    status: string
    completedAt?: Date | null
    completedById?: string | null
    cancelledAt?: Date | null
    printedAt?: Date | null
  }
): Promise<unknown>

export async function remove(
  prisma: PrismaClient,
  tenantId: string,
  id: string
): Promise<void>

// --- Position Queries ---

export async function findPositions(
  prisma: PrismaClient,
  stocktakeId: string,
  params?: {
    search?: string
    uncountedOnly?: boolean
    differenceOnly?: boolean
    page?: number
    pageSize?: number
  }
): Promise<{ items: unknown[]; total: number }>

export async function findPositionByArticle(
  prisma: PrismaClient,
  stocktakeId: string,
  articleId: string
): Promise<unknown | null>

export async function createPositionsBulk(
  prisma: PrismaClient | Prisma.TransactionClient,
  positions: Array<{
    stocktakeId: string
    articleId: string
    articleNumber: string
    articleName: string
    unit: string
    warehouseLocation?: string | null
    expectedQuantity: number
    buyPrice?: number | null
  }>
): Promise<number>
// Uses prisma.whStocktakePosition.createMany

export async function updatePositionCount(
  prisma: PrismaClient | Prisma.TransactionClient,
  positionId: string,
  data: {
    countedQuantity: number
    difference: number
    valueDifference?: number | null
    countedById: string
    countedAt: Date
  }
): Promise<unknown>

export async function updatePositionReviewed(
  prisma: PrismaClient,
  positionId: string,
  reviewed: boolean
): Promise<unknown>

export async function skipPosition(
  prisma: PrismaClient,
  positionId: string,
  skipReason: string
): Promise<unknown>

export async function countPositionStats(
  prisma: PrismaClient,
  stocktakeId: string
): Promise<{ total: number; counted: number; skipped: number; reviewed: number }>
```

### 2B. Stocktake Service

**File**: `src/lib/services/wh-stocktake-service.ts` (NEW)

Pattern: follows `wh-stock-movement-service.ts` (error classes, service functions, audit logging)

```typescript
import type { PrismaClient } from "@/generated/prisma/client"
import * as repo from "./wh-stocktake-repository"
import * as stockMovementRepo from "./wh-stock-movement-repository"
import * as numberSeqService from "./number-sequence-service"
import * as auditLog from "./audit-logs-service"
import type { AuditContext } from "./audit-logs-service"

// --- Error Classes ---

export class WhStocktakeNotFoundError extends Error {
  constructor(message = "Stocktake not found") {
    super(message); this.name = "WhStocktakeNotFoundError"
  }
}

export class WhStocktakeValidationError extends Error {
  constructor(message: string) {
    super(message); this.name = "WhStocktakeValidationError"
  }
}

export class WhStocktakeConflictError extends Error {
  constructor(message: string) {
    super(message); this.name = "WhStocktakeConflictError"
  }
}
```

**Key service functions:**

#### `create(prisma, tenantId, input, userId, audit?)`
1. Generate number via `numberSeqService.getNextNumber(prisma, tenantId, "stocktake")`
2. Query articles matching scope filter (all with `stockTracking=true`, or filtered by groupId/location/articleIds from `scopeFilter`)
3. Validate at least 1 article matches
4. In `prisma.$transaction()`:
   a. Create `WhStocktake` header via `repo.create()`
   b. Snapshot each article's `currentStock` as `expectedQuantity`, `buyPrice`, `articleNumber`, `articleName`, `unit`, `warehouseLocation`
   c. Bulk insert positions via `repo.createPositionsBulk()`
5. Audit log: action "create", entityType "wh_stocktake"
6. Return the created stocktake with position count

#### `getById(prisma, tenantId, id)`
1. `repo.findById(prisma, tenantId, id)`
2. Throw `WhStocktakeNotFoundError` if null
3. Return with position stats (total/counted/skipped/reviewed)

#### `list(prisma, tenantId, params)`
1. Delegate to `repo.findMany(prisma, tenantId, params)`

#### `getPositions(prisma, tenantId, stocktakeId, params)`
1. Verify stocktake exists and belongs to tenant
2. `repo.findPositions(prisma, stocktakeId, params)`

#### `startCounting(prisma, tenantId, id, audit?)`
1. Fetch stocktake, verify status === "DRAFT"
2. Update status to "IN_PROGRESS" via `repo.updateStatus()`
3. Audit log

#### `recordCount(prisma, tenantId, input: { stocktakeId, articleId, countedQuantity, note? }, userId, audit?)`
1. Fetch stocktake, verify status === "IN_PROGRESS"
2. Find position by stocktakeId + articleId via `repo.findPositionByArticle()`
3. Calculate `difference = countedQuantity - expectedQuantity`
4. Calculate `valueDifference = difference * position.buyPrice` (if buyPrice available)
5. Update position via `repo.updatePositionCount()`
6. Audit log: action "count"

#### `reviewPosition(prisma, tenantId, positionId, reviewed, audit?)`
1. Verify position belongs to a stocktake owned by tenant
2. Update via `repo.updatePositionReviewed()`

#### `skipPosition(prisma, tenantId, positionId, skipReason, audit?)`
1. Verify position belongs to a stocktake owned by tenant in IN_PROGRESS status
2. Update via `repo.skipPosition()`

#### `complete(prisma, tenantId, id, userId, audit?)`
This is the critical function. Within a single `prisma.$transaction()`:

1. Fetch stocktake with all positions, verify status === "IN_PROGRESS"
2. Validate: all positions must be either counted (countedQuantity !== null) or skipped
3. For each counted position with `difference !== 0`:
   a. Fetch current article stock (`WhArticle.currentStock`)
   b. Calculate movement quantity = `position.countedQuantity - article.currentStock` (use live stock, not frozen expectedQuantity, to handle interim movements)
   c. Create `WhStockMovement` with:
      - type: "INVENTORY"
      - quantity: movement quantity
      - previousStock: article.currentStock
      - newStock: position.countedQuantity (the counted value becomes truth)
      - inventorySessionId: stocktake.id
      - createdById: userId
   d. Update `WhArticle.currentStock` to `position.countedQuantity`
4. Update stocktake status to "COMPLETED", set `completedAt`, `completedById`
5. Audit log: action "complete" with summary of adjustments

#### `cancel(prisma, tenantId, id, audit?)`
1. Verify status is DRAFT or IN_PROGRESS (not COMPLETED)
2. Update status to "CANCELLED", set `cancelledAt`
3. Audit log

#### `remove(prisma, tenantId, id, audit?)`
1. Verify status is DRAFT (only draft stocktakes can be deleted)
2. Delete via `repo.remove()` (CASCADE deletes positions)
3. Audit log

### 2C. Verification

- [ ] Run `pnpm typecheck` — service compiles
- [ ] Write unit test `src/lib/services/__tests__/wh-stocktake-service.test.ts` covering:
  - Create stocktake snapshots article stock
  - Record count calculates difference
  - Complete creates INVENTORY movements and adjusts stock
  - Complete fails if uncounted positions exist (that are not skipped)
  - Cannot complete a DRAFT stocktake (must be IN_PROGRESS)
  - Cannot delete a COMPLETED stocktake


---

## Phase 3: tRPC Router

**Dependencies**: Phase 2 (service)

### 3A. Stocktake Router

**File**: `src/trpc/routers/warehouse/stocktake.ts` (NEW)

Pattern: follows `src/trpc/routers/warehouse/stockMovements.ts`

```typescript
import { z } from "zod"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { handleServiceError } from "@/trpc/errors"
import { requirePermission } from "@/lib/auth/middleware"
import { requireModule } from "@/lib/modules"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import * as stocktakeService from "@/lib/services/wh-stocktake-service"
import type { PrismaClient } from "@/generated/prisma/client"

// --- Permission Constants ---
const WH_STOCKTAKE_VIEW = permissionIdByKey("wh_stocktake.view")!
const WH_STOCKTAKE_CREATE = permissionIdByKey("wh_stocktake.create")!
const WH_STOCKTAKE_COUNT = permissionIdByKey("wh_stocktake.count")!
const WH_STOCKTAKE_COMPLETE = permissionIdByKey("wh_stocktake.complete")!
const WH_STOCKTAKE_DELETE = permissionIdByKey("wh_stocktake.delete")!

const whProcedure = tenantProcedure.use(requireModule("warehouse"))
```

**Procedures:**

| Procedure | Permission | Type | Input |
|---|---|---|---|
| `list` | VIEW | query | `{ status?, search?, page, pageSize }` |
| `getById` | VIEW | query | `{ id: uuid }` |
| `getPositions` | VIEW | query | `{ stocktakeId: uuid, search?, uncountedOnly?, differenceOnly?, page?, pageSize? }` |
| `create` | CREATE | mutation | `{ name, description?, scope?, scopeFilter?, notes? }` |
| `startCounting` | CREATE | mutation | `{ id: uuid }` |
| `recordCount` | COUNT | mutation | `{ stocktakeId: uuid, articleId: uuid, countedQuantity: number, note? }` |
| `reviewPosition` | COMPLETE | mutation | `{ positionId: uuid, reviewed: boolean }` |
| `skipPosition` | COUNT | mutation | `{ positionId: uuid, skipReason: string }` |
| `complete` | COMPLETE | mutation | `{ id: uuid }` |
| `cancel` | COMPLETE | mutation | `{ id: uuid }` |
| `remove` | DELETE | mutation | `{ id: uuid }` |
| `getPositionByArticle` | COUNT | query | `{ stocktakeId: uuid, articleId: uuid }` |
| `getStats` | VIEW | query | `{ stocktakeId: uuid }` |
| `generatePdf` | COMPLETE | mutation | `{ id: uuid }` |

Each procedure follows the standard pattern:
```typescript
.mutation(async ({ ctx, input }) => {
  try {
    const audit = { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
    return await stocktakeService.someMethod(
      ctx.prisma as unknown as PrismaClient,
      ctx.tenantId!,
      input,
      ctx.user!.id,
      audit
    )
  } catch (err) { handleServiceError(err) }
})
```

### 3B. Register in Warehouse Router

**File**: `src/trpc/routers/warehouse/index.ts` (MODIFY)

Add import and registration:
```typescript
import { whStocktakeRouter } from "./stocktake"

export const warehouseRouter = createTRPCRouter({
  // ... existing sub-routers
  stocktake: whStocktakeRouter,
})
```

### 3C. Verification

- [ ] `pnpm typecheck` — router compiles
- [ ] API endpoint test: create stocktake, record counts, complete


---

## Phase 4: Permissions

**Dependencies**: Phase 1C (migration already adds UUIDs to groups)

### 4A. Permission Catalog

**File**: `src/lib/auth/permission-catalog.ts` (MODIFY)

Add after the `wh_qr` permissions (around line 313):

```typescript
// Warehouse Stocktake
p("wh_stocktake.view", "wh_stocktake", "view", "View stocktake sessions"),
p("wh_stocktake.create", "wh_stocktake", "create", "Create stocktake sessions"),
p("wh_stocktake.count", "wh_stocktake", "count", "Record counted quantities in stocktake"),
p("wh_stocktake.complete", "wh_stocktake", "complete", "Complete/finalize stocktake and adjust stock"),
p("wh_stocktake.delete", "wh_stocktake", "delete", "Delete draft stocktakes"),
```

### 4B. Seed SQL

**File**: `supabase/seed.sql` (MODIFY)

Ensure the default admin/warehouse groups include the new permission UUIDs. The migration in 1C handles this for existing tenants. The seed.sql needs the UUIDs added to the initial user_groups INSERT for new installations.

### 4C. Verification

- [ ] Run node script to verify UUIDs match: `node -e "const {v5}=require('uuid'); const NS='f68a2ad7-6fd8-4d61-9b0e-0ea4a0d6c8a1'; console.log(v5('wh_stocktake.view',NS))"`
  Expected: `4605f897-34e0-58f0-b458-667f5cd2cfe9`
- [ ] `pnpm typecheck`


---

## Phase 5: React Hooks

**Dependencies**: Phase 3 (tRPC router)

### 5A. Stocktake Hook File

**File**: `src/hooks/use-wh-stocktake.ts` (NEW)

Pattern: follows `src/hooks/use-wh-stock-movements.ts` and `src/hooks/use-wh-articles.ts`

```typescript
import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

// ==================== Query Hooks ====================

export function useWhStocktakes(options?: {
  status?: "DRAFT" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED"
  search?: string
  page?: number
  pageSize?: number
}, enabled = true)

export function useWhStocktake(id: string, enabled = true)

export function useWhStocktakePositions(stocktakeId: string, options?: {
  search?: string
  uncountedOnly?: boolean
  differenceOnly?: boolean
  page?: number
  pageSize?: number
}, enabled = true)

export function useWhStocktakePositionByArticle(
  stocktakeId: string,
  articleId: string,
  enabled = true
)

export function useWhStocktakeStats(stocktakeId: string, enabled = true)

// ==================== Mutation Hooks ====================

export function useCreateWhStocktake()
// Invalidates: stocktake.list

export function useStartStocktakeCounting()
// Invalidates: stocktake.list, stocktake.getById

export function useRecordStocktakeCount()
// Invalidates: stocktake.getById, stocktake.getPositions, stocktake.getStats, stocktake.getPositionByArticle

export function useReviewStocktakePosition()
// Invalidates: stocktake.getPositions

export function useSkipStocktakePosition()
// Invalidates: stocktake.getPositions, stocktake.getStats

export function useCompleteStocktake()
// Invalidates: stocktake.list, stocktake.getById, articles.list (stock changed), stockMovements (new INVENTORY movements)

export function useCancelStocktake()
// Invalidates: stocktake.list, stocktake.getById

export function useDeleteStocktake()
// Invalidates: stocktake.list

export function useGenerateStocktakePdf()
// Returns: { signedUrl, filename }
```

### 5B. Register in Hooks Index

**File**: `src/hooks/index.ts` (MODIFY)

Add after "Warehouse Reservations" block (around line 945):

```typescript
// Warehouse Stocktake
export {
  useWhStocktakes,
  useWhStocktake,
  useWhStocktakePositions,
  useWhStocktakePositionByArticle,
  useWhStocktakeStats,
  useCreateWhStocktake,
  useStartStocktakeCounting,
  useRecordStocktakeCount,
  useReviewStocktakePosition,
  useSkipStocktakePosition,
  useCompleteStocktake,
  useCancelStocktake,
  useDeleteStocktake,
  useGenerateStocktakePdf,
} from './use-wh-stocktake'
```

### 5C. Verification

- [ ] `pnpm typecheck`


---

## Phase 6: UI — List & Detail Pages

**Dependencies**: Phase 5 (hooks)

### 6A. Sidebar Navigation

**File**: `src/components/layout/sidebar/sidebar-nav-config.ts` (MODIFY)

Add to `warehouseSection` items array, after `warehouseReservations` (line ~480):

```typescript
{
  titleKey: 'warehouseStocktake',
  href: '/warehouse/stocktake',
  icon: ClipboardList,  // Already imported
  module: 'warehouse',
  permissions: ['wh_stocktake.view'],
},
```

### 6B. Translations

**File**: `messages/de.json` (MODIFY)

Add `warehouseStocktake` namespace:
```json
"nav": {
  "warehouseStocktake": "Inventur"
},
"warehouseStocktake": {
  "pageTitle": "Inventur",
  "createStocktake": "Neue Inventur",
  "number": "Inventur-Nr.",
  "name": "Bezeichnung",
  "status": "Status",
  "referenceDate": "Stichtag",
  "scope": "Umfang",
  "description": "Beschreibung",
  "notes": "Anmerkungen",
  "createdAt": "Erstellt am",
  "completedAt": "Abgeschlossen am",
  "positions": "Positionen",
  "counted": "Gezahlt",
  "uncounted": "Offen",
  "skipped": "Uebersprungen",
  "reviewed": "Geprueft",
  "statusDraft": "Entwurf",
  "statusInProgress": "Zaehlung laeuft",
  "statusCompleted": "Abgeschlossen",
  "statusCancelled": "Abgebrochen",
  "expectedQuantity": "Sollbestand",
  "countedQuantity": "Istbestand",
  "difference": "Differenz",
  "valueDifference": "Wertdifferenz",
  "article": "Artikel",
  "articleNumber": "Art.-Nr.",
  "location": "Lagerort",
  "unit": "Einheit",
  "buyPrice": "EK-Preis",
  "note": "Notiz",
  "startCounting": "Zaehlung starten",
  "complete": "Inventur abschliessen",
  "cancel": "Inventur abbrechen",
  "delete": "Inventur loeschen",
  "downloadPdf": "Protokoll herunterladen",
  "generatePdf": "Protokoll erstellen",
  "reviewAll": "Alle pruefen",
  "filterUncounted": "Nur offene",
  "filterDifferences": "Nur Differenzen",
  "scopeAll": "Alle Lagerartikel",
  "scopeGroup": "Artikelgruppe",
  "scopeLocation": "Lagerort",
  "noPositions": "Keine Positionen",
  "confirmComplete": "Inventur wirklich abschliessen? Die Bestaende werden unwiderruflich angepasst.",
  "confirmCancel": "Inventur wirklich abbrechen? Gezaehlte Daten bleiben erhalten, aber es werden keine Bestandsaenderungen durchgefuehrt.",
  "confirmDelete": "Inventur wirklich loeschen?",
  "toastCreated": "Inventur erstellt",
  "toastCompleted": "Inventur abgeschlossen — Bestaende angepasst",
  "toastCancelled": "Inventur abgebrochen",
  "toastDeleted": "Inventur geloescht",
  "toastCounted": "Zaehlung gespeichert",
  "enterCountedQuantity": "Gezaehlte Menge eingeben",
  "skipReason": "Grund fuer Auslassung",
  "totalDifference": "Gesamtdifferenz",
  "totalValueDifference": "Wertdifferenz gesamt",
  "articlesWithDifference": "Artikel mit Differenz",
  "summary": "Zusammenfassung",
  "scanToCount": "Artikel scannen zum Zaehlen"
}
```

**File**: `messages/en.json` (MODIFY) — English equivalents.

### 6C. Stocktake List Page

**File**: `src/app/[locale]/(dashboard)/warehouse/stocktake/page.tsx` (NEW)

Pattern: follows `src/app/[locale]/(dashboard)/warehouse/articles/page.tsx`

```typescript
'use client'

export default function WhStocktakePage() {
  // Permission check: useHasPermission(['wh_stocktake.view'])
  // State: page, search, status filter
  // Data: useWhStocktakes({ page, search, status })
  // Layout:
  //   Header: title + "Neue Inventur" button (if wh_stocktake.create)
  //   Toolbar: SearchInput + status filter dropdown
  //   DataTable with columns:
  //     - number (link to detail)
  //     - name
  //     - status (colored badge)
  //     - referenceDate (formatted de-DE)
  //     - positions count (progress: counted/total)
  //     - createdAt
  //   Pagination
  //   CreateStocktakeSheet (conditional)
}
```

Key columns in the table:
| Column | Description |
|---|---|
| Inventur-Nr. | Link to `/warehouse/stocktake/[id]` |
| Bezeichnung | Name |
| Status | Badge: DRAFT=gray, IN_PROGRESS=blue, COMPLETED=green, CANCELLED=red |
| Stichtag | Reference date formatted |
| Fortschritt | `counted/total` positions as progress text |
| Erstellt | Created timestamp |

### 6D. Stocktake Detail Page

**File**: `src/app/[locale]/(dashboard)/warehouse/stocktake/[id]/page.tsx` (NEW)

This is the main working page for a stocktake. Layout:

```
Header:
  Back button | INV-X Name | Status badge
  Action buttons: Start Counting | Complete | Cancel | Download PDF

Summary Cards (4-column grid):
  Total Positions | Counted | Differences | Value Difference

Position Table:
  Toolbar: SearchInput + "Nur offene" toggle + "Nur Differenzen" toggle
  DataTable columns:
    - Art.-Nr.
    - Artikelname
    - Lagerort
    - Sollbestand (expectedQuantity)
    - Istbestand (countedQuantity — editable inline for IN_PROGRESS)
    - Differenz (colored: green=0, red=nonzero)
    - Wertdifferenz
    - Status (counted/uncounted/skipped badge)
    - Geprueft (checkbox, for COMPLETED review)
    - Actions (note, skip)
  Pagination

Count Entry:
  When IN_PROGRESS: clicking a row or inline edit allows entering countedQuantity
  Quick-count sheet for mobile: open sheet with large number input
```

**Components to create:**

1. **`src/components/warehouse/stocktake-form-sheet.tsx`** (NEW) — Sheet for creating a new stocktake
   - Fields: name, description (optional), scope dropdown (All / Group / Location), scope filter (group picker or location text), notes
   - Uses `useCreateWhStocktake` mutation
   - Pattern: follows existing form sheets in the codebase

2. **`src/components/warehouse/stocktake-detail.tsx`** (NEW) — Main detail view component
   - Receives stocktake data as props
   - Renders summary cards + position table
   - Handles inline count editing
   - Action buttons based on status

3. **`src/components/warehouse/stocktake-position-table.tsx`** (NEW) — Position data table
   - Columns as described above
   - Inline count editing for IN_PROGRESS status
   - Review checkbox for review mode
   - Status-aware rendering

4. **`src/components/warehouse/stocktake-count-sheet.tsx`** (NEW) — Mobile-friendly count entry
   - Large number input (h-14 text-2xl, like scanner terminal)
   - Article info display
   - Optional note field
   - Submit button

### 6E. Verification

- [ ] Navigate to `/warehouse/stocktake` — list page renders
- [ ] Create a stocktake — positions are generated from stock-tracked articles
- [ ] Navigate to detail page — positions table renders
- [ ] Start counting → record counts → differences calculated
- [ ] Complete stocktake → stock adjusted, status changes


---

## Phase 7: QR Scanner Extension

**Dependencies**: Phase 5 (hooks), Phase 3 (router — recordCount procedure)

### 7A. Enable INVENTORY Card

**File**: `src/components/warehouse/scanner-terminal.tsx` (MODIFY)

**Change 1**: Enable the INVENTORY card (currently disabled, lines 358-366).

Replace:
```tsx
<Card className="cursor-not-allowed opacity-50">
  <CardContent className="flex flex-col items-center gap-2 p-4">
    <ClipboardList className="h-8 w-8 text-blue-600" />
    <span className="text-sm font-medium">{t('actionInventory')}</span>
    <span className="text-xs text-muted-foreground">{t('inventoryNotAvailable')}</span>
  </CardContent>
</Card>
```

With:
```tsx
<Card
  className="cursor-pointer transition-colors hover:bg-blue-50 dark:hover:bg-blue-950/20"
  onClick={() => setState('INVENTORY')}
>
  <CardContent className="flex flex-col items-center gap-2 p-4">
    <ClipboardList className="h-8 w-8 text-blue-600" />
    <span className="text-sm font-medium">{t('actionInventory')}</span>
  </CardContent>
</Card>
```

**Change 2**: Add state and hooks for inventory counting.

New state variables:
```typescript
// Inventory state
const [selectedStocktakeId, setSelectedStocktakeId] = React.useState<string | null>(null)
const [invQuantity, setInvQuantity] = React.useState<string>('')
const [invNote, setInvNote] = React.useState('')
```

New hooks:
```typescript
import { useWhStocktakes, useRecordStocktakeCount } from '@/hooks'

// Query: active stocktakes (IN_PROGRESS)
const { data: activeStocktakes } = useQuery(
  trpc.warehouse.stocktake.list.queryOptions(
    { status: 'IN_PROGRESS', page: 1, pageSize: 50 },
    { enabled: !!article && state === 'INVENTORY' }
  )
)

// Query: position for this article in selected stocktake
const { data: stocktakePosition } = useQuery(
  trpc.warehouse.stocktake.getPositionByArticle.queryOptions(
    { stocktakeId: selectedStocktakeId ?? '', articleId: article?.id ?? '' },
    { enabled: !!selectedStocktakeId && !!article && state === 'INVENTORY' }
  )
)

const recordCount = useRecordStocktakeCount()
```

**Change 3**: Add INVENTORY state rendering block.

```tsx
{/* State: INVENTORY -- Select stocktake + enter counted quantity */}
{state === 'INVENTORY' && article && (
  <Card>
    <CardHeader>
      <CardTitle className="text-lg">{t('actionInventory')}</CardTitle>
    </CardHeader>
    <CardContent className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {article.number} - {article.name}
      </p>

      {/* Stocktake selection */}
      {!selectedStocktakeId && (
        <div>
          <label className="mb-2 block text-sm font-medium">{t('selectStocktake')}</label>
          {!activeStocktakes?.items?.length ? (
            <p className="text-sm text-muted-foreground">{t('noActiveStocktakes')}</p>
          ) : (
            <div className="space-y-2">
              {activeStocktakes.items.map((st) => (
                <Card key={st.id} className="cursor-pointer p-3 hover:bg-muted/50"
                  onClick={() => setSelectedStocktakeId(st.id)}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{st.number}</p>
                      <p className="text-sm text-muted-foreground">{st.name}</p>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Count entry (no Sollbestand shown — blind count) */}
      {selectedStocktakeId && (
        <>
          <div>
            <label className="mb-2 block text-sm font-medium">{t('countedQuantity')}</label>
            <Input
              type="number" inputMode="decimal"
              value={invQuantity}
              onChange={(e) => setInvQuantity(e.target.value)}
              className="h-14 text-2xl text-center"
              min={0} step="any" autoFocus
            />
          </div>
          <Input placeholder={t('noteOptional')} value={invNote}
            onChange={(e) => setInvNote(e.target.value)} />
          <Button className="h-14 w-full text-lg"
            onClick={handleRecordInventoryCount}
            disabled={!invQuantity || recordCount.isPending}>
            {recordCount.isPending ? '...' : t('confirm')}
          </Button>
        </>
      )}

      <Button variant="ghost" className="w-full" onClick={() => {
        setSelectedStocktakeId(null)
        setState('SCANNED')
      }}>{t('back')}</Button>
    </CardContent>
  </Card>
)}
```

**Change 4**: Add handler function.

```typescript
const handleRecordInventoryCount = React.useCallback(async () => {
  if (!selectedStocktakeId || !article || !invQuantity) return
  try {
    await recordCount.mutateAsync({
      stocktakeId: selectedStocktakeId,
      articleId: article.id,
      countedQuantity: parseFloat(invQuantity),
      note: invNote || undefined,
    })
    setState('BOOKED')
    toast.success(t('inventoryCounted'))
    const updated = addHistoryEntry({
      timestamp: new Date().toISOString(),
      articleNumber: article.number,
      articleName: article.name,
      action: 'inventory',
      quantity: parseFloat(invQuantity),
      success: true,
    })
    setHistory(updated)
    navigator.vibrate?.(200)
    setTimeout(resetToIdle, 3000)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Fehler'
    toast.error(message)
  }
}, [selectedStocktakeId, article, invQuantity, invNote, recordCount, t, resetToIdle])
```

**Change 5**: Update `resetToIdle` to clear inventory state:
```typescript
setSelectedStocktakeId(null)
setInvQuantity('')
setInvNote('')
```

### 7B. Scanner Translations

Add to `messages/de.json` under `warehouseScanner`:
```json
"selectStocktake": "Inventur auswaehlen",
"noActiveStocktakes": "Keine aktive Inventur vorhanden",
"countedQuantity": "Gezaehlte Menge",
"noteOptional": "Notiz (optional)",
"inventoryCounted": "Zaehlung gespeichert"
```

### 7C. Verification

- [ ] Scan article → Inventory card is enabled and clickable
- [ ] Shows active (IN_PROGRESS) stocktakes
- [ ] Selecting a stocktake shows count input (no Sollbestand visible)
- [ ] Submitting count records it and shows success
- [ ] History entry shows action "inventory"


---

## Phase 8: PDF Generation

**Dependencies**: Phase 2 (service), Phase 3 (router — generatePdf procedure)

### 8A. PDF Component

**File**: `src/lib/pdf/stocktake-protocol-pdf.tsx` (NEW)

Pattern: follows `src/lib/pdf/purchase-order-pdf.tsx`

```typescript
import React from "react"
import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer"
import { FusszeilePdf } from "./fusszeile-pdf"

const MM = 2.835

export interface StocktakeProtocolPdfProps {
  stocktake: {
    number: string
    name: string
    referenceDate: Date | string
    completedAt: Date | string | null
    notes: string | null
    createdBy?: string | null  // user name
    completedBy?: string | null  // user name
  }
  positions: Array<{
    articleNumber: string
    articleName: string
    unit: string
    warehouseLocation: string | null
    expectedQuantity: number
    countedQuantity: number | null
    difference: number | null
    valueDifference: number | null
    skipped: boolean
    skipReason: string | null
    note: string | null
  }>
  summary: {
    totalPositions: number
    countedPositions: number
    skippedPositions: number
    positionsWithDifference: number
    totalDifference: number
    totalValueDifference: number
  }
  tenantConfig: unknown
}
```

**PDF layout (A4 portrait):**

1. **Header**: Company name (from tenantConfig), "Inventurprotokoll" title
2. **Meta block**: Inventur-Nr., Bezeichnung, Stichtag, Abgeschlossen am, Erstellt von, Abgeschlossen von
3. **Summary block**: Total positions, counted, skipped, with difference, total value difference
4. **Position table**: Article-Nr. | Bezeichnung | Einheit | Lagerort | Soll | Ist | Differenz | Wertdiff. | Bemerkung
5. **Footer block**: Two signature lines (Erstellt von / Geprueft von) with date fields
6. **Page footer**: FusszeilePdf (company details)

### 8B. PDF Service

**File**: `src/lib/services/wh-stocktake-pdf-service.ts` (NEW)

Pattern: follows `src/lib/services/wh-purchase-order-pdf-service.ts`

```typescript
import type { PrismaClient } from "@/generated/prisma/client"
import { renderToBuffer } from "@react-pdf/renderer"
import * as storage from "@/lib/supabase/storage"
import * as stocktakeService from "./wh-stocktake-service"
import * as billingTenantConfigRepo from "./billing-tenant-config-repository"
import React from "react"
import { StocktakeProtocolPdf } from "@/lib/pdf/stocktake-protocol-pdf"

const BUCKET = "documents"
const SIGNED_URL_EXPIRY_SECONDS = 300

export async function generateAndGetDownloadUrl(
  prisma: PrismaClient,
  tenantId: string,
  stocktakeId: string
): Promise<{ signedUrl: string; filename: string }>
```

Implementation:
1. Load stocktake with all positions via `stocktakeService.getById`
2. Verify status is COMPLETED (only completed stocktakes get a protocol)
3. Load tenant config for letterhead
4. Compute summary (totalPositions, counted, skipped, differences, value sums)
5. `React.createElement(StocktakeProtocolPdf, { ... })`
6. `renderToBuffer(pdfElement)`
7. Upload to `inventur/{INV-number}.pdf` in Supabase Storage
8. Set `printedAt` on stocktake
9. Create signed URL
10. Return `{ signedUrl, filename: "INV-X.pdf" }`

### 8C. Wire PDF to Router

The `generatePdf` procedure in the stocktake router (Phase 3) calls `pdfService.generateAndGetDownloadUrl()`.

### 8D. Verification

- [ ] Complete a stocktake → generate PDF → download via signed URL
- [ ] PDF contains all positions with Soll/Ist/Differenz
- [ ] PDF has signature lines
- [ ] PDF header shows company info


---

## Phase 9: Integration & Verification

**Dependencies**: All previous phases

### 9A. Unit Tests

**File**: `src/lib/services/__tests__/wh-stocktake-service.test.ts` (NEW)

Test cases:
1. **Create stocktake**: Verifies articles with `stockTracking=true` are snapshotted with correct `expectedQuantity`
2. **Scope filter**: Only includes articles matching groupId/location
3. **Record count**: Sets `countedQuantity`, calculates `difference` and `valueDifference`
4. **Record count — update**: Re-counting updates existing position
5. **Complete — creates movements**: Each position with difference gets an INVENTORY movement
6. **Complete — adjusts stock**: `WhArticle.currentStock` updated to countedQuantity
7. **Complete — fails with uncounted**: Throws validation error if any position is neither counted nor skipped
8. **Complete — skipped positions**: Skipped positions are excluded from stock adjustments
9. **Cancel**: Sets status to CANCELLED, no stock changes
10. **Delete**: Only works for DRAFT status, fails for IN_PROGRESS/COMPLETED

### 9B. Integration Test

**File**: `src/lib/services/__tests__/wh-stocktake-service.integration.test.ts` (NEW)

Full workflow test against the dev database:
1. Create test articles with stock
2. Create stocktake → verify positions match articles
3. Start counting → record counts for all positions
4. Complete → verify INVENTORY movements created + stock adjusted
5. Generate PDF → verify URL returned
6. Cleanup

### 9C. E2E Considerations

**File**: `src/e2e-browser/52-stocktake.spec.ts` (NEW, future)

Manual verification checklist for E2E:
- [ ] Navigate to /warehouse/stocktake
- [ ] Create stocktake with scope "All"
- [ ] Verify positions listed with frozen Sollbestand
- [ ] Start counting
- [ ] Enter counts for some positions via detail page
- [ ] Enter counts for some positions via QR scanner (INVENTORY mode)
- [ ] Skip remaining positions with reason
- [ ] Review differences
- [ ] Complete stocktake
- [ ] Verify stock movements created (type INVENTORY) in stock movements list
- [ ] Verify article stock levels updated
- [ ] Download PDF protocol
- [ ] Verify PDF contains all data

### 9D. Manual Verification Checklist

- [ ] `pnpm db:reset` — clean database with new tables
- [ ] `pnpm typecheck` — no new type errors
- [ ] `pnpm test` — all tests pass
- [ ] `pnpm lint` — no lint errors
- [ ] `pnpm build` — production build succeeds
- [ ] Create stocktake with 3+ articles
- [ ] Count articles via detail page
- [ ] Count articles via QR scanner
- [ ] Complete stocktake and verify stock adjusted
- [ ] Download PDF and verify content
- [ ] Cancel a different stocktake and verify no stock changes
- [ ] Delete a draft stocktake
- [ ] Permission checks: user without `wh_stocktake.count` cannot record counts


---

## File Summary

### New Files (16)
| File | Phase | Description |
|---|---|---|
| `supabase/migrations/20260414100000_create_wh_stocktake_tables.sql` | 1B | Database tables |
| `supabase/migrations/20260414100001_add_wh_stocktake_permissions.sql` | 1C | Permissions + number sequence |
| `src/lib/services/wh-stocktake-repository.ts` | 2A | Prisma repository |
| `src/lib/services/wh-stocktake-service.ts` | 2B | Business logic service |
| `src/trpc/routers/warehouse/stocktake.ts` | 3A | tRPC router |
| `src/hooks/use-wh-stocktake.ts` | 5A | React hooks |
| `src/app/[locale]/(dashboard)/warehouse/stocktake/page.tsx` | 6C | List page |
| `src/app/[locale]/(dashboard)/warehouse/stocktake/[id]/page.tsx` | 6D | Detail page |
| `src/components/warehouse/stocktake-form-sheet.tsx` | 6D | Create form sheet |
| `src/components/warehouse/stocktake-detail.tsx` | 6D | Detail view component |
| `src/components/warehouse/stocktake-position-table.tsx` | 6D | Position data table |
| `src/components/warehouse/stocktake-count-sheet.tsx` | 6D | Mobile count entry sheet |
| `src/lib/pdf/stocktake-protocol-pdf.tsx` | 8A | PDF React component |
| `src/lib/services/wh-stocktake-pdf-service.ts` | 8B | PDF generation service |
| `src/lib/services/__tests__/wh-stocktake-service.test.ts` | 9A | Unit tests |
| `src/lib/services/__tests__/wh-stocktake-service.integration.test.ts` | 9B | Integration tests |

### Modified Files (10)
| File | Phase | Change |
|---|---|---|
| `prisma/schema.prisma` | 1A | Add WhStocktake, WhStocktakePosition models + enum + relations |
| `src/lib/services/number-sequence-service.ts` | 1D | Add `stocktake: "INV-"` to DEFAULT_PREFIXES |
| `src/lib/auth/permission-catalog.ts` | 4A | Add 5 stocktake permissions |
| `supabase/seed.sql` | 4B | Add stocktake permission UUIDs to initial groups |
| `src/trpc/routers/warehouse/index.ts` | 3B | Register stocktake sub-router |
| `src/hooks/index.ts` | 5B | Export stocktake hooks |
| `src/components/layout/sidebar/sidebar-nav-config.ts` | 6A | Add stocktake nav item |
| `messages/de.json` | 6B | Add warehouseStocktake translations |
| `messages/en.json` | 6B | Add warehouseStocktake translations |
| `src/components/warehouse/scanner-terminal.tsx` | 7A | Enable INVENTORY mode with count flow |

### Implementation Order

```
Phase 1 (Schema + Migration)
  ├── Phase 2 (Backend Services)
  │     └── Phase 3 (tRPC Router)
  │           └── Phase 5 (React Hooks)
  │                 ├── Phase 6 (UI Pages)
  │                 └── Phase 7 (QR Scanner)
  ├── Phase 4 (Permissions) — parallel with Phase 2
  └── Phase 8 (PDF) — after Phase 2
Phase 9 (Integration & Verification) — after all
```

Estimated implementation effort: Phases 1-4 can be done in ~2 hours. Phase 5-6 in ~3 hours. Phase 7-8 in ~2 hours. Phase 9 in ~1 hour. Total: ~8 hours.
