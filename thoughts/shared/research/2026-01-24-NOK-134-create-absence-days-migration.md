---
date: 2026-01-24T12:00:00+01:00
researcher: Claude
git_commit: bd01b0c
branch: master
repository: terp
topic: "NOK-134: Create Absence Days Migration"
tags: [research, codebase, migration, absence-days, absence-types]
status: complete
last_updated: 2026-01-24
last_updated_by: Claude
---

# Research: NOK-134 - Create Absence Days Migration

**Date**: 2026-01-24
**Git Commit**: bd01b0c
**Branch**: master
**Repository**: terp

## Research Question
What is the current state of the codebase relevant to implementing NOK-134 (TICKET-076: Create Absence Days Migration)?

## Summary

Migration 000026 does not yet exist. The next migration to create is `000026_create_absence_days`. The dependency migration `000025_create_absence_types` is already in place with the expected schema including the `id` column that `absence_days.absence_type_id` will reference. The plan in `thoughts/shared/plans/tickets/TICKET-076-create-absence-days-migration.md` contains the complete SQL for both up and down migrations.

## Detailed Findings

### Current Migration State
- Highest existing migration: **000025** (`create_absence_types`)
- Next available number: **000026**
- Total migrations: 25 files (000001 through 000025)

### Dependencies (Already Satisfied)
1. **TICKET-074 (Absence Types)** - Migration 000025 exists with the `absence_types` table containing the `id` UUID column that `absence_days.absence_type_id` will reference
2. **TICKET-027 (Employees)** - Migration 000011 exists with the `employees` table containing `id` UUID column referenced by `absence_days.employee_id`
3. **Tenants** - Migration 000002 exists with `tenants` table referenced by `absence_days.tenant_id`
4. **Users** - Migration 000001 exists with `users` table referenced by `absence_days.approved_by` and `created_by`

### Files to Create
- `db/migrations/000026_create_absence_days.up.sql`
- `db/migrations/000026_create_absence_days.down.sql`

### Table Schema (from plan)
The `absence_days` table tracks employee absences per day with:
- UUID primary key with `gen_random_uuid()`
- Multi-tenant with `tenant_id` FK to tenants (CASCADE delete)
- `employee_id` FK to employees (CASCADE delete)
- `absence_date` DATE for the date of absence
- `absence_type_id` FK to absence_types (no cascade, just reference)
- `duration` DECIMAL(3,2) for day portion (1.0=full, 0.5=half)
- `half_day_period` VARCHAR(10) for morning/afternoon
- Status workflow: pending, approved, rejected, cancelled
- Approval fields: `approved_by`, `approved_at`, `rejection_reason`
- Audit: `created_by`, `created_at`, `updated_at`

### Unique Constraint Pattern
Uses a partial unique index to prevent duplicate absences per employee per date, excluding cancelled ones:
```sql
CREATE UNIQUE INDEX idx_absence_days_unique ON absence_days(employee_id, absence_date)
    WHERE status != 'cancelled';
```

### Trigger Pattern
Uses the `update_updated_at_column()` function defined in migration 000001, consistent with migrations 000025 (absence_types).

### Credit Calculation Context
The absence day's `duration` field works together with `absence_type.portion`:
```
effectiveCredit = regelarbeitszeit * absenceType.portion * absenceDay.duration
```

## Code References
- `db/migrations/000025_create_absence_types.up.sql` - Dependency table, already applied
- `db/migrations/000001_create_users.up.sql:22` - `update_updated_at_column()` function definition
- `db/migrations/000011_create_employees.up.sql` - Employees table (dependency)
- `thoughts/shared/plans/tickets/TICKET-076-create-absence-days-migration.md` - Complete implementation plan

## Architecture Documentation

### Migration Patterns in This Codebase
1. **UUIDs**: All PKs use `UUID PRIMARY KEY DEFAULT gen_random_uuid()`
2. **Multi-tenancy**: `tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE`
3. **Timestamps**: `created_at TIMESTAMPTZ DEFAULT NOW()`, `updated_at TIMESTAMPTZ DEFAULT NOW()`
4. **Triggers**: Reuse the shared `update_updated_at_column()` function from migration 000001
5. **Indexes**: Standard pattern of tenant index + lookup indexes + partial indexes for filtered queries
6. **Comments**: `COMMENT ON TABLE/COLUMN` for documentation
7. **Down migrations**: `DROP TRIGGER IF EXISTS ... ; DROP TABLE IF EXISTS ...`

### Recent Migration Pattern (000022-000025)
- Migrations 000022 and 000023 do NOT use the updated_at trigger
- Migration 000025 DOES use the updated_at trigger
- The plan for 000026 includes the trigger, following the 000025 pattern

## Historical Context (from thoughts/)
- `thoughts/shared/plans/tickets/TICKET-076-create-absence-days-migration.md` - Complete implementation plan with SQL
- `thoughts/shared/plans/tickets/TICKET-074-create-absence-types-migration.md` - Dependency ticket plan (implemented)

## Open Questions
None - the plan is complete and all dependencies are satisfied.
