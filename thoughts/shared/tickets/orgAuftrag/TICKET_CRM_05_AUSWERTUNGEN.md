# CRM_05 — Auswertungen CRM

| Field | Value |
|-------|-------|
| **Module** | CRM |
| **Dependencies** | CRM_01 (Addresses), CRM_02 (Correspondence), CRM_03 (Inquiries), CRM_04 (Tasks) |
| **Complexity** | S |
| **New Models** | None (read-only aggregations over existing CRM models) |

---

## Goal

Provide reporting and analytics dashboards for the CRM module. Replaces ZMI orgAuftrag section 7 (Auswertungen) for CRM data. All reports are read-only aggregations — no new database models are needed. Reports include address statistics, correspondence activity, inquiry pipeline, and task completion metrics.

---

## Prisma Models

No new models. All reports query existing CRM models:
- `CrmAddress` (CRM_01)
- `CrmCorrespondence` (CRM_02)
- `CrmInquiry` (CRM_03)
- `CrmTask` (CRM_04)

---

## Permissions

Reuses existing permissions — reporting requires `view` on the respective resource:

```ts
// No new permissions needed. Reports use:
// - crm_addresses.view → Address reports
// - crm_correspondence.view → Correspondence reports
// - crm_inquiries.view → Inquiry reports
// - crm_tasks.view → Task reports
```

---

## tRPC Router

**File:** `src/trpc/routers/crm/reports.ts`

All procedures use `tenantProcedure.use(requireModule("crm"))`.

### Procedures

| Procedure | Type | Permission | Input | Description |
|-----------|------|-----------|-------|-------------|
| `addressStats` | query | `crm_addresses.view` | `{ type? }` | Counts by type (customer/supplier/both), active/inactive |
| `correspondenceByPeriod` | query | `crm_correspondence.view` | `{ dateFrom, dateTo, groupBy: "day"\|"week"\|"month" }` | Correspondence count grouped by period and direction |
| `correspondenceByType` | query | `crm_correspondence.view` | `{ dateFrom, dateTo }` | Correspondence count grouped by type (phone, email, etc.) |
| `inquiryPipeline` | query | `crm_inquiries.view` | `{ dateFrom?, dateTo? }` | Inquiry counts by status, avg time to close, top addresses |
| `inquiryByEffort` | query | `crm_inquiries.view` | `{ dateFrom?, dateTo? }` | Inquiry count grouped by effort level |
| `taskCompletion` | query | `crm_tasks.view` | `{ dateFrom?, dateTo? }` | Task completion rate, avg completion time, overdue count |
| `tasksByAssignee` | query | `crm_tasks.view` | `{ dateFrom?, dateTo? }` | Task count per employee/team with completion status |
| `overview` | query | `crm_addresses.view` | — | Dashboard summary: total addresses, open inquiries, pending tasks, recent correspondence count |

### Output Schemas

```ts
const addressStatsOutput = z.object({
  total: z.number(),
  byType: z.array(z.object({ type: z.string(), count: z.number() })),
  active: z.number(),
  inactive: z.number(),
})

const correspondenceByPeriodOutput = z.object({
  periods: z.array(z.object({
    period: z.string(), // "2026-03", "2026-W12", "2026-03-16"
    incoming: z.number(),
    outgoing: z.number(),
    internal: z.number(),
    total: z.number(),
  })),
})

const inquiryPipelineOutput = z.object({
  byStatus: z.array(z.object({ status: z.string(), count: z.number() })),
  avgDaysToClose: z.number().nullable(),
  topAddresses: z.array(z.object({
    addressId: z.string(),
    company: z.string(),
    count: z.number(),
  })),
})

const overviewOutput = z.object({
  totalAddresses: z.number(),
  newAddressesThisMonth: z.number(),
  openInquiries: z.number(),
  pendingTasks: z.number(),
  correspondenceThisWeek: z.number(),
  overdueTaskCount: z.number(),
})
```

---

## Service Layer

**Files:**
- `src/lib/services/crm-report-service.ts`

### Key Logic

All report functions use Prisma `groupBy`, `count`, and `aggregate` operations. No raw SQL unless performance requires it.

- `addressStats` — `prisma.crmAddress.groupBy({ by: ['type'], _count: true, where: { tenantId } })`
- `correspondenceByPeriod` — Groups by `date` field truncated to day/week/month. Uses Prisma raw query for date truncation: `$queryRaw` with `date_trunc`.
- `inquiryPipeline` — Groups by status, calculates avg days between `createdAt` and `closedAt` for closed inquiries.
- `taskCompletion` — Calculates completed vs total, overdue (dueAt < now AND status != COMPLETED).
- `overview` — Single query aggregating key metrics for the CRM dashboard card.

---

## UI Components

### Page Routes

| Route | Component | Description |
|-------|-----------|-------------|
| `/crm/reports` | `CrmReportsPage` | Reports dashboard with multiple cards/charts |

### Component Files

All in `src/components/crm/`:

| Component | Description |
|-----------|-------------|
| `reports-overview.tsx` | Top-level dashboard with KPI cards (total addresses, open inquiries, pending tasks, overdue tasks) |
| `report-address-stats.tsx` | Pie chart: addresses by type. Bar chart: active vs inactive. |
| `report-correspondence-chart.tsx` | Line/bar chart: correspondence volume over time, split by direction. Date range picker. |
| `report-inquiry-pipeline.tsx` | Funnel or bar chart: inquiries by status. Stat cards: avg close time. Table: top addresses by inquiry count. |
| `report-task-completion.tsx` | Progress ring: completion rate. Table: tasks by assignee with completion count. |

### Chart Library

Use `recharts` (already a dependency in the project) for all visualizations.

---

## Hooks

**File:** `src/hooks/use-crm-reports.ts`

```ts
export function useCrmOverview() {
  return useQuery(trpc.crm.reports.overview.queryOptions())
}

export function useCrmCorrespondenceReport(filters) {
  return useQuery(trpc.crm.reports.correspondenceByPeriod.queryOptions(filters))
}

export function useCrmInquiryPipeline(filters) {
  return useQuery(trpc.crm.reports.inquiryPipeline.queryOptions(filters))
}

export function useCrmTaskCompletion(filters) {
  return useQuery(trpc.crm.reports.taskCompletion.queryOptions(filters))
}
```

---

## Tests

### Unit Tests (Service)

**File:** `src/lib/services/__tests__/crm-report-service.test.ts`

- `addressStats` — returns correct counts by type
- `correspondenceByPeriod` — groups correctly by month
- `correspondenceByPeriod` — respects date range filter
- `inquiryPipeline` — counts by status correctly
- `inquiryPipeline` — calculates avg days to close
- `taskCompletion` — calculates completion rate
- `taskCompletion` — counts overdue tasks
- `overview` — returns all summary metrics
- All reports — scoped to tenant

### Router Tests

**File:** `src/trpc/routers/__tests__/crmReports-router.test.ts`

```ts
describe("crm.reports", () => {
  it("overview — requires crm_addresses.view permission", async () => { })
  it("overview — requires CRM module enabled", async () => { })
  it("correspondenceByPeriod — returns grouped data", async () => { })
  it("inquiryPipeline — includes avg close time", async () => { })
})
```

### E2E Tests

**File:** `src/e2e-browser/24-crm-reports.spec.ts`

```ts
test.describe("UC-CRM-05: CRM Reports", () => {
  test("view CRM overview dashboard", async ({ page }) => {
    // Navigate to /crm/reports
    // Verify KPI cards are visible (total addresses, open inquiries, etc.)
  })

  test("view correspondence chart with date filter", async ({ page }) => {
    // Set date range
    // Verify chart updates
  })

  test("view inquiry pipeline", async ({ page }) => {
    // Verify pipeline chart shows status distribution
  })
})
```

---

## Acceptance Criteria

- [ ] No new database models — all reports are read-only aggregations
- [ ] CRM overview dashboard shows key metrics (total addresses, open inquiries, pending tasks, overdue)
- [ ] Address stats report shows distribution by type and active/inactive
- [ ] Correspondence report groups by period (day/week/month) with direction breakdown
- [ ] Correspondence report filters by date range
- [ ] Inquiry pipeline shows status distribution and avg close time
- [ ] Task completion report shows rate, overdue count, per-assignee breakdown
- [ ] All charts render correctly using recharts
- [ ] All reports scoped to tenant
- [ ] All procedures gated by `requireModule("crm")` and appropriate view permissions
- [ ] Reports page accessible from CRM sidebar navigation
