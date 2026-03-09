# ZMI-TICKET-320: Extract Services — tariffs (1154 lines)

Status: Todo
Priority: P1
Depends on: ZMI-TICKET-303

## Goal
Extract service + repository layers for the tariffs router. This is a complex configuration router handling tariff definitions with breaks, day plan associations, and copy operations.

## Current Router Analysis (src/server/routers/tariffs.ts — 1154 lines)

### Procedures
- `tariffs.list` — list tariffs with filters
- `tariffs.getById` — single tariff with full configuration
- `tariffs.create` — create tariff with day plans + breaks
- `tariffs.update` — update tariff configuration
- `tariffs.delete` — delete tariff
- `tariffs.copy` — deep copy tariff with all nested config
- `tariffs.getBreaks` — list breaks for a tariff
- `tariffs.createBreak` — add break to tariff
- `tariffs.updateBreak` — update break
- `tariffs.deleteBreak` — remove break
- `tariffs.getDayPlanAssociations` — day plan mapping (Mon-Sun)
- `tariffs.setDayPlanAssociations` — set day plan mapping

### Key Business Logic
- Tariff defines working time rules (target hours, tolerances, rounding)
- Break configuration (automatic breaks by duration thresholds)
- Day plan associations (which day plan for each weekday)
- Deep copy operation (tariff + breaks + day plan associations)
- Complex nested CRUD (tariff → breaks, tariff → day plan associations)

## Implementation

### Repository: `src/lib/services/tariff-repository.ts`
```typescript
export async function findMany(prisma, tenantId, params)
export async function findById(prisma, tenantId, id) // includes breaks + day plan associations
export async function create(prisma, tenantId, data) // with nested creates
export async function update(prisma, tenantId, id, data)
export async function remove(prisma, tenantId, id)
// Breaks
export async function findBreaks(prisma, tenantId, tariffId)
export async function createBreak(prisma, tenantId, tariffId, data)
export async function updateBreak(prisma, tenantId, breakId, data)
export async function removeBreak(prisma, tenantId, breakId)
// Day plan associations
export async function findDayPlanAssociations(prisma, tenantId, tariffId)
export async function setDayPlanAssociations(prisma, tenantId, tariffId, associations)
// Copy
export async function deepCopy(prisma, tenantId, tariffId, newName)
```

### Service: `src/lib/services/tariff-service.ts`
```typescript
export class TariffNotFoundError extends Error { ... }
export class BreakNotFoundError extends Error { ... }
export class DuplicateTariffNameError extends Error { ... }

export async function list(prisma, tenantId, params)
export async function getById(prisma, tenantId, id)
export async function create(prisma, tenantId, data)
  // Validates break thresholds don't overlap
export async function update(prisma, tenantId, id, data)
export async function remove(prisma, tenantId, id)
  // Check no employees assigned to this tariff
export async function copy(prisma, tenantId, tariffId, newName)
  // Deep copy with new name
export async function getBreaks(prisma, tenantId, tariffId)
export async function createBreak(prisma, tenantId, tariffId, data)
export async function updateBreak(prisma, tenantId, breakId, data)
export async function deleteBreak(prisma, tenantId, breakId)
export async function getDayPlanAssociations(prisma, tenantId, tariffId)
export async function setDayPlanAssociations(prisma, tenantId, tariffId, associations)
```

## Files Created
- `src/lib/services/tariff-service.ts`
- `src/lib/services/tariff-repository.ts`

## Verification
```bash
make typecheck
make test        # tariffs has test files
```
