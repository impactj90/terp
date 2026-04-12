# Implementation Plan: CRM_09 — Konzern-/Filialen-Zuordnung

**Date:** 2026-03-26
**Ticket:** `thoughts/shared/tickets/orgAuftrag/TICKET_CRM_09_KONZERNZUORDNUNG.md`
**Research:** `thoughts/shared/research/2026-03-26-CRM_09-konzernzuordnung.md`

---

## Overview

Add a self-referencing parent-child hierarchy to `CrmAddress`. An address can be a "Konzernmutter" (parent) with "Filialen/Tochtergesellschaften" (children) assigned to it. Maximum 2 levels deep. Enables aggregated revenue reporting across the entire group.

---

## Phase 1: Schema & Migration

### 1.1 Supabase Migration

**Create:** `supabase/migrations/20260406100000_crm_address_parent_hierarchy.sql`

```sql
-- Add parent_address_id self-reference to crm_addresses for Konzern/Filialen hierarchy
ALTER TABLE crm_addresses
  ADD COLUMN parent_address_id UUID REFERENCES crm_addresses(id) ON DELETE SET NULL;

-- Index for parent lookups and hierarchy queries
CREATE INDEX idx_crm_addresses_parent_address
  ON crm_addresses (tenant_id, parent_address_id);
```

**Rationale:** Follows the exact pattern from `departments` table which has `parent_id UUID REFERENCES departments(id) ON DELETE SET NULL`. The `ON DELETE SET NULL` ensures that if a parent is deleted, children simply become top-level addresses instead of being cascade-deleted. Index includes `tenant_id` following the existing convention (`idx_departments_parent` pattern).

### 1.2 Prisma Schema

**Modify:** `prisma/schema.prisma` (CrmAddress model, lines 285-339)

Add the following three lines after `createdById` (line 314) and before the relations block (line 316):

```prisma
  parentAddressId String?  @map("parent_address_id") @db.Uuid
```

Add the following two self-referencing relations after the `tenant` relation (line 316):

```prisma
  parentAddress   CrmAddress?  @relation("AddressHierarchy", fields: [parentAddressId], references: [id], onDelete: SetNull)
  childAddresses  CrmAddress[] @relation("AddressHierarchy")
```

Add a new index before the `@@map` line (line 338):

```prisma
  @@index([tenantId, parentAddressId], map: "idx_crm_addresses_parent_address")
```

**Full diff context for the edit:**

After line 314 (`createdById`), insert:
```
  parentAddressId String?        @map("parent_address_id") @db.Uuid
```

After the `tenant` relation (line 316), insert:
```
  parentAddress   CrmAddress?  @relation("AddressHierarchy", fields: [parentAddressId], references: [id], onDelete: SetNull)
  childAddresses  CrmAddress[] @relation("AddressHierarchy")
```

Before the `@@map("crm_addresses")` line (line 338), insert:
```
  @@index([tenantId, parentAddressId], map: "idx_crm_addresses_parent_address")
```

**Pattern reference:** Department model at schema lines 1305-1333 uses identical pattern (`"DepartmentTree"` relation name).

### 1.3 Regenerate Prisma Client

```bash
pnpm db:generate
```

### 1.4 Verification

```bash
pnpm db:generate          # Ensure Prisma client generates without errors
pnpm typecheck 2>&1 | head -20   # Check no new type errors introduced
```

---

## Phase 2: Repository Layer

### 2.1 New Repository Functions

**Modify:** `src/lib/services/crm-address-repository.ts`

Add the following functions at the end of the file (before the counting helpers section, which starts at line 265):

#### 2.1.1 `findParentId` — For circular reference walk

```ts
export async function findParentId(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.crmAddress.findFirst({
    where: { id, tenantId },
    select: { parentAddressId: true },
  })
}
```

**Pattern reference:** Identical to `department-repository.ts` line 63-71 (`findParentId`).

#### 2.1.2 `countChildren` — Count child addresses

```ts
export async function countChildren(
  prisma: PrismaClient,
  tenantId: string,
  parentAddressId: string
) {
  return prisma.crmAddress.count({
    where: { parentAddressId, tenantId },
  })
}
```

**Pattern reference:** Identical to `department-repository.ts` line 109-117 (`countChildren`).

#### 2.1.3 `findByIdWithHierarchy` — Load address with parent + children

```ts
export async function findByIdWithHierarchy(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.crmAddress.findFirst({
    where: { id, tenantId },
    include: {
      parentAddress: {
        select: { id: true, company: true, number: true, type: true, city: true },
      },
      childAddresses: {
        where: { isActive: true },
        select: { id: true, company: true, number: true, type: true, city: true },
        orderBy: { company: "asc" },
      },
    },
  })
}
```

**Notes:**
- `parentAddress` select returns minimal info for displaying "Gehort zu: [Konzernname]" link.
- `childAddresses` select returns minimal info for listing subsidiaries in the Firmenverbund section.
- `childAddresses` filtered to `isActive: true` to hide deactivated subsidiaries.

### 2.2 Update Existing `findById`

**Modify:** `src/lib/services/crm-address-repository.ts`, `findById` function (lines 58-72)

Add `parentAddress` and `childAddresses` to the `include` block:

**Current (lines 63-71):**
```ts
  return prisma.crmAddress.findFirst({
    where: { id, tenantId },
    include: {
      contacts: { orderBy: [{ isPrimary: "desc" }, { lastName: "asc" }] },
      bankAccounts: { orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] },
      salesPriceList: { select: { id: true, name: true } },
      purchasePriceList: { select: { id: true, name: true } },
    },
  })
```

**New:**
```ts
  return prisma.crmAddress.findFirst({
    where: { id, tenantId },
    include: {
      contacts: { orderBy: [{ isPrimary: "desc" }, { lastName: "asc" }] },
      bankAccounts: { orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] },
      salesPriceList: { select: { id: true, name: true } },
      purchasePriceList: { select: { id: true, name: true } },
      parentAddress: {
        select: { id: true, company: true, number: true, type: true, city: true },
      },
      childAddresses: {
        where: { isActive: true },
        select: { id: true, company: true, number: true, type: true, city: true },
        orderBy: { company: "asc" },
      },
    },
  })
```

### 2.3 Update `findMany` to include `_count` for group indicator

**Modify:** `src/lib/services/crm-address-repository.ts`, `findMany` function (lines 45-56)

In the `findMany` call, add `_count` and `parentAddressId` select so the list view can show the group indicator:

**Current (lines 45-51):**
```ts
    prisma.crmAddress.findMany({
      where,
      orderBy: { company: "asc" },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
    }),
```

**New:**
```ts
    prisma.crmAddress.findMany({
      where,
      orderBy: { company: "asc" },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
      include: {
        _count: { select: { childAddresses: true } },
      },
    }),
```

**Rationale:** Adding `_count.childAddresses` is a lightweight way to determine if an address is a "Konzern" (has children). The `parentAddressId` field is already included in the model fields returned by default. This follows the existing `_count` pattern used in `billing-price-list-repository.ts` line 12 and `user-group-repository.ts` line 51.

### 2.4 Verification

```bash
pnpm typecheck 2>&1 | grep -i "crm-address-repository" | head -10
```

---

## Phase 3: Service Layer

### 3.1 Add `parentAddressId` to Audit Tracked Fields

**Modify:** `src/lib/services/crm-address-service.ts`, line 9-14

Add `"parentAddressId"` to the `ADDRESS_TRACKED_FIELDS` array:

**Current:**
```ts
const ADDRESS_TRACKED_FIELDS = [
  "type", "company", "street", "zip", "city", "country", "phone", "fax",
  "email", "website", "taxNumber", "vatId", "leitwegId", "matchCode", "notes",
  "paymentTermDays", "discountPercent", "discountDays", "discountGroup",
  "ourCustomerNumber", "salesPriceListId", "purchasePriceListId", "isActive",
]
```

**New:**
```ts
const ADDRESS_TRACKED_FIELDS = [
  "type", "company", "street", "zip", "city", "country", "phone", "fax",
  "email", "website", "taxNumber", "vatId", "leitwegId", "matchCode", "notes",
  "paymentTermDays", "discountPercent", "discountDays", "discountGroup",
  "ourCustomerNumber", "salesPriceListId", "purchasePriceListId", "isActive",
  "parentAddressId",
]
```

### 3.2 Add Circular Reference Check Helper

**Modify:** `src/lib/services/crm-address-service.ts`

Add after the `generateLetterSalutation` function (line 44) and before the error classes (line 46):

```ts
// --- Hierarchy Helpers ---

async function checkCircularReference(
  prisma: PrismaClient,
  tenantId: string,
  addressId: string,
  proposedParentId: string
): Promise<boolean> {
  const visited = new Set<string>([addressId])
  let current: string | null = proposedParentId

  while (current !== null) {
    if (visited.has(current)) return true
    visited.add(current)

    const record = await repo.findParentId(prisma, tenantId, current)
    if (!record) break
    current = record.parentAddressId
  }

  return false
}
```

**Pattern reference:** Copied from `department-service.ts` lines 46-65, adapted to use `parentAddressId` instead of `parentId`.

### 3.3 Add `setParentAddress` Service Function

**Modify:** `src/lib/services/crm-address-service.ts`

Add after the `restoreAddress` function (after line 317) and before the Contact Service Functions section (line 319):

```ts
// --- Hierarchy Service Functions ---

export async function setParentAddress(
  prisma: PrismaClient,
  tenantId: string,
  addressId: string,
  parentAddressId: string | null,
  audit?: AuditContext
) {
  // 1. Load the address
  const address = await repo.findById(prisma, tenantId, addressId)
  if (!address) {
    throw new CrmAddressNotFoundError()
  }

  // If clearing the parent, just update and return
  if (parentAddressId === null) {
    const updated = await repo.update(prisma, tenantId, addressId, { parentAddressId: null })

    if (audit) {
      const changes = auditLog.computeChanges(
        address as unknown as Record<string, unknown>,
        updated as unknown as Record<string, unknown>,
        ADDRESS_TRACKED_FIELDS
      )
      await auditLog.log(prisma, {
        tenantId, userId: audit.userId, action: "update", entityType: "crm_address",
        entityId: addressId, entityName: address.company ?? null, changes,
        ipAddress: audit.ipAddress, userAgent: audit.userAgent,
      }).catch(err => console.error('[AuditLog] Failed:', err))
    }

    return updated
  }

  // 2. Self-reference check
  if (parentAddressId === addressId) {
    throw new CrmAddressValidationError("An address cannot be its own parent")
  }

  // 3. Load the proposed parent
  const parent = await repo.findById(prisma, tenantId, parentAddressId)
  if (!parent) {
    throw new CrmAddressValidationError("Parent address not found in this tenant")
  }

  // 4. Same-type check (BOTH is compatible with both CUSTOMER and SUPPLIER)
  const typesCompatible =
    address.type === parent.type ||
    address.type === "BOTH" ||
    parent.type === "BOTH"
  if (!typesCompatible) {
    throw new CrmAddressValidationError(
      "Parent and child address must be of the same type"
    )
  }

  // 5. Max depth check: parent must not itself have a parent (max 2 levels)
  if (parent.parentAddressId !== null) {
    throw new CrmAddressValidationError(
      "Maximum hierarchy depth of 2 levels exceeded. The selected parent is already a subsidiary."
    )
  }

  // 6. Max depth check: this address must not have children (if it becomes a child, it can't have children)
  const childCount = await repo.countChildren(prisma, tenantId, addressId)
  if (childCount > 0) {
    throw new CrmAddressValidationError(
      "This address has subsidiaries and cannot be assigned as a subsidiary itself. Remove its subsidiaries first."
    )
  }

  // 7. Circular reference check (defense in depth, covered by depth checks above for max 2 levels)
  const isCircular = await checkCircularReference(prisma, tenantId, addressId, parentAddressId)
  if (isCircular) {
    throw new CrmAddressValidationError("Circular reference detected")
  }

  // 8. Update parentAddressId
  const updated = await repo.update(prisma, tenantId, addressId, { parentAddressId })

  if (audit) {
    const changes = auditLog.computeChanges(
      address as unknown as Record<string, unknown>,
      updated as unknown as Record<string, unknown>,
      ADDRESS_TRACKED_FIELDS
    )
    await auditLog.log(prisma, {
      tenantId, userId: audit.userId, action: "update", entityType: "crm_address",
      entityId: addressId, entityName: address.company ?? null, changes,
      ipAddress: audit.ipAddress, userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  return updated
}
```

**Validation rules implemented:**
1. Self-reference: `parentAddressId === addressId`
2. Same tenant: `repo.findById(prisma, tenantId, parentAddressId)` returns null if not in tenant
3. Same type: comparison with `BOTH` compatibility
4. Max 2 levels (parent-side): parent's `parentAddressId` must be null
5. Max 2 levels (child-side): address must have 0 children
6. Circular reference: defense-in-depth walk

### 3.4 Add `getHierarchy` Service Function

```ts
export async function getHierarchy(
  prisma: PrismaClient,
  tenantId: string,
  addressId: string
) {
  const address = await repo.findByIdWithHierarchy(prisma, tenantId, addressId)
  if (!address) {
    throw new CrmAddressNotFoundError()
  }
  return address
}
```

### 3.5 Add `getGroupStats` Service Function

```ts
export async function getGroupStats(
  prisma: PrismaClient,
  tenantId: string,
  parentAddressId: string,
  dateFrom?: string,
  dateTo?: string
) {
  // Verify parent exists and is in this tenant
  const parent = await repo.findById(prisma, tenantId, parentAddressId)
  if (!parent) {
    throw new CrmAddressNotFoundError()
  }

  // Get all child address IDs
  const children = await prisma.crmAddress.findMany({
    where: { tenantId, parentAddressId, isActive: true },
    select: { id: true, company: true, number: true },
  })

  const allAddressIds = [parentAddressId, ...children.map(c => c.id)]

  // Build date filter
  const dateFilter: Record<string, unknown> = {}
  if (dateFrom) {
    dateFilter.gte = new Date(dateFrom)
  }
  if (dateTo) {
    dateFilter.lte = new Date(dateTo)
  }

  // Aggregate revenue: INVOICE adds, CREDIT_NOTE subtracts
  const invoiceWhere: Record<string, unknown> = {
    tenantId,
    addressId: { in: allAddressIds },
    type: "INVOICE",
    status: { not: "CANCELLED" },
  }
  if (dateFrom || dateTo) {
    invoiceWhere.documentDate = dateFilter
  }

  const creditWhere: Record<string, unknown> = {
    tenantId,
    addressId: { in: allAddressIds },
    type: "CREDIT_NOTE",
    status: { not: "CANCELLED" },
  }
  if (dateFrom || dateTo) {
    creditWhere.documentDate = dateFilter
  }

  const [invoiceAgg, creditAgg, documentCount] = await Promise.all([
    prisma.billingDocument.aggregate({
      where: invoiceWhere,
      _sum: { subtotalNet: true, totalGross: true },
    }),
    prisma.billingDocument.aggregate({
      where: creditWhere,
      _sum: { subtotalNet: true, totalGross: true },
    }),
    prisma.billingDocument.count({
      where: {
        tenantId,
        addressId: { in: allAddressIds },
        type: { in: ["INVOICE", "CREDIT_NOTE"] },
        status: { not: "CANCELLED" },
        ...(dateFrom || dateTo ? { documentDate: dateFilter } : {}),
      },
    }),
  ])

  const totalNet = (invoiceAgg._sum.subtotalNet ?? 0) - (creditAgg._sum.subtotalNet ?? 0)
  const totalGross = (invoiceAgg._sum.totalGross ?? 0) - (creditAgg._sum.totalGross ?? 0)

  return {
    parentAddress: { id: parent.id, company: parent.company, number: parent.number },
    childCount: children.length,
    children: children.map(c => ({ id: c.id, company: c.company, number: c.number })),
    revenue: {
      totalNet: Math.round(totalNet * 100) / 100,
      totalGross: Math.round(totalGross * 100) / 100,
      documentCount,
    },
  }
}
```

**Notes:**
- Revenue calculation uses Prisma `aggregate` with `_sum` which is clean and type-safe.
- CREDIT_NOTE amounts are subtracted from INVOICE amounts.
- CANCELLED documents are excluded.
- Date range filtering is optional.
- Rounding to 2 decimal places for monetary values.

### 3.6 Verification

```bash
pnpm typecheck 2>&1 | grep -i "crm-address" | head -20
```

---

## Phase 4: tRPC Router

### 4.1 Add New Procedures

**Modify:** `src/trpc/routers/crm/addresses.ts`

Add the following three procedures to the `crmAddressesRouter` object, after the `restore` procedure (after line 169) and before the Contact Sub-Procedures section (line 171):

#### 4.1.1 `setParent` mutation

```ts
  // --- Hierarchy Procedures ---

  setParent: crmProcedure
    .use(requirePermission(CRM_EDIT))
    .input(z.object({
      id: z.string().uuid(),
      parentAddressId: z.string().uuid().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await crmAddressService.setParentAddress(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id,
          input.parentAddressId,
          { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),
```

#### 4.1.2 `getHierarchy` query

```ts
  getHierarchy: crmProcedure
    .use(requirePermission(CRM_VIEW))
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      try {
        return await crmAddressService.getHierarchy(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),
```

#### 4.1.3 `getGroupStats` query

```ts
  getGroupStats: crmProcedure
    .use(requirePermission(CRM_VIEW))
    .input(z.object({
      parentId: z.string().uuid(),
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      try {
        return await crmAddressService.getGroupStats(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.parentId,
          input.dateFrom,
          input.dateTo
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),
```

**Pattern reference:** All three follow the exact pattern of existing procedures in the same file. Mutations use `CRM_EDIT`, queries use `CRM_VIEW`. Error handling uses `handleServiceError(err)` which maps `CrmAddressValidationError` to `BAD_REQUEST` and `CrmAddressNotFoundError` to `NOT_FOUND` automatically via the error class name matching in `src/trpc/errors.ts`.

### 4.2 Verification

```bash
pnpm typecheck 2>&1 | grep -i "addresses.ts" | head -10
```

---

## Phase 5: React Hooks

### 5.1 Add Hierarchy Hooks

**Modify:** `src/hooks/use-crm-addresses.ts`

Add the following hooks after the `useRestoreCrmAddress` function (after line 101), before the Contact Hooks section (line 103):

```ts
// ==================== Hierarchy Hooks ====================

export function useCrmAddressHierarchy(id: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.crm.addresses.getHierarchy.queryOptions(
      { id },
      { enabled: enabled && !!id }
    )
  )
}

export function useSetCrmAddressParent() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.crm.addresses.setParent.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.crm.addresses.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.crm.addresses.getById.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.crm.addresses.getHierarchy.queryKey(),
      })
    },
  })
}

export function useCrmGroupStats(parentId: string, dateFrom?: string, dateTo?: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.crm.addresses.getGroupStats.queryOptions(
      { parentId, dateFrom, dateTo },
      { enabled: enabled && !!parentId }
    )
  )
}
```

**Pattern reference:** Follows exact pattern of existing hooks in the same file. `useSetCrmAddressParent` invalidates `list` (for group indicator refresh), `getById` (for detail page refresh), and `getHierarchy` (for hierarchy section refresh).

### 5.2 Verification

```bash
pnpm typecheck 2>&1 | grep -i "use-crm-addresses" | head -10
```

---

## Phase 6: i18n Translations

### 6.1 German Translations

**Modify:** `messages/de.json`

Add the following keys inside the `crmAddresses` object (after `"delete": "Loschen"` at line 5261, before the closing `}`):

```json
    "sectionGroup": "Firmenverbund",
    "labelParentAddress": "Gehort zu (Konzern)",
    "labelChildAddresses": "Filialen / Tochtergesellschaften",
    "groupIndicatorTooltip": "Konzern mit {count} Filialen",
    "subsidiaryIndicator": "Filiale",
    "setParent": "Konzernzuordnung andern",
    "removeParent": "Zuordnung entfernen",
    "removeParentConfirm": "Mochten Sie die Konzernzuordnung wirklich entfernen?",
    "searchParentPlaceholder": "Konzern suchen...",
    "selectParent": "Konzern auswahlen",
    "noParent": "Kein Konzern zugeordnet",
    "noChildren": "Keine Filialen zugeordnet",
    "groupRevenue": "Konzern-Umsatz",
    "groupRevenueNet": "Umsatz (netto)",
    "groupRevenueGross": "Umsatz (brutto)",
    "groupDocumentCount": "Belege",
    "parentSetSuccess": "Konzernzuordnung gespeichert",
    "parentRemovedSuccess": "Konzernzuordnung entfernt",
    "parentSetFailed": "Konzernzuordnung fehlgeschlagen",
    "validationCircular": "Zirkulare Referenz erkannt",
    "validationMaxDepth": "Maximale Hierarchietiefe uberschritten",
    "validationTypeMismatch": "Konzern und Filiale mussen vom gleichen Typ sein"
```

### 6.2 English Translations

**Modify:** `messages/en.json`

Add the following keys inside the `crmAddresses` object (after `"delete": "Delete"` at line 5261, before the closing `}`):

```json
    "sectionGroup": "Corporate Group",
    "labelParentAddress": "Belongs to (Parent)",
    "labelChildAddresses": "Subsidiaries / Branches",
    "groupIndicatorTooltip": "Corporate group with {count} subsidiaries",
    "subsidiaryIndicator": "Subsidiary",
    "setParent": "Change group assignment",
    "removeParent": "Remove assignment",
    "removeParentConfirm": "Are you sure you want to remove the corporate group assignment?",
    "searchParentPlaceholder": "Search parent company...",
    "selectParent": "Select parent company",
    "noParent": "No parent company assigned",
    "noChildren": "No subsidiaries assigned",
    "groupRevenue": "Group Revenue",
    "groupRevenueNet": "Revenue (net)",
    "groupRevenueGross": "Revenue (gross)",
    "groupDocumentCount": "Documents",
    "parentSetSuccess": "Group assignment saved",
    "parentRemovedSuccess": "Group assignment removed",
    "parentSetFailed": "Group assignment failed",
    "validationCircular": "Circular reference detected",
    "validationMaxDepth": "Maximum hierarchy depth exceeded",
    "validationTypeMismatch": "Parent and subsidiary must be of the same type"
```

### 6.3 Verification

```bash
# JSON syntax validation
node -e "JSON.parse(require('fs').readFileSync('messages/de.json','utf-8'))" && echo "de.json OK"
node -e "JSON.parse(require('fs').readFileSync('messages/en.json','utf-8'))" && echo "en.json OK"
```

---

## Phase 7: UI Components

### 7.1 Address Group Section Component

**Create:** `src/components/crm/address-group-section.tsx`

This component renders the "Firmenverbund" card in the address detail overview tab. It shows:

- If the address is a subsidiary: "Gehort zu: [Parent Company]" with a link to the parent
- If the address is a parent: List of subsidiaries with links
- An "Edit" button that opens a search dialog to change/set/remove the parent assignment

```tsx
'use client'

import * as React from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useParams } from 'next/navigation'
import { Building2, X, Search } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useCrmAddresses, useSetCrmAddressParent } from '@/hooks'

interface ParentInfo {
  id: string
  company: string
  number: string
  type: string
  city: string | null
}

interface AddressGroupSectionProps {
  addressId: string
  addressType: string
  parentAddress: ParentInfo | null
  childAddresses: ParentInfo[]
  canEdit: boolean
}

export function AddressGroupSection({
  addressId,
  addressType,
  parentAddress,
  childAddresses,
  canEdit,
}: AddressGroupSectionProps) {
  const t = useTranslations('crmAddresses')
  const params = useParams<{ locale: string }>()
  const [searchOpen, setSearchOpen] = React.useState(false)
  const [removeConfirmOpen, setRemoveConfirmOpen] = React.useState(false)
  const [searchTerm, setSearchTerm] = React.useState('')

  const setParent = useSetCrmAddressParent()

  const { data: searchResults } = useCrmAddresses({
    search: searchTerm,
    isActive: true,
    page: 1,
    pageSize: 10,
    enabled: searchOpen && searchTerm.length >= 2,
  })

  const handleSelectParent = async (parentId: string) => {
    try {
      await setParent.mutateAsync({ id: addressId, parentAddressId: parentId })
      toast.success(t('parentSetSuccess'))
      setSearchOpen(false)
      setSearchTerm('')
    } catch {
      toast.error(t('parentSetFailed'))
    }
  }

  const handleRemoveParent = async () => {
    try {
      await setParent.mutateAsync({ id: addressId, parentAddressId: null })
      toast.success(t('parentRemovedSuccess'))
      setRemoveConfirmOpen(false)
    } catch {
      toast.error(t('parentSetFailed'))
    }
  }

  // Filter out self and existing children from search results
  const filteredResults = searchResults?.items.filter(
    (a) => a.id !== addressId && !childAddresses.some((c) => c.id === a.id)
  ) ?? []

  const isParent = childAddresses.length > 0
  const isChild = parentAddress !== null
  const hasHierarchy = isParent || isChild

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            {t('sectionGroup')}
          </h3>
          {canEdit && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearchTerm('')
                setSearchOpen(true)
              }}
            >
              {t('setParent')}
            </Button>
          )}
        </div>

        {!hasHierarchy && (
          <p className="text-sm text-muted-foreground">{t('noParent')}</p>
        )}

        {/* Show parent link if this is a subsidiary */}
        {isChild && parentAddress && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">{t('labelParentAddress')}</p>
            <div className="flex items-center justify-between">
              <Link
                href={`/${params.locale}/crm/addresses/${parentAddress.id}`}
                className="text-sm font-medium text-primary hover:underline"
              >
                {parentAddress.company} ({parentAddress.number})
              </Link>
              {canEdit && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => setRemoveConfirmOpen(true)}
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Show children list if this is a parent */}
        {isParent && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              {t('labelChildAddresses')} ({childAddresses.length})
            </p>
            <div className="divide-y">
              {childAddresses.map((child) => (
                <div key={child.id} className="flex items-center justify-between py-2">
                  <Link
                    href={`/${params.locale}/crm/addresses/${child.id}`}
                    className="text-sm font-medium text-primary hover:underline"
                  >
                    {child.company} ({child.number})
                  </Link>
                  <span className="text-xs text-muted-foreground">{child.city || ''}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Parent search dialog */}
        <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('selectParent')}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder={t('searchParentPlaceholder')}
                  className="pl-9"
                />
              </div>
              <div className="max-h-60 overflow-y-auto space-y-1">
                {filteredResults.map((address) => (
                  <button
                    key={address.id}
                    type="button"
                    className="w-full text-left px-3 py-2 rounded-md hover:bg-accent text-sm"
                    onClick={() => handleSelectParent(address.id)}
                  >
                    <span className="font-medium">{address.company}</span>
                    <span className="text-muted-foreground ml-2">({address.number})</span>
                    {address.city && (
                      <span className="text-muted-foreground ml-2">— {address.city}</span>
                    )}
                  </button>
                ))}
                {searchTerm.length >= 2 && filteredResults.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    {t('emptyTitle')}
                  </p>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSearchOpen(false)}>
                {t('cancel')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Remove parent confirmation */}
        <ConfirmDialog
          open={removeConfirmOpen}
          onOpenChange={setRemoveConfirmOpen}
          title={t('removeParent')}
          description={t('removeParentConfirm')}
          onConfirm={handleRemoveParent}
        />
      </CardContent>
    </Card>
  )
}
```

### 7.2 Integrate Group Section into Address Detail Page

**Modify:** `src/app/[locale]/(dashboard)/crm/addresses/[id]/page.tsx`

#### 7.2.1 Add import

After the existing imports (around line 31), add:

```ts
import { AddressGroupSection } from '@/components/crm/address-group-section'
```

Also add `useHasPermission` import check -- it is already imported on line 8.

#### 7.2.2 Add permission check for edit capability

The `canEdit` permission is needed for the group section. Find where permissions are used (around line 46) and add:

```ts
const { allowed: canEdit } = useHasPermission(['crm_addresses.edit'])
```

#### 7.2.3 Add Firmenverbund card to overview tab

In the overview tab grid (`<div className="grid grid-cols-1 md:grid-cols-2 gap-6">`, line 201), add the AddressGroupSection **after the Notes card** (after line 277, before the closing `</div>` of the grid at line 278):

```tsx
            <AddressGroupSection
              addressId={address.id}
              addressType={address.type}
              parentAddress={(address as unknown as { parentAddress: { id: string; company: string; number: string; type: string; city: string | null } | null }).parentAddress ?? null}
              childAddresses={(address as unknown as { childAddresses: Array<{ id: string; company: string; number: string; type: string; city: string | null }> }).childAddresses ?? []}
              canEdit={canEdit !== false}
            />
```

**Note:** The type assertion is necessary because the `useCrmAddress` return type doesn't know about the new relations yet. This follows the exact same pattern used for `salesPriceList` and `purchasePriceList` on lines 247-253 of the same file.

### 7.3 Group Indicator in Address Data Table

**Modify:** `src/components/crm/address-data-table.tsx`

#### 7.3.1 Update interface

Add `_count` and `parentAddressId` to the `CrmAddress` interface (lines 24-33):

**Current:**
```ts
interface CrmAddress {
  id: string
  number: string
  company: string
  type: 'CUSTOMER' | 'SUPPLIER' | 'BOTH'
  city: string | null
  phone: string | null
  email: string | null
  isActive: boolean
}
```

**New:**
```ts
interface CrmAddress {
  id: string
  number: string
  company: string
  type: 'CUSTOMER' | 'SUPPLIER' | 'BOTH'
  city: string | null
  phone: string | null
  email: string | null
  isActive: boolean
  parentAddressId?: string | null
  _count?: { childAddresses?: number }
}
```

#### 7.3.2 Add import for `Building2` icon and `Tooltip`

Update the lucide-react import (line 22):

**Current:**
```ts
import { MoreHorizontal, Eye, Edit, Trash2, RotateCcw } from 'lucide-react'
```

**New:**
```ts
import { MoreHorizontal, Eye, Edit, Trash2, RotateCcw, Building2 } from 'lucide-react'
```

Add Tooltip import:
```ts
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
```

#### 7.3.3 Add group indicator to Company column

**Current (line 132):**
```tsx
            <TableCell className="font-medium">{address.company}</TableCell>
```

**New:**
```tsx
            <TableCell className="font-medium">
              <span className="flex items-center gap-1.5">
                {address.company}
                {(address._count?.childAddresses ?? 0) > 0 && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent>
                      {t('groupIndicatorTooltip', { count: address._count!.childAddresses! })}
                    </TooltipContent>
                  </Tooltip>
                )}
              </span>
            </TableCell>
```

**Notes:**
- The `Building2` icon (a building with tree-like structure) is used as the group indicator.
- Tooltip shows "Konzern mit X Filialen" on hover.
- Only shown when address has child addresses (`_count.childAddresses > 0`).

### 7.4 Verification

```bash
pnpm typecheck 2>&1 | grep -E "(address-group|address-data-table|page\.tsx)" | head -20
```

---

## Phase 8: Tests

### 8.1 Router Tests

**Modify:** `src/trpc/routers/__tests__/crmAddresses-router.test.ts`

Add the following test blocks. Use the existing constants and helpers defined at the top of the file (TENANT_ID, USER_ID, ADDRESS_ID, mockAddress, createTestContext, createCaller, etc.)

Add a second address ID constant near line 31:

```ts
const PARENT_ADDRESS_ID = "b0000000-0000-4000-b000-000000000002"
```

Add mock parent address near line 100:

```ts
const mockParentAddress = {
  ...mockAddress,
  id: PARENT_ADDRESS_ID,
  company: "Konzern GmbH",
  number: "K-2",
  parentAddressId: null,
  parentAddress: null,
  childAddresses: [],
}
```

Update `mockAddress` to include the new fields:

```ts
const mockAddress = {
  // ... existing fields ...
  parentAddressId: null,
  parentAddress: null,
  childAddresses: [],
  contacts: [],
  bankAccounts: [],
}
```

#### 8.1.1 `setParent` tests

```ts
// --- crm.addresses.setParent tests ---

describe("crm.addresses.setParent", () => {
  it("sets parent address", async () => {
    const prisma = {
      crmAddress: {
        findFirst: vi.fn()
          .mockResolvedValueOnce({ ...mockAddress, parentAddressId: null }) // findById for child
          .mockResolvedValueOnce({ ...mockParentAddress }) // findById for parent
          .mockResolvedValueOnce({ parentAddressId: null }) // findParentId (circular check)
          .mockResolvedValueOnce({ ...mockAddress, parentAddressId: PARENT_ADDRESS_ID }), // refetch after update
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        count: vi.fn().mockResolvedValue(0), // countChildren
      },
    }

    const caller = createCaller(createTestContext(prisma))
    const result = await caller.setParent({
      id: ADDRESS_ID,
      parentAddressId: PARENT_ADDRESS_ID,
    })

    expect(result.parentAddressId).toBe(PARENT_ADDRESS_ID)
  })

  it("removes parent address when null", async () => {
    const prisma = {
      crmAddress: {
        findFirst: vi.fn()
          .mockResolvedValueOnce({ ...mockAddress, parentAddressId: PARENT_ADDRESS_ID }) // findById
          .mockResolvedValueOnce({ ...mockAddress, parentAddressId: null }), // refetch after update
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    }

    const caller = createCaller(createTestContext(prisma))
    const result = await caller.setParent({
      id: ADDRESS_ID,
      parentAddressId: null,
    })

    expect(result.parentAddressId).toBeNull()
  })

  it("rejects self-reference", async () => {
    const prisma = {
      crmAddress: {
        findFirst: vi.fn().mockResolvedValue(mockAddress),
      },
    }

    const caller = createCaller(createTestContext(prisma))
    await expect(
      caller.setParent({ id: ADDRESS_ID, parentAddressId: ADDRESS_ID })
    ).rejects.toThrow()
  })

  it("rejects when parent is already a subsidiary", async () => {
    const prisma = {
      crmAddress: {
        findFirst: vi.fn()
          .mockResolvedValueOnce({ ...mockAddress }) // findById for child
          .mockResolvedValueOnce({ ...mockParentAddress, parentAddressId: "some-grandparent" }), // parent has a parent
        count: vi.fn().mockResolvedValue(0),
      },
    }

    const caller = createCaller(createTestContext(prisma))
    await expect(
      caller.setParent({ id: ADDRESS_ID, parentAddressId: PARENT_ADDRESS_ID })
    ).rejects.toThrow()
  })

  it("rejects when address has children (would exceed depth)", async () => {
    const prisma = {
      crmAddress: {
        findFirst: vi.fn()
          .mockResolvedValueOnce({ ...mockAddress }) // findById for child
          .mockResolvedValueOnce({ ...mockParentAddress }), // findById for parent
        count: vi.fn().mockResolvedValue(3), // has 3 children
      },
    }

    const caller = createCaller(createTestContext(prisma))
    await expect(
      caller.setParent({ id: ADDRESS_ID, parentAddressId: PARENT_ADDRESS_ID })
    ).rejects.toThrow()
  })

  it("rejects cross-type assignment (customer to supplier)", async () => {
    const prisma = {
      crmAddress: {
        findFirst: vi.fn()
          .mockResolvedValueOnce({ ...mockAddress, type: "CUSTOMER" }) // child is customer
          .mockResolvedValueOnce({ ...mockParentAddress, type: "SUPPLIER" }), // parent is supplier
        count: vi.fn().mockResolvedValue(0),
      },
    }

    const caller = createCaller(createTestContext(prisma))
    await expect(
      caller.setParent({ id: ADDRESS_ID, parentAddressId: PARENT_ADDRESS_ID })
    ).rejects.toThrow()
  })

  it("rejects without crm_addresses.edit permission", async () => {
    const prisma = { crmAddress: {} }
    const caller = createCaller(createTestContext(prisma, [CRM_VIEW]))

    await expect(
      caller.setParent({ id: ADDRESS_ID, parentAddressId: PARENT_ADDRESS_ID })
    ).rejects.toThrow("Insufficient permissions")
  })
})
```

#### 8.1.2 `getHierarchy` tests

```ts
// --- crm.addresses.getHierarchy tests ---

describe("crm.addresses.getHierarchy", () => {
  it("returns address with parent and children", async () => {
    const addressWithHierarchy = {
      ...mockAddress,
      parentAddress: { id: PARENT_ADDRESS_ID, company: "Konzern GmbH", number: "K-2", type: "CUSTOMER", city: "Berlin" },
      childAddresses: [],
    }

    const prisma = {
      crmAddress: {
        findFirst: vi.fn().mockResolvedValue(addressWithHierarchy),
      },
    }

    const caller = createCaller(createTestContext(prisma))
    const result = await caller.getHierarchy({ id: ADDRESS_ID })

    expect(result.parentAddress?.company).toBe("Konzern GmbH")
  })

  it("returns empty hierarchy for standalone address", async () => {
    const prisma = {
      crmAddress: {
        findFirst: vi.fn().mockResolvedValue({
          ...mockAddress,
          parentAddress: null,
          childAddresses: [],
        }),
      },
    }

    const caller = createCaller(createTestContext(prisma))
    const result = await caller.getHierarchy({ id: ADDRESS_ID })

    expect(result.parentAddress).toBeNull()
    expect(result.childAddresses).toHaveLength(0)
  })

  it("rejects without crm_addresses.view permission", async () => {
    const prisma = { crmAddress: {} }
    const caller = createCaller(createNoPermContext(prisma))

    await expect(
      caller.getHierarchy({ id: ADDRESS_ID })
    ).rejects.toThrow("Insufficient permissions")
  })
})
```

#### 8.1.3 `getGroupStats` tests

```ts
// --- crm.addresses.getGroupStats tests ---

describe("crm.addresses.getGroupStats", () => {
  it("returns aggregated revenue for group", async () => {
    const prisma = {
      crmAddress: {
        findFirst: vi.fn().mockResolvedValue(mockParentAddress), // parent exists
        findMany: vi.fn().mockResolvedValue([
          { id: ADDRESS_ID, company: "Filiale 1", number: "K-3" },
        ]),
      },
      billingDocument: {
        aggregate: vi.fn()
          .mockResolvedValueOnce({ _sum: { subtotalNet: 10000, totalGross: 11900 } }) // invoices
          .mockResolvedValueOnce({ _sum: { subtotalNet: 500, totalGross: 595 } }), // credit notes
        count: vi.fn().mockResolvedValue(15),
      },
    }

    const caller = createCaller(createTestContext(prisma))
    const result = await caller.getGroupStats({ parentId: PARENT_ADDRESS_ID })

    expect(result.revenue.totalNet).toBe(9500)
    expect(result.revenue.totalGross).toBe(11305)
    expect(result.revenue.documentCount).toBe(15)
    expect(result.childCount).toBe(1)
  })

  it("rejects without crm_addresses.view permission", async () => {
    const prisma = { crmAddress: {}, billingDocument: {} }
    const caller = createCaller(createNoPermContext(prisma))

    await expect(
      caller.getGroupStats({ parentId: PARENT_ADDRESS_ID })
    ).rejects.toThrow("Insufficient permissions")
  })
})
```

### 8.2 Run Tests

```bash
pnpm vitest run src/trpc/routers/__tests__/crmAddresses-router.test.ts
```

---

## Phase 9: Handbook

### 9.1 Update Address List Section

**Modify:** `docs/TERP_HANDBUCH.md`

In the address list table (line 4190-4201), add a note about the group indicator after the "Firma" row:

**After the existing table (line 4201), add:**

```
💡 **Konzern-Indikator:** Adressen, die als Konzern fungieren (also Filialen/Tochtergesellschaften haben), zeigen ein kleines Gebäude-Icon (🏢) neben dem Firmennamen. Beim Darüberfahren erscheint ein Tooltip: „Konzern mit X Filialen".
```

### 9.2 Add Firmenverbund Card to Overview Tab Documentation

**Modify:** `docs/TERP_HANDBUCH.md`

In the address detail overview tab table (line 4264-4273), add a new row:

After the `Notizen` row (line 4273), add:

```
| **Firmenverbund** | Konzernzugehörigkeit: Anzeige des übergeordneten Konzerns (falls Filiale) oder Liste der Filialen (falls Konzern). Button „Konzernzuordnung ändern" zum Setzen/Entfernen der Zuordnung. |
```

### 9.3 Add New Subsection for Firmenverbund

**Modify:** `docs/TERP_HANDBUCH.md`

After section 12.1 (after the "Adresse wiederherstellen" section, around line 4255), add a new subsection:

```markdown
#### Firmenverbund (Konzern-/Filialen-Zuordnung)

**Was ist es?** Der Firmenverbund ermöglicht es, Adressen hierarchisch zu verknüpfen: Eine Adresse kann als „Konzernmutter" (übergeordnetes Unternehmen) fungieren, der andere Adressen als „Filialen" oder „Tochtergesellschaften" zugeordnet werden. Die Hierarchie ist auf maximal zwei Ebenen begrenzt (Konzern → Filiale).

**Wozu dient es?** Durch die Konzernzuordnung können zusammengehörende Unternehmen gruppiert werden — z. B. „Mercedes Stuttgart" als Konzern mit „Mercedes Werk Sindelfingen" als Filiale. Dies ermöglicht aggregierte Umsatzauswertungen über den gesamten Firmenverbund.

##### Filiale einem Konzern zuordnen

1. 📍 Adresse öffnen (die als Filiale zugeordnet werden soll)
2. ✅ Im Tab „Übersicht" erscheint die Karte **„Firmenverbund"**
3. 📍 **„Konzernzuordnung ändern"**
4. ✅ Suchdialog öffnet sich: „Konzern auswählen"
5. Firmennamen des Konzerns eingeben (mindestens 2 Zeichen)
6. ✅ Suchergebnisse werden angezeigt
7. 📍 Gewünschten Konzern anklicken
8. ✅ Zuordnung wird gespeichert, „Gehört zu: [Konzernname]" erscheint

💡 **Regeln:**
- Konzern und Filiale müssen vom gleichen Typ sein (Kunde kann nicht Filiale eines Lieferanten sein; „Kunde & Lieferant" ist mit beiden kompatibel)
- Maximal 2 Ebenen: Eine Filiale kann nicht selbst Filialen haben
- Eine Adresse kann nicht sich selbst als Konzern zugeordnet werden

##### Konzernzuordnung entfernen

1. 📍 Filial-Adresse öffnen
2. ✅ Karte „Firmenverbund" zeigt „Gehört zu: [Konzernname]"
3. 📍 **✕**-Button neben dem Konzernnamen
4. ✅ Bestätigungsdialog: „Möchten Sie die Konzernzuordnung wirklich entfernen?"
5. 📍 „Bestätigen"
6. ✅ Zuordnung entfernt, Adresse ist wieder eigenständig

##### Konzern-Übersicht

1. 📍 Konzern-Adresse öffnen
2. ✅ Karte „Firmenverbund" zeigt:
   - „Filialen / Tochtergesellschaften (X)" mit Liste aller zugeordneten Filialen
   - Jede Filiale ist als Link anklickbar

##### Praxisbeispiel: Mercedes Konzernstruktur

1. 📍 CRM → Adressen → „Neue Adresse"
2. Firma: „Mercedes-Benz AG", Typ: Kunde → „Anlegen"
3. 📍 „Neue Adresse" → Firma: „Mercedes Werk Sindelfingen", Typ: Kunde → „Anlegen"
4. 📍 „Mercedes Werk Sindelfingen" anklicken → Detailseite
5. ✅ Karte „Firmenverbund" sichtbar
6. 📍 „Konzernzuordnung ändern"
7. „Mercedes" eingeben → „Mercedes-Benz AG" anklicken
8. ✅ „Gehört zu: Mercedes-Benz AG (K-1)" wird angezeigt
9. 📍 Zurück → „Mercedes-Benz AG" anklicken
10. ✅ Karte „Firmenverbund" zeigt: „Filialen / Tochtergesellschaften (1)" mit „Mercedes Werk Sindelfingen"
```

### 9.4 Verification

Manually review the handbook changes for accuracy.

---

## Phase Summary

| Phase | Files Modified | Files Created | Key Changes |
|-------|---------------|---------------|-------------|
| 1. Schema & Migration | `prisma/schema.prisma` | `supabase/migrations/20260406100000_crm_address_parent_hierarchy.sql` | `parentAddressId` field, self-reference relation, index |
| 2. Repository | `src/lib/services/crm-address-repository.ts` | — | `findParentId`, `countChildren`, `findByIdWithHierarchy`, update `findById` include, update `findMany` with `_count` |
| 3. Service | `src/lib/services/crm-address-service.ts` | — | `setParentAddress`, `getHierarchy`, `getGroupStats`, circular ref check, tracked fields |
| 4. Router | `src/trpc/routers/crm/addresses.ts` | — | `setParent`, `getHierarchy`, `getGroupStats` procedures |
| 5. Hooks | `src/hooks/use-crm-addresses.ts` | — | `useCrmAddressHierarchy`, `useSetCrmAddressParent`, `useCrmGroupStats` |
| 6. i18n | `messages/de.json`, `messages/en.json` | — | ~22 new translation keys each |
| 7. UI | `src/app/[locale]/(dashboard)/crm/addresses/[id]/page.tsx`, `src/components/crm/address-data-table.tsx` | `src/components/crm/address-group-section.tsx` | Firmenverbund card, group indicator icon |
| 8. Tests | `src/trpc/routers/__tests__/crmAddresses-router.test.ts` | — | 10+ new test cases for hierarchy |
| 9. Handbook | `docs/TERP_HANDBUCH.md` | — | Group indicator, Firmenverbund card, new subsection with Praxisbeispiel |

---

## Validation Rules Summary

| Rule | Implementation Location | Error Message |
|------|------------------------|---------------|
| No self-reference | Service `setParentAddress` step 2 | "An address cannot be its own parent" |
| Same tenant | Service `setParentAddress` step 3 (repo.findById with tenantId) | "Parent address not found in this tenant" |
| Same type | Service `setParentAddress` step 4 | "Parent and child address must be of the same type" |
| Max 2 levels (parent side) | Service `setParentAddress` step 5 | "Maximum hierarchy depth of 2 levels exceeded..." |
| Max 2 levels (child side) | Service `setParentAddress` step 6 | "This address has subsidiaries and cannot be assigned..." |
| Circular reference | Service `setParentAddress` step 7 | "Circular reference detected" |

---

## Verification Commands (End-to-End)

```bash
# 1. Regenerate Prisma client
pnpm db:generate

# 2. Type-check
pnpm typecheck

# 3. Run CRM address tests
pnpm vitest run src/trpc/routers/__tests__/crmAddresses-router.test.ts

# 4. Run all tests
pnpm test

# 5. Build check
pnpm build

# 6. JSON validation
node -e "JSON.parse(require('fs').readFileSync('messages/de.json','utf-8'))" && echo "de.json OK"
node -e "JSON.parse(require('fs').readFileSync('messages/en.json','utf-8'))" && echo "en.json OK"
```
