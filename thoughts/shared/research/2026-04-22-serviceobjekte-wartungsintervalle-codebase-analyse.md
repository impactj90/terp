---
date: 2026-04-22T08:26:30+02:00
researcher: impactj90
git_commit: 2ee7548fb3c6fed7b7e4dce09ef10baf4616ebaa
branch: staging
repository: terp
topic: "Serviceobjekte — Wartungsintervalle, Fälligkeiten, Auftragserzeugung (T-3) — Codebase-Analyse (IST-Zustand)"
tags: [research, codebase, service-objects, service-schedule, wartungsintervalle, orders, recurring-invoices, cron, scheduler, permissions, audit, soft-delete, i18n, tests]
status: complete
last_updated: 2026-04-22
last_updated_by: impactj90
---

# Research: Serviceobjekte — Wartungsintervalle, Fälligkeiten, Auftragserzeugung (T-3) — Codebase-Analyse (IST-Zustand)

**Date**: 2026-04-22T08:26:30+02:00
**Researcher**: impactj90
**Git Commit**: 2ee7548fb3c6fed7b7e4dce09ef10baf4616ebaa
**Branch**: staging
**Repository**: terp

## Research Question

Nach T-1 (Serviceobjekte-Stammdaten) und T-2 (Einsatz-Historie) existiert
in Terp die Entität `ServiceObject` mit Hierarchie und die Ansicht ihrer
vergangenen Aufträge und Materialentnahmen. T-3 führt ein
**strukturiertes Wartungsintervall-Konzept** ein: pro Serviceobjekt ein
oder mehrere Wartungspläne, automatische `nextDueAt`-Berechnung,
Überfällig/Bald-fällig-Listen, 1-Klick "Auftrag aus Plan"-Workflow,
neuer Dashboard-Tab, Global-Route `/serviceobjects/schedules`.

Dieses Dokument dokumentiert den **IST-Zustand** der für T-3 relevanten
Codebase-Bereiche in 10 Blöcken — keine Lösungsvorschläge, keine
Empfehlungen, nur konkrete `src/…/file.ts:Z`-Referenzen.

## Summary

**Auftrags-Erzeugung**: Exakt **ein** `prisma.order.create`-Aufruf in
Produktivcode (`src/lib/services/order-repository.ts:109`), konsumiert
von drei Services (`order-service.create`, `billing-service-case-service.createOrder`,
`crm-inquiry-service.createOrder`). Pflichtfelder: `tenantId, code, name`
+ DB-Default `status="active"` und `isActive=true`. `Order.code` wird
**nicht** aus einem Numbering-Service generiert — entweder User-Input
oder abgeleitet vom Parent (CRM-Inquiry-Nummer, Service-Case-Nummer).
Das Numbering-Service (`number-sequence-service.ts`) existiert, wird aber
nur für Inquiry, Service-Case und Rechnung verwendet, nicht für Order.

**Fälligkeiten-Pattern**: `BillingRecurringInvoice.nextDueDate` ist der
kanonische Präzedenzfall (`schema.prisma:1413`) — `DateTime` NOT NULL,
inkl. Index `[tenantId, nextDueDate]`, mit `calculateNextDueDate`
(native JS `setMonth`, `billing-recurring-invoice-service.ts:29-48`),
`findDue`-Query (`nextDueDate: { lte: today }`) und Cron at 04:00 UTC
(`src/app/api/cron/recurring-invoices/route.ts`). Zwei weitere
Fälligkeits-Muster: `InboundInvoiceApproval.dueAt` (escalation cron mit
24h-Cooldown) und `EmployeeProbationReminder` (dedup via
Unique-Constraint).

**Cron-Infrastruktur**: 15+ Cron-Routes unter `src/app/api/cron/*`,
alle mit `Authorization: Bearer ${CRON_SECRET}`-Header. Idempotenz via
`CronCheckpoint`-Upsert (keyed auf `cronName:runKey:tenantId`) für die
meisten Jobs; `probation-reminders` nutzt Unique-Constraint;
`platform-subscription-autofinalize` nutzt all-or-nothing.

**ServiceObject-Detailseite** (post T-2): 4 Tabs (`overview`, `history`,
`tree`, `attachments`), **vollständig controlled** via
`React.useState<TabValue>('overview')` +
`value/onValueChange` — **kein** URL-State. Cross-Tab-Interaktion via
`onViewHistory={() => setActiveTab('history')}`.

**Activity**: `Activity`-Model (`schema.prisma:2437-2456`) ist per Tenant
seedbar, ohne `isDefault`-Konzept. Default über `Employee.defaultActivityId`
(nicht über Tenant/System). Freshly provisioned production tenants haben
**Null Activities** in der Tabelle. Dev-Seed enthält nur IT-Aktivitäten
(ACT-DEV, ACT-TEST, ACT-MEET, ACT-ADMIN) — **keine** Service/Wartung-
Aktivitäten.

**Employee-Zuweisung**: `OrderAssignment` wird **ausschließlich** via
separate Mutation (`orderAssignments.create`) erzeugt, **nicht** in
`orders.create` eingebettet. SetNull-Pattern für Employee-FK existiert
auf `BillingServiceCase.assignedToId`, `Department.managerEmployeeId`,
`Team.leaderEmployeeId`, `User.employeeId`. **Kein** `primaryTechnicianId`
auf ServiceObject oder CrmAddress.

**Permissions**: `service_objects.view/manage/delete` existieren post-T-1
(`permission-catalog.ts:257-260`), sind aber **keinem** Default-System-
Gruppe zugewiesen (weder PERSONAL noch VERTRIEB). Präzedenz für
`.generate`-Permission: `billing_recurring.generate` (`permission-catalog.ts:287`)
— eine von vier distinkten `.generate`/`.execute`/`.run`-Permissions.
`serviceObjectProcedure` ist File-local in `src/trpc/routers/serviceObjects.ts:27`
als `tenantProcedure.use(requireModule("crm"))`.

**Audit**: Alle vier untersuchten Services nutzen bare-verb `action`-
Strings (`"create"`, `"update"`, `"delete"`), `entityType` in snake_case
(`"service_object"`, `"order"`). Dual-Audit (tenant + platform)
**automatisch** in `audit-logs-service.ts:187-205` wenn Impersonation
aktiv.

**Soft-Delete**: `isActive`-Spalte ist der Standard (50+ Modelle).
`deletedAt` nur auf `User` und `Employee`. `ServiceObject.remove` nutzt
conditional hybrid (soft wenn FK-Referenzen, sonst hard) in
`service-object-service.ts:744-766`. Self-Parent-Trees (`ServiceObject`,
`CrmAddress`) nutzen `onDelete: SetNull`; Child-Tabellen `Cascade`.

**UI-Patterns**: "Action-in-Row" konsistent mit
`disabled={mutation.isPending}`, `toast.success(...)`,
`invalidateQueries`. Filter-in-URL-State: Bidirektional via `stateRef`
+ `syncToUrl` (evaluations, audit-logs) vs. Read-only on Mount
(employees). "Create-from-Detail": sowohl Side-Sheet
(`OrderBookingFormSheet`, `ServiceObjectFormSheet`) als auch Modal-
Dialog (`ContactFormDialog`, `OrderAssignmentFormDialog`) im Einsatz.

**i18n**: `serviceObjects`-Namespace (28 Leaf-Keys) ist klein; enthält
`tabs`, `history`, `lastService`. **Kein** nested `schedules`-Object
in irgendeinem Namespace. Enum-Übersetzungen via
`Record<Enum, messageKey>`-Konstanten in Komponenten + next-intl
`t(keyMap[value])` (Pattern A, für Warehouse/Billing/CRM/Orders) oder
`labels.ts`-Helpers mit hardcoded Strings (Pattern B, nur für
ServiceObject).

**Tests**: Datums-Tests ohne Fake-Timers, stattdessen `Date.UTC(...)`
oder ISO-Strings als Parameter + struktureller `parts(d)`-Helper.
Integration-Tests für Order-Create: voll-gemocktes Prisma mit
`createCallerFactory` + `createMockContext`, `.integration.test.ts`
trifft die Dev-DB. E2E-Präzedenz für 1-Klick-Workflow:
`30-billing-documents.spec.ts` (Document-Forward-Chain) und
`34-billing-recurring.spec.ts` (Generate Recurring Invoice).

## Detailed Findings

### Block 1 — Auftrags-Erzeugung: Wo und wie werden Orders heute erzeugt?

#### 1.1 Alle `prisma.order.create`-Aufrufe

Genau **ein** Produktivcode-Call-Site existiert:

- [`src/lib/services/order-repository.ts:109`](src/lib/services/order-repository.ts#L109) — `repo.create(prisma, data)` ist One-Liner-Wrapper um `prisma.order.create({ data })`.

Drei **Service-Konsumenten** dieser Repo-Funktion:

**A. `orderService.create(prisma, tenantId, input, audit?)`**
— [`src/lib/services/order-service.ts:133`](src/lib/services/order-service.ts#L133)
  - Caller: [`src/trpc/routers/orders.ts:211`](src/trpc/routers/orders.ts#L211) (`orders.create` Mutation, `tenantProcedure` + `requirePermission(ORDERS_MANAGE)`)
  - Setzt: `tenantId`, `code` (required, trimmed, unique pro tenant), `name` (required), `description` (optional), `status` (default `"active"` im Service), `customer` (optional), `isActive=true` (hardcoded), `costCenterId`, `billingRatePerHour`, `validFrom`, `validTo`, `serviceObjectId`.

**B. `serviceCaseService.createOrder(prisma, tenantId, id, params, createdById, audit?)`**
— [`src/lib/services/billing-service-case-service.ts:368`](src/lib/services/billing-service-case-service.ts#L368)
  - Caller: [`src/trpc/routers/billing/serviceCases.ts:189`](src/trpc/routers/billing/serviceCases.ts#L189) (`billing.serviceCases.createOrder`)
  - Setzt: `code = existing.number` (Service-Case-Nummer, z. B. `"KD-1"`), `name = params.orderName || existing.title`, `customer = address.company` (aus Service-Case-Address lookup), `status="active"`.

**C. `crmInquiryService.createOrder(prisma, tenantId, id, input?, userId?, audit?)`**
— [`src/lib/services/crm-inquiry-service.ts:367`](src/lib/services/crm-inquiry-service.ts#L367)
  - Caller: [`src/trpc/routers/crm/inquiries.ts:206`](src/trpc/routers/crm/inquiries.ts#L206) (`crm.inquiries.createOrder`)
  - Setzt: `code = "CRM-" + existing.number`, `name = input?.orderName || existing.title`, `customer = existing.address.company`. Keine `status`-, `description`- oder weiteren Felder.

Kein `prisma.order.createMany`-Call in Produktivcode. Der einzige
`createMany`-Treffer ist in `src/lib/services/__tests__/service-object-service-history.test.ts:167`.

#### 1.2 Pflichtfelder für Order-Erstellung

**DB-Level** (`prisma/schema.prisma:2467-2503`):

| Spalte | NOT NULL | DB-Default |
|--------|----------|-----------|
| `id` | ja | `gen_random_uuid()` |
| `tenant_id` | ja | — |
| `code` | ja | — |
| `name` | ja | — |
| `status` | ja | `"active"` |
| `is_active` | ja | `true` |
| `created_at`, `updated_at` | ja | `now()` |
| `description`, `customer`, `cost_center_id`, `billing_rate_per_hour`, `valid_from`, `valid_to`, `service_object_id` | nullable | — |

DB-CHECK-Constraint (in Migration): `status IN ('planned', 'active', 'completed', 'cancelled')`. Unique: `(tenant_id, code)`.

**Zod-Schema** (`src/trpc/routers/orders.ts:61-72`):
- Required: `code` (min 1, max 50), `name` (min 1, max 255)
- Optional: `description`, `status`, `customer`, `costCenterId`, `billingRatePerHour`, `validFrom`, `validTo`, `serviceObjectId`

**Alignment**: Zod omits `isActive`; Service hardcodiert `true` (`order-service.ts:140`). `status` optional in Zod; Service defaulted auf `"active"` (line 138). **Kein** Mismatch zwischen Zod-Required und DB-NOT-NULL.

#### 1.3 Order.code Generation

`Order.code` wird **nicht** automatisch generiert. Drei Quellen:

1. **User-Input** (`orders.create`): Freitext-String; Service validiert nach Trim auf Non-Empty + Uniqueness (`order-service.ts:107-121`)
2. **Abgeleitet von CrmInquiry** (`crm-inquiry-service.ts:365`): `"CRM-" + existing.number`
3. **Abgeleitet von BillingServiceCase** (`billing-service-case-service.ts:369`): `existing.number` direkt (z. B. `"KD-1"`)

`existing.number` selbst wurde bei Inquiry/Case-Create via `numberSeqService.getNextNumber(prisma, tenantId, key)` erzeugt (`src/lib/services/number-sequence-service.ts:89-102`):
- Pattern: `prisma.numberSequence.upsert` mit `update: { nextValue: { increment: 1 } }` (atomic increment)
- Default-Prefixe in `DEFAULT_PREFIXES` (Z. 37-65): `service_case` → `"KD-"`, `inquiry` → `"V-"`
- Return: `${seq.prefix}${seq.nextValue - 1}`

`numberSeqService` wird **nicht** für Order-Codes direkt aufgerufen — nur indirekt über Parent-Entitäten.

#### 1.4 "Create from Template"-Mechanismus

**Kanonisches Vorbild**: `BillingRecurringInvoice → BillingDocument`

- **Template-Entity**: `BillingRecurringInvoice` (Felder: `positionTemplate` JSON, `interval`, `servicePeriodMode`, `nextDueDate`, `autoGenerate`, `addressId`, `contactId`)
- **Cron-Trigger**: `src/app/api/cron/recurring-invoices/route.ts` (täglich 04:00 UTC) → `recurringService.generateDue(prisma, today, checkpoint)` (Z. 60)
- **`generateDue`** (`billing-recurring-invoice-service.ts:511`): findet `autoGenerate=true AND nextDueDate <= today AND isActive=true` via `repo.findDue`, iteriert je Template → `generate(prisma, template.tenantId, template.id, template.createdById)` mit Checkpoint-Skip-Logik
- **`generate`** (`billing-recurring-invoice-service.ts:387`): innerhalb `prisma.$transaction`:
  1. `numberSeqService.getNextNumber(tx, tenantId, "invoice")` (Z. 414)
  2. `calculateServicePeriod(template.nextDueDate, template.interval, template.servicePeriodMode)` (Z. 417)
  3. `billingDocRepo.create(tx, {...})` für `BillingDocument` vom Typ `"INVOICE"` (Z. 424)
  4. `billingDocRepo.createManyPositions(tx, ...)` aus `template.positionTemplate` JSON (Z. 456)
  5. `billingDocService.recalculateTotals(tx, tenantId, invoiceDoc.id)` (Z. 475)
  6. `calculateNextDueDate(template.nextDueDate, template.interval)` (Z. 478), dann Update `lastGeneratedAt` + neues `nextDueDate`. Wenn `endDate` überschritten → `isActive: false`.

`generate` kann auch manuell via `billing.recurringInvoices.generate` tRPC-Procedure getriggert werden.

**Zweites Vorbild**: `BillingDocument.forward` (`billing-document-service.ts:658`) — klont Header + Positionen in Child-Dokument für OFFER → ORDER_CONFIRMATION → DELIVERY_NOTE → INVOICE-Kette.

#### 1.5 "Create-Sub-Entity-from-Detail"-Procedures

Kanonische Präzedenzfälle:

| Procedure | File | Input-Shape |
|----------|------|-------------|
| `crm.inquiries.createOrder` | `src/trpc/routers/crm/inquiries.ts:201` | `{ id: uuid, orderName?: string(max 255) }` |
| `billing.serviceCases.createOrder` | `src/trpc/routers/billing/serviceCases.ts:184` | `{ id: uuid, orderName?: string(max 255), orderDescription?: string(max 2000) }` |
| `billing.serviceCases.createInvoice` | `src/trpc/routers/billing/serviceCases.ts:166` | `{ id: uuid, positions: [{ description, quantity?, unit?, unitPrice?, flatCosts?, vatRate? }].min(1) }` |
| `billing.documents.forward` | `src/trpc/routers/billing/documents.ts:103` | `{ id: uuid, targetType: enum }` |
| `billing.recurringInvoices.generate` | `src/trpc/routers/billing/recurringInvoices.ts:201` | `{ id: uuid }` |

Alle verwenden `$transaction`, alle catchen Prisma P2002 auf Uniqueness, alle setzen Parent-Status bei Erfolg (z. B. `inquiry.OPEN → IN_PROGRESS`).

---

### Block 2 — Fälligkeitsberechnung & Scheduler-Patterns

#### 2.1 Entitäten mit `nextDueAt` / `dueDate` / Fälligkeit-Feldern

**Kanonischer Präzedenzfall**: `BillingRecurringInvoice.nextDueDate`
- File: [`prisma/schema.prisma:1413`](prisma/schema.prisma#L1413)
- Typ: `DateTime @db.Timestamptz(6)`, NOT NULL
- Init: [`billing-recurring-invoice-service.ts:234`](src/lib/services/billing-recurring-invoice-service.ts#L234) — aus `input.startDate`
- Advance: [`billing-recurring-invoice-service.ts:478,491`](src/lib/services/billing-recurring-invoice-service.ts#L478) — via `calculateNextDueDate(current, interval)`, zurückgeschrieben via `repo.update`
- WHERE: [`billing-recurring-invoice-repository.ts:155,170`](src/lib/services/billing-recurring-invoice-repository.ts#L155) — `nextDueDate: { lte: today }` in `findDue()`
- Index: `@@index([tenantId, nextDueDate])` [`schema.prisma:1441`](prisma/schema.prisma#L1441)

**Weitere Fälligkeitsfelder**:

| Modell | Feld | Datei:Zeile | Typ | WHERE-Usage |
|--------|------|-------------|-----|-------------|
| `CrmTask` | `dueAt` | `schema.prisma:819` | `DateTime? Timestamptz(6)` | nur Display |
| `ReminderItem` | `dueDate` + `daysOverdue` | `schema.prisma:1534,1537` | Snapshot bei Mahnungserstellung | nur Display |
| `WhSupplierInvoice` | `dueDate` | `schema.prisma:5585` | `DateTime? Timestamptz(6)` | via `isOverdue(...)` in Service |
| `InboundInvoice` | `dueDate` | `schema.prisma:6135` | `DateTime? @db.Date` | nur Display |
| `InboundInvoiceApproval` | `dueAt` | `schema.prisma:6271` | `DateTime? Timestamptz(6)` | `findOverdueSteps()`: `status=PENDING AND dueAt < now` |
| `ExportTemplateSchedule` | `nextRunAt` | `schema.prisma:4178` | `DateTime? Timestamptz(6)` | `nextRunAt <= now` gate |
| `EmployeeProbationReminder` | `probationEndDate` | `schema.prisma:3664` | `DateTime @db.Date` | Dedup-Key |

Für Probation **kein** persistentes "Ende der Probezeit"-Feld; Berechnung on-the-fly via PostgreSQL-`make_interval` in `probation-repository.ts:153-158`.

#### 2.2 Cron-Routes

Alle Routes: `Authorization: Bearer ${CRON_SECRET}` Header, 503 wenn `CRON_SECRET` nicht gesetzt, 401 bei Mismatch. Cron-Trigger in [`vercel.json`](vercel.json).

| Route | Schedule | Service | Fehlerhandling | Idempotenz |
|-------|----------|---------|----------------|-----------|
| `/api/cron/calculate-days` | `0 2 * * *` | `RecalcService.triggerRecalcAll()` | continue-on-error je Tenant | `CronCheckpoint` upsert |
| `/api/cron/calculate-months` | `0 3 2 * *` | `MonthlyCalcService.calculateMonthBatch()` | continue-on-error | `CronCheckpoint` upsert |
| `/api/cron/generate-day-plans` | `0 1 * * 0` | `EmployeeDayPlanGenerator` | continue-on-error | `CronCheckpoint` upsert |
| `/api/cron/execute-macros` | `*/15 * * * *` | macro service | — | — |
| `/api/cron/recurring-invoices` | `0 4 * * *` | `recurringService.generateDue()` | continue-on-error je Template | `CronCheckpoint` keyed `"tenantId:templateId"` |
| `/api/cron/platform-subscription-autofinalize` | `15 4 * * *` | `autofinalize.autofinalizePending()` | all-or-nothing (einzelner try/catch) | nicht explizit |
| `/api/cron/wh-corrections` | `0 6 * * *` | `whCorrectionService` | continue-on-error | — |
| `/api/cron/email-retry` | `*/5 * * * *` | email retry | — | — |
| `/api/cron/email-imap-poll` | `*/3 * * * *` | IMAP poll | — | — |
| `/api/cron/inbound-invoice-escalations` | `0 * * * *` | `approvalRepo.findOverdueSteps()` | continue-on-error je Step | 24h-Cooldown via `lastReminderAt` |
| `/api/cron/expire-demo-tenants` | `0 1 * * *` | `repo.findExpiredActiveDemos()` + `markDemoExpired()` | continue-on-error | `CronCheckpoint` |
| `/api/cron/platform-cleanup` | `*/5 * * * *` | platform cleanup | — | — |
| `/api/cron/dunning-candidates` | `0 5 * * *` | `reminderEligibilityService.listEligibleInvoices()` | continue-on-error | Dedup via Notification-Existence |
| `/api/cron/probation-reminders` | `15 5 * * *` | `processTenantProbationReminders()` | continue-on-error, `CronExecutionLogger` | Unique-Constraint `uq_emp_probation_reminder` |
| `/api/cron/export-template-schedules` | **nicht in vercel.json** (suspended) | `runDueSchedules()` | — | `nextRunAt <= now` gate |

#### 2.3 Datumsrechnung-Patterns

**Pattern 1 — Native `setMonth()`** für Month-Interval-Advance
(`billing-recurring-invoice-service.ts:29-48`):
```ts
const next = new Date(current)
next.setMonth(next.getMonth() + N)  // 1/3/6 für MONTHLY/QUARTERLY/SEMI_ANNUALLY
// oder: next.setFullYear(next.getFullYear() + 1) für ANNUALLY
```
Lokale JS-Date-Arithmetik (nicht UTC).

**Pattern 2 — PostgreSQL `make_interval`** für Probation End Date
(`probation-repository.ts:153-158`):
```sql
(e.entry_date::timestamp + make_interval(months => COALESCE(e.probation_months, <default>)))::date
```
BETWEEN-Window-Filter in TS via `setUTCDate(getUTCDate() + PROBATION_ENDING_SOON_WINDOW_DAYS)` (Z. 194).

**Pattern 3 — Native `setDate()`** für Payment-Term-Fälligkeit
(`billing-payment-service.ts:50-52`):
```ts
const due = new Date(documentDate)
due.setDate(due.getDate() + paymentTermDays)
```
Repliziert in `billing-document-einvoice-service.ts:94-97` (lokaler `addDays`-Helper) und `email-document-context.ts:76`.

**Pattern 4 — `date-fns/subMonths`** für DSGVO-Retention
(`dsgvo-retention-service.ts:240,299`): **Einziger** Service-Layer-Usage von `date-fns`:
```ts
import { subMonths } from "date-fns"
const cutoffDate = subMonths(new Date(), rule.retentionMonths)
```

**Pattern 5 — UTC-Month-Arithmetik** für Vormonat
(`calculate-months/route.ts:31`):
```ts
const defaultDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
```

#### 2.4 "Überfällig"-Markierung in UI

**Billing Open Items** (`src/components/billing/payment-status-badge.tsx:29-31`, `open-item-list.tsx:109`):
- `isOverdue` server-seitig berechnet (`billing-payment-service.isOverdue()`, Day-Granularität)
- `PaymentStatusBadge` kollabiert zu `'OVERDUE'` Status, `Badge variant="red"`
- Row-Background: `bg-red-50 dark:bg-red-950/40` (mobile card + desktop table)
- **Kein** Sort-Overdue-First im aktuellen Code

**Dunning Proposal Tab** (`src/components/billing/dunning/dunning-proposal-tab.tsx:360`):
- `daysOverdue` als Plain-Integer in Column — **keine** rote Styling
- Customer-Groups `Badge variant="outline"` + `variant="secondary"` für Level/Count
- `daysOverdue` in `reminder-eligibility-service.ts:188-189`: `Math.floor((now.getTime() - dueDate.getTime()) / 86400000)`

**Inbound Invoice Approval** (`src/components/invoices/inbound-pending-approvals.tsx:69,93-99`):
- Inline: `const isOverdue = approval.dueAt && new Date(approval.dueAt) < new Date()`
- Cell-Style: `text-destructive font-medium`
- `Badge variant="red"` + Clock-Icon bei Overdue

**Warehouse Supplier Invoice** (`supplier-invoice-list.tsx:186,223`, `supplier-invoice-detail.tsx:226`):
- Server-berechnet via `wh-supplier-invoice-service.ts:57` (delegiert auf `billing-payment-service.isOverdue()`)
- `text-destructive font-medium` auf Due-Date-Cell
- Detail: `Badge variant="destructive"` mit `t('detailOverdue')`

**Probation Dashboard Widget** (`src/components/dashboard/probation-dashboard-widget.tsx`):
- **Keine** rote/amber-Farbe — plain `daysRemaining` Count
- Error-State: `text-destructive`
- Link: `/admin/employees?probation=ENDS_IN_30_DAYS`

---

### Block 3 — ServiceObject-Detailseite & Dashboard-Patterns

#### 3.1 IST-Zustand der Tabs (post T-2)

File: [`src/app/[locale]/(dashboard)/serviceobjects/[id]/page.tsx`](src/app/[locale]/(dashboard)/serviceobjects/[id]/page.tsx)

**Tab-Type-Union** (Z. 28):
```ts
type TabValue = 'overview' | 'history' | 'tree' | 'attachments'
```

**4 Tabs** in Reihenfolge (Z. 100-105):
- `overview` — "Übersicht"
- `history` — "Historie"
- `tree` — "Hierarchie"
- `attachments` — "Anhänge"

**Fully controlled**:
```ts
const [activeTab, setActiveTab] = React.useState<TabValue>('overview')  // Z. 38
<Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabValue)}>  // Z. 97-98
```
**Kein** `defaultValue`, **kein** `useSearchParams` — Tab-State ist ephemeral React State.

**Cross-Tab-Interaction**: `LastServiceCard` erhält `onViewHistory={() => setActiveTab('history')}` (Z. 108-111) — programmatischer Tab-Switch von Overview.

**Layout**: Outer `<div className="space-y-4 p-6">` (Z. 65). Stammdaten-Grid: `grid grid-cols-1 gap-4 md:grid-cols-2` (Z. 116). **Keine** Counts in Tab-Labels.

**Keine Routen** `/serviceobjects/schedules` oder `/serviceobjects/overview` existieren. Unter `serviceobjects/`: `page.tsx` (Liste), `[id]/page.tsx` (Detail), `import/page.tsx`, `tree/page.tsx`.

#### 3.2 Dashboard-style List+Filter-Routen (Vorbilder)

**`/admin/orders/page.tsx`** (`src/app/[locale]/(dashboard)/admin/orders/page.tsx`):
- Outer: `<div className="space-y-6">` (Z. 163)
- Eigene Tabs (`orders | activities`) controlled via `React.useState` (Z. 42)
- Filter-State: `orderSearch` (Z. 45), `activitySearch` (Z. 51) — **React-State**, kein URL
- Filtering: client-seitig via `React.useMemo` (Z. 77-96)
- Data: `useOrders` + `useActivities` (Z. 57-62), **kein** server-side Pagination
- Table-Wrapper: `<Card><CardContent className="p-0">` (Z. 203-204)

**`/crm/inquiries/page.tsx`**:
- Thin Wrapper: `<div className="container mx-auto py-6"><InquiryList /></div>`
- Filter-Logic in `src/components/crm/inquiry-list.tsx`: `search`, `statusFilter`, `page` (Z. 48-50)
- `useCrmInquiries(...)` mit Query-Params (Z. 58) → **server-side** Filter + Pagination
- `pageSize` hardcoded 25 (Z. 51)
- **Kein** URL-Sync

**`/orders/recurring/page.tsx`**:
- Passthrough zu `<RecurringList />` (`src/components/billing/recurring-list.tsx:41`)
- Filter-State: `search`, `activeFilter`, `page` (Z. 44-46) — React-State
- `useBillingRecurringInvoices({ search, isActive, page, pageSize: 25 })` (Z. 48-53) — server-side

**`/crm/reminders`** existiert **nicht** (Glob leer).

**Gemeinsame Patterns**:
- Filter-State: `React.useState` (nicht URL/`useSearchParams`)
- Data-Table in `<Card><CardContent className="p-0">` oder bordered `div`
- Search via `SearchInput` oder `<Input>` + inline `onChange`
- Empty-States inline (zentrierte Icon + Text)
- `<Skeleton />` für Loading

#### 3.3 Sidebar-Nav-Config

File: [`src/components/layout/sidebar/sidebar-nav-config.ts`](src/components/layout/sidebar/sidebar-nav-config.ts)

**`NavItem`-Interface** (Z. 67-80):
```ts
titleKey: string            // Key in `nav` translation namespace
href: string                // Nav-Pfad
icon: LucideIcon
permissions?: string[]      // wenn absent, für alle sichtbar
module?: string             // versteckt wenn Modul disabled
badge?: number              // optional
```

**`NavSection`** (Z. 97-106): `titleKey`, `items[]`, optional `subGroups[]`, optional `module`. Wenn `module` gesetzt → hidden wenn deaktiviert.

**CRM-Sektion** (Z. 384-423): `titleKey: 'crm'`, `module: 'crm'`:

| titleKey | href | icon | permissions |
|----------|------|------|-------------|
| `crmAddresses` | `/crm/addresses` | BookOpen | `crm_addresses.view` |
| `crmInquiries` | `/crm/inquiries` | FileText | `crm_inquiries.view` |
| `crmTasks` | `/crm/tasks` | ClipboardCheck | `crm_tasks.view` |
| `crmReports` | `/crm/reports` | BarChart3 | `crm_addresses.view` |
| `crmServiceObjects` | `/serviceobjects` | Wrench | `service_objects.view` |

Serviceobjekte ist **letzter** Item, `href=/serviceobjects` (nicht unter `/crm/`). **Keine** Sub-Group, keine Nested Children.

#### 3.4 Dashboard-Widgets mit Fälligkeit

File: [`src/app/[locale]/(dashboard)/dashboard/page.tsx`](src/app/[locale]/(dashboard)/dashboard/page.tsx)

Widgets (wenn `employeeId` gesetzt, Z. 39):
1. `DashboardHeader` — greeting
2. `QuickActions` — action buttons
3. Stats-Grid (Z. 45-50, `grid-cols-2 gap-3 lg:grid-cols-4`): `TodayScheduleCard`, `HoursThisWeekCard`, `VacationBalanceCard`, `FlextimeBalanceCard`
4. 2-Col (Z. 53, `lg:grid-cols-2`): `PendingActions`, `RecentActivity`
5. 2-Col (Z. 75-80): `PersonnelFileDashboardWidget` (wenn `employeeId`), `ProbationDashboardWidget` (wenn `canViewEmployees`)

**Detailanalyse Fälligkeits-Widgets**:

| Widget | File | Hook | Urgency-Coloring | Click-Target |
|--------|------|------|-----------------|--------------|
| `HoursThisWeekCard` | `src/components/dashboard/hours-this-week-card.tsx` | `useDailyValues({from: weekStart, to: weekEnd})` | Progress-Bar: `bg-primary < 80%`, `bg-blue-500 80-99%`, `bg-green-500 100%+` | keine Nav-Wrap |
| `PendingActions` | `src/components/dashboard/pending-actions.tsx` | `useDailyValues(14-day window)` | `AlertTriangle text-amber-500` für error, `AlertCircle text-blue-500` für warning | `/timesheet?date=...`, Footer: `/corrections` |
| `PersonnelFileDashboardWidget` | `src/components/hr/personnel-file-dashboard-widget.tsx` | `useHrPersonnelFileReminders()` + `useHrPersonnelFileExpiring(30)` | **Keine** Color-Diff — `text-muted-foreground` | `/hr/personnel-file` |
| `ProbationDashboardWidget` | `src/components/dashboard/probation-dashboard-widget.tsx` | `useProbationDashboard()` | **Keine** — uniform `rounded-lg border` | Row → `/admin/employees/${id}`, Button → `/admin/employees?probation=ENDS_IN_30_DAYS` |

---

### Block 4 — Activity-Entity

#### 4.1 Prisma-Model

Location: [`prisma/schema.prisma:2437-2456`](prisma/schema.prisma#L2437-L2456)

| Feld | Typ | Notes |
|------|-----|-------|
| `id` | UUID | `gen_random_uuid()`, PK |
| `tenantId` | UUID | FK → `Tenant`, cascade delete |
| `code` | VarChar(50) | Unique pro Tenant (`activities_tenant_id_code_key`) |
| `name` | VarChar(255) | Required |
| `description` | Text? | Optional |
| `isActive` | Boolean | Default `true` |
| `createdAt` | Timestamptz | `now()` |
| `updatedAt` | Timestamptz | DB-Trigger `update_activities_updated_at` |

**Outbound-Relations**:
- `defaultForEmployees Employee[]` via `@relation("EmployeeDefaultActivity")` (Z. 2449) — Employees die Activity als Default haben
- `orderBookings OrderBooking[]` (Z. 2450) — alle zugeordneten Bookings

**Inbound-FKs**:
1. `Employee.defaultActivityId` (`schema.prisma:2050`) → `Activity` via `@relation("EmployeeDefaultActivity")` (Z. 2164), `onDelete: SetNull`
2. `OrderBooking.activityId` (`schema.prisma:5244`) → `Activity` (Z. 5258), `onDelete: SetNull`

**Kein** `isDefault`/`isStandard`-Feld auf Activity selbst. Default-Konzept lebt auf Employee, nicht auf Activity oder Tenant.

#### 4.2 Activity-Zuweisung bei Order

**Auf Order-Level**: Order hat **kein** `activityId`-Feld. Grep in `src/trpc/routers/orders.ts` und `src/lib/services/order-service.ts` ergibt **null Matches** für `activityId`. Activity-Zuweisung passiert nicht bei Order-Create.

**Auf OrderBooking-Level**: `OrderBooking.activityId` ist `String?` (nullable). Gesetzt in zwei Flows:

**Flow 1 — Manuelles Booking via UI**:
- `src/components/orders/order-booking-form-sheet.tsx`
- Activity-Fetch: `useActivities({ isActive: true, enabled: open })` (Z. 81)
- Activity-Field: `<Select>` (Z. 197-215) mit `__none__`-Sentinel als First Option (labeled `t('noActivity')`). Label (Z. 196) hat **kein** `*`-required Marker.
- Submit (Z. 145-152): `activityId: form.activityId || undefined`
- `validateForm` (Z. 105-122): prüft nur `employeeId`, `bookingDate`, `timeMinutes` — Activity **nicht** validiert
- Router `orderBookings.create` (`src/trpc/routers/orderBookings.ts:101-104`): `activityId: z.string().optional()`. Bei Input: Validate (Z. 381-388) `NOT_FOUND` TRPCError wenn Activity nicht im Tenant. Stored: `activityId: input.activityId || null` (Z. 399)

**Flow 2 — Automatisches Booking via Daily Calc**:
- `src/lib/services/daily-calc.ts:990-1010`
- `DailyCalcService` auto-erzeugt `OrderBooking` (`source="auto"`) → liest `emp.defaultOrderId` + `emp.defaultActivityId` aus Employee (loaded `daily-calc.context.ts:195-200`) → schreibt beides in `prisma.orderBooking.create`. Kann `null` sein.

**Hook**: `useActivities` (`src/hooks/use-activities.ts:13`) → `activities.list` tRPC mit optionalem `isActive`-Filter.

**Kein** dedizierter `ActivityPicker`-Component — das Booking-Form nutzt plain shadcn `<Select>`.

#### 4.3 Tenant-Level Seeding

**Dev-Seed** (`supabase/seed.sql:1378-1384`): 4 Activities für Dev-Tenant (`10000000-0000-0000-0000-000000000001`):

| Code | Name | Description |
|------|------|-------------|
| `ACT-DEV` | Entwicklung | Software-Entwicklungsarbeit |
| `ACT-TEST` | Testing | Qualitätssicherung und Tests |
| `ACT-MEET` | Besprechung | Meetings und Abstimmungen |
| `ACT-ADMIN` | Administration | Administrative Tätigkeiten |

**Keine** Service/Maintenance-Activities (WARTUNG, REPARATUR, INSPEKTION) im Seed.

**Production-Tenant-Creation** (`src/lib/tenant-templates/seed-universal-defaults.ts`): Seedet **keine** Activities. `seedUniversalDefaults` (Z. 49) seedet nur Reminder-Templates, Email-Templates, Reminder-Settings. Frisch provisioned production tenants haben **null Rows** in `activities`.

**Deletion-Guard** (`activity-service.ts:220-226`): `repo.countEmployees` prüft vor Delete, ob Employee die Activity als Default hat. Wenn ja → `ActivityValidationError("Cannot delete activity with assigned employees")`. OrderBookings werden **nicht** geprüft (DB-Level `SetNull` behandelt das silent).

---

### Block 5 — Employee-Zuweisung

#### 5.1 OrderAssignment-Create-Flow

**Schema** ([`prisma/schema.prisma:2514-2537`](prisma/schema.prisma#L2514)):
- `id` UUID, `tenantId`, `orderId`, `employeeId` — alle non-nullable UUIDs
- `role` VarChar(20), default `"worker"`, DB-CHECK `'worker' | 'leader' | 'sales'`
- `validFrom`, `validTo` nullable Date
- `isActive` Boolean, default `true`
- Unique: `(orderId, employeeId, role)` (Z. 2531)
- Alle drei FKs: `onDelete: Cascade`

**Creation-Pfad — separate Mutation**:
1. `orderAssignmentsRouter.create` ([`src/trpc/routers/orderAssignments.ts:220-237`](src/trpc/routers/orderAssignments.ts#L220))
2. `orderAssignmentService.create` ([`src/lib/services/order-assignment-service.ts:83-130`](src/lib/services/order-assignment-service.ts#L83)) — defaults `role="worker"` wenn absent, parsed ISO-Date-Strings via `parseDate()` (Z. 37-39), catched Prisma P2002 als `OrderAssignmentConflictError`, re-fetched mit `findByIdWithIncludes`
3. `orderAssignmentRepository.create` (`order-assignment-repository.ts:77-90`) — plain `prisma.orderAssignment.create({ data })`

**Nicht** eingebettet in `orders.create` — Grep in `orders.ts` ergibt **null Matches** für Assignment-Keywords.

**Input-Shape für `orderAssignments.create`** (`orderAssignments.ts:62-68`):
```ts
{
  orderId:    string          // required UUID
  employeeId: string          // required UUID
  role?:      string          // optional, service defaults "worker"
  validFrom?: string          // optional, ISO date (z.string().date())
  validTo?:   string          // optional, ISO date
}
```
`isActive` **nicht** im Input — Service hardcoded `true` (`order-assignment-service.ts:103`).

#### 5.2 "Default-Verantwortlicher" / "primaryTechnicianId"-Konzept

**Keine** der Suchen (`primaryTechnicianId`, `defaultEmployeeId`, `responsibleEmployeeId`, `verantwortlichId`, `assignedToId`) trifft auf `ServiceObject`, `CrmAddress`, `CrmInquiry`, `Tenant`.

**Bestehende Entitäten mit Employee-FK für Verantwortlichkeit**:

| Entität | Feld | FK-Spalte | Relation-Name | onDelete |
|---------|------|-----------|---------------|----------|
| `BillingServiceCase` ([`schema.prisma:1211,1226`](prisma/schema.prisma#L1211)) | `assignedToId` / `assignedTo` | `assigned_to_id` | unnamed | `SetNull` |
| `Department` ([`schema.prisma:1907,1916`](prisma/schema.prisma#L1907)) | `managerEmployeeId` / `manager` | `manager_employee_id` | `"DepartmentManager"` | `SetNull` |
| `Team` ([`schema.prisma:1940,1948`](prisma/schema.prisma#L1940)) | `leaderEmployeeId` / `leader` | `leader_employee_id` | `"TeamLeader"` | `SetNull` |

`CrmInquiry` hat **keine** Employee-FK (nur `closedById` als raw UUID auf `User`).

**`Employee.defaultOrderId`** (Inverse-Richtung):
- `Employee.defaultOrderId String?` (`schema.prisma:2049`)
- `defaultOrder Order? @relation("EmployeeDefaultOrder", fields: [defaultOrderId], references: [id], onDelete: SetNull)` (`schema.prisma:2163`)
- Inverse: `Order.defaultForEmployees Employee[] @relation("EmployeeDefaultOrder")` (`schema.prisma:2489`)

Analog `Employee.defaultActivityId` (Z. 2050, 2164) → `Activity`, `SetNull`.

#### 5.3 "Employee-FK mit SetNull on Delete"-Patterns

Präzedenzfälle in `schema.prisma`:

1. **`User.employee`** (Z. 53) — `User.employeeId?` → `Employee`, `SetNull`
2. **`Department.manager`** (Z. 1916) — `managerEmployeeId?` → `Employee`, `SetNull`, Relation `"DepartmentManager"`
3. **`Team.leader`** (Z. 1948) — `leaderEmployeeId?` → `Employee`, `SetNull`, Relation `"TeamLeader"`
4. **`BillingServiceCase.assignedTo`** (Z. 1226) — `assignedToId?` → `Employee`, `SetNull`
5. **`Employee.defaultOrder`** (Z. 2163) — Employee → Order mit `SetNull`
6. **`RawTerminalBooking.employee`** (Z. 4506) — `employeeId?` → `Employee`, `SetNull`

`OrderAssignment.employee` dagegen: `onDelete: Cascade` (Z. 2529). Dasselbe Cascade-Pattern gilt für die meisten Employee-owned Child-Records (`ShiftAssignment`, `SalaryHistory`, `EmployeeCompanyCar`).

---

### Block 6 — Tenant-Isolation & Permission-Konventionen

#### 6.1 Permission-Namespaces im CRM-Modul

**Permission-Catalog-Mechanik** (`src/lib/auth/permission-catalog.ts`):
- Flat `ALL_PERMISSIONS`-Array mit Helper `p(key, resource, action, description)` (Z. 31)
- UUID v5 deterministisch aus Key, Namespace `f68a2ad7-6fd8-4d61-9b0e-0ea4a0d6c8a1` (Z. 12)

**`DEFAULT_PERMISSION_ROLES`**-Konstante existiert **nicht** in TypeScript. Default-Role-zu-Permission-Zuordnungen leben ausschließlich in SQL-Migration [`supabase/migrations/20260325120000_add_module_permissions_to_groups.sql`](supabase/migrations/20260325120000_add_module_permissions_to_groups.sql). 7 System-Gruppen:

- **ADMIN** — `isAdmin: true`, bypasses alle Checks
- **PERSONAL** — 91 Permissions
- **VORGESETZTER** — 26 Permissions (HR + read-only cross-module)
- **MITARBEITER** — 4 Permissions (`time_tracking.view_own`, `absences.request`, `order_bookings.view`, `crm_addresses.view`)
- **LAGER** — 14 Permissions
- **BUCHHALTUNG** — 24 Permissions
- **VERTRIEB** — 22 Permissions

**`service_objects.*`-Permissions** (T-1), [`permission-catalog.ts:257-260`](src/lib/auth/permission-catalog.ts#L257):

| Key | UUID | System-Gruppen |
|-----|------|----------------|
| `service_objects.view` | deterministisch v5 | **Keine** |
| `service_objects.manage` | deterministisch v5 | **Keine** |
| `service_objects.delete` | deterministisch v5 | **Keine** |

Die `service_objects`-Permissions wurden in `permission-catalog.ts` angelegt, aber **keiner System-Gruppe in den Migrations zugewiesen**. Die Table-Migration `20260504000001_create_service_objects.sql` erzeugt Tabelle, updated aber keine Group-Rows.

**`crm_*.*`-Permissions**, [`permission-catalog.ts:233-255`](src/lib/auth/permission-catalog.ts#L233):

| Key | Default-Gruppen |
|-----|-----------------|
| `crm_addresses.view/create/edit/delete` | PERSONAL, VERTRIEB (view auch: VORGESETZTER, MITARBEITER, LAGER) |
| `crm_correspondence.view/create/edit/delete/upload` | PERSONAL, VERTRIEB (view auch: VORGESETZTER, BUCHHALTUNG) |
| `crm_inquiries.view/create/edit/delete` | PERSONAL, VERTRIEB (view auch: VORGESETZTER) |
| `crm_tasks.view/create/edit/delete` | PERSONAL, VERTRIEB (view auch: VORGESETZTER) |

**`orders.*`-Permissions**, [`permission-catalog.ts:151-164`](src/lib/auth/permission-catalog.ts#L151):

| Key | Default-Gruppen |
|-----|-----------------|
| `activities.manage` | PERSONAL, VERTRIEB |
| `orders.manage` | PERSONAL, VERTRIEB |
| `order_assignments.manage` | PERSONAL, VERTRIEB |
| `order_bookings.manage` | PERSONAL |
| `order_bookings.view` | PERSONAL, VORGESETZTER, MITARBEITER |

**Permission-Resolution** (`src/lib/auth/permissions.ts`):
- `resolvePermissions(user)` (Z. 26): UUID-Array aus `userGroup.permissions`. `[]` für Admin-Gruppen.
- `isUserAdmin(user)` (Z. 56): `userGroup.isAdmin === true` oder `user.role === "admin"` (Legacy).
- `hasPermission(user, permissionId)` (Z. 73): Check in Reihenfolge inactive → admin → UUID in `userGroup.permissions` (JSONB Array), Fallback auf Key-String-Match (Z. 86).

#### 6.2 `.generate`/`.execute`/`.run`-Permission-Präzedenz

**Vier** distinkte Trigger-Permissions:

| Key | File:Line | Beschreibung | Default-Gruppen |
|-----|-----------|--------------|-----------------|
| `billing_recurring.generate` | `permission-catalog.ts:287` | Generate invoices from recurring templates | PERSONAL, BUCHHALTUNG |
| `wh_corrections.run` | `permission-catalog.ts:329` | Run warehouse correction checks | — |
| `dsgvo.execute` | `permission-catalog.ts:357` | Execute DSGVO data deletion | — |
| `export_template.execute` | `permission-catalog.ts:413` | Execute export templates (generate exports) | — |

Live-Beispiel: `billing_recurring.generate` gated `generate` + `generateDue` Procedures in `src/trpc/routers/billing/recurringInvoices.ts:201-228` via `requirePermission(REC_GENERATE)`, während `create/update/delete` `REC_MANAGE` und `list/getById` `REC_VIEW` nutzen.

**Kein** `.trigger`- oder `.generateOrder`-Pattern in der gesamten Codebase.

#### 6.3 `tenantProcedure` & Module-Gated Procedures

**`tenantProcedure`** ([`src/trpc/init.ts:354-382`](src/trpc/init.ts#L354)):
1. Check `ctx.tenantId` nicht null → `FORBIDDEN("Tenant ID required")` (Z. 356)
2. Scan `ctx.user.userTenants` (in-memory, geladen at context build, Z. 122-127) nach matching `tenantId` → `FORBIDDEN("Access to tenant denied")` (Z. 364-373)

Kein zusätzlicher DB-Query in Middleware — userTenants eager-loaded via `prisma.user.findUnique({ include: { userTenants: { include: { tenant: true } } } })`.

**Module-Check** (`src/lib/modules/index.ts`):
- `getEnabledModules(prisma, tenantId)` (Z. 25) — query `TenantModule`-Rows + always `"core"`
- `hasModule(prisma, tenantId, module)` (Z. 48) — `prisma.tenantModule.findUnique` mit `{ tenantId_module: {...} }`
- `requireModule(module)` (Z. 70) — tRPC-Middleware, throws `FORBIDDEN` wenn nicht enabled. `"core"` short-circuit at Z. 84 (kein DB-Hit).

**`serviceObjectProcedure`** (file-local in `src/trpc/routers/serviceObjects.ts:27`):
```ts
const serviceObjectProcedure = tenantProcedure.use(requireModule("crm"))
```

Dasselbe Pattern in `src/trpc/routers/crm/addresses.ts:17` (`crmProcedure`), `src/trpc/routers/billing/recurringInvoices.ts:16` (`billingProcedure`). Alle file-local deklariert, **nicht** zentral exportiert.

**Full-Middleware-Chain**:
1. `impersonationBoundary` (via `publicProcedure`, `init.ts:323`)
2. `protectedProcedure` auth check (`init.ts:329`)
3. `tenantProcedure` tenant membership check (`init.ts:354`)
4. `requireModule("crm")` DB check (`modules/index.ts:70`)
5. `requirePermission(SO_VIEW)` (`auth/middleware.ts:40`)

Module-Check issuet **einen** SELECT pro Request; nicht cached across Procedures.

---

### Block 7 — Audit, Soft-Delete & Lifecycle

#### 7.1 Audit-Pattern

**Audit-Helper**: [`src/lib/services/audit-logs-service.ts`](src/lib/services/audit-logs-service.ts)
- Entry: `auditLog.log(prisma, data)` (Z. 173), `auditLog.logBulk(prisma, data)` (Z. 222)
- Fire-and-forget: intern catched, throws niemals. Services chainen `.catch(err => console.error('[AuditLog] Failed:', err))` als Defense-in-Depth.
- `Tx`-Type (Z. 17): `PrismaClient | Prisma.TransactionClient` — callable in `$transaction`.
- `AuditContext` (Z. 23): `userId, ipAddress?, userAgent?`
- `computeChanges` (Z. 109): diff two Prisma-Snapshots → `{ fieldName: { old, new } }` oder `null`.

**Action-Strings — alle vier untersuchten Services nutzen bare-verbs**:

| Service | File:Line | Verben |
|---------|-----------|--------|
| `crm-address-service.ts` | Z. 243 | `"create"`, `"update"`, `"delete"`, `"restore"` |
| `order-service.ts` | Z. 155 | `"create"`, `"update"`, `"delete"` |
| `billing-document-service.ts` | Z. 347 | `"create"`, `"update"`, `"delete"`, `"finalize"`, `"forward"`, `"cancel"`, `"delivery_note_stock_booking"` |
| `service-object-service.ts` | Z. 438 | `"create"`, `"update"`, `"delete"` |

**Kein** `<entity>_create`-Compound. `entityType` separat in snake_case: `"crm_address"`, `"order"`, `"billing_document"`, `"service_object"`, `"crm_contact"`, `"bank_account"`.

**`createdById`/`updatedById` auf Entity**:
- `crm-address-service.ts:238`: `createdById` als Function-Param, direkt in Prisma-Create
- `billing-document-service.ts:339`: `createdById` als dedicated Param
- `service-object-service.ts:430`: `createdById: input.createdById ?? audit?.userId ?? null` — Fallback auf Audit-Context
- `order-service.ts`: **kein** `createdById`/`updatedById`-Feld auf Order

**Dual-Audit (tenant + platform)**:
- `audit-logs-service.ts:187-205`: Wenn `getImpersonation()` non-null (Platform-Operator impersoniert) → automatischer Dual-Write in `platformAuditLog` mit `action: \`impersonation.${data.action}\``, `targetTenantId`, `supportSessionId`
- Transparent für alle Caller. `service-object-service.ts` hat **keinen** separaten Platform-Write.

#### 7.2 Soft-Delete-Konventionen

**10 Modelle mit `isActive Boolean`** (repräsentativ aus 50+):

| Modell | Schema-Zeile |
|--------|--------------|
| `User` | 40 (`Boolean?`) |
| `Tenant` | 105 (`Boolean?`) |
| `ServiceObject` | 950 |
| `Employee` | 2012 |
| `Order` | 500 |
| `CrmAddress` | 1355 |
| `OrderAssignment` | 2522 |
| `Activity` | 2443 |
| `Department` | 1908 |
| `Team` | 1941 |

**Modelle mit `deletedAt DateTime?`**: nur zwei — `User` (`schema.prisma:41`) und `Employee` (`schema.prisma:2015`). Beide haben **beides**: `isActive` + `deletedAt`.

**Service-Level Delete-Verhalten**:

| Service | Methode | Verhalten | File:Line |
|---------|---------|-----------|-----------|
| `crm-address-service` | `softDelete` | `isActive=false` | `crm-address-repository.ts:127-132` |
| `crm-address-service` | `hardDelete` | `prisma.delete` wenn safe | `crm-address-repository.ts:143` |
| `service-object-service` | `remove` | **Conditional**: softDelete wenn FK-Refs, sonst hardDelete | `service-object-service.ts:744-766` |
| `order-service` | `deleteById` | Hard (Kommentar: "OrderAssignments cascade via FK") | `order-service.ts:327-328` |
| `billing-document-service` | Position-Delete | Hard in `$transaction` | `billing-document-service.ts:1153` |
| `employees-service` | `deactivate` | `repo.update({ isActive: false, exitDate: ... })` — nie hard | `employees-service.ts:1108-1111` |
| `reminder-template-service` | `delete` | Hard (`prisma.reminderTemplate.delete`) | `reminder-template-service.ts:112` |
| `wh-purchase-order-service` | `cancel/delete` | Soft via `softDeleteById` | `wh-purchase-order-service.ts:284` |

**Summary**: Domain-Entities (Addresses, ServiceObjects, Employees, PurchaseOrders) → soft. Lookup/Config (ReminderTemplate) + Cascade-covered Children (OrderAssignment, Position) → hard. ServiceObject nutzt conditional hybrid.

#### 7.3 Parent-Child Cascade Patterns

Alle aus `prisma/schema.prisma`:

**`OrderAssignment`** → Z. 2527-2529: Tenant + Order + Employee alle `Cascade`

**`CrmContact` → `CrmAddress`**: Z. 562-563, beide `Cascade`

**`CrmBankAccount` → `CrmAddress`**: Z. 595-596, beide `Cascade`

**`CrmCorrespondenceAttachment` → `CrmCorrespondence`**: Z. 749-750, beide `Cascade`

**`ServiceObject` Self-Parent**:
- Z. 960: `tenant Tenant @relation(..., onDelete: Cascade)`
- Z. 961: `parent ServiceObject? @relation("ServiceObjectTree", fields: [parentId], references: [id], onDelete: SetNull)` — **SetNull** für Self-Parent

**`ServiceObjectAttachment` → `ServiceObject`**: Z. 990-991, beide `Cascade`

**`BillingDocumentPosition` → `BillingDocument`**: Z. 1123, `Cascade`

**`BillingPriceListEntry` → `BillingPriceList`**: Z. 1389, `Cascade`

**`UserTenant` → `User`/`Tenant`**: Z. 1603-1604, beide `Cascade`

**`TenantModule` → `Tenant`**: Z. 336, `Cascade`

**`ReminderItem`**: Z. 1544 → `Reminder` `Cascade`, Z. 1545 → `BillingDocument` `Restrict` (verhindert Delete eines Billed-Documents während Dunning)

**`CrmAddress` Self-Parent**: Z. 507, `parentAddress` → `SetNull` (identisch ServiceObject-Pattern)

**`CrmTaskAssignee`**: Z. 857-859, alle drei (Task, Employee, Team) `Cascade`

**Pattern-Zusammenfassung**:
- Tenant → alles: `Cascade`
- Child-Content (attachments, positions, assignments): `Cascade`
- Self-Parent-Trees: `SetNull` (orphan children, never cascade subtree)
- Nullable FK-References (contact on document): `SetNull`
- Guard-FKs (ReminderItem → BillingDocument): `Restrict`

---

### Block 8 — UI-Patterns für Listen mit Filter + Aktion

#### 8.1 "Action-in-Row"-Pattern

**A. Dunning — "Mahnung senden"**

- Table-Row: `src/components/billing/dunning/dunning-runs-tab.tsx:111-116` mit `onClick={() => setSelectedReminderId(row.id)}` öffnet Detail-Sheet
- Action-Button: `src/components/billing/dunning/dunning-reminder-detail-sheet.tsx:371-377`
  ```tsx
  <Button onClick={() => setShowSendConfirm(true)} disabled={sendMutation.isPending}>
    <Send className="h-4 w-4 mr-1" />
    {t('detail.send')}
  </Button>
  ```
- ConfirmDialog zuerst; Mutation in `handleSendEmail` (Z. 117-126)
- Mutation-Hook: `useSendDunningReminder()` (Z. 97)
- Loading: `disabled={sendMutation.isPending}` + `isLoading={sendMutation.isPending}` im Confirm (Z. 423)
- Success: `toast.success(t('detail.sentSuccess'))` (Z. 121)
- Refresh: Hook invalidiert `useDunningRun`; keine List-Invalidation im Sheet

**B. Recurring Invoices — "Jetzt generieren" (List-Level)**

- `src/components/billing/recurring-list.tsx:55-66`:
  ```tsx
  const generateDueMutation = useGenerateDueRecurringInvoices()
  const handleGenerateAllDue = async () => {
    try {
      const result = await generateDueMutation.mutateAsync()
      if (result) toast.success(t('generatedSuccess', { generated, failed }))
    } catch { toast.error(t('generateDueError')) }
  }
  ```
- Button (Z. 74): `<Button size="sm" variant="outline" onClick={handleGenerateAllDue} disabled={generateDueMutation.isPending}><Play /> ...</Button>`
- Mutation-Hook: `useGenerateDueRecurringInvoices()` (`src/hooks/use-billing-recurring.ts:118-129`) — invalidiert 3 Keys: `recurringInvoices.list`, `recurringInvoices.getById`, `billing.documents.list`

**Per-Row Generate** (`RecurringDetail`): Play-Button (Z. 80) öffnet `RecurringGenerateDialog` → `useGenerateRecurringInvoice()` + Confirm → `toast.success` → `router.push('/orders/documents/${id}')` (Navigation statt List-Invalidation).

**C. BillingDocument — "Abschließen"**

- `src/components/billing/document-detail.tsx:133-137`:
  ```tsx
  {isDraft && (
    <Button onClick={() => setShowFinalizeDialog(true)}>
      <CheckCircle className="h-4 w-4 mr-1" />
      {t('finalize')}
    </Button>
  )}
  ```
- Dialog: `src/components/billing/document-print-dialog.tsx:108-150`
- Mutation-Hook: `useFinalizeBillingDocument()` (Z. 51)
- Loading: `isLoading={finalizeMutation.isPending}` auf Confirm-Button
- Success: `toast.success('Beleg erfolgreich abgeschlossen')` (Z. 144)

**D. Demo-Tenant — "Verlängern"/"Konvertieren"**

- Per-Row DropdownMenu: `src/app/platform/(authed)/tenants/demo/page.tsx:381-410` (`DemoRow`)
- "Verlängern" → setzt `extendTarget`-State → `ExtendDialog` rendert (Z. 303-310)
- `ExtendDialog` (Z. 791-855):
  - Mutation: `trpc.demoTenantManagement.extend.mutationOptions()` (Z. 801)
  - Loading: `disabled={extendMutation.isPending}` + `<Loader2 className="mr-2 h-4 w-4 animate-spin" />` (Z. 847)
  - Success: `toast.success("Demo-Laufzeit verlängert")` (Z. 804)
  - Refresh: `invalidateList()` (Z. 184-188) → `qc.invalidateQueries({ queryKey: trpc.demoTenantManagement.list.queryKey() })`

#### 8.2 Filter-in-URL-State

**A. `/admin/employees?probation=ENDS_IN_30_DAYS`**

- `src/app/[locale]/(dashboard)/admin/employees/page.tsx:46,58-60,102-104`
- `useSearchParams()` (Z. 46)
- Init aus URL (Z. 58-60):
  ```tsx
  const [probationFilter, setProbationFilter] = React.useState<ProbationFilter>(() =>
    parseProbationFilter(searchParams.get('probation'))
  )
  ```
- `useEffect` (Z. 102-104) re-sync bei Back/Forward
- **Read-only**: kein `syncToUrl` Write-Back. Filter-Changes pushen **nicht** zurück.

**B. `/admin/evaluations?tab=bookings&from=...&to=...&employee_id=...`** (Bidirektional)

- `src/app/[locale]/(dashboard)/admin/evaluations/page.tsx`
- Read (Z. 66-70), Write (Z. 107-122):
  ```tsx
  const syncToUrl = React.useCallback(
    (overrides: Partial<typeof stateRef.current> = {}) => {
      const state = { ...stateRef.current, ...overrides }
      const params = new URLSearchParams()
      params.set('tab', state.activeTab)
      if (fromStr) params.set('from', fromStr)
      // ...
      router.replace(`${pathname}?${params.toString()}`, { scroll: false })
    }, [router, pathname]
  )
  ```
- Jeder Setter-Wrapper ruft `syncToUrl`

**C. `/admin/audit-logs`** — selbes Bidirektional-Pattern wie evaluations (6 Params: from, to, user_id, entity_type, entity_id, action), `stateRef` + `syncToUrl` + `router.replace({ scroll: false })`. `src/app/[locale]/(dashboard)/admin/audit-logs/page.tsx:42-95`.

#### 8.3 "Create-Sub-Entity-from-Detail"-Sheet-Pattern

**A. ServiceObject-Detail — Edit-Sheet**

- `src/app/[locale]/(dashboard)/serviceobjects/[id]/page.tsx:84` — "Bearbeiten"-Button → `setEditOpen(true)`, gerendert Z. 265-293:
  ```tsx
  <ServiceObjectFormSheet open={editOpen} onOpenChange={setEditOpen} existing={{...}} />
  ```
- Sheet-Component: `src/components/serviceobjects/service-object-form-sheet.tsx` (right-side `Sheet` / `SheetContent`)
- Attachment-Upload: **Kein** Sheet — inline `<input type="file">` im `AttachmentList`-Component
- After-Success: `useUpdateServiceObject` invalidiert `serviceObjects.list`, `serviceObjects.getById`, `serviceObjects.getTree` (Z. 110-113)

**B. CRM-Address-Detail — ContactFormDialog + BankAccountFormDialog**

- `src/app/[locale]/(dashboard)/crm/addresses/[id]/page.tsx:61-68`:
  ```tsx
  const [contactFormOpen, setContactFormOpen] = React.useState(false)
  const [editContact, setEditContact] = React.useState<...>(null)
  // (same for bankForm)
  ```
- Imports (Z. 25-27): `ContactFormDialog`, `BankAccountFormDialog` — **Modal-Dialog**, nicht Side-Sheet
- `ContactList`/`BankAccountList` exposen `+ Neu`-Buttons, die diese States setzen

**C. Order-Detail — Assignment (Dialog) + Booking (Sheet)**

- `src/app/[locale]/(dashboard)/admin/orders/[id]/page.tsx`
- "Assignments"-Tab (Z. 253): `<Button onClick={() => { setEditAssignment(null); setAssignmentFormOpen(true) }}><Plus /> {t('newAssignment')}</Button>`
  - `OrderAssignmentFormDialog` (Z. 381-387) — **modal Dialog**
- "Bookings"-Tab (Z. 284): `<Button onClick={() => { setEditBooking(null); setBookingFormOpen(true) }}><Plus /> {t('newBooking')}</Button>`
  - `OrderBookingFormSheet` (~Z. 399) — **Side-Sheet**
- `onSuccess` schließt Form + clear Edit-State; Invalidierung in respektive Mutation-Hooks

---

### Block 9 — i18n & Übersetzungsstruktur

#### 9.1 `serviceObjects`-Namespace

Location: [`messages/de.json:8799`](messages/de.json#L8799) und [`messages/en.json:8799`](messages/en.json#L8799) (beide Files selber Start).

3 Top-Level-Subobjects:

| Key | Zeilen (de.json) | Inhalt |
|-----|------------------|--------|
| `tabs` | 8800-8802 | 1 Key: `history` |
| `history` | 8803-8828 | 15 flat keys + `totals` (3 keys, mit ICU plural) |
| `lastService` | 8830-8835 | 4 keys (`daysAgo` mit ICU plural) |

**Total 28 Leaf-Keys** in `serviceObjects.*`.

**Namespace-Sizes zum Vergleich**:

| Namespace | Start-Zeile | End-Zeile | Span |
|-----------|-------------|-----------|------|
| `adminOrders` | 4906 | 5029 | ~124 |
| `adminSchedules` | 5072 | 5170 | ~99 |
| `crmAddresses` | 5579 | 5725 | ~147 |
| `billingDocuments` | 6636 | 6801 | ~166 |
| `warehouseStockMovements` | 6442 | 6470 | ~29 |
| `serviceObjects` | 8799 | 8837 | **39** |

`serviceObjects` ist klein relativ zu den großen Feature-Namespaces. Module-Namensgebung: CRM splittet in `crmAddresses`, `crmCorrespondence`, `crmInquiries`, `crmTasks`, `crmReports`. Warehouse in `warehouseStockMovements`, `warehouseWithdrawals`, `warehouseArticles`. HR in `hrPersonnelFile`, `hrPersonnelFileCategories`. Orders in `adminOrders`.

**"schedules" als Sub-Namespace**: Nur ein `"schedules":`-Treffer in beiden Files (Z. 133, innerhalb `nav` object: `"schedules": "Zeitpläne"` — flat nav label, **kein** nested sub-namespace). Die Schedules-Modul-Daten leben im Top-Level-Namespace `adminSchedules` (`de.json:5072`). **Kein** bestehender Namespace enthält nested `"schedules": { ... }`.

#### 9.2 Enum-Übersetzungs-Pattern

**Pattern A — `t(keyMap[value])` mit next-intl** (neuer Code):

- `WhStockMovementType` (`GOODS_RECEIPT, WITHDRAWAL, ADJUSTMENT, INVENTORY, RETURN, DELIVERY_NOTE`):
  - `src/components/warehouse/stock-movement-list.tsx:26-32` — `const typeKeys: Record<MovementType, string> = { GOODS_RECEIPT: 'typeGoodsReceipt', ... }`
  - `useTranslations('warehouseStockMovements')` (Z. 51)
  - Deutsche Strings `messages/de.json:6456-6461`
  - Dupliziert in `src/components/warehouse/article-movements-tab.tsx:26-32`

- `ReferenceType` (`ORDER/DOCUMENT/MACHINE/SERVICE_OBJECT/NONE`):
  - `src/components/warehouse/withdrawal-terminal.tsx:60-96` — `REF_TYPE_CONFIG`-Array of `{ value, labelKey, descKey }`
  - `useTranslations('warehouseWithdrawals')` (Z. 109)
  - Keys `messages/de.json:6483-6487`: `refTypeOrder="Auftrag"`, `refTypeMachine="Maschine/Gerät"`, `refTypeServiceObject="Serviceobjekt"`, `refTypeNone="Ohne Referenz"`

- `BillingDocumentType` (`OFFER, ORDER_CONFIRMATION, DELIVERY_NOTE, SERVICE_NOTE, RETURN_DELIVERY, INVOICE, CREDIT_NOTE`):
  - `src/components/billing/document-editor.tsx:78-86` — `const DOC_TYPE_KEYS: Record<string, string> = { OFFER: 'typeOffer', ... }`
  - Namespace: `billingDocuments`
  - Strings `messages/de.json:6637-6643`

- `CrmAddressType` (`CUSTOMER/SUPPLIER/BOTH`):
  - **Kein** Key-Map-Konstante. Inline im Call-Site: `src/components/crm/address-data-table.tsx:113-116`:
    ```tsx
    type === 'CUSTOMER' ? t('typeCustomer') : type === 'SUPPLIER' ? t('typeSupplier') : t('typeBoth')
    ```
  - Namespace: `crmAddresses`. Strings `messages/de.json:5588-5590`

- `OrderStatus` (`planned/active/completed/cancelled`):
  - `src/components/orders/order-status-badge.tsx:14-34` — `statusConfig`-Record: `{ planned: { labelKey: 'statusPlanned', variant: '...' }, ... }`
  - `useTranslations('adminOrders')` (Z. 40)
  - Strings `messages/de.json:4934-4938`

**Pattern B — `labels.ts` mit hardcoded Strings** (pre-next-intl):

`src/components/serviceobjects/labels.ts` ist das **einzige** `labels.ts` in der Codebase:
- Plain `Record<string, string>`-Objects + standalone Helper-Functions (`kindLabel()`, `statusLabel()`, `buildingUsageLabel()`)
- File-Kommentar (Z. 1-8) erklärt explizit: Tenant-UI war German-only per Memory/Feedback, mit Note dass es bei voll-next-intl-Wiring in messages JSON wandern würde
- Drei Enums gecovert:
  - `ServiceObjectKind` → `KIND_LABELS` + `kindLabel()` (Z. 10-39)
  - `ServiceObjectStatus` → `STATUS_LABELS` + `statusLabel()` (Z. 18-44)
  - `BuildingUsage` → `BUILDING_USAGE_LABELS` + `buildingUsageLabel()` (Z. 26-51)
- Jede Helper returned `'—'` für null/undefined, Fallback auf raw Enum-String für unmapped Values

---

### Block 10 — Test-Patterns

#### 10.1 Unit-Test-Pattern für Datums-Calc

**Pattern 1 — Pure Function mit `Date.UTC`-Inputs, exakte Assertions**
`src/lib/services/__tests__/probation-service.test.ts:1-127`
- **Keine** Fake-Timers. "Today" wird als expliziter Parameter in jede Function-under-Test geschoben (`computeProbationEndDate`, `getProbationSnapshot`, `getProbationStatus`, `computeDaysRemaining`)
- Alle Dates: `new Date(Date.UTC(...))` für maschinen-stabile UTC
- Assertions:
  - Exact-Object: `expect(snapshot.endDate).toEqual(new Date(Date.UTC(2026, 6, 1)))`
  - Relative: `expect(snapshot.daysRemaining).toBeLessThan(0)` (Z. 114)
  - Numeric: `expect(snapshot.daysRemaining).toBe(77)` (Z. 81)
  - Status: `expect(snapshot.status).toBe("in_probation")` (Z. 82)

**Pattern 2 — Fixed `NOW`-Const, `daysAgo(n)`-Helper, Mocked Prisma, reason-string Assertions**
`src/lib/services/__tests__/reminder-eligibility-service.test.ts:1-120+`
- **Keine** Fake-Timers. `const NOW = new Date("2026-04-13T12:00:00Z")` (Z. 24)
- `daysAgo(n)` derived relative (Z. 26-30)
- `buildDoc(overrides)` (Z. 39-87) für minimal document objects
- `NOW` direkt als 5. Argument in `evaluateInvoice(prisma, doc, settings, NOW, graceDays)`
- Assertions: exklusiv `result.reason`-Exact-String (`"no_payment_term"`, `"wrong_type"`, `"invoice_blocked"`)

**Pattern 3 — ISO-Strings + strukturelle Decomposition-Helper**
`src/lib/services/__tests__/billing-recurring-invoice-service.test.ts:83-173`
- **Keine** Fake-Timers. `new Date("YYYY-MM-DD")`
- Local `parts(d: Date)` (Z. 110-113): destructured `{y, m, d}` für lesbare `toEqual`
  ```ts
  expect(parts(from)).toEqual({ y: 2026, m: 3, d: 1 })
  ```
- `calculateNextDueDate`-Tests check nur changed field (`.getMonth()`, `.getFullYear()`)
- Boundary: leap-year Feb-29 (Z. 168-172), year-boundary Jan→Dec (Z. 162-166)

**`vi.useFakeTimers` / `vi.setSystemTime`**: nur in 4 Files (`employees-router.test.ts`, `totp.test.ts`, `init.test.ts`, `jwt.test.ts`) — **keine** davon Date-Calc-Service-Tests.

#### 10.2 Integration-Test-Fixture für programmatic Order-Create

**Pattern**: Gemocktes Prisma + `createCallerFactory` + `createTestContext`
`src/trpc/routers/__tests__/orders-router.test.ts:1-100`

**Kein** Real-DB-Integration-Test für Orders in `__tests__/`. Router-Test nutzt fully mocked Prisma.

**Fixture**:
- `makeOrder(overrides)` (Z. 26-63) — Factory für komplette Order-Record-Shape mit sinnvollen Defaults
- `createTestContext(prisma)` (Z. 65-75) — ruft `createMockContext` aus `./helpers`, injiziert `ORDERS_MANAGE`-Permission + `userTenants`-Entry
- Je Test fresh `mockPrisma` via `vi.fn().mockResolvedValue(...)` inline, `createCaller(createTestContext(mockPrisma))`

**Transaction/Isolation**: Kein `$transaction`-Wrapping. Jeder `describe`-Block baut isolated Mock at test-function scope — kein shared State, keine DB-Cleanup.

**Vergleich `billing-service-case-service.test.ts:92-132`**: Enthält `$transaction`-Mock (Z. 118):
```ts
(prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
  (fnOrArr: unknown) => {
    if (typeof fnOrArr === "function") return (fnOrArr as (tx: unknown) => unknown)(prisma)
    return Promise.all(fnOrArr as unknown[])
  }
)
```
Handles both callback- und array-style Transaction-Calls ohne real DB.

**DB-Config** (`vitest.config.ts:1-19`):
- `environment: "node"`, includes `src/**/__tests__/**/*.test.ts`
- `dotenv.config({ path: ".env.local" })` loaded `DATABASE_URL`
- `.integration.test.ts`-Tags (z. B. `demo-tenant-service.integration.test.ts`) hitten real Supabase-Dev-DB direkt via Prisma, **kein** Transaction-Rollback-Wrapper; rely on `global-setup.ts` psql Cleanup für Idempotenz

#### 10.3 E2E 1-Klick-Workflow

**A. Document-Forward-Kette (Offer → Order-Confirmation → Delivery-Note → Invoice)**
`src/e2e-browser/30-billing-documents.spec.ts`

`test.describe.serial("UC-ORD-01: Document Chain (Belegkette)")` — alle Tests serial sharing DB-State.

**Helpers**:
- `navigateTo` aus `helpers/nav.ts:5` — `page.goto(path)` + wait for `main#main-content`
- `waitForTableLoad` aus `helpers/nav.ts:24`
- `fillInput`, `submitAndWaitForClose`, `waitForSheet`, `expectTableContains` aus `helpers/forms.ts`
- Lokal `openDocument(page, pattern, statusFilter?)` (Z. 14-25)
- Lokal `finalizeDocument(page)` (Z. 27-36) — klickt "Abschließen", confirm dialog, assert "Abgeschlossen"
- Lokal `forwardDocument(page)` (Z. 38-48)

**Navigation-Pattern** (Forward Offer → Order-Confirmation, Z. 225-240):
```typescript
await page.getByRole("button", { name: "Fortführen" }).click();
const dialog = page.getByRole("dialog");
await expect(dialog).toBeVisible();
await expect(dialog.getByText("Auftragsbestätigung")).toBeVisible();
await dialog.getByRole("button", { name: "Fortführen" }).click();
await page.waitForURL(/\/orders\/documents\/[0-9a-f-]+/, { timeout: 10000 });
await expect(page.getByText("Entwurf")).toBeVisible({ timeout: 10000 });
```

**Assertions**: URL-Regex (`page.waitForURL`), Text-Visibility (`getByText("Abgeschlossen")`), Button-Absence (`not.toBeVisible()`), Table-Row-Content-Regex (`toContainText(/1[.]190,00/)`).

End-of-Chain (Z. 339-352): nav `/orders/open-items`, assert invoice-row zeigt Company, Status "Offen", `1.190,00`.

**B. Generate Recurring Invoice (1-Klick von Template-Detail)**
`src/e2e-browser/34-billing-recurring.spec.ts`

`test.describe.serial("UC-ORD-05: Praxisbeispiel 13.13.1")` — 3 serial tests (create template, generate, verify).

Generate-Step (Z. 132-208):
1. Click Table-Row → URL zu Detail
2. Click `"Rechnung generieren"`
3. Assert Confirmation-Sheet open (`[data-slot="sheet-content"][data-state="open"]`)
4. Assert netto/MwSt/Brutto-Preview in Sheet
5. Click `"Generieren"` in Sheet-Footer
6. Assert success-regex: `page.getByText(/Rechnung RE-\d+ wurde erstellt/)`
7. Assert URL-Redirect `/orders/documents/[uuid]`
8. Nav back zu Template, assert next-due advanced auf `01.05.2026`
9. Assert "Letzte Generierung" zeigt heute via `new Intl.DateTimeFormat("de-DE").format(new Date())`

**Auth-Setup**: Alle `*.spec.ts` nutzen `admin-tests`-Project in `playwright.config.ts:28-36`, depended auf `setup`-Project mit `auth.setup.ts`. Admin-Session gespeichert in `.auth/admin.json` via `loginAsAdmin(page)` in `helpers/auth.ts`. `loginAsAdmin` klickt Dev-Mode-Button auf `/login` ohne credentials, waited `page.waitForURL(/dashboard/)`. `SEED.TENANT_ID` wird in `localStorage` key `"tenant_id"` nach Login persisted.

## Code References

### Block 1 — Order-Erzeugung
- `src/lib/services/order-repository.ts:109` — einziger `prisma.order.create`
- `src/lib/services/order-service.ts:133` — `orderService.create`
- `src/lib/services/billing-service-case-service.ts:368` — `createOrder` von ServiceCase
- `src/lib/services/crm-inquiry-service.ts:367` — `createOrder` von Inquiry
- `src/trpc/routers/orders.ts:61-72` — `createOrderInputSchema` (Zod)
- `src/trpc/routers/orders.ts:211` — `orders.create` Mutation
- `src/lib/services/number-sequence-service.ts:89-102` — `getNextNumber`
- `src/lib/services/number-sequence-service.ts:37-65` — `DEFAULT_PREFIXES`
- `src/lib/services/billing-recurring-invoice-service.ts:387-507` — `generate`
- `src/lib/services/billing-recurring-invoice-service.ts:511-597` — `generateDue`
- `src/app/api/cron/recurring-invoices/route.ts:21-84` — Cron-Entry
- `src/lib/services/billing-document-service.ts:658-752` — `forward`
- `prisma/schema.prisma:2467-2503` — `Order`-Model

### Block 2 — Fälligkeiten & Cron
- `prisma/schema.prisma:1413,1441` — `BillingRecurringInvoice.nextDueDate` + Index
- `prisma/schema.prisma:819,836` — `CrmTask.dueAt`
- `prisma/schema.prisma:1534,1537` — `ReminderItem.dueDate, daysOverdue`
- `prisma/schema.prisma:5585,5603` — `WhSupplierInvoice.dueDate`
- `prisma/schema.prisma:6135` — `InboundInvoice.dueDate`
- `prisma/schema.prisma:6271,6283` — `InboundInvoiceApproval.dueAt`
- `prisma/schema.prisma:4178,4189` — `ExportTemplateSchedule.nextRunAt`
- `prisma/schema.prisma:3664` — `EmployeeProbationReminder.probationEndDate`
- `src/lib/services/billing-recurring-invoice-service.ts:29-48` — `calculateNextDueDate`
- `src/lib/services/billing-recurring-invoice-service.ts:63` — `calculateServicePeriod`
- `src/lib/services/billing-recurring-invoice-repository.ts:155,170` — `findDue`
- `src/lib/services/billing-payment-service.ts:45,55` — `computeDueDate`, `isOverdue`
- `src/lib/services/probation-repository.ts:142-158` — `make_interval` SQL
- `src/lib/services/reminder-eligibility-service.ts:188-189` — `daysOverdue`
- `src/lib/services/dsgvo-retention-service.ts:240` — date-fns `subMonths`
- `vercel.json` — alle Cron-Schedules
- `src/app/api/cron/recurring-invoices/route.ts` — täglich 04:00 UTC
- `src/app/api/cron/platform-subscription-autofinalize/route.ts` — täglich 04:15 UTC
- `src/app/api/cron/inbound-invoice-escalations/route.ts` — stündlich
- `src/app/api/cron/probation-reminders/route.ts` — täglich 05:15 UTC
- `src/app/api/cron/expire-demo-tenants/route.ts` — täglich 01:00 UTC
- `src/components/billing/payment-status-badge.tsx:29-31` — overdue badge
- `src/components/billing/open-item-list.tsx:109,179` — `bg-red-50` row
- `src/components/invoices/inbound-pending-approvals.tsx:69,93-99` — overdue inline check
- `src/components/warehouse/supplier-invoice-list.tsx:186,223` — `text-destructive`
- `src/components/billing/dunning/dunning-proposal-tab.tsx:360` — daysOverdue column
- `src/components/dashboard/probation-dashboard-widget.tsx` — uniform styling

### Block 3 — Detailseite & Dashboard
- `src/app/[locale]/(dashboard)/serviceobjects/[id]/page.tsx:28,38,97-98,100-105,108-111` — 4 Tabs, controlled, cross-tab-interaction
- `src/app/[locale]/(dashboard)/serviceobjects/page.tsx` — Liste (React-State Filter)
- `src/app/[locale]/(dashboard)/admin/orders/page.tsx:42,57-62,77-96,163` — Orders-Tabs + client-side Filter
- `src/app/[locale]/(dashboard)/crm/inquiries/page.tsx` — Wrapper → `InquiryList`
- `src/components/crm/inquiry-list.tsx:48-58` — React-State Filter, server-side Query
- `src/app/[locale]/(dashboard)/orders/recurring/page.tsx` — Wrapper → `RecurringList`
- `src/components/billing/recurring-list.tsx:41-66,74` — server-side Filter, Generate-Button
- `src/components/layout/sidebar/sidebar-nav-config.ts:67-80,97-106,384-423` — NavItem-Interface, CRM-Sektion
- `src/app/[locale]/(dashboard)/dashboard/page.tsx:39,45-50,53,75-80` — Dashboard-Widgets
- `src/components/dashboard/hours-this-week-card.tsx:36-45,134-138` — Progress-Bar-Farben
- `src/components/dashboard/pending-actions.tsx:46-86,142-145,153-168` — Error/Warning Icons + Links
- `src/components/hr/personnel-file-dashboard-widget.tsx:17-18,37-60` — Reminder + Expiring Counts
- `src/components/dashboard/probation-dashboard-widget.tsx:18,49,55,65-67,83` — `ProbationDashboard`

### Block 4 — Activity
- `prisma/schema.prisma:2437-2456` — Activity-Model
- `prisma/schema.prisma:2050,2164` — `Employee.defaultActivityId`
- `prisma/schema.prisma:5239-5268` — `OrderBooking` (activityId Z. 5244)
- `src/lib/services/activity-service.ts:220-226` — Deletion-Guard
- `src/lib/services/activity-repository.ts` — incl. `countEmployees`
- `src/trpc/routers/activities.ts` — alle Procedures mit `activities.manage`
- `src/trpc/routers/orderBookings.ts:101-104,380-399` — Activity-Validation
- `src/components/orders/order-booking-form-sheet.tsx:81,105-122,145-152,196-216` — Activity-Select
- `src/lib/services/daily-calc.ts:990-1010` — auto-Booking Flow
- `src/lib/services/daily-calc.context.ts:195-200` — loadsdefaultActivityId
- `supabase/seed.sql:1378-1384` — Dev-Seed 4 Activities

### Block 5 — Employee-Zuweisung
- `prisma/schema.prisma:2514-2537` — OrderAssignment
- `prisma/schema.prisma:1211,1226` — `BillingServiceCase.assignedToId`
- `prisma/schema.prisma:1907,1916` — `Department.managerEmployeeId`
- `prisma/schema.prisma:1940,1948` — `Team.leaderEmployeeId`
- `prisma/schema.prisma:2049,2163` — `Employee.defaultOrderId`
- `prisma/schema.prisma:53` — `User.employeeId` SetNull
- `prisma/schema.prisma:4506` — `RawTerminalBooking.employeeId` SetNull
- `src/trpc/routers/orderAssignments.ts:62-68,220-237` — Input-Schema, create
- `src/lib/services/order-assignment-service.ts:37-39,83-130,103` — parseDate, create, hardcoded isActive
- `src/lib/services/order-assignment-repository.ts:77-90` — `prisma.orderAssignment.create`

### Block 6 — Permissions & Tenant-Procedure
- `src/lib/auth/permission-catalog.ts:12,31` — Namespace-UUID, `p()`-Helper
- `src/lib/auth/permission-catalog.ts:151-164` — `orders.*`, `activities.manage`
- `src/lib/auth/permission-catalog.ts:233-255` — `crm_*.*`
- `src/lib/auth/permission-catalog.ts:257-260` — `service_objects.*`
- `src/lib/auth/permission-catalog.ts:287` — `billing_recurring.generate`
- `src/lib/auth/permission-catalog.ts:329` — `wh_corrections.run`
- `src/lib/auth/permission-catalog.ts:357` — `dsgvo.execute`
- `src/lib/auth/permission-catalog.ts:413` — `export_template.execute`
- `supabase/migrations/20260325120000_add_module_permissions_to_groups.sql` — Default-Gruppen
- `supabase/migrations/20260404100000_add_crm_attachment_permissions_to_groups.sql`
- `src/lib/auth/permissions.ts:26,56,73,99` — `resolvePermissions`, `isUserAdmin`, `hasPermission`, `hasAnyPermission`
- `src/trpc/init.ts:122-127,323,329,354-382` — Context-Build, publicProcedure, protectedProcedure, tenantProcedure
- `src/lib/modules/index.ts:25,48,70,84` — `getEnabledModules`, `hasModule`, `requireModule`
- `src/trpc/routers/serviceObjects.ts:27` — `serviceObjectProcedure`
- `src/trpc/routers/crm/addresses.ts:17` — `crmProcedure`
- `src/trpc/routers/billing/recurringInvoices.ts:16,201-228` — `billingProcedure`, Generate-Gated
- `src/lib/auth/middleware.ts:40` — `requirePermission`

### Block 7 — Audit & Soft-Delete
- `src/lib/services/audit-logs-service.ts:17,23,109,173,187-205,222` — Tx, Context, Compute-Changes, log, Dual-Audit, logBulk
- `src/lib/services/crm-address-service.ts:238,243` — createdById Param, action strings
- `src/lib/services/order-service.ts:155,327-328` — audit "create", hard deleteById
- `src/lib/services/billing-document-service.ts:339,347,1016,1153` — createdById, actions, entityType, Position-Delete
- `src/lib/services/service-object-service.ts:430,438-439,698,726,744-766` — createdById Fallback, snake_case entityType, conditional remove
- `src/lib/services/crm-address-repository.ts:127-132,143` — softDelete, hardDelete
- `src/lib/services/employees-service.ts:1108-1111` — `deactivate` via update
- `src/lib/services/reminder-template-service.ts:112` — hard delete
- `src/lib/services/wh-purchase-order-service.ts:284` — softDeleteById
- `prisma/schema.prisma:40,41` — User `isActive`, `deletedAt`
- `prisma/schema.prisma:2012,2015` — Employee `isActive`, `deletedAt`
- `prisma/schema.prisma:507` — `CrmAddress.parentAddress` SetNull
- `prisma/schema.prisma:960-961,990-991` — ServiceObject self-parent SetNull, Attachment Cascade
- `prisma/schema.prisma:1123,1389,1544-1545` — Position, PriceListEntry, ReminderItem
- `prisma/schema.prisma:2527-2529` — OrderAssignment Cascade chain

### Block 8 — UI-Patterns
- `src/components/billing/dunning/dunning-reminder-detail-sheet.tsx:97,117-126,371-377,423` — Send-Button-Flow
- `src/components/billing/recurring-list.tsx:55-66,74` — Generate-All-Due
- `src/hooks/use-billing-recurring.ts:118-129` — Invalidation 3 Keys
- `src/components/billing/recurring-generate-dialog.tsx:43-56` — Per-Row Generate
- `src/components/billing/document-detail.tsx:133-137` — Finalize-Button
- `src/components/billing/document-print-dialog.tsx:51,108-150` — Finalize-Dialog
- `src/app/platform/(authed)/tenants/demo/page.tsx:184-188,303-310,381-410,791-855,877-1029` — Demo-Row Actions
- `src/app/[locale]/(dashboard)/admin/employees/page.tsx:46,58-60,102-104` — URL-Read-Only
- `src/app/[locale]/(dashboard)/admin/evaluations/page.tsx:66-70,107-122` — URL bidirectional sync
- `src/app/[locale]/(dashboard)/admin/audit-logs/page.tsx:42-95` — URL bidirectional sync
- `src/app/[locale]/(dashboard)/serviceobjects/[id]/page.tsx:84,265-293` — ServiceObjectFormSheet-Pattern
- `src/components/serviceobjects/service-object-form-sheet.tsx` — Side-Sheet
- `src/hooks/use-service-objects.ts:110-113,147-157` — Invalidation
- `src/app/[locale]/(dashboard)/crm/addresses/[id]/page.tsx:25-27,61-68` — Dialog imports + State
- `src/app/[locale]/(dashboard)/admin/orders/[id]/page.tsx:253,284,381-387,~399` — Assignment (Dialog) + Booking (Sheet)

### Block 9 — i18n
- `messages/de.json:8799-8837` — `serviceObjects`-Namespace
- `messages/de.json:4934-4938` — `adminOrders` Status
- `messages/de.json:5588-5590` — `crmAddresses` AddressType
- `messages/de.json:6456-6461` — `warehouseStockMovements` Types
- `messages/de.json:6483-6487` — `warehouseWithdrawals` ReferenceType
- `messages/de.json:6637-6643` — `billingDocuments` DocType
- `messages/de.json:133` — `nav.schedules` flat label
- `messages/de.json:5072` — `adminSchedules` top-level Namespace
- `src/components/warehouse/stock-movement-list.tsx:26-32,51` — Pattern A für WhStockMovementType
- `src/components/warehouse/article-movements-tab.tsx:26-32` — duplicated
- `src/components/warehouse/withdrawal-terminal.tsx:60-96,109` — ReferenceType config
- `src/components/billing/document-editor.tsx:78-86` — BillingDocumentType map
- `src/components/crm/address-data-table.tsx:113-116` — Inline-Ternary CrmAddressType
- `src/components/orders/order-status-badge.tsx:14-34,40` — OrderStatus config
- `src/components/serviceobjects/labels.ts:1-51` — Pattern B hardcoded labels

### Block 10 — Tests
- `src/lib/services/__tests__/probation-service.test.ts:1-127` — Pattern 1
- `src/lib/services/__tests__/reminder-eligibility-service.test.ts:1-120+` — Pattern 2
- `src/lib/services/__tests__/billing-recurring-invoice-service.test.ts:83-173` — Pattern 3
- `src/trpc/routers/__tests__/orders-router.test.ts:26-75` — mock Prisma
- `src/lib/services/__tests__/billing-service-case-service.test.ts:92-132` — `$transaction`-mock
- `vitest.config.ts:1-19` — includes, dotenv
- `src/e2e-browser/30-billing-documents.spec.ts:14-48,225-240,339-352` — forward chain
- `src/e2e-browser/34-billing-recurring.spec.ts:132-208` — generate recurring
- `src/e2e-browser/helpers/nav.ts:5,24` — helpers
- `src/e2e-browser/helpers/auth.ts` — `loginAsAdmin`
- `playwright.config.ts:28-36` — `admin-tests` project

## Architecture Documentation

### Pattern 1: Template → Generated-Entity (Recurring Invoices)

Das kanonische "Create from Template"-Muster in Terp besteht aus:

1. **Template-Entity** mit `nextDueDate`-Feld + Index `[tenantId, nextDueDate]`
2. **Repository.findDue(prisma, today)**-Query mit `nextDueDate: { lte: today } AND isActive=true AND autoGenerate=true`
3. **Service.generate(prisma, tenantId, templateId, userId)** innerhalb `$transaction`:
   - Numbering via `numberSeqService.getNextNumber`
   - `repo.create` der Ziel-Entity
   - `repo.createManyPositions` bei Positionen
   - `recalculateTotals` wenn monetär
   - `calculateNextDueDate(current, interval)` + `repo.update` des Templates
4. **Service.generateDue(prisma, today, checkpoint)** iteriert alle Due-Templates, per-template try/catch, checkpoint-skip
5. **Cron-Route** unter `/api/cron/<name>/route.ts` mit `Authorization: Bearer ${CRON_SECRET}`, ruft `generateDue`
6. **Manuelle Trigger-Procedure** `<namespace>.generate` mit `{ id: uuid }`-Input und eigener `.generate`-Permission

### Pattern 2: tRPC-Procedure-Factory für Modul

Jeder Modul-Router deklariert File-local:
```ts
const <module>Procedure = tenantProcedure.use(requireModule("<module>"))
```
- `tenantProcedure` prüft Tenant-Zugriff (in-memory `userTenants`-Scan)
- `requireModule` prüft `TenantModule`-Row (1 SELECT pro Procedure)
- Procedure addiert `requirePermission(<key>)` pro Action

### Pattern 3: Service + Repository mit Audit

Jeder CRUD-Service folgt:
```
Router (tenantProcedure + requirePermission) 
  → Service (business logic, $transaction when needed, parseInput/validate)
    → Repository (Prisma calls)
  → auditLog.log (fire-and-forget)
```
- Action-Strings: bare verbs (`"create"`, `"update"`, `"delete"`)
- `entityType`: snake_case Table-Name
- `createdById` auf Entity separat von Audit-Log

### Pattern 4: Controlled Tabs (post-T-2)

```tsx
type TabValue = '...' | '...'
const [activeTab, setActiveTab] = React.useState<TabValue>('overview')
<Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabValue)}>
```
Allows programmatic cross-tab-navigation (e.g. `onViewHistory={() => setActiveTab('history')}`).

### Pattern 5: Enum-Übersetzung (Pattern A)

```tsx
const TYPE_KEYS: Record<EnumType, string> = {
  VALUE_A: 'typeValueA',
  VALUE_B: 'typeValueB',
}
const t = useTranslations('<namespace>')
t(TYPE_KEYS[value])
```
Plus Messages-JSON-Keys `typeValueA`, `typeValueB` im Namespace.

### Pattern 6: Action-in-Row mit optimistic feedback

```tsx
const mutation = useSomething()
<Button onClick={handleAction} disabled={mutation.isPending}>...</Button>
// Inside handler:
try {
  await mutation.mutateAsync(input)
  toast.success(t('success'))
} catch {
  toast.error(t('error'))
}
// Invalidation in hook: qc.invalidateQueries({ queryKey: trpc.X.Y.queryKey() })
```

### Pattern 7: Self-Parent Tree (SetNull Strategy)

Sowohl `ServiceObject` als auch `CrmAddress` nutzen:
```prisma
parent SelfModel? @relation("<Name>Tree", fields: [parentId], references: [id], onDelete: SetNull)
```
Parent-Delete orphans Children (parentId=null), kein Cascade-Delete der Subtree.

### Pattern 8: Conditional Delete

`service-object-service.ts:744-766` demonstriert:
- Check `_count: { children, attachments, orders, stockMovements }` (via findById)
- Wenn any > 0: soft-delete (`isActive=false`)
- Wenn all 0: hard-delete (`prisma.X.delete`)

## Historical Context (from thoughts/)

### T-1 & T-2 — Unmittelbare Vorgänger

- `thoughts/shared/research/2026-04-20-serviceobjekte-codebase-analyse.md` — IST-Zustand für T-1: impliziete Object-References, Prisma-Schema, Multi-Tenancy, Attachments, QR-Codes, Platform-Isolation, Vokabel-Audit. **Primärer Kontext** — etabliert `ServiceObject` Parent-Modell.

- `thoughts/shared/research/2026-04-21-serviceobjekte-historie-codebase-analyse.md` — IST-Zustand für T-2: 3 Tabs → 4 Tabs, Order-Schema, OrderBooking, WhStockMovement, CrmAddress-Detail, Aggregat-Patterns. **Unmittelbarer Vorgänger** — T-3 baut auf dieser Datenstruktur auf.

- `thoughts/shared/plans/2026-04-21-serviceobjekte-stammdaten.md` — Implementierungsplan T-1: ServiceObject-Prisma-Modell, Kind-Specific-Fields, Hierarchy, Status-Workflow, CSV-Import.

- `thoughts/shared/plans/2026-04-21-serviceobjekte-historie.md` — Implementierungsplan T-2: `order-booking-aggregator.ts`, `user-display-name-service.ts`, Merged Timeline.

### Strukturanalog: ORD_05 Wiederkehrende Rechnungen

- `thoughts/shared/plans/2026-03-18-ORD_05-wiederkehrende-rechnungen.md` — **Primärer Cron-Pattern-Reference**: `BillingRecurringInvoice` mit `next_due_date` + `auto_generate`, Cron-Route, Generation-Service-Logic.

- `thoughts/shared/research/2026-03-18-ORD_05-wiederkehrende-rechnungen.md` — Research vor ORD_05: alle Billing-Modelle, Doc-Flow, Total-Calc, Numbering.

- `thoughts/shared/tickets/orgAuftrag/TICKET_ORD_05_WIEDERKEHRENDE_RECHNUNGEN.md` — Ticket-Spec ORD_05: `BillingRecurringInvoice` mit `nextDueDate`, `interval`, `autoGenerate`, cron-triggered generation. **Strukturell analogster Präzedenzfall**.

### Strukturanalog: ORD_02 Service-Cases (auto-generierter Order-Typ)

- `thoughts/shared/plans/2026-03-17-ORD_02-kundendienst-service-cases.md` — Implementierungsplan `BillingServiceCase`: DB-Migration, Prisma-Schema, Permissions, Service+Repository. **Etabliert Create-Service-API** die "Auftragserzeugung aus Plan" nutzen würde.

- `thoughts/shared/research/2026-03-17-ORD_02-kundendienst-service-cases.md` — Research vor ORD_02: Service+Repository-Patterns, billing-router registration, NumberSequence-Usage.

- `thoughts/shared/tickets/orgAuftrag/TICKET_ORD_02_KUNDENDIENST.md` — Ticket-Spec ORD_02.

### Platform-Subscription-Billing

- `thoughts/shared/plans/2026-04-10-platform-subscription-billing.md` — Plan Phase 10a: Two-Cron-Sequence (generate 04:00, finalize 04:15), `[platform_subscription:<id>]`-Marker. **Cron-Slot-Inventory** für neue Cron-Additions.

- `thoughts/shared/research/2026-04-10-platform-subscription-billing.md` — Research vor Phase 10a: `BillingDocumentTemplate`, `BillingRecurringInvoice`, Cron-Infrastruktur, Platform-Modul-Struktur.

### TERP_HANDBUCH (User-Facing-Dokumentation)

- `docs/TERP_HANDBUCH.md` Section 12a (~Z. 5630) — Serviceobjekte-Stammdaten + "Praxisbeispiel: Ersten Wartungsrundgang protokollieren". **Kein** Section 12b für Wartungsintervalle — Feature ist undokumentiert. Existierende Framing: "jede Wartung lässt sich damit exakt einem Objekt zuordnen".

### Gesamt-Beobachtung

**Kein** bestehendes Dokument in `thoughts/` nennt `ServiceSchedule`, `Wartungsintervall` oder "Auftragserzeugung aus Plan" als Named-Concept. Feature ist genuinely new. Nächste strukturelle Analoga sind ORD_05 (`BillingRecurringInvoice` mit `nextDueDate` + Cron) und ORD_02 (`BillingServiceCase` als Order-Typ). T-1/T-2-Pläne etablieren Parent-Datenmodell, an dem ein Schedule anhängt.

## Related Research

- `thoughts/shared/research/2026-04-20-serviceobjekte-codebase-analyse.md` — T-1 IST-Zustand (Stammdaten)
- `thoughts/shared/research/2026-04-21-serviceobjekte-historie-codebase-analyse.md` — T-2 IST-Zustand (Einsatz-Historie)
- `thoughts/shared/research/2026-03-17-ORD_02-kundendienst-service-cases.md` — Service-Cases Codebase-Analyse
- `thoughts/shared/research/2026-03-18-ORD_05-wiederkehrende-rechnungen.md` — Recurring-Invoices Codebase-Analyse
- `thoughts/shared/research/2026-04-10-platform-subscription-billing.md` — Platform-Subscription-Cron-Infrastruktur

## Open Questions

1. **`generate`-Permission vs. Module-Check**: Existing `billing_recurring.generate` lebt neben `billing_recurring.manage` unter demselben `billing`-Modul-Check. Für `service_schedules` gibt es noch keine Default-Gruppe — weder `service_objects.*` noch würden neue `service_schedules.*` einer Gruppe zugewiesen sein (bis eine neue Migration beides zuweist). **Offen** für Implementierung: welchen System-Gruppen das neue Namespace zugewiesen wird.

2. **Cron-Slot**: Aktuell freie Slots sind z. B. 04:30-04:59 UTC (zwischen Platform-Autofinalize und vor anderen Jobs). Der Auftrag schreibt explizit: "KEIN Cron in diesem Ticket". Das Cron-Pattern steht dokumentiert, ist aber für T-3 (manueller 1-Klick-Button) nicht relevant.

3. **Activity-Wahl für auto-erzeugte Orders**: Der zu erzeugende Auftrag braucht einen `customer`-Freitext (aus ServiceObject-Kunde) und einen `code` (Quelle ungeklärt — User-Input? `numberSeqService` mit neuem Key `"maintenance_order"`? Ableitung aus ServiceObject-Nummer?). Activity ist auf `Order`-Level nicht vorhanden; nur auf `OrderBooking` (und dort optional). **Aktuell offen**: ob der "Auftrag aus Plan"-Flow eine Activity wählen muss oder kann.

4. **Employee-Default auf ServiceSchedule**: Kein `primaryTechnicianId` auf `ServiceObject` oder `CrmAddress` existiert. Der Plan-Vorschlag nennt `ServiceSchedule.responsibleEmployeeId` — das wäre neu und müsste als `SetNull`-FK nach Pattern `BillingServiceCase.assignedTo` oder `Team.leader` modelliert werden.

5. **T-3 Activity-Seed für Service-Tenants**: Default-Seeding seedet **keine** Activities; Pro-Di-ähnliche Tenants starten mit 0 Rows. Offen für Implementierung: ob T-3 ein Seed-Set `WARTUNG`, `REPARATUR`, `INSPEKTION` einführen soll oder ob das jeder Tenant manuell anlegt.

6. **URL-State für `/serviceobjects/schedules`**: Bestehende Filter-Pages sind 2:1 gesplittet zwischen "Read-only URL on Mount" (employees) und "Bidirectional sync" (evaluations, audit-logs). Offen: welches Pattern für die neue Route gewählt wird.

7. **`serviceObjects.schedules.*` vs. `serviceSchedules.*`-Namespace**: `serviceObjects` ist klein (28 Leaf-Keys, 3 Sub-Objects). **Kein** bestehender Module-Namespace nutzt nested `schedules`-Object — alle Analoga (`adminSchedules`) sind Top-Level. Offen für Implementierung.
