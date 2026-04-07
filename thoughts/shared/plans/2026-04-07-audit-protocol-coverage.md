# Audit Protocol Coverage -- Implementation Plan

**Date:** 2026-04-07
**Status:** Ready for Implementation
**Research:** `thoughts/shared/research/2026-04-07-audit-protocol-coverage.md`

## Overview

The research identified 18 services listed as missing audit logging. Upon code review, **6 of those (Category A) already have working audit logging** -- the research document was incorrect about them being missing. The remaining **12 services (Category B) genuinely need audit logging added**. This plan covers those 12 services.

### Correction to Research Document

The research document categorized 6 services as "Category A: Imported audit-logs-service but NEVER calls auditLog.log()". Upon reading the actual code, **all 6 already have complete audit logging**:

| Service | Actual State |
|---------|-------------|
| `wh-stock-movement-service.ts` | Has audit in `bookGoodsReceipt`, `createWithdrawal`, `createBatchWithdrawal`, `cancelWithdrawal` |
| `wh-supplier-invoice-service.ts` | Has audit in `create`, `update`, `cancel`, `createPayment`, `cancelPayment` |
| `wh-withdrawal-service.ts` | Has audit in `createWithdrawal`, `createBatchWithdrawal`, `cancelWithdrawal` |
| `email-template-service.ts` | Has audit in `create`, `update`, `remove` |
| `email-smtp-config-service.ts` | Has audit in `upsert` |
| `ai-assistant-service.ts` | Has audit in `askQuestion`, `askQuestionStream` |

All routers for these services already pass AuditContext correctly.

### Actual Gap: 12 Services Need Audit Logging

These 12 services have no audit logging and need the full treatment (import, AuditContext parameter, audit calls, router updates).

---

## Implementation Phases

### Phase 1: HIGH Priority -- Legally/Security Relevant (4 services)

These services handle sensitive data where audit trails are legally required or critical for compliance.

---

#### Step 1.1: DSGVO Retention Service

**Service:** `src/lib/services/dsgvo-retention-service.ts`
**Router:** `src/trpc/routers/dsgvo.ts`

**Why critical:** Executes mass data deletion/anonymization for GDPR compliance. Rule changes and executions are legally significant.

**Functions needing audit:**

| Function | Action | entityType | Notes |
|----------|--------|-----------|-------|
| `updateRule` | `"update"` | `"dsgvo_retention_rule"` | Log rule changes (retentionMonths, action, isActive) |
| `executeRetention` | `"dsgvo_execute"` | `"dsgvo_retention"` | Log execution with results in metadata (dataType, recordCount, action, dryRun) |

**TRACKED_FIELDS:** `["retentionMonths", "action", "isActive", "description"]`

**Service changes:**
1. Add `import * as auditLog from "./audit-logs-service"` and `import type { AuditContext } from "./audit-logs-service"`
2. Add `const TRACKED_FIELDS = ["retentionMonths", "action", "isActive", "description"]`
3. Add `audit?: AuditContext` parameter to `updateRule` and `executeRetention`
4. In `updateRule`: Fetch existing rule before upsert, compute changes after, log with entityId = rule.id, entityName = rule.dataType
5. In `executeRetention`: After execution completes (not dry run), log with entityId = tenantId (bulk operation), metadata containing per-dataType results

**Router changes:**
- `dsgvo.rules.update`: Pass `{ userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }` as audit
- `dsgvo.execute`: Pass audit context, also pass into the `options.executedBy` field already present

---

#### Step 1.2: HR Personnel File Service

**Service:** `src/lib/services/hr-personnel-file-service.ts`
**Router:** `src/trpc/routers/hr/personnelFile.ts`

**Why critical:** Manages sensitive employee documents (contracts, certifications, disciplinary records). Contains confidential flag.

**Functions needing audit:**

| Function | Action | entityType | Notes |
|----------|--------|-----------|-------|
| `createCategory` | `"create"` | `"hr_personnel_file_category"` | entityName = category.name |
| `updateCategory` | `"update"` | `"hr_personnel_file_category"` | Track name, code, isActive, visibleToRoles |
| `deleteCategory` | `"delete"` | `"hr_personnel_file_category"` | entityName = existing.name |
| `createEntry` | `"create"` | `"hr_personnel_file_entry"` | entityName = entry.title |
| `updateEntry` | `"update"` | `"hr_personnel_file_entry"` | Track title, categoryId, isConfidential, entryDate |
| `deleteEntry` | `"delete"` | `"hr_personnel_file_entry"` | entityName = existing.title |

**TRACKED_FIELDS for categories:** `["name", "code", "isActive", "description", "color", "sortOrder", "visibleToRoles"]`
**TRACKED_FIELDS for entries:** `["title", "categoryId", "description", "entryDate", "expiresAt", "reminderDate", "reminderNote", "isConfidential"]`

**Service changes:**
1. Add audit imports
2. Define CATEGORY_TRACKED_FIELDS and ENTRY_TRACKED_FIELDS constants
3. Add `audit?: AuditContext` parameter to all 6 mutating functions
4. `createCategory`: already returns created entity, log after creation
5. `updateCategory`: already fetches existing, compute changes after update, log
6. `deleteCategory`: already fetches existing, log after deletion
7. `createEntry`: already returns created entity, log after creation. Note: `createEntry` also takes `createdById` so audit can follow it
8. `updateEntry`: already fetches existing, compute changes after update, log
9. `deleteEntry`: already fetches existing entry, log after deletion (before attachment cleanup)

**Router changes:**
- `categories.create`, `categories.update`, `categories.delete`: Pass AuditContext
- `entries.create`, `entries.update`, `entries.delete`: Pass AuditContext

---

#### Step 1.3: HR Personnel File Attachment Service

**Service:** `src/lib/services/hr-personnel-file-attachment-service.ts`
**Router:** `src/trpc/routers/hr/personnelFile.ts` (attachments sub-router)

**Why critical:** Upload/delete of sensitive documents (contracts, medical certificates).

**Functions needing audit:**

| Function | Action | entityType | Notes |
|----------|--------|-----------|-------|
| `confirmUpload` | `"upload"` | `"hr_personnel_file_attachment"` | entityName = filename |
| `deleteAttachment` | `"delete"` | `"hr_personnel_file_attachment"` | entityName = attachment.filename |

**Service changes:**
1. Add audit imports
2. Add `audit?: AuditContext` to `confirmUpload` and `deleteAttachment`
3. `confirmUpload`: Log after DB record created, entityId = attachment.id, entityName = filename
4. `deleteAttachment`: Log after deletion, entityId = attachmentId, entityName = attachment.filename

**Router changes:**
- `attachments.confirm`: Pass AuditContext
- `attachments.delete`: Pass AuditContext

---

#### Step 1.4: Tenant Service (Move Audit from Router to Service)

**Service:** `src/lib/services/tenant-service.ts`
**Router:** `src/trpc/routers/tenants.ts`

**Why important:** Audit is currently in the router, not the service. If the service is called from another service, audit is skipped. The inconsistency should be fixed, but the risk is LOW because tenants are only modified from the router. Marking as HIGH only for pattern consistency.

**Current state:** The router (`tenants.ts`) has audit calls for `create`, `update`, `deactivate` at lines 344-354, 495-510, 566-576. The service has no audit at all.

**Decision:** Move audit calls from router into service. This is the standard pattern. The router currently does NOT delegate CUD to the service -- it does its own Prisma operations inline. Since the service `create`, `update`, `deactivate` functions exist and ARE usable, the cleanest approach is:
1. Add `audit?: AuditContext` to service functions `create`, `update`, `deactivate`
2. Add audit log calls inside the service functions
3. Update the router to delegate to the service (it currently has duplicated logic) AND stop making its own audit calls

**However**, refactoring the router to delegate to the service is a larger change. The simpler approach:
1. Add `audit?: AuditContext` to service functions
2. Add audit log calls in the service functions
3. Leave the router as-is for now (it has its own audit calls which will still fire)
4. The service-level audit calls will only matter when the service is called from other code

**TRACKED_FIELDS:** `["name", "addressStreet", "addressZip", "addressCity", "addressCountry", "phone", "email", "payrollExportBasePath", "notes", "vacationBasis", "isActive"]`

**Service changes:**
1. Add audit imports
2. Add `const TRACKED_FIELDS = [...]`
3. Add `audit?: AuditContext` to `create`, `update`, `deactivate`
4. Add audit log calls following standard pattern

**Router changes:** None needed (already has audit calls). The service-level calls are additive safety.

---

### Phase 2: MEDIUM Priority -- Operational Completeness (5 services)

---

#### Step 2.1: Terminal Booking Service

**Service:** `src/lib/services/terminal-booking-service.ts`
**Router:** `src/trpc/routers/terminalBookings.ts`

**Functions needing audit:**

| Function | Action | entityType | Notes |
|----------|--------|-----------|-------|
| `importBookings` | `"import"` | `"terminal_import_batch"` | entityId = batch.id, metadata = { recordCount, terminalId, batchReference } |

**Service changes:**
1. Add audit imports
2. Add `audit?: AuditContext` to `importBookings`
3. After successful import (not duplicate), log with action "import", entityId = batch.id, entityName = batchReference

**Router changes:**
- `terminalBookings.import`: The router currently has its own inline import logic (not delegating to service). Since the router does its own Prisma operations, add audit calls directly in the router after the transaction succeeds. Add `import * as auditLog from "@/lib/services/audit-logs-service"`.

---

#### Step 2.2: WH Article Group Service

**Service:** `src/lib/services/wh-article-group-service.ts`
**Router:** `src/trpc/routers/warehouse/articles.ts` (groups sub-router)

**Functions needing audit:**

| Function | Action | entityType | Notes |
|----------|--------|-----------|-------|
| `create` | `"create"` | `"wh_article_group"` | entityName = name |
| `update` | `"update"` | `"wh_article_group"` | Track name, parentId, sortOrder |
| `remove` | `"delete"` | `"wh_article_group"` | entityName = existing.name |

**TRACKED_FIELDS:** `["name", "parentId", "sortOrder"]`

**Service changes:**
1. Add audit imports
2. Add `const TRACKED_FIELDS = ["name", "parentId", "sortOrder"]`
3. Add `audit?: AuditContext` to `create`, `update`, `remove`
4. `create`: Log after creation, entityId = created.id, entityName = name
5. `update`: Already fetches existing. Compute changes after update. Log.
6. `remove`: Already fetches existing. Log after deletion.

**Router changes:**
- `groups.create`, `groups.update`, `groups.delete`: Pass AuditContext

---

#### Step 2.3: WH Correction Service

**Service:** `src/lib/services/wh-correction-service.ts`
**Router:** `src/trpc/routers/warehouse/corrections.ts`

**Functions needing audit:**

| Function | Action | entityType | Notes |
|----------|--------|-----------|-------|
| `resolveMessage` | `"resolve"` | `"wh_correction_message"` | entityId = message id |
| `dismissMessage` | `"dismiss"` | `"wh_correction_message"` | entityId = message id |
| `resolveBulk` | `"resolve_bulk"` | `"wh_correction_message"` | Use logBulk for multiple messages |
| `runCorrectionChecks` | `"run_checks"` | `"wh_correction_run"` | entityId = run.id, metadata = { checksRun, issuesFound } |

**Service changes:**
1. Add audit imports
2. Add `audit?: AuditContext` to `resolveMessage`, `dismissMessage`, `resolveBulk`, `runCorrectionChecks`
3. `resolveMessage`/`dismissMessage`: Log after status update with entityName = existing.code
4. `resolveBulk`: Use `auditLog.logBulk()` for all resolved IDs
5. `runCorrectionChecks`: Log after successful run completion

**Router changes:**
- `messages.resolve`, `messages.dismiss`, `messages.resolveBulk`: Pass AuditContext
- `runs.trigger`: Pass AuditContext

---

#### Step 2.4: WH Reservation Service

**Service:** `src/lib/services/wh-reservation-service.ts`
**Router:** `src/trpc/routers/warehouse/reservations.ts`

**Functions needing audit:**

| Function | Action | entityType | Notes |
|----------|--------|-----------|-------|
| `release` | `"release"` | `"wh_reservation"` | entityId = reservation id |
| `releaseBulk` | `"release_bulk"` | `"wh_reservation"` | entityId = documentId, metadata = { releasedCount } |

Note: `createReservationsForDocument`, `releaseReservationsForDeliveryNote`, `releaseReservationsForCancel` are called internally from billing-document-service which already has its own audit logging. Adding audit to these internal calls would create duplicate entries. Only user-initiated mutations need audit.

**Service changes:**
1. Add audit imports
2. Add `audit?: AuditContext` to `release` and `releaseBulk`
3. `release`: Log after update, entityName = existing article info
4. `releaseBulk`: Log after bulk release with metadata = { releasedCount, documentId }

**Router changes:**
- `release`, `releaseBulk`: Pass AuditContext

---

#### Step 2.5: Correction Assistant Service (Message Config)

**Service:** `src/lib/services/correction-assistant-service.ts`
**Router:** `src/trpc/routers/correctionAssistant.ts`

**Functions needing audit:**

| Function | Action | entityType | Notes |
|----------|--------|-----------|-------|
| `updateMessage` | `"update"` | `"correction_message"` | Track customText, severity, isActive |

**TRACKED_FIELDS:** `["customText", "severity", "isActive"]`

**Service changes:**
1. Add audit imports
2. Add `const TRACKED_FIELDS = ["customText", "severity", "isActive"]`
3. Add `audit?: AuditContext` to `updateMessage`
4. Already fetches existing. Compute changes after update. Log with entityName = existing.code.

**Router changes:**
- `correctionAssistant.updateMessage`: Pass AuditContext

---

### Phase 3: LOW Priority -- Nice to Have (3 services)

---

#### Step 3.1: WH Article Image Service

**Service:** `src/lib/services/wh-article-image-service.ts`
**Router:** `src/trpc/routers/warehouse/articles.ts` (images sub-router)

**Functions needing audit:**

| Function | Action | entityType | Notes |
|----------|--------|-----------|-------|
| `confirmUpload` | `"upload"` | `"wh_article_image"` | entityName = filename |
| `setPrimary` | `"update"` | `"wh_article_image"` | changes = { isPrimary: true } |
| `deleteImage` | `"delete"` | `"wh_article_image"` | entityName = image.filename |

**Service changes:**
1. Add audit imports
2. Add `audit?: AuditContext` to `confirmUpload`, `setPrimary`, `deleteImage`
3. Log after each successful operation

**Router changes:**
- `images.confirm`, `images.setPrimary`, `images.delete`: Pass AuditContext

---

#### Step 3.2: CRM Correspondence Attachment Service

**Service:** `src/lib/services/crm-correspondence-attachment-service.ts`
**Router:** `src/trpc/routers/crm/correspondence.ts` (attachments sub-router)

**Functions needing audit:**

| Function | Action | entityType | Notes |
|----------|--------|-----------|-------|
| `confirmUpload` | `"upload"` | `"crm_correspondence_attachment"` | entityName = filename |
| `deleteAttachment` | `"delete"` | `"crm_correspondence_attachment"` | entityName = attachment.filename |

**Service changes:**
1. Add audit imports
2. Add `audit?: AuditContext` to `confirmUpload` and `deleteAttachment`
3. Log after each successful operation

**Router changes:**
- `attachments.confirm`, `attachments.delete`: Pass AuditContext

---

#### Step 3.3: Billing E-Invoice Service

**Service:** `src/lib/services/billing-document-einvoice-service.ts`
**Router:** `src/trpc/routers/billing/documents.ts`

**Functions needing audit:**

| Function | Action | entityType | Notes |
|----------|--------|-----------|-------|
| `generateAndStoreEInvoice` | `"generate_einvoice"` | `"billing_document"` | entityId = documentId, entityName = doc.number |

Note: The parent `billing-document-service.ts` already has extensive audit logging for document operations. This audit call is additive to specifically log e-invoice generation events.

**Service changes:**
1. Add audit imports
2. Add `audit?: AuditContext` to `generateAndStoreEInvoice`
3. Log after successful generation and storage, entityName = doc.number

**Router changes:**
- `generateEInvoice`: Pass AuditContext

---

## NOT implementing: Tenant service router refactoring

The research suggested moving audit from the router to the service for the tenant service. While this is pattern-correct, the tenant router has significant inline logic (transaction-based slug check, address validation) that would require refactoring to properly delegate to the service. This is a separate concern from audit logging.

The tenant service already gets audit calls from the router. Adding service-level audit calls would be safe but redundant when called from the router. The benefit of service-level audit is only when the service is called from other code, which does not currently happen for tenants.

**Decision:** Skip tenant service audit changes. The router-level audit is sufficient and already working.

---

## File Summary

### Services to modify (12):

| # | File | Phase | Functions |
|---|------|-------|-----------|
| 1 | `src/lib/services/dsgvo-retention-service.ts` | 1 | updateRule, executeRetention |
| 2 | `src/lib/services/hr-personnel-file-service.ts` | 1 | createCategory, updateCategory, deleteCategory, createEntry, updateEntry, deleteEntry |
| 3 | `src/lib/services/hr-personnel-file-attachment-service.ts` | 1 | confirmUpload, deleteAttachment |
| 4 | `src/lib/services/terminal-booking-service.ts` | 2 | importBookings |
| 5 | `src/lib/services/wh-article-group-service.ts` | 2 | create, update, remove |
| 6 | `src/lib/services/wh-correction-service.ts` | 2 | resolveMessage, dismissMessage, resolveBulk, runCorrectionChecks |
| 7 | `src/lib/services/wh-reservation-service.ts` | 2 | release, releaseBulk |
| 8 | `src/lib/services/correction-assistant-service.ts` | 2 | updateMessage |
| 9 | `src/lib/services/wh-article-image-service.ts` | 3 | confirmUpload, setPrimary, deleteImage |
| 10 | `src/lib/services/crm-correspondence-attachment-service.ts` | 3 | confirmUpload, deleteAttachment |
| 11 | `src/lib/services/billing-document-einvoice-service.ts` | 3 | generateAndStoreEInvoice |

### Routers to modify (9):

| # | File | Phase | Changes |
|---|------|-------|---------|
| 1 | `src/trpc/routers/dsgvo.ts` | 1 | Pass AuditContext to updateRule, executeRetention |
| 2 | `src/trpc/routers/hr/personnelFile.ts` | 1 | Pass AuditContext to 8 mutation procedures |
| 3 | `src/trpc/routers/terminalBookings.ts` | 2 | Add inline audit for import (router does its own Prisma ops) |
| 4 | `src/trpc/routers/warehouse/articles.ts` | 2+3 | Pass AuditContext to group CUD + image CUD |
| 5 | `src/trpc/routers/warehouse/corrections.ts` | 2 | Pass AuditContext to resolve, dismiss, resolveBulk, trigger |
| 6 | `src/trpc/routers/warehouse/reservations.ts` | 2 | Pass AuditContext to release, releaseBulk |
| 7 | `src/trpc/routers/correctionAssistant.ts` | 2 | Pass AuditContext to updateMessage |
| 8 | `src/trpc/routers/crm/correspondence.ts` | 3 | Pass AuditContext to attachment confirm, delete |
| 9 | `src/trpc/routers/billing/documents.ts` | 3 | Pass AuditContext to generateEInvoice |

### Total: ~32 audit log calls across 11 services and 9 routers

---

## Implementation Pattern (for each service)

```typescript
// 1. Add imports at top of service file
import * as auditLog from "./audit-logs-service"
import type { AuditContext } from "./audit-logs-service"

// 2. Define tracked fields for updates (if applicable)
const TRACKED_FIELDS = ["name", "code", "isActive"]

// 3. Add audit parameter to mutating functions
export async function create(prisma, tenantId, input, audit?: AuditContext) {
  const created = await repo.create(prisma, { ... })
  
  if (audit) {
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "create",
      entityType: "the_entity_type",
      entityId: created.id,
      entityName: created.name ?? null,
      changes: null,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }
  return created
}

// 4. For updates, compute changes
export async function update(prisma, tenantId, input, audit?: AuditContext) {
  const existing = await repo.findById(...)
  const updated = await repo.update(...)
  
  if (audit && updated) {
    const changes = auditLog.computeChanges(
      existing as unknown as Record<string, unknown>,
      updated as unknown as Record<string, unknown>,
      TRACKED_FIELDS
    )
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "update",
      entityType: "the_entity_type",
      entityId: input.id,
      entityName: updated.name ?? null,
      changes,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }
  return updated
}

// 5. Router passes AuditContext
service.create(ctx.prisma, tenantId, input, {
  userId: ctx.user!.id,
  ipAddress: ctx.ipAddress,
  userAgent: ctx.userAgent,
})
```

---

## Verification Steps

### After each phase:

1. **TypeScript check:** Run `pnpm typecheck` to verify no type errors introduced
2. **Lint check:** Run `pnpm lint` to verify no lint violations
3. **Test check:** Run `pnpm test` to verify no existing tests break
4. **Manual spot-check:** For each modified service, verify:
   - The `audit?` parameter is optional (backwards compatible)
   - The `auditLog.log()` call is inside an `if (audit)` guard
   - The `.catch()` handler is present on every log call
   - The entityType uses snake_case
   - The changes are computed for updates (not just raw data)

### Final verification:

5. **Integration test concept:** Create a test that:
   - Calls a service function WITH an AuditContext
   - Verifies an audit_logs record was created with correct entityType, action, userId
   - Calls the same function WITHOUT an AuditContext
   - Verifies NO audit_logs record was created (backwards compatible)

6. **UI verification:** Open `/admin/audit-logs` and filter by the new entityTypes to confirm entries appear correctly

---

## Risk Assessment

- **Low risk:** All changes are additive (new optional parameter, new fire-and-forget log calls)
- **No breaking changes:** The `audit?` parameter is optional; all existing callers continue to work
- **No DB changes:** Uses existing `audit_logs` table and indexes
- **Fault tolerant:** Every `auditLog.log()` call has `.catch()` and the log function itself swallows errors
