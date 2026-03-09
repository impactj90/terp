# ZMI-TICKET-305: Extract Services — Tier 4 Batch 2 (Small Routers)

Status: Todo
Priority: P1
Depends on: ZMI-TICKET-303

## Goal
Extract service + repository layers for: employeeContacts, employeeCards, employeeMessages, travelAllowancePreview, vacationBalances.

## Pattern
Same as TICKET-304. For each router:
1. Create `src/lib/services/{domain}-repository.ts` (Prisma queries)
2. Create `src/lib/services/{domain}-service.ts` (business logic + errors)
3. Rewrite router as thin wrapper with `handleServiceError`
4. Move router to `src/trpc/routers/`

## Routers

### employeeContacts.ts
- CRUD for employee contact information
- Repository: `findMany`, `findById`, `create`, `update`, `delete` (all scoped by employeeId + tenantId)
- Service: validation, employee existence check

### employeeCards.ts
- CRUD for employee card assignments (badges, etc.)
- Repository: standard CRUD scoped by employeeId + tenantId
- Service: card number uniqueness validation

### employeeMessages.ts
- List/send messages for employees
- Repository: `findMany`, `create`, `markAsRead`
- Service: recipient validation, message delivery logic

### travelAllowancePreview.ts
- Single preview calculation endpoint
- Repository: fetch employee + trip records + rule sets
- Service: calculate travel allowance preview using existing calculation lib

### vacationBalances.ts
- CRUD for vacation balance entries
- Repository: `findMany`, `findById`, `create`, `update`, `delete` (scoped by tenantId)
- Service: balance validation, date range checks

## For Each Router — Checklist
- [ ] Create repository file
- [ ] Create service file with error classes
- [ ] Rewrite router as thin wrapper
- [ ] Move to `src/trpc/routers/`
- [ ] Update `_app.ts` import
- [ ] Delete old file
- [ ] Run `make typecheck`

## Files Created (~10)
- `src/lib/services/employee-contact-service.ts` + repository
- `src/lib/services/employee-card-service.ts` + repository
- `src/lib/services/employee-message-service.ts` + repository
- `src/lib/services/travel-allowance-preview-service.ts` + repository
- `src/lib/services/vacation-balance-service.ts` + repository

## Verification
```bash
make typecheck
make test
```
