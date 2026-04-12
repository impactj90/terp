# ORD_06 — Auswertungen Orders/Billing

| Field | Value |
|-------|-------|
| **Module** | Billing |
| **Dependencies** | ORD_01 (Documents), ORD_02 (Service Cases), ORD_03 (Open Items), ORD_04 (Price Lists), ORD_05 (Recurring) |
| **Complexity** | S |
| **New Models** | None (read-only aggregations over existing Billing models) |

---

## Goal

Provide reporting and analytics dashboards for the Orders/Billing module. Revenue reports, document statistics, open items aging, service case analytics. All read-only — no new models. Replaces ZMI orgAuftrag section 7 (Auswertungen) for Orders data.

---

## Prisma Models

No new models. Reports query:
- `BillingDocument` + `BillingDocumentPosition` (ORD_01)
- `BillingServiceCase` (ORD_02)
- `BillingPayment` (ORD_03)
- `BillingRecurringInvoice` (ORD_05)

---

## Permissions

No new permissions. Reports use existing view permissions:
- `billing_documents.view` → Document/revenue reports
- `billing_service_cases.view` → Service case reports
- `billing_payments.view` → Payment/open items reports

---

## tRPC Router

**File:** `src/trpc/routers/billing/reports.ts`

All procedures use `tenantProcedure.use(requireModule("billing"))`.

### Procedures

| Procedure | Type | Permission | Input | Description |
|-----------|------|-----------|-------|-------------|
| `overview` | query | `billing_documents.view` | — | Dashboard KPIs: revenue this month, open items total, overdue total, documents created this month |
| `revenueByPeriod` | query | `billing_documents.view` | `{ dateFrom, dateTo, groupBy: "day"\|"week"\|"month" }` | Revenue (invoice totals) grouped by period |
| `revenueByCustomer` | query | `billing_documents.view` | `{ dateFrom, dateTo, limit? }` | Top customers by revenue |
| `documentsByType` | query | `billing_documents.view` | `{ dateFrom, dateTo }` | Document count and total by type |
| `documentsByStatus` | query | `billing_documents.view` | `{ type? }` | Document count by status |
| `openItemsAging` | query | `billing_payments.view` | — | Aging buckets: current, 1-30 days, 31-60 days, 61-90 days, 90+ days |
| `serviceCaseStats` | query | `billing_service_cases.view` | `{ dateFrom?, dateTo? }` | Service case counts by status, avg resolution time, top customers |
| `recurringForecast` | query | `billing_documents.view` | `{ months: number }` | Forecasted recurring revenue for next N months |

### Output Schemas

```ts
const overviewOutput = z.object({
  revenueThisMonth: z.number(),
  revenueLastMonth: z.number(),
  revenueChange: z.number(), // percentage
  openItemsTotal: z.number(),
  overdueTotal: z.number(),
  documentsCreatedThisMonth: z.number(),
  invoicesThisMonth: z.number(),
})

const revenueByPeriodOutput = z.object({
  periods: z.array(z.object({
    period: z.string(),
    invoiceTotal: z.number(),
    creditNoteTotal: z.number(),
    netRevenue: z.number(),
  })),
})

const openItemsAgingOutput = z.object({
  current: z.number(),
  days1to30: z.number(),
  days31to60: z.number(),
  days61to90: z.number(),
  days90plus: z.number(),
  total: z.number(),
})

const recurringForecastOutput = z.object({
  months: z.array(z.object({
    month: z.string(),
    expectedRevenue: z.number(),
    templateCount: z.number(),
  })),
})
```

---

## Service Layer

**File:** `src/lib/services/billing-report-service.ts`

### Key Logic

- `revenueByPeriod` — Sums `totalGross` of INVOICE documents (status=PRINTED or FORWARDED) minus CREDIT_NOTE totals, grouped by date_trunc on `documentDate`.
- `revenueByCustomer` — Groups invoices by `addressId`, joins CrmAddress for company name, orders by total descending.
- `openItemsAging` — For each printed invoice, calculates days since `documentDate + paymentTermDays`. Groups into aging buckets. Only includes invoices with open balance.
- `recurringForecast` — For each active recurring template, calculates how many invoices will be generated in each future month based on interval and nextDueDate. Sums position totals from templates.

---

## UI Components

### Page Routes

| Route | Component | Description |
|-------|-----------|-------------|
| `/orders/reports` | `BillingReportsPage` | Reports dashboard |

### Component Files

All in `src/components/billing/`:

| Component | Description |
|-----------|-------------|
| `reports-overview.tsx` | KPI cards: revenue this/last month (with change %), open items, overdue, invoice count |
| `report-revenue-chart.tsx` | Line chart: revenue over time (invoices vs credit notes vs net). Date range picker and groupBy selector. |
| `report-revenue-by-customer.tsx` | Horizontal bar chart: top 10 customers by revenue. Table with full list. |
| `report-documents-by-type.tsx` | Bar chart: document count by type. Stat cards: total per type. |
| `report-open-items-aging.tsx` | Stacked bar chart: aging buckets. Total by bucket. |
| `report-service-cases.tsx` | Stats: open/closed/invoiced counts, avg resolution days. |
| `report-recurring-forecast.tsx` | Bar chart: expected monthly revenue from recurring invoices. |

---

## Hooks

**File:** `src/hooks/use-billing-reports.ts`

```ts
export function useBillingOverview() {
  return useQuery(trpc.billing.reports.overview.queryOptions())
}

export function useBillingRevenueByPeriod(filters) {
  return useQuery(trpc.billing.reports.revenueByPeriod.queryOptions(filters))
}

export function useBillingOpenItemsAging() {
  return useQuery(trpc.billing.reports.openItemsAging.queryOptions())
}

export function useBillingRecurringForecast(months: number) {
  return useQuery(trpc.billing.reports.recurringForecast.queryOptions({ months }))
}
```

---

## Tests

### Unit Tests (Service)

**File:** `src/lib/services/__tests__/billing-report-service.test.ts`

- `overview` — returns correct revenue for current month
- `revenueByPeriod` — groups correctly by month
- `revenueByPeriod` — subtracts credit notes from revenue
- `revenueByCustomer` — orders by total descending
- `openItemsAging` — places items in correct buckets
- `openItemsAging` — excludes fully paid invoices
- `serviceCaseStats` — counts by status
- `recurringForecast` — calculates correctly for monthly interval
- `recurringForecast` — handles end dates (stops counting past endDate)

### Router Tests

**File:** `src/trpc/routers/__tests__/billingReports-router.test.ts`

```ts
describe("billing.reports", () => {
  it("overview — requires billing_documents.view", async () => { })
  it("overview — requires billing module enabled", async () => { })
  it("revenueByPeriod — returns grouped data", async () => { })
  it("openItemsAging — returns buckets", async () => { })
})
```

### E2E Tests

**File:** `src/e2e-browser/35-billing-reports.spec.ts`

```ts
test.describe("UC-ORD-06: Billing Reports", () => {
  test("view billing overview dashboard", async ({ page }) => {
    // Navigate to /orders/reports
    // Verify KPI cards visible
  })

  test("view revenue chart with date filter", async ({ page }) => {
    // Set date range, verify chart updates
  })

  test("view open items aging", async ({ page }) => {
    // Verify aging chart shows correct buckets
  })
})
```

---

## Acceptance Criteria

- [ ] No new database models — all reports are read-only aggregations
- [ ] Overview dashboard with revenue KPIs, open items, and document counts
- [ ] Revenue by period report with day/week/month grouping and date range
- [ ] Revenue by customer report (top customers)
- [ ] Documents by type/status distribution
- [ ] Open items aging report with 5 buckets
- [ ] Service case statistics
- [ ] Recurring invoice revenue forecast
- [ ] All charts render using recharts
- [ ] All reports scoped to tenant
- [ ] All procedures gated by `requireModule("billing")` and appropriate view permissions
