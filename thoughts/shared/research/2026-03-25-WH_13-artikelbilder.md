# Research: WH_13 Artikelbilder (Article Images)

**Date:** 2026-03-25
**Ticket:** `thoughts/shared/tickets/orgAuftrag/TICKET_WH_13_ARTIKELBILDER.md`

---

## 1. WhArticle Model (Current State)

**Schema location:** `prisma/schema.prisma` lines 4182-4221

The `WhArticle` model already has a JSONB `images` field (line 4201):

```prisma
images  Json?  @db.JsonB
```

This field is unused in practice — it was included in the original WH_01 migration (`20260323100000_wh_articles_artikelstamm.sql`, line 36) but no code reads or renders it. The service and router both accept `images` as `z.any().optional()` / `unknown` but just pass it through as raw JSON.

**Related models on WhArticle:**
- `WhArticleGroup` (hierarchical tree, many-to-one)
- `WhArticleSupplier` (junction table with CrmAddress, many-to-many)
- `WhBillOfMaterial` (self-referencing parent/child BOM)
- `WhPurchaseOrderPosition` (FK to article)
- `WhStockMovement` (FK to article)

**No `WhArticleImage` relation exists yet.** The ticket proposes adding it.

---

## 2. Article Router

**File:** `src/trpc/routers/warehouse/articles.ts` (564 lines)

**Structure:**
- Flat procedures at top level: `list`, `getById`, `create`, `update`, `delete`, `restore`, `hardDelete`, `adjustStock`, `search`, `stockValueSummary`
- Nested sub-router for groups: `groups.tree`, `groups.create`, `groups.update`, `groups.delete`
- Flat procedures for suppliers: `suppliersList`, `suppliersAdd`, `suppliersUpdate`, `suppliersRemove`
- Flat procedures for BOM: `bomList`, `bomAdd`, `bomUpdate`, `bomRemove`

**Base procedure pattern:**
```ts
const whProcedure = tenantProcedure.use(requireModule("warehouse"))
```
Then each procedure chains `.use(requirePermission(WH_VIEW))` or similar.

**Permission constants:**
```ts
const WH_VIEW = permissionIdByKey("wh_articles.view")!
const WH_CREATE = permissionIdByKey("wh_articles.create")!
const WH_EDIT = permissionIdByKey("wh_articles.edit")!
const WH_DELETE = permissionIdByKey("wh_articles.delete")!
const WH_GROUPS_MANAGE = permissionIdByKey("wh_article_groups.manage")!
```

The `groups` sub-router is the only nested `createTRPCRouter()` inside the articles router. Suppliers and BOM use flat naming (`suppliersList`, `suppliersAdd`, etc.).

**Warehouse router index:** `src/trpc/routers/warehouse/index.ts` merges:
- `articles` (whArticlesRouter)
- `articlePrices` (whArticlePricesRouter)
- `purchaseOrders`
- `stockMovements`
- `withdrawals`
- `supplierInvoices`

---

## 3. Article Service + Repository

**Service:** `src/lib/services/wh-article-service.ts` (570 lines)
- Provides: `list`, `getById`, `create`, `update`, `remove`, `restoreArticle`, `hardDelete`, `adjustStock`, `searchArticles`
- Supplier functions: `listSuppliers`, `addSupplier`, `updateSupplier`, `removeSupplier`
- BOM functions: `listBom`, `addBom`, `updateBom`, `removeBom`
- Stock: `getStockValueSummary`
- Error classes: `WhArticleNotFoundError`, `WhArticleValidationError`, `WhArticleConflictError`
- Uses audit logging via `audit-logs-service`

**Repository:** `src/lib/services/wh-article-repository.ts` (520 lines)
- Contains all Prisma queries for articles, groups, suppliers, and BOM in one file
- Uses `tenantScopedUpdate` from `prisma-helpers` for safe tenant-scoped updates
- Supplier/BOM ownership checks use `article: { tenantId }` relation filter pattern

---

## 4. Supabase Storage Usage (Existing Patterns)

### 4a. Supabase Config (`supabase/config.toml`)

Two buckets already configured:
```toml
[storage.buckets.documents]
public = false
file_size_limit = "10MiB"
allowed_mime_types = ["application/pdf", "text/xml"]

[storage.buckets.tenant-logos]
public = true
file_size_limit = "2MiB"
allowed_mime_types = ["image/png", "image/jpeg", "image/svg+xml", "image/webp"]
```

Global storage limit: `file_size_limit = "10MiB"`.

### 4b. Admin Client (`src/lib/supabase/admin.ts`)

Server-side admin client with service role key — bypasses RLS. Used by all existing storage operations.

### 4c. Browser Client (`src/lib/supabase/client.ts`)

Browser-side client using `@supabase/ssr`'s `createBrowserClient` with anon key. Used for auth. Could be used for direct-to-Storage uploads with signed URLs.

### 4d. Existing Upload Pattern (PDF Services)

**Pattern used in `billing-document-pdf-service.ts` and `wh-purchase-order-pdf-service.ts`:**

1. Server generates content (PDF buffer)
2. Server uploads to Supabase Storage via admin client:
   ```ts
   const supabase = createAdminClient()
   await supabase.storage.from(BUCKET).upload(storagePath, buffer, { contentType, upsert: true })
   ```
3. Server creates signed URL for download:
   ```ts
   await supabase.storage.from(BUCKET).createSignedUrl(storagePath, EXPIRY_SECONDS)
   ```
4. URL fixup for Docker internal/public URL mismatch:
   ```ts
   if (internalUrl !== publicUrl) signedUrl = signedUrl.replace(internalUrl, publicUrl)
   ```

**There is NO existing pattern for client-side uploads via signed upload URLs.** All current uploads happen server-side. The ticket proposes a **signed upload URL flow** where the client uploads directly to Storage, which is a new pattern for this codebase.

### 4e. tRPC Context

The tRPC context (`src/trpc/init.ts`) does NOT expose a Supabase client directly. It only stores `authToken`, `session`, `user`, `prisma`, `tenantId`. Services that need Supabase create their own admin client via `createAdminClient()`.

---

## 5. Permission Catalog

**File:** `src/lib/auth/permission-catalog.ts` (322 lines)

Warehouse article permissions (lines 276-280):
```ts
p("wh_articles.view", "wh_articles", "view", "View warehouse articles"),
p("wh_articles.create", "wh_articles", "create", "Create warehouse articles"),
p("wh_articles.edit", "wh_articles", "edit", "Edit warehouse articles"),
p("wh_articles.delete", "wh_articles", "delete", "Delete warehouse articles"),
p("wh_article_groups.manage", "wh_article_groups", "manage", "Manage warehouse article groups"),
```

The ticket proposes two new permissions:
```ts
p("wh_articles.upload_image", "wh_articles", "upload_image", "Upload article images"),
p("wh_articles.delete_image", "wh_articles", "delete_image", "Delete article images"),
```

**Pattern:** Permissions use `p(key, resource, action, description)` with deterministic UUID v5 generation. The catalog currently has ~98 permissions.

---

## 6. Frontend Components

### 6a. Article Detail (`src/components/warehouse/article-detail.tsx`)

260 lines. Uses `Tabs` / `TabsContent` / `TabsList` / `TabsTrigger` from `@/components/ui/tabs`.

**Current 5 tabs:**
1. `overview` — Master data cards
2. `suppliers` — `<ArticleSupplierList>`
3. `bom` — `<ArticleBomList>`
4. `stock` — `<ArticleMovementsTab>`
5. `prices` — `<ArticlePriceTab>`

The ticket requires adding a 6th tab: `images` -> `<ArticleImagesTab>`.

**Tab component pattern:** Each tab renders a standalone component that receives `articleId` as prop and manages its own data fetching.

### 6b. Article List (`src/components/warehouse/article-list.tsx`)

166 lines. Table with columns: Number, Name, Group, Unit, SellPrice, Stock, Status, Actions.

**Interface:**
```ts
interface WhArticleRow {
  id: string; number: string; name: string; unit: string;
  sellPrice: number | null; currentStock: number;
  stockTracking: boolean; isActive: boolean;
  group?: { id: string; name: string } | null;
}
```

The ticket requires adding a thumbnail column (first column) showing the primary image. The `WhArticleRow` interface will need a `primaryImageThumbnailUrl` or similar field.

### 6c. Article Form Sheet (`src/components/warehouse/article-form-sheet.tsx`)

357 lines. Sheet-based form for create/edit. No image-related fields.

### 6d. Other Warehouse Components

~45 components in `src/components/warehouse/`. Dashboard components in `dashboard/` subdirectory. All follow consistent patterns with hooks, translations, and shadcn/ui components.

---

## 7. Hooks

**File:** `src/hooks/use-wh-articles.ts` (313 lines)

Exports (re-exported from `src/hooks/index.ts` lines 813-841):
- `useWhArticles`, `useWhArticle`, `useWhArticleSearch`, `useWhArticleGroups`
- CRUD: `useCreateWhArticle`, `useUpdateWhArticle`, `useDeleteWhArticle`, `useRestoreWhArticle`, `useHardDeleteWhArticle`
- `useAdjustWhArticleStock`
- Groups: `useCreateWhArticleGroup`, `useUpdateWhArticleGroup`, `useDeleteWhArticleGroup`
- Suppliers: `useWhArticleSuppliers`, `useAddWhArticleSupplier`, `useUpdateWhArticleSupplier`, `useRemoveWhArticleSupplier`
- BOM: `useWhArticleBom`, `useAddWhArticleBom`, `useUpdateWhArticleBom`, `useRemoveWhArticleBom`

**Hook pattern:** All hooks use `useTRPC()` to get the typed client, then `useQuery`/`useMutation` from `@tanstack/react-query`. Mutations invalidate related query keys on success.

---

## 8. Drag-and-Drop Libraries

**Installed (in `package.json`):**
- `@dnd-kit/core`: `^6.3.1`
- `@dnd-kit/utilities`: `^3.2.2`

**NOT installed:**
- `@dnd-kit/sortable` — **needed for sortable list functionality** (drag-and-drop image reordering)
- `react-beautiful-dnd`
- `react-dnd`

**Existing usage:** `@dnd-kit/core` is used in `src/components/shift-planning/shift-planning-board.tsx` for the shift planning drag-drop board. It uses `DndContext`, `DragOverlay`, `DragStartEvent`, `DragEndEvent`, `useDroppable`. This is a palette-to-cell drag pattern, not a sortable list.

For the image reordering feature, `@dnd-kit/sortable` will need to be installed as a new dependency.

---

## 9. Image Processing Libraries

**None installed.** No `sharp`, `jimp`, or other image processing libraries in `package.json`.

The ticket mentions thumbnail generation (200x200 WebP). Options:
1. Install `sharp` (most common Node.js image processing library)
2. Use Supabase Image Transformations (if available on the deployment)

The existing codebase has `@react-pdf/renderer` for PDF generation but nothing for image manipulation.

---

## 10. Migration Patterns

**Latest migration:** `20260331100000_wh_delivery_note_stock_mode.sql`

**Naming convention:** `YYYYMMDDHHMMSS_descriptive_name.sql`

**Pattern from WH_01 migration (`20260323100000_wh_articles_artikelstamm.sql`):**
- `CREATE TABLE` with UUID primary key `DEFAULT gen_random_uuid()`
- `tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`
- Composite indexes with `tenant_id` first
- Foreign keys with appropriate `ON DELETE` behavior (`CASCADE`, `SET NULL`)

The new migration will need:
1. `CREATE TABLE wh_article_images` (matching the ticket's Prisma model)
2. Indexes on `(article_id, sort_order)` and `(tenant_id)`
3. Storage bucket configuration in `supabase/config.toml`

---

## 11. Handbook

**File:** `docs/TERP_HANDBUCH.md`

**Section 14: Lagerverwaltung -- Artikelstamm** (line 6378+)

Current article detail documentation (14.2, line 6474) describes 5 tabs:
- Tab "Ubersicht" (overview)
- Tab "Lieferanten" (suppliers)
- Tab "Stuckliste" (BOM)
- Tab "Bestand" (stock)
- Tab "Preise" (prices)

This section will need:
- A new **Tab "Bilder"** subsection under 14.2
- Updated article list description (14.1) mentioning the thumbnail column
- Potentially a new Praxisbeispiel for image management

The handbook TOC (line 62-66) lists:
```
14. Lagerverwaltung -- Artikelstamm
    14.1 Artikelliste
    14.2 Artikeldetailseite
    14.3 Bestandskorrektur
    14.4 Praxisbeispiel
```

---

## 12. Existing `images` JSONB Field

The `WhArticle.images` field (JSONB, nullable) exists in the schema and migration but is **functionally unused**:
- `wh-article-service.ts` lines 117, 150, 184, 209: accepts `images?: unknown` and passes through
- `wh-article-repository.ts` line 143: accepts as `Prisma.InputJsonValue | null`
- Router `articles.ts` lines 139, 179: accepts as `z.any().optional()`
- No frontend component reads or renders the `images` field

With the new `WhArticleImage` model, the JSONB `images` field becomes redundant. It could be:
- Left as-is (no breaking change)
- Removed in a future cleanup migration

---

## 13. Summary of Files to Create/Modify

### New Files
| File | Purpose |
|------|---------|
| `src/lib/services/wh-article-image-service.ts` | Service + repository for image CRUD, signed URL generation, thumbnail creation |
| `src/hooks/use-wh-article-images.ts` | React hooks for image queries/mutations |
| `src/components/warehouse/article-images-tab.tsx` | Images tab with gallery, drag-and-drop sort, primary badge |
| `src/components/warehouse/article-image-upload.tsx` | Upload dialog with drag-and-drop zone, progress, validation |
| `supabase/migrations/YYYYMMDDHHMMSS_wh_article_images.sql` | Migration for `wh_article_images` table |

### Files to Modify
| File | Change |
|------|--------|
| `prisma/schema.prisma` | Add `WhArticleImage` model, add `images WhArticleImage[]` relation on `WhArticle` |
| `src/trpc/routers/warehouse/articles.ts` | Add `images.*` sub-router procedures (or flat `imagesList`, `imagesGetUploadUrl`, etc.) |
| `src/lib/auth/permission-catalog.ts` | Add `wh_articles.upload_image` and `wh_articles.delete_image` permissions |
| `src/components/warehouse/article-detail.tsx` | Add "Bilder" tab |
| `src/components/warehouse/article-list.tsx` | Add thumbnail column |
| `src/hooks/index.ts` | Export new image hooks |
| `supabase/config.toml` | Add `[storage.buckets.wh-article-images]` bucket config |
| `docs/TERP_HANDBUCH.md` | Add Bilder tab documentation under 14.2 |
| `package.json` | Add `sharp` and `@dnd-kit/sortable` dependencies |

### Test Files to Create
| File | Purpose |
|------|---------|
| `src/lib/services/__tests__/wh-article-image-service.test.ts` | Service unit tests |
| `src/trpc/routers/__tests__/whArticleImages-router.test.ts` | Router integration tests |
| `src/e2e-browser/52-wh-article-images.spec.ts` | Browser E2E tests |
