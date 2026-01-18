# TICKET-018: Alter Users for Multi-Tenancy Migration

**Type**: Migration
**Effort**: S
**Sprint**: 3 - User Groups & Permissions
**Dependencies**: TICKET-016

## Description

Alter the existing users table to add multi-tenancy support and additional fields.

## Files to Create

- `db/migrations/000008_alter_users_multitenancy.up.sql`
- `db/migrations/000008_alter_users_multitenancy.down.sql`

## Implementation

### Up Migration

```sql
-- Add new columns
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id),
    ADD COLUMN IF NOT EXISTS user_group_id UUID REFERENCES user_groups(id),
    ADD COLUMN IF NOT EXISTS employee_id UUID, -- FK added later
    ADD COLUMN IF NOT EXISTS username VARCHAR(100),
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_users_user_group ON users(user_group_id);
CREATE INDEX IF NOT EXISTS idx_users_deleted_at ON users(deleted_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_tenant_username ON users(tenant_id, username) WHERE username IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_tenant_email ON users(tenant_id, email);
```

### Down Migration

```sql
DROP INDEX IF EXISTS idx_users_tenant_email;
DROP INDEX IF EXISTS idx_users_tenant_username;
DROP INDEX IF EXISTS idx_users_deleted_at;
DROP INDEX IF EXISTS idx_users_user_group;
DROP INDEX IF EXISTS idx_users_tenant;

ALTER TABLE users
    DROP COLUMN IF EXISTS deleted_at,
    DROP COLUMN IF EXISTS is_active,
    DROP COLUMN IF EXISTS username,
    DROP COLUMN IF EXISTS employee_id,
    DROP COLUMN IF EXISTS user_group_id,
    DROP COLUMN IF EXISTS tenant_id;
```

## Notes

- employee_id FK is added in a later migration after employees table exists
- Username is unique per tenant (allows same username in different tenants)
- Email is unique per tenant
- Soft delete via deleted_at

## Acceptance Criteria

- [x] `make migrate-up` succeeds on existing data
- [x] `make migrate-down` succeeds
- [x] Existing users are not affected (columns are nullable)
- [x] Unique constraints work correctly
