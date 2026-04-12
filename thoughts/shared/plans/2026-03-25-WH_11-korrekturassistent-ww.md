# WH_11 Implementation Plan: Korrekturassistent fur Warenwirtschaft

**Date:** 2026-03-25
**Ticket:** WH_11
**Complexity:** M
**Dependencies:** WH_01 (Articles), WH_04 (Wareneingang), WH_05 (Lagerentnahmen)

---

## Overview

Implement a warehouse correction assistant that automatically detects stock discrepancies, duplicate receipts, overdue orders, and other warehouse data issues. Follows the existing time-tracking correction assistant pattern but adapted for warehouse domain with per-run issue tracking instead of a message catalog overlay pattern.

**Key design difference from time-tracking correction assistant:** The time-tracking assistant uses a message *catalog* (`CorrectionMessage`) with `defaultText`/`customText`/`isActive` for error codes that overlay onto `DailyValue.errorCodes`. The warehouse assistant instead creates concrete *issue messages* (`WhCorrectionMessage`) per detected problem, with a status lifecycle (OPEN -> RESOLVED/DISMISSED/IGNORED). Each message links to a specific article/document. This is a fundamentally different pattern: the time-tracking assistant reads errors already stored on DailyValue records, while the warehouse assistant actively *detects* issues via SQL queries and *creates* records for them.

---

## Phase 1: Database — Migration + Prisma Schema

### 1.1 Create Supabase Migration

**File:** `supabase/migrations/20260402100000_wh_correction_tables.sql`

```sql
-- WH_11: Warehouse Correction Assistant tables

-- Enum: severity levels for correction messages
CREATE TYPE wh_correction_severity AS ENUM ('ERROR', 'WARNING', 'INFO');

-- Enum: status lifecycle for correction messages
CREATE TYPE wh_correction_status AS ENUM ('OPEN', 'RESOLVED', 'DISMISSED', 'IGNORED');

-- Correction run: one row per check execution (cron or manual)
CREATE TABLE wh_correction_runs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  started_at      timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz,
  trigger         varchar(20) NOT NULL,       -- 'MANUAL' or 'CRON'
  checks_run      int NOT NULL DEFAULT 0,
  issues_found    int NOT NULL DEFAULT 0,
  triggered_by_id uuid
);

CREATE INDEX idx_wh_correction_runs_tenant ON wh_correction_runs(tenant_id);
CREATE INDEX idx_wh_correction_runs_tenant_started ON wh_correction_runs(tenant_id, started_at);

-- Correction message: one row per detected issue
CREATE TABLE wh_correction_messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  run_id          uuid REFERENCES wh_correction_runs(id) ON DELETE SET NULL,
  code            varchar(50) NOT NULL,       -- e.g. 'NEGATIVE_STOCK', 'DUPLICATE_RECEIPT'
  severity        wh_correction_severity NOT NULL,
  status          wh_correction_status NOT NULL DEFAULT 'OPEN',
  message         text NOT NULL,              -- Human-readable description
  article_id      uuid,                       -- FK to wh_articles (optional, for article-related issues)
  document_id     uuid,                       -- FK to purchase order or other document (optional)
  details         jsonb,                       -- Additional structured data (expected vs actual, etc.)
  resolved_at     timestamptz,
  resolved_by_id  uuid,
  resolved_note   text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_wh_correction_messages_tenant_status ON wh_correction_messages(tenant_id, status);
CREATE INDEX idx_wh_correction_messages_tenant_code ON wh_correction_messages(tenant_id, code);
CREATE INDEX idx_wh_correction_messages_tenant_article ON wh_correction_messages(tenant_id, article_id);
```

### 1.2 Update Prisma Schema

**File:** `prisma/schema.prisma`

**Add after the `WhSupplierPayment` model (end of file, line ~4521):**

```prisma
// -----------------------------------------------------------------------------
// WhCorrectionRun
// -----------------------------------------------------------------------------
// Migration: 20260402100000_wh_correction_tables
//
// Tracks each execution of warehouse correction checks.

model WhCorrectionRun {
  id            String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId      String    @map("tenant_id") @db.Uuid
  startedAt     DateTime  @default(now()) @map("started_at") @db.Timestamptz(6)
  completedAt   DateTime? @map("completed_at") @db.Timestamptz(6)
  trigger       String    @db.VarChar(20)
  checksRun     Int       @default(0) @map("checks_run")
  issuesFound   Int       @default(0) @map("issues_found")
  triggeredById String?   @map("triggered_by_id") @db.Uuid

  tenant   Tenant                 @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  messages WhCorrectionMessage[]

  @@index([tenantId])
  @@index([tenantId, startedAt])
  @@map("wh_correction_runs")
}

// -----------------------------------------------------------------------------
// WhCorrectionMessage
// -----------------------------------------------------------------------------
// Migration: 20260402100000_wh_correction_tables
//
// Individual issue detected by the warehouse correction assistant.
// Has a status lifecycle: OPEN -> RESOLVED / DISMISSED / IGNORED.

enum WhCorrectionSeverity {
  ERROR
  WARNING
  INFO

  @@map("wh_correction_severity")
}

enum WhCorrectionStatus {
  OPEN
  RESOLVED
  DISMISSED
  IGNORED

  @@map("wh_correction_status")
}

model WhCorrectionMessage {
  id            String                @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId      String                @map("tenant_id") @db.Uuid
  runId         String?               @map("run_id") @db.Uuid
  code          String                @db.VarChar(50)
  severity      WhCorrectionSeverity
  status        WhCorrectionStatus    @default(OPEN)
  message       String                @db.Text
  articleId     String?               @map("article_id") @db.Uuid
  documentId    String?               @map("document_id") @db.Uuid
  details       Json?                 @db.JsonB
  resolvedAt    DateTime?             @map("resolved_at") @db.Timestamptz(6)
  resolvedById  String?               @map("resolved_by_id") @db.Uuid
  resolvedNote  String?               @map("resolved_note") @db.Text
  createdAt     DateTime              @default(now()) @map("created_at") @db.Timestamptz(6)

  tenant Tenant            @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  run    WhCorrectionRun?  @relation(fields: [runId], references: [id], onDelete: SetNull)

  @@index([tenantId, status])
  @@index([tenantId, code])
  @@index([tenantId, articleId])
  @@map("wh_correction_messages")
}
```

**Add to Tenant model relations (after `whArticleImages WhArticleImage[]` at line ~200):**

```prisma
  whCorrectionRuns            WhCorrectionRun[]
  whCorrectionMessages        WhCorrectionMessage[]
```

### 1.3 Regenerate Prisma Client

```bash
pnpm db:generate
```

### Verification (Phase 1)

- [ ] Migration file creates both tables with correct columns, indexes, and enum types
- [ ] Prisma schema compiles: `pnpm db:generate` succeeds
- [ ] Typecheck passes with new models: `pnpm typecheck` (ignore pre-existing ~1463 errors)

---

## Phase 2: Permissions

### 2.1 Add Permissions to Catalog

**File:** `src/lib/auth/permission-catalog.ts`

**After the `wh_supplier_invoices.pay` permission (line 299), add:**

```typescript
  // Warehouse Corrections
  p("wh_corrections.view", "wh_corrections", "view", "View warehouse correction assistant"),
  p("wh_corrections.manage", "wh_corrections", "manage", "Manage warehouse correction messages"),
  p("wh_corrections.run", "wh_corrections", "run", "Run warehouse correction checks"),
```

**Update the comment on line 41 from `All 90 permissions` to `All 93 permissions`.**

### Verification (Phase 2)

- [ ] `permissionIdByKey("wh_corrections.view")` returns a UUID
- [ ] `permissionIdByKey("wh_corrections.manage")` returns a UUID
- [ ] `permissionIdByKey("wh_corrections.run")` returns a UUID
- [ ] Typecheck still passes

---

## Phase 3: Repository

### 3.1 Create Repository

**File:** `src/lib/services/wh-correction-repository.ts`

Follow the pattern from `src/lib/services/correction-assistant-repository.ts` but for warehouse correction models.

```typescript
/**
 * Warehouse Correction Repository
 *
 * Pure Prisma data-access functions for WhCorrectionMessage and WhCorrectionRun.
 */
import type { PrismaClient, WhCorrectionSeverity, WhCorrectionStatus } from "@/generated/prisma/client"
import { tenantScopedUpdate } from "@/lib/services/prisma-helpers"

// --- Run functions ---

export async function createRun(
  prisma: PrismaClient,
  data: {
    tenantId: string
    trigger: string
    triggeredById?: string | null
  }
) {
  return prisma.whCorrectionRun.create({
    data: {
      tenantId: data.tenantId,
      trigger: data.trigger,
      triggeredById: data.triggeredById ?? null,
    },
  })
}

export async function completeRun(
  prisma: PrismaClient,
  runId: string,
  checksRun: number,
  issuesFound: number
) {
  return prisma.whCorrectionRun.update({
    where: { id: runId },
    data: {
      completedAt: new Date(),
      checksRun,
      issuesFound,
    },
  })
}

export async function findManyRuns(
  prisma: PrismaClient,
  tenantId: string,
  params: { page: number; pageSize: number }
) {
  const [items, total] = await Promise.all([
    prisma.whCorrectionRun.findMany({
      where: { tenantId },
      orderBy: { startedAt: "desc" },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
    }),
    prisma.whCorrectionRun.count({ where: { tenantId } }),
  ])
  return { items, total }
}

// --- Message functions ---

export async function createManyMessages(
  prisma: PrismaClient,
  data: Array<{
    tenantId: string
    runId: string
    code: string
    severity: WhCorrectionSeverity
    message: string
    articleId?: string | null
    documentId?: string | null
    details?: unknown
  }>
) {
  return prisma.whCorrectionMessage.createMany({ data })
}

export async function findManyMessages(
  prisma: PrismaClient,
  tenantId: string,
  params: {
    status?: WhCorrectionStatus
    severity?: WhCorrectionSeverity
    code?: string
    articleId?: string
    page: number
    pageSize: number
  }
) {
  const where: Record<string, unknown> = { tenantId }
  if (params.status) where.status = params.status
  if (params.severity) where.severity = params.severity
  if (params.code) where.code = params.code
  if (params.articleId) where.articleId = params.articleId

  const [items, total] = await Promise.all([
    prisma.whCorrectionMessage.findMany({
      where,
      orderBy: [{ severity: "asc" }, { createdAt: "desc" }],
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
    }),
    prisma.whCorrectionMessage.count({ where }),
  ])
  return { items, total }
}

export async function findMessageById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.whCorrectionMessage.findFirst({
    where: { id, tenantId },
  })
}

export async function updateMessageStatus(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: {
    status: WhCorrectionStatus
    resolvedById?: string | null
    resolvedNote?: string | null
    resolvedAt?: Date
  }
) {
  return tenantScopedUpdate(
    prisma.whCorrectionMessage,
    { id, tenantId },
    data,
    { entity: "WhCorrectionMessage" }
  )
}

export async function updateManyMessagesStatus(
  prisma: PrismaClient,
  tenantId: string,
  ids: string[],
  data: {
    status: WhCorrectionStatus
    resolvedById?: string | null
    resolvedNote?: string | null
    resolvedAt?: Date
  }
) {
  return prisma.whCorrectionMessage.updateMany({
    where: { id: { in: ids }, tenantId },
    data,
  })
}

export async function countOpenByTenantId(
  prisma: PrismaClient,
  tenantId: string
) {
  return prisma.whCorrectionMessage.count({
    where: { tenantId, status: "OPEN" },
  })
}

export async function countOpenGroupedBySeverity(
  prisma: PrismaClient,
  tenantId: string
) {
  return prisma.whCorrectionMessage.groupBy({
    by: ["severity"],
    where: { tenantId, status: "OPEN" },
    _count: { id: true },
  })
}

/**
 * Check if an OPEN message with the same code + articleId already exists.
 * Used for deduplication during check runs.
 */
export async function findOpenDuplicate(
  prisma: PrismaClient,
  tenantId: string,
  code: string,
  articleId: string | null,
  documentId: string | null
) {
  const where: Record<string, unknown> = {
    tenantId,
    code,
    status: "OPEN",
  }
  if (articleId) where.articleId = articleId
  else where.articleId = null
  if (documentId) where.documentId = documentId
  else where.documentId = null

  return prisma.whCorrectionMessage.findFirst({ where })
}

// --- Detection Queries (raw SQL for performance) ---

export async function findNegativeStockArticles(
  prisma: PrismaClient,
  tenantId: string
) {
  return prisma.$queryRaw<
    Array<{ id: string; number: string; name: string; current_stock: number }>
  >`
    SELECT id, number, name, current_stock
    FROM wh_articles
    WHERE tenant_id = ${tenantId}::uuid
      AND stock_tracking = true
      AND is_active = true
      AND current_stock < 0
  `
}

export async function findDuplicateReceipts(
  prisma: PrismaClient,
  tenantId: string
) {
  return prisma.$queryRaw<
    Array<{
      article_id: string
      purchase_order_id: string
      purchase_order_position_id: string
      cnt: number
      article_name: string
      article_number: string
    }>
  >`
    SELECT
      m.article_id,
      m.purchase_order_id,
      m.purchase_order_position_id,
      COUNT(*)::int AS cnt,
      a.name AS article_name,
      a.number AS article_number
    FROM wh_stock_movements m
    JOIN wh_articles a ON a.id = m.article_id
    WHERE m.tenant_id = ${tenantId}::uuid
      AND m.type = 'GOODS_RECEIPT'
      AND m.purchase_order_id IS NOT NULL
      AND m.purchase_order_position_id IS NOT NULL
    GROUP BY m.article_id, m.purchase_order_id, m.purchase_order_position_id, a.name, a.number
    HAVING COUNT(*) > 1
  `
}

export async function findOverdueOrders(
  prisma: PrismaClient,
  tenantId: string
) {
  return prisma.$queryRaw<
    Array<{
      id: string
      number: string
      supplier_id: string
      confirmed_delivery: Date | null
      requested_delivery: Date | null
    }>
  >`
    SELECT id, number, supplier_id, confirmed_delivery, requested_delivery
    FROM wh_purchase_orders
    WHERE tenant_id = ${tenantId}::uuid
      AND status IN ('ORDERED', 'PARTIALLY_RECEIVED')
      AND COALESCE(confirmed_delivery, requested_delivery) < NOW()
  `
}

export async function findUnmatchedReceipts(
  prisma: PrismaClient,
  tenantId: string
) {
  return prisma.$queryRaw<
    Array<{
      id: string
      article_id: string
      quantity: number
      date: Date
      article_name: string
      article_number: string
    }>
  >`
    SELECT m.id, m.article_id, m.quantity, m.date,
           a.name AS article_name, a.number AS article_number
    FROM wh_stock_movements m
    JOIN wh_articles a ON a.id = m.article_id
    WHERE m.tenant_id = ${tenantId}::uuid
      AND m.type = 'GOODS_RECEIPT'
      AND m.purchase_order_id IS NULL
  `
}

export async function findStockMismatches(
  prisma: PrismaClient,
  tenantId: string
) {
  return prisma.$queryRaw<
    Array<{
      id: string
      number: string
      name: string
      current_stock: number
      sum_movements: number
    }>
  >`
    SELECT a.id, a.number, a.name, a.current_stock,
           COALESCE(SUM(m.quantity), 0)::float AS sum_movements
    FROM wh_articles a
    LEFT JOIN wh_stock_movements m ON m.article_id = a.id AND m.tenant_id = a.tenant_id
    WHERE a.tenant_id = ${tenantId}::uuid
      AND a.stock_tracking = true
      AND a.is_active = true
    GROUP BY a.id, a.number, a.name, a.current_stock
    HAVING ABS(a.current_stock - COALESCE(SUM(m.quantity), 0)) > 0.001
  `
}

export async function findLowStockNoOrder(
  prisma: PrismaClient,
  tenantId: string
) {
  return prisma.$queryRaw<
    Array<{
      id: string
      number: string
      name: string
      current_stock: number
      min_stock: number
    }>
  >`
    SELECT a.id, a.number, a.name, a.current_stock, a.min_stock
    FROM wh_articles a
    WHERE a.tenant_id = ${tenantId}::uuid
      AND a.stock_tracking = true
      AND a.is_active = true
      AND a.min_stock IS NOT NULL
      AND a.current_stock < a.min_stock
      AND NOT EXISTS (
        SELECT 1 FROM wh_purchase_order_positions pop
        JOIN wh_purchase_orders po ON po.id = pop.purchase_order_id
        WHERE pop.article_id = a.id
          AND po.status IN ('DRAFT', 'ORDERED', 'PARTIALLY_RECEIVED')
          AND po.tenant_id = a.tenant_id
      )
  `
}
```

### Verification (Phase 3)

- [ ] File compiles without errors: `pnpm typecheck` (after Phase 1 Prisma generate)
- [ ] All functions accept `tenantId` parameter for tenant isolation
- [ ] Raw SQL queries all filter by `tenant_id`

---

## Phase 4: Service

### 4.1 Create Service

**File:** `src/lib/services/wh-correction-service.ts`

Follow the pattern from `src/lib/services/correction-assistant-service.ts` and `src/lib/services/wh-stock-movement-service.ts`.

```typescript
/**
 * Warehouse Correction Service
 *
 * Business logic for warehouse correction checks and message management.
 * Throws plain Error subclasses that are mapped by handleServiceError.
 */
import type { PrismaClient, WhCorrectionSeverity } from "@/generated/prisma/client"
import * as repo from "./wh-correction-repository"

// --- Error Classes (naming convention drives handleServiceError mapping) ---

export class WhCorrectionMessageNotFoundError extends Error {
  constructor(message = "Correction message not found") {
    super(message)
    this.name = "WhCorrectionMessageNotFoundError"
  }
}

export class WhCorrectionValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "WhCorrectionValidationError"
  }
}

// --- Check Code Constants ---

const CHECK_NEGATIVE_STOCK = "NEGATIVE_STOCK"
const CHECK_DUPLICATE_RECEIPT = "DUPLICATE_RECEIPT"
const CHECK_OVERDUE_ORDER = "OVERDUE_ORDER"
const CHECK_UNMATCHED_RECEIPT = "UNMATCHED_RECEIPT"
const CHECK_STOCK_MISMATCH = "STOCK_MISMATCH"
const CHECK_LOW_STOCK_NO_ORDER = "LOW_STOCK_NO_ORDER"
// const CHECK_ORPHAN_RESERVATION = "ORPHAN_RESERVATION"  // Deferred: WH_10 not implemented

// --- Types ---

interface DetectedIssue {
  code: string
  severity: WhCorrectionSeverity
  message: string
  articleId?: string | null
  documentId?: string | null
  details?: Record<string, unknown>
}

// --- Individual Check Functions ---

async function checkNegativeStock(
  prisma: PrismaClient,
  tenantId: string
): Promise<DetectedIssue[]> {
  const rows = await repo.findNegativeStockArticles(prisma, tenantId)
  return rows.map((row) => ({
    code: CHECK_NEGATIVE_STOCK,
    severity: "ERROR" as WhCorrectionSeverity,
    message: `Artikel ${row.number} "${row.name}" hat negativen Bestand: ${row.current_stock}`,
    articleId: row.id,
    details: { currentStock: row.current_stock, articleNumber: row.number },
  }))
}

async function checkDuplicateReceipts(
  prisma: PrismaClient,
  tenantId: string
): Promise<DetectedIssue[]> {
  const rows = await repo.findDuplicateReceipts(prisma, tenantId)
  return rows.map((row) => ({
    code: CHECK_DUPLICATE_RECEIPT,
    severity: "WARNING" as WhCorrectionSeverity,
    message: `Artikel ${row.article_number} "${row.article_name}" hat ${row.cnt} Wareneingange fur dieselbe Bestellposition`,
    articleId: row.article_id,
    documentId: row.purchase_order_id,
    details: {
      count: row.cnt,
      purchaseOrderPositionId: row.purchase_order_position_id,
      articleNumber: row.article_number,
    },
  }))
}

async function checkOverdueOrders(
  prisma: PrismaClient,
  tenantId: string
): Promise<DetectedIssue[]> {
  const rows = await repo.findOverdueOrders(prisma, tenantId)
  return rows.map((row) => ({
    code: CHECK_OVERDUE_ORDER,
    severity: "WARNING" as WhCorrectionSeverity,
    message: `Bestellung ${row.number} ist uberfällig (erwartet: ${(row.confirmed_delivery ?? row.requested_delivery)?.toISOString().slice(0, 10) ?? "unbekannt"})`,
    documentId: row.id,
    details: {
      orderNumber: row.number,
      supplierId: row.supplier_id,
      confirmedDelivery: row.confirmed_delivery?.toISOString() ?? null,
      requestedDelivery: row.requested_delivery?.toISOString() ?? null,
    },
  }))
}

async function checkUnmatchedReceipts(
  prisma: PrismaClient,
  tenantId: string
): Promise<DetectedIssue[]> {
  const rows = await repo.findUnmatchedReceipts(prisma, tenantId)
  return rows.map((row) => ({
    code: CHECK_UNMATCHED_RECEIPT,
    severity: "INFO" as WhCorrectionSeverity,
    message: `Wareneingang fur Artikel ${row.article_number} "${row.article_name}" (Menge: ${row.quantity}) ohne zugeordnete Bestellung`,
    articleId: row.article_id,
    documentId: row.id,  // The stock movement ID as document reference
    details: {
      quantity: row.quantity,
      date: row.date.toISOString(),
      articleNumber: row.article_number,
    },
  }))
}

async function checkStockMismatch(
  prisma: PrismaClient,
  tenantId: string
): Promise<DetectedIssue[]> {
  const rows = await repo.findStockMismatches(prisma, tenantId)
  return rows.map((row) => ({
    code: CHECK_STOCK_MISMATCH,
    severity: "ERROR" as WhCorrectionSeverity,
    message: `Artikel ${row.number} "${row.name}": Bestand (${row.current_stock}) weicht von Bewegungssumme (${row.sum_movements}) ab`,
    articleId: row.id,
    details: {
      currentStock: row.current_stock,
      sumMovements: row.sum_movements,
      difference: Math.round((row.current_stock - row.sum_movements) * 1000) / 1000,
      articleNumber: row.number,
    },
  }))
}

async function checkLowStockNoOrder(
  prisma: PrismaClient,
  tenantId: string
): Promise<DetectedIssue[]> {
  const rows = await repo.findLowStockNoOrder(prisma, tenantId)
  return rows.map((row) => ({
    code: CHECK_LOW_STOCK_NO_ORDER,
    severity: "WARNING" as WhCorrectionSeverity,
    message: `Artikel ${row.number} "${row.name}" unter Mindestbestand (${row.current_stock}/${row.min_stock}) ohne offene Bestellung`,
    articleId: row.id,
    details: {
      currentStock: row.current_stock,
      minStock: row.min_stock,
      articleNumber: row.number,
    },
  }))
}

// --- Main Check Runner ---

export async function runCorrectionChecks(
  prisma: PrismaClient,
  tenantId: string,
  triggeredById?: string | null,
  trigger: string = "MANUAL"
) {
  // 1. Create run record
  const run = await repo.createRun(prisma, {
    tenantId,
    trigger,
    triggeredById,
  })

  const checks = [
    checkNegativeStock,
    checkDuplicateReceipts,
    checkOverdueOrders,
    checkUnmatchedReceipts,
    checkStockMismatch,
    checkLowStockNoOrder,
    // checkOrphanReservations — deferred, WH_10 not implemented
  ]

  let totalIssues = 0

  try {
    for (const check of checks) {
      const issues = await check(prisma, tenantId)

      // Deduplicate: skip issues where same code+articleId+documentId is already OPEN
      const newIssues: DetectedIssue[] = []
      for (const issue of issues) {
        const existing = await repo.findOpenDuplicate(
          prisma,
          tenantId,
          issue.code,
          issue.articleId ?? null,
          issue.documentId ?? null
        )
        if (!existing) {
          newIssues.push(issue)
        }
      }

      if (newIssues.length > 0) {
        await repo.createManyMessages(
          prisma,
          newIssues.map((issue) => ({
            tenantId,
            runId: run.id,
            code: issue.code,
            severity: issue.severity,
            message: issue.message,
            articleId: issue.articleId ?? null,
            documentId: issue.documentId ?? null,
            details: issue.details ?? null,
          }))
        )
        totalIssues += newIssues.length
      }
    }

    // 2. Complete run
    await repo.completeRun(prisma, run.id, checks.length, totalIssues)

    return {
      runId: run.id,
      checksRun: checks.length,
      issuesFound: totalIssues,
    }
  } catch (err) {
    // Mark run as failed but still record partial results
    await repo.completeRun(prisma, run.id, checks.length, totalIssues)
    throw err
  }
}

// --- Message Management ---

export async function listMessages(
  prisma: PrismaClient,
  tenantId: string,
  params: {
    status?: string
    severity?: string
    code?: string
    articleId?: string
    page: number
    pageSize: number
  }
) {
  return repo.findManyMessages(prisma, tenantId, {
    status: params.status as any,
    severity: params.severity as any,
    code: params.code,
    articleId: params.articleId,
    page: params.page,
    pageSize: params.pageSize,
  })
}

export async function getMessageById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  const message = await repo.findMessageById(prisma, tenantId, id)
  if (!message) {
    throw new WhCorrectionMessageNotFoundError()
  }
  return message
}

export async function resolveMessage(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  resolvedById: string,
  note?: string
) {
  // Verify exists
  const existing = await repo.findMessageById(prisma, tenantId, id)
  if (!existing) {
    throw new WhCorrectionMessageNotFoundError()
  }
  if (existing.status !== "OPEN") {
    throw new WhCorrectionValidationError("Message is not in OPEN status")
  }

  return repo.updateMessageStatus(prisma, tenantId, id, {
    status: "RESOLVED",
    resolvedById,
    resolvedNote: note ?? null,
    resolvedAt: new Date(),
  })
}

export async function dismissMessage(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  resolvedById: string,
  note?: string
) {
  const existing = await repo.findMessageById(prisma, tenantId, id)
  if (!existing) {
    throw new WhCorrectionMessageNotFoundError()
  }
  if (existing.status !== "OPEN") {
    throw new WhCorrectionValidationError("Message is not in OPEN status")
  }

  return repo.updateMessageStatus(prisma, tenantId, id, {
    status: "DISMISSED",
    resolvedById,
    resolvedNote: note ?? null,
    resolvedAt: new Date(),
  })
}

export async function resolveBulk(
  prisma: PrismaClient,
  tenantId: string,
  ids: string[],
  resolvedById: string,
  note?: string
) {
  if (ids.length === 0) {
    throw new WhCorrectionValidationError("No message IDs provided")
  }

  return repo.updateManyMessagesStatus(prisma, tenantId, ids, {
    status: "RESOLVED",
    resolvedById,
    resolvedNote: note ?? null,
    resolvedAt: new Date(),
  })
}

export async function getSummary(
  prisma: PrismaClient,
  tenantId: string
) {
  const groups = await repo.countOpenGroupedBySeverity(prisma, tenantId)
  const result = { errors: 0, warnings: 0, infos: 0, total: 0 }

  for (const group of groups) {
    const count = group._count.id
    switch (group.severity) {
      case "ERROR":
        result.errors = count
        break
      case "WARNING":
        result.warnings = count
        break
      case "INFO":
        result.infos = count
        break
    }
    result.total += count
  }

  return result
}

export async function listRuns(
  prisma: PrismaClient,
  tenantId: string,
  params: { page: number; pageSize: number }
) {
  return repo.findManyRuns(prisma, tenantId, params)
}
```

### Verification (Phase 4)

- [ ] Typecheck passes with the new service file
- [ ] All exported functions accept `tenantId` for tenant isolation
- [ ] Error classes follow naming convention (`*NotFoundError`, `*ValidationError`)
- [ ] `runCorrectionChecks` creates a run, runs all checks, deduplicates, and completes the run

---

## Phase 5: Router

### 5.1 Create Corrections Router

**File:** `src/trpc/routers/warehouse/corrections.ts`

Follow the pattern from `src/trpc/routers/warehouse/stockMovements.ts` (thin wrapper).

```typescript
/**
 * Warehouse Corrections Router
 *
 * tRPC procedures for warehouse correction assistant.
 * All procedures require warehouse module and appropriate permissions.
 */
import { z } from "zod"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { handleServiceError } from "@/trpc/errors"
import { requirePermission } from "@/lib/auth/middleware"
import { requireModule } from "@/lib/modules"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import * as whCorrectionService from "@/lib/services/wh-correction-service"
import type { PrismaClient } from "@/generated/prisma/client"

// --- Permission Constants ---
const WH_CORRECTIONS_VIEW = permissionIdByKey("wh_corrections.view")!
const WH_CORRECTIONS_MANAGE = permissionIdByKey("wh_corrections.manage")!
const WH_CORRECTIONS_RUN = permissionIdByKey("wh_corrections.run")!

// --- Base procedure with module guard ---
const whProcedure = tenantProcedure.use(requireModule("warehouse"))

// --- Sub-routers ---

const messagesRouter = createTRPCRouter({
  list: whProcedure
    .use(requirePermission(WH_CORRECTIONS_VIEW))
    .input(
      z.object({
        status: z.enum(["OPEN", "RESOLVED", "DISMISSED", "IGNORED"]).optional(),
        severity: z.enum(["ERROR", "WARNING", "INFO"]).optional(),
        code: z.string().optional(),
        articleId: z.string().uuid().optional(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(25),
      })
    )
    .query(async ({ ctx, input }) => {
      try {
        return await whCorrectionService.listMessages(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  getById: whProcedure
    .use(requirePermission(WH_CORRECTIONS_VIEW))
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      try {
        return await whCorrectionService.getMessageById(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  resolve: whProcedure
    .use(requirePermission(WH_CORRECTIONS_MANAGE))
    .input(z.object({
      id: z.string().uuid(),
      note: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await whCorrectionService.resolveMessage(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id,
          ctx.user!.id,
          input.note
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  dismiss: whProcedure
    .use(requirePermission(WH_CORRECTIONS_MANAGE))
    .input(z.object({
      id: z.string().uuid(),
      note: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await whCorrectionService.dismissMessage(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id,
          ctx.user!.id,
          input.note
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  resolveBulk: whProcedure
    .use(requirePermission(WH_CORRECTIONS_MANAGE))
    .input(z.object({
      ids: z.array(z.string().uuid()).min(1).max(100),
      note: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await whCorrectionService.resolveBulk(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.ids,
          ctx.user!.id,
          input.note
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),
})

const runsRouter = createTRPCRouter({
  list: whProcedure
    .use(requirePermission(WH_CORRECTIONS_VIEW))
    .input(z.object({
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(100).default(10),
    }))
    .query(async ({ ctx, input }) => {
      try {
        return await whCorrectionService.listRuns(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  trigger: whProcedure
    .use(requirePermission(WH_CORRECTIONS_RUN))
    .mutation(async ({ ctx }) => {
      try {
        return await whCorrectionService.runCorrectionChecks(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          ctx.user!.id,
          "MANUAL"
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),
})

// --- Main Router ---

export const whCorrectionsRouter = createTRPCRouter({
  messages: messagesRouter,
  runs: runsRouter,
  summary: whProcedure
    .use(requirePermission(WH_CORRECTIONS_VIEW))
    .query(async ({ ctx }) => {
      try {
        return await whCorrectionService.getSummary(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),
})
```

### 5.2 Register in Warehouse Router

**File:** `src/trpc/routers/warehouse/index.ts`

Add import and register:

```typescript
import { whCorrectionsRouter } from "./corrections"
```

Add to the `createTRPCRouter` object:

```typescript
corrections: whCorrectionsRouter,
```

**No change needed to `src/trpc/routers/_app.ts`** since `warehouse` is already registered there.

### Verification (Phase 5)

- [ ] Typecheck passes
- [ ] Router is accessible at `warehouse.corrections.messages.list`, etc.
- [ ] All procedures use `requirePermission` with correct permission constants
- [ ] All procedures use `requireModule("warehouse")`
- [ ] All procedures wrap in `try/catch` with `handleServiceError(err)`

---

## Phase 6: Cron Job

### 6.1 Create Cron Route

**File:** `src/app/api/cron/wh-corrections/route.ts`

Follow the pattern from `src/app/api/cron/recurring-invoices/route.ts`.

```typescript
/**
 * Vercel Cron Route: /api/cron/wh-corrections
 *
 * Runs daily at 06:00 UTC (configured in vercel.json).
 * Runs warehouse correction checks for all active tenants with warehouse module.
 */

import { NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import * as whCorrectionService from "@/lib/services/wh-correction-service"

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

  console.log("[wh-corrections] Starting cron job")

  try {
    // 2. Find all active tenants with warehouse module enabled
    const tenantModules = await prisma.tenantModule.findMany({
      where: { module: "warehouse" },
      select: { tenantId: true, tenant: { select: { isActive: true } } },
    })

    const activeTenantIds = tenantModules
      .filter((tm) => tm.tenant.isActive)
      .map((tm) => tm.tenantId)

    console.log(`[wh-corrections] Processing ${activeTenantIds.length} tenants`)

    const results: Array<{
      tenantId: string
      runId: string
      checksRun: number
      issuesFound: number
      error?: string
    }> = []

    // 3. Run checks for each tenant sequentially
    for (const tenantId of activeTenantIds) {
      try {
        const result = await whCorrectionService.runCorrectionChecks(
          prisma,
          tenantId,
          null,
          "CRON"
        )
        results.push({ tenantId, ...result })
      } catch (err) {
        console.error(`[wh-corrections] Error for tenant ${tenantId}:`, err)
        results.push({
          tenantId,
          runId: "",
          checksRun: 0,
          issuesFound: 0,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }

    const totalIssues = results.reduce((sum, r) => sum + r.issuesFound, 0)
    console.log(
      `[wh-corrections] Complete: ${activeTenantIds.length} tenants, ${totalIssues} total issues`
    )

    return NextResponse.json({
      ok: true,
      tenantsProcessed: activeTenantIds.length,
      totalIssues,
      results,
    })
  } catch (err) {
    console.error("[wh-corrections] Fatal error:", err)
    return NextResponse.json(
      { error: "Internal server error", message: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    )
  }
}
```

### 6.2 Register in vercel.json

**File:** `vercel.json`

Add to the `crons` array:

```json
{
  "path": "/api/cron/wh-corrections",
  "schedule": "0 6 * * *"
}
```

### Verification (Phase 6)

- [ ] Cron route validates `CRON_SECRET`
- [ ] Iterates only active tenants with warehouse module
- [ ] Sequential tenant processing (avoids connection pool exhaustion)
- [ ] Returns JSON summary with per-tenant results

---

## Phase 7: Hooks

### 7.1 Create Hook File

**File:** `src/hooks/use-wh-corrections.ts`

Follow the pattern from `src/hooks/use-correction-assistant.ts` and `src/hooks/use-wh-articles.ts`.

```typescript
import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

// --- Query Hooks ---

interface UseWhCorrectionMessagesOptions {
  status?: "OPEN" | "RESOLVED" | "DISMISSED" | "IGNORED"
  severity?: "ERROR" | "WARNING" | "INFO"
  code?: string
  articleId?: string
  page?: number
  pageSize?: number
  enabled?: boolean
}

export function useWhCorrectionMessages(options: UseWhCorrectionMessagesOptions = {}) {
  const { enabled = true, ...params } = options
  const trpc = useTRPC()
  return useQuery(
    trpc.warehouse.corrections.messages.list.queryOptions(
      {
        status: params.status,
        severity: params.severity,
        code: params.code,
        articleId: params.articleId,
        page: params.page ?? 1,
        pageSize: params.pageSize ?? 25,
      },
      { enabled }
    )
  )
}

export function useWhCorrectionMessageById(id: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.warehouse.corrections.messages.getById.queryOptions(
      { id },
      { enabled: enabled && !!id }
    )
  )
}

export function useWhCorrectionSummary(enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.warehouse.corrections.summary.queryOptions(
      undefined,
      { enabled }
    )
  )
}

interface UseWhCorrectionRunsOptions {
  page?: number
  pageSize?: number
  enabled?: boolean
}

export function useWhCorrectionRuns(options: UseWhCorrectionRunsOptions = {}) {
  const { enabled = true, ...params } = options
  const trpc = useTRPC()
  return useQuery(
    trpc.warehouse.corrections.runs.list.queryOptions(
      { page: params.page ?? 1, pageSize: params.pageSize ?? 10 },
      { enabled }
    )
  )
}

// --- Mutation Hooks ---

export function useResolveWhCorrection() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.warehouse.corrections.messages.resolve.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.warehouse.corrections.messages.list.queryKey() })
      queryClient.invalidateQueries({ queryKey: trpc.warehouse.corrections.summary.queryKey() })
    },
  })
}

export function useDismissWhCorrection() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.warehouse.corrections.messages.dismiss.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.warehouse.corrections.messages.list.queryKey() })
      queryClient.invalidateQueries({ queryKey: trpc.warehouse.corrections.summary.queryKey() })
    },
  })
}

export function useResolveBulkWhCorrection() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.warehouse.corrections.messages.resolveBulk.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.warehouse.corrections.messages.list.queryKey() })
      queryClient.invalidateQueries({ queryKey: trpc.warehouse.corrections.summary.queryKey() })
    },
  })
}

export function useTriggerWhCorrectionRun() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.warehouse.corrections.runs.trigger.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.warehouse.corrections.messages.list.queryKey() })
      queryClient.invalidateQueries({ queryKey: trpc.warehouse.corrections.summary.queryKey() })
      queryClient.invalidateQueries({ queryKey: trpc.warehouse.corrections.runs.list.queryKey() })
    },
  })
}
```

### 7.2 Register in Hooks Index

**File:** `src/hooks/index.ts`

Add after the "Warehouse Withdrawals" section (after line 904):

```typescript
// Warehouse Corrections
export {
  useWhCorrectionMessages,
  useWhCorrectionMessageById,
  useWhCorrectionSummary,
  useWhCorrectionRuns,
  useResolveWhCorrection,
  useDismissWhCorrection,
  useResolveBulkWhCorrection,
  useTriggerWhCorrectionRun,
} from './use-wh-corrections'
```

### Verification (Phase 7)

- [ ] Hook file compiles
- [ ] All hooks invalidate appropriate queries on mutation success
- [ ] Hooks barrel-exported from `src/hooks/index.ts`

---

## Phase 8: UI Components

### 8.1 Component Directory Structure

```
src/components/warehouse/corrections/
  index.ts
  wh-correction-dashboard.tsx      -- KPI cards + trigger button
  wh-correction-message-list.tsx   -- Message table with filters
  wh-correction-detail-sheet.tsx   -- Detail sheet for single message
  wh-correction-run-history.tsx    -- Run history table
  wh-correction-severity-badge.tsx -- Severity badge helper
```

### 8.2 Barrel Export

**File:** `src/components/warehouse/corrections/index.ts`

```typescript
export { WhCorrectionDashboard } from "./wh-correction-dashboard"
export { WhCorrectionMessageList } from "./wh-correction-message-list"
export { WhCorrectionDetailSheet } from "./wh-correction-detail-sheet"
export { WhCorrectionRunHistory } from "./wh-correction-run-history"
export { WhCorrectionSeverityBadge } from "./wh-correction-severity-badge"
```

### 8.3 Severity Badge

**File:** `src/components/warehouse/corrections/wh-correction-severity-badge.tsx`

```tsx
'use client'

import { Badge } from '@/components/ui/badge'

const severityConfig = {
  ERROR: { variant: 'destructive' as const, label: 'Fehler' },
  WARNING: { variant: 'secondary' as const, label: 'Warnung' },
  INFO: { variant: 'outline' as const, label: 'Hinweis' },
}

export function WhCorrectionSeverityBadge({ severity }: { severity: string }) {
  const config = severityConfig[severity as keyof typeof severityConfig] ?? severityConfig.INFO
  return <Badge variant={config.variant}>{config.label}</Badge>
}
```

### 8.4 Dashboard (KPI Cards + Trigger Button)

**File:** `src/components/warehouse/corrections/wh-correction-dashboard.tsx`

Uses `StatsCard` from `@/components/dashboard/stats-card`, `useWhCorrectionSummary`, and `useTriggerWhCorrectionRun`.

Layout: 3 KPI cards (Errors / Warnings / Info) in a `grid gap-4 md:grid-cols-3` + a "Prufung starten" button + last run info from `useWhCorrectionRuns({ pageSize: 1 })`.

Key elements:
- Error card: `<StatsCard title="Offene Fehler" value={summary.errors} icon={AlertCircle} ...>`
- Warning card: `<StatsCard title="Warnungen" value={summary.warnings} icon={AlertTriangle} ...>`
- Info card: `<StatsCard title="Hinweise" value={summary.infos} icon={Info} ...>`
- Trigger button: `<Button onClick={() => triggerRun.mutate({})} disabled={triggerRun.isPending}>Prufung starten</Button>`
- Last run info: "Letzter Lauf: {date} — {issuesFound} Probleme gefunden"

### 8.5 Message List

**File:** `src/components/warehouse/corrections/wh-correction-message-list.tsx`

Uses: `Table`, `Badge`, `Select`, `Checkbox`, `Button` from UI components.
Data: `useWhCorrectionMessages` with filter state for status, severity, code.

Features:
- Filter bar: Status dropdown (OPEN, RESOLVED, DISMISSED, IGNORED), Severity dropdown, Code dropdown
- Table columns: Severity badge, Code, Message, Article link, Date, Status
- Row selection with `Checkbox` for bulk actions
- Bulk action bar: "X ausgewahlt — Als erledigt markieren" using `useResolveBulkWhCorrection`
- Pagination using `Pagination` component
- Row click opens detail sheet

### 8.6 Detail Sheet

**File:** `src/components/warehouse/corrections/wh-correction-detail-sheet.tsx`

Uses: `Sheet`, `SheetContent`, `SheetHeader`, `SheetTitle` from `@/components/ui/sheet`.
Data: Selected `WhCorrectionMessage` passed as prop.

Content:
- Severity badge + status badge
- Code
- Full message text
- Details section: render JSON `details` as key-value pairs
- Article link: if `articleId`, render link to `/warehouse/articles/{articleId}`
- Document link: if `documentId` and code is `OVERDUE_ORDER`, link to `/warehouse/purchase-orders/{documentId}`
- Action buttons:
  - "Als erledigt markieren" with optional note textarea, uses `useResolveWhCorrection`
  - "Ignorieren" with optional note textarea, uses `useDismissWhCorrection`
- Show `resolvedNote`, `resolvedAt`, `resolvedById` if already resolved

### 8.7 Run History

**File:** `src/components/warehouse/corrections/wh-correction-run-history.tsx`

Uses: `Table` from UI components.
Data: `useWhCorrectionRuns`.

Table columns: Started At, Completed At, Trigger (MANUAL/CRON badge), Checks Run, Issues Found, Duration (computed).
Pagination.

### 8.8 Page

**File:** `src/app/[locale]/(dashboard)/warehouse/corrections/page.tsx`

Follow the pattern from `src/app/[locale]/(dashboard)/admin/correction-assistant/page.tsx`.

```tsx
'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/providers/auth-provider'
import { useHasPermission } from '@/hooks'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  WhCorrectionDashboard,
  WhCorrectionMessageList,
  WhCorrectionDetailSheet,
  WhCorrectionRunHistory,
} from '@/components/warehouse/corrections'

export default function WhCorrectionsPage() {
  const router = useRouter()
  const { isLoading: authLoading } = useAuth()
  const { allowed: canAccess, isLoading: permLoading } = useHasPermission(['wh_corrections.view'])

  const [activeTab, setActiveTab] = React.useState<'messages' | 'runs'>('messages')
  const [selectedMessageId, setSelectedMessageId] = React.useState<string | null>(null)

  // Auth guard
  React.useEffect(() => {
    if (!authLoading && !permLoading && !canAccess) {
      router.push('/warehouse')
    }
  }, [authLoading, permLoading, canAccess, router])

  if (authLoading || permLoading) return null

  return (
    <div className="space-y-6 p-6">
      {/* KPI Dashboard + Trigger */}
      <WhCorrectionDashboard />

      {/* Tabs: Messages / Run History */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
        <TabsList>
          <TabsTrigger value="messages">Meldungen</TabsTrigger>
          <TabsTrigger value="runs">Pruflaufe</TabsTrigger>
        </TabsList>

        <TabsContent value="messages">
          <WhCorrectionMessageList
            onSelectMessage={(id) => setSelectedMessageId(id)}
          />
        </TabsContent>

        <TabsContent value="runs">
          <WhCorrectionRunHistory />
        </TabsContent>
      </Tabs>

      {/* Detail Sheet */}
      <WhCorrectionDetailSheet
        messageId={selectedMessageId}
        open={!!selectedMessageId}
        onClose={() => setSelectedMessageId(null)}
      />
    </div>
  )
}
```

### 8.9 Navigation

**File:** `src/components/layout/sidebar/sidebar-nav-config.ts`

Add after the `warehouseSupplierInvoices` item (line 423), before the closing `]` of warehouse items:

```typescript
{
  titleKey: 'warehouseCorrections',
  href: '/warehouse/corrections',
  icon: AlertTriangle,
  module: 'warehouse',
  permissions: ['wh_corrections.view'],
},
```

Note: `AlertTriangle` is already imported in the sidebar config file (used by other items). Verify this at implementation time; if not, add the import from `lucide-react`.

### Verification (Phase 8)

- [ ] All components compile
- [ ] Page renders without errors in dev (`pnpm dev`)
- [ ] Navigation item appears in sidebar under Warehouse section
- [ ] Permission guard prevents unauthorized access
- [ ] KPI cards show correct counts
- [ ] Message list loads, filters work
- [ ] Detail sheet opens on row click
- [ ] Resolve/dismiss actions work and invalidate queries
- [ ] Bulk resolve works for selected messages
- [ ] Run history tab shows past runs
- [ ] Trigger button starts a new run

---

## Phase 9: Tests

### 9.1 Router Tests

**File:** `src/trpc/routers/__tests__/whCorrections-router.test.ts`

Follow the pattern from `src/trpc/routers/__tests__/whArticles-router.test.ts`.

```typescript
import { describe, it, expect, vi } from "vitest"
import { createCallerFactory } from "@/trpc/init"
import { whCorrectionsRouter } from "../warehouse/corrections"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import {
  createMockContext,
  createMockSession,
  createUserWithPermissions,
  createMockUserTenant,
} from "./helpers"

// Mock the db module for requireModule middleware
vi.mock("@/lib/db", () => ({
  prisma: {
    tenantModule: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue({ id: "mock", module: "warehouse" }),
    },
  },
}))

const WH_CORRECTIONS_VIEW = permissionIdByKey("wh_corrections.view")!
const WH_CORRECTIONS_MANAGE = permissionIdByKey("wh_corrections.manage")!
const WH_CORRECTIONS_RUN = permissionIdByKey("wh_corrections.run")!
const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const USER_ID = "a0000000-0000-4000-a000-000000000001"

const createCaller = createCallerFactory(whCorrectionsRouter)

const MODULE_MOCK = {
  tenantModule: {
    findMany: vi.fn().mockResolvedValue([]),
    findUnique: vi.fn().mockResolvedValue({ id: "mock", module: "warehouse" }),
  },
}

function withModuleMock(prisma: Record<string, unknown>) {
  return { ...MODULE_MOCK, ...prisma }
}

function createTestContext(prisma: Record<string, unknown>, permissions = [WH_CORRECTIONS_VIEW]) {
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

function createNoPermContext(prisma: Record<string, unknown>) {
  return createMockContext({
    prisma: withModuleMock(prisma),
    authToken: "test-token",
    user: createUserWithPermissions([], {
      id: USER_ID,
      userTenants: [createMockUserTenant(USER_ID, TENANT_ID)],
    }),
    session: createMockSession(),
    tenantId: TENANT_ID,
  })
}

describe("warehouse.corrections", () => {
  describe("messages.list", () => {
    it("returns paginated messages", async () => {
      const mockMessages = [
        {
          id: "msg-1",
          tenantId: TENANT_ID,
          code: "NEGATIVE_STOCK",
          severity: "ERROR",
          status: "OPEN",
          message: "Test message",
          createdAt: new Date(),
        },
      ]
      const prisma = {
        whCorrectionMessage: {
          findMany: vi.fn().mockResolvedValue(mockMessages),
          count: vi.fn().mockResolvedValue(1),
        },
      }
      const caller = createCaller(createTestContext(prisma))
      const result = await caller.messages.list({ page: 1, pageSize: 10 })
      expect(result!.items).toHaveLength(1)
      expect(result!.total).toBe(1)
    })

    it("rejects without permission", async () => {
      const caller = createCaller(createNoPermContext({}))
      await expect(caller.messages.list({ page: 1, pageSize: 10 })).rejects.toThrow()
    })
  })

  describe("messages.resolve", () => {
    it("resolves a message", async () => {
      const mockMessage = {
        id: "msg-1",
        tenantId: TENANT_ID,
        code: "NEGATIVE_STOCK",
        severity: "ERROR",
        status: "OPEN",
        message: "Test message",
        createdAt: new Date(),
      }
      const prisma = {
        whCorrectionMessage: {
          findFirst: vi.fn().mockResolvedValue(mockMessage),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      }
      // After updateMany, findFirst returns updated version
      prisma.whCorrectionMessage.findFirst
        .mockResolvedValueOnce(mockMessage)  // for exists check in service
        .mockResolvedValueOnce({ ...mockMessage, status: "RESOLVED" })  // for refetch
      const caller = createCaller(
        createTestContext(prisma, [WH_CORRECTIONS_VIEW, WH_CORRECTIONS_MANAGE])
      )
      const result = await caller.messages.resolve({ id: "msg-1", note: "Fixed" })
      expect(result!.status).toBe("RESOLVED")
    })
  })

  describe("summary", () => {
    it("returns grouped counts", async () => {
      const prisma = {
        whCorrectionMessage: {
          groupBy: vi.fn().mockResolvedValue([
            { severity: "ERROR", _count: { id: 3 } },
            { severity: "WARNING", _count: { id: 5 } },
            { severity: "INFO", _count: { id: 2 } },
          ]),
        },
      }
      const caller = createCaller(createTestContext(prisma))
      const result = await caller.summary()
      expect(result!.errors).toBe(3)
      expect(result!.warnings).toBe(5)
      expect(result!.infos).toBe(2)
      expect(result!.total).toBe(10)
    })
  })

  describe("runs.trigger", () => {
    it("requires wh_corrections.run permission", async () => {
      const caller = createCaller(createTestContext({}, [WH_CORRECTIONS_VIEW]))
      await expect(caller.runs.trigger()).rejects.toThrow()
    })
  })

  describe("tenant isolation", () => {
    it("messages.list filters by tenantId", async () => {
      const prisma = {
        whCorrectionMessage: {
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
        },
      }
      const caller = createCaller(createTestContext(prisma))
      await caller.messages.list({ page: 1, pageSize: 10 })
      expect(prisma.whCorrectionMessage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: TENANT_ID }),
        })
      )
    })
  })
})
```

### 9.2 Run Tests

```bash
pnpm vitest run src/trpc/routers/__tests__/whCorrections-router.test.ts
```

### Verification (Phase 9)

- [ ] All router tests pass
- [ ] Permission guard tests verify rejection without required permissions
- [ ] Tenant isolation test verifies `tenantId` filtering
- [ ] Summary test verifies correct count aggregation

---

## Files Summary

### New Files (9)

| # | File | Purpose |
|---|------|---------|
| 1 | `supabase/migrations/20260402100000_wh_correction_tables.sql` | DB migration |
| 2 | `src/lib/services/wh-correction-repository.ts` | Repository (Prisma data access) |
| 3 | `src/lib/services/wh-correction-service.ts` | Service (business logic + checks) |
| 4 | `src/trpc/routers/warehouse/corrections.ts` | tRPC router (thin wrapper) |
| 5 | `src/hooks/use-wh-corrections.ts` | React hooks |
| 6 | `src/app/api/cron/wh-corrections/route.ts` | Daily cron handler |
| 7 | `src/app/[locale]/(dashboard)/warehouse/corrections/page.tsx` | Page component |
| 8 | `src/components/warehouse/corrections/` (6 files) | UI components + barrel |
| 9 | `src/trpc/routers/__tests__/whCorrections-router.test.ts` | Router tests |

### Modified Files (5)

| # | File | Change |
|---|------|--------|
| 1 | `prisma/schema.prisma` | Add `WhCorrectionRun`, `WhCorrectionMessage`, enums, Tenant relations |
| 2 | `src/lib/auth/permission-catalog.ts` | Add 3 permissions, update count comment |
| 3 | `src/trpc/routers/warehouse/index.ts` | Register `corrections` sub-router |
| 4 | `src/hooks/index.ts` | Export correction hooks |
| 5 | `vercel.json` | Add cron entry |
| 6 | `src/components/layout/sidebar/sidebar-nav-config.ts` | Add nav item |

---

## Implementation Order

1. **Phase 1** — Migration + Schema + Prisma generate
2. **Phase 2** — Permissions (3 new)
3. **Phase 3** — Repository (pure data access)
4. **Phase 4** — Service (business logic + checks)
5. **Phase 5** — Router + registration
6. **Phase 6** — Cron job + vercel.json
7. **Phase 7** — Hooks + barrel export
8. **Phase 8** — UI components + page + navigation
9. **Phase 9** — Tests

Each phase should be verified before proceeding to the next. Phases 1-2 are prerequisites for all others. Phases 3-5 form the backend chain. Phase 6 depends on Phase 4. Phase 7 depends on Phase 5. Phase 8 depends on Phase 7.

---

## Deferred Items

- **ORPHAN_RESERVATION check**: Requires WH_10 (article reservations) which is not yet implemented. When WH_10 is implemented, add `checkOrphanReservations` to the checks array in `wh-correction-service.ts` and add `findOrphanReservations` raw SQL query to the repository.
- **i18n translations**: Message text is currently hardcoded in German. When i18n for warehouse is added, extract to message files.
- **Auto-resolve**: When an issue is fixed (e.g., negative stock corrected via stock adjustment), the corresponding OPEN message is not automatically resolved. This could be added as a future enhancement by hooking into stock movement creation.
