# Tenant-Scoped Update Research

**Date**: 2026-03-21
**Issue**: Repository `update()` functions use `prisma.Model.update({ where: { id } })` without including `tenantId` in the where clause, allowing cross-tenant data modification if an attacker guesses/obtains a valid record ID from another tenant.

## Summary

Across 21 repository files, **31 update calls** use `{ where: { id } }` instead of tenant-scoped where clauses. Additionally, there are **6 non-update issues** including missing tenant scope on reads, count queries, and raw SQL.

The fix pattern is: replace `prisma.Model.update({ where: { id } })` with `prisma.Model.updateMany({ where: { id, tenantId } })`, check `count > 0`, and refetch with includes if needed. Several repositories already use this pattern correctly (see Reference Patterns below).

---

## Affected Update Functions

### 1. users-repository.ts:120
- **Function**: `update(prisma, tenantId, id, data)`
- **Model**: `User` (tenantId: `String?` -- nullable)
- **Current code**:
  ```ts
  return prisma.user.update({ where: { id }, data })
  ```
- **tenantId available**: Yes, passed as parameter but unused in where clause
- **Note**: User.tenantId is nullable (`String?`). The update ignores the passed `tenantId`.

### 2. employees-repository.ts:180
- **Function**: `update(prisma, tenantId, id, data)`
- **Model**: `Employee` (tenantId: `String`)
- **Current code**:
  ```ts
  return prisma.employee.update({ where: { id }, data })
  ```
- **tenantId available**: Yes, passed as parameter but unused

### 3. bookings-repository.ts:158
- **Function**: `update(prisma, tenantId, id, data)`
- **Model**: `Booking` (tenantId: `String`)
- **Current code**:
  ```ts
  return prisma.booking.update({
    where: { id },
    data,
    include: bookingDetailInclude,
  })
  ```
- **tenantId available**: Yes, passed as parameter but unused
- **Note**: Same file already has `updateDerived()` at line 229 using the correct `updateMany({ where: { id, tenantId } })` pattern

### 4. correction-repository.ts:133 (`update`)
- **Function**: `update(prisma, tenantId, id, data)`
- **Model**: `Correction` (tenantId: `String`)
- **Current code**:
  ```ts
  return prisma.correction.update({
    where: { id },
    data,
    include: correctionInclude,
  })
  ```
- **tenantId available**: Yes, passed as parameter but unused

### 5. correction-repository.ts:157 (`updateIfStatus`)
- **Function**: `updateIfStatus(prisma, tenantId, id, expectedStatus, data)`
- **Model**: `Correction` (tenantId: `String`)
- **Current code**:
  ```ts
  return prisma.correction.update({
    where: { id },
    data,
    include: correctionInclude,
  })
  ```
- **tenantId available**: Yes, passed as parameter but unused
- **Note**: Despite the function name suggesting atomic status-checking, the actual code does not check status at all in the where clause

### 6. absences-repository.ts:284 (`update`)
- **Function**: `update(prisma, tenantId, id, data)`
- **Model**: `AbsenceDay` (tenantId: `String`)
- **Current code**:
  ```ts
  return prisma.absenceDay.update({
    where: { id },
    data,
    include: absenceDayListInclude,
  })
  ```
- **tenantId available**: Yes, passed as parameter but unused

### 7. absences-repository.ts:312 (`updateIfStatus`)
- **Function**: `updateIfStatus(prisma, tenantId, id, expectedStatus, data)`
- **Model**: `AbsenceDay` (tenantId: `String`)
- **Current code**:
  ```ts
  return prisma.absenceDay.update({
    where: { id },
    data,
    include: absenceDayListInclude,
  })
  ```
- **tenantId available**: Yes, passed as parameter but unused
- **Note**: The function does a `findFirst({ where: { id, tenantId, status: expectedStatus } })` check before the update, but the update itself is not scoped. A TOCTOU race exists: between the check and the update, a different request could modify the record.

### 8. payroll-export-repository.ts:73 (`update`)
- **Function**: `update(prisma, tenantId, id, data)`
- **Model**: `PayrollExport` (tenantId: `String`)
- **Current code**:
  ```ts
  return prisma.payrollExport.update({ where: { id }, data })
  ```
- **tenantId available**: Yes, passed as parameter but unused

### 9. reports-repository.ts:99 (`updateStatus`)
- **Function**: `updateStatus(prisma, tenantId, id, data)`
- **Model**: `Report` (tenantId: `String`)
- **Current code**:
  ```ts
  return prisma.report.update({ where: { id }, data })
  ```
- **tenantId available**: Yes, passed as parameter but unused

### 10. system-settings-repository.ts:26 (`update`)
- **Function**: `update(prisma, tenantId, id, data)`
- **Model**: `SystemSetting` (tenantId: `String`, unique)
- **Current code**:
  ```ts
  return prisma.systemSetting.update({ where: { id }, data })
  ```
- **tenantId available**: Yes, passed as parameter but unused
- **Note**: SystemSetting has a unique constraint on tenantId (one per tenant). Could use `where: { tenantId }` instead.

### 11. crm-address-repository.ts:103 (`update`)
- **Function**: `update(prisma, tenantId, id, data)`
- **Model**: `CrmAddress` (tenantId: `String`)
- **Current code**:
  ```ts
  return prisma.crmAddress.update({ where: { id }, data })
  ```
- **tenantId available**: Yes, passed as parameter but unused

### 12. crm-address-repository.ts:117 (`softDelete`)
- **Function**: `softDelete(prisma, tenantId, id)`
- **Model**: `CrmAddress` (tenantId: `String`)
- **Current code**:
  ```ts
  return prisma.crmAddress.update({
    where: { id },
    data: { isActive: false },
  })
  ```
- **tenantId available**: Yes, passed as parameter but unused

### 13. crm-address-repository.ts:128 (`restore`)
- **Function**: `restore(prisma, tenantId, id)`
- **Model**: `CrmAddress` (tenantId: `String`)
- **Current code**:
  ```ts
  return prisma.crmAddress.update({
    where: { id },
    data: { isActive: true },
  })
  ```
- **tenantId available**: Yes, passed as parameter but unused

### 14. crm-address-repository.ts:187 (`updateContact`)
- **Function**: `updateContact(prisma, tenantId, id, data)`
- **Model**: `CrmContact` (tenantId: `String`)
- **Current code**:
  ```ts
  return prisma.crmContact.update({ where: { id }, data })
  ```
- **tenantId available**: Yes, passed as parameter but unused

### 15. crm-address-repository.ts:244 (`updateBankAccount`)
- **Function**: `updateBankAccount(prisma, tenantId, id, data)`
- **Model**: `CrmBankAccount` (tenantId: `String`)
- **Current code**:
  ```ts
  return prisma.crmBankAccount.update({ where: { id }, data })
  ```
- **tenantId available**: Yes, passed as parameter but unused

### 16. user-group-repository.ts:102 (`update`)
- **Function**: `update(prisma, tenantId, id, data)`
- **Model**: `UserGroup` (tenantId: `String?` -- nullable)
- **Current code**:
  ```ts
  return prisma.userGroup.update({ where: { id }, data })
  ```
- **tenantId available**: Yes, passed as parameter but unused
- **Note**: UserGroup.tenantId is nullable (null = system-wide). Need to use `OR: [{ tenantId }, { tenantId: null }]` pattern consistent with reads, or scope only to tenant-owned groups.

### 17. notification-repository.ts:75 (`markRead`)
- **Function**: `markRead(prisma, tenantId, id)`
- **Model**: `Notification` (tenantId: `String`)
- **Current code**:
  ```ts
  return prisma.notification.update({ where: { id }, data: { readAt: new Date() } })
  ```
- **tenantId available**: Yes, passed as parameter but unused

### 18. vacation-balances-repository.ts:112 (`updateBalance`)
- **Function**: `updateBalance(prisma, balanceId, data)`
- **Model**: `VacationBalance` (tenantId: `String`)
- **Current code**:
  ```ts
  return prisma.vacationBalance.update({
    where: { id: balanceId },
    data,
    include: { employee: { select: employeeSelect } },
  })
  ```
- **tenantId available**: **No** -- not passed as parameter at all
- **Note**: This is the only update function that doesn't even receive tenantId. Callers must be updated to pass it.

### 19. terminal-booking-repository.ts:95 (`updateImportBatch`)
- **Function**: `updateImportBatch(prisma, tenantId, id, data)`
- **Model**: `ImportBatch` (tenantId: `String`)
- **Current code**:
  ```ts
  return prisma.importBatch.update({ where: { id }, data })
  ```
- **tenantId available**: Yes, passed as parameter but unused

### 20. absence-type-repository.ts:91 (`update`)
- **Function**: `update(prisma, tenantId, id, data)`
- **Model**: `AbsenceType` (tenantId: `String?` -- nullable for system types)
- **Current code**:
  ```ts
  return prisma.absenceType.update({ where: { id }, data })
  ```
- **tenantId available**: Yes, passed as parameter but unused
- **Note**: AbsenceType.tenantId is nullable (null = system type). Should scope to tenant-owned types only.

### 21. access-profile-repository.ts:54 (`update`)
- **Function**: `update(prisma, tenantId, id, data)`
- **Model**: `AccessProfile` (tenantId: `String`)
- **Current code**:
  ```ts
  return prisma.accessProfile.update({ where: { id }, data })
  ```
- **tenantId available**: Yes, passed as parameter but unused

### 22. access-zone-repository.ts:55 (`update`)
- **Function**: `update(prisma, tenantId, id, data)`
- **Model**: `AccessZone` (tenantId: `String`)
- **Current code**:
  ```ts
  return prisma.accessZone.update({ where: { id }, data })
  ```
- **tenantId available**: Yes, passed as parameter but unused

### 23. account-group-repository.ts:68 (`update`)
- **Function**: `update(prisma, tenantId, id, data)`
- **Model**: `AccountGroup` (tenantId: `String`)
- **Current code**:
  ```ts
  return prisma.accountGroup.update({ where: { id }, data })
  ```
- **tenantId available**: Yes, passed as parameter but unused

### 24. cost-center-repository.ts:67 (`update`)
- **Function**: `update(prisma, tenantId, id, data)`
- **Model**: `CostCenter` (tenantId: `String`)
- **Current code**:
  ```ts
  return prisma.costCenter.update({ where: { id }, data })
  ```
- **tenantId available**: Yes, passed as parameter but unused

### 25. order-repository.ts:96 (`update`)
- **Function**: `update(prisma, tenantId, id, data)`
- **Model**: `Order` (tenantId: `String`)
- **Current code**:
  ```ts
  return prisma.order.update({ where: { id }, data })
  ```
- **tenantId available**: Yes, passed as parameter but unused

### 26. shift-repository.ts:69 (`update`)
- **Function**: `update(prisma, tenantId, id, data)`
- **Model**: `Shift` (tenantId: `String`)
- **Current code**:
  ```ts
  return prisma.shift.update({ where: { id }, data })
  ```
- **tenantId available**: Yes, passed as parameter but unused

### 27. schedules-repository.ts:84 (`updateSchedule`)
- **Function**: `updateSchedule(prisma, tenantId, id, data)`
- **Model**: `Schedule` (tenantId: `String`)
- **Current code**:
  ```ts
  return prisma.schedule.update({ where: { id }, data })
  ```
- **tenantId available**: Yes, passed as parameter but unused

### 28. schedules-repository.ts:175 (`updateExecution`)
- **Function**: `updateExecution(prisma, tenantId, id, data)`
- **Model**: `ScheduleExecution` (tenantId: `String`)
- **Current code**:
  ```ts
  return prisma.scheduleExecution.update({ where: { id }, data })
  ```
- **tenantId available**: Yes, passed as parameter but unused

---

## Additional Non-Update Issues

### A. findUserGroupById missing tenant scope (users-repository.ts:69)
- **Function**: `findUserGroupById(prisma, id)`
- **Model**: `UserGroup`
- **Current code**:
  ```ts
  return prisma.userGroup.findUnique({
    where: { id },
  })
  ```
- **Issue**: No tenantId parameter at all. Any user could look up any user group across tenants.
- **Note**: Used during user creation/update to validate the userGroupId. Should add tenantId parameter and scope with `OR: [{ tenantId }, { tenantId: null }]` to match how user-group-repository.ts reads work.

### B. billing-document-repository.ts position queries without tenantId

**B1. findPositions (line 164)**:
```ts
export async function findPositions(prisma, documentId) {
  return prisma.billingDocumentPosition.findMany({
    where: { documentId },
    orderBy: { sortOrder: "asc" },
  })
}
```
- **Issue**: No tenantId in params or where clause. `BillingDocumentPosition` does NOT have its own `tenantId` column -- it's scoped through the parent `BillingDocument`. This is acceptable if the caller already validated the document belongs to the tenant, but fragile.

**B2. updatePosition (line 242)**:
```ts
export async function updatePosition(prisma, id, data) {
  await prisma.billingDocumentPosition.updateMany({
    where: { id },
    data,
  })
  return prisma.billingDocumentPosition.findFirst({ where: { id } })
}
```
- **Issue**: No tenant scoping at all. `BillingDocumentPosition` has no direct `tenantId`. Must scope via `document: { tenantId }` relation filter.

**B3. deletePosition (line 254)**:
```ts
export async function deletePosition(prisma, id): Promise<boolean> {
  const { count } = await prisma.billingDocumentPosition.deleteMany({
    where: { id },
  })
  return count > 0
}
```
- **Issue**: Same as B2 -- no tenant scoping.

**B4. getMaxSortOrder (line 264)**:
```ts
export async function getMaxSortOrder(prisma, documentId): Promise<number> {
  const result = await prisma.billingDocumentPosition.findFirst({
    where: { documentId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  })
  return result?.sortOrder ?? 0
}
```
- **Issue**: No tenant scope. Relies on caller having verified document ownership.

### C. daily-calc.context.ts raw SQL missing tenant_id (lines 141-155)
```sql
SELECT ad.*,
       at.portion as at_portion,
       at.priority as at_priority,
       at.code as at_code,
       cr.account_id as cr_account_id,
       cr.value as cr_value,
       cr.factor::text as cr_factor
FROM absence_days ad
LEFT JOIN absence_types at ON at.id = ad.absence_type_id
LEFT JOIN calculation_rules cr ON cr.id = at.calculation_rule_id
WHERE ad.employee_id = ${employeeId}::uuid
  AND ad.absence_date >= ${fromDate}::date
  AND ad.absence_date <= ${toDate}::date
```
- **Issue**: No `AND ad.tenant_id = ${tenantId}::uuid` condition. The `tenantId` parameter is available in the enclosing `loadEmployeeCalcContext()` function.
- **Risk**: If `employeeId` is not pre-validated to belong to the tenant, this could leak cross-tenant absence data.
- **Note**: The other queries in the same function (e.g., bookings at line 158) DO include `tenantId` in the where clause.

### D. crm-address-repository.ts countContacts/countBankAccounts without tenantId

**D1. countContacts (line 266)**:
```ts
export async function countContacts(prisma, addressId) {
  return prisma.crmContact.count({ where: { addressId } })
}
```
- **Issue**: No tenantId. `CrmContact` has `tenantId`. Should include it.

**D2. countBankAccounts (line 272)**:
```ts
export async function countBankAccounts(prisma, addressId) {
  return prisma.crmBankAccount.count({ where: { addressId } })
}
```
- **Issue**: No tenantId. `CrmBankAccount` has `tenantId`. Should include it.

---

## Prisma Schema Analysis: tenantId Field Presence

| Model | tenantId type | Notes |
|---|---|---|
| User | `String?` (nullable) | User may not belong to a tenant |
| Employee | `String` | Required |
| Booking | `String` | Required |
| Correction | `String` | Required |
| AbsenceDay | `String` | Required |
| PayrollExport | `String` | Required |
| Report | `String` | Required |
| SystemSetting | `String` (unique) | Singleton per tenant |
| CrmAddress | `String` | Required |
| CrmContact | `String` | Required |
| CrmBankAccount | `String` | Required |
| UserGroup | `String?` (nullable) | null = system-wide group |
| Notification | `String` | Required |
| VacationBalance | `String` | Required |
| ImportBatch | `String` | Required |
| AbsenceType | `String?` (nullable) | null = system type |
| AccessProfile | `String` | Required |
| AccessZone | `String` | Required |
| AccountGroup | `String` | Required |
| CostCenter | `String` | Required |
| Order | `String` | Required |
| Shift | `String` | Required |
| Schedule | `String` | Required |
| ScheduleExecution | `String` | Required |
| ScheduleTaskExecution | **No tenantId** | Scoped via relation `execution.tenantId` |
| ScheduleTask | **No tenantId** | Scoped via relation `schedule.tenantId` |
| BillingDocumentPosition | **No tenantId** | Scoped via relation `document.tenantId` |

---

## Existing Reference Patterns (Correctly Tenant-Scoped Updates)

### Pattern A: updateMany + count check + refetch (preferred for models with includes)
File: `src/lib/services/group-repository.ts:121-131`
```ts
export async function update(prisma, tenantId, type, id, data) {
  const delegate = getGroupDelegate(prisma, type)
  await delegate.updateMany({ where: { id, tenantId }, data })
  return delegate.findFirst({ where: { id, tenantId } })
}
```

### Pattern B: updateMany with count check and error
File: `src/lib/services/export-interface-repository.ts:88-100`
```ts
const { count } = await prisma.exportInterface.updateMany({
  where: { id, tenantId },
  data,
})
if (count === 0) throw new NotFoundError(...)
return prisma.exportInterface.findFirst({ where: { id, tenantId }, include: ... })
```

### Pattern C: updateMany for simple updates (no refetch needed)
File: `src/lib/services/bookings-repository.ts:228-233` (updateDerived)
```ts
await prisma.booking.updateMany({
  where: { id, tenantId },
  data,
})
```

### Pattern D: Relation-scoped updateMany (for models without direct tenantId)
File: `src/lib/services/schedules-repository.ts:129-143` (updateTask)
```ts
const { count } = await prisma.scheduleTask.updateMany({
  where: { id: taskId, schedule: { tenantId } },
  data,
})
if (count === 0) return null
return prisma.scheduleTask.findFirst({ where: { id: taskId, schedule: { tenantId } } })
```

---

## Edge Cases and Considerations

1. **Nullable tenantId models** (User, UserGroup, AbsenceType): These need special handling. For UserGroup and AbsenceType, the read pattern uses `OR: [{ tenantId }, { tenantId: null }]`. Updates should only be allowed on tenant-owned records (not system records with null tenantId), so the update where clause should use `{ id, tenantId }` (excluding system records).

2. **SystemSetting singleton**: Since `tenantId` is unique on SystemSetting, the update could alternatively use `prisma.systemSetting.update({ where: { tenantId } })` instead of by id. However, the updateMany pattern is still safer.

3. **BillingDocumentPosition**: Has no direct `tenantId` column. Must scope through the document relation: `{ id, document: { tenantId } }` in updateMany.

4. **vacation-balances-repository.ts**: The `updateBalance()` function doesn't even accept `tenantId` as a parameter. The function signature needs to change, and all callers need to be updated to pass it.

5. **absences-repository.ts updateIfStatus**: The current implementation has a TOCTOU (time-of-check-time-of-use) race condition. The `findFirst` check and the `update` are not atomic. Should be replaced with a single `updateMany({ where: { id, tenantId, status: expectedStatus } })` call.

6. **correction-repository.ts updateIfStatus**: Same TOCTOU issue -- but even worse, the current code doesn't check status at all in the update. The `expectedStatus` parameter is completely unused.

7. **No existing tenantScopedUpdate helper**: There is no reusable helper function in the codebase. One should be created in a shared location (e.g., `src/lib/services/prisma-helpers.ts` or `src/lib/db/tenant-scoped.ts`).

8. **Return type changes**: `prisma.Model.update()` returns the updated record. `prisma.Model.updateMany()` returns `{ count: number }`. Functions that need to return the updated record (especially those with `include`) will need a refetch step after updateMany.

---

## Proposed Helper Function

```ts
// src/lib/services/prisma-helpers.ts

/**
 * Tenant-scoped update: uses updateMany with {id, tenantId} to prevent
 * cross-tenant writes, then refetches the record.
 * Throws NotFoundError if no row matched (wrong tenant or missing record).
 */
export async function tenantScopedUpdate<T>(
  delegate: {
    updateMany: (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => Promise<{ count: number }>
    findFirst: (args: { where: Record<string, unknown>; include?: unknown }) => Promise<T | null>
  },
  where: { id: string; tenantId: string } & Record<string, unknown>,
  data: Record<string, unknown>,
  include?: unknown,
): Promise<T> {
  const { count } = await delegate.updateMany({ where, data })
  if (count === 0) {
    throw new NotFoundError("Record not found")
  }
  const result = await delegate.findFirst({ where, include })
  if (!result) {
    throw new NotFoundError("Record not found after update")
  }
  return result
}
```

---

## File Count Summary

| Category | Count |
|---|---|
| Repository update() functions to fix | 28 |
| Additional read/count scope issues | 6 |
| **Total locations to fix** | **34** |
| Files affected | 21 repository files + 1 context file |
