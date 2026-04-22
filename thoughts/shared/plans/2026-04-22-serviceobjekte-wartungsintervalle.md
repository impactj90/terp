---
date: 2026-04-22
planner: impactj90
branch: staging
repository: terp
ticket: T-3 (Serviceobjekte — Wartungsintervalle, Fälligkeiten, Auftragserzeugung)
research: thoughts/shared/research/2026-04-22-serviceobjekte-wartungsintervalle-codebase-analyse.md
predecessors:
  - thoughts/shared/plans/2026-04-21-serviceobjekte-stammdaten.md (T-1)
  - thoughts/shared/plans/2026-04-21-serviceobjekte-historie.md (T-2)
status: ready-for-implementation
last_updated: 2026-04-22
last_updated_by: impactj90
last_reviewer: impactj90
reviewed_by_claude_ai: 2026-04-22
last_updated_note: "Plan-Review-Nachbesserungen: Completion-Hook-Include-Dokumentation, recordCompletion console.warn, 5. Phase-C-Regression-Test, Performance-Annahmen + 100-Jahres-anchorDate-Validation"
tags: [plan, serviceobjekte, wartungsplan, service-schedule, orders, fälligkeiten, permissions, dashboard-widget, nextduedate]
---

# Serviceobjekte — Wartungsintervalle, Fälligkeiten, Auftragserzeugung (T-3) — Implementation Plan

## Overview

Einführung der zentralen Planungsschicht für mobile Service-Dienstleister
(Pro-Di & Co.): pro `ServiceObject` ein oder mehrere `ServiceSchedule`-
Zyklen mit strukturiertem Intervall-Typ (zeit-basiert ab letztem
Abschluss ODER kalender-fix), denormalisierter `nextDueAt`-Fälligkeit,
Überfällig/Bald-fällig-Klassifikation, 1-Klick-Workflow "Auftrag aus
Plan erzeugen" (manueller Trigger, **kein Cron**), globale
Dispatcher-Route `/serviceobjects/schedules`, neuer "Wartungsplan"-Tab
auf der Serviceobjekt-Detailseite, Dashboard-Widget mit Zählung
"überfällig / bald fällig".

**Primärer Anwendungsfall:** Disponent öffnet morgens das Dashboard,
sieht "3 Wartungen überfällig, 12 fällig in den nächsten 14 Tagen",
wechselt in die globale Schedules-Liste, klickt pro Zeile "Auftrag
erzeugen" — neuer Auftrag erscheint mit Code `WA-42`, Kunde aus
Serviceobjekt, Default-Technikerin vorbefüllt als `OrderAssignment`,
bereit für Zeitbuchung. Nach Completion des Auftrags rollt
`lastCompletedAt` + `nextDueAt` automatisch vorwärts.

## Current State Analysis

Research-Grundlage:
[`thoughts/shared/research/2026-04-22-serviceobjekte-wartungsintervalle-codebase-analyse.md`](../research/2026-04-22-serviceobjekte-wartungsintervalle-codebase-analyse.md),
sekundär die T-1/T-2-Research-Dokumente.

**Fälligkeits-Präzedenzfall (`BillingRecurringInvoice`)**:
- `nextDueDate DateTime @db.Timestamptz(6)` NOT NULL + Index
  `[tenantId, nextDueDate]` (`prisma/schema.prisma:1413,1441`).
- `calculateNextDueDate(current, interval)` nutzt native JS
  `new Date(current); next.setMonth(next.getMonth() + N)` /
  `setFullYear` (`billing-recurring-invoice-service.ts:29-48`) —
  **keine** `date-fns`-Dependency.
- `generate(...)` innerhalb `prisma.$transaction(...)`, ruft
  `numberSeqService.getNextNumber(tx as unknown as PrismaClient, tenantId, "invoice")`
  (`billing-recurring-invoice-service.ts:414`).
- Cron-Route `/api/cron/recurring-invoices` läuft 04:00 UTC und ruft
  `generateDue`; **T-3 braucht keinen Cron**.

**ServiceObject-Detailseite (post T-2)**:
- [`src/app/[locale]/(dashboard)/serviceobjects/[id]/page.tsx:28`](../../src/app/[locale]/(dashboard)/serviceobjects/[id]/page.tsx)
  hat `type TabValue = 'overview' | 'history' | 'tree' | 'attachments'`
  — 4 Tabs, fully controlled via `React.useState<TabValue>('overview')`
  (Z. 38, 96-98). Cross-Tab-Switch via
  `onViewHistory={() => setActiveTab('history')}` (Z. 108-111).
- Pattern ist bereit für 5. Tab "Wartungsplan" in der Reihenfolge
  `overview, history, schedule, tree, attachments`.

**`Order`-Model (post T-1/T-2)**:
- `Order.serviceObjectId` FK existiert seit T-1
  (`schema.prisma:2482`).
- `status` ist **String** (VarChar(20), default `"active"`),
  **kein** Prisma-Enum; DB-CHECK `status IN ('planned', 'active',
  'completed', 'cancelled')`.
- **Kein** `createdById`/`updatedById` auf `Order`
  (`schema.prisma:2467-2503` enthält diese Felder nicht).
- `Order` hat **kein** `activityId`-Feld — Activity lebt ausschließlich
  auf `OrderBooking.activityId`.
- `Order.customer` ist Freitext-String (nullable), keine FK zu
  `CrmAddress`. T-1-Hard-Rule: dieses Feld bleibt unverändert.

**`orderService.update` (`order-service.ts:173-313`) ist NICHT in
`$transaction`** — sequentielle `findById` → Validierung → `repo.update`
→ `auditLog.log` → Re-Fetch. Diese Beobachtung führt zu **Deviation
Note 1** (siehe unten).

**`numberSeqService.getNextNumber`** (`number-sequence-service.ts:89`):
atomarer `prisma.numberSequence.upsert` mit `increment: 1`,
Signatur `(prisma: PrismaClient, tenantId, key): Promise<string>`,
Return-Format `${prefix}${nextValue - 1}`. `DEFAULT_PREFIXES` (Z. 37-65)
enthält noch **keinen** Key für Wartungsaufträge.

**Permissions post-T-1**:
`service_objects.view/manage/delete` existieren in
`permission-catalog.ts:257-260`, sind aber **keinem** System-Group
zugewiesen — T-1-Migration hat die Permission-Tuples vergessen. T-3
nutzt dasselbe Migrations-Pattern wie
`20260325120000_add_module_permissions_to_groups.sql` (`INSERT ... ON
CONFLICT ... DO UPDATE SET` idempotent) und weist in **einer**
Migration sowohl die fehlenden `service_objects.*`-Permissions UND
die neuen `service_schedules.*`-Permissions den Default-Gruppen zu
(Dual-Purpose).

**Activity-Seed fehlt**:
Production-Tenants starten mit **null** Activity-Rows
(`seedUniversalDefaults` seedet keine Activities). Pro-Di-ähnliche
Tenants brauchen mindestens `WARTUNG, REPARATUR, INSPEKTION,
STÖRUNG` als Activity-Seed für die Zeitbuchung auf
Plan-erzeugten Aufträgen. T-3 liefert einen optionalen
Seed-Helper, der **nicht** automatisch von `seedUniversalDefaults`
aufgerufen wird.

**UI-Patterns**:
- "Action-in-Row" Präzedenz: `src/components/billing/recurring-list.tsx:55-74`
  (`useGenerateDueRecurringInvoices` → `disabled={mutation.isPending}`
  → `toast.success` → Hook invalidiert 3 Query-Keys).
- Dashboard-Widget-Präzedenz: `src/components/dashboard/probation-dashboard-widget.tsx`
  — Card-Layout, **kein** interner `hasPermission`-Guard, Gating
  im Dashboard-Page selbst (`dashboard/page.tsx:75-80`).
- Filter-in-URL Pattern A "Read-only on Mount":
  `admin/employees/page.tsx:58-60,102-104` — lazy `useState` +
  `useEffect` für Back/Forward-Sync, **kein** Write-Back-Sync.

**i18n**:
- Bestehender `serviceObjects`-Namespace (`messages/de.json:8799-8837`)
  ist klein (28 Leaf-Keys, Sub-Objects `tabs`, `history`, `lastService`).
- **Kein** bestehender Namespace nutzt nested `schedules`-Object
  (`nav.schedules` und `adminSchedules` sind Top-Level). T-3 etabliert
  neuen Top-Level-Namespace `serviceSchedules`.

## Desired End State

Nach Abschluss existiert das Wartungsplan-Modul vollständig:

### Datenbank
- Neue Tabelle `service_schedules` (+ Enums
  `service_schedule_interval_type`, `service_schedule_interval_unit`)
  mit CHECK-Constraints für Anchor-Date/Type-Kongruenz und
  positive Intervall-Werte.
- Neue nullable Spalte `orders.service_schedule_id` (FK → `service_schedules`,
  `ON DELETE SET NULL`) + Index `[tenant_id, service_schedule_id]`.
- Neuer Default-Prefix `"maintenance_order": "WA-"` in
  `number-sequence-service.ts:DEFAULT_PREFIXES`.
- Migration, die gleichzeitig:
  - T-1-Permissions `service_objects.view/manage/delete` an PERSONAL,
    VERTRIEB, VORGESETZTER, MITARBEITER (siehe Permission-Catalog
    Tabelle unten) zuweist UND
  - T-3-Permissions `service_schedules.view/manage/delete/generate_order`
    denselben Gruppen zuweist.
- Optionaler Activity-Seed-Helper
  `src/lib/tenant-templates/seed-service-activities.ts` — **nicht**
  auto-invoked.

### Services
- `src/lib/services/service-schedule-date-utils.ts` — Pure Functions
  `calculateNextDueAt`, `calculateDaysUntilDue` (ohne Prisma-Dependency,
  testbar in Isolation).
- `src/lib/services/service-schedule-repository.ts` — CRUD-Wrapper
  um `prisma.serviceSchedule.*`.
- `src/lib/services/service-schedule-service.ts` — Business-Logic
  mit `list`, `getById`, `listByServiceObject`, `create`, `update`,
  `remove`, `generateOrder`, `recordCompletion`, `getDashboardSummary`
  sowie der Status-Derivierungsfunktion `deriveStatus`.
- `src/lib/services/order-service.ts` erweitert um Completion-Hook:
  wenn Status auf `"completed"` wechselt AND `serviceScheduleId`
  nicht null ist, wird nach erfolgreichem Order-Update sequentiell
  `serviceScheduleService.recordCompletion(...)` mit try/catch aufgerufen
  (Deviation Note 1).

### tRPC
- `src/trpc/routers/serviceSchedules.ts` mit 8 Procedures: `list`,
  `getById`, `listByServiceObject`, `create`, `update`, `delete`,
  `generateOrder`, `getDashboardSummary`.
- Registriert in `src/trpc/routers/_app.ts` als `serviceSchedules`.

### UI
- Route `/serviceobjects/schedules` (globale Liste mit Tab-Toggle
  Alle/Überfällig/Bald fällig/OK + Filter read-only aus URL).
- Neuer 3. Tab "Wartungsplan" auf ServiceObject-Detailseite in der
  Reihenfolge `overview → history → schedule → tree → attachments`.
- Dashboard-Widget `UpcomingMaintenancesWidget` (Count "X überfällig,
  Y bald fällig", Link zur gefilterten Liste), conditional sichtbar
  wenn User `service_schedules.view` hat.
- Sidebar-Nav-Eintrag "Wartungspläne" unter CRM-Sektion nach
  "crmServiceObjects".
- Neue Hooks in `src/hooks/use-service-schedules.ts`.
- Neuer i18n-Namespace `serviceSchedules` (de + en) — Top-Level.

### Tests
- Unit-Tests für `service-schedule-date-utils`, `service-schedule-service`.
- Integration-Test mit echter DB (HAS_DB-Guard).
- Router-Test für `serviceSchedules`-tRPC.
- E2E-Spec `83-service-object-schedules.spec.ts` mit 5 Flows.

### Handbuch
- Neuer Abschnitt 12b "Wartungspläne" in `docs/TERP_HANDBUCH.md` mit
  4 Praxisbeispielen.

### Verification (manual)
- `pnpm typecheck`, `pnpm lint`, `pnpm build` alle grün.
- `pnpm test` (unit + integration) grün.
- `pnpm playwright test src/e2e-browser/83-service-object-schedules.spec.ts` grün.
- `pnpm db:reset` läuft fehlerfrei durch; Prisma-Studio zeigt neue
  Tabelle + FK auf `orders`.
- Manueller Rundgang: Widget → Liste → Tab → Create → Generate-Order
  → Assignment sichtbar → Order-Complete → Fälligkeit rollt.

## What We're NOT Doing (scope out)

Entspricht dem Ticket; wird hier identisch gespiegelt, damit der Plan
self-contained ist.

- **Automatischer Cron-Job** zum Auto-Generate. Manueller 1-Klick-
  Trigger ist der einzige Pfad in T-3. Cron folgt in späterem Ticket
  mit Monitoring + Alerting.
- Nutzungsbasiertes Intervall (Betriebsstunden, Meterstände).
- Bedingungsbasiertes Intervall (Messwerte, Predictive Maintenance).
- Kombinationen mehrerer Intervall-Typen.
- Separate `MaintenanceEvent`-Entität — Plan ↔ durchgeführter Auftrag
  läuft über `Order.status="completed"` + `Order.serviceScheduleId`.
- Strukturierte Befund-Erfassung (DIN 31051 Kategorien).
- Zählerstände (`MeterReading`-Entity).
- Mobile-First-Redesign der Detailseite.
- Multi-Step-Wizard für Schedule-Creation (Single-Page-Form reicht).
- Schedule-Templates (z. B. "DGUV V3 Standard-Intervall" vordefiniert).
- Eskalations-Notifikationen (E-Mail bei Überfälligkeit).
- Kunden-Portal-Sicht auf Schedules.
- Wiederholung eines bereits erzeugten Auftrags.
- Stornierung eines Auftrags + "Plan-Fälligkeit zurückdrehen".
- Defaulting der `defaultActivityId` in OrderBooking-Form beim
  Booking auf Plan-Auftrag (folgt in separatem UX-Ticket).
- Batch-Generate "alle überfälligen Aufträge auf einmal".
- Schedule-Pausieren ohne Löschen (`isActive`-Toggle reicht).
- Verschiedene Rollen beim `createInitialAssignment` (immer
  `"worker"`).
- Branchen-spezifische Profil-Presets.

## Implementation Approach

6 Phasen mit PAUSE nach jeder Phase (Commit + Rücksprache falls
gewünscht). Keine neue Route wird freigeschaltet, bevor der Service-
Layer grün ist; keine Completion-Hook, bevor `recordCompletion`
getestet ist.

**Strategie:**

1. **Phase A — Schema + Migration + Permissions (+ Seed-Helper):**
   erzeugt alle DB-Artefakte, Permissions und den optionalen
   Activity-Seed-Helper. Endzustand: Prisma-Client regeneriert,
   `pnpm db:reset` grün.
2. **Phase B — Service-Layer + Date-Utils:** Pure-Function-Utils
   zuerst (schnellste Iteration, grünste Tests), dann Repository,
   dann Service. Integration-Test beweist End-to-End-Pfad
   (Create → Generate-Order → Complete → Fälligkeit rollt).
3. **Phase C — Order-Service-Completion-Hook:** kleinster
   Einschub in `order-service.update` mit try/catch und Regression-
   Test, dass Non-Plan-Orders unverändert durchlaufen.
4. **Phase D — tRPC-Router:** 8 Procedures + `_app.ts`-Registration.
5. **Phase E — UI:** Hooks, Components, Route, Detail-Tab, Widget,
   Sidebar, i18n. In dieser Reihenfolge, damit jede Schicht auf die
   vorige aufsetzt.
6. **Phase F — E2E + Handbuch:** 5-Flow-Spec + 4 Praxisbeispiele im
   Handbuch.

## Data Model

### Prisma-Schema: neue `ServiceSchedule`-Entität

Datei: `prisma/schema.prisma` (direkt nach dem bestehenden
`ServiceObjectAttachment`-Model, also im ServiceObject-Bereich um
Zeile ~1000 — konkret platziert zwischen `ServiceObjectAttachment`
und dem nachfolgenden Model).

```prisma
model ServiceSchedule {
  id                    String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId              String   @db.Uuid @map("tenant_id")
  serviceObjectId       String   @db.Uuid @map("service_object_id")

  // Identifikation
  name                  String   @db.VarChar(255)
  description           String?  @db.Text

  // Intervall-Konfiguration
  intervalType          ServiceScheduleIntervalType @map("interval_type")
  intervalValue         Int      @map("interval_value")
  intervalUnit          ServiceScheduleIntervalUnit @map("interval_unit")
  anchorDate            DateTime? @db.Date @map("anchor_date")

  // Soll-Werte für den erzeugten Auftrag
  defaultActivityId     String?  @db.Uuid @map("default_activity_id")
  responsibleEmployeeId String?  @db.Uuid @map("responsible_employee_id")
  estimatedHours        Decimal? @db.Decimal(6, 2) @map("estimated_hours")

  // Fälligkeit (denormalisiert)
  lastCompletedAt       DateTime? @db.Timestamptz(6) @map("last_completed_at")
  nextDueAt             DateTime? @db.Timestamptz(6) @map("next_due_at")
  leadTimeDays          Int      @default(14) @map("lead_time_days")

  // Lifecycle
  isActive              Boolean  @default(true) @map("is_active")
  createdAt             DateTime @default(now()) @db.Timestamptz(6) @map("created_at")
  updatedAt             DateTime @default(now()) @db.Timestamptz(6) @map("updated_at")
  createdById           String?  @db.Uuid @map("created_by_id")
  updatedById           String?  @db.Uuid @map("updated_by_id")

  // Relations
  tenant                Tenant        @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  serviceObject         ServiceObject @relation(fields: [serviceObjectId], references: [id], onDelete: Cascade)
  defaultActivity       Activity?     @relation(fields: [defaultActivityId], references: [id], onDelete: SetNull)
  responsibleEmployee   Employee?     @relation("ServiceScheduleResponsible", fields: [responsibleEmployeeId], references: [id], onDelete: SetNull)
  generatedOrders       Order[]       @relation("ServiceScheduleOrders")

  @@index([tenantId])
  @@index([tenantId, serviceObjectId])
  @@index([tenantId, nextDueAt])
  @@index([tenantId, isActive])
  @@map("service_schedules")
}

enum ServiceScheduleIntervalType {
  TIME_BASED
  CALENDAR_FIXED

  @@map("service_schedule_interval_type")
}

enum ServiceScheduleIntervalUnit {
  DAYS
  MONTHS
  YEARS

  @@map("service_schedule_interval_unit")
}
```

### Prisma-Schema: Erweiterung `Order`

```prisma
model Order {
  // ... bestehende Felder
  serviceScheduleId   String?           @db.Uuid @map("service_schedule_id")
  serviceSchedule     ServiceSchedule?  @relation("ServiceScheduleOrders", fields: [serviceScheduleId], references: [id], onDelete: SetNull)

  // ... bestehende Indexe
  @@index([tenantId, serviceScheduleId])
}
```

### Prisma-Schema: Inverse-Relationen

`Employee`-Model (bei den bestehenden Team/Department-Relations,
um Zeile 2164-2167):
```prisma
responsibleForSchedules ServiceSchedule[] @relation("ServiceScheduleResponsible")
```

`Activity`-Model (nach `orderBookings`, um Zeile 2450):
```prisma
defaultForSchedules ServiceSchedule[]
```

`ServiceObject`-Model (nach `stockMovements`, um Zeile 966):
```prisma
schedules ServiceSchedule[]
```

`Tenant`-Model hat bereits alle ServiceSchedule-Relationen implizit
(über Child-Relations keine Zusatzpflege nötig — Tenant-Side ist nur
durch den FK auf `tenantId` materialisiert, der `Cascade` schreibt).

### Migration 1 — `20260505000000_create_service_schedules.sql`

Nach dem letzten T-1-Migration-File `20260504000006_*.sql`; neue
Sequence-Datum startet 20260505.

```sql
-- Plan: 2026-04-22-serviceobjekte-wartungsintervalle.md
-- Phase A: service_schedules table with CHECK constraints.

CREATE TYPE service_schedule_interval_type AS ENUM ('TIME_BASED', 'CALENDAR_FIXED');
CREATE TYPE service_schedule_interval_unit AS ENUM ('DAYS', 'MONTHS', 'YEARS');

CREATE TABLE service_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    service_object_id UUID NOT NULL REFERENCES service_objects(id) ON DELETE CASCADE,

    name VARCHAR(255) NOT NULL,
    description TEXT,

    interval_type service_schedule_interval_type NOT NULL,
    interval_value INT NOT NULL,
    interval_unit service_schedule_interval_unit NOT NULL,
    anchor_date DATE,

    default_activity_id UUID REFERENCES activities(id) ON DELETE SET NULL,
    responsible_employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
    estimated_hours DECIMAL(6, 2),

    last_completed_at TIMESTAMPTZ,
    next_due_at TIMESTAMPTZ,
    lead_time_days INT NOT NULL DEFAULT 14,

    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by_id UUID,
    updated_by_id UUID,

    CONSTRAINT check_anchor_date_matches_type CHECK (
        (interval_type = 'CALENDAR_FIXED' AND anchor_date IS NOT NULL)
        OR (interval_type = 'TIME_BASED' AND anchor_date IS NULL)
    ),
    CONSTRAINT check_interval_value_positive CHECK (interval_value > 0),
    CONSTRAINT check_lead_time_days_non_negative CHECK (lead_time_days >= 0)
);

CREATE INDEX idx_service_schedules_tenant ON service_schedules(tenant_id);
CREATE INDEX idx_service_schedules_tenant_service_object
    ON service_schedules(tenant_id, service_object_id);
CREATE INDEX idx_service_schedules_tenant_next_due
    ON service_schedules(tenant_id, next_due_at);
CREATE INDEX idx_service_schedules_tenant_active
    ON service_schedules(tenant_id, is_active);

CREATE TRIGGER update_service_schedules_updated_at
    BEFORE UPDATE ON service_schedules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE service_schedules ENABLE ROW LEVEL SECURITY;
```

### Migration 2 — `20260505000001_add_service_schedule_fk_to_orders.sql`

```sql
-- Plan: 2026-04-22-serviceobjekte-wartungsintervalle.md
-- Phase A: nullable FK orders → service_schedules for plan traceability.

ALTER TABLE orders
    ADD COLUMN service_schedule_id UUID
        REFERENCES service_schedules(id) ON DELETE SET NULL;

CREATE INDEX idx_orders_tenant_service_schedule
    ON orders(tenant_id, service_schedule_id);
```

### Migration 3 — `20260505000002_service_objects_schedules_default_groups.sql`

**Dual-purpose**: T-1-Fix (service_objects.* an Gruppen) + T-3 (service_schedules.* an Gruppen).
Pattern: [`supabase/migrations/20260325120000_add_module_permissions_to_groups.sql`](../../../supabase/migrations/20260325120000_add_module_permissions_to_groups.sql).
Alle Permission-UUIDs sind **deterministische UUIDv5** — berechnet via
`permissionIdFor("<key>")` aus `permission-catalog.ts:24` mit Namespace
`f68a2ad7-6fd8-4d61-9b0e-0ea4a0d6c8a1`.

Die 7 konkreten UUIDs werden in Phase A zur Implementierungszeit aus
der TS-Datei extrahiert (e.g. via `node -e "console.log(require('./src/lib/auth/permission-catalog').permissionIdFor('service_schedules.view'))"`)
und hardcoded in die Migration geschrieben — exakt wie T-1's
`20260325120000_*.sql` alle 91 PERSONAL-UUIDs hardcoded enthält.

Zuweisungs-Matrix:

| Permission | PERSONAL | VERTRIEB | VORGESETZTER | MITARBEITER |
|------------|:--------:|:--------:|:------------:|:-----------:|
| `service_objects.view`               | ✓ | ✓ | ✓ | ✓ |
| `service_objects.manage`             | ✓ | ✓ |   |   |
| `service_objects.delete`             | ✓ |   |   |   |
| `service_schedules.view`             | ✓ | ✓ | ✓ | ✓ |
| `service_schedules.manage`           | ✓ | ✓ |   |   |
| `service_schedules.delete`           | ✓ |   |   |   |
| `service_schedules.generate_order`   | ✓ | ✓ |   |   |

Migration verwendet `INSERT ... ON CONFLICT DO UPDATE SET permissions =
... || jsonb_build_array(...)` Idempotenz-Pattern, dedupliziert mit
`jsonb_agg(DISTINCT x)`.

### Prisma-Regeneration

Nach Schema-Change: `pnpm prisma generate` (Output: `src/generated/prisma`),
dann `pnpm db:reset` für reinen lokalen State.

### Permission-Catalog-Erweiterung

Datei: `src/lib/auth/permission-catalog.ts`, **direkt nach Zeile 260**
(`service_objects.delete`-Eintrag):

```ts
// Service Schedules (Wartungspläne)
p("service_schedules.view",           "service_schedules", "view",           "Wartungspläne anzeigen"),
p("service_schedules.manage",         "service_schedules", "manage",         "Wartungspläne erstellen und bearbeiten"),
p("service_schedules.delete",         "service_schedules", "delete",         "Wartungspläne löschen"),
p("service_schedules.generate_order", "service_schedules", "generate_order", "Auftrag aus Wartungsplan erzeugen"),
```

### NumberSequence-Default-Prefix

Datei: `src/lib/services/number-sequence-service.ts` im
`DEFAULT_PREFIXES`-Map (Z. 37-65), neue Zeile **alphabetisch
einsortiert** direkt nach `"invoice"` oder am Ende:

```ts
maintenance_order: "WA-",
```

Verwendungs-Key in `generateOrder` ist **exakt** `"maintenance_order"`.

### Activity-Seed-Helper (optional, nicht auto-invoked)

Neue Datei: `src/lib/tenant-templates/seed-service-activities.ts`.

```ts
import type { PrismaClient } from "@/generated/prisma"
import type { Prisma } from "@/generated/prisma"

type Tx = PrismaClient | Prisma.TransactionClient

export async function seedServiceActivities(
  prisma: Tx,
  tenantId: string,
): Promise<void> {
  const activities = [
    { code: "WARTUNG",    name: "Wartung" },
    { code: "REPARATUR",  name: "Reparatur" },
    { code: "INSPEKTION", name: "Inspektion" },
    { code: "STÖRUNG",    name: "Störungsbehebung" },
  ] as const
  for (const a of activities) {
    await prisma.activity.upsert({
      where: { tenantId_code: { tenantId, code: a.code } },
      create: { ...a, tenantId, isActive: true },
      update: {},
    })
  }
}
```

Call-Site in Phase A: **keine**. Wird manuell für Pro-Di via Prisma-
Studio oder einmaligem Script aufgerufen (Folge-Ticket Branchen-
Profile integriert das).

## Service Layer

### `src/lib/services/service-schedule-date-utils.ts` (neu)

Pure Functions, keine Prisma-Dependency. Folgt Pattern 1 aus Research
§10.1 (`probation-service.test.ts`): `now` als Parameter, keine
Fake-Timer. Datums-Arithmetik nach Pattern 1 aus Research §2.3
(`billing-recurring-invoice-service.ts:29-48`) — native JS
`setMonth`/`setFullYear`/`setDate`, **kein** `date-fns`.

```ts
export type ServiceScheduleIntervalType = "TIME_BASED" | "CALENDAR_FIXED"
export type ServiceScheduleIntervalUnit  = "DAYS" | "MONTHS" | "YEARS"

export function addInterval(
  base: Date,
  value: number,
  unit: ServiceScheduleIntervalUnit,
): Date {
  const next = new Date(base)
  if (unit === "DAYS")   next.setDate(next.getDate() + value)
  if (unit === "MONTHS") next.setMonth(next.getMonth() + value)
  if (unit === "YEARS")  next.setFullYear(next.getFullYear() + value)
  return next
}

export function calculateNextDueAt(
  intervalType: ServiceScheduleIntervalType,
  intervalValue: number,
  intervalUnit: ServiceScheduleIntervalUnit,
  lastCompletedAt: Date | null,
  anchorDate: Date | null,
  now: Date,
): Date | null {
  if (intervalType === "TIME_BASED") {
    if (!lastCompletedAt) return null
    return addInterval(lastCompletedAt, intervalValue, intervalUnit)
  }
  // CALENDAR_FIXED
  if (!anchorDate) return null
  let candidate = new Date(anchorDate)
  // Advance past now
  while (candidate.getTime() <= now.getTime()) {
    candidate = addInterval(candidate, intervalValue, intervalUnit)
  }
  // Advance past lastCompletedAt if newer
  if (lastCompletedAt && candidate.getTime() <= lastCompletedAt.getTime()) {
    while (candidate.getTime() <= lastCompletedAt.getTime()) {
      candidate = addInterval(candidate, intervalValue, intervalUnit)
    }
  }
  return candidate
}

export function calculateDaysUntilDue(
  nextDueAt: Date | null,
  now: Date,
): number | null {
  if (!nextDueAt) return null
  const diffMs = nextDueAt.getTime() - now.getTime()
  return Math.floor(diffMs / 86_400_000)
}
```

**Semantik-Klarstellung:** Bei TIME_BASED mit `lastCompletedAt = null`
(Schedule noch nie ausgeführt) ist `nextDueAt = null`. Die UI rendert
"Noch nie ausgeführt". Der Status-Derivierer behandelt
`nextDueAt = null` als `"ok"`.

#### Performance-Annahmen

`calculateNextDueAt` wird **ausschließlich auf dem Write-Pfad**
aufgerufen, nicht auf Read-Queries:

- `create` — einmal pro Schedule-Neuanlage (TIME_BASED: kein
  `lastCompletedAt` → null; CALENDAR_FIXED: Loop startet bei
  `anchorDate`).
- `update` — einmal pro Schedule-Update, und nur wenn eines der
  Intervall-Felder (`intervalType`, `intervalValue`, `intervalUnit`,
  `anchorDate`) geändert wurde.
- `recordCompletion` — einmal pro abgeschlossenem Plan-Auftrag.

**Nicht** aufgerufen in `list`, `getById`, `listByServiceObject`,
`countByStatus`, `deriveStatus` — diese Read-Queries lesen den
persistierten `nextDueAt` direkt aus der DB.

**Iterations-Maximum der While-Loop** (nur CALENDAR_FIXED-Branch):

| intervalUnit | intervalValue=1, anchorDate 100 Jahre alt | realistisches Maximum |
|--------------|:-----------------------------------------:|:---------------------:|
| `YEARS`      | ~100 Iterationen                          | ~10                   |
| `MONTHS`     | ~1.200 Iterationen                        | ~120                  |
| `DAYS`       | ~36.500 Iterationen                       | ~3.650                |

Bei ~100 ns pro `setDate`+`getTime`-Iteration in V8 entspricht das
Worst-Case (DAYS, 100 Jahre alt, intervalValue=1) **~3-4 ms** pro
Service-Write-Call. Für einen Write-Pfad, der maximal einmal pro
Create/Update/Completion läuft, akzeptabel.

**Defense-in-Depth auf Input-Ebene**: Der Zod-`createScheduleInput`
enforced zusätzlich eine maximale `anchorDate`-Rückdatierung von
100 Jahren (siehe tRPC-Layer-Sektion). Das schützt vor bad data
und verhindert — gemeinsam mit DB-CHECK `interval_value > 0` und
Zod `z.number().int().min(1)` — pathologische Loops.

**Bewusst NICHT durch Math ersetzt**: Die While-Loop ist
kalender-korrekt bezüglich Schaltjahr- und Monatslängen-
Edge-Cases. Eine Math-basierte Division würde für
`intervalUnit="MONTHS"` mit Monatsende-Edges Fehler produzieren
(31.3. + 1 Monat ist in JS-Native `setMonth` → 01.05.,
nicht "30.4."). Die native-JS-Semantik zu dokumentieren ist
konsistent mit Research-Pattern 1 (Recurring-Invoice).

### `src/lib/services/service-schedule-repository.ts` (neu)

Folgt Pattern aus `service-object-repository.ts`: Thin Wrapper
um Prisma-Calls, alle Queries enthalten `tenantId`.

Exports:
```ts
export async function findMany(
  prisma: PrismaClient,
  tenantId: string,
  params?: {
    serviceObjectId?: string
    isActive?: boolean
    customerAddressId?: string
    page?: number
    pageSize?: number
  }
): Promise<{ items: ServiceScheduleWithIncludes[]; total: number }>

export async function findById(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
): Promise<ServiceScheduleWithIncludes | null>

export async function findManyByServiceObject(
  prisma: PrismaClient,
  tenantId: string,
  serviceObjectId: string,
): Promise<ServiceScheduleWithIncludes[]>

export async function countByStatus(
  prisma: PrismaClient,
  tenantId: string,
  now: Date,
): Promise<{ overdueCount: number; dueSoonCount: number; okCount: number }>

export async function create(
  prisma: Tx,
  data: ServiceScheduleCreateData,
): Promise<ServiceScheduleWithIncludes>

export async function update(
  prisma: Tx,
  tenantId: string,
  id: string,
  data: Prisma.ServiceScheduleUpdateInput,
): Promise<ServiceScheduleWithIncludes>

export async function deleteById(
  prisma: Tx,
  tenantId: string,
  id: string,
): Promise<void>
```

Standard-Includes:
```ts
const standardInclude = {
  serviceObject: {
    select: {
      id: true,
      number: true,
      name: true,
      kind: true,
      customerAddress: {
        select: { id: true, number: true, company: true }
      }
    }
  },
  defaultActivity: { select: { id: true, code: true, name: true } },
  responsibleEmployee: { select: { id: true, firstName: true, lastName: true } },
}
```

`countByStatus` ist **der** Call, den das Dashboard-Widget nutzt.
Läuft via drei parallele `prisma.serviceSchedule.count(...)`-Queries:

```ts
const [overdue, dueSoon, ok] = await Promise.all([
  prisma.serviceSchedule.count({
    where: {
      tenantId,
      isActive: true,
      nextDueAt: { lt: now },
    },
  }),
  prisma.serviceSchedule.count({
    where: {
      tenantId,
      isActive: true,
      nextDueAt: {
        gte: now,
        lte: addDays(now, LEAD_TIME_DAYS_DEFAULT), // siehe note unten
      },
    },
  }),
  prisma.serviceSchedule.count({
    where: {
      tenantId,
      isActive: true,
      OR: [
        { nextDueAt: null },
        { nextDueAt: { gt: addDays(now, LEAD_TIME_DAYS_DEFAULT) } },
      ],
    },
  }),
])
```

**Dashboard-Summary-Simplifikation:** Die Liste verwendet pro-Zeile
die individuelle `schedule.leadTimeDays`, aber das Dashboard-Widget
zählt "bald fällig" relativ zu `LEAD_TIME_DAYS_DEFAULT = 14`
(Konstante in `service-schedule-service.ts`). Das ist eine bewusste
Vereinfachung: der Widget-Count muss nicht pro-Zeile-lead-time-
korrekt sein (es ist ein Summary-Widget, kein Alert-System).

### `src/lib/services/service-schedule-service.ts` (neu)

Standard-Signatur-Convention: `(prisma, tenantId, ..., audit?)`.
Error-Classes folgen Pattern aus `service-object-service.ts`:

```ts
export class ServiceScheduleNotFoundError extends Error {
  constructor() {
    super("Service schedule not found")
    this.name = "ServiceScheduleNotFoundError"
  }
}
export class ServiceScheduleValidationError extends Error {
  constructor(msg: string) {
    super(msg)
    this.name = "ServiceScheduleValidationError"
  }
}
```

**Exports:**

```ts
// Status-Derivierung (exportiert für Router-Layer)
export function deriveStatus(
  schedule: { isActive: boolean; nextDueAt: Date | null; leadTimeDays: number },
  now: Date,
): "overdue" | "due_soon" | "ok" | "inactive" {
  if (!schedule.isActive) return "inactive"
  if (!schedule.nextDueAt) return "ok"
  const diffDays = calculateDaysUntilDue(schedule.nextDueAt, now)!
  if (diffDays < 0) return "overdue"
  if (diffDays <= schedule.leadTimeDays) return "due_soon"
  return "ok"
}

// CRUD
export async function list(
  prisma: PrismaClient,
  tenantId: string,
  params?: {
    serviceObjectId?: string
    status?: "overdue" | "due_soon" | "ok" | "inactive"
    customerAddressId?: string
    page?: number
    pageSize?: number
  },
  now: Date = new Date(),
): Promise<{ items: ServiceScheduleDto[]; total: number }> {
  // 1. Load broader set from repo (ohne status-filter; filter in-memory post-derive)
  const { items: raw, total } = await repo.findMany(prisma, tenantId, {
    serviceObjectId: params?.serviceObjectId,
    customerAddressId: params?.customerAddressId,
    page: params?.page,
    pageSize: params?.pageSize,
  })
  // 2. Derive status per row
  const enriched = raw.map(s => ({ ...s, status: deriveStatus(s, now) }))
  // 3. Optional client-status filter
  const filtered = params?.status
    ? enriched.filter(s => s.status === params.status)
    : enriched
  return { items: filtered, total: params?.status ? filtered.length : total }
}
```

**Anmerkung zur Status-Filter-Pagination:** Weil `status` derived-
column ist, kann die DB-Pagination nicht direkt filtern. Für T-3
akzeptieren wir den pragmatischen Ansatz: wenn `status` gefiltert
wird, lädt die Query bis zu `pageSize * 4` Rows und filtert
in-memory; wenn die Result-Menge kleiner als `pageSize` wird,
haben wir keine Pagination-Not. Research-Präzedenz für ähnliche
derived-status-Listen: `billing-payment-service.isOverdue` in
`open-item-list.tsx` hat dasselbe Trade-off gelöst durch
server-side computation + client-side Anzeige-Filter.

```ts
export async function getById(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  now: Date = new Date(),
): Promise<ServiceScheduleDto>

export async function listByServiceObject(
  prisma: PrismaClient,
  tenantId: string,
  serviceObjectId: string,
  now: Date = new Date(),
): Promise<ServiceScheduleDto[]>

export async function create(
  prisma: PrismaClient,
  tenantId: string,
  input: CreateScheduleInput,
  audit?: AuditContext,
): Promise<ServiceScheduleDto>
```

`create` Validation:
1. Für `intervalType = "CALENDAR_FIXED"`: `anchorDate` MUSS gesetzt
   sein; `intervalUnit` von `"DAYS"` nicht akzeptiert (Kalender-fix
   macht nur für Monate/Jahre Sinn, Enum-Validation via Zod).
2. Für `intervalType = "TIME_BASED"`: `anchorDate` MUSS null sein.
3. `intervalValue > 0`.
4. `leadTimeDays >= 0`, default 14.
5. `serviceObjectId` existiert + gehört zu tenantId → sonst
   `ServiceScheduleValidationError`.
6. Wenn `defaultActivityId`: existiert + gehört zu tenantId.
7. Wenn `responsibleEmployeeId`: existiert + gehört zu tenantId.

Nach Validation: `nextDueAt` berechnen via `calculateNextDueAt` mit
`lastCompletedAt = null` (Schedule neu), dann
`repo.create({ ...input, nextDueAt, tenantId, createdById: audit?.userId })`.

Audit-Log (fire-and-forget, catch-and-warn): action `"create"`,
entityType `"service_schedule"`, entityId = new ID, entityName
= `input.name`, metadata `{ serviceObjectId, intervalType, intervalValue, intervalUnit }`.

```ts
export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  input: UpdateScheduleInput,
  audit?: AuditContext,
): Promise<ServiceScheduleDto>
```

`update` Besonderheit: wenn irgendeines der Interval-Felder
(`intervalType`, `intervalValue`, `intervalUnit`, `anchorDate`)
geändert wird, wird `nextDueAt` neu berechnet. Tracked-Fields-
Array für Audit-Diff analog `order-service.ts:15-19`:
```ts
const TRACKED_FIELDS = [
  "name", "description", "intervalType", "intervalValue", "intervalUnit",
  "anchorDate", "defaultActivityId", "responsibleEmployeeId",
  "estimatedHours", "leadTimeDays", "isActive"
]
```

```ts
export async function remove(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  audit?: AuditContext,
): Promise<void>
```

Hard-Delete (wie `ReminderTemplate`). Orders mit diesem
`serviceScheduleId` bleiben erhalten (FK `SetNull`).

```ts
export async function generateOrder(
  prisma: PrismaClient,
  tenantId: string,
  scheduleId: string,
  params: { createInitialAssignment: boolean },
  createdById?: string,
  audit?: AuditContext,
): Promise<OrderWithSchedule>
```

Body innerhalb `prisma.$transaction(async (rawTx) => { ... })`:

```ts
const tx = rawTx as unknown as PrismaClient  // Pattern aus billing-recurring-invoice-service.ts:411

// 1. Fetch Schedule + ServiceObject + CustomerAddress
const schedule = await repo.findById(tx, tenantId, scheduleId)
if (!schedule) throw new ServiceScheduleNotFoundError()

// 2. Double-Check tenant (defense-in-depth gegen Router-Mistakes)
if (schedule.tenantId !== tenantId) {
  throw new ServiceScheduleNotFoundError()
}

// 3. Auftrags-Code via NumberSequence
const code = await numberSeqService.getNextNumber(tx, tenantId, "maintenance_order")

// 4. Order erzeugen
const order = await orderRepo.create(tx, {
  tenantId,
  code,
  name: schedule.name,
  description: schedule.description ?? null,
  status: "active",
  customer: schedule.serviceObject.customerAddress.company ?? null,
  isActive: true,
  serviceObjectId: schedule.serviceObjectId,
  serviceScheduleId: scheduleId,
})

// 5. Optional: initiale Assignment
let assignment = null
if (params.createInitialAssignment && schedule.responsibleEmployeeId) {
  assignment = await orderAssignmentRepo.create(tx, {
    tenantId,
    orderId: order.id,
    employeeId: schedule.responsibleEmployeeId,
    role: "worker",
    isActive: true,
  })
}

// 6. Audit-Log (inside tx — pattern follows billing-document-service.ts where audit inside tx is acceptable)
await auditLog.log(tx, {
  tenantId,
  userId: createdById ?? audit?.userId ?? null,
  action: "generate_order",
  entityType: "service_schedule",
  entityId: scheduleId,
  entityName: schedule.name,
  changes: null,
  metadata: {
    generatedOrderId: order.id,
    generatedOrderCode: order.code,
    assignmentCreated: !!assignment,
  },
  ipAddress: audit?.ipAddress,
  userAgent: audit?.userAgent,
}).catch(err => console.error('[AuditLog] Failed:', err))

await auditLog.log(tx, {
  tenantId,
  userId: createdById ?? audit?.userId ?? null,
  action: "create",
  entityType: "order",
  entityId: order.id,
  entityName: order.name,
  changes: null,
  metadata: {
    generatedFromScheduleId: scheduleId,
    generatedFromScheduleName: schedule.name,
  },
  ipAddress: audit?.ipAddress,
  userAgent: audit?.userAgent,
}).catch(err => console.error('[AuditLog] Failed:', err))

return { order, assignment, schedule }
```

**Wichtig**: `lastCompletedAt` und `nextDueAt` werden hier **NICHT**
berührt. Das passiert erst beim Completion des erzeugten Auftrags
via `recordCompletion`.

```ts
export async function recordCompletion(
  prisma: PrismaClient | Prisma.TransactionClient,
  tenantId: string,
  scheduleId: string,
  completedAt: Date,
  audit?: AuditContext,
): Promise<void>
```

Body (non-transactional oder inside caller's tx):

```ts
const schedule = await repo.findById(prisma, tenantId, scheduleId)
if (!schedule) {
  console.warn(
    "[service-schedule] recordCompletion skipped: schedule not found",
    { tenantId, scheduleId },
  )
  return
}
if (!schedule.isActive) {
  console.warn(
    "[service-schedule] recordCompletion skipped: schedule inactive",
    { tenantId, scheduleId },
  )
  return
}

const nextDueAt = calculateNextDueAt(
  schedule.intervalType,
  schedule.intervalValue,
  schedule.intervalUnit,
  completedAt,
  schedule.anchorDate,
  new Date(),
)

await repo.update(prisma, tenantId, scheduleId, {
  lastCompletedAt: completedAt,
  nextDueAt,
})

await auditLog.log(prisma, {
  tenantId,
  userId: audit?.userId ?? null,
  action: "record_completion",
  entityType: "service_schedule",
  entityId: scheduleId,
  entityName: schedule.name,
  changes: null,
  metadata: {
    completedAt: completedAt.toISOString(),
    nextDueAt: nextDueAt?.toISOString() ?? null,
  },
  ipAddress: audit?.ipAddress,
  userAgent: audit?.userAgent,
}).catch(err => console.error('[AuditLog] Failed:', err))
```

```ts
export async function getDashboardSummary(
  prisma: PrismaClient,
  tenantId: string,
  now: Date = new Date(),
): Promise<{ overdueCount: number; dueSoonCount: number; okCount: number }>
```

Delegiert auf `repo.countByStatus`.

### `src/lib/services/order-service.ts` — Completion-Hook

**Deviation Note 1 (siehe unten):** Anders als das Ticket
(`"Call läuft innerhalb derselben $transaction"`) wird der Hook
**sequenziell nach `update`** aufgerufen, weil `orderService.update`
heute **nicht** in `$transaction` gewrappt ist. Semantik identisch
dank `try/catch` (Ticket-Regel: Fehler blockieren Update nicht).

Einschub in `order-service.ts:update()` **direkt vor Zeile 307**
(vor `const result = await repo.findByIdWithInclude(...)`):

```ts
// T-3 ServiceSchedule completion hook
// Runs AFTER order update succeeded. Sequential (not in $transaction)
// because order-service.update itself doesn't use $transaction.
// Failures are swallowed: the ticket explicitly specifies that
// recordCompletion failures must NOT block the Order update.
const statusChanged = data.status === "completed" && existing.status !== "completed"
if (statusChanged && existing.serviceScheduleId) {
  try {
    await serviceScheduleService.recordCompletion(
      prisma,
      tenantId,
      existing.serviceScheduleId,
      new Date(),
      audit,
    )
  } catch (err) {
    console.warn(
      "[order-service] recordCompletion failed after order completion:",
      err,
    )
  }
}
```

Import-Addition am File-Top:
```ts
import * as serviceScheduleService from "./service-schedule-service"
```

**Tracked-Fields-Update nicht nötig** — der Hook schreibt nur
andere Entitäten; `Order.TRACKED_FIELDS` bleibt unverändert.

#### Repository-Include-Semantik: `existing.serviceScheduleId` ist
automatisch verfügbar

Der Hook liest `existing.serviceScheduleId` aus dem `existing`-Objekt,
das `orderService.update` via `repo.findById(prisma, tenantId, input.id)`
auf Z. 193 lädt. Code-Inspektion von
[`src/lib/services/order-repository.ts`](../../src/lib/services/order-repository.ts):

- Z. 10-14: `const orderInclude = { costCenter: { select: {...} } }`
  ist ein **`include:`** (NICHT `select:`).
- Z. 68-77 (`findById`) und Z. 112-121 (`findByIdWithInclude`) nutzen
  beide `include: orderInclude`.

Prisma-Semantik für `include:` ohne zusätzliches `select:` auf der
Root-Entity: **alle Scalar-Felder** werden zurückgegeben, plus die
explizit via `include:` eingebundenen Relations. Nach Phase A
(Migration `20260505000001_add_service_schedule_fk_to_orders.sql`
+ `pnpm prisma generate`) wird die neue `serviceScheduleId`-Spalte
automatisch in die von Prisma generierten Types aufgenommen und von
allen `findById`/`findByIdWithInclude`-Calls mitgeliefert — **keine
manuelle `include:`/`select:`-Erweiterung** in `order-repository.ts`
nötig.

Gleiches gilt für `findMany` (Z. 33-38) und `findManyByServiceObject`
(Z. 40-66): beide nutzen `include:` am Root, also alle Scalars
inklusiv `serviceScheduleId` werden geliefert.

**Phase-C-Success-Criteria-Addition (siehe unten)**: Integration-Test
Fall E muss explizit asserten, dass
`existing.serviceScheduleId === scheduleId` nach Order-Load via
`orderService.update` — das validiert die Prisma-Include-Semantik
end-to-end.

## tRPC Layer

### `src/trpc/routers/serviceSchedules.ts` (neu)

Datei-Struktur folgt `src/trpc/routers/serviceObjects.ts` (T-1-Pattern).

```ts
import { z } from "zod"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { requireModule } from "@/lib/modules"
import { requirePermission } from "@/lib/auth/middleware"
import { permissionIdFor } from "@/lib/auth/permission-catalog"
import { handleServiceError } from "@/trpc/errors"
import * as service from "@/lib/services/service-schedule-service"

const SCHED_VIEW           = permissionIdFor("service_schedules.view")
const SCHED_MANAGE         = permissionIdFor("service_schedules.manage")
const SCHED_DELETE         = permissionIdFor("service_schedules.delete")
const SCHED_GENERATE_ORDER = permissionIdFor("service_schedules.generate_order")

const serviceScheduleProcedure = tenantProcedure.use(requireModule("crm"))

// Helper: anchorDate darf nicht mehr als 100 Jahre in der
// Vergangenheit liegen (defense-in-depth gegen bad data +
// pathologische While-Loop-Laufzeiten, siehe Performance-Annahmen).
const anchorDateNotTooOld = (d: string | null | undefined): boolean => {
  if (!d) return true
  const date = new Date(d)
  const minDate = new Date()
  minDate.setFullYear(minDate.getFullYear() - 100)
  return date >= minDate
}

const createScheduleInput = z.object({
  serviceObjectId: z.string().uuid(),
  name: z.string().min(1).max(255),
  description: z.string().max(5000).nullable().optional(),
  intervalType: z.enum(["TIME_BASED", "CALENDAR_FIXED"]),
  intervalValue: z.number().int().min(1),
  intervalUnit: z.enum(["DAYS", "MONTHS", "YEARS"]),
  anchorDate: z.string().date().nullable().optional().refine(
    anchorDateNotTooOld,
    { message: "anchorDate cannot be more than 100 years in the past" }
  ),
  defaultActivityId: z.string().uuid().nullable().optional(),
  responsibleEmployeeId: z.string().uuid().nullable().optional(),
  estimatedHours: z.number().min(0).max(9999).nullable().optional(),
  leadTimeDays: z.number().int().min(0).max(365).default(14),
  isActive: z.boolean().default(true),
})
  .refine(
    (d) => d.intervalType === "CALENDAR_FIXED" ? !!d.anchorDate : !d.anchorDate,
    { message: "anchorDate required for CALENDAR_FIXED, forbidden for TIME_BASED" }
  )

const updateScheduleInput = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(5000).nullable().optional(),
  intervalType: z.enum(["TIME_BASED", "CALENDAR_FIXED"]).optional(),
  intervalValue: z.number().int().min(1).optional(),
  intervalUnit: z.enum(["DAYS", "MONTHS", "YEARS"]).optional(),
  anchorDate: z.string().date().nullable().optional().refine(
    anchorDateNotTooOld,
    { message: "anchorDate cannot be more than 100 years in the past" }
  ),
  defaultActivityId: z.string().uuid().nullable().optional(),
  responsibleEmployeeId: z.string().uuid().nullable().optional(),
  estimatedHours: z.number().min(0).max(9999).nullable().optional(),
  leadTimeDays: z.number().int().min(0).max(365).optional(),
  isActive: z.boolean().optional(),
})

export const serviceSchedulesRouter = createTRPCRouter({
  list: serviceScheduleProcedure
    .use(requirePermission(SCHED_VIEW))
    .input(z.object({
      serviceObjectId: z.string().uuid().optional(),
      status: z.enum(["overdue", "due_soon", "ok", "inactive"]).optional(),
      customerAddressId: z.string().uuid().optional(),
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(100).default(50),
    }).optional())
    .query(async ({ ctx, input }) => {
      try {
        return await service.list(ctx.prisma, ctx.tenantId, input)
      } catch (e) { handleServiceError(e) }
    }),

  getById: serviceScheduleProcedure
    .use(requirePermission(SCHED_VIEW))
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      try {
        return await service.getById(ctx.prisma, ctx.tenantId, input.id)
      } catch (e) { handleServiceError(e) }
    }),

  listByServiceObject: serviceScheduleProcedure
    .use(requirePermission(SCHED_VIEW))
    .input(z.object({ serviceObjectId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      try {
        return await service.listByServiceObject(
          ctx.prisma, ctx.tenantId, input.serviceObjectId
        )
      } catch (e) { handleServiceError(e) }
    }),

  create: serviceScheduleProcedure
    .use(requirePermission(SCHED_MANAGE))
    .input(createScheduleInput)
    .mutation(async ({ ctx, input }) => {
      try {
        return await service.create(ctx.prisma, ctx.tenantId, input, {
          userId: ctx.user.id,
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
        })
      } catch (e) { handleServiceError(e) }
    }),

  update: serviceScheduleProcedure
    .use(requirePermission(SCHED_MANAGE))
    .input(updateScheduleInput)
    .mutation(async ({ ctx, input }) => {
      try {
        return await service.update(ctx.prisma, ctx.tenantId, input.id, input, {
          userId: ctx.user.id,
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
        })
      } catch (e) { handleServiceError(e) }
    }),

  delete: serviceScheduleProcedure
    .use(requirePermission(SCHED_DELETE))
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      try {
        await service.remove(ctx.prisma, ctx.tenantId, input.id, {
          userId: ctx.user.id,
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
        })
      } catch (e) { handleServiceError(e) }
    }),

  generateOrder: serviceScheduleProcedure
    .use(requirePermission(SCHED_GENERATE_ORDER))
    .input(z.object({
      id: z.string().uuid(),
      createInitialAssignment: z.boolean().default(true),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await service.generateOrder(
          ctx.prisma,
          ctx.tenantId,
          input.id,
          { createInitialAssignment: input.createInitialAssignment },
          ctx.user.id,
          {
            userId: ctx.user.id,
            ipAddress: ctx.ipAddress,
            userAgent: ctx.userAgent,
          },
        )
      } catch (e) { handleServiceError(e) }
    }),

  getDashboardSummary: serviceScheduleProcedure
    .use(requirePermission(SCHED_VIEW))
    .query(async ({ ctx }) => {
      try {
        return await service.getDashboardSummary(ctx.prisma, ctx.tenantId)
      } catch (e) { handleServiceError(e) }
    }),
})
```

### `src/trpc/routers/_app.ts` — Registration

Neuer Import + neue Zeile im Router-Objekt:
```ts
import { serviceSchedulesRouter } from "./serviceSchedules"
// ...
export const appRouter = createTRPCRouter({
  // ... bestehende Router
  serviceSchedules: serviceSchedulesRouter,
})
```

## UI Layer

### Neue Route: `src/app/[locale]/(dashboard)/serviceobjects/schedules/page.tsx`

- Client-Component (`'use client'`).
- `useSearchParams()` → Filter-State-Init mit Lazy-useState
  (Pattern aus `admin/employees/page.tsx:58-60`):

```tsx
const searchParams = useSearchParams()
const [statusFilter, setStatusFilter] = React.useState<ScheduleStatusFilter>(
  () => parseStatusFilter(searchParams.get("status"))
)
React.useEffect(() => {
  setStatusFilter(parseStatusFilter(searchParams.get("status")))
}, [searchParams])
```

- Tab-Toggle oben: "Alle" / "Überfällig" / "Bald fällig" / "OK" via
  `<Tabs>` (controlled, React-State).
- Datenhook: `useServiceSchedules({ status: statusFilter, page })`.
- Tabelle in `<Card><CardContent className="p-0">`:
  - Spalten: Serviceobjekt (Nummer + Name), Wartungsplan-Name,
    Typ, nächste Fälligkeit, Status-Badge, Aktion-Spalte.
  - Row-Click → `/serviceobjects/[serviceObjectId]?tab=schedule`
    (Jump zum Serviceobjekt-Detail mit Tab-Parameter; optional).
  - Action-Spalte rendert `GenerateOrderButton` + Edit/Delete
    Dropdown.
- Leere Zustände pro Filter.
- Pagination: 25 pro Seite.

### Neuer Tab auf ServiceObject-Detail

Datei: `src/app/[locale]/(dashboard)/serviceobjects/[id]/page.tsx`.

Änderungen:
1. `TabValue` erweitern (Z. 28):
   ```ts
   type TabValue = 'overview' | 'history' | 'schedule' | 'tree' | 'attachments'
   ```
2. Neuer `<TabsTrigger value="schedule">` + `<TabsContent>` in der
   Reihenfolge `overview → history → schedule → tree → attachments`.
3. `<TabsContent value="schedule">` rendert
   `<ServiceObjectScheduleTab serviceObjectId={id} />`.

### Neue Components

#### `src/components/serviceobjects/schedule-status-badge.tsx` (neu)

Pattern wie `payment-status-badge.tsx`:

```tsx
import { Badge } from "@/components/ui/badge"
import { useTranslations } from "next-intl"

type ScheduleStatus = "overdue" | "due_soon" | "ok" | "inactive"

const VARIANTS: Record<ScheduleStatus, "red" | "yellow" | "gray" | "green"> = {
  overdue:  "red",
  due_soon: "yellow",
  ok:       "green",
  inactive: "gray",
}

export function ScheduleStatusBadge({ status }: { status: ScheduleStatus }) {
  const t = useTranslations("serviceSchedules.status")
  return <Badge variant={VARIANTS[status]}>{t(status === "due_soon" ? "dueSoon" : status)}</Badge>
}
```

#### `src/components/serviceobjects/schedule-list-table.tsx` (neu)

Shared zwischen `/serviceobjects/schedules`-Page und
`ServiceObjectScheduleTab`. Props:
```ts
interface Props {
  schedules: ServiceScheduleDto[]
  onEdit: (id: string) => void
  onDelete: (id: string) => void
  onGenerateOrder: (id: string) => void
  showServiceObjectColumn?: boolean  // true für globale Liste, false für Detail-Tab
}
```

Cells:
- Serviceobjekt-Cell (conditional): `{number} — {name}`.
- Name: `schedule.name`.
- Typ: `t(serviceSchedules.intervalType.{TIME_BASED|CALENDAR_FIXED})` +
  sub-label `intervalValue + intervalUnit`.
- Nächste Fälligkeit: formatted via `Intl.DateTimeFormat` oder
  "Noch nie ausgeführt" bei `nextDueAt = null`.
- Status: `<ScheduleStatusBadge status={schedule.status} />`.
- Action-Cell: Button "Auftrag erzeugen" (disabled wenn
  `schedule.status === "inactive"`) + Dropdown "Bearbeiten" /
  "Löschen".

Mobile: Responsive Card-Layout analog zu
`src/components/billing/open-item-list.tsx:179` (`sm:hidden`
Cards, `hidden sm:table` Desktop-Table).

#### `src/components/serviceobjects/service-object-schedule-tab.tsx` (neu)

```tsx
interface Props { serviceObjectId: string }

export function ServiceObjectScheduleTab({ serviceObjectId }: Props) {
  const t = useTranslations("serviceSchedules")
  const { data, isLoading } = useServiceSchedulesByServiceObject(serviceObjectId)
  const [createOpen, setCreateOpen] = React.useState(false)
  const [editId, setEditId] = React.useState<string | null>(null)
  const [generateId, setGenerateId] = React.useState<string | null>(null)
  const deleteMutation = useDeleteServiceSchedule()

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">{t("titleForServiceObject")}</h3>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> {t("newSchedule")}
        </Button>
      </div>
      {isLoading && <Skeleton className="h-32" />}
      {data && data.length === 0 && (
        <EmptyState message={t("empty.serviceObject")} />
      )}
      {data && data.length > 0 && (
        <ScheduleListTable
          schedules={data}
          showServiceObjectColumn={false}
          onEdit={setEditId}
          onDelete={(id) => deleteMutation.mutateAsync({ id })}
          onGenerateOrder={setGenerateId}
        />
      )}
      <ScheduleFormSheet
        open={createOpen || !!editId}
        onOpenChange={(o) => { if (!o) { setCreateOpen(false); setEditId(null) } }}
        existing={editId ? data?.find(s => s.id === editId) : undefined}
        defaultServiceObjectId={serviceObjectId}
      />
      {generateId && (
        <GenerateOrderDialog
          scheduleId={generateId}
          open={!!generateId}
          onOpenChange={(o) => !o && setGenerateId(null)}
        />
      )}
    </div>
  )
}
```

#### `src/components/serviceobjects/schedule-form-sheet.tsx` (neu)

Side-Sheet-Pattern aus `service-object-form-sheet.tsx:307`.

State:
- Alle Felder einzelne `React.useState`.
- `useEffect` keyed auf `[open, existing, defaultServiceObjectId]`
  resetted Form.
- `useActivities({ isActive: true, enabled: open })` — Dropdown.
- `useEmployees({ isActive: true, pageSize: 200 })` — Dropdown
  (Pro-Di hat vermutlich <200 Mitarbeiter; bei größeren Tenants
  statt Dropdown später `EmployeePicker` einbauen, aktuell
  Simple Select).
- `intervalType`-State triggert Conditional Rendering:
  CALENDAR_FIXED → Anchor-Date-Picker visible, TIME_BASED → hidden.

Validation on submit (client-side mirroring Zod):
- name pflicht, intervalValue >= 1, leadTimeDays >= 0.
- CALENDAR_FIXED: anchorDate required.

Submit → `useCreateServiceSchedule()` / `useUpdateServiceSchedule()`
→ `toast.success(t("form.success"))` → close sheet.

Customer-Serviceobjekt-Lookup beim Create aus Global-Route (wenn
`defaultServiceObjectId` absent): statischer Dropdown mit
`useServiceObjects({ isActive: true })`.

#### `src/components/serviceobjects/generate-order-dialog.tsx` (neu)

Alert-Dialog-Pattern (nicht Sheet, da leichter Confirm-Flow).
`<AlertDialog>` → `<AlertDialogContent>`:

```tsx
interface Props {
  scheduleId: string
  open: boolean
  onOpenChange: (o: boolean) => void
}

export function GenerateOrderDialog({ scheduleId, open, onOpenChange }: Props) {
  const t = useTranslations("serviceSchedules.generateOrder")
  const router = useRouter()
  const { data: schedule } = useServiceSchedule(scheduleId)
  const [createAssignment, setCreateAssignment] = React.useState(true)
  const mutation = useGenerateOrderFromSchedule()

  const employeeName = schedule?.responsibleEmployee
    ? `${schedule.responsibleEmployee.firstName} ${schedule.responsibleEmployee.lastName}`
    : null

  const handleConfirm = async () => {
    try {
      const result = await mutation.mutateAsync({
        id: scheduleId,
        createInitialAssignment: createAssignment && !!employeeName,
      })
      toast.success(t("success", { code: result.order.code }))
      onOpenChange(false)
      router.push(`/admin/orders/${result.order.id}`)
    } catch {
      toast.error(t("error"))
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("dialogTitle")}</AlertDialogTitle>
          <AlertDialogDescription>{t("dialogDescription")}</AlertDialogDescription>
        </AlertDialogHeader>
        {employeeName && (
          <div className="flex items-center gap-2 py-2">
            <Checkbox
              id="create-assignment"
              checked={createAssignment}
              onCheckedChange={(v) => setCreateAssignment(v === true)}
            />
            <label htmlFor="create-assignment">
              {t("createAssignmentCheckbox", { employeeName })}
            </label>
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm} disabled={mutation.isPending}>
            {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("confirmButton")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
```

### Dashboard-Widget

Datei: `src/components/dashboard/upcoming-maintenances-widget.tsx` (neu).
Pattern: `probation-dashboard-widget.tsx` (Card-Layout, kein interner
hasPermission-Guard — Gating in `dashboard/page.tsx`).

```tsx
"use client"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { CalendarClock, Wrench } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { useTranslations } from "next-intl"
import { useServiceSchedulesDashboardSummary } from "@/hooks/use-service-schedules"

export function UpcomingMaintenancesWidget() {
  const t = useTranslations("serviceSchedules.widget")
  const { data, isLoading, isError, refetch } = useServiceSchedulesDashboardSummary()

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>…</CardDescription>
        </div>
        <Wrench className="h-5 w-5 text-muted-foreground" />
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading && <Skeleton className="h-16 w-full" />}
        {isError && <Button onClick={() => refetch()}>…</Button>}
        {data && (
          <>
            <div className="space-y-1">
              <p className="text-2xl font-semibold">
                {t("overdueCount", { count: data.overdueCount })}
              </p>
              <p className="text-sm text-muted-foreground">
                {t("dueSoonCount", { count: data.dueSoonCount })}
              </p>
            </div>
            <div className="flex gap-2">
              <Button asChild variant="outline" size="sm">
                <Link href="/serviceobjects/schedules">{t("viewAll")}</Link>
              </Button>
              {data.overdueCount > 0 && (
                <Button asChild size="sm">
                  <Link href="/serviceobjects/schedules?status=overdue">
                    {t("viewOverdue")}
                  </Link>
                </Button>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
```

### Dashboard-Page-Einbindung

Datei: `src/app/[locale]/(dashboard)/dashboard/page.tsx`.

Aktueller Code Z. 75-80 (2-col Grid) erweitern auf 3 Widgets.
**Zwischen** `PersonnelFileDashboardWidget` und
`ProbationDashboardWidget`:

```tsx
const canViewSchedules = useHasPermission(["service_schedules.view"])
// ...
{(employeeId || canViewEmployees || canViewSchedules) && (
  <div className="grid gap-4 sm:gap-6 lg:grid-cols-3">
    {employeeId && <PersonnelFileDashboardWidget />}
    {canViewSchedules && <UpcomingMaintenancesWidget />}
    {canViewEmployees && <ProbationDashboardWidget />}
  </div>
)}
```

(Layout `lg:grid-cols-2` → `lg:grid-cols-3`, da nun 3 Widgets
möglich sind. Responsive-Behaviour: `grid` kollabiert auf 1 Column
mobile, 3 auf desktop.)

### Sidebar-Nav-Ergänzung

Datei: `src/components/layout/sidebar/sidebar-nav-config.ts`.

Neuer Import (zusammen mit `Wrench` etc.):
```ts
import { CalendarClock } from "lucide-react"
```

Neuer Nav-Item direkt **nach** `crmServiceObjects` (Z. 417):
```ts
{
  titleKey: "crmMaintenanceSchedules",
  href: "/serviceobjects/schedules",
  icon: CalendarClock,
  module: "crm",
  permissions: ["service_schedules.view"],
}
```

### Hooks

Datei: `src/hooks/use-service-schedules.ts` (neu).

Pattern aus `use-service-objects.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { trpc } from "@/trpc/client"
import { toast } from "sonner"

export function useServiceSchedules(params?: ServiceScheduleListParams) {
  return useQuery(trpc.serviceSchedules.list.queryOptions(params))
}

export function useServiceSchedule(id: string, enabled = true) {
  return useQuery(trpc.serviceSchedules.getById.queryOptions({ id }, { enabled: !!id && enabled }))
}

export function useServiceSchedulesByServiceObject(serviceObjectId: string) {
  return useQuery(trpc.serviceSchedules.listByServiceObject.queryOptions(
    { serviceObjectId },
    { enabled: !!serviceObjectId }
  ))
}

export function useServiceSchedulesDashboardSummary() {
  return useQuery(trpc.serviceSchedules.getDashboardSummary.queryOptions())
}

export function useCreateServiceSchedule() {
  const qc = useQueryClient()
  return useMutation(trpc.serviceSchedules.create.mutationOptions({
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: trpc.serviceSchedules.list.queryKey() })
      qc.invalidateQueries({
        queryKey: trpc.serviceSchedules.listByServiceObject.queryKey({
          serviceObjectId: variables.serviceObjectId,
        })
      })
      qc.invalidateQueries({ queryKey: trpc.serviceSchedules.getDashboardSummary.queryKey() })
    }
  }))
}

export function useUpdateServiceSchedule() {
  const qc = useQueryClient()
  return useMutation(trpc.serviceSchedules.update.mutationOptions({
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: trpc.serviceSchedules.list.queryKey() })
      qc.invalidateQueries({ queryKey: trpc.serviceSchedules.getById.queryKey({ id: data.id }) })
      qc.invalidateQueries({ queryKey: trpc.serviceSchedules.getDashboardSummary.queryKey() })
      if (data.serviceObjectId) {
        qc.invalidateQueries({
          queryKey: trpc.serviceSchedules.listByServiceObject.queryKey({
            serviceObjectId: data.serviceObjectId,
          })
        })
      }
    }
  }))
}

export function useDeleteServiceSchedule() {
  const qc = useQueryClient()
  return useMutation(trpc.serviceSchedules.delete.mutationOptions({
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: trpc.serviceSchedules.list.queryKey() })
      qc.invalidateQueries({ queryKey: trpc.serviceSchedules.listByServiceObject.queryKey() })
      qc.invalidateQueries({ queryKey: trpc.serviceSchedules.getDashboardSummary.queryKey() })
    }
  }))
}

export function useGenerateOrderFromSchedule() {
  const qc = useQueryClient()
  return useMutation(trpc.serviceSchedules.generateOrder.mutationOptions({
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: trpc.serviceSchedules.list.queryKey() })
      qc.invalidateQueries({ queryKey: trpc.serviceSchedules.listByServiceObject.queryKey() })
      qc.invalidateQueries({ queryKey: trpc.orders.list.queryKey() })
    }
  }))
}
```

### i18n

#### Neuer Top-Level-Namespace `serviceSchedules`

Dateien: `messages/de.json`, `messages/en.json`.

Struktur (de.json, ans Ende des existierenden `serviceObjects`-Namespace
anschließend):
```json
{
  "serviceSchedules": {
    "title": "Wartungspläne",
    "titleForServiceObject": "Wartungspläne dieses Objekts",
    "newSchedule": "Neuer Wartungsplan",
    "tabs": {
      "all": "Alle",
      "overdue": "Überfällig",
      "dueSoon": "Bald fällig",
      "ok": "OK"
    },
    "columns": {
      "serviceObject": "Serviceobjekt",
      "name": "Bezeichnung",
      "intervalType": "Typ",
      "nextDueAt": "Nächste Fälligkeit",
      "status": "Status",
      "actions": "Aktion"
    },
    "status": {
      "overdue": "Überfällig",
      "dueSoon": "Bald fällig",
      "ok": "OK",
      "inactive": "Deaktiviert"
    },
    "intervalType": {
      "TIME_BASED": "Zeit-basiert",
      "CALENDAR_FIXED": "Kalender-fix"
    },
    "intervalUnit": {
      "DAYS": "Tage",
      "MONTHS": "Monate",
      "YEARS": "Jahre"
    },
    "form": {
      "name": "Bezeichnung",
      "description": "Beschreibung",
      "intervalType": "Intervall-Typ",
      "intervalTypeHelp": "Zeit-basiert: alle X Monate ab letzter Wartung. Kalender-fix: jedes Jahr/Quartal zum Fix-Datum.",
      "intervalValue": "Intervall",
      "intervalUnit": "Einheit",
      "anchorDate": "Fix-Datum (nur bei Kalender-fix)",
      "defaultActivity": "Standard-Aktivität",
      "responsibleEmployee": "Verantwortliche/r",
      "estimatedHours": "Geschätzte Stunden",
      "leadTimeDays": "Vorlaufzeit (Tage)",
      "leadTimeDaysHelp": "Wie viele Tage vor Fälligkeit wird als 'bald fällig' markiert.",
      "success": "Wartungsplan gespeichert",
      "error": "Fehler beim Speichern"
    },
    "generateOrder": {
      "button": "Auftrag erzeugen",
      "dialogTitle": "Auftrag aus Wartungsplan erzeugen",
      "dialogDescription": "Es wird ein neuer Auftrag mit automatischer Nummerierung (WA-) angelegt.",
      "createAssignmentCheckbox": "Erste Zuweisung mit {employeeName} anlegen",
      "confirmButton": "Auftrag jetzt erzeugen",
      "cancel": "Abbrechen",
      "success": "Auftrag {code} wurde erzeugt",
      "error": "Auftrag konnte nicht erzeugt werden",
      "goToOrder": "Zum Auftrag"
    },
    "empty": {
      "global": "Noch keine Wartungspläne angelegt.",
      "serviceObject": "Für dieses Serviceobjekt ist noch kein Wartungsplan hinterlegt.",
      "byStatus": "Keine Wartungspläne mit Status {status}."
    },
    "widget": {
      "title": "Anstehende Wartungen",
      "description": "Überfällige und bald fällige Wartungspläne.",
      "overdueCount": "{count, plural, =0 {Keine überfällig} =1 {1 überfällig} other {# überfällig}}",
      "dueSoonCount": "{count, plural, =0 {Keine bald fällig} =1 {1 bald fällig} other {# bald fällig}}",
      "viewAll": "Alle anzeigen",
      "viewOverdue": "Überfällige anzeigen"
    },
    "lastCompleted": {
      "never": "Noch nie ausgeführt"
    }
  }
}
```

en.json-Entsprechung (englische Strings) für Vollständigkeit, auch
wenn das produktive UI in Tenant-Richtung nur deutsch ist
(Memory-Feedback `i18n_tenant_only`).

#### Erweiterung bestehender Namespaces

`messages/de.json`:
- `nav.crmMaintenanceSchedules` → `"Wartungspläne"` (beim bestehenden
  `nav`-Objekt, nach `crmServiceObjects`).
- `serviceObjects.tabs.schedule` → `"Wartungsplan"`.

`messages/en.json`: analog mit englischen Strings.

## Tests

### Unit-Tests

#### 1. `src/lib/services/__tests__/service-schedule-date-utils.test.ts` (neu)

Pattern 1 aus Research §10.1 (`probation-service.test.ts`):
keine Fake-Timer, `Date.UTC(...)` für Inputs, `now` als expliziter
Parameter.

Test-Cases:
1. TIME_BASED, `lastCompletedAt = null` → result `null`.
2. TIME_BASED, `lastCompletedAt = 2026-03-01, intervalValue=3, intervalUnit="MONTHS"`
   → expect `2026-06-01`.
3. CALENDAR_FIXED, `anchorDate = 2026-03-01`, `now = 2026-05-01`,
   `intervalValue=1, intervalUnit="YEARS"`, `lastCompletedAt=null`
   → expect `2027-03-01`.
4. CALENDAR_FIXED, `anchorDate = 2020-03-01`, `now = 2026-05-01`,
   yearly → expect `2027-03-01` (multi-advance).
5. CALENDAR_FIXED, `anchorDate = 2026-03-01`, `now = 2026-02-01`,
   yearly → expect `2026-03-01` (no advance).
6. CALENDAR_FIXED, `lastCompletedAt > anchorDate`: anchor=2026-03-01,
   lastCompleted=2026-04-15, now=2026-05-01, yearly
   → expect `2027-03-01` (candidate 2027-03-01 > lastCompleted).
7. Monatsende-Edge: base=2026-01-31, +1 MONTHS → expect Feb-Wert
   (JavaScript-default: 2026-03-03 weil Feb 31 overflows).
   **Test dokumentiert die tatsächliche native-JS-Semantik**,
   macht keinen korrigierenden Workaround.
8. Schaltjahr-Edge: base=2024-02-29, +1 YEARS → expect 2025-03-01
   (JS-default).
9. `calculateDaysUntilDue`:
   - `nextDueAt=null` → result null
   - `nextDueAt > now` → positive int
   - `nextDueAt < now` → negative int

Geschätzte Tests: ~20. Keine Prisma-Dependency, keine DB.

#### 2. `src/lib/services/__tests__/service-schedule-service.test.ts` (neu)

Pattern 2/3 aus Research §10.1 (Mock-Prisma, `$transaction`-Mock
aus `billing-service-case-service.test.ts:92-132`).

Test-Cases (min. 15):
1. `list` mit `status="overdue"` filtert derived status korrekt.
2. `list` mit `serviceObjectId` leitet an repo.findMany mit where-
   Clause weiter.
3. `list` ohne Filter: `deriveStatus` auf jeder Zeile.
4. `create` TIME_BASED: `nextDueAt = null` (kein lastCompletedAt).
5. `create` CALENDAR_FIXED: `nextDueAt` via
   `calculateNextDueAt(anchorDate, ...)`.
6. `create` mit `intervalValue = 0` → ValidationError.
7. `create` CALENDAR_FIXED ohne `anchorDate` → ValidationError.
8. `create` TIME_BASED mit `anchorDate` → ValidationError.
9. `update` mit Interval-Change: `nextDueAt` neu berechnet.
10. `update` mit Name-Only-Change: `nextDueAt` unverändert.
11. `generateOrder` innerhalb `$transaction`, called `orderRepo.create`
    mit `serviceScheduleId=scheduleId`.
12. `generateOrder` mit `createInitialAssignment=true` +
    `responsibleEmployeeId` → `orderAssignmentRepo.create` called.
13. `generateOrder` mit `createInitialAssignment=true` ohne
    `responsibleEmployeeId` → Assignment SKIPPED.
14. `generateOrder` mit `createInitialAssignment=false` → Assignment
    SKIPPED.
15. `generateOrder` schreibt 2 audit-logs (service_schedule +
    order).
16. `generateOrder` berührt `lastCompletedAt`/`nextDueAt` **nicht**.
17. `recordCompletion` updated `lastCompletedAt`, recalculated
    `nextDueAt`, schreibt audit-log.
18. `recordCompletion` auf deaktiviertem Schedule: silent no-op.
19. Tenant-Isolation: `findMany.call[0]` enthält
    `where.tenantId = tenantId`.
20. `deriveStatus` unit-tests für alle 4 states.

#### 3. `src/lib/services/__tests__/service-schedule-service.integration.test.ts` (neu)

Pattern aus Research §10.2: `.integration.test.ts`-Tag → echte
Postgres-Dev-DB via Prisma, HAS_DB-Guard am File-Top:

```ts
const HAS_DB = !!process.env.DATABASE_URL
const d = HAS_DB ? describe : describe.skip
```

Suite `d("service-schedule-service integration", () => ...)`:

- Setup: Legt 2 Tenants an (A + B), je 1 CrmAddress (Kunde),
  1 ServiceObject, 1 Employee, 1 Activity.
- Cleanup in `afterAll`: `prisma.serviceSchedule.deleteMany`,
  `prisma.orderAssignment.deleteMany`, `prisma.order.deleteMany`,
  `prisma.serviceObject.deleteMany`, `prisma.crmAddress.deleteMany`,
  `prisma.employee.deleteMany`, `prisma.activity.deleteMany`,
  `prisma.tenant.deleteMany` — scoped auf Test-Prefix-IDs.

Fälle:
- **Fall A**: Schedule TIME_BASED, `intervalValue=3, intervalUnit="MONTHS"`,
  `lastCompletedAt = now - 90 Tage`. Create → fetch → expect
  `nextDueAt ≈ now + 0..5 Tage`, status derivered `overdue`.
- **Fall B**: Cross-Tenant-Isolation. List Tenant-A darf
  Tenant-B-Schedules nicht sehen (assert `items.length === 1`
  nur A-Schedule).
- **Fall C**: `generateOrder` erzeugt Order in echter DB, assert
  `order.code.startsWith("WA-")`, `order.serviceObjectId` +
  `order.serviceScheduleId` gesetzt, OrderAssignment existiert
  mit responsibleEmployeeId.
- **Fall D**: Second `generateOrder`-Call bekommt `WA-2`.
- **Fall E**: Order-Status auf `"completed"` updaten (via
  orderService.update) → trigger Completion-Hook → reload
  Schedule, `lastCompletedAt` aktualisiert,
  `nextDueAt` neu berechnet.
- **Fall F**: Delete Schedule → reload Order, `serviceScheduleId`
  jetzt `null` (SetNull-FK verifiziert).
- **Fall G**: `getDashboardSummary` zählt korrekt: schedule mit
  nextDueAt < now → overdueCount++, nextDueAt in next 14 days
  → dueSoonCount++, sonst → okCount++.

#### 4. `src/trpc/routers/__tests__/service-schedules-router.test.ts` (neu)

Pattern aus `orders-router.test.ts:1-100`: `createCallerFactory` +
`createMockContext`, fully mocked Prisma.

Test-Cases:
1. `list` ohne `SCHED_VIEW`-Permission → FORBIDDEN.
2. `create` ohne `SCHED_MANAGE`-Permission → FORBIDDEN.
3. `delete` ohne `SCHED_DELETE`-Permission → FORBIDDEN.
4. `generateOrder` ohne `SCHED_GENERATE_ORDER`-Permission → FORBIDDEN.
5. `create` Happy-Path mit minimal TIME_BASED-Input.
6. `create` mit CALENDAR_FIXED aber ohne anchorDate → BAD_REQUEST.
7. `generateOrder` Happy-Path → returns `{ order, assignment, schedule }`.
8. `list` mit `page=1, pageSize=25` → passed zum Service.

### E2E-Test

Datei: `src/e2e-browser/83-service-object-schedules.spec.ts` (neu).

Pattern aus `34-billing-recurring.spec.ts` (serial describe,
admin-login, multi-step UC).

```ts
test.describe.serial("UC-S-03: ServiceSchedule — Wartungspläne", () => {
  let scheduleId: string
  let serviceObjectId: string
  let generatedOrderId: string
  let generatedOrderCode: string

  // Setup-Test (first in serial): seed 1 Kunde + 1 ServiceObjekt
  test("Setup: Kunde + Serviceobjekt + Activity + Employee anlegen", async ({ page }) => {
    // Nav to /crm/addresses → create → Serviceobjekt anlegen
    // (Alternative: via API fixture in global-setup.ts)
  })

  test("Flow 1: Schedule via Detail-Tab anlegen", async ({ page }) => {
    // /serviceobjects/[id] → Tab "Wartungsplan"
    // Click "Neuer Wartungsplan"
    // Fill sheet: name="Quartalsservice", TIME_BASED, intervalValue=3, MONTHS
    // Save → expect Schedule erscheint in Tab-Liste
  })

  test("Flow 2: Globale Liste zeigt Schedule", async ({ page }) => {
    // /serviceobjects/schedules → Tab "Alle"
    // expect row mit "Quartalsservice"
  })

  test("Flow 3: Generate Order aus Liste", async ({ page }) => {
    // Click "Auftrag erzeugen" in Row
    // AlertDialog öffnet
    // Checkbox "Erste Zuweisung" aktiv lassen
    // Click Confirm
    // expect Toast "Auftrag WA-X wurde erzeugt"
    // expect URL-Redirect nach /admin/orders/<uuid>
    // expect Order-Code startWith "WA-"
    // expect Assignments-Tab zeigt Employee
  })

  test("Flow 4: Order completen rollt Fälligkeit", async ({ page }) => {
    // Order-Status auf "completed"
    // Navigate zurück zu /serviceobjects/schedules
    // expect lastCompletedAt != null
    // expect nextDueAt neu berechnet (Today + 3 Monate)
  })

  test("Flow 5: Dashboard-Widget sichtbar", async ({ page }) => {
    // /dashboard
    // expect Widget "Anstehende Wartungen"
    // Click "Alle anzeigen" → Navigation zu /serviceobjects/schedules
  })
})
```

## Handbuch

Datei: `docs/TERP_HANDBUCH.md`.

Neuer Abschnitt **12b. Wartungspläne** direkt nach Abschnitt 12a
"Serviceobjekte — Stammdaten". Pattern analog zu bestehendem
12a mit "Was ist es?" / "Wozu dient es?" / Berechtigungen /
Klickpfad / Praxisbeispiele.

### Struktur

```markdown
## 12b. Wartungspläne

### 12b.1 Was ist ein Wartungsplan?

Jeder Wartungsplan gehört zu einem Serviceobjekt und beschreibt einen
wiederkehrenden Service-Zyklus (Quartalsservice, DGUV V3,
Dichtheitsprüfung, etc.). Terp berechnet automatisch, wann die
nächste Durchführung fällig ist, und listet überfällige + bald
fällige Pläne im Dashboard.

### 12b.2 Was bietet ein Wartungsplan?

- **Intervall-Typ**: zeit-basiert (alle X Monate ab letzter Wartung)
  oder kalender-fix (jedes Jahr zum 1. März, unabhängig von letzter
  Wartung).
- **Standard-Aktivität + Verantwortliche/r**: Vorbelegung für den
  Plan-erzeugten Auftrag.
- **Vorlaufzeit**: Fenster in Tagen vor Fälligkeit, ab dem der Plan
  als "bald fällig" markiert wird (Default: 14 Tage).
- **1-Klick-Auftragserzeugung**: ein Klick öffnet einen neuen
  Auftrag mit Code `WA-<Nummer>`, Kunde vorausgefüllt,
  Techniker-Zuweisung vorbereitet.
- **Automatisches Fortschreiben**: sobald der erzeugte Auftrag als
  "abgeschlossen" markiert wird, rollen `letzte Ausführung` und
  `nächste Fälligkeit` automatisch weiter.

**Berechtigungen**:
- `service_schedules.view` — Pläne anzeigen (PERSONAL, VERTRIEB, VORGESETZTER, MITARBEITER)
- `service_schedules.manage` — Pläne erstellen/bearbeiten (PERSONAL, VERTRIEB)
- `service_schedules.delete` — Pläne löschen (PERSONAL)
- `service_schedules.generate_order` — Auftrag aus Plan erzeugen (PERSONAL, VERTRIEB)

**Klickpfad**:
- Global-Liste: Sidebar → CRM → Wartungspläne
  (`/serviceobjects/schedules`)
- Pro Serviceobjekt: Sidebar → CRM → Serviceobjekte →
  (einzelnes Objekt öffnen) → Tab "Wartungsplan"
- Dashboard: Widget "Anstehende Wartungen" oben auf `/dashboard`

### 12b.3 Praxisbeispiel: Quartalsservice für eine Kältemaschine anlegen

1. Sidebar → CRM → Serviceobjekte → "Kältemaschine Halle 2" öffnen.
2. Tab "Wartungsplan" → Button "Neuer Wartungsplan".
3. Sheet öffnet sich:
   - Bezeichnung: `Quartalsservice`
   - Intervall-Typ: `Zeit-basiert`
   - Intervall: `3`, Einheit: `Monate`
   - Standard-Aktivität: `WARTUNG`
   - Verantwortliche/r: `Hans Müller`
   - Vorlaufzeit: `14` Tage
4. Speichern. Plan erscheint in der Tab-Liste mit Status "OK"
   (neuer Plan, noch keine Fälligkeit).

### 12b.4 Praxisbeispiel: Überfällige Wartung erkennen und Auftrag erzeugen

1. `/dashboard` → Widget "Anstehende Wartungen" zeigt
   "3 überfällig, 12 bald fällig".
2. Button "Überfällige anzeigen" → öffnet
   `/serviceobjects/schedules?status=overdue`.
3. Zeile mit Status-Badge "Überfällig" → Button "Auftrag erzeugen"
   klicken.
4. Dialog öffnet sich: Checkbox "Erste Zuweisung mit Hans Müller
   anlegen" ist aktiv → Confirm.
5. Terp legt Auftrag `WA-42` an, Kunde aus Serviceobjekt, Technikerin
   zugewiesen, öffnet direkt die Auftrags-Detailseite.

### 12b.5 Praxisbeispiel: Wartung als abgeschlossen markieren

1. Technikerin bucht Zeit auf Auftrag `WA-42` (Tab "Zeitbuchungen").
2. Disponent öffnet den Auftrag, klickt "Status bearbeiten" →
   `abgeschlossen`.
3. Terp aktualisiert den zugehörigen Wartungsplan automatisch:
   - "Letzte Ausführung" = heute
   - "Nächste Fälligkeit" = heute + 3 Monate
4. Widget zeigt sofort einen Überfälligen weniger.

### 12b.6 Praxisbeispiel: DGUV V3 mit fixem Kalender-Termin (jedes Jahr zum 1.3.)

1. Serviceobjekt öffnen → Tab "Wartungsplan" → "Neuer Wartungsplan".
2. Formular:
   - Bezeichnung: `DGUV V3 Prüfung`
   - Intervall-Typ: `Kalender-fix`
   - Fix-Datum: `01.03.2027`
   - Intervall: `1`, Einheit: `Jahre`
3. Speichern. Plan erscheint mit "Nächste Fälligkeit: 01.03.2027".
4. Jahresübergreifend: nach Abschluss rollt `nextDueAt` automatisch
   auf `01.03.2028`, usw.
```

## Phased Rollout

Jede Phase endet mit PAUSE + Commit. Kein Phase-Skip erlaubt.

### Phase A — Schema + Migration + Permissions

1. Prisma-Schema-Änderung:
   - Neue `ServiceSchedule`-Entität + 2 Enums (`prisma/schema.prisma`).
   - Neue Felder auf `Order` (`serviceScheduleId` + Relation +
     Index).
   - Inverse-Relations auf `Employee`, `Activity`, `ServiceObject`.
2. 3 Migrations-SQL-Files:
   - `20260505000000_create_service_schedules.sql`
     (Tabelle + Enums + CHECK-Constraints + Indexe + Trigger + RLS).
   - `20260505000001_add_service_schedule_fk_to_orders.sql`
     (Order-Erweiterung).
   - `20260505000002_service_objects_schedules_default_groups.sql`
     (Dual-Purpose: T-1-Fix + T-3 Permissions).
3. `src/lib/auth/permission-catalog.ts` erweitert (4 neue Einträge).
4. `src/lib/services/number-sequence-service.ts` erweitert:
   `maintenance_order: "WA-"` in `DEFAULT_PREFIXES`.
5. `src/lib/tenant-templates/seed-service-activities.ts` erstellt
   (nicht automatisch gecallt).
6. `pnpm prisma generate` + `pnpm db:reset` + `pnpm typecheck` + `pnpm lint` grün.
7. Prisma-Studio-Sichtprüfung: `service_schedules` Tabelle erscheint,
   `orders` hat neue Spalte `service_schedule_id`.

### Success Criteria Phase A

#### Automated Verification:
- [x] `pnpm prisma generate` fehlerfrei
- [x] `pnpm db:reset` läuft durch ohne Fehler
- [x] `pnpm typecheck` grün (keine neuen Fehler ggü. Baseline von 9 bestehenden; keiner betrifft ServiceSchedule)
- [x] `pnpm lint` grün (keine neuen Fehler; alle bestehenden sind pre-existing)
- [x] Alle 3 Migrations-SQL-Files vorhanden und korrekt benannt
- [x] `grep -r "maintenance_order" src/lib/services/number-sequence-service.ts` findet 1 Treffer
- [x] `grep -r "service_schedules\." src/lib/auth/permission-catalog.ts` findet 4 Einträge

#### Manual Verification:
- [ ] Prisma Studio zeigt leere `service_schedules` Tabelle mit allen geplanten Spalten
- [ ] `orders`-Tabelle hat Spalte `service_schedule_id`
- [ ] Migration 3 ist **idempotent**: doppelt laufen lassen erzeugt keine Duplikate

**PAUSE — Commit:** `Add ServiceSchedule schema and permissions (Phase A)`

### Phase B — Service-Layer + Date-Utils

1. `src/lib/services/service-schedule-date-utils.ts` + Unit-Tests.
2. `src/lib/services/service-schedule-repository.ts`.
3. `src/lib/services/service-schedule-service.ts` (alle CRUD +
   `generateOrder` + `recordCompletion` + `getDashboardSummary`).
4. Unit-Tests für Service (`service-schedule-service.test.ts`).
5. Integration-Test (`service-schedule-service.integration.test.ts`).

### Success Criteria Phase B

#### Automated Verification:
- [x] `pnpm vitest run src/lib/services/__tests__/service-schedule-date-utils.test.ts` grün (20/20 tests)
- [x] `pnpm vitest run src/lib/services/__tests__/service-schedule-service.test.ts` grün (37/37 tests)
- [x] `pnpm vitest run src/lib/services/__tests__/service-schedule-service.integration.test.ts` grün (7/7 Fälle A–G passing, Dev-DB)
- [x] `pnpm typecheck` grün (keine neuen Fehler ggü. 9 pre-existing Baseline-Errors)
- [x] `pnpm lint` grün (keine neuen Fehler in service-schedule- oder order-repository-Files)

#### Manual Verification:
- [ ] Integration-Test Fall C zeigt `order.code` matching `/^WA-\d+$/`
- [ ] Integration-Test Fall E demonstriert `lastCompletedAt` update nach Order-Completion
- [ ] Audit-Logs für `generate_order` + `record_completion` in `audit_logs`-Tabelle sichtbar

**PAUSE — Commit:** `Add ServiceSchedule service layer (Phase B)`

### Phase C — Order-Service-Completion-Hook

1. `src/lib/services/order-service.ts` erweitert: Hook vor
   `repo.findByIdWithInclude`-Re-Fetch (Z. 307, siehe Service-Section).
2. Import-Statement `import * as serviceScheduleService from "./service-schedule-service"`.
3. Regression-Tests in `order-service.test.ts` (falls existiert)
   oder neuer Test-File:
   - Order-Update ohne `serviceScheduleId` → kein Hook-Call.
   - Order-Update mit Status-Change `active → completed` +
     `serviceScheduleId` → `recordCompletion` aufgerufen.
   - Order-Update mit Status-Change `active → active` → kein
     Hook-Call.
   - Order-Update mit Status-Change `completed → completed`
     (idempotent set, z. B. Disponent setzt den Status wiederholt
     oder UI-Bug resubmittet) + `serviceScheduleId` → **kein**
     Hook-Call. Schützt vor Double-`recordCompletion`. Die
     Hook-Logic `data.status === "completed" && existing.status !== "completed"`
     behandelt das bereits korrekt — der Test sichert das ab.
   - Hook-Fehler eats: `recordCompletion` throws → `update`
     returns trotzdem erfolgreich, `console.warn` aufgerufen.

### Success Criteria Phase C

#### Automated Verification:
- [x] `pnpm vitest run src/lib/services/__tests__/order-service.test.ts` grün (inkl. neuer Regression-Tests) — 5/5 tests passing
- [x] `pnpm typecheck` grün (keine neuen Fehler ggü. 9 pre-existing Baseline-Errors; keiner betrifft order-service oder service-schedule)
- [x] `pnpm lint` grün (Phase-C-Files sauber; 9 pre-existing lint errors unverändert)

#### Manual Verification:
- [ ] Integration-Test Fall E (aus Phase B) passt weiterhin — sollte jetzt grün laufen, da Hook live ist
- [ ] Integration-Test Fall E asserted explizit: `existing.serviceScheduleId === scheduleId` nach `repo.findById`-Load (validiert die Prisma-Include-Semantik aus dem Completion-Hook-Abschnitt)
- [ ] Manueller E2E-Test: Order mit `serviceScheduleId` erzeugen (via Generate), Status auf completed setzen, Schedule re-fetchen: `lastCompletedAt` gesetzt

**PAUSE — Commit:** `Hook ServiceSchedule completion into Order lifecycle (Phase C)`

### Phase D — tRPC-Router

1. `src/trpc/routers/serviceSchedules.ts` mit 8 Procedures.
2. `src/trpc/routers/_app.ts` erweitert (Import + Registration).
3. Router-Test `service-schedules-router.test.ts`.
4. Typecheck + Lint.

### Success Criteria Phase D

#### Automated Verification:
- [x] `pnpm vitest run src/trpc/routers/__tests__/service-schedules-router.test.ts` grün (20/20 tests passing)
- [x] `pnpm typecheck` grün (9 errors matches pre-existing baseline; 0 in service-schedules code)
- [x] `pnpm lint` grün (9 errors all in pre-existing unrelated files; 0 in service-schedules code)
- [x] `grep -r "serviceSchedules" src/trpc/routers/_app.ts` findet Import + Registration (L119, L233)

#### Manual Verification:
- [ ] tRPC-Panel (im Dev-Mode) zeigt alle 8 Procedures unter `serviceSchedules.*`
- [ ] Manual call in REST-Client/Studio zu `serviceSchedules.list` returns `{ items: [], total: 0 }` auf frischer DB

**PAUSE — Commit:** `Add ServiceSchedule tRPC router (Phase D)`

### Phase E — UI

In strikter Reihenfolge (jede Schicht baut auf vorige auf):

1. Hooks: `src/hooks/use-service-schedules.ts`.
2. Status-Badge: `schedule-status-badge.tsx`.
3. Liste-Tabelle: `schedule-list-table.tsx`.
4. Detail-Tab: `service-object-schedule-tab.tsx`.
5. Form-Sheet: `schedule-form-sheet.tsx`.
6. Generate-Dialog: `generate-order-dialog.tsx`.
7. Neue Route: `/serviceobjects/schedules/page.tsx`.
8. Detail-Tab-Erweiterung: `serviceobjects/[id]/page.tsx`.
9. Dashboard-Widget: `upcoming-maintenances-widget.tsx` + Einbindung
   in `dashboard/page.tsx`.
10. Sidebar-Nav: `sidebar-nav-config.ts` erweitert.
11. i18n-Keys in de/en.

### Success Criteria Phase E

#### Automated Verification:
- [x] `pnpm build` grün (ohne neue ESLint-Warnings über das Baseline hinaus; `/[locale]/serviceobjects/schedules` route registered)
- [x] `pnpm typecheck` grün (8 pre-existing errors unverändert, keine aus Phase-E-Files)
- [x] `pnpm lint` grün (0 neue Warnings/Errors in Phase-E-Files; alle 9 pre-existing errors unverändert)
- [x] `pnpm test` grün (alle 77 ServiceSchedule-Unit/Router-Tests passing, keine Regression)

#### Manual Verification:
- [x] `/serviceobjects/schedules` lädt → zeigt leere Liste (initial)
- [x] ServiceObject-Detailseite hat Tab "Wartungsplan" zwischen "Historie" und "Hierarchie"
- [x] Im Detail-Tab "Neuer Wartungsplan" → Sheet öffnet sich, Formular funktioniert
- [x] Plan wird nach Save in der Liste sichtbar
- [x] Dashboard-Widget zeigt Count und klickt zu gefilterter Liste
- [x] Sidebar zeigt "Wartungspläne" unter CRM (nur für User mit `service_schedules.view`)
- [x] Overdue-Badge rot, Due-Soon gelb, OK grün
- [x] Mobile-Layout kollabiert zu Cards

**PAUSE — Commit:** `Add ServiceSchedule UI (Phase E)`

### Phase F — E2E + Handbuch

1. `src/e2e-browser/83-service-object-schedules.spec.ts` mit 5-6 Flows.
2. `docs/TERP_HANDBUCH.md` Abschnitt 12b mit 4 Praxisbeispielen.
3. Full E2E-Suite läuft.

### Success Criteria Phase F

#### Automated Verification:
- [ ] `pnpm playwright test src/e2e-browser/83-service-object-schedules.spec.ts` grün
- [ ] Full `pnpm playwright test` Suite grün (keine Regressionen durch neue Navigation)
- [ ] `pnpm typecheck` + `pnpm lint` + `pnpm build` grün

#### Manual Verification:
- [ ] Handbuch-Abschnitt 12b existiert direkt nach 12a
- [ ] Handbuch-TOC aktualisiert
- [ ] Alle 4 Praxisbeispiele step-by-step clickbar (Memory-Feedback `handbook_verification`)
- [ ] QA-Disponent kann ohne Dev-Hilfe den kompletten Flow (Plan → Generate → Complete → Rollover) durchspielen

**PAUSE — Commit:** `Add ServiceSchedule E2E and handbook (Phase F)`

## Testing Strategy

### Unit Tests

- **service-schedule-date-utils**: alle 9 Test-Cases aus Tests-Section
  §Unit-Tests 1.
- **service-schedule-service**: min. 20 Tests aus Section 2.
- **order-service**: 4 neue Regression-Tests für Completion-Hook
  (keiner bestehender Test muss angepasst werden).

### Integration Tests

- **service-schedule-service.integration**: 7 Fälle (A-G) aus
  Section 3. Hinweis: der Test seedet + cleant eigene Test-Fixtures
  mit Test-Prefix-IDs und nutzt Dev-DB ohne Transaction-Rollback
  (Standard-Pattern `.integration.test.ts`).

### End-to-End Tests

- **83-service-object-schedules.spec.ts**: 5-6 Flows. Setup via
  Playwright-API-Fixture (preferred) oder via UI-Clicks mit
  `test.describe.serial`.
- Full-Suite: Existierende Specs `30-billing-documents.spec.ts`,
  `34-billing-recurring.spec.ts`, T-1/T-2-specs dürfen **nicht**
  brechen durch neue Navigation-Items oder Tab-Reihenfolge.

### Manual Testing Steps

1. Dashboard-Widget erscheint für admin-User, nicht für MITARBEITER
   ohne `service_schedules.view`.
2. Schedule anlegen aus Detail-Tab vs. aus globaler Liste (wenn
   `defaultServiceObjectId` absent, muss Dropdown Serviceobjekt
   wählen).
3. Status-Badge visuell:
   - Overdue: rot + "Überfällig"
   - Bald fällig: gelb/amber + "Bald fällig"
   - OK: neutral + "OK"
   - Deaktiviert: gray + "Deaktiviert"
4. Filter-URL: `?status=overdue` lädt direkt gefilterte Liste;
   Browser-Back/Forward funktioniert (lazy-useState re-sync).
5. Generate-Dialog:
   - Checkbox-Label zeigt Employee-Vollname
   - Wenn kein `responsibleEmployeeId`: Checkbox wird ausgeblendet
   - Loading-Spinner während Mutation
6. Nach Generate-Confirm: URL ändert sich zu `/admin/orders/<uuid>`,
   Toast sichtbar, neuer Order hat Code `WA-<n>`.
7. Order auf `completed` setzen → Schedule in Liste zeigt jetzt
   aktualisiertes `lastCompletedAt` und `nextDueAt`.
8. Schedule löschen → Order bleibt, aber `serviceScheduleId` ist
   jetzt `null` (sichtbar nur in Dev-DB-Inspection, keine UI-
   Abweichung für Order).

## Migration Notes

- **Kein Backfill nötig**: Existierende `Order`-Zeilen haben
  `service_schedule_id = NULL` by default. Die FK ist nullable.
- **Keine Daten-Rewrite**: T-3 berührt `Order.customer` nicht
  (T-1-Hard-Rule).
- **Permission-Migration Idempotenz**: Muss doppelt laufen können,
  weil sie T-1-Fix + T-3 zusammen macht (und T-1 bereits in manchen
  Tenants läuft).
- **Activity-Seed ist Opt-In**: Production-Tenants, die T-3 live
  schalten, starten ohne Wartung/Reparatur-Activities. Entweder:
  - (a) Operator ruft `seed-service-activities.ts` manuell via
    Prisma-Studio-Query.
  - (b) Operator legt Activities via UI an
    (`activities.manage`-Permission).
  - (c) Folge-Ticket Branchen-Profile automatisiert das.

## Hard Rules

- **Datei-Budget ~22 neue produktive Files** (Estimate):
  - 3 Migrations
  - Prisma-Schema (edit)
  - 1 Permission-Catalog (edit)
  - 1 Number-Sequence (edit)
  - 1 Activity-Seed-Helper (neu)
  - 3 Services: date-utils, repository, service (neu)
  - 1 Order-Service (edit)
  - 1 tRPC-Router (neu)
  - 1 `_app.ts` (edit)
  - 5 UI-Components (neu)
  - 1 Detail-Tab-Page (edit)
  - 1 Neue Route (neu)
  - 1 Dashboard-Widget (neu) + `dashboard/page.tsx` (edit)
  - 1 Sidebar-Nav (edit)
  - 1 Hook-File (neu)
  - 2 i18n-Files (edit)
  - 1 Handbuch (edit)
  - 4 Test-Files (neu)
  → **gesamt ~22-24 produktive Files, ~8-10 Edits bestehender
  Files**. Liegt im Rahmen; PAUSE nur bei Überschreitung.
- **Keine Änderung an T-1/T-2-Hard-Rules**: `Order.customer`-Freitext
  bleibt, `WhStockMovement.machineId` bleibt, keine Platform↔
  ServiceObject-`@relation`.
- **Neue Order-Spalte `serviceScheduleId` ist minimal-invasiv**: FK
  + Index. Kein Touch an bestehenden Order-Feldern.
- **Kanonisches Pattern-Vorbild ist `BillingRecurringInvoice`.**
  Bei architektonischen Zweifeln Research-Block 1.4 + 2 konsultieren.
- **Tenant-Scoping**: jede neue Query enthält `tenantId`.
  `.generate_order`-Procedure double-checks
  `schedule.tenantId === ctx.tenantId` in
  `serviceScheduleService.generateOrder` vor Order-Create.
- **KEIN Cron in diesem Ticket.** `generateOrder` ist ausschließlich
  manueller 1-Klick-Trigger. Kein Cron-Scaffolding, kein ungenutzter
  Endpoint.
- **KEIN `date-fns`-Import** in neuem Code. Native JS-Date-Arithmetik
  (`setMonth`, `setFullYear`, `setDate`) konsistent mit Recurring-
  Invoice-Pattern.
- **Plan-Traceability über `serviceScheduleId` auf Order**. Keine
  Metadata-JSON-Felder, keine Magic-Strings in `code` oder `name`.
- **Status-Derivation ist Service-Layer-Logik (`deriveStatus`),
  nicht DB-Feld.** Der Badge wird im Service-Layer berechnet und
  durchgereicht. Keine Persistenz-Spalte `status` auf
  `service_schedules`.
- **Audit-Actions**: `create`, `update`, `delete`, `generate_order`,
  `record_completion`. Bare verbs. EntityType snake_case
  `service_schedule`.
- **Soft-Delete-Strategie**: ServiceSchedule nutzt Hard-Delete
  (analog `ReminderTemplate` — Config-Entity). Orders, die
  referenzieren, werden durch `SetNull`-FK geschützt.
- **Null-Handling**: `lastCompletedAt = null` ist valid
  ("noch nie ausgeführt"). `nextDueAt = null` bei TIME_BASED-
  Schedules ohne `lastCompletedAt`. UI rendert
  "Noch nie ausgeführt".
- **CHECK-Constraints MÜSSEN in SQL-Migration explizit sein**.
  Prisma-Enum enforced auf App-Layer, DB-CHECK enforced auf
  Persistenz-Layer — beides.
- **Activity-Seed ist OPTIONAL, NICHT auto-called** in
  `seedUniversalDefaults`.
- **Permission-Gruppen-Migration ist DUAL-PURPOSE**: T-1-Permissions
  UND T-3-Permissions werden zusammen zugewiesen.

## Deviation Notes

### Deviation 1 — `orderService.update` NICHT in `$transaction`

**Ticket-Wortlaut** (Service-Layer, "Erweitert: order-service.ts"):
> Call läuft innerhalb derselben `$transaction`. Fehler im
> recordCompletion blockieren den Order-Update NICHT (try/catch,
> Audit-Warn-Log bei Fehler).

**Code-Realität** (`src/lib/services/order-service.ts:173-313`):
Die bestehende `update(...)`-Funktion ist **nicht** in
`prisma.$transaction(...)` gewrappt — sie führt sequentielle
awaits aus (`repo.findById` → Validierung → `repo.update` →
`auditLog.log` → `repo.findByIdWithInclude`).

**Entscheidung**: Hook wird **sequentiell nach** dem Update aufgerufen,
nicht innerhalb einer `$transaction`. Die semantische Anforderung
aus dem Ticket ("Fehler im recordCompletion blockieren den
Order-Update NICHT") ist mit try/catch um den sequentiellen Call
identisch erfüllt. Eine zusätzliche `$transaction`-Wrapping von
`orderService.update` wäre invasiv und außerhalb des T-3-Scopes.

**Netzwerk-Effekt auf Caller-Behavior**: identisch. Bei
`recordCompletion`-Fehler (DB-connection-lost, Schedule deleted
concurrent): Order-Status-Update ist committed, Schedule-Update
ausgelassen. Das exakt ist die Ticket-Anforderung.

**Wenn bei Implementierung stärkere Atomarität nötig werden sollte**:
PAUSE + Rücksprache, bevor `orderService.update` in `$transaction`
gewrappt wird (potenziell breaking für andere Caller).

### Deviation 2 — Status-Filter Pagination-Semantik

**Ticket**: Nennt `page: 1, pageSize: 50` default in der List-Procedure,
ohne die Interaktion zwischen DB-Pagination und Client-side
Status-Filter zu spezifizieren.

**Entscheidung**: Weil `status` eine derived-column ist
(`deriveStatus` im Service-Layer, nicht DB-Spalte), kann die DB-
Query nicht direkt nach `status="overdue"` filtern. Die Service-
Implementation lädt bis zu `pageSize` rows aus der DB (ohne
status-filter), derived status im Service-Layer, filtert
in-memory. **Caveat**: wenn viele rows "overdue" sind aber rows
1-49 der DB-Sortierung alle "ok" sind, kann die erste Seite
leer zurückkommen, während "Seite 2" alle Overdue enthält.

Für T-3 (geschätzte Tenant-Größe <1000 Schedules) ist das
akzeptabel. Falls später aus Perf-Gründen nötig: Denormalisiertes
`status`-Feld auf `service_schedules` mit nightly-cron-update.

**Keine Ticket-Abweichung** — nur ein Implementation-Detail, das
das Ticket nicht spezifiziert. Dokumentiert hier für Klarheit.

## Open Questions

Keine. Alle im Ticket/Research gelöst.

## References

- Ticket: inline (siehe `/create_plan`-Prompt vom 2026-04-22)
- Research: [`thoughts/shared/research/2026-04-22-serviceobjekte-wartungsintervalle-codebase-analyse.md`](../research/2026-04-22-serviceobjekte-wartungsintervalle-codebase-analyse.md)
- Vorgänger T-1: [`thoughts/shared/plans/2026-04-21-serviceobjekte-stammdaten.md`](2026-04-21-serviceobjekte-stammdaten.md)
- Vorgänger T-2: [`thoughts/shared/plans/2026-04-21-serviceobjekte-historie.md`](2026-04-21-serviceobjekte-historie.md)
- Kanonisches Pattern-Vorbild Cron/Recurring: [`thoughts/shared/plans/2026-03-18-ORD_05-wiederkehrende-rechnungen.md`](2026-03-18-ORD_05-wiederkehrende-rechnungen.md)
- Pattern-Vorbild "Service-Case als Order-Typ": [`thoughts/shared/plans/2026-03-17-ORD_02-kundendienst-service-cases.md`](2026-03-17-ORD_02-kundendienst-service-cases.md)

### Code-Referenzen (Key)

- `prisma/schema.prisma:913-975` — ServiceObject-Model (T-1)
- `prisma/schema.prisma:2467-2503` — Order-Model
- `prisma/schema.prisma:2437-2456` — Activity-Model
- `prisma/schema.prisma:1413,1441` — BillingRecurringInvoice-Präzedenz (nextDueDate + Index)
- `src/lib/services/billing-recurring-invoice-service.ts:29-48` — calculateNextDueDate pattern
- `src/lib/services/billing-recurring-invoice-service.ts:387-507` — generate-in-transaction
- `src/lib/services/number-sequence-service.ts:37-65,89-102` — DEFAULT_PREFIXES + getNextNumber
- `src/lib/services/order-service.ts:173-313` — update (Hook-Target)
- `src/lib/services/order-repository.ts:77-109` — create-Signature (accepts serviceScheduleId)
- `src/lib/services/order-assignment-service.ts:83-130` — Assignment-Create
- `src/lib/services/audit-logs-service.ts:17,173-213` — Tx-Type, log-Signature
- `src/lib/auth/permission-catalog.ts:257-260` — service_objects.* (T-1)
- `src/lib/auth/permission-catalog.ts:287` — billing_recurring.generate (Präzedenz)
- `src/lib/modules/index.ts:70-90` — requireModule
- `src/lib/auth/middleware.ts:40` — requirePermission
- `src/trpc/init.ts:354-382` — tenantProcedure
- `src/trpc/routers/serviceObjects.ts:27` — serviceObjectProcedure-Pattern
- `src/app/[locale]/(dashboard)/serviceobjects/[id]/page.tsx:28,38,96-98` — Tab-Pattern (post-T-2)
- `src/components/billing/recurring-list.tsx:55-74` — Action-in-Row-Pattern
- `src/components/dashboard/probation-dashboard-widget.tsx` — Widget-Pattern
- `src/components/layout/sidebar/sidebar-nav-config.ts:384-424` — CRM-Sektion
- `src/app/[locale]/(dashboard)/dashboard/page.tsx:75-80` — Widget-Gating
- `src/app/[locale]/(dashboard)/admin/employees/page.tsx:58-60,102-104` — URL-Read-Only-Filter
- `supabase/migrations/20260325120000_add_module_permissions_to_groups.sql` — Dual-Purpose-Migration-Pattern
- `src/lib/services/__tests__/probation-service.test.ts:1-127` — Date-Test-Pattern 1
- `src/lib/services/__tests__/billing-recurring-invoice-service.test.ts:83-173` — Date-Test-Pattern 3
- `src/trpc/routers/__tests__/orders-router.test.ts:1-100` — Router-Test-Pattern
- `src/lib/services/__tests__/billing-service-case-service.test.ts:92-132` — `$transaction`-Mock-Pattern
- `src/e2e-browser/34-billing-recurring.spec.ts:132-208` — 1-Klick-Generate-E2E-Pattern
