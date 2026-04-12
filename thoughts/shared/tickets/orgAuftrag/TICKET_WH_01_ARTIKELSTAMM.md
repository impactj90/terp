# WH_01 — Artikelstamm

| Field | Value |
|-------|-------|
| **Module** | Warehouse |
| **Dependencies** | CRM_01 (Addresses — for suppliers) |
| **Complexity** | L |
| **New Models** | `WhArticle`, `WhArticleGroup`, `WhArticleSupplier`, `WhBillOfMaterial` |

---

## Goal

Implement the article master data system (Artikelstamm). Articles are physical products, materials, or services that can be used in billing documents (ORD_01), purchase orders (WH_03), and warehouse operations. Organized hierarchically in article groups, with supplier links, bill of materials (Stücklisten), and stock tracking. Replaces ZMI orgAuftrag section 8.

---

## Prisma Models

### WhArticleGroup

```prisma
model WhArticleGroup {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId    String   @map("tenant_id") @db.Uuid
  parentId    String?  @map("parent_id") @db.Uuid // Hierarchical tree
  name        String
  sortOrder   Int      @default(0) @map("sort_order")
  createdAt   DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt   DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  tenant   Tenant           @relation(fields: [tenantId], references: [id])
  parent   WhArticleGroup?  @relation("ArticleGroupTree", fields: [parentId], references: [id], onDelete: SetNull)
  children WhArticleGroup[] @relation("ArticleGroupTree")
  articles WhArticle[]

  @@index([tenantId, parentId])
  @@map("wh_article_groups")
}
```

### WhArticle

```prisma
model WhArticle {
  id                  String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId            String   @map("tenant_id") @db.Uuid
  number              String   // Auto-generated via NumberSequence (key: "article")
  name                String   // Bezeichnung
  description         String?  // Beschreibung Individuell
  descriptionAlt      String?  @map("description_alt") // Beschreibung Auswahl (Zubehör)
  groupId             String?  @map("group_id") @db.Uuid // Artikelgruppe
  matchCode           String?  @map("match_code")
  unit                String   @default("Stk") // Grundeinheit: Stk, kg, m, Std, etc.
  vatRate             Float    @default(19.0) @map("vat_rate") // MwSt-Satz %
  sellPrice           Float?   @map("sell_price")   // Standardverkaufspreis (netto)
  buyPrice            Float?   @map("buy_price")    // Einkaufspreis
  discountGroup       String?  @map("discount_group") // Rabattgruppe
  orderType           String?  @map("order_type")     // Bestellart

  // Stock management
  stockTracking       Boolean  @default(false) @map("stock_tracking") // Bestandsüberwachung
  currentStock        Float    @default(0) @map("current_stock")      // Aktueller Bestand
  minStock            Float?   @map("min_stock")                      // Mindestbestand
  warehouseLocation   String?  @map("warehouse_location")             // Lagerort / Lagerzuordnung

  // Images stored as JSONB array
  images              Json?    @db.JsonB // Array of { name, url, size, mimeType }

  isActive            Boolean  @default(true) @map("is_active") // Soft-delete (gelöscht markiert)
  createdAt           DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt           DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)
  createdById         String?  @map("created_by_id") @db.Uuid

  tenant    Tenant             @relation(fields: [tenantId], references: [id])
  group     WhArticleGroup?    @relation(fields: [groupId], references: [id], onDelete: SetNull)
  suppliers WhArticleSupplier[]
  bomParent WhBillOfMaterial[] @relation("BomParent")
  bomChild  WhBillOfMaterial[] @relation("BomChild")

  @@unique([tenantId, number])
  @@index([tenantId, groupId])
  @@index([tenantId, matchCode])
  @@index([tenantId, name])
  @@index([tenantId, isActive])
  @@map("wh_articles")
}
```

### WhArticleSupplier

```prisma
model WhArticleSupplier {
  id                    String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  articleId             String   @map("article_id") @db.Uuid
  supplierId            String   @map("supplier_id") @db.Uuid // CrmAddress with type SUPPLIER or BOTH
  supplierArticleNumber String?  @map("supplier_article_number") // Artikelnummer beim Lieferanten
  supplierDescription   String?  @map("supplier_description")
  isPrimary             Boolean  @default(false) @map("is_primary") // Hauptlieferant
  orderUnit             String?  @map("order_unit")     // Bestelleinheit
  leadTimeDays          Int?     @map("lead_time_days") // Lieferzeit in Tagen
  defaultOrderQty       Float?   @map("default_order_qty") // Standard-Bestellmenge
  buyPrice              Float?   @map("buy_price")         // Einkaufspreis bei diesem Lieferanten
  notes                 String?
  createdAt             DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt             DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  article  WhArticle  @relation(fields: [articleId], references: [id], onDelete: Cascade)
  supplier CrmAddress @relation(fields: [supplierId], references: [id])

  @@unique([articleId, supplierId])
  @@index([supplierId])
  @@map("wh_article_suppliers")
}
```

### WhBillOfMaterial

```prisma
model WhBillOfMaterial {
  id            String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  parentArticleId String @map("parent_article_id") @db.Uuid // Assembly article
  childArticleId  String @map("child_article_id") @db.Uuid  // Component article
  quantity        Float  @default(1)
  sortOrder       Int    @default(0) @map("sort_order")
  notes           String?
  createdAt       DateTime @default(now()) @map("created_at") @db.Timestamptz(6)

  parentArticle WhArticle @relation("BomParent", fields: [parentArticleId], references: [id], onDelete: Cascade)
  childArticle  WhArticle @relation("BomChild", fields: [childArticleId], references: [id], onDelete: Cascade)

  @@unique([parentArticleId, childArticleId])
  @@map("wh_bill_of_materials")
}
```

---

## Permissions

Add to `permission-catalog.ts`:

```ts
p("wh_articles.view", "wh_articles", "view", "View articles"),
p("wh_articles.create", "wh_articles", "create", "Create articles"),
p("wh_articles.edit", "wh_articles", "edit", "Edit articles"),
p("wh_articles.delete", "wh_articles", "delete", "Delete articles"),
p("wh_article_groups.manage", "wh_article_groups", "manage", "Manage article groups"),
```

---

## tRPC Router

**File:** `src/trpc/routers/warehouse/articles.ts`

All procedures use `tenantProcedure.use(requireModule("warehouse"))`.

### Article Procedures

| Procedure | Type | Permission | Input | Description |
|-----------|------|-----------|-------|-------------|
| `list` | query | `wh_articles.view` | `{ search?, groupId?, isActive?, stockTracking?, belowMinStock?, page, pageSize }` | Paginated list with search across number, name, matchCode |
| `getById` | query | `wh_articles.view` | `{ id }` | Full article with suppliers, BOM, stock info |
| `create` | mutation | `wh_articles.create` | Full fields | Auto-generates number via NumberSequence (key: "article") |
| `update` | mutation | `wh_articles.edit` | `{ id, ...fields }` | Partial update |
| `delete` | mutation | `wh_articles.delete` | `{ id }` | Soft-delete (isActive=false) |
| `restore` | mutation | `wh_articles.edit` | `{ id }` | Restore soft-deleted article |
| `hardDelete` | mutation | `wh_articles.delete` | `{ id }` | Only if no document positions reference this article |
| `adjustStock` | mutation | `wh_articles.edit` | `{ id, quantity, reason? }` | Manual stock correction |
| `search` | query | `wh_articles.view` | `{ query, limit? }` | Quick search for autocomplete (number or name) |

### Article Group Procedures

| Procedure | Type | Permission | Input | Description |
|-----------|------|-----------|-------|-------------|
| `groups.tree` | query | `wh_articles.view` | — | Full hierarchical tree of article groups |
| `groups.create` | mutation | `wh_article_groups.manage` | `{ name, parentId? }` | Create group |
| `groups.update` | mutation | `wh_article_groups.manage` | `{ id, name?, parentId? }` | Update group |
| `groups.delete` | mutation | `wh_article_groups.manage` | `{ id }` | Delete if no articles assigned |

### Supplier Procedures

| Procedure | Type | Permission | Input | Description |
|-----------|------|-----------|-------|-------------|
| `suppliers.list` | query | `wh_articles.view` | `{ articleId }` | Suppliers for an article |
| `suppliers.add` | mutation | `wh_articles.edit` | `{ articleId, supplierId, ...fields }` | Link supplier to article |
| `suppliers.update` | mutation | `wh_articles.edit` | `{ id, ...fields }` | Update supplier link |
| `suppliers.remove` | mutation | `wh_articles.edit` | `{ id }` | Remove supplier link |

### BOM Procedures

| Procedure | Type | Permission | Input | Description |
|-----------|------|-----------|-------|-------------|
| `bom.list` | query | `wh_articles.view` | `{ articleId }` | Components of an assembly |
| `bom.add` | mutation | `wh_articles.edit` | `{ parentArticleId, childArticleId, quantity }` | Add component |
| `bom.update` | mutation | `wh_articles.edit` | `{ id, quantity? }` | Update component quantity |
| `bom.remove` | mutation | `wh_articles.edit` | `{ id }` | Remove component |

---

## Service Layer

**Files:**
- `src/lib/services/wh-article-service.ts`
- `src/lib/services/wh-article-repository.ts`
- `src/lib/services/wh-article-group-service.ts`

### Key Logic

- `create` — Auto-generates article number via NumberSequence (key: "article"). Auto-generates matchCode from name if not provided.
- `delete` — Soft-delete only. Sets `isActive=false`. Article remains referenced by document positions.
- `hardDelete` — Only if no BillingDocumentPosition or WhPurchaseOrderPosition references the article.
- `adjustStock` — Creates a WhStockMovement (WH_04) record of type ADJUSTMENT and updates `currentStock`.
- `belowMinStock` filter — Returns articles where `stockTracking=true AND currentStock < minStock`. Used for purchase order suggestions (WH_03).
- `search` — Fast autocomplete: `WHERE (number ILIKE :q% OR name ILIKE %:q%) AND isActive=true LIMIT :limit`.
- BOM — Prevents circular references (article cannot be its own component, directly or transitively).

---

## UI Components

### Page Routes

| Route | Component | Description |
|-------|-----------|-------------|
| `/warehouse/articles` | `WhArticlesPage` | Article list with group tree sidebar |
| `/warehouse/articles/[id]` | `WhArticleDetailPage` | Article detail with tabs |

### Component Files

All in `src/components/warehouse/`:

| Component | Description |
|-----------|-------------|
| `article-list.tsx` | Two-panel layout: Left = article group tree, Right = article data table. Columns: Number, Name, Group, Unit, Price, Stock. Toolbar: search, active toggle, below-min-stock filter. |
| `article-form-sheet.tsx` | Sheet form for create/edit. Fields: name, description, group (tree select), unit, VAT, sell price, buy price, stock tracking toggle, min stock, location, images. |
| `article-detail.tsx` | Detail view with tabs: Overview, Suppliers, Bill of Materials, Stock/Movements (WH_04), Reservations (future), Orders (WH_03), Prices (WH_02) |
| `article-group-tree.tsx` | Collapsible tree component for article groups. Right-click context menu for add/edit/delete. Drag-to-reorder. |
| `article-supplier-list.tsx` | Supplier table within article detail. Add/edit/remove supplier links. |
| `article-bom-list.tsx` | BOM table: component articles with quantity. Add component via article search. |
| `article-stock-adjust-dialog.tsx` | Dialog for manual stock correction: quantity delta, reason. |
| `article-search-popover.tsx` | Reusable article search/autocomplete used in document positions (ORD_01) and purchase orders (WH_03). |

---

## Hooks

**File:** `src/hooks/use-wh-articles.ts`

```ts
export function useWhArticles(filters) {
  return useQuery(trpc.warehouse.articles.list.queryOptions(filters))
}

export function useWhArticle(id: string) {
  return useQuery(trpc.warehouse.articles.getById.queryOptions({ id }))
}

export function useWhArticleSearch(query: string) {
  return useQuery(
    trpc.warehouse.articles.search.queryOptions({ query }),
    { enabled: query.length >= 1 }
  )
}

export function useWhArticleGroups() {
  return useQuery(trpc.warehouse.articles.groups.tree.queryOptions())
}

export function useCreateWhArticle() { /* ... */ }
export function useUpdateWhArticle() { /* ... */ }
export function useAdjustWhArticleStock() { /* ... */ }
```

---

## Tests

### Unit Tests (Service)

**File:** `src/lib/services/__tests__/wh-article-service.test.ts`

- `create` — generates article number via NumberSequence
- `create` — auto-generates matchCode from name
- `list` — filters by group, search, active status
- `list` — belowMinStock filter returns correct articles
- `delete` — soft-deletes (sets isActive=false)
- `hardDelete` — rejects if referenced by document positions
- `restore` — restores soft-deleted article
- `adjustStock` — updates currentStock and creates stock movement
- `search` — returns articles matching number or name prefix
- `bom.add` — rejects circular references
- `suppliers.add` — validates supplierId is SUPPLIER or BOTH type address

### Router Tests

**File:** `src/trpc/routers/__tests__/whArticles-router.test.ts`

```ts
describe("warehouse.articles", () => {
  it("list — requires wh_articles.view permission", async () => { })
  it("list — requires warehouse module enabled", async () => { })
  it("create — assigns auto-generated number", async () => { })
  it("delete — soft-deletes", async () => { })
  it("adjustStock — updates stock and creates movement", async () => { })
  it("search — returns matching articles", async () => { })
  it("groups.tree — returns hierarchical structure", async () => { })
})
```

### E2E Tests

**File:** `src/e2e-browser/40-wh-articles.spec.ts`

```ts
test.describe("UC-WH-01: Article Management", () => {
  test("create an article", async ({ page }) => {
    // Navigate to /warehouse/articles
    // Click "New Article"
    // Fill: name, unit, sell price, select group
    // Submit → verify in list with auto number
  })

  test("create article group hierarchy", async ({ page }) => {
    // Create parent group → create child group
    // Verify tree structure
  })

  test("add supplier to article", async ({ page }) => {
    // Open article → Suppliers tab
    // Add supplier with article number and lead time
    // Verify in list
  })

  test("create bill of materials", async ({ page }) => {
    // Open assembly article → BOM tab
    // Add component articles with quantities
    // Verify BOM list
  })

  test("manual stock adjustment", async ({ page }) => {
    // Open article → adjust stock
    // Enter quantity and reason
    // Verify stock updated
  })

  test("search articles by number and name", async ({ page }) => {
    // Type in search → verify results
  })
})
```

---

## Acceptance Criteria

- [ ] `WhArticle`, `WhArticleGroup`, `WhArticleSupplier`, `WhBillOfMaterial` models created with migration
- [ ] Article number auto-generated via NumberSequence (key: "article")
- [ ] Article group hierarchy (tree structure) works
- [ ] Multiple suppliers per article with primary flag
- [ ] Bill of materials with component articles and quantities
- [ ] Circular BOM references prevented
- [ ] Stock tracking toggle, current stock, min stock
- [ ] Manual stock adjustment creates stock movement record
- [ ] Below-min-stock filter for purchase order suggestions
- [ ] Soft-delete and restore for articles
- [ ] Hard delete only when no references exist
- [ ] Article search/autocomplete reusable in ORD_01 and WH_03
- [ ] Image upload for articles
- [ ] All procedures gated by `requireModule("warehouse")` and `wh_articles.*` permissions
- [ ] Cross-tenant isolation verified
