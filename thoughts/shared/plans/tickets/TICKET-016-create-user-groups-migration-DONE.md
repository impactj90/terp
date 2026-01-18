# TICKET-016: Create User Groups Migration

**Type**: Migration
**Effort**: XS
**Sprint**: 3 - User Groups & Permissions
**Dependencies**: TICKET-001

## Description

Create the user_groups table for role-based access control.

## Files to Create

- `db/migrations/000007_create_user_groups.up.sql`
- `db/migrations/000007_create_user_groups.down.sql`

## Implementation

### Up Migration

```sql
CREATE TABLE user_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    permissions JSONB DEFAULT '[]',
    is_admin BOOLEAN DEFAULT false,
    is_system BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, name)
);

CREATE INDEX idx_user_groups_tenant ON user_groups(tenant_id);
```

### Down Migration

```sql
DROP TABLE IF EXISTS user_groups;
```

## Notes

Permissions JSONB structure:
```json
[
    "employees.read",
    "employees.write",
    "bookings.read",
    "bookings.write",
    "reports.read",
    "admin.users"
]
```

## Acceptance Criteria

- [x] `make migrate-up` succeeds
- [x] `make migrate-down` succeeds
- [x] JSONB permissions column created
