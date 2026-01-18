# TICKET-025: Create Teams Migration

**Type**: Migration
**Effort**: XS
**Sprint**: 4 - Organization Structure
**Dependencies**: TICKET-021

## Description

Create the teams and team_members tables.

## Files to Create

- `db/migrations/000010_create_teams.up.sql`
- `db/migrations/000010_create_teams.down.sql`

## Implementation

### Up Migration

```sql
CREATE TABLE teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    leader_employee_id UUID, -- FK added later after employees table
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, name)
);

CREATE TABLE team_members (
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL, -- FK added later after employees table
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    role VARCHAR(50) DEFAULT 'member', -- 'member', 'lead', 'deputy'
    PRIMARY KEY (team_id, employee_id)
);

CREATE INDEX idx_teams_tenant ON teams(tenant_id);
CREATE INDEX idx_teams_department ON teams(department_id);
CREATE INDEX idx_team_members_employee ON team_members(employee_id);
```

### Down Migration

```sql
DROP TABLE IF EXISTS team_members;
DROP TABLE IF EXISTS teams;
```

## Notes

- team_members is a junction table for many-to-many
- An employee can be in multiple teams
- leader_employee_id and team_members.employee_id FKs added after employees table

## Acceptance Criteria

- [x] `make migrate-up` succeeds
- [x] `make migrate-down` succeeds
- [x] Composite PK on team_members works
