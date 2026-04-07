# Audit Protocol Coverage Analysis

**Date:** 2026-04-07
**Status:** Research Complete

## 1. How the Audit System Works

### Schema (Prisma model: `AuditLog`, DB table: `audit_logs`)

| Column       | Type           | Description                              |
|-------------|----------------|------------------------------------------|
| id          | UUID (PK)      | Auto-generated                           |
| tenantId    | UUID           | No FK constraint (cross-tenant safe)     |
| userId      | UUID (nullable)| FK to users(id) ON DELETE SET NULL       |
| action      | VARCHAR(20)    | "create", "update", "delete", etc.       |
| entityType  | VARCHAR(100)   | e.g. "department", "employee", "booking" |
| entityId    | UUID           | ID of the affected entity                |
| entityName  | TEXT (nullable)| Human-readable name of the entity        |
| changes     | JSONB (nullable)| Diff: `{ field: { old: X, new: Y } }`  |
| metadata    | JSONB (nullable)| Extra context (e.g. batch info)          |
| ipAddress   | TEXT (nullable)| Request IP                               |
| userAgent   | TEXT (nullable)| Browser user agent                       |
| performedAt | TIMESTAMPTZ    | Defaults to now()                        |

**Indexes:** tenant, user, entity(type+id), action, performedAt, tenant+performedAt composite.

### Core Files

- **Service:** `src/lib/services/audit-logs-service.ts`
- **Repository:** `src/lib/services/audit-logs-repository.ts`
- **Router:** `src/trpc/routers/auditLogs.ts`
- **UI:** `src/app/[locale]/(dashboard)/admin/audit-logs/page.tsx`
- **UI Components:** `src/components/audit-logs/`
- **Hook:** `src/hooks/use-audit-logs.ts`
- **Migration:** `supabase/migrations/20260101000041_create_audit_logs.sql`

### Mechanism

1. **Writing entries:** Services call `auditLog.log(prisma, data)` or `auditLog.logBulk(prisma, data[])`.
2. **Fire-and-forget:** The `log()` function catches all errors internally -- audit failures never block business operations. Callers also use `.catch()` as defense-in-depth.
3. **Change tracking:** For updates, services use `auditLog.computeChanges(before, after, trackedFields)` to compute a JSON diff of `{ field: { old, new } }`.
4. **AuditContext:** An interface `{ userId, ipAddress?, userAgent? }` passed from routers to services.
5. **tRPC context:** `ctx.ipAddress` and `ctx.userAgent` are extracted from request headers in `src/trpc/init.ts`.

### Standard Pattern (used by ~72 services)

```typescript
// In service file:
import * as auditLog from "./audit-logs-service"
import type { AuditContext } from "./audit-logs-service"

const TRACKED_FIELDS = ["name", "code", "isActive"]

export async function create(prisma, tenantId, input, audit?: AuditContext) {
  const created = await repo.create(prisma, { ... })
  
  if (audit) {
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "create",
      entityType: "department",
      entityId: created.id,
      entityName: created.name ?? null,
      changes: null,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }
  return created
}

export async function update(prisma, tenantId, input, audit?: AuditContext) {
  const existing = await repo.findById(...)
  const updated = await repo.update(...)
  
  if (audit && updated) {
    const changes = auditLog.computeChanges(
      existing as Record<string, unknown>,
      updated as Record<string, unknown>,
      TRACKED_FIELDS
    )
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "update",
      entityType: "department",
      entityId: input.id,
      entityName: updated.name ?? null,
      changes,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }
  return updated
}

// In router file:
departmentService.create(ctx.prisma, tenantId, input, {
  userId: ctx.user!.id,
  ipAddress: ctx.ipAddress,
  userAgent: ctx.userAgent,
})
```

---

## 2. Services WITH Audit Logging (Complete -- 81 services)

All of these services have `auditLog.log()` or `auditLog.logBulk()` calls in their create/update/delete functions:

### Core Business (Time & Attendance)
| Service | File | Notes |
|---------|------|-------|
| Bookings | `src/lib/services/bookings-service.ts` | create, update, delete |
| Absences | `src/lib/services/absences-service.ts` | logBulk for batch |
| Daily Values | `src/lib/services/daily-value-service.ts` | recalculation |
| Monthly Values | `src/lib/services/monthly-values-service.ts` | close/reopen |
| Corrections | `src/lib/services/correction-service.ts` | all correction types |
| Order Bookings | `src/lib/services/order-booking-service.ts` | CUD |
| Vacation | `src/lib/services/vacation-service.ts` | create, approve, cancel, logBulk |
| Vacation Balances | `src/lib/services/vacation-balances-service.ts` | adjustments |
| Payroll Export | `src/lib/services/payroll-export-service.ts` | export, lock |

### Employee Management
| Service | File | Notes |
|---------|------|-------|
| Employees | `src/lib/services/employees-service.ts` | create, update, logBulk for batch deactivate |
| Employee Cards | `src/lib/services/employee-cards-service.ts` | CUD |
| Employee Contacts | `src/lib/services/employee-contacts-service.ts` | CUD |
| Employee Day Plans | `src/lib/services/employee-day-plans-service.ts` | assign, reassign, delete |
| Employee Tariff Assignment | `src/lib/services/employee-tariff-assignment-service.ts` | CUD |
| Employee Access Assignment | `src/lib/services/employee-access-assignment-service.ts` | CUD |
| Employee Capping Exception | `src/lib/services/employee-capping-exception-service.ts` | CUD |

### Users & Permissions
| Service | File | Notes |
|---------|------|-------|
| Users | `src/lib/services/users-service.ts` | create, update, deactivate, reactivate |
| User Groups | `src/lib/services/user-group-service.ts` | CUD |

### Billing / Invoicing
| Service | File | Notes |
|---------|------|-------|
| Billing Documents | `src/lib/services/billing-document-service.ts` | 11 calls -- create, finalize, forward, cancel, etc. |
| Billing Document PDF | `src/lib/services/billing-document-pdf-service.ts` | generate |
| Billing Payments | `src/lib/services/billing-payment-service.ts` | record, update, delete |
| Billing Service Cases | `src/lib/services/billing-service-case-service.ts` | CUD + status changes |
| Billing Recurring Invoices | `src/lib/services/billing-recurring-invoice-service.ts` | CUD + execute |
| Billing Price Lists | `src/lib/services/billing-price-list-service.ts` | CUD + items |
| Billing Tenant Config | `src/lib/services/billing-tenant-config-service.ts` | update |
| Billing Document Templates | `src/lib/services/billing-document-template-service.ts` | CUD |

### Email
| Service | File | Notes |
|---------|------|-------|
| Email Send | `src/lib/services/email-send-service.ts` | send, retry |

### CRM
| Service | File | Notes |
|---------|------|-------|
| CRM Addresses | `src/lib/services/crm-address-service.ts` | 12 calls -- CUD + contacts + banking |
| CRM Correspondence | `src/lib/services/crm-correspondence-service.ts` | CUD |
| CRM Inquiries | `src/lib/services/crm-inquiry-service.ts` | CUD + status changes |
| CRM Tasks | `src/lib/services/crm-task-service.ts` | CUD + status changes |

### Warehouse
| Service | File | Notes |
|---------|------|-------|
| WH Articles | `src/lib/services/wh-article-service.ts` | CUD + activate/deactivate |
| WH Article Prices | `src/lib/services/wh-article-price-service.ts` | CUD + supplier prices |
| WH Purchase Orders | `src/lib/services/wh-purchase-order-service.ts` | 8 calls -- CUD + status + receive |

### Configuration / Reference Data
| Service | File | Notes |
|---------|------|-------|
| Departments | `src/lib/services/department-service.ts` | CUD |
| Teams | `src/lib/services/teams-service.ts` | CUD |
| Locations | `src/lib/services/location-service.ts` | CUD |
| Holidays | `src/lib/services/holiday-service.ts` | CUD |
| Accounts | `src/lib/services/account-service.ts` | CUD |
| Account Groups | `src/lib/services/account-group-service.ts` | CUD |
| Activities | `src/lib/services/activity-service.ts` | CUD |
| Groups | `src/lib/services/group-service.ts` | CUD |
| Shifts | `src/lib/services/shift-service.ts` | CUD |
| Cost Centers | `src/lib/services/cost-center-service.ts` | CUD |
| Employment Types | `src/lib/services/employment-type-service.ts` | CUD |
| Booking Types | `src/lib/services/booking-type-service.ts` | CUD |
| Booking Type Groups | `src/lib/services/booking-type-group-service.ts` | CUD |
| Booking Reasons | `src/lib/services/booking-reason-service.ts` | CUD |
| Contact Types | `src/lib/services/contact-type-service.ts` | CUD |
| Contact Kinds | `src/lib/services/contact-kind-service.ts` | CUD |
| Absence Types | `src/lib/services/absence-type-service.ts` | CUD |
| Absence Type Groups | `src/lib/services/absence-type-group-service.ts` | CUD |
| Access Profiles | `src/lib/services/access-profile-service.ts` | CUD |
| Access Zones | `src/lib/services/access-zone-service.ts` | CUD |
| Day Plans | `src/lib/services/day-plans-service.ts` | CUD |
| Week Plans | `src/lib/services/week-plan-service.ts` | CUD |
| Calculation Rules | `src/lib/services/calculation-rule-service.ts` | CUD |
| Tariffs | `src/lib/services/tariffs-service.ts` | CUD + tiers |
| Export Interfaces | `src/lib/services/export-interface-service.ts` | CUD |
| Macros | `src/lib/services/macros-service.ts` | CUD + entries |
| Monthly Eval Templates | `src/lib/services/monthly-eval-template-service.ts` | CUD |
| Orders | `src/lib/services/order-service.ts` | CUD |
| Order Assignments | `src/lib/services/order-assignment-service.ts` | CUD |
| Schedules | `src/lib/services/schedules-service.ts` | CUD + executions |
| Vehicles | `src/lib/services/vehicle-service.ts` | CUD |
| Vehicle Routes | `src/lib/services/vehicle-route-service.ts` | CUD |
| Trip Records | `src/lib/services/trip-record-service.ts` | CUD |
| Travel Allowance Rule Sets | `src/lib/services/travel-allowance-rule-set-service.ts` | CUD |
| Local Travel Rules | `src/lib/services/local-travel-rule-service.ts` | CUD |
| Extended Travel Rules | `src/lib/services/extended-travel-rule-service.ts` | CUD |
| Vacation Calc Groups | `src/lib/services/vacation-calc-group-service.ts` | CUD |
| Vacation Capping Rule Groups | `src/lib/services/vacation-capping-rule-group-service.ts` | CUD |
| Vacation Capping Rules | `src/lib/services/vacation-capping-rule-service.ts` | CUD |
| Vacation Special Calc | `src/lib/services/vacation-special-calc-service.ts` | CUD |
| Number Sequences | `src/lib/services/number-sequence-service.ts` | increment only |
| Notifications | `src/lib/services/notification-service.ts` | mark-read |
| Reports | `src/lib/services/reports-service.ts` | generate, delete |
| System Settings | `src/lib/services/system-settings-service.ts` | update |
| Tenant Modules | `src/lib/services/tenant-module-service.ts` | enable, disable |

### Router-Level Audit (audit calls in tRPC router, not service)
| Router | File | Notes |
|--------|------|-------|
| Tenants | `src/trpc/routers/tenants.ts` | create, update, deactivate |
| Vehicles | `src/trpc/routers/vehicles.ts` | bulk assign |
| Week Plans | `src/trpc/routers/weekPlans.ts` | batch assignment |
| Trip Records | `src/trpc/routers/tripRecords.ts` | batch delete |
| Order Bookings | `src/trpc/routers/orderBookings.ts` | batch operations |
| Extended Travel Rules | `src/trpc/routers/extendedTravelRules.ts` | batch operations |
| Export Interfaces | `src/trpc/routers/exportInterfaces.ts` | batch operations |

---

## 3. Services MISSING Audit Logging (Critical Findings)

### Category A: Imported audit-logs-service but NEVER calls auditLog.log() (6 services)

These services were clearly **intended** to have audit logging (they import the service and AuditContext type) but the actual calls were never implemented. This is the highest priority gap.

| # | Service | File | Why Audit is Required |
|---|---------|------|-----------------------|
| 1 | **WH Stock Movements** | `src/lib/services/wh-stock-movement-service.ts` | Creates inventory movements (goods receipt, adjustments, cancellations). Critical financial and stock tracking data. Affects article stock levels. |
| 2 | **WH Supplier Invoices** | `src/lib/services/wh-supplier-invoice-service.ts` | Manages supplier invoices (Lieferantenrechnungen). Financial documents with payment tracking. Creates/updates/deletes invoices and payment records. |
| 3 | **WH Withdrawals** | `src/lib/services/wh-withdrawal-service.ts` | Manages stock withdrawals (Lagerentnahmen). Reduces inventory, creates stock movements. Supports batch withdrawal and cancellation (reversal). |
| 4 | **Email Templates** | `src/lib/services/email-template-service.ts` | CRUD for email templates. Templates can be customized per tenant. Changes affect all outgoing emails. |
| 5 | **Email SMTP Config** | `src/lib/services/email-smtp-config-service.ts` | Manages SMTP server credentials and configuration. Security-sensitive (contains passwords). Changes affect email delivery. |
| 6 | **AI Assistant** | `src/lib/services/ai-assistant-service.ts` | AI chat conversations. Records user queries to AI system. May contain sensitive employee/business data in prompts. |

### Category B: No audit import at all -- Audit-Relevant Services (14 services)

| # | Service | File | Why Audit is Required | Priority |
|---|---------|------|-----------------------|----------|
| 7 | **Tenant Service** | `src/lib/services/tenant-service.ts` | Creates/updates/deactivates tenants. NOTE: The **router** (`tenants.ts`) has audit calls for create/update/deactivate, but the **service** itself does not. This is inconsistent with the pattern -- if the service is ever called from another service, audit would be skipped. | HIGH |
| 8 | **DSGVO Retention Service** | `src/lib/services/dsgvo-retention-service.ts` | **Executes mass data deletion/anonymization** for GDPR compliance. Rule changes and execution events are legally significant. Has its own delete log table but no audit trail for rule changes. | HIGH |
| 9 | **HR Personnel File Service** | `src/lib/services/hr-personnel-file-service.ts` | Manages personnel file categories, entries (with confidential flag), reminders. Contains sensitive employee documents (contracts, certifications, disciplinary records). CUD operations on categories and entries. | HIGH |
| 10 | **HR Personnel File Attachment Service** | `src/lib/services/hr-personnel-file-attachment-service.ts` | Upload/delete file attachments on personnel files. Sensitive documents (contracts, medical certificates). | HIGH |
| 11 | **Terminal Booking Service** | `src/lib/services/terminal-booking-service.ts` | Imports terminal bookings in batches. Creates raw booking records from hardware terminals. Import operations and batch processing. | MEDIUM |
| 12 | **WH Article Group Service** | `src/lib/services/wh-article-group-service.ts` | Manages article group hierarchy (create, update, delete, reorder). Organizational structure for warehouse. | MEDIUM |
| 13 | **WH Correction Service** | `src/lib/services/wh-correction-service.ts` | Resolves and dismisses warehouse correction messages. Tracks who resolved/dismissed inventory issues. | MEDIUM |
| 14 | **WH Reservation Service** | `src/lib/services/wh-reservation-service.ts` | Creates and releases stock reservations. Affects available inventory. Manual release operations. | MEDIUM |
| 15 | **WH Article Image Service** | `src/lib/services/wh-article-image-service.ts` | Upload/delete article images, set primary, reorder. Content management for warehouse. | LOW |
| 16 | **CRM Correspondence Attachment Service** | `src/lib/services/crm-correspondence-attachment-service.ts` | Upload/delete CRM correspondence attachments. Business document management. | LOW |
| 17 | **Correction Assistant Service** | `src/lib/services/correction-assistant-service.ts` | Updates correction message templates (customText, severity, isActive). Configuration changes. | LOW |
| 18 | **Billing E-Invoice Service** | `src/lib/services/billing-document-einvoice-service.ts` | Generates and stores e-invoice XML (Factur-X/ZUGFeRD). Financial document generation. The parent billing-document-service already logs most operations. | LOW |

### Category C: Read-Only or Computation Services (No Audit Needed)

These services correctly have no audit logging because they only read data or perform calculations:

| Service | File | Reason |
|---------|------|--------|
| Auth Service | `src/lib/services/auth-service.ts` | Read-only: getMe, getPermissions, logout |
| Evaluations Service | `src/lib/services/evaluations-service.ts` | Read-only: query/list daily values, bookings, logs |
| CRM Report Service | `src/lib/services/crm-report-service.ts` | Read-only: aggregate statistics and reporting |
| Daily Account Values Service | `src/lib/services/daily-account-values-service.ts` | Read-only: list and summarize account values |
| Travel Allowance Preview Service | `src/lib/services/travel-allowance-preview-service.ts` | Read-only: calculation preview, no state changes |
| WH QR Service | `src/lib/services/wh-qr-service.ts` | Read-only: QR code generation and resolution, PDF labels |
| WH Purchase Order PDF Service | `src/lib/services/wh-purchase-order-pdf-service.ts` | Side-effect: sets printedAt, but parent PO service already has audit coverage |

---

## 4. Summary of Gaps

### By Priority

**HIGH (must fix -- legally or security relevant):**
1. `wh-stock-movement-service.ts` -- Import exists, calls missing (financial/inventory)
2. `wh-supplier-invoice-service.ts` -- Import exists, calls missing (financial)
3. `wh-withdrawal-service.ts` -- Import exists, calls missing (inventory)
4. `email-smtp-config-service.ts` -- Import exists, calls missing (security: credentials)
5. `dsgvo-retention-service.ts` -- No import at all (GDPR mass deletion)
6. `hr-personnel-file-service.ts` -- No import at all (sensitive employee data)
7. `hr-personnel-file-attachment-service.ts` -- No import at all (sensitive documents)

**MEDIUM (should fix -- operational completeness):**
8. `email-template-service.ts` -- Import exists, calls missing
9. `ai-assistant-service.ts` -- Import exists, calls missing
10. `terminal-booking-service.ts` -- No import at all (data import operations)
11. `wh-article-group-service.ts` -- No import at all (organizational structure)
12. `wh-correction-service.ts` -- No import at all (issue resolution tracking)
13. `wh-reservation-service.ts` -- No import at all (stock allocation)
14. `tenant-service.ts` -- Audit in router only, should also be in service

**LOW (nice to have):**
15. `wh-article-image-service.ts` -- Content management
16. `crm-correspondence-attachment-service.ts` -- Document management
17. `correction-assistant-service.ts` -- Configuration messages
18. `billing-document-einvoice-service.ts` -- Partially covered by parent service

### Total Gap: 18 services need audit logging added (7 HIGH, 7 MEDIUM, 4 LOW)

---

## 5. Implementation Pattern Reference

For each service that needs audit logging, follow this exact pattern:

### Step 1: Add import (if not already present)
```typescript
import * as auditLog from "./audit-logs-service"
import type { AuditContext } from "./audit-logs-service"
```

### Step 2: Define tracked fields for updates
```typescript
const TRACKED_FIELDS = ["name", "code", "status", "isActive"]
```

### Step 3: Add `audit?: AuditContext` parameter to mutating functions
```typescript
export async function create(prisma, tenantId, input, audit?: AuditContext) {
```

### Step 4: Add audit log call after the mutation succeeds
```typescript
if (audit) {
  await auditLog.log(prisma, {
    tenantId,
    userId: audit.userId,
    action: "create",          // "create" | "update" | "delete" | domain-specific
    entityType: "wh_stock_movement",  // snake_case entity name
    entityId: created.id,
    entityName: null,           // or a human-readable identifier
    changes: null,              // null for creates, computeChanges() for updates
    ipAddress: audit.ipAddress,
    userAgent: audit.userAgent,
  }).catch(err => console.error('[AuditLog] Failed:', err))
}
```

### Step 5: For updates, compute changes
```typescript
if (audit && updated) {
  const changes = auditLog.computeChanges(
    existing as unknown as Record<string, unknown>,
    updated as unknown as Record<string, unknown>,
    TRACKED_FIELDS
  )
  await auditLog.log(prisma, { ...data, changes })
    .catch(err => console.error('[AuditLog] Failed:', err))
}
```

### Step 6: Update the router to pass AuditContext
```typescript
service.create(ctx.prisma, tenantId, input, {
  userId: ctx.user!.id,
  ipAddress: ctx.ipAddress,
  userAgent: ctx.userAgent,
})
```

### Step 7: For bulk operations, use `auditLog.logBulk()`
```typescript
await auditLog.logBulk(prisma, items.map(item => ({
  tenantId,
  userId: audit.userId,
  action: "create",
  entityType: "wh_stock_movement",
  entityId: item.id,
  entityName: null,
  ipAddress: audit.ipAddress,
  userAgent: audit.userAgent,
})))
```
