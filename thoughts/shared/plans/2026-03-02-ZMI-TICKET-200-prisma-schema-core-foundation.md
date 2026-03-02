# ZMI-TICKET-200: Prisma Schema Core Foundation — Implementation Plan

## Overview

Initialize Prisma in the Next.js frontend (`apps/web/`), define the four core schema models (`User`, `Tenant`, `UserGroup`, `UserTenant`) matching the **actual** PostgreSQL database schema, generate a typed Prisma Client, and create a reusable singleton instance. This is a greenfield addition — the frontend currently has zero database integration.

## Current State Analysis

**Database (fully operational via Go backend):**
- PostgreSQL 16 running in Docker on port 5432 (dev: `postgres://dev:dev@localhost:5432/terp`)
- 87+ migrations applied via `golang-migrate`
- Four core tables: `users` (20+ columns), `tenants` (16 columns), `user_groups` (11 columns), `user_tenants` (4 columns, composite PK)
- Triggers: `update_updated_at_column()` on `users` and `tenants` tables
- CHECK constraints on `users.role`, `users.data_scope_type`, `tenants.vacation_basis`
- COALESCE-based unique indexes on `user_groups` for nullable `tenant_id`

**Frontend (`apps/web/`):**
- No Prisma, no `@prisma/client`, no `schema.prisma`, no `DATABASE_URL`
- No `prisma/` directory exists
- All data access via `openapi-fetch` HTTP client to Go API
- Env vars: `API_URL`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_APP_NAME` only
- Package manager: pnpm
- TypeScript strict mode, path alias `@/*` maps to `./src/*`

**Key discrepancies between ticket's proposed Prisma schema and actual DB:**
- `User`: Ticket has 11 fields, actual DB has 20+ (missing: `role`, `password_hash`, `sso_id`, `is_locked`, `data_scope_type`, `data_scope_*_ids`, `tenant_id`)
- `Tenant`: Ticket has `subdomain`, actual DB uses `slug`; ticket has `deleted_at`, actual DB does not; missing address/contact/payroll/notes/vacation_basis fields
- `UserGroup`: Ticket has `data_scope` field that does not exist; missing `code`, `is_system`, `is_active`; `tenant_id` must be nullable
- `UserTenant`: Ticket has UUID `id` PK, actual DB uses composite PK `(user_id, tenant_id)`; missing `role` field

## Desired End State

1. `prisma/schema.prisma` in `apps/web/` with datasource, generator, and 4 models matching the real DB
2. `@prisma/client` generated with typed models for `User`, `Tenant`, `UserGroup`, `UserTenant`
3. `src/lib/db/prisma.ts` singleton ready for import from server components / API routes / tRPC
4. `DATABASE_URL` configured in `.env.local` and documented in `.env.example`
5. Zero modifications to existing database data or schema
6. TypeScript types verified via `pnpm typecheck`

## What We're NOT Doing

- Running `prisma db push` or `prisma migrate dev` (schema is read-only against existing DB)
- Defining models for tables beyond the four core tables (those come in TICKET-204, 205+)
- Setting up tRPC (TICKET-201) or Supabase auth (TICKET-202)
- Replacing any existing Go backend functionality
- Defining the `Employee` model (TICKET-205) — we use a bare `String` for `employee_id` FK on `User`
- Modeling the `update_updated_at_column()` trigger in Prisma (triggers are transparent to the ORM)
- Modeling COALESCE-based unique indexes (Prisma does not support expression indexes; document as comments)

## Implementation Approach

Work in 4 phases: install & configure, define schema, generate client & singleton, verify. Each phase is independently verifiable.

---

## Phase 1: Prisma Installation & Configuration

### Overview
Install Prisma dependencies and create the initial `schema.prisma` with datasource and generator configuration. Add `DATABASE_URL` to the environment.

### Step 1.1: Install Prisma dependencies

**File:** `apps/web/package.json`
**Command:**
```bash
cd apps/web && pnpm add @prisma/client && pnpm add -D prisma
```

This adds:
- `prisma` (devDependency) — CLI tool for schema management and generation
- `@prisma/client` (dependency) — Runtime Prisma Client library

**Verification:** `pnpm ls prisma @prisma/client` shows both packages installed.

### Step 1.2: Create initial schema.prisma

**File to create:** `apps/web/prisma/schema.prisma`

```prisma
// Prisma Schema for Terp — Core Foundation (ZMI-TICKET-200)
// This schema is READ-ONLY against the existing PostgreSQL database.
// DO NOT run `prisma db push` or `prisma migrate dev`.
// Schema changes are managed via SQL migrations in db/migrations/.

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

**Notes:**
- No `output` override on the generator — uses default `node_modules/.prisma/client`
- The `DATABASE_URL` env var is read at `prisma generate` time and at runtime
- No `directUrl` needed yet (that's for Supabase pooler setups in TICKET-202)

### Step 1.3: Add DATABASE_URL to environment files

**File to modify:** `apps/web/.env.example`
Add:
```
# Database (Prisma)
# Dev: direct connection to local PostgreSQL
DATABASE_URL=postgres://dev:dev@localhost:5432/terp
```

**File to modify:** `apps/web/.env.local`
Add:
```
# Database (Prisma)
DATABASE_URL=postgres://dev:dev@localhost:5432/terp
```

**Note:** `.env.local` is gitignored. The `.env.example` documents the pattern for other developers.

### Step 1.4: Add prisma generate to package.json scripts

**File to modify:** `apps/web/package.json`
Add to `"scripts"`:
```json
"db:generate": "prisma generate",
"db:pull": "prisma db pull",
"db:studio": "prisma studio",
"postinstall": "prisma generate"
```

**Rationale:**
- `db:generate` — explicit generation command
- `db:pull` — introspect existing DB (useful for verification)
- `db:studio` — visual DB browser for development
- `postinstall` — auto-generate Prisma client after `pnpm install` (ensures CI/CD and fresh clones work)

### Step 1.5: Add Prisma generated files to .gitignore

**File to check:** `/home/tolga/projects/terp/.gitignore`

The root `.gitignore` already covers `node_modules/` which includes the generated `.prisma/client`. No additional entries needed. However, if `prisma db pull` is run, it modifies `schema.prisma` — that file IS committed (intentional).

### Phase 1 Verification
```bash
cd apps/web && npx prisma --version
```
Should output Prisma CLI version without errors.

---

## Phase 2: Core Schema Definition

### Overview
Define all 4 models in `schema.prisma` matching the **actual** PostgreSQL schema from the migrations. Every column, type, default, constraint, index, and relationship must match what exists in the database.

### Step 2.1: Define the User model

**File:** `apps/web/prisma/schema.prisma`

The `users` table has evolved across migrations 000001, 000008, 000014, and 000039. The final column set is:

| Column | Type | Nullable | Default | Constraint |
|--------|------|----------|---------|------------|
| id | UUID | NO | gen_random_uuid() | PK |
| email | VARCHAR(255) | NO | — | — |
| display_name | VARCHAR(255) | NO | — | — |
| avatar_url | TEXT | YES | — | — |
| role | VARCHAR(50) | NO | 'user' | CHECK: 'user' or 'admin' |
| created_at | TIMESTAMPTZ | NO | NOW() | — |
| updated_at | TIMESTAMPTZ | NO | NOW() | trigger |
| tenant_id | UUID | YES | — | FK → tenants(id) |
| user_group_id | UUID | YES | — | FK → user_groups(id) |
| employee_id | UUID | YES | — | FK → employees(id) ON DELETE SET NULL |
| username | VARCHAR(100) | YES | — | — |
| is_active | BOOLEAN | YES | true | — |
| deleted_at | TIMESTAMPTZ | YES | — | — |
| password_hash | VARCHAR(255) | YES | — | — |
| sso_id | VARCHAR(255) | YES | — | — |
| is_locked | BOOLEAN | NO | false | — |
| data_scope_type | VARCHAR(20) | NO | 'all' | CHECK: 'all','tenant','department','employee' |
| data_scope_tenant_ids | UUID[] | NO | '{}' | — |
| data_scope_department_ids | UUID[] | NO | '{}' | — |
| data_scope_employee_ids | UUID[] | NO | '{}' | — |

**Indexes on users:**
- `idx_users_email` on `(email)` — non-unique (email is globally unique from CREATE TABLE, plus tenant-scoped unique below)
- `idx_users_display_name` on `(display_name)`
- `idx_users_tenant` on `(tenant_id)`
- `idx_users_user_group` on `(user_group_id)`
- `idx_users_deleted_at` on `(deleted_at)`
- `idx_users_tenant_username` on `(tenant_id, username) WHERE username IS NOT NULL` — partial unique
- `idx_users_tenant_email` on `(tenant_id, email)` — unique

**Prisma model:**
```prisma
model User {
  id                     String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  email                  String    @db.VarChar(255)
  displayName            String    @map("display_name") @db.VarChar(255)
  avatarUrl              String?   @map("avatar_url") @db.Text
  role                   String    @default("user") @db.VarChar(50)
  createdAt              DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt              DateTime  @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)
  tenantId               String?   @map("tenant_id") @db.Uuid
  userGroupId            String?   @map("user_group_id") @db.Uuid
  employeeId             String?   @map("employee_id") @db.Uuid
  username               String?   @db.VarChar(100)
  isActive               Boolean?  @default(true) @map("is_active")
  deletedAt              DateTime? @map("deleted_at") @db.Timestamptz(6)
  passwordHash           String?   @map("password_hash") @db.VarChar(255)
  ssoId                  String?   @map("sso_id") @db.VarChar(255)
  isLocked               Boolean   @default(false) @map("is_locked")
  dataScopeType          String    @default("all") @map("data_scope_type") @db.VarChar(20)
  dataScopeTenantIds     String[]  @default([]) @map("data_scope_tenant_ids") @db.Uuid
  dataScopeDepartmentIds String[]  @default([]) @map("data_scope_department_ids") @db.Uuid
  dataScopeEmployeeIds   String[]  @default([]) @map("data_scope_employee_ids") @db.Uuid

  // Relations
  tenant      Tenant?      @relation(fields: [tenantId], references: [id])
  userGroup   UserGroup?   @relation(fields: [userGroupId], references: [id])
  userTenants UserTenant[]

  // Indexes
  @@unique([tenantId, email], map: "idx_users_tenant_email")
  @@index([email], map: "idx_users_email")
  @@index([displayName], map: "idx_users_display_name")
  @@index([tenantId], map: "idx_users_tenant")
  @@index([userGroupId], map: "idx_users_user_group")
  @@index([deletedAt], map: "idx_users_deleted_at")
  @@map("users")
}
```

**Design decisions:**
- `email` has a global UNIQUE constraint from migration 000001, but also a composite unique with `tenant_id` from 000008. Prisma only models the composite one via `@@unique`. The global unique is from CREATE TABLE — Prisma introspection would show both. We keep the global unique on the column level too, but since the column-level unique from the original CREATE TABLE coexists with the composite unique, we model only the composite unique in `@@unique` to avoid conflicts. Note: After running `prisma db pull`, we should verify whether Prisma wants `@unique` on `email` as well.
- `employee_id` is NOT modeled as a relation because the `Employee` model is out of scope (TICKET-205). When `Employee` is added, a relation will be added.
- `is_active` is `Boolean?` because the migration uses `ADD COLUMN ... DEFAULT true` — in PostgreSQL this means existing rows get `true` but the column itself is nullable (no NOT NULL). The Go model uses `bool` (non-nullable) but that's a Go convention; the DB allows NULL.
- `@updatedAt` on `updatedAt` tells Prisma to auto-set on updates. The DB also has a trigger, which is fine — they are compatible.
- UUID array columns use `String[] @db.Uuid` — Prisma represents PostgreSQL `UUID[]` as `String[]` with `@db.Uuid`.
- The partial unique index `idx_users_tenant_username` (WHERE username IS NOT NULL) cannot be modeled in Prisma (no partial index support). We document it as a comment.
- CHECK constraints on `role` and `data_scope_type` cannot be modeled in Prisma. They remain enforced at the DB level.

### Step 2.2: Define the Tenant model

**File:** `apps/web/prisma/schema.prisma`

The `tenants` table has evolved across migrations 000002 and 000037. Final column set:

| Column | Type | Nullable | Default | Constraint |
|--------|------|----------|---------|------------|
| id | UUID | NO | gen_random_uuid() | PK |
| name | VARCHAR(255) | NO | — | — |
| slug | VARCHAR(100) | NO | — | UNIQUE |
| settings | JSONB | YES | '{}' | — |
| is_active | BOOLEAN | YES | true | — |
| created_at | TIMESTAMPTZ | YES | NOW() | — |
| updated_at | TIMESTAMPTZ | YES | NOW() | trigger |
| address_street | VARCHAR(255) | YES | — | — |
| address_zip | VARCHAR(20) | YES | — | — |
| address_city | VARCHAR(100) | YES | — | — |
| address_country | VARCHAR(100) | YES | — | — |
| phone | VARCHAR(50) | YES | — | — |
| email | VARCHAR(255) | YES | — | — |
| payroll_export_base_path | TEXT | YES | — | — |
| notes | TEXT | YES | — | — |
| vacation_basis | VARCHAR(20) | NO | 'calendar_year' | CHECK: 'calendar_year' or 'entry_date' |

**Important:** No `deleted_at` column exists on tenants. The ticket's schema is wrong here. Tenants use `is_active = false` for soft deactivation.

**Indexes on tenants:**
- `idx_tenants_slug` on `(slug)` — plus unique constraint from CREATE TABLE
- `idx_tenants_is_active` on `(is_active)`

**Prisma model:**
```prisma
model Tenant {
  id                   String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  name                 String   @db.VarChar(255)
  slug                 String   @unique @db.VarChar(100)
  settings             Json?    @default("{}") @db.JsonB
  isActive             Boolean? @default(true) @map("is_active")
  createdAt            DateTime? @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt            DateTime? @default(now()) @map("updated_at") @db.Timestamptz(6)
  addressStreet        String?  @map("address_street") @db.VarChar(255)
  addressZip           String?  @map("address_zip") @db.VarChar(20)
  addressCity          String?  @map("address_city") @db.VarChar(100)
  addressCountry       String?  @map("address_country") @db.VarChar(100)
  phone                String?  @db.VarChar(50)
  email                String?  @db.VarChar(255)
  payrollExportBasePath String? @map("payroll_export_base_path") @db.Text
  notes                String?  @db.Text
  vacationBasis        String   @default("calendar_year") @map("vacation_basis") @db.VarChar(20)

  // Relations
  users       User[]
  userGroups  UserGroup[]
  userTenants UserTenant[]

  // Indexes
  @@index([slug], map: "idx_tenants_slug")
  @@index([isActive], map: "idx_tenants_is_active")
  @@map("tenants")
}
```

**Design decisions:**
- `slug` NOT `subdomain` — matches the actual DB column name.
- No `deletedAt` field — tenants are deactivated, not soft-deleted.
- `createdAt` and `updatedAt` are nullable because the migration uses `DEFAULT NOW()` without `NOT NULL`. Note however the Go model uses non-pointer `time.Time` so values always exist in practice. We model what the DB allows.
- `isActive` is `Boolean?` because the migration uses `DEFAULT true` without `NOT NULL`.
- `settings` uses `Json?` with `@db.JsonB` to match the PostgreSQL `JSONB` column type.
- CHECK constraint on `vacation_basis` is enforced at the DB level, not in Prisma.

### Step 2.3: Define the UserGroup model

**File:** `apps/web/prisma/schema.prisma`

The `user_groups` table has evolved across migrations 000007, 000036, and 000087. Final column set:

| Column | Type | Nullable | Default | Constraint |
|--------|------|----------|---------|------------|
| id | UUID | NO | gen_random_uuid() | PK |
| tenant_id | UUID | YES | — | FK → tenants(id) ON DELETE CASCADE |
| name | VARCHAR(100) | NO | — | — |
| code | VARCHAR(50) | NO | — | — |
| description | TEXT | YES | — | — |
| permissions | JSONB | YES | '[]' | — |
| is_admin | BOOLEAN | YES | false | — |
| is_system | BOOLEAN | YES | false | — |
| is_active | BOOLEAN | NO | true | — |
| created_at | TIMESTAMPTZ | YES | NOW() | — |
| updated_at | TIMESTAMPTZ | YES | NOW() | — |

**Important differences from ticket:**
- `tenant_id` is nullable (NULL = system-wide group, visible to all tenants)
- `code` field exists (not in ticket)
- `is_system` field exists (not in ticket)
- `is_active` field exists (not in ticket)
- No `data_scope` field (ticket erroneously placed it here — `data_scope_type` is on `users`)
- No `deleted_at` field

**Indexes on user_groups:**
- `idx_user_groups_tenant` on `(tenant_id)`
- `idx_user_groups_tenant_code` on `(COALESCE(tenant_id, '00000000-...'), code)` — expression unique index
- `idx_user_groups_tenant_name` on `(COALESCE(tenant_id, '00000000-...'), name)` — expression unique index

**Prisma model:**
```prisma
model UserGroup {
  id          String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId    String?   @map("tenant_id") @db.Uuid
  name        String    @db.VarChar(100)
  code        String    @db.VarChar(50)
  description String?   @db.Text
  permissions Json?     @default("[]") @db.JsonB
  isAdmin     Boolean?  @default(false) @map("is_admin")
  isSystem    Boolean?  @default(false) @map("is_system")
  isActive    Boolean   @default(true) @map("is_active")
  createdAt   DateTime? @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt   DateTime? @default(now()) @map("updated_at") @db.Timestamptz(6)

  // Relations
  tenant Tenant? @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  users  User[]

  // Indexes
  // NOTE: COALESCE-based unique indexes cannot be modeled in Prisma:
  //   idx_user_groups_tenant_code: UNIQUE ON (COALESCE(tenant_id, '00000000-...'), code)
  //   idx_user_groups_tenant_name: UNIQUE ON (COALESCE(tenant_id, '00000000-...'), name)
  // These constraints are enforced at the DB level only.
  @@index([tenantId], map: "idx_user_groups_tenant")
  @@map("user_groups")
}
```

**Design decisions:**
- `tenantId` is `String?` (nullable) — system groups have `NULL` tenant_id.
- COALESCE-based unique indexes are documented as comments only. Prisma does not support expression indexes. The uniqueness constraint is enforced at the DB level.
- `onDelete: Cascade` on the tenant relation matches the FK definition in migration 000007.
- `isActive` is `Boolean` (non-nullable) because migration 000036 uses `NOT NULL DEFAULT true`.
- `isAdmin` and `isSystem` are `Boolean?` because migration 000007 uses `DEFAULT false` without explicit `NOT NULL`.

### Step 2.4: Define the UserTenant model

**File:** `apps/web/prisma/schema.prisma`

The `user_tenants` table was created in migration 000084. Column set:

| Column | Type | Nullable | Default | Constraint |
|--------|------|----------|---------|------------|
| user_id | UUID | NO | — | PK (composite), FK → users(id) CASCADE |
| tenant_id | UUID | NO | — | PK (composite), FK → tenants(id) CASCADE |
| role | VARCHAR(50) | NO | 'member' | — |
| created_at | TIMESTAMPTZ | NO | NOW() | — |

**Important differences from ticket:**
- No surrogate `id` column — uses composite PK `(user_id, tenant_id)`
- `role` field exists (not in ticket)

**Prisma model:**
```prisma
model UserTenant {
  userId    String   @map("user_id") @db.Uuid
  tenantId  String   @map("tenant_id") @db.Uuid
  role      String   @default("member") @db.VarChar(50)
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)

  // Relations
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  // Composite primary key
  @@id([userId, tenantId])
  @@map("user_tenants")
}
```

**Design decisions:**
- `@@id([userId, tenantId])` — Prisma composite PK, no surrogate `id`. The ticket was wrong to add an `id` field.
- `onDelete: Cascade` on both relations matches the FK definitions.
- `role` defaults to `'member'` matching the DB default.
- No `updatedAt` — the table only has `created_at`.

### Step 2.5: Complete schema.prisma file

**File to create:** `apps/web/prisma/schema.prisma`

The complete file assembles all pieces from Steps 1.2 + 2.1–2.4 into a single cohesive schema file. The exact contents are the combination of the generator/datasource block and all four models above.

### Phase 2 Verification
```bash
cd apps/web && npx prisma validate
```
Should output "The schema at prisma/schema.prisma is valid." without errors.

---

## Phase 3: Prisma Client Generation & Singleton

### Overview
Generate the Prisma Client, create a singleton instance for use in server-side code, and verify TypeScript types compile.

### Step 3.1: Generate Prisma Client

**Command:**
```bash
cd apps/web && npx prisma generate
```

**Expected output:**
```
✔ Generated Prisma Client to ./node_modules/@prisma/client
```

This generates typed client code into `node_modules/.prisma/client/` with TypeScript types for `User`, `Tenant`, `UserGroup`, `UserTenant`.

**Note:** This does NOT connect to the database. It reads the schema file and generates code.

### Step 3.2: Create Prisma Client singleton

**File to create:** `apps/web/src/lib/db/prisma.ts`

```typescript
import { PrismaClient } from '@prisma/client'

/**
 * Prisma Client singleton.
 *
 * In development, Next.js hot-reloading creates new module instances on every
 * change, which would exhaust database connections. This singleton pattern
 * reuses the existing PrismaClient across hot reloads.
 *
 * @see https://www.prisma.io/docs/orm/more/help-and-troubleshooting/help-articles/nextjs-prisma-client-dev-practices
 */

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}
```

**Design decisions:**
- Uses the standard Next.js singleton pattern recommended by Prisma docs
- Stores the instance on `globalThis` to survive hot reloads in development
- Enables query logging in development for debugging
- Only logs errors in production for performance
- The `db/` subdirectory separates database concerns from the existing `api/` HTTP client

### Step 3.3: Create barrel export

**File to create:** `apps/web/src/lib/db/index.ts`

```typescript
export { prisma } from './prisma'
```

This enables clean imports: `import { prisma } from '@/lib/db'`

### Step 3.4: Verify TypeScript compilation

**Command:**
```bash
cd apps/web && pnpm typecheck
```

This runs `tsc --noEmit` and verifies:
- The Prisma Client types are resolvable
- The singleton module compiles without errors
- No existing code is broken by the new dependencies

**Expected result:** Clean exit (0), no type errors related to Prisma.

### Phase 3 Verification
```bash
cd apps/web && npx tsc --noEmit src/lib/db/prisma.ts
```
Should exit cleanly. The generated `@prisma/client` types should include `User`, `Tenant`, `UserGroup`, `UserTenant`.

---

## Phase 4: Verification & Validation

### Overview
Verify that the Prisma schema matches the actual database, that connectivity works, and that no data was modified.

### Step 4.1: Run prisma db pull to cross-check

**Command:**
```bash
cd apps/web && npx prisma db pull --print
```

**Purpose:** Introspects the live database and prints the resulting schema to stdout (does NOT overwrite `schema.prisma`). Compare the output for the four core tables against our hand-written schema.

**What to check:**
- Column names, types, and defaults match
- Nullable/non-nullable matches
- Primary keys and indexes match
- Foreign key references match
- Any extra columns or indexes that we missed

**Note:** The output will contain ALL tables (87+ migrations worth), not just the four core tables. Only compare the relevant models.

### Step 4.2: Verify connectivity with a simple script

**Command (one-time verification, not committed):**
```bash
cd apps/web && npx tsx -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const userCount = await prisma.user.count();
  const tenantCount = await prisma.tenant.count();
  const groupCount = await prisma.userGroup.count();
  const utCount = await prisma.userTenant.count();
  console.log('Users:', userCount);
  console.log('Tenants:', tenantCount);
  console.log('UserGroups:', groupCount);
  console.log('UserTenants:', utCount);
  await prisma.\$disconnect();
}
main().catch(console.error);
"
```

**Expected:** Prints counts without errors. The database must be running (`make dev` or `docker compose up postgres`).

**Note:** This is a manual verification step, not a committed test. We do not commit test scripts in this ticket.

### Step 4.3: Verify no data was modified

**Command:**
```bash
cd apps/web && npx tsx -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  // Verify we can read without errors - confirms schema matches
  const user = await prisma.user.findFirst({ select: { id: true, email: true, role: true, dataScopeType: true } });
  const tenant = await prisma.tenant.findFirst({ select: { id: true, name: true, slug: true, vacationBasis: true } });
  const group = await prisma.userGroup.findFirst({ select: { id: true, name: true, code: true, isSystem: true } });
  console.log('Sample user:', user);
  console.log('Sample tenant:', tenant);
  console.log('Sample group:', group);
  await prisma.\$disconnect();
}
main().catch(console.error);
"
```

**Expected:** Prints sample records. If any column mapping is wrong, Prisma will throw a runtime error.

### Step 4.4: Run full typecheck

**Command:**
```bash
cd apps/web && pnpm typecheck
```

**Expected:** Exit 0, no errors.

### Step 4.5: Run existing lint

**Command:**
```bash
cd apps/web && pnpm lint
```

**Expected:** No new lint errors introduced.

---

## File Summary

### Files to Create
| File | Description |
|------|-------------|
| `apps/web/prisma/schema.prisma` | Prisma schema with datasource, generator, and 4 core models |
| `apps/web/src/lib/db/prisma.ts` | Prisma Client singleton for Next.js |
| `apps/web/src/lib/db/index.ts` | Barrel export for clean imports |

### Files to Modify
| File | Change |
|------|--------|
| `apps/web/package.json` | Add `prisma`, `@prisma/client` deps; add `db:generate`, `db:pull`, `db:studio`, `postinstall` scripts |
| `apps/web/.env.example` | Add `DATABASE_URL` documentation |
| `apps/web/.env.local` | Add `DATABASE_URL` for local dev |

### Files NOT Modified
- No Go files modified
- No SQL migrations created
- No existing TypeScript files modified
- No database data modified

---

## Risk Mitigation

1. **Schema drift:** Run `prisma db pull --print` after writing the schema to verify it matches. If there are discrepancies, update the hand-written schema to match the introspected one.

2. **Nullable vs non-nullable mismatches:** The Go GORM models use Go types that may differ from actual DB nullability (e.g., Go `bool` vs PostgreSQL nullable boolean). Always trust the SQL migrations over the Go model definitions for nullability.

3. **UUID array handling:** PostgreSQL `UUID[]` arrays are represented as `String[] @db.Uuid` in Prisma. This is correct per Prisma docs but may behave differently than `pq.StringArray` in Go. Verify read operations work in Step 4.3.

4. **Connection pooling in production:** The dev setup uses direct PostgreSQL connections. Production will need Supabase Connection Pooler (port 6543) with `?pgbouncer=true` in the URL. This is out of scope for this ticket (TICKET-202 handles production auth/connection setup).

5. **postinstall script conflicts:** If CI/CD runs `pnpm install` without a database, `prisma generate` will still succeed because it only reads the schema file, not the database. No connectivity is needed for generation.

---

## Acceptance Criteria Mapping

| Acceptance Criteria | Phase | Step |
|---|---|---|
| `prisma db pull` erfolgreich gegen Supabase-DB | Phase 4 | Step 4.1 |
| Core-Tabellen korrekt in Prisma SDL definiert | Phase 2 | Steps 2.1–2.5 |
| `prisma generate` erzeugt typisierte Client-Klasse | Phase 3 | Step 3.1 |
| Prisma Client als Singleton verfügbar in Next.js | Phase 3 | Steps 3.2–3.3 |
| Bestehende DB-Daten werden nicht verändert | Phase 4 | Step 4.3 |
| TypeScript-Typen für User, Tenant, UserGroup, UserTenant verfügbar | Phase 3 | Step 3.4 |
