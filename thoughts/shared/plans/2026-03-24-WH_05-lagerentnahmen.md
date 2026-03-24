# WH_05 Lagerentnahmen (Stock Withdrawals) Implementation Plan

## Overview

Implement stock withdrawals (Lagerentnahmen) for the warehouse module. Articles are withdrawn from inventory by reference to a Terp order, a delivery note, or a machine/equipment ID. Withdrawals create stock movements of type `WITHDRAWAL` with negative quantity. Supports batch withdrawal and cancellation (reversal). No new Prisma models needed — extends the existing `WhStockMovement` model with a new `machineId` field.

## Current State Analysis

### What exists:
- `WhStockMovement` model with `type` enum including `WITHDRAWAL` (already defined)
- Fields `orderId` and `documentId` already exist on `WhStockMovement` for order/document references
- Full goods receipt flow implemented (WH_04): service, repository, router, hooks, UI terminal, tests
- Permission keys `wh_stock.view` and `wh_stock.manage` already registered in `src/lib/auth/permission-catalog.ts` (lines 290-291)
- i18n namespace `warehouseStockMovements` already includes `typeWithdrawal` key
- Warehouse router at `src/trpc/routers/warehouse/index.ts` merges `articles`, `articlePrices`, `purchaseOrders`, `stockMovements`

### What's missing:
- `machineId` field on `WhStockMovement` (for equipment/machine reference)
- Withdrawal-specific service functions (create, createBatch, cancel, list)
- Withdrawal router (`src/trpc/routers/warehouse/withdrawals.ts`)
- Frontend hooks, UI components, page route
- Navigation item in sidebar
- i18n namespace `warehouseWithdrawals`
- All tests (service, router, E2E browser)

### Key Discoveries:
- `wh-stock-movement-repository.ts:80-127` — `create()` function already supports all needed fields but needs `machineId` added
- `wh-stock-movement-service.ts:85-230` — `bookGoodsReceipt` is the canonical transaction pattern for stock movements
- `wh-article-service.ts:312-340` — `adjustStock` shows the simpler single-article stock movement pattern
- `src/trpc/routers/warehouse/stockMovements.ts:1-173` — Sub-router pattern with `whProcedure`, permission guards, audit context
- `src/e2e-browser/43-wh-goods-receipt.spec.ts` — E2E pattern with `navigateTo`, `describe.serial`, page assertions
- `src/e2e-browser/global-setup.ts:112-138` — Warehouse cleanup SQL (must add withdrawal-specific cleanup)
- Latest migration: `20260325120000_add_module_permissions_to_groups.sql`

## Desired End State

After implementation:
1. Users can withdraw articles from stock via a terminal-style UI at `/warehouse/withdrawals`
2. Each withdrawal creates a `WhStockMovement` with `type=WITHDRAWAL` and negative quantity
3. Withdrawals can reference an order (orderId), delivery note (documentId), machine (machineId), or none
4. Batch withdrawals process multiple articles in a single transaction
5. Cancellation creates a positive reversal movement restoring stock
6. History table with filters by reference type, date range
7. Full tenant isolation with dedicated test coverage
8. E2E browser tests covering navigation, withdrawal, cancellation, and history

### Verification:
- `pnpm typecheck` passes
- `pnpm vitest run src/lib/services/__tests__/wh-withdrawal-service.test.ts` passes
- `pnpm vitest run src/trpc/routers/__tests__/whWithdrawals-router.test.ts` passes
- `pnpm playwright test src/e2e-browser/44-wh-withdrawals.spec.ts` passes
- Manual: Navigate to `/warehouse/withdrawals`, perform withdrawal, verify stock decreased, cancel, verify stock restored

## What We're NOT Doing

- **ORD_01 Integration**: Auto-withdrawal on delivery note print is out of scope (ticket mentions it as configurable per tenant — deferred)
- **Terp Order "Materials" tab**: The order detail materials tab integration is deferred to a separate ticket
- **Stock warnings/alerts**: Low stock warnings after withdrawal are informational only (no blocking)
- **Barcode/scanner integration**: Terminal-style UI supports manual article search only

## Implementation Approach

Follow the existing WH_04 pattern exactly: migration -> service+repository -> router -> tests -> i18n -> hooks -> UI -> page -> nav -> E2E tests. Each phase is independently verifiable.

---

## Phase 1: Database Migration

### Overview
Add `machineId` column to `wh_stock_movements` table and update Prisma schema.

### Changes Required:

#### 1. Supabase Migration
**File**: `supabase/migrations/20260326100000_wh_stock_movement_machine_id.sql`
**Changes**: Add `machine_id` column

```sql
-- WH_05: Add machine_id column for equipment/machine withdrawal references
ALTER TABLE wh_stock_movements ADD COLUMN machine_id TEXT;

-- Index for machine_id queries (tenant-scoped)
CREATE INDEX idx_wh_stock_movements_tenant_machine ON wh_stock_movements (tenant_id, machine_id) WHERE machine_id IS NOT NULL;
```

#### 2. Prisma Schema
**File**: `prisma/schema.prisma` (line ~4375, after `inventorySessionId`)
**Changes**: Add `machineId` field to `WhStockMovement` model

```prisma
  machineId                String?             @map("machine_id")
```

Also add the index:
```prisma
  @@index([tenantId, machineId])
```

#### 3. Update Stock Movement Repository
**File**: `src/lib/services/wh-stock-movement-repository.ts`
**Changes**: Add `machineId` to the `create()` function's data parameter type and data assignment

In the `create` function parameter type (line ~93), add:
```ts
    machineId?: string | null
```

In the `create` function data object (line ~117), add:
```ts
      machineId: data.machineId ?? null,
```

#### 4. Regenerate Prisma Client
```bash
pnpm db:generate
```

### Success Criteria:

#### Automated Verification:
- [ ] Migration applies cleanly: `supabase migration up` (or verify SQL syntax is valid)
- [ ] Prisma client regenerates: `pnpm db:generate`
- [ ] Type checking passes: `pnpm typecheck` (no new errors from machineId addition)

#### Manual Verification:
- [ ] Confirm `machine_id` column exists in `wh_stock_movements` table via Prisma Studio or psql

**Implementation Note**: After completing this phase and all automated verification passes, proceed to Phase 2.

---

## Phase 2: Service Layer

### Overview
Create `wh-withdrawal-service.ts` with business logic for creating withdrawals, batch withdrawals, cancellations, and listing. All functions enforce tenant isolation.

### Changes Required:

#### 1. Withdrawal Service
**File**: `src/lib/services/wh-withdrawal-service.ts`
**Changes**: New file

**Error classes** (follow `WhStockMovement*Error` naming from `wh-stock-movement-service.ts`):
```ts
export class WhWithdrawalNotFoundError extends Error {
  constructor(message = "Withdrawal not found") {
    super(message)
    this.name = "WhWithdrawalNotFoundError"
  }
}

export class WhWithdrawalValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "WhWithdrawalValidationError"
  }
}
```

**Functions to implement**:

1. **`createWithdrawal(prisma, tenantId, input, userId, audit?)`**
   - Transaction: validate article exists + belongs to tenant, validate stockTracking enabled, validate sufficient stock (currentStock >= quantity), create movement with negative quantity, update article stock
   - Input: `{ articleId, quantity, referenceType, referenceId?, machineId?, notes? }`
   - `referenceType` determines which field is set: `"ORDER"` -> orderId, `"DOCUMENT"` -> documentId, `"MACHINE"` -> machineId, `"NONE"` -> none
   - If `referenceType === "MACHINE"`, use `input.machineId` (or `input.referenceId` as fallback)
   - Audit log with action `"withdrawal"`

2. **`createBatchWithdrawal(prisma, tenantId, input, userId, audit?)`**
   - Transaction: for each item in `input.items`, call the same logic as createWithdrawal
   - Input: `{ referenceType, referenceId?, machineId?, items: [{ articleId, quantity }], notes? }`
   - Returns array of created movements
   - All-or-nothing: if any article fails validation, entire batch rolls back

3. **`cancelWithdrawal(prisma, tenantId, movementId, userId, audit?)`**
   - Transaction: find movement by id+tenantId, validate type=WITHDRAWAL and quantity<0 (original, not already a reversal), find article, create positive reversal movement, update article stock
   - Reversal movement gets `reason: "Storno of movement ${movementId}"` and same reference fields
   - Audit log with action `"withdrawal_cancel"`

4. **`listWithdrawals(prisma, tenantId, params)`**
   - Paginated query filtered to `type: "WITHDRAWAL"`, with optional filters: `orderId`, `documentId`, `machineId`, `dateFrom`, `dateTo`
   - Returns `{ items, total }` (same pattern as `repo.findMany`)
   - Uses repository `findMany` with additional `type: "WITHDRAWAL"` filter

5. **`listByOrder(prisma, tenantId, orderId)`**
   - Returns all withdrawals for a specific order
   - Query: `{ tenantId, type: "WITHDRAWAL", orderId }`

6. **`listByDocument(prisma, tenantId, documentId)`**
   - Returns all withdrawals for a specific document
   - Query: `{ tenantId, type: "WITHDRAWAL", documentId }`

**Key patterns to follow** (from `wh-stock-movement-service.ts`):
- Import `PrismaClient` from `@/generated/prisma/client`
- Import `* as repo` from `./wh-stock-movement-repository` (reuse existing repo)
- Import `* as auditLog` from `./audit-logs-service`
- Import type `AuditContext` from `./audit-logs-service`
- All queries include `tenantId` in `where` clause
- All transactions use `prisma.$transaction(async (tx) => { ... })`
- Article lookup uses `tx.whArticle.findFirst({ where: { id: articleId, tenantId } })`
- Audit log fire-and-forget: `.catch(err => console.error('[AuditLog] Failed:', err))`

### Success Criteria:

#### Automated Verification:
- [ ] File exists: `src/lib/services/wh-withdrawal-service.ts`
- [ ] Type checking passes: `pnpm typecheck`
- [ ] No lint errors in new file: `pnpm lint`

#### Manual Verification:
- [ ] Code review: every function accepts `tenantId`, every Prisma query includes `tenantId` in where clause

**Implementation Note**: After completing this phase and all automated verification passes, proceed to Phase 3.

---

## Phase 3: Router Layer

### Overview
Create withdrawal router following the exact pattern from `stockMovements.ts`. Add to warehouse router index.

### Changes Required:

#### 1. Withdrawals Router
**File**: `src/trpc/routers/warehouse/withdrawals.ts`
**Changes**: New file

```ts
import { z } from "zod"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { handleServiceError } from "@/trpc/errors"
import { requirePermission } from "@/lib/auth/middleware"
import { requireModule } from "@/lib/modules"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import * as withdrawalService from "@/lib/services/wh-withdrawal-service"
import type { PrismaClient } from "@/generated/prisma/client"

const WH_STOCK_VIEW = permissionIdByKey("wh_stock.view")!
const WH_STOCK_MANAGE = permissionIdByKey("wh_stock.manage")!

const whProcedure = tenantProcedure.use(requireModule("warehouse"))

const referenceTypeEnum = z.enum(["ORDER", "DOCUMENT", "MACHINE", "NONE"])
```

**Procedures**:

| Procedure | Type | Permission | Input Schema |
|-----------|------|-----------|-------------|
| `create` | mutation | `WH_STOCK_MANAGE` | `{ articleId: uuid, quantity: number().positive(), referenceType, referenceId?: string, machineId?: string, notes?: string }` |
| `createBatch` | mutation | `WH_STOCK_MANAGE` | `{ referenceType, referenceId?: string, machineId?: string, items: [{ articleId: uuid, quantity: number().positive() }].min(1), notes?: string }` |
| `cancel` | mutation | `WH_STOCK_MANAGE` | `{ movementId: uuid }` |
| `list` | query | `WH_STOCK_VIEW` | `{ orderId?: uuid, documentId?: uuid, machineId?: string, dateFrom?: string, dateTo?: string, page: int.min(1).default(1), pageSize: int.min(1).max(100).default(25) }` |
| `listByOrder` | query | `WH_STOCK_VIEW` | `{ orderId: uuid }` |
| `listByDocument` | query | `WH_STOCK_VIEW` | `{ documentId: uuid }` |

Each mutation procedure follows the exact pattern from `stockMovements.ts`:
```ts
.mutation(async ({ ctx, input }) => {
  try {
    const audit = {
      userId: ctx.user!.id,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    }
    return await withdrawalService.createWithdrawal(
      ctx.prisma as unknown as PrismaClient,
      ctx.tenantId!,
      input,
      ctx.user!.id,
      audit
    )
  } catch (err) {
    handleServiceError(err)
  }
})
```

Export as: `export const whWithdrawalsRouter = createTRPCRouter({ create, createBatch, cancel, list, listByOrder, listByDocument })`

#### 2. Update Warehouse Router Index
**File**: `src/trpc/routers/warehouse/index.ts`
**Changes**: Add withdrawals import and merge

```ts
import { whWithdrawalsRouter } from "./withdrawals"

export const warehouseRouter = createTRPCRouter({
  articles: whArticlesRouter,
  articlePrices: whArticlePricesRouter,
  purchaseOrders: whPurchaseOrdersRouter,
  stockMovements: whStockMovementsRouter,
  withdrawals: whWithdrawalsRouter,   // <-- NEW
})
```

### Success Criteria:

#### Automated Verification:
- [ ] File exists: `src/trpc/routers/warehouse/withdrawals.ts`
- [ ] Updated: `src/trpc/routers/warehouse/index.ts`
- [ ] Type checking passes: `pnpm typecheck`
- [ ] No lint errors: `pnpm lint`

#### Manual Verification:
- [ ] Code review: all procedures use `whProcedure` (module guard), `requirePermission`, pass `ctx.tenantId!`

**Implementation Note**: After completing this phase and all automated verification passes, proceed to Phase 4.

---

## Phase 4: Router Tests with Tenant Isolation

### Overview
Create comprehensive router tests following the exact pattern from `whStockMovements-router.test.ts`.

### Changes Required:

#### 1. Router Tests
**File**: `src/trpc/routers/__tests__/whWithdrawals-router.test.ts`
**Changes**: New file

**Setup** (follow exact pattern from `whStockMovements-router.test.ts:1-66`):
```ts
import { describe, it, expect, vi } from "vitest"
import { createCallerFactory } from "@/trpc/init"
import { whWithdrawalsRouter } from "../warehouse/withdrawals"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import {
  createMockContext,
  createMockSession,
  createUserWithPermissions,
  createMockUserTenant,
} from "./helpers"

vi.mock("@/lib/db", () => ({
  prisma: {
    tenantModule: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue({ id: "mock", module: "warehouse" }),
    },
  },
}))
```

**Constants**: `TENANT_ID`, `OTHER_TENANT_ID`, `USER_ID`, `ARTICLE_ID`, `MOVEMENT_ID`, `ORDER_ID`, `DOCUMENT_ID`

**Mock data**: `mockArticle` (with `currentStock: 50`, `stockTracking: true`), `mockWithdrawalMovement` (type: "WITHDRAWAL", quantity: -5)

**Test blocks**:

```
describe("warehouse.withdrawals")
  describe("create")
    it("creates withdrawal with negative quantity")
    it("requires wh_stock.manage permission")
    it("requires warehouse module enabled")
    it("rejects insufficient stock")
    it("validates articleId is UUID")

  describe("createBatch")
    it("creates batch withdrawal for multiple articles")
    it("requires wh_stock.manage permission")
    it("validates items array is not empty")

  describe("cancel")
    it("creates positive reversal movement")
    it("requires wh_stock.manage permission")
    it("rejects if movement is not WITHDRAWAL type")

  describe("list")
    it("returns paginated withdrawals")
    it("requires wh_stock.view permission")
    it("filters by orderId")
    it("filters by date range")

  describe("listByOrder")
    it("returns withdrawals for an order")
    it("requires wh_stock.view permission")

  describe("listByDocument")
    it("returns withdrawals for a document")
    it("requires wh_stock.view permission")

  describe("tenant isolation")
    it("create rejects article from another tenant")
    it("cancel rejects movement from another tenant")
    it("list returns empty for other tenant")
    it("listByOrder returns empty for other tenant")
    it("listByDocument returns empty for other tenant")
```

**Mock pattern for mutations** (from router test pattern):
```ts
const prisma = {
  whArticle: {
    findFirst: vi.fn().mockResolvedValue(mockArticle),
    update: vi.fn().mockResolvedValue({ ...mockArticle, currentStock: 45 }),
  },
  whStockMovement: {
    create: vi.fn().mockResolvedValue(mockWithdrawalMovement),
    findFirst: vi.fn().mockResolvedValue(mockWithdrawalMovement),
    findMany: vi.fn().mockResolvedValue([mockWithdrawalMovement]),
    count: vi.fn().mockResolvedValue(1),
  },
  auditLog: { create: vi.fn() },
  $transaction: vi.fn().mockImplementation(async (fn) => fn(prisma)),
}
```

#### 2. Service Tests
**File**: `src/lib/services/__tests__/wh-withdrawal-service.test.ts`
**Changes**: New file

Follow exact pattern from `wh-stock-movement-service.test.ts`:
```
describe("wh-withdrawal-service")
  describe("createWithdrawal")
    it("creates movement with negative quantity")
    it("updates article currentStock")
    it("sets orderId when referenceType=ORDER")
    it("sets documentId when referenceType=DOCUMENT")
    it("sets machineId when referenceType=MACHINE")
    it("sets no reference when referenceType=NONE")
    it("rejects if article not found")
    it("rejects if stock tracking disabled")
    it("rejects if insufficient stock")

  describe("createBatchWithdrawal")
    it("processes multiple articles in one transaction")
    it("rolls back all if any article fails")
    it("returns array of created movements")

  describe("cancelWithdrawal")
    it("creates positive reversal movement")
    it("restores article stock")
    it("copies reference fields from original movement")
    it("sets reason to Storno message")
    it("rejects if movement not found")
    it("rejects if movement is not WITHDRAWAL type")
    it("rejects if movement is already a reversal (positive quantity)")

  describe("listWithdrawals")
    it("returns paginated results filtered to WITHDRAWAL type")
    it("filters by orderId")
    it("filters by machineId")
    it("filters by date range")

  describe("listByOrder")
    it("returns withdrawals for specific order")

  describe("listByDocument")
    it("returns withdrawals for specific document")

  describe("tenant isolation")
    it("createWithdrawal rejects article from another tenant")
    it("cancelWithdrawal rejects movement from another tenant")
    it("listWithdrawals returns empty for other tenant")
    it("listByOrder returns empty for other tenant")
    it("listByDocument returns empty for other tenant")
```

### Success Criteria:

#### Automated Verification:
- [ ] Service tests pass: `pnpm vitest run src/lib/services/__tests__/wh-withdrawal-service.test.ts`
- [ ] Router tests pass: `pnpm vitest run src/trpc/routers/__tests__/whWithdrawals-router.test.ts`
- [ ] All existing tests still pass: `pnpm test`

#### Manual Verification:
- [ ] Every `describe("tenant isolation")` block has at least one test per service function that takes a record ID
- [ ] All mock Prisma queries verify `tenantId` is passed in `where` clause

**Implementation Note**: After completing this phase and all automated verification passes, proceed to Phase 5.

---

## Phase 5: i18n Translations

### Overview
Add `warehouseWithdrawals` namespace to both German and English translation files. Add nav key.

### Changes Required:

#### 1. German Translations
**File**: `messages/de.json`
**Changes**: Add nav key after `warehouseStockMovements` (line ~124) and namespace after `warehouseStockMovements` block (after line ~5931)

Nav key (in `"nav"` section, after `"warehouseStockMovements": "Lagerbewegungen"`):
```json
"warehouseWithdrawals": "Lagerentnahmen"
```

Namespace block (after `warehouseStockMovements` closing brace):
```json
"warehouseWithdrawals": {
  "pageTitle": "Lagerentnahmen",
  "pageDescription": "Artikel aus dem Lager entnehmen und Entnahmen verwalten",
  "noPermission": "Keine Berechtigung",
  "loading": "Laden...",

  "stepReference": "Referenz wählen",
  "stepArticles": "Artikel auswählen",
  "stepConfirm": "Entnahme bestätigen",

  "labelReferenceType": "Referenztyp",
  "labelReference": "Referenz",
  "labelMachineId": "Maschinen-/Geräte-ID",
  "labelNotes": "Bemerkungen",

  "refTypeOrder": "Auftrag",
  "refTypeDocument": "Lieferschein",
  "refTypeMachine": "Maschine/Gerät",
  "refTypeNone": "Ohne Referenz",

  "refPlaceholderOrder": "Auftragsnummer eingeben...",
  "refPlaceholderDocument": "Belegnummer eingeben...",
  "refPlaceholderMachine": "Maschinen-ID eingeben...",

  "colArticle": "Artikel",
  "colArticleNumber": "Artikelnr.",
  "colCurrentStock": "Aktueller Bestand",
  "colWithdrawQuantity": "Entnahmemenge",
  "colUnit": "Einheit",
  "colDate": "Datum",
  "colQuantity": "Menge",
  "colReference": "Referenz",
  "colUser": "Benutzer",
  "colActions": "Aktionen",

  "searchArticle": "Artikel suchen...",
  "addArticle": "Artikel hinzufügen",
  "removeArticle": "Artikel entfernen",

  "actionWithdraw": "Entnahme buchen",
  "actionCancel": "Abbrechen",
  "actionBack": "Zurück",
  "actionNext": "Weiter",
  "actionCancelWithdrawal": "Stornieren",

  "confirmTitle": "Entnahme bestätigen",
  "confirmDescription": "Folgende Artikel werden entnommen:",
  "confirmArticle": "Artikel",
  "confirmQuantity": "Menge",
  "confirmReference": "Referenz",
  "confirmBook": "Jetzt entnehmen",

  "cancelDialogTitle": "Entnahme stornieren",
  "cancelDialogDescription": "Möchten Sie diese Entnahme wirklich stornieren? Der Bestand wird wiederhergestellt.",
  "cancelDialogConfirm": "Stornieren",
  "cancelDialogCancel": "Abbrechen",

  "toastWithdrawn": "Entnahme erfolgreich gebucht",
  "toastWithdrawnBatch": "{count} Artikel entnommen",
  "toastCancelled": "Entnahme storniert",
  "toastError": "Fehler bei der Entnahme",
  "toastCancelError": "Fehler beim Stornieren",

  "errorInsufficientStock": "Nicht genügend Bestand ({available} verfügbar)",
  "errorNoArticles": "Keine Artikel zur Entnahme ausgewählt",
  "errorStockTrackingDisabled": "Bestandsführung für diesen Artikel deaktiviert",

  "historyTitle": "Entnahme-Verlauf",
  "historyEmpty": "Keine Entnahmen vorhanden",
  "filterDateFrom": "Von",
  "filterDateTo": "Bis",
  "filterReference": "Referenz filtern",
  "filterAllReferences": "Alle Referenzen",

  "tabTerminal": "Neue Entnahme",
  "tabHistory": "Verlauf",

  "warningLowStock": "Bestand wird unter Mindestbestand fallen"
}
```

#### 2. English Translations
**File**: `messages/en.json`
**Changes**: Same structure, English values

Nav key:
```json
"warehouseWithdrawals": "Withdrawals"
```

Namespace block:
```json
"warehouseWithdrawals": {
  "pageTitle": "Stock Withdrawals",
  "pageDescription": "Withdraw articles from stock and manage withdrawals",
  "noPermission": "No permission",
  "loading": "Loading...",

  "stepReference": "Select Reference",
  "stepArticles": "Select Articles",
  "stepConfirm": "Confirm Withdrawal",

  "labelReferenceType": "Reference Type",
  "labelReference": "Reference",
  "labelMachineId": "Machine/Equipment ID",
  "labelNotes": "Notes",

  "refTypeOrder": "Order",
  "refTypeDocument": "Delivery Note",
  "refTypeMachine": "Machine/Equipment",
  "refTypeNone": "No Reference",

  "refPlaceholderOrder": "Enter order number...",
  "refPlaceholderDocument": "Enter document number...",
  "refPlaceholderMachine": "Enter machine ID...",

  "colArticle": "Article",
  "colArticleNumber": "Article No.",
  "colCurrentStock": "Current Stock",
  "colWithdrawQuantity": "Withdraw Quantity",
  "colUnit": "Unit",
  "colDate": "Date",
  "colQuantity": "Quantity",
  "colReference": "Reference",
  "colUser": "User",
  "colActions": "Actions",

  "searchArticle": "Search article...",
  "addArticle": "Add Article",
  "removeArticle": "Remove Article",

  "actionWithdraw": "Book Withdrawal",
  "actionCancel": "Cancel",
  "actionBack": "Back",
  "actionNext": "Next",
  "actionCancelWithdrawal": "Cancel Withdrawal",

  "confirmTitle": "Confirm Withdrawal",
  "confirmDescription": "The following articles will be withdrawn:",
  "confirmArticle": "Article",
  "confirmQuantity": "Quantity",
  "confirmReference": "Reference",
  "confirmBook": "Withdraw Now",

  "cancelDialogTitle": "Cancel Withdrawal",
  "cancelDialogDescription": "Are you sure you want to cancel this withdrawal? The stock will be restored.",
  "cancelDialogConfirm": "Cancel Withdrawal",
  "cancelDialogCancel": "Keep",

  "toastWithdrawn": "Withdrawal booked successfully",
  "toastWithdrawnBatch": "{count} article(s) withdrawn",
  "toastCancelled": "Withdrawal cancelled",
  "toastError": "Error during withdrawal",
  "toastCancelError": "Error cancelling withdrawal",

  "errorInsufficientStock": "Insufficient stock ({available} available)",
  "errorNoArticles": "No articles selected for withdrawal",
  "errorStockTrackingDisabled": "Stock tracking is disabled for this article",

  "historyTitle": "Withdrawal History",
  "historyEmpty": "No withdrawals found",
  "filterDateFrom": "From",
  "filterDateTo": "To",
  "filterReference": "Filter by reference",
  "filterAllReferences": "All References",

  "tabTerminal": "New Withdrawal",
  "tabHistory": "History",

  "warningLowStock": "Stock will fall below minimum level"
}
```

### Success Criteria:

#### Automated Verification:
- [ ] JSON is valid: `node -e "require('./messages/de.json')"` and `node -e "require('./messages/en.json')"`
- [ ] Type checking passes: `pnpm typecheck`
- [ ] Both files have identical keys in `warehouseWithdrawals` namespace

#### Manual Verification:
- [ ] German translations are natural and consistent with existing warehouse namespaces
- [ ] Key naming follows existing patterns (`colX`, `actionX`, `toastX`, `errorX`, `filterX`)

**Implementation Note**: After completing this phase and all automated verification passes, proceed to Phase 6.

---

## Phase 6: Hooks

### Overview
Create React hooks wrapping tRPC queries and mutations for withdrawals. Follow exact pattern from `use-wh-stock-movements.ts`.

### Changes Required:

#### 1. Withdrawal Hooks
**File**: `src/hooks/use-wh-withdrawals.ts`
**Changes**: New file

```ts
import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
```

**Query hooks**:
- `useWhWithdrawals(options?, enabled?)` — calls `trpc.warehouse.withdrawals.list.queryOptions`
  - Options: `{ orderId?, documentId?, machineId?, dateFrom?, dateTo?, page?, pageSize? }`
  - Default page=1, pageSize=25

- `useWhWithdrawalsByOrder(orderId, enabled?)` — calls `trpc.warehouse.withdrawals.listByOrder.queryOptions`
  - Enabled only when `orderId` is truthy

- `useWhWithdrawalsByDocument(documentId, enabled?)` — calls `trpc.warehouse.withdrawals.listByDocument.queryOptions`
  - Enabled only when `documentId` is truthy

**Mutation hooks**:
- `useCreateWhWithdrawal()` — calls `trpc.warehouse.withdrawals.create.mutationOptions`
  - onSuccess: invalidate `warehouse.withdrawals.list`, `warehouse.stockMovements.movements.list`, `warehouse.articles.list`, `warehouse.articles.getById`

- `useCreateBatchWhWithdrawal()` — calls `trpc.warehouse.withdrawals.createBatch.mutationOptions`
  - Same invalidations as above

- `useCancelWhWithdrawal()` — calls `trpc.warehouse.withdrawals.cancel.mutationOptions`
  - Same invalidations as above

#### 2. Export from Hook Index
**File**: `src/hooks/index.ts`
**Changes**: Add exports after the `use-wh-stock-movements` block (after line 882)

```ts
// Warehouse Withdrawals
export {
  useWhWithdrawals,
  useWhWithdrawalsByOrder,
  useWhWithdrawalsByDocument,
  useCreateWhWithdrawal,
  useCreateBatchWhWithdrawal,
  useCancelWhWithdrawal,
} from './use-wh-withdrawals'
```

### Success Criteria:

#### Automated Verification:
- [ ] File exists: `src/hooks/use-wh-withdrawals.ts`
- [ ] Updated: `src/hooks/index.ts`
- [ ] Type checking passes: `pnpm typecheck`
- [ ] No lint errors: `pnpm lint`

#### Manual Verification:
- [ ] Hook pattern matches `use-wh-stock-movements.ts` exactly (import style, query/mutation patterns)
- [ ] All mutation hooks invalidate relevant queries on success

**Implementation Note**: After completing this phase and all automated verification passes, proceed to Phase 7.

---

## Phase 7: UI Components

### Overview
Create 4 UI components in `src/components/warehouse/` following the goods-receipt-terminal pattern.

### Changes Required:

#### 1. Withdrawal Terminal (Main Component)
**File**: `src/components/warehouse/withdrawal-terminal.tsx`
**Changes**: New file

3-step wizard (simpler than goods receipt's 4 steps since no supplier selection):

**Step 1 — Select Reference**:
- Radio/button group for reference type: Order, Delivery Note, Machine, None
- Text input for reference ID (order number, document number, or machine ID)
- For ORDER/DOCUMENT: text input (not a search — these are free-text references unless we have data to search)
- For MACHINE: text input for machine ID
- "Next" button enabled when reference type selected (and referenceId filled if type != NONE)

**Step 2 — Select Articles**:
- Article search popover (reuse `article-search-popover.tsx`)
- Table of added articles: Article No., Name, Current Stock, Withdraw Quantity (input), Unit
- Each row is a `WithdrawalArticleRow`
- Remove article button per row
- Warning badge if stock would fall below minStock after withdrawal
- Error if withdraw quantity > currentStock
- "Back" and "Next" buttons

**Step 3 — Confirm**:
- Summary table: Article, Quantity, Reference
- "Back" and "Withdraw Now" buttons
- On confirm: call `useCreateBatchWhWithdrawal()` (or `useCreateWhWithdrawal()` for single)
- Success: `toast.success(t('toastWithdrawn'))`, reset state
- Error: `toast.error(t('toastError'))`

**Step indicator**: Colored circles with `ChevronRight` icons (match goods-receipt-terminal pattern)

**State management**:
```ts
interface WithdrawalState {
  step: 1 | 2 | 3
  referenceType: "ORDER" | "DOCUMENT" | "MACHINE" | "NONE"
  referenceId: string
  machineId: string
  items: Array<{ articleId: string; article: ArticleInfo; quantity: number }>
  notes: string
}
```

**Imports**: `Card`, `CardContent`, `CardHeader`, `CardTitle` from ui/card, `Button` from ui/button, `Input` from ui/input, `Badge` from ui/badge, `toast` from sonner, `useTranslations` from next-intl, hooks from `@/hooks/use-wh-withdrawals`, `ArticleSearchPopover` from `./article-search-popover`

#### 2. Withdrawal Article Row
**File**: `src/components/warehouse/withdrawal-article-row.tsx`
**Changes**: New file

Table row component:
- Props: `{ article, quantity, onChange, onRemove }`
- Shows: article number, name, current stock, quantity input (number), unit
- Warning badge if `article.currentStock - quantity < article.minStock`
- Error text if `quantity > article.currentStock`
- Remove button (trash icon)
- Follow `goods-receipt-position-row.tsx` pattern

#### 3. Withdrawal History
**File**: `src/components/warehouse/withdrawal-history.tsx`
**Changes**: New file

Paginated table with:
- Filters: date range (From/To), reference type select
- Table columns: Date, Article (number + name), Quantity (red negative, green positive for reversals), Reference, User, Actions
- Actions: Cancel button (only for original withdrawals, not reversals)
- Pagination: prev/next buttons
- Uses `useWhWithdrawals(filters)` hook
- Movement type badge: negative = "Entnahme" (red), positive = "Storno" (yellow)
- Follow `stock-movement-list.tsx` pattern

#### 4. Withdrawal Cancel Dialog
**File**: `src/components/warehouse/withdrawal-cancel-dialog.tsx`
**Changes**: New file

AlertDialog component:
- Props: `{ movementId, open, onOpenChange, onSuccess }`
- Shows article name, quantity, reference
- Confirm button calls `useCancelWhWithdrawal().mutateAsync({ movementId })`
- Success: `toast.success(t('toastCancelled'))`, call `onSuccess()`
- Error: `toast.error(t('toastCancelError'))`
- Uses `AlertDialog`, `AlertDialogContent`, `AlertDialogHeader`, etc. from ui/alert-dialog

### Success Criteria:

#### Automated Verification:
- [ ] Files exist: all 4 component files in `src/components/warehouse/`
- [ ] Type checking passes: `pnpm typecheck`
- [ ] No lint errors: `pnpm lint`

#### Manual Verification:
- [ ] Components follow the UI patterns from goods-receipt-terminal (Card, step indicator, toast, etc.)
- [ ] All user-facing text uses `t()` with `warehouseWithdrawals` namespace keys
- [ ] ArticleSearchPopover is reused (not reimplemented)

**Implementation Note**: After completing this phase and all automated verification passes, proceed to Phase 8.

---

## Phase 8: Page Route

### Overview
Create the page component at `/warehouse/withdrawals` following the exact pattern from goods-receipt page.

### Changes Required:

#### 1. Page Component
**File**: `src/app/[locale]/(dashboard)/warehouse/withdrawals/page.tsx`
**Changes**: New file

```tsx
'use client'

import { useTranslations } from 'next-intl'
import { useHasPermission } from '@/hooks'
import { WithdrawalTerminal } from '@/components/warehouse/withdrawal-terminal'
import { WithdrawalHistory } from '@/components/warehouse/withdrawal-history'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

export default function WhWithdrawalsPage() {
  const t = useTranslations('warehouseWithdrawals')
  const { allowed: canAccess } = useHasPermission(['wh_stock.manage'])

  if (canAccess === false) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        {t('noPermission')}
      </div>
    )
  }

  return (
    <div className="space-y-4 p-6">
      <h1 className="text-2xl font-bold">{t('pageTitle')}</h1>
      <Tabs defaultValue="terminal">
        <TabsList>
          <TabsTrigger value="terminal">{t('tabTerminal')}</TabsTrigger>
          <TabsTrigger value="history">{t('tabHistory')}</TabsTrigger>
        </TabsList>
        <TabsContent value="terminal">
          <WithdrawalTerminal />
        </TabsContent>
        <TabsContent value="history">
          <WithdrawalHistory />
        </TabsContent>
      </Tabs>
    </div>
  )
}
```

### Success Criteria:

#### Automated Verification:
- [ ] File exists: `src/app/[locale]/(dashboard)/warehouse/withdrawals/page.tsx`
- [ ] Type checking passes: `pnpm typecheck`
- [ ] No lint errors: `pnpm lint`

#### Manual Verification:
- [ ] Page loads at `http://localhost:3001/de/warehouse/withdrawals`
- [ ] Shows "Keine Berechtigung" for users without `wh_stock.manage`
- [ ] Page title shows "Lagerentnahmen" in German locale
- [ ] Tabs switch between terminal and history views

**Implementation Note**: After completing this phase and all automated verification passes, proceed to Phase 9.

---

## Phase 9: Navigation Integration

### Overview
Add sidebar navigation item for withdrawals.

### Changes Required:

#### 1. Sidebar Nav Config
**File**: `src/components/layout/sidebar/sidebar-nav-config.ts`
**Changes**:
1. Add `PackageMinus` to lucide-react imports (line ~50, after `PackageCheck`)
2. Add nav item after `warehouseGoodsReceipt` item (after line ~401, before `warehouseStockMovements`)

```ts
// In imports:
  PackageMinus,

// In warehouseSection items array:
      {
        titleKey: 'warehouseWithdrawals',
        href: '/warehouse/withdrawals',
        icon: PackageMinus,
        module: 'warehouse',
        permissions: ['wh_stock.manage'],
      },
```

Position: between Goods Receipt and Stock Movements (logical flow: receive -> withdraw -> view movements)

### Success Criteria:

#### Automated Verification:
- [ ] Type checking passes: `pnpm typecheck`
- [ ] No lint errors: `pnpm lint`

#### Manual Verification:
- [ ] Sidebar shows "Lagerentnahmen" link in warehouse section
- [ ] Link navigates to `/warehouse/withdrawals`
- [ ] Icon renders correctly (PackageMinus)
- [ ] Item hidden for users without `wh_stock.manage` permission

**Implementation Note**: After completing this phase and all automated verification passes, proceed to Phase 10.

---

## Phase 10: E2E Browser Tests

### Overview
Create comprehensive E2E tests and update global cleanup.

### Changes Required:

#### 1. Update Global Setup
**File**: `src/e2e-browser/global-setup.ts`
**Changes**: Add withdrawal-specific cleanup SQL

Insert before the existing warehouse purchase order cleanup (before line ~112):
```sql
-- Warehouse withdrawal movements (spec 44) — must come before article cleanup
DELETE FROM wh_stock_movements WHERE type = 'WITHDRAWAL'
  AND tenant_id = '10000000-0000-0000-0000-000000000001'
  AND article_id IN (SELECT id FROM wh_articles WHERE name LIKE 'E2E%');
```

This ensures withdrawal movements from previous test runs are cleaned up. The existing PO-related movement cleanup handles goods receipt movements separately.

#### 2. E2E Browser Tests
**File**: `src/e2e-browser/44-wh-withdrawals.spec.ts`
**Changes**: New file

```ts
import { test, expect } from "@playwright/test";
import { navigateTo } from "./helpers/nav";
```

**Test structure** (serial, matching `43-wh-goods-receipt.spec.ts` pattern):

```
test.describe.serial("UC-WH-05: Stock Withdrawals", () => {

  // ─── Navigation ──────────────────────────────────────────────
  test("navigate to withdrawals page", async ({ page }) => {
    // navigateTo "/warehouse/withdrawals"
    // Expect heading "Lagerentnahmen" visible
  })

  // ─── Sidebar link ────────────────────────────────────────────
  test("sidebar shows withdrawals link", async ({ page }) => {
    // navigateTo "/warehouse/articles" (any warehouse page)
    // Expect a[href*="/warehouse/withdrawals"] visible
  })

  // ─── Terminal: Reference type selection ──────────────────────
  test("terminal shows reference type options", async ({ page }) => {
    // navigateTo "/warehouse/withdrawals"
    // Expect "Neue Entnahme" tab active
    // Expect reference type options: Auftrag, Lieferschein, Maschine, Ohne Referenz
  })

  // ─── Withdraw article without reference ──────────────────────
  test("withdraw article without reference", async ({ page }) => {
    // navigateTo "/warehouse/withdrawals"
    // Step 1: Select "Ohne Referenz" reference type
    // Click "Weiter"
    // Step 2: Search for E2E article (created in spec 40)
    // Enter quantity (e.g., 1)
    // Click "Weiter"
    // Step 3: Confirm withdrawal
    // Click "Jetzt entnehmen"
    // Expect success toast "Entnahme erfolgreich gebucht"
  })

  // ─── Withdraw article with order reference ───────────────────
  test("withdraw article with order reference", async ({ page }) => {
    // navigateTo "/warehouse/withdrawals"
    // Step 1: Select "Auftrag" reference type
    // Enter order number (e.g., "E2E-ORD-001")
    // Click "Weiter"
    // Step 2: Search article, enter quantity
    // Click "Weiter"
    // Step 3: Confirm → success
  })

  // ─── Withdraw article with machine reference ─────────────────
  test("withdraw article with machine reference", async ({ page }) => {
    // navigateTo "/warehouse/withdrawals"
    // Step 1: Select "Maschine/Gerät" reference type
    // Enter machine ID (e.g., "M-001")
    // Click "Weiter"
    // Step 2: Add article, enter quantity
    // Step 3: Confirm → success
  })

  // ─── Withdrawal history tab ──────────────────────────────────
  test("withdrawal history shows booked withdrawals", async ({ page }) => {
    // navigateTo "/warehouse/withdrawals"
    // Click "Verlauf" tab
    // Expect table with at least one row
    // Expect negative quantity displayed
    // Expect reference column shows values
  })

  // ─── Cancel a withdrawal ─────────────────────────────────────
  test("cancel a withdrawal from history", async ({ page }) => {
    // navigateTo "/warehouse/withdrawals"
    // Click "Verlauf" tab
    // Find a withdrawal row → click "Stornieren" button
    // Confirm dialog → click "Stornieren"
    // Expect success toast "Entnahme storniert"
    // Expect reversal row appears in table (positive quantity)
  })

  // ─── Filter history by date ──────────────────────────────────
  test("filter withdrawal history by date", async ({ page }) => {
    // navigateTo "/warehouse/withdrawals"
    // Click "Verlauf" tab
    // Set "Von" date to today
    // Expect table shows only today's withdrawals
  })

  // ─── Verify stock decreased in article list ──────────────────
  test("article stock reflects withdrawals", async ({ page }) => {
    // navigateTo "/warehouse/articles"
    // Find E2E article row
    // Verify stock has decreased from original (if trackable)
  })

  // ─── Verify in stock movements page ──────────────────────────
  test("withdrawals appear in stock movement history", async ({ page }) => {
    // navigateTo "/warehouse/stock-movements"
    // Look for "Lagerentnahme" type entries
    // Expect at least one visible
  })

  // ─── Insufficient stock validation ───────────────────────────
  test("reject withdrawal with insufficient stock", async ({ page }) => {
    // navigateTo "/warehouse/withdrawals"
    // Step 1: No reference
    // Step 2: Search article, enter quantity > current stock (e.g., 999999)
    // Expect error message or disabled confirm
    // Or: Attempt confirm, expect error toast
  })

})
```

**Key considerations**:
- Tests are serial because they depend on state (withdrawals must exist before cancellation)
- E2E articles from spec 40 (`wh-articles.spec.ts`) should exist with stock > 0 (from goods receipt in spec 43)
- Use `page.waitForTimeout(2000)` after navigation (consistent with spec 43 pattern)
- Use `main.getByRole("heading", { name: /Lagerentnahmen/i })` for page detection
- Use `.catch(() => false)` for optional element checks (graceful degradation)
- All selectors use German text (default locale)

### Success Criteria:

#### Automated Verification:
- [ ] File exists: `src/e2e-browser/44-wh-withdrawals.spec.ts`
- [ ] Global setup updated: `src/e2e-browser/global-setup.ts`
- [ ] E2E tests pass: `pnpm playwright test src/e2e-browser/44-wh-withdrawals.spec.ts`

#### Manual Verification:
- [ ] Watch test run: tests navigate correctly, terminal works, history shows data
- [ ] Cancellation test verifies stock restoration
- [ ] Tests are idempotent (can run multiple times without failure due to global-setup cleanup)

**Implementation Note**: After completing this phase, run all tests to verify no regressions.

---

## Testing Strategy

### Unit Tests (Phase 4):
- Service: 25+ tests covering all functions, validation, error cases, tenant isolation
- Router: 20+ tests covering permissions, module guard, input validation, tenant isolation
- Every service function that accepts a record ID has a tenant isolation test

### Integration Tests:
- Router tests serve as integration tests (tRPC caller -> service -> mock Prisma)
- Transaction behavior tested via `$transaction` mock

### E2E Browser Tests (Phase 10):
- 11 tests covering: navigation, sidebar, terminal wizard (3 reference types + none), history, cancellation, date filter, stock verification, cross-page verification, error handling

### Manual Testing Steps:
1. Navigate to `/warehouse/withdrawals` — page loads with tabs
2. Create withdrawal without reference — stock decreases
3. Create withdrawal with order reference — appears in history with order ref
4. Create withdrawal with machine reference — appears in history with machine ID
5. Switch to history tab — all withdrawals visible
6. Cancel a withdrawal — stock restored, reversal row appears
7. Check stock movements page — withdrawal entries visible
8. Check article detail — stock reflects withdrawals

## Performance Considerations

- `listWithdrawals` uses pagination (default 25 per page)
- Index on `(tenant_id, machine_id)` for machine reference queries
- Existing indexes on `(tenant_id, type)`, `(tenant_id, date)` cover withdrawal list queries
- Batch withdrawal uses a single transaction (one round-trip)
- Article search uses existing `useWhArticleSearch` debounced hook

## Migration Notes

- Migration adds nullable `machine_id` column — no data backfill needed
- Existing WITHDRAWAL type movements (if any from adjustStock) remain unaffected
- No breaking changes to existing stock movement queries (new column is optional)

## References

- Original ticket: `thoughts/shared/tickets/orgAuftrag/TICKET_WH_05_LAGERENTNAHMEN.md`
- Research document: `thoughts/shared/research/2026-03-24-WH_05-lagerentnahmen.md`
- WH_04 implementation plan: `thoughts/shared/plans/2026-03-24-WH_04-wareneingang.md`
- Stock movement service (reference): `src/lib/services/wh-stock-movement-service.ts`
- Stock movement router (reference): `src/trpc/routers/warehouse/stockMovements.ts`
- Goods receipt terminal (UI reference): `src/components/warehouse/goods-receipt-terminal.tsx`
- E2E test reference: `src/e2e-browser/43-wh-goods-receipt.spec.ts`
