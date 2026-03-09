# ZMI-TICKET-314: Extract Services — Tier 2 Batch 3 (Large Routers)

Status: Todo
Priority: P1
Depends on: ZMI-TICKET-303

## Goal
Extract service + repository layers for: teams (763 lines), monthlyValues (790 lines).

## Routers (2 total)

### teams.ts (763 lines)
- Permission: `teams.read`, `teams.write`
- Model: `Team`, `TeamMember`
- **Complex features:**
  - Team CRUD with member management
  - Member roles (leader, member)
  - Add/remove/update team members
  - Team-based data scoping
  - Nested team member list with employee details
- **Repository:**
  - `findMany(prisma, tenantId, params)` — with member counts
  - `findById(prisma, tenantId, id)` — includes members with employee details
  - `create(prisma, tenantId, data)` — team + initial members
  - `update(prisma, tenantId, id, data)`
  - `delete(prisma, tenantId, id)`
  - `addMember(prisma, tenantId, teamId, data)`
  - `updateMember(prisma, tenantId, teamId, memberId, data)`
  - `removeMember(prisma, tenantId, teamId, memberId)`
- **Service:**
  - Member role validation
  - Duplicate member prevention
  - Team leader requirement (at least one)
  - Error classes: `TeamNotFoundError`, `MemberNotFoundError`, `AlreadyMemberError`, `LastLeaderError`

### monthlyValues.ts (790 lines)
- Permission: `monthly_values.read`, `monthly_values.write`
- Model: `MonthlyValue`
- **Complex features:**
  - Monthly aggregation data (calculated from daily values)
  - Month close/reopen workflow
  - Batch recalculation
  - Approval workflow
  - Employee monthly summary view
- **Repository:**
  - `findMany(prisma, tenantId, params)` — by employee, year, month
  - `findByEmployeeAndMonth(prisma, tenantId, employeeId, year, month)`
  - `upsert(prisma, tenantId, data)` — create or update monthly value
  - `closeMonth(prisma, tenantId, employeeId, year, month)`
  - `reopenMonth(prisma, tenantId, employeeId, year, month)`
  - `findMonthSummary(prisma, tenantId, year, month)` — aggregated view
- **Service:**
  - `getMonthSummary(prisma, tenantId, year, month)` — orchestrates summary
  - `closeMonth` / `reopenMonth` — status transition validation
  - `recalculateMonth(prisma, tenantId, employeeId, year, month)` — triggers monthly calc
  - Error classes: `MonthlyValueNotFoundError`, `MonthAlreadyClosedError`, `MonthNotClosedError`

## Files Created (~4)
- `src/lib/services/team-service.ts` + `team-repository.ts`
- `src/lib/services/monthly-value-service.ts` + `monthly-value-repository.ts`

## Verification
```bash
make typecheck
make test        # monthlyValues has tests
```
