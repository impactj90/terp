# TICKET-012: Create Employment Types Migration

**Type**: Migration
**Effort**: XS
**Sprint**: 2 - Reference Tables
**Dependencies**: TICKET-001

## Description

Create the employment_types table for categorizing employee contracts.

## Files to Create

- `db/migrations/000005_create_employment_types.up.sql`
- `db/migrations/000005_create_employment_types.down.sql`

## Implementation

### Up Migration

```sql
CREATE TABLE employment_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    weekly_hours_default DECIMAL(5,2) DEFAULT 40.00,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, code)
);

CREATE INDEX idx_employment_types_tenant ON employment_types(tenant_id);
```

### Down Migration

```sql
DROP TABLE IF EXISTS employment_types;
```

## Acceptance Criteria

- [x] `make migrate-up` succeeds
- [x] `make migrate-down` succeeds
- [x] weekly_hours_default has correct precision
