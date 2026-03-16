# ORD_04 — Preislisten

| Field | Value |
|-------|-------|
| **Module** | Billing |
| **Dependencies** | CRM_01 (Addresses — price list assignment to customers) |
| **Complexity** | M |
| **New Models** | `BillingPriceList`, `BillingPriceListEntry` |

---

## Goal

Implement the price list system. Price lists define prices for articles (or free-text items) that can be assigned to customers. When creating document positions (ORD_01), the system automatically looks up the customer's assigned price list to pre-fill prices. Supports a default/standard price list, customer-specific price lists, and volume pricing. Replaces ZMI orgAuftrag section 16.

---

## Prisma Models

### BillingPriceList

```prisma
model BillingPriceList {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId    String   @map("tenant_id") @db.Uuid
  name        String   // "Standardpreisliste", "Großkunde", etc.
  description String?
  isDefault   Boolean  @default(false) @map("is_default") // One default per tenant
  validFrom   DateTime? @map("valid_from") @db.Timestamptz(6)
  validTo     DateTime? @map("valid_to") @db.Timestamptz(6)
  isActive    Boolean  @default(true) @map("is_active")
  createdAt   DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt   DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)
  createdById String?  @map("created_by_id") @db.Uuid

  tenant  Tenant                 @relation(fields: [tenantId], references: [id])
  entries BillingPriceListEntry[]

  @@index([tenantId, isDefault])
  @@index([tenantId, isActive])
  @@map("billing_price_lists")
}
```

### BillingPriceListEntry

```prisma
model BillingPriceListEntry {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  priceListId String   @map("price_list_id") @db.Uuid
  articleId   String?  @map("article_id") @db.Uuid   // Link to WhArticle (WH_01), null for text entries
  itemKey     String?  @map("item_key")              // For non-article items (e.g. "hourly_rate")
  description String?                                 // Override article description
  unitPrice   Float    @map("unit_price")             // Price per unit (netto)
  minQuantity Float?   @map("min_quantity")           // Volume pricing: price applies at this qty
  unit        String?                                  // Override unit
  validFrom   DateTime? @map("valid_from") @db.Timestamptz(6)
  validTo     DateTime? @map("valid_to") @db.Timestamptz(6)
  createdAt   DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt   DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  priceList BillingPriceList @relation(fields: [priceListId], references: [id], onDelete: Cascade)

  @@index([priceListId, articleId])
  @@index([priceListId, itemKey])
  @@map("billing_price_list_entries")
}
```

### Extension to CrmAddress (CRM_01)

The `CrmAddress` model already has `priceListId` field defined in CRM_01. This links a customer to their assigned price list.

---

## Permissions

Add to `permission-catalog.ts`:

```ts
p("billing_price_lists.view", "billing_price_lists", "view", "View price lists"),
p("billing_price_lists.manage", "billing_price_lists", "manage", "Manage price lists and entries"),
```

---

## tRPC Router

**File:** `src/trpc/routers/billing/priceLists.ts`

All procedures use `tenantProcedure.use(requireModule("billing"))`.

### Price List Procedures

| Procedure | Type | Permission | Input | Description |
|-----------|------|-----------|-------|-------------|
| `list` | query | `billing_price_lists.view` | `{ isActive?, search? }` | All price lists for tenant |
| `getById` | query | `billing_price_lists.view` | `{ id }` | Single price list with entries |
| `create` | mutation | `billing_price_lists.manage` | `{ name, description?, isDefault?, validFrom?, validTo? }` | Create price list |
| `update` | mutation | `billing_price_lists.manage` | `{ id, ...fields }` | Update price list |
| `delete` | mutation | `billing_price_lists.manage` | `{ id }` | Delete if not assigned to any customer |
| `setDefault` | mutation | `billing_price_lists.manage` | `{ id }` | Set as default (unsets previous default) |

### Price Entry Procedures

| Procedure | Type | Permission | Input | Description |
|-----------|------|-----------|-------|-------------|
| `entries.list` | query | `billing_price_lists.view` | `{ priceListId, search? }` | All entries for a price list |
| `entries.create` | mutation | `billing_price_lists.manage` | `{ priceListId, articleId?, itemKey?, unitPrice, ...fields }` | Add entry |
| `entries.update` | mutation | `billing_price_lists.manage` | `{ id, unitPrice, ...fields }` | Update entry |
| `entries.delete` | mutation | `billing_price_lists.manage` | `{ id }` | Remove entry |
| `entries.bulkImport` | mutation | `billing_price_lists.manage` | `{ priceListId, entries: [...] }` | Bulk add/update entries |

### Price Lookup Procedure

| Procedure | Type | Permission | Input | Description |
|-----------|------|-----------|-------|-------------|
| `lookupPrice` | query | `billing_price_lists.view` | `{ addressId, articleId?, itemKey?, quantity? }` | Finds best price for an article/item based on customer's assigned price list, quantity, and date validity |

---

## Service Layer

**Files:**
- `src/lib/services/billing-price-list-service.ts`
- `src/lib/services/billing-price-list-repository.ts`

### Key Logic

#### Price Lookup Algorithm

```ts
export async function lookupPrice(
  prisma: PrismaClient,
  tenantId: string,
  input: { addressId: string; articleId?: string; itemKey?: string; quantity?: number }
): Promise<{ unitPrice: number; source: string } | null> {
  // 1. Get customer's assigned price list (CrmAddress.priceListId)
  // 2. If customer has a price list:
  //    a. Look for entry matching articleId/itemKey
  //    b. If quantity provided, find best volume price (minQuantity ≤ quantity, highest minQuantity)
  //    c. Check validity dates (validFrom ≤ now ≤ validTo)
  //    d. Return price with source = "customer_list"
  // 3. If no customer list or no match, check default price list
  //    a. Same lookup logic
  //    b. Return price with source = "default_list"
  // 4. If no match anywhere, return null (use article's base price from WH_01)
}
```

#### Integration with ORD_01 (Document Positions)

When adding an ARTICLE position to a BillingDocument:
1. Call `lookupPrice(addressId, articleId, quantity)`
2. Pre-fill `unitPrice` from the result
3. User can override the price

#### Default Price List

- Only one price list can be `isDefault=true` per tenant
- `setDefault` — unsets all other defaults, sets the new one

#### Bulk Import

- Accepts array of `{ articleId, unitPrice, unit?, minQuantity? }`
- Upserts entries (update if articleId already exists in list, create if not)

---

## UI Components

### Page Routes

| Route | Component | Description |
|-------|-----------|-------------|
| `/orders/price-lists` | `BillingPriceListsPage` | Price list management |
| `/orders/price-lists/[id]` | `BillingPriceListDetailPage` | Price list with entries |

### Component Files

All in `src/components/billing/`:

| Component | Description |
|-----------|-------------|
| `price-list-list.tsx` | Data table. Columns: Name, Description, Default (star icon), Valid dates, Active. |
| `price-list-form-sheet.tsx` | Sheet for create/edit price list metadata. |
| `price-list-entries-table.tsx` | Three-panel layout (like ZMI): Left: price lists, Middle: articles in list, Right: price details. Editable inline table for entries. |
| `price-list-entry-form-dialog.tsx` | Dialog for adding/editing a price entry. Article autocomplete, unit price, min quantity, validity dates. |
| `price-list-bulk-import-dialog.tsx` | CSV/paste import for bulk price entry creation. |

---

## Hooks

**File:** `src/hooks/use-billing-price-lists.ts`

```ts
export function useBillingPriceLists(filters?) {
  return useQuery(trpc.billing.priceLists.list.queryOptions(filters ?? {}))
}

export function useBillingPriceList(id: string) {
  return useQuery(trpc.billing.priceLists.getById.queryOptions({ id }))
}

export function useBillingPriceLookup(addressId: string, articleId?: string) {
  return useQuery(
    trpc.billing.priceLists.lookupPrice.queryOptions({ addressId, articleId }),
    { enabled: !!articleId }
  )
}

export function useCreateBillingPriceList() { /* ... */ }
export function useCreateBillingPriceListEntry() { /* ... */ }
```

---

## Tests

### Unit Tests (Service)

**File:** `src/lib/services/__tests__/billing-price-list-service.test.ts`

- `lookupPrice` — returns customer-specific price when assigned
- `lookupPrice` — falls back to default price list
- `lookupPrice` — returns null if no match
- `lookupPrice` — respects validity dates
- `lookupPrice` — selects best volume price for quantity
- `setDefault` — unsets previous default
- `delete` — rejects if assigned to customers
- `bulkImport` — upserts entries correctly

### Router Tests

**File:** `src/trpc/routers/__tests__/billingPriceLists-router.test.ts`

```ts
describe("billing.priceLists", () => {
  it("list — requires billing_price_lists.view", async () => { })
  it("list — requires billing module enabled", async () => { })
  it("lookupPrice — returns correct price for customer", async () => { })
  it("lookupPrice — falls back to default list", async () => { })
  it("entries.create — adds entry to price list", async () => { })
  it("setDefault — unsets other defaults", async () => { })
})
```

### E2E Tests

**File:** `src/e2e-browser/33-billing-price-lists.spec.ts`

```ts
test.describe("UC-ORD-04: Price Lists", () => {
  test("create a price list with entries", async ({ page }) => {
    // Navigate to /orders/price-lists
    // Click "New" → fill name, mark as default
    // Add article entries with prices
    // Verify entries displayed
  })

  test("assign price list to customer", async ({ page }) => {
    // Navigate to customer address → edit
    // Select price list
    // Save → verify assigned
  })

  test("price auto-fills in document position", async ({ page }) => {
    // Create document for customer with assigned price list
    // Add article position → verify price pre-filled from list
  })
})
```

---

## Acceptance Criteria

- [ ] `BillingPriceList` and `BillingPriceListEntry` models created with migration
- [ ] Price list CRUD fully functional
- [ ] One default price list per tenant
- [ ] Entries support article-linked and custom items
- [ ] Volume pricing via `minQuantity` threshold
- [ ] Validity dates on both lists and entries
- [ ] Price lookup algorithm: customer list → default list → article base price
- [ ] Price list assignable to CRM addresses via `priceListId`
- [ ] Document positions auto-fill price from customer's list (ORD_01 integration)
- [ ] Bulk import of price entries
- [ ] Delete rejected if price list assigned to customers
- [ ] All procedures gated by `requireModule("billing")` and `billing_price_lists.*` permissions
- [ ] Cross-tenant isolation verified
