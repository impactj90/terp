# ZMI-TICKET-315: Extract Services — bookings (822 lines)

Status: Todo
Priority: P1
Depends on: ZMI-TICKET-303

## Goal
Extract service + repository layers for the bookings router. This is a core router with derived booking creation, data scope enforcement, and recalculation triggers.

## Current Router Analysis (src/server/routers/bookings.ts — 822 lines)

### Procedures
- `bookings.list` — paginated list with employee/date/type filters, data scope enforcement
- `bookings.getById` — single booking with relations
- `bookings.create` — create booking, trigger daily recalculation
- `bookings.update` — update booking, trigger recalculation for affected days
- `bookings.delete` — delete booking, trigger recalculation
- `bookings.createDerived` — create derived booking (e.g., break, auto-generated)
- `bookings.cleanup.*` — batch cleanup operations (delete booking data, re-read, mark delete orders)

### Key Business Logic
- Data scope filtering (all/department/employee based on user permissions)
- Recalculation trigger after CUD operations (calls DailyCalcService)
- Derived booking creation with special rules
- Cleanup operations for batch data management
- Complex Zod schemas for input/output

### Dependencies
- `@/lib/services/daily-calc` (DailyCalcService for recalculation)
- `@/lib/services/recalc` (RecalcService for broader recalc)
- `@/lib/auth/middleware` (requirePermission, applyDataScope)

## Implementation

### Repository: `src/lib/services/booking-repository.ts`
```typescript
export async function findMany(prisma, tenantId, params: { employeeId?, dateFrom?, dateTo?, bookingTypeId?, page?, pageSize?, dataScope? })
export async function count(prisma, tenantId, params)
export async function findById(prisma, tenantId, id)
export async function create(prisma, tenantId, data)
export async function update(prisma, tenantId, id, data)
export async function remove(prisma, tenantId, id)
export async function createDerived(prisma, tenantId, data)
export async function deleteBookingData(prisma, tenantId, params)  // cleanup
export async function deleteBookings(prisma, tenantId, params)     // cleanup
export async function markDeleteOrders(prisma, tenantId, params)   // cleanup
export async function reReadBookings(prisma, tenantId, params)     // cleanup
```

### Service: `src/lib/services/booking-service.ts`
```typescript
export class BookingNotFoundError extends Error { ... }
export class InvalidBookingError extends Error { ... }

export async function list(prisma, tenantId, params)
export async function getById(prisma, tenantId, id)
export async function create(prisma, tenantId, data)
  // After create: trigger DailyCalcService.calculateDay for the booking date
export async function update(prisma, tenantId, id, data)
  // After update: trigger recalc for old + new dates if date changed
export async function remove(prisma, tenantId, id)
  // After delete: trigger recalc for the deleted booking's date
export async function createDerived(prisma, tenantId, data)
export async function cleanupDeleteBookingData(prisma, tenantId, params)
export async function cleanupDeleteBookings(prisma, tenantId, params)
export async function cleanupMarkDeleteOrders(prisma, tenantId, params)
export async function cleanupReReadBookings(prisma, tenantId, params)
```

### Router: `src/trpc/routers/bookings.ts` (thin wrapper)
- Keep Zod schemas for input/output
- Each procedure: validate input → call service → handleServiceError
- Data scope middleware stays in router layer (tRPC middleware)

## Files Created
- `src/lib/services/booking-service.ts`
- `src/lib/services/booking-repository.ts`

## Files Moved
- `src/server/routers/bookings.ts` → `src/trpc/routers/bookings.ts` (rewritten)

## Verification
```bash
make typecheck
make test        # bookings has test files
```
