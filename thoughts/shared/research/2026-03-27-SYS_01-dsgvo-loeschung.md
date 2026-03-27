# Research: SYS_01 -- DSGVO-Datenloeschung automatisiert

## 1. Prisma Schema -- Target Models

All target data types and their corresponding Prisma models, table names, tenant field, and date field for "older than" filtering:

| Ticket Data Type      | Prisma Model             | Table Name                  | Tenant Field | Date Field for Retention      |
|-----------------------|--------------------------|-----------------------------|--------------|-------------------------------|
| BOOKINGS              | `Booking`                | `bookings`                  | `tenantId`   | `bookingDate` (Date)          |
| DAILY_VALUES          | `DailyValue`             | `daily_values`              | `tenantId`   | `valueDate` (Date)            |
| ABSENCES              | `AbsenceDay`             | `absence_days`              | `tenantId`   | `absenceDate` (Date)          |
| MONTHLY_VALUES        | `MonthlyValue`           | `monthly_values`            | `tenantId`   | `year`+`month` (Int fields)   |
| AUDIT_LOGS            | `AuditLog`               | `audit_logs`                | `tenantId`   | `performedAt` (Timestamptz)   |
| TERMINAL_BOOKINGS     | `RawTerminalBooking`     | `raw_terminal_bookings`     | `tenantId`   | `bookingDate` (Date)          |
| PERSONNEL_FILE        | `HrPersonnelFileEntry`   | `hr_personnel_file_entries` | `tenantId`   | `entryDate` (Date)            |
| CORRECTION_MESSAGES   | `CorrectionMessage`      | `correction_messages`       | `tenantId`   | `createdAt` (Timestamptz)     |
| STOCK_MOVEMENTS       | `WhStockMovement`        | `wh_stock_movements`        | `tenantId`   | `date` (Timestamptz)          |

### Key Schema Observations

- **All models use UUID primary keys** with `@default(dbgenerated("gen_random_uuid()"))`.
- **All models have `tenantId`** mapped to `tenant_id` (UUID) for tenant isolation.
- **Booking** has cascading relations: `derivedBookings` (self-referential), `rawTerminalBookings` FK. Deleting bookings may cascade or break FKs.
- **DailyValue** has unique constraint `@@unique([employeeId, valueDate])`.
- **MonthlyValue** uses `year`+`month` int fields, not a Date -- retention filtering will need: `(year < cutoffYear) OR (year = cutoffYear AND month < cutoffMonth)`.
- **HrPersonnelFileEntry** has cascading `HrPersonnelFileAttachment[]` -- deleting entries will cascade-delete attachments. Must also delete Supabase storage files for attachments.
- **WhStockMovement** references `WhArticle`, `WhPurchaseOrder` -- deletion should only delete the movement record, not the referenced entities.
- **AuditLog** has no cascade-delete on its FK to `User` (uses `SetNull`).
- **AbsenceDay** has `onDelete: Cascade` from both Tenant and Employee.

### Date Field Locations in Schema (line numbers)

- Booking: line 3726, `bookingDate` at line 3730
- DailyValue: line 3788, `valueDate` at line 3792
- AbsenceDay: line 3899, `absenceDate` at line 3905
- MonthlyValue: line 3338, `year`/`month` at lines 3343-3344
- AuditLog: line 2747, `performedAt` at line 2759
- RawTerminalBooking: line 3421, `bookingDate` at line 3430
- HrPersonnelFileEntry: line 4695, `entryDate` at line 4702
- CorrectionMessage: line 3684, `createdAt` at line 3693
- WhStockMovement: line 4450, `date` at line 4458

### New Models Needed

Two new models to add at end of `prisma/schema.prisma`:

```prisma
model DsgvoRetentionRule {
  id              String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId        String   @map("tenant_id") @db.Uuid
  dataType        String   @map("data_type") @db.VarChar(50)  // e.g. "BOOKINGS"
  retentionMonths Int      @map("retention_months") @db.Integer
  action          String   @default("DELETE") @db.VarChar(20) // DELETE or ANONYMIZE
  isActive        Boolean  @default(true) @map("is_active")
  createdAt       DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt       DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@unique([tenantId, dataType])
  @@index([tenantId])
  @@map("dsgvo_retention_rules")
}

model DsgvoDeleteLog {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId    String   @map("tenant_id") @db.Uuid
  dataType    String   @map("data_type") @db.VarChar(50)
  deletedCount Int     @map("deleted_count") @db.Integer
  cutoffDate  DateTime @map("cutoff_date") @db.Date
  executedAt  DateTime @default(now()) @map("executed_at") @db.Timestamptz(6)
  executedBy  String?  @map("executed_by") @db.Uuid
  durationMs  Int?     @map("duration_ms") @db.Integer
  error       String?  @db.Text

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@index([tenantId])
  @@index([tenantId, executedAt])
  @@map("dsgvo_delete_logs")
}
```

Both models need relation arrays added to the `Tenant` model.

---

## 2. Service + Repository Pattern

**File paths examined:**
- `src/lib/services/audit-logs-service.ts` (service)
- `src/lib/services/audit-logs-repository.ts` (repository)
- `src/lib/services/system-settings-service.ts` (service with cleanup/bulk operations)
- `src/lib/services/wh-correction-service.ts` (service with bulk run logic)

### Pattern Summary

- **Repository** (`*-repository.ts`): Pure Prisma data-access functions. Imports `PrismaClient` and `Prisma` from `@/generated/prisma/client`. Exports functions like `findMany`, `count`, `create`, `deleteMany`.
- **Service** (`*-service.ts`): Business logic layer. Imports from its own repository via `import * as repo from "./<name>-repository"`. Functions receive `prisma: PrismaClient` as first arg, `tenantId: string` as second. Error classes follow naming convention: `*NotFoundError`, `*ValidationError`, `*ConflictError`, `*ForbiddenError` -- these are auto-mapped by `handleServiceError` in `src/trpc/errors.ts`.
- **Audit logging**: Services can call `auditLog.log(prisma, { ... })` with fire-and-forget pattern (`.catch(err => console.error(...))`)
- **Cleanup pattern** (from system-settings-service.ts): Preview mode (`confirm: false`) returns count, execute mode (`confirm: true`) actually deletes. Uses `prisma.<model>.deleteMany({ where: { ... } })`.

### Files to Create

```
src/lib/services/dsgvo-retention-repository.ts
src/lib/services/dsgvo-retention-service.ts
```

---

## 3. tRPC Router Pattern

**File paths examined:**
- `src/trpc/routers/auditLogs.ts` (flat admin router)
- `src/trpc/routers/hr/index.ts` (grouped sub-router)
- `src/trpc/routers/hr/personnelFile.ts` (sub-router with permissions)
- `src/trpc/routers/warehouse/index.ts` (grouped sub-router with module guard)

### Pattern Summary

- Import `createTRPCRouter`, `tenantProcedure` from `@/trpc/init`
- Import `requirePermission` from `@/lib/auth/middleware`
- Import `permissionIdByKey` from `@/lib/auth/permission-catalog`
- Import `handleServiceError` from `@/trpc/errors`
- Permission constants: `const DSGVO_VIEW = permissionIdByKey("dsgvo.view")!`
- Procedure chain: `tenantProcedure.use(requirePermission(PERM_ID)).input(schema).query/mutation(...)`
- Error handling: wrap service call in try/catch, call `handleServiceError(err)` in catch
- Grouped routers: `index.ts` merges sub-routers via `createTRPCRouter({ subName: subRouter })`

### Recommended Approach

Since the ticket wants routes under `admin/dsgvo`, create:

```
src/trpc/routers/dsgvo/index.ts       -- merges rules + logs sub-routers
src/trpc/routers/dsgvo/rules.ts       -- rules.list, rules.update
src/trpc/routers/dsgvo/retention.ts   -- preview, execute, logs.list
```

Or simpler: a single flat router file `src/trpc/routers/dsgvo.ts` since there are only 5 endpoints.

Register in `src/trpc/routers/_app.ts` as:
```ts
import { dsgvoRouter } from "./dsgvo"
// in appRouter:
dsgvo: dsgvoRouter,
```

---

## 4. Permission Catalog

**File:** `src/lib/auth/permission-catalog.ts`

### Pattern

- All permissions in `ALL_PERMISSIONS` array (currently 101 permissions)
- Each permission created via `p(key, resource, action, description)` helper
- UUID generated deterministically from key via `uuidv5(key, PERMISSION_NAMESPACE)`
- Organized by module sections with comments

### Permissions to Add

Append to `ALL_PERMISSIONS` array (after HR Personnel File section):

```ts
// DSGVO Data Retention
p("dsgvo.view", "dsgvo", "view", "View GDPR retention rules and logs"),
p("dsgvo.manage", "dsgvo", "manage", "Manage GDPR retention rules"),
p("dsgvo.execute", "dsgvo", "execute", "Execute GDPR data deletion"),
```

### Migration Note

A separate SQL migration is needed to insert these permissions into the `permissions` table and assign them to relevant user groups (like the `20260408100001_add_hr_personnel_file_permissions_to_groups.sql` pattern).

---

## 5. Cron Job Pattern

**File paths examined:**
- `src/app/api/cron/calculate-days/route.ts` (complex, with checkpointing)
- `src/app/api/cron/wh-corrections/route.ts` (simpler pattern)

### Pattern Summary

```ts
import { NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"

export const runtime = "nodejs"
export const maxDuration = 300

export async function GET(request: Request) {
  // 1. Validate CRON_SECRET
  const authHeader = request.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return NextResponse.json({ error: "Service unavailable" }, { status: 503 })
  if (authHeader !== `Bearer ${cronSecret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // 2. Find active tenants
  // 3. Process each tenant sequentially
  // 4. Return summary JSON
}
```

### Cron Registration

File: `vercel.json` -- add entry to `crons` array:

```json
{
  "path": "/api/cron/dsgvo-retention",
  "schedule": "0 3 * * 0"
}
```

Current cron jobs (6 total):
- calculate-days: `0 2 * * *` (daily 02:00)
- calculate-months: `0 3 2 * *` (2nd of month 03:00)
- generate-day-plans: `0 1 * * 0` (Sundays 01:00)
- execute-macros: `*/15 * * * *` (every 15 min)
- recurring-invoices: `0 4 * * *` (daily 04:00)
- wh-corrections: `0 6 * * *` (daily 06:00)

### File to Create

```
src/app/api/cron/dsgvo-retention/route.ts
```

---

## 6. Admin UI Pattern

**File paths examined:**
- `src/app/[locale]/(dashboard)/admin/audit-logs/page.tsx` (admin page)
- `src/components/settings/cleanup-tools-section.tsx` (settings sub-component)
- `src/components/settings/cleanup-dialog.tsx` (dialog with preview/confirm flow)

### Pattern Summary

- Pages are `'use client'` components
- Use `useTranslations('namespace')` for i18n
- Auth guard: `useHasPermission(['permission.key'])` + redirect to `/dashboard` if not allowed
- Layout: title h1, subtitle p, then content cards
- Components in `src/components/<feature>/` directory
- UI uses shadcn/ui components: Card, Button, Dialog, Alert, Input, Label, Table, etc.
- Import icons from `lucide-react`

### Cleanup Dialog Pattern (Relevant)

The existing cleanup dialog in settings has a 4-step flow:
1. Input step (parameters)
2. Preview step (show affected count)
3. Confirm step (type confirmation phrase)
4. Success step (show result)

This is very similar to what the DSGVO preview+execute flow needs.

### Files to Create

```
src/app/[locale]/(dashboard)/admin/dsgvo/page.tsx
src/components/dsgvo/retention-rules-table.tsx
src/components/dsgvo/retention-preview-dialog.tsx
src/components/dsgvo/retention-logs-table.tsx
src/components/dsgvo/dsgvo-info-card.tsx
```

---

## 7. Hooks Pattern

**File paths examined:**
- `src/hooks/use-audit-logs.ts` (simple query hooks)
- `src/hooks/use-hr-personnel-file.ts` (comprehensive hook file)
- `src/hooks/index.ts` (barrel export)

### Pattern Summary

```ts
import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

export function useXxxList(params) {
  const trpc = useTRPC()
  return useQuery(trpc.xxx.list.queryOptions(params))
}

export function useXxxMutation() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.xxx.mutate.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.xxx.list.queryKey() })
    },
  })
}
```

### File to Create

`src/hooks/use-dsgvo.ts` -- export hooks for:
- `useDsgvoRetentionRules()` -- query rules list
- `useUpdateDsgvoRetentionRule()` -- mutation to update rule
- `useDsgvoRetentionPreview(dataType)` -- query preview count
- `useExecuteDsgvoRetention()` -- mutation to execute deletion
- `useDsgvoDeleteLogs()` -- query logs list

Then register in `src/hooks/index.ts` barrel export.

---

## 8. Sidebar Navigation

**File:** `src/components/layout/sidebar/sidebar-nav-config.ts`

### Pattern Summary

- `navConfig: NavSection[]` with sections: main, management, hrSection, crm, billingSection, warehouseSection, administration
- Each item: `{ titleKey, href, icon, permissions?, module?, badge? }`
- Permission keys are the human-readable strings (e.g., `'users.manage'`)
- Icons imported from `lucide-react`

### Where to Add

Add to the `administration` section (last section, starting at line 467):

```ts
{
  titleKey: 'dsgvoRetention',
  href: '/admin/dsgvo',
  icon: Trash2,  // or Shield icon
  permissions: ['dsgvo.view'],
},
```

Import `Trash2` (or `ShieldAlert`, `FileX`) from `lucide-react`.

---

## 9. i18n Messages

**File paths:** `messages/de.json`, `messages/en.json`

### Structure

- Top-level namespace objects: `common`, `metadata`, `nav`, `auditLogs`, `adminSettings`, etc.
- Navigation keys in `nav` section (e.g., `"auditLogs": "Audit-Protokoll"`)
- Feature-specific namespaces for page content (e.g., `"auditLogs": { "page": { "title": ... } }`)

### Keys to Add

In `nav` section:
```json
"dsgvoRetention": "DSGVO-Datenlöschung"  // de
"dsgvoRetention": "GDPR Data Retention"   // en
```

New top-level namespace `dsgvo`:
```json
"dsgvo": {
  "page": {
    "title": "DSGVO-Datenlöschung",
    "subtitle": "Automatisierte Löschung personenbezogener Daten"
  },
  "rules": { ... },
  "logs": { ... },
  "info": { ... },
  "preview": { ... },
  "dataTypes": {
    "BOOKINGS": "Buchungen",
    "DAILY_VALUES": "Tageswerte",
    ...
  }
}
```

---

## 10. Existing Cleanup/Bereinigung Tools

**File paths:**
- `src/components/settings/cleanup-tools-section.tsx`
- `src/components/settings/cleanup-dialog.tsx`
- `src/lib/services/system-settings-service.ts` (cleanup functions)
- `src/hooks/use-system-settings.ts` (cleanup hooks)

### Summary

The existing cleanup tools in Settings provide:
- **Delete Bookings** -- delete bookings in date range (optionally filtered by employee IDs)
- **Delete Booking Data** -- delete bookings + daily values + employee day plans
- **Re-Read Bookings** -- recalculate bookings in date range
- **Mark & Delete Orders** -- delete specific orders by ID

These are **manual, ad-hoc** operations on the Settings page. The DSGVO feature is different:
- **Rule-based** -- define retention periods per data type
- **Automated** -- cron job runs automatically
- **Audit-logged** -- every deletion is logged to DsgvoDeleteLog
- **Broader scope** -- covers 9 data types vs. the 2 existing cleanup covers

The DSGVO feature should be a **separate admin page** (`/admin/dsgvo`), not integrated into the existing Settings cleanup tools.

---

## 11. Root Router

**File:** `src/trpc/routers/_app.ts`

### Pattern

- Imports all sub-routers at top
- Merges them in `createTRPCRouter({ ... })` object
- Currently 84 lines with imports + router definition
- Module-grouped routers: `crm: crmRouter`, `billing: billingRouter`, `warehouse: warehouseRouter`, `hr: hrRouter`

### Change Needed

Add import and register:

```ts
import { dsgvoRouter } from "./dsgvo"

// In appRouter object:
dsgvo: dsgvoRouter,
```

---

## 12. Supabase Config

**File:** `supabase/config.toml`

### Summary

- No cron configurations in supabase config (crons are in `vercel.json`)
- Storage buckets exist for: documents, tenant-logos, wh-article-images, crm-attachments, hr-personnel-files
- No additional storage bucket needed for DSGVO feature

**Important**: When deleting `HrPersonnelFileEntry` records, the service must also delete associated files from the `hr-personnel-files` storage bucket via Supabase Storage API.

---

## Potential Issues and Considerations

### 1. Foreign Key Cascades
- Deleting `Booking` records may cascade to `RawTerminalBooking.processedBookingId` (FK with `SetNull`), and `Booking.derivedBookings` (self-referential, `Cascade`).
- Deleting `AbsenceDay` is safe (no dependent FKs).
- Deleting `DailyValue` is safe (no dependent FKs beyond tenant/employee cascades).
- Deleting `MonthlyValue` is safe.
- **HrPersonnelFileEntry**: attachments cascade-delete in DB, but storage files must be cleaned up separately.

### 2. Monthly Values Date Handling
- `MonthlyValue` uses `year` (Int) + `month` (Int), not a Date field.
- Retention filtering: need to compute cutoff year/month from `retentionMonths`, then filter `(year < cutoffYear) OR (year = cutoffYear AND month < cutoffMonth)`.

### 3. Batch Size for Large Deletions
- For tenants with millions of records, `deleteMany` in a single transaction could be slow.
- Consider batched deletion (e.g., 10,000 at a time) with cursor-based iteration.
- The existing cleanup functions use simple `deleteMany` without batching -- follow same pattern for MVP.

### 4. Preview vs. Execute
- Preview should count records that would be affected.
- Execute should delete and log results.
- Both need tenant isolation (always filter by tenantId).

### 5. Anonymize vs. Delete
- Some data types may need anonymization instead of hard delete (e.g., keep structure but null out personal fields).
- For MVP, `DELETE` action deletes records. `ANONYMIZE` action could be added later for specific types like Bookings (null out notes, createdBy).

### 6. Default Retention Rules
- Seed data should create default retention rules per tenant (all inactive by default with sensible defaults, e.g., 120 months for bookings).
- Or create rules on first access to the DSGVO admin page.

### 7. CorrectionMessage vs. WhCorrectionMessage
- The ticket says `CORRECTION_MESSAGES` -- this maps to `CorrectionMessage` (table `correction_messages`), NOT `WhCorrectionMessage` (warehouse corrections).
- `CorrectionMessage` stores correction rule definitions/text, not individual correction records. Verify whether the ticket really means `Correction` model (table `corrections`) instead, which stores actual employee correction records with dates.

### 8. Migration Naming
- Latest migration: `20260408100001_add_hr_personnel_file_permissions_to_groups.sql`
- New migrations should be:
  - `20260409100000_create_dsgvo_retention_tables.sql`
  - `20260409100001_add_dsgvo_permissions_to_groups.sql`

---

## Complete File List for Implementation

### New Files
1. `supabase/migrations/20260409100000_create_dsgvo_retention_tables.sql`
2. `supabase/migrations/20260409100001_add_dsgvo_permissions_to_groups.sql`
3. `src/lib/services/dsgvo-retention-repository.ts`
4. `src/lib/services/dsgvo-retention-service.ts`
5. `src/trpc/routers/dsgvo.ts` (single flat router with 5 endpoints)
6. `src/app/api/cron/dsgvo-retention/route.ts`
7. `src/hooks/use-dsgvo.ts`
8. `src/app/[locale]/(dashboard)/admin/dsgvo/page.tsx`
9. `src/components/dsgvo/retention-rules-table.tsx`
10. `src/components/dsgvo/retention-preview-dialog.tsx`
11. `src/components/dsgvo/retention-logs-table.tsx`
12. `src/components/dsgvo/dsgvo-info-card.tsx`

### Modified Files
1. `prisma/schema.prisma` -- add DsgvoRetentionRule + DsgvoDeleteLog models + Tenant relations
2. `src/lib/auth/permission-catalog.ts` -- add 3 dsgvo permissions
3. `src/trpc/routers/_app.ts` -- register dsgvoRouter
4. `src/hooks/index.ts` -- export dsgvo hooks
5. `src/components/layout/sidebar/sidebar-nav-config.ts` -- add dsgvo nav item
6. `messages/de.json` -- add nav key + dsgvo namespace
7. `messages/en.json` -- add nav key + dsgvo namespace
8. `vercel.json` -- add dsgvo-retention cron entry
