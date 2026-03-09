# ZMI-TICKET-306: Extract Services — Tier 3 Batch 1 (Simple CRUD)

Status: Todo
Priority: P1
Depends on: ZMI-TICKET-303

## Goal
Extract service + repository layers for simple CRUD routers: costCenters, locations, employmentTypes, activities, groups, accessZones, accessProfiles.

## Pattern
These are all straightforward CRUD routers (300-400 lines) following the same structure:
- list (paginated, tenant-scoped)
- getById
- create (with permission check)
- update (with permission check)
- delete (with permission check)

### Repository Template
```typescript
// src/lib/services/{domain}-repository.ts
import type { PrismaClient } from '@prisma/client'

export async function findMany(prisma: PrismaClient, tenantId: string, params: { page?: number; pageSize?: number; search?: string }) {
  const where = { tenantId, ...(params.search ? { name: { contains: params.search, mode: 'insensitive' } } : {}) }
  const [items, total] = await Promise.all([
    prisma.{model}.findMany({ where, skip: ((params.page ?? 1) - 1) * (params.pageSize ?? 25), take: params.pageSize ?? 25, orderBy: { name: 'asc' } }),
    prisma.{model}.count({ where }),
  ])
  return { items, total }
}

export async function findById(prisma: PrismaClient, tenantId: string, id: string) { ... }
export async function create(prisma: PrismaClient, tenantId: string, data: {...}) { ... }
export async function update(prisma: PrismaClient, tenantId: string, id: string, data: {...}) { ... }
export async function remove(prisma: PrismaClient, tenantId: string, id: string) { ... }
```

### Service Template
```typescript
// src/lib/services/{domain}-service.ts
import * as repo from './{domain}-repository'

export class {Domain}NotFoundError extends Error {
  constructor() { super('{domain} not found'); this.name = '{Domain}NotFoundError' }
}

export async function list(prisma: PrismaClient, tenantId: string, params: {...}) {
  return repo.findMany(prisma, tenantId, params)
}
export async function getById(prisma: PrismaClient, tenantId: string, id: string) {
  const item = await repo.findById(prisma, tenantId, id)
  if (!item) throw new {Domain}NotFoundError()
  return item
}
// ... create, update, delete
```

## Routers (7 total)

### costCenters.ts (~380 lines)
- Permission: `cost_centers.read`, `cost_centers.write`
- Model: `CostCenter`
- Extra: summary endpoint (name + id only)

### locations.ts (~350 lines)
- Permission: `locations.read`, `locations.write`
- Model: `Location`
- Extra: summary endpoint

### employmentTypes.ts (~340 lines)
- Permission: `employment_types.read`, `employment_types.write`
- Model: `EmploymentType`
- Extra: summary endpoint

### activities.ts (~360 lines)
- Permission: `activities.read`, `activities.write`
- Model: `Activity`
- Relations: activityGroup

### groups.ts (~350 lines)
- Permission: `groups.read`, `groups.write`
- Model: `Group`
- Extra: employee count

### accessZones.ts (~320 lines)
- Permission: `access_control.read`, `access_control.write`
- Model: `AccessZone`

### accessProfiles.ts (~330 lines)
- Permission: `access_control.read`, `access_control.write`
- Model: `AccessProfile`
- Relations: accessZones (many-to-many)

## Files Created (~14)
For each of the 7 routers: 1 service + 1 repository = 14 new files

## Verification
```bash
make typecheck
make test
```
