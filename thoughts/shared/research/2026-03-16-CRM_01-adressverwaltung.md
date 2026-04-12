# Research: CRM_01 Adressverwaltung (Address Management)

Date: 2026-03-16

This document catalogs all existing codebase patterns needed to implement CRM_01.

---

## 1. Prisma Schema Patterns

**File:** `/home/tolga/projects/terp/prisma/schema.prisma`

### Generator & Datasource

```prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "postgresql"
}
```

### Model Pattern (tenant-scoped, with timestamps)

All tenant-scoped models follow this pattern:

```prisma
model Location {
  id          String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId    String    @map("tenant_id") @db.Uuid
  code        String    @db.VarChar(50)
  name        String    @db.VarChar(255)
  // ... fields ...
  isActive    Boolean   @default(true) @map("is_active")
  createdAt   DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt   DateTime  @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)

  // Relations
  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  // Indexes
  @@index([tenantId], map: "idx_locations_tenant")
  @@map("locations")
}
```

Key conventions:
- ID: `@id @default(dbgenerated("gen_random_uuid()")) @db.Uuid`
- Tenant FK: `@map("tenant_id") @db.Uuid`
- Snake_case in DB via `@map("snake_case")` and `@@map("table_name")`
- Timestamps: `@db.Timestamptz(6)`, `createdAt` has `@default(now())`, `updatedAt` has `@updatedAt`
- Unique constraints use `@@unique([...])`
- Indexes use `@@map("table_name")` with `map:` for explicit index names

### Enum Pattern

There are currently **no Prisma enums** defined in the schema. The `CrmAddressType` enum will be the first. Based on the ticket spec:

```prisma
enum CrmAddressType {
  CUSTOMER
  SUPPLIER
  BOTH

  @@map("crm_address_type")
}
```

### Relation Pattern (parent -> children with cascade)

From existing models (e.g., Employee -> EmployeeCard):
```prisma
model CrmContact {
  // ...
  addressId  String   @map("address_id") @db.Uuid
  address CrmAddress @relation(fields: [addressId], references: [id], onDelete: Cascade)
  @@index([addressId])
}
```

### Tenant Model Relations

All new models that have a `tenantId` need a corresponding relation array added to the `Tenant` model:

```prisma
model Tenant {
  // ... existing relations ...
  numberSequences     NumberSequence[]
  crmAddresses        CrmAddress[]
  crmContacts         CrmContact[]
  crmBankAccounts     CrmBankAccount[]
}
```

### Composite Unique Constraint Pattern

From `TenantModule`:
```prisma
@@unique([tenantId, module], map: "uq_tenant_modules_tenant_module")
```

### Supabase Migration Pattern

**Directory:** `/home/tolga/projects/terp/supabase/migrations/`

Naming convention: `20260101000NNN_description.sql`

Latest migration is `20260101000094_rename_orders_module_to_billing.sql`.

Example migration (from `000093_create_tenant_modules.sql`):
```sql
CREATE TABLE tenant_modules (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    module          VARCHAR(50) NOT NULL,
    enabled_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    enabled_by_id   UUID        REFERENCES users(id) ON DELETE SET NULL,

    CONSTRAINT uq_tenant_modules_tenant_module UNIQUE (tenant_id, module),
    CONSTRAINT chk_tenant_modules_module CHECK (module IN ('core', 'crm', 'billing', 'warehouse'))
);

CREATE INDEX idx_tenant_modules_tenant_id ON tenant_modules(tenant_id);
```

---

## 2. Permission Catalog

**File:** `/home/tolga/projects/terp/src/lib/auth/permission-catalog.ts`

### Structure

```ts
import { v5 as uuidv5 } from "uuid"

const PERMISSION_NAMESPACE = "f68a2ad7-6fd8-4d61-9b0e-0ea4a0d6c8a1"

function permissionId(key: string): string {
  return uuidv5(key, PERMISSION_NAMESPACE)
}

function p(
  key: string,
  resource: string,
  action: string,
  description: string
): Permission {
  return { id: permissionId(key), key, resource, action, description }
}

export const ALL_PERMISSIONS: Permission[] = [
  p("employees.view", "employees", "view", "View employee records"),
  // ...
]
```

### How to add new permissions

Add entries to the `ALL_PERMISSIONS` array. For CRM:
```ts
p("crm_addresses.view", "crm_addresses", "view", "View CRM addresses"),
p("crm_addresses.create", "crm_addresses", "create", "Create CRM addresses"),
p("crm_addresses.edit", "crm_addresses", "edit", "Edit CRM addresses"),
p("crm_addresses.delete", "crm_addresses", "delete", "Delete CRM addresses"),
```

### Lookup functions

```ts
export function permissionIdByKey(key: string): string | undefined
export function lookupPermission(id: string): Permission | undefined
export function listPermissions(): Permission[]
```

---

## 3. Module System

### Constants

**File:** `/home/tolga/projects/terp/src/lib/modules/constants.ts`

```ts
export const AVAILABLE_MODULES = ["core", "crm", "billing", "warehouse"] as const
export type ModuleId = (typeof AVAILABLE_MODULES)[number]
```

### Module Guard Middleware

**File:** `/home/tolga/projects/terp/src/lib/modules/index.ts`

```ts
import { TRPCError } from "@trpc/server"
import type { PrismaClient } from "@/generated/prisma/client"
import { createMiddleware } from "@/trpc/init"

export function requireModule(module: string) {
  return createMiddleware(async ({ ctx, next }) => {
    const { tenantId, prisma } = ctx as {
      tenantId?: string | null
      prisma: PrismaClient
    }

    if (!tenantId) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Tenant ID required" })
    }

    if (module === "core") {
      return next({ ctx })
    }

    const enabled = await hasModule(prisma, tenantId, module)
    if (!enabled) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: `Module "${module}" is not enabled for this tenant`,
      })
    }

    return next({ ctx })
  })
}
```

Usage in router: `tenantProcedure.use(requireModule("crm"))`

### Existing CRM Router Placeholder

**File:** `/home/tolga/projects/terp/src/trpc/routers/crm/index.ts`

```ts
import { createTRPCRouter } from "@/trpc/init"
export const crmRouter = createTRPCRouter({})
```

**IMPORTANT:** The `crmRouter` is NOT yet imported or mounted in `_app.ts`. It needs to be added.

---

## 4. tRPC Router Patterns

### tRPC Init

**File:** `/home/tolga/projects/terp/src/trpc/init.ts`

Key exports:
```ts
export const createTRPCRouter = t.router
export const createCallerFactory = t.createCallerFactory
export const createMiddleware = t.middleware
export const publicProcedure = t.procedure
export const protectedProcedure = t.procedure.use(/* auth check */)
export const tenantProcedure = protectedProcedure.use(/* tenantId check + access validation */)
```

Context type:
```ts
export type TRPCContext = {
  prisma: PrismaClient
  authToken: string | null
  user: ContextUser | null
  session: Session | null
  tenantId: string | null
}
```

### Router Pattern (with Service Layer)

**File:** `/home/tolga/projects/terp/src/trpc/routers/locations.ts` (representative example)

```ts
import { z } from "zod"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { handleServiceError } from "@/trpc/errors"
import { requirePermission } from "@/lib/auth/middleware"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import * as locationService from "@/lib/services/location-service"
import type { PrismaClient } from "@/generated/prisma/client"

// --- Permission Constants ---
const LOCATIONS_MANAGE = permissionIdByKey("locations.manage")!

// --- Output Schemas ---
const locationOutputSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  // ... fields ...
})

// --- Input Schemas ---
const createLocationInputSchema = z.object({
  code: z.string().min(1, "Code is required"),
  name: z.string().min(1, "Name is required"),
  // ... fields ...
})

// --- Helpers ---
function mapLocationToOutput(loc: { ... }): LocationOutput { ... }

// --- Router ---
export const locationsRouter = createTRPCRouter({
  list: tenantProcedure
    .use(requirePermission(LOCATIONS_MANAGE))
    .input(z.object({ isActive: z.boolean().optional() }).optional())
    .output(z.object({ data: z.array(locationOutputSchema) }))
    .query(async ({ ctx, input }) => {
      try {
        const locations = await locationService.list(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input
        )
        return { data: locations.map(mapLocationToOutput) }
      } catch (err) {
        handleServiceError(err)
      }
    }),

  getById: tenantProcedure
    .use(requirePermission(LOCATIONS_MANAGE))
    .input(z.object({ id: z.string() }))
    .output(locationOutputSchema)
    .query(async ({ ctx, input }) => {
      try {
        const location = await locationService.getById(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id
        )
        return mapLocationToOutput(location)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  create: tenantProcedure
    .use(requirePermission(LOCATIONS_MANAGE))
    .input(createLocationInputSchema)
    .output(locationOutputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const location = await locationService.create(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input
        )
        return mapLocationToOutput(location)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  // ... update, delete follow same pattern
})
```

### Router with Module Guard (ticket pattern)

From the ticket's example:
```ts
const crmProcedure = tenantProcedure.use(requireModule("crm"))

export const crmAddressesRouter = createTRPCRouter({
  list: crmProcedure
    .use(requirePermission(CRM_VIEW))
    .input(...)
    .query(async ({ ctx, input }) => {
      try {
        return await crmAddressService.list(ctx.prisma, ctx.tenantId!, input)
      } catch (err) {
        handleServiceError(err)
      }
    }),
})
```

### Root Router

**File:** `/home/tolga/projects/terp/src/trpc/routers/_app.ts`

```ts
import { createTRPCRouter, createCallerFactory } from "../init"
import { locationsRouter } from "./locations"
// ... 70+ imports ...

export const appRouter = createTRPCRouter({
  locations: locationsRouter,
  // ... 70+ routes ...
  tenantModules: tenantModulesRouter,
})

export type AppRouter = typeof appRouter
export const createCaller = createCallerFactory(appRouter)
```

The CRM router will need to be added here. The pattern for nested/namespaced routers would be something like `crm: crmRouter` where `crmRouter` merges sub-routers.

---

## 5. Service + Repository Pattern

### Service Pattern

**File:** `/home/tolga/projects/terp/src/lib/services/contact-type-service.ts` (representative)

```ts
import type { PrismaClient } from "@/generated/prisma/client"
import * as repo from "./contact-type-repository"

// --- Error Classes ---
export class ContactTypeNotFoundError extends Error {
  constructor(message = "Contact type not found") {
    super(message)
    this.name = "ContactTypeNotFoundError"
  }
}

export class ContactTypeValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ContactTypeValidationError"
  }
}

export class ContactTypeConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ContactTypeConflictError"
  }
}

// --- Service Functions ---
export async function list(
  prisma: PrismaClient,
  tenantId: string,
  params?: { isActive?: boolean }
) {
  return repo.findMany(prisma, tenantId, params)
}

export async function getById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  const contactType = await repo.findById(prisma, tenantId, id)
  if (!contactType) {
    throw new ContactTypeNotFoundError()
  }
  return contactType
}

export async function create(
  prisma: PrismaClient,
  tenantId: string,
  input: { code: string; name: string; /* ... */ }
) {
  // Validate
  const code = input.code.trim()
  if (code.length === 0) {
    throw new ContactTypeValidationError("Contact type code is required")
  }

  // Check uniqueness
  const existingByCode = await repo.findByCode(prisma, tenantId, code)
  if (existingByCode) {
    throw new ContactTypeConflictError("Contact type code already exists")
  }

  return repo.create(prisma, { tenantId, code, name, /* ... */ })
}

export async function update(prisma, tenantId, input) {
  // Verify exists
  const existing = await repo.findById(prisma, tenantId, input.id)
  if (!existing) throw new ContactTypeNotFoundError()

  // Build partial update data
  const data: Record<string, unknown> = {}
  // ... handle each field ...
  return (await repo.update(prisma, tenantId, input.id, data))!
}

export async function remove(prisma, tenantId, id) {
  const existing = await repo.findById(prisma, tenantId, id)
  if (!existing) throw new ContactTypeNotFoundError()
  // Check referential integrity
  await repo.deleteById(prisma, tenantId, id)
}
```

### Error Class Naming Convention

Error classes must end with specific suffixes for `handleServiceError` to map them:
- `*NotFoundError` -> TRPCError `NOT_FOUND`
- `*ValidationError` or `*InvalidError` -> TRPCError `BAD_REQUEST`
- `*ConflictError` or `*DuplicateError` -> TRPCError `CONFLICT`
- `*ForbiddenError` or `*AccessDeniedError` -> TRPCError `FORBIDDEN`

Each error class sets `this.name` explicitly.

### Repository Pattern

**File:** `/home/tolga/projects/terp/src/lib/services/contact-type-repository.ts` (representative)

```ts
import type { PrismaClient } from "@/generated/prisma/client"

export async function findMany(
  prisma: PrismaClient,
  tenantId: string,
  params?: { isActive?: boolean }
) {
  const where: Record<string, unknown> = { tenantId }
  if (params?.isActive !== undefined) {
    where.isActive = params.isActive
  }
  return prisma.contactType.findMany({
    where,
    orderBy: { sortOrder: "asc" },
  })
}

export async function findById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.contactType.findFirst({
    where: { id, tenantId },
  })
}

export async function findByCode(
  prisma: PrismaClient,
  tenantId: string,
  code: string,
  excludeId?: string
) {
  const where: Record<string, unknown> = { tenantId, code }
  if (excludeId) {
    where.NOT = { id: excludeId }
  }
  return prisma.contactType.findFirst({ where })
}

export async function create(
  prisma: PrismaClient,
  data: { tenantId: string; code: string; /* ... */ }
) {
  return prisma.contactType.create({ data })
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  return prisma.contactType.update({ where: { id }, data })
}

export async function deleteById(prisma: PrismaClient, tenantId: string, id: string) {
  const { count } = await prisma.contactType.deleteMany({
    where: { id, tenantId },
  })
  return count > 0
}
```

Key conventions:
- Repository functions are pure Prisma queries, no business logic
- All take `prisma: PrismaClient` as first arg
- All tenant-scoped queries include `tenantId` in the `where` clause
- `findById` uses `findFirst` with `{ id, tenantId }` for tenant scoping
- `deleteById` uses `deleteMany` with `{ id, tenantId }` for tenant-scoped deletion
- `update` uses `update` with `where: { id }` (assumes existence already verified in service)

### File Naming Convention

- Service: `src/lib/services/{entity-name}-service.ts` (e.g., `contact-type-service.ts`)
- Repository: `src/lib/services/{entity-name}-repository.ts` (e.g., `contact-type-repository.ts`)
- Both use kebab-case filenames

---

## 6. handleServiceError

**File:** `/home/tolga/projects/terp/src/trpc/errors.ts`

```ts
import { TRPCError } from "@trpc/server"
import { Prisma } from "@/generated/prisma/client"

export function handleServiceError(err: unknown): never {
  if (err instanceof TRPCError) throw err

  if (err instanceof Error) {
    if (err.constructor.name.endsWith("NotFoundError")) {
      throw new TRPCError({ code: "NOT_FOUND", message: err.message, cause: err })
    }
    if (err.constructor.name.endsWith("ValidationError") ||
        err.constructor.name.endsWith("InvalidError")) {
      throw new TRPCError({ code: "BAD_REQUEST", message: err.message, cause: err })
    }
    if (err.constructor.name.endsWith("ConflictError") ||
        err.constructor.name.endsWith("DuplicateError")) {
      throw new TRPCError({ code: "CONFLICT", message: err.message, cause: err })
    }
    if (err.constructor.name.endsWith("ForbiddenError") ||
        err.constructor.name.endsWith("AccessDeniedError")) {
      throw new TRPCError({ code: "FORBIDDEN", message: err.message, cause: err })
    }
  }

  // Prisma-specific error handling
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case "P2025": throw new TRPCError({ code: "NOT_FOUND", ... })
      case "P2002": throw new TRPCError({ code: "CONFLICT", ... })
      case "P2003": throw new TRPCError({ code: "BAD_REQUEST", ... })
      default: throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", ... })
    }
  }

  // Fallback
  throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", ... })
}
```

---

## 7. React Hooks Pattern

**File:** `/home/tolga/projects/terp/src/hooks/use-locations.ts` (representative)

```ts
import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

// Query hooks
export function useLocations(options: { enabled?: boolean; isActive?: boolean } = {}) {
  const { enabled = true, isActive } = options
  const trpc = useTRPC()
  return useQuery(
    trpc.locations.list.queryOptions({ isActive }, { enabled })
  )
}

export function useLocation(id: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.locations.getById.queryOptions({ id }, { enabled: enabled && !!id })
  )
}

// Mutation hooks
export function useCreateLocation() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.locations.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.locations.list.queryKey(),
      })
    },
  })
}

export function useUpdateLocation() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.locations.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.locations.list.queryKey(),
      })
    },
  })
}

export function useDeleteLocation() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.locations.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.locations.list.queryKey(),
      })
    },
  })
}
```

### Hooks Barrel Export

**File:** `/home/tolga/projects/terp/src/hooks/index.ts`

All hooks are exported from the barrel file. Pattern:
```ts
// CRM Addresses (to be added)
export {
  useCrmAddresses,
  useCrmAddress,
  useCreateCrmAddress,
  useUpdateCrmAddress,
  useDeleteCrmAddress,
  useRestoreCrmAddress,
} from './use-crm-addresses'
```

### tRPC Client Hook

**File:** `/home/tolga/projects/terp/src/trpc/index.ts`
```ts
export { TRPCProvider, useTRPC, useTRPCClient } from "./context"
export { TRPCReactProvider } from "./client"
```

The `useTRPC()` hook is used in all API hook files.

---

## 8. UI Component Patterns

### Data Table Pattern

**File:** `/home/tolga/projects/terp/src/components/employees/employee-data-table.tsx`

Key structure:
```tsx
'use client'

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { MoreHorizontal, Eye, Edit } from 'lucide-react'

interface EmployeeDataTableProps {
  employees: Employee[]
  isLoading: boolean
  selectedIds: Set<string>
  onSelectIds: (ids: Set<string>) => void
  onView: (employee: Employee) => void
  onEdit: (employee: Employee) => void
  onDelete: (employee: Employee) => void
}

export function EmployeeDataTable({ employees, isLoading, ... }: EmployeeDataTableProps) {
  if (isLoading) return <EmployeeDataTableSkeleton />
  if (employees.length === 0) return null

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-12"><Checkbox ... /></TableHead>
          <TableHead>{t('columnName')}</TableHead>
          {/* ... columns ... */}
          <TableHead className="w-16"><span className="sr-only">{t('columnActions')}</span></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {employees.map((employee) => (
          <TableRow key={employee.id} className="cursor-pointer" onClick={() => onView(employee)}>
            <TableCell onClick={(e) => e.stopPropagation()}>
              <Checkbox ... />
            </TableCell>
            {/* ... cells ... */}
            <TableCell onClick={(e) => e.stopPropagation()}>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm"><MoreHorizontal /></Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onView(employee)}>{/* ... */}</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onEdit(employee)}>{/* ... */}</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
```

### Form Sheet Pattern (create/edit slide-out)

**File:** `/home/tolga/projects/terp/src/components/employees/employee-form-sheet.tsx`

Key structure:
```tsx
'use client'

import {
  Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle,
} from '@/components/ui/sheet'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2 } from 'lucide-react'

interface EmployeeFormSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  employee?: Employee | null  // null = create mode
  onSuccess?: () => void
}

export function EmployeeFormSheet({ open, onOpenChange, employee, onSuccess }: EmployeeFormSheetProps) {
  const isEdit = !!employee
  const [form, setForm] = React.useState<FormState>(INITIAL_STATE)
  const [error, setError] = React.useState<string | null>(null)

  const createMutation = useCreateEmployee()
  const updateMutation = useUpdateEmployee()

  // Reset form when opening/closing
  React.useEffect(() => { if (open) { /* populate from employee or reset */ } }, [open, employee])

  const handleSubmit = async () => {
    // validate
    // try { isEdit ? update : create } catch { setError(...) }
    onSuccess?.()
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col">
        <SheetHeader>
          <SheetTitle>{isEdit ? t('edit') : t('create')}</SheetTitle>
          <SheetDescription>{/* ... */}</SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 -mx-4 px-4">
          <div className="space-y-6 py-4">
            {/* Section heading */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">{t('section')}</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="field">Label</Label>
                  <Input id="field" value={form.field} onChange={...} />
                </div>
              </div>
            </div>

            {error && (
              <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>
            )}
          </div>
        </ScrollArea>

        <SheetFooter className="flex-row gap-2 border-t">
          <Button variant="outline" onClick={handleClose} className="flex-1">{t('cancel')}</Button>
          <Button onClick={handleSubmit} disabled={isSubmitting} className="flex-1">
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isSubmitting ? t('saving') : isEdit ? t('save') : t('create')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
```

### Detail Page with Tabs Pattern

**File:** `/home/tolga/projects/terp/src/app/[locale]/(dashboard)/admin/employees/[id]/page.tsx`

Key structure:
```tsx
'use client'

import { useParams, useRouter } from 'next/navigation'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Edit } from 'lucide-react'

export default function EmployeeDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const { data: employee, isLoading } = useEmployee(params.id, /* enabled */)

  return (
    <div className="space-y-6">
      {/* Page header with back button, title, action buttons */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push('/admin/employees')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-4 flex-1">
          {/* Name, status badge, action buttons */}
        </div>
      </div>

      {/* Tabbed content */}
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">{t('tabOverview')}</TabsTrigger>
          <TabsTrigger value="tariff-assignments">{t('tabTariffs')}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardContent className="pt-6">
                {/* Detail rows */}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="other-tab" className="mt-6 space-y-6">
          {/* Sub-component */}
        </TabsContent>
      </Tabs>
    </div>
  )
}
```

### List Page Pattern

**File:** `/home/tolga/projects/terp/src/app/[locale]/(dashboard)/admin/employees/page.tsx`

Key structure:
```tsx
'use client'

import { useRouter } from 'next/navigation'
import { Plus, X } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/providers/auth-provider'
import { useHasPermission } from '@/hooks'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { SearchInput } from '@/components/ui/search-input'
import { Pagination } from '@/components/ui/pagination'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export default function EmployeesPage() {
  const { allowed: canAccess } = useHasPermission(['employees.view'])

  // Pagination and filter state
  const [page, setPage] = React.useState(1)
  const [search, setSearch] = React.useState('')
  const [activeFilter, setActiveFilter] = React.useState<boolean | undefined>(undefined)

  // Dialog state
  const [createOpen, setCreateOpen] = React.useState(false)
  const [editEmployee, setEditEmployee] = React.useState(null)
  const [deleteEmployee, setDeleteEmployee] = React.useState(null)

  // Fetch data
  const { data, isLoading } = useEmployees({ page, search, isActive: activeFilter })
  const employees = data?.items ?? []
  const total = data?.total ?? 0

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
          <p className="text-muted-foreground">{t('subtitle')}</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> {t('new')}
        </Button>
      </div>

      {/* Filters bar */}
      <div className="flex flex-wrap items-center gap-4">
        <SearchInput value={search} onChange={setSearch} ... />
        <Select value={...} onValueChange={...}>...</Select>
        {hasFilters && <Button variant="ghost" onClick={clearAll}><X /> {t('clear')}</Button>}
      </div>

      {/* Data table in card */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? <Skeleton /> : employees.length === 0 ? <EmptyState /> : <DataTable ... />}
        </CardContent>
      </Card>

      {/* Pagination */}
      {total > 0 && <Pagination page={page} totalPages={...} ... />}

      {/* Create/Edit Sheet */}
      <FormSheet open={createOpen || !!editEmployee} ... />

      {/* Delete Confirmation */}
      <ConfirmDialog open={!!deleteEmployee} ... />
    </div>
  )
}
```

---

## 9. Page Route Structure

**Base:** `/home/tolga/projects/terp/src/app/[locale]/(dashboard)/`

Layout: `/home/tolga/projects/terp/src/app/[locale]/(dashboard)/layout.tsx`
```tsx
'use client'
import { ProtectedRoute } from '@/components/auth/protected-route'
import { TenantGuard } from '@/components/auth/tenant-guard'
import { TenantProvider } from '@/providers/tenant-provider'
import { AppLayout, LoadingSkeleton } from '@/components/layout'

export default function DashboardLayout({ children }) {
  return (
    <ProtectedRoute loadingFallback={<LoadingSkeleton />}>
      <TenantProvider>
        <TenantGuard loadingFallback={<LoadingSkeleton />}>
          <AppLayout>{children}</AppLayout>
        </TenantGuard>
      </TenantProvider>
    </ProtectedRoute>
  )
}
```

Existing directory structure:
```
src/app/[locale]/(dashboard)/
  admin/
    employees/
      page.tsx               -> list page
      [id]/
        page.tsx             -> detail page
    departments/
    locations/
    ...
  crm/                       -> EMPTY (exists but no files)
  dashboard/
  timesheet/
  ...
```

For CRM, new pages would be:
```
src/app/[locale]/(dashboard)/crm/
  page.tsx                   -> CRM overview / redirect
  addresses/
    page.tsx                 -> address list
    [id]/
      page.tsx               -> address detail with tabs
```

---

## 10. Sidebar Navigation

**File:** `/home/tolga/projects/terp/src/components/layout/sidebar/sidebar-nav-config.ts`

### NavItem and NavSection Types

```ts
export interface NavItem {
  titleKey: string     // Translation key in 'nav' namespace
  href: string
  icon: LucideIcon
  permissions?: string[]  // Required permission keys
  module?: string         // Required module to show
}

export interface NavSection {
  titleKey: string
  items: NavItem[]
  module?: string   // Required module for entire section
}
```

### Current CRM Section (placeholder)

```ts
{
  titleKey: 'crm',
  module: 'crm',
  items: [
    {
      titleKey: 'crmOverview',
      href: '/crm',
      icon: BookOpen,
      module: 'crm',
    },
  ],
},
```

This section is only shown when the "crm" module is enabled for the tenant.

### Adding CRM Addresses Nav Item

Add to the existing CRM section's `items` array:
```ts
{
  titleKey: 'crmAddresses',
  href: '/crm/addresses',
  icon: BookOpen,  // or another icon
  module: 'crm',
  permissions: ['crm_addresses.view'],
},
```

### Sidebar Filtering Logic

**File:** `/home/tolga/projects/terp/src/components/layout/sidebar/sidebar-nav.tsx`

The `SidebarNav` component uses `useModules()` and `usePermissionChecker()` to filter:
- Section-level module check: if `section.module` is set and not in enabledModules, entire section hidden
- Item-level module check: if `item.module` is set and not in enabledModules, item hidden
- Item-level permission check: if `item.permissions` is set, checks user has at least one

---

## 11. Auth Middleware

**File:** `/home/tolga/projects/terp/src/lib/auth/middleware.ts`

Key exports:
```ts
export function requirePermission(...permissionIds: string[])    // OR logic
export function requireSelfOrPermission(userIdGetter, permId)
export function requireEmployeePermission(employeeIdGetter, ownPerm, allPerm)
export function applyDataScope()
```

Usage in routers:
```ts
import { requirePermission } from "@/lib/auth/middleware"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"

const CRM_VIEW = permissionIdByKey("crm_addresses.view")!
// ...
tenantProcedure.use(requirePermission(CRM_VIEW)).query(...)
```

---

## 12. Test Patterns

### Router Test Pattern

**File:** `/home/tolga/projects/terp/src/trpc/routers/__tests__/tenantModules-router.test.ts`

```ts
import { describe, it, expect, vi } from "vitest"
import { createCallerFactory } from "@/trpc/init"
import { tenantModulesRouter } from "../tenantModules"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import {
  createMockContext,
  createMockSession,
  createUserWithPermissions,
  createMockUserTenant,
} from "./helpers"

// Mock the db module used by requireModule middleware
vi.mock("@/lib/db", () => ({
  prisma: {
    tenantModule: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue({ id: "mock", module: "orders" }),
    },
  },
}))

const SETTINGS_MANAGE = permissionIdByKey("settings.manage")!
const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const USER_ID = "a0000000-0000-4000-a000-000000000001"

const createCaller = createCallerFactory(tenantModulesRouter)

function createTestContext(prisma: Record<string, unknown>) {
  return createMockContext({
    prisma: prisma as unknown as ReturnType<typeof createMockContext>["prisma"],
    authToken: "test-token",
    user: createUserWithPermissions([SETTINGS_MANAGE], {
      id: USER_ID,
      userTenants: [createMockUserTenant(USER_ID, TENANT_ID)],
    }),
    session: createMockSession(),
    tenantId: TENANT_ID,
  })
}

describe("tenantModules.list", () => {
  it("returns enabled modules", async () => {
    const prisma = {
      tenantModule: {
        findMany: vi.fn().mockResolvedValue([...]),
      },
    }
    const caller = createCaller(createTestContext(prisma))
    const result = await caller.list()
    expect(result.modules).toHaveLength(2)
  })
})
```

### Test Helpers

**File:** `/home/tolga/projects/terp/src/trpc/routers/__tests__/helpers.ts`

Key exports:
```ts
export function autoMockPrisma(partial)           // Wraps Prisma mock with auto-stubbed methods
export function createMockUser(overrides)          // Creates ContextUser
export function createMockSession()                // Creates Supabase Session
export function createMockContext(overrides)        // Creates TRPCContext
export function createMockUserGroup(overrides)     // Creates UserGroup
export function createAdminUser(overrides)          // Creates admin user
export function createUserWithPermissions(permIds, overrides)  // Creates user with specific perms
export function createMockTenant(overrides)         // Creates Tenant
export function createMockUserTenant(userId, tenantId, tenant?)  // Creates UserTenant with included tenant
```

**Important:** For tests that involve `requireModule()`, the `@/lib/db` module must be mocked:
```ts
vi.mock("@/lib/db", () => ({
  prisma: {
    tenantModule: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue({ id: "mock", module: "crm" }),
    },
  },
}))
```

This is because `requireModule()` uses a separate import of `prisma` from `@/lib/db` internally, not the one from the context.

---

## 13. Internationalization

Translation files use the `next-intl` library with `useTranslations('namespace')`.

Convention:
- Each page/component uses a namespace (e.g., `'adminEmployees'`, `'common'`)
- Sidebar uses `'nav'` namespace
- Translation keys follow camelCase

CRM will need:
- `'nav'` keys: `crmOverview`, `crmAddresses`
- A dedicated namespace like `'crmAddresses'` for the CRM address components

---

## Summary of Files to Create/Modify

### New Files
1. `supabase/migrations/20260101000095_create_crm_tables.sql` - Migration
2. `src/lib/services/crm-address-service.ts` - Service
3. `src/lib/services/crm-address-repository.ts` - Repository
4. `src/lib/services/number-sequence-service.ts` - Number sequence service
5. `src/trpc/routers/crm/addresses.ts` - CRM addresses router
6. `src/trpc/routers/crm/numberSequences.ts` - Number sequence admin router
7. `src/hooks/use-crm-addresses.ts` - React hooks
8. `src/components/crm/address-list.tsx` - Data table
9. `src/components/crm/address-form-sheet.tsx` - Form sheet
10. `src/components/crm/address-detail.tsx` - Detail view with tabs
11. `src/components/crm/contact-list.tsx` - Contacts sub-table
12. `src/components/crm/contact-form-dialog.tsx` - Contact form dialog
13. `src/components/crm/bank-account-list.tsx` - Bank accounts sub-table
14. `src/components/crm/bank-account-form-dialog.tsx` - Bank account form dialog
15. `src/app/[locale]/(dashboard)/crm/page.tsx` - CRM overview
16. `src/app/[locale]/(dashboard)/crm/addresses/page.tsx` - Address list page
17. `src/app/[locale]/(dashboard)/crm/addresses/[id]/page.tsx` - Address detail page
18. `src/trpc/routers/__tests__/crmAddresses-router.test.ts` - Router tests

### Files to Modify
1. `prisma/schema.prisma` - Add new models, enum, Tenant relations
2. `src/lib/auth/permission-catalog.ts` - Add CRM permissions
3. `src/trpc/routers/crm/index.ts` - Replace placeholder with merged CRM routers
4. `src/trpc/routers/_app.ts` - Import and mount crmRouter
5. `src/hooks/index.ts` - Export new CRM hooks
6. `src/components/layout/sidebar/sidebar-nav-config.ts` - Add CRM address nav items
