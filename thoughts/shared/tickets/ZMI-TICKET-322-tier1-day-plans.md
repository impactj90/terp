# ZMI-TICKET-322: Extract Services — dayPlans (1308 lines)

Status: Todo
Priority: P1
Depends on: ZMI-TICKET-303

## Goal
Extract service + repository layers for the dayPlans router. This is a complex configuration router with bonus/break management, copy operations, and nested CRUD.

## Current Router Analysis (src/server/routers/dayPlans.ts — 1308 lines)

### Procedures
- `dayPlans.list` — list day plans with filters
- `dayPlans.getById` — single day plan with breaks + bonuses
- `dayPlans.create` — create day plan with breaks + bonuses
- `dayPlans.update` — update day plan
- `dayPlans.delete` — delete day plan
- `dayPlans.copy` — deep copy day plan
- `dayPlans.getBreaks` — list breaks for day plan
- `dayPlans.createBreak` — add break
- `dayPlans.updateBreak` — update break
- `dayPlans.deleteBreak` — remove break
- `dayPlans.getBonuses` — list bonuses for day plan
- `dayPlans.createBonus` — add bonus (surcharge rule)
- `dayPlans.updateBonus` — update bonus
- `dayPlans.deleteBonus` — remove bonus

### Key Business Logic
- Day plan defines a work day template (start, end, target hours)
- Breaks within day plan (fixed time or after-duration thresholds)
- Bonuses/surcharges (time-range based surcharge rules, e.g., night shift +25%)
- Deep copy with all nested breaks + bonuses
- Net cap calculation (target hours minus break deductions)
- Validation: break times within day plan range, no overlapping bonuses

## Implementation

### Repository: `src/lib/services/day-plan-repository.ts`
```typescript
// Day plan CRUD
export async function findMany(prisma, tenantId, params)
export async function findById(prisma, tenantId, id) // includes breaks + bonuses
export async function create(prisma, tenantId, data) // with nested breaks + bonuses
export async function update(prisma, tenantId, id, data)
export async function remove(prisma, tenantId, id)
export async function deepCopy(prisma, tenantId, id, newName)
// Breaks
export async function findBreaks(prisma, tenantId, dayPlanId)
export async function createBreak(prisma, tenantId, dayPlanId, data)
export async function updateBreak(prisma, tenantId, breakId, data)
export async function removeBreak(prisma, tenantId, breakId)
// Bonuses
export async function findBonuses(prisma, tenantId, dayPlanId)
export async function createBonus(prisma, tenantId, dayPlanId, data)
export async function updateBonus(prisma, tenantId, bonusId, data)
export async function removeBonus(prisma, tenantId, bonusId)
```

### Service: `src/lib/services/day-plan-service.ts`
```typescript
export class DayPlanNotFoundError extends Error { ... }
export class BreakNotFoundError extends Error { ... }
export class BonusNotFoundError extends Error { ... }
export class InvalidBreakTimeError extends Error { ... }
export class OverlappingBonusError extends Error { ... }

export async function list(prisma, tenantId, params)
export async function getById(prisma, tenantId, id)
export async function create(prisma, tenantId, data)
  // Validates break times within day plan range
  // Validates bonus time ranges don't overlap
export async function update(prisma, tenantId, id, data)
export async function remove(prisma, tenantId, id)
  // Check no tariffs/employees reference this day plan
export async function copy(prisma, tenantId, id, newName)
// Break operations
export async function getBreaks(prisma, tenantId, dayPlanId)
export async function createBreak(prisma, tenantId, dayPlanId, data)
export async function updateBreak(prisma, tenantId, breakId, data)
export async function deleteBreak(prisma, tenantId, breakId)
// Bonus operations
export async function getBonuses(prisma, tenantId, dayPlanId)
export async function createBonus(prisma, tenantId, dayPlanId, data)
export async function updateBonus(prisma, tenantId, bonusId, data)
export async function deleteBonus(prisma, tenantId, bonusId)
```

## Files Created
- `src/lib/services/day-plan-service.ts`
- `src/lib/services/day-plan-repository.ts`

## Verification
```bash
make typecheck
make test        # dayPlans has test files
```
