# WH_08 — Inventur

| Field | Value |
|-------|-------|
| **Module** | Warehouse |
| **Dependencies** | WH_01 (Articles), WH_04 (Stock Movements) |
| **Complexity** | M |
| **New Models** | `WhInventorySession`, `WhInventoryCount` |

---

## Goal

Implement the inventory counting system (Inventur). Inventory counts are performed periodically to verify and correct stock levels. Counts are first collected in a staging area (session), then reviewed, and finally committed to update actual stock. This two-step process (count → commit) prevents accidental stock changes. The commit creates stock movements of type INVENTORY. Replaces ZMI orgAuftrag section 10.3.

---

## Prisma Models

### WhInventorySession

```prisma
enum WhInventorySessionStatus {
  OPEN         // Counting in progress
  REVIEW       // Counting complete, awaiting review
  COMMITTED    // Counts applied to stock
  CANCELLED    // Session cancelled

  @@map("wh_inventory_session_status")
}

model WhInventorySession {
  id          String                      @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId    String                      @map("tenant_id") @db.Uuid
  name        String                      // e.g. "Inventur 2026-Q1", "Jahresinventur 2026"
  status      WhInventorySessionStatus    @default(OPEN)
  startedAt   DateTime                    @default(now()) @map("started_at") @db.Timestamptz(6)
  completedAt DateTime?                   @map("completed_at") @db.Timestamptz(6) // When moved to REVIEW
  committedAt DateTime?                   @map("committed_at") @db.Timestamptz(6) // When applied to stock
  committedById String?                   @map("committed_by_id") @db.Uuid
  notes       String?
  createdAt   DateTime                    @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt   DateTime                    @updatedAt @map("updated_at") @db.Timestamptz(6)
  createdById String?                     @map("created_by_id") @db.Uuid

  tenant Tenant             @relation(fields: [tenantId], references: [id])
  counts WhInventoryCount[]

  @@index([tenantId, status])
  @@map("wh_inventory_sessions")
}
```

### WhInventoryCount

```prisma
model WhInventoryCount {
  id            String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  sessionId     String   @map("session_id") @db.Uuid
  articleId     String   @map("article_id") @db.Uuid
  expectedStock Float    @map("expected_stock") // System stock at time of counting
  countedStock  Float    @map("counted_stock")  // Physically counted
  difference    Float    // countedStock - expectedStock (computed on create)
  notes         String?
  countedById   String?  @map("counted_by_id") @db.Uuid
  countedAt     DateTime @default(now()) @map("counted_at") @db.Timestamptz(6)
  createdAt     DateTime @default(now()) @map("created_at") @db.Timestamptz(6)

  session WhInventorySession @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  article WhArticle          @relation(fields: [articleId], references: [id])

  @@unique([sessionId, articleId]) // One count per article per session
  @@index([sessionId])
  @@map("wh_inventory_counts")
}
```

---

## Permissions

Add to `permission-catalog.ts`:

```ts
p("wh_inventory.view", "wh_inventory", "view", "View inventory sessions and counts"),
p("wh_inventory.count", "wh_inventory", "count", "Perform inventory counts"),
p("wh_inventory.commit", "wh_inventory", "commit", "Commit inventory counts to stock"),
```

---

## tRPC Router

**File:** `src/trpc/routers/warehouse/inventory.ts`

All procedures use `tenantProcedure.use(requireModule("warehouse"))`.

### Session Procedures

| Procedure | Type | Permission | Input | Description |
|-----------|------|-----------|-------|-------------|
| `sessions.list` | query | `wh_inventory.view` | `{ status?, page, pageSize }` | All inventory sessions |
| `sessions.getById` | query | `wh_inventory.view` | `{ id }` | Session with all counts |
| `sessions.create` | mutation | `wh_inventory.count` | `{ name, notes? }` | Create new session (OPEN) |
| `sessions.complete` | mutation | `wh_inventory.count` | `{ id }` | Move to REVIEW status |
| `sessions.commit` | mutation | `wh_inventory.commit` | `{ id }` | Apply counts to stock (creates stock movements) |
| `sessions.cancel` | mutation | `wh_inventory.count` | `{ id }` | Cancel session (no stock changes) |
| `sessions.delete` | mutation | `wh_inventory.count` | `{ id }` | Only OPEN or CANCELLED sessions |

### Count Procedures

| Procedure | Type | Permission | Input | Description |
|-----------|------|-----------|-------|-------------|
| `counts.list` | query | `wh_inventory.view` | `{ sessionId, onlyDifferences? }` | All counts for a session, optionally only those with differences |
| `counts.add` | mutation | `wh_inventory.count` | `{ sessionId, articleId, countedStock }` | Record a count for an article |
| `counts.update` | mutation | `wh_inventory.count` | `{ id, countedStock }` | Update a count |
| `counts.delete` | mutation | `wh_inventory.count` | `{ id }` | Remove a count |
| `counts.addBatch` | mutation | `wh_inventory.count` | `{ sessionId, counts: [{ articleId, countedStock }] }` | Batch add counts |

### Input Schemas

```ts
const addCountInput = z.object({
  sessionId: z.string().uuid(),
  articleId: z.string().uuid(),
  countedStock: z.number().min(0),
})

const addBatchInput = z.object({
  sessionId: z.string().uuid(),
  counts: z.array(z.object({
    articleId: z.string().uuid(),
    countedStock: z.number().min(0),
  })).min(1),
})
```

---

## Service Layer

**Files:**
- `src/lib/services/wh-inventory-service.ts`
- `src/lib/services/wh-inventory-repository.ts`

### Key Logic

#### Add Count

```ts
export async function addCount(prisma, tenantId, input, userId) {
  // 1. Validate session exists, belongs to tenant, status=OPEN
  // 2. Get article current stock (expectedStock)
  // 3. Calculate difference = countedStock - expectedStock
  // 4. Upsert count (if article already counted in session, replace)
  // 5. Return count with article details
}
```

#### Commit Session

```ts
export async function commitSession(prisma, tenantId, sessionId, userId) {
  return prisma.$transaction(async (tx) => {
    const session = await tx.whInventorySession.findUnique({
      where: { id: sessionId },
      include: { counts: true }
    })
    // Validate status = REVIEW

    for (const count of session.counts) {
      if (count.difference === 0) continue // No change needed

      const article = await tx.whArticle.findUnique({ where: { id: count.articleId } })
      const previousStock = article.currentStock
      const newStock = count.countedStock

      // Create INVENTORY stock movement
      await tx.whStockMovement.create({
        data: {
          tenantId,
          articleId: count.articleId,
          type: "INVENTORY",
          quantity: count.difference, // Can be positive or negative
          previousStock,
          newStock,
          inventorySessionId: sessionId,
          reason: `Inventur: ${session.name}`,
          createdById: userId,
        }
      })

      // Update article stock to counted value
      await tx.whArticle.update({
        where: { id: count.articleId },
        data: { currentStock: newStock }
      })
    }

    // Update session status
    await tx.whInventorySession.update({
      where: { id: sessionId },
      data: { status: "COMMITTED", committedAt: new Date(), committedById: userId }
    })
  })
}
```

#### Session Workflow

```
OPEN → (add counts) → REVIEW → (commit) → COMMITTED
                    → CANCELLED (at any point before COMMITTED)
```

- **OPEN** — Counts can be added, updated, deleted
- **REVIEW** — Counts are frozen, differences displayed for review
- **COMMITTED** — Stock updated, movements created. Immutable.
- **CANCELLED** — No stock changes. Session kept for audit trail.

---

## UI Components

### Page Routes

| Route | Component | Description |
|-------|-----------|-------------|
| `/warehouse/inventory` | `WhInventoryPage` | Inventory sessions list |
| `/warehouse/inventory/[id]` | `WhInventorySessionPage` | Session detail with counting interface |

### Component Files

All in `src/components/warehouse/`:

| Component | Description |
|-----------|-------------|
| `inventory-session-list.tsx` | Data table. Columns: Name, Status, Started, Articles Counted, Differences Found, Committed Date. Toolbar: status filter. |
| `inventory-session-form-dialog.tsx` | Dialog to create new session: name, notes. |
| `inventory-counting-interface.tsx` | Main counting UI for OPEN sessions. Article search, scanned quantity input. Shows: Article, Expected Stock, Counted, Difference. Running count total. |
| `inventory-review-view.tsx` | For REVIEW sessions. Shows all counts with differences highlighted. Summary: total articles, articles with differences, net difference. "Commit" and "Back to Counting" buttons. |
| `inventory-committed-view.tsx` | For COMMITTED sessions. Read-only view of what was committed. Shows stock movements created. |
| `inventory-difference-table.tsx` | Table showing only items with differences. Columns: Article, Expected, Counted, Difference, Notes. Color: green for surplus, red for deficit. |
| `inventory-session-status-badge.tsx` | Status badges |

---

## Hooks

**File:** `src/hooks/use-wh-inventory.ts`

```ts
export function useWhInventorySessions(filters) {
  return useQuery(trpc.warehouse.inventory.sessions.list.queryOptions(filters))
}

export function useWhInventorySession(id: string) {
  return useQuery(trpc.warehouse.inventory.sessions.getById.queryOptions({ id }))
}

export function useWhInventoryCounts(sessionId: string, onlyDifferences?: boolean) {
  return useQuery(trpc.warehouse.inventory.counts.list.queryOptions({ sessionId, onlyDifferences }))
}

export function useAddWhInventoryCount() { /* ... */ }
export function useAddWhInventoryCountBatch() { /* ... */ }
export function useCompleteWhInventorySession() { /* ... */ }
export function useCommitWhInventorySession() { /* ... */ }
```

---

## Tests

### Unit Tests (Service)

**File:** `src/lib/services/__tests__/wh-inventory-service.test.ts`

- `addCount` — records count with correct expectedStock and difference
- `addCount` — replaces existing count for same article
- `addCount` — rejects if session status ≠ OPEN
- `complete` — moves session to REVIEW
- `commit` — creates stock movements for each difference
- `commit` — updates article stock to counted values
- `commit` — skips articles with no difference
- `commit` — sets session to COMMITTED
- `commit` — rejects if session status ≠ REVIEW
- `cancel` — sets CANCELLED, no stock changes
- `addBatch` — processes multiple counts in transaction

### Router Tests

**File:** `src/trpc/routers/__tests__/whInventory-router.test.ts`

```ts
describe("warehouse.inventory", () => {
  it("sessions.create — requires wh_inventory.count", async () => { })
  it("sessions.create — requires warehouse module enabled", async () => { })
  it("sessions.commit — requires wh_inventory.commit", async () => { })
  it("counts.add — records count with difference", async () => { })
  it("sessions.commit — updates stock for all counts", async () => { })
  it("sessions.commit — creates INVENTORY stock movements", async () => { })
})
```

### E2E Tests

**File:** `src/e2e-browser/47-wh-inventory.spec.ts`

```ts
test.describe("UC-WH-08: Inventory", () => {
  test("create inventory session and count articles", async ({ page }) => {
    // Navigate to /warehouse/inventory
    // Click "New Session" → enter name
    // Open session → search article → enter counted quantity
    // Verify count recorded with difference
  })

  test("complete and review inventory session", async ({ page }) => {
    // Complete session → verify status = REVIEW
    // Verify differences highlighted
    // Verify "Commit" button visible
  })

  test("commit inventory updates stock", async ({ page }) => {
    // Click "Commit" → confirm
    // Verify status = COMMITTED
    // Navigate to article → verify stock updated to counted value
  })

  test("cancel inventory session", async ({ page }) => {
    // Cancel open session
    // Verify no stock changes
  })
})
```

---

## Acceptance Criteria

- [ ] `WhInventorySession` and `WhInventoryCount` models created with migration
- [ ] Session workflow: OPEN → REVIEW → COMMITTED (or CANCELLED)
- [ ] Counts record expected stock (frozen at count time) and counted stock
- [ ] Difference calculated automatically
- [ ] Counts only editable in OPEN sessions
- [ ] Review view shows all differences with visual highlighting
- [ ] Commit creates INVENTORY stock movements for each difference
- [ ] Commit updates article stock to counted values
- [ ] Commit runs in a single transaction (all-or-nothing)
- [ ] Articles with no difference skipped during commit
- [ ] Batch counting supported
- [ ] Cancel preserves session for audit but makes no stock changes
- [ ] All procedures gated by `requireModule("warehouse")` and `wh_inventory.*` permissions
- [ ] `commit` requires separate `wh_inventory.commit` permission (elevated action)
- [ ] Cross-tenant isolation verified
