# Research: AUDIT-004 — Tenant Isolation: Update without tenantId — Reference Data B

**Date:** 2026-03-22
**Ticket:** AUDIT-004
**Priority:** P0 (CRITICAL)

---

## 1. Current Implementation of Each `update()` Method

All 10 files follow the same vulnerable pattern: `prisma.model.update({ where: { id } })` — the `tenantId` parameter is accepted but never used in the `where` clause.

### 1.1 `employment-type-repository.ts` (line 62-69)

```ts
export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  return prisma.employmentType.update({ where: { id }, data })
}
```

### 1.2 `extended-travel-rule-repository.ts` (line 66-73)

```ts
export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  return prisma.extendedTravelRule.update({ where: { id }, data })
}
```

### 1.3 `holiday-repository.ts` (line 97-104)

```ts
export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  return prisma.holiday.update({ where: { id }, data })
}
```

### 1.4 `local-travel-rule-repository.ts` (line 63-70)

```ts
export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  return prisma.localTravelRule.update({ where: { id }, data })
}
```

### 1.5 `location-repository.ts` (line 65-72)

```ts
export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  return prisma.location.update({ where: { id }, data })
}
```

### 1.6 `tenant-repository.ts` (line 51-59) — SPECIAL CASE

```ts
export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  // For tenant updates, tenantId === id (the tenant being updated)
  return prisma.tenant.update({ where: { id }, data })
}
```

### 1.7 `vacation-capping-rule-repository.ts` (line 67-74)

```ts
export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  return prisma.vacationCappingRule.update({ where: { id }, data })
}
```

### 1.8 `vacation-special-calc-repository.ts` (line 65-72)

```ts
export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  return prisma.vacationSpecialCalculation.update({ where: { id }, data })
}
```

### 1.9 `vehicle-repository.ts` (line 50-57)

```ts
export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  return prisma.vehicle.update({ where: { id }, data })
}
```

### 1.10 `vehicle-route-repository.ts` (line 50-57)

```ts
export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  return prisma.vehicleRoute.update({ where: { id }, data })
}
```

---

## 2. Schema Verification — `tenantId` Field Presence

| Model                       | Field Definition                        | Required? | Notes                                      |
| --------------------------- | --------------------------------------- | --------- | ------------------------------------------ |
| `EmploymentType`            | `tenantId String? @map("tenant_id")`    | **Optional** (`String?`) | Nullable — may need special handling        |
| `ExtendedTravelRule`        | `tenantId String @map("tenant_id")`     | Required  | Non-nullable                               |
| `Holiday`                   | `tenantId String @map("tenant_id")`     | Required  | Non-nullable                               |
| `LocalTravelRule`           | `tenantId String @map("tenant_id")`     | Required  | Non-nullable                               |
| `Location`                  | `tenantId String @map("tenant_id")`     | Required  | Non-nullable                               |
| `Tenant`                    | N/A — `id` IS the tenant                | N/A       | No `tenantId` field; the model's `id` serves as its own tenant scope |
| `VacationCappingRule`       | `tenantId String @map("tenant_id")`     | Required  | Non-nullable                               |
| `VacationSpecialCalculation`| `tenantId String @map("tenant_id")`     | Required  | Non-nullable                               |
| `Vehicle`                   | `tenantId String @map("tenant_id")`     | Required  | Non-nullable                               |
| `VehicleRoute`              | `tenantId String @map("tenant_id")`     | Required  | Non-nullable                               |

### Key Observations

1. **EmploymentType** has `tenantId` as `String?` (optional/nullable). The `tenantScopedUpdate` helper works with `{ id, tenantId }` which will correctly match records where `tenantId` matches the provided value. This is safe — records with `tenantId = null` (system defaults) won't be matched when a specific tenantId is provided, which is correct behavior.

2. **Tenant** model has no `tenantId` field at all. The model's own `id` IS the tenant identifier. This requires special handling — see Section 5 below.

---

## 3. Existing Helper Availability

### `tenantScopedUpdate` in `src/lib/services/prisma-helpers.ts`

The helper is available and provides the exact fix pattern needed:

```ts
export async function tenantScopedUpdate(
  delegate: PrismaDelegate,       // e.g., prisma.vehicle
  where: { id: string; tenantId: string } & Record<string, unknown>,
  data: Record<string, unknown>,
  opts?: { include?: ...; select?: ...; entity?: string },
): Promise<any> {
  const { count } = await delegate.updateMany({ where, data })
  if (count === 0) {
    throw new TenantScopedNotFoundError(opts?.entity)
  }
  const refetchArgs = { where }
  if (opts?.include) refetchArgs.include = opts.include
  if (opts?.select) refetchArgs.select = opts.select
  const result = await delegate.findFirst(refetchArgs)
  if (!result) throw new TenantScopedNotFoundError(opts?.entity)
  return result
}
```

**Key behaviors:**
- Uses `updateMany` with `{ id, tenantId }` to enforce tenant isolation at the DB level
- Checks `count === 0` and throws `TenantScopedNotFoundError` (maps to tRPC NOT_FOUND via `handleServiceError`)
- Refetches the record with `findFirst` using the same where clause (supports optional `include`/`select`)
- Returns the full refetched record

### `relationScopedUpdate` (also in prisma-helpers.ts)

Available for models without direct `tenantId` — not needed for AUDIT-004 since all models (except Tenant) have direct `tenantId`.

---

## 4. Pattern from Already-Fixed Repositories

### AUDIT-001/002 Status: Partially Fixed

The following repositories already use `tenantScopedUpdate` (from prior AUDIT-001/002 fixes):

| Repository | Pattern Used |
|---|---|
| `absence-type-repository.ts` | `tenantScopedUpdate(prisma.absenceType, { id, tenantId }, data, { entity: "AbsenceType" })` |
| `absences-repository.ts` | `tenantScopedUpdate(prisma.absence, { id, tenantId }, data, { entity: "Absence" })` |
| `access-profile-repository.ts` | `tenantScopedUpdate(prisma.accessProfile, { id, tenantId }, data, { entity: "AccessProfile" })` |
| `access-zone-repository.ts` | `tenantScopedUpdate(prisma.accessZone, { id, tenantId }, data, { entity: "AccessZone" })` |
| `account-group-repository.ts` | `tenantScopedUpdate(prisma.accountGroup, { id, tenantId }, data, { entity: "AccountGroup" })` |
| `bookings-repository.ts` | `tenantScopedUpdate(prisma.booking, { id, tenantId }, data, { include: ..., entity: "Booking" })` |
| `cost-center-repository.ts` | `tenantScopedUpdate(prisma.costCenter, { id, tenantId }, data, { entity: "CostCenter" })` |
| `correction-repository.ts` | Uses `tenantScopedUpdate` |
| `employees-repository.ts` | `tenantScopedUpdate(prisma.employee, { id, tenantId }, data, { entity: "Employee" })` |
| `notification-repository.ts` | Uses `tenantScopedUpdate` |
| `order-repository.ts` | Uses `tenantScopedUpdate` |
| `payroll-export-repository.ts` | Uses `tenantScopedUpdate` |
| `reports-repository.ts` | Uses `tenantScopedUpdate` |
| `schedules-repository.ts` | Uses `tenantScopedUpdate` |
| `shift-repository.ts` | Uses `tenantScopedUpdate` |
| `system-settings-repository.ts` | Uses `tenantScopedUpdate` |
| `terminal-booking-repository.ts` | Uses `tenantScopedUpdate` |
| `user-group-repository.ts` | Uses `tenantScopedUpdate` |
| `vacation-balances-repository.ts` | Uses `tenantScopedUpdate` |

### AUDIT-003 Status: NOT Yet Fixed

The 10 files in AUDIT-003 (absence-type-group, account, activity, booking-reason, booking-type-group, booking-type, calculation-rule, contact-kind, contact-type, department) have NOT been fixed yet — they still use the vulnerable `prisma.model.update({ where: { id } })` pattern.

### Standard Fix Pattern (for simple models without includes)

```ts
import { tenantScopedUpdate } from "@/lib/services/prisma-helpers"

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  return tenantScopedUpdate(prisma.modelName, { id, tenantId }, data, { entity: "ModelName" })
}
```

---

## 5. Special Cases

### 5.1 `tenant-repository.ts` — Tenant Model Self-Update

The `Tenant` model has no `tenantId` field. The model's `id` IS the tenant identifier. Two callers exist:

**Caller 1: `tenant-service.ts` (line 243)**
```ts
return (await repo.update(prisma, input.id, input.id, data))!
```
Here, `tenantId` === `id` — the service explicitly passes `input.id` as both parameters.

**Caller 2: `tenant-service.ts` (line 253)**
```ts
await repo.update(prisma, id, id, { isActive: false })
```
Same pattern — `id` === `tenantId`.

**Caller 3: Tenants tRPC router (line 490)**
The router has its OWN inline update that bypasses the repository entirely:
```ts
const tenant = await ctx.prisma.tenant.update({
  where: { id: input.id },
  data,
})
```
This is preceded by `assertUserHasTenantAccess(ctx.user!.userTenants, input.id)` on line 393, which verifies the user has access to this tenant via the `user_tenants` join table. So the router-level update is protected by application-level access control, though not at the DB query level.

**Conclusion for Tenant model:** Since the Tenant model has no `tenantId` column, `tenantScopedUpdate` cannot be used directly. The fix options are:

1. **Option A (Recommended):** In the repository, enforce `id === tenantId` with a guard, then use `prisma.tenant.update({ where: { id } })`. Since the service layer already passes `id === tenantId`, this is just a safety assertion:
   ```ts
   export async function update(prisma, tenantId, id, data) {
     if (id !== tenantId) throw new TenantScopedNotFoundError("Tenant")
     return prisma.tenant.update({ where: { id }, data })
   }
   ```

2. **Option B:** Use `updateMany({ where: { id } })` + refetch, treating `{ id }` as sufficient since for the Tenant model, `id` IS the tenant scope. This doesn't add tenant isolation but maintains the consistent updateMany pattern.

### 5.2 `EmploymentType` — Nullable `tenantId`

The `EmploymentType` model has `tenantId: String?` (nullable). When using `tenantScopedUpdate` with `{ id, tenantId }`, Prisma's `updateMany` will correctly:
- Match records where `tenantId = 'provided-value'` AND `id = 'provided-id'`
- NOT match records where `tenantId IS NULL` (system defaults)

This is correct behavior — a tenant should only be able to update their own employment types, not system defaults. No special handling needed.

---

## 6. Return Type Analysis

All 10 `update()` methods currently return the Prisma model type directly from `prisma.model.update()`. After fixing with `tenantScopedUpdate`, the return type changes slightly:

| Repository | Current Return Type | After Fix |
|---|---|---|
| `employment-type-repository.ts` | `Promise<EmploymentType>` (from `.update()`) | `Promise<any>` (from `tenantScopedUpdate` — refetched via `findFirst`) |
| `extended-travel-rule-repository.ts` | `Promise<ExtendedTravelRule>` | `Promise<any>` |
| `holiday-repository.ts` | `Promise<Holiday>` | `Promise<any>` |
| `local-travel-rule-repository.ts` | `Promise<LocalTravelRule>` | `Promise<any>` |
| `location-repository.ts` | `Promise<Location>` | `Promise<any>` |
| `tenant-repository.ts` | `Promise<Tenant>` | Depends on fix approach (see Section 5.1) |
| `vacation-capping-rule-repository.ts` | `Promise<VacationCappingRule>` | `Promise<any>` |
| `vacation-special-calc-repository.ts` | `Promise<VacationSpecialCalculation>` | `Promise<any>` |
| `vehicle-repository.ts` | `Promise<Vehicle>` | `Promise<any>` |
| `vehicle-route-repository.ts` | `Promise<VehicleRoute>` | `Promise<any>` |

**Note:** The `tenantScopedUpdate` helper returns `Promise<any>`. All current callers (service files) use `Record<string, unknown>` or untyped access, so the `any` return type is compatible. No caller relies on strongly-typed Prisma return types from these update methods.

**None of these 10 update methods use `include` or `select` options.** They all return the plain model record. This means the fix is a simple one-liner replacement — no need to pass `include`/`select` in the options.

---

## 7. Summary of Required Changes

| File | Fix | Entity Name |
|---|---|---|
| `employment-type-repository.ts` | `tenantScopedUpdate(prisma.employmentType, { id, tenantId }, data, { entity: "EmploymentType" })` | EmploymentType |
| `extended-travel-rule-repository.ts` | `tenantScopedUpdate(prisma.extendedTravelRule, { id, tenantId }, data, { entity: "ExtendedTravelRule" })` | ExtendedTravelRule |
| `holiday-repository.ts` | `tenantScopedUpdate(prisma.holiday, { id, tenantId }, data, { entity: "Holiday" })` | Holiday |
| `local-travel-rule-repository.ts` | `tenantScopedUpdate(prisma.localTravelRule, { id, tenantId }, data, { entity: "LocalTravelRule" })` | LocalTravelRule |
| `location-repository.ts` | `tenantScopedUpdate(prisma.location, { id, tenantId }, data, { entity: "Location" })` | Location |
| `tenant-repository.ts` | Guard `id !== tenantId` + keep `prisma.tenant.update({ where: { id } })` | Tenant |
| `vacation-capping-rule-repository.ts` | `tenantScopedUpdate(prisma.vacationCappingRule, { id, tenantId }, data, { entity: "VacationCappingRule" })` | VacationCappingRule |
| `vacation-special-calc-repository.ts` | `tenantScopedUpdate(prisma.vacationSpecialCalculation, { id, tenantId }, data, { entity: "VacationSpecialCalculation" })` | VacationSpecialCalculation |
| `vehicle-repository.ts` | `tenantScopedUpdate(prisma.vehicle, { id, tenantId }, data, { entity: "Vehicle" })` | Vehicle |
| `vehicle-route-repository.ts` | `tenantScopedUpdate(prisma.vehicleRoute, { id, tenantId }, data, { entity: "VehicleRoute" })` | VehicleRoute |

Each file (except tenant-repository.ts) requires:
1. Add import: `import { tenantScopedUpdate } from "@/lib/services/prisma-helpers"`
2. Replace the `update()` body with a single `tenantScopedUpdate(...)` call

For `tenant-repository.ts`:
1. Import `TenantScopedNotFoundError` from `@/lib/services/prisma-helpers`
2. Add `id !== tenantId` guard
3. Keep the existing `prisma.tenant.update({ where: { id } })` call
