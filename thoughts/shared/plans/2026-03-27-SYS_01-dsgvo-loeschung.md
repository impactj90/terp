# Implementation Plan: SYS_01 -- DSGVO-Datenloeschung automatisiert

**Ticket:** `TICKET_SYS_01_DSGVO_LOESCHUNG.md`
**Research:** `research/2026-03-27-SYS_01-dsgvo-loeschung.md`
**Date:** 2026-03-27
**Complexity:** M (7 phases, ~12 new files, ~8 modified files)

---

## Data Type Reference (Verified from `prisma/schema.prisma`)

| dataType             | Prisma Model             | Table                       | Date Field        | Cutoff Filter                                                  | Action   |
|----------------------|--------------------------|-----------------------------|-------------------|----------------------------------------------------------------|----------|
| `BOOKINGS`           | `Booking`                | `bookings`                  | `bookingDate`     | `bookingDate < cutoff`                                         | DELETE   |
| `DAILY_VALUES`       | `DailyValue`             | `daily_values`              | `valueDate`       | `valueDate < cutoff`                                           | DELETE   |
| `ABSENCES`           | `AbsenceDay`             | `absence_days`              | `absenceDate`     | `absenceDate < cutoff`                                         | ANONYMIZE|
| `MONTHLY_VALUES`     | `MonthlyValue`           | `monthly_values`            | `year` + `month`  | `OR(year < cutoffYear, AND(year = cutoffYear, month < cutoffMonth))` | DELETE   |
| `AUDIT_LOGS`         | `AuditLog`               | `audit_logs`                | `performedAt`     | `performedAt < cutoff`                                         | DELETE   |
| `TERMINAL_BOOKINGS`  | `RawTerminalBooking`     | `raw_terminal_bookings`     | `bookingDate`     | `bookingDate < cutoff`                                         | DELETE   |
| `PERSONNEL_FILE`     | `HrPersonnelFileEntry`   | `hr_personnel_file_entries` | `entryDate`       | `entryDate < cutoff`                                           | DELETE   |
| `CORRECTION_MESSAGES`| `CorrectionMessage`      | `correction_messages`       | `createdAt`       | `createdAt < cutoff`                                           | DELETE   |
| `STOCK_MOVEMENTS`    | `WhStockMovement`        | `wh_stock_movements`        | `date`            | `date < cutoff`                                                | ANONYMIZE|

### Anonymization Details

**ABSENCES (AbsenceDay):** Set `employeeId` to a sentinel deleted-employee UUID is not viable (FK constraint). Instead, null out personal-context fields:
- `notes` -> `null`
- `approvedBy` -> `null`
- `createdBy` -> `null`
- `rejectionReason` -> `null`
- Keep: `absenceDate`, `absenceTypeId`, `duration`, `halfDayPeriod`, `status` (statistical data)

**STOCK_MOVEMENTS (WhStockMovement):** Null out personal-context fields:
- `createdById` -> `null`
- `notes` -> `null`
- `reason` -> `null`
- Keep: `articleId`, `type`, `quantity`, `previousStock`, `newStock`, `date`, `purchaseOrderId`, `documentId`, `orderId` (business data)

### FK Cascade Considerations

- **Booking** has `derivedBookings` (self-referential, `onDelete: Cascade`) and `rawTerminalBookings` (FK with `onDelete: SetNull`). Deleting old bookings will cascade-delete their derived bookings and set `processedBookingId = null` on raw terminal bookings.
- **HrPersonnelFileEntry** has `attachments` (`onDelete: Cascade`). DB cascade handles record deletion, but **Supabase Storage files must be explicitly deleted** before the DB records are removed.
- **CorrectionMessage** is a configuration table (correction rule definitions), NOT individual correction records. The `Correction` model (table `corrections`, field `correctionDate`) stores actual employee correction records. The ticket says `CORRECTION_MESSAGES` but we implement it as specified -- delete old CorrectionMessage config rows. In practice this type will rarely have old data to delete.
- **MonthlyValue** uses `year`+`month` (Int fields), not a Date. Cutoff logic must decompose `subMonths(now, retentionMonths)` into year/month components.

---

## Phase 1: Database & Models

**Dependencies:** None
**Files to create:**
- `supabase/migrations/20260409100000_create_dsgvo_retention_tables.sql`
- `supabase/migrations/20260409100001_add_dsgvo_permissions_to_groups.sql`

**Files to modify:**
- `prisma/schema.prisma` -- add `DsgvoRetentionRule`, `DsgvoDeleteLog` models + Tenant relation arrays
- `supabase/seed.sql` -- add default retention rules for dev tenant

### 1.1 Prisma Schema Changes

At the end of `prisma/schema.prisma` (after `HrPersonnelFileAttachment` model), add:

```prisma
// -----------------------------------------------------------------------------
// DsgvoRetentionRule
// -----------------------------------------------------------------------------
// Migration: 20260409100000
//
// Configurable data retention rules per tenant and data type.
// Used by DSGVO cron job and manual execution.

model DsgvoRetentionRule {
  id              String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId        String   @map("tenant_id") @db.Uuid
  dataType        String   @map("data_type") @db.VarChar(50)
  retentionMonths Int      @map("retention_months") @db.Integer
  action          String   @default("DELETE") @db.VarChar(20)
  isActive        Boolean  @default(true) @map("is_active")
  description     String?  @db.Text
  createdAt       DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt       DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@unique([tenantId, dataType])
  @@index([tenantId])
  @@map("dsgvo_retention_rules")
}

// -----------------------------------------------------------------------------
// DsgvoDeleteLog
// -----------------------------------------------------------------------------
// Migration: 20260409100000
//
// Immutable audit log of all DSGVO retention executions.

model DsgvoDeleteLog {
  id           String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId     String   @map("tenant_id") @db.Uuid
  dataType     String   @map("data_type") @db.VarChar(50)
  action       String   @db.VarChar(20)
  recordCount  Int      @map("record_count") @db.Integer
  cutoffDate   DateTime @map("cutoff_date") @db.Date
  executedAt   DateTime @default(now()) @map("executed_at") @db.Timestamptz(6)
  executedBy   String?  @map("executed_by") @db.Uuid
  durationMs   Int?     @map("duration_ms") @db.Integer
  error        String?  @db.Text
  details      Json?    @db.JsonB

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@index([tenantId])
  @@index([tenantId, executedAt])
  @@map("dsgvo_delete_logs")
}
```

Add relation arrays to `Tenant` model (after the `hrPersonnelFileAttachments` line, before `@@index`):

```prisma
  // DSGVO
  dsgvoRetentionRules         DsgvoRetentionRule[]
  dsgvoDeleteLogs             DsgvoDeleteLog[]
```

### 1.2 Migration: `20260409100000_create_dsgvo_retention_tables.sql`

```sql
-- SYS_01: Create DSGVO retention rules and delete log tables

CREATE TABLE dsgvo_retention_rules (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  data_type        VARCHAR(50) NOT NULL,
  retention_months INTEGER NOT NULL,
  action           VARCHAR(20) NOT NULL DEFAULT 'DELETE',
  is_active        BOOLEAN NOT NULL DEFAULT true,
  description      TEXT,
  created_at       TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, data_type)
);

CREATE INDEX idx_dsgvo_retention_rules_tenant ON dsgvo_retention_rules(tenant_id);

CREATE TABLE dsgvo_delete_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  data_type     VARCHAR(50) NOT NULL,
  action        VARCHAR(20) NOT NULL,
  record_count  INTEGER NOT NULL,
  cutoff_date   DATE NOT NULL,
  executed_at   TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  executed_by   UUID,
  duration_ms   INTEGER,
  error         TEXT,
  details       JSONB
);

CREATE INDEX idx_dsgvo_delete_logs_tenant ON dsgvo_delete_logs(tenant_id);
CREATE INDEX idx_dsgvo_delete_logs_tenant_executed ON dsgvo_delete_logs(tenant_id, executed_at);

-- Insert default retention rules for all existing tenants
INSERT INTO dsgvo_retention_rules (tenant_id, data_type, retention_months, action, is_active, description)
SELECT t.id, rules.data_type, rules.retention_months, rules.action, false, rules.description
FROM tenants t
CROSS JOIN (VALUES
  ('BOOKINGS',           36,  'DELETE',    'Stempelbuchungen (Kommen/Gehen)'),
  ('DAILY_VALUES',       36,  'DELETE',    'Tageswerte (berechnete Zeiten)'),
  ('ABSENCES',           36,  'ANONYMIZE', 'Abwesenheiten (Urlaub, Krank etc.)'),
  ('MONTHLY_VALUES',     60,  'DELETE',    'Monatswerte (Konten, Flexzeit)'),
  ('AUDIT_LOGS',         24,  'DELETE',    'Audit-Protokoll'),
  ('TERMINAL_BOOKINGS',  12,  'DELETE',    'Terminal-Rohdaten'),
  ('PERSONNEL_FILE',     120, 'DELETE',    'Personalakten-Eintraege'),
  ('CORRECTION_MESSAGES',12,  'DELETE',    'Korrekturassistent-Meldungen'),
  ('STOCK_MOVEMENTS',    120, 'ANONYMIZE', 'Lagerbewegungen')
) AS rules(data_type, retention_months, action, description);
```

### 1.3 Migration: `20260409100001_add_dsgvo_permissions_to_groups.sql`

Permission UUIDs (UUIDv5 with namespace `f68a2ad7-6fd8-4d61-9b0e-0ea4a0d6c8a1`):
- `dsgvo.view`    = `4f9cbdbe-68b4-5cb1-9bd6-b8106ee901ac`
- `dsgvo.manage`  = `d3866c21-acea-5ab8-8f02-d42c5c56e9f0`
- `dsgvo.execute` = `ee6d86f9-e675-5e80-92a6-08d473759dce`

```sql
-- SYS_01: Add DSGVO permissions to ADMIN and PERSONAL groups
--
-- Permission UUIDs (UUIDv5 with namespace f68a2ad7-6fd8-4d61-9b0e-0ea4a0d6c8a1):
--   dsgvo.view    = 4f9cbdbe-68b4-5cb1-9bd6-b8106ee901ac
--   dsgvo.manage  = d3866c21-acea-5ab8-8f02-d42c5c56e9f0
--   dsgvo.execute = ee6d86f9-e675-5e80-92a6-08d473759dce

-- PERSONAL: all 3 dsgvo permissions
UPDATE user_groups SET permissions = (
  SELECT jsonb_agg(DISTINCT val) FROM (
    SELECT jsonb_array_elements(permissions) AS val
    UNION ALL SELECT '"4f9cbdbe-68b4-5cb1-9bd6-b8106ee901ac"'::jsonb  -- dsgvo.view
    UNION ALL SELECT '"d3866c21-acea-5ab8-8f02-d42c5c56e9f0"'::jsonb  -- dsgvo.manage
    UNION ALL SELECT '"ee6d86f9-e675-5e80-92a6-08d473759dce"'::jsonb  -- dsgvo.execute
  ) sub
) WHERE code = 'PERSONAL' AND tenant_id IS NULL;

-- ADMIN: all 3 dsgvo permissions
UPDATE user_groups SET permissions = (
  SELECT jsonb_agg(DISTINCT val) FROM (
    SELECT jsonb_array_elements(permissions) AS val
    UNION ALL SELECT '"4f9cbdbe-68b4-5cb1-9bd6-b8106ee901ac"'::jsonb  -- dsgvo.view
    UNION ALL SELECT '"d3866c21-acea-5ab8-8f02-d42c5c56e9f0"'::jsonb  -- dsgvo.manage
    UNION ALL SELECT '"ee6d86f9-e675-5e80-92a6-08d473759dce"'::jsonb  -- dsgvo.execute
  ) sub
) WHERE code = 'ADMIN' AND tenant_id IS NULL;
```

### 1.4 Seed Data

Add to `supabase/seed.sql` (after existing seed data): default retention rules for the dev tenant, matching the migration CROSS JOIN above.

### 1.5 Verification

```bash
pnpm db:reset          # Apply migrations + seed
pnpm db:generate       # Regenerate Prisma client
pnpm typecheck         # Verify schema compiles
```

---

## Phase 2: Service & Repository Layer

**Dependencies:** Phase 1 (Prisma models must exist)
**Files to create:**
- `src/lib/services/dsgvo-retention-repository.ts`
- `src/lib/services/dsgvo-retention-service.ts`

### 2.1 Repository: `dsgvo-retention-repository.ts`

Pattern: Follow `hr-personnel-file-repository.ts` -- pure Prisma data access, `PrismaClient` as first arg, `tenantId` as second.

```ts
import type { PrismaClient } from "@/generated/prisma/client"
```

**Functions to implement:**

#### Rules CRUD

```ts
// Find all retention rules for a tenant
export async function findRules(prisma: PrismaClient, tenantId: string)
// → prisma.dsgvoRetentionRule.findMany({ where: { tenantId }, orderBy: { dataType: "asc" } })

// Find a single rule by tenant + dataType
export async function findRuleByDataType(prisma: PrismaClient, tenantId: string, dataType: string)
// → prisma.dsgvoRetentionRule.findFirst({ where: { tenantId, dataType } })

// Upsert a rule (create if not exists, update if exists)
export async function upsertRule(prisma: PrismaClient, tenantId: string, data: { dataType: string; retentionMonths: number; action: string; isActive: boolean; description?: string | null })
// → prisma.dsgvoRetentionRule.upsert({ where: { tenantId_dataType: { tenantId, dataType: data.dataType } }, create: { tenantId, ...data }, update: data })

// Find all active rules for tenant (optionally filtered to a specific dataType)
export async function findActiveRules(prisma: PrismaClient, tenantId: string, dataType?: string)
// → prisma.dsgvoRetentionRule.findMany({ where: { tenantId, isActive: true, ...(dataType ? { dataType } : {}) } })
```

#### Count functions (for preview)

One function per data type. All MUST include `tenantId` in the WHERE clause.

```ts
export async function countBookings(prisma: PrismaClient, tenantId: string, cutoffDate: Date)
// → prisma.booking.count({ where: { tenantId, bookingDate: { lt: cutoffDate } } })

export async function countDailyValues(prisma: PrismaClient, tenantId: string, cutoffDate: Date)
// → prisma.dailyValue.count({ where: { tenantId, valueDate: { lt: cutoffDate } } })

export async function countAbsences(prisma: PrismaClient, tenantId: string, cutoffDate: Date)
// → prisma.absenceDay.count({ where: { tenantId, absenceDate: { lt: cutoffDate } } })

export async function countMonthlyValues(prisma: PrismaClient, tenantId: string, cutoffYear: number, cutoffMonth: number)
// → prisma.monthlyValue.count({ where: { tenantId, OR: [{ year: { lt: cutoffYear } }, { year: cutoffYear, month: { lt: cutoffMonth } }] } })

export async function countAuditLogs(prisma: PrismaClient, tenantId: string, cutoffDate: Date)
// → prisma.auditLog.count({ where: { tenantId, performedAt: { lt: cutoffDate } } })

export async function countTerminalBookings(prisma: PrismaClient, tenantId: string, cutoffDate: Date)
// → prisma.rawTerminalBooking.count({ where: { tenantId, bookingDate: { lt: cutoffDate } } })

export async function countPersonnelFileEntries(prisma: PrismaClient, tenantId: string, cutoffDate: Date)
// → prisma.hrPersonnelFileEntry.count({ where: { tenantId, entryDate: { lt: cutoffDate } } })

export async function countCorrectionMessages(prisma: PrismaClient, tenantId: string, cutoffDate: Date)
// → prisma.correctionMessage.count({ where: { tenantId, createdAt: { lt: cutoffDate } } })

export async function countStockMovements(prisma: PrismaClient, tenantId: string, cutoffDate: Date)
// → prisma.whStockMovement.count({ where: { tenantId, date: { lt: cutoffDate } } })
```

#### Delete functions

```ts
export async function deleteBookings(prisma: PrismaClient, tenantId: string, cutoffDate: Date)
// → prisma.booking.deleteMany({ where: { tenantId, bookingDate: { lt: cutoffDate } } })

export async function deleteDailyValues(prisma: PrismaClient, tenantId: string, cutoffDate: Date)
// → prisma.dailyValue.deleteMany({ where: { tenantId, valueDate: { lt: cutoffDate } } })

export async function deleteMonthlyValues(prisma: PrismaClient, tenantId: string, cutoffYear: number, cutoffMonth: number)
// → prisma.monthlyValue.deleteMany({ where: { tenantId, OR: [{ year: { lt: cutoffYear } }, { year: cutoffYear, month: { lt: cutoffMonth } }] } })

export async function deleteAuditLogs(prisma: PrismaClient, tenantId: string, cutoffDate: Date)
// → prisma.auditLog.deleteMany({ where: { tenantId, performedAt: { lt: cutoffDate } } })

export async function deleteTerminalBookings(prisma: PrismaClient, tenantId: string, cutoffDate: Date)
// → prisma.rawTerminalBooking.deleteMany({ where: { tenantId, bookingDate: { lt: cutoffDate } } })

export async function deleteCorrectionMessages(prisma: PrismaClient, tenantId: string, cutoffDate: Date)
// → prisma.correctionMessage.deleteMany({ where: { tenantId, createdAt: { lt: cutoffDate } } })
```

#### Delete with storage cleanup (PERSONNEL_FILE)

```ts
export async function findPersonnelFileAttachmentPaths(prisma: PrismaClient, tenantId: string, cutoffDate: Date)
// → prisma.hrPersonnelFileAttachment.findMany({
//     where: { tenantId, entry: { entryDate: { lt: cutoffDate } } },
//     select: { storagePath: true },
//   })
// Returns list of storage paths to delete from Supabase Storage BEFORE deleting DB records.

export async function deletePersonnelFileEntries(prisma: PrismaClient, tenantId: string, cutoffDate: Date)
// → prisma.hrPersonnelFileEntry.deleteMany({ where: { tenantId, entryDate: { lt: cutoffDate } } })
// Attachments cascade-delete via FK.
```

#### Anonymize functions

```ts
export async function anonymizeAbsences(prisma: PrismaClient, tenantId: string, cutoffDate: Date)
// → prisma.absenceDay.updateMany({
//     where: { tenantId, absenceDate: { lt: cutoffDate } },
//     data: { notes: null, approvedBy: null, createdBy: null, rejectionReason: null },
//   })

export async function anonymizeStockMovements(prisma: PrismaClient, tenantId: string, cutoffDate: Date)
// → prisma.whStockMovement.updateMany({
//     where: { tenantId, date: { lt: cutoffDate } },
//     data: { createdById: null, notes: null, reason: null },
//   })
```

#### Log functions

```ts
export async function createDeleteLog(prisma: PrismaClient, data: { tenantId: string; dataType: string; action: string; recordCount: number; cutoffDate: Date; executedBy?: string | null; durationMs?: number | null; error?: string | null; details?: unknown })
// → prisma.dsgvoDeleteLog.create({ data })

export async function findDeleteLogs(prisma: PrismaClient, tenantId: string, params: { page?: number; pageSize?: number })
// → prisma.dsgvoDeleteLog.findMany({ where: { tenantId }, orderBy: { executedAt: "desc" }, skip, take })
// + prisma.dsgvoDeleteLog.count({ where: { tenantId } })
// Returns { items, total }
```

### 2.2 Service: `dsgvo-retention-service.ts`

Pattern: Follow `system-settings-service.ts` -- business logic, imports from repository, error classes.

```ts
import type { PrismaClient } from "@/generated/prisma/client"
import * as repo from "./dsgvo-retention-repository"
import { subMonths } from "date-fns"
```

**Constants:**

```ts
const MINIMUM_RETENTION_MONTHS = 6

const VALID_DATA_TYPES = [
  "BOOKINGS", "DAILY_VALUES", "ABSENCES", "MONTHLY_VALUES",
  "AUDIT_LOGS", "TERMINAL_BOOKINGS", "PERSONNEL_FILE",
  "CORRECTION_MESSAGES", "STOCK_MOVEMENTS",
] as const

type DataType = typeof VALID_DATA_TYPES[number]

const LEGAL_MINIMUM_MONTHS: Partial<Record<DataType, number>> = {
  PERSONNEL_FILE: 120,   // 10 years (German employment law)
  STOCK_MOVEMENTS: 120,  // 10 years (HGB/AO)
  MONTHLY_VALUES: 60,    // 5 years (tax)
}
```

**Error classes:**

```ts
export class DsgvoValidationError extends Error {
  constructor(message: string) { super(message); this.name = "DsgvoValidationError" }
}

export class DsgvoNotFoundError extends Error {
  constructor(message: string) { super(message); this.name = "DsgvoNotFoundError" }
}
```

**Functions:**

```ts
// List all rules for a tenant. If none exist, create defaults first.
export async function listRules(prisma: PrismaClient, tenantId: string)

// Update a rule. Validates minimum retention months.
export async function updateRule(prisma: PrismaClient, tenantId: string, input: {
  dataType: string; retentionMonths: number; action: string; isActive: boolean; description?: string | null
})
// Validation:
//   - dataType must be in VALID_DATA_TYPES
//   - retentionMonths >= MINIMUM_RETENTION_MONTHS (6)
//   - action must be "DELETE" or "ANONYMIZE"
//   - If action is "ANONYMIZE", dataType must support it (ABSENCES or STOCK_MOVEMENTS)
//   - Warn if retentionMonths < LEGAL_MINIMUM_MONTHS[dataType] (return warning in response, don't block)

// Preview: count records that would be affected
export async function previewRetention(prisma: PrismaClient, tenantId: string, dataType?: string)
// Returns: Array<{ dataType, count, cutoffDate, action, retentionMonths, legalWarning?: string }>
// Logic:
//   1. Get active rules (optionally filtered to dataType)
//   2. For each rule, compute cutoffDate = subMonths(new Date(), rule.retentionMonths)
//   3. Call the appropriate count function from repository
//   4. Return preview array

// Execute retention: delete/anonymize records past cutoff
export async function executeRetention(
  prisma: PrismaClient,
  tenantId: string,
  options: { dataType?: string; dryRun?: boolean; executedBy?: string }
)
// Returns: Array<{ dataType, action, recordCount, cutoffDate, durationMs, dryRun, error?: string }>
// Logic:
//   1. Get active rules (optionally filtered to dataType)
//   2. For each rule:
//      a. Compute cutoffDate = subMonths(new Date(), rule.retentionMonths)
//      b. Count affected records
//      c. If dryRun or count === 0, add to results and continue
//      d. Start timer
//      e. Call delete or anonymize function:
//         - For PERSONNEL_FILE: first get attachment storage paths, delete from Supabase Storage, then delete DB records
//         - For ABSENCES: call anonymizeAbsences
//         - For STOCK_MOVEMENTS: call anonymizeStockMovements
//         - For MONTHLY_VALUES: decompose cutoffDate into year/month, call deleteMonthlyValues
//         - For all others: call the corresponding delete function
//      f. Record duration
//      g. Create DsgvoDeleteLog entry
//      h. Add to results
//   3. Return results array

// List delete logs
export async function listDeleteLogs(prisma: PrismaClient, tenantId: string, params: { page?: number; pageSize?: number })

// Ensure default rules exist for a tenant (idempotent)
export async function ensureDefaultRules(prisma: PrismaClient, tenantId: string)
// Creates rules for all VALID_DATA_TYPES if they don't exist, all inactive by default
```

**Personnel File Storage Cleanup Helper:**

```ts
// Delete files from Supabase Storage bucket "hr-personnel-files"
async function deleteStorageFiles(storagePaths: string[]): Promise<void>
// Uses Supabase admin client: createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
// Calls supabase.storage.from("hr-personnel-files").remove(storagePaths)
// Logs errors but does not throw (best-effort cleanup)
```

### 2.3 Verification

```bash
pnpm typecheck   # Ensure service/repo compile with Prisma client types
```

---

## Phase 3: tRPC Router

**Dependencies:** Phase 2 (service must exist)
**Files to create:**
- `src/trpc/routers/dsgvo.ts`

**Files to modify:**
- `src/lib/auth/permission-catalog.ts`
- `src/trpc/routers/_app.ts`

### 3.1 Permission Catalog

In `src/lib/auth/permission-catalog.ts`, add 3 permissions to `ALL_PERMISSIONS` array, after the HR Personnel File section (before the closing `]`):

```ts
  // DSGVO Data Retention
  p("dsgvo.view", "dsgvo", "view", "View DSGVO retention rules and logs"),
  p("dsgvo.manage", "dsgvo", "manage", "Manage DSGVO retention rules"),
  p("dsgvo.execute", "dsgvo", "execute", "Execute DSGVO data deletion"),
```

**Note:** Update the count assertion in `src/trpc/routers/__tests__/permissions-router.test.ts` from `118` to `121` (3 new permissions). The actual count can be checked -- the test currently asserts `toHaveLength(118)`.

### 3.2 Router: `src/trpc/routers/dsgvo.ts`

Pattern: Follow `auditLogs.ts` -- flat router file with permission constants and try/catch error handling.

```ts
import { z } from "zod"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { requirePermission } from "@/lib/auth/middleware"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import { handleServiceError } from "@/trpc/errors"
import * as dsgvoService from "@/lib/services/dsgvo-retention-service"
```

**Permission constants:**

```ts
const DSGVO_VIEW = permissionIdByKey("dsgvo.view")!
const DSGVO_MANAGE = permissionIdByKey("dsgvo.manage")!
const DSGVO_EXECUTE = permissionIdByKey("dsgvo.execute")!
```

**Procedures:**

| Procedure       | Type     | Permission     | Input Schema                                                                                                       |
|-----------------|----------|----------------|--------------------------------------------------------------------------------------------------------------------|
| `rules.list`    | query    | `dsgvo.view`   | `{}`  (empty)                                                                                                      |
| `rules.update`  | mutation | `dsgvo.manage` | `{ dataType: z.string(), retentionMonths: z.number().int().min(6), action: z.enum(["DELETE","ANONYMIZE"]), isActive: z.boolean(), description: z.string().nullable().optional() }` |
| `preview`       | query    | `dsgvo.view`   | `{ dataType: z.string().optional() }`                                                                              |
| `execute`       | mutation | `dsgvo.execute`| `{ dataType: z.string().optional(), dryRun: z.boolean().optional().default(false) }`                               |
| `logs.list`     | query    | `dsgvo.view`   | `{ page: z.number().int().min(1).optional().default(1), pageSize: z.number().int().min(1).max(100).optional().default(20) }` |

Each procedure: `tenantProcedure.use(requirePermission(PERM)).input(schema).query/mutation(async ({ ctx, input }) => { try { return await dsgvoService.xxx(ctx.prisma, ctx.tenantId!, input) } catch (err) { handleServiceError(err) } })`

For `execute` mutation, also pass `executedBy: ctx.user?.id` from context.

### 3.3 Root Router Registration

In `src/trpc/routers/_app.ts`:

```ts
// Add import at top:
import { dsgvoRouter } from "./dsgvo"

// Add to appRouter object (alphabetically, after `dailyValues`):
dsgvo: dsgvoRouter,
```

### 3.4 Verification

```bash
pnpm typecheck   # Router compiles
pnpm test -- src/trpc/routers/__tests__/permission-catalog.test.ts  # Permission count updated
```

---

## Phase 4: Cron Job

**Dependencies:** Phase 2 (service must exist)
**Files to create:**
- `src/app/api/cron/dsgvo-retention/route.ts`

**Files to modify:**
- `vercel.json`

### 4.1 Cron Route: `src/app/api/cron/dsgvo-retention/route.ts`

Pattern: Follow `src/app/api/cron/wh-corrections/route.ts` exactly.

```ts
import { NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import * as dsgvoService from "@/lib/services/dsgvo-retention-service"

export const runtime = "nodejs"
export const maxDuration = 300

export async function GET(request: Request) {
  // 1. Validate CRON_SECRET (same pattern as wh-corrections)
  const authHeader = request.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return NextResponse.json({ error: "Service unavailable" }, { status: 503 })
  if (authHeader !== `Bearer ${cronSecret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  console.log("[dsgvo-retention] Starting cron job")

  try {
    // 2. Find all active tenants
    const tenants = await prisma.tenant.findMany({
      where: { isActive: true },
      select: { id: true },
    })

    console.log(`[dsgvo-retention] Processing ${tenants.length} tenants`)

    const results = []

    // 3. Process each tenant sequentially
    for (const tenant of tenants) {
      try {
        const result = await dsgvoService.executeRetention(
          prisma,
          tenant.id,
          { dryRun: false, executedBy: null }  // Cron = no user
        )
        const totalDeleted = result.reduce((sum, r) => sum + r.recordCount, 0)
        results.push({ tenantId: tenant.id, totalDeleted, types: result.length })
      } catch (err) {
        console.error(`[dsgvo-retention] Error for tenant ${tenant.id}:`, err)
        results.push({
          tenantId: tenant.id,
          totalDeleted: 0,
          types: 0,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }

    const grandTotal = results.reduce((sum, r) => sum + r.totalDeleted, 0)
    console.log(`[dsgvo-retention] Complete: ${tenants.length} tenants, ${grandTotal} total records`)

    return NextResponse.json({
      ok: true,
      tenantsProcessed: tenants.length,
      totalRecordsDeleted: grandTotal,
      results,
    })
  } catch (err) {
    console.error("[dsgvo-retention] Fatal error:", err)
    return NextResponse.json(
      { error: "Internal server error", message: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    )
  }
}
```

### 4.2 Vercel Cron Config

Add to `vercel.json` `crons` array:

```json
{
  "path": "/api/cron/dsgvo-retention",
  "schedule": "0 3 1 * *"
}
```

This runs monthly on the 1st at 03:00 UTC (as specified in ticket).

### 4.3 Verification

```bash
# Manual test via curl (requires running dev server):
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3001/api/cron/dsgvo-retention
```

---

## Phase 5: Frontend

**Dependencies:** Phase 3 (tRPC router must exist)
**Files to create:**
- `src/hooks/use-dsgvo.ts`
- `src/app/[locale]/(dashboard)/admin/dsgvo/page.tsx`
- `src/components/dsgvo/retention-rules-table.tsx`
- `src/components/dsgvo/retention-preview-dialog.tsx`
- `src/components/dsgvo/retention-logs-table.tsx`
- `src/components/dsgvo/dsgvo-info-card.tsx`

**Files to modify:**
- `src/hooks/index.ts`
- `src/components/layout/sidebar/sidebar-nav-config.ts`
- `messages/de.json`
- `messages/en.json`

### 5.1 Hooks: `src/hooks/use-dsgvo.ts`

Pattern: Follow `src/hooks/use-hr-personnel-file.ts`.

```ts
import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

export function useDsgvoRules() {
  const trpc = useTRPC()
  return useQuery(trpc.dsgvo.rules.list.queryOptions())
}

export function useUpdateDsgvoRule() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.dsgvo.rules.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.dsgvo.rules.list.queryKey() })
      queryClient.invalidateQueries({ queryKey: trpc.dsgvo.preview.queryKey() })
    },
  })
}

export function useDsgvoPreview(dataType?: string) {
  const trpc = useTRPC()
  return useQuery(
    trpc.dsgvo.preview.queryOptions({ dataType })
  )
}

export function useExecuteDsgvoRetention() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.dsgvo.execute.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.dsgvo.logs.list.queryKey() })
      queryClient.invalidateQueries({ queryKey: trpc.dsgvo.preview.queryKey() })
    },
  })
}

export function useDsgvoLogs(params?: { page?: number; pageSize?: number }) {
  const trpc = useTRPC()
  return useQuery(trpc.dsgvo.logs.list.queryOptions(params))
}
```

### 5.2 Hooks Barrel Export

In `src/hooks/index.ts`, add after the HR Personnel File section (end of file):

```ts
// DSGVO Retention
export {
  useDsgvoRules,
  useUpdateDsgvoRule,
  useDsgvoPreview,
  useExecuteDsgvoRetention,
  useDsgvoLogs,
} from './use-dsgvo'
```

### 5.3 Sidebar Navigation

In `src/components/layout/sidebar/sidebar-nav-config.ts`:

1. Add `ShieldAlert` to the lucide-react import at top
2. Add nav item to the `administration` section, after `settings` entry:

```ts
{
  titleKey: 'dsgvoRetention',
  href: '/admin/dsgvo',
  icon: ShieldAlert,
  permissions: ['dsgvo.view'],
},
```

### 5.4 i18n Translations

**`messages/de.json`** -- add to `nav` section:
```json
"dsgvoRetention": "DSGVO-Datenlöschung"
```

Add new top-level `dsgvo` namespace:
```json
"dsgvo": {
  "page": {
    "title": "DSGVO-Datenlöschung",
    "subtitle": "Automatisierte Löschung und Anonymisierung personenbezogener Daten gemäß DSGVO"
  },
  "rules": {
    "title": "Aufbewahrungsregeln",
    "dataType": "Datentyp",
    "retentionMonths": "Aufbewahrung (Monate)",
    "action": "Aktion",
    "active": "Aktiv",
    "affectedRecords": "Betroffene Datensätze",
    "save": "Speichern",
    "saved": "Gespeichert",
    "edit": "Bearbeiten",
    "minMonths": "Mindestens {min} Monate",
    "legalWarning": "Achtung: Gesetzliche Aufbewahrungsfrist beträgt {months} Monate ({years} Jahre)"
  },
  "actions": {
    "DELETE": "Löschen",
    "ANONYMIZE": "Anonymisieren"
  },
  "dataTypes": {
    "BOOKINGS": "Buchungen",
    "DAILY_VALUES": "Tageswerte",
    "ABSENCES": "Abwesenheiten",
    "MONTHLY_VALUES": "Monatswerte",
    "AUDIT_LOGS": "Audit-Protokoll",
    "TERMINAL_BOOKINGS": "Terminal-Rohdaten",
    "PERSONNEL_FILE": "Personalakten",
    "CORRECTION_MESSAGES": "Korrekturmeldungen",
    "STOCK_MOVEMENTS": "Lagerbewegungen"
  },
  "preview": {
    "title": "Vorschau Datenlöschung",
    "description": "Folgende Datensätze würden bei Ausführung gelöscht/anonymisiert:",
    "noRecords": "Keine betroffenen Datensätze gefunden",
    "dryRun": "Vorschau (keine Löschung)",
    "execute": "Jetzt ausführen",
    "confirmTitle": "Datenlöschung bestätigen",
    "confirmDescription": "Diese Aktion kann nicht rückgängig gemacht werden. Bitte geben Sie LÖSCHEN ein, um fortzufahren.",
    "confirmInput": "LÖSCHEN",
    "confirmPlaceholder": "LÖSCHEN eingeben...",
    "executing": "Wird ausgeführt...",
    "success": "Datenlöschung erfolgreich",
    "successDescription": "{count} Datensätze wurden verarbeitet"
  },
  "logs": {
    "title": "Löschprotokoll",
    "executedAt": "Ausgeführt am",
    "dataType": "Datentyp",
    "action": "Aktion",
    "recordCount": "Anzahl",
    "cutoffDate": "Stichtag",
    "durationMs": "Dauer",
    "executedBy": "Ausgeführt von",
    "noLogs": "Noch keine Löschvorgänge protokolliert",
    "cron": "Automatisch (Cron)"
  },
  "info": {
    "title": "Hinweise zur DSGVO-Datenlöschung",
    "description": "Die DSGVO (Datenschutz-Grundverordnung) verpflichtet Unternehmen, personenbezogene Daten nach Ablauf des Verarbeitungszwecks zu löschen.",
    "legalRetention": "Gesetzliche Aufbewahrungsfristen",
    "legalNote": "Einige Datentypen unterliegen gesetzlichen Mindest-Aufbewahrungsfristen:",
    "personnelFile": "Personalakten: 10 Jahre (nach Austritt)",
    "stockMovements": "Lagerbewegungen: 10 Jahre (HGB §257)",
    "monthlyValues": "Monatswerte: 5 Jahre (Steuerrecht)",
    "anonymizeNote": "Bei Anonymisierung werden personenbezogene Felder entfernt, Sachdaten (Zeiten, Mengen) bleiben erhalten.",
    "cronNote": "Die automatische Löschung erfolgt monatlich am 1. um 03:00 UTC für alle aktiven Regeln."
  }
}
```

**`messages/en.json`** -- same structure with English translations:
```json
"dsgvoRetention": "GDPR Data Retention"
```

```json
"dsgvo": {
  "page": {
    "title": "GDPR Data Retention",
    "subtitle": "Automated deletion and anonymization of personal data per GDPR"
  },
  "rules": {
    "title": "Retention Rules",
    "dataType": "Data Type",
    "retentionMonths": "Retention (Months)",
    "action": "Action",
    "active": "Active",
    "affectedRecords": "Affected Records",
    "save": "Save",
    "saved": "Saved",
    "edit": "Edit",
    "minMonths": "Minimum {min} months",
    "legalWarning": "Warning: Legal retention period is {months} months ({years} years)"
  },
  "actions": {
    "DELETE": "Delete",
    "ANONYMIZE": "Anonymize"
  },
  "dataTypes": {
    "BOOKINGS": "Bookings",
    "DAILY_VALUES": "Daily Values",
    "ABSENCES": "Absences",
    "MONTHLY_VALUES": "Monthly Values",
    "AUDIT_LOGS": "Audit Logs",
    "TERMINAL_BOOKINGS": "Terminal Bookings",
    "PERSONNEL_FILE": "Personnel Files",
    "CORRECTION_MESSAGES": "Correction Messages",
    "STOCK_MOVEMENTS": "Stock Movements"
  },
  "preview": {
    "title": "Deletion Preview",
    "description": "The following records would be deleted/anonymized upon execution:",
    "noRecords": "No affected records found",
    "dryRun": "Preview (no deletion)",
    "execute": "Execute Now",
    "confirmTitle": "Confirm Data Deletion",
    "confirmDescription": "This action cannot be undone. Please type DELETE to proceed.",
    "confirmInput": "DELETE",
    "confirmPlaceholder": "Type DELETE...",
    "executing": "Executing...",
    "success": "Data deletion successful",
    "successDescription": "{count} records were processed"
  },
  "logs": {
    "title": "Deletion Log",
    "executedAt": "Executed At",
    "dataType": "Data Type",
    "action": "Action",
    "recordCount": "Count",
    "cutoffDate": "Cutoff Date",
    "durationMs": "Duration",
    "executedBy": "Executed By",
    "noLogs": "No deletion operations logged yet",
    "cron": "Automatic (Cron)"
  },
  "info": {
    "title": "GDPR Data Deletion Information",
    "description": "The GDPR requires organizations to delete personal data after the purpose of processing has expired.",
    "legalRetention": "Legal Retention Periods",
    "legalNote": "Some data types are subject to legal minimum retention periods:",
    "personnelFile": "Personnel files: 10 years (after employment ends)",
    "stockMovements": "Stock movements: 10 years (German Commercial Code §257)",
    "monthlyValues": "Monthly values: 5 years (tax law)",
    "anonymizeNote": "Anonymization removes personal fields while preserving factual data (times, quantities).",
    "cronNote": "Automatic deletion runs monthly on the 1st at 03:00 UTC for all active rules."
  }
}
```

### 5.5 Admin Page: `src/app/[locale]/(dashboard)/admin/dsgvo/page.tsx`

Pattern: Follow `src/app/[locale]/(dashboard)/admin/audit-logs/page.tsx`.

Structure:
```
'use client'
- Auth guard: useHasPermission(['dsgvo.view'])
- useTranslations('dsgvo')
- Layout: title + subtitle
- Tabs or sections:
  1. DsgvoInfoCard (top, collapsible)
  2. RetentionRulesTable (main content)
  3. RetentionPreviewDialog (button opens dialog)
  4. RetentionLogsTable (bottom section)
```

### 5.6 Components

All in `src/components/dsgvo/`:

**`dsgvo-info-card.tsx`** -- Shadcn Card with info icon, DSGVO explanation, legal retention periods. Collapsible.

**`retention-rules-table.tsx`** -- Table of 9 data types with inline editing:
- Columns: Data Type (translated), Retention (months input), Action (select DELETE/ANONYMIZE), Active (toggle), Affected Records (live count from preview query), Save button
- Uses `useDsgvoRules()` for data, `useUpdateDsgvoRule()` for save
- Shows legal warning badge when retention < legal minimum
- Action dropdown disabled for types that don't support ANONYMIZE

**`retention-preview-dialog.tsx`** -- Dialog triggered by "Preview & Execute" button:
- Step 1: Shows table of affected record counts per data type (from `useDsgvoPreview()`)
- Step 2: Confirmation checkbox "I understand this action is irreversible"
- Step 3: Type "LOESCHEN" (de) or "DELETE" (en) confirmation input
- Step 4: Execute via `useExecuteDsgvoRetention()`, show results
- Pattern: Similar to existing `cleanup-dialog.tsx` 4-step flow

**`retention-logs-table.tsx`** -- Paginated table of past executions:
- Columns: Date, Data Type, Action, Record Count, Cutoff Date, Duration, Executed By
- Uses `useDsgvoLogs()` with pagination
- "Cron" label for entries without executedBy

### 5.7 Verification

```bash
pnpm dev                # Start dev server
# Navigate to /admin/dsgvo -- page should load
pnpm lint               # No lint errors
pnpm typecheck          # No type errors
```

---

## Phase 6: Tests

**Dependencies:** Phases 2-3 (service + router must exist)
**Files to create:**
- `src/trpc/routers/__tests__/dsgvo-router.test.ts`

**Files to modify:**
- `src/trpc/routers/__tests__/permissions-router.test.ts` (update permission count)
- `src/trpc/routers/__tests__/permission-catalog.test.ts` (update permission count if tested there)

### 6.1 Router Tests: `dsgvo-router.test.ts`

Pattern: Follow `hrPersonnelFile-router.test.ts` -- mock service, test permission requirements, test input/output.

```ts
import { describe, it, expect, vi } from "vitest"
import { createCallerFactory } from "@/trpc/init"
import { dsgvoRouter } from "../dsgvo"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import {
  createMockContext,
  createMockSession,
  createUserWithPermissions,
  createMockUserTenant,
  autoMockPrisma,
} from "./helpers"
```

**Test cases:**

```ts
describe("dsgvo router", () => {
  describe("rules.list", () => {
    it("returns rules for tenant with dsgvo.view permission", async () => { })
    it("throws FORBIDDEN without dsgvo.view permission", async () => { })
  })

  describe("rules.update", () => {
    it("updates rule with dsgvo.manage permission", async () => { })
    it("throws FORBIDDEN without dsgvo.manage permission", async () => { })
    it("validates minimum retention months >= 6", async () => { })
    it("validates action is DELETE or ANONYMIZE", async () => { })
  })

  describe("preview", () => {
    it("returns preview counts with dsgvo.view permission", async () => { })
    it("accepts optional dataType filter", async () => { })
  })

  describe("execute", () => {
    it("requires dsgvo.execute permission", async () => { })
    it("throws FORBIDDEN without dsgvo.execute permission", async () => { })
    it("passes dryRun flag to service", async () => { })
    it("passes executedBy from context user", async () => { })
  })

  describe("logs.list", () => {
    it("returns paginated logs with dsgvo.view permission", async () => { })
    it("uses default page=1 and pageSize=20", async () => { })
  })
})
```

**Mocking pattern:**

```ts
vi.mock("@/lib/services/dsgvo-retention-service", () => ({
  listRules: vi.fn().mockResolvedValue([
    { id: "r1", tenantId: "t1", dataType: "BOOKINGS", retentionMonths: 36, action: "DELETE", isActive: true, description: null, createdAt: new Date(), updatedAt: new Date() },
  ]),
  updateRule: vi.fn().mockResolvedValue({ id: "r1", dataType: "BOOKINGS", retentionMonths: 24 }),
  previewRetention: vi.fn().mockResolvedValue([{ dataType: "BOOKINGS", count: 42, cutoffDate: new Date(), action: "DELETE", retentionMonths: 36 }]),
  executeRetention: vi.fn().mockResolvedValue([{ dataType: "BOOKINGS", action: "DELETE", recordCount: 42, cutoffDate: new Date(), durationMs: 150, dryRun: false }]),
  listDeleteLogs: vi.fn().mockResolvedValue({ items: [], total: 0 }),
}))
```

### 6.2 Tenant Isolation Tests

Add a describe block within `dsgvo-router.test.ts` or as a separate section:

```ts
describe("tenant isolation", () => {
  it("rules.list only returns rules for the caller's tenant", async () => {
    // Mock service called with correct tenantId from context
  })

  it("execute only processes data for the caller's tenant", async () => {
    // Verify service receives tenantId from ctx, not from input
  })

  it("logs.list only returns logs for the caller's tenant", async () => {
    // Verify tenantId filtering
  })
})
```

### 6.3 Permission Count Update

In `src/trpc/routers/__tests__/permissions-router.test.ts`, update:

```ts
// OLD:
expect(result.permissions).toHaveLength(118)
// NEW:
expect(result.permissions).toHaveLength(121)  // +3 dsgvo permissions
```

Also update `src/trpc/routers/__tests__/permission-catalog.test.ts` if it has a similar count assertion.

### 6.4 Verification

```bash
pnpm test -- src/trpc/routers/__tests__/dsgvo-router.test.ts
pnpm test -- src/trpc/routers/__tests__/permissions-router.test.ts
pnpm test -- src/trpc/routers/__tests__/permission-catalog.test.ts
```

---

## Phase 7: Handbook

**Dependencies:** All previous phases
**Files to modify:**
- `docs/TERP_HANDBUCH.md`

### 7.1 Handbook Section

Add a new section in the Administration chapter of `docs/TERP_HANDBUCH.md`:

**Section: DSGVO-Datenloeschung**

Content structure:
1. Zweck und DSGVO-Grundlagen (brief)
2. Navigation: Administration > DSGVO-Datenloeschung
3. Aufbewahrungsregeln konfigurieren
   - Praxisbeispiel: Buchungen auf 24 Monate setzen (step-by-step clickable)
4. Vorschau und manuelle Ausfuehrung
   - Praxisbeispiel: Vorschau starten, 3-Schritt-Bestaetigung durchfuehren
5. Loeschprotokoll einsehen
6. Automatische Ausfuehrung (Cron-Job monatlich)
7. Gesetzliche Aufbewahrungsfristen (Hinweis)
8. Anonymisierung vs. Loeschung

All Praxisbeispiele must be step-by-step clickable (per project convention from MEMORY.md).

### 7.2 Verification

Read through handbook section for completeness and accuracy against implementation.

---

## Complete File Summary

### New Files (12)
| # | File | Phase |
|---|------|-------|
| 1 | `supabase/migrations/20260409100000_create_dsgvo_retention_tables.sql` | 1 |
| 2 | `supabase/migrations/20260409100001_add_dsgvo_permissions_to_groups.sql` | 1 |
| 3 | `src/lib/services/dsgvo-retention-repository.ts` | 2 |
| 4 | `src/lib/services/dsgvo-retention-service.ts` | 2 |
| 5 | `src/trpc/routers/dsgvo.ts` | 3 |
| 6 | `src/app/api/cron/dsgvo-retention/route.ts` | 4 |
| 7 | `src/hooks/use-dsgvo.ts` | 5 |
| 8 | `src/app/[locale]/(dashboard)/admin/dsgvo/page.tsx` | 5 |
| 9 | `src/components/dsgvo/retention-rules-table.tsx` | 5 |
| 10 | `src/components/dsgvo/retention-preview-dialog.tsx` | 5 |
| 11 | `src/components/dsgvo/retention-logs-table.tsx` | 5 |
| 12 | `src/components/dsgvo/dsgvo-info-card.tsx` | 5 |

### Modified Files (10)
| # | File | Phase | Change |
|---|------|-------|--------|
| 1 | `prisma/schema.prisma` | 1 | Add 2 models + Tenant relations |
| 2 | `supabase/seed.sql` | 1 | Add default retention rules |
| 3 | `src/lib/auth/permission-catalog.ts` | 3 | Add 3 permissions |
| 4 | `src/trpc/routers/_app.ts` | 3 | Register dsgvoRouter |
| 5 | `src/hooks/index.ts` | 5 | Export dsgvo hooks |
| 6 | `src/components/layout/sidebar/sidebar-nav-config.ts` | 5 | Add nav item |
| 7 | `messages/de.json` | 5 | Add nav + dsgvo namespace |
| 8 | `messages/en.json` | 5 | Add nav + dsgvo namespace |
| 9 | `vercel.json` | 4 | Add cron entry |
| 10 | `docs/TERP_HANDBUCH.md` | 7 | Add DSGVO section |

### Test Files (1 new, 2 modified)
| # | File | Phase | Change |
|---|------|-------|--------|
| 1 | `src/trpc/routers/__tests__/dsgvo-router.test.ts` | 6 | New: router tests |
| 2 | `src/trpc/routers/__tests__/permissions-router.test.ts` | 6 | Update count 118 -> 121 |
| 3 | `src/trpc/routers/__tests__/permission-catalog.test.ts` | 6 | Update count if applicable |

---

## Implementation Order

```
Phase 1 (DB)  ──> Phase 2 (Service) ──> Phase 3 (Router) ──> Phase 6 (Tests)
                                    └──> Phase 4 (Cron)
                                    └──> Phase 5 (Frontend) ──> Phase 7 (Handbook)
```

Phases 3, 4, 5 can be done in parallel after Phase 2 completes. Phase 6 tests should be written alongside Phase 3. Phase 7 is the final step.
