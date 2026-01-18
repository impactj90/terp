# TICKET-001: Create Tenants Migration

**Type**: Migration
**Effort**: XS
**Sprint**: 1 - Multi-Tenant Foundation
**Dependencies**: None

## Description

Create the tenants table migration to enable multi-tenancy support.

## Files to Create

- `db/migrations/000002_create_tenants.up.sql`
- `db/migrations/000002_create_tenants.down.sql`

## Implementation

### Up Migration

```sql
CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) NOT NULL UNIQUE,
    settings JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tenants_slug ON tenants(slug);
CREATE INDEX idx_tenants_is_active ON tenants(is_active);
```

### Down Migration

```sql
DROP TABLE IF EXISTS tenants;
```

## Acceptance Criteria

- [ ] `make migrate-up` succeeds
- [ ] `make migrate-down` succeeds
- [ ] Table has correct columns and constraints
- [ ] Indexes are created
