# WH_10 Implementation Plan: Artikelreservierungen bei Auftragsbestätigung

| Field | Value |
|-------|-------|
| **Ticket** | `thoughts/shared/tickets/orgAuftrag/TICKET_WH_10_ARTIKELRESERVIERUNGEN.md` |
| **Research** | `thoughts/shared/research/2026-03-26-WH_10-artikelreservierungen.md` |
| **Complexity** | L |
| **Estimated Steps** | 5 phases, ~18 files (8 new, 10 modified) |

---

## Phase 1: Database & Prisma Model

**Goal:** Create the `WhStockReservation` table and update the Prisma schema.

### Step 1.1: Prisma Schema — Add WhStockReservation model

**File:** `prisma/schema.prisma` (after the last `wh_*` model, near line 4500)

```prisma
model WhStockReservation {
  id            String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId      String    @map("tenant_id") @db.Uuid
  articleId     String    @map("article_id") @db.Uuid
  documentId    String    @map("document_id") @db.Uuid
  positionId    String    @map("position_id") @db.Uuid
  quantity      Float
  status        String    @default("ACTIVE")
  releasedAt    DateTime? @map("released_at") @db.Timestamptz(6)
  releasedById  String?   @map("released_by_id") @db.Uuid
  releaseReason String?   @map("release_reason")
  createdAt     DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt     DateTime  @updatedAt @map("updated_at") @db.Timestamptz(6)
  createdById   String?   @map("created_by_id") @db.Uuid

  tenant  Tenant    @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  article WhArticle @relation(fields: [articleId], references: [id])

  @@index([tenantId, articleId, status])
  @@index([tenantId, documentId])
  @@map("wh_stock_reservations")
}
```

### Step 1.2: Prisma Schema — Add relation on Tenant model

**File:** `prisma/schema.prisma` (Tenant model, line ~203, after `whCorrectionMessages`)

Add:
```prisma
  whStockReservations         WhStockReservation[]
```

### Step 1.3: Prisma Schema — Add relation on WhArticle model

**File:** `prisma/schema.prisma` (WhArticle model, line ~4252, after `articleImages`)

Add:
```prisma
  stockReservations          WhStockReservation[]
```

### Step 1.4: Supabase Migration

**File (NEW):** `supabase/migrations/20260407100000_wh_stock_reservations.sql`

```sql
-- WH_10: Stock Reservations (Artikelreservierungen)

CREATE TABLE wh_stock_reservations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  article_id      UUID NOT NULL REFERENCES wh_articles(id),
  document_id     UUID NOT NULL,
  position_id     UUID NOT NULL,
  quantity        DOUBLE PRECISION NOT NULL,
  status          TEXT NOT NULL DEFAULT 'ACTIVE',
  released_at     TIMESTAMPTZ(6),
  released_by_id  UUID,
  release_reason  TEXT,
  created_at      TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  created_by_id   UUID
);

CREATE INDEX idx_wh_stock_reservations_tenant_article_status
  ON wh_stock_reservations(tenant_id, article_id, status);

CREATE INDEX idx_wh_stock_reservations_tenant_document
  ON wh_stock_reservations(tenant_id, document_id);

ALTER TABLE wh_stock_reservations ENABLE ROW LEVEL SECURITY;
```

**Note:** `document_id` and `position_id` are NOT formal FKs to `billing_documents`/`billing_document_positions` in the migration (matching the pattern where `BillingDocumentPosition.articleId` is also not a formal FK). This avoids circular dependency issues and keeps the warehouse module loosely coupled.

### Step 1.5: Regenerate Prisma Client

```bash
pnpm db:generate
```

### Verification (Phase 1)
- [ ] `pnpm db:generate` succeeds without errors
- [ ] `pnpm typecheck` passes (or has no new errors beyond baseline)
- [ ] Migration SQL is syntactically valid

---

## Phase 2: Repository & Service

**Goal:** Create the data access layer and business logic for reservations.

### Step 2.1: Repository

**File (NEW):** `src/lib/services/wh-reservation-repository.ts`

**Pattern:** Follow `src/lib/services/wh-stock-movement-repository.ts`

Functions to implement:

```ts
import type { PrismaClient } from "@/generated/prisma/client"

// --- List with pagination and filters ---
export async function findMany(
  prisma: PrismaClient,
  tenantId: string,
  params: {
    articleId?: string
    documentId?: string
    status?: string       // "ACTIVE" | "RELEASED" | "FULFILLED"
    page: number
    pageSize: number
  }
): Promise<{ items: any[]; total: number }>
// WHERE: tenantId + optional filters
// INCLUDE: article { id, number, name, unit }
// ORDER BY: createdAt DESC
// Paginated with skip/take

// --- Get active reservations for a specific article ---
export async function findActiveByArticle(
  prisma: PrismaClient,
  tenantId: string,
  articleId: string
): Promise<any[]>
// WHERE: tenantId, articleId, status: "ACTIVE"
// INCLUDE: basic document info (not a Prisma relation — will need raw or manual join)
// NOTE: Since documentId is NOT a Prisma relation, we fetch reservations first,
//       then separately fetch document info (number, address.company) in the service layer.

// --- Sum active reserved quantity for an article ---
export async function sumActiveQuantity(
  prisma: PrismaClient,
  tenantId: string,
  articleId: string
): Promise<number>
// prisma.whStockReservation.aggregate({ where: { tenantId, articleId, status: "ACTIVE" }, _sum: { quantity: true } })
// Return _sum.quantity || 0

// --- Find by ID (with tenant guard) ---
export async function findById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
): Promise<any | null>
// WHERE: id, tenantId

// --- Find active reservations by document ---
export async function findActiveByDocument(
  prisma: PrismaClient,
  tenantId: string,
  documentId: string
): Promise<any[]>
// WHERE: tenantId, documentId, status: "ACTIVE"

// --- Find active reservation by position ---
export async function findActiveByPosition(
  prisma: PrismaClient,
  tenantId: string,
  positionId: string
): Promise<any | null>
// WHERE: tenantId, positionId, status: "ACTIVE"
// findFirst

// --- Create reservation ---
export async function create(
  prisma: PrismaClient,
  data: {
    tenantId: string
    articleId: string
    documentId: string
    positionId: string
    quantity: number
    createdById?: string | null
  }
): Promise<any>

// --- Update reservation (for release/fulfill) ---
export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: {
    status: string
    releasedAt?: Date
    releasedById?: string | null
    releaseReason?: string
  }
): Promise<any>
// updateMany with { id, tenantId } for tenant safety, then return findById

// --- Bulk update by document (release all active) ---
export async function releaseAllByDocument(
  prisma: PrismaClient,
  tenantId: string,
  documentId: string,
  data: {
    status: string
    releasedAt: Date
    releasedById?: string | null
    releaseReason: string
  }
): Promise<{ count: number }>
// updateMany WHERE: tenantId, documentId, status: "ACTIVE"

// --- Find orphan reservations (for correction assistant) ---
export async function findOrphanReservations(
  prisma: PrismaClient,
  tenantId: string
): Promise<any[]>
// Raw query: ACTIVE reservations where the linked document is CANCELLED or FORWARDED
// This requires a manual join since documentId is not a Prisma relation
```

### Step 2.2: Service

**File (NEW):** `src/lib/services/wh-reservation-service.ts`

**Pattern:** Follow `src/lib/services/wh-stock-movement-service.ts`

```ts
import type { PrismaClient } from "@/generated/prisma/client"
import * as repo from "./wh-reservation-repository"

// --- Error Classes ---

export class WhReservationNotFoundError extends Error {
  constructor(message = "Stock reservation not found") {
    super(message)
    this.name = "WhReservationNotFoundError"
  }
}

export class WhReservationValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "WhReservationValidationError"
  }
}

// --- Query Functions ---

export async function list(prisma, tenantId, params) { ... }
// Delegates to repo.findMany

export async function getByArticle(prisma, tenantId, articleId) { ... }
// 1. Fetch article (verify exists + belongs to tenant + stockTracking=true)
// 2. Call repo.findActiveByArticle
// 3. Call repo.sumActiveQuantity
// 4. For each reservation, fetch billing document info (number, address.company)
//    via prisma.billingDocument.findMany({ where: { id: { in: documentIds }, tenantId } })
// 5. Return { reservations, currentStock, reservedStock, availableStock }

export async function getAvailableStock(prisma, tenantId, articleId) { ... }
// 1. Fetch article (verify stockTracking)
// 2. Sum active reservations
// 3. Return { currentStock, reservedStock, availableStock }

// --- Mutation Functions ---

export async function createReservationsForDocument(prisma, tenantId, documentId, userId) { ... }
// Called from billing-document-service.ts finalize() for ORDER_CONFIRMATION
// Steps:
//   1. Fetch document with positions: prisma.billingDocument.findFirst({
//        where: { id: documentId, tenantId, type: "ORDER_CONFIRMATION" },
//        include: { positions: true }
//      })
//   2. If not ORDER_CONFIRMATION, return (no-op)
//   3. Filter positions: type === "ARTICLE" && articleId != null && quantity > 0
//   4. For each filtered position:
//      a. Fetch WhArticle: prisma.whArticle.findFirst({ where: { id: pos.articleId, tenantId } })
//      b. Skip if article not found or stockTracking === false
//      c. Create reservation via repo.create({
//           tenantId, articleId: pos.articleId!, documentId, positionId: pos.id,
//           quantity: pos.quantity!, createdById: userId
//         })
//   5. Return { reservedCount: number }
// NOTE: Run in $transaction for atomicity

export async function releaseReservationsForDeliveryNote(prisma, tenantId, deliveryNoteId, userId) { ... }
// Called from billing-document-service.ts forward() when target is DELIVERY_NOTE
// Steps:
//   1. Fetch delivery note: prisma.billingDocument.findFirst({
//        where: { id: deliveryNoteId, tenantId },
//        select: { parentDocumentId: true, type: true }
//      })
//   2. If no parentDocumentId or type !== "DELIVERY_NOTE", return (no-op)
//   3. The parent is the ORDER_CONFIRMATION — release its reservations:
//      repo.releaseAllByDocument(prisma, tenantId, parentDocumentId, {
//        status: "FULFILLED", releasedAt: new Date(), releasedById: userId,
//        releaseReason: "DELIVERY_NOTE"
//      })
//   4. Return { releasedCount }

export async function releaseReservationsForCancel(prisma, tenantId, documentId, userId?) { ... }
// Called from billing-document-service.ts cancel() for ORDER_CONFIRMATION
// Steps:
//   1. Release all active reservations for this document:
//      repo.releaseAllByDocument(prisma, tenantId, documentId, {
//        status: "RELEASED", releasedAt: new Date(), releasedById: userId ?? null,
//        releaseReason: "CANCELLED"
//      })
//   2. Return { releasedCount }

export async function release(prisma, tenantId, id, userId, reason?) { ... }
// Manual release of a single reservation
// Steps:
//   1. Fetch reservation: repo.findById(prisma, tenantId, id)
//   2. If not found, throw WhReservationNotFoundError
//   3. If status !== "ACTIVE", throw WhReservationValidationError("Only active reservations can be released")
//   4. Update: repo.update(prisma, tenantId, id, {
//        status: "RELEASED", releasedAt: new Date(), releasedById: userId,
//        releaseReason: reason || "MANUAL"
//      })

export async function releaseBulk(prisma, tenantId, documentId, userId, reason?) { ... }
// Manual bulk release of all active reservations for a document
// Steps:
//   1. Verify document belongs to tenant
//   2. repo.releaseAllByDocument(prisma, tenantId, documentId, {
//        status: "RELEASED", releasedAt: new Date(), releasedById: userId,
//        releaseReason: reason || "MANUAL"
//      })
//   3. Return { releasedCount }
```

### Step 2.3: Integrate into billing-document-service.ts — finalize()

**File:** `src/lib/services/billing-document-service.ts`

**Import (add at top, line ~11):**
```ts
import * as reservationService from "./wh-reservation-service"
```

**Insert after the DELIVERY_NOTE stock booking block (after line ~609, before audit log):**

```ts
  // AUTO reservation for ORDER_CONFIRMATION (best-effort, outside transaction)
  if (docType === "ORDER_CONFIRMATION") {
    try {
      await reservationService.createReservationsForDocument(
        prisma, tenantId, id, finalizedById
      )
    } catch (err) {
      console.error(`Auto reservation failed for order confirmation ${id}`, err)
    }
  }
```

**Pattern reference:** This exactly mirrors the DELIVERY_NOTE stock booking pattern at lines 594-609 — best-effort, outside the main transaction, error logged but not thrown.

### Step 2.4: Integrate into billing-document-service.ts — forward()

**File:** `src/lib/services/billing-document-service.ts`

**Insert after the audit log in forward() (after line ~741, before the return):**

```ts
  // Release reservations when ORDER_CONFIRMATION is forwarded to DELIVERY_NOTE
  if (targetType === "DELIVERY_NOTE") {
    try {
      await reservationService.releaseReservationsForDeliveryNote(
        prisma, tenantId, newDoc.id, createdById
      )
    } catch (err) {
      console.error(`Reservation release failed for delivery note ${newDoc.id}`, err)
    }
  }
```

**Important:** `newDoc.id` is the new delivery note. The service function will look up its `parentDocumentId` to find the source ORDER_CONFIRMATION and release that document's reservations.

### Step 2.5: Integrate into billing-document-service.ts — cancel()

**File:** `src/lib/services/billing-document-service.ts`

**Insert after the audit log in cancel() (after line ~804, before `return updated`):**

```ts
  // Release reservations when ORDER_CONFIRMATION is cancelled
  try {
    await reservationService.releaseReservationsForCancel(
      prisma, tenantId, id, audit?.userId
    )
  } catch (err) {
    console.error(`Reservation release failed for cancelled document ${id}`, err)
  }
```

**Note:** We call this for ALL document types (not just ORDER_CONFIRMATION) — the service function is a no-op if there are no active reservations for the document. This is simpler and handles edge cases where the document type might not be available in the cancel() scope.

### Step 2.6: Integrate into wh-correction-service.ts — Uncomment ORPHAN_RESERVATION check

**File:** `src/lib/services/wh-correction-service.ts`

**Changes:**

1. **Line 34:** Uncomment the constant:
```ts
const CHECK_ORPHAN_RESERVATION = "ORPHAN_RESERVATION"
```

2. **Line ~179:** Add `checkOrphanReservations` to the checks array:
```ts
const checks = [
  checkNegativeStock,
  checkDuplicateReceipts,
  checkOverdueOrders,
  checkUnmatchedReceipts,
  checkStockMismatch,
  checkLowStockNoOrder,
  checkOrphanReservations,
]
```

3. **Add new check function (after the existing check functions):**
```ts
async function checkOrphanReservations(
  prisma: PrismaClient,
  tenantId: string
): Promise<DetectedIssue[]> {
  const orphans = await reservationRepo.findOrphanReservations(prisma, tenantId)
  return orphans.map((row) => ({
    code: CHECK_ORPHAN_RESERVATION,
    severity: "WARNING" as WhCorrectionSeverity,
    message: `Reservierung für Artikel ${row.articleNumber} (Beleg ${row.documentNumber}) ist noch aktiv, obwohl der Beleg storniert/weitergeleitet wurde`,
    articleId: row.articleId,
    documentId: row.documentId,
    details: {
      reservationId: row.id,
      quantity: row.quantity,
      documentStatus: row.documentStatus,
    },
  }))
}
```

4. **Add import at top:**
```ts
import * as reservationRepo from "./wh-reservation-repository"
```

### Verification (Phase 2)
- [ ] `pnpm typecheck` passes (no new errors)
- [ ] All imports resolve correctly
- [ ] Service functions follow tenant isolation pattern (tenantId on every query)

---

## Phase 3: tRPC Router & Permissions

**Goal:** Expose reservation operations via tRPC and add permission entries.

### Step 3.1: Permission Catalog

**File:** `src/lib/auth/permission-catalog.ts` (line ~305, before the closing `]`)

**Insert after the Warehouse Corrections block:**

```ts
  // Warehouse Reservations
  p("wh_reservations.view", "wh_reservations", "view", "View stock reservations"),
  p("wh_reservations.manage", "wh_reservations", "manage", "Manage/release stock reservations"),
```

### Step 3.2: Permission Migration

**File (NEW):** `supabase/migrations/20260407100001_add_wh_reservation_permissions_to_groups.sql`

```sql
-- WH_10: Add reservation permissions to default user groups
-- Pattern: same as 20260402100000_add_wh_correction_permissions_to_groups.sql

-- Get permission IDs
DO $$
DECLARE
  perm_view_id UUID;
  perm_manage_id UUID;
BEGIN
  SELECT id INTO perm_view_id FROM permissions WHERE key = 'wh_reservations.view';
  SELECT id INTO perm_manage_id FROM permissions WHERE key = 'wh_reservations.manage';

  -- Admin groups get both permissions
  INSERT INTO user_group_permissions (user_group_id, permission_id)
  SELECT ug.id, p.id
  FROM user_groups ug
  CROSS JOIN (VALUES (perm_view_id), (perm_manage_id)) AS p(id)
  WHERE ug.name IN ('Administratoren', 'Administrators', 'Admin')
  ON CONFLICT DO NOTHING;

  -- Standard user groups get view only
  INSERT INTO user_group_permissions (user_group_id, permission_id)
  SELECT ug.id, perm_view_id
  FROM user_groups ug
  WHERE ug.name IN ('Benutzer', 'Users', 'Mitarbeiter', 'Employees')
  ON CONFLICT DO NOTHING;
END $$;
```

**Note:** Permissions are auto-seeded when the app starts (from `permission-catalog.ts`), but the migration ensures existing user groups get the new permissions assigned.

### Step 3.3: tRPC Router

**File (NEW):** `src/trpc/routers/warehouse/reservations.ts`

```ts
/**
 * Warehouse Reservations Router
 *
 * tRPC procedures for stock reservation (Artikelreservierungen) operations.
 * All procedures require warehouse module and appropriate permissions.
 */
import { z } from "zod"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { handleServiceError } from "@/trpc/errors"
import { requirePermission } from "@/lib/auth/middleware"
import { requireModule } from "@/lib/modules"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import * as reservationService from "@/lib/services/wh-reservation-service"
import type { PrismaClient } from "@/generated/prisma/client"

const WH_RESERVATIONS_VIEW = permissionIdByKey("wh_reservations.view")!
const WH_RESERVATIONS_MANAGE = permissionIdByKey("wh_reservations.manage")!

const whProcedure = tenantProcedure.use(requireModule("warehouse"))

export const whReservationsRouter = createTRPCRouter({
  list: whProcedure
    .use(requirePermission(WH_RESERVATIONS_VIEW))
    .input(z.object({
      articleId: z.string().uuid().optional(),
      documentId: z.string().uuid().optional(),
      status: z.enum(["ACTIVE", "RELEASED", "FULFILLED"]).optional(),
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(100).default(25),
    }))
    .query(async ({ ctx, input }) => {
      try {
        return await reservationService.list(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  getByArticle: whProcedure
    .use(requirePermission(WH_RESERVATIONS_VIEW))
    .input(z.object({ articleId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      try {
        return await reservationService.getByArticle(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.articleId
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  release: whProcedure
    .use(requirePermission(WH_RESERVATIONS_MANAGE))
    .input(z.object({
      id: z.string().uuid(),
      reason: z.string().max(500).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await reservationService.release(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id,
          ctx.user!.id,
          input.reason
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  releaseBulk: whProcedure
    .use(requirePermission(WH_RESERVATIONS_MANAGE))
    .input(z.object({
      documentId: z.string().uuid(),
      reason: z.string().max(500).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await reservationService.releaseBulk(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.documentId,
          ctx.user!.id,
          input.reason
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),
})
```

### Step 3.4: Register Router in Warehouse Index

**File:** `src/trpc/routers/warehouse/index.ts`

Add import:
```ts
import { whReservationsRouter } from "./reservations"
```

Add to createTRPCRouter:
```ts
  reservations: whReservationsRouter,
```

### Step 3.5: React Query Hooks

**File (NEW):** `src/hooks/use-wh-reservations.ts`

```ts
import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

// ==================== Query Hooks ====================

export function useWhReservations(
  options?: {
    articleId?: string
    documentId?: string
    status?: "ACTIVE" | "RELEASED" | "FULFILLED"
    page?: number
    pageSize?: number
  },
  enabled = true
) {
  const trpc = useTRPC()
  return useQuery(
    trpc.warehouse.reservations.list.queryOptions(
      {
        articleId: options?.articleId,
        documentId: options?.documentId,
        status: options?.status,
        page: options?.page ?? 1,
        pageSize: options?.pageSize ?? 25,
      },
      { enabled }
    )
  )
}

export function useWhArticleAvailableStock(articleId: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.warehouse.reservations.getByArticle.queryOptions(
      { articleId },
      { enabled: enabled && !!articleId }
    )
  )
}

// ==================== Mutation Hooks ====================

export function useReleaseWhReservation() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.warehouse.reservations.release.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.reservations.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.reservations.getByArticle.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.articles.getById.queryKey(),
      })
    },
  })
}

export function useReleaseWhReservationsBulk() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.warehouse.reservations.releaseBulk.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.reservations.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.reservations.getByArticle.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.articles.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.articles.getById.queryKey(),
      })
    },
  })
}
```

### Step 3.6: Re-export Hooks from Index

**File:** `src/hooks/index.ts` (after the `use-wh-corrections` re-export block, line ~934)

```ts
// Warehouse Reservations
export {
  useWhReservations,
  useWhArticleAvailableStock,
  useReleaseWhReservation,
  useReleaseWhReservationsBulk,
} from './use-wh-reservations'
```

### Verification (Phase 3)
- [ ] `pnpm typecheck` passes (no new errors)
- [ ] `permissionIdByKey("wh_reservations.view")` resolves (not undefined)
- [ ] `permissionIdByKey("wh_reservations.manage")` resolves (not undefined)
- [ ] Router is accessible at `trpc.warehouse.reservations.*`

---

## Phase 4: UI Components

**Goal:** Show reservation info in the article detail and create a reservations overview page.

### Step 4.1: i18n Translations

**File:** `messages/de.json`

Add new namespace `warehouseReservations` (alongside existing `warehouseArticles`, etc.):

```json
"warehouseReservations": {
  "pageTitle": "Reservierungen",
  "tabReservations": "Reservierungen",
  "labelPhysicalStock": "Physischer Bestand",
  "labelReservedStock": "Reserviert",
  "labelAvailableStock": "Verfuegbar",
  "labelDocument": "Beleg",
  "labelCustomer": "Kunde",
  "labelQuantity": "Menge",
  "labelDate": "Datum",
  "labelStatus": "Status",
  "labelReason": "Grund",
  "statusActive": "Aktiv",
  "statusReleased": "Freigegeben",
  "statusFulfilled": "Erfuellt",
  "actionRelease": "Freigeben",
  "actionReleaseBulk": "Alle freigeben",
  "dialogReleaseTitle": "Reservierung freigeben",
  "dialogReleaseDescription": "Moechten Sie diese Reservierung wirklich freigeben?",
  "dialogReleaseReasonLabel": "Grund (optional)",
  "dialogReleaseConfirm": "Freigeben",
  "alertInsufficientStock": "Verfuegbarer Bestand nicht ausreichend",
  "emptyState": "Keine Reservierungen vorhanden",
  "filterArticle": "Artikel",
  "filterDocument": "Beleg",
  "filterStatus": "Status"
}
```

**File:** `messages/en.json` — Add corresponding English translations.

### Step 4.2: Enhanced Stock Display in Article Detail

**File:** `src/components/warehouse/article-detail.tsx`

**Change the Stock Info Card (lines 200-214):**

Replace the existing stock card with an enhanced version that:
1. Imports and calls `useWhArticleAvailableStock(articleId)`
2. Shows three rows: Physischer Bestand, Reserviert (orange Badge if > 0), Verfuegbar
3. Shows a warning if `availableStock < 0`

```tsx
{article.stockTracking && (
  <StockInfoCard articleId={articleId} article={article} />
)}
```

**File (NEW):** `src/components/warehouse/article-stock-info-card.tsx`

A small card component that:
- Uses `useWhArticleAvailableStock(articleId)` for the reservation data
- Falls back to just `currentStock` if the query is loading/errored
- Shows:
  - "Physischer Bestand: 150"
  - "Reserviert: 30" (with orange `<Badge variant="outline" className="text-orange-600 border-orange-300">`)
  - "Verfuegbar: 120"
  - min stock warning (existing behavior)
  - "Bestand nicht ausreichend" warning if availableStock < 0

### Step 4.3: Reservations Tab in Article Detail

**File:** `src/components/warehouse/article-detail.tsx`

Add tab trigger and content (after the "stock" tab, line ~169):

```tsx
<TabsTrigger value="reservations">{tRes('tabReservations')}</TabsTrigger>
```

```tsx
<TabsContent value="reservations" className="mt-4">
  <ArticleReservationsTab articleId={articleId} />
</TabsContent>
```

**File (NEW):** `src/components/warehouse/article-reservations-tab.tsx`

Component that:
- Uses `useWhArticleAvailableStock(articleId)` to get reservations
- Shows a table with columns: Beleg-Nr, Kunde, Menge, Datum, Status, Actions
- Each ACTIVE row has a "Freigeben" button that opens a release dialog
- Uses `useReleaseWhReservation()` mutation
- Empty state: "Keine aktiven Reservierungen"

### Step 4.4: Reservations Overview Page

**File (NEW):** `src/app/[locale]/(dashboard)/warehouse/reservations/page.tsx`

Page structure (following the pattern of `warehouse/stock-movements/page.tsx`):
- Permission check: `wh_reservations.view`
- Title: "Reservierungen"
- Filters: Article (search/select), Document number, Status dropdown
- Table: Article Nr, Article Name, Beleg-Nr, Kunde, Menge, Status, Erstellt am, Actions
- ACTIVE rows show "Freigeben" button
- Bulk release button per document group
- Uses `useWhReservations(filters)`, `useReleaseWhReservation()`, `useReleaseWhReservationsBulk()`

### Step 4.5: Navigation Entry

**File:** Find the warehouse navigation/sidebar configuration and add "Reservierungen" link to `/warehouse/reservations`.

This will likely be in the sidebar nav config or a layout file. Pattern: follow how "Korrekturen" or "Lagerbewegungen" are added.

### Verification (Phase 4)
- [ ] Dev server starts without errors (`pnpm dev`)
- [ ] Article detail shows enhanced stock info with reservations data
- [ ] Reservations tab appears in article detail
- [ ] `/warehouse/reservations` page loads
- [ ] Navigation sidebar shows "Reservierungen" link
- [ ] Manual release works from both article detail and overview page

---

## Phase 5: Tests

**Goal:** Verify business logic, tenant isolation, and router integration.

### Step 5.1: Service Tests

**File (NEW):** `src/lib/services/__tests__/wh-reservation-service.test.ts`

**Pattern:** Follow `src/lib/services/__tests__/wh-stock-movement-service.test.ts`

```ts
import { describe, it, expect, vi } from "vitest"
import * as service from "../wh-reservation-service"
import type { PrismaClient } from "@/generated/prisma/client"

const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const OTHER_TENANT_ID = "ff000000-0000-4000-a000-000000000999"
const USER_ID = "a0000000-0000-4000-a000-000000000001"
const ARTICLE_ID = "b1000000-0000-4000-a000-000000000001"
const DOCUMENT_ID = "c1000000-0000-4000-a000-000000000001"
const POSITION_ID = "d1000000-0000-4000-a000-000000000001"
const RESERVATION_ID = "e1000000-0000-4000-a000-000000000001"

// Mock data, mock Prisma factory, then tests...
```

**Test cases:**

```ts
describe("wh-reservation-service", () => {

  describe("createReservationsForDocument", () => {
    it("creates reservation for each ARTICLE position with stockTracking", ...)
    it("skips positions without articleId", ...)
    it("skips positions where article has stockTracking=false", ...)
    it("skips non-ORDER_CONFIRMATION documents", ...)
    it("returns { reservedCount: N } for N articles reserved", ...)
  })

  describe("getAvailableStock", () => {
    it("returns currentStock - reservedStock as availableStock", ...)
    it("counts only ACTIVE reservations (not RELEASED or FULFILLED)", ...)
    it("returns 0 reservedStock when no reservations exist", ...)
  })

  describe("release", () => {
    it("sets status=RELEASED with reason and timestamp", ...)
    it("throws WhReservationNotFoundError for unknown id", ...)
    it("throws WhReservationValidationError for non-ACTIVE reservation", ...)
    it("uses 'MANUAL' as default reason when none provided", ...)
  })

  describe("releaseReservationsForDeliveryNote", () => {
    it("releases parent AB reservations when delivery note is created", ...)
    it("sets status=FULFILLED with releaseReason=DELIVERY_NOTE", ...)
    it("is no-op when delivery note has no parentDocumentId", ...)
  })

  describe("releaseReservationsForCancel", () => {
    it("releases all active reservations for cancelled document", ...)
    it("sets status=RELEASED with releaseReason=CANCELLED", ...)
    it("is no-op when document has no reservations", ...)
  })

  describe("releaseBulk", () => {
    it("releases all active reservations for a document", ...)
    it("returns { releasedCount } with correct count", ...)
  })

  // MANDATORY: Tenant isolation tests
  describe("tenant isolation", () => {
    it("list — returns only reservations for the given tenant", ...)
    it("getByArticle — returns empty for article belonging to other tenant", ...)
    it("release — throws NotFoundError for reservation from other tenant", ...)
    it("getAvailableStock — only sums reservations for the given tenant", ...)
  })
})
```

### Step 5.2: Router Tests

**File (NEW):** `src/trpc/routers/__tests__/whReservations-router.test.ts`

**Pattern:** Follow existing router test patterns.

```ts
describe("warehouse.reservations", () => {
  it("list — requires wh_reservations.view permission", ...)
  it("list — returns paginated results", ...)
  it("getByArticle — returns available stock info", ...)
  it("release — requires wh_reservations.manage permission", ...)
  it("release — sets RELEASED with reason", ...)
  it("releaseBulk — releases all reservations for document", ...)
})
```

### Step 5.3: Billing Document Service Integration Tests

**File:** `src/lib/services/__tests__/billing-document-service.test.ts`

**Add tests for the new integration points:**

```ts
describe("finalize — reservation integration", () => {
  it("creates reservations after finalizing ORDER_CONFIRMATION", ...)
  it("does not create reservations for DELIVERY_NOTE", ...)
  it("handles reservation creation failure gracefully (best-effort)", ...)
})

describe("forward — reservation integration", () => {
  it("releases reservations when forwarding AB to DELIVERY_NOTE", ...)
  it("does not release reservations when forwarding to SERVICE_NOTE", ...)
})

describe("cancel — reservation integration", () => {
  it("releases reservations when cancelling ORDER_CONFIRMATION", ...)
})
```

**Note:** These tests will mock `wh-reservation-service` to verify it is called correctly:
```ts
vi.mock("../wh-reservation-service", () => ({
  createReservationsForDocument: vi.fn().mockResolvedValue({ reservedCount: 2 }),
  releaseReservationsForDeliveryNote: vi.fn().mockResolvedValue({ releasedCount: 2 }),
  releaseReservationsForCancel: vi.fn().mockResolvedValue({ releasedCount: 2 }),
}))
```

### Step 5.4: Run Tests

```bash
# Run reservation service tests
pnpm vitest run src/lib/services/__tests__/wh-reservation-service.test.ts

# Run router tests
pnpm vitest run src/trpc/routers/__tests__/whReservations-router.test.ts

# Run billing document tests (ensure no regressions)
pnpm vitest run src/lib/services/__tests__/billing-document-service.test.ts

# Run full test suite
pnpm test
```

### Verification (Phase 5)
- [ ] All new tests pass
- [ ] No regressions in existing billing document tests
- [ ] Tenant isolation tests verify cross-tenant access is blocked
- [ ] `pnpm typecheck` passes

---

## Implementation Order & Dependencies

```
Phase 1 (Database)
  1.1-1.3  Prisma schema changes
  1.4      Migration SQL
  1.5      Regenerate client
    |
    v
Phase 2 (Backend Logic)
  2.1  Repository
  2.2  Service
  2.3  finalize() integration
  2.4  forward() integration
  2.5  cancel() integration
  2.6  Correction assistant integration
    |
    v
Phase 3 (API Layer)          Phase 5 (Tests) — can start in parallel
  3.1  Permission catalog       5.1  Service tests
  3.2  Permission migration     5.2  Router tests (after 3.3)
  3.3  Router                   5.3  Integration tests
  3.4  Register router
  3.5  Hooks
  3.6  Hook index re-export
    |
    v
Phase 4 (UI)
  4.1  i18n translations
  4.2  Stock info card
  4.3  Reservations tab
  4.4  Overview page
  4.5  Navigation entry
```

---

## Files Summary

### New Files (8)

| # | File | Phase |
|---|------|-------|
| 1 | `supabase/migrations/20260407100000_wh_stock_reservations.sql` | 1.4 |
| 2 | `src/lib/services/wh-reservation-repository.ts` | 2.1 |
| 3 | `src/lib/services/wh-reservation-service.ts` | 2.2 |
| 4 | `supabase/migrations/20260407100001_add_wh_reservation_permissions_to_groups.sql` | 3.2 |
| 5 | `src/trpc/routers/warehouse/reservations.ts` | 3.3 |
| 6 | `src/hooks/use-wh-reservations.ts` | 3.5 |
| 7 | `src/components/warehouse/article-stock-info-card.tsx` | 4.2 |
| 8 | `src/components/warehouse/article-reservations-tab.tsx` | 4.3 |
| 9 | `src/app/[locale]/(dashboard)/warehouse/reservations/page.tsx` | 4.4 |
| 10 | `src/lib/services/__tests__/wh-reservation-service.test.ts` | 5.1 |
| 11 | `src/trpc/routers/__tests__/whReservations-router.test.ts` | 5.2 |

### Modified Files (10)

| # | File | Phase | Change |
|---|------|-------|--------|
| 1 | `prisma/schema.prisma` | 1.1-1.3 | Add WhStockReservation model + relations on Tenant and WhArticle |
| 2 | `src/lib/services/billing-document-service.ts` | 2.3-2.5 | Add reservation hooks in finalize(), forward(), cancel() |
| 3 | `src/lib/services/wh-correction-service.ts` | 2.6 | Uncomment + implement ORPHAN_RESERVATION check |
| 4 | `src/lib/auth/permission-catalog.ts` | 3.1 | Add wh_reservations.view and wh_reservations.manage |
| 5 | `src/trpc/routers/warehouse/index.ts` | 3.4 | Register reservations sub-router |
| 6 | `src/hooks/index.ts` | 3.6 | Re-export reservation hooks |
| 7 | `src/components/warehouse/article-detail.tsx` | 4.2-4.3 | Enhanced stock display + reservations tab |
| 8 | `messages/de.json` | 4.1 | German translations for reservations |
| 9 | `messages/en.json` | 4.1 | English translations for reservations |
| 10 | `src/lib/services/__tests__/billing-document-service.test.ts` | 5.3 | Integration test additions |

---

## Risk Notes

1. **articleId on BillingDocumentPosition is NOT a formal Prisma relation** — the reservation service must handle this: it reads `pos.articleId` as a plain string UUID and queries `WhArticle` separately. Cannot use Prisma includes.

2. **documentId on WhStockReservation is NOT a formal FK** — intentional design to keep warehouse loosely coupled from billing. The orphan reservation check in the correction assistant uses a raw query to join.

3. **Best-effort pattern** — all reservation creation/release in finalize/forward/cancel is wrapped in try/catch. A failure must never block the main billing operation. Log the error and continue.

4. **PARTIALLY_FORWARDED status** — when an ORDER_CONFIRMATION is partially forwarded (only some positions go to a delivery note), the current implementation releases ALL reservations for the document. This is acceptable for v1; partial release tracking would be a future enhancement.

5. **Concurrent stock reservations** — Two ORDER_CONFIRMATIONs can reserve the same article simultaneously. The `availableStock` can go negative — this is shown as a warning, not a hard block (matching ZMI behavior where overselling is possible but flagged).
