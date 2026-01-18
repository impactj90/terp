# TICKET-030: Link Users to Employees Migration

**Type**: Migration
**Effort**: XS
**Sprint**: 5 - Employees
**Dependencies**: TICKET-027, TICKET-018

## Description

Add foreign key constraint from users.employee_id to employees table.

## Files to Create

- `db/migrations/000014_link_users_employees.up.sql`
- `db/migrations/000014_link_users_employees.down.sql`

## Implementation

### Up Migration

```sql
-- Add FK constraint for users.employee_id
ALTER TABLE users
    ADD CONSTRAINT fk_users_employee
    FOREIGN KEY (employee_id)
    REFERENCES employees(id)
    ON DELETE SET NULL;

-- Add FK for departments.manager_employee_id
ALTER TABLE departments
    ADD CONSTRAINT fk_departments_manager
    FOREIGN KEY (manager_employee_id)
    REFERENCES employees(id)
    ON DELETE SET NULL;

-- Add FK for teams.leader_employee_id
ALTER TABLE teams
    ADD CONSTRAINT fk_teams_leader
    FOREIGN KEY (leader_employee_id)
    REFERENCES employees(id)
    ON DELETE SET NULL;

-- Add FK for team_members.employee_id
ALTER TABLE team_members
    ADD CONSTRAINT fk_team_members_employee
    FOREIGN KEY (employee_id)
    REFERENCES employees(id)
    ON DELETE CASCADE;
```

### Down Migration

```sql
ALTER TABLE team_members DROP CONSTRAINT IF EXISTS fk_team_members_employee;
ALTER TABLE teams DROP CONSTRAINT IF EXISTS fk_teams_leader;
ALTER TABLE departments DROP CONSTRAINT IF EXISTS fk_departments_manager;
ALTER TABLE users DROP CONSTRAINT IF EXISTS fk_users_employee;
```

## Notes

This migration adds deferred FKs that couldn't be created earlier due to table dependency order.

## Acceptance Criteria

- [x] `make migrate-up` succeeds
- [x] `make migrate-down` succeeds
- [x] All FK constraints are properly created
- [x] ON DELETE behavior is correct (SET NULL vs CASCADE)
