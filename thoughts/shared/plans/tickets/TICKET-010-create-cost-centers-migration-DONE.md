# TICKET-010: Create Cost Centers Migration

**Type**: Migration
**Effort**: XS
**Sprint**: 2 - Reference Tables
**Dependencies**: TICKET-001

## Description

Create the cost_centers table for expense tracking categorization.

## Files to Create

- `db/migrations/000004_create_cost_centers.up.sql`
- `db/migrations/000004_create_cost_centers.down.sql`

## Implementation

### Up Migration

```sql
CREATE TABLE cost_centers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, code)
);

CREATE INDEX idx_cost_centers_tenant ON cost_centers(tenant_id);
CREATE INDEX idx_cost_centers_active ON cost_centers(tenant_id, is_active);
```

### Down Migration

```sql
DROP TABLE IF EXISTS cost_centers;
```

## Acceptance Criteria

- [x] `make migrate-up` succeeds
- [x] `make migrate-down` succeeds
- [x] Unique constraint on tenant_id + code
