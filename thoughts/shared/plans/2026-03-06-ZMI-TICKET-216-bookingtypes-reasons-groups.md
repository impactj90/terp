# tRPC Routers: BookingTypes, BookingReasons, BookingTypeGroups, AbsenceTypeGroups, CalculationRules - Implementation Plan

## Overview

Implement five tRPC routers for BookingTypes, BookingReasons, BookingTypeGroups (with member management), AbsenceTypeGroups, and CalculationRules by porting business logic from the Go backend into TypeScript tRPC procedures. This includes adding the required Prisma models (which do not yet exist), building CRUD routers, migrating four existing frontend hooks from the old `useApiQuery`/`useApiMutation` pattern to tRPC, and creating a new `useBookingReasons` hook.

## Current State Analysis

- **Prisma models**: NONE of the five entity types exist in the Prisma schema yet. All six models (`BookingType`, `BookingReason`, `BookingTypeGroup`, `BookingTypeGroupMember`, `AbsenceTypeGroup`, `CalculationRule`) need to be added to `apps/web/prisma/schema.prisma`.
- **Database tables**: All tables already exist via SQL migrations: `booking_types` (000021 + 000044), `booking_reasons` (000044 + 000078), `booking_type_groups` (000044), `booking_type_group_members` (000044), `absence_type_groups` (000042), `calculation_rules` (000046).
- **Go business logic**: Complete service implementations exist for all five entities in `apps/api/internal/service/` totaling ~1001 lines.
- **Permission catalog**: Two permissions cover all five entities: `booking_types.manage` (line 105 of `permission-catalog.ts`) for BookingTypes, BookingReasons, AND BookingTypeGroups; `absence_types.manage` (line 107) for AbsenceTypeGroups AND CalculationRules. The ticket mentions `booking_types.read`/`booking_types.write` and `booking_reasons.*` and `calculation_rules.*` but these do NOT exist in the catalog and the Go backend does not use them. We follow the Go backend's actual permission mapping.
- **tRPC infrastructure**: Fully operational with `tenantProcedure`, `requirePermission`, and `createCallerFactory`.
- **Root router**: 20 routers currently registered in `apps/web/src/server/root.ts` -- 5 new ones to add.
- **Frontend hooks**: Four hooks exist using old `useApiQuery`/`useApiMutation` pattern (`use-booking-types.ts`, `use-booking-type-groups.ts`, `use-absence-type-groups.ts`, `use-calculation-rules.ts`). No hook exists for BookingReasons (confirmed by ticket).
- **Account model**: Already exists in Prisma (`apps/web/prisma/schema.prisma:340-369`), needed for the BookingType -> Account and CalculationRule -> Account relations.

### Key Discoveries:
- `BookingType.tenantId` is NULLABLE (`apps/web/prisma/schema.prisma` pattern matches `UserGroup` and `EmploymentType`). System types (COME, GO, BREAK_START, BREAK_END) have `tenant_id = NULL`, `is_system = true`. They appear in list queries alongside tenant types using `OR tenant_id IS NULL`. They cannot be modified or deleted.
- The COALESCE-based unique index on `booking_types(COALESCE(tenant_id, '00...'), code)` cannot be modeled in Prisma -- same pattern used for `UserGroup` and `EmploymentType` where a comment documents this limitation.
- `BookingTypeGroup` has a separate join table `booking_type_group_members` for member management. The Go pattern is delete-all-then-re-insert (`SetMembers`). Members are included in every response.
- `BookingReason` has a triple-column unique constraint `(tenant_id, booking_type_id, code)` and interdependent adjustment fields (`reference_time`, `offset_minutes`, `adjustment_booking_type_id`).
- `CalculationRule.factor` is `NUMERIC(5,2)` in PostgreSQL, maps to `Decimal` in Prisma.
- `CalculationRule` delete checks `absence_types.calculation_rule_id` usage. Since `AbsenceType` is NOT in Prisma yet, we use `ctx.prisma.$queryRawUnsafe` for the count query.
- `BookingType` delete checks `bookings` table usage. Since `Booking` is NOT in Prisma yet, we use `ctx.prisma.$queryRawUnsafe` for the count query.
- The Go `ListWithSystem` query includes a `usage_count` subquery from the `bookings` table. Since `Booking` is not in Prisma, we use `$queryRawUnsafe` for this computed field, or omit it (the frontend hooks do not use `usageCount` in the old hook pattern). Decision: omit `usageCount` from the tRPC response since it requires raw SQL and is not used by any current frontend component for display purposes. If needed later, it can be added as a separate procedure.

## Desired End State

After completing this plan:
1. Six new Prisma models (`BookingType`, `BookingReason`, `BookingTypeGroup`, `BookingTypeGroupMember`, `AbsenceTypeGroup`, `CalculationRule`) exist in `schema.prisma` with proper relations.
2. The `Tenant` model has relation fields for all new models.
3. The `Account` model has reverse relations for `BookingType` and `CalculationRule`.
4. Five new tRPC routers (`bookingTypes`, `bookingReasons`, `bookingTypeGroups`, `absenceTypeGroups`, `calculationRules`) are registered in the root router.
5. All CRUD operations work through tRPC, matching Go business logic behavior.
6. The `bookingTypes` router includes system types (NULL tenant) in list queries and prevents modification/deletion of system types.
7. The `bookingTypeGroups` router manages members via the join table.
8. The `bookingReasons` router validates adjustment field consistency.
9. The `calculationRules` router checks usage before delete (via raw SQL).
10. Frontend hooks use tRPC instead of REST (4 migrated, 1 new).
11. All routers have comprehensive test coverage.
12. `npx tsc --noEmit` and all tests pass.

**Verification**: Run `cd apps/web && npx vitest run src/server/__tests__/` to verify all router tests pass. Run `cd apps/web && npx tsc --noEmit` to verify type checking. Run `cd apps/web && npx prisma generate` to regenerate the Prisma client after schema changes.

## What We're NOT Doing

- **Database migrations**: All tables already exist. We only update the Prisma schema to match existing tables.
- **Absence Types CRUD**: Deferred to ZMI-TICKET-218 (depends on CalculationRules from this ticket).
- **Booking CRUD**: Deferred to ZMI-TICKET-232.
- **BookingType `usageCount`**: The Go backend includes a subquery counting bookings per type. Since the `Booking` model is not in Prisma, we omit this computed field. Can be added later when `Booking` is modeled.
- **UI page components**: Only the hook layer is migrated; page components remain unchanged.
- **Go endpoint removal**: Go REST endpoints stay in place during migration.
- **New permissions**: The ticket mentions `booking_reasons.*` and `calculation_rules.*` permissions, but these do not exist in the catalog or Go backend. We use the actual Go permission mapping: `booking_types.manage` for booking-related entities, `absence_types.manage` for absence/calculation entities.

## Implementation Approach

Build in phases ordered by dependency: first Prisma schema (prerequisite for all routers), then routers from simplest to most complex (AbsenceTypeGroups -> CalculationRules -> BookingTypes -> BookingReasons -> BookingTypeGroups). Each phase produces working, tested code.

---

## Phase 1: Prisma Schema Updates

### Overview
Add all six missing Prisma models and update the `Tenant` and `Account` models with proper relation fields. This is the prerequisite for all subsequent phases.

### Changes Required:

#### 1. Add BookingType Model
**File**: `apps/web/prisma/schema.prisma`
**Changes**: Add after the `Account` model section.

```prisma
// -----------------------------------------------------------------------------
// BookingType
// -----------------------------------------------------------------------------
// Migrations: 000021, 000044
//
// COALESCE-based unique index (cannot be modeled in Prisma):
//   idx_booking_types_code: UNIQUE ON (COALESCE(tenant_id, '00000000-...'), code)
// This constraint is enforced at the DB level only.
//
// tenant_id is nullable: NULL = system-wide type visible to all tenants.
// System types seeded: COME, GO, BREAK_START, BREAK_END
//
// CHECK constraints (enforced at DB level only):
//   - direction IN ('in', 'out')
//   - category IN ('work', 'break', 'business_trip', 'other')
model BookingType {
  id             String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId       String?   @map("tenant_id") @db.Uuid
  code           String    @db.VarChar(20)
  name           String    @db.VarChar(255)
  description    String?   @db.Text
  direction      String    @db.VarChar(10)
  category       String    @default("work") @db.VarChar(30)
  accountId      String?   @map("account_id") @db.Uuid
  requiresReason Boolean   @default(false) @map("requires_reason")
  isSystem       Boolean   @default(false) @map("is_system")
  isActive       Boolean   @default(true) @map("is_active")
  createdAt      DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt      DateTime  @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)

  // Relations
  tenant          Tenant?                  @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  account         Account?                 @relation(fields: [accountId], references: [id], onDelete: SetNull)
  bookingReasons  BookingReason[]
  groupMembers    BookingTypeGroupMember[]

  // Indexes
  @@index([tenantId], map: "idx_booking_types_tenant")
  @@index([accountId], map: "idx_booking_types_account")
  @@index([category], map: "idx_booking_types_category")
  @@map("booking_types")
}
```

#### 2. Add BookingReason Model
**File**: `apps/web/prisma/schema.prisma`

```prisma
// -----------------------------------------------------------------------------
// BookingReason
// -----------------------------------------------------------------------------
// Migrations: 000044, 000078
//
// Trigger: update_booking_reasons_updated_at auto-sets updated_at on UPDATE
model BookingReason {
  id                       String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId                 String    @map("tenant_id") @db.Uuid
  bookingTypeId            String    @map("booking_type_id") @db.Uuid
  code                     String    @db.VarChar(50)
  label                    String    @db.VarChar(255)
  isActive                 Boolean   @default(true) @map("is_active")
  sortOrder                Int       @default(0) @map("sort_order") @db.Integer
  referenceTime            String?   @map("reference_time") @db.VarChar(20)
  offsetMinutes            Int?      @map("offset_minutes") @db.Integer
  adjustmentBookingTypeId  String?   @map("adjustment_booking_type_id") @db.Uuid
  createdAt                DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt                DateTime  @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)

  // Relations
  tenant      Tenant      @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  bookingType BookingType @relation(fields: [bookingTypeId], references: [id], onDelete: Cascade)
  // Note: adjustmentBookingTypeId FK references booking_types(id) ON DELETE SET NULL.
  // Self-relation to BookingType omitted to avoid multiple FK ambiguity.

  // Indexes
  @@unique([tenantId, bookingTypeId, code], map: "booking_reasons_tenant_id_booking_type_id_code_key")
  @@index([tenantId], map: "idx_booking_reasons_tenant")
  @@index([bookingTypeId], map: "idx_booking_reasons_booking_type")
  @@map("booking_reasons")
}
```

#### 3. Add BookingTypeGroup and BookingTypeGroupMember Models
**File**: `apps/web/prisma/schema.prisma`

```prisma
// -----------------------------------------------------------------------------
// BookingTypeGroup
// -----------------------------------------------------------------------------
// Migrations: 000044
//
// Trigger: update_booking_type_groups_updated_at auto-sets updated_at on UPDATE
model BookingTypeGroup {
  id          String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId    String    @map("tenant_id") @db.Uuid
  code        String    @db.VarChar(50)
  name        String    @db.VarChar(255)
  description String?   @db.Text
  isActive    Boolean   @default(true) @map("is_active")
  createdAt   DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt   DateTime  @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)

  // Relations
  tenant  Tenant                   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  members BookingTypeGroupMember[]

  // Indexes
  @@unique([tenantId, code], map: "booking_type_groups_tenant_id_code_key")
  @@index([tenantId], map: "idx_booking_type_groups_tenant")
  @@map("booking_type_groups")
}

// -----------------------------------------------------------------------------
// BookingTypeGroupMember
// -----------------------------------------------------------------------------
// Migration: 000044
//
// Join table linking booking types to groups with sort ordering.
model BookingTypeGroupMember {
  id            String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  groupId       String   @map("group_id") @db.Uuid
  bookingTypeId String   @map("booking_type_id") @db.Uuid
  sortOrder     Int      @default(0) @map("sort_order") @db.Integer
  createdAt     DateTime @default(now()) @map("created_at") @db.Timestamptz(6)

  // Relations
  group       BookingTypeGroup @relation(fields: [groupId], references: [id], onDelete: Cascade)
  bookingType BookingType      @relation(fields: [bookingTypeId], references: [id], onDelete: Cascade)

  // Indexes
  @@unique([groupId, bookingTypeId], map: "booking_type_group_members_group_id_booking_type_id_key")
  @@index([groupId], map: "idx_btgm_group")
  @@index([bookingTypeId], map: "idx_btgm_booking_type")
  @@map("booking_type_group_members")
}
```

#### 4. Add AbsenceTypeGroup Model
**File**: `apps/web/prisma/schema.prisma`

```prisma
// -----------------------------------------------------------------------------
// AbsenceTypeGroup
// -----------------------------------------------------------------------------
// Migration: 000042
//
// Trigger: update_absence_type_groups_updated_at auto-sets updated_at on UPDATE
model AbsenceTypeGroup {
  id          String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId    String    @map("tenant_id") @db.Uuid
  code        String    @db.VarChar(50)
  name        String    @db.VarChar(255)
  description String?   @db.Text
  isActive    Boolean   @default(true) @map("is_active")
  createdAt   DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt   DateTime  @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)

  // Relations
  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  // Note: absence_types.absence_type_group_id FK references this table.
  // AbsenceType model not yet in Prisma. Relation will be added when it is.

  // Indexes
  @@unique([tenantId, code], map: "absence_type_groups_tenant_id_code_key")
  @@index([tenantId], map: "idx_absence_type_groups_tenant")
  @@map("absence_type_groups")
}
```

#### 5. Add CalculationRule Model
**File**: `apps/web/prisma/schema.prisma`

```prisma
// -----------------------------------------------------------------------------
// CalculationRule
// -----------------------------------------------------------------------------
// Migration: 000046
//
// Formula: account_value = value * factor (if value=0, use daily target time * factor)
//
// Trigger: update_calculation_rules_updated_at auto-sets updated_at on UPDATE
model CalculationRule {
  id          String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId    String    @map("tenant_id") @db.Uuid
  code        String    @db.VarChar(50)
  name        String    @db.VarChar(255)
  description String?   @db.Text
  accountId   String?   @map("account_id") @db.Uuid
  value       Int       @default(0) @db.Integer
  factor      Decimal   @default(1.00) @db.Decimal(5, 2)
  isActive    Boolean   @default(true) @map("is_active")
  createdAt   DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt   DateTime  @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)

  // Relations
  tenant  Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  account Account? @relation(fields: [accountId], references: [id], onDelete: SetNull)
  // Note: absence_types.calculation_rule_id FK references this table.
  // AbsenceType model not yet in Prisma. Relation will be added when it is.

  // Indexes
  @@unique([tenantId, code], map: "calculation_rules_tenant_id_code_key")
  @@index([tenantId], map: "idx_calculation_rules_tenant")
  @@index([accountId], map: "idx_calculation_rules_account")
  @@index([tenantId, isActive], map: "idx_calculation_rules_active")
  @@map("calculation_rules")
}
```

#### 6. Update Tenant Model Relations
**File**: `apps/web/prisma/schema.prisma`
**Changes**: Add relation fields to the `Tenant` model (in the relations section, after `orderAssignments`):

```prisma
  bookingTypes              BookingType[]
  bookingReasons            BookingReason[]
  bookingTypeGroups         BookingTypeGroup[]
  absenceTypeGroups         AbsenceTypeGroup[]
  calculationRules          CalculationRule[]
```

#### 7. Update Account Model Relations
**File**: `apps/web/prisma/schema.prisma`
**Changes**: Add reverse relation fields to the `Account` model (after `accountGroup` relation):

```prisma
  bookingTypes     BookingType[]
  calculationRules CalculationRule[]
```

### Success Criteria:

#### Automated Verification:
- [ ] Prisma client generates successfully: `cd apps/web && npx prisma generate`
- [ ] Type checking passes: `cd apps/web && npx tsc --noEmit`
- [ ] Prisma schema validates: `cd apps/web && npx prisma validate`

#### Manual Verification:
- [ ] Verify all six new models appear in the generated Prisma client types
- [ ] Verify Tenant model has all five new relation fields
- [ ] Verify Account model has two new reverse relation fields

**Implementation Note**: After completing this phase and all automated verification passes, proceed directly to Phase 2. No manual testing needed for schema-only changes.

---

## Phase 2: tRPC Routers

### Overview
Implement all five tRPC routers. Order: absenceTypeGroups (simplest) -> calculationRules -> bookingTypes -> bookingReasons -> bookingTypeGroups (most complex, has member management).

### Changes Required:

#### 1. AbsenceTypeGroups Router
**File**: `apps/web/src/server/routers/absenceTypeGroups.ts` (new file)
**Pattern**: Follow `apps/web/src/server/routers/activities.ts` closely (simple CRUD, same structure).

**Permission**: `absence_types.manage` (via `permissionIdByKey("absence_types.manage")`)

**Output schema fields**: `id`, `tenantId`, `code`, `name`, `description` (nullable), `isActive`, `createdAt`, `updatedAt`

**Procedures**:
- `list`: `tenantProcedure` + `requirePermission`. Optional input: `{ isActive?: boolean }`. Query: `findMany({ where: { tenantId }, orderBy: { code: "asc" } })`. Returns `{ data: AbsenceTypeGroup[] }`.
- `getById`: `findFirst({ where: { id, tenantId } })`. Throw `NOT_FOUND` if null.
- `create`: Validate code (required, trimmed), name (required, trimmed). Check code uniqueness within tenant. Set `isActive: true`. Trim description.
- `update`: Verify existence + tenant ownership. Support partial update: `code` (with uniqueness re-check if changed), `name`, `description` (nullable), `isActive`.
- `delete`: Verify existence + tenant ownership. Hard delete (no usage check -- Go backend doesn't check either).

**Business logic from Go** (`apps/api/internal/service/absencetypegroup.go`):
- Create: code + name required, trim description, convert empty description to null, check code uniqueness, set isActive=true
- Update: supports code update with uniqueness re-check (excluding current entity), name, description, isActive
- Delete: simple delete after existence check

#### 2. CalculationRules Router
**File**: `apps/web/src/server/routers/calculationRules.ts` (new file)

**Permission**: `absence_types.manage` (same as absenceTypeGroups -- from Go `routes.go`)

**Output schema fields**: `id`, `tenantId`, `code`, `name`, `description` (nullable), `accountId` (nullable uuid), `value` (number), `factor` (number), `isActive`, `createdAt`, `updatedAt`

**Procedures**:
- `list`: Optional input: `{ isActive?: boolean }`. Query: `findMany({ where: { tenantId }, orderBy: { code: "asc" } })`.
- `getById`: Standard pattern.
- `create`: Validate code (required, trimmed), name (required, trimmed). Validate: `value >= 0` (`BAD_REQUEST: "Value must be >= 0"`). Validate: factor defaults to 1.0 if 0, must be > 0 (`BAD_REQUEST: "Factor must be > 0"`). Check code uniqueness. Set `isActive: true`.
- `update`: Partial update: `name`, `description` (nullable), `accountId` (nullable -- `null` clears it), `value` (>= 0), `factor` (> 0), `isActive`. No code update per Go behavior (Go update does not support code change for CalculationRule).
- `delete`: Check usage in `absence_types` table via raw SQL: `SELECT COUNT(*)::int FROM absence_types WHERE calculation_rule_id = $1`. If count > 0, throw `BAD_REQUEST: "Cannot delete calculation rule that is in use by absence types"`. Then hard delete.

**Prisma Decimal handling**: `factor` is `Decimal` in Prisma. In the mapper function, convert to number: `Number(record.factor)`. In create/update, use `new Prisma.Decimal(input.factor)`.

#### 3. BookingTypes Router
**File**: `apps/web/src/server/routers/bookingTypes.ts` (new file)

**Permission**: `booking_types.manage`

**Output schema fields**: `id`, `tenantId` (nullable string), `code`, `name`, `description` (nullable), `direction`, `category`, `accountId` (nullable), `requiresReason`, `isSystem`, `isActive`, `createdAt`, `updatedAt`

**Procedures**:
- `list`: Optional input: `{ isActive?: boolean, direction?: string }`. Query must include system types: `findMany({ where: { OR: [{ tenantId }, { tenantId: null }], ...filters }, orderBy: [{ isSystem: "desc" }, { code: "asc" }] })`. System types sort first (matching Go `ListWithSystem` which orders by `is_system DESC, code ASC`).
- `getById`: Must allow fetching system types: `findFirst({ where: { id, OR: [{ tenantId }, { tenantId: null }] } })`.
- `create`: Validate code (required, trimmed), name (required, trimmed), direction (required, must be "in" or "out"). Category defaults to "work", must be one of "work", "break", "business_trip", "other". Check code uniqueness within tenant (NOT system types -- only check `{ tenantId, code }`). Set `isSystem: false`, `isActive: true`. Optional: `accountId`, `requiresReason`, `description`.
- `update`: Verify existence. Block if `isSystem === true` (`BAD_REQUEST: "Cannot modify system booking types"`). Verify tenant ownership (`tenantId` must match). Partial update: `name`, `description` (nullable), `isActive`, `category` (validate enum), `accountId` (nullable), `requiresReason`. No code or direction update per Go behavior.
- `delete`: Verify existence. Block if `isSystem === true` (`BAD_REQUEST: "Cannot delete system booking types"`). Verify tenant ownership. Check usage in bookings table via raw SQL: `SELECT COUNT(*)::int FROM bookings WHERE booking_type_id = $1`. If count > 0, throw `BAD_REQUEST: "Cannot delete booking type that is in use"`. Hard delete.

**Special considerations**:
- `tenantId` is nullable in the output schema (`z.string().uuid().nullable()`)
- System types have `tenantId: null` and appear in all tenants' list queries
- The `OR` clause in Prisma for nullable tenant: `{ OR: [{ tenantId: ctx.tenantId }, { tenantId: null }] }`

#### 4. BookingReasons Router
**File**: `apps/web/src/server/routers/bookingReasons.ts` (new file)

**Permission**: `booking_types.manage` (same as bookingTypes -- from Go `routes.go`)

**Output schema fields**: `id`, `tenantId`, `bookingTypeId`, `code`, `label`, `isActive`, `sortOrder`, `referenceTime` (nullable string), `offsetMinutes` (nullable number), `adjustmentBookingTypeId` (nullable string), `createdAt`, `updatedAt`

**Procedures**:
- `list`: Optional input: `{ bookingTypeId?: string }`. Query: `findMany({ where: { tenantId, ...bookingTypeFilter }, orderBy: [{ sortOrder: "asc" }, { code: "asc" }] })`. The `bookingTypeId` filter preserves Go behavior (`ListByBookingType`).
- `getById`: Standard pattern with tenant scoping.
- `create`: Validate code (required, trimmed), label (required, trimmed), bookingTypeId (required uuid). Check code uniqueness within `(tenantId, bookingTypeId)`. Validate adjustment consistency: if `referenceTime` is set, `offsetMinutes` must also be set (and vice versa). If `referenceTime` is provided, validate enum: "plan_start", "plan_end", "booking_time". Set `isActive: true`.
- `update`: Partial update: `label`, `isActive`, `sortOrder`, `referenceTime` (nullable), `offsetMinutes` (nullable), `adjustmentBookingTypeId` (nullable). Support `clearAdjustment` boolean flag that clears all three adjustment fields. After building update data, re-validate adjustment consistency.
- `delete`: Verify existence, then hard delete (no usage check per Go behavior).

**Adjustment validation helper function**:
```typescript
function validateAdjustmentFields(referenceTime: string | null | undefined, offsetMinutes: number | null | undefined): void {
  const hasRef = referenceTime !== null && referenceTime !== undefined
  const hasOffset = offsetMinutes !== null && offsetMinutes !== undefined
  if (hasRef !== hasOffset) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "reference_time and offset_minutes must both be set or both be null",
    })
  }
  if (hasRef) {
    const valid = ["plan_start", "plan_end", "booking_time"]
    if (!valid.includes(referenceTime!)) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `reference_time must be one of: ${valid.join(", ")}`,
      })
    }
  }
}
```

#### 5. BookingTypeGroups Router
**File**: `apps/web/src/server/routers/bookingTypeGroups.ts` (new file)

**Permission**: `booking_types.manage` (same as bookingTypes -- from Go `routes.go`)

**Output schema fields**: `id`, `tenantId`, `code`, `name`, `description` (nullable), `isActive`, `createdAt`, `updatedAt`, `members` (array of `{ id, bookingTypeId, sortOrder, bookingType: { id, code, name, direction, category } }`)

**Member output schema**:
```typescript
const memberOutputSchema = z.object({
  id: z.string().uuid(),
  bookingTypeId: z.string().uuid(),
  sortOrder: z.number(),
  bookingType: z.object({
    id: z.string().uuid(),
    code: z.string(),
    name: z.string(),
    direction: z.string(),
    category: z.string(),
  }),
})
```

**Prisma include for members**:
```typescript
const groupInclude = {
  members: {
    orderBy: { sortOrder: "asc" as const },
    include: {
      bookingType: {
        select: { id: true, code: true, name: true, direction: true, category: true },
      },
    },
  },
} as const
```

**Procedures**:
- `list`: Query: `findMany({ where: { tenantId }, orderBy: { code: "asc" }, include: groupInclude })`. Returns `{ data: BookingTypeGroup[] }` with members.
- `getById`: `findFirst({ where: { id, tenantId }, include: groupInclude })`.
- `create`: Validate code (required, trimmed), name (required, trimmed). Check code uniqueness. Create group. If `bookingTypeIds` array is provided, create members with `sortOrder` = array index using `createMany`.
- `update`: Verify existence + tenant ownership. Partial update: `name`, `description` (nullable), `isActive`. If `bookingTypeIds` is provided (not undefined), replace all members: delete existing with `deleteMany({ where: { groupId } })`, then `createMany` new ones. Re-fetch with include for response.
- `delete`: Verify existence + tenant ownership. Hard delete (members cascade via FK).

**Create input schema**:
```typescript
const createInputSchema = z.object({
  code: z.string().min(1, "Code is required"),
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  bookingTypeIds: z.array(z.string().uuid()).optional(),
})
```

**Update input schema**:
```typescript
const updateInputSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
  bookingTypeIds: z.array(z.string().uuid()).optional(),
})
```

**Member replacement logic** (in update):
```typescript
if (input.bookingTypeIds !== undefined) {
  // Replace all members
  await ctx.prisma.bookingTypeGroupMember.deleteMany({
    where: { groupId: input.id },
  })
  if (input.bookingTypeIds.length > 0) {
    await ctx.prisma.bookingTypeGroupMember.createMany({
      data: input.bookingTypeIds.map((btId, idx) => ({
        groupId: input.id,
        bookingTypeId: btId,
        sortOrder: idx,
      })),
    })
  }
}
```

### Success Criteria:

#### Automated Verification:
- [ ] Type checking passes: `cd apps/web && npx tsc --noEmit`
- [ ] All five router files exist and compile without errors

#### Manual Verification:
- [ ] Verify each router file follows the established pattern from `activities.ts` and `orders.ts`
- [ ] Verify permission constants match Go backend mapping

**Implementation Note**: After completing this phase and all automated verification passes, proceed to Phase 3.

---

## Phase 3: Frontend Hooks Migration

### Overview
Migrate four existing frontend hooks from the old `useApiQuery`/`useApiMutation` pattern to tRPC, and create one new hook for BookingReasons.

### Changes Required:

#### 1. Migrate `use-booking-types.ts`
**File**: `apps/web/src/hooks/api/use-booking-types.ts`
**Changes**: Replace `useApiQuery`/`useApiMutation` with tRPC hooks.

```typescript
import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

export function useBookingTypes(options: {
  isActive?: boolean
  direction?: string
  enabled?: boolean
} = {}) {
  const { isActive, direction, enabled = true } = options
  const trpc = useTRPC()
  return useQuery(
    trpc.bookingTypes.list.queryOptions({ isActive, direction }, { enabled })
  )
}

export function useBookingType(id: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.bookingTypes.getById.queryOptions({ id }, { enabled: enabled && !!id })
  )
}

export function useCreateBookingType() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.bookingTypes.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.bookingTypes.list.queryKey() })
    },
  })
}

export function useUpdateBookingType() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.bookingTypes.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.bookingTypes.list.queryKey() })
    },
  })
}

export function useDeleteBookingType() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.bookingTypes.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.bookingTypes.list.queryKey() })
    },
  })
}
```

#### 2. Migrate `use-booking-type-groups.ts`
**File**: `apps/web/src/hooks/api/use-booking-type-groups.ts`
**Changes**: Same pattern as above, using `trpc.bookingTypeGroups.*`.

#### 3. Migrate `use-absence-type-groups.ts`
**File**: `apps/web/src/hooks/api/use-absence-type-groups.ts`
**Changes**: Same pattern, using `trpc.absenceTypeGroups.*`.

#### 4. Migrate `use-calculation-rules.ts`
**File**: `apps/web/src/hooks/api/use-calculation-rules.ts`
**Changes**: Same pattern, using `trpc.calculationRules.*`.

#### 5. Create new `use-booking-reasons.ts`
**File**: `apps/web/src/hooks/api/use-booking-reasons.ts` (new file)
**Changes**: New hook file following the tRPC pattern.

```typescript
import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

export function useBookingReasons(options: {
  bookingTypeId?: string
  enabled?: boolean
} = {}) {
  const { bookingTypeId, enabled = true } = options
  const trpc = useTRPC()
  return useQuery(
    trpc.bookingReasons.list.queryOptions({ bookingTypeId }, { enabled })
  )
}

export function useBookingReason(id: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.bookingReasons.getById.queryOptions({ id }, { enabled: enabled && !!id })
  )
}

export function useCreateBookingReason() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.bookingReasons.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.bookingReasons.list.queryKey() })
    },
  })
}

export function useUpdateBookingReason() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.bookingReasons.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.bookingReasons.list.queryKey() })
    },
  })
}

export function useDeleteBookingReason() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.bookingReasons.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.bookingReasons.list.queryKey() })
    },
  })
}
```

### Success Criteria:

#### Automated Verification:
- [ ] Type checking passes: `cd apps/web && npx tsc --noEmit`
- [ ] All hook files compile without import errors

#### Manual Verification:
- [ ] Exported hook names remain the same to avoid breaking existing component imports

**Implementation Note**: After completing this phase, proceed to Phase 4.

---

## Phase 4: Tests

### Overview
Write comprehensive unit tests for all five routers following the established pattern from `apps/web/src/server/__tests__/activities-router.test.ts`.

### Changes Required:

#### 1. AbsenceTypeGroups Router Tests
**File**: `apps/web/src/server/__tests__/absenceTypeGroups-router.test.ts` (new file)

**Test cases**:
- `absenceTypeGroups.list`: returns groups for tenant; filters by isActive; returns empty array
- `absenceTypeGroups.getById`: returns group when found; throws NOT_FOUND for missing
- `absenceTypeGroups.create`: creates successfully; trims whitespace; rejects empty code; rejects empty name; rejects duplicate code (CONFLICT)
- `absenceTypeGroups.update`: updates name and description; updates code with uniqueness re-check; rejects duplicate code; allows same code; throws NOT_FOUND; can set isActive
- `absenceTypeGroups.delete`: deletes successfully; throws NOT_FOUND

#### 2. CalculationRules Router Tests
**File**: `apps/web/src/server/__tests__/calculationRules-router.test.ts` (new file)

**Test cases**:
- `calculationRules.list`: returns rules for tenant; filters by isActive
- `calculationRules.getById`: returns rule when found; throws NOT_FOUND
- `calculationRules.create`: creates successfully; validates value >= 0; validates factor > 0; defaults factor to 1.0 when 0; rejects duplicate code
- `calculationRules.update`: updates name, description, value, factor; handles nullable accountId; throws NOT_FOUND
- `calculationRules.delete`: deletes successfully; rejects deletion when absence types reference it; throws NOT_FOUND

**Special**: Mock `ctx.prisma.$queryRawUnsafe` for the usage count check in delete.

#### 3. BookingTypes Router Tests
**File**: `apps/web/src/server/__tests__/bookingTypes-router.test.ts` (new file)

**Test cases**:
- `bookingTypes.list`: returns types including system types (null tenant); filters by isActive; filters by direction; orders by isSystem DESC, code ASC
- `bookingTypes.getById`: returns type including system type; throws NOT_FOUND
- `bookingTypes.create`: creates successfully; validates direction enum; validates category enum; defaults category to "work"; rejects duplicate code; sets isSystem false; trims whitespace
- `bookingTypes.update`: updates fields; blocks modification of system types; verifies tenant ownership; throws NOT_FOUND
- `bookingTypes.delete`: deletes successfully; blocks deletion of system types; rejects deletion when bookings reference it; throws NOT_FOUND

**Special**: Mock `ctx.prisma.$queryRawUnsafe` for booking usage count check.

#### 4. BookingReasons Router Tests
**File**: `apps/web/src/server/__tests__/bookingReasons-router.test.ts` (new file)

**Test cases**:
- `bookingReasons.list`: returns reasons for tenant; filters by bookingTypeId; orders by sortOrder, code
- `bookingReasons.getById`: returns reason when found; throws NOT_FOUND
- `bookingReasons.create`: creates successfully; validates code + label + bookingTypeId required; checks code uniqueness within (tenantId, bookingTypeId); validates adjustment consistency (reference_time without offset_minutes rejected); validates reference_time enum
- `bookingReasons.update`: updates label, sortOrder, isActive; handles clearAdjustment flag; validates adjustment consistency after update; throws NOT_FOUND
- `bookingReasons.delete`: deletes successfully; throws NOT_FOUND

#### 5. BookingTypeGroups Router Tests
**File**: `apps/web/src/server/__tests__/bookingTypeGroups-router.test.ts` (new file)

**Test cases**:
- `bookingTypeGroups.list`: returns groups with members for tenant
- `bookingTypeGroups.getById`: returns group with members; throws NOT_FOUND
- `bookingTypeGroups.create`: creates without members; creates with members; validates code + name; rejects duplicate code
- `bookingTypeGroups.update`: updates name, description, isActive; replaces members when bookingTypeIds provided; keeps members when bookingTypeIds undefined; throws NOT_FOUND
- `bookingTypeGroups.delete`: deletes successfully (members cascade); throws NOT_FOUND

**Special**: Mock `bookingTypeGroupMember.deleteMany` and `bookingTypeGroupMember.createMany` for member replacement logic.

### Success Criteria:

#### Automated Verification:
- [ ] All tests pass: `cd apps/web && npx vitest run src/server/__tests__/absenceTypeGroups-router.test.ts src/server/__tests__/calculationRules-router.test.ts src/server/__tests__/bookingTypes-router.test.ts src/server/__tests__/bookingReasons-router.test.ts src/server/__tests__/bookingTypeGroups-router.test.ts`
- [ ] All existing tests still pass: `cd apps/web && npx vitest run src/server/__tests__/`

#### Manual Verification:
- [ ] Tests cover all CRUD operations and key edge cases for each entity

**Implementation Note**: After completing this phase, proceed to Phase 5.

---

## Phase 5: Root Router Registration and Hook Index Updates

### Overview
Register all five new routers in the root router and update the hook barrel export file.

### Changes Required:

#### 1. Register Routers in Root
**File**: `apps/web/src/server/root.ts`
**Changes**: Add imports and register 5 new routers.

```typescript
import { bookingTypesRouter } from "./routers/bookingTypes"
import { bookingReasonsRouter } from "./routers/bookingReasons"
import { bookingTypeGroupsRouter } from "./routers/bookingTypeGroups"
import { absenceTypeGroupsRouter } from "./routers/absenceTypeGroups"
import { calculationRulesRouter } from "./routers/calculationRules"

export const appRouter = createTRPCRouter({
  // ... existing 20 routers ...
  bookingTypes: bookingTypesRouter,
  bookingReasons: bookingReasonsRouter,
  bookingTypeGroups: bookingTypeGroupsRouter,
  absenceTypeGroups: absenceTypeGroupsRouter,
  calculationRules: calculationRulesRouter,
})
```

#### 2. Update Hook Index
**File**: `apps/web/src/hooks/api/index.ts`
**Changes**: Update existing exports to match tRPC hook signatures and add BookingReasons export.

The existing exports for `useBookingTypes`, `useBookingTypeGroups`, `useAbsenceTypeGroups`, `useCalculationRules` remain unchanged since the hook function names stay the same.

Add new BookingReasons export section:

```typescript
// Booking Reasons
export {
  useBookingReasons,
  useBookingReason,
  useCreateBookingReason,
  useUpdateBookingReason,
  useDeleteBookingReason,
} from './use-booking-reasons'
```

### Success Criteria:

#### Automated Verification:
- [ ] Type checking passes: `cd apps/web && npx tsc --noEmit`
- [ ] All tests pass: `cd apps/web && npx vitest run src/server/__tests__/`
- [ ] Prisma client is up to date: `cd apps/web && npx prisma generate`

#### Manual Verification:
- [ ] Root router shows 25 registered routers (20 existing + 5 new)
- [ ] Hook index exports all five entity hook sets
- [ ] No duplicate or conflicting exports in index.ts

**Implementation Note**: This is the final phase. After all verification passes, the ticket is complete.

---

## Testing Strategy

### Unit Tests:
- All five routers tested individually using `createCallerFactory` with mocked Prisma
- Each test file follows the `activities-router.test.ts` pattern
- Mock Prisma methods: `findMany`, `findFirst`, `findUniqueOrThrow`, `create`, `update`, `delete`, `count`, `createMany`, `deleteMany`, `$queryRawUnsafe`
- Test all CRUD operations + error cases (NOT_FOUND, BAD_REQUEST, CONFLICT)
- Test business logic: system type protection, adjustment validation, usage checks, member management

### Key Edge Cases:
- BookingType: system types cannot be modified/deleted; list includes system types with null tenantId
- BookingReason: adjustment fields must be consistent; code uniqueness is per (tenantId, bookingTypeId)
- BookingTypeGroup: member replacement (delete all + re-insert); empty member array
- CalculationRule: factor defaults to 1.0 when 0; usage check via raw SQL
- All entities: whitespace trimming; empty code/name rejection; code uniqueness checks

## Performance Considerations

- BookingTypeGroup list includes members with bookingType relations (2-level join). For most tenants this is a small dataset (< 50 groups, < 500 members). No pagination needed.
- BookingType list uses `OR` clause for nullable tenantId. PostgreSQL handles this efficiently with the existing indexes.
- Raw SQL usage count queries (`$queryRawUnsafe`) are simple COUNT queries on indexed columns and will be fast.

## References

- Original ticket: `thoughts/shared/tickets/ZMI-TICKET-216-bookingtypes-reasons-groups.md`
- Research document: `thoughts/shared/research/2026-03-06-ZMI-TICKET-216-bookingtypes-reasons-groups.md`
- Reference tRPC router (simple): `apps/web/src/server/routers/activities.ts`
- Reference tRPC router (with relations): `apps/web/src/server/routers/orders.ts`
- Reference tRPC router (with member management pattern): `apps/web/src/server/routers/orderAssignments.ts`
- Reference test pattern: `apps/web/src/server/__tests__/activities-router.test.ts`
- Reference migrated hook: `apps/web/src/hooks/api/use-orders.ts`
- Previous plan (same pattern): `thoughts/shared/plans/2026-03-05-ZMI-TICKET-215-groups-activities-orders.md`
- Permission catalog: `apps/web/src/server/lib/permission-catalog.ts:105,107`
- Go services: `apps/api/internal/service/bookingtype.go`, `bookingreason.go`, `bookingtypegroup.go`, `absencetypegroup.go`, `calculationrule.go`
- SQL migrations: `db/migrations/000021`, `000042`, `000044`, `000046`, `000078`
