# Implementation Plan: CRM_05 Auswertungen (CRM Reports)

**Date:** 2026-03-17
**Ticket:** TICKET_CRM_05_AUSWERTUNGEN.md
**Research:** thoughts/shared/research/2026-03-17-CRM_05-auswertungen.md

---

## Overview

CRM_05 adds a read-only reporting/analytics dashboard to the CRM module. No new database models are needed -- all reports are aggregations over existing CRM models (CrmAddress, CrmCorrespondence, CrmInquiry, CrmTask). The feature comprises 8 tRPC query procedures, a service layer with Prisma aggregation queries, React hooks, 5 UI components using recharts, translation keys, sidebar navigation, and handbook documentation.

---

## Phase 0: Dependencies

### 0.1 Install recharts

recharts is NOT currently in package.json despite the ticket stating otherwise.

```bash
pnpm add recharts
```

**Verification:** `grep recharts package.json` shows the dependency.

---

## Phase 1: Backend (tRPC Router + Service)

### 1.1 Create Service: `src/lib/services/crm-report-service.ts`

**Pattern to follow:** `src/lib/services/crm-task-service.ts` (but simpler -- read-only, no error classes, no repository needed)

**File signature:**

```ts
import type { PrismaClient } from "@/generated/prisma/client"
```

No repository file is needed since this is read-only with no shared query patterns. All Prisma queries live directly in the service.

**Functions to implement (8 total):**

#### 1.1.1 `overview(prisma, tenantId)`

Returns dashboard summary KPIs. Uses `Promise.all` for parallel queries:

```ts
export async function overview(prisma: PrismaClient, tenantId: string) {
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const startOfWeek = getStartOfWeek(now) // helper: Monday of current week

  const [totalAddresses, newAddressesThisMonth, openInquiries, pendingTasks, overdueTaskCount, correspondenceThisWeek] = await Promise.all([
    prisma.crmAddress.count({ where: { tenantId } }),
    prisma.crmAddress.count({ where: { tenantId, createdAt: { gte: startOfMonth } } }),
    prisma.crmInquiry.count({ where: { tenantId, status: { in: ["OPEN", "IN_PROGRESS"] } } }),
    prisma.crmTask.count({ where: { tenantId, type: "TASK", status: { in: ["OPEN", "IN_PROGRESS"] } } }),
    prisma.crmTask.count({ where: { tenantId, type: "TASK", status: { in: ["OPEN", "IN_PROGRESS"] }, dueAt: { lt: now } } }),
    prisma.crmCorrespondence.count({ where: { tenantId, date: { gte: startOfWeek } } }),
  ])

  return { totalAddresses, newAddressesThisMonth, openInquiries, pendingTasks, overdueTaskCount, correspondenceThisWeek }
}
```

#### 1.1.2 `addressStats(prisma, tenantId, params?: { type? })`

Address distribution by type and active/inactive status:

```ts
export async function addressStats(prisma: PrismaClient, tenantId: string, params: { type?: string } = {}) {
  const where: Record<string, unknown> = { tenantId }
  if (params.type) where.type = params.type

  const [byType, active, inactive, total] = await Promise.all([
    prisma.crmAddress.groupBy({ by: ["type"], where, _count: true }),
    prisma.crmAddress.count({ where: { ...where, isActive: true } }),
    prisma.crmAddress.count({ where: { ...where, isActive: false } }),
    prisma.crmAddress.count({ where }),
  ])

  return {
    total,
    byType: byType.map(g => ({ type: g.type, count: g._count })),
    active,
    inactive,
  }
}
```

#### 1.1.3 `correspondenceByPeriod(prisma, tenantId, params)`

Groups correspondence by day/week/month with direction breakdown. Requires `$queryRaw` for `date_trunc`:

```ts
export async function correspondenceByPeriod(
  prisma: PrismaClient,
  tenantId: string,
  params: { dateFrom: string; dateTo: string; groupBy: "day" | "week" | "month" }
) {
  const truncUnit = params.groupBy === "day" ? "day" : params.groupBy === "week" ? "week" : "month"

  const rows = await prisma.$queryRaw<Array<{
    period: Date
    direction: string
    count: bigint
  }>>`
    SELECT
      date_trunc(${truncUnit}, date) AS period,
      direction,
      COUNT(*)::int AS count
    FROM crm_correspondences
    WHERE tenant_id = ${params.tenantId}::uuid
      AND date >= ${new Date(params.dateFrom)}
      AND date <= ${new Date(params.dateTo)}
    GROUP BY period, direction
    ORDER BY period
  `
  // Post-process: pivot rows by period, summing INCOMING/OUTGOING/INTERNAL
  // Return: { periods: Array<{ period: string, incoming: number, outgoing: number, internal: number, total: number }> }
}
```

**Important:** Use `Prisma.sql` for parameterized raw queries. The tenantId must be passed as the function parameter, not `params.tenantId`. Format period dates as ISO strings (YYYY-MM-DD or YYYY-MM).

#### 1.1.4 `correspondenceByType(prisma, tenantId, params)`

Groups correspondence by `type` field (phone/email/letter/fax/visit):

```ts
export async function correspondenceByType(
  prisma: PrismaClient,
  tenantId: string,
  params: { dateFrom: string; dateTo: string }
) {
  const where = {
    tenantId,
    date: { gte: new Date(params.dateFrom), lte: new Date(params.dateTo) },
  }

  const groups = await prisma.crmCorrespondence.groupBy({
    by: ["type"],
    where,
    _count: true,
  })

  return {
    byType: groups.map(g => ({ type: g.type, count: g._count })),
  }
}
```

#### 1.1.5 `inquiryPipeline(prisma, tenantId, params?)`

Inquiry counts by status, avg days to close, top addresses by inquiry count:

```ts
export async function inquiryPipeline(
  prisma: PrismaClient,
  tenantId: string,
  params: { dateFrom?: string; dateTo?: string } = {}
) {
  const where: Record<string, unknown> = { tenantId }
  if (params.dateFrom || params.dateTo) {
    where.createdAt = {}
    if (params.dateFrom) (where.createdAt as Record<string, unknown>).gte = new Date(params.dateFrom)
    if (params.dateTo) (where.createdAt as Record<string, unknown>).lte = new Date(params.dateTo)
  }

  const [byStatus, closedInquiries, topAddressRows] = await Promise.all([
    prisma.crmInquiry.groupBy({ by: ["status"], where, _count: true }),
    // For avg days to close: fetch closed inquiries with both dates
    prisma.crmInquiry.findMany({
      where: { ...where, status: "CLOSED", closedAt: { not: null } },
      select: { createdAt: true, closedAt: true },
    }),
    // Top addresses by inquiry count (top 10)
    prisma.crmInquiry.groupBy({
      by: ["addressId"],
      where,
      _count: true,
      orderBy: { _count: { addressId: "desc" } },
      take: 10,
    }),
  ])

  // Calculate avgDaysToClose
  let avgDaysToClose: number | null = null
  if (closedInquiries.length > 0) {
    const totalDays = closedInquiries.reduce((sum, inq) => {
      const diffMs = inq.closedAt!.getTime() - inq.createdAt.getTime()
      return sum + diffMs / (1000 * 60 * 60 * 24)
    }, 0)
    avgDaysToClose = Math.round((totalDays / closedInquiries.length) * 10) / 10
  }

  // Fetch address names for top addresses
  const addressIds = topAddressRows.map(r => r.addressId)
  const addresses = addressIds.length > 0
    ? await prisma.crmAddress.findMany({
        where: { id: { in: addressIds } },
        select: { id: true, company: true },
      })
    : []
  const addressMap = Object.fromEntries(addresses.map(a => [a.id, a.company]))

  return {
    byStatus: byStatus.map(g => ({ status: g.status, count: g._count })),
    avgDaysToClose,
    topAddresses: topAddressRows.map(r => ({
      addressId: r.addressId,
      company: addressMap[r.addressId] ?? "Unknown",
      count: r._count,
    })),
  }
}
```

#### 1.1.6 `inquiryByEffort(prisma, tenantId, params?)`

Inquiry count grouped by effort level:

```ts
export async function inquiryByEffort(
  prisma: PrismaClient,
  tenantId: string,
  params: { dateFrom?: string; dateTo?: string } = {}
) {
  // Build where clause with optional date range...
  const groups = await prisma.crmInquiry.groupBy({
    by: ["effort"],
    where,
    _count: true,
  })

  return {
    byEffort: groups.map(g => ({ effort: g.effort ?? "Unbekannt", count: g._count })),
  }
}
```

#### 1.1.7 `taskCompletion(prisma, tenantId, params?)`

Task completion rate, avg completion time, overdue count:

```ts
export async function taskCompletion(
  prisma: PrismaClient,
  tenantId: string,
  params: { dateFrom?: string; dateTo?: string } = {}
) {
  const where: Record<string, unknown> = { tenantId, type: "TASK" as const }
  // Add date filter on createdAt if provided...

  const now = new Date()

  const [total, completed, cancelled, overdue, completedTasks] = await Promise.all([
    prisma.crmTask.count({ where }),
    prisma.crmTask.count({ where: { ...where, status: "COMPLETED" } }),
    prisma.crmTask.count({ where: { ...where, status: "CANCELLED" } }),
    prisma.crmTask.count({ where: { ...where, status: { in: ["OPEN", "IN_PROGRESS"] }, dueAt: { lt: now } } }),
    prisma.crmTask.findMany({
      where: { ...where, status: "COMPLETED", completedAt: { not: null } },
      select: { createdAt: true, completedAt: true },
    }),
  ])

  // Calculate avg completion days
  let avgCompletionDays: number | null = null
  if (completedTasks.length > 0) {
    const totalDays = completedTasks.reduce((sum, t) => {
      const diffMs = t.completedAt!.getTime() - t.createdAt.getTime()
      return sum + diffMs / (1000 * 60 * 60 * 24)
    }, 0)
    avgCompletionDays = Math.round((totalDays / completedTasks.length) * 10) / 10
  }

  const completionRate = total > 0 ? Math.round((completed / total) * 1000) / 10 : 0

  return { total, completed, cancelled, overdue, completionRate, avgCompletionDays }
}
```

#### 1.1.8 `tasksByAssignee(prisma, tenantId, params?)`

Task count per employee with completion status:

```ts
export async function tasksByAssignee(
  prisma: PrismaClient,
  tenantId: string,
  params: { dateFrom?: string; dateTo?: string } = {}
) {
  // Use raw query or two-step: get assignees grouped, then enrich with employee names
  // Approach: groupBy on CrmTaskAssignee joined with CrmTask
  const rows = await prisma.$queryRaw<Array<{
    employee_id: string
    first_name: string
    last_name: string
    total: number
    completed: number
    open: number
  }>>`
    SELECT
      a.employee_id,
      e.first_name,
      e.last_name,
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE t.status = 'COMPLETED')::int AS completed,
      COUNT(*) FILTER (WHERE t.status IN ('OPEN', 'IN_PROGRESS'))::int AS open
    FROM crm_task_assignees a
    JOIN crm_tasks t ON t.id = a.task_id
    JOIN employees e ON e.id = a.employee_id
    WHERE t.tenant_id = ${tenantId}::uuid
      AND t.type = 'TASK'
      AND a.employee_id IS NOT NULL
    GROUP BY a.employee_id, e.first_name, e.last_name
    ORDER BY total DESC
  `
  // Add date filter if params provided

  return {
    assignees: rows.map(r => ({
      employeeId: r.employee_id,
      name: `${r.first_name} ${r.last_name}`,
      total: r.total,
      completed: r.completed,
      open: r.open,
    })),
  }
}
```

**Helper function at top of file:**

```ts
function getStartOfWeek(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1) // Monday
  d.setDate(diff)
  d.setHours(0, 0, 0, 0)
  return d
}
```

### 1.2 Create Router: `src/trpc/routers/crm/reports.ts`

**Pattern to follow:** `src/trpc/routers/crm/tasks.ts` (lines 1-17 for imports/setup, simplified -- queries only)

```ts
import { z } from "zod"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { handleServiceError } from "@/trpc/errors"
import { requirePermission } from "@/lib/auth/middleware"
import { requireModule } from "@/lib/modules"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import * as crmReportService from "@/lib/services/crm-report-service"
import type { PrismaClient } from "@/generated/prisma/client"

const ADDR_VIEW = permissionIdByKey("crm_addresses.view")!
const CORR_VIEW = permissionIdByKey("crm_correspondence.view")!
const INQ_VIEW = permissionIdByKey("crm_inquiries.view")!
const TASK_VIEW = permissionIdByKey("crm_tasks.view")!

const crmProcedure = tenantProcedure.use(requireModule("crm"))
```

**8 procedures (all queries):**

| Procedure | Permission | Input schema |
|-----------|-----------|-------------|
| `overview` | ADDR_VIEW | none (empty object or void) |
| `addressStats` | ADDR_VIEW | `{ type?: z.enum(["CUSTOMER", "SUPPLIER", "BOTH"]) }` |
| `correspondenceByPeriod` | CORR_VIEW | `{ dateFrom: z.string().datetime(), dateTo: z.string().datetime(), groupBy: z.enum(["day", "week", "month"]) }` |
| `correspondenceByType` | CORR_VIEW | `{ dateFrom: z.string().datetime(), dateTo: z.string().datetime() }` |
| `inquiryPipeline` | INQ_VIEW | `{ dateFrom?: z.string().datetime(), dateTo?: z.string().datetime() }` |
| `inquiryByEffort` | INQ_VIEW | `{ dateFrom?: z.string().datetime(), dateTo?: z.string().datetime() }` |
| `taskCompletion` | TASK_VIEW | `{ dateFrom?: z.string().datetime(), dateTo?: z.string().datetime() }` |
| `tasksByAssignee` | TASK_VIEW | `{ dateFrom?: z.string().datetime(), dateTo?: z.string().datetime() }` |

Each procedure follows this pattern:

```ts
overview: crmProcedure
  .use(requirePermission(ADDR_VIEW))
  .query(async ({ ctx }) => {
    try {
      return await crmReportService.overview(
        ctx.prisma as unknown as PrismaClient,
        ctx.tenantId!
      )
    } catch (err) {
      handleServiceError(err)
    }
  }),
```

### 1.3 Register Router: `src/trpc/routers/crm/index.ts`

**Modify** `src/trpc/routers/crm/index.ts`:

Add import:
```ts
import { crmReportsRouter } from "./reports"
```

Add to router object:
```ts
reports: crmReportsRouter,
```

No changes needed to `src/trpc/routers/_app.ts` since `crmRouter` is already registered there.

### 1.4 Verification

```bash
pnpm typecheck   # Should pass (or same baseline errors as before)
```

---

## Phase 2: Frontend (Hooks + UI Components)

### 2.1 Create Hooks: `src/hooks/use-crm-reports.ts`

**Pattern to follow:** `src/hooks/use-crm-tasks.ts` (query-only hooks, no mutations)

```ts
import { useTRPC } from "@/trpc"
import { useQuery } from "@tanstack/react-query"

export function useCrmOverview(enabled = true) {
  const trpc = useTRPC()
  return useQuery(trpc.crm.reports.overview.queryOptions({}, { enabled }))
}

export function useCrmAddressStats(params: { type?: "CUSTOMER" | "SUPPLIER" | "BOTH" } = {}, enabled = true) {
  const trpc = useTRPC()
  return useQuery(trpc.crm.reports.addressStats.queryOptions(params, { enabled }))
}

export function useCrmCorrespondenceByPeriod(
  params: { dateFrom: string; dateTo: string; groupBy: "day" | "week" | "month" },
  enabled = true
) {
  const trpc = useTRPC()
  return useQuery(trpc.crm.reports.correspondenceByPeriod.queryOptions(params, { enabled }))
}

export function useCrmCorrespondenceByType(
  params: { dateFrom: string; dateTo: string },
  enabled = true
) {
  const trpc = useTRPC()
  return useQuery(trpc.crm.reports.correspondenceByType.queryOptions(params, { enabled }))
}

export function useCrmInquiryPipeline(
  params: { dateFrom?: string; dateTo?: string } = {},
  enabled = true
) {
  const trpc = useTRPC()
  return useQuery(trpc.crm.reports.inquiryPipeline.queryOptions(params, { enabled }))
}

export function useCrmInquiryByEffort(
  params: { dateFrom?: string; dateTo?: string } = {},
  enabled = true
) {
  const trpc = useTRPC()
  return useQuery(trpc.crm.reports.inquiryByEffort.queryOptions(params, { enabled }))
}

export function useCrmTaskCompletion(
  params: { dateFrom?: string; dateTo?: string } = {},
  enabled = true
) {
  const trpc = useTRPC()
  return useQuery(trpc.crm.reports.taskCompletion.queryOptions(params, { enabled }))
}

export function useCrmTasksByAssignee(
  params: { dateFrom?: string; dateTo?: string } = {},
  enabled = true
) {
  const trpc = useTRPC()
  return useQuery(trpc.crm.reports.tasksByAssignee.queryOptions(params, { enabled }))
}
```

### 2.2 Create Page Route: `src/app/[locale]/(dashboard)/crm/reports/page.tsx`

**Pattern to follow:** `src/app/[locale]/(dashboard)/crm/tasks/page.tsx`

```tsx
'use client'
import { CrmReportsOverview } from "@/components/crm/reports-overview"

export default function CrmReportsPage() {
  return (
    <div className="container mx-auto py-6">
      <CrmReportsOverview />
    </div>
  )
}
```

### 2.3 Create Component: `src/components/crm/reports-overview.tsx`

Top-level dashboard component. Uses `useTranslations('crmReports')`.

**Layout structure:**
1. Page title + subtitle
2. KPI cards row (4 cards using `useCrmOverview`) -- totalAddresses, openInquiries, pendingTasks (with overdue sub-count), correspondenceThisWeek
3. Tabs or stacked sections for detailed reports:
   - Address Stats (report-address-stats.tsx)
   - Correspondence Report (report-correspondence-chart.tsx)
   - Inquiry Pipeline (report-inquiry-pipeline.tsx)
   - Task Completion (report-task-completion.tsx)

**UI components to use:** Card, CardContent, CardHeader, CardTitle from `@/components/ui/card`; Skeleton for loading states; Tabs/TabsContent from `@/components/ui/tabs`.

**KPI cards pattern:**
```tsx
<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
  <Card>
    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
      <CardTitle className="text-sm font-medium">{t('totalAddresses')}</CardTitle>
      <Users className="h-4 w-4 text-muted-foreground" />
    </CardHeader>
    <CardContent>
      <div className="text-2xl font-bold">{data?.totalAddresses ?? 0}</div>
      <p className="text-xs text-muted-foreground">
        {data?.newAddressesThisMonth ?? 0} {t('newThisMonth')}
      </p>
    </CardContent>
  </Card>
  {/* ... more cards */}
</div>
```

### 2.4 Create Component: `src/components/crm/report-address-stats.tsx`

Uses `useCrmAddressStats()` hook.

**Charts:**
- **Pie chart** (recharts `PieChart`, `Pie`, `Cell`, `Tooltip`, `Legend`): Address distribution by type (CUSTOMER / SUPPLIER / BOTH)
- **Bar chart** (recharts `BarChart`, `Bar`, `XAxis`, `YAxis`, `Tooltip`): Active vs Inactive counts

```tsx
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from "recharts"
```

Color palette: Use consistent colors (e.g., `#0088FE` for CUSTOMER, `#00C49F` for SUPPLIER, `#FFBB28` for BOTH).

### 2.5 Create Component: `src/components/crm/report-correspondence-chart.tsx`

Uses `useCrmCorrespondenceByPeriod()` and `useCrmCorrespondenceByType()` hooks.

**Features:**
- Date range picker (two date inputs for dateFrom/dateTo, defaulting to last 90 days)
- GroupBy selector (day/week/month, defaulting to month)
- **Stacked bar chart**: Correspondence volume over time with INCOMING/OUTGOING/INTERNAL bars
- **Pie chart**: Distribution by type (phone/email/letter/fax/visit)

State management:
```tsx
const [dateFrom, setDateFrom] = useState(() => {
  const d = new Date(); d.setMonth(d.getMonth() - 3); return d.toISOString()
})
const [dateTo, setDateTo] = useState(() => new Date().toISOString())
const [groupBy, setGroupBy] = useState<"day" | "week" | "month">("month")
```

### 2.6 Create Component: `src/components/crm/report-inquiry-pipeline.tsx`

Uses `useCrmInquiryPipeline()` and `useCrmInquiryByEffort()` hooks.

**Layout:**
- **Bar chart**: Inquiry counts by status (OPEN/IN_PROGRESS/CLOSED/CANCELLED) with status-specific colors
- **Stat card**: Avg days to close
- **Table**: Top 10 addresses by inquiry count (columns: Company, Count)
- **Pie chart**: Distribution by effort level (Gering/Mittel/Hoch)

Optional date range filter.

### 2.7 Create Component: `src/components/crm/report-task-completion.tsx`

Uses `useCrmTaskCompletion()` and `useCrmTasksByAssignee()` hooks.

**Layout:**
- **KPI cards**: Completion rate (%), avg completion days, overdue count
- **Progress bar or ring**: Visual completion rate indicator (can use a simple styled div or recharts RadialBarChart)
- **Table**: Tasks by assignee (columns: Name, Total, Completed, Open)

Optional date range filter.

### 2.8 Add Sidebar Navigation: `src/components/layout/sidebar/sidebar-nav-config.ts`

**Modify** line ~299 (after the crmTasks entry, before the closing `],`):

```ts
{
  titleKey: 'crmReports',
  href: '/crm/reports',
  icon: BarChart3,
  module: 'crm',
  permissions: ['crm_addresses.view'],
},
```

Note: `BarChart3` is already imported from lucide-react in this file.

### 2.9 Add Translation Keys

**Modify** `messages/de.json` -- add new namespace `crmReports` after `crmTasks`:

```json
"crmReports": {
  "title": "CRM Auswertungen",
  "subtitle": "Berichte und Analysen",
  "overview": "Ubersicht",
  "totalAddresses": "Adressen gesamt",
  "newThisMonth": "Neu diesen Monat",
  "openInquiries": "Offene Anfragen",
  "pendingTasks": "Offene Aufgaben",
  "overdueTasks": "Uberfällige Aufgaben",
  "correspondenceThisWeek": "Korrespondenz diese Woche",
  "addressStats": "Adress-Statistik",
  "addressByType": "Adressen nach Typ",
  "activeInactive": "Aktiv / Inaktiv",
  "correspondenceReport": "Korrespondenz-Bericht",
  "correspondenceOverTime": "Korrespondenz im Zeitverlauf",
  "correspondenceByType": "Korrespondenz nach Typ",
  "incoming": "Eingehend",
  "outgoing": "Ausgehend",
  "internal": "Intern",
  "inquiryPipeline": "Anfragen-Pipeline",
  "inquiriesByStatus": "Anfragen nach Status",
  "avgDaysToClose": "Durchschn. Tage bis Abschluss",
  "topAddresses": "Top-Adressen nach Anfragen",
  "inquiriesByEffort": "Anfragen nach Aufwand",
  "taskCompletion": "Aufgaben-Auswertung",
  "completionRate": "Erledigungsquote",
  "avgCompletionDays": "Durchschn. Erledigungsdauer (Tage)",
  "overdueCount": "Uberfällig",
  "tasksByAssignee": "Aufgaben pro Mitarbeiter",
  "dateFrom": "Von",
  "dateTo": "Bis",
  "groupBy": "Gruppierung",
  "day": "Tag",
  "week": "Woche",
  "month": "Monat",
  "company": "Firma",
  "count": "Anzahl",
  "name": "Name",
  "total": "Gesamt",
  "completed": "Erledigt",
  "open": "Offen",
  "customer": "Kunde",
  "supplier": "Lieferant",
  "both": "Beides",
  "active": "Aktiv",
  "inactive": "Inaktiv",
  "noData": "Keine Daten verfügbar"
}
```

Also add to the `nav` namespace:
```json
"crmReports": "Auswertungen"
```

**Modify** `messages/en.json` -- same structure with English translations.

### 2.10 Verification

```bash
pnpm typecheck
pnpm lint
pnpm dev        # Manually verify /crm/reports loads, charts render
```

---

## Phase 3: Tests

### 3.1 Service Tests: `src/lib/services/__tests__/crm-report-service.test.ts`

**Pattern to follow:** `src/lib/services/__tests__/crm-task-service.test.ts`

```ts
import { describe, it, expect, vi } from "vitest"
import * as service from "../crm-report-service"
import type { PrismaClient } from "@/generated/prisma/client"

const TENANT_ID = "a0000000-0000-4000-a000-000000000100"

function createMockPrisma(overrides = {}) {
  return {
    crmAddress: {
      count: vi.fn(),
      groupBy: vi.fn(),
      findMany: vi.fn(),
    },
    crmCorrespondence: {
      count: vi.fn(),
      groupBy: vi.fn(),
    },
    crmInquiry: {
      count: vi.fn(),
      groupBy: vi.fn(),
      findMany: vi.fn(),
    },
    crmTask: {
      count: vi.fn(),
      groupBy: vi.fn(),
      findMany: vi.fn(),
    },
    $queryRaw: vi.fn(),
    ...overrides,
  } as unknown as PrismaClient
}
```

**Test cases (minimum 15 tests):**

```
describe("crm-report-service")
  describe("overview")
    it("returns all summary metrics")
    it("counts only TASK type for pending tasks (not MESSAGE)")
    it("scopes all queries to tenant")

  describe("addressStats")
    it("returns counts by type")
    it("returns active/inactive counts")
    it("filters by type parameter when provided")

  describe("correspondenceByPeriod")
    it("groups by month correctly")
    it("groups by day correctly")
    it("respects dateFrom and dateTo filter")
    it("returns zero counts for periods with no data")

  describe("correspondenceByType")
    it("groups correspondence by type")

  describe("inquiryPipeline")
    it("counts inquiries by status")
    it("calculates average days to close for closed inquiries")
    it("returns null avgDaysToClose when no closed inquiries exist")
    it("returns top 10 addresses by inquiry count")

  describe("inquiryByEffort")
    it("groups inquiries by effort level")
    it("handles null effort as 'Unbekannt'")

  describe("taskCompletion")
    it("calculates completion rate correctly")
    it("counts overdue tasks (open with past dueAt)")
    it("calculates avg completion days")
    it("returns 0 completionRate when no tasks exist")

  describe("tasksByAssignee")
    it("returns tasks grouped by employee")
    it("includes completed and open counts per employee")
```

### 3.2 Router Tests: `src/trpc/routers/__tests__/crmReports-router.test.ts`

**Pattern to follow:** `src/trpc/routers/__tests__/crmTasks-router.test.ts`

```ts
import { describe, it, expect, vi } from "vitest"
import { createCallerFactory } from "@/trpc/init"
import { crmReportsRouter } from "../crm/reports"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import {
  createMockContext,
  createMockSession,
  createUserWithPermissions,
  createMockUserTenant,
} from "./helpers"

vi.mock("@/lib/db", () => ({
  prisma: {
    tenantModule: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue({ id: "mock", module: "crm" }),
    },
  },
}))

const ADDR_VIEW = permissionIdByKey("crm_addresses.view")!
const CORR_VIEW = permissionIdByKey("crm_correspondence.view")!
const INQ_VIEW = permissionIdByKey("crm_inquiries.view")!
const TASK_VIEW = permissionIdByKey("crm_tasks.view")!

const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const USER_ID = "a0000000-0000-4000-a000-000000000001"

const createCaller = createCallerFactory(crmReportsRouter)

const MODULE_MOCK = {
  tenantModule: {
    findMany: vi.fn().mockResolvedValue([]),
    findUnique: vi.fn().mockResolvedValue({ id: "mock", module: "crm" }),
  },
}

function withModuleMock(prisma: Record<string, unknown>) {
  return { ...MODULE_MOCK, ...prisma }
}

function createTestContext(
  prisma: Record<string, unknown>,
  permissions: string[] = [ADDR_VIEW, CORR_VIEW, INQ_VIEW, TASK_VIEW]
) {
  return createMockContext({
    prisma: withModuleMock(prisma) as unknown as ReturnType<typeof createMockContext>["prisma"],
    authToken: "test-token",
    user: createUserWithPermissions(permissions, {
      id: USER_ID,
      userTenants: [createMockUserTenant(USER_ID, TENANT_ID)],
    }),
    session: createMockSession(),
    tenantId: TENANT_ID,
  })
}
```

**Test cases (minimum 12 tests):**

```
describe("crm.reports.overview")
  it("returns summary metrics")
  it("requires crm_addresses.view permission")
  it("requires CRM module enabled")

describe("crm.reports.addressStats")
  it("returns address distribution data")
  it("requires crm_addresses.view permission")

describe("crm.reports.correspondenceByPeriod")
  it("returns grouped correspondence data")
  it("requires crm_correspondence.view permission")

describe("crm.reports.correspondenceByType")
  it("returns type distribution data")

describe("crm.reports.inquiryPipeline")
  it("returns pipeline data with avg close time")
  it("requires crm_inquiries.view permission")

describe("crm.reports.taskCompletion")
  it("returns completion metrics")
  it("requires crm_tasks.view permission")

describe("crm.reports.tasksByAssignee")
  it("returns per-assignee breakdown")
```

For each permission test, create caller with empty permissions `[]` and expect `"Insufficient permissions"` error.

For the "requires CRM module enabled" test, mock `tenantModule.findUnique` to return `null` and expect `"Module \"crm\" is not enabled"` error.

### 3.3 E2E Browser Tests: `src/e2e-browser/24-crm-reports.spec.ts`

**Pattern to follow:** `src/e2e-browser/23-crm-tasks.spec.ts`

```ts
import { test, expect } from "@playwright/test";
import { navigateTo } from "./helpers/nav";

test.describe.serial("UC-CRM-05: CRM Reports", () => {
  test("navigate to CRM reports page", async ({ page }) => {
    await navigateTo(page, "/crm/reports");
    await page.locator("main#main-content").waitFor({ state: "visible" });

    // Verify page title is visible
    await expect(page.getByText("CRM Auswertungen").first()).toBeVisible({ timeout: 10_000 });
  });

  test("view overview KPI cards", async ({ page }) => {
    await navigateTo(page, "/crm/reports");
    await page.locator("main#main-content").waitFor({ state: "visible" });

    // Verify KPI cards are visible (by their label text)
    await expect(page.getByText("Adressen gesamt").first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Offene Anfragen").first()).toBeVisible();
    await expect(page.getByText("Offene Aufgaben").first()).toBeVisible();
    await expect(page.getByText("Korrespondenz diese Woche").first()).toBeVisible();
  });

  test("view address statistics tab", async ({ page }) => {
    await navigateTo(page, "/crm/reports");
    await page.locator("main#main-content").waitFor({ state: "visible" });

    // Click on address stats tab/section
    await page.getByText("Adress-Statistik").first().click();
    await page.waitForTimeout(500);

    // Verify chart containers are visible (recharts renders SVG elements)
    await expect(page.locator(".recharts-wrapper").first()).toBeVisible({ timeout: 10_000 });
  });

  test("view correspondence chart with date filter", async ({ page }) => {
    await navigateTo(page, "/crm/reports");
    await page.locator("main#main-content").waitFor({ state: "visible" });

    // Click on correspondence report tab
    await page.getByText("Korrespondenz-Bericht").first().click();
    await page.waitForTimeout(500);

    // Verify chart is visible
    await expect(page.locator(".recharts-wrapper").first()).toBeVisible({ timeout: 10_000 });
  });

  test("view inquiry pipeline", async ({ page }) => {
    await navigateTo(page, "/crm/reports");
    await page.locator("main#main-content").waitFor({ state: "visible" });

    // Click on inquiry pipeline tab
    await page.getByText("Anfragen-Pipeline").first().click();
    await page.waitForTimeout(500);

    // Verify pipeline content is visible
    await expect(page.getByText("Anfragen nach Status").first()).toBeVisible({ timeout: 10_000 });
  });

  test("view task completion report", async ({ page }) => {
    await navigateTo(page, "/crm/reports");
    await page.locator("main#main-content").waitFor({ state: "visible" });

    // Click on task completion tab
    await page.getByText("Aufgaben-Auswertung").first().click();
    await page.waitForTimeout(500);

    // Verify completion metrics are visible
    await expect(page.getByText("Erledigungsquote").first()).toBeVisible({ timeout: 10_000 });
  });

  test("reports page accessible from sidebar", async ({ page }) => {
    await navigateTo(page, "/crm/addresses");
    await page.locator("main#main-content").waitFor({ state: "visible" });

    // Click reports link in sidebar
    const sidebar = page.locator("nav");
    await sidebar.getByText("Auswertungen").click();

    // Verify navigation to reports page
    await expect(page).toHaveURL(/\/crm\/reports/);
    await expect(page.getByText("CRM Auswertungen").first()).toBeVisible({ timeout: 10_000 });
  });
});
```

### 3.4 Verification

```bash
# Service tests
pnpm vitest run src/lib/services/__tests__/crm-report-service.test.ts

# Router tests
pnpm vitest run src/trpc/routers/__tests__/crmReports-router.test.ts

# All CRM tests
pnpm vitest run --reporter=verbose src/trpc/routers/__tests__/crmReports-router.test.ts src/lib/services/__tests__/crm-report-service.test.ts

# E2E browser tests (requires dev server running)
pnpm exec playwright test src/e2e-browser/24-crm-reports.spec.ts

# Full test suite
pnpm test
```

---

## Phase 4: Handbook Documentation

### 4.1 Read Current Handbook Structure

The handbook is at `docs/TERP_HANDBUCH.md`. The CRM section is section 12, currently ending at 12.10 (Aufgaben & Nachrichten) around line 4907. The next subsection will be 12.11.

### 4.2 Add ToC Entry

**Modify** `docs/TERP_HANDBUCH.md` line 44:

After:
```
    - [12.10 Aufgaben & Nachrichten](#1210-aufgaben--nachrichten)
```

Add:
```
    - [12.11 Auswertungen](#1211-auswertungen)
```

### 4.3 Add Section 12.11

**Insert** after the end of section 12.10 (after line 4907 `---`), before section 13 Glossar:

```markdown
### 12.11 Auswertungen

**Was ist es?** Auswertungen bieten eine zentrale Berichts- und Analysesicht auf alle CRM-Daten. Das Dashboard zeigt Kennzahlen (KPIs) wie Gesamtzahl der Adressen, offene Anfragen, ausstehende Aufgaben und überfällige Termine auf einen Blick. Detaillierte Berichte liefern Statistiken zu Adressen (Verteilung nach Typ, aktiv/inaktiv), Korrespondenz (Verlauf nach Zeitraum und Typ), Anfragen (Pipeline nach Status, durchschnittliche Bearbeitungsdauer, Top-Kunden) und Aufgaben (Erledigungsquote, Bearbeitungsdauer, Verteilung pro Mitarbeiter).

**Wozu dient es?** Auswertungen ermöglichen einen schnellen Überblick über den aktuellen Stand des CRM: Wie viele Kunden sind aktiv? Wie viele Anfragen stehen offen? Werden Aufgaben rechtzeitig erledigt? Die Berichte helfen bei der Planung und Optimierung von Kundenbeziehungen und internen Arbeitsabläufen.

⚠️ Modul: Das CRM-Modul muss für den Mandanten aktiviert sein (📍 Administration → Einstellungen → Module → **CRM**)

⚠️ Berechtigung: „CRM-Adressen anzeigen" (Übersicht und Adress-Statistik), „CRM-Korrespondenz anzeigen" (Korrespondenz-Bericht), „CRM-Anfragen anzeigen" (Anfragen-Pipeline), „CRM-Aufgaben anzeigen" (Aufgaben-Auswertung)

📍 Seitenleiste → **CRM** → **Auswertungen**

✅ Seite mit Titel „CRM Auswertungen", KPI-Karten im oberen Bereich, darunter tabellarische und grafische Berichte in Reitern.

#### Übersicht (KPI-Karten)

Im oberen Bereich der Seite werden vier Kennzahlenkarten angezeigt:

| Karte | Beschreibung |
|-------|-------------|
| **Adressen gesamt** | Gesamtzahl aller CRM-Adressen. Darunter: Anzahl neu angelegter Adressen im aktuellen Monat. |
| **Offene Anfragen** | Anzahl der Anfragen mit Status „Offen" oder „In Bearbeitung". |
| **Offene Aufgaben** | Anzahl der Aufgaben (Typ „Aufgabe") mit Status „Offen" oder „In Bearbeitung". Zusätzlich: Anzahl überfälliger Aufgaben (Fälligkeitsdatum in der Vergangenheit). |
| **Korrespondenz diese Woche** | Anzahl der Korrespondenzeinträge seit Montag der aktuellen Woche. |

#### Adress-Statistik

📍 Reiter **„Adress-Statistik"**

✅ Zwei Diagramme:

1. **Kreisdiagramm — Adressen nach Typ:** Verteilung der Adressen nach Typ (Kunde, Lieferant, Beides).
2. **Balkendiagramm — Aktiv / Inaktiv:** Anzahl aktiver und inaktiver Adressen.

#### Korrespondenz-Bericht

📍 Reiter **„Korrespondenz-Bericht"**

✅ Zwei Diagramme mit Datumsfilter:

**Filter:**
- **Von / Bis:** Datumsbereich (Standard: letzte 3 Monate)
- **Gruppierung:** Tag / Woche / Monat (Standard: Monat)

1. **Balkendiagramm — Korrespondenz im Zeitverlauf:** Gestapeltes Balkendiagramm mit den Richtungen „Eingehend", „Ausgehend" und „Intern" pro Zeitraum.
2. **Kreisdiagramm — Korrespondenz nach Typ:** Verteilung nach Kommunikationstyp (Telefon, E-Mail, Brief, Fax, Besuch).

#### Anfragen-Pipeline

📍 Reiter **„Anfragen-Pipeline"**

✅ Folgende Auswertungen:

1. **Balkendiagramm — Anfragen nach Status:** Anzahl der Anfragen pro Status (Offen, In Bearbeitung, Geschlossen, Storniert) mit farbigen Balken.
2. **Kennzahl — Durchschnittliche Bearbeitungsdauer:** Durchschnittliche Anzahl Tage zwischen Anlage und Abschluss geschlossener Anfragen.
3. **Tabelle — Top-Adressen nach Anfragen:** Die 10 Adressen mit den meisten Anfragen (Spalten: Firma, Anzahl).
4. **Kreisdiagramm — Anfragen nach Aufwand:** Verteilung nach Aufwandsstufe (Gering, Mittel, Hoch).

Optionaler Datumsfilter (Von / Bis) schränkt den Auswertungszeitraum ein.

#### Aufgaben-Auswertung

📍 Reiter **„Aufgaben-Auswertung"**

✅ Folgende Auswertungen:

1. **Kennzahlen-Karten:**
   - **Erledigungsquote:** Prozentualer Anteil erledigter Aufgaben an der Gesamtzahl.
   - **Durchschn. Erledigungsdauer:** Durchschnittliche Anzahl Tage zwischen Anlage und Erledigung.
   - **Überfällig:** Anzahl offener Aufgaben mit überschrittenem Fälligkeitsdatum.
2. **Tabelle — Aufgaben pro Mitarbeiter:** Aufschlüsselung nach Mitarbeiter (Spalten: Name, Gesamt, Erledigt, Offen).

Optionaler Datumsfilter (Von / Bis) schränkt den Auswertungszeitraum ein.
```

### 4.4 Add Glossary Entry

**Modify** the Glossar table (section 13, around line 4918). Insert alphabetically after "Aufgabe (CRM)":

```
| **Auswertung (CRM)** | Berichts- und Analysedashboard mit Kennzahlen zu Adressen, Korrespondenz, Anfragen und Aufgaben | 📍 CRM → Auswertungen |
```

### 4.5 Add Page Table Entries

**Modify** the Anhang page table (around line 5035-5036). After the `/crm/inquiries/[id]` entry, add:

```
| `/crm/tasks` | CRM → Aufgaben | crm_tasks.view |
| `/crm/reports` | CRM → Auswertungen | crm_addresses.view |
```

Note: The tasks page entry is also missing from the current table -- add both.

### 4.6 Verification

Review the handbook manually:
- ToC entry links correctly to the new section
- Section 12.11 follows the exact formatting pattern of 12.10
- Glossary entry is alphabetically placed
- Page table entry is present

---

## Summary: All Files

### New Files (12)

| # | File | Purpose |
|---|------|---------|
| 1 | `src/lib/services/crm-report-service.ts` | Service with 8 aggregation functions |
| 2 | `src/trpc/routers/crm/reports.ts` | tRPC router with 8 query procedures |
| 3 | `src/hooks/use-crm-reports.ts` | 8 React query hooks |
| 4 | `src/app/[locale]/(dashboard)/crm/reports/page.tsx` | Page route |
| 5 | `src/components/crm/reports-overview.tsx` | Dashboard with KPI cards + tab container |
| 6 | `src/components/crm/report-address-stats.tsx` | Address pie/bar charts |
| 7 | `src/components/crm/report-correspondence-chart.tsx` | Correspondence time series + type charts |
| 8 | `src/components/crm/report-inquiry-pipeline.tsx` | Inquiry pipeline charts + table |
| 9 | `src/components/crm/report-task-completion.tsx` | Task completion metrics + assignee table |
| 10 | `src/lib/services/__tests__/crm-report-service.test.ts` | Service unit tests (~20 tests) |
| 11 | `src/trpc/routers/__tests__/crmReports-router.test.ts` | Router integration tests (~12 tests) |
| 12 | `src/e2e-browser/24-crm-reports.spec.ts` | E2E browser tests (~7 tests) |

### Modified Files (4)

| # | File | Change |
|---|------|--------|
| 1 | `src/trpc/routers/crm/index.ts` | Add `reports: crmReportsRouter` |
| 2 | `src/components/layout/sidebar/sidebar-nav-config.ts` | Add crmReports nav item |
| 3 | `messages/de.json` | Add `crmReports` namespace + nav key |
| 4 | `messages/en.json` | Add `crmReports` namespace + nav key |
| 5 | `docs/TERP_HANDBUCH.md` | Add section 12.11 + ToC + glossary + page table |

### Package Changes

```bash
pnpm add recharts
```

---

## Execution Order

1. **Phase 0** -- Install recharts
2. **Phase 1** -- Backend (service, router, registration) -- verify with `pnpm typecheck`
3. **Phase 3.1-3.2** -- Backend tests (service + router tests) -- verify they pass
4. **Phase 2** -- Frontend (hooks, components, page, sidebar, translations) -- verify with `pnpm dev`
5. **Phase 3.3** -- E2E browser tests -- verify with playwright
6. **Phase 4** -- Handbook documentation

This order allows backend tests to be written alongside the backend code before the frontend, ensuring the API contract is solid before building the UI.
