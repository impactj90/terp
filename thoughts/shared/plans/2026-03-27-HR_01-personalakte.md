# Implementation Plan: HR_01 — Personalakte mit Anhängen

Date: 2026-03-27

---

## Overview

Implement a full personnel file (Personalakte) system: categorized entries per employee with file attachments, role-based visibility per category, confidential entries, reminder dates, and expiry tracking. Six implementation phases, each independently verifiable.

---

## Phase 1: Database & Permissions (Foundation)

### 1A: Prisma Schema — Add 3 New Models

**File:** `prisma/schema.prisma`

Add at the end of the file (after `WhStockReservation` model, line ~4658):

```prisma
// -----------------------------------------------------------------------------
// HrPersonnelFileCategory
// -----------------------------------------------------------------------------
// Migration: 20260408100000
model HrPersonnelFileCategory {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId    String   @map("tenant_id") @db.Uuid
  name        String   @db.VarChar(100)
  code        String   @db.VarChar(50)
  description String?  @db.Text
  color       String?  @db.VarChar(7)
  sortOrder   Int      @default(0) @map("sort_order")
  isActive    Boolean  @default(true) @map("is_active")
  visibleToRoles String[] @default(["admin"]) @map("visible_to_roles")
  createdAt   DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt   DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  tenant  Tenant                @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  entries HrPersonnelFileEntry[]

  @@unique([tenantId, code])
  @@index([tenantId])
  @@map("hr_personnel_file_categories")
}

// -----------------------------------------------------------------------------
// HrPersonnelFileEntry
// -----------------------------------------------------------------------------
// Migration: 20260408100000
model HrPersonnelFileEntry {
  id             String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId       String    @map("tenant_id") @db.Uuid
  employeeId     String    @map("employee_id") @db.Uuid
  categoryId     String    @map("category_id") @db.Uuid
  title          String    @db.VarChar(255)
  description    String?   @db.Text
  entryDate      DateTime  @map("entry_date") @db.Date
  expiresAt      DateTime? @map("expires_at") @db.Date
  reminderDate   DateTime? @map("reminder_date") @db.Date
  reminderNote   String?   @map("reminder_note") @db.Text
  isConfidential Boolean   @default(false) @map("is_confidential")
  createdAt      DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt      DateTime  @updatedAt @map("updated_at") @db.Timestamptz(6)
  createdById    String?   @map("created_by_id") @db.Uuid

  tenant      Tenant                     @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  employee    Employee                   @relation(fields: [employeeId], references: [id], onDelete: Cascade)
  category    HrPersonnelFileCategory    @relation(fields: [categoryId], references: [id])
  attachments HrPersonnelFileAttachment[]

  @@index([tenantId, employeeId])
  @@index([tenantId, categoryId])
  @@index([tenantId, reminderDate])
  @@index([tenantId, expiresAt])
  @@map("hr_personnel_file_entries")
}

// -----------------------------------------------------------------------------
// HrPersonnelFileAttachment
// -----------------------------------------------------------------------------
// Migration: 20260408100000
model HrPersonnelFileAttachment {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  entryId     String   @map("entry_id") @db.Uuid
  tenantId    String   @map("tenant_id") @db.Uuid
  filename    String   @db.VarChar(255)
  storagePath String   @map("storage_path") @db.Text
  mimeType    String   @map("mime_type") @db.VarChar(100)
  sizeBytes   Int      @map("size_bytes")
  createdAt   DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  createdById String?  @map("created_by_id") @db.Uuid

  entry  HrPersonnelFileEntry @relation(fields: [entryId], references: [id], onDelete: Cascade)
  tenant Tenant               @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@index([entryId])
  @@index([tenantId])
  @@map("hr_personnel_file_attachments")
}
```

**Also modify in the same file:**

1. **Employee model** (~line 1508, after `assignedServiceCases`): Add reverse relation:
   ```prisma
   hrPersonnelFileEntries  HrPersonnelFileEntry[]
   ```

2. **Tenant model** (~line 204, after `whStockReservations`): Add 3 reverse relations:
   ```prisma
   // HR Personnel File
   hrPersonnelFileCategories   HrPersonnelFileCategory[]
   hrPersonnelFileEntries      HrPersonnelFileEntry[]
   hrPersonnelFileAttachments  HrPersonnelFileAttachment[]
   ```

### 1B: Supabase Migration — Create Tables

**New file:** `supabase/migrations/20260408100000_create_hr_personnel_file.sql`

SQL content:
- CREATE TABLE `hr_personnel_file_categories` with columns matching Prisma model
- CREATE TABLE `hr_personnel_file_entries` with columns matching Prisma model
- CREATE TABLE `hr_personnel_file_attachments` with columns matching Prisma model
- All FKs, indexes, and `update_updated_at_column()` triggers for categories and entries
- UNIQUE constraint on `(tenant_id, code)` for categories

Seed 7 default categories (tenant_id = NULL for system-level defaults, or insert per-tenant in seed.sql):

```sql
-- Default categories are seeded in the dev seed file (supabase/seed.sql)
-- For production, a separate onboarding script or migration will seed per-tenant
```

### 1C: Permissions

**File to modify:** `src/lib/auth/permission-catalog.ts`

Add 6 new permissions before the closing `]` of `ALL_PERMISSIONS` array (after the warehouse QR scanner permissions, ~line 313):

```ts
// HR Personnel File
p("hr_personnel_file.view", "hr_personnel_file", "view", "View personnel file entries"),
p("hr_personnel_file.create", "hr_personnel_file", "create", "Create personnel file entries"),
p("hr_personnel_file.edit", "hr_personnel_file", "edit", "Edit personnel file entries"),
p("hr_personnel_file.delete", "hr_personnel_file", "delete", "Delete personnel file entries"),
p("hr_personnel_file.view_confidential", "hr_personnel_file", "view_confidential", "View confidential entries"),
p("hr_personnel_file_categories.manage", "hr_personnel_file_categories", "manage", "Manage personnel file categories"),
```

Update the comment from "All 95 permissions" to "All 101 permissions" (~line 43).

**Permission UUIDs** (UUIDv5 with namespace `f68a2ad7-6fd8-4d61-9b0e-0ea4a0d6c8a1`):
- `hr_personnel_file.view` = `de018506-94a3-5363-b6d9-3390beb5798f`
- `hr_personnel_file.create` = `caa57531-3455-5572-b989-b2198c820223`
- `hr_personnel_file.edit` = `c4e01128-e4d5-573e-906e-90f062a76a95`
- `hr_personnel_file.delete` = `b21862c1-07c2-509f-bf08-dd9a6fc2c127`
- `hr_personnel_file.view_confidential` = `3d811050-5f43-5d01-adba-c7b91a2f069a`
- `hr_personnel_file_categories.manage` = `d558fe70-8e26-5cc5-a7b6-1f58024cde37`

### 1D: Permission Migration — Add to User Groups

**New file:** `supabase/migrations/20260408100001_add_hr_personnel_file_permissions_to_groups.sql`

Pattern: Follow `20260407100001_add_wh_reservation_permissions_to_groups.sql`

```sql
-- HR_01: Add personnel file permissions to default user groups

-- PERSONAL: all 6 permissions (view, create, edit, delete, view_confidential, categories.manage)
UPDATE user_groups SET permissions = (
  SELECT jsonb_agg(DISTINCT val) FROM (
    SELECT jsonb_array_elements(permissions) AS val
    UNION ALL SELECT '"de018506-94a3-5363-b6d9-3390beb5798f"'::jsonb  -- view
    UNION ALL SELECT '"caa57531-3455-5572-b989-b2198c820223"'::jsonb  -- create
    UNION ALL SELECT '"c4e01128-e4d5-573e-906e-90f062a76a95"'::jsonb  -- edit
    UNION ALL SELECT '"b21862c1-07c2-509f-bf08-dd9a6fc2c127"'::jsonb  -- delete
    UNION ALL SELECT '"3d811050-5f43-5d01-adba-c7b91a2f069a"'::jsonb  -- view_confidential
    UNION ALL SELECT '"d558fe70-8e26-5cc5-a7b6-1f58024cde37"'::jsonb  -- categories.manage
  ) sub
) WHERE code = 'PERSONAL' AND tenant_id IS NULL;

-- VORGESETZTER: view + create + edit (no delete, no view_confidential, no category manage)
UPDATE user_groups SET permissions = (
  SELECT jsonb_agg(DISTINCT val) FROM (
    SELECT jsonb_array_elements(permissions) AS val
    UNION ALL SELECT '"de018506-94a3-5363-b6d9-3390beb5798f"'::jsonb  -- view
    UNION ALL SELECT '"caa57531-3455-5572-b989-b2198c820223"'::jsonb  -- create
    UNION ALL SELECT '"c4e01128-e4d5-573e-906e-90f062a76a95"'::jsonb  -- edit
  ) sub
) WHERE code = 'VORGESETZTER' AND tenant_id IS NULL;
```

### 1E: Supabase Storage Bucket

**File to modify:** `supabase/config.toml`

Add after `[storage.buckets.crm-attachments]` block (~line 70):

```toml
[storage.buckets.hr-personnel-files]
public = false
file_size_limit = "20MiB"
allowed_mime_types = ["application/pdf", "image/jpeg", "image/png", "image/webp", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"]
```

### 1F: Seed Data

**File to modify:** `supabase/seed.sql`

Add at the end, after existing seed data. Insert 7 default categories for dev tenant `10000000-0000-0000-0000-000000000001`:

```sql
-- HR Personnel File: Default Categories
INSERT INTO hr_personnel_file_categories (tenant_id, name, code, description, color, sort_order, visible_to_roles) VALUES
('10000000-0000-0000-0000-000000000001', 'Verträge', 'CONTRACTS', 'Arbeitsverträge, Ergänzungen, Kündigungen', '#3B82F6', 1, ARRAY['admin', 'hr']),
('10000000-0000-0000-0000-000000000001', 'Zertifikate & Qualifikationen', 'CERTS', 'Schweißerscheine, Staplerschein, Ersthelfer', '#10B981', 2, ARRAY['admin', 'hr', 'supervisor']),
('10000000-0000-0000-0000-000000000001', 'Unterweisungen', 'SAFETY', 'Sicherheitsunterweisungen, Brandschutz', '#F59E0B', 3, ARRAY['admin', 'hr', 'supervisor']),
('10000000-0000-0000-0000-000000000001', 'Abmahnungen', 'WARNINGS', 'Abmahnungen, Verwarnungen', '#EF4444', 4, ARRAY['admin', 'hr']),
('10000000-0000-0000-0000-000000000001', 'Weiterbildung', 'TRAINING', 'Schulungen, Seminare', '#8B5CF6', 5, ARRAY['admin', 'hr', 'supervisor']),
('10000000-0000-0000-0000-000000000001', 'Arbeitsmedizin', 'MEDICAL', 'G-Untersuchungen, Eignungsnachweise', '#06B6D4', 6, ARRAY['admin', 'hr']),
('10000000-0000-0000-0000-000000000001', 'Sonstiges', 'OTHER', 'Alle übrigen Dokumente', '#6B7280', 7, ARRAY['admin', 'hr', 'supervisor'])
ON CONFLICT (tenant_id, code) DO NOTHING;
```

### Verification

```bash
# Regenerate Prisma client
pnpm db:generate

# Verify it compiles
pnpm typecheck

# Reset DB to apply migration + seed
pnpm db:reset
```

### Dependencies
- None (this is the foundation phase)

---

## Phase 2: Repository & Service Layer

### 2A: Repository

**New file:** `src/lib/services/hr-personnel-file-repository.ts`

Pattern: Follow `src/lib/services/wh-article-repository.ts` (pure Prisma queries, every query includes `tenantId`).

Functions to implement:

```ts
// Category repository
export async function findCategories(prisma, tenantId, { isActive? }) → HrPersonnelFileCategory[]
export async function findCategoryById(prisma, tenantId, id) → HrPersonnelFileCategory | null
export async function findCategoryByCode(prisma, tenantId, code) → HrPersonnelFileCategory | null
export async function createCategory(prisma, data) → HrPersonnelFileCategory
export async function updateCategory(prisma, tenantId, id, data) → HrPersonnelFileCategory
export async function deleteCategory(prisma, tenantId, id) → void
export async function countEntriesByCategory(prisma, tenantId, categoryId) → number

// Entry repository
export async function findEntries(prisma, tenantId, {
  employeeId, categoryId?, search?, isConfidential?, allowedCategoryIds?,
  page, pageSize
}) → { items: HrPersonnelFileEntry[], total: number }
export async function findEntryById(prisma, tenantId, id) → HrPersonnelFileEntry | null (include: category, attachments, employee)
export async function createEntry(prisma, data) → HrPersonnelFileEntry
export async function updateEntry(prisma, tenantId, id, data) → HrPersonnelFileEntry
export async function deleteEntry(prisma, tenantId, id) → void

// Reminder/Expiry queries
export async function findReminders(prisma, tenantId, { from, to }) → HrPersonnelFileEntry[] (include: employee, category)
export async function findExpiringEntries(prisma, tenantId, deadline: Date) → HrPersonnelFileEntry[] (include: employee, category)
```

Key implementation details:
- Every query MUST filter by `tenantId`
- `findEntries` applies `allowedCategoryIds` filter (for role-based visibility)
- `findEntries` supports optional `isConfidential: false` filter (to hide confidential)
- `findEntryById` uses `include: { category: true, attachments: true, employee: { select: { id, firstName, lastName, personnelNumber } } }`
- Pagination via `skip` / `take` with `total` count
- `findReminders` filters `reminderDate BETWEEN from AND to`, orders by `reminderDate asc`
- `findExpiringEntries` filters `expiresAt <= deadline AND expiresAt >= now()`, orders by `expiresAt asc`

### 2B: Service

**New file:** `src/lib/services/hr-personnel-file-service.ts`

Pattern: Follow `src/lib/services/wh-article-service.ts` (service functions receive `prisma, tenantId, ...`).

Error classes:
```ts
export class HrPersonnelFileNotFoundError extends Error { ... }
export class HrPersonnelFileValidationError extends Error { ... }
export class HrPersonnelFileConflictError extends Error { ... }
export class HrPersonnelFileForbiddenError extends Error { ... }
```

Functions to implement:

```ts
// --- Category Service ---
export async function listCategories(prisma, tenantId)
export async function createCategory(prisma, tenantId, input: { name, code, description?, color?, sortOrder?, visibleToRoles? })
export async function updateCategory(prisma, tenantId, input: { id, name?, code?, description?, color?, sortOrder?, isActive?, visibleToRoles? })
export async function deleteCategory(prisma, tenantId, id)
  // Validation: only delete if no entries reference this category

// --- Entry Service ---
export async function listEntries(prisma, tenantId, userId, userPermissions, params: {
  employeeId, categoryId?, search?, page, pageSize
})
  // 1. Load user role info (via userGroups from context, or simplified to permission check)
  // 2. Filter categories by visibleToRoles based on user's group codes
  // 3. If user lacks view_confidential permission, exclude confidential entries
  // 4. Call repo.findEntries with allowed categoryIds and confidential filter

export async function getEntryById(prisma, tenantId, userId, userPermissions, id)
  // Load entry, verify category visibility for user, verify confidential access

export async function createEntry(prisma, tenantId, input: {
  employeeId, categoryId, title, description?, entryDate, expiresAt?,
  reminderDate?, reminderNote?, isConfidential?
}, createdById)
  // Validate employee belongs to tenant
  // Validate category belongs to tenant
  // Create entry

export async function updateEntry(prisma, tenantId, input: { id, ... })
  // Validate entry exists and belongs to tenant
  // Update

export async function deleteEntry(prisma, tenantId, id)
  // Find entry (with attachments)
  // Delete all attachments from Supabase Storage (call attachment service)
  // Delete entry (CASCADE will clean up attachment DB records)

// --- Reminder/Expiry ---
export async function getReminders(prisma, tenantId, { from?: Date, to?: Date })
  // Default from = today, default to = today + 14 days
  // Return entries with due reminderDate, include employee + category

export async function getExpiringEntries(prisma, tenantId, withinDays = 30)
  // Return entries where expiresAt is between now and now + withinDays
```

### 2C: Attachment Service

**New file:** `src/lib/services/hr-personnel-file-attachment-service.ts`

Pattern: Follow `src/lib/services/crm-correspondence-attachment-service.ts` exactly (combined service+repo in one file).

Constants:
```ts
const BUCKET = "hr-personnel-files"
const SIGNED_URL_EXPIRY_SECONDS = 3600
const MAX_ATTACHMENTS_PER_ENTRY = 10
const MAX_SIZE_BYTES = 20 * 1024 * 1024  // 20 MB
const ALLOWED_MIME_TYPES = [
  "application/pdf", "image/jpeg", "image/png", "image/webp",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]
```

Error classes:
```ts
export class HrPersonnelFileAttachmentNotFoundError extends Error { ... }
export class HrPersonnelFileAttachmentValidationError extends Error { ... }
```

Functions (mirror CRM attachment service exactly):
```ts
// Repository section
export async function findByEntry(prisma, tenantId, entryId)
export async function findById(prisma, tenantId, attachmentId)
export async function createAttachment(prisma, data)
export async function countByEntry(prisma, tenantId, entryId)
export async function removeAttachment(prisma, tenantId, attachmentId)

// Service section
export async function listAttachments(prisma, tenantId, entryId) → with signed download URLs
export async function getUploadUrl(prisma, tenantId, entryId, filename, mimeType)
  // Storage path: {tenantId}/{employeeId}/{entryId}/{uuid}.{ext}
  // Need to load entry to get employeeId for path construction
export async function confirmUpload(prisma, tenantId, entryId, storagePath, filename, mimeType, sizeBytes, createdById)
export async function deleteAttachment(prisma, tenantId, attachmentId)
export async function getDownloadUrl(prisma, tenantId, attachmentId)
export async function deleteAllByEntry(prisma, tenantId, entryId) → for cascading cleanup
```

Include `fixSignedUrl()` helper and `mimeToExtension()` helper (same as CRM service).

### Verification

```bash
# Regenerate Prisma client (if not done in Phase 1)
pnpm db:generate

# Type check
pnpm typecheck
```

### Dependencies
- Phase 1 (Prisma models must exist, Prisma client regenerated)

---

## Phase 3: tRPC Router & Registration

### 3A: HR Personnel File Router

**New file:** `src/trpc/routers/hr/personnelFile.ts`

Pattern: Follow `src/trpc/routers/crm/correspondence.ts` (nested sub-routers for attachments).

Structure:
```ts
import { z } from "zod"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { handleServiceError } from "@/trpc/errors"
import { requirePermission } from "@/lib/auth/middleware"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import * as hrService from "@/lib/services/hr-personnel-file-service"
import * as attachmentService from "@/lib/services/hr-personnel-file-attachment-service"
import type { PrismaClient } from "@/generated/prisma/client"

// Permission constants
const PF_VIEW = permissionIdByKey("hr_personnel_file.view")!
const PF_CREATE = permissionIdByKey("hr_personnel_file.create")!
const PF_EDIT = permissionIdByKey("hr_personnel_file.edit")!
const PF_DELETE = permissionIdByKey("hr_personnel_file.delete")!
const PF_CAT_MANAGE = permissionIdByKey("hr_personnel_file_categories.manage")!

// No module guard — HR is core functionality (not a gated module)

export const hrPersonnelFileRouter = createTRPCRouter({
  categories: createTRPCRouter({
    list: tenantProcedure.use(requirePermission(PF_VIEW)).query(...),
    create: tenantProcedure.use(requirePermission(PF_CAT_MANAGE)).input(createCategorySchema).mutation(...),
    update: tenantProcedure.use(requirePermission(PF_CAT_MANAGE)).input(updateCategorySchema).mutation(...),
    delete: tenantProcedure.use(requirePermission(PF_CAT_MANAGE)).input(z.object({ id: z.string().uuid() })).mutation(...),
  }),

  entries: createTRPCRouter({
    list: tenantProcedure.use(requirePermission(PF_VIEW)).input(listEntriesSchema).query(...),
    getById: tenantProcedure.use(requirePermission(PF_VIEW)).input(z.object({ id: z.string().uuid() })).query(...),
    create: tenantProcedure.use(requirePermission(PF_CREATE)).input(createEntrySchema).mutation(...),
    update: tenantProcedure.use(requirePermission(PF_EDIT)).input(updateEntrySchema).mutation(...),
    delete: tenantProcedure.use(requirePermission(PF_DELETE)).input(z.object({ id: z.string().uuid() })).mutation(...),
    getReminders: tenantProcedure.use(requirePermission(PF_VIEW)).input(reminderSchema).query(...),
    getExpiring: tenantProcedure.use(requirePermission(PF_VIEW)).input(expiringSchema).query(...),
  }),

  attachments: createTRPCRouter({
    getUploadUrl: tenantProcedure.use(requirePermission(PF_CREATE)).input(uploadUrlSchema).mutation(...),
    confirm: tenantProcedure.use(requirePermission(PF_CREATE)).input(confirmSchema).mutation(...),
    delete: tenantProcedure.use(requirePermission(PF_DELETE)).input(z.object({ id: z.string().uuid() })).mutation(...),
    getDownloadUrl: tenantProcedure.use(requirePermission(PF_VIEW)).input(z.object({ id: z.string().uuid() })).query(...),
  }),
})
```

Input schemas:

```ts
const createCategorySchema = z.object({
  name: z.string().min(1).max(100),
  code: z.string().min(1).max(50).regex(/^[A-Z_]+$/),
  description: z.string().max(500).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  sortOrder: z.number().int().min(0).optional(),
  visibleToRoles: z.array(z.string()).optional(),
})

const updateCategorySchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100).optional(),
  code: z.string().min(1).max(50).regex(/^[A-Z_]+$/).optional(),
  description: z.string().max(500).nullable().optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
  visibleToRoles: z.array(z.string()).optional(),
})

const listEntriesSchema = z.object({
  employeeId: z.string().uuid(),
  categoryId: z.string().uuid().optional(),
  search: z.string().max(255).optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(25),
})

const createEntrySchema = z.object({
  employeeId: z.string().uuid(),
  categoryId: z.string().uuid(),
  title: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  entryDate: z.coerce.date(),
  expiresAt: z.coerce.date().optional(),
  reminderDate: z.coerce.date().optional(),
  reminderNote: z.string().max(500).optional(),
  isConfidential: z.boolean().optional(),
})

const updateEntrySchema = z.object({
  id: z.string().uuid(),
  categoryId: z.string().uuid().optional(),
  title: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).nullable().optional(),
  entryDate: z.coerce.date().optional(),
  expiresAt: z.coerce.date().nullable().optional(),
  reminderDate: z.coerce.date().nullable().optional(),
  reminderNote: z.string().max(500).nullable().optional(),
  isConfidential: z.boolean().optional(),
})

const reminderSchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
})

const expiringSchema = z.object({
  withinDays: z.number().int().min(1).max(365).default(30),
})

const uploadUrlSchema = z.object({
  entryId: z.string().uuid(),
  filename: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(100),
})

const confirmSchema = z.object({
  entryId: z.string().uuid(),
  storagePath: z.string().min(1),
  filename: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(100),
  sizeBytes: z.number().int().min(1),
})
```

Each procedure body follows the pattern:
```ts
async ({ ctx, input }) => {
  try {
    return await hrService.listEntries(
      ctx.prisma as unknown as PrismaClient,
      ctx.tenantId!,
      ctx.user!.id,
      ctx.user!.userGroups ?? [],
      input
    )
  } catch (err) {
    handleServiceError(err)
  }
}
```

### 3B: HR Module Router Index

**New file:** `src/trpc/routers/hr/index.ts`

Pattern: Follow `src/trpc/routers/crm/index.ts`

```ts
import { createTRPCRouter } from "@/trpc/init"
import { hrPersonnelFileRouter } from "./personnelFile"

export const hrRouter = createTRPCRouter({
  personnelFile: hrPersonnelFileRouter,
})
```

### 3C: Register in Root Router

**File to modify:** `src/trpc/routers/_app.ts`

1. Add import (~line 83, after warehouse import):
   ```ts
   import { hrRouter } from "./hr"
   ```

2. Add to `appRouter` object (~line 161, after `warehouse: warehouseRouter`):
   ```ts
   hr: hrRouter,
   ```

### Verification

```bash
pnpm typecheck
```

### Dependencies
- Phase 2 (service files must exist)

---

## Phase 4: Hooks

### 4A: Hook File

**New file:** `src/hooks/use-hr-personnel-file.ts`

Pattern: Follow `src/hooks/use-crm-correspondence-attachments.ts` and `src/hooks/use-employees.ts`

```ts
import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

// --- Category Hooks ---
export function useHrPersonnelFileCategories() {
  const trpc = useTRPC()
  return useQuery(trpc.hr.personnelFile.categories.list.queryOptions())
}

export function useCreateHrPersonnelFileCategory() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.hr.personnelFile.categories.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.hr.personnelFile.categories.list.queryKey() })
    },
  })
}

export function useUpdateHrPersonnelFileCategory() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.hr.personnelFile.categories.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.hr.personnelFile.categories.list.queryKey() })
    },
  })
}

export function useDeleteHrPersonnelFileCategory() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.hr.personnelFile.categories.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.hr.personnelFile.categories.list.queryKey() })
    },
  })
}

// --- Entry Hooks ---
export function useHrPersonnelFileEntries(employeeId: string, categoryId?: string) {
  const trpc = useTRPC()
  return useQuery(
    trpc.hr.personnelFile.entries.list.queryOptions(
      { employeeId, categoryId },
      { enabled: !!employeeId }
    )
  )
}

export function useHrPersonnelFileEntry(id: string) {
  const trpc = useTRPC()
  return useQuery(
    trpc.hr.personnelFile.entries.getById.queryOptions(
      { id },
      { enabled: !!id }
    )
  )
}

export function useCreateHrPersonnelFileEntry() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.hr.personnelFile.entries.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.hr.personnelFile.entries.list.queryKey() })
    },
  })
}

export function useUpdateHrPersonnelFileEntry() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.hr.personnelFile.entries.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.hr.personnelFile.entries.list.queryKey() })
      queryClient.invalidateQueries({ queryKey: trpc.hr.personnelFile.entries.getById.queryKey() })
    },
  })
}

export function useDeleteHrPersonnelFileEntry() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.hr.personnelFile.entries.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.hr.personnelFile.entries.list.queryKey() })
    },
  })
}

// --- Reminder & Expiry Hooks ---
export function useHrPersonnelFileReminders(dateRange?: { from?: Date; to?: Date }) {
  const trpc = useTRPC()
  return useQuery(
    trpc.hr.personnelFile.entries.getReminders.queryOptions(dateRange ?? {})
  )
}

export function useHrPersonnelFileExpiring(withinDays = 30) {
  const trpc = useTRPC()
  return useQuery(
    trpc.hr.personnelFile.entries.getExpiring.queryOptions({ withinDays })
  )
}

// --- Attachment Hooks ---
export function useUploadHrPersonnelFileAttachment() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()

  const getUploadUrl = useMutation({
    ...trpc.hr.personnelFile.attachments.getUploadUrl.mutationOptions(),
  })

  const confirmUpload = useMutation({
    ...trpc.hr.personnelFile.attachments.confirm.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.hr.personnelFile.entries.getById.queryKey() })
    },
  })

  return { getUploadUrl, confirmUpload }
}

export function useDeleteHrPersonnelFileAttachment() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.hr.personnelFile.attachments.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.hr.personnelFile.entries.getById.queryKey() })
    },
  })
}

export function useHrPersonnelFileDownloadUrl(id: string) {
  const trpc = useTRPC()
  return useQuery(
    trpc.hr.personnelFile.attachments.getDownloadUrl.queryOptions(
      { id },
      { enabled: !!id }
    )
  )
}
```

### 4B: Barrel Export

**File to modify:** `src/hooks/index.ts`

Add at the end:

```ts
// HR Personnel File
export {
  useHrPersonnelFileCategories,
  useCreateHrPersonnelFileCategory,
  useUpdateHrPersonnelFileCategory,
  useDeleteHrPersonnelFileCategory,
  useHrPersonnelFileEntries,
  useHrPersonnelFileEntry,
  useCreateHrPersonnelFileEntry,
  useUpdateHrPersonnelFileEntry,
  useDeleteHrPersonnelFileEntry,
  useHrPersonnelFileReminders,
  useHrPersonnelFileExpiring,
  useUploadHrPersonnelFileAttachment,
  useDeleteHrPersonnelFileAttachment,
  useHrPersonnelFileDownloadUrl,
} from './use-hr-personnel-file'
```

### Verification

```bash
pnpm typecheck
```

### Dependencies
- Phase 3 (router must exist for tRPC type inference in hooks)

---

## Phase 5: UI Components & Pages

### 5A: Personnel File Tab Component

**New file:** `src/components/hr/personnel-file-tab.tsx`

A `'use client'` component that renders the personnel file tab content for an employee.

Props: `{ employeeId: string }`

Features:
- Category filter buttons (horizontal, colored dots)
- Search input field
- Entry list (table or cards) showing: title, category color dot + name, entryDate, expiresAt (with yellow/red badge if soon/expired), attachment count (paperclip icon), confidential badge (lock icon)
- "Neuer Eintrag" button opening the entry dialog
- Empty state when no entries
- Loading skeleton

Uses hooks: `useHrPersonnelFileEntries`, `useHrPersonnelFileCategories`, `useDeleteHrPersonnelFileEntry`

Import from: `@/components/ui/button`, `@/components/ui/card`, `@/components/ui/input`, `@/components/ui/badge`, `@/components/ui/skeleton`

### 5B: Entry Create/Edit Dialog

**New file:** `src/components/hr/personnel-file-entry-dialog.tsx`

A Sheet-based form dialog (follow existing pattern with Sheet + ScrollArea).

Props: `{ open, onOpenChange, employeeId, entry?: existing entry for edit, onSuccess }`

Form fields:
- Category (Select dropdown from `useHrPersonnelFileCategories`)
- Title (Input, required)
- Description (Textarea, optional)
- Entry Date (DatePicker, required)
- Expires At (DatePicker, optional)
- Reminder Date (DatePicker, optional)
- Reminder Note (Input, optional, shown when reminderDate set)
- Confidential (Checkbox)

On submit: calls `useCreateHrPersonnelFileEntry` or `useUpdateHrPersonnelFileEntry`.

Below the form: Attachment section (only in edit mode / after entry created):
- List existing attachments with download links and delete buttons
- Drag & drop / file picker for uploading new attachments
- Uses `useUploadHrPersonnelFileAttachment` for 3-step upload flow

### 5C: Integrate Tab into Employee Detail

**File to modify:** `src/app/[locale]/(dashboard)/admin/employees/[id]/page.tsx`

1. Import the new tab component:
   ```ts
   import { PersonnelFileTab } from '@/components/hr/personnel-file-tab'
   ```

2. Add a new TabsTrigger in the TabsList (~line 126):
   ```tsx
   <TabsTrigger value="personnel-file">{t('tabPersonnelFile')}</TabsTrigger>
   ```

3. Add a new TabsContent after the tariff-assignments tab (~line 201):
   ```tsx
   <TabsContent value="personnel-file" className="mt-6">
     <PersonnelFileTab employeeId={employeeId} />
   </TabsContent>
   ```

### 5D: Category Management Page

**New file:** `src/app/[locale]/(dashboard)/hr/personnel-file/categories/page.tsx`

A `'use client'` page for managing personnel file categories.

Features:
- Table listing all categories: name, code, color preview, sortOrder, visibleToRoles, isActive toggle
- "Neue Kategorie" button opening a Sheet form
- Edit / delete actions per row
- Only accessible with `hr_personnel_file_categories.manage` permission

### 5E: HR Overview Page (Reminders + Expiring)

**New file:** `src/app/[locale]/(dashboard)/hr/personnel-file/page.tsx`

A `'use client'` page showing:
- Two-column layout (or tabs)
- Left/Tab 1: Fällige Wiedervorlagen (reminders due) — list with employee name, entry title, category, reminder date, reminder note
- Right/Tab 2: Ablaufende Einträge (expiring entries) — list with employee name, entry title, category, expiry date
- Click on row navigates to employee detail page, personnel-file tab

Uses hooks: `useHrPersonnelFileReminders`, `useHrPersonnelFileExpiring`

### 5F: Dashboard Widget

**New file:** `src/components/hr/personnel-file-dashboard-widget.tsx`

A card component for the main dashboard showing:
- Count of due reminders (today to +14 days)
- Count of expiring entries (next 30 days)
- Link to HR overview page

Pattern: Follow `src/components/dashboard/stats-card.tsx` and `src/components/dashboard/pending-actions.tsx`

**File to modify:** `src/app/[locale]/(dashboard)/dashboard/page.tsx`

Add the widget to the dashboard layout (conditionally, based on `hr_personnel_file.view` permission).

### 5G: Navigation

**File to modify:** `src/components/layout/sidebar/sidebar-nav-config.ts`

1. Add `FolderOpen` (or `FileUser` or `ClipboardList`) import from lucide-react.

2. Add a new section or items to the "management" section (~after line 283):

   ```ts
   // In the 'management' section items array, add:
   {
     titleKey: 'hrPersonnelFile',
     href: '/hr/personnel-file',
     icon: FolderOpen,  // or FileUser
     permissions: ['hr_personnel_file.view'],
   },
   {
     titleKey: 'hrPersonnelFileCategories',
     href: '/hr/personnel-file/categories',
     icon: Tag,
     permissions: ['hr_personnel_file_categories.manage'],
   },
   ```

3. Add translation keys to the nav i18n files (check `messages/de/nav.json` and `messages/en/nav.json` for location):
   ```json
   "hrPersonnelFile": "Personalakte",
   "hrPersonnelFileCategories": "Aktenkategorien"
   ```

4. Add translation key for the employee detail tab:
   ```json
   // In adminEmployees or employeeTariffAssignments namespace:
   "tabPersonnelFile": "Personalakte"
   ```

### Verification

```bash
pnpm typecheck
pnpm lint
pnpm dev  # Manual visual check
```

### Dependencies
- Phase 4 (hooks must exist)

---

## Phase 6: Tests

### 6A: Router Tests

**New file:** `src/trpc/routers/__tests__/hrPersonnelFile-router.test.ts`

Pattern: Follow `src/trpc/routers/__tests__/whArticleImages-router.test.ts`

Mock setup:
```ts
vi.mock("@/lib/services/hr-personnel-file-service", () => ({
  listCategories: vi.fn().mockResolvedValue([]),
  createCategory: vi.fn().mockResolvedValue({ id: "cat-1", ... }),
  updateCategory: vi.fn().mockResolvedValue({ id: "cat-1", ... }),
  deleteCategory: vi.fn().mockResolvedValue(undefined),
  listEntries: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  getEntryById: vi.fn().mockResolvedValue({ id: "entry-1", ... }),
  createEntry: vi.fn().mockResolvedValue({ id: "entry-1", ... }),
  updateEntry: vi.fn().mockResolvedValue({ id: "entry-1", ... }),
  deleteEntry: vi.fn().mockResolvedValue(undefined),
  getReminders: vi.fn().mockResolvedValue([]),
  getExpiringEntries: vi.fn().mockResolvedValue([]),
}))

vi.mock("@/lib/services/hr-personnel-file-attachment-service", () => ({
  getUploadUrl: vi.fn().mockResolvedValue({ signedUrl: "...", storagePath: "...", token: "..." }),
  confirmUpload: vi.fn().mockResolvedValue({ id: "att-1", ... }),
  deleteAttachment: vi.fn().mockResolvedValue({ success: true }),
  getDownloadUrl: vi.fn().mockResolvedValue({ downloadUrl: "...", filename: "...", mimeType: "..." }),
}))
```

Test cases:

```ts
describe("hr.personnelFile", () => {
  describe("categories", () => {
    it("list — requires hr_personnel_file.view permission")
    it("create — requires hr_personnel_file_categories.manage permission")
    it("create — calls service with correct params")
    it("update — requires hr_personnel_file_categories.manage permission")
    it("delete — requires hr_personnel_file_categories.manage permission")
  })

  describe("entries", () => {
    it("list — requires hr_personnel_file.view permission")
    it("list — returns paginated entries")
    it("getById — requires hr_personnel_file.view permission")
    it("create — requires hr_personnel_file.create permission")
    it("create — creates entry with all fields")
    it("update — requires hr_personnel_file.edit permission")
    it("delete — requires hr_personnel_file.delete permission")
    it("getReminders — returns due reminders")
    it("getExpiring — returns soon-expiring entries")
  })

  describe("attachments", () => {
    it("getUploadUrl — requires hr_personnel_file.create permission")
    it("confirm — requires hr_personnel_file.create permission")
    it("delete — requires hr_personnel_file.delete permission")
    it("getDownloadUrl — requires hr_personnel_file.view permission")
  })

  describe("permission gating", () => {
    it("entries.list — returns FORBIDDEN without permission")
    it("entries.create — returns FORBIDDEN without permission")
    it("categories.create — returns FORBIDDEN without manage permission")
  })
})
```

### 6B: Handbook Update

**File to modify:** `docs/TERP_HANDBUCH.md`

Add a new section for "Personalakte" under HR / Personal:

```markdown
### 4.14 Personalakte

#### Übersicht
Die Personalakte ermöglicht die digitale Verwaltung von Mitarbeiterdokumenten,
Zertifikaten, Unterweisungen und weiteren personalrelevanten Einträgen.

#### Praxisbeispiel: Neuen Personalakte-Eintrag anlegen
1. Navigation: Verwaltung → Mitarbeiter → [Mitarbeiter öffnen]
2. Tab "Personalakte" klicken
3. Button "Neuer Eintrag" klicken
4. Kategorie wählen (z.B. "Zertifikate & Qualifikationen")
5. Titel eingeben (z.B. "Staplerschein")
6. Datum des Dokuments eingeben
7. Optional: Ablaufdatum und Wiedervorlage setzen
8. Datei(en) hochladen (PDF, Bilder, Office-Dokumente, max. 20 MB)
9. "Speichern" klicken
10. Eintrag erscheint in der Personalakte-Liste

#### Praxisbeispiel: Ablaufende Zertifikate prüfen
1. Navigation: HR → Personalakte
2. Tab "Ablaufende Einträge" zeigt alle Zertifikate die in den nächsten 30 Tagen ablaufen
3. Mitarbeiter anklicken um direkt zur Personalakte zu springen

#### Kategorienverwaltung
1. Navigation: HR → Aktenkategorien
2. Kategorien anlegen/bearbeiten mit Farbcode und Rollensteuerung
```

### Verification

```bash
# Run router tests
pnpm vitest run src/trpc/routers/__tests__/hrPersonnelFile-router.test.ts

# Run all tests to ensure no regressions
pnpm test

# Full type check
pnpm typecheck

# Lint
pnpm lint
```

### Dependencies
- Phase 3 (router must exist for test imports)

---

## File Summary

### New Files (14)

| # | File | Phase |
|---|------|-------|
| 1 | `supabase/migrations/20260408100000_create_hr_personnel_file.sql` | 1B |
| 2 | `supabase/migrations/20260408100001_add_hr_personnel_file_permissions_to_groups.sql` | 1D |
| 3 | `src/lib/services/hr-personnel-file-repository.ts` | 2A |
| 4 | `src/lib/services/hr-personnel-file-service.ts` | 2B |
| 5 | `src/lib/services/hr-personnel-file-attachment-service.ts` | 2C |
| 6 | `src/trpc/routers/hr/personnelFile.ts` | 3A |
| 7 | `src/trpc/routers/hr/index.ts` | 3B |
| 8 | `src/hooks/use-hr-personnel-file.ts` | 4A |
| 9 | `src/components/hr/personnel-file-tab.tsx` | 5A |
| 10 | `src/components/hr/personnel-file-entry-dialog.tsx` | 5B |
| 11 | `src/app/[locale]/(dashboard)/hr/personnel-file/page.tsx` | 5E |
| 12 | `src/app/[locale]/(dashboard)/hr/personnel-file/categories/page.tsx` | 5D |
| 13 | `src/components/hr/personnel-file-dashboard-widget.tsx` | 5F |
| 14 | `src/trpc/routers/__tests__/hrPersonnelFile-router.test.ts` | 6A |

### Modified Files (8)

| # | File | Phase | Change |
|---|------|-------|--------|
| 1 | `prisma/schema.prisma` | 1A | Add 3 models + 4 reverse relations (Employee + Tenant) |
| 2 | `src/lib/auth/permission-catalog.ts` | 1C | Add 6 new permissions (total: 101) |
| 3 | `supabase/config.toml` | 1E | Add `hr-personnel-files` bucket |
| 4 | `supabase/seed.sql` | 1F | Add 7 default categories |
| 5 | `src/trpc/routers/_app.ts` | 3C | Import + register `hrRouter` |
| 6 | `src/hooks/index.ts` | 4B | Export HR hooks |
| 7 | `src/app/[locale]/(dashboard)/admin/employees/[id]/page.tsx` | 5C | Add "Personalakte" tab |
| 8 | `src/components/layout/sidebar/sidebar-nav-config.ts` | 5G | Add HR nav items |

### Also modify (i18n, if applicable)

| # | File | Phase | Change |
|---|------|-------|--------|
| 9 | `messages/de/nav.json` (or equivalent) | 5G | Add `hrPersonnelFile`, `hrPersonnelFileCategories` keys |
| 10 | `messages/en/nav.json` (or equivalent) | 5G | Add English translations |
| 11 | `messages/de/adminEmployees.json` (or equivalent) | 5C | Add `tabPersonnelFile` key |
| 12 | `docs/TERP_HANDBUCH.md` | 6B | Add Personalakte section |
| 13 | `src/app/[locale]/(dashboard)/dashboard/page.tsx` | 5F | Add dashboard widget |

---

## Implementation Order & Timing Estimate

| Phase | Description | Est. Time | Depends On |
|-------|-------------|-----------|------------|
| 1 | Database, Permissions, Storage, Seed | 45 min | — |
| 2 | Repository + Service + Attachment Service | 60 min | Phase 1 |
| 3 | tRPC Router + Registration | 45 min | Phase 2 |
| 4 | Hooks + Barrel Export | 20 min | Phase 3 |
| 5 | UI Components, Pages, Navigation | 90 min | Phase 4 |
| 6 | Tests + Handbook | 45 min | Phase 3 |

**Total estimate:** ~5 hours

Phases 5 and 6 can be done in parallel since they have no mutual dependency (both depend on Phase 3/4).

---

## Acceptance Criteria Traceability

| Criterion | Phase |
|-----------|-------|
| 3 Models with Migration | 1A, 1B |
| Default categories at tenant setup | 1F |
| Entries per employee with category, date, description | 2B, 3A |
| File attachments via Supabase Storage (max 20 MB) | 1E, 2C, 3A |
| Expiry date with "soon expiring" display | 2B, 5A, 5E |
| Reminder system (date + note) | 2B, 5A, 5E |
| Confidential entries only with special permission | 2B, 3A |
| Role-based visibility per category | 2B |
| "Personalakte" tab in employee detail | 5C |
| Dashboard widget: reminders + expiring | 5F |
| Cross-tenant isolation verified | 6A |
