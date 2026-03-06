# Implementation Plan: ZMI-TICKET-218 - Absence Types tRPC Router

**Date:** 2026-03-06
**Ticket:** ZMI-TICKET-218
**Dependencies:** ZMI-TICKET-216 (AbsenceTypeGroup, CalculationRule in Prisma), ZMI-TICKET-210 (tenantProcedure)
**Branch:** `staging` (current)

---

## Summary

Migrate the Absence Types CRUD from the Go backend (`/absence-types`) to a tRPC router (`absenceTypes.*`). This involves:

1. Adding the `AbsenceType` model to the Prisma schema (table already exists in DB since migration 000025)
2. Creating the tRPC router with list, getById, create, update, delete procedures
3. Creating tRPC-based frontend hooks to replace the old Go API hooks
4. Updating frontend components to use the new hooks
5. Writing comprehensive tests

**No new Supabase migration is needed** -- the `absence_types` table already exists with all required columns via golang-migrate migrations 000025, 000042, and 000047. Prisma introspects the existing table.

---

## Phase 1: Prisma Schema Update

### 1.1 Add AbsenceType model to `apps/web/prisma/schema.prisma`

Insert the new model after the `CalculationRule` model (after line 1039). The model must map exactly to the existing `absence_types` table.

```prisma
// -----------------------------------------------------------------------------
// AbsenceType
// -----------------------------------------------------------------------------
// Migrations: 000025, 000042 (group FK), 000047 (calculation rule FK), 000085 (seed)
//
// tenant_id is nullable: NULL = system-wide type visible to all tenants.
//
// COALESCE-based unique index (cannot be modeled in Prisma):
//   - idx_absence_types_code: UNIQUE ON (COALESCE(tenant_id, '00000000-...'), code)
// This constraint is enforced at the DB level only.
//
// Trigger: update_absence_types_updated_at auto-sets updated_at on UPDATE
model AbsenceType {
  id                  String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId            String?   @map("tenant_id") @db.Uuid
  code                String    @db.VarChar(10)
  name                String    @db.VarChar(100)
  description         String?   @db.Text
  category            String    @db.VarChar(20)
  portion             Int       @default(1) @db.Integer
  holidayCode         String?   @map("holiday_code") @db.VarChar(10)
  priority            Int       @default(0) @db.Integer
  deductsVacation     Boolean   @default(false) @map("deducts_vacation")
  requiresApproval    Boolean   @default(true) @map("requires_approval")
  requiresDocument    Boolean   @default(false) @map("requires_document")
  color               String    @default("#808080") @db.VarChar(7)
  sortOrder           Int       @default(0) @map("sort_order") @db.Integer
  isSystem            Boolean   @default(false) @map("is_system")
  isActive            Boolean   @default(true) @map("is_active")
  absenceTypeGroupId  String?   @map("absence_type_group_id") @db.Uuid
  calculationRuleId   String?   @map("calculation_rule_id") @db.Uuid
  createdAt           DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt           DateTime  @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)

  // Relations
  tenant            Tenant?            @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  absenceTypeGroup  AbsenceTypeGroup?  @relation(fields: [absenceTypeGroupId], references: [id], onDelete: SetNull)
  calculationRule   CalculationRule?   @relation(fields: [calculationRuleId], references: [id], onDelete: SetNull)

  // Indexes
  @@index([tenantId], map: "idx_absence_types_tenant")
  @@index([absenceTypeGroupId], map: "idx_absence_types_group")
  @@index([calculationRuleId], map: "idx_absence_types_calculation_rule")
  @@map("absence_types")
}
```

### 1.2 Update related models with back-relations

**AbsenceTypeGroup** (line ~985): Add the `absenceTypes` relation and remove the comment about missing AbsenceType:

```prisma
  // Relations
  tenant        Tenant         @relation(...)
  absenceTypes  AbsenceType[]
```

**CalculationRule** (line ~1014): Add the `absenceTypes` relation and remove the comment about missing AbsenceType:

```prisma
  // Relations
  tenant        Tenant         @relation(...)
  account       Account?       @relation(...)
  absenceTypes  AbsenceType[]
```

**Tenant** (line ~94): Add `absenceTypes` to the relations list:

```prisma
  absenceTypes          AbsenceType[]
```

### 1.3 Generate Prisma client

```bash
cd apps/web && npx prisma generate
```

### Verification Steps (Phase 1)

- [ ] `npx prisma generate` succeeds without errors
- [ ] `npx prisma validate` passes
- [ ] The generated client includes `AbsenceType` model with all fields
- [ ] `AbsenceTypeGroup.absenceTypes` and `CalculationRule.absenceTypes` relations exist

---

## Phase 2: tRPC Router Implementation

### 2.1 Create `apps/web/src/server/routers/absenceTypes.ts`

Follow the established patterns from `absenceTypeGroups.ts` and `calculationRules.ts`.

**Permission:** Use `absence_types.manage` for ALL procedures (consistent with `absenceTypeGroups` and `calculationRules` routers).

**Key design decisions based on research:**

1. **System types handling:** The `list` and `getById` procedures must include system types (where `tenantId IS NULL`) since the Go `ListTypes` includes them with `includeSystem=true`. Use an `OR` filter: `{ OR: [{ tenantId }, { tenantId: null }] }`.

2. **System type protection:** `update` and `delete` must block modifications to system types (`isSystem === true`), matching Go's `ErrCannotModifySystem` behavior.

3. **Delete "in use" check:** Before deleting, query `absence_days` table via raw SQL to check if the absence type is referenced, following the `calculationRules.delete` pattern.

4. **Code validation:** The Go backend validates code prefix per category (U for vacation, K for illness, S for special, U for unpaid). Replicate this in the tRPC `create` procedure.

5. **Force non-system on create:** Always set `isSystem: false` for tenant-created types (matching Go's `CreateType`).

6. **Code uniqueness:** Check within the tenant scope using the COALESCE approach or Prisma `findFirst` with matching tenant filter.

#### Output Schema

```typescript
const absenceTypeOutputSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid().nullable(),
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  category: z.string(),
  portion: z.number(),
  holidayCode: z.string().nullable(),
  priority: z.number(),
  deductsVacation: z.boolean(),
  requiresApproval: z.boolean(),
  requiresDocument: z.boolean(),
  color: z.string(),
  sortOrder: z.number(),
  isSystem: z.boolean(),
  isActive: z.boolean(),
  absenceTypeGroupId: z.string().uuid().nullable(),
  calculationRuleId: z.string().uuid().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
})
```

#### Create Input Schema

```typescript
const createAbsenceTypeInputSchema = z.object({
  code: z.string().min(1, "Code is required").max(10),
  name: z.string().min(1, "Name is required").max(100),
  description: z.string().optional(),
  category: z.enum(["vacation", "illness", "special", "unpaid"]),
  portion: z.number().int().min(0).max(2).optional().default(1),
  holidayCode: z.string().max(10).optional(),
  priority: z.number().int().optional().default(0),
  deductsVacation: z.boolean().optional().default(false),
  requiresApproval: z.boolean().optional().default(true),
  requiresDocument: z.boolean().optional().default(false),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional().default("#808080"),
  sortOrder: z.number().int().optional().default(0),
  absenceTypeGroupId: z.string().uuid().optional(),
  calculationRuleId: z.string().uuid().optional(),
})
```

#### Update Input Schema

```typescript
const updateAbsenceTypeInputSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100).optional(),
  description: z.string().nullable().optional(),
  category: z.enum(["vacation", "illness", "special", "unpaid"]).optional(),
  portion: z.number().int().min(0).max(2).optional(),
  holidayCode: z.string().max(10).nullable().optional(),
  priority: z.number().int().optional(),
  deductsVacation: z.boolean().optional(),
  requiresApproval: z.boolean().optional(),
  requiresDocument: z.boolean().optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
  absenceTypeGroupId: z.string().uuid().nullable().optional(),
  calculationRuleId: z.string().uuid().nullable().optional(),
})
```

Note: `code` is NOT updatable (immutable after creation, same as Go behavior where code is set at creation). `isSystem` is never settable by users.

#### Procedure Details

**`absenceTypes.list`**
- Input: optional `{ isActive?: boolean, category?: string, includeSystem?: boolean }`
- Default: includes system types (matching Go behavior `includeSystem=true`)
- Filter: `{ OR: [{ tenantId: ctx.tenantId }, { tenantId: null }] }` plus optional `isActive`, `category`
- If `includeSystem` is explicitly `false`, add `{ isSystem: false }` filter
- Order by: `sortOrder ASC, code ASC`
- Output: `{ data: AbsenceType[] }`

**`absenceTypes.getById`**
- Input: `{ id: string (uuid) }`
- Query: `findFirst` where `{ id, OR: [{ tenantId }, { tenantId: null }] }`
- Throws: `NOT_FOUND` if not found
- Output: single `AbsenceType`

**`absenceTypes.create`**
- Validate code prefix matches category (U=vacation/unpaid, K=illness, S=special)
- Check code uniqueness within tenant (use `findFirst` with `{ tenantId: ctx.tenantId, code }`)
- Force `isSystem: false`
- Output: created `AbsenceType`

**`absenceTypes.update`**
- Find existing by ID, tenant-scoped (NOT system types -- `{ id, tenantId, isSystem: false }`)
- Block if `isSystem === true` -> throw `BAD_REQUEST("Cannot modify system absence type")`
- Validate code prefix if category changes
- Partial update (only provided fields)
- Output: updated `AbsenceType`

**`absenceTypes.delete`**
- Find existing by ID, tenant-scoped
- Block if `isSystem === true` -> throw `BAD_REQUEST("Cannot delete system absence type")`
- Check usage in `absence_days` via raw SQL:
  ```typescript
  const result = await ctx.prisma.$queryRawUnsafe<[{ count: number }]>(
    `SELECT COUNT(*)::int as count FROM absence_days WHERE absence_type_id = $1`,
    input.id
  )
  ```
- If in use: throw `BAD_REQUEST("Cannot delete absence type that is in use by absence days")`
- Hard delete
- Output: `{ success: boolean }`

### 2.2 Register router in `apps/web/src/server/root.ts`

Add import and registration:
```typescript
import { absenceTypesRouter } from "./routers/absenceTypes"

// In appRouter:
absenceTypes: absenceTypesRouter,
```

### Verification Steps (Phase 2)

- [ ] TypeScript compilation succeeds (`npx tsc --noEmit`)
- [ ] Router exports properly and is registered in root.ts
- [ ] All 5 procedures are defined (list, getById, create, update, delete)
- [ ] Permission check uses `absence_types.manage` for all procedures
- [ ] System type protection is enforced for update and delete
- [ ] Delete checks `absence_days` usage before deletion

---

## Phase 3: Frontend Hooks Migration

### 3.1 Create `apps/web/src/hooks/api/use-absence-types.ts`

New tRPC-based hooks, following the pattern from `use-absence-type-groups.ts`:

```typescript
import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

export function useAbsenceTypes(options: { isActive?: boolean; category?: string; includeSystem?: boolean; enabled?: boolean } = {}) {
  const { enabled = true, ...input } = options
  const trpc = useTRPC()
  return useQuery(
    trpc.absenceTypes.list.queryOptions(
      Object.keys(input).length > 0 ? input : undefined,
      { enabled }
    )
  )
}

export function useAbsenceType(id: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.absenceTypes.getById.queryOptions(
      { id },
      { enabled: enabled && !!id }
    )
  )
}

export function useCreateAbsenceType() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.absenceTypes.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.absenceTypes.list.queryKey(),
      })
    },
  })
}

export function useUpdateAbsenceType() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.absenceTypes.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.absenceTypes.list.queryKey(),
      })
    },
  })
}

export function useDeleteAbsenceType() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.absenceTypes.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.absenceTypes.list.queryKey(),
      })
    },
  })
}
```

### 3.2 Update barrel exports in `apps/web/src/hooks/api/index.ts`

**Remove** `useAbsenceTypes`, `useAbsenceType`, `useCreateAbsenceType`, `useUpdateAbsenceType`, `useDeleteAbsenceType` from the `./use-absences` export block (lines 101-102, 111-113).

**Add** new export block:
```typescript
// Absence Types (tRPC)
export {
  useAbsenceTypes,
  useAbsenceType,
  useCreateAbsenceType,
  useUpdateAbsenceType,
  useDeleteAbsenceType,
} from './use-absence-types'
```

**Keep** the remaining absence hooks (`useAbsences`, `useEmployeeAbsences`, `useAbsence`, `useCreateAbsenceRange`, `useUpdateAbsence`, `useDeleteAbsence`, `useApproveAbsence`, `useRejectAbsence`) in `./use-absences` -- these are for absence DAY operations, not absence TYPE operations, and are not being migrated in this ticket.

### 3.3 Remove migrated hooks from `apps/web/src/hooks/api/use-absences.ts`

Remove these 5 functions from `use-absences.ts`:
- `useAbsenceTypes` (lines 19-24)
- `useAbsenceType` (lines 29-34)
- `useCreateAbsenceType` (lines 179-183)
- `useUpdateAbsenceType` (lines 188-192)
- `useDeleteAbsenceType` (lines 197-201)

### Verification Steps (Phase 3)

- [ ] New hooks file exists at `apps/web/src/hooks/api/use-absence-types.ts`
- [ ] Barrel exports updated -- no duplicate exports
- [ ] Old Go API hooks for absence types removed from `use-absences.ts`
- [ ] Non-type absence hooks (useAbsences, useCreateAbsenceRange, etc.) remain untouched
- [ ] TypeScript compilation succeeds

---

## Phase 4: Frontend Component Updates

### 4.1 Update `apps/web/src/app/[locale]/(dashboard)/admin/absence-types/page.tsx`

This page currently:
- Imports `useAbsenceTypes` and `useDeleteAbsenceType` from `@/hooks/api`
- Uses `absenceTypesData?.data` where `data` is an array
- Calls `deleteMutation.mutateAsync({ path: { id: deleteItem.id } })`
- Uses `components['schemas']['AbsenceType']` type from OpenAPI

Changes needed:
- The `useAbsenceTypes` hook call changes from `useAbsenceTypes(enabled)` to `useAbsenceTypes({ enabled })`
- The data shape changes from `absenceTypesData?.data` (Go API response) to `absenceTypesData?.data` (tRPC wraps in `{ data: [...] }` too, so this stays the same)
- Delete mutation changes from `mutateAsync({ path: { id } })` to `mutateAsync({ id })`
- Replace `components['schemas']['AbsenceType']` type with the tRPC inferred type, OR keep using a local type that matches the new output schema. Since field names change from snake_case (Go) to camelCase (tRPC), component property access needs updating:
  - `t.is_active` -> `t.isActive`
  - `t.is_system` -> `t.isSystem`
  - `t.code` -> `t.code` (no change)
  - `t.category` -> `t.category` (no change)

### 4.2 Update `apps/web/src/components/absence-types/absence-type-form-sheet.tsx`

Changes needed:
- Import from `@/hooks/api` (same -- barrel export updated)
- Remove `import type { components } from '@/lib/api/types'` and the `AbsenceType` type alias
- Update create mutation call: `mutateAsync({ code, name, ... })` instead of `mutateAsync({ body: { ... } })`
- Update update mutation call: `mutateAsync({ id, name, ... })` instead of `mutateAsync({ path: { id }, body: { ... } })`
- Field name mapping in form reset effect:
  - `absenceType.is_paid` -> N/A (no `isPaid` in DB; this maps to `deductsVacation` inverted or can be handled differently)
  - `absenceType.affects_vacation_balance` -> `absenceType.deductsVacation`
  - `absenceType.requires_approval` -> `absenceType.requiresApproval`
  - `absenceType.is_active` -> `absenceType.isActive`
  - `absenceType.is_system` -> `absenceType.isSystem`

**Important field mapping note:** The Go OpenAPI model uses `is_paid` and `affects_vacation_balance`, while the DB has `deducts_vacation`. The form currently uses `isPaid` and `affectsVacationBalance`. For the tRPC migration:
- `deductsVacation` in the DB/Prisma is the actual field
- The form's `affectsVacationBalance` maps to `deductsVacation`
- `isPaid` has no direct DB column -- it can be derived or dropped (the DB has no `is_paid` column)

The form needs to be updated to work with the actual DB field names (`deductsVacation`, `requiresApproval`, `requiresDocument`, etc.).

### 4.3 Update `apps/web/src/components/absence-types/absence-type-detail-sheet.tsx`

Changes needed:
- Remove OpenAPI type import
- Update field access from snake_case to camelCase:
  - `absenceType.is_system` -> `absenceType.isSystem`
  - `absenceType.is_active` -> `absenceType.isActive`
  - `absenceType.is_paid` -> derive from fields or remove
  - `absenceType.affects_vacation_balance` -> `absenceType.deductsVacation`
  - `absenceType.requires_approval` -> `absenceType.requiresApproval`
  - `absenceType.created_at` -> `absenceType.createdAt`
  - `absenceType.updated_at` -> `absenceType.updatedAt`

### 4.4 Update `apps/web/src/components/absences/absence-request-form.tsx`

This component uses `useAbsenceTypes` to populate the absence type selector. Changes needed:
- The hook call `useAbsenceTypes(open)` changes to `useAbsenceTypes({ enabled: open })`
- Data access `absenceTypesData?.data` stays the same shape
- The component passes `absenceTypes` to `AbsenceTypeSelector` -- need to verify the type selector's expected shape matches the new camelCase fields

### 4.5 Update `apps/web/src/components/absences/absence-type-selector.tsx`

This component uses `components['schemas']['AbsenceType']` type. Need to update:
- Remove OpenAPI type import
- Use inferred tRPC type or define a local interface matching the tRPC output
- Update field references if any use snake_case

### Verification Steps (Phase 4)

- [ ] TypeScript compilation succeeds (`npx tsc --noEmit`)
- [ ] Admin absence types page loads and displays data
- [ ] Create absence type form works
- [ ] Edit absence type form works
- [ ] Delete absence type works
- [ ] Absence request form shows absence types in selector
- [ ] System types show as read-only (no edit/delete)
- [ ] No remaining references to Go API `/absence-types` endpoints in components

---

## Phase 5: Tests

### 5.1 Create `apps/web/src/server/__tests__/absenceTypes-router.test.ts`

Follow the pattern from `absenceTypeGroups-router.test.ts`. Test all 5 procedures:

**Helper: `makeAbsenceType(overrides)`**
```typescript
function makeAbsenceType(overrides = {}) {
  return {
    id: TYPE_ID,
    tenantId: TENANT_ID,
    code: "U01",
    name: "Custom Vacation",
    description: null,
    category: "vacation",
    portion: 1,
    holidayCode: null,
    priority: 0,
    deductsVacation: true,
    requiresApproval: true,
    requiresDocument: false,
    color: "#4CAF50",
    sortOrder: 1,
    isSystem: false,
    isActive: true,
    absenceTypeGroupId: null,
    calculationRuleId: null,
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
    ...overrides,
  }
}
```

**Test cases for `absenceTypes.list`:**
1. Returns types for tenant (including system types with `tenantId: null`)
2. Filters by `isActive` when provided
3. Filters by `category` when provided
4. Returns empty array when no types

**Test cases for `absenceTypes.getById`:**
1. Returns type when found (tenant-owned)
2. Returns system type (tenantId: null)
3. Throws NOT_FOUND for missing type
4. Throws NOT_FOUND for type belonging to different tenant

**Test cases for `absenceTypes.create`:**
1. Creates type successfully
2. Trims whitespace from code, name, description
3. Rejects empty code
4. Rejects empty name
5. Rejects duplicate code within tenant (CONFLICT)
6. Validates code prefix matches category (U for vacation, K for illness, S for special)
7. Forces `isSystem: false`
8. Sets default values for optional fields

**Test cases for `absenceTypes.update`:**
1. Updates name and description
2. Blocks modification of system types (BAD_REQUEST)
3. Throws NOT_FOUND for missing type
4. Supports partial updates (only changes provided fields)
5. Can set `isActive` to false
6. Can set nullable fields to null (description, holidayCode, etc.)

**Test cases for `absenceTypes.delete`:**
1. Deletes type successfully
2. Blocks deletion of system types (BAD_REQUEST)
3. Throws NOT_FOUND for missing type
4. Blocks deletion when absence_days reference the type (BAD_REQUEST "in use")

**Mock structure for delete tests:**
```typescript
const mockPrisma = {
  absenceType: {
    findFirst: vi.fn().mockResolvedValue(existing),
    delete: vi.fn().mockResolvedValue(existing),
  },
  $queryRawUnsafe: vi.fn().mockResolvedValue([{ count: 0 }]),
}
```

### Verification Steps (Phase 5)

- [ ] All tests pass: `cd apps/web && npx vitest run src/server/__tests__/absenceTypes-router.test.ts`
- [ ] Test coverage includes all CRUD operations
- [ ] System type protection tested
- [ ] "In use" delete check tested
- [ ] Code prefix validation tested

---

## Phase 6: Final Verification

### 6.1 Full Build Check

```bash
cd apps/web && npx tsc --noEmit
cd apps/web && npx prisma validate
cd apps/web && npx vitest run src/server/__tests__/absenceTypes-router.test.ts
```

### 6.2 Integration Verification Checklist

- [ ] No remaining imports of `components['schemas']['AbsenceType']` in migrated components
- [ ] No remaining `useApiQuery('/absence-types'...)` or `useApiMutation('/absence-types'...)` calls
- [ ] All 4 components updated (page, form-sheet, detail-sheet, absence-request-form + selector)
- [ ] Barrel exports clean (no duplicate hook names)
- [ ] `use-absences.ts` still exports all non-type absence hooks
- [ ] Router properly registered in `root.ts`
- [ ] Prisma schema has proper relations on AbsenceTypeGroup and CalculationRule

---

## Files to Create

| File | Description |
|------|-------------|
| `apps/web/src/server/routers/absenceTypes.ts` | tRPC router with 5 procedures |
| `apps/web/src/server/__tests__/absenceTypes-router.test.ts` | Router tests |
| `apps/web/src/hooks/api/use-absence-types.ts` | tRPC-based frontend hooks |

## Files to Modify

| File | Change |
|------|--------|
| `apps/web/prisma/schema.prisma` | Add AbsenceType model, update AbsenceTypeGroup/CalculationRule/Tenant relations |
| `apps/web/src/server/root.ts` | Import and register absenceTypesRouter |
| `apps/web/src/hooks/api/index.ts` | Update barrel exports |
| `apps/web/src/hooks/api/use-absences.ts` | Remove migrated absence type hooks |
| `apps/web/src/app/[locale]/(dashboard)/admin/absence-types/page.tsx` | Update to tRPC hooks + camelCase |
| `apps/web/src/components/absence-types/absence-type-form-sheet.tsx` | Update to tRPC mutations + camelCase |
| `apps/web/src/components/absence-types/absence-type-detail-sheet.tsx` | Update to tRPC queries + camelCase |
| `apps/web/src/components/absences/absence-request-form.tsx` | Update useAbsenceTypes call signature |
| `apps/web/src/components/absences/absence-type-selector.tsx` | Update type definitions |

## Files NOT to Modify

- No new Supabase migration needed (table exists)
- No changes to Go backend files
- No changes to permission catalog (uses existing `absence_types.manage`)
- `use-absences.ts` non-type hooks remain unchanged

---

## Risk Areas and Notes

1. **Field name mismatch:** The frontend currently uses the OpenAPI `components['schemas']['AbsenceType']` type with snake_case fields (`is_active`, `is_system`, `is_paid`). The tRPC output uses camelCase. All component field accesses must be updated.

2. **`is_paid` field:** The Go OpenAPI model has `is_paid` but there is no `is_paid` column in the DB. The DB has `deducts_vacation`. The form currently toggles `isPaid` -- this needs to be mapped to a real field or removed. Decision: map the form's "isPaid" toggle to the actual DB concept, or drop it in favor of showing `deductsVacation` directly.

3. **System type visibility:** The `list` procedure must return system types (tenantId=null) alongside tenant types, since the admin page shows them with the "System" badge and the absence request form needs all available types.

4. **COALESCE unique index:** The DB has a unique index on `COALESCE(tenant_id, '00...')` + `code`. Prisma cannot model this. Code uniqueness is enforced via application-level `findFirst` check before create, plus the DB constraint as a safety net.

5. **Category values:** The Go model uses `vacation`, `illness`, `special`, `unpaid`. The OpenAPI model uses `vacation`, `sick`, `personal`, `unpaid`, `holiday`, `other`. The DB contains the Go values. The tRPC router should use the DB values. Frontend category filters and labels may need updating to match.
