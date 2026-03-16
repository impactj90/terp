# WH_07 — Terminüberwachung

| Field | Value |
|-------|-------|
| **Module** | Warehouse |
| **Dependencies** | WH_03 (Purchase Orders) |
| **Complexity** | S |
| **New Models** | None (read-only view on `WhPurchaseOrder` and `WhPurchaseOrderPosition`) |

---

## Goal

Implement delivery date monitoring (Terminüberwachung) for open purchase orders. Provides an overview of all pending deliveries with their expected dates, highlighting overdue items. Used by procurement to follow up with suppliers on late deliveries. Replaces ZMI orgAuftrag section 9.4.

---

## Prisma Models

No new models. Read-only views on:
- `WhPurchaseOrder` (WH_03) — status ORDERED or PARTIALLY_RECEIVED
- `WhPurchaseOrderPosition` (WH_03) — with delivery dates

---

## Permissions

No new permissions. Uses existing:
- `wh_purchase_orders.view` — View purchase orders

---

## tRPC Router

**File:** `src/trpc/routers/warehouse/deliveryMonitoring.ts`

All procedures use `tenantProcedure.use(requireModule("warehouse"))`.

### Procedures

| Procedure | Type | Permission | Input | Description |
|-----------|------|-----------|-------|-------------|
| `list` | query | `wh_purchase_orders.view` | `{ supplierId?, overdue?, dateFrom?, dateTo?, page, pageSize }` | All open PO positions with delivery dates |
| `summary` | query | `wh_purchase_orders.view` | — | KPIs: total open, overdue count, due this week, due this month |
| `overdueBySupplier` | query | `wh_purchase_orders.view` | — | Overdue positions grouped by supplier |

### Output Schemas

```ts
const listItemSchema = z.object({
  purchaseOrderId: z.string(),
  purchaseOrderNumber: z.string(),
  supplierId: z.string(),
  supplierName: z.string(),
  positionId: z.string(),
  articleNumber: z.string(),
  articleName: z.string(),
  orderedQuantity: z.number(),
  receivedQuantity: z.number(),
  remainingQuantity: z.number(),
  requestedDelivery: z.date().nullable(),
  confirmedDelivery: z.date().nullable(),
  isOverdue: z.boolean(),
  daysOverdue: z.number(), // 0 or positive
})

const summarySchema = z.object({
  totalOpenPositions: z.number(),
  overduePositions: z.number(),
  dueThisWeek: z.number(),
  dueThisMonth: z.number(),
  totalOpenValue: z.number(), // Sum of remaining × unitPrice
})

const overdueBySupplierSchema = z.object({
  suppliers: z.array(z.object({
    supplierId: z.string(),
    supplierName: z.string(),
    overduePositions: z.number(),
    oldestOverdue: z.date().nullable(),
    totalOverdueValue: z.number(),
  })),
})
```

---

## Service Layer

**File:** `src/lib/services/wh-delivery-monitoring-service.ts`

### Key Logic

```ts
export async function listDeliveryPositions(prisma, tenantId, filters) {
  // 1. Query WhPurchaseOrderPosition with joins to WhPurchaseOrder and WhArticle
  // 2. Filter: PO status in (ORDERED, PARTIALLY_RECEIVED)
  // 3. Filter: receivedQuantity < quantity (still pending)
  // 4. Calculate isOverdue:
  //    - If confirmedDelivery: overdue if confirmedDelivery < today
  //    - Else if requestedDelivery: overdue if requestedDelivery < today
  //    - Else: not overdue (no delivery date set)
  // 5. Calculate daysOverdue: max(0, daysBetween(deliveryDate, today))
  // 6. If overdue filter=true: only return overdue positions
  // 7. Sort by: overdue first (most overdue), then by delivery date ascending
}

export async function getSummary(prisma, tenantId) {
  // Count open positions (receivedQty < orderedQty in ORDERED/PARTIALLY_RECEIVED POs)
  // Count overdue (delivery date < today)
  // Count due this week (delivery date between today and end of week)
  // Count due this month
  // Sum remaining value
}
```

---

## UI Components

### Page Routes

| Route | Component | Description |
|-------|-----------|-------------|
| `/warehouse/delivery-monitoring` | `WhDeliveryMonitoringPage` | Delivery monitoring dashboard |

### Component Files

All in `src/components/warehouse/`:

| Component | Description |
|-----------|-------------|
| `delivery-monitoring-dashboard.tsx` | Top: KPI cards (total open, overdue, due this week, due this month). Below: position table. |
| `delivery-monitoring-table.tsx` | Data table. Columns: PO Number, Supplier, Article, Ordered, Received, Remaining, Requested Date, Confirmed Date, Status (overdue badge). Row color: red for overdue, yellow for due this week. Toolbar: supplier filter, overdue-only toggle, date range. |
| `delivery-monitoring-supplier-view.tsx` | Grouped view: collapsible sections per supplier showing their overdue positions. |
| `delivery-overdue-badge.tsx` | Badge showing "X days overdue" or "due in Y days" |

---

## Hooks

**File:** `src/hooks/use-wh-delivery-monitoring.ts`

```ts
export function useWhDeliveryMonitoring(filters) {
  return useQuery(trpc.warehouse.deliveryMonitoring.list.queryOptions(filters))
}

export function useWhDeliveryMonitoringSummary() {
  return useQuery(trpc.warehouse.deliveryMonitoring.summary.queryOptions())
}

export function useWhOverdueBySupplier() {
  return useQuery(trpc.warehouse.deliveryMonitoring.overdueBySupplier.queryOptions())
}
```

---

## Tests

### Unit Tests (Service)

**File:** `src/lib/services/__tests__/wh-delivery-monitoring-service.test.ts`

- `list` — returns only positions from ORDERED/PARTIALLY_RECEIVED POs
- `list` — excludes fully received positions
- `list` — calculates isOverdue correctly for confirmed delivery date
- `list` — calculates isOverdue correctly for requested delivery date (fallback)
- `list` — filters by overdue only
- `list` — filters by supplier
- `summary` — returns correct counts
- `summary` — counts "due this week" correctly
- `overdueBySupplier` — groups correctly

### Router Tests

**File:** `src/trpc/routers/__tests__/whDeliveryMonitoring-router.test.ts`

```ts
describe("warehouse.deliveryMonitoring", () => {
  it("list — requires wh_purchase_orders.view", async () => { })
  it("list — requires warehouse module enabled", async () => { })
  it("list — returns overdue positions first", async () => { })
  it("summary — returns correct KPIs", async () => { })
})
```

### E2E Tests

**File:** `src/e2e-browser/46-wh-delivery-monitoring.spec.ts`

```ts
test.describe("UC-WH-07: Delivery Monitoring", () => {
  test("view delivery monitoring dashboard", async ({ page }) => {
    // Navigate to /warehouse/delivery-monitoring
    // Verify KPI cards visible
    // Verify positions table shows open deliveries
  })

  test("filter overdue deliveries", async ({ page }) => {
    // Toggle "Overdue only"
    // Verify only overdue positions shown (highlighted red)
  })

  test("filter by supplier", async ({ page }) => {
    // Select supplier filter
    // Verify only that supplier's positions shown
  })
})
```

---

## Acceptance Criteria

- [ ] No new database models — read-only view on purchase orders and positions
- [ ] Dashboard shows KPIs: total open, overdue, due this week, due this month
- [ ] Position table shows all pending deliveries with remaining quantities
- [ ] Overdue detection works for both confirmed and requested delivery dates
- [ ] Overdue positions highlighted visually (red)
- [ ] Due-this-week positions highlighted (yellow)
- [ ] Filter by supplier, overdue-only, date range
- [ ] Supplier-grouped view for overdue positions
- [ ] Sorted by urgency (most overdue first)
- [ ] All procedures gated by `requireModule("warehouse")` and `wh_purchase_orders.view`
- [ ] Cross-tenant isolation verified
