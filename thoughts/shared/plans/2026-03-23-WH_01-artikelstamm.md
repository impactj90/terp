# WH_01 Artikelstamm — Implementation Plan

| Field | Value |
|-------|-------|
| Ticket | `TICKET_WH_01_ARTIKELSTAMM.md` |
| Research | `2026-03-23-WH_01-artikelstamm.md` |
| Date | 2026-03-23 |
| Complexity | L |

---

## Overview

Implement the article master data system (Artikelstamm) for the warehouse module. Four new Prisma models (`WhArticleGroup`, `WhArticle`, `WhArticleSupplier`, `WhBillOfMaterial`), a service layer with repository, tRPC router procedures, React hooks, and UI components.

---

## Phase 1: Database & Models

### 1A. Supabase Migration

**Create migration file:**
```bash
pnpm db:migrate:new wh_articles_artikelstamm
```

This creates `supabase/migrations/20260323XXXXXX_wh_articles_artikelstamm.sql` (next after `20260322212629`).

**Migration SQL content:**

```sql
-- WH_01: Article master data (Artikelstamm)

-- 1. Article Groups (hierarchical tree)
CREATE TABLE wh_article_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES wh_article_groups(id) ON DELETE SET NULL,
  name VARCHAR(255) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_wh_article_groups_tenant_parent ON wh_article_groups(tenant_id, parent_id);

-- 2. Articles
CREATE TABLE wh_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  number VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  description_alt TEXT,
  group_id UUID REFERENCES wh_article_groups(id) ON DELETE SET NULL,
  match_code VARCHAR(100),
  unit VARCHAR(20) NOT NULL DEFAULT 'Stk',
  vat_rate DOUBLE PRECISION NOT NULL DEFAULT 19.0,
  sell_price DOUBLE PRECISION,
  buy_price DOUBLE PRECISION,
  discount_group VARCHAR(50),
  order_type VARCHAR(50),
  stock_tracking BOOLEAN NOT NULL DEFAULT false,
  current_stock DOUBLE PRECISION NOT NULL DEFAULT 0,
  min_stock DOUBLE PRECISION,
  warehouse_location VARCHAR(255),
  images JSONB,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_id UUID,
  CONSTRAINT uq_wh_articles_tenant_number UNIQUE(tenant_id, number)
);

CREATE INDEX idx_wh_articles_tenant_group ON wh_articles(tenant_id, group_id);
CREATE INDEX idx_wh_articles_tenant_match_code ON wh_articles(tenant_id, match_code);
CREATE INDEX idx_wh_articles_tenant_name ON wh_articles(tenant_id, name);
CREATE INDEX idx_wh_articles_tenant_active ON wh_articles(tenant_id, is_active);

-- 3. Article-Supplier junction
CREATE TABLE wh_article_suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id UUID NOT NULL REFERENCES wh_articles(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES crm_addresses(id),
  supplier_article_number VARCHAR(100),
  supplier_description TEXT,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  order_unit VARCHAR(20),
  lead_time_days INT,
  default_order_qty DOUBLE PRECISION,
  buy_price DOUBLE PRECISION,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_wh_article_suppliers_article_supplier UNIQUE(article_id, supplier_id)
);

CREATE INDEX idx_wh_article_suppliers_supplier ON wh_article_suppliers(supplier_id);

-- 4. Bill of Materials
CREATE TABLE wh_bill_of_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_article_id UUID NOT NULL REFERENCES wh_articles(id) ON DELETE CASCADE,
  child_article_id UUID NOT NULL REFERENCES wh_articles(id) ON DELETE CASCADE,
  quantity DOUBLE PRECISION NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_wh_bom_parent_child UNIQUE(parent_article_id, child_article_id)
);

-- Add article: "ART-" to number_sequences default prefixes (handled in code, not migration)
```

### 1B. Prisma Schema

**File:** `prisma/schema.prisma`

Add to the **Tenant model** relations (after `billingRecurringInvoices`):

```prisma
  // Warehouse
  whArticleGroups             WhArticleGroup[]
  whArticles                  WhArticle[]
```

Add to the **CrmAddress model** relations (after `priceList`):

```prisma
  articleSuppliers            WhArticleSupplier[]
```

Add four new models **at end of file** (before any trailing comments), following the existing naming conventions:

```prisma
// =============================================================================
// Warehouse Module
// =============================================================================

model WhArticleGroup {
  id        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId  String   @map("tenant_id") @db.Uuid
  parentId  String?  @map("parent_id") @db.Uuid
  name      String   @db.VarChar(255)
  sortOrder Int      @default(0) @map("sort_order")
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  tenant   Tenant           @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  parent   WhArticleGroup?  @relation("ArticleGroupTree", fields: [parentId], references: [id], onDelete: SetNull)
  children WhArticleGroup[] @relation("ArticleGroupTree")
  articles WhArticle[]

  @@index([tenantId, parentId])
  @@map("wh_article_groups")
}

model WhArticle {
  id                String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId          String   @map("tenant_id") @db.Uuid
  number            String   @db.VarChar(50)
  name              String   @db.VarChar(255)
  description       String?  @db.Text
  descriptionAlt    String?  @map("description_alt") @db.Text
  groupId           String?  @map("group_id") @db.Uuid
  matchCode         String?  @map("match_code") @db.VarChar(100)
  unit              String   @default("Stk") @db.VarChar(20)
  vatRate           Float    @default(19.0) @map("vat_rate")
  sellPrice         Float?   @map("sell_price")
  buyPrice          Float?   @map("buy_price")
  discountGroup     String?  @map("discount_group") @db.VarChar(50)
  orderType         String?  @map("order_type") @db.VarChar(50)
  stockTracking     Boolean  @default(false) @map("stock_tracking")
  currentStock      Float    @default(0) @map("current_stock")
  minStock          Float?   @map("min_stock")
  warehouseLocation String?  @map("warehouse_location") @db.VarChar(255)
  images            Json?    @db.JsonB
  isActive          Boolean  @default(true) @map("is_active")
  createdAt         DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt         DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)
  createdById       String?  @map("created_by_id") @db.Uuid

  tenant    Tenant             @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  group     WhArticleGroup?    @relation(fields: [groupId], references: [id], onDelete: SetNull)
  suppliers WhArticleSupplier[]
  bomParent WhBillOfMaterial[] @relation("BomParent")
  bomChild  WhBillOfMaterial[] @relation("BomChild")

  @@unique([tenantId, number], map: "uq_wh_articles_tenant_number")
  @@index([tenantId, groupId])
  @@index([tenantId, matchCode])
  @@index([tenantId, name])
  @@index([tenantId, isActive])
  @@map("wh_articles")
}

model WhArticleSupplier {
  id                    String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  articleId             String   @map("article_id") @db.Uuid
  supplierId            String   @map("supplier_id") @db.Uuid
  supplierArticleNumber String?  @map("supplier_article_number") @db.VarChar(100)
  supplierDescription   String?  @map("supplier_description") @db.Text
  isPrimary             Boolean  @default(false) @map("is_primary")
  orderUnit             String?  @map("order_unit") @db.VarChar(20)
  leadTimeDays          Int?     @map("lead_time_days")
  defaultOrderQty       Float?   @map("default_order_qty")
  buyPrice              Float?   @map("buy_price")
  notes                 String?  @db.Text
  createdAt             DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt             DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  article  WhArticle  @relation(fields: [articleId], references: [id], onDelete: Cascade)
  supplier CrmAddress @relation(fields: [supplierId], references: [id])

  @@unique([articleId, supplierId], map: "uq_wh_article_suppliers_article_supplier")
  @@index([supplierId])
  @@map("wh_article_suppliers")
}

model WhBillOfMaterial {
  id              String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  parentArticleId String   @map("parent_article_id") @db.Uuid
  childArticleId  String   @map("child_article_id") @db.Uuid
  quantity        Float    @default(1)
  sortOrder       Int      @default(0) @map("sort_order")
  notes           String?  @db.Text
  createdAt       DateTime @default(now()) @map("created_at") @db.Timestamptz(6)

  parentArticle WhArticle @relation("BomParent", fields: [parentArticleId], references: [id], onDelete: Cascade)
  childArticle  WhArticle @relation("BomChild", fields: [childArticleId], references: [id], onDelete: Cascade)

  @@unique([parentArticleId, childArticleId], map: "uq_wh_bom_parent_child")
  @@map("wh_bill_of_materials")
}
```

### 1C. NumberSequence Default Prefix

**File:** `src/lib/services/number-sequence-service.ts`

Add to `DEFAULT_PREFIXES` object:

```ts
  article: "ART-",
```

Place after the `service_case: "KD-"` entry.

### 1D. Prisma Client Regeneration

```bash
pnpm db:generate
```

### Verification — Phase 1

```bash
pnpm db:generate        # Must succeed (Prisma schema valid)
pnpm typecheck          # Must not introduce NEW errors beyond existing baseline (~1463)
```

**Expected outcome:** Prisma client regenerated with `WhArticle`, `WhArticleGroup`, `WhArticleSupplier`, `WhBillOfMaterial` types available.

---

## Phase 2: Permissions

### 2A. Permission Catalog

**File:** `src/lib/auth/permission-catalog.ts`

Add to `ALL_PERMISSIONS` array, after the billing recurring invoice permissions (line ~273, before the closing `]`):

```ts
  // Warehouse Articles
  p("wh_articles.view", "wh_articles", "view", "View warehouse articles"),
  p("wh_articles.create", "wh_articles", "create", "Create warehouse articles"),
  p("wh_articles.edit", "wh_articles", "edit", "Edit warehouse articles"),
  p("wh_articles.delete", "wh_articles", "delete", "Delete warehouse articles"),
  p("wh_article_groups.manage", "wh_article_groups", "manage", "Manage warehouse article groups"),
```

### Verification — Phase 2

```bash
pnpm typecheck
```

**Expected outcome:** No new type errors. Permission IDs are deterministic (UUID v5 from key strings).

---

## Phase 3: Service Layer

### 3A. Repository — `src/lib/services/wh-article-repository.ts`

**New file.** Pure Prisma data-access functions. Follow `crm-address-repository.ts` pattern.

```ts
import type { PrismaClient } from "@/generated/prisma/client"
import { tenantScopedUpdate } from "@/lib/services/prisma-helpers"
```

**Functions to implement:**

| Function | Signature | Description |
|----------|-----------|-------------|
| `findMany` | `(prisma, tenantId, params: { search?, groupId?, isActive?, stockTracking?, belowMinStock?, page, pageSize })` | Paginated list. Search across `number`, `name`, `matchCode` (ILIKE). `belowMinStock` filter: `stockTracking=true AND currentStock < minStock`. Returns `{ items, total }`. |
| `findById` | `(prisma, tenantId, id)` | Single article with `include: { group: true, suppliers: { include: { supplier: true } }, bomParent: { include: { childArticle: true } } }`. |
| `findByNumber` | `(prisma, tenantId, number)` | Lookup by article number (for uniqueness). |
| `create` | `(prisma, data)` | `prisma.whArticle.create({ data })`. |
| `update` | `(prisma, tenantId, id, data)` | `tenantScopedUpdate(prisma.whArticle, { id, tenantId }, data, { entity: "WhArticle" })`. |
| `softDelete` | `(prisma, tenantId, id)` | `tenantScopedUpdate(... { isActive: false })`. |
| `restore` | `(prisma, tenantId, id)` | `tenantScopedUpdate(... { isActive: true })`. |
| `hardDelete` | `(prisma, tenantId, id)` | `prisma.whArticle.deleteMany({ where: { id, tenantId } })`. |
| `search` | `(prisma, tenantId, query, limit)` | Fast autocomplete: `WHERE (number ILIKE query% OR name ILIKE %query%) AND isActive=true`, order by `number`, `LIMIT limit`. Returns `{ id, number, name, unit, sellPrice }`. |
| `updateStock` | `(prisma, tenantId, id, delta)` | `tenantScopedUpdate(... { currentStock: { increment: delta } })`. |

**Article Group functions (in same file or separate `wh-article-group-repository.ts`):**

| Function | Signature | Description |
|----------|-----------|-------------|
| `findAllGroups` | `(prisma, tenantId)` | All groups ordered by `sortOrder, name`. For tree building. |
| `findGroupById` | `(prisma, tenantId, id)` | Single group. |
| `createGroup` | `(prisma, data)` | `prisma.whArticleGroup.create({ data })`. |
| `updateGroup` | `(prisma, tenantId, id, data)` | `tenantScopedUpdate(prisma.whArticleGroup, ...)`. |
| `deleteGroup` | `(prisma, tenantId, id)` | `prisma.whArticleGroup.deleteMany(...)`. |
| `countGroupArticles` | `(prisma, tenantId, groupId)` | Count articles in group (for delete guard). |
| `countGroupChildren` | `(prisma, tenantId, groupId)` | Count child groups (for delete guard). |
| `findGroupParentId` | `(prisma, tenantId, id)` | For circular reference check. |

**Article Supplier functions:**

| Function | Signature | Description |
|----------|-----------|-------------|
| `findSuppliersByArticle` | `(prisma, articleId)` | All suppliers for an article, include `supplier` (CrmAddress). |
| `createSupplier` | `(prisma, data)` | Create supplier link. |
| `updateSupplier` | `(prisma, id, data)` | Update supplier link. |
| `deleteSupplier` | `(prisma, id)` | Delete supplier link. |

**BOM functions:**

| Function | Signature | Description |
|----------|-----------|-------------|
| `findBomByParent` | `(prisma, parentArticleId)` | All BOM entries for an assembly, include `childArticle`. |
| `createBom` | `(prisma, data)` | Create BOM entry. |
| `updateBom` | `(prisma, id, data)` | Update BOM entry (quantity, sortOrder). |
| `deleteBom` | `(prisma, id)` | Delete BOM entry. |
| `findBomChildren` | `(prisma, articleId)` | All BOM entries where `parentArticleId = articleId`. For circular reference check. |

### 3B. Article Service — `src/lib/services/wh-article-service.ts`

**New file.** Follow `crm-address-service.ts` pattern.

```ts
import type { PrismaClient } from "@/generated/prisma/client"
import * as repo from "./wh-article-repository"
import * as numberSeqService from "./number-sequence-service"
import * as auditLog from "./audit-logs-service"
import type { AuditContext } from "./audit-logs-service"
```

**Error classes:**

```ts
export class WhArticleNotFoundError extends Error {
  constructor(message = "Article not found") {
    super(message); this.name = "WhArticleNotFoundError"
  }
}
export class WhArticleValidationError extends Error {
  constructor(message: string) {
    super(message); this.name = "WhArticleValidationError"
  }
}
export class WhArticleConflictError extends Error {
  constructor(message: string) {
    super(message); this.name = "WhArticleConflictError"
  }
}
```

**Tracked fields for audit:**

```ts
const ARTICLE_TRACKED_FIELDS = [
  "name", "description", "descriptionAlt", "groupId", "matchCode",
  "unit", "vatRate", "sellPrice", "buyPrice", "discountGroup", "orderType",
  "stockTracking", "currentStock", "minStock", "warehouseLocation", "isActive",
]
```

**Service functions:**

| Function | Key Logic |
|----------|-----------|
| `list(prisma, tenantId, params)` | Delegates to `repo.findMany`. |
| `getById(prisma, tenantId, id)` | Calls `repo.findById`, throws `WhArticleNotFoundError` if null. |
| `create(prisma, tenantId, input, createdById, audit?)` | 1. Validate name not empty. 2. `numberSeqService.getNextNumber(prisma, tenantId, "article")` for auto-number. 3. Auto-generate `matchCode` from `name.toUpperCase().slice(0, 20)` if not provided. 4. Call `repo.create(prisma, { tenantId, number, ...fields })`. 5. Audit log. |
| `update(prisma, tenantId, input, audit?)` | 1. `repo.findById` — throw if not found. 2. Build partial `data` object. 3. `repo.update`. 4. Audit with `computeChanges`. |
| `remove(prisma, tenantId, id, audit?)` | Soft-delete: `repo.softDelete`. Verify exists first. |
| `restoreArticle(prisma, tenantId, id, audit?)` | `repo.restore`. Verify exists first. |
| `hardDelete(prisma, tenantId, id, audit?)` | 1. Verify exists. 2. Check no `BillingDocumentPosition` references this article _(future — for now, just check BOM references as parent)_. 3. `repo.hardDelete`. |
| `adjustStock(prisma, tenantId, id, quantity, reason?, audit?)` | 1. Verify article exists and `stockTracking=true`. 2. `repo.updateStock(prisma, tenantId, id, quantity)`. 3. Audit log with reason. **Note:** `WhStockMovement` creation deferred to WH_04. |
| `search(prisma, tenantId, query, limit?)` | Delegates to `repo.search`. Default limit 10. |

### 3C. Article Group Service — `src/lib/services/wh-article-group-service.ts`

**New file.** Follow `department-service.ts` pattern for tree/circular-reference logic.

**Error classes:**

```ts
export class WhArticleGroupNotFoundError extends Error { ... }
export class WhArticleGroupValidationError extends Error { ... }
```

**Service functions:**

| Function | Key Logic |
|----------|-----------|
| `getTree(prisma, tenantId)` | Calls `repo.findAllGroups`. Tree building done in router (same as departments). |
| `create(prisma, tenantId, input: { name, parentId?, sortOrder? })` | Validate name. If parentId, verify parent exists. `repo.createGroup`. |
| `update(prisma, tenantId, input: { id, name?, parentId?, sortOrder? })` | Verify exists. If parentId changed, run `checkCircularReference`. `repo.updateGroup`. |
| `remove(prisma, tenantId, id)` | Verify exists. Check `countGroupArticles` — reject if > 0. Check `countGroupChildren` — reject if > 0. `repo.deleteGroup`. |

**`checkCircularReference` helper** (same algorithm as `department-service.ts`):

```ts
async function checkCircularReference(
  prisma: PrismaClient, tenantId: string, groupId: string, proposedParentId: string
): Promise<boolean> {
  const visited = new Set<string>([groupId])
  let current: string | null = proposedParentId
  while (current !== null) {
    if (visited.has(current)) return true
    visited.add(current)
    const record = await repo.findGroupParentId(prisma, tenantId, current)
    if (!record) break
    current = record.parentId
  }
  return false
}
```

### 3D. Supplier & BOM Logic (in `wh-article-service.ts`)

**Supplier functions:**

| Function | Key Logic |
|----------|-----------|
| `listSuppliers(prisma, articleId)` | `repo.findSuppliersByArticle`. |
| `addSupplier(prisma, tenantId, input: { articleId, supplierId, ...fields })` | 1. Verify article exists (tenant-scoped). 2. Verify supplier CrmAddress exists and has type SUPPLIER or BOTH. 3. `repo.createSupplier`. |
| `updateSupplier(prisma, id, input)` | `repo.updateSupplier`. |
| `removeSupplier(prisma, id)` | `repo.deleteSupplier`. |

**BOM functions:**

| Function | Key Logic |
|----------|-----------|
| `listBom(prisma, articleId)` | `repo.findBomByParent`. |
| `addBom(prisma, tenantId, input: { parentArticleId, childArticleId, quantity, sortOrder?, notes? })` | 1. Verify both articles exist (tenant-scoped). 2. Self-reference check: `parentArticleId !== childArticleId`. 3. **Transitive circular reference check**: walk the BOM tree from `childArticleId` downward — if we encounter `parentArticleId`, reject. 4. `repo.createBom`. |
| `updateBom(prisma, id, input: { quantity?, sortOrder?, notes? })` | `repo.updateBom`. |
| `removeBom(prisma, id)` | `repo.deleteBom`. |

**BOM circular reference check** (walks BOM tree, not group tree):

```ts
async function checkBomCircular(
  prisma: PrismaClient, parentArticleId: string, childArticleId: string
): Promise<boolean> {
  // DFS: from childArticleId, find all its BOM children. If parentArticleId appears, circular.
  const visited = new Set<string>([parentArticleId])
  const stack = [childArticleId]
  while (stack.length > 0) {
    const current = stack.pop()!
    if (visited.has(current)) return true
    visited.add(current)
    const children = await repo.findBomChildren(prisma, current)
    for (const c of children) {
      stack.push(c.childArticleId)
    }
  }
  return false
}
```

### Verification — Phase 3

```bash
pnpm typecheck
```

**Expected outcome:** Service and repository files compile. No new type errors.

---

## Phase 4: tRPC Router

### 4A. Warehouse Articles Router — `src/trpc/routers/warehouse/articles.ts`

**New file.** Follow `crm/addresses.ts` pattern.

```ts
import { z } from "zod"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { handleServiceError } from "@/trpc/errors"
import { requirePermission } from "@/lib/auth/middleware"
import { requireModule } from "@/lib/modules"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import * as whArticleService from "@/lib/services/wh-article-service"
import * as whArticleGroupService from "@/lib/services/wh-article-group-service"
import type { PrismaClient } from "@/generated/prisma/client"
```

**Permission constants:**

```ts
const WH_VIEW = permissionIdByKey("wh_articles.view")!
const WH_CREATE = permissionIdByKey("wh_articles.create")!
const WH_EDIT = permissionIdByKey("wh_articles.edit")!
const WH_DELETE = permissionIdByKey("wh_articles.delete")!
const WH_GROUPS_MANAGE = permissionIdByKey("wh_article_groups.manage")!
```

**Base procedure:**

```ts
const whProcedure = tenantProcedure.use(requireModule("warehouse"))
```

**Router structure:**

```ts
export const whArticlesRouter = createTRPCRouter({
  // --- Article CRUD ---
  list: whProcedure.use(requirePermission(WH_VIEW)).input(...).query(...),
  getById: whProcedure.use(requirePermission(WH_VIEW)).input(...).query(...),
  create: whProcedure.use(requirePermission(WH_CREATE)).input(...).mutation(...),
  update: whProcedure.use(requirePermission(WH_EDIT)).input(...).mutation(...),
  delete: whProcedure.use(requirePermission(WH_DELETE)).input(...).mutation(...),
  restore: whProcedure.use(requirePermission(WH_EDIT)).input(...).mutation(...),
  hardDelete: whProcedure.use(requirePermission(WH_DELETE)).input(...).mutation(...),
  adjustStock: whProcedure.use(requirePermission(WH_EDIT)).input(...).mutation(...),
  search: whProcedure.use(requirePermission(WH_VIEW)).input(...).query(...),

  // --- Article Groups (nested sub-router) ---
  groups: createTRPCRouter({
    tree: whProcedure.use(requirePermission(WH_VIEW)).query(...),
    create: whProcedure.use(requirePermission(WH_GROUPS_MANAGE)).input(...).mutation(...),
    update: whProcedure.use(requirePermission(WH_GROUPS_MANAGE)).input(...).mutation(...),
    delete: whProcedure.use(requirePermission(WH_GROUPS_MANAGE)).input(...).mutation(...),
  }),

  // --- Suppliers (flat naming) ---
  suppliersList: whProcedure.use(requirePermission(WH_VIEW)).input(...).query(...),
  suppliersAdd: whProcedure.use(requirePermission(WH_EDIT)).input(...).mutation(...),
  suppliersUpdate: whProcedure.use(requirePermission(WH_EDIT)).input(...).mutation(...),
  suppliersRemove: whProcedure.use(requirePermission(WH_EDIT)).input(...).mutation(...),

  // --- BOM (flat naming) ---
  bomList: whProcedure.use(requirePermission(WH_VIEW)).input(...).query(...),
  bomAdd: whProcedure.use(requirePermission(WH_EDIT)).input(...).mutation(...),
  bomUpdate: whProcedure.use(requirePermission(WH_EDIT)).input(...).mutation(...),
  bomRemove: whProcedure.use(requirePermission(WH_EDIT)).input(...).mutation(...),
})
```

**Input schemas (key details):**

- `list` input:
  ```ts
  z.object({
    search: z.string().max(255).optional(),
    groupId: z.string().uuid().optional(),
    isActive: z.boolean().optional().default(true),
    stockTracking: z.boolean().optional(),
    belowMinStock: z.boolean().optional(),
    page: z.number().int().min(1).default(1),
    pageSize: z.number().int().min(1).max(100).default(25),
  })
  ```

- `create` input:
  ```ts
  z.object({
    name: z.string().min(1, "Name is required").max(255),
    description: z.string().optional(),
    descriptionAlt: z.string().optional(),
    groupId: z.string().uuid().optional(),
    matchCode: z.string().max(100).optional(),
    unit: z.string().max(20).optional().default("Stk"),
    vatRate: z.number().min(0).max(100).optional().default(19.0),
    sellPrice: z.number().optional(),
    buyPrice: z.number().optional(),
    discountGroup: z.string().max(50).optional(),
    orderType: z.string().max(50).optional(),
    stockTracking: z.boolean().optional().default(false),
    minStock: z.number().optional(),
    warehouseLocation: z.string().max(255).optional(),
    images: z.any().optional(),
  })
  ```

- `adjustStock` input:
  ```ts
  z.object({
    id: z.string().uuid(),
    quantity: z.number(), // positive or negative delta
    reason: z.string().max(500).optional(),
  })
  ```

- `search` input:
  ```ts
  z.object({
    query: z.string().min(1).max(255),
    limit: z.number().int().min(1).max(50).optional().default(10),
  })
  ```

- `groups.create` input:
  ```ts
  z.object({
    name: z.string().min(1).max(255),
    parentId: z.string().uuid().optional(),
    sortOrder: z.number().int().optional().default(0),
  })
  ```

- `suppliersAdd` input:
  ```ts
  z.object({
    articleId: z.string().uuid(),
    supplierId: z.string().uuid(),
    supplierArticleNumber: z.string().max(100).optional(),
    supplierDescription: z.string().optional(),
    isPrimary: z.boolean().optional().default(false),
    orderUnit: z.string().max(20).optional(),
    leadTimeDays: z.number().int().optional(),
    defaultOrderQty: z.number().optional(),
    buyPrice: z.number().optional(),
    notes: z.string().optional(),
  })
  ```

- `bomAdd` input:
  ```ts
  z.object({
    parentArticleId: z.string().uuid(),
    childArticleId: z.string().uuid(),
    quantity: z.number().min(0.001).default(1),
    sortOrder: z.number().int().optional().default(0),
    notes: z.string().optional(),
  })
  ```

**Each procedure body** follows this pattern (from `crm/addresses.ts`):

```ts
async ({ ctx, input }) => {
  try {
    return await whArticleService.method(
      ctx.prisma as unknown as PrismaClient,
      ctx.tenantId!,
      input,
      { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
    )
  } catch (err) {
    handleServiceError(err)
  }
}
```

**Tree building for `groups.tree`** — use `buildGroupTree` helper (same algorithm as `buildDepartmentTree` in `src/trpc/routers/departments.ts`):

```ts
type ArticleGroupTreeNode = {
  group: { id: string; tenantId: string; parentId: string | null; name: string; sortOrder: number }
  children: ArticleGroupTreeNode[]
}

function buildGroupTree(groups: Array<{ id: string; parentId: string | null; [key: string]: unknown }>): ArticleGroupTreeNode[] {
  const nodeMap = new Map<string, ArticleGroupTreeNode>()
  for (const g of groups) {
    nodeMap.set(g.id, { group: g as ArticleGroupTreeNode["group"], children: [] })
  }
  const roots: ArticleGroupTreeNode[] = []
  for (const g of groups) {
    const node = nodeMap.get(g.id)!
    if (g.parentId === null) {
      roots.push(node)
    } else {
      const parent = nodeMap.get(g.parentId)
      if (parent) parent.children.push(node)
    }
  }
  return roots
}
```

### 4B. Warehouse Router Index — `src/trpc/routers/warehouse/index.ts`

**Modify existing file.** Replace the empty router:

```ts
import { createTRPCRouter } from "@/trpc/init"
import { whArticlesRouter } from "./articles"

export const warehouseRouter = createTRPCRouter({
  articles: whArticlesRouter,
})
```

### 4C. Root Router — `src/trpc/routers/_app.ts`

**Modify existing file.** Add import and mount:

```ts
import { warehouseRouter } from "./warehouse"

// In appRouter object, add after billing:
  warehouse: warehouseRouter,
```

### Verification — Phase 4

```bash
pnpm typecheck
```

**Expected outcome:** Router compiles. All procedures wired correctly. `trpc.warehouse.articles.*` path available.

---

## Phase 5: React Hooks

### 5A. Hooks File — `src/hooks/use-wh-articles.ts`

**New file.** Follow `use-crm-addresses.ts` pattern.

```ts
import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
```

**Hooks to implement:**

| Hook | Type | tRPC Path | Cache Invalidation |
|------|------|-----------|-------------------|
| `useWhArticles(options)` | query | `warehouse.articles.list` | — |
| `useWhArticle(id)` | query | `warehouse.articles.getById` | — |
| `useWhArticleSearch(query)` | query | `warehouse.articles.search` | — (enabled when `query.length >= 1`) |
| `useWhArticleGroups()` | query | `warehouse.articles.groups.tree` | — |
| `useCreateWhArticle()` | mutation | `warehouse.articles.create` | Invalidate `list` |
| `useUpdateWhArticle()` | mutation | `warehouse.articles.update` | Invalidate `list`, `getById` |
| `useDeleteWhArticle()` | mutation | `warehouse.articles.delete` | Invalidate `list`, `getById` |
| `useRestoreWhArticle()` | mutation | `warehouse.articles.restore` | Invalidate `list`, `getById` |
| `useHardDeleteWhArticle()` | mutation | `warehouse.articles.hardDelete` | Invalidate `list` |
| `useAdjustWhArticleStock()` | mutation | `warehouse.articles.adjustStock` | Invalidate `list`, `getById` |
| `useCreateWhArticleGroup()` | mutation | `warehouse.articles.groups.create` | Invalidate `groups.tree` |
| `useUpdateWhArticleGroup()` | mutation | `warehouse.articles.groups.update` | Invalidate `groups.tree` |
| `useDeleteWhArticleGroup()` | mutation | `warehouse.articles.groups.delete` | Invalidate `groups.tree` |
| `useWhArticleSuppliers(articleId)` | query | `warehouse.articles.suppliersList` | — |
| `useAddWhArticleSupplier()` | mutation | `warehouse.articles.suppliersAdd` | Invalidate `suppliersList`, `getById` |
| `useUpdateWhArticleSupplier()` | mutation | `warehouse.articles.suppliersUpdate` | Invalidate `suppliersList`, `getById` |
| `useRemoveWhArticleSupplier()` | mutation | `warehouse.articles.suppliersRemove` | Invalidate `suppliersList`, `getById` |
| `useWhArticleBom(articleId)` | query | `warehouse.articles.bomList` | — |
| `useAddWhArticleBom()` | mutation | `warehouse.articles.bomAdd` | Invalidate `bomList`, `getById` |
| `useUpdateWhArticleBom()` | mutation | `warehouse.articles.bomUpdate` | Invalidate `bomList` |
| `useRemoveWhArticleBom()` | mutation | `warehouse.articles.bomRemove` | Invalidate `bomList`, `getById` |

### 5B. Hooks Barrel Export — `src/hooks/index.ts`

Add at end of file:

```ts
// Warehouse Articles
export {
  useWhArticles,
  useWhArticle,
  useWhArticleSearch,
  useWhArticleGroups,
  useCreateWhArticle,
  useUpdateWhArticle,
  useDeleteWhArticle,
  useRestoreWhArticle,
  useHardDeleteWhArticle,
  useAdjustWhArticleStock,
  useCreateWhArticleGroup,
  useUpdateWhArticleGroup,
  useDeleteWhArticleGroup,
  useWhArticleSuppliers,
  useAddWhArticleSupplier,
  useUpdateWhArticleSupplier,
  useRemoveWhArticleSupplier,
  useWhArticleBom,
  useAddWhArticleBom,
  useUpdateWhArticleBom,
  useRemoveWhArticleBom,
} from './use-wh-articles'
```

### Verification — Phase 5

```bash
pnpm typecheck
```

**Expected outcome:** Hooks compile and are exported from barrel.

---

## Phase 6: UI Components

### 6A. Page Routes

Create directories:

```
src/app/[locale]/(dashboard)/warehouse/articles/page.tsx
src/app/[locale]/(dashboard)/warehouse/articles/[id]/page.tsx
```

### 6B. Articles List Page — `src/app/[locale]/(dashboard)/warehouse/articles/page.tsx`

**New file.** Follow `crm/addresses/page.tsx` pattern but with a **two-panel layout**:

- `'use client'` directive
- Permission check: `useHasPermission(['wh_articles.view'])`
- Left panel: Article group tree (`ArticleGroupTree` component)
  - Clicking a group filters the article list by `groupId`
  - "All" option to clear filter
- Right panel: Article data table
  - Columns: Number, Name, Group, Unit, Sell Price, Stock
  - Toolbar: search input, active toggle, below-min-stock filter
  - Pagination
- Header: Title "Artikel" + "Neuer Artikel" button (opens `ArticleFormSheet`)
- State: `page`, `search`, `selectedGroupId`, `isActive`, `belowMinStock`, `createOpen`, `editArticle`

### 6C. Article Detail Page — `src/app/[locale]/(dashboard)/warehouse/articles/[id]/page.tsx`

**New file.** Follow `crm/addresses/[id]/page.tsx` pattern.

- `useParams<{ id: string }>()` for URL params
- `useWhArticle(id)` to fetch
- Header: Back button, article number + name, badges (active/inactive, stock tracking), edit/delete buttons
- **Tabs:**
  1. **Übersicht** (Overview) — Grid of detail cards: basic info, prices, stock info
  2. **Lieferanten** (Suppliers) — `ArticleSupplierList` component
  3. **Stückliste** (BOM) — `ArticleBomList` component
  4. **Bestand** (Stock/Movements) — placeholder for WH_04
  5. **Preise** (Prices) — placeholder for WH_02

### 6D. Component Files — `src/components/warehouse/`

| File | Component | Description |
|------|-----------|-------------|
| `article-list.tsx` | `ArticleList` | Two-panel layout with group tree sidebar and data table. Used in the list page. |
| `article-form-sheet.tsx` | `ArticleFormSheet` | Sheet form for create/edit. Props: `open`, `onOpenChange`, `article?` (edit mode). Fields: name, description, group (select from groups tree), unit, vatRate, sellPrice, buyPrice, stockTracking toggle, minStock, warehouseLocation. Uses `useCreateWhArticle()` / `useUpdateWhArticle()`. |
| `article-detail.tsx` | `ArticleDetail` | Detail view with tabs. Used in detail page. |
| `article-group-tree.tsx` | `ArticleGroupTree` | Collapsible tree component. Props: `groups` (tree data), `selectedGroupId`, `onSelect`. Context menu for add/edit/delete. Uses `useWhArticleGroups()`, `useCreateWhArticleGroup()`, etc. |
| `article-supplier-list.tsx` | `ArticleSupplierList` | Supplier table in detail page Suppliers tab. Props: `articleId`. Add/edit/remove actions. Uses `useWhArticleSuppliers()`, `useAddWhArticleSupplier()`, etc. |
| `article-bom-list.tsx` | `ArticleBomList` | BOM table in detail page BOM tab. Props: `articleId`. Add component via article search popover. Uses `useWhArticleBom()`, `useAddWhArticleBom()`, etc. |
| `article-stock-adjust-dialog.tsx` | `ArticleStockAdjustDialog` | Dialog for manual stock correction. Props: `articleId`, `currentStock`, `open`, `onOpenChange`. Fields: quantity (delta), reason. Uses `useAdjustWhArticleStock()`. |
| `article-search-popover.tsx` | `ArticleSearchPopover` | Reusable article search/autocomplete. Props: `value`, `onSelect`, `placeholder`. Uses `useWhArticleSearch()`. Debounced input. Shows results in popover list. **Will be reused by ORD_01 and WH_03.** |

### Verification — Phase 6

```bash
pnpm typecheck
pnpm build           # Verify Next.js pages compile
```

**Expected outcome:** All UI components render without type errors. Pages accessible at `/warehouse/articles` and `/warehouse/articles/[id]`.

---

## Phase 7: Tests

### 7A. Service Unit Tests — `src/lib/services/__tests__/wh-article-service.test.ts`

**New file.** Mock Prisma, test business logic.

**Test cases:**

```ts
describe("wh-article-service", () => {
  describe("create", () => {
    it("generates article number via NumberSequence", async () => { })
    it("auto-generates matchCode from name when not provided", async () => { })
    it("rejects empty name", async () => { })
  })

  describe("list", () => {
    it("delegates to repository with filters", async () => { })
    it("supports belowMinStock filter", async () => { })
  })

  describe("remove (soft-delete)", () => {
    it("sets isActive to false", async () => { })
    it("throws WhArticleNotFoundError if not found", async () => { })
  })

  describe("hardDelete", () => {
    it("deletes article when no references exist", async () => { })
    // Future: it("rejects when referenced by document positions")
  })

  describe("restoreArticle", () => {
    it("sets isActive to true", async () => { })
  })

  describe("adjustStock", () => {
    it("updates currentStock by delta", async () => { })
    it("throws if stockTracking is false", async () => { })
  })

  describe("search", () => {
    it("returns articles matching number or name", async () => { })
  })
})
```

### 7B. Article Group Service Tests — `src/lib/services/__tests__/wh-article-group-service.test.ts`

```ts
describe("wh-article-group-service", () => {
  it("creates group", async () => { })
  it("rejects circular reference in update", async () => { })
  it("rejects delete when articles exist in group", async () => { })
  it("rejects delete when child groups exist", async () => { })
})
```

### 7C. BOM & Supplier Tests (in `wh-article-service.test.ts`)

```ts
describe("BOM operations", () => {
  it("adds component to assembly", async () => { })
  it("rejects self-reference (parentArticleId === childArticleId)", async () => { })
  it("rejects transitive circular reference", async () => { })
})

describe("supplier operations", () => {
  it("adds supplier to article", async () => { })
  it("validates supplier is SUPPLIER or BOTH type", async () => { })
})
```

### 7D. Router Tests — `src/trpc/routers/__tests__/whArticles-router.test.ts`

**New file.** Follow `crmAddresses-router.test.ts` pattern.

```ts
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
const WH_CREATE = permissionIdByKey("wh_articles.create")!
const WH_EDIT = permissionIdByKey("wh_articles.edit")!
const WH_DELETE = permissionIdByKey("wh_articles.delete")!
const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const USER_ID = "a0000000-0000-4000-a000-000000000001"

const createCaller = createCallerFactory(whArticlesRouter)
```

**Test cases:**

```ts
describe("warehouse.articles", () => {
  it("list — returns paginated articles", async () => { })
  it("list — rejects without wh_articles.view permission", async () => { })
  it("create — assigns auto-generated number", async () => { })
  it("create — rejects without wh_articles.create permission", async () => { })
  it("delete — soft-deletes", async () => { })
  it("adjustStock — updates stock", async () => { })
  it("search — returns matching articles", async () => { })
  it("groups.tree — returns hierarchical structure", async () => { })
})
```

### 7E. E2E Browser Tests — `src/e2e-browser/40-wh-articles.spec.ts`

**New file.** Follow existing E2E spec patterns.

```ts
import { test, expect } from "@playwright/test"
// Auth setup: use admin session from .auth/

test.describe("UC-WH-01: Article Management", () => {
  test("create an article group", async ({ page }) => {
    // Navigate to /warehouse/articles
    // Right-click group tree → "Neue Gruppe"
    // Enter name → Save
    // Verify group appears in tree
  })

  test("create an article", async ({ page }) => {
    // Click "Neuer Artikel"
    // Fill: name, unit, sell price, select group
    // Submit → verify in list with auto-generated ART-number
  })

  test("edit article details", async ({ page }) => {
    // Open article detail page
    // Edit name, prices
    // Verify changes saved
  })

  test("add supplier to article", async ({ page }) => {
    // Open article → Suppliers tab
    // Click "Lieferant hinzufügen"
    // Select supplier, enter article number and lead time
    // Verify in supplier list
  })

  test("create bill of materials", async ({ page }) => {
    // Open assembly article → BOM tab
    // Add component articles with quantities
    // Verify BOM list shows components
  })

  test("manual stock adjustment", async ({ page }) => {
    // Open article with stockTracking=true
    // Click "Bestand korrigieren"
    // Enter quantity delta and reason
    // Verify stock updated
  })

  test("search articles", async ({ page }) => {
    // Type in search → verify results filter
  })

  test("soft delete and restore article", async ({ page }) => {
    // Delete article → verify marked inactive
    // Show inactive → restore → verify active again
  })
})
```

### Verification — Phase 7

```bash
pnpm vitest run src/lib/services/__tests__/wh-article-service.test.ts
pnpm vitest run src/lib/services/__tests__/wh-article-group-service.test.ts
pnpm vitest run src/trpc/routers/__tests__/whArticles-router.test.ts
pnpm test                          # Full test suite
pnpm typecheck                     # Final typecheck
```

**Expected outcome:** All tests pass. No regressions.

---

## Files Summary

### New Files (17)

| # | Path | Phase |
|---|------|-------|
| 1 | `supabase/migrations/20260323XXXXXX_wh_articles_artikelstamm.sql` | 1A |
| 2 | `src/lib/services/wh-article-repository.ts` | 3A |
| 3 | `src/lib/services/wh-article-service.ts` | 3B |
| 4 | `src/lib/services/wh-article-group-service.ts` | 3C |
| 5 | `src/trpc/routers/warehouse/articles.ts` | 4A |
| 6 | `src/hooks/use-wh-articles.ts` | 5A |
| 7 | `src/app/[locale]/(dashboard)/warehouse/articles/page.tsx` | 6B |
| 8 | `src/app/[locale]/(dashboard)/warehouse/articles/[id]/page.tsx` | 6C |
| 9 | `src/components/warehouse/article-list.tsx` | 6D |
| 10 | `src/components/warehouse/article-form-sheet.tsx` | 6D |
| 11 | `src/components/warehouse/article-detail.tsx` | 6D |
| 12 | `src/components/warehouse/article-group-tree.tsx` | 6D |
| 13 | `src/components/warehouse/article-supplier-list.tsx` | 6D |
| 14 | `src/components/warehouse/article-bom-list.tsx` | 6D |
| 15 | `src/components/warehouse/article-stock-adjust-dialog.tsx` | 6D |
| 16 | `src/components/warehouse/article-search-popover.tsx` | 6D |
| 17 | `src/lib/services/__tests__/wh-article-service.test.ts` | 7A |
| 18 | `src/lib/services/__tests__/wh-article-group-service.test.ts` | 7B |
| 19 | `src/trpc/routers/__tests__/whArticles-router.test.ts` | 7D |
| 20 | `src/e2e-browser/40-wh-articles.spec.ts` | 7E |

### Modified Files (5)

| # | Path | Phase | Change |
|---|------|-------|--------|
| 1 | `prisma/schema.prisma` | 1B | Add 4 models, add Tenant & CrmAddress relations |
| 2 | `src/lib/services/number-sequence-service.ts` | 1C | Add `article: "ART-"` to DEFAULT_PREFIXES |
| 3 | `src/lib/auth/permission-catalog.ts` | 2A | Add 5 warehouse permissions |
| 4 | `src/trpc/routers/warehouse/index.ts` | 4B | Wire `whArticlesRouter` into warehouse router |
| 5 | `src/trpc/routers/_app.ts` | 4C | Import and mount `warehouseRouter` |
| 6 | `src/hooks/index.ts` | 5B | Add barrel exports for warehouse hooks |

---

## Phase Dependencies

```
Phase 1 (DB & Models) ─── must complete before ───> Phase 3 (Service Layer)
Phase 2 (Permissions) ─── must complete before ───> Phase 4 (tRPC Router)
Phase 3 (Service Layer) ── must complete before ───> Phase 4 (tRPC Router)
Phase 4 (tRPC Router) ─── must complete before ───> Phase 5 (Hooks)
Phase 5 (Hooks) ────────── must complete before ───> Phase 6 (UI Components)
Phase 3 (Service Layer) ── must complete before ───> Phase 7A-7C (Service Tests)
Phase 4 (tRPC Router) ─── must complete before ───> Phase 7D (Router Tests)
Phase 6 (UI Components) ── must complete before ───> Phase 7E (E2E Tests)
```

Phases 1 and 2 can be done in parallel. Phases 7A-7D can start as soon as Phase 4 completes (don't need to wait for Phase 6).

---

## Implementation Order (Recommended)

1. **Phase 1A+1B+1C** — Migration SQL, Prisma schema, NumberSequence prefix
2. **Phase 1D** — `pnpm db:generate` (verify)
3. **Phase 2** — Permission catalog
4. **Phase 3A** — Repository
5. **Phase 3B+3C+3D** — Services
6. **Phase 4A+4B+4C** — Router, warehouse index, root router
7. **Checkpoint:** `pnpm typecheck` — verify entire backend stack compiles
8. **Phase 5** — Hooks
9. **Phase 6** — UI components and pages
10. **Phase 7A-7D** — Unit and router tests
11. **Phase 7E** — E2E tests
12. **Final:** `pnpm test && pnpm typecheck && pnpm build`

---

## Notes

- **WH_04 (Stock Movements)** is a future ticket. The `adjustStock` function currently updates `currentStock` directly without creating a `WhStockMovement` record. When WH_04 is implemented, `adjustStock` will be enhanced to also insert into that table.
- **Image upload** uses JSONB storage. Actual file upload to Supabase Storage is handled client-side; the article stores metadata `[{ name, url, size, mimeType }]`.
- **Hard delete** guard currently only checks BOM self-references. When `BillingDocumentPosition` gets an `articleId` FK (ORD_01), the hard delete guard must be updated to check that table too.
- The `article-search-popover.tsx` component must be designed as reusable from the start since ORD_01 and WH_03 will import it for document position article selection.
